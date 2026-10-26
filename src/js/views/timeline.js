// View D: chunk provenance timeline (R and C lanes on a shared time axis) + coverage curves.
import { state, update, bus } from "../state.js";
import { DATA, loadRun, label } from "../data.js";
import { COLOR, showTip, hideTip, size } from "../util.js";

let root, svg, brush, brushKey = null, eps = null, x;

export function initTimeline() {
  root = d3.select("#timeline");
  svg = root.append("svg");
  const defs = svg.append("defs");
  defs.append("pattern").attr("id", "hatchD").attr("width", 4).attr("height", 4)
    .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)")
    .append("line").attr("y2", 4).attr("stroke", "#9a9aa2").attr("stroke-width", 1.4);
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
  const m = { l: 74, r: 14, t: 8, b: 38 };
  const n = Math.max(eps.ref.n, eps.cand.n);
  x = d3.scaleLinear().domain([0, n]).range([m.l, w - m.r]);
  const laneH = 58, seamH = 22;
  const lanes = [
    { which: "ref", e: eps.ref, id: state.ref, col: COLOR.ref, y: m.t },
    { which: "cand", e: eps.cand, id: state.cand, col: COLOR.cand, y: m.t + laneH + 6 },
  ];
  const covTop = m.t + 2 * laneH + 22, covBot = h - m.b;
  const yc = d3.scaleLinear().domain([0, 1]).range([covBot, covTop]);
  const gmax = d3.max([...eps.ref.seams, ...eps.cand.seams], (s) => s.gap) || 1;
  const ys = d3.scaleLinear().domain([0, gmax]).range([0, seamH]);

  // brush (below the marks so bars stay hoverable)
  const bg = svg.selectAll("g.brush").data([0]).join("g").attr("class", "brush");
  const key = `${w}x${h}|${n}`;
  if (key !== brushKey) { brushKey = key; bindBrush(bg, m, w, covBot, n); }
  const cur = d3.brushSelection(bg.node());
  const want = state.win ? state.win.map(x) : null;
  if (JSON.stringify(cur) !== JSON.stringify(want)) bg.call(brush.move, want);

  const lg = svg.selectAll("g.lane").data(lanes, (d) => d.which).join((en) => {
    const g = en.append("g").attr("class", "lane");
    g.append("text").attr("class", "ln").attr("font-weight", 800).attr("font-size", 12);
    g.append("text").attr("class", "ln2 axis-title").attr("font-size", 9.5);
    g.append("g").attr("class", "idle");
    g.append("g").attr("class", "waits");
    g.append("g").attr("class", "bars");
    g.append("g").attr("class", "seams");
    g.append("line").attr("class", "baseline");
    return g;
  }).attr("transform", (d) => `translate(0,${d.y})`);

  lg.each(function (L) {
    const g = d3.select(this), e = L.e;
    const barY = seamH + 14, barH = 13;
    g.select(".ln").attr("x", 8).attr("y", barY + 10).attr("fill", L.col).text(L.which === "ref" ? "R" : "C");
    g.select(".ln2").attr("x", 22).attr("y", barY + 10).text(e.success ? "✓" : "✗");
    g.select(".baseline").attr("x1", m.l).attr("x2", x(e.n)).attr("y1", barY + barH + 0.5).attr("y2", barY + barH + 0.5).attr("stroke", "#d6d6db");
    // waiting for inference: observation (dot) -> chunk available (tick)
    const waits = e.chunks.filter((c) => c.t_avail <= e.n);
    g.select(".waits").selectAll("g.w").data(waits).join((en) => { const q = en.append("g").attr("class", "w"); q.append("line"); q.append("circle"); return q; })
      .call((q) => q.select("line").attr("x1", (c) => x(c.t_obs)).attr("x2", (c) => x(c.t_avail)).attr("y1", barY - 5).attr("y2", barY - 5)
        .attr("stroke", L.col).attr("stroke-width", 1.2).attr("stroke-opacity", 0.8))
      .call((q) => q.select("circle").attr("cx", (c) => x(c.t_obs)).attr("cy", barY - 5).attr("r", 1.6).attr("fill", L.col));
    // executed span of each chunk
    const bars = e.chunks.map((c, i) => ({ c, i })).filter((d) => d.c.t0 !== null);
    g.select(".bars").selectAll("rect").data(bars, (d) => d.i).join("rect")
      .attr("x", (d) => x(d.c.t0) + 0.4).attr("width", (d) => Math.max(1, x(d.c.t1 + 1) - x(d.c.t0) - 0.8))
      .attr("y", barY).attr("height", barH).attr("rx", 1.5)
      .attr("fill", L.col).attr("fill-opacity", (d) => (state.hoverChunk && state.hoverChunk.which === L.which && state.hoverChunk.id === d.i ? 1 : d.i % 2 ? 0.55 : 0.85))
      .attr("stroke", (d) => (state.hoverChunk && state.hoverChunk.which === L.which && state.hoverChunk.id === d.i ? COLOR.sel : "none"))
      .style("cursor", "pointer")
      .on("mousemove", (ev, d) => {
        if (!state.hoverChunk || state.hoverChunk.id !== d.i || state.hoverChunk.which !== L.which) update({ hoverChunk: { which: L.which, id: d.i } });
        const seamGap = e.seamAt.get(d.c.t0);
        showTip(ev, `<b>${L.which === "ref" ? "R" : "C"} chunk #${d.i}</b><br><span class="k">observed</span> t=${d.c.t_obs} → <span class="k">available</span> t=${d.c.t_avail}<br>
          <span class="k">executed</span> t=${d.c.t0}–${d.c.t1} (${d.c.execJ.size} actions, j=${d3.min([...d.c.execJ.keys()])}–${d3.max([...d.c.execJ.keys()])})<br>
          <span class="k">staleness</span> ${d.c.t0 - d.c.t_obs}–${d.c.t1 - d.c.t_obs} steps<br>
          ${seamGap !== undefined ? `<span class="k">seam at start:</span> <b>${seamGap.toFixed(1)} px</b> jump from the previous plan` : ""}<br>
          <span class="k">click = jump to its first action</span>`);
      })
      .on("mouseleave", () => { hideTip(); update({ hoverChunk: null }); })
      .on("click", (ev, d) => update({ t: d.c.t0 }));
    // idle (held) steps
    g.select(".idle").selectAll("rect").data(runs(e.chunk, (v) => v < 0)).join("rect")
      .attr("x", (r) => x(r[0])).attr("width", (r) => x(r[1]) - x(r[0])).attr("y", barY).attr("height", barH).attr("fill", "url(#hatchD)")
      .on("mousemove", (ev, r) => showTip(ev, `<b>idle</b> t=${r[0]}–${r[1] - 1}: no action available, the robot holds its last target`))
      .on("mouseleave", hideTip);
    // seams: tick length = gap
    g.select(".seams").selectAll("line").data(e.seams).join("line")
      .attr("x1", (s) => x(s.t)).attr("x2", (s) => x(s.t)).attr("y1", barY - 1).attr("y2", (s) => barY - 1 - ys(s.gap) - 1)
      .attr("stroke", COLOR.loss).attr("stroke-width", 2).attr("stroke-linecap", "round")
      .on("mousemove", (ev, s) => showTip(ev, `<b>seam</b> at t=${s.t}: the new chunk's first action is <b>${s.gap.toFixed(1)} px</b> away from what the old chunk planned next`))
      .on("mouseleave", hideTip).on("click", (ev, s) => update({ t: s.t }));
  });

  // seam scale annotation
  svg.selectAll("text.sk").data([0]).join("text").attr("class", "sk axis-title").attr("font-size", 9)
    .attr("x", m.l - 6).attr("y", m.t + 10).attr("text-anchor", "end").text(`seam ↑${gmax.toFixed(0)}px`);
  svg.selectAll("text.sk2").data([0]).join("text").attr("class", "sk2 axis-title").attr("font-size", 9)
    .attr("x", m.l - 6).attr("y", m.t + seamH + 12).attr("text-anchor", "end").text("wait ●—");

  // coverage curves
  const cg = svg.selectAll("g.cov").data([0]).join((en) => {
    const g = en.append("g").attr("class", "cov");
    g.append("g").attr("class", "axis yax"); g.append("g").attr("class", "axis xax");
    g.append("line").attr("class", "thr"); g.append("text").attr("class", "thrt axis-title");
    g.append("text").attr("class", "yt axis-title");
    return g;
  });
  cg.select(".yax").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yc).ticks(3).tickFormat(d3.format(".0%")));
  cg.select(".xax").attr("transform", `translate(0,${covBot})`).call(d3.axisBottom(x).ticks(10));
  cg.select(".thr").attr("x1", m.l).attr("x2", w - m.r).attr("y1", yc(0.95)).attr("y2", yc(0.95)).attr("stroke", COLOR.goal).attr("stroke-dasharray", "4 3");
  cg.select(".thrt").attr("x", w - m.r).attr("y", yc(0.95) - 3).attr("text-anchor", "end").attr("fill", COLOR.goal).text("success: coverage ≥ 95%");
  cg.select(".yt").attr("transform", `translate(14,${(covTop + covBot) / 2}) rotate(-90)`).attr("text-anchor", "middle").text("block–goal coverage");
  svg.selectAll("text.xt").data([0]).join("text").attr("class", "xt axis-title").attr("x", w - m.r).attr("y", h - 2).attr("text-anchor", "end").text("time step t (10 Hz) · drag to brush a window, click to move the cursor");
  const covLine = d3.line().defined((d) => d[1] !== null).x((d) => x(d[0])).y((d) => yc(d[1]));
  cg.selectAll("path.cl").data(lanes, (d) => d.which).join("path").attr("class", "cl")
    .attr("d", (L) => covLine(L.e.cov.map((v, i) => [i, v])))
    .attr("fill", "none").attr("stroke", (L) => L.col).attr("stroke-width", 2).attr("pointer-events", "none");
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
  const { h } = size(root.node());
  svg.selectAll("line.cur").data([state.t]).join("line").attr("class", "cur").attr("pointer-events", "none")
    .attr("x1", (t) => x(t) + 0.5).attr("x2", (t) => x(t) + 0.5).attr("y1", 4).attr("y2", h - 38)
    .attr("stroke", COLOR.sel).attr("stroke-width", 1.5);
}

export function resizeTimeline() { render(); }
