"""Check the course requirement (>= 100 items, >= 6 attributes) and print the attribute
ranges / levels used in the data abstraction. Output is saved to docs/dataset_verification.txt."""
import csv, glob, json, os, sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
D = os.path.join(ROOT, "src", "data")

rows = list(csv.DictReader(open(os.path.join(D, "episodes.csv"))))
cols = list(rows[0].keys())
out = []
p = out.append
p(f"episodes.csv: {len(rows)} items x {len(cols)} attributes, "
  f"{os.path.getsize(os.path.join(D, 'episodes.csv'))/1024:.0f} KB")
for c in cols:
    vals = [r[c] for r in rows if r[c] != ""]
    try:
        nums = [float(v) for v in vals]
        lv = sorted(set(nums))
        if len(lv) <= 8:
            p(f"  {c:18s} levels={[int(x) if x.is_integer() else x for x in lv]}  (missing {len(rows)-len(vals)})")
        else:
            p(f"  {c:18s} range=[{min(nums):g}, {max(nums):g}]  distinct={len(lv)}  (missing {len(rows)-len(vals)})")
    except ValueError:
        p(f"  {c:18s} levels={sorted(set(vals))}" if len(set(vals)) <= 8 else f"  {c:18s} distinct={len(set(vals))}")

n_steps = n_chunks = 0
size = 0
for f in glob.glob(os.path.join(D, "runs", "*.json")):
    size += os.path.getsize(f)
    R = json.load(open(f))
    for e in R["episodes"]:
        n_steps += e["n"]; n_chunks += len(e["chunks"])
p(f"step records: {n_steps}   chunk records: {n_chunks} (16 predicted 2-D actions each)   "
  f"detail files: {size/1e6:.1f} MB")
ok = len(rows) >= 100 and len(cols) >= 6
p(f"REQUIREMENT >=100 items and >=6 attributes: {'PASS' if ok else 'FAIL'}")
text = "\n".join(out)
print(text)
open(os.path.join(ROOT, "docs", "dataset_verification.txt"), "w").write(text + "\n")
sys.exit(0 if ok else 1)
