// View C: juxtaposed replays of the selected seed under R and C (same scale, same seed), showing
// only what explains the action at time t: the plan being executed, the plan being computed, and
// the most recent seam (hand-over jump).
import { state, update, bus } from "../state.js";
import { DATA, loadRun, activeChunk, pendingChunk, STRAT_LABEL } from "../data.js";
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
    update({ t: Math.min(hi, state.t + 1) });
  }, 50); // one step per 50 ms = 2× real time (1 step = 100 ms)
}

async function load() {
  if (state.seed === null) return;
  const [r, c] = await Promise.all([loadRun(state.ref), loadRun(state.cand)]);
  eps = { ref: r.bySeed.get(state.seed), cand: c.bySeed.get(state.seed) };
  maxN = Math.max(eps.ref.n, eps.cand.n);
  slider.attr("max", maxN - 1);
  d3.select("#seedLabel").text(`seed ${state.seed}`);
  render();
}

// What the robot is doing at t, in the vocabulary of the strategies.
function status(e, t) {
  if (t >= e.n) return { k: "done", text: e.success ? "finished: block in goal" : "time out" };
  if (e.chunk[t] < 0) return { k: "wait", text: "idle: waiting for inference" };
  const pend = pendingChunk(e, t);
  return { k: "act", text: `acting on chunk #${e.chunk[t]} · ${e.age[t]} steps stale${pend ? " · thinking" : ""}` };
}

