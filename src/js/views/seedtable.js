// View B: paired seed table. One row per initial state (seed), shared by two juxtaposed parts:
//   left  — outcome matrix: columns = schedules grouped by strategy, filled cell = success
//           (R's column black, C's column orange, others grey; empty = failure)
//   right — paired shift: R value (●) → C value (●) of the episode attribute that belongs to the
//           question chosen in A (METRICS.epB), on a common axis.
// Rows are grouped by how the outcome changes from R to C, so a flip is a cell that breaks the
// pattern of its band and the right part shows whether that change comes with a mechanism change.
import { state, update, bus } from "../state.js";
import { DATA, STRATEGIES, STRAT_LABEL, HORIZONS, LATENCIES, label } from "../data.js";
import { COLOR, STRAT_COLOR, METRICS, EP_ATTRS, showTip, hideTip, size } from "../util.js";

let root, svg, ctrSel, cols, groupsPresent, brush, brushKey = null;
const GROUP_LABEL = { replicate: "Re-run", ...STRAT_LABEL };
const BANDS = [
  { key: "loss", name: "baseline ✓ → candidate ✗", long: "the candidate fails where the baseline succeeded" },
  { key: "gain", name: "baseline ✗ → candidate ✓", long: "the candidate succeeds where the baseline failed" },
  { key: "bothOk", name: "both ✓", long: "both succeed" },
  { key: "bothFail", name: "both ✗", long: "both fail" },
];
// long-tailed attributes on a symmetric-log axis so that the bulk is not squeezed
const SYMLOG = new Set(["jump_max"]);
const PCT = new Set(["coverage_final", "idle_frac"]);

// One column per schedule present in the loaded task (re-run first).
export function rebuildColumns() {
  cols = [];
  for (const sc of DATA.schedules.filter((x) => x.replicate)) cols.push({ id: sc.schedule, s: "replicate", h: sc.horizon, d: sc.latency });
  for (const s of STRATEGIES) for (const h of HORIZONS) for (const d of LATENCIES) {
    const id = `${s}_d${d}_h${h}`;
    if (DATA.schedById.has(id)) cols.push({ id, s, h, d });
  }
  groupsPresent = ["replicate", ...STRATEGIES].filter((g) => cols.some((c) => c.s === g));
  brushKey = null;
}

