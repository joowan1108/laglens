// View B: latency response relative to the baseline chosen in A, in one plot so that baseline and
// candidate are always in the same frame: x = inference latency d (true spacing, 100 ms per step),
// one line per strategy × horizon (hue + shape = strategy, solid = h 4, dashed = h 8). y = each schedule's success minus the baseline's on the same start states (paired), so
// 0 is the baseline and choosing another baseline in A moves the zero line and re-tests every point.
// The scale spans exactly 0–100 % success, so the curve shapes read as absolute latency response.
// Small hollow marks = the same schedule simply run again (its re-runs), joined by a thin line: the
// spread that chance alone produces. Filled = unlikely to be chance (exact McNemar, FDR 5 %).
import { state, update, bus } from "../state.js";
import { DATA, STRATEGIES, STRAT_LABEL, LATENCIES, HORIZONS, label, aggregate, missingReason, reruns, whyNot } from "../data.js";
import { COLOR, STRAT_COLOR, STRAT_SYMBOL, METRICS, fmtMetric, showTip, hideTip, size } from "../util.js";
import { flips } from "./pairs.js";

let root, svg, noteSel, hoverStrat = null;
// what each strategy does while the policy computes the next chunk (legend hover)
const STRAT_DEF = {
  sync: "waits (robot idle) until the new chunk is ready",
  naive: "keeps executing the old chunk, then switches to the new one",
  inpaint: "like naive, but the new chunk is generated to continue the old plan",
};
// signed difference in the unit of the question: points for shares, px for the px costs
const pts100 = (v) => { const k = METRICS[state.metric].pct ? v * 100 : v; const a = Math.abs(k); return `${k > 0 ? "+" : k < 0 ? "−" : "±"}${a >= 10 || METRICS[state.metric].pct ? Math.round(a) : a.toFixed(1)}`; };
const isS = () => state.metric === "success_rate";

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
  lg.append("span").attr("class", "li muted").attr("title", "every schedule was run two more times from the same start states (only the sampling noise of the policy differs): the spread of the three results is what chance alone does").html('<svg width="10" height="16"><line x1="5" x2="5" y1="2" y2="14" stroke="#777" stroke-width="1"/><circle cx="5" cy="3" r="2.2" fill="#fff" stroke="#777"/><circle cx="5" cy="12" r="2.2" fill="#fff" stroke="#777"/></svg>run again');
  root = d3.select("#response");
  svg = root.append("svg");
  noteSel = d3.select("#responseNote");
  render();
  bus.on("change.response", (keys) => {
    if (["task", "ref", "cand", "brushed", "dfocus", "metric"].some((k) => keys.has(k))) render();
  });
}

