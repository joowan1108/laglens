"""Quick numeric summaries used to decide where to look in the interface for the case study.
(Findings in the report are confirmed and illustrated with screenshots of LagLens itself.)"""
import csv, json, statistics as st
from collections import defaultdict
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "src" / "data"
rows = list(csv.DictReader(open(D / "episodes.csv")))
for r in rows:
    for k in r:
        if k not in ("schedule", "strategy") and r[k] != "":
            r[k] = float(r[k])
sch = {s["schedule"]: s for s in json.load(open(D / "schedules.json"))}

print("== success rate grid (rows h, cols d) ==")
for strat in ["sync", "naive", "inpaint"]:
    print(strat)
    for h in [8, 6, 4, 2]:
        line = []
        for d in [0, 1, 2, 4, 6]:
            s = sch.get(f"{strat}_d{d}_h{h}")
            line.append(f"{s['success_rate']*100:5.0f}" if s else "    -")
        print(f"  h{h}: " + " ".join(line))

print("\n== mean seam gap / idle / staleness per schedule ==")
for k, s in sorted(sch.items()):
    print(f"{k:16s} sr={s['success_rate']:.2f} seam={s['seam_gap_mean']:5.1f} stale={s['staleness_mean']:.2f} idle={s['idle_frac_mean']:.2f} jerk={s['jerk_mean']:.1f}")

by = defaultdict(dict)
for r in rows:
    by[r["schedule"]][int(r["seed"])] = r

def flips(a, b):
    A, B = by[a], by[b]
    loss = [s for s in A if A[s]["success"] == 1 and B[s]["success"] == 0]
    gain = [s for s in A if A[s]["success"] == 0 and B[s]["success"] == 1]
    return loss, gain

print("\n== flips vs sync_d0_h8 ==")
for k in sorted(sch):
    if k == "sync_d0_h8":
        continue
    l, g = flips("sync_d0_h8", k)
    print(f"{k:16s} loss={len(l):2d} gain={len(g):2d} net={len(g)-len(l):+d}")

print("\n== seam gap vs outcome (all episodes) ==")
for strat in ["sync", "naive", "inpaint"]:
    ok = [r["seam_gap_max"] for r in rows if r["strategy"] == strat and r["success"] == 1]
    bad = [r["seam_gap_max"] for r in rows if r["strategy"] == strat and r["success"] == 0]
    print(f"{strat:8s} max seam gap: success median={st.median(ok):.1f} (n={len(ok)})  failure median={st.median(bad):.1f} (n={len(bad)})")

# seeds that never/always succeed
rob = {s: st.mean(by[k][s]["success"] for k in by) for s in by["sync_d0_h8"]}
print("\nmost fragile seeds:", sorted(rob, key=rob.get)[:8], [round(rob[s], 2) for s in sorted(rob, key=rob.get)[:8]])
print("most robust seeds:", sorted(rob, key=rob.get)[-8:])
