// View A, "Pairs" tab: an overview of every baseline → candidate comparison, so that the pair is
// chosen from what the data show instead of from a drop-down. Rows = baseline, columns = candidate,
// both ordered strategy → h → d. A cell's colour is the mean paired difference candidate − baseline
// over the same start states for the question chosen in the bar (purple = candidate better, grey =
// candidate worse, white = no difference); a dark frame marks cells whose 95 % interval of the paired
// difference excludes 0, i.e. differences that are unlikely to be chance. Click a cell = load that pair.
import { state, update, bus } from "../state.js";
import { DATA, STRATEGIES, HORIZONS, LATENCIES, label, aggregate } from "../data.js";
import { COLOR, STRAT_COLOR, METRICS, fmtMetric, showTip, hideTip, size } from "../util.js";

const BETTER = "#5e3c99", WORSE = "#8a8a92", MID = "#f7f7f8";
const ORDER_H = [4, 8];  // within a strategy: h, then d
let root, svg, noteSel;

export function initPairs() {
  root = d3.select("#pairs");
  svg = root.append("svg");
  noteSel = d3.select("#responseNote");
  bus.on("change.pairs", (keys) => {
    if (["task", "ref", "cand", "metric", "brushed"].some((k) => keys.has(k))) render();
  });
  render();
}
export function resizePairs() { render(); }

function schedules() {
  const out = [];
  for (const s of STRATEGIES) for (const h of ORDER_H) for (const d of LATENCIES) {
    const id = `${s}_d${d}_h${h}`;
    if (DATA.schedById.has(id)) out.push({ id, s, h, d });
  }
  return out;
}

// higher is better only for the success rate; the other questions are costs (lower is better)
const sign = () => (state.metric === "success_rate" ? 1 : -1);

