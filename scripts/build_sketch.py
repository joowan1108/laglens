"""Writes report/sketch.svg: the low-fidelity design sketch of the interface layout (5 linked views, A-E,
as implemented). Each view is a plain box with a schematic of its idiom (a few placeholder marks, not
data) and short notes on what it encodes. Purple = interaction and linking, numbered as in the report's
Figure 2 caption. (The proposal-stage sketch with 4 views is kept as slides/assets/sketch.svg.)"""
import math, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "report" / "sketch.svg"
INK, GREY, LIGHT = "#2b2b2b", "#8a8a92", "#ececf0"
IA = "#6a3d9a"  # interaction annotations
R, C, SEAM = "#222", "#E69F00", "#c2185b"
random.seed(11)
o = []
add = o.append


def j(a=0.9):  # no hand jitter: clean strokes
    return 0.0


def rl(x1, y1, x2, y2, col=INK, w=1.5, dash=None, over=0):
    """Straight line."""
    L = math.hypot(x2 - x1, y2 - y1) or 1
    ux, uy = (x2 - x1) / L, (y2 - y1) / L
    x1, y1, x2, y2 = x1 - ux * over + j(), y1 - uy * over + j(), x2 + ux * over + j(), y2 + uy * over + j()
    b = 0
    mx, my = (x1 + x2) / 2 - uy * b, (y1 + y2) / 2 + ux * b
    d = f' stroke-dasharray="{dash}"' if dash else ""
    add(f'<path d="M{x1:.1f},{y1:.1f} Q{mx:.1f},{my:.1f} {x2:.1f},{y2:.1f}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round"{d}/>')


