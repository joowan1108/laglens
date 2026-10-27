// Single shared selection state. Views call update({...}); every view listens to "change"
// and re-renders only what depends on the changed keys.
export const DEFAULTS = {
  ref: "sync_d4_h4",       // reference schedule R (opens on: same 400 ms latency, wait vs. act-while-thinking)
  cand: "inpaint_d4_h4",   // candidate schedule C
  metric: "success_rate",  // y metric of the latency-response curves (A)
  mode: "abs",             // "abs" | "delta" (paired difference to R)
  seed: null,              // selected initial state
  t: 0,                    // replay time step
  win: null,               // brushed time window [t0, t1] in the timeline
  brushed: null,           // Set of seeds selected in B (cross-filters A)
  hoverSeed: null,
  hoverChunk: null,        // {which: "ref"|"cand", id}
  sort: "flip",            // seed-table row order: "flip" (grouped by R→C change) | "robust" | "seed"
  sx: "seam_gap_max",      // attribute of the paired R→C shift in the seed table (B)
};

export const state = { ...DEFAULTS };
export const bus = d3.dispatch("change");

export function update(patch) {
  const keys = Object.keys(patch).filter((k) => state[k] !== patch[k]);
  if (!keys.length) return;
  Object.assign(state, patch);
  bus.call("change", null, new Set(keys));
}
