"""Catch-the-ball: a second task in which the world keeps moving while the policy thinks.

A ball rolls at constant speed and bounces off the walls of the same 512 x 512 px table; the same
pusher as PushT (absolute position actions at 10 Hz, PD controller k_p = 100, k_v = 20 with ten 10 ms
sub-steps) must touch it before the deadline. The pusher does not deflect the ball: touching it
(centre distance <= AGENT_R + BALL_R) ends the episode with success. Start states (pusher position,
ball position, speed and direction) differ per seed, so some balls are easy to catch and some are not.

The policy is a small Diffusion Policy trained here from scripted demonstrations (the demonstrator
aims at the point where it can meet the ball, including wall bounces), with the chunk layout of the
PushT policy: 16 actions, 2 observation steps, chunk index 1 aligned with the current observation.
It sees pusher and ball positions at t-1 and t, so it can infer the ball's velocity.

Calibration (seeds 5000-5099 only; the evaluation seeds 1000-1029 were not used): the demonstrator
catches every ball; the no-latency sync policy was required to succeed in about 90 % at h = 4 and 8.
Tried (ball radius, deadline): (12, 50 steps) 70 / 66 %, (20, 80) 86 / 88 %, (25, 80) 93 / 88 %,
(20, 100) 94 / 94 %; (25, 80) is the closest to 90 % at both horizons and was fixed before any
schedule with latency was run on the evaluation seeds. The policy is trained with 50-step
demonstrations. (A first version without walls for the pusher let it leave the table; its runs were
discarded.)

Usage:
  python scripts/catch_task.py train         # demos -> models/catch_policy.pt
  python scripts/catch_task.py calibrate     # demonstrator success on calibration seeds
"""
import argparse, os, time

import numpy as np
import torch
import torch.nn as nn
from diffusers.schedulers.scheduling_ddpm import DDPMScheduler
from diffusers.schedulers.scheduling_ddim import DDIMScheduler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.path.join(ROOT, "models", "catch_policy.pt")

SIZE = 512.0
LO, HI = 20.0, 492.0                       # ball centre stays inside [LO, HI] (bounces)
WALL = (5.0, 506.0)                        # table walls for the pusher (as in gym-pusht)
K_P, K_V, DT, SUB = 100.0, 20.0, 0.01, 10   # PushT's PD controller (gym_pusht)
AGENT_R, BALL_R = 15.0, 25.0
T_MAX = 80                                 # deadline: 80 steps = 8 s
SPEED_RANGE = (4.0, 10.0)                  # ball speed, px per step (40-100 px/s)
MIN_DIST = 200.0                           # pusher and ball start at least 200 px apart
LEAD = 30.0                                # demonstrator: waypoint 30 px ahead of the pusher
H, N_OBS, J0 = 16, 2, 1
TRAIN_STEPS, DDIM_STEPS = 100, 10


def roll(p, v, k):
    """Ball position and velocity after k steps of straight motion with mirror bounces."""
    p, v = p.astype(float).copy(), v.astype(float).copy()
    for _ in range(k):
        p = p + v
        for i in range(2):
            if p[i] < LO:
                p[i], v[i] = 2 * LO - p[i], -v[i]
            elif p[i] > HI:
                p[i], v[i] = 2 * HI - p[i], -v[i]
    return p, v


