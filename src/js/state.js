// Single shared selection state. Views call update({...}); every view listens to "change"
// and re-renders only what depends on the changed keys.
export const DEFAULTS = {
  task: "pusht",           // which task's data: "pusht" | "catch" (data.TASKS)
  ref: "sync_d4_h4",       // reference schedule R (opens on: same 400 ms latency, wait vs. act-while-thinking)
  cand: "inpaint_d4_h4",   // candidate schedule C
  dfocus: 4,               // "my latency" in A: null = all, or 2 / 4 (plus sync d0 as the no-latency reference); opens at 4 like the default pair
  metric: "success_rate",  // what A, B and C show: success, or a cost (util.METRICS: idle_frac_mean, think_motion_mean, jump_mean)
  seed: null,              // selected initial state
  t: 0,                    // replay time step
  win: null,               // brushed time window [t0, t1] in the timeline
  brushed: null,           // Set of seeds selected in B (cross-filters A and B)
  hoverSeed: null,
  hoverChunk: null,        // {which: "ref"|"cand", id}
  blocked: null,           // note shown in A when a choice was refused because the pair would not be comparable
};

export const state = { ...DEFAULTS };
export const bus = d3.dispatch("change");

// guards rewrite a patch before it is applied (e.g. keep baseline and candidate comparable)
export const guards = [];

export function update(patch) {
  for (const g of guards) patch = g(patch, state);
  const keys = Object.keys(patch).filter((k) => state[k] !== patch[k]);
  if (!keys.length) return;
  Object.assign(state, patch);
  bus.call("change", null, new Set(keys));
}