def rbox(x, y, w, h, col=INK, sw=1.5, fill=None, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="{fill or "none"}" stroke="{col}" stroke-width="{sw}"{d}/>')


def curve(pts, col=INK, w=1.8, dash=None, arrow=False):
    """Smooth curve through pts (Catmull-Rom → cubic Bézier)."""
    P = [(a + j(0.7), b + j(0.7)) for a, b in pts]
    d = f"M{P[0][0]:.1f},{P[0][1]:.1f}"
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    ds = f' stroke-dasharray="{dash}"' if dash else ""
    m = f' marker-end="url(#{"arrI" if col == IA else "arrK"})"' if arrow else ""
    add(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"{ds}{m}/>')


def rcirc(x, y, r, col=INK, w=1.5, fill="none", dash=None, op=1):
    d = f' stroke-dasharray="{dash}" stroke-linecap="round"' if dash else ""
    add(f'<ellipse cx="{x + j(0.4):.1f}" cy="{y + j(0.4):.1f}" rx="{r + j(0.6):.1f}" ry="{r + j(0.6):.1f}" fill="{fill}" fill-opacity="{op}" stroke="{col}" stroke-width="{w}"{d}/>')


def txt(x, y, s, size=12.5, col=INK, anchor="start", weight="normal"):
    add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{col}" text-anchor="{anchor}" font-weight="{weight}">{s}</text>')


def note(x, y, s, anchor="start", size=12.5):
    txt(x, y, s, size, IA, anchor)


def badge(x, y, n):  # numbered step, explained under the sketch on slide 7
    rcirc(x, y, 11, IA, 1.5, fill=IA)
    add(f'<text x="{x}" y="{y + 5.5}" font-size="13" font-weight="bold" fill="#fff" text-anchor="middle">{n}</text>')


def tee(cx, cy, rot, s=1.0, **kw):
    """T-shaped block (PushT) outline."""
    P = [(-40, -30), (40, -30), (40, -12), (10, -12), (10, 48), (-10, 48), (-10, -12), (-40, -12)]
    a = math.radians(rot)
    Q = [(cx + s * (x * math.cos(a) - y * math.sin(a)), cy + s * (x * math.sin(a) + y * math.cos(a))) for x, y in P]
    if kw.get("fill"):
        add(f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in Q)}" fill="{kw["fill"]}"/>')
    for (x1, y1), (x2, y2) in zip(Q, Q[1:] + Q[:1]):
        rl(x1, y1, x2, y2, kw.get("col", INK), kw.get("w", 1.5), kw.get("dash"), over=0)


W, H = 1200, 720
add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="Helvetica, Arial, sans-serif" font-size="13">')
add(f'<defs>'
    f'<marker id="arrI" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="{IA}" stroke-width="1.6" stroke-linecap="round"/></marker>'
    f'<marker id="arrK" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="{INK}" stroke-width="1.6" stroke-linecap="round"/></marker>'
    '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="6" stroke="#aaa" stroke-width="1.2"/></pattern></defs>')
add(f'<rect width="{W}" height="{H}" fill="#fff"/>')

A = (8, 56, 404, 340); B = (420, 56, 296, 340); Dv = (724, 56, 468, 340)
Cv = (8, 404, 708, 308); E = (724, 404, 468, 308)


def seg(x, y, labels, on, wseg=None):
    xx = x
    for k, lab in enumerate(labels):
        w = (wseg or [len(l) * 7.4 + 18 for l in labels])[k]
        rbox(xx, y, w, 22, fill="#444" if k == on else None)
        txt(xx + w / 2, y + 16, lab, 12, "#fff" if k == on else INK, "middle")
        xx += w
    return xx


def title(v, s, sub):
    x, y, w, h = v
    rbox(x, y, w, h)
    txt(x + 12, y + 24, s, 15, weight="bold")
    txt(x + 20 + len(s) * 9.6, y + 24, sub, 12, "#555")


# ---- header: task and question only (the pair is chosen in A)
rbox(8, 8, 1184, 40)
txt(22, 33, "LagLens", 16, weight="bold")
seg(100, 17, ["PushT", "Catch the ball"], 0)
txt(290, 33, "show", 12, GREY)
xe = seg(326, 17, ["Success", "Idle", "Outdated plan", "Jump"], 0)
note(xe + 12, 33, "one question for A, B and C (success, or what each strategy pays)")
txt(1110, 33, "? Guide   Reset", 12.5, INK, "middle")

# ---- A pair overview with ranking strip
title(A, "A · Pair overview", "which two schedules differ?")
ax, ay, aw, ah = A
seg(ax + 14, ay + 36, ["all latencies", "d = 2", "d = 4"], 2)
note(ax + 236, ay + 52, "= my latency")
mx, my, mc, nn = ax + 74, ay + 100, 20, 7
shade = [[0, 3, 2, 3, 3, 9, 9], [1, 0, 1, 2, 2, 9, 9], [1, 1, 0, 1, 2, 9, 1], [1, 1, 1, 0, 1, 1, 9],
         [1, 1, 1, 1, 0, 9, 1], [9, 9, 9, 1, 9, 0, 1], [9, 9, 1, 9, 1, 1, 0]]
fills = {0: "#ffffff", 1: "#e4e4ea", 2: "#b9b9c4", 3: "#6f6f7c", 9: "url(#hatch)"}
for i in range(nn):
    for k in range(nn):
        v = shade[i][k] if i != k else 0
        rbox(mx + k * mc, my + i * mc, mc - 2, mc - 2, col=INK if v == 3 else "#c4c4cc", sw=2.2 if v == 3 else 1, fill=fills[v])
rbox(mx + 3 * mc - 3, my - 3, mc + 4, mc + 4, C, 2.6)
txt(mx - 6, my + 14, "baseline", 11, R, "end"); txt(mx - 6, my + 28, "↓", 11, R, "end")
txt(mx, my - 8, "candidate →", 11, "#9a6a00")
badge(mx + 3 * mc + 34, my - 12, 1)
# ranking strip
rx, ry = ax + 234, ay + 92
txt(rx, ry, "ranking at my latency", 12, weight="bold")
for k, v in enumerate([0.82, 0.7, 0.63, 0.55, 0.47, 0.38, 0.2]):
    yy = ry + 18 + k * 21
    rl(rx, yy, rx + 60, yy, "#999", 1)
    x0 = rx + 76 + v * 80
    rcirc(x0 - 6, yy, 3.2, GREY, 1.1); rcirc(x0 + 7, yy, 3.2, GREY, 1.1); rcirc(x0, yy, 4, INK, 1, fill=INK)
    if k == 2:
        rbox(rx - 4, yy - 9, 166, 18, IA, 1.6)
badge(rx + 172, ry + 18 + 2 * 21, 2)
txt(rx, ry + 164, "● run 0  ○ re-runs · best first", 11, "#555")
txt(ax + 14, ay + 278, "row = baseline · column = candidate · shade = difference", 11.5, "#555")
txt(ax + 14, ay + 294, "on the same start states · dark frame = unlikely chance", 11.5, "#555")
txt(ax + 14, ay + 310, "(FDR 5 %) · hatched = not compared (mixes two causes)", 11.5, "#555")
note(ax + 14, ay + 332, "① click a cell = compare that pair  ② click a row = candidate", size=11.5)

# ---- B latency response
title(B, "B · Latency response", "vs. baseline")
bx, by, bw, bh = B
px0, py0, pw, ph = bx + 46, by + 60, bw - 70, 170
rl(px0, py0 + ph, px0 + pw, py0 + ph, GREY, 1.2); rl(px0, py0, px0, py0 + ph, GREY, 1.2)
add(f'<rect x="{px0 + pw * 0.82}" y="{py0}" width="{pw * 0.18}" height="{ph}" fill="#eeeef2"/>')
for k, d in enumerate((0, 2, 4)):
    txt(px0 + 8 + k * (pw - 16) / 2, py0 + ph + 16, str(d), 11, GREY, "middle")
txt(px0 + pw, py0 + ph + 32, "latency d →", 11, GREY, "end")
X = lambda k: px0 + 8 + k * (pw - 16) / 2
base_y = py0 + ph - 30
rl(px0, base_y, px0 + pw, base_y, INK, 1.2)
txt(px0 + 4, base_y + 14, "0 = baseline", 10.5, "#555")
for pts, dash in [([90, 96, 150], None), ([90, 60, 40], "6 4"), ([90, 70, 52], "1.5 3")]:
    P = [(X(k), py0 + v) for k, v in enumerate(pts)]
    curve(P, "#777", 1.6, dash)
    for x, y in P:
        rcirc(x, y, 3.6, "#555", 1, fill="#555")
        rcirc(x + 5, y + 9, 2.4, GREY, 1)
rcirc(X(2), py0 + 40, 8, C, 2.4)
txt(X(2) - 10, py0 + 28, "candidate", 11, "#9a6a00", "end")
badge(X(2) + 16, py0 + 26, 3)
txt(bx + 12, by + 268, "y = success minus the baseline's", 11.5, "#555")
txt(bx + 12, by + 284, "on the same start states · line = h", 11.5, "#555")
txt(bx + 12, by + 300, "filled = unlikely chance · ○ = run again", 11.5, "#555")
note(bx + 12, by + 324, "③ click = candidate · shift-click = baseline", size=11.5)

# ---- D workspace replay (one map, both runs)
title(Dv, "D · Workspace replay", "where does it go wrong?")
dx, dy, dw, dh = Dv
mxx, myy, mw, mh = dx + 12, dy + 36, 268, 238
rbox(mxx, myy, mw, mh, "#999", 1.3)
tee(mxx + 190, myy + 70, 0, 0.8, col=GREY, dash="4 3")
txt(mxx + 238, myy + 46, "goal", 11, GREY)
tee(mxx + 150, myy + 140, 30, 0.8, fill=LIGHT)
tee(mxx + 118, myy + 150, 12, 0.8, col=C, w=1.4, dash="2 4")
curve([(mxx + 20, myy + 210), (mxx + 60, myy + 190), (mxx + 92, myy + 178)], R, 2.4)
rcirc(mxx + 98, myy + 176, 9, R, 2, fill=R)
curve([(mxx + 30, myy + 120), (mxx + 70, myy + 110), (mxx + 110, myy + 96)], C, 2.4)
rcirc(mxx + 150, myy + 78, 9, C, 2, fill=C, op=.35)
rl(mxx + 112, myy + 95, mxx + 146, myy + 80, SEAM, 2.6)
txt(mxx + 112, myy + 76, "jump", 11, SEAM, "end")
curve([(mxx + 158, myy + 74), (mxx + 200, myy + 60), (mxx + 240, myy + 58)], C, 1.5, "5 4")
rcirc(mxx + 84, myy + 128, 9, C, 1.4, dash="2 4")
txt(mxx + 10, myy + mh - 10, "dotted = what the policy saw", 11, "#9a6a00")
cx1 = dx + 290
for k, (lab, col, l1, l2) in enumerate([("Baseline ✗", R, "Sync d4 h4", "idle: waiting for a plan"),
                                        ("Candidate ✓", C, "Inpaint d4 h4", "plan from an old picture")]):
    yy = dy + 40 + k * 84
    rbox(cx1, yy, 166, 74, col, 1.8)
    txt(cx1 + 10, yy + 20, lab, 12.5, "#222" if k == 0 else "#9a6a00", weight="bold")
    txt(cx1 + 10, yy + 38, l1, 11.5); txt(cx1 + 10, yy + 56, l2, 10.5, "#555")
rbox(dx + 12, dy + 290, 50, 22, sw=1.3); txt(dx + 22, dy + 306, "▶ play", 12)
rl(dx + 76, dy + 301, dx + 286, dy + 301, INK, 2.4); rcirc(dx + 200, dy + 301, 7, INK, 1.4, fill=INK)
note(dx + 300, dy + 306, "← → step · hover a point", size=11)
txt(dx + 12, dy + 330, "solid = executed · dashed = planned, not executed · magenta = jump", 11, "#555")

# ---- C paired seed table
title(Cv, "C · Paired seed table", "which start states flip?")
cx, cy, cw, ch = Cv
gx = cx + 210
txt(gx + 10, cy + 54, "base", 11, R, "middle"); txt(gx + 66, cy + 54, "cand", 11, "#9a6a00", "middle"); txt(gx + 98, cy + 54, "(narrow = again)", 10, GREY)
txt(cx + 400, cy + 54, "the question of the header, baseline → candidate", 11.5, "#555")
bands = [("baseline ✗ → candidate ✓", (0, 1)), ("baseline ✓ → candidate ✗", (1, 0)), ("both ✓", (1, 1)), ("both ✗", (0, 0))]
y = cy + 64
rowy = []
for name, (rok, cok) in bands:
    add(f'<rect x="{cx + 8}" y="{y}" width="{cw - 16}" height="16" fill="#f0f0f3"/>')
    txt(cx + 12, y + 12, name, 11.5, weight="bold")
    y += 18
    for r in range(2 if name in ("baseline ✗ → candidate ✓", "both ✓") else 1):
        rbox(gx, y, 20, 11, "#999", 1, fill=R if rok else None)
        for q in range(2):
            rbox(gx + 24 + q * 8, y, 6, 11, "#bbb", 0.8, fill="#777" if (rok if (r + q) % 3 else 1 - rok) else None)
        rbox(gx + 56, y, 20, 11, "#999", 1, fill=C if cok else None)
        for q in range(2):
            rbox(gx + 80 + q * 8, y, 6, 11, "#bbb", 0.8, fill="#e9b949" if cok else None)
        if (r + len(name)) % 2:
            txt(gx + 104, y + 10, "≈", 12, GREY)
        rv, cv = random.uniform(400, 560), random.uniform(330, 390)
        rl(cx + 30 + cv, y + 5, cx + 30 + rv, y + 5, "#999", 1.2)
        rcirc(cx + 30 + rv, y + 5, 3.4, R, 1, fill=R); rcirc(cx + 30 + cv, y + 5, 3.4, C, 1, fill=C)
        rowy.append(y)
        y += 15
    y += 6
rbox(cx + 350, rowy[0] - 5, 250, 36, IA, 1.5, dash="5 4")
badge(cx + 614, rowy[0] + 6, 4)
rbox(cx + 8, rowy[3] - 3, 600, 17, IA, 1.8)
badge(cx + 622, rowy[3] + 5, 5)
txt(cx + 12, cy + ch - 46, "filled = success · narrow = the same schedule run again · ≈ = outcome not the same in all runs", 11.5, "#555")
note(cx + 12, cy + ch - 24, "④ drag = select start states → A and B recompute on them  ⑤ click a row = replay it in D and E", size=12)

# ---- E execution timeline
title(E, "E · Execution timeline", "when does it wait or jump?")
ex, ey, ew, eh = E
t0, Wd = ex + 100, 44
for k, (lab, col) in enumerate([("baseline", R), ("candidate", C)]):
    yy = ey + 60 + k * 76
    txt(ex + 12, yy - 14, lab, 12.5, "#222" if k == 0 else "#9a6a00", weight="bold")
    txt(t0 - 6, yy + 2, "jumps", 10.5, GREY, "end"); txt(t0 - 6, yy + 18, "think", 10.5, GREY, "end"); txt(t0 - 6, yy + 38, "act", 10.5, GREY, "end")
    if k == 0:
        for c in range(4):
            x = t0 + c * 2 * Wd
            rbox(x, yy + 8, Wd - 4, 11, "#555", 1.1, fill="#ccc")
            rbox(x, yy + 26, Wd - 4, 15, "#999", 1.1, fill="url(#hatch)")
            rbox(x + Wd, yy + 26, Wd - 4, 15, "#555", 1.2, fill="#bbb")
    else:
        for c in range(8):
            x = t0 + c * Wd
            rbox(x, yy + 8, Wd - 4, 11, col, 1.1, fill="#fbe3b0")
            rbox(x, yy + 26, Wd - 4, 15, col, 1.2, fill="#f3c66a")
            if c:
                jh = [0, 5, 4, 11, 16, 6, 4, 8][c]
                add(f'<rect x="{x - 1.5}" y="{yy + 4 - jh}" width="3" height="{jh}" fill="{SEAM}"/>')
cb, ct = ey + 260, ey + 214
rl(t0, cb, ex + ew - 12, cb, GREY, 1.2); rl(t0, ct, ex + ew - 12, ct, GREY, 1.1, "6 5")
txt(ex + ew - 12, ct - 4, "success line", 10.5, GREY, "end")
txt(ex + 12, ct + 26, "outcome", 11.5, "#555")
curve([(t0, cb), (t0 + 120, cb - 14), (t0 + 250, cb - 24), (t0 + 350, cb - 20)], R, 2)
curve([(t0, cb), (t0 + 110, cb - 18), (t0 + 220, cb - 34), (t0 + 300, cb - 50)], C, 2)
cur = t0 + 3.5 * Wd
rl(cur, ey + 44, cur, cb, INK, 1.5)
rbox(t0 + 5 * Wd - 4, ey + 40, 2 * Wd + 6, cb - ey - 40, IA, 1.5, dash="5 4")
badge(t0 + 5 * Wd - 4, ey + 40, 6)
note(ex + 12, ey + eh - 14, "⑥ drag = time window → its path in D · click = cursor", size=11.5)

# ---- linking arrows
curve([(ax + 392, ay + 250), (ax + 380, ay + ah + 24), (cx + 330, cy + 40)], IA, 1.5, "5 4", True)
curve([(cx + 634, rowy[3] + 5), (cx + 696, cy + 60), (dx + 100, dy + dh - 4)], IA, 1.5, "5 4", True)
curve([(cx + 614, rowy[0] - 6), (cx + 600, ay + ah + 20), (bx + 200, by + bh - 4)], IA, 1.5, "5 4", True)
curve([(t0 + 6 * Wd, ey + 40), (ex + 400, ey - 20), (dx + 200, dy + 270)], IA, 1.5, "5 4", True)
add('</svg>')
OUT.write_text("\n".join(o))
print("wrote", OUT, f"{OUT.stat().st_size // 1024} KB")