class CatchEnv:
    def __init__(self, seed):
        rng = np.random.default_rng(seed)
        while True:
            self.p = rng.uniform(60, 452, 2)
            self.ball = rng.uniform(60, 452, 2)
            if np.linalg.norm(self.ball - self.p) >= MIN_DIST:
                break
        ang = rng.uniform(0, 2 * np.pi)
        self.speed = float(rng.uniform(*SPEED_RANGE))
        self.bv = self.speed * np.array([np.cos(ang), np.sin(ang)])
        self.v = np.zeros(2)

    def obs(self):
        return np.concatenate([self.p, self.ball])

    def dist(self):
        return float(np.linalg.norm(self.p - self.ball))

    def caught(self):
        return self.dist() <= AGENT_R + BALL_R

    def step(self, a):
        """One 100 ms control step; the ball moves 1/SUB of its step per sub-step. Returns True on a catch."""
        a = np.asarray(a, float)
        for _ in range(SUB):
            acc = K_P * (a - self.p) + K_V * (0 - self.v)
            self.v = self.v + acc * DT
            self.p = self.p + self.v * DT
            for i in range(2):  # walls at 5 and 506 px as in gym-pusht: the pusher stops there
                if not WALL[0] + AGENT_R <= self.p[i] <= WALL[1] - AGENT_R:
                    self.p[i] = min(max(self.p[i], WALL[0] + AGENT_R), WALL[1] - AGENT_R)
                    self.v[i] = 0.0
            self.ball, self.bv = roll(self.ball, self.bv / SUB, 1)
            self.bv = self.bv * SUB
            if self.caught():
                return True
        return False


def expert(p, ball, bv):
    """Scripted demonstrator: aim at the earliest predicted ball position the pusher can reach
    (its measured top speed is 12.2 px/step), then place a waypoint LEAD px towards it."""
    aim = ball
    for k in range(1, 80):
        q, _ = roll(ball, bv, k)
        if np.linalg.norm(q - p) <= 12.0 * k:
            aim = q
            break
    d = aim - p
    n = np.linalg.norm(d)
    return aim.copy() if n <= LEAD else p + d / n * LEAD


# ---- policy --------------------------------------------------------------------------------------
def norm(x):
    return x / SIZE * 2 - 1


def unnorm(x):
    return (x + 1) / 2 * SIZE


REL = 256.0  # chunk actions are stored relative to the pusher's current position, in units of REL px


def to_rel(a, p):
    """Absolute chunk (B, H, 2) -> relative to the current pusher position p (B, 2)."""
    return (a - p[:, None, :]) / REL


def from_rel(r, p):
    return r * REL + p[:, None, :]


def cond_features(obs2):
    """(B, 2, 4) positions at t-1, t -> normalised positions, the scaled per-step displacement
    (the ball moves ~1 % of the table per step, too little to read from positions alone) and the
    pusher-to-ball offset."""
    o = norm(obs2)
    rel = (obs2[:, 1, 2:] - obs2[:, 1, :2]) / REL
    return np.concatenate([o.reshape(len(o), -1), (o[:, 1] - o[:, 0]) * 20, rel], 1).astype(np.float32)


class Denoiser(nn.Module):
    def __init__(self, cond_dim=14, hid=512):
        super().__init__()
        self.temb = nn.Sequential(nn.Linear(64, 128), nn.Mish(), nn.Linear(128, 128))
        self.net = nn.Sequential(nn.Linear(H * 2 + 128 + cond_dim, hid), nn.Mish(),
                                 nn.Linear(hid, hid), nn.Mish(), nn.Linear(hid, hid), nn.Mish(),
                                 nn.Linear(hid, H * 2))

    def forward(self, x, t, cond):
        f = torch.exp(-np.log(10000) * torch.arange(32) / 32)[None] * t[:, None].float()
        te = self.temb(torch.cat([f.sin(), f.cos()], 1))
        return self.net(torch.cat([x.flatten(1), te, cond], 1)).view(-1, H, 2)


def make_sched(cls):
    return cls(num_train_timesteps=TRAIN_STEPS, beta_schedule="squaredcos_cap_v2",
               clip_sample=True, clip_sample_range=1.0, prediction_type="epsilon")


DEMO_STEPS = 50  # length of each training demonstration


def run_expert(env, stop_on_catch=True, n_steps=T_MAX):
    """Expert episode; returns observations, actions and whether it caught the ball. For training
    demos the demonstrator keeps chasing after the first contact (stop_on_catch=False, n_steps=DEMO_STEPS), so that the
    later moves of a chunk always follow the ball instead of stopping where the episode ended."""
    obs, act, hit = [env.obs()], [], False
    for _ in range(n_steps):
        a = expert(env.p, env.ball, env.bv)
        act.append(a)
        hit = env.step(a) or hit
        obs.append(env.obs())
        if hit and stop_on_catch:
            break
    return np.array(obs), np.array(act), hit


