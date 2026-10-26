"""Headless check of the interface: loads src/ over a local HTTP server, records console errors,
exercises the main interactions and saves screenshots.

  LD_LIBRARY_PATH=~/chromelibs/root/usr/lib/x86_64-linux-gnu ~/infovis-venv/bin/python scripts/screenshot.py [query] [out.png]
"""
import sys, threading, functools, http.server, socketserver
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
query = sys.argv[1] if len(sys.argv) > 1 else ""
out = sys.argv[2] if len(sys.argv) > 2 else str(ROOT / "image.png")

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "src"))
class Quiet(Handler.func):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT / "src")))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 940}, device_scale_factor=2)
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    sep = "&" if query else ""
    pg.goto(f"http://127.0.0.1:{port}/index.html?noguide{sep}{query}")
    try:
        pg.wait_for_function("window.LagLens && document.querySelectorAll('#timeline svg rect').length > 5", timeout=30000)
    except Exception as ex:
        errors.append(f"timeout waiting for render: {ex.__class__.__name__}")
    pg.wait_for_timeout(800)
    pg.screenshot(path=out)
    print("saved", out)
    b.close()
srv.shutdown()
print("console errors:", len(errors))
for e in errors: print("  ", e)
sys.exit(1 if errors else 0)
