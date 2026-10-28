"""Writes slides/assets/sketch.svg: the low-fidelity design sketch of the LagLens layout (4 linked views).
Each view is a plain box with a schematic of its idiom (a few placeholder marks, not data) and short
notes on what it encodes. Purple = interaction and linking, numbered as the steps on slide 7."""
import math, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "slides" / "assets" / "sketch.svg"
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


add('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 660" font-family="Helvetica, Arial, sans-serif" font-size="13">')
add(f'<defs>'
    f'<marker id="arrI" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="{IA}" stroke-width="1.6" stroke-linecap="round"/></marker>'
    f'<marker id="arrK" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="{INK}" stroke-width="1.6" stroke-linecap="round"/></marker>'
    '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="6" stroke="#999" stroke-width="1.2"/></pattern></defs>')
add('<rect width="1200" height="660" fill="#fff"/>')

ax, ay, aw, ah = 8, 56, 512, 252   # A
bx, by, bw, bh = 8, 316, 512, 336  # B
cx0, cy0, cw0, ch0 = 528, 56, 664, 318  # C
dx, dy, dw, dh = 528, 382, 664, 270  # D

# ---- header: baseline and candidate pickers
rbox(8, 8, 1184, 40)
txt(22, 36, "LagLens", 20, weight="bold")
rbox(640, 15, 228, 26, R, 2.2)
txt(652, 34, "Baseline:  Sync, d=4, h=4  ▾", 12.5)
txt(882, 34, "⇄", 15)
rbox(906, 15, 236, 26, C, 2.2)
txt(918, 34, f'<tspan fill="{C}">Candidate</tspan>:  Inpaint, d=4, h=4  ▾', 12.5)
txt(1166, 34, "?", 14)
badge(612, 28, 1)
note(596, 33, "pick the two schedules to compare (or click a point in A)", "end")

# ---- A latency response
rbox(ax, ay, aw, ah)
txt(ax + 12, ay + 24, "A · Latency response", 15, weight="bold")
qx = ax + 12
for lab, wd in [("Success", 66), ("Idle", 44), ("Outdated", 74), ("Discontinuity", 102)]:
    rbox(qx, ay + 34, wd, 24, fill="#444" if lab == "Success" else None)
    txt(qx + wd / 2, ay + 51, lab, 12.5, "#fff" if lab == "Success" else INK, "middle")
    qx += wd + 6
badge(qx + 12, ay + 46, 2)
note(qx + 28, ay + 51, "= y-axis of A, B")
# one chart, drawn as a schematic
x0, y0, W, H = ax + 48, ay + 92, 210, 112
rl(x0, y0 + H, x0, y0 - 4, INK, 1.5); rl(x0, y0 + H, x0 + W + 6, y0 + H, INK, 1.5)
txt(x0 + W / 2, y0 - 8, "h = 8", 12.5, anchor="middle")
txt(x0 - 6, y0 + 6, "y", 12.5, GREY, "end")
txt(x0 + W, y0 + H + 18, "latency d →", 12.5, GREY, "end")
X = lambda t: x0 + 10 + t * (W - 20)
Y = lambda v: y0 + H - 8 - v * (H - 16)
lines = {"sync": ([0, .35, .7, 1], [.95, .7, .35, .12], None),
         "naive": ([0, .35, .7], [.95, .8, .55], "7 4"),
         "inpaint": ([0, .35, .7, 1], [.95, .88, .8, .66], "2 4")}
for s, (ts, vs, dash) in lines.items():
    curve([(X(t), Y(v)) for t, v in zip(ts, vs)], "#444", 1.8, dash)
    txt(X(ts[-1]) + (16 if ts[-1] == 1 else 8), Y(vs[-1]) + 5, s, 12, "#444")
rcirc(X(1), Y(.66), 7, C, 2.2); txt(X(1), Y(.66) - 13, "candidate", 12, "#9a6a00", "middle")
rcirc(X(1), Y(.12), 7, R, 2.2); txt(X(1), Y(.12) - 13, "baseline", 12, R, "middle")
rl(X(.7), Y(.35) - 12, X(.7), Y(.35) + 12, GREY, 1.2, over=0)
# small multiples hint
for i, h in enumerate([6, 4, 2]):
    sx, sy = ax + 352 + i * 54, ay + 104
    rl(sx, sy + 46, sx, sy, GREY, 1.2); rl(sx, sy + 46, sx + 44, sy + 46, GREY, 1.2)
    curve([(sx + 4, sy + 8), (sx + 20, sy + 18 + i * 4), (sx + 40, sy + 28 + i * 5)], GREY, 1.3)
    txt(sx + 22, sy - 6, f"h={h}", 11.5, GREY, "middle")
