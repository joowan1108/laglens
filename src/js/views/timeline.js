// View E: execution timeline on a shared time axis. For baseline and candidate, three tracks:
//   jumps  — at every chunk switch, the jump between old and new plan as a magenta bar (px, shared
//            scale), over a grey area = how far the commanded position moves in an ordinary step
//   think  — when an inference is running (observation → chunk available)
//   act    — which chunk the executed action came from (hatched = robot idle)
// Sync shows "think" and "act" alternating (idle while thinking); async shows them overlapping.
// Below: block–goal coverage of both runs.
import { state, update, bus } from "../state.js";
import { DATA, loadRun } from "../data.js";
import { COLOR, showTip, hideTip, size } from "../util.js";

let root, svg, brush, brushKey = null, eps = null, x, curBot = 0, geom = null;

export function initTimeline() {
  root = d3.select("#timeline");
  svg = root.append("svg");
  const defs = svg.append("defs");
  defs.append("pattern").attr("id", "hatchD").attr("width", 4).attr("height", 4)
    .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)")
    .append("line").attr("y2", 4).attr("stroke", "#a9a9b1").attr("stroke-width", 1.2);
  bus.on("change.timeline", async (keys) => {
    if (keys.has("task") || keys.has("seed") || keys.has("ref") || keys.has("cand")) await load();
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
  const m = { l: 80, r: 12, t: 6, b: 32 };
  const n = Math.max(eps.ref.n, eps.cand.n);
  x = d3.scaleLinear().domain([0, n]).range([m.l, w - m.r]);
  // lane geometry: motion track, think track, act track
  // the motion track grows with the panel so jumps stay readable next to normal movement
  const motH = Math.round(Math.max(26, Math.min(70, (h - m.t - m.b) * 0.16))), thinkH = 8, actH = 12, laneGap = 12;
  const laneH = motH + 4 + thinkH + 4 + actH;
  const lanes = [
    { which: "ref", e: eps.ref, col: COLOR.ref, txt: COLOR.ref, y: m.t },
    { which: "cand", e: eps.cand, col: COLOR.cand, txt: "#9a6a00", y: m.t + laneH + laneGap },
  ];
  const covTop = m.t + 2 * laneH + laneGap + 26, covBot = h - m.b;
  curBot = covBot;
  // outcome track: block–goal coverage (PushT) or pusher–ball distance (Catch), with its success line
  const ball = DATA.task === "catch";
  const yc = ball
    ? d3.scaleLinear().domain([0, d3.max([eps.ref, eps.cand], (e) => d3.max(e.dist))]).nice().range([covBot, covTop])
    : d3.scaleLinear().domain([0, 1]).range([covBot, covTop]);
  const thr = ball ? 40 : 0.95;  // Catch: touching = centre distance <= pusher 15 px + ball 25 px
  for (const e of [eps.ref, eps.cand]) if (!e.mot) e.mot = motion(e);
  const gmax = Math.max(30, d3.max([eps.ref, eps.cand], (e) => d3.max(e.seams, (s) => s.gap) || 0));
  const ys = d3.scaleLinear().domain([0, gmax]).range([0, motH - 2]);

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
    g.append("text").attr("class", "tk axis-title tk0").text("jumps");
    g.append("text").attr("class", "tk axis-title tk1").text("think");
    g.append("text").attr("class", "tk axis-title tk2").text("act");
    g.append("path").attr("class", "mot");
    g.append("line").attr("class", "seamBase");
    g.append("g").attr("class", "think");
    g.append("g").attr("class", "idle");
    g.append("g").attr("class", "bars");
    g.append("g").attr("class", "seams");
    return g;
  }).attr("transform", (d) => `translate(0,${d.y})`);

  lg.each(function (L) {
    const g = d3.select(this), e = L.e;
    const thinkY = motH + 4, actY = motH + 4 + thinkH + 4;
    g.select(".ln").attr("x", 4).attr("y", 10).attr("font-weight", 800).attr("font-size", 11.5).attr("fill", L.txt)
      .text(`${L.which === "ref" ? "baseline" : "candidate"} ${e.success ? "✓" : "✗"}`);
    g.select(".tk0").attr("x", m.l - 5).attr("y", Math.max(motH - 2, 32)).attr("text-anchor", "end").attr("font-size", 9).text("jumps");
    // scale of the jump track, written at its top left, outside the plot (the time cursor never covers it)
    g.selectAll("text.sk").data([0]).join("text").attr("class", "sk axis-title").attr("x", m.l - 5).attr("y", Math.max(motH - 13, 21)).attr("text-anchor", "end")
      .attr("font-size", 8.5).attr("fill", COLOR.seam).text(`top = ${gmax.toFixed(0)} px`);
    // ordinary motion: commanded displacement per step, on the jump scale (clipped at the top)
    const area = d3.area().x((v, t) => x(t + 0.5)).y0(motH).y1((v) => motH - Math.min(ys(v), motH - 2)).curve(d3.curveStepAfter);
    g.select(".mot").attr("d", area(e.mot)).attr("fill", "#dcdce2").attr("pointer-events", "none");
    g.select(".tk1").attr("x", m.l - 5).attr("y", thinkY + 5).attr("text-anchor", "end").attr("font-size", 9);
    g.select(".tk2").attr("x", m.l - 5).attr("y", actY + 9).attr("text-anchor", "end").attr("font-size", 9);
    g.select(".seamBase").attr("x1", m.l).attr("x2", x(e.n)).attr("y1", motH).attr("y2", motH).attr("stroke", "#d4d4da");

    // think: inference intervals
    const inf = e.chunks.map((c, i) => ({ c, i })).filter((d) => d.c.t_obs < e.n);
    g.select(".think").selectAll("rect").data(inf, (d) => d.i).join("rect")
      .attr("x", (d) => x(d.c.t_obs) + 0.3).attr("width", (d) => Math.max(1, x(Math.min(d.c.t_avail, e.n)) - x(d.c.t_obs) - 0.6))
      .attr("y", thinkY).attr("height", thinkH).attr("rx", 1).attr("fill", L.col).attr("fill-opacity", 0.45)
      .on("mousemove", (ev, d) => showTip(ev, `<b>inference for chunk #${d.i}</b><br>camera picture at t=${d.c.t_obs}, chunk ready at t=${d.c.t_avail}<br>the robot moved <b>${Math.hypot(e.ax[Math.min(d.c.t_avail, e.n - 1)] - e.ax[d.c.t_obs], e.ay[Math.min(d.c.t_avail, e.n - 1)] - e.ay[d.c.t_obs]).toFixed(1)} px</b> meanwhile`))
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
        showTip(ev, `<b>${L.which === "ref" ? "baseline" : "candidate"} chunk #${d.i}</b> (plan shown in view D)<br><span class="k">think</span> t=${d.c.t_obs} → ${d.c.t_avail} · <span class="k">act</span> t=${d.c.t0}–${d.c.t1}<br>
          <span class="k">executed actions</span> ${d3.min(js)}–${d3.max(js)} of 16 · <span class="k">picture age</span> ${d.c.t0 - d.c.t_obs}–${d.c.t1 - d.c.t_obs} steps<br>
          ${seamGap !== undefined ? `<span class="k">boundary discontinuity at its start:</span> <b>${seamGap.toFixed(1)} px</b>` : ""}<br><span class="k">click = jump to its first action</span>`);
      })
      .on("mouseleave", () => { hideTip(); update({ hoverChunk: null }); })
      .on("click", (ev, d) => update({ t: d.c.t0 }));
    g.select(".idle").selectAll("rect").data(runs(e.chunk.slice(0, e.n), (v) => v < 0)).join("rect")
      .attr("x", (r) => x(r[0])).attr("width", (r) => x(r[1]) - x(r[0])).attr("y", actY).attr("height", actH).attr("fill", "url(#hatchD)")
      .on("mousemove", (ev, r) => showTip(ev, `<b>idle</b> t=${r[0]}–${r[1] - 1}: no action available, the robot holds still`))
      .on("mouseleave", hideTip);

    // jumps at chunk switches: magenta bars, height = gap between old and new plan
    const normal = d3.median(e.mot.filter((v, t) => v > 0 && !e.seamAt.has(t))) || 0;
    const bw = Math.max(1.6, x(1) - x(0) - 0.4);
    g.select(".seams").selectAll("rect.sp").data(e.seams.filter((s) => s.gap >= 1), (s) => s.t).join("rect").attr("class", "sp")
      .attr("x", (s) => x(s.t) + (x(1) - x(0) - bw) / 2).attr("width", bw)
      .attr("y", (s) => motH - ys(s.gap)).attr("height", (s) => Math.max(1, ys(s.gap)))
      .attr("fill", COLOR.seam).style("cursor", "pointer")
      .on("mousemove", (ev, s) => showTip(ev, `<b>jump at a chunk switch</b> (boundary discontinuity) at t=${s.t}: the new chunk's first action is <b>${s.gap.toFixed(1)} px</b> away from what the old chunk planned next<br><span class="k">normal motion in this run:</span> ≈ ${normal.toFixed(1)} px per step`))
      .on("mouseleave", hideTip).on("click", (ev, s) => update({ t: s.t }));
  });

  geom = { lanes, thinkY: motH + 4, thinkH, actY: motH + 4 + thinkH + 4, actH };

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
  cg.select(".yax").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yc).ticks(2).tickSize(3).tickFormat(ball ? (v) => `${v} px` : d3.format(".0%"))).call((q) => q.select(".domain").remove());
  cg.select(".xax").attr("transform", `translate(0,${covBot})`).call(d3.axisBottom(x).ticks(10).tickSize(3)).call((q) => q.select(".domain").attr("stroke", "#c9c9cf"));
  cg.select(".thr").attr("x1", m.l).attr("x2", w - m.r).attr("y1", yc(thr)).attr("y2", yc(thr)).attr("stroke", "#77777f").attr("stroke-dasharray", "4 3");
  cg.select(".thrt").attr("x", m.l + 4).attr("y", yc(thr) - 3).attr("text-anchor", "start").text(ball ? "touch: within 40 px" : "success threshold 95 %");
  cg.select(".yt").attr("x", 4).attr("y", covTop - 8).text(ball ? "pusher–ball distance" : "block–goal coverage");
  svg.selectAll("text.xt").data([0]).join("text").attr("class", "xt axis-title").attr("x", w - m.r).attr("y", h - 2).attr("text-anchor", "end")
    .text("time step t (10 Hz) · drag = select window · click = move cursor");
  const covLine = d3.line().defined((d) => d[1] !== null).x((d) => x(d[0])).y((d) => yc(d[1]));
  cg.selectAll("path.cl").data(lanes, (d) => d.which).join("path").attr("class", "cl")
    .attr("d", (L) => covLine((ball ? L.e.dist : L.e.cov).map((v, i) => [i, v])))
    .attr("fill", "none").attr("stroke", (L) => L.col).attr("stroke-width", 1.8).attr("pointer-events", "none");
  // where each run ends, in numbers: a near miss (e.g. 90 % coverage) must not look like a success
  const fin = (e) => { const a = ball ? e.dist : e.cov; return a[a.length - 1]; };
  const endRight = (L) => x(L.e.n) > w - m.r - 60;
  const bothRight = lanes.every(endRight) && Math.abs(yc(fin(lanes[0].e)) - yc(fin(lanes[1].e))) < 13;
  cg.selectAll("text.fin").data(lanes, (d) => d.which).join("text").attr("class", "fin").attr("pointer-events", "none")
    .attr("x", (L) => (endRight(L) ? x(L.e.n) - 4 : x(L.e.n) + 5)).attr("text-anchor", (L) => (endRight(L) ? "end" : "start"))
    .attr("y", (L, i) => Math.max(covTop + 9, Math.min(covBot - 3, yc(fin(L.e)) + (bothRight ? (i ? 13 : -5) : endRight(L) ? (ball ? -5 : 13) : 4))))
    .attr("font-size", 10.5).attr("font-weight", 800).attr("fill", (L) => L.txt).attr("stroke", "#fff").attr("stroke-width", 3).attr("paint-order", "stroke")
    .text((L) => `${ball ? `${Math.round(fin(L.e))} px` : `${Math.round(fin(L.e) * 100)} %`} ${L.e.success ? "✓" : "✗"}`);
  cursor();
}

// Commanded displacement per step (px): |a_t − a_{t−1}|; 0 while idle.
function motion(e) {
  return d3.range(e.n).map((t) => {
    const a = e.act[t], b = e.act[t - 1];
    return t && a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
  });
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