function render() {
  if (!eps.ref) return;
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const gap = 14, head = 36;
  const side = Math.max(120, Math.min((w - gap - 8) / 2, h - head - 4));
  const offX = (w - (2 * side + gap)) / 2;
  const panels = [
    { which: "ref", e: eps.ref, id: state.ref, col: COLOR.ref, txt: COLOR.ref, x: offX },
    { which: "cand", e: eps.cand, id: state.cand, col: COLOR.cand, txt: "#9a6a00", x: offX + side + gap },
  ];
  const s = d3.scaleLinear().domain([0, 512]).range([0, side]);
  slider.property("value", state.t);
  tval.text(`t = ${state.t} (${(state.t / 10).toFixed(1)} s)`);

  const pg = svg.selectAll("g.wp").data(panels, (d) => d.which).join((en) => {
    const g = en.append("g").attr("class", "wp");
    g.append("text").attr("class", "wt1").attr("font-weight", 700).attr("font-size", 11.5);
    g.append("text").attr("class", "wt2").attr("font-size", 10.5).attr("fill", COLOR.muted);
    const b = g.append("g").attr("class", "board");
    b.append("rect").attr("class", "bg");
    b.append("g").attr("class", "goal");
    b.append("g").attr("class", "block");
    b.append("path").attr("class", "pathNow");
    b.append("path").attr("class", "pathWin");
    b.append("g").attr("class", "pending");
    b.append("g").attr("class", "fan");
    b.append("g").attr("class", "seam").attr("pointer-events", "none");
    b.append("circle").attr("class", "agent").attr("pointer-events", "none"); // agent and seam never block hover on plan points
    return g;
  }).attr("transform", (d) => `translate(${d.x},0)`);

  pg.each(function (p) {
    const g = d3.select(this), e = p.e;
    const t = Math.min(state.t, e.n - 1);
    const st = status(e, state.t);
    const cov = e.cov[Math.min(state.t, e.n)];
    g.select(".wt1").attr("y", 13).attr("fill", p.txt)
      .text(`${p.which === "ref" ? "R" : "C"} · ${shortLab(p.id)} · ${e.success ? "✓ success" : "✗ failure"}`);
    g.select(".wt2").attr("y", 28).text(`${cov === null || cov === undefined ? "" : `coverage ${Math.round(cov * 100)}% · `}${st.text}`)
      .attr("fill", st.k === "wait" ? "#0072B2" : COLOR.muted);
    const b = g.select(".board").attr("transform", `translate(0,${head})`);
    b.select(".bg").attr("width", side).attr("height", side).attr("fill", "#fafafb").attr("stroke", "#d0d0d6").attr("rx", 4);
    const line = d3.line().x((d) => s(d[0])).y((d) => s(d[1]));
    const tee = (x, y, th) => teePaths(x, y, th).map((poly) => line([...poly, poly[0]])).join(" ");
    b.select(".goal").selectAll("path").data([0]).join("path").attr("d", tee(...GOAL))
      .attr("fill", "#e9e9ee").attr("stroke", COLOR.goal).attr("stroke-dasharray", "4 3").attr("stroke-width", 1.2);
    b.select(".block").selectAll("path").data([0]).join("path").attr("d", tee(e.bx[t], e.by[t], e.bth[t]))
      .attr("fill", COLOR.block).attr("fill-opacity", 0.9).attr("stroke", "#7b7f88");

    const pts = d3.range(e.n).map((k) => [e.ax[k], e.ay[k]]);
    b.select(".pathNow").attr("d", line(pts.slice(0, t + 1))).attr("fill", "none").attr("stroke", p.col)
      .attr("stroke-opacity", state.win ? 0.18 : 0.35).attr("stroke-width", 1.3);
    b.select(".pathWin").attr("d", state.win ? line(pts.slice(state.win[0], Math.min(e.n, state.win[1] + 1))) : null)
      .attr("fill", "none").attr("stroke", p.col).attr("stroke-opacity", 0.8).attr("stroke-width", 2.2).attr("stroke-linecap", "round");

    // plan being executed (or the chunk hovered in D), and the plan still being computed
    const hc = state.hoverChunk && state.hoverChunk.which === p.which ? e.chunks[state.hoverChunk.id] : null;
    const ch = hc || activeChunk(e, t);
    const pend = !hc ? pendingChunk(e, t) : null;
    b.select(".pending").selectAll("g.pd").data(pend ? [pend] : []).join((en) => {
      const q = en.append("g").attr("class", "pd"); q.append("path"); return q;
    }).select("path").attr("d", (d) => line(d.a.slice(1))).attr("fill", "none")
      .attr("stroke", "#9a9aa2").attr("stroke-dasharray", "1 3.5").attr("stroke-width", 2).attr("stroke-linecap", "round");
    drawFan(b.select(".fan"), ch, p, s, line, e);

    // most recent seam at or before t: hollow = what the old chunk planned next, line = the jump
    let seam = null;
    const prev = ch ? e.chunks[e.chunks.indexOf(ch) - 1] : null;
    if (ch && prev && ch.t0 !== null && ch.t0 <= t && t - ch.t0 < SEAM_SHOW && e.seamAt.has(ch.t0) && prev.execJ.size) {
      const jOld = d3.max([...prev.execJ.keys()]) + 1;
      if (jOld < prev.a.length) seam = { from: prev.a[jOld], to: e.act[ch.t0], gap: e.seamAt.get(ch.t0), age: t - ch.t0 };
    }
    const sg = b.select(".seam").selectAll("g.sm").data(seam && seam.gap >= 8 ? [seam] : []).join((en) => {
      const q = en.append("g").attr("class", "sm"); q.append("line"); q.append("circle"); q.append("text"); return q;
    }).attr("opacity", (d) => 1 - d.age / (SEAM_SHOW + 2));
    sg.select("line").attr("x1", (d) => s(d.from[0])).attr("y1", (d) => s(d.from[1])).attr("x2", (d) => s(d.to[0])).attr("y2", (d) => s(d.to[1]))
      .attr("stroke", COLOR.seam).attr("stroke-width", 2.4).attr("stroke-linecap", "round");
    sg.select("circle").attr("cx", (d) => s(d.from[0])).attr("cy", (d) => s(d.from[1])).attr("r", 4).attr("fill", "#fff").attr("stroke", COLOR.seam).attr("stroke-width", 1.6);
    sg.select("text").attr("x", (d) => s((d.from[0] + d.to[0]) / 2) + 6).attr("y", (d) => s((d.from[1] + d.to[1]) / 2) - 6)
      .attr("font-size", 10.5).attr("font-weight", 700).attr("fill", COLOR.seam).attr("stroke", "#fafafb").attr("stroke-width", 3).attr("paint-order", "stroke")
      .text((d) => `discontinuity ${d.gap.toFixed(0)} px`);

    b.select(".agent").attr("cx", s(e.ax[t])).attr("cy", s(e.ay[t])).attr("r", s(AGENT_R))
      .attr("fill", p.col).attr("fill-opacity", st.k === "wait" ? 0.08 : 0.3).attr("stroke", p.col).attr("stroke-width", 2)
      .attr("stroke-dasharray", st.k === "wait" ? "3 2" : null);
  });
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
      showTip(ev, `<b>${p.which === "ref" ? "R" : "C"} chunk #${e.chunks.indexOf(ch)}</b>, action ${d.j} of 16<br>
        <span class="k">planned from the observation at</span> t=${ch.t_obs} · <span class="k">available at</span> t=${ch.t_avail}<br>
        ${d.tExec !== undefined ? `<b>executed</b> at t=${d.tExec} (${d.tExec - ch.t_obs} steps after its observation)` : "<b>never executed</b>: replaced by the next chunk"}<br>
        <span class="k">click = jump to that step</span>`);
    })
    .on("mouseleave", hideTip)
    .on("click", (ev, d) => { if (d.tExec !== undefined) update({ t: d.tExec }); });
}

export function resizeWorkspace() { render(); }
