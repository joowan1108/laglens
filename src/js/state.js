// Single shared selection state. Views call update({...}); every view listens to "change"
// and re-renders only what depends on the changed keys.
export const DEFAULTS = {
  ref: "sync_d4_h4",       // reference schedule R (opens on: same 400 ms latency, wait vs. act-while-thinking)
  cand: "inpaint_d4_h4",   // candidate schedule C
  metric: "success_rate",  // the one question asked: y of A and the dumbbell attribute of B (util.METRICS)
  seed: null,              // selected initial state
  t: 0,                    // replay time step
  win: null,               // brushed time window [t0, t1] in the timeline
  brushed: null,           // Set of seeds selected in B (cross-filters A)
  hoverSeed: null,
  hoverChunk: null,        // {which: "ref"|"cand", id}
};

export const state = { ...DEFAULTS };
export const bus = d3.dispatch("change");

export function update(patch) {
  const keys = Object.keys(patch).filter((k) => state[k] !== patch[k]);
  if (!keys.length) return;
  Object.assign(state, patch);
  bus.call("change", null, new Set(keys));
}
