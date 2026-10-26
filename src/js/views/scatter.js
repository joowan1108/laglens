// View E: paired seed shifts — a dumbbell plot with one row per initial state (seed). The R value
// (black) and the C value (orange) of the chosen attribute are joined by a segment, and rows are
// grouped by how the outcome changed from R to C, so "did the failing seeds get larger seams?" is
// answered by the direction of the segments inside one group.
import { state, update, bus } from "../state.js";
import { DATA, label } from "../data.js";
import { COLOR, EP_ATTRS, showTip, hideTip, size } from "../util.js";

let root, svg, brush, brushKey = null;

const GROUPS = [
  { key: "loss", name: "C fails, R succeeded", short: "loss", col: COLOR.loss },
  { key: "gain", name: "C succeeds, R failed", short: "gain", col: COLOR.gain },
  { key: "bothOk", name: "both succeed", short: "both ✓", col: "#c9c9cf" },
  { key: "bothFail", name: "both fail", short: "both ✗", col: "#8d8d96" },
];
// long-tailed attributes are shown on a symmetric-log axis so that the bulk is not squeezed
const SYMLOG = new Set(["seam_gap_mean", "seam_gap_max", "jerk_mean", "path_len", "n_inferences"]);

export function initScatter() {
  const ctr = d3.select("#scatterControls");
  ctr.append("span").text("compare:");
  const sx = ctr.append("select").on("change", (ev) => update({ sx: ev.target.value }));
  sx.selectAll("option").data(Object.entries(EP_ATTRS)).join("option").attr("value", (d) => d[0]).text((d) => d[1]);
  sx.property("value", state.sx);
  ctr.append("span").attr("class", "muted").html('<b style="color:#222">●</b> R → <b style="color:#E69F00">●</b> C, one row per seed');
  root = d3.select("#scatter");
  svg = root.append("svg");
  render();
  bus.on("change.scatter", (keys) => {
    if (["ref", "cand", "sx", "seed", "hoverSeed", "brushed"].some((k) => keys.has(k))) {
      sx.property("value", state.sx);
      render();
    }
  });
}

function group(p) {
  if (p.r.success && p.c.success) return "bothOk";
  if (!p.r.success && !p.c.success) return "bothFail";
  return p.c.success ? "gain" : "loss";
}

function fmt(v) {
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}

