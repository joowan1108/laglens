// View B: paired seed table for the chosen pair. One row per initial state (seed):
//   left  — outcome of that start state under the baseline (black) and the candidate (orange):
//           filled = success, empty = failure
//   right — the largest jump at a chunk switch in that episode, baseline (●) → candidate (●)
// Rows are grouped by how the outcome changes from baseline to candidate, so the start states that
// flip are listed first and the right part shows whether the flip comes with a change in jumps.
import { state, update, bus } from "../state.js";
import { DATA, STRAT_LABEL, label } from "../data.js";
import { COLOR, EP_ATTRS, showTip, hideTip, size } from "../util.js";

let root, svg, ctrSel, brush, brushKey = null;
const K = "jump_max";  // dumbbell attribute: largest jump at a chunk switch in the episode
const BANDS = [
  { key: "loss", name: "baseline ✓ → candidate ✗", long: "the candidate fails where the baseline succeeded" },
  { key: "gain", name: "baseline ✗ → candidate ✓", long: "the candidate succeeds where the baseline failed" },
  { key: "bothOk", name: "both ✓", long: "both succeed" },
  { key: "bothFail", name: "both ✗", long: "both fail" },
];
// jumps are long-tailed: symmetric-log axis so that the bulk is not squeezed
const SYMLOG = new Set([K]);
const PCT = new Set();

// Called when the task changes (new data): forget the brush geometry.
export function rebuildColumns() { brushKey = null; }

