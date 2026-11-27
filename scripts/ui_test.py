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
    # A pair overview and B latency response are both on screen, side by side
    ok("A pair overview and B latency response are shown together", pg.is_visible("#pairs") and pg.is_visible("#response")
       and pg.locator("#pA").bounding_box()["x"] < pg.locator("#pB").bounding_box()["x"])
    npc = pg.locator("#pairs rect.pc").count()
    ok("pair overview shows every pair of schedules (14 × 14)", npc == 14 * 14)
    ok("pair overview frames pairs whose paired difference is unlikely to be chance",
       pg.evaluate("[...document.querySelectorAll('#pairs rect.pc')].filter(r=>r.getAttribute('stroke')==='#1d1d1f').length") > 0)
    cell = pg.evaluate("""(()=>{const c=[...document.querySelectorAll('#pairs rect.pc')].map(r=>d3.select(r).datum())
      .findIndex(q=>!q.diag && q.r.id==='sync_d4_h8' && q.c.id==='naive_d4_h8'); return c;})()""")
    pg.locator("#pairs rect.pc").nth(cell).hover(force=True)
    ok("pair overview tooltip gives rescued / lost start states and the chance level",
       pg.is_visible("#tooltip") and "rescued" in pg.inner_text("#tooltip") and "chance" in pg.inner_text("#tooltip"))
    pg.locator("#pairs rect.pc").nth(cell).click(force=True)
    ok("clicking a cell sets baseline (row) and candidate (column)", S("ref") == "sync_d4_h8" and S("cand") == "naive_d4_h8")
    ok("the selected pair is marked in the overview", pg.locator("#pairs rect.cur").count() == 1)
    # "my latency": only the schedules at d = 4 (+ sync d0 reference), values printed in the cells
    pg.click("#pairControls .dseg button:has-text('d = 4')"); pg.wait_for_timeout(300)
    ok("A latency filter keeps the d = 4 schedules plus the sync d0 reference (8 × 8)", S("dfocus") == 4 and pg.locator("#pairs rect.pc").count() == 64)
    ok("A prints the difference in the cells when there is room", pg.locator("#pairs text.pv").count() == 44)
    ok("B shades my latency", pg.locator("#response rect.dband").count() == 1)
    pg.click("#pairControls .dseg button:has-text('all latencies')"); pg.wait_for_timeout(300)
    ok("A back to all latencies", S("dfocus") is None and pg.locator("#pairs rect.pc").count() == 196)
    nfr = pg.evaluate("[...document.querySelectorAll('#pairs rect.pc')].filter(r=>r.getAttribute('stroke')==='#1d1d1f').length")
    log.append(f"framed ordered cells: {nfr}")
    ok("A frames are corrected over the 49 comparable pairs (FDR): 20 framed ordered cells in PushT (10 pairs)", nfr == 20)
    nnc = pg.evaluate("[...document.querySelectorAll('#pairs rect.pc')].filter(r=>d3.select(r).datum().nc).length")
    ok("A hatches the 42 pairs that are not compared (84 ordered cells), not clickable", nnc == 84)
    ok("a pair with d = 0 is compared only at the same h", pg.evaluate("""(()=>{const c=[...document.querySelectorAll('#pairs rect.pc')].map(r=>d3.select(r).datum());
      const f=(a,b)=>c.find(q=>!q.diag&&q.r.id===a&&q.c.id===b); return !!f('sync_d0_h4','inpaint_d2_h8').nc && !f('sync_d0_h8','inpaint_d2_h8').nc;})()"""))
    pg.evaluate("window.LagLens.update({ref:'sync_d2_h4', cand:'inpaint_d2_h4'})"); pg.evaluate("window.LagLens.update({cand:'inpaint_d4_h8'})"); pg.wait_for_timeout(200)
    ok("a candidate that is not comparable with the baseline is refused, nothing is moved, and A says why",
       S("ref") == "sync_d2_h4" and S("cand") == "inpaint_d2_h4" and "not compared with the current baseline" in pg.inner_text("#pairNote"))
    ok("the header has no pair controls: no menus, no name chips, no swap (the pair is chosen in A)", pg.locator("#topbar select, #candName, #refName, #swapBtn").count() == 0)
    pg.evaluate("window.LagLens.update({seed:1003})"); pg.wait_for_timeout(200)
    ok("the refusal notice is cleared by the next deliberate change (here: another start state)", "not compared with the current" not in pg.inner_text("#pairNote"))
    pg.evaluate("window.LagLens.update({cand:'inpaint_d4_h8'})"); pg.wait_for_timeout(200)
    pg.evaluate("window.LagLens.update({cand:'naive_d2_h8'})"); pg.wait_for_timeout(200)
    ok("a comparable choice clears the notice", S("cand") == "naive_d2_h8" and "not compared with the current" not in pg.inner_text("#pairNote"))
    pg.evaluate("window.LagLens.update({ref:'sync_d2_h4', cand:'inpaint_d2_h4'})"); pg.wait_for_timeout(300)
    ok("B draws the schedules that are not compared with the baseline as dashed outlines, and fills only tested differences",
       pg.evaluate("[...document.querySelectorAll('#response g.pm path.sym')].filter(p=>p.getAttribute('stroke-dasharray')).length") > 0)
    pg.evaluate("window.LagLens.update({ref:'sync_d4_h8', cand:'naive_d4_h8'})"); pg.wait_for_timeout(200)
    pg.wait_for_timeout(300)
    # B follows A: 0 = the chosen baseline, every schedule re-compared against it
    zero = lambda: pg.evaluate("[...document.querySelectorAll('#response g.pm')].map(g=>d3.select(g).datum()).find(p=>p.id===window.LagLens.state.ref).v")
    ok("B puts the baseline chosen in A on the zero line", zero() == 0)
    v_before = pg.evaluate("d3.select([...document.querySelectorAll('#response g.pm')].find(g=>d3.select(g).datum().id==='inpaint_d4_h4')).datum().v")
    pg.locator("#pairs text.rowL").nth(3).click(force=True)
    v_after = pg.evaluate("d3.select([...document.querySelectorAll('#response g.pm')].find(g=>d3.select(g).datum().id==='inpaint_d4_h4')).datum().v")
    ok("a row label in A sets only the baseline, and B's values change with it", S("cand") == "naive_d4_h8" and S("ref") != "sync_d4_h8" and v_before != v_after)
    pg.locator("#pairs rect.pc").nth(cell).click(force=True)
    ok("B marks the candidate's distance to the baseline", pg.locator("#response g.rg").count() >= 1)
    n = {sel: pg.locator(sel).count() for sel in ["#response g.pm", "#seedtable rect.c", "#seedtable g.db", "#workspace g.wp", "#pairs rect.pc", "#timeline .bars rect", "#timeline .think rect"]}
    log.append(f"rendered marks: {n}")
    ok("all five views rendered (A matrix, B curves, C cells + dumbbells, D board, E tracks)", all(v > 0 for v in n.values()))

    # B: click = candidate, shift-click = baseline, tooltip with Δ vs baseline, legend hover
    idx_of = lambda sid: pg.evaluate(f"[...document.querySelectorAll('#response g.pm')].findIndex(g=>d3.select(g).datum().id==={sid!r})")
    target = pg.evaluate("window.LagLens.DATA.schedules.filter(s=>!s.replicate).map(s=>s.schedule).find(s=>s!==window.LagLens.state.cand && s!==window.LagLens.state.ref && s!=='sync_d4_h4' && window.LagLens.DATA.schedById.get(s).latency===4)")
    marks = pg.locator("#response g.pm")
    marks.nth(idx_of(target)).locator("circle.hit").click(force=True)
    ok("B click sets candidate", S("cand") == target)
    marks.nth(idx_of("sync_d4_h4")).locator("circle.hit").click(modifiers=["Shift"], force=True)
    ok("B shift-click sets reference", S("ref") == "sync_d4_h4")
    ok("B shows the re-runs of every schedule as small hollow marks", pg.locator("#response g.pm g.re circle").count() == 2 * 14)
    marks.nth(idx_of(target)).locator("circle.hit").hover(force=True)
    ok("B tooltip gives the paired difference to the baseline", pg.is_visible("#tooltip") and "vs baseline:" in pg.inner_text("#tooltip"))
    pg.hover("#responseControls .legend .li[data-strat=naive]")
    faded = pg.evaluate("[...document.querySelectorAll('#response g.sl')].filter(g=>+g.getAttribute('opacity')<0.5).length")
    ok("B legend hover highlights one strategy", faded > 0)
    pg.mouse.move(5, 5)

    # C: the chosen pair only; cell click opens a start state; dumbbells = largest jump; brush -> A, B
    ok("C shows the cost the pair pays when the question is success (sync with latency: idle)", "idle" in pg.inner_text("#seedtable") and "idle" in pg.inner_text("#seedControls"))
    v0 = pg.evaluate("d3.select(document.querySelector('#pairs rect.cur')).datum().v")
    pg.click("#metricSeg button:has-text('Jump')"); pg.wait_for_timeout(300)
    ok("the question in the header (Jump) changes A, B and C together", S("metric") == "jump_mean" and "mean per switch" in pg.inner_text("#seedtable")
       and "jump" in pg.inner_text("#responseNote") and "pays" in pg.inner_text("#pairNote")
       and pg.evaluate("d3.select(document.querySelector('#pairs rect.cur')).datum().v") != v0)
    ok("costs are described, not tested: no frames in A", pg.evaluate("[...document.querySelectorAll('#pairs rect.pc')].filter(r=>r.getAttribute('stroke')==='#1d1d1f').length") == 0)
    pg.click("#metricSeg button:has-text('Success')"); pg.wait_for_timeout(300)
    ok("back to success: frames return", pg.evaluate("[...document.querySelectorAll('#pairs rect.pc')].filter(r=>r.getAttribute('stroke')==='#1d1d1f').length") == 20)
    ok("C re-run cells: two narrow cells per schedule and start state", pg.locator("#seedtable rect.cr").count() == 2 * 2 * 30)
    ok("C shows two outcome cells (baseline, candidate) per start state", pg.locator("#seedtable rect.c").count() == 2 * 30)
    ok("C groups rows by baseline→candidate change", pg.locator("#seedtable g.band").count() >= 2)
    nz = pg.locator("#seedtable text.nz").count(); log.append(f"≈ marks: {nz}")
    ok("C marks the start states whose outcome is not the same in all runs (≈) and counts the flips that come back", nz > 0 and "come back in all 3 runs" in pg.inner_text("#seedNote"))

    pg.locator("#seedtable rect.c").nth(20).click()
    ok("C cell click selects seed", S("seed") is not None)
    pg.wait_for_timeout(400)
    ok("D opens the new start state where the two runs first part, not at t = 0", S("t") > 0)
    start = pg.evaluate("""(()=>{
      const ov=document.querySelector('#seedtable .brush .overlay'); const r=ov.getBoundingClientRect();
      for (const fy of [0.3, 0.2, 0.4, 0.5, 0.6]) for (let fx=0.05; fx<0.95; fx+=0.05) { const x=r.x+r.width*fx, y0=r.y+r.height*fy, y1=y0+r.height*0.25;
        if (document.elementFromPoint(x,y0)===ov) return [x,y0,x,y1]; }
      return null;})()""")
    pg.mouse.move(start[0], start[1]); pg.mouse.down(); pg.mouse.move(start[2], start[3], steps=6); pg.mouse.up()
    br = pg.evaluate("window.LagLens.state.brushed ? window.LagLens.state.brushed.size : 0")
    ok("C brush selects seeds", br > 0)
    ok("A and B recompute on the selected seeds (cross-filter)", "selected in C" in pg.inner_text("#responseNote") and "selected" in pg.inner_text("#pairNote"))
    ok("no significance frames on a selection made in C (circular)", pg.evaluate("[...document.querySelectorAll('#pairs rect.pc')].filter(r=>r.getAttribute('stroke')==='#1d1d1f').length") == 0)
    dimmed = pg.evaluate("[...document.querySelectorAll('#seedtable rect.c')].filter(r=>+r.getAttribute('opacity')<0.5).length")
    ok("C rows outside the selection are dimmed", dimmed > 0 or br == 30)
    pg.keyboard.press("Escape"); ok("Esc clears seed selection", S("brushed") is None)
    pg.locator("#seedtable g.band").first.click(force=True)
    ok("C band header click selects its seeds", S("brushed") is not None)
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(500)

    # D: player
    pg.click("#player button:has-text('▶ play')"); pg.wait_for_timeout(700); pg.click("#player button:has-text('pause')")
    ok("D play advances time", S("t") > 0)
    pg.keyboard.press("ArrowRight"); t1 = S("t"); pg.keyboard.press("ArrowLeft")
    ok("D keyboard stepping", S("t") == t1 - 1)
    pg.locator("#workspace .fan circle").first.hover(force=True)
    ok("D fan tooltip", pg.is_visible("#tooltip"))
    ok("D shows what the policy saw (outline at the picture time)", pg.locator("#workspace g.sn path.sb").count() >= 1)
    ok("D side cards say how outdated each plan is", "moved" in pg.inner_text("#workspace") or "idle" in pg.inner_text("#workspace"))
    ok("D overlays baseline and candidate on one board", pg.locator("#workspace g.board").count() == 1 and pg.locator("#workspace g.board g.wp").count() == 2)
    pg.locator("#workspace g.card").nth(1).hover()
    ok("D card hover shows that run alone", pg.evaluate("+document.querySelectorAll('#workspace g.wp')[0].getAttribute('opacity')") < 0.5
       or pg.evaluate("+document.querySelectorAll('#workspace g.wp')[1].getAttribute('opacity')") < 0.5)
    pg.mouse.move(5, 5)
    ok("E shows ordinary motion under the jumps and the final value of each run", pg.locator("#timeline path.mot").count() == 2 and pg.locator("#timeline text.fin").count() == 2)
    ok("D says why it opened where it did", pg.locator("#workspace text.split").count() == 1 and "t =" in pg.locator("#workspace text.split").text_content())

    # E: hover a chunk -> hoverChunk, brush window
    pg.locator("#timeline .bars rect").nth(3).hover()
    ok("E chunk hover links to D", S("hoverChunk") is not None)
    box = pg.locator("#timeline svg").bounding_box()
    y = box["y"] + box["height"] * 0.7
    pg.mouse.move(box["x"] + box["width"] * 0.35, y); pg.mouse.down()
    pg.mouse.move(box["x"] + box["width"] * 0.55, y, steps=6); pg.mouse.up()
    ok("E brush sets window", S("win") is not None)
    ok("D draws brushed window path", pg.evaluate("document.querySelector('#workspace .pathWin').getAttribute('d')") is not None)
    pg.keyboard.press("Escape"); ok("Esc clears window", S("win") is None)

    # A's ranking strip, reset, resize, URL state
    pg.evaluate("window.LagLens.update({ref:'sync_d4_h4', cand:'inpaint_d4_h4', dfocus:null, metric:'success_rate'})"); pg.wait_for_timeout(300)
    rk = pg.evaluate("""[...document.querySelectorAll('#pairs g.rr')].map(g=>{const r=d3.select(g).datum(); return [r.id, r.mean, r.runs.length]})""")
    ok("A ranks the 6 schedules at the pair's latency (d = 4) by the mean success of their 3 runs, best first",
       len(rk) == 6 and all(x[0].split("_")[1] == "d4" and x[2] == 3 for x in rk) and all(rk[i][1] >= rk[i+1][1] for i in range(5)))
    pg.locator("#pairs g.rr").nth(1).click(force=True); pg.wait_for_timeout(200)
    ok("a row of the ranking sets the candidate", S("cand") == rk[1][0] and S("ref") == "sync_d4_h4")
    pg.evaluate("window.LagLens.update({dfocus:2})"); pg.wait_for_timeout(200)
    ok("the ranking follows 'my latency'", all("_d2_" in pg.evaluate("[...document.querySelectorAll('#pairs g.rr')].map(g=>d3.select(g).datum().id)")[i] for i in range(6)))
    pg.evaluate("window.LagLens.update({dfocus:null})")
    pg.evaluate("window.LagLens.update({ref:'sync_d4_h8', cand:'naive_d4_h8'})")
    pg.locator("#pairs text.colL").nth(3).click(force=True); ok("a column label in A sets only the candidate", S("cand") == "sync_d0_h8" and S("ref") == "sync_d4_h8")
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
    ok("Catch: D draws the ball and no T", pg.locator("#workspace g.block circle").count() == 2 and pg.locator("#workspace g.block path.bl").count() == 0 and pg.locator("#workspace path.gl").count() == 0)
    ok("Catch: E shows the pusher–ball distance", "pusher–ball distance" in pg.inner_text("#timeline"))
    ok("Catch: D cards give the distance to the ball", "distance to ball" in pg.inner_text("#workspace"))
    ok("Catch: B shows the two re-runs of every schedule as small hollow marks", pg.locator("#response g.pm g.re circle").count() == 2 * 14)
    ok("Catch: C shows two narrow re-run cells per schedule and start state", pg.locator("#seedtable rect.cr").count() == 2 * 2 * 30)
    ok("Catch: C marks start states whose outcome is not the same in all runs (≈) and counts the flips that come back",
       pg.locator("#seedtable text.nz").count() > 0 and "come back in all 3 runs" in pg.inner_text("#seedNote"))
    pg.click("#taskSeg button:has-text('PushT')")
    pg.wait_for_function("window.LagLens.state.task === 'pusht' && document.querySelectorAll('#workspace g.block path.bl').length == 2", timeout=30000)
    ok("task switch back to PushT (T-goal and T-block again, no ball)", pg.evaluate("window.LagLens.DATA.task") == "pusht"
       and pg.locator("#workspace path.gl").count() == 1 and pg.locator("#workspace g.block circle").count() == 0)
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
