"""Writes slides/assets/sketch.svg: the low-fidelity wireframe of the LagLens layout
(4 linked views). Boxes and placeholder marks are drawn with rough strokes; every view says
what it encodes. Purple = interaction and linking, numbered as the steps on slide 7."""
import math, random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "slides" / "assets" / "sketch.svg"
INK, GREY, LIGHT = "#333", "#8a8a92", "#e6e6ea"
IA = "#6a3d9a"  # interaction annotations
R, C, SEAM = "#222", "#E69F00", "#c2185b"
random.seed(7)
o = []
add = o.append


def j(a=0.9):
    return random.uniform(-a, a)


def rl(x1, y1, x2, y2, col=INK, w=1.4, dash=None, over=2.0):
    """Hand-drawn line: ends overshoot a little, the middle bows slightly."""
    L = math.hypot(x2 - x1, y2 - y1) or 1
    ux, uy = (x2 - x1) / L, (y2 - y1) / L
    x1, y1, x2, y2 = x1 - ux * over + j(), y1 - uy * over + j(), x2 + ux * over + j(), y2 + uy * over + j()
    b = random.uniform(-1, 1) * min(2.2, L * 0.01)
    mx, my = (x1 + x2) / 2 - uy * b, (y1 + y2) / 2 + ux * b
    d = f' stroke-dasharray="{dash}"' if dash else ""
    add(f'<path d="M{x1:.1f},{y1:.1f} Q{mx:.1f},{my:.1f} {x2:.1f},{y2:.1f}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round"{d}/>')


def rbox(x, y, w, h, col=INK, sw=1.4, fill=None, dash=None):
    if fill:
        add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"/>')
    rl(x, y, x + w, y, col, sw, dash); rl(x + w, y, x + w, y + h, col, sw, dash)
    rl(x + w, y + h, x, y + h, col, sw, dash); rl(x, y + h, x, y, col, sw, dash)


def rpoly(pts, col=INK, w=1.6, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    add(f'<polyline points="{" ".join(f"{a + j(0.6):.1f},{b + j(0.6):.1f}" for a, b in pts)}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"{d}/>')


def rcirc(x, y, r, col=INK, w=1.4, fill="none", dash=None):
    d = f' stroke-dasharray="{dash}" stroke-linecap="round"' if dash else ""
    add(f'<ellipse cx="{x + j(0.4):.1f}" cy="{y + j(0.4):.1f}" rx="{r + j(0.5):.1f}" ry="{r + j(0.5):.1f}" fill="{fill}" stroke="{col}" stroke-width="{w}"{d}/>')


def txt(x, y, s, size=11, col=INK, anchor="start", weight="normal"):
    add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{col}" text-anchor="{anchor}" font-weight="{weight}">{s}</text>')


def note(x, y, s, anchor="start", size=11):
    txt(x, y, s, size, IA, anchor)


def badge(x, y, n):  # numbered step, explained under the sketch on slide 7
    add(f'<circle cx="{x}" cy="{y}" r="10" fill="{IA}"/><text x="{x}" y="{y + 4.5}" font-size="13" font-weight="bold" fill="#fff" text-anchor="middle">{n}</text>')


def arrow(d):
    add(f'<path d="{d}" fill="none" stroke="{IA}" stroke-width="1.4" stroke-dasharray="5 3" marker-end="url(#arr)"/>')


def tee(cx, cy, rot, **kw):
    """T-shaped block (PushT) as a rough outline."""
    P = [(-40, -30), (40, -30), (40, -12), (10, -12), (10, 48), (-10, 48), (-10, -12), (-40, -12)]
    a = math.radians(rot)
    Q = [(cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)) for x, y in P]
    if kw.get("fill"):
        add(f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in Q)}" fill="{kw["fill"]}"/>')
    for (x1, y1), (x2, y2) in zip(Q, Q[1:] + Q[:1]):
        rl(x1, y1, x2, y2, kw.get("col", INK), kw.get("w", 1.3), kw.get("dash"), over=1)