txt(ax + 340, ay + 172, "same chart per horizon h", 12, "#555")
txt(ax + 340, ay + 190, "one line per strategy", 12, "#555")
txt(ax + 340, ay + 208, "| = 95 % interval", 12, "#555")
note(ax + 12, ay + ah - 10, "click a point = candidate · shift-click = baseline · hover = value")

# ---- B paired seed table
rbox(bx, by, bw, bh)
txt(bx + 12, by + 24, "B · Paired seed table", 15, weight="bold")
txt(bx + 12, by + 46, "row = one start state (50) · column = one schedule (52)", 12, "#555")
gx0, cs, rh = bx + 132, 18, 15
ncol, Rc, Cc = 9, 2, 7
txt(gx0 + ncol * cs / 2, by + 68, "schedules → (sync | naive | inpaint)", 11.5, GREY, "middle")
txt(gx0 + Rc * cs + cs / 2, by + 84, "baseline", 11.5, R, "middle"); txt(gx0 + Cc * cs + cs / 2, by + 84, "candidate", 11.5, "#9a6a00", "middle")
txt(bx + 352, by + 84, "baseline vs candidate", 12, "#555")
bands = [("only baseline ok", (1, 0)), ("only candidate ok", (0, 1)), ("both ok", (1, 1))]
y = by + 92
rows = []
for name, (rok, cok) in bands:
    txt(bx + 12, y + 20, name, 12)
    rl(bx + 120, y + 2, bx + 120, y + 2 * rh + 2, GREY, 1.2, over=0)
    for r in range(2):
        for c in range(ncol):
            ok = rok if c == Rc else cok if c == Cc else random.random() < 0.5
            rbox(gx0 + c * cs, y, cs - 3, rh - 3, "#999", 1, fill="#888" if ok else None)
        rv, cv = (random.uniform(80, 120), random.uniform(10, 40)) if name != "only candidate ok" else (random.uniform(110, 130), random.uniform(15, 35))
        yy = y + rh / 2 - 1
        rl(bx + 350 + cv, yy, bx + 350 + rv, yy, "#999", 1.2, over=0)
        rcirc(bx + 350 + rv, yy, 3.2, R, 1, fill=R); rcirc(bx + 350 + cv, yy, 3.2, C, 1, fill=C)
        rows.append(y)
        y += rh
    y += 12
txt(gx0 + ncol * cs / 2, y + 2, "⋮", 14, GREY, "middle")
for c, col in [(Rc, R), (Cc, C)]:
    rbox(gx0 + c * cs - 2, by + 88, cs + 1, y - by - 98, col, 2)
txt(bx + 12, y + 24, "filled cell = success · rows grouped by where the two disagree", 12, "#555")
# brush over dumbbells (band 2), clicked row (band 1)
rbox(bx + 344, rows[2] - 5, 150, 2 * rh + 6, IA, 1.5, dash="5 4")
badge(bx + 494, rows[2] - 8, 3)
rbox(gx0 - 6, rows[1] - 3, 376, rh + 2, IA, 1.8)
badge(gx0 + ncol * cs + 16, rows[1] + 4, 4)
note(bx + 14, y + 60, "③ drag over rows = select those start states → A recomputes")
note(bx + 14, y + 84, "④ click a row → C and D replay that start state")
curve([(bx + 470, rows[2] - 6), (bx + 486, by + 60), (bx + 470, ay + ah - 4)], IA, 1.5, "5 4", True)
curve([(gx0 + 372, rows[1] + 4), (bx + 518, rows[1] - 30), (cx0 + 16, cy0 + 196)], IA, 1.5, "5 4", True)
curve([(gx0 + 372, rows[1] + 4), (bx + 518, rows[1] + 60), (dx + 30, dy + 100)], IA, 1.5, "5 4", True)

