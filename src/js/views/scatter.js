// View E: paired trade-off scatter — each seed under R (black) and C (orange), linked by a segment.
import { state, update, bus } from "../state.js";
import { DATA, label } from "../data.js";
import { COLOR, EP_ATTRS, showTip, hideTip, size } from "../util.js";

let root, svg, brush, brushKey = null;

export function initScatter() {
  const ctr = d3.select("#scatterControls");
  const mk = (key, name) => {
    ctr.append("span").text(name);
    const s = ctr.append("select").on("change", (ev) => update({ [key]: ev.target.value }));
    s.selectAll("option").data(Object.entries(EP_ATTRS)).join("option").attr("value", (d) => d[0]).text((d) => d[1]);
    s.property("value", state[key]);
    return s;
  };
  const sx = mk("sx", "x:"), sy = mk("sy", "y:");
  root = d3.select("#scatter");
  svg = root.append("svg");
  render();
  bus.on("change.scatter", (keys) => {
    if (["ref", "cand", "sx", "sy", "seed", "hoverSeed", "brushed"].some((k) => keys.has(k))) {
      sx.property("value", state.sx); sy.property("value", state.sy);
      render();
    }
  });
}

function render() {
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const m = { l: 44, r: 12, t: 22, b: 32 };
  const R = DATA.ep.get(state.ref), C = DATA.ep.get(state.cand);
  const pairs = DATA.seeds.map((s) => ({ seed: s, r: R.get(s), c: C.get(s) }));
  const all = pairs.flatMap((p) => [p.r, p.c]);
  const x = d3.scaleLinear().domain(d3.extent(all, (d) => d[state.sx])).nice().range([m.l, w - m.r]);
  const y = d3.scaleLinear().domain(d3.extent(all, (d) => d[state.sy])).nice().range([h - m.b, m.t]);

  svg.selectAll("g.xax").data([0]).join("g").attr("class", "axis xax").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6));
  svg.selectAll("g.yax").data([0]).join("g").attr("class", "axis yax").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5));
  svg.selectAll("g.grid").data([0]).join("g").attr("class", "gridline grid").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat("")).call((g) => g.select(".domain").remove()).lower();
  svg.selectAll("text.xt").data([0]).join("text").attr("class", "axis-title xt").attr("x", w - m.r).attr("y", h - 3).attr("text-anchor", "end").text(`${EP_ATTRS[state.sx]} →`);
  svg.selectAll("text.yt").data([0]).join("text").attr("class", "axis-title yt").attr("x", m.l + 4).attr("y", m.t - 8).text(`↑ ${EP_ATTRS[state.sy]}`);
  svg.selectAll("text.lg").data([0]).join("text").attr("class", "axis-title lg").attr("x", w - m.r).attr("y", m.t - 8).attr("text-anchor", "end")
    .text("● success  ○ failure · ━ R → C (same seed)");

  // brush first so points stay hoverable above it
  const key = `${w}x${h}|${state.sx}|${state.sy}|${state.ref}|${state.cand}`;
  const bg = svg.selectAll("g.brush").data([0]).join("g").attr("class", "brush");
  if (key !== brushKey) {
    brushKey = key;
    bindBrush(bg, m, w, h, x, y, pairs);
    if (state.brushed) { bg.call(brush.move, null); update({ brushed: null }); }
  }
  bg.lower();


  const op = (s) => (state.brushed && !state.brushed.has(s) ? 0.15 : 1);
  const focus = (s) => s === state.seed || s === state.hoverSeed;
  svg.selectAll("line.pair").data(pairs, (d) => d.seed).join("line").attr("class", "pair").attr("pointer-events", "none")
    .attr("x1", (p) => x(p.r[state.sx])).attr("y1", (p) => y(p.r[state.sy]))
    .attr("x2", (p) => x(p.c[state.sx])).attr("y2", (p) => y(p.c[state.sy]))
    .attr("stroke", (p) => (focus(p.seed) ? COLOR.sel : p.r.success !== p.c.success ? (p.c.success ? COLOR.gain : COLOR.loss) : "#b9b9c0"))
    .attr("stroke-width", (p) => (focus(p.seed) ? 2.4 : p.r.success !== p.c.success ? 1.6 : 1))
    .attr("stroke-opacity", (p) => op(p.seed) * (p.r.success !== p.c.success || focus(p.seed) ? 0.9 : 0.5));
  const pts = pairs.flatMap((p) => [{ ...p, which: "ref", d: p.r }, { ...p, which: "cand", d: p.c }]);
  svg.selectAll("circle.pt").data(pts, (d) => `${d.seed}${d.which}`).join("circle").attr("class", "pt")
    .attr("cx", (d) => x(d.d[state.sx])).attr("cy", (d) => y(d.d[state.sy])).attr("r", (d) => (focus(d.seed) ? 6 : 4.2))
    .attr("fill", (d) => (d.d.success ? (d.which === "ref" ? COLOR.ref : COLOR.cand) : "#fff"))
    .attr("stroke", (d) => (focus(d.seed) ? COLOR.sel : d.which === "ref" ? COLOR.ref : COLOR.cand)).attr("stroke-width", 1.6)
    .attr("opacity", (d) => op(d.seed)).style("cursor", "pointer")
    .on("mousemove", (ev, d) => {
      showTip(ev, `<b>seed ${d.seed}</b> under ${d.which === "ref" ? "R" : "C"}: ${label(d.which === "ref" ? state.ref : state.cand)}<br>
        ${d.d.success ? "✓ success" : "✗ failure"} · coverage ${Math.round(d.d.coverage_final * 100)}%<br>
        <span class="k">${EP_ATTRS[state.sx]}:</span> ${(+d.d[state.sx]).toFixed(2)}<br><span class="k">${EP_ATTRS[state.sy]}:</span> ${(+d.d[state.sy]).toFixed(2)}<br>
        <span class="k">click = open episode</span>`);
      if (state.hoverSeed !== d.seed) update({ hoverSeed: d.seed });
    })
    .on("mouseleave", () => { hideTip(); update({ hoverSeed: null }); })
    .on("click", (ev, d) => update({ seed: d.seed, t: 0, win: null }));
  svg.selectAll("circle.pt").filter((d) => focus(d.seed)).raise();
}

function bindBrush(bg, m, w, h, x, y, pairs) {
  brush = d3.brush().extent([[m.l, m.t], [w - m.r, h - m.b]]).on("end", (ev) => {
    if (!ev.sourceEvent) return;
    if (!ev.selection) { update({ brushed: null }); return; }
    const [[x0, y0], [x1, y1]] = ev.selection;
    const inside = (d) => x(d[state.sx]) >= x0 && x(d[state.sx]) <= x1 && y(d[state.sy]) >= y0 && y(d[state.sy]) <= y1;
    const set = new Set(pairs.filter((p) => inside(p.r) || inside(p.c)).map((p) => p.seed));
    update({ brushed: set.size ? set : null });
  });
  bg.call(brush);
}

export function resizeScatter() { render(); }
