#!/usr/bin/env bash
# Regenerates every run shown in the interface: 21 schedules (d in {0,2,4} x h in {4,8,11}; async at d = 0
# equals sync) x 3 runs (run 0 and re-runs _r1, _r2 with generator seed 12345 + r) for both tasks.
# PushT runs use --seeds 50 (the batch size changes the random draws); the dataset keeps seeds 1000-1029.
# Most PushT run-0 files also come out of run_grid.sh (the first, larger grid); this script lists the
# shown set explicitly. Afterwards: python scripts/build_dataset.py && python scripts/verify_dataset.py
cd "$(dirname "$0")/.."
PY=${PY:-~/infovis-venv/bin/python}
S=""
for h in 4 8 11; do
  S="$S sync_d0_h$h"
  for d in 2 4; do S="$S sync_d${d}_h$h naive_d${d}_h$h inpaint_d${d}_h$h"; done
done
ALL=""
for s in $S; do ALL="$ALL $s ${s}_r1 ${s}_r2"; done
set -- $ALL
HALF=$(( $# / 2 ))
A="${*:1:$HALF}"; B="${*:$((HALF + 1))}"
# PushT: two CPU workers (about 2 min per schedule each)
$PY scripts/generate_rollouts.py --threads 5 --seeds 50 --out data/runs --configs $A > data/shown_pusht_A.log 2>&1 &
$PY scripts/generate_rollouts.py --threads 5 --seeds 50 --out data/runs --configs $B > data/shown_pusht_B.log 2>&1 &
# Catch the ball: needs models/catch_policy.pt (python scripts/catch_task.py train); seconds per schedule
$PY scripts/generate_catch.py --configs $ALL > data/shown_catch.log 2>&1
wait
