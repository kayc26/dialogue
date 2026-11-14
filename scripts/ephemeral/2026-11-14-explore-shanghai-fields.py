# 2026-11-14-explore-shanghai-fields.py
# Context: before matching demo personas (ADR-0009) to ShanghaiT1DM/T2DM subjects,
# see what the free-text fields hold: hypoglycemic agents, acute complications (is
# DKA history recorded?), other agents (steroids?), and the s.c. insulin column format.
#
# Usage: <venv>/bin/python -I scripts/ephemeral/2026-11-14-explore-shanghai-fields.py <unzipped dir>

import sys
from collections import Counter
from pathlib import Path

import pandas as pd

root = Path(sys.argv[1])
for kind in ("T1DM", "T2DM"):
    s = pd.read_excel(root / f"Shanghai_{kind}_Summary.xlsx")
    print(f"\n===== {kind}: {len(s)} recordings, ages {s['Age (years)'].min()}–{s['Age (years)'].max()}, "
          f">=65: {(s['Age (years)'] >= 65).sum()}, >=75: {(s['Age (years)'] >= 75).sum()}")
    for col in ("Hypoglycemic Agents", "Acute Diabetic Complications", "Other Agents", "Hypoglycemia (yes/no)"):
        vals = Counter(str(v).strip() for v in s[col])
        print(f"-- {col}: {len(vals)} distinct; top:")
        for v, n in vals.most_common(8):
            print(f"   {n:3d}  {v[:110]}")

sc = Counter()
for f in sorted((root / "Shanghai_T2DM").glob("*.xls*"))[:40]:
    r = pd.read_excel(f)
    for v in r["Insulin dose - s.c."].dropna():
        sc[str(v).strip()[:60]] += 1
print("\n-- 'Insulin dose - s.c.' values (first 40 T2 recordings), top:")
for v, n in sc.most_common(15):
    print(f"   {n:4d}  {v}")

# Used 2026-11-14: T1DM ages 37-73 (4 with DKA history); T2DM ages 22-97 (46 >=65, 13 >=75);
# no steroids in any medication list. Outcome: P2 steroid start stays fictional.
