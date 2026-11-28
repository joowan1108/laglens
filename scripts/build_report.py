"""Fill report/report.template.html with numbers from the dataset, render report.pdf (A4) with
headless Chromium and check the 5-page limit.

  LD_LIBRARY_PATH=~/chromelibs/root/usr/lib/x86_64-linux-gnu ~/infovis-venv/bin/python scripts/build_report.py
"""
import csv, itertools, json, math, statistics as st, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from build_slides import tokens  # noqa: E402


D = ROOT / "src" / "data"
TASK_CSV = {"pusht": D / "episodes.csv", "catch": D / "catch" / "episodes.csv"}
TASK_RUNS = {"pusht": D / "runs", "catch": D / "catch" / "runs"}
STRATS, HS = ("sync", "naive", "inpaint"), (4, 8, 11)


def load(task):
    ep = {}
    for r in csv.DictReader(open(TASK_CSV[task])):
        ep.setdefault(r["schedule"], {})[int(r["seed"])] = r
    return ep


def parse(sid):
    a = sid.split("_")
    return a[0], int(a[1][1:]), int(a[2][1:])


def comparable(a, b):
    """The interface's rule (src/js/data.js): same latency; or the same h and (same strategy or one side at d = 0)."""
    (sa, da, ha), (sb, db, hb) = parse(a), parse(b)
    return a != b and (da == db or (ha == hb and (sa == sb or da == 0 or db == 0)))


def flips(ep, a, b):
    """(rescued, lost): start states where b succeeds and a fails, and the reverse (run 0)."""
    A, B = ep[a], ep[b]
    return (sum(A[s]["success"] == "0" and B[s]["success"] == "1" for s in A),
            sum(A[s]["success"] == "1" and B[s]["success"] == "0" for s in A))


def mcnemar(g, l):
    n = g + l
    return 1.0 if n == 0 else min(1.0, 2 * sum(math.comb(n, i) for i in range(min(g, l) + 1)) / 2 ** n)


def fdr(ep):
    """Exact McNemar on run 0 + Benjamini-Hochberg over the comparable pairs, as in view A."""
    base = sorted(s for s in ep if s[-3:-1] != "_r")
    pairs = [(a, b) for a, b in itertools.combinations(base, 2) if comparable(a, b)]
    ps = [mcnemar(*flips(ep, a, b)) for a, b in pairs]
    m, order, q, run = len(ps), sorted(range(len(ps)), key=lambda i: ps[i]), [0.0] * len(ps), 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]; run = min(run, ps[i] * m / rank); q[i] = run
    return base, pairs, {pairs[i]: q[i] for i in range(m)}


def mean3(ep, sid, k="success"):
    """mean over run 0 and the two re-runs (what the ranking strip in A sorts by)"""
    v = [float(r[k]) for x in (sid, sid + "_r1", sid + "_r2") for r in ep[x].values() if r[k] != ""]
    return sum(v) / len(v)


def rerun_flips(ep, sid):
    return [sum(ep[sid][s]["success"] != ep[sid + r][s]["success"] for s in ep[sid]) for r in ("_r1", "_r2")]


