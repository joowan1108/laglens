// View B: latency response relative to the baseline chosen in A, in one plot so that baseline and
// candidate are always in the same frame: x = inference latency d (true spacing, 100 ms per step),
// one line per strategy × horizon (hue + shape = strategy, solid = h 4, dashed = h 8). y = each schedule's success minus the baseline's on the same start states (paired), so
// 0 is the baseline and choosing another baseline in A moves the zero line and re-tests every point.
// The scale spans exactly 0–100 % success, so the curve shapes read as absolute latency response.
// Whiskers = 95 % interval of the paired difference; filled = unlikely to be chance (exact McNemar).
import { state, update, bus } from "../state.js";
import { DATA, STRATEGIES, STRAT_LABEL, LATENCIES, HORIZONS, label, aggregate, missingReason } from "../data.js";
import { COLOR, STRAT_COLOR, STRAT_SYMBOL, fmtMetric, showTip, hideTip, size } from "../util.js";
import { flips } from "./pairs.js";

let root, svg, noteSel, hoverStrat = null;
// what each strategy does while the policy computes the next chunk (legend hover)
const STRAT_DEF = {
  sync: "waits (robot idle) until the new chunk is ready",
  naive: "keeps executing the old chunk, then switches to the new one",
  inpaint: "like naive, but the new chunk is generated to continue the old plan",
};
const pts100 = (v) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(Math.round(v * 100))}`;

export function initResponse() {
  const ctr = d3.select("#responseControls");
  const lg = ctr.append("span").attr("class", "legend");
  for (const s of STRATEGIES) {
    const it = lg.append("span").attr("class", "li").attr("data-strat", s).attr("title", STRAT_DEF[s])
      .on("mouseenter", () => { hoverStrat = s; render(); }).on("mouseleave", () => { hoverStrat = null; render(); });
    it.append("svg").attr("width", 12).attr("height", 12).append("path")
      .attr("transform", "translate(6,6)").attr("d", d3.symbol(STRAT_SYMBOL[s], 52)()).attr("fill", STRAT_COLOR[s]);
    it.append("span").text({ sync: "Sync", naive: "Naive", inpaint: "Inpaint" }[s]);
  }
  lg.append("span").attr("class", "li").attr("title", "execution horizon h: how many actions of each chunk are executed before switching to the next chunk")
    .html('<svg width="18" height="8"><line x1="0" x2="18" y1="4" y2="4" stroke="#555" stroke-width="2"/></svg>h 4 <svg width="18" height="8"><line x1="0" x2="18" y1="4" y2="4" stroke="#555" stroke-width="2" stroke-dasharray="5 3"/></svg>h 8');
  lg.append("span").attr("class", "li muted").attr("title", "the same schedule (Sync d0 h8) run a second time: how much success changes by chance alone").html("○ re-run");
  root = d3.select("#response");
  svg = root.append("svg");
  noteSel = d3.select("#responseNote");
  render();
  bus.on("change.response", (keys) => {
    if (["task", "ref", "cand", "brushed"].some((k) => keys.has(k))) render();
  });
}

function points() {
  const out = [];
  for (const s of DATA.schedules) {
    const a = aggregate(s.schedule, "success_rate", state.brushed);
    if (!a || a.v === null) continue;
    const self = s.schedule === state.ref;
    const dl = self ? { v: 0, lo: 0, hi: 0 } : aggregate(s.schedule, "success_rate", state.brushed, state.ref);
    const f = self ? null : flips(state.ref, s.schedule, state.brushed);
    out.push({ id: s.schedule, strat: s.strategy, d: s.latency, h: s.horizon, rep: !!s.replicate, abs: a.v, n: a.n,
      v: dl.v, lo: dl.lo, hi: dl.hi, f, sig: !!f && f.p < 0.05 });
  }
  return out;
}

// one plot for both horizons, so baseline and candidate are always in the same frame:
// hue + shape = strategy, solid = h 4, dashed = h 8; points of one latency are dodged side by side
const DODGE = { sync4: -20, sync8: -12, naive4: -4, naive8: 4, inpaint4: 12, inpaint8: 20 };
const DASH = { 4: null, 8: "5 3" };
const key = (p) => `${p.strat}${p.h}`;

function render() {
  const n = state.brushed ? state.brushed.size : DATA.seeds.length;
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const pts = points();
  const base = aggregate(state.ref, "success_rate", state.brushed)?.v ?? 0;
  noteSel.html(`0 = the baseline chosen in A; each point = that schedule's success minus the baseline's on the same ${state.brushed ? `<b>${n} start states selected in C</b> (Esc clears)` : `${n} start states`} · filled = unlikely to be chance`);
  const m = { l: 40, r: 30, t: 10, b: 34 };
  const x = d3.scaleLinear().domain([-0.45, LATENCIES[LATENCIES.length - 1] + 0.45]).range([m.l, w - m.r]);
  // the scale covers exactly 0 … 100 % success, shifted so that the baseline sits at 0
  const y = d3.scaleLinear().domain([-base, 1 - base]).range([h - m.b, m.t]);
  const ticks = d3.range(-10, 11).map((k) => k * 0.2).filter((v) => v >= -base - 1e-9 && v <= 1 - base + 1e-9);

  svg.selectAll("rect.pbg").data([0]).join("rect").attr("class", "pbg").attr("x", m.l).attr("y", m.t)
    .attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("fill", "#fafafb");
  svg.selectAll("g.grid").data([0]).join("g").attr("class", "grid gridline").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).tickValues(ticks).tickSize(-(w - m.l - m.r)).tickFormat("")).call((q) => q.select(".domain").remove());
  svg.selectAll("g.yax").data([0]).join("g").attr("class", "axis yax").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).tickValues(ticks).tickSize(3).tickFormat((v) => (Math.abs(v) < 1e-9 ? "0" : pts100(v))))
    .call((g) => g.select(".domain").remove());
  svg.selectAll("text.yt").data([0]).join("text").attr("class", "axis-title yt")
    .attr("transform", `translate(10,${(m.t + h - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle")
    .text("success vs. baseline (points)");
  svg.selectAll("g.xax").data([0]).join("g").attr("class", "axis xax").attr("transform", `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).tickValues(LATENCIES).tickSize(3).tickFormat((d) => d)).call((q) => q.select(".domain").attr("stroke", "#c9c9cf"));
  svg.selectAll("line.zero").data([0]).join("line").attr("class", "zero").attr("x1", m.l).attr("x2", w - m.r)
    .attr("y1", y(0)).attr("y2", y(0)).attr("stroke", COLOR.ref).attr("stroke-width", 1.4);
  for (const c of ["lines", "marks", "rings"]) svg.selectAll(`g.${c}`).data([0]).join("g").attr("class", c);

  // the series that hold the baseline or the candidate stay strong, the others step back
  const sched = (id) => DATA.schedById.get(id);
  const pairKeys = new Set([state.ref, state.cand].map((id) => sched(id)).filter((q) => q && !q.replicate).map((q) => `${q.strategy}${q.horizon}`));
  const op = (strat, k) => (hoverStrat ? (hoverStrat === strat ? 1 : 0.12) : pairKeys.has(k) ? 1 : 0.28);
  const lx = (p) => x(p.d) + DODGE[key(p)];
  const px = (p) => (p.rep ? x(p.d) + 30 : lx(p));

  const main = pts.filter((p) => !p.rep);
  const lines = [];
  for (const s of STRATEGIES) for (const hz of HORIZONS) {
    const ps = main.filter((p) => p.strat === s && p.h === hz).sort((a, b) => a.d - b.d);
    if (!ps.length) continue;
    const zero = main.find((p) => p.strat === "sync" && p.d === 0 && p.h === hz);
    lines.push({ k: `${s}${hz}`, s, hz, ps, lead: s !== "sync" && zero ? [zero, ps[0]] : null });
  }
  const line = d3.line().x(lx).y((p) => y(p.v));
  svg.select("g.lines").selectAll("g.sl").data(lines, (l) => l.k).join((en) => {
    const q = en.append("g").attr("class", "sl"); q.append("path").attr("class", "lead"); q.append("path").attr("class", "main"); q.append("text").attr("class", "end"); return q;
  }).attr("opacity", (l) => op(l.s, l.k))
    // async with d = 0 is identical to sync d = 0, so async lines start from that shared point (dotted)
    .call((q) => q.select(".lead").attr("d", (l) => (l.lead ? `M${lx(l.lead[0])},${y(l.lead[0].v)}L${lx(l.lead[1])},${y(l.lead[1].v)}` : null))
      .attr("fill", "none").attr("stroke", (l) => STRAT_COLOR[l.s]).attr("stroke-width", 1.2).attr("stroke-dasharray", "1.5 3"))
    .call((q) => q.select(".main").attr("d", (l) => line(l.ps)).attr("fill", "none").attr("stroke", (l) => STRAT_COLOR[l.s])
      .attr("stroke-width", (l) => (pairKeys.has(l.k) ? 2.4 : 1.6)).attr("stroke-dasharray", (l) => DASH[l.hz]))
    // the strong series say which horizon they are at their right end
    .call((q) => q.select(".end").attr("x", (l) => lx(l.ps[l.ps.length - 1]) + 7).attr("y", (l) => y(l.ps[l.ps.length - 1].v) + 3.5)
      .attr("font-size", 9.5).attr("font-weight", 700).attr("fill", COLOR.ink).attr("stroke", "#fafafb").attr("stroke-width", 3).attr("paint-order", "stroke")
      .text((l) => (pairKeys.has(l.k) ? `h${l.hz}` : "")));

  const mk = svg.select("g.marks").selectAll("g.pm").data(pts, (p) => p.id).join((en) => {
    const q = en.append("g").attr("class", "pm").style("cursor", "pointer");
    q.append("line").attr("class", "ci"); q.append("path").attr("class", "sym"); q.append("circle").attr("class", "hit");
    return q;
  }).attr("opacity", (p) => op(p.strat, key(p))).attr("transform", (p) => `translate(${px(p)},0)`);
  mk.select(".ci").attr("y1", (p) => y(p.lo)).attr("y2", (p) => y(p.hi)).attr("stroke", (p) => STRAT_COLOR[p.strat])
    .attr("stroke-width", 1.2).attr("stroke-opacity", 0.45);
  mk.select(".sym").attr("transform", (p) => `translate(0,${y(p.v)})`)
    .attr("d", (p) => d3.symbol(STRAT_SYMBOL[p.strat], p.rep ? 34 : 44)())
    .attr("fill", (p) => (p.rep ? "#fff" : STRAT_COLOR[p.strat]))
    .attr("fill-opacity", (p) => (p.rep || p.sig || p.id === state.ref ? 1 : 0.35))
    .attr("stroke", (p) => (p.rep ? STRAT_COLOR[p.strat] : p.sig ? "#fff" : STRAT_COLOR[p.strat]))
    .attr("stroke-width", (p) => (p.rep ? 1.4 : 1));
  mk.select(".hit").attr("cy", (p) => y(p.v)).attr("r", 6).attr("fill", "transparent");
  mk.on("click", (ev, p) => (ev.shiftKey ? update({ ref: p.id }) : update({ cand: p.id })))
    .on("mouseenter", (ev, p) => { hoverStrat = p.strat; render(); })
    .on("mousemove", (ev, p) => showTip(ev, tipHtml(p)))
    .on("mouseleave", () => { hideTip(); hoverStrat = null; render(); });

  // baseline (on the zero line) and candidate: rings with a word, and the candidate's distance
  // to the zero line, which is the value of the current cell in A
  const rings = [{ id: state.ref, k: "ref", t: "baseline", col: COLOR.ref }, { id: state.cand, k: "cand", t: "candidate", col: COLOR.cand }]
    .map((r) => ({ ...r, p: pts.find((p) => p.id === r.id) })).filter((r) => r.p);
  const rg = svg.select("g.rings").selectAll("g.rg").data(rings, (r) => r.t).join((en) => {
    const q = en.append("g").attr("class", "rg").attr("pointer-events", "none");
    q.append("line"); q.append("circle"); q.append("text").attr("class", "who"); q.append("text").attr("class", "dv"); return q;
  }).attr("transform", (r) => `translate(${px(r.p)},${y(r.p.v)})`);
  rg.select("circle").attr("r", 7.5).attr("fill", "none").attr("stroke", (r) => r.col).attr("stroke-width", 2.2);
  rg.select("line").attr("y1", 0).attr("y2", (r) => (r.k === "cand" ? y(0) - y(r.p.v) : 0))
    .attr("stroke", COLOR.cand).attr("stroke-width", 2).attr("stroke-dasharray", "3 2");
  // word above the ring (below when the candidate is under 0 or the ring is at the top)
  const above = (r) => (r.k === "ref" || r.p.v >= 0) && y(r.p.v) - 22 > m.t;
  rg.select("text.who").attr("y", (r) => (above(r) ? -11 : 19)).attr("text-anchor", "middle").attr("font-size", 10.5)
    .attr("font-weight", 800).attr("fill", (r) => (r.k === "cand" ? "#9a6a00" : COLOR.ref))
    .attr("stroke", "#fafafb").attr("stroke-width", 3).attr("paint-order", "stroke").text((r) => r.t);
  rg.select("text.dv").attr("x", -10).attr("text-anchor", "end").attr("y", (r) => (y(0) - y(r.p.v)) / 2 + 4).attr("font-size", 10.5).attr("font-weight", 800)
    .attr("fill", "#9a6a00").attr("stroke", "#fafafb").attr("stroke-width", 3).attr("paint-order", "stroke")
    .text((r) => (r.k === "cand" && Math.abs(r.p.v) > 0.04 ? pts100(r.p.v) : ""));

  svg.selectAll("text.zl").data([0]).join("text").attr("class", "zl").attr("x", w - m.r - 3).attr("text-anchor", "end").attr("y", y(0) + (base > 0.85 ? 12 : -4))
    .attr("font-size", 9.5).attr("fill", COLOR.ref).attr("stroke", "#fafafb").attr("stroke-width", 3).attr("paint-order", "stroke")
    .text(`0 = baseline (${Math.round(base * 100)} % success)`);
  svg.selectAll("text.xt").data([0]).join("text").attr("class", "axis-title xt").attr("x", w - m.r).attr("y", h - 4)
    .attr("text-anchor", "end").text("inference latency d (steps; 1 step = 100 ms) →");
}

function tipHtml(p) {
  let html = `<b>${label(p.id)}</b><br><span class="k">success:</span> ${fmtMetric("success_rate", p.abs)} of ${p.n} start states`;
  if (p.id === state.ref) html += `<br><b>this is the baseline</b> (the zero line)`;
  else {
    html += `<br><span class="k">vs baseline:</span> <b>${pts100(p.v)} points</b> <span class="k">[${pts100(p.lo)}, ${pts100(p.hi)}], paired</span>`;
    if (p.f) html += `<br>${p.f.gain} rescued, ${p.f.loss} lost (McNemar p ${p.f.p < 0.001 ? "< 0.001" : `= ${p.f.p.toFixed(3)}`}) · <b>${p.sig ? "unlikely to be chance" : "within chance"}</b>`;
  }
  if (p.strat !== "sync" && p.d === 0) html += `<br><span class="k">${missingReason(p.strat, 0, p.h)}</span>`;
  return `${html}<br><span class="k">click = candidate · shift-click = baseline</span>`;
}

export function resizeResponse() { render(); }
