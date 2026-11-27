// View C: paired seed table for the chosen pair. One row per initial state (seed):
//   left  — outcome of that start state under the baseline (black) and the candidate (orange):
//           filled = success, empty = failure; the wide cell is the run replayed in D, the narrow
//           cells are the same schedule simply run again (how repeatable the outcome is)
//   right — what the schedule paid in that episode, baseline (●) → candidate (●). Which cost is shown
//           follows the pair (sync pays by standing idle, async by jumps at chunk switches) and can
//           be switched; every cost is a share or a mean per event, so it does not grow just because
//           a failed episode runs longer, and its scale is the same for every pair of the task.
// Rows are grouped by how the outcome changes from baseline to candidate, so the start states that
// flip are listed first and the right part shows whether the flip comes with a change in cost.
import { state, update, bus } from "../state.js";
import { DATA, STRAT_LABEL, label, outcomes, reruns, rerunFlips } from "../data.js";
import { COLOR, showTip, hideTip, size } from "../util.js";

let root, svg, ctrSel, brush, brushKey = null;
const COSTS = {
  idle: { k: "idle_frac", btn: "Idle", pct: true, who: "what sync pays", name: "share of steps the robot stands idle",
    axis: "share of the episode the robot stands idle, waiting for a plan →" },
  stale: { k: "think_motion_mean", btn: "Outdated plan", who: "what async pays", name: "px the robot moved while a plan was computed (mean per plan)",
    axis: "how far the robot moved while a plan was computed (px, mean per plan, log scale) →" },
  jump: { k: "jump_mean", btn: "Jump", who: "what naive async pays", name: "jump at a chunk switch (px, mean per switch)",
    axis: "jump at a chunk switch (px, mean per switch, log scale) →" },
};
// the cost that separates the two schedules of the pair: sync with latency pays by waiting, the others by jumps
function autoCost() {
  const waits = (id) => { const q = DATA.schedById.get(id); return q.strategy === "sync" && q.latency > 0; };
  return waits(state.ref) || waits(state.cand) ? "idle" : "jump";
}
// with a cost chosen in the header, C shows that cost; with "Success", the cost that separates the pair
const BY_METRIC = { idle_frac_mean: "idle", think_motion_mean: "stale", jump_mean: "jump" };
const costKey = () => BY_METRIC[state.metric] || autoCost();
// one scale per cost and task (all 14 schedules), so a dumbbell means the same in every pair
let domCache = { task: null, d: {} };
function domain(k) {
  if (domCache.task !== DATA.task) domCache = { task: DATA.task, d: {} };
  if (!domCache.d[k]) {
    const ids = new Set(DATA.schedules.map((x) => x.schedule));
    domCache.d[k] = [0, d3.max(DATA.episodes, (r) => (ids.has(r.schedule) ? r[k] : 0))];
  }
  return domCache.d[k];
}
const BANDS = [
  { key: "loss", name: "baseline ✓ → candidate ✗", long: "the candidate fails where the baseline succeeded" },
  { key: "gain", name: "baseline ✗ → candidate ✓", long: "the candidate succeeds where the baseline failed" },
  { key: "bothOk", name: "both ✓", long: "both succeed" },
  { key: "bothFail", name: "both ✗", long: "both fail" },
];

// Called when the task changes (new data): forget the brush geometry.
export function rebuildColumns() { brushKey = null; }

export function initSeedTable() {
  ctrSel = d3.select("#seedControls");
  ctrSel.append("span").attr("class", "ctext");
  root = d3.select("#seedtable");
  svg = root.append("svg");
  rebuildColumns();
  render();
  bus.on("change.seedtable", (keys) => {
    if (["task", "ref", "cand", "seed", "brushed", "hoverSeed", "metric"].some((k) => keys.has(k))) render();
  });
}

const outcome = (sched, seed) => DATA.ep.get(sched)?.get(seed)?.success;
function band(seed) {
  const r = outcome(state.ref, seed), c = outcome(state.cand, seed);
  if (r && c) return "bothOk";
  if (!r && !c) return "bothFail";
  return c ? "gain" : "loss";
}

