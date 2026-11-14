# 2026-11-14-shanghai-metrics.py
# Context: ADR-0009 (QST-SYNTH-SCENARIOS: B, real windows only). Compute per-recording
# glucose metrics for ShanghaiT1DM/T2DM so each of the six demo personas can be
# matched to a real recording whose readings fit its story. Prints the candidates per
# persona; selection is recorded separately.
#
# Usage: <venv>/bin/python -I scripts/ephemeral/2026-11-14-shanghai-metrics.py <unzipped dir> <out.csv>

import sys
import warnings
from pathlib import Path

import pandas as pd

warnings.filterwarnings("ignore")
root, out_csv = Path(sys.argv[1]), Path(sys.argv[2])

CGM = "cgm"  # normalized name; source headers vary across files ("CGM (mg / dl)", ...)


def normalize(r: pd.DataFrame) -> pd.DataFrame:
    """Map varying source headers onto fixed names: date, cgm, cbg, ketone, sc, csii_*."""
    names = {}
    for c in r.columns:
        k = str(c).lower().replace(" ", "")
        if k.startswith("date"):
            names[c] = "Date"
        elif k.startswith("cgm"):
            names[c] = "cgm"
        elif k.startswith("cbg"):
            names[c] = "cbg"
        elif "ketone" in k:
            names[c] = "Blood Ketone (mmol / L)"
        elif "insulindose-s.c" in k:
            names[c] = "Insulin dose - s.c."
        elif k.startswith("csii-bolus"):
            names[c] = "CSII bolus"
        elif k.startswith("csii-basal"):
            names[c] = "CSII basal"
    r = r.rename(columns=names)
    for needed in ("Blood Ketone (mmol / L)", "Insulin dose - s.c."):
        if needed not in r.columns:
            r[needed] = pd.NA
    return r


def episodes(times: pd.Series, values: pd.Series, below: float) -> list[pd.Timestamp]:
    """Start times of runs below `below`; a run ends after 30+ min back above it."""
    starts, last_low = [], None
    for t, v in zip(times, values):
        if pd.isna(v):
            continue
        if v < below:
            if last_low is None or (t - last_low) > pd.Timedelta(minutes=30):
                starts.append(t)
            last_low = t
    return starts


def max_in_48h(starts: list[pd.Timestamp]) -> int:
    best = 0
    for i, s in enumerate(starts):
        best = max(best, sum(1 for t in starts[i:] if t - s <= pd.Timedelta(hours=48)))
    return best


rows = []
for kind in ("T1DM", "T2DM"):
    summary = pd.read_excel(root / f"Shanghai_{kind}_Summary.xlsx").set_index("Patient Number")
    for f in sorted((root / f"Shanghai_{kind}").glob("*.xls*")):
        rid = f.stem
        r = normalize(pd.read_excel(f))
        if "cgm" not in r.columns:
            print(f"skip {rid}: no CGM column ({list(r.columns)[:4]})")
            continue
        r["Date"] = pd.to_datetime(r["Date"], errors="coerce")
        r["cgm"] = pd.to_numeric(r["cgm"], errors="coerce")
        g = r[["Date", CGM]].dropna()
        if g.empty:
            continue
        s = summary.loc[rid] if rid in summary.index else None
        lows = episodes(g["Date"], g[CGM], 70)
        severe = episodes(g["Date"], g[CGM], 54)
        high = g[CGM] > 350
        sc = r["Insulin dose - s.c."].dropna().astype(str)
        csii = r[[c for c in r.columns if c.startswith("CSII")]].notna().any().any()
        rows.append({
            "recording": rid, "kind": kind,
            "age": None if s is None else s["Age (years)"],
            "sex": None if s is None else {1: "F", 2: "M"}.get(s["Gender (Female=1, Male=2)"]),
            "dka_history": None if s is None else "ketoacidosis" in str(s["Acute Diabetic Complications"]),
            "agents": None if s is None else str(s["Hypoglycemic Agents"]),
            "other_agents": None if s is None else str(s["Other Agents"]),
            "days": round((g["Date"].max() - g["Date"].min()) / pd.Timedelta(days=1), 1),
            "n_cgm": len(g), "min": g[CGM].min(), "max": g[CGM].max(),
            "tir_pct": round(100 * g[CGM].between(70, 180).mean(), 1),
            "readings_over_350": int(high.sum()),
            "low_episodes": len(lows), "severe_low_episodes": len(severe),
            "max_lows_48h": max_in_48h(lows),
            "ketone_max": r["Blood Ketone (mmol / L)"].max(),
            "uses_pump": bool(csii), "sc_insulin_entries": len(sc),
            "sc_insulin_example": sc.iloc[0][:60] if len(sc) else "",
        })

m = pd.DataFrame(rows)
m.to_csv(out_csv, index=False)
pd.set_option("display.width", 250, "display.max_columns", 30, "display.max_colwidth", 45)
cols = ["recording", "age", "sex", "days", "min", "max", "tir_pct", "readings_over_350", "low_episodes",
        "severe_low_episodes", "max_lows_48h", "uses_pump", "dka_history", "sc_insulin_example"]
insulin = m["agents"].str.contains("insulin|Novolin|Humulin|Lantus|glargine|detemir|degludec|aspart|lispro", case=False, na=False)
t2, t1 = m["kind"] == "T2DM", m["kind"] == "T1DM"

print(f"{len(m)} recordings with CGM\n")
print("P1 quick advice: T2, >=65, insulin, no lows, max <250, TIR >=80")
print(m[t2 & (m.age >= 65) & insulin & (m.low_episodes == 0) & (m["max"] < 250) & (m.tir_pct >= 80)][cols].to_string(), "\n")
print("P2 red flag >350: T2, >=60, insulin, readings over 350")
print(m[t2 & (m.age >= 60) & insulin & (m.readings_over_350 >= 2)][cols].sort_values("readings_over_350", ascending=False).to_string(), "\n")
print("   steroid mentions in other agents:", m[m.other_agents.str.contains("pred|dexameth|cortison|hydrocort", case=False, na=False)]["recording"].tolist(), "\n")
print("P3 pump + DKA history: T1")
print(m[t1][cols].sort_values(["uses_pump", "dka_history"], ascending=False).to_string(), "\n")
print("P4 repeated + severe lows: T2, >=65, >=3 lows in 48h, a severe low")
print(m[t2 & (m.age >= 65) & (m.max_lows_48h >= 3)][cols].sort_values(["severe_low_episodes", "age"], ascending=False).to_string(), "\n")
print("P6 history-only high touch: T2, >=70, steady (no lows, max <300)")
print(m[t2 & (m.age >= 70) & (m.low_episodes == 0) & (m["max"] < 300)][cols].to_string())

# Used 2026-11-14: per-recording metrics -> persona candidates. Outcome: matches for all six
# personas (see patients/personas.json); P5 changed to type 2 (no young T1 woman); many
# minima at 39.6 suggest a sensor floor and hospital recordings. Caveat found later: a
# recording-level max_lows_48h and severe count need not overlap (Dorothy), so the build
# now requires the severe low inside the 48-hour cluster.
