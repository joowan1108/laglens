// View A: small-multiple heatmaps (one per strategy) of latency × execution horizon.
import { state, update, bus } from "../state.js";
import { DATA, STRATEGIES, STRAT_LABEL, LATENCIES, HORIZONS, label, missingReason } from "../data.js";
import { COLOR, METRICS, showTip, hideTip, size, segButtons } from "../util.js";

let root, svg, setMetricBtn, setModeBtn;

export function initMatrix() {
  const ctr = d3.select("#matrixControls");
  ctr.append("span").text("colour:");
  const sel = ctr.append("select").on("change", (ev) => update({ metric: ev.target.value }));
  sel.selectAll("option").data(Object.entries(METRICS)).join("option")
    .attr("value", (d) => d[0]).text((d) => d[1].label);
  sel.property("value", state.metric);
  setModeBtn = segButtons(ctr, [{ label: "absolute", value: "abs" }, { label: "Δ vs R", value: "delta" }],
    state.mode, (v) => update({ mode: v }));
  setMetricBtn = (v) => sel.property("value", v);
  root = d3.select("#matrix");
  svg = root.append("svg");
  const defs = svg.append("defs");
  defs.append("pattern").attr("id", "hatchA").attr("width", 5).attr("height", 5)
    .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)")
    .append("line").attr("y2", 5).attr("stroke", "#c9c9cf").attr("stroke-width", 1.5);
  defs.append("linearGradient").attr("id", "legendGrad");
  render();
  bus.on("change.matrix", (keys) => {
    if (["ref", "cand", "metric", "mode"].some((k) => keys.has(k))) {
      setMetricBtn(state.metric); setModeBtn(state.mode); render();
    }
  });
}

function scaleFor() {
  const m = METRICS[state.metric];
  const vals = DATA.schedules.filter((s) => !s.replicate).map((s) => s[state.metric]);
  if (state.mode === "abs") {
    const ext = d3.extent(vals);
    // brighter = better for every metric (reverse the ramp when lower is better)
    const dom = m.higherBetter ? ext : [ext[1], ext[0]];
    return { color: d3.scaleSequential(d3.interpolateViridis).domain(dom), value: (s) => s[state.metric], dom, diverging: false };
  }
  const r = DATA.schedById.get(state.ref)[state.metric];
  const deltas = vals.map((v) => v - r);
  const M = d3.max(deltas, Math.abs) || 1;
  const better = m.higherBetter ? 1 : -1;
  const interp = d3.piecewise(d3.interpolateRgb, [COLOR.loss, "#f7f7f7", COLOR.gain]);
  const color = d3.scaleDiverging((t) => interp(t)).domain([-M * better, 0, M * better]);
  return { color, value: (s) => s[state.metric] - r, dom: [-M, M], diverging: true };
}

