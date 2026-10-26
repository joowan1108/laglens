// View C: juxtaposed replays of the selected seed under R and C, with the chunk "fan".
import { state, update, bus } from "../state.js";
import { DATA, loadRun, activeChunk, pendingChunk, label, STRAT_LABEL } from "../data.js";
const shortLab = (id) => { const s = DATA.schedById.get(id); return `${STRAT_LABEL[s.strategy]} d=${s.latency} h=${s.horizon}`; };
import { COLOR, showTip, hideTip, size, teePaths, GOAL, AGENT_R } from "../util.js";

let root, svg, slider, tval, playBtn, timer = null, speed = 1;
let eps = { ref: null, cand: null };
let maxN = 300;

export function initWorkspace() {
  root = d3.select("#workspace");
  svg = root.append("svg");
  const pl = d3.select("#player");
  playBtn = pl.append("button").text("▶ play").on("click", togglePlay);
  pl.append("button").attr("title", "step back").text("◀").on("click", () => step(-1));
  pl.append("button").attr("title", "step forward").text("▶").on("click", () => step(1));
  slider = pl.append("input").attr("type", "range").attr("min", 0).attr("max", 299).attr("value", 0)
    .on("input", (ev) => update({ t: +ev.target.value }));
  tval = pl.append("span").attr("class", "tval");
  const sp = pl.append("select").attr("title", "playback speed").on("change", (ev) => { speed = +ev.target.value; });
  sp.selectAll("option").data([1, 2, 4]).join("option").attr("value", (d) => d).text((d) => `${d}×`);
  bus.on("change.workspace", (keys) => {
    if (keys.has("seed") || keys.has("ref") || keys.has("cand")) load();
    else if (["t", "win", "hoverChunk"].some((k) => keys.has(k))) render();
  });
  load();
}

export function step(dt) { update({ t: Math.max(0, Math.min(maxN - 1, state.t + dt)) }); }
export function togglePlay() {
  if (timer) { timer.stop(); timer = null; playBtn.text("▶ play"); return; }
  if (state.t >= maxN - 1) update({ t: 0 });
  playBtn.text("❚❚ pause");
  timer = d3.interval(() => {
    const hi = state.win ? state.win[1] : maxN - 1;
    if (state.t >= hi) { togglePlay(); return; }
    update({ t: Math.min(hi, state.t + speed) });
  }, 100);
}

async function load() {
  if (state.seed === null) return;
  const [r, c] = await Promise.all([loadRun(state.ref), loadRun(state.cand)]);
  eps = { ref: r.bySeed.get(state.seed), cand: c.bySeed.get(state.seed) };
  maxN = Math.max(eps.ref.n, eps.cand.n);
  slider.attr("max", maxN - 1);
  d3.select("#seedLabel").text(`initial state #${state.seed}`);
  render();
}

