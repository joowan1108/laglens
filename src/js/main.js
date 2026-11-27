import { state, update, bus, DEFAULTS, guards } from "./state.js";
import { DATA, TASKS, loadBase, loadRun, label, comparable, atLatency, whyNot } from "./data.js";
import { METRICS } from "./util.js";
import { initResponse, resizeResponse } from "./views/response.js";
import { initPairs, resizePairs } from "./views/pairs.js";
import { initSeedTable, resizeSeedTable, rebuildColumns } from "./views/seedtable.js";
import { initWorkspace, resizeWorkspace, step, togglePlay } from "./views/workspace.js";
import { initTimeline, resizeTimeline } from "./views/timeline.js";

// The replay opens on a seed that flips between baseline and candidate, in the more common direction
// (e.g. sync ✗ → async ✓ when the candidate mostly rescues seeds), so the first episode shown tells
// the main story of the pair instead of one where both runs end alike.
function firstFlip(ref, cand) {
  const R = DATA.ep.get(ref), C = DATA.ep.get(cand);
  const loss = DATA.seeds.filter((s) => R.get(s).success === 1 && C.get(s).success === 0);
  const gain = DATA.seeds.filter((s) => R.get(s).success === 0 && C.get(s).success === 1);
  return (gain.length > loss.length ? gain : loss)[0] ?? gain[0] ?? DATA.seeds[0];
}

// Only comparable pairs can be chosen (data.comparable). A choice that would make the pair not
// comparable is not applied and A says why; nothing is changed behind the user's back. A cell in A
// sets both sides at once, so every comparable pair is one click away.
function keepComparable(patch, st) {
  // the refusal note lasts until the next deliberate change (a seed, a selection, a time window, the
  // question, the task or "my latency"); hovering and the replay moving its cursor keep it
  if (!("ref" in patch) && !("cand" in patch)) {
    const deliberate = ["seed", "brushed", "win", "metric", "task", "dfocus"].some((k) => k in patch);
    return st.blocked && deliberate && !("blocked" in patch) ? { ...patch, blocked: null } : patch;
  }
  const ref = patch.ref ?? st.ref, cand = patch.cand ?? st.cand;
  if (comparable(ref, cand)) return { ...patch, blocked: null };
  const out = { ...patch };
  const which = "cand" in patch && !("ref" in patch) ? "cand" : "ref";
  const tried = patch[which];
  delete out.ref; delete out.cand;
  out.blocked = `<b>${shortName(tried)}</b> is not compared with the current ${which === "cand" ? "baseline" : "candidate"} (${whyNot(ref, cand)}): click a cell in A to change both`;
  return out;
}
const shortName = (id) => { const q = DATA.schedById.get(id); return `${{ sync: "Sync", naive: "Naive", inpaint: "Inpaint" }[q.strategy]} d${q.latency} h${q.horizon}`; };
guards.push(keepComparable);

// The header only names the current pair; the pair is chosen in the Pair Overview (A), not looked up in a menu.
function fillPickers() {
  const nm = (id) => { const q = DATA.schedById.get(id); return `${{ sync: "Sync", naive: "Naive async", inpaint: "Inpaint async" }[q.strategy]} · d=${q.latency} · h=${q.horizon}`; };
  d3.select("#refName").text(nm(state.ref)).attr("title", label(state.ref));
  d3.select("#candName").text(nm(state.cand)).attr("title", label(state.cand));
}

// Switching the task reloads both data tables; the same schedule ids exist in both tasks, so the
// compared pair is kept and the views re-render because "task" changed.
async function setTask(task) {
  if (task === state.task || !TASKS[task]) return;
  await loadBase(task);
  rebuildColumns();
  const keep = (id, dflt) => (DATA.schedById.has(id) ? id : dflt);
  const ref = keep(state.ref, DEFAULTS.ref), cand = keep(state.cand, DEFAULTS.cand);
  Object.assign(state, { ref, cand });
  fillPickers();
  update({ task, seed: firstFlip(ref, cand), win: null, brushed: null, hoverSeed: null, hoverChunk: null });
}

function initTaskSwitch() {
  const btns = d3.select("#taskSeg").selectAll("button").data(Object.keys(TASKS)).join("button")
    .text((d) => TASKS[d].label).attr("title", (d) => TASKS[d].title).on("click", (ev, d) => setTask(d));
  const mark = () => btns.classed("on", (d) => d === state.task);
  mark();
  bus.on("change.task", (keys) => { if (keys.has("task")) mark(); });
}

// One question for the whole interface: the outcome (success) or one of the costs; A, B and C follow it.
function initMetric() {
  const btns = d3.select("#metricSeg").selectAll("button").data(Object.keys(METRICS)).join("button")
    .text((d) => METRICS[d].btn).attr("title", (d) => `${METRICS[d].sub}: ${METRICS[d].note}`).on("click", (ev, d) => update({ metric: d }));
  const mark = () => btns.classed("on", (d) => d === state.metric);
  mark();
  bus.on("change.metric", (keys) => { if (keys.has("metric")) mark(); });
}

