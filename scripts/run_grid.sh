#!/usr/bin/env bash
# Regenerates the full LagLens grid (46 schedules + 1 noise replicate x 50 paired seeds) with two CPU workers.
# Async schedules with d > h are excluded: they would need a second inference to start before the
# previous one returns (RTC likewise requires execution horizon >= d).
cd "$(dirname "$0")/.."
PY=${PY:-~/infovis-venv/bin/python}
$PY scripts/generate_rollouts.py --threads 6 --seeds 50 --out data/runs --configs sync_d0_h8 sync_d0_h8_r1 naive_d1_h8 sync_d2_h8 inpaint_d2_h8 naive_d4_h8 sync_d6_h8 inpaint_d6_h8 sync_d1_h4 inpaint_d1_h4 naive_d2_h4 sync_d4_h4 inpaint_d4_h4 sync_d0_h6 naive_d1_h6 sync_d2_h6 inpaint_d2_h6 naive_d4_h6 sync_d6_h6 inpaint_d6_h6 sync_d1_h2 inpaint_d1_h2 naive_d2_h2 sync_d4_h2 > data/grid_worker_A.log 2>&1 &
$PY scripts/generate_rollouts.py --threads 6 --seeds 50 --out data/runs --configs sync_d1_h8 inpaint_d1_h8 naive_d2_h8 sync_d4_h8 inpaint_d4_h8 naive_d6_h8 sync_d0_h4 naive_d1_h4 sync_d2_h4 inpaint_d2_h4 naive_d4_h4 sync_d6_h4 sync_d1_h6 inpaint_d1_h6 naive_d2_h6 sync_d4_h6 inpaint_d4_h6 naive_d6_h6 sync_d0_h2 naive_d1_h2 sync_d2_h2 inpaint_d2_h2 sync_d6_h2 > data/grid_worker_B.log 2>&1 &
wait