def h_svg(eps):
    """Success at d = 4 against the horizon h, one panel per task: mean of the three runs (mark) and the
    range of the three runs (thin bar); sync at d = 0 (no latency) as a grey reference."""
    W, Hh, ml, mt, pw, ph, gap = 420, 168, 34, 22, 172, 108, 32
    col = {"sync": "#0072B2", "naive": "#D55E00", "inpaint": "#009E73"}
    o = [f'<svg viewBox="0 0 {W} {Hh}" width="{W}" height="{Hh}" font-size="10.5" font-family="Ubuntu Sans, Ubuntu, DejaVu Sans">']
    for k, (task, name) in enumerate([("pusht", "PushT"), ("catch", "Catch the ball")]):
        ep, x0 = eps[task], ml + k * (pw + gap)
        X = lambda h: x0 + 14 + (h - 4) / 7 * (pw - 28)
        Y = lambda v: mt + ph - v * ph
        o.append(f'<text x="{x0 + pw / 2}" y="12" text-anchor="middle" font-weight="bold" font-size="11.5">{name}</text>')
        for v in (0, 0.5, 1):
            o.append(f'<line x1="{x0}" x2="{x0 + pw}" y1="{Y(v)}" y2="{Y(v)}" stroke="#e3e3e8"/>')
            if k == 0:
                o.append(f'<text x="{x0 - 4}" y="{Y(v) + 3.5}" text-anchor="end" fill="#666">{v * 100:.0f}%</text>')
        for h in HS:
            o.append(f'<text x="{X(h)}" y="{mt + ph + 13}" text-anchor="middle" fill="#666">{h}</text>')
        ref = [(X(h), Y(mean3(ep, f"sync_d0_h{h}"))) for h in HS]
        o.append('<polyline points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in ref) + '" fill="none" stroke="#9a9aa2" stroke-width="1.4" stroke-dasharray="4 3"/>')
        if k == 1:
            o.append(f'<text x="{ref[0][0] - 4}" y="{ref[0][1] - 5}" fill="#77777f" font-size="9.5">d = 0</text>')
        for j, st_ in enumerate(STRATS):
            dx = (j - 1) * 4.5
            pts = []
            for h in HS:
                sid = f"{st_}_d4_h{h}"
                rr = [sum(int(r["success"]) for r in ep[x].values()) / len(ep[x]) for x in (sid, sid + "_r1", sid + "_r2")]
                x, y = X(h) + dx, Y(mean3(ep, sid))
                o.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{Y(min(rr)):.1f}" y2="{Y(max(rr)):.1f}" stroke="{col[st_]}" stroke-width="1.2" stroke-opacity="0.55"/>')
                pts.append((x, y))
            o.append('<polyline points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + f'" fill="none" stroke="{col[st_]}" stroke-width="1.8"/>')
            for x, y in pts:
                if st_ == "sync":
                    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{col[st_]}" stroke="#fff"/>')
                elif st_ == "naive":
                    o.append(f'<rect x="{x - 3.2:.1f}" y="{y - 3.2:.1f}" width="6.4" height="6.4" fill="{col[st_]}" stroke="#fff"/>')
                else:
                    o.append(f'<rect x="{x - 3:.1f}" y="{y - 3:.1f}" width="6" height="6" fill="{col[st_]}" stroke="#fff" transform="rotate(45 {x:.1f} {y:.1f})"/>')
    lx = ml
    for st_, lab in (("sync", "● sync"), ("naive", "■ naive"), ("inpaint", "◆ inpaint")):
        o.append(f'<text x="{lx}" y="{Hh - 4}" fill="{col[st_]}" font-weight="bold">{lab}</text>'); lx += 56
    o.append(f'<text x="{lx + 4}" y="{Hh - 4}" fill="#666">at d = 4 · - - sync d = 0 · execution horizon h →</text></svg>')
    return "".join(o)


def report_tokens():
    """Every number quoted in the report's findings, computed from the data files."""
    t, eps = {}, {k: load(k) for k in TASK_CSV}
    for task, P in (("pusht", "P"), ("catch", "C")):
        ep = eps[task]
        base, pairs, q = fdr(ep)
        sig = [p for p in pairs if q[p] < 0.05]
        t[f"{P}_NSCHED"], t[f"{P}_NPAIRS"], t[f"{P}_NCMP"], t[f"{P}_NSIG"] = len(base), len(base) * (len(base) - 1) // 2, len(pairs), len(sig)
        t[f"{P}_SIG_H4"] = sum(any(parse(x)[2] == 4 for x in p) for p in sig)
        # the worse side of each framed pair (fewer successes on run 0)
        worse = [a if flips(ep, a, b)[0] > flips(ep, a, b)[1] else b for a, b in sig]
        t[f"{P}_SIG_SYNCD4_WORSE"] = sum(parse(w)[0] == "sync" and parse(w)[1] == 4 for w in worse)
        for st_ in STRATS:
            for h in HS:
                t[f"{P}_M_{st_.upper()}_{h}"] = f"{100 * mean3(ep, f'{st_}_d4_h{h}'):.0f}"
                t[f"{P}_IDLE_{h}"] = f"{100 * mean3(ep, f'sync_d4_h{h}', 'idle_frac'):.0f}"
        for h in HS:
            t[f"{P}_D0_{h}"] = f"{100 * mean3(ep, f'sync_d0_h{h}'):.0f}"
            t[f"{P}_D0R0_{h}"] = f"{100 * sum(int(r['success']) for r in ep[f'sync_d0_h{h}'].values()) / len(ep[f'sync_d0_h{h}']):.0f}"
            for c in ("naive", "inpaint"):
                g, l = flips(ep, f"sync_d4_h{h}", f"{c}_d4_h{h}")
                t[f"{P}_G_{c.upper()}_{h}"], t[f"{P}_L_{c.upper()}_{h}"] = g, l
                t[f"{P}_Q_{c.upper()}_{h}"] = f"{q.get((f'{c}_d4_h{h}', f'sync_d4_h{h}'), q.get((f'sync_d4_h{h}', f'{c}_d4_h{h}'))):.2f}"
            t[f"{P}_RR_SYNC_{h}"] = " and ".join(map(str, rerun_flips(ep, f"sync_d4_h{h}")))
        allrr = [f for s in base for f in rerun_flips(ep, s)]
        t[f"{P}_RR_MIN"], t[f"{P}_RR_MED"], t[f"{P}_RR_MAX"] = min(allrr), f"{st.median(allrr):g}", max(allrr)
        # ranking strip at d = 4
        at4 = sorted((f"{s}_d4_h{h}" for s in STRATS for h in HS), key=lambda x: -mean3(ep, x))
        t[f"{P}_RANK_LAST"] = at4[-1]
        # the row of sync d4 h4 in A at d = 4: framed cells among its comparable schedules
        row = [p for p in pairs if "sync_d4_h4" in p and (parse(p[0])[1] in (0, 4) and parse(p[1])[1] in (0, 4))]
        t[f"{P}_ROW_N"], t[f"{P}_ROW_SIG"] = len(row), sum(q[p] < 0.05 for p in row)
    ep = eps["pusht"]
    t["P_G_SI4"], t["P_L_SI4"] = flips(ep, "sync_d4_h4", "inpaint_d4_h4")
    # PushT seed 1017: naive d4 h4 (fails) vs. inpaint d4 h4 (succeeds)
    run = lambda task, sid, seed: next(e for e in json.load(open(TASK_RUNS[task] / f"{sid}.json"))["episodes"] if e["seed"] == seed)
    dist = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
    N, I = run("pusht", "naive_d4_h4", 1017), run("pusht", "inpaint_d4_h4", 1017)
    seam = lambda e, tt: round(next(x["gap"] for x in e["seams"] if x["t"] == tt))
    t["S17_J140"], t["S17_J156"], t["S17_J160"] = seam(N, 140), seam(N, 156), seam(N, 160)
    t["S17_JI_MAX"] = round(max(x["gap"] for x in I["seams"] if 150 <= x["t"] <= 190))
    t["S17_C150"], t["S17_C160"], t["S17_C168"] = (round(100 * N["cov"][k]) for k in (150, 160, 168))
    t["S17_CEND"] = round(100 * max(N["cov"][168:]))
    t["S17_FIN_I"] = I["n"]
    mv = lambda e: round(next(dist((e["ax"][c["t_avail"]], e["ay"][c["t_avail"]]), (e["ax"][c["t_obs"]], e["ay"][c["t_obs"]])) for c in e["chunks"] if c["exec"] and c["exec"][0] == 160))
    t["S17_MV_N"], t["S17_MV_I"] = mv(N), mv(I)
    t["S17_TM_N"], t["S17_TM_I"] = (f"{float(ep[s][1017]['think_motion_mean']):.0f}" for s in ("naive_d4_h4", "inpaint_d4_h4"))
    # C with baseline naive d4 h4, candidate inpaint d4 h4 (mean jump per switch)
    Nn, Ii = ep["naive_d4_h4"], ep["inpaint_d4_h4"]
    t["F5_G"], t["F5_L"] = flips(ep, "naive_d4_h4", "inpaint_d4_h4")
    band = lambda rn, ci: [s for s in Nn if Nn[s]["success"] == rn and Ii[s]["success"] == ci]
    med = lambda S, E: f"{st.median(float(E[s]['jump_mean']) for s in S):.0f}"
    span = lambda a, b: "–".join(f"{v:.0f}" for v in sorted((float(med(band(*a), Nn)), float(med(band(*b), Nn)))))
    t["F5_NFAIL"], t["F5_NSUCC"] = span(("0", "0"), ("0", "1")), span(("1", "0"), ("1", "1"))
    t["F5_ALL_LEFT"] = "all" if all(float(Ii[s]["jump_mean"]) < float(Nn[s]["jump_mean"]) for s in Nn) else "not all"
    t["F5_I_MAX"] = f"{max(float(Ii[s]['jump_mean']) for s in Ii):.0f}"
    t["F5_BOTHFAIL_N"], t["F5_BOTHFAIL_I"] = len(band("0", "0")), med(band("0", "0"), Ii)
    t["F5_ISUCC"] = med([s for s in Ii if Ii[s]["success"] == "1"], Ii)
    for strat in ("naive", "inpaint"):
        rows = [r for e in ep for r in ep[e].values() if r["strategy"] == strat and r["replicate"] == "0"]
        for ok, k in (("0", "FAIL"), ("1", "SUCC")):
            t[f"F5_{strat.upper()}_{k}"] = f"{st.median(float(r['jump_mean']) for r in rows if r['success'] == ok):.0f}"
    # Catch seed 1010
    cep = eps["catch"]
    S4, I4, S0 = (run("catch", s, 1010) for s in ("sync_d4_h4", "inpaint_d4_h4", "sync_d0_h4"))
    t["S10_DS"], t["S10_DI"] = round(S4["dist"][20]), round(I4["dist"][20])
    t["S10_TI"], t["S10_T0"] = I4["n"], S0["n"]
    jm = lambda s: [float(r["jump_max"]) for r in cep[s].values()]
    t["C_NJ_MED"], t["C_NJ_MAX"], t["C_IJ_MAX"] = f"{st.median(jm('naive_d4_h4')):.0f}", f"{max(jm('naive_d4_h4')):.0f}", f"{max(jm('inpaint_d4_h4')):.0f}"
    # how many of the flips at d = 4, h = 11 come back in all three runs of both schedules (C's "solid" flips)
    for task, P in (("pusht", "P"), ("catch", "C")):
        e = eps[task]; a, b = "sync_d4_h11", "inpaint_d4_h11"
        same = lambda sid, s: len({e[x][s]["success"] for x in (sid, sid + "_r1", sid + "_r2")}) == 1
        fl = [s for s in e[a] if e[a][s]["success"] != e[b][s]["success"]]
        t[f"{P}_SOLID_11"] = sum(same(a, s) and same(b, s) for s in fl)
    # what each strategy pays at d = 4, h = 4 (PushT, run 0)
    sj = {x["schedule"]: x for x in json.load(open(D / "schedules.json"))}
    for st_ in STRATS:
        t[f"DG_J_{st_.upper()}"] = f"{sj[f'{st_}_d4_h4']['jump_mean']:.0f}"
        t[f"DG_TM_{st_.upper()}"] = f"{sj[f'{st_}_d4_h4']['think_motion_mean']:.0f}"
    t["DG_IDLE"] = f"{100 * sj['sync_d4_h4']['idle_frac_mean']:.0f}"
    for task, P in (("pusht", "P"), ("catch", "C")):
        e = eps[task]
        rng_ = lambda ids: "–".join(f"{100 * v:.0f}" for v in (min(mean3(e, x) for x in ids), max(mean3(e, x) for x in ids)))
        t[f"{P}_SYNC4_RANGE"] = rng_([f"sync_d4_h{h}" for h in HS])
        t[f"{P}_ASYNC4_RANGE"] = rng_([f"{c}_d4_h{h}" for c in ("naive", "inpaint") for h in HS])
        t[f"{P}_FL_11"] = t[f"{P}_G_INPAINT_11"] + t[f"{P}_L_INPAINT_11"]
        t[f"{P}_NOTCMP"] = t[f"{P}_NPAIRS"] - t[f"{P}_NCMP"]
        t[f"{P}_UNFRAMED"] = t[f"{P}_NCMP"] - t[f"{P}_NSIG"]
    # the sentences in the report state these as facts: stop the build if the data say otherwise
    assert t["P_SIG_H4"] == t["P_NSIG"], "PushT: a framed pair without an h = 4 schedule"
    assert t["C_SIG_SYNCD4_WORSE"] == t["C_NSIG"], "Catch: a framed pair where sync d = 4 is not the worse side"
    assert t["P_NCMP"] == t["C_NCMP"] and t["P_NPAIRS"] == t["C_NPAIRS"]
    assert t["F5_ALL_LEFT"] == "all"
    t["H_SVG"] = h_svg(eps)
    return t


def main():
    tok = tokens()
    tok.update(report_tokens())
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
