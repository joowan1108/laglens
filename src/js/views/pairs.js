// View A, Pair Overview: an overview of every baseline → candidate comparison, so that the pair is
// chosen from what the data show instead of from a drop-down. Rows = baseline, columns = candidate,
// both ordered strategy → h → d. A cell's colour is the mean paired difference candidate − baseline
// over the same start states for the question chosen in the bar (purple = candidate better, grey =
// candidate worse, white = no difference); a dark frame marks differences that are unlikely to be chance:
// for success (binary, paired) an exact McNemar test on the start states that flip, p < 0.05; for the
// cost questions the 95 % interval of the paired difference excludes 0. Click a cell = load that pair.
import { state, update, bus } from "../state.js";
import { DATA, STRATEGIES, HORIZONS, LATENCIES, label, aggregate } from "../data.js";
import { COLOR, STRAT_COLOR, METRICS, fmtMetric, showTip, hideTip, size } from "../util.js";

const BETTER = "#5e3c99", WORSE = "#8a8a92", MID = "#f7f7f8";
const ORDER_H = [4, 8];
const SCALE = 0.6;  // colour saturates at ±60 points of success  // within a strategy: h, then d
let root, svg, noteSel;

export function initPairs() {
  root = d3.select("#pairs");
  svg = root.append("svg");
  noteSel = d3.select("#pairNote");
  // legend in one line above the matrix, so the matrix gets the whole panel
  // "my latency": keep only the schedules at one latency, plus sync d0 as the no-latency reference
  const ctr = d3.select("#pairControls");
  const seg = ctr.append("span").attr("class", "seg dseg").attr("title", "the latency your robot has: show only the schedules at that latency (plus sync d = 0, the no-latency reference)");
  ctr.append("span").attr("class", "plgwrap");
  seg.selectAll("button").data([null, 2, 4]).join("button").text((d) => (d === null ? "all latencies" : `d = ${d}`))
    .on("click", (ev, d) => update({ dfocus: d }));
  ctr.select(".plgwrap").html(`<span class="plg" title="candidate − baseline, percentage points of success on the same start states"><span>worse −60</span><span class="ramp"></span><span>+60 better</span>
    <span class="gap"></span><span class="fr"></span><span title="exact McNemar test on the start states that flip, Benjamini–Hochberg corrected over all 91 pairs (false discovery rate 5 %)">unlikely chance (FDR 5 %)</span>
    <span class="gap"></span><span class="cu"></span><span>current pair</span></span>
    <span class="plg"><b>row</b>&nbsp;= baseline · <b>column</b>&nbsp;= candidate</span>`);
  bus.on("change.pairs", (keys) => {
    if (["task", "ref", "cand", "metric", "brushed", "dfocus"].some((k) => keys.has(k))) render();
  });
  render();
}
export function resizePairs() { render(); }

function schedules() {
  const out = [];
  for (const s of STRATEGIES) for (const h of ORDER_H) for (const d of LATENCIES) {
    const id = `${s}_d${d}_h${h}`;
    if (!DATA.schedById.has(id)) continue;
    if (state.dfocus !== null && d !== state.dfocus && !(s === "sync" && d === 0)) continue;
    out.push({ id, s, h, d });
  }
  return out;
}

// higher is better only for the success rate; the other questions are costs (lower is better)
const sign = () => (state.metric === "success_rate" ? 1 : -1);