add('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 660" font-family="Helvetica, Arial, sans-serif" font-size="12">')
add(f'<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{IA}"/></marker>'
    '<pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="5" stroke="#999" stroke-width="1.1"/></pattern></defs>')
add('<rect width="1200" height="660" fill="#fff"/>')

cx0, cy0, cwid, cht = 528, 54, 664, 330  # C
dx, dy, dw, dh = 528, 392, 664, 260  # D

# ---- header: R and C pickers
rbox(8, 8, 1184, 38)
txt(20, 33, "LagLens", 18, weight="bold")
rbox(640, 15, 215, 24, R, 2)
txt(652, 31, f'R (baseline): Sync · d=4 · h=4 ▾', 11.5)
txt(866, 32, "⇄", 15)
rbox(890, 15, 230, 24, C, 2)
txt(902, 31, f'<tspan fill="{C}">C</tspan> (compare): Inpaint · d=4 · h=4 ▾', 11.5)
txt(1132, 31, "? ↺", 12)
badge(604, 27, 1)
note(588, 31, "pick the two schedules to compare (or click in A)", "end")

# ---- A latency response
ax, ay, aw, ah = 8, 54, 512, 236
rbox(ax, ay, aw, ah)
txt(ax + 10, ay + 19, "A · Latency response  (T1)", 13, weight="bold")
qx = ax + 10
for lab, wd in [("Success", 64), ("Idle", 42), ("Outdated", 70), ("Discontinuity", 96)]:
    sel = lab == "Success"
    rbox(qx, ay + 28, wd, 20, fill="#444" if sel else None)
    txt(qx + wd / 2, ay + 42, lab, 11, "#fff" if sel else INK, "middle", "bold" if sel else "normal")
    qx += wd + 5
badge(qx + 14, ay + 38, 2)
note(qx + 28, ay + 42, "the question = y-axis of A and B")
D = [0, 1, 2, 4, 6]
shape = {8: {"sync": [.75, .7, .7, .5, .45], "naive": [.75, .72, .65, .62, .5], "inpaint": [.75, .66, .7, .64, .45]},
         6: {"sync": [.5, .45, .35, .3, .32], "naive": [.5, .48, .58, .56, .35], "inpaint": [.5, .52, .54, .6, .3]},
         4: {"sync": [.3, .26, .24, .16, .1], "naive": [.3, .16, .36, .4], "inpaint": [.3, .42, .48, .62]},
         2: {"sync": [.44, .2, .1, .03, .02], "naive": [.44, .38, .12], "inpaint": [.44, .3, .28]}}
style = {"sync": None, "naive": "6 3", "inpaint": "1.5 3"}
pw, ph, px0, py0 = 108, 100, ax + 36, ay + 74
for i, h in enumerate([8, 6, 4, 2]):
    x0 = px0 + i * (pw + 10)
    rl(x0, py0, x0, py0 + ph, GREY, 1.1); rl(x0, py0 + ph, x0 + pw, py0 + ph, GREY, 1.1)
    txt(x0 + pw / 2, py0 - 5, f"h = {h}", 11, anchor="middle", weight="bold")
    X = lambda d: x0 + 8 + d * 15
    Y = lambda v: py0 + ph - 6 - v * (ph - 14)
    for s, v in shape[h].items():
        pts = [(X(D[k]), Y(v[k])) for k in range(len(v))]
        rpoly(pts, "#555", 1.5, style[s])
        for a, b in pts:
            add(f'<circle cx="{a:.1f}" cy="{b:.1f}" r="2.2" fill="#555"/>')
    if h == 8:
        a, b = X(1), Y(.66)
        rl(a, b - 9, a, b + 9, GREY, 1)
    if h == 4:
        rcirc(X(4), Y(.16), 6.5, R, 2); txt(X(4) - 10, Y(.16) + 4, "R", 11, R, "end", "bold")
        rcirc(X(4), Y(.62), 6.5, C, 2); txt(X(4) - 10, Y(.62) + 4, "C", 11, "#9a6a00", "end", "bold")
