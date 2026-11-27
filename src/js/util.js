// Colour has exactly one meaning per hue across all views (checked for colour-vision deficiency,
// see docs/design_rationale.md):
//   identity of the compared pair: R = near-black, C = orange (C, D, B's R/C columns, rings in A)
//   strategy (nominal, only in A and the column headers of B): sync blue, naive vermillion, inpaint green
//   chunk-boundary discontinuity (C and D): magenta. Selection is drawn in ink; everything else is grey.
export const COLOR = {
  ref: "#222222", cand: "#E69F00", sel: "#1d1d1f", seam: "#c2185b",
  ok: "#8e8e98", okLight: "#c9c9d0", fail: "#efeff2",
  block: "#a9adb5", goal: "#6b6b72", ink: "#1d1d1f", muted: "#6b6b72",
};
export const STRAT_COLOR = { sync: "#0072B2", naive: "#D55E00", inpaint: "#009E73" };
// redundant shape encoding so that strategy identity never depends on hue alone
export const STRAT_SYMBOL = { sync: d3.symbolCircle, naive: d3.symbolSquare, inpaint: d3.symbolDiamond };

// The four questions LagLens asks, as one choice that drives both A and B. Each strategy pays for
// latency with a different cost, so every metric after "success" is named after who pays it.
// `ep` = episode attribute aggregated over seeds in A (`rate` → Wilson interval, else t-interval);
// `epB` = per-episode attribute shown as R → C dumbbells in B.
export const METRICS = {
  success_rate: { btn: "Success", sub: "outcome", label: "success rate", ep: "success", rate: true, pct: true,
    note: "share of the 30 episodes that end with more than 95 % of the T-block in the goal" },
  idle_frac_mean: { btn: "Idle", sub: "what sync pays", label: "idle share", ep: "idle_frac", pct: true,
    note: "share of steps in which the robot holds still while the policy thinks: the price sync pays" },
  think_motion_mean: { btn: "Outdated plan", sub: "what async pays", label: "robot motion while a plan is computed (px)", ep: "think_motion_mean",
    note: "how far the robot moved between the camera picture a plan was made from and the moment that plan was ready: the plan was made for a scene that has since changed (the price async pays; sync waits, so it moves less)" },
  jump_mean: { btn: "Jump", sub: "what naive async pays", label: "jump at a chunk switch (px, mean per switch)", ep: "jump_mean",
    note: "distance between the action the old chunk planned next and the first action of the new chunk, averaged over the chunk switches of an episode" },
};
// Task-specific wording and B's outcome attribute (PushT: coverage of the goal; Catch: distance to the ball).
export function applyTask(task) {
  const m = METRICS.success_rate;
  m.note = task === "catch"
    ? "share of the 30 episodes in which the pusher touches the rolling ball before the 8 s deadline"
    : "share of the 30 episodes that end with more than 95 % of the T-block in the goal";
}

export function fmtMetric(k, v, signed = false) {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const m = METRICS[k];
  const s = v > 0 ? (signed ? "+" : "") : v < 0 ? "−" : "", a = Math.abs(v);
  if (m.pct) { const k = Math.round(a * 100); return `${k ? s : ""}${k}${signed ? " pt" : "%"}`; }
  return `${s}${a >= 10 ? a.toFixed(0) : a.toFixed(1)}`;
}

// per-episode attributes on B's dumbbell axis (one per metric, see METRICS.epB)
export const EP_ATTRS = {
  coverage_final: "final coverage of the goal",
  dist_final: "final pusher–ball distance (px)",
  idle_frac: "idle share",
  think_motion_mean: "mean robot motion while thinking (px)",
  jump_max: "largest boundary discontinuity in the episode (px)",
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