def demos(n_eps, seed=0):
    rng = np.random.default_rng(seed)
    O, A = [], []
    for _ in range(n_eps):
        obs, act, _ = run_expert(CatchEnv(int(rng.integers(10 ** 6, 10 ** 9))), stop_on_catch=False, n_steps=DEMO_STEPS)
        for t in range(len(act) - H):
            O.append(np.stack([obs[max(t - 1, 0)], obs[t]]))
            A.append(act[[min(max(t - J0 + j, 0), len(act) - 1) for j in range(H)]])
    return np.array(O, np.float32), np.array(A, np.float32)


def train(steps=40000, n_eps=4000):
    torch.manual_seed(0)
    O, A = demos(n_eps)
    print("demo samples", len(O), flush=True)
    C, A = torch.from_numpy(cond_features(O)), torch.from_numpy(to_rel(A, O[:, 1, :2]).astype(np.float32))
    net, sched = Denoiser(), make_sched(DDPMScheduler)
    opt = torch.optim.AdamW(net.parameters(), 1e-3, weight_decay=1e-6)
    lr = torch.optim.lr_scheduler.CosineAnnealingLR(opt, steps)
    t0 = time.time()
    for it in range(steps):
        idx = torch.randint(len(C), (512,))
        x0, c = A[idx], C[idx]
        noise = torch.randn_like(x0)
        k = torch.randint(TRAIN_STEPS, (len(idx),))
        loss = ((net(sched.add_noise(x0, noise, k), k, c) - noise) ** 2).mean()
        opt.zero_grad(); loss.backward(); opt.step(); lr.step()
        if it % 4000 == 0:
            print(f"it {it} loss {loss.item():.4f} {time.time() - t0:.0f}s", flush=True)
    os.makedirs(os.path.dirname(MODEL), exist_ok=True)
    torch.save({"state_dict": net.state_dict(), "steps": steps, "n_demo_episodes": n_eps}, MODEL)
    print("saved", MODEL)


class CatchPolicy:
    """Same sampling interface as the PushT policy in generate_rollouts.py (DDIM, RePaint inpainting)."""

    def __init__(self):
        self.net = Denoiser()
        self.net.load_state_dict(torch.load(MODEL)["state_dict"])
        self.net.eval()
        self.sched = make_sched(DDIMScheduler)
        self.sched.set_timesteps(DDIM_STEPS)
        self.H, self.n_obs = H, N_OBS

    @torch.inference_mode()
    def sample(self, obs2, gen, known=None, known_mask=None):
        B = obs2.shape[0]
        c = torch.from_numpy(cond_features(obs2))
        p = obs2[:, 1, :2]
        x = torch.randn((B, H, 2), generator=gen)
        if known is not None:
            kn = torch.from_numpy(to_rel(known, p)).float()
            w = torch.from_numpy(known_mask).float()[None, :, None]
        for t in self.sched.timesteps:
            if known is not None:
                noisy = self.sched.add_noise(kn, torch.randn(kn.shape, generator=gen), t[None])
                x = w * noisy + (1 - w) * x
            eps = self.net(x, torch.full((B,), int(t), dtype=torch.long), c)
            x = self.sched.step(eps, t, x).prev_sample
        if known is not None:
            x = torch.where(w >= 1, kn, x)
        return from_rel(x.numpy(), p)


def calibrate(n=200):
    steps, ok = [], 0
    for s in range(5000, 5000 + n):
        _, act, hit = run_expert(CatchEnv(s))
        ok += hit
        steps.append(len(act))
    print(f"demonstrator on calibration seeds 5000-{5000 + n - 1}: success {ok / n:.2f}, "
          f"steps median {np.median(steps):.0f}, 90th pct {np.percentile(steps, 90):.0f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["train", "calibrate"])
    ap.add_argument("--steps", type=int, default=40000)
    a = ap.parse_args()
    torch.set_num_threads(12)
    train(a.steps) if a.cmd == "train" else calibrate()