txt(ax + 36, py0 + ph + 16, "x = latency d (0–6 steps) · y = the question · one panel per horizon h", 10.5, "#555")
txt(ax + 36, py0 + ph + 31, "── sync   - - - naive   ····· inpaint   │ = 95 % interval   ○ = current R and C", 10.5, "#555")
note(ax + 10, ay + ah - 8, "click a point → it becomes C · shift-click → R · hover → value and Δ vs R")

# ---- B paired seed table
bx, by, bw, bh = 8, 298, 512, 354
rbox(bx, by, bw, bh)
txt(bx + 10, by + 19, "B · Paired seed table  (T2, T4)", 13, weight="bold")
txt(bx + 10, by + 36, "one row = one start state · one column = one schedule (52)", 11, "#555")
cx_, cw, rh = bx + 96, 8, 7
cols = [("sync", 10), ("naive", 8), ("inpaint", 8)]
Rcol, Ccol = 6, 10 + 8 + 5
x = cx_
for g, n in cols:
    rl(x, by + 56, x + n * cw - 2, by + 56, GREY, 1.2)
    txt(x + n * cw / 2, by + 52, g, 10.5, anchor="middle", weight="bold")
    x += n * cw + 4
txt(bx + 340, by + 52, f"R ●──<tspan fill='{C}'>●</tspan> C on the question", 10.5, weight="bold")
bands = [("R ✓ C ✗", 0.7, (1, 0)), ("R ✗ C ✓", 0.35, (0, 1)), ("both ✓", 0.85, (1, 1)), ("both ✗", 0.15, (0, 0))]
y = by + 66
rowpos = {}
for bi, (name, p, (rok, cok)) in enumerate(bands):
    add(f'<rect x="{bx + 6}" y="{y}" width="{bw - 12}" height="13" fill="{LIGHT}"/>')
    txt(bx + 12, y + 10, name, 10.5, weight="bold")
    y += 16
    for r in range(3):
        x = cx_
        ci = 0
        for g, n in cols:
            for c in range(n):
                ok = rok if ci == Rcol else cok if ci == Ccol else random.random() < p
                add(f'<rect x="{x}" y="{y}" width="{cw - 2}" height="{rh - 1.5}" fill="{"#555" if ok else "#fff"}" stroke="#999" stroke-width=".6"/>')
                x += cw; ci += 1
            x += 4
        rv = random.uniform(60, 140) if name != "R ✗ C ✓" else random.uniform(130, 150)
        cv = random.uniform(10, 50)
        yy = y + rh / 2
        rl(bx + 340 + cv, yy, bx + 340 + rv, yy, "#999", 1, over=0)
        add(f'<circle cx="{bx + 340 + rv:.0f}" cy="{yy:.1f}" r="2.6" fill="{R}"/><circle cx="{bx + 340 + cv:.0f}" cy="{yy:.1f}" r="2.6" fill="{C}"/>')
        rowpos[(bi, r)] = y
        y += rh + 1
    txt(cx_ + 100, y + 8, "⋮", 12, GREY, "middle")
    y += 12
# R and C columns outlined across all bands
for ci, col in [(Rcol, R), (Ccol, C)]:
    gx = cx_ + ci * cw + (4 if ci >= 10 else 0) + (4 if ci >= 18 else 0)
    rbox(gx - 1.5, by + 64, cw + 1, y - by - 66, col, 1.6)
txt(bx + 12, y + 14, "■ success  □ failure · bands: where R and C disagree first", 10.5, "#555")
# brush over dumbbells of band 2
b2 = rowpos[(1, 0)]
rbox(bx + 335, b2 - 4, 168, 3 * (rh + 1) + 6, IA, 1.4, dash="4 3")
badge(bx + 494, b2 - 12, 3)
# clicked row
r1 = rowpos[(0, 1)]
rbox(cx_ - 3, r1 - 2, 408, rh + 3, IA, 1.6)
badge(cx_ - 16, r1 + 3, 4)
note(bx + 10, by + bh - 24, "③ drag over rows → select start states → A recomputes on them only")
note(bx + 10, by + bh - 9, "④ click a row → C and D replay that start state under R and C")
arrow(f"M{bx + 506},{b2 - 4} C{bx + 508},{by + 40} {bx + 500},{by + 10} {bx + 492},{ay + ah - 3}")
arrow(f"M{cx_ + 407},{r1 + 2} C{bx + 530},{r1} {bx + 518},{cy0 + 250} {cx0 + 20},{cy0 + 230}")
arrow(f"M{cx_ + 407},{r1 + 2} C{bx + 530},{r1 + 10} {bx + 518},{dy + 90} {dx + 8},{dy + 80}")