function points() {
  const out = [];
  for (const s of DATA.schedules) {
    const a = aggregate(s.schedule, state.metric, state.brushed);
    if (!a || a.v === null) continue;
    const self = s.schedule === state.ref;
    const dl = self ? { v: 0, lo: 0, hi: 0 } : aggregate(s.schedule, state.metric, state.brushed, state.ref);
    const f = self || !isS() ? null : flips(state.ref, s.schedule, state.brushed);  // only the outcome is tested
    // its plain re-runs on the same scale: their success minus the baseline's (run 0)
    const re = reruns(s.schedule).map((k) => aggregate(k, state.metric, state.brushed).v).filter((v) => v !== null);
    out.push({ id: s.schedule, strat: s.strategy, d: s.latency, h: s.horizon, abs: a.v, n: a.n,
      v: dl.v, re, reAbs: re, f, sig: isS() && !!f && f.sig, nt: !!f && !f.comparable });
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
  const base = aggregate(state.ref, state.metric, state.brushed)?.v ?? 0;
  const Mt = METRICS[state.metric], what = isS() ? "success" : Mt.btn.toLowerCase();
  for (const p of pts) p.re = p.reAbs.map((v) => v - base);
  noteSel.html(state.brushed
    ? `${isS() ? "Success" : Mt.btn} minus the baseline's on the <b>${n} start states selected in C</b> (Esc clears)${isS() ? " · nothing filled: the selection was made from the outcomes" : ""}`
    : `Point = that schedule's ${what} minus the baseline's on the same ${n} start states · ${isS() ? "filled = unlikely to be chance (FDR 5 %) · dashed outline = not compared with this baseline" : `<b>${Mt.label}</b>: higher = pays more (costs are described, not tested, so nothing is filled)`} · small hollow = the same schedule run again · click = candidate, shift-click = baseline`);
  const m = { l: 40, r: 30, t: 10, b: 34 };
  const x = d3.scaleLinear().domain([-0.45, LATENCIES[LATENCIES.length - 1] + 0.45]).range([m.l, w - m.r]);
  // the scale covers exactly 0 … 100 % success, shifted so that the baseline sits at 0
  // costs have no natural range: the scale spans what the schedules and their re-runs reach
  const all = pts.flatMap((p) => [p.v, ...p.re]), pad = (d3.max(all) - d3.min(all)) * 0.08 || 1;
  const y = d3.scaleLinear().domain(isS() ? [-base, 1 - base] : [Math.min(0, d3.min(all)) - pad, Math.max(0, d3.max(all)) + pad]).range([h - m.b, m.t]);
  const ticks = isS() ? d3.range(-10, 11).map((k) => k * 0.2).filter((v) => v >= -base - 1e-9 && v <= 1 - base + 1e-9) : y.ticks(6);

  svg.selectAll("rect.pbg").data([0]).join("rect").attr("class", "pbg").attr("x", m.l).attr("y", m.t)
    .attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("fill", "#fafafb");
  // "my latency" chosen in A: its column is shaded
  svg.selectAll("rect.dband").data(state.dfocus !== null ? [state.dfocus] : []).join("rect").attr("class", "dband")
    .attr("x", (d) => x(d - 0.42)).attr("width", (d) => x(d + 0.42) - x(d - 0.42)).attr("y", m.t).attr("height", h - m.t - m.b).attr("fill", "#ececf3").lower();
  svg.select("rect.pbg").lower();
  svg.selectAll("text.dbt").remove();  // the band is named on its axis tick instead
  svg.selectAll("g.grid").data([0]).join("g").attr("class", "grid gridline").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).tickValues(ticks).tickSize(-(w - m.l - m.r)).tickFormat("")).call((q) => q.select(".domain").remove());
  svg.selectAll("g.yax").data([0]).join("g").attr("class", "axis yax").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).tickValues(ticks).tickSize(3).tickFormat((v) => (Math.abs(v) < 1e-9 ? "0" : pts100(v))))
    .call((g) => g.select(".domain").remove());
  svg.selectAll("text.yt").data([0]).join("text").attr("class", "axis-title yt")
    .attr("transform", `translate(10,${(m.t + h - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle")
    .text(isS() ? "success vs. baseline (points)" : `${Mt.btn.toLowerCase()} vs. baseline (${Mt.pct ? "points" : "px"}) · up = pays more`);
  svg.selectAll("g.xax").data([0]).join("g").attr("class", "axis xax").attr("transform", `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).tickValues(LATENCIES).tickSize(3).tickFormat((d) => (d === state.dfocus ? `${d} = my latency` : d))).call((q) => q.select(".domain").attr("stroke", "#c9c9cf"));
  svg.selectAll("line.zero").data([0]).join("line").attr("class", "zero").attr("x1", m.l).attr("x2", w - m.r)
    .attr("y1", y(0)).attr("y2", y(0)).attr("stroke", COLOR.ref).attr("stroke-width", 1.4);
  for (const c of ["lines", "marks", "rings"]) svg.selectAll(`g.${c}`).data([0]).join("g").attr("class", c);

  // the series that hold the baseline or the candidate stay strong, the others step back
  const sched = (id) => DATA.schedById.get(id);
  const pairKeys = new Set([state.ref, state.cand].map((id) => sched(id)).filter((q) => q && !q.replicate).map((q) => `${q.strategy}${q.horizon}`));
  const op = (strat, k) => (hoverStrat ? (hoverStrat === strat ? 1 : 0.12) : pairKeys.has(k) ? 1 : 0.28);
  const lx = (p) => x(p.d) + DODGE[key(p)];
  const px = lx;

  const main = pts;
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
    q.append("line").attr("class", "ci"); q.append("g").attr("class", "re"); q.append("path").attr("class", "sym"); q.append("circle").attr("class", "hit");
    return q;
  }).attr("opacity", (p) => op(p.strat, key(p))).attr("transform", (p) => `translate(${px(p)},0)`);
  // spread of the three runs of the same schedule (run 0 = the symbol, re-runs = small hollow circles)
  mk.select(".ci").attr("y1", (p) => y(Math.min(p.v, ...p.re))).attr("y2", (p) => y(Math.max(p.v, ...p.re))).attr("stroke", (p) => STRAT_COLOR[p.strat])
    .attr("stroke-width", 1).attr("stroke-opacity", 0.6);
  mk.select(".re").selectAll("circle").data((p) => p.re.map((v) => ({ v, strat: p.strat }))).join("circle")
    .attr("cy", (q) => y(q.v)).attr("r", 2.3).attr("fill", "#fafafb").attr("stroke", (q) => STRAT_COLOR[q.strat]).attr("stroke-width", 1);
  mk.select(".sym").attr("transform", (p) => `translate(0,${y(p.v)})`)
    .attr("d", (p) => d3.symbol(STRAT_SYMBOL[p.strat], 44)())
    .attr("fill", (p) => (p.nt ? "#fafafb" : STRAT_COLOR[p.strat]))
    .attr("fill-opacity", (p) => (p.nt ? 1 : p.sig || p.id === state.ref ? 1 : 0.35))
    .attr("stroke", (p) => (p.sig ? "#fff" : STRAT_COLOR[p.strat]))
    .attr("stroke-dasharray", (p) => (p.nt ? "2 1.5" : null))
    .attr("stroke-width", (p) => (p.nt ? 1.3 : 1));
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
  // word above the ring (below when the candidate is under 0 or the ring is at the top). When the two
  // rings are close, the upper one is named above and the lower one below; without room for that,
  // the word goes to the outer side of its ring.
  const above = (r) => (r.k === "ref" || r.p.v >= 0) && y(r.p.v) - 22 > m.t;
  const other = (r) => rings.find((q) => q !== r);
  const clash = rings.length === 2 && Math.abs(px(rings[0].p) - px(rings[1].p)) < 62 && Math.abs(y(rings[0].p.v) - y(rings[1].p.v)) < 34;
  const upper = (r) => { const o = other(r); return y(r.p.v) < y(o.p.v) || (y(r.p.v) === y(o.p.v) && r.k === "ref"); };
  const room = (r) => (upper(r) ? y(r.p.v) - 22 > m.t : y(r.p.v) + 24 < h - m.b);
  const side = (r) => clash && !room(r);
  const toLeft = (r) => (px(r.p) + 70 > w - 2 ? true : px(r.p) - 70 < m.l ? false : px(r.p) <= px(other(r).p));
  rg.select("text.who").attr("y", (r) => (side(r) ? 4 : clash ? (upper(r) ? -11 : 19) : above(r) ? -11 : 19)).attr("x", (r) => (side(r) ? (toLeft(r) ? -12 : 12) : 0))
    .attr("text-anchor", (r) => (side(r) ? (toLeft(r) ? "end" : "start") : "middle")).attr("font-size", 10.5)
    .attr("font-weight", 800).attr("fill", (r) => (r.k === "cand" ? "#9a6a00" : COLOR.ref))
    .attr("stroke", "#fafafb").attr("stroke-width", 3).attr("paint-order", "stroke").text((r) => r.t);
  rg.select("text.dv").attr("x", -10).attr("text-anchor", "end").attr("y", (r) => (y(0) - y(r.p.v)) / 2 + 4).attr("font-size", 10.5).attr("font-weight", 800)
    .attr("fill", "#9a6a00").attr("stroke", "#fafafb").attr("stroke-width", 3).attr("paint-order", "stroke")
    .text((r) => (r.k === "cand" && Math.abs(y(0) - y(r.p.v)) > 16 ? pts100(r.p.v) : ""));

  // the zero-line label goes to the side away from the baseline's own point
  const zText = `0 = baseline (${fmtMetric(state.metric, base)}${isS() ? " success" : Mt.pct ? " idle" : " px"})`;
  const zw = zText.length * 5.3;
  const spots = [];
  for (const below of [false, true]) for (const left of [true, false]) {
    const ty = y(0) + (below ? 12 : -4);
    if (ty - 10 < m.t || ty > h - m.b) continue;
    const x0 = left ? m.l + 4 : w - m.r - 3 - zw;
    const hits = pts.flatMap((p) => [p.v, ...p.re].map((v) => [px(p), y(v)]))
      .filter(([qx, qy]) => qx > x0 - 7 && qx < x0 + zw + 7 && qy > ty - 15 && qy < ty + 6).length;
    spots.push({ left, ty, hits });
  }
  const zs = spots.sort((a, b) => a.hits - b.hits)[0] ?? { left: true, ty: y(0) - 4 };
  svg.selectAll("text.zl").data([0]).join("text").attr("class", "zl").attr("x", zs.left ? m.l + 4 : w - m.r - 3).attr("text-anchor", zs.left ? "start" : "end").attr("y", zs.ty)
    .attr("font-size", 9.5).attr("fill", COLOR.ref).attr("stroke", "#fafafb").attr("stroke-width", 3).attr("paint-order", "stroke")
    .text(zText);
  svg.selectAll("text.xt").data([0]).join("text").attr("class", "axis-title xt").attr("x", w - m.r).attr("y", h - 4)
    .attr("text-anchor", "end").text("inference latency d (steps; 1 step = 100 ms) →");
}