# ---- C workspace replay
rbox(cx0, cy0, cw0, ch0)
txt(cx0 + 12, cy0 + 24, "C · Workspace replay", 15, weight="bold")
txt(cx0 + 200, cy0 + 24, "the table seen from above · both schedules side by side, same moment", 12, "#555")
for k, (lab, col, good) in enumerate([("Baseline: standing still, waiting for a new plan", R, False),
                                      ("Candidate: moving, its plan is k steps old", C, True)]):
    x0 = cx0 + 20 + k * 324
    txt(x0, cy0 + 48, lab, 12.5, "#222" if not good else "#9a6a00")
    rbox(x0, cy0 + 56, 300, 178, "#999", 1.3)
    tee(x0 + 222, cy0 + 120, 0, 0.85, col=GREY, dash="4 3")
    txt(x0 + 272, cy0 + 100, "goal", 12, GREY)
    bxx, byy = (x0 + 196, cy0 + 132) if good else (x0 + 236, cy0 + 112)
    tee(bxx, byy, 22 if good else 58, 0.85, fill=LIGHT)
    px, py = x0 + 92, cy0 + 160
    curve([(x0 + 30, cy0 + 204), (x0 + 60, cy0 + 184), (px - 10, py + 6)], col, 2.6)
    curve([(px + 12, py + 2), (x0 + 120, cy0 + 194), (x0 + 156, cy0 + 206)], col, 1.6, "5 5")
    if good:
        rcirc(px, py, 11, col, 2.2, fill=col, op=.3)
        # what the policy saw: block and pusher in the camera picture of the current chunk
        tee(x0 + 150, cy0 + 136, 5, 0.85, col=col, w=1.6, dash="2 4")
        rcirc(px - 36, py + 24, 11, col, 1.6, dash="2 4")
        curve([(px - 26, py + 17), (px - 12, py + 7)], col, 1.5, None, True)
        txt(x0 + 10, cy0 + 226, "dotted = what the policy saw (N px ago)", 12, "#9a6a00")
        badge(x0 + 286, cy0 + 70, 5)
    else:
        rcirc(px, py, 11, col, 2.2, fill=col)
        curve([(px, py), (px - 30, py - 50)], SEAM, 2.6)
        rcirc(px - 30, py - 50, 4, SEAM, 1.5, fill="#fff")
        txt(x0 + 12, py - 62, "jump to the new plan", 12, SEAM)
        txt(x0 + 10, cy0 + 226, "filled = not moving", 12, "#555")
txt(cx0 + 20, cy0 + 254, "grey T = block · dashed T = goal · ● = pusher · solid = moves done · dashed = rest of the plan", 12, "#555")
rbox(cx0 + 20, cy0 + 268, 50, 22, sw=1.3)
txt(cx0 + 30, cy0 + 284, "▶ play", 12)
rl(cx0 + 84, cy0 + 279, cx0 + 332, cy0 + 279, INK, 2.4)
rcirc(cx0 + 322, cy0 + 279, 7, INK, 1.4, fill=INK)
note(cx0 + 346, cy0 + 284, "← → step · hover a point = when planned")
txt(cx0 + 20, cy0 + 308, "why: waiting? old picture? jump?", 12, "#555")

