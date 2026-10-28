import { state, update, bus, DEFAULTS } from "./state.js";
import { DATA, TASKS, loadBase, loadRun, label } from "./data.js";
import { METRICS } from "./util.js";
import { initResponse, resizeResponse } from "./views/response.js";
import { initSeedTable, resizeSeedTable, rebuildColumns } from "./views/seedtable.js";
import { initWorkspace, resizeWorkspace, step, togglePlay } from "./views/workspace.js";
import { initTimeline, resizeTimeline } from "./views/timeline.js";

// First seed that flips from success (R) to failure (C), so the replay opens on something interesting.
function firstFlip(ref, cand) {
  const R = DATA.ep.get(ref), C = DATA.ep.get(cand);
  return DATA.seeds.find((s) => R.get(s).success === 1 && C.get(s).success === 0) ?? DATA.seeds[0];
}

function fillPickers() {
  const opts = DATA.schedules.map((s) => s.schedule);
  for (const [sel, key] of [["#refSel", "ref"], ["#candSel", "cand"]]) {
    d3.select(sel).selectAll("option").data(opts, (d) => d).join("option").attr("value", (d) => d).text((d) => label(d));
    d3.select(sel).property("value", state[key]);
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
  update({ task, seed: firstFlip(ref, cand), t: 0, win: null, brushed: null, hoverSeed: null, hoverChunk: null });
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
    if (keys.has("ref") || keys.has("cand")) { loadRun(state.ref); loadRun(state.cand); }
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

// URL parameters let a case-study state be reproduced exactly, e.g. ?task=reach&ref=sync_d0_h8&cand=naive_d4_h8&metric=jump_mean&seed=1012&t=80&sel=1001,1002
function applyParams() {
  const p = new URLSearchParams(location.search);
  const patch = {};
  for (const k of ["ref", "cand", "metric"]) if (p.has(k)) patch[k] = p.get(k);
  for (const k of ["seed", "t"]) if (p.has(k)) patch[k] = +p.get(k);
  if (p.has("win")) patch.win = p.get("win").split(",").map(Number);
  if (p.has("sel")) patch.brushed = new Set(p.get("sel").split(",").map(Number));
  for (const k of ["ref", "cand"]) if (patch[k] && !DATA.schedById.has(patch[k])) delete patch[k];
  if (patch.metric === "seam_gap_mean") patch.metric = "jump_mean";  // links made before the column was renamed
  if (patch.metric && !METRICS[patch.metric]) delete patch.metric;
  Object.assign(state, patch);
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
  initResponse();
  initSeedTable();
  initWorkspace();
  initTimeline();
  initGuide();
  initKeys();
  let raf = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { resizeResponse(); resizeSeedTable(); resizeWorkspace(); resizeTimeline(); });
  });
  window.LagLens = { state, update, DATA }; // for scripted screenshots / tests
}

main().catch((err) => {
  console.error(err);
  document.getElementById("app").innerHTML = `<p style="padding:20px">Failed to load data: ${err.message}. Serve the <code>src/</code> folder over HTTP (see README).</p>`;
});
