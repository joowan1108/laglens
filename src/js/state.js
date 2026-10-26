// Single shared selection state. Views call update({...}); every view listens to "change"
// and re-renders only what depends on the changed keys.
export const DEFAULTS = {
  ref: "sync_d0_h8",       // reference schedule R
  cand: "naive_d4_h8",     // candidate schedule C
  metric: "success_rate",  // colour metric of the schedule matrix
  mode: "abs",             // "abs" | "delta" (matrix colour relative to R)
  seed: null,              // selected initial state
  t: 0,                    // replay time step
  win: null,               // brushed time window [t0, t1] in the timeline
  brushed: null,           // Set of seeds brushed in the scatter
  hoverSeed: null,
  hoverChunk: null,        // {which: "ref"|"cand", id}
  sort: "robust",          // flip-matrix row order
  sx: "seam_gap_mean",     // scatter axes
  sy: "coverage_final",
};

export const state = { ...DEFAULTS };
export const bus = d3.dispatch("change");

export function update(patch) {
  const keys = Object.keys(patch).filter((k) => state[k] !== patch[k]);
  if (!keys.length) return;
  Object.assign(state, patch);
  bus.call("change", null, new Set(keys));
}
