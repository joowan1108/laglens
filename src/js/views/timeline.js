// View D: execution timeline on a shared time axis. For R and C, two tracks:
//   think — when an inference is running (observation → chunk available)
//   act   — which chunk the executed action came from (hatched = robot idle), with seam
//           lollipops above it (stem length = seam gap, common scale for R and C).
// Sync shows "think" and "act" alternating (idle while thinking); async shows them overlapping.
// Below: block–goal coverage of both runs.
import { state, update, bus } from "../state.js";
import { loadRun } from "../data.js";
import { COLOR, showTip, hideTip, size } from "../util.js";

let root, svg, brush, brushKey = null, eps = null, x, curBot = 0;

export function initTimeline() {
  root = d3.select("#timeline");
  svg = root.append("svg");
  const defs = svg.append("defs");
  defs.append("pattern").attr("id", "hatchD").attr("width", 4).attr("height", 4)
    .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)")
    .append("line").attr("y2", 4).attr("stroke", "#a9a9b1").attr("stroke-width", 1.2);
  bus.on("change.timeline", async (keys) => {
    if (keys.has("seed") || keys.has("ref") || keys.has("cand")) await load();
    else if (keys.has("t")) cursor();
    else if (keys.has("win") || keys.has("hoverChunk")) render();
  });
  load();
}

async function load() {
  if (state.seed === null) return;
  const [r, c] = await Promise.all([loadRun(state.ref), loadRun(state.cand)]);
  eps = { ref: r.bySeed.get(state.seed), cand: c.bySeed.get(state.seed) };
  render();
}

function runs(arr, pred) {
  const out = []; let s = null;
  arr.forEach((v, i) => { if (pred(v) && s === null) s = i; if (!pred(v) && s !== null) { out.push([s, i]); s = null; } });
  if (s !== null) out.push([s, arr.length]);
  return out;
}

