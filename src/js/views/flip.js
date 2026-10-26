// View B: paired flip matrix — rows = initial states (seeds), columns = schedules,
// cell colour = outcome of that seed under the column schedule relative to the reference R.
import { state, update, bus } from "../state.js";
import { DATA, STRATEGIES, STRAT_LABEL, HORIZONS, LATENCIES, label, shortLabel } from "../data.js";
import { COLOR, showTip, hideTip, size, segButtons } from "../util.js";

let root, svg, setSortBtn, cols, groupsPresent;
const GROUP_LABEL = { replicate: "Noise", ...STRAT_LABEL };

const CLS = {
  bothOk: { fill: COLOR.bothOk, name: "both succeed" },
  bothFail: { fill: COLOR.bothFail, name: "both fail" },
  gain: { fill: COLOR.gain, name: "gain: succeeds, R fails" },
  loss: { fill: COLOR.loss, name: "loss: fails, R succeeds" },
};

export function initFlip() {
  const ctr = d3.select("#flipControls");
  ctr.append("span").text("rows:");
  setSortBtn = segButtons(ctr, [
    { label: "robustness", value: "robust" }, { label: "R→C flips first", value: "flip" }, { label: "seed", value: "seed" },
  ], state.sort, (v) => update({ sort: v }));
  root = d3.select("#flip");
  svg = root.append("svg");
  cols = [];
  for (const sc of DATA.schedules.filter((x) => x.replicate)) {
    cols.push({ id: sc.schedule, s: "replicate", h: sc.horizon, d: sc.latency });
  }
  for (const s of STRATEGIES) for (const h of HORIZONS) for (const d of LATENCIES) {
    const id = `${s}_d${d}_h${h}`;
    if (DATA.schedById.has(id)) cols.push({ id, s, h, d });
  }
  groupsPresent = ["replicate", ...STRATEGIES].filter((g) => cols.some((c) => c.s === g));
  render();
  bus.on("change.flip", (keys) => {
    if (["ref", "cand", "sort", "seed", "brushed", "hoverSeed"].some((k) => keys.has(k))) {
      setSortBtn(state.sort); render();
    }
  });
}

function outcome(sched, seed) { return DATA.ep.get(sched)?.get(seed)?.success; }
function cls(sched, seed) {
  const o = outcome(sched, seed), r = outcome(state.ref, seed);
  if (o === 1 && r === 1) return "bothOk";
  if (o === 0 && r === 0) return "bothFail";
  return o === 1 ? "gain" : "loss";
}

function rowOrder() {
  const seeds = [...DATA.seeds];
  if (state.sort === "seed") return seeds;
  if (state.sort === "flip") {
    const rank = { loss: 0, gain: 1, bothFail: 2, bothOk: 3 };
    return seeds.sort((a, b) => rank[cls(state.cand, a)] - rank[cls(state.cand, b)] || DATA.robust.get(a) - DATA.robust.get(b));
  }
  return seeds.sort((a, b) => DATA.robust.get(a) - DATA.robust.get(b) || a - b);
}

