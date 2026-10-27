// View A: latency-response curves. One small multiple per execution horizon h; within a panel,
// x = inference latency d (true spacing, 100 ms per step), y = the chosen metric, one line per
// strategy so that sync and the two async strategies are compared on a common position scale.
// Whiskers are 95 % intervals over the 50 seeds; the paired difference to R is given on hover.
import { state, update, bus } from "../state.js";
import { DATA, STRATEGIES, STRAT_LABEL, LATENCIES, HORIZONS, label, aggregate, missingReason } from "../data.js";
import { COLOR, STRAT_COLOR, STRAT_SYMBOL, METRICS, fmtMetric, showTip, hideTip, size } from "../util.js";

let root, svg, metricBtns, noteSel, hoverStrat = null;
const DODGE = { sync: -4, naive: 0, inpaint: 4 };

export function initResponse() {
  const ctr = d3.select("#responseControls");
  // one choice of question, always visible; it also sets the dumbbell attribute of B
  metricBtns = ctr.append("span").attr("class", "metricbar").selectAll("button").data(Object.entries(METRICS)).join("button")
    .attr("data-metric", (d) => d[0]).attr("title", (d) => d[1].note)
    .on("click", (ev, d) => update({ metric: d[0] }))
    .call((b) => b.append("b").text((d) => d[1].btn))
    .call((b) => b.append("small").text((d) => d[1].sub));
  const lg = ctr.append("span").attr("class", "legend");
  for (const s of STRATEGIES) {
    const it = lg.append("span").attr("class", "li").attr("data-strat", s)
      .on("mouseenter", () => { hoverStrat = s; render(); }).on("mouseleave", () => { hoverStrat = null; render(); });
    it.append("svg").attr("width", 12).attr("height", 12).append("path")
      .attr("transform", "translate(6,6)").attr("d", d3.symbol(STRAT_SYMBOL[s], 52)()).attr("fill", STRAT_COLOR[s]);
    it.append("span").text(STRAT_LABEL[s]);
  }
  lg.append("span").attr("class", "li muted").html("○ re-run &nbsp;│ 95 % interval");
  root = d3.select("#response");
  svg = root.append("svg");
  noteSel = d3.select("#responseNote");
  render();
  bus.on("change.response", (keys) => {
    if (["ref", "cand", "metric", "brushed"].some((k) => keys.has(k))) render();
  });
}

function points() {
  const out = [];
  for (const s of DATA.schedules) {
    const a = aggregate(s.schedule, state.metric, state.brushed);
    if (!a || a.v === null) continue;
    out.push({ id: s.schedule, strat: s.strategy, d: s.latency, h: s.horizon, rep: !!s.replicate, ...a });
  }
  return out;
}

