// Colour has exactly one meaning per hue across all views (checked for colour-vision deficiency,
// see docs/design_rationale.md):
//   identity of the compared pair: R = near-black, C = orange (C, D, B's R/C columns, rings in A)
//   strategy (nominal, only in A and the column headers of B): sync blue, naive vermillion, inpaint green
//   seam (hand-over jump, C and D): magenta. Selection is drawn in ink; everything else is grey.
export const COLOR = {
  ref: "#222222", cand: "#E69F00", sel: "#1d1d1f", seam: "#c2185b",
  ok: "#8e8e98", okLight: "#c9c9d0", fail: "#efeff2",
  block: "#a9adb5", goal: "#6b6b72", ink: "#1d1d1f", muted: "#6b6b72",
};
export const STRAT_COLOR = { sync: "#0072B2", naive: "#D55E00", inpaint: "#009E73" };
// redundant shape encoding so that strategy identity never depends on hue alone
export const STRAT_SYMBOL = { sync: d3.symbolCircle, naive: d3.symbolSquare, inpaint: d3.symbolDiamond };

// Schedule-level metrics shown in A. `ep` = episode attribute aggregated over seeds;
// `rate` metrics use a Wilson interval, the others a t-interval of the mean.
export const METRICS = {
  success_rate: { label: "success rate", group: "Outcome", ep: "success", rate: true, pct: true, higherBetter: true,
    note: "share of the 50 episodes that reach ≥ 95 % coverage" },
  coverage_mean: { label: "final coverage", group: "Outcome", ep: "coverage_final", pct: true, higherBetter: true,
    note: "mean block–goal overlap at the end of the episode" },
  idle_frac_mean: { label: "idle share (cost of waiting)", group: "Mechanism", ep: "idle_frac", pct: true, higherBetter: false,
    note: "share of steps in which the robot holds still because no action is available: the price of sync" },
  staleness_mean: { label: "staleness (steps)", group: "Mechanism", ep: "staleness_mean", higherBetter: false,
    note: "how old the observation behind each executed action is: the price of acting while thinking" },
  seam_gap_mean: { label: "seam gap (px)", group: "Mechanism", ep: "seam_gap_mean", higherBetter: false,
    note: "jump between the old plan and the new chunk at each hand-over: the price of naive async" },
  jerk_mean: { label: "jerk (px/step²)", group: "Mechanism", ep: "jerk_mean", higherBetter: false,
    note: "second difference of the executed actions: overall smoothness" },
};
export function fmtMetric(k, v, signed = false) {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const m = METRICS[k];
  const s = signed && v > 0 ? "+" : "";
  if (m.pct) return `${s}${Math.round(v * 100)}${signed ? " pt" : "%"}`;
  return `${s}${Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)}`;
}

export const EP_ATTRS = {
  seam_gap_max: "max seam gap (px)",
  seam_gap_mean: "mean seam gap (px)",
  staleness_mean: "mean staleness (steps)",
  idle_frac: "idle share",
  jerk_mean: "mean jerk (px/step²)",
  coverage_final: "final coverage",
  path_len: "agent path length (px)",
  n_inferences: "# inferences",
};

const tip = () => document.getElementById("tooltip");
export function showTip(event, html) {
  const el = tip();
  el.innerHTML = html;
  el.hidden = false;
  const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + w > window.innerWidth - 4) x = event.clientX - w - pad;
  if (y + h > window.innerHeight - 4) y = event.clientY - h - pad;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
export function hideTip() { tip().hidden = true; }

export function size(el) {
  const r = el.getBoundingClientRect();
  return { w: Math.max(50, Math.floor(r.width)), h: Math.max(50, Math.floor(r.height)) };
}

export function segButtons(container, options, current, onPick) {
  const seg = container.append("span").attr("class", "seg");
  const btns = seg.selectAll("button").data(options).join("button")
    .text((d) => d.label).classed("on", (d) => d.value === current)
    .attr("title", (d) => d.title || null)
    .on("click", (ev, d) => onPick(d.value));
  return (value) => btns.classed("on", (d) => d.value === value);
}

// PushT T-block geometry (gym-pusht add_tee, scale 30, length 4), in body coordinates.
const TEE = [
  [[-60, 30], [60, 30], [60, 0], [-60, 0]],
  [[-15, 30], [-15, 120], [15, 120], [15, 30]],
];
export function teePaths(x, y, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return TEE.map((poly) => poly.map(([u, v]) => [x + c * u - s * v, y + s * u + c * v]));
}
export const GOAL = [256, 256, Math.PI / 4];
export const AGENT_R = 15;