function render() {
  const S = schedules(), n = S.length;
  const seeds = state.brushed;
  const cells = [];
  for (const r of S) for (const c of S) {
    if (r.id === c.id) { cells.push({ r, c, diag: true }); continue; }
    const a = aggregate(c.id, state.metric, seeds, r.id);
    const f = flips(r.id, c.id, seeds);
    cells.push({ r, c, v: a.v, lo: a.lo, hi: a.hi, n: a.n, f, sig: f.sig });
  }
  const M = SCALE;  // fixed, so a colour means the same difference under every filter and task
  const col = (v) => {
    const t = Math.max(-1, Math.min(1, (v * sign()) / M));
    return t >= 0 ? d3.interpolateRgb(MID, BETTER)(t) : d3.interpolateRgb(MID, WORSE)(-t);
  };

  d3.select("#pairControls .dseg").selectAll("button").classed("on", (d) => d === state.dfocus);
  noteSel.html(seeds
    ? `Cell = success difference on the <b>${seeds.size} start states selected in C</b> · <b>no frames</b>: the selection was made from these outcomes, so testing it again would be circular (Esc clears)`
    : `Cell = how much more often the candidate succeeds than the baseline on the same ${DATA.seeds.length} start states (number = points when there is room) · <b>click a cell</b> to compare that pair`);
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const m = { l: 70, t: 50, r: 6, b: 4 };
  const gaps = 4 * (STRATEGIES.length - 1);
  const cs = Math.max(7, Math.floor(Math.min((w - m.l - m.r - gaps) / n, (h - m.t - m.b - gaps) / n)));
  m.l += Math.max(0, Math.floor((w - m.l - m.r - n * cs - gaps) / 2));  // centre the matrix in a wide panel
  const gx = (i) => m.l + i * cs + Math.floor(S[i] ? STRATEGIES.indexOf(S[i].s) * 4 : 0);  // small gap between strategies
  const pos = new Map(S.map((q, i) => [q.id, i]));
  const X = (id) => gx(pos.get(id)), Y = (id) => m.t + pos.get(id) * cs + STRATEGIES.indexOf(DATA.schedById.get(id).strategy) * 4;
  const short = (q) => `d${q.d} h${q.h}`;

  // strategy bands along both axes (hue = strategy, as in B's column headers)
  const groups = STRATEGIES.map((s) => ({ s, ids: S.filter((q) => q.s === s).map((q) => q.id) })).filter((g) => g.ids.length);
  svg.selectAll("g.cb").data(groups, (g) => g.s).join((en) => { const g = en.append("g").attr("class", "cb"); g.append("rect"); g.append("text"); return g; })
    .call((g) => g.select("rect").attr("x", (d) => X(d.ids[0])).attr("y", m.t - 36).attr("width", (d) => d.ids.length * cs - 1).attr("height", 3).attr("fill", (d) => STRAT_COLOR[d.s]))
    .call((g) => g.select("text").attr("x", (d) => X(d.ids[0])).attr("y", m.t - 38).attr("font-size", 10).attr("font-weight", 700).text((d) => ({ sync: "Sync", naive: "Naive", inpaint: "Inpaint" })[d.s]));
  svg.selectAll("g.rb").data(groups, (g) => g.s).join((en) => { const g = en.append("g").attr("class", "rb"); g.append("rect"); g.append("text"); return g; })
    .call((g) => g.select("rect").attr("x", m.l - 66).attr("y", (d) => Y(d.ids[0])).attr("width", 3).attr("height", (d) => d.ids.length * cs - 1).attr("fill", (d) => STRAT_COLOR[d.s]))
    .call((g) => g.select("text").attr("transform", (d) => `translate(${m.l - 54},${Y(d.ids[0]) + (d.ids.length * cs) / 2}) rotate(-90)`).attr("text-anchor", "middle")
      .attr("font-size", 9.5).attr("font-weight", 700).text((d) => ({ sync: "Sync", naive: "Naive", inpaint: "Inpaint" })[d.s]));
  // per-schedule labels
  svg.selectAll("text.colL").data(S, (q) => q.id).join("text").attr("class", "colL axis-title")
    .attr("transform", (q) => `translate(${X(q.id) + cs / 2 + 3},${m.t - 3}) rotate(-90)`).attr("font-size", 8.5)
    .attr("font-weight", (q) => (q.id === state.cand ? 800 : 400)).attr("fill", (q) => (q.id === state.cand ? "#9a6a00" : null)).text(short);
  svg.selectAll("text.rowL").data(S, (q) => q.id).join("text").attr("class", "rowL axis-title")
    .attr("x", m.l - 4).attr("y", (q) => Y(q.id) + cs / 2 + 3).attr("text-anchor", "end").attr("font-size", 8.5)
    .attr("font-weight", (q) => (q.id === state.ref ? 800 : 400)).attr("fill", (q) => (q.id === state.ref ? COLOR.ref : null)).text(short);
  // a row label sets only the baseline, a column label only the candidate
  svg.selectAll("text.rowL").style("cursor", "pointer").on("click", (ev, q) => update({ ref: q.id }))
    .call((q) => q.selectAll("title").data((d) => [d]).join("title").text((d) => `${label(d.id)}: click = use as baseline`));
  svg.selectAll("text.colL").style("cursor", "pointer").on("click", (ev, q) => update({ cand: q.id }))
    .call((q) => q.selectAll("title").data((d) => [d]).join("title").text((d) => `${label(d.id)}: click = use as candidate`));

  // cells
  const sel = svg.selectAll("rect.pc").data(cells, (q) => `${q.r.id}|${q.c.id}`).join("rect").attr("class", "pc")
    .attr("x", (q) => X(q.c.id)).attr("y", (q) => Y(q.r.id)).attr("width", cs - 1).attr("height", cs - 1)
    .attr("fill", (q) => (q.diag ? "#fff" : col(q.v))).attr("stroke", (q) => (q.sig ? COLOR.ink : q.diag ? "#e3e3e8" : "none"))
    .attr("stroke-width", (q) => (q.sig ? 1.6 : 1)).style("cursor", (q) => (q.diag ? "default" : "pointer"));
  // the value itself, when the cells are big enough to hold it (e.g. with one latency chosen)
  const showNum = cs >= 22;
  svg.selectAll("text.pv").data(showNum ? cells.filter((q) => !q.diag) : [], (q) => `${q.r.id}|${q.c.id}`).join("text").attr("class", "pv")
    .attr("pointer-events", "none").attr("x", (q) => X(q.c.id) + (cs - 1) / 2).attr("y", (q) => Y(q.r.id) + (cs - 1) / 2 + 3.5)
    .attr("text-anchor", "middle").attr("font-size", Math.min(11, cs * 0.4)).attr("font-weight", (q) => (q.sig ? 700 : 400))
    .attr("fill", (q) => (Math.abs(q.v) / M > 0.5 ? "#fff" : COLOR.ink))
    .text((q) => { const k = Math.round(q.v * 100); return k > 0 ? `+${k}` : k < 0 ? `−${-k}` : "0"; });
  sel.on("mousemove", (ev, q) => {
    if (q.diag) return;
    const Mt = METRICS[state.metric];
    const rel = q.f;
    const better = q.v * sign() > 0;
    showTip(ev, `<b>baseline</b> ${label(q.r.id)}<br><b>candidate</b> ${label(q.c.id)}<br>
      ${Mt.label}: ${fmtMetric(state.metric, aggregate(q.r.id, state.metric, seeds).v)} → ${fmtMetric(state.metric, aggregate(q.c.id, state.metric, seeds).v)}
      (paired ${fmtMetric(state.metric, q.v, true)}${rel ? "" : `, 95 % interval ${fmtMetric(state.metric, q.lo, true)} … ${fmtMetric(state.metric, q.hi, true)}`})<br>
      ${rel ? `on the same start states: <b>${rel.gain} rescued</b>, <b>${rel.loss} lost</b> of ${rel.n} (McNemar p = ${rel.p < 0.001 ? "< 0.001" : rel.p.toFixed(3)}, corrected q = ${rel.q < 0.001 ? "< 0.001" : rel.q.toFixed(3)}) · chance level (re-run): ${rel.chance} flips<br>` : ""}
      ${seeds ? "no test on a selection made from the outcomes" : q.sig ? `<b>${better ? "candidate better" : "candidate worse"}, unlikely to be chance</b> (FDR 5 %)` : "difference within chance (after correcting for 91 comparisons)"}<br><span class="k">click = compare this pair in all views</span>`);
  }).on("mouseleave", hideTip)
    .on("click", (ev, q) => { if (!q.diag) { hideTip(); update({ ref: q.r.id, cand: q.c.id }); } });

  // current pair
  const cur = cells.find((q) => q.r.id === state.ref && q.c.id === state.cand);
  svg.selectAll("rect.cur").data(cur ? [cur] : []).join("rect").attr("class", "cur").attr("pointer-events", "none")
    .attr("x", (q) => X(q.c.id) - 2.5).attr("y", (q) => Y(q.r.id) - 2.5).attr("width", cs + 4).attr("height", cs + 4)
    .attr("fill", "none").attr("stroke", COLOR.cand).attr("stroke-width", 2.5).attr("rx", 2);


}

