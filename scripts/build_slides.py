"""Fill slides/slides.template.html with numbers computed from the dataset, render slides.pdf
with headless Chromium and check the 7-page limit.

  LD_LIBRARY_PATH=~/chromelibs/root/usr/lib/x86_64-linux-gnu ~/infovis-venv/bin/python scripts/build_slides.py
"""
import csv, glob, json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "src" / "data"


def rng(rows, k, fmt="{:g}"):
    v = [float(r[k]) for r in rows if r[k] != ""]
    return f"{fmt.format(min(v))}–{fmt.format(max(v))}"


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
        "SEAM_RANGE": rng(rows, "seam_gap_mean", "{:.1f}"), "SEAMMAX_RANGE": rng(rows, "seam_gap_max", "{:.0f}"),
        "STALE_RANGE": rng(rows, "staleness_mean", "{:.1f}"), "IDLE_RANGE": rng(rows, "idle_frac", "{:.2f}"),
        "JERK_RANGE": rng(rows, "jerk_mean", "{:.1f}"), "PATH_RANGE": rng(rows, "path_len", "{:.0f}"),
        "NINF_RANGE": rng(rows, "n_inferences", "{:.0f}"),
        "N_STEPS": f"{n_steps:,}", "N_CHUNKS": f"{n_chunks:,}",
        "CSV_KB": f"{os.path.getsize(D / 'episodes.csv')/1024:.0f}", "DETAIL_MB": f"{size/1e6:.0f}",
        "SR_NAIVE_D4_H8": pct("naive_d4_h8"), "SR_SYNC_D0_H8": pct("sync_d0_h8"),
    }
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
