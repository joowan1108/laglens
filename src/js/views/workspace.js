// View D: replay of the selected start state, baseline (near-black) and candidate (orange) overlaid
// on one board, showing only what explains the action at time t: the plan being executed, what the
// policy saw when it planned it, and the most recent jump at a chunk switch. Side cards name each run
// and say what it is doing; hovering a card shows that run alone.
import { state, update, bus } from "../state.js";
import { DATA, loadRun, activeChunk, STRAT_LABEL } from "../data.js";
const BALL_R = 25; // Catch the ball: ball radius (scripts/catch_task.py)
import { COLOR, showTip, hideTip, size, teePaths, GOAL, AGENT_R } from "../util.js";

const shortLab = (id) => { const s = DATA.schedById.get(id); return `${STRAT_LABEL[s.strategy]} d${s.latency} h${s.horizon}${s.replicate ? " re-run" : ""}`; };
const SEAM_SHOW = 10; // steps a seam stays visible after it happened

let root, svg, slider, tval, playBtn, timer = null;
let eps = { ref: null, cand: null };
let maxN = 300;

export function initWorkspace() {
  root = d3.select("#workspace");
  svg = root.append("svg");
  const pl = d3.select("#player");
  playBtn = pl.append("button").text("▶ play").on("click", togglePlay);
  pl.append("button").attr("title", "step back (←)").text("◀").on("click", () => step(-1));
  pl.append("button").attr("title", "step forward (→)").text("▶").on("click", () => step(1));
  slider = pl.append("input").attr("type", "range").attr("min", 0).attr("max", 299).attr("value", 0)
    .on("input", (ev) => update({ t: +ev.target.value }));
  tval = pl.append("span").attr("class", "tval");
  bus.on("change.workspace", (keys) => {
    if (keys.has("task") || keys.has("seed") || keys.has("ref") || keys.has("cand")) load();
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
    update({ t: Math.min(hi, state.t + 1) });
  }, 50); // one step per 50 ms = 2× real time (1 step = 100 ms)
}

// The replay opens at the moment that most likely explains the pair, not at t = 0 where both runs
// look the same (a time given in the URL or a brushed window is kept). In this order:
//   1. one run fails and its largest jump at a chunk switch is big (>= 30 px and at least twice the
//      other run's largest): that jump;
//   2. the outcome traces (coverage / distance to the ball) first differ clearly;
//   3. the pushers are first more than 30 px apart.
// The card says which rule fired; it is a pointer for where to look, not a proof of the cause.
const SPLIT = 30;
let opened = null, keepUrlT = new URLSearchParams(location.search).has("t");
function keyMoment(r, c) {
  const big = (e) => e.seams.reduce((m, q) => (!m || q.gap > m.gap ? q : m), null);
  if (r.success !== c.success) {
    const fail = r.success ? c : r, other = r.success ? r : c;
    const j = big(fail), o = big(other);
    if (j && j.gap >= 30 && j.gap >= 2 * (o ? o.gap : 0)) {
      return { t: j.t, why: `largest jump of the failing run, ${j.gap.toFixed(0)} px` };
    }
  }
  const n = Math.min(r.n, c.n), ball = DATA.task === "catch";
  const tr = (e) => (ball ? e.dist : e.cov), lim = ball ? 60 : 0.2;
  for (let t = 1; t < n; t++) {
    const a = tr(r)[t], b = tr(c)[t];
    if (a !== null && b !== null && Math.abs(a - b) > lim) return { t, why: "the outcomes part here" };
  }
  for (let t = 0; t < n; t++) if (Math.hypot(r.ax[t] - c.ax[t], r.ay[t] - c.ay[t]) > SPLIT) return { t, why: "the two runs part here" };
  return null;
}

async function load() {
  if (state.seed === null) return;
  const [r, c] = await Promise.all([loadRun(state.ref), loadRun(state.cand)]);
  eps = { ref: r.bySeed.get(state.seed), cand: c.bySeed.get(state.seed) };
  maxN = Math.max(eps.ref.n, eps.cand.n);
  slider.attr("max", maxN - 1);
  d3.select("#seedLabel").text(`start state ${state.seed}`);
  opened = keyMoment(eps.ref, eps.cand);
  if (keepUrlT || state.win) {
    keepUrlT = false;
    if (state.t > maxN - 1) update({ t: maxN - 1 }); else render();  // a URL t past the end goes to the last step
    return;
  }
  const t0 = opened ? opened.t : 0;
  if (t0 !== state.t) update({ t: t0 }); else render();
}