export function initSeedTable() {
  ctrSel = d3.select("#seedControls");
  root = d3.select("#seedtable");
  svg = root.append("svg");
  rebuildColumns();
  render();
  bus.on("change.seedtable", (keys) => {
    if (["task", "ref", "cand", "seed", "brushed", "hoverSeed"].some((k) => keys.has(k))) render();
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
  // chance level: how many seeds flip when the same schedule is simply re-run with new noise
  const rep = DATA.schedules.find((x) => x.replicate);
  const base = rep && DATA.schedById.get(rep.schedule.replace(/_r\d+$/, ""));
  // start states whose outcome flips on a plain re-run of the same schedule: their flips are the least trustworthy
  const noisy = new Set(rep && base ? DATA.seeds.filter((s) => outcome(rep.schedule, s) !== outcome(base.schedule, s)) : []);
  const nFlip = rep && base ? noisy.size : null;
  const cnt = d3.rollup(DATA.seeds, (v) => v.length, band);
  d3.select("#seedNote").html(`<b>${cnt.get("gain") || 0} rescued</b>, <b>${cnt.get("loss") || 0} lost</b> of ${DATA.seeds.length} start states
    ${nFlip !== null ? `· by chance alone (same schedule re-run) ${nFlip} flip; <b>≈</b> marks those start states` : ""}`);
  ctrSel.html(`<span>one row per start state · <span class="sw okb"></span><span class="sw okc"></span> success under baseline / candidate, empty = failure · right: largest jump at a chunk switch</span>`);
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const top = 52, bottom = 30, left = 34;
  const L = layout(top, h - top - bottom);
  const { rows, rh } = L;
  const order = [...rows.values()];
  const dim = (seed) => (state.brushed && !state.brushed.has(seed) ? 0.2 : 1);

  // ---- outcome cells: baseline | candidate ----------------------------------------------------
  const cw = 22, gap = 4;
  const cols = [{ id: state.ref, col: COLOR.ref, t: "baseline", txt: COLOR.ref }, { id: state.cand, col: COLOR.cand, t: "candidate", txt: "#9a6a00" }];
  const xpos = (i) => left + i * (cw + gap);
  const matR = xpos(2);
  svg.selectAll("text.colmark").data(cols, (d, i) => i).join("text").attr("class", "colmark").attr("font-weight", 800).attr("font-size", 9.5)
    .attr("transform", (d, i) => `translate(${xpos(i) + cw / 2 + 3},${top - 4}) rotate(-90)`).attr("fill", (d) => d.txt).text((d) => d.t);
  const cellData = [];
  for (const r of order) cols.forEach((c, i) => cellData.push({ seed: r.seed, c, i }));
  svg.selectAll("rect.c").data(cellData, (d) => `${d.seed}|${d.i}`).join("rect").attr("class", "c")
    .attr("x", (d) => xpos(d.i)).attr("width", cw).attr("height", Math.max(1, rh - 1))
    .attr("fill", (d) => (outcome(d.c.id, d.seed) ? d.c.col : COLOR.fail)).attr("opacity", (d) => dim(d.seed)).style("cursor", "pointer")
    .on("mousemove", (ev, d) => {
      const e = DATA.ep.get(d.c.id).get(d.seed);
      showTip(ev, `<b>start state ${d.seed}</b> · ${d.c.t}: ${label(d.c.id)}<br>${e.success ? "✓ success" : "✗ failure"} · ${DATA.task === "catch" ? `final distance ${Math.round(e.dist_final)} px` : `coverage ${Math.round(e.coverage_final * 100)}%`}<br><span class="k">this start state succeeds in ${Math.round(DATA.robust.get(d.seed) * 100)} % of all schedules</span>${noisy.has(d.seed) ? `<br><b>≈ noisy</b>: flips when the same schedule is simply re-run` : ""}<br><span class="k">click = replay this start state in D and E</span>`);
      if (state.hoverSeed !== d.seed) update({ hoverSeed: d.seed });
    })
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
  const k = K;
  const dl = matR + 26, dr = w - 10;
  const vals = order.flatMap((r) => [DATA.ep.get(state.ref).get(r.seed)[k], DATA.ep.get(state.cand).get(r.seed)[k]]);
  const [lo, hi] = d3.extent(vals);
  const x = SYMLOG.has(k)
    ? d3.scaleSymlog().constant(1).domain([Math.max(0, lo * 0.8), hi * 1.05]).range([dl, dr])
    : d3.scaleLinear().domain([Math.min(0, lo), hi]).nice().range([dl, dr]);
  const [d0, d1] = x.domain();
  const ticks = SYMLOG.has(k) ? [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].filter((t) => t >= d0 && t <= d1) : x.ticks(4);
  svg.selectAll("g.dgrid").data([0]).join("g").attr("class", "gridline dgrid").attr("transform", `translate(0,${L.bottom})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickSize(-(L.bottom - top)).tickFormat("")).call((g) => g.select(".domain").remove()).lower();
  svg.selectAll("g.dax").data([0]).join("g").attr("class", "axis dax").attr("transform", `translate(0,${L.bottom})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickSize(3).tickFormat(PCT.has(k) ? d3.format(".0%") : d3.format("~s"))).call((g) => g.select(".domain").attr("stroke", "#c9c9cf"));
  svg.selectAll("text.dxt").data([0]).join("text").attr("class", "axis-title dxt").attr("x", dr).attr("y", L.bottom + 26).attr("text-anchor", "end")
    .text("largest jump at a chunk switch (px, log scale) →");
  svg.selectAll("text.dht").data([0]).join("text").attr("class", "dht").attr("x", dl).attr("y", top - 18).attr("font-size", 10.5).attr("font-weight", 700)
    .html(`<tspan fill="${COLOR.ref}">●</tspan> baseline → <tspan fill="${COLOR.cand}">●</tspan> candidate`);
  svg.selectAll("text.dht2").data([0]).join("text").attr("class", "dht2 axis-title").attr("x", dl).attr("y", top - 6).attr("font-size", 9)
    .text("largest jump at a chunk switch in the same start state");

  // brush over the dumbbell rows = select seeds (cross-filters A, dims rows)
  const bkey = `${w}x${h}|${state.ref}|${state.cand}`;
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
    q.append("rect").attr("class", "bb"); q.append("text").attr("class", "bt");
    q.append("line").attr("class", "mr"); q.append("line").attr("class", "mc");
    return q;
  }).attr("transform", (g) => `translate(0,${g.y})`).raise();
  bh.select(".bb").attr("x", 2).attr("y", 1).attr("width", w - 4).attr("height", L.headH - 2).attr("rx", 3).attr("fill", "#f2f2f5");
  bh.select(".bt").attr("x", 6).attr("y", L.headH - 4).attr("font-size", 10).attr("font-weight", 700)
    .text((g) => { const z = g.seeds.filter((x) => noisy.has(x)).length; return `${g.name}  ${g.seeds.length}${z && (g.key === "gain" || g.key === "loss") ? `  (≈ ${z} noisy)` : ""}`; });
  for (const [cls, which, col] of [["mr", state.ref, COLOR.ref], ["mc", state.cand, COLOR.cand]]) {
    bh.select(`.${cls}`).attr("x1", (g) => x(med(g, which))).attr("x2", (g) => x(med(g, which))).attr("y1", 2).attr("y2", L.headH - 1)
      .attr("stroke", col).attr("stroke-width", 2.5);
  }
  bh.on("click", (ev, g) => update({ brushed: new Set(g.seeds) }))
    .on("mousemove", (ev, g) => showTip(ev, `<b>${g.long}</b>: ${g.seeds.length} seeds<br><span class="k">median ${EP_ATTRS[k]}:</span> baseline ${fmt(med(g, state.ref), k)} → candidate ${fmt(med(g, state.cand), k)} (ticks)<br><span class="k">click = select these seeds (A recomputes on them)</span>`))
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
      <span class="k">(${EP_ATTRS[k]})</span><br><span class="k">click = open episode · drag vertically = select seeds</span>`);
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
  if (PCT.has(k)) return `${Math.round(v * 100)}%`;
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}

export function resizeSeedTable() { render(); }