function render() {
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const m = METRICS[state.metric];
  const sc = scaleFor();
  const left = 30, top = 44, gap = 10, legendH = 40;
  const pw = (w - left - 8 - gap * 2) / 3;
  const cw = pw / LATENCIES.length;
  const ch = Math.min(cw * 1.6, (h - top - legendH - 14) / HORIZONS.length);
  const x = d3.scaleBand().domain(LATENCIES).range([0, pw]).paddingInner(0.06);
  const y = d3.scaleBand().domain(HORIZONS).range([0, ch * HORIZONS.length]).paddingInner(0.06);

  const panels = svg.selectAll("g.mpanel").data(STRATEGIES).join("g").attr("class", "mpanel")
    .attr("transform", (d, i) => `translate(${left + i * (pw + gap)},${top})`);
  panels.selectAll("text.ptitle").data((d) => [d]).join("text").attr("class", "ptitle")
    .attr("y", -20).attr("font-weight", 700).attr("font-size", 11.5).text((d) => STRAT_LABEL[d]);
  panels.selectAll("g.xax").data([0]).join("g").attr("class", "axis xax")
    .call(d3.axisTop(x).tickSize(0).tickFormat((d) => `d${d}`)).call((g) => g.select(".domain").remove())
    .attr("transform", "translate(0,-3)");

  const cells = panels.selectAll("g.cell").data((strat) => {
    const out = [];
    for (const hz of HORIZONS) for (const d of LATENCIES) {
      out.push({ strat, d, h: hz, id: `${strat}_d${d}_h${hz}` });
    }
    return out;
  }).join((enter) => {
    const g = enter.append("g").attr("class", "cell").style("cursor", "pointer");
    g.append("rect").attr("class", "fill");
    g.append("text").attr("class", "val").attr("text-anchor", "middle").attr("dy", "0.35em").attr("font-size", 10.5);
    g.append("rect").attr("class", "ring").attr("fill", "none").attr("pointer-events", "none");
    return g;
  }).attr("transform", (c) => `translate(${x(c.d)},${y(c.h)})`);

  cells.select("rect.fill").attr("width", x.bandwidth()).attr("height", y.bandwidth()).attr("rx", 2)
    .attr("fill", (c) => {
      const s = DATA.schedById.get(c.id);
      return s ? sc.color(sc.value(s)) : "url(#hatchA)";
    });
  cells.select("text.val").attr("x", x.bandwidth() / 2).attr("y", y.bandwidth() / 2)
    .text((c) => {
      const s = DATA.schedById.get(c.id);
      if (!s || x.bandwidth() < 22) return "";
      const v = sc.value(s);
      if (sc.diverging) return c.id === state.ref ? "R" : (v > 0 ? "+" : "") + (state.metric.includes("rate") || state.metric.includes("frac") || state.metric.includes("coverage") ? Math.round(v * 100) : v.toFixed(1));
      return m.fmt(v);
    })
    .attr("fill", (c) => {
      const s = DATA.schedById.get(c.id);
      if (!s) return "none";
      const col = d3.hsl(sc.color(sc.value(s)));
      return col.l > 0.55 ? "#1d1d1f" : "#fff";
    });
  cells.select("rect.ring").attr("x", -1.5).attr("y", -1.5).attr("width", x.bandwidth() + 3).attr("height", y.bandwidth() + 3)
    .attr("rx", 3)
    .attr("stroke", (c) => (c.id === state.cand ? COLOR.cand : c.id === state.ref ? COLOR.ref : "none"))
    .attr("stroke-width", 3);

  cells.on("click", (ev, c) => {
    if (!DATA.schedById.has(c.id)) return;
    if (ev.shiftKey) update({ ref: c.id }); else update({ cand: c.id });
  }).on("mousemove", (ev, c) => {
    const s = DATA.schedById.get(c.id);
    if (!s) { showTip(ev, `<b>${STRAT_LABEL[c.strat]}, d=${c.d}, h=${c.h}</b><br>${missingReason(c.strat, c.d, c.h)}`); return; }
    const r = DATA.schedById.get(state.ref);
    const row = (k) => {
      const mm = METRICS[k], dv = s[k] - r[k];
      const ds = c.id === state.ref ? "" : ` <span class="k">(${dv >= 0 ? "+" : ""}${k.includes("rate") || k.includes("frac") || k.includes("coverage") ? Math.round(dv * 100) + " pt" : dv.toFixed(2)} vs R)</span>`;
      return `<span class="k">${mm.label}:</span> ${mm.fmt(s[k])}${ds}`;
    };
    const rep = DATA.schedById.get(`${c.id}_r1`);
    const repLine = rep ? `<br><span class="k">noise replicate (same schedule, new sampling noise):</span> ${METRICS[state.metric].fmt(rep[state.metric])}` : "";
    showTip(ev, `<b>${label(c.id)}</b><br>${Object.keys(METRICS).map(row).join("<br>")}${repLine}<br><span class="k">${s.n} episodes · click = candidate, shift-click = reference</span>`);
  }).on("mouseleave", hideTip);

  // y axis (first panel only)
  svg.selectAll("g.yax").data([0]).join("g").attr("class", "axis yax")
    .attr("transform", `translate(${left - 3},${top})`)
    .call(d3.axisLeft(y).tickSize(0).tickFormat((d) => `h${d}`)).call((g) => g.select(".domain").remove());
  svg.selectAll("text.ytitle").data([0]).join("text").attr("class", "axis-title ytitle")
    .attr("transform", `translate(9,${top + (ch * HORIZONS.length) / 2}) rotate(-90)`).attr("text-anchor", "middle")
    .text("exec. horizon h (steps)");
  svg.selectAll("text.xtitle").data([0]).join("text").attr("class", "axis-title xtitle")
    .attr("x", w - 8).attr("y", 11).attr("text-anchor", "end").text("inference latency d (steps, ×100 ms) →");

  // legend
  const ly = top + ch * HORIZONS.length + 14, lw = Math.min(220, w - left - 120);
  const grad = svg.select("#legendGrad");
  const stops = d3.range(0, 1.0001, 0.1);
  const [d0, d1] = sc.diverging ? [sc.color.domain()[0], sc.color.domain()[2]] : sc.dom;
  grad.selectAll("stop").data(stops).join("stop").attr("offset", (t) => t)
    .attr("stop-color", (t) => sc.color(d0 + t * (d1 - d0)));
  const lg = svg.selectAll("g.legend").data([0]).join("g").attr("class", "legend").attr("transform", `translate(${left},${ly})`);
  lg.selectAll("rect").data([0]).join("rect").attr("width", lw).attr("height", 9).attr("rx", 2).attr("fill", "url(#legendGrad)");
  const lab = sc.diverging
    ? [`worse than R`, `better than R`]
    : [`${m.fmt(sc.dom[0])}`, `${m.fmt(sc.dom[1])} (better)`];
  lg.selectAll("text.l0").data([0]).join("text").attr("class", "axis-title l0").attr("y", 21).text(lab[0]);
  lg.selectAll("text.l1").data([0]).join("text").attr("class", "axis-title l1").attr("x", lw).attr("y", 21).attr("text-anchor", "end").text(lab[1]);
  lg.selectAll("text.l2").data([0]).join("text").attr("class", "axis-title l2").attr("x", lw + 8).attr("y", 8)
    .text(sc.diverging ? `Δ ${m.label}` : m.label);
  lg.selectAll("rect.hk").data([0]).join("rect").attr("class", "hk").attr("x", lw + 8).attr("y", 13).attr("width", 10).attr("height", 10).attr("fill", "url(#hatchA)").attr("stroke", "#ccc");
  lg.selectAll("text.hk").data([0]).join("text").attr("class", "axis-title hk").attr("x", lw + 22).attr("y", 22).text("no data (hover)");
}

export function resizeMatrix() { render(); }
