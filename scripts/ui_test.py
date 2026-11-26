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
    # A opens on the pair overview: every baseline → candidate pair, coloured by the paired difference
    ok("A opens on the pair overview", S("aview") == "pairs" and pg.is_visible("#pairs") and not pg.is_visible("#response"))
    npc = pg.locator("#pairs rect.pc").count()
    ok("pair overview shows every pair of schedules (14 × 14)", npc == 14 * 14)
    ok("pair overview frames pairs whose paired difference is unlikely to be chance",
       pg.evaluate("[...document.querySelectorAll('#pairs rect.pc')].filter(r=>r.getAttribute('stroke')==='#1d1d1f').length") > 0)
    cell = pg.evaluate("""(()=>{const c=[...document.querySelectorAll('#pairs rect.pc')].map(r=>d3.select(r).datum())
      .findIndex(q=>!q.diag && q.r.id==='sync_d2_h8' && q.c.id==='naive_d4_h8'); return c;})()""")
    pg.locator("#pairs rect.pc").nth(cell).hover(force=True)
    ok("pair overview tooltip gives rescued / lost start states and the chance level",
       pg.is_visible("#tooltip") and "rescued" in pg.inner_text("#tooltip") and "chance" in pg.inner_text("#tooltip"))
    pg.locator("#pairs rect.pc").nth(cell).click(force=True)
    ok("clicking a cell sets baseline (row) and candidate (column)", S("ref") == "sync_d2_h8" and S("cand") == "naive_d4_h8")
    ok("the selected pair is marked in the overview", pg.locator("#pairs rect.cur").count() == 1)
    ok("A asks one question (success): no question buttons", pg.locator("#responseControls .metricbar button").count() == 0)
    pg.click("#aTabs button[data-v=latency]")
    ok("tab switches A to the latency-response curves", S("aview") == "latency" and pg.is_visible("#response") and not pg.is_visible("#pairs"))
    pg.wait_for_timeout(300)
    n = {sel: pg.locator(sel).count() for sel in ["#response g.pm", "#seedtable rect.c", "#seedtable g.db", "#workspace g.wp", "#timeline .bars rect", "#timeline .think rect"]}
    log.append(f"rendered marks: {n}")
    ok("all four views rendered (A curves, B cells + dumbbells, C boards, D tracks)", all(v > 0 for v in n.values()))

    # A (latency tab): click = candidate, shift-click = baseline, tooltip with Δ vs baseline, legend hover
    idx_of = lambda sid: pg.evaluate(f"[...document.querySelectorAll('#response g.pm')].findIndex(g=>d3.select(g).datum().id==={sid!r})")
    target = pg.evaluate("window.LagLens.DATA.schedules.filter(s=>!s.replicate).map(s=>s.schedule).find(s=>s!==window.LagLens.state.cand && s!==window.LagLens.state.ref && s!=='sync_d2_h8')")
    marks = pg.locator("#response g.pm")
    marks.nth(idx_of(target)).locator("circle.hit").click(force=True)
    ok("A click sets candidate", S("cand") == target)
    marks.nth(idx_of("sync_d2_h8")).locator("circle.hit").click(modifiers=["Shift"], force=True)
    ok("A shift-click sets reference", S("ref") == "sync_d2_h8")
    marks.nth(idx_of(target)).locator("circle.hit").hover(force=True)
    ok("A tooltip gives the paired difference to the baseline", pg.is_visible("#tooltip") and "vs baseline:" in pg.inner_text("#tooltip"))
    pg.hover("#responseControls .legend .li[data-strat=naive]")
    faded = pg.evaluate("[...document.querySelectorAll('#response g.sl')].filter(g=>+g.getAttribute('opacity')<0.5).length")
    ok("A legend hover highlights one strategy", faded > 0)
    pg.mouse.move(5, 5)

    # B: the chosen pair only; cell click opens a start state; dumbbells = largest jump; brush -> A
    ok("B has no controls of its own", pg.locator("#seedControls button, #seedControls select").count() == 0)
    ok("B shows two outcome cells (baseline, candidate) per start state", pg.locator("#seedtable rect.c").count() == 2 * 30)
    ok("B groups rows by baseline→candidate change", pg.locator("#seedtable g.band").count() >= 2)
    ok("B dumbbells show the largest jump at a chunk switch", "largest jump" in pg.inner_text("#seedControls"))
    pg.locator("#seedtable rect.c").nth(20).click()
    ok("B cell click selects seed", S("seed") is not None)
    start = pg.evaluate("""(()=>{
      const ov=document.querySelector('#seedtable .brush .overlay'); const r=ov.getBoundingClientRect();
      for (const fy of [0.3, 0.2, 0.4, 0.5, 0.6]) for (let fx=0.05; fx<0.95; fx+=0.05) { const x=r.x+r.width*fx, y0=r.y+r.height*fy, y1=y0+r.height*0.25;
        if (document.elementFromPoint(x,y0)===ov) return [x,y0,x,y1]; }
      return null;})()""")
    pg.mouse.move(start[0], start[1]); pg.mouse.down(); pg.mouse.move(start[2], start[3], steps=6); pg.mouse.up()
    br = pg.evaluate("window.LagLens.state.brushed ? window.LagLens.state.brushed.size : 0")
    ok("B brush selects seeds", br > 0)
    ok("A recomputes on the selected seeds (cross-filter)", "selected in B" in pg.inner_text("#responseNote"))
    dimmed = pg.evaluate("[...document.querySelectorAll('#seedtable rect.c')].filter(r=>+r.getAttribute('opacity')<0.5).length")
    ok("B rows outside the selection are dimmed", dimmed > 0 or br == 30)
    pg.keyboard.press("Escape"); ok("Esc clears seed selection", S("brushed") is None)
    pg.locator("#seedtable g.band").first.click(force=True)
    ok("B band header click selects its seeds", S("brushed") is not None)
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(500)

    # C: player
    pg.click("#player button:has-text('▶ play')"); pg.wait_for_timeout(700); pg.click("#player button:has-text('pause')")
    ok("C play advances time", S("t") > 0)
    pg.keyboard.press("ArrowRight"); t1 = S("t"); pg.keyboard.press("ArrowLeft")
    ok("C keyboard stepping", S("t") == t1 - 1)
    pg.locator("#workspace .fan circle").first.hover(force=True)
    ok("C fan tooltip", pg.is_visible("#tooltip"))
    ok("C shows what the policy saw (outline at the picture time)", pg.locator("#workspace g.sn path.sb").count() >= 1)
    ok("C status line says how outdated the plan is", "moved" in pg.inner_text("#workspace") or "idle" in pg.inner_text("#workspace"))
    ok("D shows only think / act / jumps (no extra strips)", pg.locator("#timeline g.use, #timeline g.prov, #timeline path.mot").count() == 0)

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

    # header: swap, pickers, reset, resize, URL state
    r0, c0 = S("ref"), S("cand")
    pg.click("#swapBtn"); ok("swap R/C", S("ref") == c0 and S("cand") == r0)
    pg.select_option("#candSel", "sync_d0_h8"); ok("candidate picker", S("cand") == "sync_d0_h8")
    pg.click("#resetBtn"); ok("reset", S("ref") == "sync_d4_h4" and S("cand") == "inpaint_d4_h4" and S("metric") == "success_rate")
    pg.set_viewport_size({"width": 1366, "height": 800}); pg.wait_for_timeout(500)
    ok("survives resize", pg.locator("#seedtable rect.c").count() > 0)
    pg.goto(f"http://127.0.0.1:{port}/index.html?noguide&ref=naive_d4_h4&cand=inpaint_d4_h4&seed=1017&t=160&sel=1000,1001")
    pg.wait_for_function("window.LagLens && document.querySelectorAll('#timeline svg .bars rect').length > 5", timeout=30000)
    ok("URL state restores R, C, seed, t and selection", S("ref") == "naive_d4_h4" and S("seed") == 1017 and S("t") == 160
       and pg.evaluate("window.LagLens.state.brushed.size") == 2)

    # task switch: Catch the ball reloads all four views with its own data (same schedules and seeds)
    pg.click("#taskSeg button:has-text('Catch the ball')")
    pg.wait_for_function("window.LagLens.state.task === 'catch' && document.querySelectorAll('#timeline svg .bars rect').length > 5", timeout=30000)
    pg.wait_for_timeout(600)
    ok("task switch loads Catch the ball", pg.evaluate("window.LagLens.DATA.task") == "catch" and S("ref") == "naive_d4_h4")
    ok("Catch: C draws the ball and no T", pg.locator("#workspace g.block circle").count() == 2 and pg.locator("#workspace g.block path").count() == 0 and pg.locator("#workspace path.gl").count() == 0)
    ok("Catch: D shows the pusher–ball distance", "pusher–ball distance" in pg.inner_text("#timeline"))
    pg.click("#aTabs button[data-v=latency]"); pg.wait_for_timeout(300)
    ok("Catch: A describes the outcome", "8 s deadline" in pg.inner_text("#pA"))
    pg.click("#taskSeg button:has-text('PushT')")
    pg.wait_for_function("window.LagLens.state.task === 'pusht' && document.querySelectorAll('#workspace g.block path').length == 2", timeout=30000)
    ok("task switch back to PushT (T-goal and T-block again, no ball)", pg.evaluate("window.LagLens.DATA.task") == "pusht"
       and pg.locator("#workspace path.gl").count() == 2 and pg.locator("#workspace g.block circle").count() == 0)
    pg.goto(f"http://127.0.0.1:{port}/index.html?noguide&task=catch&ref=sync_d4_h4&cand=inpaint_d4_h4")
    pg.wait_for_function("window.LagLens && document.querySelectorAll('#timeline svg .bars rect').length > 5", timeout=30000)
    ok("URL ?task=catch opens the Catch data", pg.evaluate("window.LagLens.DATA.task") == "catch")
    b.close()
srv.shutdown()

log.append(f"console errors/warnings: {len(errors)}")
log += [f"   {e}" for e in errors]
log.append("RESULT: " + ("PASS" if not fails and not errors else f"FAIL ({len(fails)} checks, {len(errors)} console)"))
text = "\n".join(log)
print(text)
(ROOT / "docs" / "ui_test_output.txt").write_text(text + "\n")
sys.exit(0 if not fails and not errors else 1)
