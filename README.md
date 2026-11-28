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
`?task=catch&ref=sync_d4_h4&cand=inpaint_d4_h4&seed=1010&t=20&win=10,40&show=jump_mean&d=4&sel=1001,1002`
(`show` is one of `success_rate`, `idle_frac_mean`, `think_motion_mean`, `jump_mean`; `d` is `2`, `4` or `all` (A's latency filter, default 4);
`noguide` hides the first-visit guide; `sel` pre-selects start states).

Controls: the header switches the task (PushT · Catch the ball) and asks one question for A, B and C (*show*: Success · Idle = what sync pays · Outdated plan = robot motion while a plan is computed (what async pays) · Jump = what naive async pays). The compared pair is chosen only in A (a cell, or a row of the ranking strip) and B; everything else is direct manipulation.

Views: **A** Pair Overview (baseline × candidate matrix of the paired difference, framed when unlikely to be chance after Benjamini–Hochberg correction, hatched when the pair is not compared; opens at latency d = 4; ranking strip of the schedules at that latency by the mean of their three runs) · **B** Latency Response (difference to the baseline against latency, one line per strategy and h, re-runs as hollow marks) · **C** Paired Seed Table (outcome per start state with the re-runs, and dumbbells of the chosen question; brushing selects start states for A and B) · **D** Workspace Replay · **E** Execution Timeline (think / act tracks, jump bars, outcome). Design rationale with references: `docs/design_rationale.md`.

## Folder layout

| Path | Content |
|---|---|
| `src/` | the interface (HTML/CSS/JS + `data/` it loads) |
| `src/data/episodes.csv` | PushT: one row per (schedule, run, seed) episode: 1,890 items × 23 attributes (21 schedules × 3 runs × 30 seeds) |
| `src/data/catch/` | Catch the ball: same layout (1,890 episodes), from `scripts/catch_task.py` + `scripts/generate_catch.py` |
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
python scripts/catch_task.py train        # Catch-the-ball policy (≈ 4 min CPU) -> models/catch_policy.pt
./scripts/run_shown_grid.sh               # the 21 shown schedules × 3 runs for both tasks -> data/runs/, data/runs_catch/
# (./scripts/run_grid.sh is the first, larger PushT grid: 46 schedules × 50 seeds, kept as raw logs)
# build_dataset.py keeps d ∈ {0,2,4} × h ∈ {4,8,11}, runs 0–2 and seeds 1000–1029 for both tasks
python3 scripts/build_dataset.py          # -> src/data/
python3 scripts/verify_dataset.py         # requirement check, -> docs/dataset_verification.txt
```

What the generator does: the pretrained `lerobot/diffusion_pusht` Diffusion Policy (Chi et al., 2023) is run in the
PushT simulator (`gym-pusht`) from the same 30 initial states (seeds 1000–1029) under every shown schedule
`<strategy>_d<latency>_h<horizon>` (and its re-runs `_r1`, `_r2` with other sampling noise). h = 11 is the longest
horizon that fits the 16-action chunk at every latency (1 + d + h ≤ 16):

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