function render() {
  if (!eps.ref) return;
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const gap = 12, head = 34;
  const side = Math.max(120, Math.min((w - gap - 8) / 2, h - head - 4));
  const offX = (w - (2 * side + gap)) / 2;
  const panels = [
    { which: "ref", e: eps.ref, id: state.ref, col: COLOR.ref, x: offX },
    { which: "cand", e: eps.cand, id: state.cand, col: COLOR.cand, x: offX + side + gap },
  ];
  const s = d3.scaleLinear().domain([0, 512]).range([0, side]);
  slider.property("value", state.t);
  tval.text(`t = ${state.t} (${(state.t / 10).toFixed(1)} s)`);

  const pg = svg.selectAll("g.wp").data(panels, (d) => d.which).join((en) => {
    const g = en.append("g").attr("class", "wp");
    g.append("text").attr("class", "wt1").attr("font-weight", 700).attr("font-size", 11.5);
    g.append("text").attr("class", "wt2").attr("font-size", 10.5).attr("fill", "#6b6b72");
    const b = g.append("g").attr("class", "board");
    b.append("rect").attr("class", "bg");
    b.append("g").attr("class", "goal");
    b.append("g").attr("class", "ghost");
    b.append("g").attr("class", "block");
    b.append("path").attr("class", "pathAll");
    b.append("path").attr("class", "pathNow");
    b.append("path").attr("class", "pathWin");
    b.append("g").attr("class", "tail");
    b.append("g").attr("class", "pending");
    b.append("g").attr("class", "fan");
    b.append("line").attr("class", "seam");
    b.append("circle").attr("class", "agent");
    b.append("path").attr("class", "target");
    return g;
  }).attr("transform", (d) => `translate(${d.x},0)`);

  pg.each(function (p) {
    const g = d3.select(this), e = p.e;
    const t = Math.min(state.t, e.n - 1);
    const finished = state.t >= e.n;
    const cov = e.cov[Math.min(state.t, e.n)];
    const tt = e.chunk[t] >= 0 ? `chunk #${e.chunk[t]}, j=${e.j[t]} · stale ${e.age[t]} steps` : "idle (waiting for inference)";
    g.select(".wt1").attr("y", 13).attr("fill", p.col)
      .text(`${p.which === "ref" ? "R" : "C"} · ${shortLab(p.id)}  ${e.success ? "✓ success" : "✗ failure"}`);
    g.select(".wt2").attr("y", 27).text(finished ? `finished t=${e.n} · coverage ${Math.round((cov ?? 0) * 100)}%`
      : `coverage ${cov === null ? "–" : Math.round(cov * 100) + "%"} · ${tt}`);
    const b = g.select(".board").attr("transform", `translate(0,${head})`);
    b.select(".bg").attr("width", side).attr("height", side).attr("fill", "#fafafb").attr("stroke", "#d0d0d6").attr("rx", 4);
    const line = d3.line().x((d) => s(d[0])).y((d) => s(d[1]));
    const tee = (x, y, th) => teePaths(x, y, th).map((poly) => line([...poly, poly[0]])).join(" ");
    b.select(".goal").selectAll("path").data([0]).join("path").attr("d", tee(...GOAL))
      .attr("fill", COLOR.goal).attr("fill-opacity", 0.12).attr("stroke", COLOR.goal).attr("stroke-dasharray", "5 3").attr("stroke-width", 1.5);
    b.select(".ghost").selectAll("path").data([0]).join("path").attr("d", tee(e.bx[0], e.by[0], e.bth[0]))
      .attr("fill", "none").attr("stroke", "#c2c4ca").attr("stroke-dasharray", "2 2");
    b.select(".block").selectAll("path").data([0]).join("path").attr("d", tee(e.bx[t], e.by[t], e.bth[t]))
      .attr("fill", COLOR.block).attr("fill-opacity", 0.85).attr("stroke", "#7b7f88");

    const pts = d3.range(e.n).map((k) => [e.ax[k], e.ay[k]]);
    b.select(".pathAll").attr("d", line(pts)).attr("fill", "none").attr("stroke", p.col).attr("stroke-opacity", 0.12).attr("stroke-width", 1.5);
    b.select(".pathNow").attr("d", line(pts.slice(0, t + 1))).attr("fill", "none").attr("stroke", p.col).attr("stroke-opacity", state.win ? 0.25 : 0.75).attr("stroke-width", 1.6);
    b.select(".pathWin").attr("d", state.win ? line(pts.slice(state.win[0], Math.min(e.n, state.win[1] + 1))) : null)
      .attr("fill", "none").attr("stroke", p.col).attr("stroke-width", 3).attr("stroke-linecap", "round");

    // fan: hovered chunk (from timeline) or the chunk executing at t
    const hc = state.hoverChunk && state.hoverChunk.which === p.which ? e.chunks[state.hoverChunk.id] : null;
    const ch = hc || activeChunk(e, t);
    const prev = ch ? e.chunks[e.chunks.indexOf(ch) - 1] : null;
    const tail = prev ? prev.a.map((a, j) => ({ a, j })).filter((d) => d.j > d3.max([...prev.execJ.keys()])) : [];
    b.select(".tail").selectAll("path").data(tail.length > 1 ? [tail] : []).join("path")
      .attr("d", (d) => line(d.map((q) => q.a))).attr("fill", "none").attr("stroke", "#8d8d96").attr("stroke-dasharray", "4 3").attr("stroke-width", 1.3);
    const pend = !hc ? pendingChunk(e, t) : null;
    b.select(".pending").selectAll("path").data(pend ? [pend] : []).join("path")
      .attr("d", (d) => line(d.a.slice(1))).attr("fill", "none").attr("stroke", "#8d8d96").attr("stroke-dasharray", "1 3").attr("stroke-width", 2).attr("stroke-linecap", "round");
    drawFan(b.select(".fan"), ch, p, s, line, e);

    // most recent seam at or before t: segment from the old plan to the new action
    let seam = null;
    if (ch && prev && ch.t0 !== null && ch.t0 <= t && e.seamAt.has(ch.t0)) {
      const jOld = d3.max([...prev.execJ.keys()]) + 1;
      if (jOld < prev.a.length) seam = { from: prev.a[jOld], to: e.act[ch.t0], age: t - ch.t0, gap: e.seamAt.get(ch.t0) };
    }
    b.select(".seam").attr("stroke", COLOR.loss).attr("stroke-width", 3).attr("stroke-linecap", "round")
      .attr("opacity", seam ? Math.max(0.25, 1 - seam.age / 12) : 0)
      .attr("x1", seam ? s(seam.from[0]) : 0).attr("y1", seam ? s(seam.from[1]) : 0)
      .attr("x2", seam ? s(seam.to[0]) : 0).attr("y2", seam ? s(seam.to[1]) : 0);

    b.select(".agent").attr("cx", s(e.ax[t])).attr("cy", s(e.ay[t])).attr("r", s(AGENT_R))
      .attr("fill", p.col).attr("fill-opacity", 0.35).attr("stroke", p.col).attr("stroke-width", 2);
    const [tx, ty] = e.act[t];
    b.select(".target").attr("d", `M${s(tx) - 4},${s(ty) - 4}L${s(tx) + 4},${s(ty) + 4}M${s(tx) - 4},${s(ty) + 4}L${s(tx) + 4},${s(ty) - 4}`)
      .attr("stroke", p.col).attr("stroke-width", 2);
  });
}

