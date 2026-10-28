"""Turn raw rollout logs (data/runs/*.json) into the files the LagLens interface loads.

Outputs
  src/data/episodes.csv     one row per (schedule, seed) episode  -> the main tabular dataset
  src/data/schedules.json   one record per schedule (aggregates)
  src/data/runs/<cfg>.json  compact per-step / per-chunk detail for one schedule (lazy-loaded)

Derived metrics (per episode)
  seam gap      at every hand-over from chunk k to chunk k+1: distance (px) between the first action
                executed from k+1 and the action chunk k had planned next (= plan disagreement)
  staleness     age (steps) of the observation a executed action was planned from; on average
                d + (h-1)/2, i.e. the same for every strategy at equal latency and horizon
  think motion  for every executed chunk: distance (px) the robot moved between the observation the
                chunk was planned from (t_obs) and the step the chunk became available (t_avail),
                i.e. how much the scene changed while the policy was thinking
  idle frac     share of steps where nothing was executable (sync waits, async start-up)
  jerk          mean |a_t - 2 a_{t-1} + a_{t-2}| of executed actions (px / step^2)
"""
import csv, glob, json, math, os, statistics as st

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW = os.path.join(ROOT, "data", "runs")
OUT = os.path.join(ROOT, "src", "data")


def dist(p, q):
    return math.hypot(p[0] - q[0], p[1] - q[1])


def episode_metrics(ep, j0):
    S, C = ep["steps"], ep["chunks"]
    seams, inner = [], []
    prev = None
    for s in S:
        if s["held"]:
            continue
        if prev is not None and s["chunk"] != prev["chunk"]:
            old = C[prev["chunk"]]
            nxt_j = prev["j"] + 1
            if nxt_j < len(old["a"]):
                seams.append({"t": s["t"], "gap": dist(s["a"], old["a"][nxt_j]),
                              "from": prev["chunk"], "to": s["chunk"]})
        elif prev is not None and s["t"] == prev["t"] + 1:
            inner.append(dist(s["a"], prev["a"]))
        prev = s
    acts = [s["a"] for s in S]
    jerk = [dist((acts[i][0] - 2 * acts[i - 1][0] + acts[i - 2][0], acts[i][1] - 2 * acts[i - 1][1] + acts[i - 2][1]), (0, 0))
            for i in range(2, len(acts))]
    ages = [s["age"] for s in S if s["age"] is not None]
    pos = {s["t"]: (s["ax"], s["ay"]) for s in S}
    last = S[-1]["t"]
    motion = [dist(pos[min(c["t_avail"], last)], pos[c["t_obs"]]) for c in C if c["exec"]]
    path = sum(dist((S[i]["ax"], S[i]["ay"]), (S[i - 1]["ax"], S[i - 1]["ay"])) for i in range(1, len(S)))
    t_succ = len(S) if ep["success"] else None
    return {
        "success": int(ep["success"]),
        "steps_to_success": t_succ,
        "coverage_final": round(ep["coverage_final"], 4),
        "coverage_max": round(ep["coverage_max"], 4),
        "n_inferences": len(C),
        "n_switches": len(seams),
        "jump_mean": round(st.mean([x["gap"] for x in seams]), 2) if seams else 0.0,
        "jump_max": round(max([x["gap"] for x in seams]), 2) if seams else 0.0,
        "inner_step_mean": round(st.mean(inner), 2) if inner else 0.0,
        "staleness_mean": round(st.mean(ages), 3) if ages else 0.0,
        "idle_frac": round(sum(s["held"] for s in S) / len(S), 4),
        "jerk_mean": round(st.mean(jerk), 2) if jerk else 0.0,
        "think_motion_mean": round(st.mean(motion), 2) if motion else 0.0,
        "think_motion_max": round(max(motion), 2) if motion else 0.0,
        "path_len": round(path, 1),
    }, seams


def main():
    os.makedirs(os.path.join(OUT, "runs"), exist_ok=True)
    files = sorted(glob.glob(os.path.join(RAW, "*.json")))
    rows, schedules = [], []
    for f in files:
        R = json.load(open(f))
        j0 = R["obs_steps"] - 1
        detail = {k: R[k] for k in ("config", "strategy", "latency", "horizon", "ddim_steps", "chunk_len", "obs_steps", "fps")}
        detail["replicate"] = R.get("replicate", 0)
        detail["episodes"] = []
        for ep in R["episodes"]:
            m, seams = episode_metrics(ep, j0)
            row = {"schedule": R["config"], "strategy": R["strategy"], "latency": R["latency"],
                   "horizon": R["horizon"], "replicate": R.get("replicate", 0), "seed": ep["seed"], **m}
            rows.append(row)
            S = ep["steps"]
            # column-oriented, compact per-step arrays; coverage at t=0 was not computed by the
            # simulator at reset, so it is stored as null
            detail["episodes"].append({
                "seed": ep["seed"], "success": ep["success"], "n": len(S),
                "ax": [s["ax"] for s in S], "ay": [s["ay"] for s in S],
                "bx": [s["bx"] for s in S], "by": [s["by"] for s in S], "bth": [s["bth"] for s in S],
                "act": [s["a"] for s in S], "chunk": [s["chunk"] for s in S], "j": [s["j"] for s in S],
                "age": [s["age"] for s in S],
                "cov": [None if s["t"] == 0 else s["cov"] for s in S] + [ep["coverage_final"]],
                "chunks": [{"t_obs": c["t_obs"], "t_avail": c["t_avail"], "exec": c["exec"], "a": c["a"]} for c in ep["chunks"]],
                "seams": [{"t": x["t"], "gap": round(x["gap"], 2)} for x in seams],
            })
        with open(os.path.join(OUT, "runs", f"{R['config']}.json"), "w") as fo:
            json.dump(detail, fo, separators=(",", ":"))
        eps = [r for r in rows if r["schedule"] == R["config"]]
        schedules.append({"schedule": R["config"], "strategy": R["strategy"], "latency": R["latency"],
                          "horizon": R["horizon"], "replicate": R.get("replicate", 0), "n": len(eps),
                          "success_rate": round(st.mean(r["success"] for r in eps), 4),
                          "coverage_mean": round(st.mean(r["coverage_final"] for r in eps), 4),
                          "jump_mean": round(st.mean(r["jump_mean"] for r in eps), 2),
                          "staleness_mean": round(st.mean(r["staleness_mean"] for r in eps), 3),
                          "idle_frac_mean": round(st.mean(r["idle_frac"] for r in eps), 4),
                          "jerk_mean": round(st.mean(r["jerk_mean"] for r in eps), 2),
                          "think_motion_mean": round(st.mean(r["think_motion_mean"] for r in eps), 2)})
    with open(os.path.join(OUT, "episodes.csv"), "w", newline="") as fo:
        w = csv.DictWriter(fo, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    with open(os.path.join(OUT, "schedules.json"), "w") as fo:
        json.dump(schedules, fo, indent=0)
    print(f"{len(files)} schedules, {len(rows)} episodes written to {OUT}")


if __name__ == "__main__":
    main()
