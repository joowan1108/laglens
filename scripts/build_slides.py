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


def tokens():
    rows = list(csv.DictReader(open(D / "episodes.csv")))
    sched = {s["schedule"]: s for s in json.load(open(D / "schedules.json"))}
    n_steps = n_chunks = 0
    size = 0
    for f in glob.glob(str(D / "runs" / "*.json")):
        size += os.path.getsize(f)
        for e in json.load(open(f))["episodes"]:
            n_steps += e["n"]; n_chunks += len(e["chunks"])
    seeds = sorted({int(r["seed"]) for r in rows})
    pct = lambda k: f"{100*sched[k]['success_rate']:.0f} %" if k in sched else "n/a"
    tok = {
        "N_SEEDS": len(seeds), "N_SCHED": sum(1 for s in sched.values() if not s.get("replicate")), "N_EP": f"{len(rows):,}",
        "N_ATTR": len(rows[0]), "SEED_MIN": seeds[0], "SEED_MAX": seeds[-1],
        "COV_RANGE": rng(rows, "coverage_final", "{:.2f}"), "STS_RANGE": rng(rows, "steps_to_success", "{:.0f}"),
        "SEAM_RANGE": rng(rows, "jump_mean", "{:.1f}"), "SEAMMAX_RANGE": rng(rows, "jump_max", "{:.0f}"),
        "STALE_RANGE": rng(rows, "staleness_mean", "{:.1f}"),
        "THINK_RANGE": rng(rows, "think_motion_mean", "{:.1f}"), "THINKMAX_RANGE": rng(rows, "think_motion_max", "{:.0f}"), "IDLE_RANGE": rng(rows, "idle_frac", "{:.2f}"),
        "JERK_RANGE": rng(rows, "jerk_mean", "{:.1f}"), "PATH_RANGE": rng(rows, "path_len", "{:.0f}"),
        "NINF_RANGE": rng(rows, "n_inferences", "{:.0f}"),
        "N_STEPS": f"{n_steps:,}", "N_CHUNKS": f"{n_chunks:,}",
        "CSV_KB": f"{os.path.getsize(D / 'episodes.csv')/1024:.0f}", "DETAIL_MB": f"{size/1e6:.0f}",
        "SR_NAIVE_D4_H8": pct("naive_d4_h8"), "SR_SYNC_D0_H8": pct("sync_d0_h8"),
    }
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
