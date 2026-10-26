"""Headless interaction test of LagLens. Serves src/ locally, loads the page in Chromium,
exercises every view's interactions, asserts the shared state reacts, and fails on any console
error. Output is also written to docs/ui_test_output.txt.

  LD_LIBRARY_PATH=~/chromelibs/root/usr/lib/x86_64-linux-gnu ~/infovis-venv/bin/python scripts/ui_test.py
"""
import functools, http.server, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT / "src")))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

log, errors, fails = [], [], []
ok = lambda name, cond: (log.append(f"{'PASS' if cond else 'FAIL'}  {name}"), None if cond else fails.append(name))

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 940})
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.goto(f"http://127.0.0.1:{port}/index.html")
    pg.wait_for_function("window.LagLens && document.querySelectorAll('#timeline svg .bars rect').length > 5", timeout=30000)
    S = lambda k: pg.evaluate(f"window.LagLens.state[{k!r}]")

    ok("guide shown on first visit", pg.is_visible("#guide"))
    pg.click("#guideClose")
    ok("guide closes", not pg.is_visible("#guide"))
    n = {sel: pg.locator(sel).count() for sel in ["#matrix g.cell", "#flip rect.c", "#workspace g.wp", "#timeline .bars rect", "#scatter circle.pc"]}
    log.append(f"rendered marks: {n}")
    ok("all five views rendered", all(v > 0 for v in n.values()))

    # A: click = candidate, shift-click = reference, metric + delta mode
    cells = pg.locator("#matrix g.cell")
    target = pg.evaluate("window.LagLens.DATA.schedules.filter(s=>!s.replicate).map(s=>s.schedule).find(s=>s!==window.LagLens.state.cand && s!==window.LagLens.state.ref && s!=='sync_d1_h8')")
    idx = pg.evaluate(f"[...document.querySelectorAll('#matrix g.cell')].findIndex(g=>d3.select(g).datum().id==={target!r})")
    cells.nth(idx).click()
    ok("A click sets candidate", S("cand") == target)
    sync = pg.evaluate("[...document.querySelectorAll('#matrix g.cell')].findIndex(g=>d3.select(g).datum().id==='sync_d1_h8')")
    cells.nth(sync).click(modifiers=["Shift"])
    ok("A shift-click sets reference", S("ref") == "sync_d1_h8")
    pg.select_option("#matrixControls select", "seam_gap_mean")
    ok("A metric change", S("metric") == "seam_gap_mean")
    pg.click("#matrixControls button:has-text('Δ vs R')")
    ok("A delta mode", S("mode") == "delta")
    cells.nth(idx).hover(); ok("A tooltip", pg.is_visible("#tooltip"))

    # B: sorting + row click opens an episode
    for mode in ["flip", "seed", "robust"]:
        pg.click(f"#flipControls button >> nth={['robust','flip','seed'].index(mode)}")
        ok(f"B sort {mode}", S("sort") == mode)
    pg.locator("#flip rect.c").nth(300).click()
    ok("B cell click selects seed", S("seed") is not None)
    pg.wait_for_timeout(500)

    # C: player
    pg.click("#player button:has-text('▶ play')"); pg.wait_for_timeout(700); pg.click("#player button:has-text('pause')")
    ok("C play advances time", S("t") > 0)
    pg.keyboard.press("ArrowRight"); t1 = S("t"); pg.keyboard.press("ArrowLeft")
    ok("C keyboard stepping", S("t") == t1 - 1)
    pg.locator("#workspace .fan circle").first.hover()
    ok("C fan tooltip", pg.is_visible("#tooltip"))

    # D: hover a chunk -> hoverChunk, brush window
    pg.locator("#timeline .bars rect").nth(3).hover()
    ok("D chunk hover links to C", S("hoverChunk") is not None)
    box = pg.locator("#timeline svg").bounding_box()
    y = box["y"] + box["height"] * 0.7
    pg.mouse.move(box["x"] + box["width"] * 0.35, y); pg.mouse.down()
    pg.mouse.move(box["x"] + box["width"] * 0.55, y, steps=6); pg.mouse.up()
    ok("D brush sets window", S("win") is not None)
    ok("C draws brushed window path", pg.evaluate("document.querySelector('#workspace .pathWin').getAttribute('d')") is not None)
    pg.keyboard.press("Escape"); ok("Esc clears window", S("win") is None)

    # E: axis change + 2-D brush filters B
    pg.select_option("#scatterControls select >> nth=0", "jerk_mean")
    ok("E axis change", S("sx") == "jerk_mean")
    box = pg.locator("#scatter svg").bounding_box()
    # brush a small region around an existing point, starting the drag on empty background
    start = pg.evaluate("""(()=>{
      const ov=document.querySelector('#scatter .brush .overlay');
      for (const c of document.querySelectorAll('#scatter circle.pc')) {
        const b=c.getBoundingClientRect(), x=b.x+b.width/2, y=b.y+b.height/2;
        for (const [dx,dy] of [[-14,-14],[14,14],[-14,14],[14,-14],[-20,0],[20,0],[0,20],[0,-20]])
          if (document.elementFromPoint(x+dx,y+dy)===ov) return [x+dx,y+dy,x-dx,y-dy];
      } return null;})()""")
    pg.mouse.move(start[0], start[1]); pg.mouse.down()
    pg.mouse.move(start[2], start[3], steps=6); pg.mouse.up()
    br = pg.evaluate("window.LagLens.state.brushed ? window.LagLens.state.brushed.size : 0")
    ok("E brush selects seeds", br > 0)
    dimmed = pg.evaluate("[...document.querySelectorAll('#flip rect.c')].filter(r=>+r.getAttribute('opacity')<0.5).length")
    ok("B rows dimmed by E brush (link)", dimmed > 0 or br == 50)

    # header: swap, pickers, reset, resize
    r0, c0 = S("ref"), S("cand")
    pg.click("#swapBtn"); ok("swap R/C", S("ref") == c0 and S("cand") == r0)
    pg.select_option("#candSel", "sync_d0_h8"); ok("candidate picker", S("cand") == "sync_d0_h8")
    pg.click("#resetBtn"); ok("reset", S("ref") == "sync_d0_h8" and S("metric") == "success_rate")
    pg.set_viewport_size({"width": 1366, "height": 800}); pg.wait_for_timeout(500)
    ok("survives resize", pg.locator("#flip rect.c").count() > 0)
    b.close()
srv.shutdown()

log.append(f"console errors/warnings: {len(errors)}")
log += [f"   {e}" for e in errors]
log.append("RESULT: " + ("PASS" if not fails and not errors else f"FAIL ({len(fails)} checks, {len(errors)} console)"))
text = "\n".join(log)
print(text)
(ROOT / "docs" / "ui_test_output.txt").write_text(text + "\n")
sys.exit(0 if not fails and not errors else 1)
