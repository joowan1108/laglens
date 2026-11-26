import { state, update, bus, DEFAULTS, guards } from "./state.js";
import { DATA, TASKS, loadBase, loadRun, label, comparable, atLatency } from "./data.js";
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

// Keep the pair comparable (data.comparable): when a new baseline (or candidate) differs from the other
// side in latency AND in strategy or h, the other side moves to its own strategy and h at the new latency.
function keepComparable(patch, st) {
  if (!("ref" in patch) && !("cand" in patch)) return patch;
  let ref = patch.ref ?? st.ref, cand = patch.cand ?? st.cand, moved = null;
  if (!comparable(ref, cand)) {
    const d = (id) => DATA.schedById.get(id).latency;
    if ("cand" in patch && !("ref" in patch)) { ref = atLatency(ref, d(cand)); moved = `baseline moved to ${label(ref)}`; }
    else { cand = atLatency(cand, d(ref)); moved = `candidate moved to ${label(cand)}`; }
  }
  return { ...patch, ref, cand, moved };
}
guards.push(keepComparable);

function fillPickers() {
  const opts = DATA.schedules.map((s) => s.schedule);
  for (const [sel, key] of [["#refSel", "ref"], ["#candSel", "cand"]]) {
    d3.select(sel).selectAll("option").data(opts, (d) => d).join("option").attr("value", (d) => d);
    d3.select(sel).property("value", state[key]);
  }
  markPickers();
}
// options that are not comparable with the other side say so (choosing one moves the other side)
function markPickers() {
  for (const [sel, other] of [["#refSel", state.cand], ["#candSel", state.ref]]) {
    d3.select(sel).selectAll("option").text((d) => (comparable(d, other) ? label(d) : `${label(d)}  (moves the other side)`))
      .style("color", (d) => (comparable(d, other) ? null : "#8a8a92"));
  }
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

function initPickers() {
  fillPickers();
  for (const [sel, key] of [["#refSel", "ref"], ["#candSel", "cand"]]) {
    d3.select(sel).on("change", (ev) => update({ [key]: ev.target.value }));
  }
  bus.on("change.pickers", (keys) => {
    if (keys.has("ref")) d3.select("#refSel").property("value", state.ref);
    if (keys.has("cand")) d3.select("#candSel").property("value", state.cand);
    if (keys.has("ref") || keys.has("cand")) { loadRun(state.ref); loadRun(state.cand); markPickers(); }
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
  if (p.has("win")) patch.win = p.get("win").split(",").map(Number);
  if (p.has("sel")) patch.brushed = new Set(p.get("sel").split(",").map(Number));
  for (const k of ["ref", "cand"]) if (patch[k] && !DATA.schedById.has(patch[k])) delete patch[k];
  Object.assign(state, patch);
  if (!comparable(state.ref, state.cand)) state.cand = atLatency(state.cand, DATA.schedById.get(state.ref).latency);
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
