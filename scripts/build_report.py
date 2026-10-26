"""Fill report/report.template.html with numbers from the dataset, render report.pdf (A4) with
headless Chromium and check the 5-page limit.

  LD_LIBRARY_PATH=~/chromelibs/root/usr/lib/x86_64-linux-gnu ~/infovis-venv/bin/python scripts/build_report.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from build_slides import tokens  # noqa: E402


def main():
    tok = tokens()
    tok["N_UI_CHECKS"] = sum(1 for l in (ROOT / "docs" / "ui_test_output.txt").read_text().splitlines() if l.startswith("PASS"))
    html = (ROOT / "report" / "report.template.html").read_text()
    for k, v in tok.items():
        html = html.replace("{{" + k + "}}", str(v))
    assert "{{" not in html, "unfilled token"
    out = ROOT / "report" / "report.html"
    out.write_text(html)
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto(out.as_uri()); pg.wait_for_load_state("networkidle")
        pg.pdf(path=str(ROOT / "report.pdf"), format="A4", print_background=True,
               margin={"top": "12mm", "bottom": "12mm", "left": "13mm", "right": "13mm"})
        b.close()
    from pypdf import PdfReader
    n = len(PdfReader(str(ROOT / "report.pdf")).pages)
    print(f"report.pdf pages = {n} ({'PASS' if n <= 5 else 'FAIL'} <= 5)")
    sys.exit(0 if n <= 5 else 1)


if __name__ == "__main__":
    main()
