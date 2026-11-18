# patients/build.py — build demo-patient fixtures from ShanghaiT1DM/T2DM (ADR-0009).
#
# Usage (Python 3.12 with pandas, openpyxl, xlrd; see patients/requirements.txt):
#   python -I patients/build.py --dataset "<unzipped diabetes_datasets folder>"
# Download: https://doi.org/10.6084/m9.figshare.c.6310860 (CC BY 4.0, one zip).
#
# For each persona in patients/personas.json:
#   - take the subject's recording (CGM every 15 min + fingersticks), mg/dL;
#   - end the window at the recording's end, or a few hours after the scenario's last
#     key event (above 350 / severe low), and keep at most 14 days before that;
#   - re-anchor time: store minutes before load (the app adds "now" at load);
#   - summarize the insulin regimen from the subject's own dose records;
#   - write patients/fixtures/<id>.json with the dataset attribution CC BY requires.
# Fixtures hold readings and doses of real, de-identified people; names, clinic
# history, and profile flags are fictional. The regimen is read back only and is never
# sent to a model (ADR-0005).

import argparse
import json
import re
import warnings
from collections import defaultdict
from pathlib import Path
from statistics import median

import pandas as pd

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
MAX_DAYS = 14


def normalize(r: pd.DataFrame) -> pd.DataFrame:
    names = {}
    for c in r.columns:
        k = str(c).lower().replace(" ", "")
        if k.startswith("date"): names[c] = "date"
        elif k.startswith("cgm"): names[c] = "cgm"
        elif k.startswith("cbg"): names[c] = "cbg"
        elif "insulindose-s.c" in k: names[c] = "sc"
        elif k.startswith("csii-bolus"): names[c] = "csii_bolus"
        elif k.startswith("csii-basal"): names[c] = "csii_basal"
    r = r.rename(columns=names)
    for col in ("cgm", "cbg", "sc", "csii_bolus", "csii_basal"):
        if col not in r.columns:
            r[col] = pd.NA
    r["date"] = pd.to_datetime(r["date"], errors="coerce")
    for col in ("cgm", "cbg", "csii_bolus", "csii_basal"):
        r[col] = pd.to_numeric(r[col], errors="coerce")
    return r.dropna(subset=["date"]).sort_values("date")


def low_episode_starts(cgm: pd.DataFrame, below: float = 70) -> list[pd.Timestamp]:
    """Start times of runs below `below`; a run ends after 30+ minutes back above it."""
    starts, last = [], None
    for t, v in zip(cgm["date"], cgm["cgm"]):
        if v < below:
            if last is None or t - last > pd.Timedelta(minutes=30):
                starts.append(t)
            last = t
    return starts


def window_end(r: pd.DataFrame, anchor: dict) -> pd.Timestamp:
    if anchor["type"] == "recording_end":
        return r["date"].max()
    cgm = r.dropna(subset=["cgm"])
    if anchor["event"] == "low_cluster":
        # End a few hours after the densest 48-hour cluster of lows (<70), so the
        # "more than 2 lows in 48 hours" red flag is visible in the window. Anchoring on
        # the last severe low instead cut the cluster off (only 15 hours kept).
        # The cluster must also contain a severe reading (<54): the densest cluster
        # alone once had none, so the persona's "severe" claim had no data behind it.
        starts = low_episode_starts(cgm)
        best_count, best_end = 0, None
        for i, t0 in enumerate(starts):
            win = [t for t in starts[i:] if t - t0 <= pd.Timedelta(hours=48)]
            seg = cgm[(cgm["date"] >= t0) & (cgm["date"] <= win[-1] + pd.Timedelta(hours=2))]
            if (seg["cgm"] < 54).any() and len(win) > best_count:
                best_count, best_end = len(win), win[-1]
        if best_end is None or best_count < 3:
            raise SystemExit("no 48-hour cluster with 3+ lows including a severe low")
        return min(best_end + pd.Timedelta(hours=anchor["hours_after"]), r["date"].max())
    hit = cgm[cgm["cgm"] > 350] if anchor["event"] == "above_350" else cgm[cgm["cgm"] < 54]
    if hit.empty:
        raise SystemExit(f"anchor event {anchor['event']} not found")
    return min(hit["date"].max() + pd.Timedelta(hours=anchor["hours_after"]), r["date"].max())


DOSE = re.compile(r"([A-Za-z][A-Za-z0-9 /\-]*?),\s*(\d+(?:\.\d+)?)\s*IU", re.I)


