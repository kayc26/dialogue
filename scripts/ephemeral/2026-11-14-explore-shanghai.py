# 2026-11-14-explore-shanghai.py
# Context: ADR-0009 sources demo-patient glucose from public datasets. ShanghaiT1DM /
# ShanghaiT2DM (Zhao et al., Scientific Data 2023; figshare doi 10.6084/m9.figshare.
# c.6310860; CC BY 4.0, confirmed via the figshare API) ships as .xls/.xlsx per
# recording period plus a summary sheet per diabetes type. This prints the summary
# columns, age/insulin distributions, and one recording's columns, to design the
# window search.
#
# Usage (dataset path passed in; run with -I so nothing is imported from the data dir):
#   <venv>/bin/python -I scripts/ephemeral/2026-11-14-explore-shanghai.py <unzipped dir>

import sys
from pathlib import Path

import pandas as pd

root = Path(sys.argv[1])
pd.set_option("display.width", 200, "display.max_columns", 40, "display.max_colwidth", 40)

for kind in ("T1DM", "T2DM"):
    s = pd.read_excel(root / f"Shanghai_{kind}_Summary.xlsx")
    print(f"\n===== {kind} summary: {len(s)} rows")
    print("columns:", list(s.columns))
    print(s.head(3).T.to_string()[:1500])

one = sorted((root / "Shanghai_T2DM").glob("2*.xls*"))[0]
r = pd.read_excel(one)
print(f"\n===== recording {one.name}: {len(r)} rows")
print("columns:", list(r.columns))
print(r.head(8).to_string()[:2000])

# Used 2026-11-14: confirmed the summary sheet columns (age, agents, acute complications incl.
# diabetic ketoacidosis) and per-recording columns (CGM mg/dL every 15 min, CBG, ketone,
# s.c. insulin text, CSII pump). Outcome: format understood; column headers vary per file.