function render() {
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const left = 34, top = 34, right = 46, bottom = 58;
  // columns: small gaps between strategy groups
  const groupGap = 6;
  const cw = (w - left - right - groupGap * (groupsPresent.length - 1)) / cols.length;
  const xpos = new Map(cols.map((c, i) => [c.id, i * cw + groupsPresent.indexOf(c.s) * groupGap]));
  const order = rowOrder();
  const rh = (h - top - bottom) / order.length;
  const yIdx = new Map(order.map((s, i) => [s, i]));

  const g = svg.selectAll("g.fm").data([0]).join("g").attr("class", "fm").attr("transform", `translate(${left},${top})`);

  // strategy group headers + horizon sub-labels
  const groups = groupsPresent.map((s) => {
    const cs = cols.filter((c) => c.s === s);
    return cs.length ? { s, x0: xpos.get(cs[0].id), x1: xpos.get(cs[cs.length - 1].id) + cw, cs } : null;
  }).filter(Boolean);
  g.selectAll("text.gh").data(groups).join("text").attr("class", "gh").attr("font-size", 10.5).attr("font-weight", 700)
    .attr("x", (d) => (d.s === "replicate" ? d.x1 + 2 : (d.x0 + d.x1) / 2)).attr("y", -22).attr("text-anchor", (d) => (d.s === "replicate" ? "end" : "middle")).text((d) => GROUP_LABEL[d.s]);
  const hsub = groups.filter((gr) => gr.s !== "replicate").flatMap((gr) => HORIZONS.map((hz) => {
    const cs = gr.cs.filter((c) => c.h === hz);
    return cs.length ? { key: `${gr.s}${hz}`, h: hz, x0: xpos.get(cs[0].id), x1: xpos.get(cs[cs.length - 1].id) + cw } : null;
  }).filter(Boolean));
  g.selectAll("text.hs").data(hsub, (d) => d.key).join("text").attr("class", "hs axis-title").attr("font-size", 9)
    .attr("x", (d) => (d.x0 + d.x1) / 2).attr("y", -10).attr("text-anchor", "middle").text((d) => (d.x1 - d.x0 > 14 ? `h${d.h}` : ""));
  g.selectAll("line.hsep").data(hsub, (d) => d.key).join("line").attr("class", "hsep")
    .attr("x1", (d) => d.x0).attr("x2", (d) => d.x1 - 1).attr("y1", -6).attr("y2", -6).attr("stroke", "#c9c9cf");

  // cells
  const cellData = [];
  for (const seed of order) for (const c of cols) cellData.push({ seed, c });
  const dim = (seed) => (state.brushed && !state.brushed.has(seed) ? 0.18 : 1);
  g.selectAll("rect.c").data(cellData, (d) => `${d.seed}|${d.c.id}`).join("rect").attr("class", "c")
    .attr("x", (d) => xpos.get(d.c.id)).attr("width", Math.max(1, cw - 0.6))
    .attr("height", Math.max(1, rh - 0.8))
    .attr("fill", (d) => CLS[cls(d.c.id, d.seed)].fill)
    .attr("opacity", (d) => dim(d.seed))
    .style("cursor", "pointer")
    .on("mousemove", (ev, d) => {
      const e = DATA.ep.get(d.c.id).get(d.seed);
      const r = DATA.ep.get(state.ref).get(d.seed);
      showTip(ev, `<b>seed ${d.seed}</b> · ${label(d.c.id)}<br>${CLS[cls(d.c.id, d.seed)].name}<br>
        <span class="k">coverage:</span> ${Math.round(e.coverage_final * 100)}% (R ${Math.round(r.coverage_final * 100)}%)<br>
        <span class="k">seam gap:</span> ${e.seam_gap_mean.toFixed(1)} px · <span class="k">staleness:</span> ${e.staleness_mean.toFixed(1)}<br>
        <span class="k">seed robust in ${Math.round(DATA.robust.get(d.seed) * 100)}% of schedules</span><br>
        <span class="k">click = open this episode with this schedule as C</span>`);
      if (state.hoverSeed !== d.seed) update({ hoverSeed: d.seed });
    })
    .on("mouseleave", () => { hideTip(); update({ hoverSeed: null }); })
    .on("click", (ev, d) => {
      const patch = { seed: d.seed, t: 0, win: null };
      if (d.c.id !== state.ref) patch.cand = d.c.id;
      update(patch);
    })
    .transition().duration(350)
    .attr("y", (d) => yIdx.get(d.seed) * rh);

  // R / C column markers
  const marks = [{ id: state.ref, col: COLOR.ref, t: "R" }, { id: state.cand, col: COLOR.cand, t: "C" }];
  g.selectAll("rect.colmark").data(marks).join("rect").attr("class", "colmark").attr("pointer-events", "none")
    .attr("x", (d) => xpos.get(d.id) - 1.5).attr("y", -3).attr("width", cw + 2).attr("height", order.length * rh + 4)
    .attr("fill", "none").attr("stroke", (d) => d.col).attr("stroke-width", 2.2).attr("rx", 2);
  g.selectAll("text.colmark").data(marks).join("text").attr("class", "colmark").attr("font-weight", 800).attr("font-size", 10)
    .attr("x", (d) => xpos.get(d.id) + cw / 2).attr("y", order.length * rh + 13).attr("text-anchor", "middle")
    .attr("fill", (d) => d.col).text((d) => d.t);
  g.selectAll("rect.colhit").data(cols, (d) => d.id).join("rect").attr("class", "colhit")
    .attr("x", (d) => xpos.get(d.id)).attr("y", -6).attr("width", cw).attr("height", 6).attr("fill", "transparent").style("cursor", "pointer")
    .on("click", (ev, d) => (ev.shiftKey ? update({ ref: d.id }) : update({ cand: d.id })))
    .on("mousemove", (ev, d) => showTip(ev, `<b>${label(d.id)}</b><br>click = candidate, shift-click = reference`))
    .on("mouseleave", hideTip);

  // row labels, robustness bars, selection
  g.selectAll("text.rl").data(order, (d) => d).join("text").attr("class", "rl axis-title").attr("font-size", Math.min(9.5, rh))
    .attr("x", -4).attr("text-anchor", "end").attr("dy", "0.8em")
    .attr("font-weight", (d) => (d === state.seed ? 800 : 400))
    .attr("fill", (d) => (d === state.seed ? COLOR.sel : null))
    .text((d) => (rh >= 7 || d === state.seed ? d : "")).style("cursor", "pointer")
    .on("click", (ev, d) => update({ seed: d, t: 0, win: null }))
    .transition().duration(350).attr("y", (d) => yIdx.get(d) * rh);
  const gridW = xpos.get(cols[cols.length - 1].id) + cw;
  const bx = d3.scaleLinear().domain([0, 1]).range([0, right - 12]);
  g.selectAll("rect.rb").data(order, (d) => d).join("rect").attr("class", "rb")
    .attr("x", gridW + 6).attr("height", Math.max(1, rh - 1.5)).attr("width", (d) => bx(DATA.robust.get(d)))
    .attr("fill", "#8d8d96").attr("opacity", (d) => dim(d))
    .transition().duration(350).attr("y", (d) => yIdx.get(d) * rh);
  g.selectAll("text.rbt").data([0]).join("text").attr("class", "rbt axis-title").attr("font-size", 9)
    .attr("x", gridW + 6).attr("y", -10).text("robust");

  const hl = [state.seed, state.hoverSeed].filter((s) => s !== null && yIdx.has(s));
  g.selectAll("rect.rowsel").data(hl).join("rect").attr("class", "rowsel").attr("pointer-events", "none")
    .attr("x", -2).attr("width", gridW + 4).attr("height", rh + 1).attr("fill", "none")
    .attr("stroke", (d, i) => (d === state.seed ? COLOR.sel : "#555")).attr("stroke-width", (d) => (d === state.seed ? 2 : 1))
    .attr("stroke-dasharray", (d) => (d === state.seed ? null : "3 2"))
    .attr("y", (d) => yIdx.get(d) * rh - 0.5);

  // legend + flip counts for C vs R
  const counts = d3.rollup(DATA.seeds, (v) => v.length, (s) => cls(state.cand, s));
  const lg = svg.selectAll("g.lg").data([0]).join("g").attr("class", "lg")
    .attr("transform", `translate(${left},${h - bottom + 26})`);
  const items = ["loss", "gain", "bothOk", "bothFail"];
  const itemW = (w - left - 10) / 2;
  lg.selectAll("g.it").data(items).join((en) => { const q = en.append("g").attr("class", "it"); q.append("rect"); q.append("text"); return q; })
    .attr("transform", (d, i) => `translate(${(i % 2) * itemW},${Math.floor(i / 2) * 14})`)
    .call((q) => q.select("rect").attr("width", 10).attr("height", 10).attr("fill", (d) => CLS[d].fill).attr("stroke", "#bbb").attr("stroke-width", 0.5))
    .call((q) => q.select("text").attr("x", 14).attr("y", 9).attr("font-size", 10.5)
      .text((d) => `${CLS[d].name} (C: ${counts.get(d) || 0})`));
}

export function resizeFlip() { render(); }