// rows grouped into bands by R→C change; inside a band, robust seeds (succeed under many schedules) first
function layout(top, height) {
  const seeds = [...DATA.seeds];
  const byRobust = (a, b) => DATA.robust.get(b) - DATA.robust.get(a) || a - b;
  const groups = BANDS.map((b) => ({ ...b, seeds: seeds.filter((s) => band(s) === b.key).sort(byRobust) })).filter((g) => g.seeds.length);
  const headH = 15;
  const rh = Math.max(3, Math.min(12, (height - headH * groups.length) / seeds.length));
  const rows = new Map();
  let yy = top;
  for (const g of groups) {
    g.y = yy; yy += headH;
    for (const s of g.seeds) { rows.set(s, { seed: s, y: yy, g: g.key }); yy += rh; }
    g.y1 = yy;
  }
  return { groups, rows, rh, headH, bottom: yy };
}

function render() {
  // how repeatable an outcome is: every schedule was run three times from each start state (run 0 is
  // the one compared and replayed). A start state is marked ≈ when the baseline or the candidate does
  // not give the same outcome in all of its runs: a flip there may be chance.
  const nRe = Math.min(reruns(state.ref).length, reruns(state.cand).length);
  const same = (id, s) => new Set(outcomes(id, s)).size <= 1;
  const noisy = new Set(nRe ? DATA.seeds.filter((s) => !same(state.ref, s) || !same(state.cand, s)) : []);
  const cnt = d3.rollup(DATA.seeds, (v) => v.length, band);
  const flipsN = DATA.seeds.filter((s) => band(s) === "gain" || band(s) === "loss");
  const solid = flipsN.filter((s) => !noisy.has(s)).length;
  const fr = rerunFlips(state.ref), fc = rerunFlips(state.cand), f1 = (v) => (Number.isInteger(v) ? v : v.toFixed(1));
  d3.select("#seedNote").html(`<b>${cnt.get("gain") || 0} rescued</b>, <b>${cnt.get("loss") || 0} lost</b> of ${DATA.seeds.length} start states
    ${nRe ? `· <b>${solid} of these ${flipsN.length} flips</b> come back in all ${nRe + 1} runs of both schedules; <b>≈</b> marks the others · <span style="white-space:nowrap">a plain re-run alone flips ${f1(fr)} (baseline) and ${f1(fc)} (candidate) start states</span>` : ""}`);
  const ck = costKey(), C = COSTS[ck], k = C.k;
  ctrSel.select(".ctext").html(`row = start state · <span class="sw okb"></span><span class="sw okc"></span> success under baseline / candidate, empty = failure${nRe ? " · narrow = run again" : ""} · right: what each run paid (<b>${C.btn.toLowerCase()}</b>)`);
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const top = 52, bottom = 30, left = 34;
  const L = layout(top, h - top - bottom);
  const { rows, rh } = L;
  const order = [...rows.values()];
  const dim = (seed) => (state.brushed && !state.brushed.has(seed) ? 0.2 : 1);

  // ---- outcome cells: baseline | candidate ----------------------------------------------------
  // per schedule: one wide cell (run 0, the run replayed in D) and one narrow cell per re-run
  const mw = nRe ? 13 : 22, rw = 5, cw = mw + nRe * (rw + 1), gap = 5;
  const cols = [{ id: state.ref, col: COLOR.ref, t: "baseline", txt: COLOR.ref }, { id: state.cand, col: COLOR.cand, t: "candidate", txt: "#9a6a00" }];
  const xpos = (i) => left + i * (cw + gap);
  const matR = xpos(2) - gap + 4;
  svg.selectAll("text.colmark").data(cols, (d, i) => i).join("text").attr("class", "colmark").attr("font-weight", 800).attr("font-size", 9.5)
    .attr("transform", (d, i) => `translate(${xpos(i) + mw / 2 + 3},${top - 4}) rotate(-90)`).attr("fill", (d) => d.txt).text((d) => d.t);
  svg.selectAll("text.remark").data(nRe ? cols : [], (d, i) => i).join("text").attr("class", "remark axis-title").attr("font-size", 8)
    .attr("transform", (d, i) => `translate(${xpos(i) + mw + 1 + (nRe * (rw + 1)) / 2 + 3},${top - 4}) rotate(-90)`).text("again");
  const cellData = [], reData = [];
  for (const r of order) cols.forEach((c, i) => {
    cellData.push({ seed: r.seed, c, i });
    reruns(c.id).slice(0, nRe).forEach((rid, q) => reData.push({ seed: r.seed, c, i, rid, q }));
  });
  const tipCell = (ev, d) => {
    const e = DATA.ep.get(d.c.id).get(d.seed), o = outcomes(d.c.id, d.seed);
    showTip(ev, `<b>start state ${d.seed}</b> · ${d.c.t}: ${label(d.c.id)}<br>${e.success ? "✓ success" : "✗ failure"} · ${DATA.task === "catch" ? `final distance ${Math.round(e.dist_final)} px` : `coverage ${Math.round(e.coverage_final * 100)}%`}
      ${o.length > 1 ? `<br>this schedule succeeds from this start state in <b>${d3.sum(o)} of ${o.length} runs</b>${new Set(o).size > 1 ? " (≈ not repeatable)" : ""}` : ""}
      <br><span class="k">this start state succeeds in ${Math.round(DATA.robust.get(d.seed) * 100)} % of all schedules</span><br><span class="k">click = replay this start state in D and E (the wide cell's run)</span>`);
    if (state.hoverSeed !== d.seed) update({ hoverSeed: d.seed });
  };
  svg.selectAll("rect.c").data(cellData, (d) => `${d.seed}|${d.i}`).join("rect").attr("class", "c")
    .attr("x", (d) => xpos(d.i)).attr("width", mw).attr("height", Math.max(1, rh - 1))
    .attr("fill", (d) => (outcome(d.c.id, d.seed) ? d.c.col : COLOR.fail)).attr("stroke", (d) => (outcome(d.c.id, d.seed) ? "none" : "#d9d9de")).attr("stroke-width", 0.6)
    .attr("opacity", (d) => dim(d.seed)).style("cursor", "pointer")
    .on("mousemove", tipCell)
    .on("mouseleave", () => { hideTip(); update({ hoverSeed: null }); })
    .on("click", (ev, d) => update({ seed: d.seed, win: null }))
    .transition().duration(300).attr("y", (d) => rows.get(d.seed).y);
  svg.selectAll("rect.cr").data(reData, (d) => `${d.seed}|${d.i}|${d.q}`).join("rect").attr("class", "cr")
    .attr("x", (d) => xpos(d.i) + mw + 1 + d.q * (rw + 1)).attr("width", rw).attr("height", Math.max(1, rh - 1))
    .attr("fill", (d) => (outcome(d.rid, d.seed) ? d.c.col : COLOR.fail)).attr("stroke", (d) => (outcome(d.rid, d.seed) ? "none" : "#d9d9de")).attr("stroke-width", 0.6)
    .attr("fill-opacity", 0.75).attr("opacity", (d) => dim(d.seed)).style("cursor", "pointer")
    .on("mousemove", tipCell)
    .on("mouseleave", () => { hideTip(); update({ hoverSeed: null }); })
    .on("click", (ev, d) => update({ seed: d.seed, win: null }))
    .transition().duration(300).attr("y", (d) => rows.get(d.seed).y);

  // row labels
  svg.selectAll("text.rl").data(order, (d) => d.seed).join("text").attr("class", "rl axis-title")
    .attr("font-size", Math.min(9.5, rh)).attr("x", left - 4).attr("text-anchor", "end").attr("dy", "0.8em")
    .attr("font-weight", (d) => (d.seed === state.seed ? 800 : 400)).attr("fill", (d) => (d.seed === state.seed ? COLOR.sel : null))
    .text((d) => (rh >= 9.5 || d.seed === state.seed ? d.seed : "")).style("cursor", "pointer")
    .on("click", (ev, d) => update({ seed: d.seed, win: null }))
    .transition().duration(300).attr("y", (d) => d.y);
  const matW = matR - left;
  svg.selectAll("text.nz").data(order.filter((r) => noisy.has(r.seed)), (d) => d.seed).join("text").attr("class", "nz")
    .attr("x", matR + 3).attr("dy", "0.8em").attr("font-size", Math.min(11, rh + 2)).attr("font-weight", 700).attr("fill", COLOR.muted)
    .attr("pointer-events", "none").text("≈").transition().duration(300).attr("y", (d) => d.y - 1);

  // ---- paired shift (dumbbells) ---------------------------------------------------------------
  const dl = matR + 26, dr = w - 10;
  const [, hi] = domain(k);
  const x = C.pct
    ? d3.scaleLinear().domain([0, Math.max(0.1, Math.ceil(hi * 10) / 10)]).range([dl, dr])
    : d3.scaleSymlog().constant(1).domain([0, hi * 1.05]).range([dl, dr]);
  const [d0, d1] = x.domain();
  const ticks = C.pct ? x.ticks(5) : [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter((t) => t >= d0 && t <= d1);
  svg.selectAll("g.dgrid").data([0]).join("g").attr("class", "gridline dgrid").attr("transform", `translate(0,${L.bottom})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickSize(-(L.bottom - top)).tickFormat("")).call((g) => g.select(".domain").remove()).lower();
  svg.selectAll("g.dax").data([0]).join("g").attr("class", "axis dax").attr("transform", `translate(0,${L.bottom})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickSize(3).tickFormat(C.pct ? d3.format(".0%") : d3.format("~s"))).call((g) => g.select(".domain").attr("stroke", "#c9c9cf"));
  svg.selectAll("text.dxt").data([0]).join("text").attr("class", "axis-title dxt").attr("x", dr).attr("y", L.bottom + 26).attr("text-anchor", "end")
    .text(C.axis);
  svg.selectAll("text.dht").data([0]).join("text").attr("class", "dht").attr("x", dl).attr("y", top - 18).attr("font-size", 10.5).attr("font-weight", 700)
    .html(`<tspan fill="${COLOR.ref}">●</tspan> baseline → <tspan fill="${COLOR.cand}">●</tspan> candidate`);
  svg.selectAll("text.dht2").data([0]).join("text").attr("class", "dht2 axis-title").attr("x", dl).attr("y", top - 6).attr("font-size", 9)
    .text(`${C.name}, in the same start state${BY_METRIC[state.metric] ? "" : ` · shown because it is ${C.who === "what sync pays" ? "what a waiting schedule pays" : "what separates these two schedules"}`}`);

  // brush over the dumbbell rows = select seeds (cross-filters A, dims rows)
  const bkey = `${w}x${h}|${state.ref}|${state.cand}|${nRe}`;
  const bg = svg.selectAll("g.brush").data([0]).join("g").attr("class", "brush");
  if (bkey !== brushKey) {
    brushKey = bkey;
    brush = d3.brushY().extent([[dl - 8, top], [dr, L.bottom]]).on("end", (ev) => {
      if (!ev.sourceEvent) return;
      if (!ev.selection) { update({ brushed: null }); return; }
      const [y0, y1] = ev.selection;
      const set = new Set(order.filter((r) => r.y + rh / 2 >= y0 && r.y + rh / 2 <= y1).map((r) => r.seed));
      update({ brushed: set.size ? set : null });
    });
    bg.call(brush);
    if (state.brushed) bg.call(brush.move, null);
  }
  if (!state.brushed && d3.brushSelection(bg.node())) bg.call(brush.move, null);

  // band headers: label, count, median R and C value as ticks; click = select band
  const bands = L.groups;
  const med = (g, which) => d3.median(g.seeds, (s) => DATA.ep.get(which).get(s)[k]);
  const bh = svg.selectAll("g.band").data(bands, (g) => g.key).join((en) => {
    const q = en.append("g").attr("class", "band").style("cursor", "pointer");
    // the text is drawn over the median ticks with a halo, so a tick never strikes through it
    q.append("rect").attr("class", "bb"); q.append("line").attr("class", "mr"); q.append("line").attr("class", "mc");
    q.append("text").attr("class", "bt");
    return q;
  }).attr("transform", (g) => `translate(0,${g.y})`).raise();
  bh.select(".bb").attr("x", 2).attr("y", 1).attr("width", w - 4).attr("height", L.headH - 2).attr("rx", 3).attr("fill", "#f2f2f5");
  bh.select(".bt").attr("x", 6).attr("y", L.headH - 4).attr("font-size", 10).attr("font-weight", 700)
    .attr("stroke", "#f2f2f5").attr("stroke-width", 4).attr("paint-order", "stroke").attr("stroke-linejoin", "round")
    .text((g) => { const z = g.seeds.filter((x) => noisy.has(x)).length; return `${g.name}  ${g.seeds.length}${z && (g.key === "gain" || g.key === "loss") ? `  (≈ ${z} not repeatable)` : ""}`; });
  for (const [cls, which, col] of [["mr", state.ref, COLOR.ref], ["mc", state.cand, COLOR.cand]]) {
    bh.select(`.${cls}`).attr("x1", (g) => x(med(g, which))).attr("x2", (g) => x(med(g, which))).attr("y1", 2).attr("y2", L.headH - 1)
      .attr("stroke", col).attr("stroke-width", 2.5);
  }
  bh.on("click", (ev, g) => update({ brushed: new Set(g.seeds) }))
    .on("mousemove", (ev, g) => showTip(ev, `<b>${g.long}</b>: ${g.seeds.length} seeds<br><span class="k">median ${C.name}:</span> baseline ${fmt(med(g, state.ref), k)} → candidate ${fmt(med(g, state.cand), k)} (ticks)<br><span class="k">click = select these seeds (A recomputes on them)</span>`))
    .on("mouseleave", hideTip);

  const focus = (s) => s === state.seed || s === state.hoverSeed;
  const db = svg.selectAll("g.db").data(order, (r) => r.seed).join((en) => {
    const q = en.append("g").attr("class", "db").style("cursor", "pointer");
    q.append("rect").attr("class", "hit"); q.append("line").attr("class", "bar");
    q.append("circle").attr("class", "pr"); q.append("circle").attr("class", "pc");
    return q;
  }).attr("opacity", (r) => dim(r.seed)).raise();
  db.transition().duration(300).attr("transform", (r) => `translate(0,${r.y + rh / 2})`);
  const rad = Math.max(1.8, Math.min(3.4, rh * 0.34));
  const val = (r, which) => DATA.ep.get(which).get(r.seed)[k];
  db.select(".hit").attr("pointer-events", "none").attr("x", dl - 8).attr("y", -rh / 2).attr("width", dr - dl + 8).attr("height", rh)
    .attr("fill", (r) => (focus(r.seed) ? "#e6e6eb" : "transparent"));
  db.select(".bar").attr("x1", (r) => x(val(r, state.ref))).attr("x2", (r) => x(val(r, state.cand)))
    .attr("stroke", (r) => (focus(r.seed) ? COLOR.sel : "#b4b4bc")).attr("stroke-width", (r) => (focus(r.seed) ? 2 : 1.2));
  db.select(".pr").attr("cx", (r) => x(val(r, state.ref))).attr("r", rad).attr("fill", COLOR.ref);
  db.select(".pc").attr("cx", (r) => x(val(r, state.cand))).attr("r", rad).attr("fill", COLOR.cand).attr("stroke", "#fff").attr("stroke-width", 0.5);
  db.on("mousemove", (ev, r) => {
    const a = DATA.ep.get(state.ref).get(r.seed), c = DATA.ep.get(state.cand).get(r.seed);
    showTip(ev, `<b>seed ${r.seed}</b> · ${BANDS.find((b) => b.key === band(r.seed)).long}<br>
      <span class="k">baseline</span> ${fmt(a[k], k)} ${a.success ? "✓" : "✗"} → <span class="k">candidate</span> ${fmt(c[k], k)} ${c.success ? "✓" : "✗"}
      <span class="k">(${C.name})</span><br><span class="k">click = open episode · drag vertically = select seeds</span>`);
    if (state.hoverSeed !== r.seed) update({ hoverSeed: r.seed });
  }).on("mouseleave", () => { hideTip(); update({ hoverSeed: null }); })
    .on("click", (ev, r) => update({ seed: r.seed, win: null }));

  // selected / hovered row outline across the matrix
  const hl = [state.seed, state.hoverSeed].filter((s) => s !== null && rows.has(s));
  svg.selectAll("rect.rowsel").data(hl).join("rect").attr("class", "rowsel").attr("pointer-events", "none")
    .attr("x", left - 1.5).attr("width", matW + 3).attr("height", rh + 1).attr("fill", "none")
    .attr("stroke", (d) => (d === state.seed ? COLOR.sel : "#555")).attr("stroke-width", (d) => (d === state.seed ? 1.8 : 1))
    .attr("stroke-dasharray", (d) => (d === state.seed ? null : "3 2")).attr("y", (d) => rows.get(d).y - 1).raise();

}

function fmt(v, k) {
  if (v === null || v === undefined) return "–";
  if (k === "idle_frac") return `${Math.round(v * 100)}%`;
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}

export function resizeSeedTable() { render(); }
