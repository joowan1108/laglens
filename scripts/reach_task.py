"""Reach-in-time: a deliberately easy second task in which waiting costs success.

The same pusher as PushT (512 x 512 px table, absolute position actions at 10 Hz, the same PD controller
k_p = 100, k_v = 20 with ten 10 ms sub-steps) must touch a target disk before a deadline. There is no
block and nothing moves except the pusher, so the only thing that differs between strategies is how
much of the time budget the robot spends standing still while the policy thinks.

The policy is a small Diffusion Policy trained here from scripted demonstrations (straight-line moves
at a fixed speed), with the same chunk layout as the PushT policy: 16 actions, 2 observation steps,
chunk index 1 aligned with the current observation.

Usage:
  python scripts/reach_task.py train            # demos -> models/reach_policy.pt
"""
import argparse, os, time

import numpy as np
import torch
import torch.nn as nn
from diffusers.schedulers.scheduling_ddpm import DDPMScheduler
from diffusers.schedulers.scheduling_ddim import DDIMScheduler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.path.join(ROOT, "models", "reach_policy.pt")

SIZE = 512.0
K_P, K_V, DT, SUB = 100.0, 20.0, 0.01, 10   # PushT's PD controller (gym_pusht)
TARGET_R = 20.0                            # success: pusher centre within 20 px of the target centre
T_MAX = 70                                 # deadline: 70 steps = 7 s
MIN_DIST = 200.0                           # start and target are at least 200 px apart
SPEED = 20.0                               # demo speed: the expert aims 20 px ahead each step
H, N_OBS, J0 = 16, 2, 1
TRAIN_STEPS, DDIM_STEPS = 100, 10


def sample_start(rng):
    """Pusher start and target position; both inside [60, 452]^2 and >= MIN_DIST apart."""
    while True:
        p = rng.uniform(60, 452, 2)
        g = rng.uniform(60, 452, 2)
        if np.linalg.norm(g - p) >= MIN_DIST:
            return p, g


class ReachEnv:
    """One episode. State: pusher position/velocity and the target position."""

    def __init__(self, seed):
        rng = np.random.default_rng(seed)
        self.p, self.goal = sample_start(rng)
        self.v = np.zeros(2)

    def obs(self):
        return np.concatenate([self.p, self.goal])

    def dist(self):
        return float(np.linalg.norm(self.p - self.goal))

    def step(self, a):
        a = np.asarray(a, float)
        for _ in range(SUB):
            acc = K_P * (a - self.p) + K_V * (0 - self.v)
            self.v = self.v + acc * DT
            self.p = self.p + self.v * DT
        return self.dist() < TARGET_R


def expert(p, goal):
    """Scripted demonstrator: a waypoint SPEED px ahead on the straight line to the target."""
    d = goal - p
    n = np.linalg.norm(d)
    return goal.copy() if n <= SPEED else p + d / n * SPEED


# ---- policy --------------------------------------------------------------------------------------
def norm(x):
    return x / SIZE * 2 - 1


def unnorm(x):
    return (x + 1) / 2 * SIZE


class Denoiser(nn.Module):
    """MLP epsilon network: noisy chunk (16 x 2) + diffusion step + 2 observations -> noise."""

    def __init__(self, hid=512):
        super().__init__()
        self.temb = nn.Sequential(nn.Linear(64, 128), nn.Mish(), nn.Linear(128, 128))
        self.net = nn.Sequential(nn.Linear(H * 2 + 128 + N_OBS * 4, hid), nn.Mish(),
                                 nn.Linear(hid, hid), nn.Mish(), nn.Linear(hid, hid), nn.Mish(),
                                 nn.Linear(hid, H * 2))

    def forward(self, x, t, cond):
        f = torch.exp(-np.log(10000) * torch.arange(32) / 32)[None] * t[:, None].float()
        te = self.temb(torch.cat([f.sin(), f.cos()], 1))
        return self.net(torch.cat([x.flatten(1), te, cond], 1)).view(-1, H, 2)


def make_sched(cls):
    return cls(num_train_timesteps=TRAIN_STEPS, beta_schedule="squaredcos_cap_v2",
               clip_sample=True, clip_sample_range=1.0, prediction_type="epsilon")


def demos(n_eps, seed=0):
    """(obs history, action chunk) pairs from expert episodes, LeRobot-style padding at the ends."""
    rng = np.random.default_rng(seed)
    O, A = [], []
    for _ in range(n_eps):
        env = ReachEnv(int(rng.integers(1 << 30)))
        obs, act = [env.obs()], []
        for _ in range(T_MAX + H):
            a = expert(env.p, env.goal)
            act.append(a)
            env.step(a)
            obs.append(env.obs())
        obs, act = np.array(obs), np.array(act)
        for t in range(T_MAX):
            O.append(np.concatenate([obs[max(t - 1, 0)], obs[t]]))
            A.append(act[[min(max(t - J0 + j, 0), len(act) - 1) for j in range(H)]])
    return np.array(O, np.float32), np.array(A, np.float32)


def train(steps=30000, n_eps=3000):
    torch.manual_seed(0)
    O, A = demos(n_eps)
    O, A = torch.from_numpy(norm(O)), torch.from_numpy(norm(A))
    net, sched = Denoiser(), make_sched(DDPMScheduler)
    opt = torch.optim.AdamW(net.parameters(), 1e-3, weight_decay=1e-6)
    lr = torch.optim.lr_scheduler.CosineAnnealingLR(opt, steps)
    t0 = time.time()
    for it in range(steps):
        idx = torch.randint(len(O), (512,))
        x0, c = A[idx], O[idx]
        noise = torch.randn_like(x0)
        k = torch.randint(TRAIN_STEPS, (len(idx),))
        loss = ((net(sched.add_noise(x0, noise, k), k, c) - noise) ** 2).mean()
        opt.zero_grad(); loss.backward(); opt.step(); lr.step()
        if it % 2000 == 0:
            print(f"it {it} loss {loss.item():.4f} {time.time() - t0:.0f}s", flush=True)
    os.makedirs(os.path.dirname(MODEL), exist_ok=True)
    torch.save({"state_dict": net.state_dict(), "steps": steps, "n_demo_episodes": n_eps}, MODEL)
    print("saved", MODEL)


class ReachPolicy:
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
        """obs2: (B, 2, 4) [pusher xy, target xy] at t-1, t. known / known_mask as in the PushT
        policy. Returns (B, H, 2) absolute actions."""
        B = obs2.shape[0]
        c = torch.from_numpy(norm(obs2.reshape(B, -1))).float()
        x = torch.randn((B, H, 2), generator=gen)
        if known is not None:
            kn = torch.from_numpy(norm(known)).float()
            w = torch.from_numpy(known_mask).float()[None, :, None]
        for t in self.sched.timesteps:
            if known is not None:
                noisy = self.sched.add_noise(kn, torch.randn(kn.shape, generator=gen), t[None])
                x = w * noisy + (1 - w) * x
            eps = self.net(x, torch.full((B,), int(t), dtype=torch.long), c)
            x = self.sched.step(eps, t, x).prev_sample
        if known is not None:
            x = torch.where(w >= 1, kn, x)
        return unnorm(x.numpy())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["train"])
    ap.add_argument("--steps", type=int, default=30000)
    a = ap.parse_args()
    torch.set_num_threads(12)
    train(a.steps)