// What the robot is doing at t, in the vocabulary of the strategies (one short phrase per line).
function status(e, t) {
  // a failed run ends at the deadline: say so on its last step too, with the rule it missed
  const end = e.success ? t >= e.n : t >= e.n - 1;
  if (end) return { k: "done", lines: [e.success ? (DATA.task === "catch" ? "finished: ball touched" : "finished: block in goal")
    : (DATA.task === "catch" ? "8 s deadline passed" : "time out (300 steps)")] };
  if (e.chunk[t] < 0) return { k: "wait", lines: ["idle: waiting for the plan"] };
  // how outdated the plan is: the robot's motion since the picture the current plan was made from
  const c = activeChunk(e, t), to = Math.min(c.t_obs, e.n - 1);
  const moved = Math.hypot(e.ax[t] - e.ax[to], e.ay[t] - e.ay[to]);
  return { k: "act", lines: [`plan from a picture ${e.age[t]} steps old`, `robot moved ${moved.toFixed(0)} px since then`] };
}

let focus = null;  // run hovered in the side cards: the other run is dimmed

function render() {
  if (!eps.ref) return;
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const cardW = Math.max(170, Math.min(240, w * 0.36));
  const side = Math.max(140, Math.min(h - 6, w - cardW - 16));
  const s = d3.scaleLinear().domain([0, 512]).range([0, side]);
  slider.property("value", state.t);
  tval.text(`t = ${state.t} (${(state.t / 10).toFixed(1)} s)`);
  const ball = DATA.task === "catch";
  const runs = [
    { which: "ref", e: eps.ref, id: state.ref, col: COLOR.ref, txt: COLOR.ref, role: "Baseline" },
    { which: "cand", e: eps.cand, id: state.cand, col: COLOR.cand, txt: "#9a6a00", role: "Candidate" },
  ];
  const hcWhich = state.hoverChunk ? state.hoverChunk.which : null;
  const lit = (p) => (!(focus || hcWhich) || (focus || hcWhich) === p.which ? 1 : 0.15);
  const line = d3.line().x((d) => s(d[0])).y((d) => s(d[1]));
  const tee = (x, y, th) => teePaths(x, y, th).map((poly) => line([...poly, poly[0]])).join(" ");

  // one board, both runs on it: same start state, so where they part is seen directly
  const b = svg.selectAll("g.board").data([0]).join((en) => {
    const g = en.append("g").attr("class", "board");
    g.append("clipPath").attr("id", "boardClip").append("rect");
    g.append("rect").attr("class", "bg"); g.append("g").attr("class", "goal"); g.append("g").attr("class", "runs").attr("clip-path", "url(#boardClip)");
    return g;
  }).attr("transform", "translate(2,3)");
  b.select("#boardClip rect").attr("width", side).attr("height", side);  // plans that leave the table are cut at its edge
  b.select(".bg").attr("width", side).attr("height", side).attr("fill", "#fafafb").attr("stroke", "#d0d0d6").attr("rx", 4);
  b.select(".goal").selectAll("path.gl").data(ball ? [] : [0]).join("path").attr("class", "gl").attr("d", tee(...GOAL))
    .attr("fill", "#e9e9ee").attr("stroke", COLOR.goal).attr("stroke-dasharray", "4 3").attr("stroke-width", 1.2);

  const layers = b.select(".runs").selectAll("g.wp").data(runs, (d) => d.which).join((en) => {
    const g = en.append("g").attr("class", "wp");
    g.append("g").attr("class", "block").attr("pointer-events", "none");
    g.append("g").attr("class", "seen").attr("pointer-events", "none");
    g.append("path").attr("class", "pathNow");
    g.append("path").attr("class", "pathWin");
    g.append("g").attr("class", "fan");
    g.append("circle").attr("class", "agent").attr("pointer-events", "none"); // agent and seam never block hover on plan points
    g.append("g").attr("class", "seam").attr("pointer-events", "none");  // over the pusher, so its label stays readable
    return g;
  }).attr("opacity", lit);
  // the focused run is drawn on top
  layers.sort((a, c) => (lit(a) - lit(c)) || (a.which === "ref" ? -1 : 1));

  layers.each(function (p) {
    const g = d3.select(this), e = p.e;
    const t = Math.min(state.t, e.n - 1);
    const st = status(e, state.t);
    p.st = st;
    const bt = Math.min(state.t, e.n);
    // PushT: this run's T-block, outlined in the run's colour; Catch: the ball and the path it rolled
    g.select(".block").selectAll("path.bl").data(ball ? [] : [0]).join("path").attr("class", "bl").attr("d", () => tee(e.bx[t], e.by[t], e.bth[t]))
      .attr("fill", COLOR.block).attr("fill-opacity", 0.55).attr("stroke", p.col).attr("stroke-width", 1.6);
    g.select(".block").selectAll("path.bpath").data(ball ? [0] : []).join("path").attr("class", "bpath")
      .attr("d", () => line(d3.range(bt + 1).map((k) => [e.bx[k], e.by[k]]))).attr("fill", "none")
      .attr("stroke", COLOR.block).attr("stroke-width", 1.2).attr("stroke-dasharray", "2 3");
    g.select(".block").selectAll("circle").data(ball ? [0] : []).join("circle")
      .attr("cx", s(e.bx[bt])).attr("cy", s(e.by[bt])).attr("r", s(BALL_R))
      .attr("fill", COLOR.block).attr("fill-opacity", 0.55).attr("stroke", p.col).attr("stroke-width", 1.6);

    const pts = d3.range(e.n).map((k) => [e.ax[k], e.ay[k]]);
    g.select(".pathNow").attr("d", line(pts.slice(0, t + 1))).attr("fill", "none").attr("stroke", p.col)
      .attr("stroke-opacity", state.win ? 0.18 : 0.35).attr("stroke-width", 1.3);
    g.select(".pathWin").attr("d", state.win ? line(pts.slice(state.win[0], Math.min(e.n, state.win[1] + 1))) : null)
      .attr("fill", "none").attr("stroke", p.col).attr("stroke-opacity", 0.8).attr("stroke-width", 2.2).attr("stroke-linecap", "round");

    // plan being executed (or the chunk hovered in E)
    const hc = state.hoverChunk && state.hoverChunk.which === p.which ? e.chunks[state.hoverChunk.id] : null;
    const ch = hc || activeChunk(e, t);
    drawFan(g.select(".fan"), ch, p, s, line, e);
    drawSeen(g.select(".seen"), ch, p, s, tee, e, t);

    // most recent seam at or before t: hollow = what the old chunk planned next, line = the jump
    let seam = null;
    const prev = ch ? e.chunks[e.chunks.indexOf(ch) - 1] : null;
    if (ch && prev && ch.t0 !== null && ch.t0 <= t && t - ch.t0 < SEAM_SHOW && e.seamAt.has(ch.t0) && prev.execJ.size) {
      const jOld = d3.max([...prev.execJ.keys()]) + 1;
      if (jOld < prev.a.length) seam = { from: prev.a[jOld], to: e.act[ch.t0], gap: e.seamAt.get(ch.t0), age: t - ch.t0 };
    }
    const sg = g.select(".seam").selectAll("g.sm").data(seam && seam.gap >= 8 ? [seam] : []).join((en) => {
      const q = en.append("g").attr("class", "sm"); q.append("line"); q.append("circle"); q.append("text"); return q;
    }).attr("opacity", (d) => 1 - d.age / (SEAM_SHOW + 2));
    sg.select("line").attr("x1", (d) => s(d.from[0])).attr("y1", (d) => s(d.from[1])).attr("x2", (d) => s(d.to[0])).attr("y2", (d) => s(d.to[1]))
      .attr("stroke", COLOR.seam).attr("stroke-width", 2.4).attr("stroke-linecap", "round");
    sg.select("circle").attr("cx", (d) => s(d.from[0])).attr("cy", (d) => s(d.from[1])).attr("r", 4).attr("fill", "#fff").attr("stroke", COLOR.seam).attr("stroke-width", 1.6);
    sg.select("text").attr("x", (d) => s((d.from[0] + d.to[0]) / 2) + 6).attr("y", (d) => s((d.from[1] + d.to[1]) / 2) - 6)
      .attr("font-size", 10.5).attr("font-weight", 700).attr("fill", COLOR.seam).attr("stroke", "#fafafb").attr("stroke-width", 3).attr("paint-order", "stroke")
      .text((d) => `jump ${d.gap.toFixed(0)} px`);

    g.select(".agent").attr("cx", s(e.ax[t])).attr("cy", s(e.ay[t])).attr("r", s(AGENT_R))
      .attr("fill", p.col).attr("fill-opacity", st.k === "wait" ? 0.08 : 0.3).attr("stroke", p.col).attr("stroke-width", 2)
      .attr("stroke-dasharray", st.k === "wait" ? "3 2" : null);
  });

  // side cards: who is who, the outcome, and what each robot is doing now; hover = show only that run
  const cx = side + 16;
  const cards = svg.selectAll("g.card").data(runs, (d) => d.which).join((en) => {
    const g = en.append("g").attr("class", "card").style("cursor", "default");
    g.append("rect").attr("class", "cbg"); g.append("circle").attr("class", "sw");
    g.append("text").attr("class", "c1"); g.append("text").attr("class", "c2"); g.append("text").attr("class", "c3");
    g.append("g").attr("class", "cs");
    return g;
  }).attr("transform", (d, i) => `translate(${cx},${6 + i * 96})`)
    .on("mouseenter", (ev, d) => { focus = d.which; render(); }).on("mouseleave", () => { focus = null; render(); });
  cards.select(".cbg").attr("x", -6).attr("y", -4).attr("width", Math.max(60, w - cx - 2)).attr("height", 88).attr("rx", 6)
    .attr("fill", (d) => (focus === d.which ? "#f4f4f6" : "#fff")).attr("stroke", (d) => d.col).attr("stroke-opacity", 0.5);
  cards.select(".sw").attr("cx", 6).attr("cy", 9).attr("r", 6).attr("fill", (d) => d.col).attr("fill-opacity", 0.3).attr("stroke", (d) => d.col).attr("stroke-width", 2);
  cards.select(".c1").attr("x", 18).attr("y", 13).attr("font-weight", 800).attr("font-size", 12).attr("fill", (d) => d.txt)
    .text((d) => `${d.role} ${d.e.success ? "✓" : "✗"}`);
  cards.select(".c2").attr("x", 0).attr("y", 30).attr("font-size", 11).attr("font-weight", 600).attr("fill", COLOR.ink).text((d) => shortLab(d.id));
  cards.select(".c3").attr("x", 0).attr("y", 46).attr("font-size", 11).attr("fill", COLOR.muted).text((d) => {
    const k = Math.min(state.t, d.e.n);
    return ball ? `distance to ball ${Math.round(d.e.dist[k])} px` : `coverage ${Math.round(d.e.cov[k] * 100)} % (need > 95 %)`;
  });
  cards.select(".cs").selectAll("text").data((d) => d.st.lines.map((l) => ({ l, k: d.st.k }))).join("text")
    .attr("x", 0).attr("y", (q, i) => 62 + i * 14).attr("font-size", 11).attr("fill", (q) => (q.k === "wait" ? "#0072B2" : COLOR.muted))
    .attr("font-weight", (q) => (q.k === "act" ? 400 : 700)).text((q) => q.l);
  svg.selectAll("text.split").data([0]).join("text").attr("class", "split").attr("x", cx).attr("y", 6 + 2 * 96 + 10)
    .attr("font-size", 10.5).attr("fill", COLOR.muted)
    .text(opened === null ? "the two runs stay together" : `t = ${opened.t}: ${opened.why}`)
    .style("cursor", opened === null ? null : "pointer").on("click", () => { if (opened !== null) update({ t: opened.t }); })
    .call((q) => q.selectAll("title").data([0]).join("title").text("where the replay opens: the failing run's largest jump if it stands out, else where the outcomes part; click = go back there"));
}

