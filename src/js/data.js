// Loads the episode table, schedule aggregates and (lazily) per-schedule step/chunk logs.
const NUM = ["latency", "horizon", "replicate", "seed", "success", "steps_to_success", "coverage_final", "coverage_max",
  "n_inferences", "n_seams", "seam_gap_mean", "seam_gap_max", "inner_step_mean", "staleness_mean",
  "idle_frac", "jerk_mean", "path_len"];

export const DATA = {
  episodes: [],
  schedules: [],
  schedById: new Map(),
  ep: new Map(),        // schedule -> Map(seed -> episode row)
  seeds: [],
  runs: new Map(),      // schedule -> Promise(run detail)
};

export const STRATEGIES = ["sync", "naive", "inpaint"];
export const STRAT_LABEL = { sync: "Sync", naive: "Naive async", inpaint: "Inpaint async" };
export const LATENCIES = [0, 1, 2, 4, 6];
export const HORIZONS = [8, 6, 4, 2];

export function label(id) {
  const s = DATA.schedById.get(id);
  if (!s) return id;
  return `${STRAT_LABEL[s.strategy]} · d=${s.latency} (${s.latency * 100} ms) · h=${s.horizon}${s.replicate ? " · noise replicate" : ""}`;
}
export function shortLabel(id) {
  const s = DATA.schedById.get(id);
  return s ? `${s.strategy} d${s.latency} h${s.horizon}${s.replicate ? " rep" : ""}` : id;
}

export async function loadBase() {
  const [eps, sch] = await Promise.all([d3.csv("data/episodes.csv"), d3.json("data/schedules.json")]);
  for (const r of eps) for (const k of NUM) r[k] = r[k] === "" ? null : +r[k];
  DATA.episodes = eps;
  DATA.schedules = sch;
  for (const s of sch) DATA.schedById.set(s.schedule, s);
  for (const r of eps) {
    if (!DATA.ep.has(r.schedule)) DATA.ep.set(r.schedule, new Map());
    DATA.ep.get(r.schedule).set(r.seed, r);
  }
  DATA.seeds = [...new Set(eps.map((r) => r.seed))].sort((a, b) => a - b);
  // robustness of an initial state = share of schedules in which it succeeds
  const grid = sch.filter((x) => !x.replicate);
  DATA.robust = new Map(DATA.seeds.map((s) => [s, d3.mean(grid, (x) => DATA.ep.get(x.schedule).get(s)?.success ?? 0)]));
}

// Why a strategy × latency × horizon cell has no data.
export function missingReason(strat, d, h) {
  if (strat !== "sync" && d === 0) return "identical to Sync d=0: without latency there is nothing to overlap";
  if (strat !== "sync" && d > h) return `infeasible: with d=${d} > h=${h} a new inference would have to start before the previous one returns (RTC also requires h ≥ d)`;
  return "not generated";
}

export function loadRun(id) {
  if (!DATA.runs.has(id)) {
    DATA.runs.set(id, d3.json(`data/runs/${id}.json`).then(prepareRun));
  }
  return DATA.runs.get(id);
}

// Index chunks: which indices j were executed at which time, so views can split every
// predicted chunk into "executed" and "discarded" parts.
function prepareRun(run) {
  run.bySeed = new Map();
  for (const e of run.episodes) {
    for (const c of e.chunks) { c.execJ = new Map(); c.t0 = null; c.t1 = null; }
    for (let t = 0; t < e.n; t++) {
      const c = e.chunk[t];
      if (c < 0) continue;
      const ch = e.chunks[c];
      ch.execJ.set(e.j[t], t);
      if (ch.t0 === null) ch.t0 = t;
      ch.t1 = t;
    }
    e.seamAt = new Map(e.seams.map((s) => [s.t, s.gap]));
    run.bySeed.set(e.seed, e);
  }
  return run;
}

// Chunk that is being executed at time t (or the most recent one if the robot is idle).
export function activeChunk(e, t) {
  const tt = Math.min(t, e.n - 1);
  for (let k = tt; k >= 0; k--) if (e.chunk[k] >= 0) return e.chunks[e.chunk[k]];
  return null;
}
// Chunk whose inference is in flight at time t (observed but not yet available).
export function pendingChunk(e, t) {
  return e.chunks.find((c) => c.t_obs <= t && t < c.t_avail) || null;
}

// ---- statistics for schedule-level aggregates (A) --------------------------------------------
const Z = 1.96;
function wilson(k, n) {
  if (!n) return [null, null];
  const p = k / n, den = 1 + (Z * Z) / n;
  const c = (p + (Z * Z) / (2 * n)) / den, hw = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / den;
  return [c - hw, c + hw];
}
function meanCI(vals) {
  const n = vals.length;
  if (!n) return { v: null, lo: null, hi: null, n };
  const v = d3.mean(vals);
  const hw = n > 1 ? (Z * d3.deviation(vals)) / Math.sqrt(n) : 0;
  return { v, lo: v - hw, hi: v + hw, n };
}

// Aggregate of one metric for one schedule over a set of seeds (all seeds by default), with a
// 95 % interval. With `ref`, the value is the paired difference schedule − ref over the same seeds,
// which is the right comparison for our paired design (same initial states under both schedules).
export function aggregate(id, metric, seeds, ref) {
  const key = METRIC_EP[metric];
  const S = seeds ? [...seeds] : DATA.seeds;
  const A = DATA.ep.get(id);
  if (!A) return null;
  if (ref) {
    const B = DATA.ep.get(ref);
    const diffs = S.map((s) => [A.get(s)?.[key], B.get(s)?.[key]]).filter(([a, b]) => a !== null && a !== undefined && b !== null && b !== undefined).map(([a, b]) => a - b);
    return meanCI(diffs);
  }
  const vals = S.map((s) => A.get(s)?.[key]).filter((v) => v !== null && v !== undefined);
  if (metric === "success_rate") {
    const k = d3.sum(vals), n = vals.length;
    const [lo, hi] = wilson(k, n);
    return { v: n ? k / n : null, lo, hi, n };
  }
  return meanCI(vals);
}
const METRIC_EP = {
  success_rate: "success", coverage_mean: "coverage_final", idle_frac_mean: "idle_frac",
  staleness_mean: "staleness_mean", seam_gap_mean: "seam_gap_mean", jerk_mean: "jerk_mean",
};