function render() {
  if (state.aview !== "pairs") return;
  const S = schedules(), n = S.length;
  const seeds = state.brushed;
  const cells = [];
  for (const r of S) for (const c of S) {
    if (r.id === c.id) { cells.push({ r, c, diag: true }); continue; }
    const a = aggregate(c.id, state.metric, seeds, r.id);
    cells.push({ r, c, v: a.v, lo: a.lo, hi: a.hi, n: a.n, sig: a.lo > 0 || a.hi < 0 });
  }
  const M = d3.max(cells, (q) => (q.diag ? 0 : Math.abs(q.v))) || 1;
  const col = (v) => {
    const t = Math.max(-1, Math.min(1, (v * sign()) / M));
    return t >= 0 ? d3.interpolateRgb(MID, BETTER)(t) : d3.interpolateRgb(MID, WORSE)(-t);
  };

  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const m = { l: 74, t: 58, r: 118, b: 4 };
  const gaps = 4 * (STRATEGIES.length - 1);
  const cs = Math.max(7, Math.floor(Math.min((w - m.l - m.r - gaps) / n, (h - m.t - m.b - gaps) / n)));
  const gx = (i) => m.l + i * cs + Math.floor(S[i] ? STRATEGIES.indexOf(S[i].s) * 4 : 0);  // small gap between strategies
  const pos = new Map(S.map((q, i) => [q.id, i]));
  const X = (id) => gx(pos.get(id)), Y = (id) => m.t + pos.get(id) * cs + STRATEGIES.indexOf(DATA.schedById.get(id).strategy) * 4;
  const short = (q) => `d${q.d} h${q.h}`;

  // strategy bands along both axes (hue = strategy, as in B's column headers)
  const groups = STRATEGIES.map((s) => ({ s, ids: S.filter((q) => q.s === s).map((q) => q.id) })).filter((g) => g.ids.length);
  svg.selectAll("g.cb").data(groups, (g) => g.s).join((en) => { const g = en.append("g").attr("class", "cb"); g.append("rect"); g.append("text"); return g; })
    .call((g) => g.select("rect").attr("x", (d) => X(d.ids[0])).attr("y", m.t - 34).attr("width", (d) => d.ids.length * cs - 1).attr("height", 3).attr("fill", (d) => STRAT_COLOR[d.s]))
    .call((g) => g.select("text").attr("x", (d) => X(d.ids[0])).attr("y", m.t - 38).attr("font-size", 10).attr("font-weight", 700).text((d) => ({ sync: "Sync", naive: "Naive", inpaint: "Inpaint" })[d.s]));
  svg.selectAll("g.rb").data(groups, (g) => g.s).join((en) => { const g = en.append("g").attr("class", "rb"); g.append("rect"); g.append("text"); return g; })
    .call((g) => g.select("rect").attr("x", 4).attr("y", (d) => Y(d.ids[0])).attr("width", 3).attr("height", (d) => d.ids.length * cs - 1).attr("fill", (d) => STRAT_COLOR[d.s]))
    .call((g) => g.select("text").attr("transform", (d) => `translate(16,${Y(d.ids[0]) + (d.ids.length * cs) / 2}) rotate(-90)`).attr("text-anchor", "middle")
      .attr("font-size", 9.5).attr("font-weight", 700).text((d) => ({ sync: "Sync", naive: "Naive", inpaint: "Inpaint" })[d.s]));
  // per-schedule labels
  svg.selectAll("text.colL").data(S, (q) => q.id).join("text").attr("class", "colL axis-title")
    .attr("transform", (q) => `translate(${X(q.id) + cs / 2 + 3},${m.t - 3}) rotate(-90)`).attr("font-size", 8.5)
    .attr("font-weight", (q) => (q.id === state.cand ? 800 : 400)).attr("fill", (q) => (q.id === state.cand ? "#9a6a00" : null)).text(short);
  svg.selectAll("text.rowL").data(S, (q) => q.id).join("text").attr("class", "rowL axis-title")
    .attr("x", m.l - 4).attr("y", (q) => Y(q.id) + cs / 2 + 3).attr("text-anchor", "end").attr("font-size", 8.5)
    .attr("font-weight", (q) => (q.id === state.ref ? 800 : 400)).attr("fill", (q) => (q.id === state.ref ? COLOR.ref : null)).text(short);
  const lx = X(S[S.length - 1].id) + cs + 18;
  svg.selectAll("text.axT").data(["row = baseline", "column = candidate"]).join("text").attr("class", "axT axis-title")
    .attr("x", lx).attr("y", (d, i) => m.t - 30 + i * 12).attr("font-size", 9.5).attr("font-weight", 700).text((d) => d);

  // cells
  const sel = svg.selectAll("rect.pc").data(cells, (q) => `${q.r.id}|${q.c.id}`).join("rect").attr("class", "pc")
    .attr("x", (q) => X(q.c.id)).attr("y", (q) => Y(q.r.id)).attr("width", cs - 1).attr("height", cs - 1)
    .attr("fill", (q) => (q.diag ? "#fff" : col(q.v))).attr("stroke", (q) => (q.sig ? COLOR.ink : q.diag ? "#e3e3e8" : "none"))
    .attr("stroke-width", (q) => (q.sig ? 1.6 : 1)).style("cursor", (q) => (q.diag ? "default" : "pointer"));
  sel.on("mousemove", (ev, q) => {
    if (q.diag) return;
    const Mt = METRICS[state.metric];
    const rel = state.metric === "success_rate" ? flips(q.r.id, q.c.id, seeds) : null;
    const better = q.v * sign() > 0;
    showTip(ev, `<b>baseline</b> ${label(q.r.id)}<br><b>candidate</b> ${label(q.c.id)}<br>
      ${Mt.label}: ${fmtMetric(state.metric, aggregate(q.r.id, state.metric, seeds).v)} → ${fmtMetric(state.metric, aggregate(q.c.id, state.metric, seeds).v)}
      (paired ${fmtMetric(state.metric, q.v, true)}, 95 % interval ${fmtMetric(state.metric, q.lo, true)} … ${fmtMetric(state.metric, q.hi, true)})<br>
      ${rel ? `on the same start states: <b>${rel.gain} rescued</b>, <b>${rel.loss} lost</b> of ${rel.n} · chance level (re-run): ${rel.chance} flips<br>` : ""}
      ${q.sig ? `<b>${better ? "candidate better" : "candidate worse"}, unlikely to be chance</b>` : "difference within chance"}<br><span class="k">click = compare this pair in all views</span>`);
  }).on("mouseleave", hideTip)
    .on("click", (ev, q) => { if (!q.diag) { hideTip(); update({ ref: q.r.id, cand: q.c.id }); } });

  // current pair
  const cur = cells.find((q) => q.r.id === state.ref && q.c.id === state.cand);
  svg.selectAll("rect.cur").data(cur ? [cur] : []).join("rect").attr("class", "cur").attr("pointer-events", "none")
    .attr("x", (q) => X(q.c.id) - 2.5).attr("y", (q) => Y(q.r.id) - 2.5).attr("width", cs + 4).attr("height", cs + 4)
    .attr("fill", "none").attr("stroke", COLOR.cand).attr("stroke-width", 2.5).attr("rx", 2);

  legend(m, S, cs, M, col, X, Y);
  noteSel.html(`Every cell compares two schedules on the <b>same ${seeds ? seeds.size : DATA.seeds.length} start states</b>${seeds ? " selected in B (Esc clears)" : ""}:
    colour = mean paired difference candidate − baseline in <b>${METRICS[state.metric].label}</b> (<span style="color:${BETTER};font-weight:700">purple = candidate better</span>,
    grey = candidate worse); <b>framed</b> = 95 % interval excludes 0, i.e. unlikely to be chance. Start with a framed, dark cell; <b>click it</b> to load the pair in B, C and D.`);
}

