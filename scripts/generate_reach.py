"""Paired-seed Reach-in-time rollouts under the same execution schedules as the PushT data.

The scheduling (when inference is requested, when a chunk arrives, which chunk indices are executed,
the inpainting mask) is the same as run_config() in generate_rollouts.py; only the environment and
the policy differ (see reach_task.py).

Usage:
  python scripts/generate_reach.py --seeds 30 --out data/runs_reach --configs sync_d0_h8 inpaint_d4_h4 ...
"""
import argparse, json, os, sys, time

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reach_task import ReachEnv, ReachPolicy, T_MAX, TARGET_R, J0  # noqa: E402

SEED_BASE = 1000


def parse_cfg(cid):
    parts = cid.split("_")
    s, d, h = parts[:3]
    rep = int(parts[3][1:]) if len(parts) > 3 else 0
    return s, int(d[1:]), int(h[1:]), rep


def run_config(pol, cid, n_seeds):
    strat, d, h, rep = parse_cfg(cid)
    H = pol.H
    assert J0 + (0 if strat == "sync" else d) + h <= H
    assert strat == "sync" or d <= h
    gen = torch.Generator().manual_seed(12345 + rep)
    envs = [ReachEnv(SEED_BASE + i) for i in range(n_seeds)]
    obs = [e.obs() for e in envs]
    prev_obs = list(obs)
    done = [False] * n_seeds
    success = [False] * n_seeds
    plan = [dict() for _ in range(n_seeds)]
    last_action = [e.p.copy() for e in envs]
    steps = [[] for _ in range(n_seeds)]
    chunks = [[] for _ in range(n_seeds)]
    pending = None
    period = h + d if strat == "sync" else h
    next_req = 0

    def deliver(t, pending):
        if pending is None or pending[1] != t:
            return pending
        t_obs, t_av, acts = pending
        for i, a in acts.items():
            if done[i]:
                continue
            cid_i = len(chunks[i])
            start_j = J0 if strat == "sync" else J0 + (t_av - t_obs)
            for k, tau in enumerate(range(t_av, t_av + h)):
                plan[i][tau] = (a[start_j + k].astype(float), cid_i, start_j + k)
            chunks[i].append({"id": cid_i, "t_obs": t_obs, "t_avail": t_av,
                              "exec": [t_av, t_av + h - 1], "a": np.round(a, 1).tolist()})
        return None

    for t in range(T_MAX):
        pending = deliver(t, pending)
        if t == next_req:
            alive = [i for i in range(n_seeds) if not done[i]]
            if alive:
                o2 = np.stack([np.stack([prev_obs[i], obs[i]]) for i in alive])
                known = mask = None
                if strat == "inpaint":  # same hard prefix + RTC-style soft overlap as for PushT
                    mask = np.zeros(H, np.float32)
                    known = np.zeros((len(alive), H, 2), np.float32)
                    for bi, i in enumerate(alive):
                        old = chunks[i][-1] if chunks[i] else None
                        for j in range(H):
                            tau = t + j - J0
                            if j < J0 + d:
                                mask[j] = 1.0
                                if tau in plan[i]:
                                    known[bi, j] = plan[i][tau][0]
                                elif 0 <= tau < t and steps[i]:
                                    known[bi, j] = steps[i][tau]["a"]
                                else:
                                    known[bi, j] = last_action[i]
                            elif old is not None and J0 + tau - old["t_obs"] < H:
                                known[bi, j] = old["a"][J0 + tau - old["t_obs"]]
                    if chunks[alive[0]]:
                        old = chunks[alive[0]][-1]
                        overlap = [j for j in range(J0 + d, H) if J0 + (t + j - J0) - old["t_obs"] < H]
                        for k, j in enumerate(overlap):
                            mask[j] = 1.0 - (k + 1) / (len(overlap) + 1)
                acts = pol.sample(o2, gen, known, mask)
                pending = (t, t + d, {i: acts[bi] for bi, i in enumerate(alive)})
            next_req = t + period
        pending = deliver(t, pending)
        for i, e in enumerate(envs):
            if done[i]:
                continue
            if t in plan[i]:
                a, c_id, j = plan[i].pop(t)
                held = False
                age = t - chunks[i][c_id]["t_obs"]
            else:
                a, c_id, j, held, age = last_action[i], -1, -1, True, None
            steps[i].append({"t": t, "ax": round(float(e.p[0]), 2), "ay": round(float(e.p[1]), 2),
                             "a": [round(float(a[0]), 2), round(float(a[1]), 2)],
                             "chunk": c_id, "j": j, "held": held, "age": age,
                             "dist": round(e.dist(), 2)})
            prev_obs[i] = obs[i]
            hit = e.step(a)
            obs[i] = e.obs()
            last_action[i] = np.asarray(a, dtype=float)
            if hit or t == T_MAX - 1:
                done[i] = True
                success[i] = bool(hit)
                steps[i][-1]["dist_after"] = round(e.dist(), 2)
                steps[i][-1]["success_after"] = bool(hit)
        if all(done):
            break

    episodes = []
    for i, e in enumerate(envs):
        episodes.append({"seed": SEED_BASE + i, "success": success[i], "n_steps": len(steps[i]),
                         "goal": [round(float(x), 2) for x in e.goal],
                         "start_dist": steps[i][0]["dist"], "steps": steps[i], "chunks": chunks[i]})
    return {"config": cid, "task": "reach", "strategy": strat, "latency": d, "horizon": h, "replicate": rep,
            "deadline": T_MAX, "target_r": TARGET_R, "chunk_len": H, "obs_steps": 2, "fps": 10,
            "episodes": episodes}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", nargs="+", required=True)
    ap.add_argument("--seeds", type=int, default=30)
    ap.add_argument("--out", default="data/runs_reach")
    a = ap.parse_args()
    torch.set_num_threads(4)
    os.makedirs(a.out, exist_ok=True)
    pol = ReachPolicy()
    for cid in a.configs:
        t0 = time.time()
        res = run_config(pol, cid, a.seeds)
        with open(os.path.join(a.out, f"{cid}.json"), "w") as f:
            json.dump(res, f, separators=(",", ":"))
        sr = np.mean([e["success"] for e in res["episodes"]])
        print(f"done {cid} success={sr:.2f} sec={time.time() - t0:.0f}", flush=True)


if __name__ == "__main__":
    main()