# ---- C workspace replay
rbox(cx0, cy0, cwid, cht)
txt(cx0 + 10, cy0 + 19, "C · Workspace replay  (T3)", 13, weight="bold")
txt(cx0 + 215, cy0 + 19, "the table seen from above, R and C side by side, same moment", 11, "#555")
for k, (lab, col, good) in enumerate([("R · Sync: standing still, waiting for its next plan", R, False),
                                      ("C · Inpaint: moving · picture k steps old", C, True)]):
    x0 = cx0 + 22 + k * 322
    txt(x0, cy0 + 42, lab, 11, "#222" if k == 0 else "#9a6a00", weight="bold")
    rbox(x0, cy0 + 50, 300, 200, "#999", 1.2)
    gx, gy = x0 + 190, cy0 + 130
    tee(gx, gy, 45, col=GREY, dash="5 4")
    bxx, byy = (gx - 8, gy + 10) if good else (gx + 26, gy - 14)
    tee(bxx, byy, 35 if good else 75, fill=LIGHT)
    pts = [(x0 + 40 + i * 9, cy0 + 222 - math.sin(i / 4.5) * 46) for i in range(16)]
    rpoly(pts[:6], col, 2.4)
    rpoly(pts[5:], col, 1.3, "4 3")
    for i, (a, b) in enumerate(pts):
        add(f'<circle cx="{a:.0f}" cy="{b:.0f}" r="2.4" fill="{col if i < 6 else "#fff"}" stroke="{col}"/>')
    ppx, ppy = pts[5]
    if good:
        rcirc(ppx, ppy, 10, col, 2)
        add(f'<circle cx="{ppx:.0f}" cy="{ppy:.0f}" r="10" fill="{col}" fill-opacity=".25"/>')
        # what the policy saw: block and pusher in the camera picture of the current chunk
        tee(bxx - 22, byy + 14, 25, col=col, w=1.5, dash="1.5 3")
        sax, say = ppx - 32, ppy + 18
        rcirc(sax, say, 10, col, 1.5, dash="1.5 3")
        rl(sax + 9, say - 4, ppx - 10, ppy + 4, col, 1.3, over=0)
        txt(x0 + 8, cy0 + 244, "dotted = what the policy saw · moved N px since", 10.5, "#9a6a00")
        badge(x0 + 286, cy0 + 64, 5)
    else:
        rcirc(ppx, ppy, 10, col, 2, fill=col)
        a, b = ppx - 40, ppy - 44
        rl(ppx, ppy, a, b, SEAM, 2.4, over=0)
        rcirc(a, b, 3.5, SEAM, 1.4, fill="#fff")
        txt(x0 + 10, b - 9, "jump to the next chunk", 10.5, SEAM, weight="bold")
        txt(x0 + 8, cy0 + 244, "filled pusher = standing still", 10.5, "#555")
txt(cx0 + 22, cy0 + 266, "grey T = block · dashed T = goal · ● pusher (the robot's tool) · ━ moves done · ┄ rest of the current plan", 10.5, "#555")
txt(cx0 + 22, cy0 + 280, f"⋯ block and pusher as seen in the camera picture the plan came from · <tspan fill='{SEAM}'>━ jump at a chunk switch</tspan>", 10.5, "#555")
rbox(cx0 + 22, cy0 + 293, 44, 18, sw=1.2)
txt(cx0 + 30, cy0 + 306, "▶ play", 10.5)
rl(cx0 + 78, cy0 + 302, cx0 + 300, cy0 + 302, INK, 2.4)
rcirc(cx0 + 200, cy0 + 302, 6, INK, 1.4, fill=INK)
note(cx0 + 312, cy0 + 306, "← → step · hover a planned point → when planned")