def summarize_regimen(r: pd.DataFrame) -> dict:
    """Median dose and usual times per insulin, from the subject's own s.c./pump records."""
    doses: dict[str, list[tuple[float, int]]] = defaultdict(list)
    for _, row in r.dropna(subset=["sc"]).iterrows():
        for name, units in DOSE.findall(str(row["sc"])):
            doses[name.strip()].append((float(units), row["date"].hour))
    insulins = []
    for name, entries in sorted(doses.items(), key=lambda kv: -len(kv[1])):
        hours = sorted({h for _, h in entries})
        by_hour = defaultdict(int)
        for _, h in entries:
            by_hour[h] += 1
        usual = sorted(h for h, n in by_hour.items() if n >= max(2, len(entries) // 6)) or hours[:3]
        insulins.append({
            "name": name,
            "route": "injection",
            "usual_units": round(median(u for u, _ in entries), 1),
            "usual_times": [f"{h:02d}:00" for h in usual],
            "records": len(entries),
        })
    pump = None
    basal = r["csii_basal"].dropna()
    bolus = r["csii_bolus"].dropna()
    if len(basal) or len(bolus):
        pump = {
            "basal_units_per_hour": round(float(basal.median()), 2) if len(basal) else None,
            "usual_bolus_units": round(float(bolus.median()), 1) if len(bolus) else None,
            "records": int(len(basal) + len(bolus)),
            "note": "insulin pump (CSII) records from the dataset",
        }
    return {"insulins": insulins, "pump": pump,
            "note": "Summarized from the dataset subject's dose records. Read back only; never sent to the model. Not clinical guidance."}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, type=Path)
    args = ap.parse_args()
    spec = json.loads((HERE / "personas.json").read_text())
    summaries = {
        k: pd.read_excel(args.dataset / f"Shanghai_{k}_Summary.xlsx").set_index("Patient Number")
        for k in ("T1DM", "T2DM")
    }
    out_dir = HERE / "fixtures"
    out_dir.mkdir(exist_ok=True)

    for p in spec["personas"]:
        rec = p["recording"]
        kind = "T1DM" if rec.startswith("1") else "T2DM"
        path = next((args.dataset / f"Shanghai_{kind}").glob(f"{rec}.xls*"))
        r = normalize(pd.read_excel(path))
        end = window_end(r, p["anchor"])
        r = r[(r["date"] <= end) & (r["date"] >= end - pd.Timedelta(days=MAX_DAYS))]
        s = summaries[kind].loc[rec]

        readings = []
        for col, source in (("cgm", "cgm"), ("cbg", "fingerstick")):
            for _, row in r.dropna(subset=[col]).iterrows():
                readings.append({
                    "minutes_before_load": int((end - row["date"]) / pd.Timedelta(minutes=1)),
                    "value_mgdl": round(float(row[col]), 1),
                    "source": source,
                })
        readings.sort(key=lambda x: -x["minutes_before_load"])

        fixture = {
            "id": p["id"],
            "display_name": p["display_name"],
            "age": int(s["Age (years)"]),
            "sex": {1: "F", 2: "M"}.get(int(s["Gender (Female=1, Male=2)"])),
            "diabetes_type": "type1" if kind == "T1DM" else "type2",
            "uses_cgm": True,
            "path": p["path"],
            "story": p["story"],
            # ADR-0019: a provider's dated special plan (invented for testing) rides
            # alongside the long-term regimen summarized from the dataset.
            "regimen": {**summarize_regimen(r),
                        **({"special_plan": {k: v for k, v in p["special_plan"].items() if k != "$comment"}}
                           if "special_plan" in p else {})},
            "flags": p["flags"],
            "clinic_history": p["clinic_history"],
            "data_source": {**spec["dataset"], "recording": rec},
            "readings": readings,
        }
        (out_dir / f"{p['id']}.json").write_text(json.dumps(fixture, indent=1) + "\n")
        cgm = [x["value_mgdl"] for x in readings if x["source"] == "cgm"]
        print(f"{p['id']:14} {rec}  age {fixture['age']}  {len(cgm)} cgm + {len(readings) - len(cgm)} fingersticks  "
              f"range {min(cgm)}–{max(cgm)}  insulins {[i['name'] for i in fixture['regimen']['insulins']]}"
              f"{'  + pump' if fixture['regimen']['pump'] else ''}")


if __name__ == "__main__":
    main()
