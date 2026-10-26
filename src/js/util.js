export const COLOR = {
  ref: "#222222", cand: "#E69F00", gain: "#0072B2", loss: "#D55E00", goal: "#009E73",
  bothOk: "#ececef", bothFail: "#9a9aa2", sel: "#c2185b", block: "#a9adb5",
};

export const METRICS = {
  success_rate: { label: "success rate", fmt: (v) => `${Math.round(v * 100)}%`, higherBetter: true, ep: "success" },
  coverage_mean: { label: "final coverage", fmt: (v) => `${Math.round(v * 100)}%`, higherBetter: true, ep: "coverage_final" },
  seam_gap_mean: { label: "seam gap (px)", fmt: (v) => v.toFixed(1), higherBetter: false, ep: "seam_gap_mean" },
  staleness_mean: { label: "staleness (steps)", fmt: (v) => v.toFixed(2), higherBetter: false, ep: "staleness_mean" },
  idle_frac_mean: { label: "idle share", fmt: (v) => `${Math.round(v * 100)}%`, higherBetter: false, ep: "idle_frac" },
  jerk_mean: { label: "jerk (px/step²)", fmt: (v) => v.toFixed(1), higherBetter: false, ep: "jerk_mean" },
};

export const EP_ATTRS = {
  staleness_mean: "mean staleness (steps)",
  seam_gap_mean: "mean seam gap (px)",
  seam_gap_max: "max seam gap (px)",
  jerk_mean: "mean jerk (px/step²)",
  idle_frac: "idle share",
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