function initPickers() {
  fillPickers();
  bus.on("change.pickers", (keys) => {
    if (keys.has("ref") || keys.has("cand")) { loadRun(state.ref); loadRun(state.cand); fillPickers(); }
  });
  d3.select("#swapBtn").on("click", () => update({ ref: state.cand, cand: state.ref }));
  d3.select("#resetBtn").on("click", () => {
    update({ ...DEFAULTS, task: state.task, seed: firstFlip(DEFAULTS.ref, DEFAULTS.cand), brushed: null });
  });
}

function initGuide() {
  const g = document.getElementById("guide");
  const close = () => { g.hidden = true; try { localStorage.setItem("laglens-guide", "1"); } catch (e) { /* storage unavailable */ } };
  document.getElementById("guideClose").onclick = close;
  g.onclick = (ev) => { if (ev.target === g) close(); };
  document.getElementById("helpBtn").onclick = () => { g.hidden = false; };
  let seen = false;
  try { seen = localStorage.getItem("laglens-guide") === "1"; } catch (e) { /* storage unavailable */ }
  const params = new URLSearchParams(location.search);
  if (!seen && !params.has("noguide")) g.hidden = false;
}

function initKeys() {
  window.addEventListener("keydown", (ev) => {
    if (ev.target.tagName === "SELECT" || ev.target.tagName === "INPUT") return;
    if (ev.key === "ArrowRight") step(ev.shiftKey ? 10 : 1);
    else if (ev.key === "ArrowLeft") step(ev.shiftKey ? -10 : -1);
    else if (ev.key === " ") { ev.preventDefault(); togglePlay(); }
    else if (ev.key === "Escape") { update({ win: null, brushed: null }); document.getElementById("guide").hidden = true; }
  });
}

// URL parameters let a case-study state be reproduced exactly, e.g. ?task=catch&ref=sync_d0_h8&cand=naive_d4_h8&seed=1012&t=80&sel=1001,1002
function applyParams() {
  const p = new URLSearchParams(location.search);
  const patch = {};
  for (const k of ["ref", "cand"]) if (p.has(k)) patch[k] = p.get(k);
  for (const k of ["seed", "t"]) if (p.has(k)) patch[k] = +p.get(k);
  if (["2", "4"].includes(p.get("d"))) patch.dfocus = +p.get("d");
  if (METRICS[p.get("show")]) patch.metric = p.get("show");
  if (p.has("win")) patch.win = p.get("win").split(",").map(Number);
  if (p.has("sel")) patch.brushed = new Set(p.get("sel").split(",").map(Number));
  for (const k of ["ref", "cand"]) if (patch[k] && !DATA.schedById.has(patch[k])) delete patch[k];
  Object.assign(state, patch);
  // a link to a pair that is not compared opens the nearest comparable one: the candidate at the
  // baseline's latency, else at the baseline's horizon
  if (!comparable(state.ref, state.cand)) {
    const r = DATA.schedById.get(state.ref), c = DATA.schedById.get(state.cand);
    const tries = [atLatency(state.cand, r.latency), `${c.strategy}_d${c.latency}_h${r.horizon}`, DEFAULTS.cand];
    state.cand = tries.find((id) => DATA.schedById.has(id) && comparable(state.ref, id)) ?? state.ref;
  }
}

async function main() {
  const task = new URLSearchParams(location.search).get("task");
  if (TASKS[task]) state.task = task;
  await loadBase(state.task);
  applyParams();
  if (!DATA.schedById.has(state.ref)) state.ref = DATA.schedules[0].schedule;
  if (!DATA.schedById.has(state.cand)) state.cand = DATA.schedules[DATA.schedules.length - 1].schedule;
  if (state.seed === null) state.seed = firstFlip(state.ref, state.cand);
  initTaskSwitch();
  initPickers();
  initMetric();
  initPairs();
  initResponse();
  initSeedTable();
  initWorkspace();
  initTimeline();
  initGuide();
  initKeys();
  let raf = null;
  const resizeAll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { resizePairs(); resizeResponse(); resizeSeedTable(); resizeWorkspace(); resizeTimeline(); });
  };
  window.addEventListener("resize", resizeAll);
  resizeAll();  // after the first layout (notes and legends may wrap once text is in place)
  if (document.fonts) document.fonts.ready.then(resizeAll);
  window.LagLens = { state, update, DATA }; // for scripted screenshots / tests
}

main().catch((err) => {
  console.error(err);
  document.getElementById("app").innerHTML = `<p style="padding:20px">Failed to load data: ${err.message}. Serve the <code>src/</code> folder over HTTP (see README).</p>`;
});
