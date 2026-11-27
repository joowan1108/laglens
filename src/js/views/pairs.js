// View A, Pair Overview: an overview of every baseline → candidate comparison, so that the pair is
// chosen from what the data show instead of from a drop-down. Rows = baseline, columns = candidate,
// both ordered strategy → h → d. A cell's colour is the mean paired difference candidate − baseline
// over the same start states for the question chosen in the bar (purple = candidate better, grey =
// candidate worse, white = no difference); a dark frame marks differences that are unlikely to be chance:
// for success (binary, paired) an exact McNemar test on the start states that flip, p < 0.05; for the
// cost questions the 95 % interval of the paired difference excludes 0. Click a cell = load that pair.
import { state, update, bus } from "../state.js";
import { DATA, STRATEGIES, HORIZONS, LATENCIES, label, aggregate, comparable, whyNot, reruns, rerunFlips } from "../data.js";
import { COLOR, STRAT_COLOR, STRAT_SYMBOL, METRICS, fmtMetric, showTip, hideTip, size } from "../util.js";

const BETTER = "#5e3c99", WORSE = "#8a8a92", MID = "#f7f7f8";
const ORDER_H = [4, 8];
// The colour scale is fixed per question and task, so a colour means the same difference under every
// filter: ±60 points for success and idle share; for the px costs the largest paired difference
// among the comparable pairs of the task.
let scaleCache = { key: null, v: 0.6 };
function scale() {
  if (METRICS[state.metric].pct) return 0.6;
  const key = `${DATA.task}|${state.metric}`;
  if (scaleCache.key !== key) {
    const ids = DATA.schedules.map((x) => x.schedule);
    // 75th percentile of |difference| over the comparable pairs, so that one extreme schedule (Catch
    // naive d4 h4 jumps) does not wash out every other cell; larger values take the end colour
    const vs = [];
    for (const a of ids) for (const b of ids) if (a < b && comparable(a, b)) vs.push(Math.abs(aggregate(b, state.metric, null, a).v));
    scaleCache = { key, v: Math.max(1, d3.quantile(vs.sort(d3.ascending), 0.75)) };
  }
  return scaleCache.v;
}
const isSuccess = () => state.metric === "success_rate";
let root, svg, noteSel;