function drawFan(g, ch, p, s, line, e) {
  if (!ch) { g.selectAll("*").remove(); return; }
  const lastExec = ch.execJ.size ? d3.max([...ch.execJ.keys()]) : -1;
  const firstExec = ch.execJ.size ? d3.min([...ch.execJ.keys()]) : 99;
  const pts = ch.a.map((a, j) => ({ a, j, tExec: ch.execJ.get(j) }));
  const seg = (lo, hi) => pts.filter((d) => d.j >= lo && d.j <= hi).map((d) => d.a);
  const lum = d3.scaleLinear().domain([0, 15]).range([0.15, 0.85]);
  const base = d3.hsl(p.col);
  const colJ = (j) => d3.hsl(base.h || 0, p.which === "ref" ? 0 : base.s, lum(j)).toString();
  const parts = [
    { k: "pre", d: seg(0, firstExec), dash: "2 3", w: 1.2 },
    { k: "exec", d: seg(firstExec, lastExec), dash: null, w: 4 },
    { k: "post", d: seg(lastExec, 15), dash: "5 3", w: 1.4 },
  ].filter((q) => q.d.length > 1);
  g.selectAll("path").data(parts, (d) => d.k).join("path").attr("d", (d) => line(d.d)).attr("fill", "none")
    .attr("stroke", p.col).attr("stroke-opacity", (d) => (d.k === "exec" ? 0.55 : 0.9))
    .attr("stroke-width", (d) => d.w).attr("stroke-dasharray", (d) => d.dash).attr("stroke-linecap", "round");
  g.selectAll("circle").data(pts, (d) => d.j).join("circle").attr("cx", (d) => s(d.a[0])).attr("cy", (d) => s(d.a[1]))
    .attr("r", (d) => (d.tExec !== undefined ? 3.2 : 2.4)).attr("fill", (d) => colJ(d.j)).attr("stroke", "#fff").attr("stroke-width", 0.6)
    .style("cursor", "help")
    .on("mousemove", (ev, d) => {
      const when = ch.t_obs + d.j - 1;
      showTip(ev, `<b>${p.which === "ref" ? "R" : "C"} chunk #${e.chunks.indexOf(ch)}</b>, index j=${d.j}<br>
        <span class="k">planned from observation at</span> t=${ch.t_obs}, <span class="k">available at</span> t=${ch.t_avail}<br>
        <span class="k">intended for</span> t≈${when}<br>
        ${d.tExec !== undefined ? `<b>executed</b> at t=${d.tExec} (staleness ${d.tExec - ch.t_obs} steps)` : "<b>never executed</b> (replaced by the next chunk)"}<br>
        <span class="k">target</span> (${d.a[0].toFixed(0)}, ${d.a[1].toFixed(0)}) px`);
    })
    .on("mouseleave", hideTip)
    .on("click", (ev, d) => { if (d.tExec !== undefined) update({ t: d.tExec }); });
}

export function resizeWorkspace() { render(); }
export function maxSteps() { return maxN; }