# ---- D execution timeline
rbox(dx, dy, dw, dh)
txt(dx + 12, dy + 24, "D · Execution timeline", 15, weight="bold")
txt(dx + dw - 12, dy + 24, f"motion: grey = moving, <tspan fill='{SEAM}'>red = jump</tspan> · time →", 12, "#555", "end")
t0, Wd = dx + 130, 62
for k, (lab, col) in enumerate([("baseline", R), ("candidate", C)]):
    yy = dy + 58 + k * 66
    txt(dx + 12, yy + 30, lab, 13, "#222" if k == 0 else "#9a6a00", weight="bold")
    # the current chunk's 16 planned moves: skipped while thinking · executed · discarded
    skip, used = (1, 4) if k == 0 else (5, 4)
    for jj in range(16):
        f = "#cfcfd6" if jj < skip else (("#555" if k == 0 else col) if jj < skip + used else "#fff")
        add(f'<rect x="{dx + 12 + jj * 6}" y="{yy + 37}" width="5" height="7" fill="{f}" stroke="#b4b4bc" stroke-width=".6"/>')
    txt(t0 - 8, yy, "motion", 11.5, GREY, "end")
    txt(t0 - 8, yy + 14, "think", 11.5, GREY, "end"); txt(t0 - 8, yy + 34, "act", 11.5, GREY, "end")
    # motion track: grey movement per step (0 while standing still), red bar = jump at each switch
    moving = (lambda t: (t // Wd) % 2 == 1) if k == 0 else (lambda t: True)
    pts = [(t0 + t, yy - (3 + 2.5 * math.sin(t / 9 + k) if moving(t) else 0)) for t in range(0, 8 * Wd - 6, 3)]
    add(f'<polygon points="{t0},{yy} ' + " ".join(f"{a:.1f},{b:.1f}" for a, b in pts) + f' {t0 + 8 * Wd - 6},{yy}" fill="#b4b4bc"/>')
    rl(t0, yy, t0 + 8 * Wd - 6, yy, GREY, 1)
    if k == 0:  # sync: think, then act; standing still while thinking
        for c in range(4):
            x = t0 + c * 2 * Wd
            rbox(x, yy + 4, Wd - 6, 12, "#555", 1.2, fill="#ccc")
            rbox(x, yy + 22, Wd - 6, 16, "#999", 1.2, fill="url(#hatch)")
            rbox(x + Wd, yy + 22, Wd - 6, 16, "#555", 1.3, fill="#bbb")
            if c:
                add(f'<rect x="{x + Wd - 1.5}" y="{yy - 5}" width="3" height="5" fill="{SEAM}"/>')
    else:  # async: thinks while acting
        for c in range(8):
            x = t0 + c * Wd
            rbox(x, yy + 4, Wd - 6, 12, col, 1.2, fill="#fbe3b0")
            rbox(x, yy + 22, Wd - 6, 16, col, 1.3, fill="#f3c66a")
            if c:
                jh = [0, 6, 4, 12, 5, 7, 4, 9][c]
                add(f'<rect x="{x - 1.5}" y="{yy - jh}" width="3" height="{jh}" fill="{SEAM}"/>')
# provenance of the current chunk in C: ○ camera picture → think → act
pc, yy = 3, dy + 124
rbox(t0 + (pc - 1) * Wd - 1, yy + 2, Wd - 4, 16, INK, 2.6)
rbox(t0 + pc * Wd - 1, yy + 20, Wd - 4, 20, INK, 2.6)
rcirc(t0 + (pc - 1) * Wd - 1, yy + 10, 5, INK, 1.8, fill="#fff")
curve([(t0 + pc * Wd - 8, yy + 12), (t0 + pc * Wd + 10, yy + 22)], INK, 1.6, None, True)
badge(t0 + 10, dy + 177, 6)
txt(t0 + 26, dy + 182, "current chunk: ○ camera picture → think → act", 12.5)
# cursor and brush window
cur = t0 + (pc + 0.5) * Wd
rl(cur, dy + 36, cur, dy + 166, INK, 1.6, over=0); rl(cur, dy + 190, cur, dy + 250, INK, 1.6, over=0)
rbox(t0 + 6 * Wd - 6, dy + 34, 2 * Wd + 6, 132, IA, 1.5, dash="5 4")
note(t0 + 7 * Wd, dy + 182, "drag = time window", "middle")
# block-on-goal coverage
cb, ct = dy + 242, dy + 204
rl(t0, cb, dx + dw - 14, cb, GREY, 1.2)
rl(t0, ct, dx + dw - 14, ct, GREY, 1.1, "6 5")
txt(dx + dw - 14, ct - 4, "success line", 11.5, GREY, "end")
txt(dx + 12, ct + 26, "block on", 12, "#555"); txt(dx + 12, ct + 42, "goal", 12, "#555")
curve([(t0, cb), (t0 + 150, cb - 12), (t0 + 320, cb - 20), (t0 + 480, cb - 17)], R, 2)
curve([(t0, cb), (t0 + 120, cb - 16), (t0 + 260, cb - 28), (t0 + 330, cb - 36)], C, 2)
note(dx + 14, dy + dh - 8, "click = move time cursor (C follows) · hover a chunk = its plan in C · window = that path in C", size=12)
curve([(cur, dy + 36), (cur - 4, dy + 14), (cx0 + 322, cy0 + 290)], IA, 1.5, "5 4", True)
add('</svg>')
OUT.write_text("\n".join(o))
print("wrote", OUT, f"{OUT.stat().st_size // 1024} KB")