// Every unordered pair of schedules (91 for 14) is one exact McNemar test; the frames use
// Benjamini–Hochberg q-values over that whole family, so about 1 in 20 framed cells may be a false
// discovery instead of 1 in 20 of all cells. Computed once per task on all start states.
let qCache = { task: null, q: new Map() };
function qValues() {
  if (qCache.task === DATA.task) return qCache.q;
  const ids = DATA.schedules.filter((x) => !x.replicate).map((x) => x.schedule);
  const tests = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const f = rawFlips(ids[i], ids[j], null);
    tests.push({ k: pairKey(ids[i], ids[j]), p: mcnemar(f.gain, f.loss) });
  }
  tests.sort((a, b) => a.p - b.p);
  const m = tests.length, q = new Map();
  let run = 1;
  for (let i = m - 1; i >= 0; i--) { run = Math.min(run, (tests[i].p * m) / (i + 1)); q.set(tests[i].k, run); }
  qCache = { task: DATA.task, q };
  return q;
}
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Test of one pair: rescued / lost start states, raw p, BH q. On a selection of start states made
// in C (which is chosen by looking at outcomes) no test is claimed: sig = false.
export function flips(r, c, seeds) {
  const f = rawFlips(r, c, seeds);
  const q = qValues().get(pairKey(r, c)) ?? 1;
  return { ...f, q, sig: !seeds && q < 0.05 };
}

function rawFlips(r, c, seeds) {
  const R = DATA.ep.get(r), C = DATA.ep.get(c), S = seeds ? [...seeds] : DATA.seeds;
  let gain = 0, loss = 0;
  for (const s of S) { const a = R.get(s)?.success, b = C.get(s)?.success; if (a === 0 && b === 1) gain++; if (a === 1 && b === 0) loss++; }
  const rep = DATA.schedules.find((x) => x.replicate);
  let chance = "–";
  if (rep) { const A = DATA.ep.get(rep.schedule), B = DATA.ep.get(`sync_d${rep.latency}_h${rep.horizon}`); chance = S.filter((s) => A.get(s)?.success !== B.get(s)?.success).length; }
  return { gain, loss, n: S.length, chance, p: mcnemar(gain, loss) };
}

// exact two-sided McNemar test = binomial sign test on the discordant start states
function mcnemar(g, l) {
  const n = g + l;
  if (!n) return 1;
  let tail = 0, c = 1;  // c = C(n, i)
  for (let i = 0; i <= Math.min(g, l); i++) { tail += c; c = (c * (n - i)) / (i + 1); }
  return Math.min(1, (2 * tail) / 2 ** n);
}
