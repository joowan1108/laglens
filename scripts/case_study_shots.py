"""Reproduce the case-study states of the report in LagLens and save screenshots
(report/fig_*.png) plus the full-interface image (image.png). Every state is a URL of the
interface, so each figure can be re-opened live during the demo.

  LD_LIBRARY_PATH=~/chromelibs/root/usr/lib/x86_64-linux-gnu ~/infovis-venv/bin/python scripts/case_study_shots.py
"""
import functools, http.server, json, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "report"
OUT.mkdir(exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT / "src")))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

SHOTS = [
    # (file, query, [panel selectors] or None for the whole page, optional JS to run before capture)
    ("image.png", "ref=inpaint_d4_h4&cand=naive_d4_h4&seed=1035&t=116&win=100,140&sort=flip", None, None),
    ("fig_overview.png", "ref=inpaint_d4_h4&cand=naive_d4_h4&seed=1035&t=116&win=100,140&sort=flip", None, None),
    ("fig_f1_matrix_delta.png", "ref=sync_d0_h8&cand=inpaint_d4_h4&metric=success_rate&mode=delta", ["#pA"], None),
    ("fig_f1_matrix_seam.png", "ref=sync_d0_h8&cand=inpaint_d4_h4&metric=seam_gap_mean&mode=abs", ["#pA"], None),
    ("fig_f2_noise.png", "ref=sync_d0_h8&cand=sync_d0_h8_r1&sort=flip", ["#pB"], None),
    ("fig_f3_replay.png", "ref=inpaint_d4_h4&cand=naive_d4_h4&seed=1035&t=116&win=100,140", ["#pC", "#pD"], None),
    ("fig_f4_scatter.png", "ref=naive_d4_h4&cand=inpaint_d4_h4&sx=seam_gap_max&sy=coverage_final&seed=1035", ["#pE"], None),
]

log = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 940}, device_scale_factor=2)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    for name, q, sels, js in SHOTS:
        pg.goto(f"http://127.0.0.1:{port}/index.html?noguide&{q}")
        pg.wait_for_function("window.LagLens && document.querySelectorAll('#timeline svg .bars rect').length > 5", timeout=30000)
        pg.wait_for_timeout(900)
        if js:
            pg.evaluate(js); pg.wait_for_timeout(400)
        target = ROOT / name if name == "image.png" else OUT / name
        if sels is None:
            pg.screenshot(path=str(target))
        elif len(sels) == 1:
            pg.locator(sels[0]).screenshot(path=str(target))
        else:  # union of several panels
            boxes = [pg.locator(s).bounding_box() for s in sels]
            x0 = min(bx["x"] for bx in boxes); y0 = min(bx["y"] for bx in boxes)
            x1 = max(bx["x"] + bx["width"] for bx in boxes); y1 = max(bx["y"] + bx["height"] for bx in boxes)
            pg.screenshot(path=str(target), clip={"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0})
        log[name] = q
        print("saved", target.relative_to(ROOT))
    b.close()
srv.shutdown()
(OUT / "shots.json").write_text(json.dumps(log, indent=1))
print("page errors:", errs)
