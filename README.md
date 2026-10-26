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
`?ref=sync_d0_h8&cand=naive_d4_h8&seed=1001&t=120&win=100,160&metric=success_rate&mode=delta`
(`noguide` hides the first-visit guide).

## Folder layout

| Path | Content |
|---|---|
| `src/` | the interface (HTML/CSS/JS + `data/` it loads) |
| `src/data/episodes.csv` | one row per (schedule, seed) episode: 2,350 items × 19 attributes |
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
./scripts/run_grid.sh                     # 46 schedules + 1 noise replicate × 50 paired seeds -> data/runs/*.json
python3 scripts/build_dataset.py          # -> src/data/
python3 scripts/verify_dataset.py         # requirement check, -> docs/dataset_verification.txt
```

What the generator does: the pretrained `lerobot/diffusion_pusht` Diffusion Policy (Chi et al., 2023) is run in the
PushT simulator (`gym-pusht`) from the same 50 initial states (seeds 1000–1049) under every schedule
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