function render() {
  const { w, h } = size(root.node());
  svg.attr("width", w).attr("height", h);
  const k = state.sx;
  const R = DATA.ep.get(state.ref), C = DATA.ep.get(state.cand);
  const pairs = DATA.seeds.map((s) => ({ seed: s, r: R.get(s), c: C.get(s) }));
  pairs.forEach((p) => { p.g = group(p); p.delta = p.c[k] - p.r[k]; });

  // layout: group header + rows, groups in fixed order, rows sorted by the size of the shift
  const groups = GROUPS.map((g) => ({ ...g, rows: pairs.filter((p) => p.g === g.key).sort((a, b) => b.delta - a.delta) }))
    .filter((g) => g.rows.length);
  const m = { l: 78, r: 14, t: 4, b: 30 }, headH = 15;
  const rowH = Math.max(3, Math.min(11, (h - m.t - m.b - headH * groups.length) / pairs.length));
  let yy = m.t;
  for (const g of groups) {
    g.y = yy; yy += headH;
    for (const p of g.rows) { p.y = yy + rowH / 2; yy += rowH; }
    g.y1 = yy;
  }

  const vals = pairs.flatMap((p) => [p.r[k], p.c[k]]);
  const [lo, hi] = d3.extent(vals);
  const x = SYMLOG.has(k)
    ? d3.scaleSymlog().constant(1).domain([Math.max(0, lo * 0.8), hi * 1.05]).range([m.l, w - m.r])
    : d3.scaleLinear().domain([Math.min(0, lo), hi]).nice().range([m.l, w - m.r]);
  const [d0, d1] = x.domain();
  const ticks = SYMLOG.has(k) ? [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].filter((t) => t >= d0 && t <= d1) : x.ticks(6);
  const axisBottom = yy + 4;

  svg.selectAll("g.grid").data([0]).join("g").attr("class", "gridline grid")
    .attr("transform", `translate(0,${axisBottom})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickSize(-(axisBottom - m.t)).tickFormat(""))
    .call((g) => g.select(".domain").remove());
  svg.selectAll("g.xax").data([0]).join("g").attr("class", "axis xax").attr("transform", `translate(0,${axisBottom})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("~s")));
  svg.selectAll("text.xt").data([0]).join("text").attr("class", "axis-title xt").attr("x", w - m.r).attr("y", axisBottom + 26)
    .attr("text-anchor", "end").text(`${EP_ATTRS[k]}${SYMLOG.has(k) ? " (log scale)" : ""} →`);

  // vertical brush over the rows (drawn below the marks so they stay hoverable)
  const key = `${w}x${h}|${k}|${state.ref}|${state.cand}`;
  const bg = svg.selectAll("g.brush").data([0]).join("g").attr("class", "brush");
  if (key !== brushKey) {
    brushKey = key;
    brush = d3.brushY().extent([[m.l, m.t], [w - m.r, axisBottom]]).on("end", (ev) => {
      if (!ev.sourceEvent) return;
      if (!ev.selection) { update({ brushed: null }); return; }
      const [y0, y1] = ev.selection;
      const set = new Set(pairs.filter((p) => p.y >= y0 && p.y <= y1).map((p) => p.seed));
      update({ brushed: set.size ? set : null });
    });
    bg.call(brush);
    if (state.brushed) { bg.call(brush.move, null); update({ brushed: null }); }
  }
  bg.lower();
  svg.select("g.grid").lower();

  // group headers: colour key, name, count and median shift; click = select the whole group
  svg.selectAll("g.gh").data(groups, (g) => g.key).join((en) => {
    const q = en.append("g").attr("class", "gh").style("cursor", "pointer");
    q.append("rect").attr("class", "band"); q.append("rect").attr("class", "sw");
    q.append("path").attr("class", "mr"); q.append("path").attr("class", "mc");
    q.append("text").attr("class", "gn"); q.append("text").attr("class", "gs axis-title")
      .attr("stroke", "#f4f4f6").attr("stroke-width", 3).attr("paint-order", "stroke");
    return q;
  })
    .attr("transform", (g) => `translate(0,${g.y})`)
    .call((q) => q.select(".band").attr("x", 4).attr("y", 2).attr("width", w - 8).attr("height", headH - 2).attr("rx", 3).attr("fill", "#f4f4f6"))
    .call((q) => q.select(".sw").attr("x", 8).attr("y", 4).attr("width", 9).attr("height", 9).attr("rx", 2).attr("fill", (g) => g.col))
    .call((q) => q.select(".gn").attr("x", 21).attr("y", 12).attr("font-size", 10.5).attr("font-weight", 700)
      .text((g) => `${g.name} (${g.rows.length})`))
    .call((q) => q.select(".gs").attr("x", w - m.r).attr("y", 12).attr("text-anchor", "end")
      .text((g) => {
        const md = d3.median(g.rows, (p) => p.delta);
        const up = g.rows.filter((p) => p.delta > 0).length;
        return `median Δ ${md >= 0 ? "+" : ""}${fmt(md)} · ${up}/${g.rows.length} increase`;
      }))
    // group medians of R and C as small triangles on the header band, for comparing groups
    .call((q) => q.select(".mr").attr("d", (g) => { const xm = x(d3.median(g.rows, (p) => p.r[k])); return `M${xm - 4},${headH - 1}L${xm + 4},${headH - 1}L${xm},${headH - 7}Z`; }).attr("fill", COLOR.ref))
    .call((q) => q.select(".mc").attr("d", (g) => { const xm = x(d3.median(g.rows, (p) => p.c[k])); return `M${xm - 4},${headH - 1}L${xm + 4},${headH - 1}L${xm},${headH - 7}Z`; }).attr("fill", COLOR.cand))
    .on("click", (ev, g) => update({ brushed: new Set(g.rows.map((p) => p.seed)) }))
    .on("mousemove", (ev, g) => showTip(ev, `<b>${g.name}</b>: ${g.rows.length} seeds<br><span class="k">median under R:</span> ${fmt(d3.median(g.rows, (p) => p.r[k]))} · <span class="k">under C:</span> ${fmt(d3.median(g.rows, (p) => p.c[k]))} (▲ on the header)<br><span class="k">click = select these seeds (filters B)</span>`))
    .on("mouseleave", hideTip);

  // rows
  const op = (s) => (state.brushed && !state.brushed.has(s) ? 0.18 : 1);
  const focus = (s) => s === state.seed || s === state.hoverSeed;
  const rows = svg.selectAll("g.row").data(pairs, (p) => p.seed).join((en) => {
    const q = en.append("g").attr("class", "row").style("cursor", "pointer");
    q.append("rect").attr("class", "hit");
    q.append("rect").attr("class", "flag");
    q.append("text").attr("class", "sl axis-title");
    q.append("line").attr("class", "bar");
    q.append("circle").attr("class", "pr");
    q.append("circle").attr("class", "pc");
    return q;
  });
  rows.attr("opacity", (p) => op(p.seed))
    .transition().duration(300).attr("transform", (p) => `translate(0,${p.y})`);
  const r = Math.max(1.8, Math.min(3.8, rowH * 0.36));
  rows.select(".hit").attr("x", 20).attr("y", -rowH / 2).attr("width", m.l - 22).attr("height", rowH).attr("fill", (p) => (focus(p.seed) ? "#fbe4ee" : "transparent"));
  rows.select(".flag").attr("x", 8).attr("y", -rowH / 2 + 0.5).attr("width", 9).attr("height", Math.max(1, rowH - 1)).attr("fill", (p) => GROUPS.find((g) => g.key === p.g).col);
  rows.select(".sl").attr("x", m.l - 6).attr("dy", "0.32em").attr("text-anchor", "end").attr("font-size", Math.min(9.5, rowH + 1))
    .attr("font-weight", (p) => (p.seed === state.seed ? 800 : 400)).attr("fill", (p) => (p.seed === state.seed ? COLOR.sel : null))
    .text((p) => (rowH >= 7 || focus(p.seed) ? p.seed : ""));
  rows.select(".bar").attr("x1", (p) => x(p.r[k])).attr("x2", (p) => x(p.c[k]))
    .attr("stroke", (p) => (focus(p.seed) ? COLOR.sel : "#a8a8b0")).attr("stroke-width", (p) => (focus(p.seed) ? 2.4 : Math.max(1, r * 0.7)));
  rows.select(".pr").attr("cx", (p) => x(p.r[k])).attr("r", r).attr("fill", COLOR.ref);
  rows.select(".pc").attr("cx", (p) => x(p.c[k])).attr("r", r).attr("fill", COLOR.cand).attr("stroke", "#fff").attr("stroke-width", 0.5);
  rows.on("mousemove", (ev, p) => {
    showTip(ev, `<b>seed ${p.seed}</b> · ${GROUPS.find((g) => g.key === p.g).name}<br>
      <span class="k">R</span> ${label(state.ref)}: ${fmt(p.r[k])} ${p.r.success ? "✓" : "✗"} (coverage ${Math.round(p.r.coverage_final * 100)}%)<br>
      <span class="k">C</span> ${label(state.cand)}: ${fmt(p.c[k])} ${p.c.success ? "✓" : "✗"} (coverage ${Math.round(p.c.coverage_final * 100)}%)<br>
      <span class="k">${EP_ATTRS[k]} change:</span> <b>${p.delta >= 0 ? "+" : ""}${fmt(p.delta)}</b><br><span class="k">click = open episode</span>`);
    if (state.hoverSeed !== p.seed) update({ hoverSeed: p.seed });
  })
    .on("mouseleave", () => { hideTip(); update({ hoverSeed: null }); })
    .on("click", (ev, p) => update({ seed: p.seed, t: 0, win: null }));
}

export function resizeScatter() { render(); }