export function initPairs() {
  root = d3.select("#pairs");
  svg = root.append("svg");
  // hatch for the pairs that are not compared (see data.comparable)
  svg.append("defs").append("pattern").attr("id", "nc").attr("patternUnits", "userSpaceOnUse").attr("width", 5).attr("height", 5)
    .attr("patternTransform", "rotate(45)").append("rect").attr("width", 1.2).attr("height", 5).attr("fill", "#d4d4da");
  noteSel = d3.select("#pairNote");
  // legend in one line above the matrix, so the matrix gets the whole panel
  // "my latency": keep only the schedules at one latency, plus sync d0 as the no-latency reference
  const ctr = d3.select("#pairControls");
  const seg = ctr.append("span").attr("class", "seg dseg").attr("title", "the latency your robot has: show only the schedules at that latency (plus sync d = 0, the no-latency reference)");
  ctr.append("span").attr("class", "plgwrap");
  seg.selectAll("button").data([null, 2, 4]).join("button").text((d) => (d === null ? "all latencies" : `d = ${d}`))
    .on("click", (ev, d) => update({ dfocus: d }));
  ctr.select(".plgwrap").html(`<span class="plg" title="candidate − baseline, percentage points of success on the same start states"><span class="it"><span class="lo"></span> <span class="ramp"></span> <span class="hi"></span></span>
    <span class="it fritem"><span class="fr"></span><span class="fam">unlikely chance (FDR 5 %)</span></span>
    <span class="it" title="compared: two schedules at the same latency d (a choice you can make), or the same strategy and h at two latencies (what more latency costs), or a schedule against d = 0 at the same h (how far it is from having no latency; at d = 0 all strategies are the same). Every other pair mixes two causes."><span class="nc"></span>not compared</span>
    <span class="it"><span class="cu"></span>current pair</span>
    <span class="it"><b>row</b>&nbsp;= baseline · <b>column</b>&nbsp;= candidate</span></span>`);
  bus.on("change.pairs", (keys) => {
    if (["task", "ref", "cand", "metric", "brushed", "dfocus", "blocked"].some((k) => keys.has(k))) render();
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
    if (!comparable(r.id, c.id)) { cells.push({ r, c, nc: true }); continue; }
    const a = aggregate(c.id, state.metric, seeds, r.id);
    const f = isSuccess() ? flips(r.id, c.id, seeds) : null;  // only the outcome is tested; costs are described
    cells.push({ r, c, v: a.v, lo: a.lo, hi: a.hi, n: a.n, f, sig: !!f && f.sig });
  }
  const M = scale(), Mt0 = METRICS[state.metric];
  const lim = Mt0.pct ? "60" : `${Math.round(M)} px or more`;
  d3.select("#pairControls .lo").text(isSuccess() ? `worse −${lim}` : `pays more +${lim}`);
  d3.select("#pairControls .hi").text(isSuccess() ? `+${lim} better` : `−${lim} pays less`);
  const col = (v) => {
    const t = Math.max(-1, Math.min(1, (v * sign()) / M));
    return t >= 0 ? d3.interpolateRgb(MID, BETTER)(t) : d3.interpolateRgb(MID, WORSE)(-t);
  };

  d3.select("#pairControls .fritem").style("display", isSuccess() && !seeds ? null : "none");
  d3.select("#pairControls .dseg").selectAll("button").classed("on", (d) => d === state.dfocus);
  d3.select("#pairControls .fam").attr("title", `exact McNemar test on the start states that flip, Benjamini–Hochberg corrected over the ${qValues().size} comparable pairs (false discovery rate 5 %)`);
  noteSel.html((state.blocked ? `<span class="moved">${state.blocked}</span> · ` : "") + (seeds
    ? `Cell = ${isSuccess() ? "success" : Mt0.btn.toLowerCase()} difference on the <b>${seeds.size} start states selected in C</b> · <b>no frames</b>: the selection was made from these outcomes, so testing it again would be circular (Esc clears)`
    : `${isSuccess() ? `Cell = candidate's success minus the baseline's on the same ${DATA.seeds.length} start states`
      : `Cell = how much less (purple) or more (grey) the candidate pays: <b>${Mt0.label}</b> · no frames: costs are not tested`} · <b>click a cell</b> to compare · hatched: see the legend`));
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  // the ranking strip takes the right side of the panel when there is room for it
  const SW = w >= 380 ? Math.max(132, Math.min(196, Math.floor(w * 0.36))) : 0;
  const m = { l: 70, t: 50, r: 6 + SW, b: 4 };
  const gaps = 4 * (STRATEGIES.length - 1);
  const cs = Math.max(7, Math.floor(Math.min((w - m.l - m.r - gaps) / n, (h - m.t - m.b - gaps) / n)));
  m.l += Math.max(0, Math.floor((w - m.l - m.r - n * cs - gaps) / 2));  // centre the matrix in a wide panel
  const gx = (i) => m.l + i * cs + Math.floor(S[i] ? STRATEGIES.indexOf(S[i].s) * 4 : 0);  // small gap between strategies
  const pos = new Map(S.map((q, i) => [q.id, i]));
  const X = (id) => gx(pos.get(id)), Y = (id) => m.t + pos.get(id) * cs + STRATEGIES.indexOf(DATA.schedById.get(id).strategy) * 4;
  const short = (q) => `d${q.d} h${q.h}`;
  const lf = Math.max(6.5, Math.min(8.5, cs - 1.5));  // labels never taller than a cell
  const OFF = "#c4c4ca";  // a label that is not comparable with the other side of the current pair

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
    .attr("transform", (q) => `translate(${X(q.id) + cs / 2 + 3},${m.t - 3}) rotate(-90)`).attr("font-size", lf)
    .attr("font-weight", (q) => (q.id === state.cand ? 800 : 400)).attr("fill", (q) => (q.id === state.cand ? "#9a6a00" : comparable(state.ref, q.id) ? null : OFF)).text(short);
  svg.selectAll("text.rowL").data(S, (q) => q.id).join("text").attr("class", "rowL axis-title")
    .attr("x", m.l - 4).attr("y", (q) => Y(q.id) + cs / 2 + 3).attr("text-anchor", "end").attr("font-size", lf)
    .attr("font-weight", (q) => (q.id === state.ref ? 800 : 400)).attr("fill", (q) => (q.id === state.ref ? COLOR.ref : comparable(q.id, state.cand) ? null : OFF)).text(short);
  // a row label sets only the baseline, a column label only the candidate
  svg.selectAll("text.rowL").style("cursor", "pointer").on("click", (ev, q) => update({ ref: q.id }))
    .call((q) => q.selectAll("title").data((d) => [d]).join("title").text((d) => (comparable(d.id, state.cand) ? `${label(d.id)}: click = use as baseline` : `${label(d.id)}: not compared with the current candidate; click a cell to change both`)));
  svg.selectAll("text.colL").style("cursor", "pointer").on("click", (ev, q) => update({ cand: q.id }))
    .call((q) => q.selectAll("title").data((d) => [d]).join("title").text((d) => (comparable(state.ref, d.id) ? `${label(d.id)}: click = use as candidate` : `${label(d.id)}: not compared with the current baseline; click a cell to change both`)));

  // cells
  const sel = svg.selectAll("rect.pc").data(cells, (q) => `${q.r.id}|${q.c.id}`).join("rect").attr("class", "pc")
    .attr("x", (q) => X(q.c.id)).attr("y", (q) => Y(q.r.id)).attr("width", cs - 1).attr("height", cs - 1)
    .attr("fill", (q) => (q.diag ? "#fff" : q.nc ? "url(#nc)" : col(q.v))).attr("stroke", (q) => (q.sig ? COLOR.ink : q.diag ? "#e3e3e8" : "none"))
    .attr("stroke-width", (q) => (q.sig ? 1.6 : 1)).style("cursor", (q) => (q.diag || q.nc ? "default" : "pointer"));
  // the value itself, when the cells are big enough to hold it (e.g. with one latency chosen)
  const showNum = cs >= 22;
  svg.selectAll("text.pv").data(showNum ? cells.filter((q) => !q.diag && !q.nc) : [], (q) => `${q.r.id}|${q.c.id}`).join("text").attr("class", "pv")
    .attr("pointer-events", "none").attr("x", (q) => X(q.c.id) + (cs - 1) / 2).attr("y", (q) => Y(q.r.id) + (cs - 1) / 2 + 3.5)
    .attr("text-anchor", "middle").attr("font-size", Math.min(11, cs * 0.4)).attr("font-weight", (q) => (q.sig ? 700 : 400))
    .attr("fill", (q) => (Math.abs(q.v) / M > 0.5 ? "#fff" : COLOR.ink))
    .text((q) => { const k = Math.round(q.v * (Mt0.pct ? 100 : 1)); return k > 0 ? `+${k}` : k < 0 ? `−${-k}` : "0"; });
  sel.on("mousemove", (ev, q) => {
    if (q.diag) return;
    if (q.nc) {
      showTip(ev, `<b>baseline</b> ${label(q.r.id)}<br><b>candidate</b> ${label(q.c.id)}<br><b>not compared</b>: ${whyNot(q.r.id, q.c.id)}, so a difference could not be attributed to one cause.<br><span class="k">B shows every schedule against the baseline along its own line</span>`);
      return;
    }
    const Mt = METRICS[state.metric];
    const rel = q.f;
    const better = q.v * sign() > 0;
    showTip(ev, `<b>baseline</b> ${label(q.r.id)}<br><b>candidate</b> ${label(q.c.id)}<br>
      ${Mt.label}: ${fmtMetric(state.metric, aggregate(q.r.id, state.metric, seeds).v)} → ${fmtMetric(state.metric, aggregate(q.c.id, state.metric, seeds).v)}
      (paired ${fmtMetric(state.metric, q.v, true)}${rel ? "" : `, 95 % interval ${fmtMetric(state.metric, q.lo, true)} … ${fmtMetric(state.metric, q.hi, true)}`})<br>
      ${rel ? `on the same start states: <b>${rel.gain} rescued</b>, <b>${rel.loss} lost</b> of ${rel.n} (McNemar p ${rel.p < 0.001 ? "< 0.001" : `= ${rel.p.toFixed(3)}`}, corrected q ${rel.q < 0.001 ? "< 0.001" : `= ${rel.q.toFixed(3)}`}) <br>${rel.chance}<br>` : ""}
      ${!rel ? "costs are described, not tested: only success has a test" : seeds ? "no test on a selection made from the outcomes" : q.sig ? `<b>${better ? "candidate better" : "candidate worse"}, unlikely to be chance</b> (FDR 5 %)` : `<b>not established</b> with ${rel.n} start states (q = ${rel.q.toFixed(2)} after correcting for ${qValues().size} comparisons)${rel.agree ? ` · the re-runs point the same way (${rel.agree})` : ""}`}<br><span class="k">click = compare this pair in all views</span>`);
  }).on("mouseleave", hideTip)
    .on("click", (ev, q) => { if (!q.diag && !q.nc) { hideTip(); update({ ref: q.r.id, cand: q.c.id }); } });

  // current pair
  const cur = cells.find((q) => q.r.id === state.ref && q.c.id === state.cand);
  svg.selectAll("rect.cur").data(cur ? [cur] : []).join("rect").attr("class", "cur").attr("pointer-events", "none")
    .attr("x", (q) => X(q.c.id) - 2.5).attr("y", (q) => Y(q.r.id) - 2.5).attr("width", cs + 4).attr("height", cs + 4)
    .attr("fill", "none").attr("stroke", COLOR.cand).attr("stroke-width", 2.5).attr("rx", 2);

  ranking(w - SW + 10, w - 4, m.t - 38, h - 4, SW > 0);


}

// Ranking strip: the schedules at one latency (the latency chosen in "my latency", else the pair's),
// sorted by the current question, in absolute terms. A answers "how do two schedules differ"; the
// strip answers "which one is best at my latency". Each row shows all three runs (filled = run 0,
// hollow = re-runs, tick = their mean) and is sorted by the mean of the three, so that one lucky run
// does not decide the order; rows whose runs overlap have no clear order. All start states are used.
function ranking(x0, x1, top, bottom, on) {
  const g = svg.selectAll("g.rank").data(on ? [0] : []).join("g").attr("class", "rank");
  if (!on) return;
  const R = DATA.schedById.get(state.ref), Cn = DATA.schedById.get(state.cand);
  const d = state.dfocus ?? (R.latency || Cn.latency || LATENCIES[LATENCIES.length - 1]);
  const Mt = METRICS[state.metric], up = isSuccess();
  const rows = DATA.schedules.filter((q) => !q.replicate && q.latency === d).map((q) => {
    const runs = [q.schedule, ...reruns(q.schedule)].map((id) => aggregate(id, state.metric, null)?.v).filter((v) => v !== null && v !== undefined);
    return { id: q.schedule, s: q.strategy, h: q.horizon, runs, mean: d3.mean(runs) };
  }).sort((a, b) => (up ? b.mean - a.mean : a.mean - b.mean));
  const lw = 52, ax0 = x0 + lw, ax1 = x1 - 12;
  const hi = up ? 1 : d3.max(rows.flatMap((r) => r.runs)) * 1.05 || 1;
  const x = d3.scaleLinear().domain([0, hi]).range([ax0, ax1]);
  const rh = Math.max(13, Math.min(22, (bottom - top - 44) / Math.max(1, rows.length)));
  const y0 = top + 18;
  g.selectAll("text.rt").data([0]).join("text").attr("class", "rt").attr("x", x0).attr("y", top + 2).attr("font-size", 10).attr("font-weight", 700)
    .text(`Ranking at d = ${d}${state.dfocus !== null ? " (my latency)" : ""}`);
  g.selectAll("text.rs").data([0]).join("text").attr("class", "rs axis-title").attr("x", x0).attr("y", top + 13).attr("font-size", 9)
    .text(`${up ? "success" : Mt.btn.toLowerCase()} · ${up ? "best" : "least"} first`);
  const row = g.selectAll("g.rr").data(rows, (r) => r.id).join((en) => {
    const q = en.append("g").attr("class", "rr").style("cursor", "pointer");
    q.append("rect").attr("class", "hit"); q.append("path").attr("class", "sym"); q.append("text").attr("class", "lb");
    q.append("line").attr("class", "span"); q.append("g").attr("class", "re"); q.append("line").attr("class", "mn"); q.append("path").attr("class", "r0");
    return q;
  }).attr("transform", (r, i) => `translate(0,${y0 + i * rh + rh / 2})`);
  row.select(".hit").attr("x", x0).attr("y", -rh / 2).attr("width", x1 - x0).attr("height", rh)
    .attr("fill", (r) => (r.id === state.cand ? "#fdf3dc" : r.id === state.ref ? "#ececf0" : "transparent")).attr("rx", 3);
  row.select(".sym").attr("transform", `translate(${x0 + 4},0)`).attr("d", (r) => d3.symbol(STRAT_SYMBOL[r.s], 26)()).attr("fill", (r) => STRAT_COLOR[r.s]);
  row.select(".lb").attr("x", x0 + 10).attr("y", 3.5).attr("font-size", 9)
    .attr("font-weight", (r) => (r.id === state.ref || r.id === state.cand ? 800 : 400))
    .attr("fill", (r) => (r.id === state.cand ? "#9a6a00" : COLOR.ink))
    .text((r) => `${{ sync: "Sync", naive: "Naive", inpaint: "Inpaint" }[r.s]} h${r.h}`);
  row.select(".span").attr("x1", (r) => x(d3.min(r.runs))).attr("x2", (r) => x(d3.max(r.runs))).attr("stroke", (r) => STRAT_COLOR[r.s]).attr("stroke-opacity", 0.45).attr("stroke-width", 2);
  row.select(".re").selectAll("circle").data((r) => r.runs.slice(1).map((v) => ({ v, s: r.s }))).join("circle")
    .attr("cx", (q) => x(q.v)).attr("r", 2.6).attr("fill", "#fff").attr("stroke", (q) => STRAT_COLOR[q.s]).attr("stroke-width", 1.1);
  row.select(".mn").attr("x1", (r) => x(r.mean)).attr("x2", (r) => x(r.mean)).attr("y1", -5).attr("y2", 5).attr("stroke", COLOR.ink).attr("stroke-width", 1.4);
  row.select(".r0").attr("transform", (r) => `translate(${x(r.runs[0])},0)`).attr("d", (r) => d3.symbol(STRAT_SYMBOL[r.s], 30)()).attr("fill", (r) => STRAT_COLOR[r.s]).attr("stroke", "#fff").attr("stroke-width", 0.8);
  row.on("click", (ev, r) => { hideTip(); update({ cand: r.id }); })
    .on("mousemove", (ev, r) => showTip(ev, `<b>${label(r.id)}</b><br><span class="k">${Mt.label}, all ${DATA.seeds.length} start states:</span><br>run 0 ${fmtMetric(state.metric, r.runs[0])}${r.runs.length > 1 ? ` · re-runs ${r.runs.slice(1).map((v) => fmtMetric(state.metric, v)).join(", ")} · mean ${fmtMetric(state.metric, r.mean)}` : ""}<br><span class="k">${comparable(state.ref, r.id) ? "click = use as candidate" : "not compared with the current baseline: click a cell in A to change both"}</span>`))
    .on("mouseleave", hideTip);
  const yb = y0 + rows.length * rh + 2;
  g.selectAll("g.rax").data([0]).join("g").attr("class", "axis rax").attr("transform", `translate(0,${yb})`)
    .call(d3.axisBottom(x).tickValues(up ? [0, 0.5, 1] : x.ticks(3)).tickSize(3).tickFormat((v) => (Mt.pct ? `${Math.round(v * 100)}%` : `${v}`)))
    .call((q) => q.select(".domain").attr("stroke", "#c9c9cf"));
  g.selectAll("text.rn").data([0]).join("text").attr("class", "rn axis-title").attr("x", x0).attr("y", Math.min(bottom, yb + 26)).attr("font-size", 8.5)
    .text("● run 0  ○ re-runs  | mean");
}

// Every comparable unordered pair of schedules (49 of the 91 for 14, see data.comparable) is one exact
// McNemar test; the frames use Benjamini–Hochberg q-values over that family, so about 1 in 20 framed cells may be a false
// discovery instead of 1 in 20 of all cells. Computed once per task on all start states.
let qCache = { task: null, q: new Map() };
function qValues() {
  if (qCache.task === DATA.task) return qCache.q;
  const ids = DATA.schedules.filter((x) => !x.replicate).map((x) => x.schedule);
  const tests = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (!comparable(ids[i], ids[j])) continue;
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
  const cmp = comparable(r, c);
  const q = cmp ? qValues().get(pairKey(r, c)) ?? 1 : null;
  return { ...f, q, comparable: cmp, sig: cmp && !seeds && q < 0.05 };
}

function rawFlips(r, c, seeds) {
  const R = DATA.ep.get(r), C = DATA.ep.get(c), S = seeds ? [...seeds] : DATA.seeds;
  let gain = 0, loss = 0;
  for (const s of S) { const a = R.get(s)?.success, b = C.get(s)?.success; if (a === 0 && b === 1) gain++; if (a === 1 && b === 0) loss++; }
  // the yardstick for chance: what a plain re-run of each schedule changes, and whether the
  // difference of the pair comes back when both schedules are run again
  const fr = rerunFlips(r, seeds), fc = rerunFlips(c, seeds);
  const againV = reruns(r).map((id, k) => [id, reruns(c)[k]]).filter(([a, b]) => a && b)
    .map(([a, b]) => Math.round(aggregate(b, "success_rate", seeds, a).v * 100));
  const again = againV.map((k) => `${k > 0 ? "+" : k < 0 ? "−" : "±"}${Math.abs(k)}`);
  // do the re-runs show the same direction as run 0 (and not zero)?
  const d0 = Math.sign(gain - loss);
  const agree = d0 && againV.length && againV.every((k) => Math.sign(k) === d0) ? `${d0 > 0 ? "candidate better" : "candidate worse"} in all ${againV.length + 1} runs` : null;
  const f1 = (v) => (Number.isInteger(v) ? v : v.toFixed(1));
  const chance = fr === null || fc === null ? "no re-runs of these schedules yet"
    : `chance level: a plain re-run flips ${f1(fr)} start states of the baseline and ${f1(fc)} of the candidate${again.length ? ` · the same pair in the re-runs: <b>${again.join(", ")}</b> points` : ""}`;
  return { gain, loss, n: S.length, chance, agree, p: mcnemar(gain, loss) };
}

// exact two-sided McNemar test = binomial sign test on the discordant start states
function mcnemar(g, l) {
  const n = g + l;
  if (!n) return 1;
  let tail = 0, c = 1;  // c = C(n, i)
  for (let i = 0; i <= Math.min(g, l); i++) { tail += c; c = (c * (n - i)) / (i + 1); }
  return Math.min(1, (2 * tail) / 2 ** n);
}
