"""Fill slides/slides.template.html with numbers computed from the dataset, render slides.pdf
with headless Chromium and check the 7-page limit.

  LD_LIBRARY_PATH=~/chromelibs/root/usr/lib/x86_64-linux-gnu ~/infovis-venv/bin/python scripts/build_slides.py
"""
import csv, glob, json, math, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "src" / "data"


def rng(rows, k, fmt="{:g}"):
    v = [float(r[k]) for r in rows if r[k] != ""]
    return f"{fmt.format(min(v))}–{fmt.format(max(v))}"


def strategy_svg(jump, idle):
    """Slide-1 diagram: think/act timing of the three strategies at d = 4, h = 4, plus a schematic
    position trace in which each chunk switch is a vertical step of the measured mean jump size
    (common scale), so big and small jumps are seen as breaks in the motion itself."""
    U, S, T = 12, 0.3, 24  # px per step, px per px of jump, steps shown
    f = lambda q: -8 * math.sin(q / 24 * 2 * math.pi * 0.9)  # schematic path along one axis
    o = ['<svg viewBox="0 0 650 214" width="540" height="178" font-size="12" font-family="Ubuntu Sans, Ubuntu, DejaVu Sans">',
         '<defs><pattern id="hatchS" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="4" stroke="#a9a9b1" stroke-width="1.2"/></pattern></defs>']
    rows = [("sync", "Sync", "#0072B2", ["waits while the policy thinks:", f"idle {idle*100:.0f} % of the time · jumps ≈ <b>{jump['sync']:.0f} px</b>"]),
            ("naive", "Naive async", "#D55E00", ["keeps moving; the new chunk ignores", f"the old one → jumps ≈ <b>{jump['naive']:.0f} px</b>"]),
            ("inpaint", "Inpaint async", "#009E73", ["keeps moving; the new chunk continues", f"the old one → jumps ≈ <b>{jump['inpaint']:.0f} px</b>"])]
    for k, (key, name, col, note) in enumerate(rows):
        y = 4 + k * 66
        o.append(f'<g transform="translate(0,{y})"><rect x="0" y="14" width="9" height="9" fill="{col}"/><text x="14" y="22" font-weight="bold">{name}</text>')
        o.append('<g transform="translate(118,0)">')
        for lab, ly in [("think", 7), ("act", 20), ("position", 42)]:
            o.append(f'<text x="-4" y="{ly}" font-size="10" fill="#777" text-anchor="end">{lab}</text>')
        # chunks: (act start, act end); sync thinks 4 steps standing still before each chunk
        chunks = [(8 * c + 4, 8 * c + 8) for c in range(3)] if key == "sync" else [(4 * c, 4 * c + 4) for c in range(6)]
        for c, (a, b) in enumerate(chunks):
            th = (a - 4, a) if key == "sync" else (a, b)  # async: the next chunk is computed while this one runs
            if th[0] >= 0:
                o.append(f'<rect x="{th[0]*U}" y="2" width="{4*U-1}" height="6" fill="#222" fill-opacity="0.45"/>')
            if key == "sync":
                o.append(f'<rect x="{(a-4)*U}" y="12" width="{4*U-1}" height="11" fill="url(#hatchS)"/>')
            o.append(f'<rect x="{a*U}" y="12" width="{(b-a)*U-1}" height="11" fill="#222" fill-opacity="{0.85 if c % 2 == 0 else 0.5}"/>')
        # position trace: progress only while acting; chunk c is offset so that each switch steps by the mean jump
        yc, prog, prev_end = 40, 0.0, None
        for c, (a, b) in enumerate(chunks):
            off = (1 if c % 2 else -1) * jump[key] * S / 2 if c else 0
            if key == "sync" and prev_end is not None:  # standing still while thinking
                o.append(f'<line x1="{(a-4)*U}" x2="{a*U}" y1="{prev_end:.1f}" y2="{prev_end:.1f}" stroke="#333" stroke-width="1.6"/>')
            elif key == "sync":
                o.append(f'<line x1="0" x2="{a*U}" y1="{yc+f(0):.1f}" y2="{yc+f(0):.1f}" stroke="#333" stroke-width="1.6"/>')
                prev_end = yc + f(0)
            pts = [(a + i / 4, yc + f(prog + i / 4) + off) for i in range(int((b - a) * 4) + 1)]
            if c:
                o.append(f'<line x1="{a*U}" x2="{a*U}" y1="{prev_end:.1f}" y2="{pts[0][1]:.1f}" stroke="#c2185b" stroke-width="2.4" stroke-linecap="round"/>')
            o.append('<polyline points="' + " ".join(f"{t*U:.1f},{v:.1f}" for t, v in pts) + '" fill="none" stroke="#333" stroke-width="1.6"/>')
            prog += b - a
            prev_end = pts[-1][1]
        o.append(f'<text x="298" y="17" font-size="12" fill="#444">{note[0]}</text><text x="298" y="33" font-size="12" fill="#444">{note[1].replace("<b>", "<tspan fill=\"#c2185b\" font-weight=\"bold\">").replace("</b>", "</tspan>")}</text>')
        o.append('</g></g>')
    o.append(f'<line x1="118" y1="202" x2="{118+T*U}" y2="202" stroke="#333"/><text x="{118+T*U}" y="213" font-size="10" text-anchor="end">time (steps of 100 ms)</text></svg>')
    return "".join(o)