# ---- D execution timeline
rbox(dx, dy, dw, dh)
txt(dx + 10, dy + 19, "D · Execution timeline  (T3)", 13, weight="bold")
txt(dx + dw - 10, dy + 19, "the same episode over time, left → right", 11, "#555", "end")
txt(dx + 10, dy + 37, f"think = computing a plan · act = executing it (hatched = standing still) · <tspan fill='{SEAM}'>stick = jump size</tspan>", 10.5, "#555")
t0, W = dx + 74, 34
for k, (lab, col, kind) in enumerate([("R", R, "sync"), ("C", C, "async")]):
    y0 = dy + 48 + k * 52
    txt(dx + 12, y0 + 30, lab, 13, "#222" if k == 0 else "#9a6a00", weight="bold")
    txt(t0 - 6, y0 + 17, "think", 10, GREY, "end"); txt(t0 - 6, y0 + 33, "act", 10, GREY, "end")
    if kind == "sync":
        for c in range(8):
            x = t0 + c * 2 * W
            rbox(x, y0 + 11, W - 3, 7, "#555", 1, fill="#ccc")
            rbox(x, y0 + 22, W - 3, 13, "#999", 1, fill="url(#hatch)")
            rbox(x + W, y0 + 22, W - 3, 13, "#555", 1.1, fill="#bbb")
            if c:
                rl(x + W, y0 + 20, x + W, y0 + 4, SEAM, 1.6, over=0)
    else:
        for c in range(16):
            x = t0 + c * W
            rbox(x, y0 + 11, W - 3, 7, col, 1, fill="#fbe3b0")
            rbox(x, y0 + 22, W - 3, 13, col, 1.1, fill="#f3c66a" if c % 2 == 0 else "#fbe3b0")
            if c:
                rl(x, y0 + 20, x, y0 + 20 - random.uniform(2, 6), SEAM, 1.6, over=0)
# provenance of the chunk at the cursor (C lane): ○ camera picture → think → act
pc, py = 5, dy + 100
rbox(t0 + (pc - 1) * W - 1, py + 9, W - 1, 11, INK, 2.2)
rbox(t0 + pc * W - 1, py + 20, W - 1, 17, INK, 2.2)
rcirc(t0 + (pc - 1) * W - 1, py + 14.5, 4, INK, 1.6, fill="#fff")
badge(t0 + (pc - 1) * W - 8, py + 52, 6)
txt(t0 + (pc - 1) * W + 6, py + 56, "current chunk: ○ camera picture → think → act", 10.5, weight="bold")
# cursor and brush window
cur = t0 + (pc + 0.5) * W
rl(cur, dy + 44, cur, dy + 228, INK, 1.4, over=0)
rbox(t0 + 466, dy + 44, 72, 100, IA, 1.3, dash="4 3")
note(t0 + 502, dy + 158, "drag = window", "middle")
# coverage under the lanes
cb, ct = dy + 228, dy + 174
rl(t0, cb, dx + dw - 14, cb, GREY, 1.1)
rl(t0, ct + 4, dx + dw - 14, ct + 4, GREY, 1, "4 3")
txt(dx + dw - 14, ct, "success line (95 %)", 10, "#555", "end")
txt(dx + 12, ct + 26, "block on", 10.5, "#555"); txt(dx + 12, ct + 39, "goal (%)", 10.5, "#555")
rpoly([(t0, cb), (t0 + 120, cb - 16), (t0 + 250, cb - 30), (t0 + 380, cb - 36), (t0 + 560, cb - 28)], R, 1.8)
rpoly([(t0, cb), (t0 + 100, cb - 22), (t0 + 200, cb - 38), (t0 + 300, cb - 52)], C, 1.8)
note(dx + 10, dy + dh - 8, "click = move the time cursor (C follows) · hover a chunk → its plan in C · window → that path in C")
arrow(f"M{cur},{dy + 44} C{cur},{dy + 20} {cx0 + 200},{cy0 + 330} {cx0 + 200},{cy0 + 312}")
add('</svg>')
OUT.write_text("\n".join(o))
print("wrote", OUT)
