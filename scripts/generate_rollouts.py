"""Generate paired-seed PushT rollouts of a pretrained Diffusion Policy under different
action-chunk execution schedules (sync / naive async / inpainting async), latencies and
execution horizons, logging every predicted chunk and every executed action.

Usage:
  python scripts/generate_rollouts.py --configs sync_d0_h8 naive_d2_h8 --seeds 32 --out data/runs

Config id format: <strategy>_d<latency steps>_h<execution horizon>[_r<noise replicate>]
  strategy: sync | naive | inpaint
All envs of one config run in lockstep so that policy inference can be batched.
"""
import argparse, glob, json, math, os, time, warnings, logging

import numpy as np
import torch
import gymnasium as gym
import gym_pusht  # noqa: F401  (registers the env)
from safetensors.torch import load_file
from diffusers.schedulers.scheduling_ddim import DDIMScheduler

warnings.filterwarnings("ignore")
logging.disable(logging.WARNING)

from lerobot.policies.diffusion.modeling_diffusion import DiffusionPolicy  # noqa: E402

REPO = "lerobot/diffusion_pusht"
T_MAX = 300          # PushT episode length used by LeRobot eval (10 Hz -> 30 s)
SEED_BASE = 1000     # env seeds are SEED_BASE + i, identical across configs (paired design)
DDIM_STEPS = 10


def parse_cfg(cid):
    """<strategy>_d<latency>_h<horizon>[_r<replicate>]; the replicate only changes the sampling noise."""
    parts = cid.split("_")
    s, d, h = parts[:3]
    rep = int(parts[3][1:]) if len(parts) > 3 else 0
    return s, int(d[1:]), int(h[1:]), rep


class Policy:
    def __init__(self):
        self.p = DiffusionPolicy.from_pretrained(REPO).eval()
        c = self.p.config
        self.H, self.n_obs = c.horizon, c.n_obs_steps  # 16, 2
        S = load_file(glob.glob(os.path.expanduser(
            "~/.cache/huggingface/hub/models--lerobot--diffusion_pusht/snapshots/*/model.safetensors"))[0])
        self.im_m = S["normalize_inputs.buffer_observation_image.mean"]
        self.im_s = S["normalize_inputs.buffer_observation_image.std"]
        self.smin = S["normalize_inputs.buffer_observation_state.min"]
        self.smax = S["normalize_inputs.buffer_observation_state.max"]
        self.amin = S["unnormalize_outputs.buffer_action.min"]
        self.amax = S["unnormalize_outputs.buffer_action.max"]
        # Swap the 100-step DDPM sampler for a 10-step DDIM sampler on the same noise schedule
        # (CPU budget; documented in docs/data_abstraction.md).
        self.sched = DDIMScheduler(num_train_timesteps=c.num_train_timesteps, beta_start=c.beta_start,
                                   beta_end=c.beta_end, beta_schedule=c.beta_schedule,
                                   clip_sample=c.clip_sample, clip_sample_range=c.clip_sample_range,
                                   prediction_type=c.prediction_type)
        self.sched.set_timesteps(DDIM_STEPS)

    def norm_a(self, a):
        return (a - self.amin) / (self.amax - self.amin) * 2 - 1

    def unnorm_a(self, a):
        return (a + 1) / 2 * (self.amax - self.amin) + self.amin

    @torch.inference_mode()
    def sample(self, imgs, states, gen, known=None, known_mask=None):
        """imgs: (B,2,96,96,3) uint8, states: (B,2,2). known: (B,H,2) absolute actions to inpaint
        with per-index weights known_mask (H,) in [0, 1]. Returns (B,H,2) absolute actions."""
        B = imgs.shape[0]
        im = torch.from_numpy(imgs).float().permute(0, 1, 4, 2, 3) / 255
        im = (im - self.im_m) / self.im_s
        st = (torch.from_numpy(states).float() - self.smin) / (self.smax - self.smin) * 2 - 1
        batch = {"observation.state": st, "observation.images": im[:, :, None]}
        gc = self.p.diffusion._prepare_global_conditioning(batch)
        x = torch.randn((B, self.H, 2), generator=gen)
        if known is not None:
            kn = self.norm_a(torch.from_numpy(known).float())
            w = torch.from_numpy(known_mask).float()[None, :, None]  # 1 = hard, (0,1) = soft, 0 = free
        for t in self.sched.timesteps:
            if known is not None:  # RePaint-style inpainting: blend in the noised known actions
                noisy = self.sched.add_noise(kn, torch.randn(kn.shape, generator=gen), t[None])
                x = w * noisy + (1 - w) * x
            eps = self.p.diffusion.unet(x, torch.full((B,), int(t), dtype=torch.long), global_cond=gc)
            x = self.sched.step(eps, t, x).prev_sample
        if known is not None:
            x = torch.where(w >= 1, kn, x)
        return self.unnorm_a(x).numpy()


