# LagLens

**Seeing what a robot actually executes when its policy thinks too slowly.**
A d3.js visual analytics tool for action-chunk execution under inference latency
(sync vs. asynchronous inference, open-loop execution horizon). Theme: **VIS + AI**.

## Run the interface (live demo)

The interface is a static web app in `src/` (d3.js v7.9.0 is bundled in `src/lib/`; no build step, works offline).
It must be served over HTTP because it loads JSON/CSV files:

```bash
python3 -m http.server 8000 --directory src     # then open http://localhost:8000
```

Useful URL parameters (reproduce a case-study view exactly):
`?ref=sync_d0_h8&cand=naive_d4_h8&seed=1001&t=120&win=100,160&metric=jump_mean&sel=1001,1002`
(`metric` is one of `success_rate`, `idle_frac_mean`, `think_motion_mean`, `jump_mean`; `noguide` hides the first-visit guide; `sel` pre-selects seeds).

Controls: the baseline / candidate pair and one question bar in A (Success · Idle = cost of sync · Outdated = robot motion while thinking (cost of async) · Discontinuity = cost of naive async) that drives both A and B; everything else is direct manipulation.

Views: **A** Latency Response (curves per horizon, 95 % intervals) · **B** Paired Seed Table (outcome matrix + baseline→candidate dumbbells, cross-filters A) · **C** Workspace Replay · **D** Execution Timeline (think / act tracks, motion track with discontinuity bars). Design rationale with references: `docs/design_rationale.md`.

## Folder layout

| Path | Content |
|---|---|
| `src/` | the interface (HTML/CSS/JS + `data/` it loads) |
| `src/data/episodes.csv` | PushT: one row per (schedule, seed) episode: 450 items × 22 attributes (14 schedules + re-run × 30 seeds) |
| `src/data/catch/` | Catch the ball: same layout (450 episodes), from `scripts/catch_task.py` + `scripts/generate_catch.py` |
| `src/data/schedules.json` | per-schedule aggregates |
| `src/data/runs/<schedule>.json` | per-step / per-chunk logs, lazy-loaded |
| `data/runs/` | raw rollout logs produced by the simulator |
| `scripts/` | data generation, preprocessing, verification, slide/report builds, headless tests |
| `docs/` | topic selection, AI disclosure, references, verification output, requirement check |
| `slides/`, `report/` | sources of `slides.pdf` and `report.pdf` |

## Regenerate the data

Needs Python 3.12, ~2–4 h on a 12-core CPU (no GPU needed).

```bash
python3 -m venv ~/infovis-venv
~/infovis-venv/bin/pip install -r scripts/requirements.txt
./scripts/run_grid.sh                     # full PushT grid: 46 schedules + 1 noise replicate × 50 paired seeds -> data/runs/*.json
python scripts/catch_task.py train        # Catch-the-ball policy (≈ 4 min CPU) -> models/catch_policy.pt
python scripts/generate_catch.py --configs sync_d0_h4 sync_d0_h8 sync_d2_h4 sync_d2_h8 sync_d4_h4 sync_d4_h8 naive_d2_h4 naive_d2_h8 naive_d4_h4 naive_d4_h8 inpaint_d2_h4 inpaint_d2_h8 inpaint_d4_h4 inpaint_d4_h8 sync_d0_h8_r1
# build_dataset.py then keeps d ∈ {0,2,4} × h ∈ {4,8} and seeds 1000–1029 for both tasks
python3 scripts/build_dataset.py          # -> src/data/
python3 scripts/verify_dataset.py         # requirement check, -> docs/dataset_verification.txt
```

What the generator does: the pretrained `lerobot/diffusion_pusht` Diffusion Policy (Chi et al., 2023) is run in the
PushT simulator (`gym-pusht`) from the same 30 initial states (seeds 1000–1029) under every shown schedule
`<strategy>_d<latency>_h<horizon>`:

* **sync**: request a chunk, hold position for *d* steps, then execute *h* actions from the chunk.
* **naive**: asynchronous; keep executing the old chunk while inference runs, switch after *d* steps and skip the *d* actions whose time has passed.
* **inpaint**: asynchronous like `naive`, but the new chunk is sampled by inpainting during the DDIM loop (RePaint-style): the actions already committed (the last executed one and the *d* actions run while inference is in flight) are clamped, and the rest of the old chunk's plan is blended in with weights decaying linearly to 0 over the overlap. This is a simplified, training-free form of Real-Time Chunking's soft masking (Black et al., 2025).

Latency is simulated in whole control steps (1 step = 100 ms at 10 Hz). The 100-step DDPM sampler of the
checkpoint is replaced by a 10-step DDIM sampler on the same noise schedule to make CPU generation feasible.

## Tests

```bash
LD_LIBRARY_PATH=~/chromelibs/root/usr/lib/x86_64-linux-gnu ~/infovis-venv/bin/python scripts/ui_test.py
```
starts a local server, loads the app in headless Chromium, exercises every interaction and fails on any console error.