function render() {
  if (!eps) return;
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const m = { l: 62, r: 12, t: 6, b: 32 };
  const n = Math.max(eps.ref.n, eps.cand.n);
  x = d3.scaleLinear().domain([0, n]).range([m.l, w - m.r]);
  // lane geometry: seam strip, think track, act track
  const seamH = 20, thinkH = 5, actH = 12, laneGap = 12;
  const laneH = seamH + thinkH + 4 + actH;
  const lanes = [
    { which: "ref", e: eps.ref, col: COLOR.ref, txt: COLOR.ref, y: m.t },
    { which: "cand", e: eps.cand, col: COLOR.cand, txt: "#9a6a00", y: m.t + laneH + laneGap },
  ];
  const covTop = m.t + 2 * laneH + laneGap + 26, covBot = h - m.b;
  curBot = covBot;
  const yc = d3.scaleLinear().domain([0, 1]).range([covBot, covTop]);
  const gmax = Math.max(50, d3.max([...eps.ref.seams, ...eps.cand.seams], (s) => s.gap) || 0);
  const ys = d3.scaleLinear().domain([0, gmax]).range([0, seamH - 2]);

  // brush below the marks so bars stay hoverable
  const bg = svg.selectAll("g.brush").data([0]).join("g").attr("class", "brush");
  const key = `${w}x${h}|${n}`;
  if (key !== brushKey) { brushKey = key; bindBrush(bg, m, w, covBot, n); }
  const cur = d3.brushSelection(bg.node());
  const want = state.win ? state.win.map(x) : null;
  if (JSON.stringify(cur) !== JSON.stringify(want)) bg.call(brush.move, want);

  const lg = svg.selectAll("g.lane").data(lanes, (d) => d.which).join((en) => {
    const g = en.append("g").attr("class", "lane");
    g.append("text").attr("class", "ln");
    g.append("text").attr("class", "tk axis-title tk1").text("think");
    g.append("text").attr("class", "tk axis-title tk2").text("act");
    g.append("line").attr("class", "seamBase");
    g.append("g").attr("class", "think");
    g.append("g").attr("class", "idle");
    g.append("g").attr("class", "bars");
    g.append("g").attr("class", "seams");
    return g;
  }).attr("transform", (d) => `translate(0,${d.y})`);

  lg.each(function (L) {
    const g = d3.select(this), e = L.e;
    const thinkY = seamH + 1, actY = seamH + thinkH + 4;
    g.select(".ln").attr("x", 4).attr("y", actY + 10).attr("font-weight", 800).attr("font-size", 12).attr("fill", L.txt)
      .text(`${L.which === "ref" ? "R" : "C"} ${e.success ? "✓" : "✗"}`);
    g.select(".tk1").attr("x", m.l - 5).attr("y", thinkY + 5).attr("text-anchor", "end").attr("font-size", 9);
    g.select(".tk2").attr("x", m.l - 5).attr("y", actY + 9).attr("text-anchor", "end").attr("font-size", 9);
    g.select(".seamBase").attr("x1", m.l).attr("x2", x(e.n)).attr("y1", seamH).attr("y2", seamH).attr("stroke", "#e4e4e9");

    // think: inference intervals
    const inf = e.chunks.map((c, i) => ({ c, i })).filter((d) => d.c.t_obs < e.n);
    g.select(".think").selectAll("rect").data(inf, (d) => d.i).join("rect")
      .attr("x", (d) => x(d.c.t_obs) + 0.3).attr("width", (d) => Math.max(1, x(Math.min(d.c.t_avail, e.n)) - x(d.c.t_obs) - 0.6))
      .attr("y", thinkY).attr("height", thinkH).attr("rx", 1).attr("fill", L.col).attr("fill-opacity", 0.45)
      .on("mousemove", (ev, d) => showTip(ev, `<b>inference for chunk #${d.i}</b><br>observation at t=${d.c.t_obs}, chunk available at t=${d.c.t_avail}`))
      .on("mouseleave", hideTip);

    // act: executed span of each chunk (alternating tints mark chunk boundaries)
    const hov = (d) => state.hoverChunk && state.hoverChunk.which === L.which && state.hoverChunk.id === d.i;
    const bars = e.chunks.map((c, i) => ({ c, i })).filter((d) => d.c.t0 !== null);
    g.select(".bars").selectAll("rect").data(bars, (d) => d.i).join("rect")
      .attr("x", (d) => x(d.c.t0) + 0.4).attr("width", (d) => Math.max(1, x(d.c.t1 + 1) - x(d.c.t0) - 0.8))
      .attr("y", actY).attr("height", actH).attr("rx", 1.5)
      .attr("fill", L.col).attr("fill-opacity", (d) => (hov(d) ? 1 : d.i % 2 ? 0.5 : 0.8))
      .attr("stroke", (d) => (hov(d) ? COLOR.sel : "none")).attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mousemove", (ev, d) => {
        if (!hov(d)) update({ hoverChunk: { which: L.which, id: d.i } });
        const seamGap = e.seamAt.get(d.c.t0);
        const js = [...d.c.execJ.keys()];
        showTip(ev, `<b>${L.which === "ref" ? "R" : "C"} chunk #${d.i}</b> (plan shown in C)<br><span class="k">think</span> t=${d.c.t_obs} → ${d.c.t_avail} · <span class="k">act</span> t=${d.c.t0}–${d.c.t1}<br>
          <span class="k">executed actions</span> ${d3.min(js)}–${d3.max(js)} of 16 · <span class="k">staleness</span> ${d.c.t0 - d.c.t_obs}–${d.c.t1 - d.c.t_obs} steps<br>
          ${seamGap !== undefined ? `<span class="k">seam at its start:</span> <b>${seamGap.toFixed(1)} px</b>` : ""}<br><span class="k">click = jump to its first action</span>`);
      })
      .on("mouseleave", () => { hideTip(); update({ hoverChunk: null }); })
      .on("click", (ev, d) => update({ t: d.c.t0 }));
    g.select(".idle").selectAll("rect").data(runs(e.chunk.slice(0, e.n), (v) => v < 0)).join("rect")
      .attr("x", (r) => x(r[0])).attr("width", (r) => x(r[1]) - x(r[0])).attr("y", actY).attr("height", actH).attr("fill", "url(#hatchD)")
      .on("mousemove", (ev, r) => showTip(ev, `<b>idle</b> t=${r[0]}–${r[1] - 1}: no action available, the robot holds still`))
      .on("mouseleave", hideTip);

    // seams: lollipops, stem length = gap
    const sm = g.select(".seams").selectAll("g.sp").data(e.seams.filter((s) => s.gap >= 1), (s) => s.t).join((en) => {
      const q = en.append("g").attr("class", "sp").style("cursor", "pointer"); q.append("line"); q.append("circle"); return q;
    }).attr("transform", (s) => `translate(${x(s.t)},0)`);
    sm.select("line").attr("y1", seamH).attr("y2", (s) => seamH - ys(s.gap)).attr("stroke", COLOR.seam).attr("stroke-width", 1.2);
    sm.select("circle").attr("cy", (s) => seamH - ys(s.gap)).attr("r", 1.7).attr("fill", COLOR.seam);
    sm.on("mousemove", (ev, s) => showTip(ev, `<b>seam</b> at t=${s.t}: the new chunk's first action is <b>${s.gap.toFixed(1)} px</b> away from what the old chunk planned next`))
      .on("mouseleave", hideTip).on("click", (ev, s) => update({ t: s.t }));
  });

  svg.selectAll("text.sk").data([0]).join("text").attr("class", "sk axis-title").attr("font-size", 9).attr("fill", COLOR.seam)
    .attr("x", m.l - 5).attr("y", m.t + 8).attr("text-anchor", "end").text(`seam ${gmax.toFixed(0)}px`);

  // coverage curves
  const cg = svg.selectAll("g.cov").data([0]).join((en) => {
    const g = en.append("g").attr("class", "cov");
    g.append("g").attr("class", "gridline grid");
    g.append("g").attr("class", "axis yax"); g.append("g").attr("class", "axis xax");
    g.append("line").attr("class", "thr"); g.append("text").attr("class", "thrt axis-title");
    g.append("text").attr("class", "yt axis-title");
    return g;
  });
  cg.select(".grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yc).ticks(2).tickSize(-(w - m.l - m.r)).tickFormat("")).call((q) => q.select(".domain").remove());
  cg.select(".yax").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yc).ticks(2).tickSize(3).tickFormat(d3.format(".0%"))).call((q) => q.select(".domain").remove());
  cg.select(".xax").attr("transform", `translate(0,${covBot})`).call(d3.axisBottom(x).ticks(10).tickSize(3)).call((q) => q.select(".domain").attr("stroke", "#c9c9cf"));
  cg.select(".thr").attr("x1", m.l).attr("x2", w - m.r).attr("y1", yc(0.95)).attr("y2", yc(0.95)).attr("stroke", "#77777f").attr("stroke-dasharray", "4 3");
  cg.select(".thrt").attr("x", w - m.r).attr("y", yc(0.95) - 3).attr("text-anchor", "end").text("success threshold 95 %");
  cg.select(".yt").attr("x", 4).attr("y", covTop - 8).text("block–goal coverage");
  svg.selectAll("text.xt").data([0]).join("text").attr("class", "xt axis-title").attr("x", w - m.r).attr("y", h - 2).attr("text-anchor", "end")
    .text("time step t (10 Hz) · drag = select window · click = move cursor");
  const covLine = d3.line().defined((d) => d[1] !== null).x((d) => x(d[0])).y((d) => yc(d[1]));
  cg.selectAll("path.cl").data(lanes, (d) => d.which).join("path").attr("class", "cl")
    .attr("d", (L) => covLine(L.e.cov.map((v, i) => [i, v])))
    .attr("fill", "none").attr("stroke", (L) => L.col).attr("stroke-width", 1.8).attr("pointer-events", "none");
  cursor();
}

function bindBrush(bg, m, w, covBot, n) {
  brush = d3.brushX().extent([[m.l, m.t], [w - m.r, covBot]])
    .on("end", (ev) => {
      if (!ev.sourceEvent) return;
      if (!ev.selection) {
        const [mx] = d3.pointer(ev.sourceEvent, svg.node());
        update({ win: null, t: Math.max(0, Math.min(n - 1, Math.round(x.invert(mx)))) });
        return;
      }
      const [a, b] = ev.selection.map((v) => Math.round(x.invert(v)));
      update({ win: [a, Math.max(a + 1, b)], t: a });
    });
  bg.call(brush);
}

function cursor() {
  if (!eps || !x) return;
  svg.selectAll("line.cur").data([state.t]).join("line").attr("class", "cur").attr("pointer-events", "none")
    .attr("x1", (t) => x(t) + 0.5).attr("x2", (t) => x(t) + 0.5).attr("y1", 2).attr("y2", curBot)
    .attr("stroke", COLOR.sel).attr("stroke-width", 1.2);
}

export function resizeTimeline() { render(); }