// What the policy saw: block and pusher in the camera picture the shown chunk was planned from
// (t_obs), with an arrow to where the pusher is now. Sync waits, so the two nearly coincide; under
// async the robot keeps moving and the plan is made for a scene that no longer exists.
function drawSeen(g, ch, p, s, tee, e, t) {
  const to = ch ? Math.min(ch.t_obs, e.n - 1) : null;
  const moved = ch ? Math.hypot(e.ax[t] - e.ax[to], e.ay[t] - e.ay[to]) : 0;
  const data = ch && t > to ? [{ to, moved }] : [];
  const q = g.selectAll("g.sn").data(data).join((en) => {
    const k = en.append("g").attr("class", "sn");
    k.append("path").attr("class", "sb"); k.append("circle").attr("class", "sa"); k.append("line").attr("class", "sl");
    return k;
  });
  // block (PushT) or ball (Catch) where it was in the picture
  const seenObj = (d) => (e.bth ? tee(e.bx[d.to], e.by[d.to], e.bth[d.to])
    : d3.arc()({ innerRadius: 0, outerRadius: s(BALL_R), startAngle: 0, endAngle: 2 * Math.PI }));
  q.select(".sb").attr("d", seenObj).attr("transform", (d) => (e.bth ? null : `translate(${s(e.bx[d.to])},${s(e.by[d.to])})`)).attr("fill", "none")
    .attr("stroke", p.col).attr("stroke-opacity", 0.75).attr("stroke-width", 1.2).attr("stroke-dasharray", "1 2.5").attr("stroke-linecap", "round");
  q.select(".sa").attr("cx", (d) => s(e.ax[d.to])).attr("cy", (d) => s(e.ay[d.to])).attr("r", s(AGENT_R))
    .attr("fill", "none").attr("stroke", p.col).attr("stroke-opacity", 0.7).attr("stroke-width", 1.1).attr("stroke-dasharray", "2 2");
  q.select(".sl").attr("x1", (d) => s(e.ax[d.to])).attr("y1", (d) => s(e.ay[d.to])).attr("x2", s(e.ax[t])).attr("y2", s(e.ay[t]))
    .attr("stroke", p.col).attr("stroke-opacity", 0.8).attr("stroke-width", 1.2).attr("marker-end", null)
    .attr("visibility", (d) => (d.moved >= 3 ? "visible" : "hidden"));

}