function tipHtml(p) {
  let html = `<b>${label(p.id)}</b><br><span class="k">${METRICS[state.metric].label}:</span> ${fmtMetric(state.metric, p.abs)}${isS() ? ` of ${p.n} start states` : ` (mean over ${p.n} start states)`}`;
  if (p.id === state.ref) html += `<br><b>this is the baseline</b> (the zero line)`;
  else {
    html += `<br><span class="k">vs baseline:</span> <b>${pts100(p.v)} ${METRICS[state.metric].pct ? "points" : "px"}</b> <span class="k">on the same start states</span>`;
    if (p.f && !p.f.comparable) html += `<br>${p.f.gain} rescued, ${p.f.loss} lost · <b>not tested</b>: ${whyNot(state.ref, p.id)} (read it along its own line; it cannot be chosen as candidate)`;
    else if (p.f) html += `<br>${p.f.gain} rescued, ${p.f.loss} lost (McNemar p ${p.f.p < 0.001 ? "< 0.001" : `= ${p.f.p.toFixed(3)}`}, corrected q ${p.f.q < 0.001 ? "< 0.001" : `= ${p.f.q.toFixed(3)}`}) · <b>${state.brushed ? "no test on a selection made from the outcomes" : p.sig ? "unlikely to be chance" : `not established with ${p.f.n} start states`}</b>${!state.brushed && !p.sig && p.f.agree ? ` · the re-runs point the same way (${p.f.agree})` : ""}`;
  }
  if (p.reAbs.length) html += `<br><span class="k">the same schedule run again:</span> ${p.reAbs.map((v) => fmtMetric(state.metric, v)).join(", ")} <span class="k">(hollow marks)</span>`;
  if (p.strat !== "sync" && p.d === 0) html += `<br><span class="k">${missingReason(p.strat, 0, p.h)}</span>`;
  return `${html}<br><span class="k">click = candidate · shift-click = baseline</span>`;
}

export function resizeResponse() { render(); }