export function initSeedTable() {
  ctrSel = d3.select("#seedControls");
  root = d3.select("#seedtable");
  svg = root.append("svg");
  rebuildColumns();
  render();
  bus.on("change.seedtable", (keys) => {
    if (["task", "ref", "cand", "metric", "seed", "brushed", "hoverSeed"].some((k) => keys.has(k))) render();
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
  // chance level: how many seeds flip when the same schedule is simply re-run
  const rep = cols.find((c) => c.s === "replicate");
  const base = rep && DATA.schedById.get(rep.id.replace(/_r\d+$/, ""));
  const nFlip = rep && base ? DATA.seeds.filter((s) => outcome(rep.id, s) !== outcome(base.schedule, s)).length : null;
  const cnt = d3.rollup(DATA.seeds, (v) => v.length, band);
  d3.select("#seedNote").html(`Candidate vs baseline: <b>${cnt.get("loss") || 0} lost</b>, <b>${cnt.get("gain") || 0} gained</b> of ${DATA.seeds.length} seeds.
    ${nFlip !== null ? `Chance level: re-running ${STRAT_LABEL[base.strategy]} d${base.latency} h${base.horizon} with new noise flips <b>${nFlip}</b> (column “re-run”).` : ""}`);
  // key: every encoding of B is named here, not only in the guide
  ctrSel.html(`<span>one row per initial state (seed) · <b>left</b>: one column per schedule, <span class="sw ok"></span> success ✓ <span class="sw fail"></span> failure ✗ (baseline column black, candidate orange)
    · <b>right</b>: ${EP_ATTRS[METRICS[state.metric].epB]} under baseline and candidate (set by the question in A)</span>`);
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const top = 34, bottom = 30, left = 32;
  const L = layout(top, h - top - bottom);
  const { rows, rh } = L;
  const order = [...rows.values()];

  // ---- outcome matrix -------------------------------------------------------------------------
  const groupGap = 5;
  const matW = Math.min(w * 0.6, Math.max(240, cols.length * 8 + groupGap * 3));
  const cw = (matW - groupGap * (groupsPresent.length - 1)) / cols.length;
  const xpos = new Map(cols.map((c, i) => [c.id, left + i * cw + groupsPresent.indexOf(c.s) * groupGap]));
  const matR = left + matW;
  const dim = (seed) => (state.brushed && !state.brushed.has(seed) ? 0.2 : 1);

  // strategy headers: name in ink + a short coloured rule (hue = strategy, as in A)
  const groups = groupsPresent.map((s) => {
    const cs = cols.filter((c) => c.s === s);
    return { s, x0: xpos.get(cs[0].id), x1: xpos.get(cs[cs.length - 1].id) + cw, cs };
  });
  const gh = svg.selectAll("g.gh").data(groups, (d) => d.s).join((en) => {
    const q = en.append("g").attr("class", "gh"); q.append("rect"); q.append("text"); return q;
  });
  gh.select("rect").attr("x", (d) => d.x0).attr("y", top - 31).attr("width", (d) => d.x1 - d.x0 - 0.5).attr("height", 3).attr("rx", 1.5)
    .attr("fill", (d) => (d.s === "replicate" ? "#b9b9c0" : STRAT_COLOR[d.s]));
  gh.select("text").attr("x", (d) => (d.s === "replicate" ? d.x0 : (d.x0 + d.x1) / 2)).attr("y", top - 18)
    .attr("text-anchor", (d) => (d.s === "replicate" ? "start" : "middle")).attr("font-size", 10.5).attr("font-weight", 700)
    .text((d) => (d.s === "replicate" ? "" : GROUP_LABEL[d.s]));
  svg.selectAll("text.rr").data(groups.filter((d) => d.s === "replicate")).join("text").attr("class", "rr axis-title").attr("font-size", 9)
    .attr("x", (d) => d.x1).attr("y", top - 5).attr("text-anchor", "end").text("re-run");
  const hsub = groups.filter((gr) => gr.s !== "replicate").flatMap((gr) => HORIZONS.map((hz) => {
    const cs = gr.cs.filter((c) => c.h === hz);
    return cs.length ? { key: `${gr.s}${hz}`, h: hz, x0: xpos.get(cs[0].id), x1: xpos.get(cs[cs.length - 1].id) + cw } : null;
  }).filter(Boolean));
  svg.selectAll("text.hs").data(hsub, (d) => d.key).join("text").attr("class", "hs axis-title").attr("font-size", 9)
    .attr("x", (d) => (d.x0 + d.x1) / 2).attr("y", top - 5).attr("text-anchor", "middle").text((d) => (d.x1 - d.x0 > 13 ? `h${d.h}` : ""));

  // column hit areas in the header: click = C, shift-click = R
  svg.selectAll("rect.colhit").data(cols, (d) => d.id).join("rect").attr("class", "colhit")
    .attr("x", (d) => xpos.get(d.id)).attr("y", top - 14).attr("width", cw).attr("height", 13).attr("fill", "transparent").style("cursor", "pointer")
    .on("click", (ev, d) => (ev.shiftKey ? update({ ref: d.id }) : update({ cand: d.id })))
    .on("mousemove", (ev, d) => {
      const k = d3.sum(DATA.seeds, (s) => outcome(d.id, s));
      showTip(ev, `<b>${label(d.id)}</b><br>${k}/${DATA.seeds.length} seeds succeed<br><span class="k">click = candidate · shift-click = baseline</span>`);
    })
    .on("mouseleave", hideTip);

  const cellData = [];
  for (const r of order) for (const c of cols) cellData.push({ seed: r.seed, c });
  const fillOf = (d) => {
    if (!outcome(d.c.id, d.seed)) return COLOR.fail;
    return d.c.id === state.ref ? COLOR.ref : d.c.id === state.cand ? COLOR.cand : COLOR.ok;
  };
  svg.selectAll("rect.c").data(cellData, (d) => `${d.seed}|${d.c.id}`).join("rect").attr("class", "c")
    .attr("x", (d) => xpos.get(d.c.id)).attr("width", Math.max(1, cw - 1)).attr("height", Math.max(1, rh - 1))
    .attr("fill", fillOf).attr("opacity", (d) => dim(d.seed)).style("cursor", "pointer")
    .on("mousemove", (ev, d) => {
      const e = DATA.ep.get(d.c.id).get(d.seed);
      showTip(ev, `<b>seed ${d.seed}</b> · ${label(d.c.id)}<br>${e.success ? "✓ success" : "✗ failure"} · ${DATA.task === "reach" ? `final distance ${Math.round(e.dist_final)} px` : `coverage ${Math.round(e.coverage_final * 100)}%`}<br>
        <span class="k">discontinuity</span> ${e.jump_mean.toFixed(1)} px · <span class="k">moved while thinking</span> ${e.think_motion_mean.toFixed(1)} px · <span class="k">idle</span> ${Math.round(e.idle_frac * 100)}%<br>
        <span class="k">this seed succeeds in ${Math.round(DATA.robust.get(d.seed) * 100)}% of schedules</span><br><span class="k">click = open this episode (column becomes the candidate)</span>`);
      if (state.hoverSeed !== d.seed) update({ hoverSeed: d.seed });
    })
    .on("mouseleave", () => { hideTip(); update({ hoverSeed: null }); })
    .on("click", (ev, d) => {
      const patch = { seed: d.seed, t: 0, win: null };
      if (d.c.id !== state.ref) patch.cand = d.c.id;
      update(patch);
    })
    .transition().duration(300).attr("y", (d) => rows.get(d.seed).y);

  // baseline / candidate words under their columns, each extending away from the other
  const marks = [{ id: state.ref, col: COLOR.ref, t: "baseline" }, { id: state.cand, col: "#9a6a00", t: "candidate" }].filter((m) => xpos.has(m.id));
  const other = (d) => marks.find((m) => m !== d);
  const fits = (d, a) => (a === "start" ? xpos.get(d.id) + d.t.length * 5.6 < matR : xpos.get(d.id) + cw - d.t.length * 5.6 > left);
  const anchor = (d) => {
    const want = !other(d) ? "middle" : xpos.get(d.id) < xpos.get(other(d).id) ? "end" : "start";
    return want === "middle" || fits(d, want) ? want : want === "start" ? "end" : "start";  // never run into the row labels or the dumbbell axis
  };
  svg.selectAll("text.colmark").data(marks, (d) => d.t).join("text").attr("class", "colmark").attr("font-weight", 800).attr("font-size", 9.5)
    .attr("x", (d) => xpos.get(d.id) + (anchor(d) === "end" ? cw : anchor(d) === "start" ? 0 : cw / 2)).attr("y", L.bottom + 11)
    .attr("text-anchor", anchor).attr("fill", (d) => d.col).text((d) => d.t);

  // row labels
  svg.selectAll("text.rl").data(order, (d) => d.seed).join("text").attr("class", "rl axis-title")
    .attr("font-size", Math.min(9.5, rh)).attr("x", left - 4).attr("text-anchor", "end").attr("dy", "0.8em")
    .attr("font-weight", (d) => (d.seed === state.seed ? 800 : 400)).attr("fill", (d) => (d.seed === state.seed ? COLOR.sel : null))
    .text((d) => (rh >= 9.5 || d.seed === state.seed ? d.seed : "")).style("cursor", "pointer")
    .on("click", (ev, d) => update({ seed: d.seed, t: 0, win: null }))
    .transition().duration(300).attr("y", (d) => d.y);

  // ---- paired shift (dumbbells) ---------------------------------------------------------------
  const k = METRICS[state.metric].epB;
  const dl = matR + 22, dr = w - 10;
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
    .text(`${EP_ATTRS[k]}${SYMLOG.has(k) ? ", log" : ""} →`);
  svg.selectAll("text.dht").data([0]).join("text").attr("class", "dht").attr("x", dl).attr("y", top - 18).attr("font-size", 10.5).attr("font-weight", 700)
    .html(`<tspan fill="${COLOR.ref}">●</tspan> baseline → <tspan fill="${COLOR.cand}">●</tspan> candidate`);
  svg.selectAll("text.dht2").data([0]).join("text").attr("class", "dht2 axis-title").attr("x", dl).attr("y", top - 5).attr("font-size", 9)
    .text("same seed under both schedules");

  // brush over the dumbbell rows = select seeds (cross-filters A, dims rows)
  const bkey = `${w}x${h}|${k}|${state.ref}|${state.cand}`;
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
    .text((g) => `${g.name}  ${g.seeds.length}`);
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
    .on("click", (ev, r) => update({ seed: r.seed, t: 0, win: null }));

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