// The chunk "fan": 16 planned targets; filled = executed, hollow = never executed (thrown away).
function drawFan(g, ch, p, s, line, e) {
  if (!ch) { g.selectAll("*").remove(); return; }
  const ex = [...ch.execJ.keys()];
  const lastExec = ex.length ? d3.max(ex) : -1, firstExec = ex.length ? d3.min(ex) : 0;
  const pts = ch.a.map((a, j) => ({ a, j, tExec: ch.execJ.get(j) }));
  const seg = (lo, hi) => pts.filter((d) => d.j >= lo && d.j <= hi).map((d) => d.a);
  const parts = [
    { k: "exec", d: seg(firstExec, lastExec), dash: null, w: 2.6, o: 0.85 },
    { k: "post", d: seg(Math.max(lastExec, firstExec), 15), dash: "4 3", w: 1.3, o: 0.8 },
  ].filter((q) => q.d.length > 1);
  g.selectAll("path").data(parts, (d) => d.k).join("path").attr("d", (d) => line(d.d)).attr("fill", "none")
    .attr("stroke", p.col).attr("stroke-opacity", (d) => d.o).attr("stroke-width", (d) => d.w).attr("stroke-dasharray", (d) => d.dash).attr("stroke-linecap", "round");
  g.selectAll("circle").data(pts.filter((d) => d.j >= firstExec), (d) => d.j).join("circle").attr("cx", (d) => s(d.a[0])).attr("cy", (d) => s(d.a[1]))
    .attr("r", (d) => (d.tExec !== undefined ? 3 : 2.6))
    .attr("fill", (d) => (d.tExec !== undefined ? p.col : "#fff")).attr("stroke", (d) => (d.tExec !== undefined ? "#fff" : p.col)).attr("stroke-width", (d) => (d.tExec !== undefined ? 0.7 : 1.2))
    .style("cursor", "help")
    .on("mousemove", (ev, d) => {
      showTip(ev, `<b>${p.which === "ref" ? "baseline" : "candidate"} chunk #${e.chunks.indexOf(ch)}</b>, action ${d.j} of 16<br>
        <span class="k">planned from the observation at</span> t=${ch.t_obs} · <span class="k">available at</span> t=${ch.t_avail}<br>
        ${d.tExec !== undefined ? `<b>executed</b> at t=${d.tExec} (${d.tExec - ch.t_obs} steps after its observation)` : "<b>never executed</b>: replaced by the next chunk"}<br>
        <span class="k">click = jump to that step</span>`);
    })
    .on("mouseleave", hideTip)
    .on("click", (ev, d) => { if (d.tExec !== undefined) update({ t: d.tExec }); });
}

export function resizeWorkspace() { render(); }