RESULT_COL = {"sync": ("#0072B2", "circle"), "naive": ("#D55E00", "square"), "inpaint": ("#009E73", "diamond")}


def results_svg(scheds, h=4):
    """Slide-2 first look: success rate vs. latency per strategy at one h, one small panel per task
    (same y scale). Async has no d = 0 (nothing to overlap), so its line starts dotted at sync d = 0."""
    W, Hh, ml, mt, pw, ph, gap = 400, 160, 30, 27, 170, 100, 26
    o = [f'<svg viewBox="0 0 {W} {Hh}" width="{W}" height="{Hh}" font-size="10.5" font-family="Ubuntu Sans, Ubuntu, DejaVu Sans">']
    for k, (task, title) in enumerate([("pusht", "PushT (the block waits)"), ("reach", "Reach-in-time (7 s deadline)")]):
        x0 = ml + k * (pw + gap)
        X = lambda d: x0 + 10 + d / 4 * (pw - 20)
        Y = lambda v: mt + ph - v * ph
        o.append(f'<text x="{x0 + pw/2}" y="12" text-anchor="middle" font-weight="bold" font-size="11.5">{title}</text>')
        for v in (0, 0.5, 1):
            o.append(f'<line x1="{x0}" x2="{x0+pw}" y1="{Y(v)}" y2="{Y(v)}" stroke="#e3e3e8"/>')
            if k == 0:
                o.append(f'<text x="{x0-4}" y="{Y(v)+3.5}" text-anchor="end" fill="#666">{v*100:.0f}%</text>')
        for d in (0, 2, 4):
            o.append(f'<text x="{X(d)}" y="{mt+ph+13}" text-anchor="middle" fill="#666">{d}</text>')
        S = scheds[task]
        sr = lambda st, d: S[f"{st}_d{d}_h{h}"]["success_rate"]
        for st in ("sync", "naive", "inpaint"):
            col, shape = RESULT_COL[st]
            ds = [0, 2, 4] if st == "sync" else [2, 4]
            pts = [(X(d), Y(sr(st, d))) for d in ds]
            if st != "sync":
                o.append(f'<line x1="{X(0)}" y1="{Y(sr("sync", 0))}" x2="{pts[0][0]}" y2="{pts[0][1]}" stroke="{col}" stroke-width="1.6" stroke-dasharray="1.5 3"/>')
            o.append('<polyline points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + f'" fill="none" stroke="{col}" stroke-width="2"/>')
            for x, y in pts:
                if shape == "circle":
                    o.append(f'<circle cx="{x}" cy="{y}" r="3.6" fill="{col}" stroke="#fff"/>')
                elif shape == "square":
                    o.append(f'<rect x="{x-3.3}" y="{y-3.3}" width="6.6" height="6.6" fill="{col}" stroke="#fff"/>')
                else:
                    o.append(f'<rect x="{x-3.2}" y="{y-3.2}" width="6.4" height="6.4" fill="{col}" stroke="#fff" transform="rotate(45 {x} {y})"/>')
        # direct labels at d = 4 (sync vs. best async)
        for st, dy in (("sync", 13), ("inpaint", -7)):
            v = sr(st, 4)
            if v > 0.9:  # no room above the top gridline
                dy = 14
            o.append(f'<text x="{X(4)-6}" y="{Y(v)+dy}" text-anchor="end" font-weight="bold" fill="#333">{v*100:.0f}%</text>')
    o.append(f'<text x="{ml + pw + gap/2}" y="{Hh-3}" text-anchor="middle" fill="#555">latency d (steps of 100 ms) · h = {h} · {{N}} start states each</text></svg>')
    return "".join(o)


def tokens():
    rows = list(csv.DictReader(open(D / "episodes.csv")))
    rows_r = list(csv.DictReader(open(D / "reach" / "episodes.csv")))
    sched = {s["schedule"]: s for s in json.load(open(D / "schedules.json"))}
    sched_r = {s["schedule"]: s for s in json.load(open(D / "reach" / "schedules.json"))}
    n_steps = n_chunks = 0
    size = 0
    for f in glob.glob(str(D / "runs" / "*.json")) + glob.glob(str(D / "reach" / "runs" / "*.json")):
        size += os.path.getsize(f)
        for e in json.load(open(f))["episodes"]:
            n_steps += e["n"]; n_chunks += len(e["chunks"])
    seeds = sorted({int(r["seed"]) for r in rows})
    assert seeds == sorted({int(r["seed"]) for r in rows_r}), "both tasks use the same seeds"
    allr = rows + rows_r
    pct = lambda k, S=sched: f"{100*S[k]['success_rate']:.0f} %" if k in S else "n/a"
    tok = {
        "N_SEEDS": len(seeds), "N_SCHED": sum(1 for s in sched.values() if not s.get("replicate")),
        "N_EP_TASK": f"{len(rows):,}", "N_EP": f"{len(allr):,}",
        "N_ATTR": len(rows[0]), "SEED_MIN": seeds[0], "SEED_MAX": seeds[-1],
        "COV_RANGE": rng(rows, "coverage_final", "{:.2f}"), "DIST_RANGE": rng(rows_r, "dist_final", "{:.0f}"),
        "STS_RANGE": rng(rows, "steps_to_success", "{:.0f}"), "STS_RANGE_R": rng(rows_r, "steps_to_success", "{:.0f}"),
        "SEAM_RANGE": rng(allr, "jump_mean", "{:.1f}"), "SEAMMAX_RANGE": rng(allr, "jump_max", "{:.0f}"),
        "STALE_RANGE": rng(allr, "staleness_mean", "{:.1f}"),
        "THINK_RANGE": rng(allr, "think_motion_mean", "{:.1f}"), "THINKMAX_RANGE": rng(allr, "think_motion_max", "{:.0f}"), "IDLE_RANGE": rng(allr, "idle_frac", "{:.2f}"),
        "JERK_RANGE": rng(allr, "jerk_mean", "{:.1f}"), "PATH_RANGE": rng(allr, "path_len", "{:.0f}"),
        "NINF_RANGE": rng(allr, "n_inferences", "{:.0f}"),
        "N_STEPS": f"{n_steps:,}", "N_CHUNKS": f"{n_chunks:,}",
        "CSV_KB": f"{os.path.getsize(D / 'episodes.csv')/1024:.0f}", "DETAIL_MB": f"{size/1e6:.0f}",
        "SR_SYNC_D4_H4": pct("sync_d4_h4"), "SR_INPAINT_D4_H4": pct("inpaint_d4_h4"),
        "R_SYNC_D4_H4": pct("sync_d4_h4", sched_r), "R_SYNC_D4_H8": pct("sync_d4_h8", sched_r),
        "R_ASYNC": (lambda m: f"from all {len(seeds)} starts" if m == 1 else f"in ≥ {100*m:.0f} % of starts")(
            min(v["success_rate"] for v in sched_r.values() if v["strategy"] != "sync")),
        "P_SYNC_D4_H8": pct("sync_d4_h8"), "P_NAIVE_D4_H8": pct("naive_d4_h8"), "P_INPAINT_D4_H8": pct("inpaint_d4_h8"),
    }
    # Reach: sync d4 h4 failures vs. start distance (start distance = path the robot must cover)
    start = {}
    for e in json.load(open(D / "reach" / "runs" / "sync_d4_h4.json"))["episodes"]:
        start[e["seed"]] = e["dist"][0]
    fail = [start[int(r["seed"])] for r in rows_r if r["schedule"] == "sync_d4_h4" and r["success"] == "0"]
    ok = [start[int(r["seed"])] for r in rows_r if r["schedule"] == "sync_d4_h4" and r["success"] == "1"]
    tok["R_FAIL_FROM"] = f"{min(fail):.0f}"
    tok["R_OK_UPTO"] = f"{max(ok):.0f}"
    tok["R_N_FAIL"] = len(fail)
    # chance flips: sync d0 h8 vs. its noise re-run (PushT), and scalability numbers for slide 6
    sr = {int(r["seed"]): r["success"] for r in rows if r["schedule"] == "sync_d0_h8"}
    rr = {int(r["seed"]): r["success"] for r in rows if r["schedule"] == "sync_d0_h8_r1"}
    tok["RERUN_FLIPS"] = f"{sum(sr[k] != rr[k] for k in sr)}/{len(sr)}"
    tok["N_POINTS"] = len(sched)
    tok["N_CELLS"] = f"{len(sched) * len(seeds):,}"
    tok["MAX_CHUNKS"] = max(int(r["n_inferences"]) for r in allr)
    tok["RESULTS_SVG"] = results_svg({"pusht": sched, "reach": sched_r}).replace("{N}", str(len(seeds)))
    grid = lambda st: [r for r in rows if r["strategy"] == st and r["latency"] == "4" and r["horizon"] == "4" and r["replicate"] == "0"]
    mean = lambda st, k: sum(float(r[k]) for r in grid(st) if r[k] != "") / len([r for r in grid(st) if r[k] != ""])
    jump = {st: mean(st, "jump_mean") for st in ("sync", "naive", "inpaint")}
    tok["STRATEGY_SVG"] = strategy_svg(jump, mean("sync", "idle_frac"))
    return tok


def main():
    tok = tokens()
    html = (ROOT / "slides" / "slides.template.html").read_text()
    for k, v in tok.items():
        html = html.replace("{{" + k + "}}", str(v))
    assert "{{" not in html, "unfilled token"
    out_html = ROOT / "slides" / "slides.html"
    out_html.write_text(html)

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        pg.goto(out_html.as_uri()); pg.wait_for_load_state("networkidle")
        pg.pdf(path=str(ROOT / "slides.pdf"), width="1280px", height="720px", print_background=True)
        for i in range(7):  # page previews for visual checking
            pg.evaluate(f"window.scrollTo(0, {720*i})")
            pg.screenshot(path=str(ROOT / "slides" / f"preview_{i+1}.png"),
                          clip={"x": 0, "y": 720 * i, "width": 1280, "height": 720}, full_page=True)
        b.close()
    from pypdf import PdfReader
    n = len(PdfReader(str(ROOT / "slides.pdf")).pages)
    print(f"slides.pdf pages = {n} ({'PASS' if n <= 7 else 'FAIL'} <= 7)")
    print(json.dumps(tok, indent=1, ensure_ascii=False))
    sys.exit(0 if n <= 7 else 1)


if __name__ == "__main__":
    main()