def add_belt(env, belt):
    """Moving-belt variant: the table under the block moves at `belt` = (vx, vy) px/s, so the block
    drifts whenever nothing holds it. PushT uses space damping 0 (a body keeps no velocity between
    physics steps), so the belt is applied as the force that gives the block exactly this velocity in
    every physics step; contacts with the pusher and the walls are then resolved by pymunk as usual."""
    u = env.unwrapped
    space, block = u.space, u.block
    step0 = space.step

    def step(dt):
        block.force = (block.mass * belt[0] / dt, block.mass * belt[1] / dt)
        step0(dt)
    space.step = step


def run_config(pol, cid, n_seeds, belt=None):
    strat, d, h, rep = parse_cfg(cid)
    H, n_obs = pol.H, pol.n_obs
    j0 = n_obs - 1  # chunk index aligned with the observation time
    assert j0 + (0 if strat == "sync" else d) + h <= H, f"{cid}: latency+horizon exceed chunk length"
    assert strat == "sync" or d <= h, f"{cid}: async needs d <= h (one inference in flight at a time)"
    gen = torch.Generator().manual_seed(12345 + rep)
    envs = [gym.make("gym_pusht/PushT-v0", obs_type="pixels_agent_pos", max_episode_steps=T_MAX)
            for _ in range(n_seeds)]
    obs = [e.reset(seed=SEED_BASE + i)[0] for i, e in enumerate(envs)]
    if belt:  # reset() rebuilds the pymunk space, so the belt is attached after it
        for e in envs:
            add_belt(e, belt)
    infos = [e.unwrapped._get_info() for e in envs]
    prev_obs = list(obs)
    done = [False] * n_seeds
    # plan[i][tau] = (action xy, chunk id, chunk index)
    plan = [dict() for _ in range(n_seeds)]
    last_action = [o["agent_pos"].astype(float).copy() for o in obs]
    steps = [[] for _ in range(n_seeds)]
    chunks = [[] for _ in range(n_seeds)]
    pending = None  # (t_obs, t_avail, actions(B,H,2), ids)
    period = h + d if strat == "sync" else h
    next_req = 0

    def deliver(t, pending):
        """A chunk whose inference finishes at t becomes executable: overwrite the plan for its
        execution window. Returns the pending request that is still in flight (or None)."""
        if pending is None or pending[1] != t:
            return pending
        t_obs, t_av, acts = pending
        for i, a in acts.items():
            if done[i]:
                continue
            cid_i = len(chunks[i])
            # sync: the robot stood still while waiting, so execute from the obs-aligned index;
            # async: the robot kept moving, so skip the d actions whose time has already passed
            start_j = j0 if strat == "sync" else j0 + (t_av - t_obs)
            for k, tau in enumerate(range(t_av, t_av + h)):
                plan[i][tau] = (a[start_j + k].astype(float), cid_i, start_j + k)
            chunks[i].append({"id": cid_i, "t_obs": t_obs, "t_avail": t_av,
                              "exec": [t_av, t_av + h - 1],
                              "a": np.round(a, 1).tolist()})
        return None

    for t in range(T_MAX):
        # 1) deliver before requesting, so that a request issued at the same step (d == h)
        #    cannot overwrite a chunk that is just arriving
        pending = deliver(t, pending)
        # 2) inference request at t (uses obs_{t-1}, obs_t)
        if t == next_req:
            alive = [i for i in range(n_seeds) if not done[i]]
            if alive:
                imgs = np.stack([np.stack([prev_obs[i]["pixels"], obs[i]["pixels"]]) for i in alive])
                sts = np.stack([np.stack([prev_obs[i]["agent_pos"], obs[i]["agent_pos"]]) for i in alive])
                known = mask = None
                if strat == "inpaint":
                    # chunk index j corresponds to time t + (j - j0).
                    # Hard prefix (weight 1): actions already committed, i.e. the one executed at t-1
                    # (j = 0) and the d actions the old chunk runs while this inference is in flight
                    # (j = j0 .. j0+d-1). Soft overlap (RTC-style): the rest of the old chunk's plan,
                    # with weights decaying linearly to 0 over the overlap.
                    mask = np.zeros(H, np.float32)
                    known = np.zeros((len(alive), H, 2), np.float32)
                    for bi, i in enumerate(alive):
                        old = chunks[i][-1] if chunks[i] else None
                        for j in range(H):
                            tau = t + j - j0
                            if j < j0 + d:
                                mask[j] = 1.0
                                if tau in plan[i]:
                                    known[bi, j] = plan[i][tau][0]
                                elif 0 <= tau < t and steps[i]:
                                    known[bi, j] = steps[i][tau]["a"]
                                else:
                                    known[bi, j] = last_action[i]
                            elif old is not None and j0 + tau - old["t_obs"] < H:
                                known[bi, j] = old["a"][j0 + tau - old["t_obs"]]
                    if chunks[alive[0]]:
                        old = chunks[alive[0]][-1]
                        overlap = [j for j in range(j0 + d, H) if j0 + (t + j - j0) - old["t_obs"] < H]
                        for k, j in enumerate(overlap):
                            mask[j] = 1.0 - (k + 1) / (len(overlap) + 1)
                acts = pol.sample(imgs, sts, gen, known, mask)
                pending = (t, t + d, {i: acts[bi] for bi, i in enumerate(alive)})
            next_req = t + period
        pending = deliver(t, pending)  # d == 0: the chunk requested at t is available immediately
        # 3) step every live env
        for i, e in enumerate(envs):
            if done[i]:
                continue
            if t in plan[i]:
                a, c_id, j = plan[i].pop(t)
                held = False
                age = t - chunks[i][c_id]["t_obs"]
            else:  # nothing to execute (sync inference pause / async start-up): hold position
                a, c_id, j, held, age = last_action[i], -1, -1, True, None
            info = infos[i]
            bp = info["block_pose"]
            steps[i].append({"t": t, "ax": round(float(info["pos_agent"][0]), 2),
                             "ay": round(float(info["pos_agent"][1]), 2),
                             "bx": round(float(bp[0]), 2), "by": round(float(bp[1]), 2),
                             "bth": round(float(bp[2]), 4),
                             "a": [round(float(a[0]), 2), round(float(a[1]), 2)],
                             "chunk": c_id, "j": j, "held": held, "age": age,
                             "cov": round(float(info.get("coverage", 0.0)), 4)})
            prev_obs[i] = obs[i]
            obs[i], r, term, trunc, infos[i] = e.step(np.asarray(a, dtype=np.float64))
            last_action[i] = np.asarray(a, dtype=float)
            if term or trunc:
                done[i] = True
                steps[i][-1]["cov_after"] = round(float(infos[i]["coverage"]), 4)
                steps[i][-1]["success_after"] = bool(infos[i]["is_success"])
        if all(done):
            break

    episodes = []
    for i in range(n_seeds):
        last = steps[i][-1]
        success = bool(last.get("success_after", False))
        cov_final = last.get("cov_after", last["cov"])
        episodes.append({"seed": SEED_BASE + i, "success": success, "n_steps": len(steps[i]),
                         "coverage_final": cov_final,
                         "coverage_max": max([s["cov"] for s in steps[i]] + [cov_final]),
                         "steps": steps[i], "chunks": chunks[i]})
    for e in envs:
        e.close()
    return {"config": cid, "strategy": strat, "latency": d, "horizon": h, "replicate": rep,
            "belt": list(belt) if belt else None, "ddim_steps": DDIM_STEPS, "chunk_len": H, "obs_steps": n_obs, "fps": 10,
            "episodes": episodes}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", nargs="+", required=True)
    ap.add_argument("--seeds", type=int, default=32)
    ap.add_argument("--out", default="data/runs")
    ap.add_argument("--threads", type=int, default=12)
    ap.add_argument("--belt", type=float, nargs=2, default=None, metavar=("VX", "VY"),
                    help="moving-belt variant: belt velocity in px/s (default: static PushT)")
    args = ap.parse_args()
    torch.set_num_threads(args.threads)
    os.makedirs(args.out, exist_ok=True)
    pol = Policy()
    for cid in args.configs:
        path = os.path.join(args.out, f"{cid}.json")
        if os.path.exists(path):
            print("skip", cid, flush=True); continue
        t0 = time.time()
        res = run_config(pol, cid, args.seeds, args.belt)
        with open(path, "w") as f:
            json.dump(res, f, separators=(",", ":"))
        sr = np.mean([e["success"] for e in res["episodes"]])
        print(f"done {cid} success={sr:.2f} sec={time.time()-t0:.0f}", flush=True)


if __name__ == "__main__":
    main()