function flips(r, c, seeds) {
  const R = DATA.ep.get(r), C = DATA.ep.get(c), S = seeds ? [...seeds] : DATA.seeds;
  let gain = 0, loss = 0;
  for (const s of S) { const a = R.get(s)?.success, b = C.get(s)?.success; if (a === 0 && b === 1) gain++; if (a === 1 && b === 0) loss++; }
  const rep = DATA.schedules.find((x) => x.replicate);
  let chance = "–";
  if (rep) { const A = DATA.ep.get(rep.schedule), B = DATA.ep.get(`sync_d${rep.latency}_h${rep.horizon}`); chance = S.filter((s) => A.get(s)?.success !== B.get(s)?.success).length; }
  return { gain, loss, n: S.length, chance };
}

function legend(m, S, cs, M, col, X, Y) {
  const x0 = X(S[S.length - 1].id) + cs + 18, y0 = m.t + 4, H = Math.min(120, S.length * cs * 0.6);
  const g = svg.selectAll("g.plg").data([0]).join((en) => {
    const q = en.append("g").attr("class", "plg");
    q.append("defs").append("linearGradient").attr("id", "pairGrad").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
    q.append("rect").attr("class", "bar"); q.append("g").attr("class", "lab"); q.append("rect").attr("class", "sig"); q.append("text").attr("class", "sigt");
    return q;
  });
  const st = d3.range(0, 1.0001, 0.1);
  g.select("linearGradient").selectAll("stop").data(st).join("stop").attr("offset", (t) => t)
    .attr("stop-color", (t) => col(((1 - 2 * t) * M) * (state.metric === "success_rate" ? 1 : -1)));
  g.select("rect.bar").attr("x", x0).attr("y", y0).attr("width", 10).attr("height", H).attr("fill", "url(#pairGrad)").attr("stroke", "#d6d6db");
  const labs = [[0, "candidate better"], [0.5, "no difference"], [1, "candidate worse"]];
  g.select("g.lab").selectAll("text").data(labs).join("text").attr("class", "axis-title").attr("x", x0 + 14).attr("y", (d) => y0 + d[0] * H + 3)
    .attr("font-size", 9.5).text((d) => d[1]);
  g.select("rect.sig").attr("x", x0).attr("y", y0 + H + 14).attr("width", 10).attr("height", 10).attr("fill", "#fff").attr("stroke", COLOR.ink).attr("stroke-width", 1.6);
  g.select("text.sigt").attr("class", "axis-title sigt").attr("x", x0 + 14).attr("y", y0 + H + 23).attr("font-size", 9.5).text("unlikely chance");
  svg.selectAll("g.curlg").data([0]).join((en) => { const q = en.append("g").attr("class", "curlg"); q.append("rect"); q.append("text"); return q; })
    .call((q) => q.select("rect").attr("x", x0 - 1).attr("y", y0 + H + 32).attr("width", 12).attr("height", 12).attr("fill", "none").attr("stroke", COLOR.cand).attr("stroke-width", 2.5).attr("rx", 2))
    .call((q) => q.select("text").attr("class", "axis-title").attr("x", x0 + 14).attr("y", y0 + H + 42).attr("font-size", 9.5).text("current pair"));
}