function render() {
  metricBtns.classed("on", (d) => d[0] === state.metric);
  const n = state.brushed ? state.brushed.size : DATA.seeds.length;
  // the two schedule parameters are defined where they are encoded: h = panel, d = x
  noteSel.html(`<b>h</b> (panels) = actions executed from each 16-action chunk before switching to the next ·
    <b>d</b> (x) = time the policy needs to compute a chunk<br>
    <b>y</b> = ${METRICS[state.metric].note}${state.brushed ? ` · <b>computed over the ${n} seeds selected in B</b> (Esc clears)` : ""} · ○ = Sync d0 h8 re-run with new noise`);
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const M = METRICS[state.metric];
  const pts = points();
  const m = { l: 44, r: 8, t: 22, b: 34 }, gap = 12;
  const pw = (w - m.l - m.r - gap * (HORIZONS.length - 1)) / HORIZONS.length;
  const x = d3.scaleLinear().domain([-0.5, 6.5]).range([8, pw - 4]);
  const yHi = M.pct ? 1 : d3.max(pts, (p) => p.hi) * 1.04;
  const y = d3.scaleLinear().domain([0, yHi]).nice().range([h - m.b, m.t]);

  // y axis + gridlines once, shared by the panels (common scale = direct comparison across h)
  const yfmt = M.pct ? (v) => `${Math.round(v * 100)}%` : d3.format("~g");
  svg.selectAll("g.yax").data([0]).join("g").attr("class", "axis yax").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(3).tickFormat(yfmt)).call((g) => g.select(".domain").remove());
  svg.selectAll("text.yt").data([0]).join("text").attr("class", "axis-title yt")
    .attr("transform", `translate(11,${(m.t + h - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle")
    .text(M.label);

  const panels = svg.selectAll("g.rp").data(HORIZONS, (d) => d).join((en) => {
    const g = en.append("g").attr("class", "rp");
    g.append("rect").attr("class", "pbg");
    g.append("g").attr("class", "grid gridline");
    g.append("g").attr("class", "axis xax");
    g.append("text").attr("class", "pt");
    g.append("g").attr("class", "lines");
    g.append("g").attr("class", "marks");
    g.append("g").attr("class", "rings");
    return g;
  }).attr("transform", (d, i) => `translate(${m.l + i * (pw + gap)},0)`);

  panels.each(function (hz, i) {
    const g = d3.select(this);
    g.select(".pbg").attr("x", 0).attr("y", m.t).attr("width", pw).attr("height", h - m.t - m.b).attr("fill", "#fafafb");
    g.select(".grid").call(d3.axisLeft(y).ticks(5).tickSize(-pw).tickFormat("")).call((q) => q.select(".domain").remove());
    g.select(".xax").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickValues(LATENCIES).tickSize(3).tickFormat((d) => d)).call((q) => q.select(".domain").attr("stroke", "#c9c9cf"));
    g.select(".pt").attr("x", pw / 2).attr("y", m.t - 7).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 700)
      .text(`h = ${hz}${i === 0 ? " actions per chunk" : ""}`)
      .call((q) => q.selectAll("title").data([0]).join("title")
        .text(`execution horizon h = ${hz}: the robot executes ${hz} actions of each chunk, then switches to the next chunk`));

    const mine = pts.filter((p) => p.h === hz && !p.rep);
    const zero = mine.find((p) => p.strat === "sync" && p.d === 0);
    const lines = STRATEGIES.map((s) => {
      const ps = mine.filter((p) => p.strat === s).sort((a, b) => a.d - b.d);
      return { s, ps, lead: s !== "sync" && zero && ps.length ? [zero, ps[0]] : null };
    }).filter((l) => l.ps.length);
    const lx = (p, s) => x(p.d) + DODGE[s ?? p.strat];
    const op = (s) => (hoverStrat && hoverStrat !== s ? 0.15 : 1);
    const line = d3.line().x((p) => lx(p)).y((p) => y(p.v));
    g.select(".lines").selectAll("g.sl").data(lines, (l) => l.s).join((en) => {
      const q = en.append("g").attr("class", "sl"); q.append("path").attr("class", "lead"); q.append("path").attr("class", "main"); return q;
    }).attr("opacity", (l) => op(l.s))
      // async with d = 0 is identical to sync d = 0, so async lines start from that shared point (dotted)
      .call((q) => q.select(".lead").attr("d", (l) => (l.lead ? `M${lx(l.lead[0], l.s)},${y(l.lead[0].v)}L${lx(l.lead[1])},${y(l.lead[1].v)}` : null))
        .attr("fill", "none").attr("stroke", (l) => STRAT_COLOR[l.s]).attr("stroke-width", 1.2).attr("stroke-dasharray", "1.5 3"))
      .call((q) => q.select(".main").attr("d", (l) => line(l.ps)).attr("fill", "none").attr("stroke", (l) => STRAT_COLOR[l.s]).attr("stroke-width", 2));

    const all = pts.filter((p) => p.h === hz);
    const mk = g.select(".marks").selectAll("g.pm").data(all, (p) => p.id).join((en) => {
      const q = en.append("g").attr("class", "pm").style("cursor", "pointer");
      q.append("line").attr("class", "ci"); q.append("path").attr("class", "sym"); q.append("circle").attr("class", "hit");
      return q;
    }).attr("opacity", (p) => op(p.strat))
      .attr("transform", (p) => `translate(${p.rep ? x(p.d) + 12 : lx(p)},0)`);
    mk.select(".ci").attr("y1", (p) => y(p.lo)).attr("y2", (p) => y(p.hi)).attr("stroke", (p) => STRAT_COLOR[p.strat])
      .attr("stroke-width", 1.2).attr("stroke-opacity", 0.35);
    mk.select(".sym").attr("transform", (p) => `translate(0,${y(p.v)})`)
      .attr("d", (p) => d3.symbol(STRAT_SYMBOL[p.strat], p.rep ? 34 : 40)())
      .attr("fill", (p) => (p.rep ? "#fff" : STRAT_COLOR[p.strat])).attr("stroke", (p) => (p.rep ? STRAT_COLOR[p.strat] : "#fff"))
      .attr("stroke-width", (p) => (p.rep ? 1.4 : 1));
    mk.select(".hit").attr("cy", (p) => y(p.v)).attr("r", 9).attr("fill", "transparent");
    mk.on("click", (ev, p) => (ev.shiftKey ? update({ ref: p.id }) : update({ cand: p.id })))
      .on("mouseenter", (ev, p) => { hoverStrat = p.strat; render(); })
      .on("mousemove", (ev, p) => showTip(ev, tipHtml(p)))
      .on("mouseleave", () => { hideTip(); hoverStrat = null; render(); });

    // R and C: rings with a letter (identity is never carried by hue alone)
    const rings = [{ id: state.ref, t: "R", col: COLOR.ref }, { id: state.cand, t: "C", col: COLOR.cand }]
      .map((r) => ({ ...r, p: all.find((p) => p.id === r.id) })).filter((r) => r.p);
    g.select(".rings").selectAll("g.rg").data(rings, (r) => r.t).join((en) => {
      const q = en.append("g").attr("class", "rg").attr("pointer-events", "none"); q.append("circle"); q.append("text"); return q;
    }).attr("transform", (r) => `translate(${r.p.rep ? x(r.p.d) + 12 : lx(r.p)},${y(r.p.v)})`)
      .call((q) => q.select("circle").attr("r", 7.5).attr("fill", "none").attr("stroke", (r) => r.col).attr("stroke-width", 2.2))
      .call((q) => q.select("text").attr("y", (r) => (r.t === "R" ? -11 : 19)).attr("text-anchor", "middle").attr("font-size", 10.5)
        .attr("font-weight", 800).attr("fill", (r) => (r.t === "C" ? "#9a6a00" : COLOR.ref)).text((r) => r.t));
  });

  svg.selectAll("text.xt").data([0]).join("text").attr("class", "axis-title xt").attr("x", w - m.r).attr("y", h - 4)
    .attr("text-anchor", "end").text("inference latency d (steps; 1 step = 100 ms) →");

}

function tipHtml(p) {
  const M = METRICS[state.metric];
  const iv = (a) => `<span class="k">[${fmtMetric(state.metric, a.lo, a.signed)}, ${fmtMetric(state.metric, a.hi, a.signed)}]</span>`;
  let html = `<b>${label(p.id)}</b><br><span class="k">${M.label}:</span> ${fmtMetric(state.metric, p.v)} ${iv(p)}`;
  // the difference to R on the same seeds (paired), so R vs C never has to be read off two intervals
  if (p.id !== state.ref) {
    const dlt = aggregate(p.id, state.metric, state.brushed, state.ref);
    if (dlt && dlt.v !== null) html += `<br><span class="k">vs R:</span> <b>${fmtMetric(state.metric, dlt.v, true)}</b> ${iv({ ...dlt, signed: true })} <span class="k">paired, same seeds</span>`;
  }
  if (p.strat !== "sync" && p.d === 0) html += `<br><span class="k">${missingReason(p.strat, 0, p.h)}</span>`;
  return `${html}<br><span class="k">95 % interval over ${p.n} seeds · click = C · shift-click = R</span>`;
}

export function resizeResponse() { render(); }
