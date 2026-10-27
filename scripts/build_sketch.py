"""Writes slides/assets/sketch.svg: the mid-fidelity wireframe of the LagLens layout
(4 linked views). Purple text/arrows = interaction and linking."""
import math, random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "slides" / "assets" / "sketch.svg"
IA = "#6a3d9a"  # interaction annotations
S = {"sync": "#0072B2", "naive": "#D55E00", "inpaint": "#009E73"}
R, C, SEAM = "#222", "#E69F00", "#c2185b"
random.seed(3)
o = []
add = o.append


def panel(x, y, w, h, title):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#fff" stroke="#555"/>')
    add(f'<text x="{x+10}" y="{y+19}" font-weight="bold" font-size="13">{title}</text>')


def note(x, y, txt, anchor="start"):
    add(f'<text x="{x}" y="{y}" font-size="11" fill="{IA}" text-anchor="{anchor}">{txt}</text>')


add('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 660" font-family="Helvetica, Arial, sans-serif" font-size="12">')
add(f'<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{IA}"/></marker>'
    '<pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="4" stroke="#aaa" stroke-width="1.2"/></pattern></defs>')
add('<rect width="1200" height="660" fill="#f4f4f6"/>')
# header
add('<rect x="8" y="8" width="1184" height="38" rx="5" fill="#fff" stroke="#555"/>')
add('<text x="20" y="33" font-size="18" font-weight="bold">LagLens</text>')
add(f'<rect x="640" y="15" width="220" height="24" rx="12" fill="#fff" stroke="{R}" stroke-width="2"/><text x="652" y="31">● R baseline  Sync · d=4 · h=4 ▾</text>')
add('<text x="872" y="32" font-size="15">⇄</text>')
add(f'<rect x="895" y="15" width="220" height="24" rx="12" fill="#fff" stroke="{C}" stroke-width="2"/><text x="907" y="31"><tspan fill="{C}">●</tspan> C compare  Inpaint · d=4 · h=4 ▾</text>')
add('<text x="1125" y="31" font-size="11">? ↺</text>')
note(630, 31, "pick / swap R and C anywhere", "end")

# ---- A latency response
ax, ay, aw, ah = 8, 54, 512, 236
panel(ax, ay, aw, ah, "A · Latency Response   (T1)")
add(f'<text x="{ax+10}" y="{ay+38}" font-size="11">[<tspan font-weight="bold">Success</tspan> | Idle | Staleness | Discontinuity]    <tspan fill="{S["sync"]}">●</tspan> Sync <tspan fill="{S["naive"]}">■</tspan> Naive <tspan fill="{S["inpaint"]}">◆</tspan> Inpaint</text>')
vals = {8: {"sync": [72, 62, 70, 44, 40], "naive": [72, 68, 62, 62, 46], "inpaint": [72, 58, 66, 60, 40]},
        6: {"sync": [48, 42, 32, 26, 30], "naive": [48, 44, 58, 56, 32], "inpaint": [48, 48, 50, 58, 26]},
        4: {"sync": [28, 24, 22, 14, 8], "naive": [28, 12, 34, 38], "inpaint": [28, 40, 46, 60]},
        2: {"sync": [42, 16, 8, 0, 0], "naive": [42, 36, 8], "inpaint": [42, 26, 26]}}
D = [0, 1, 2, 4, 6]
pw, ph, px0, py0 = 112, 126, ax + 34, ay + 58
for i, h in enumerate([8, 6, 4, 2]):
    x0 = px0 + i * (pw + 8)
    add(f'<rect x="{x0}" y="{py0}" width="{pw}" height="{ph}" fill="#fafafb" stroke="#ddd"/>')
    add(f'<text x="{x0+pw/2}" y="{py0-4}" font-size="10.5" font-weight="bold" text-anchor="middle">h = {h}</text>')
    for k, d in enumerate(D):
        add(f'<text x="{x0+8+d*16}" y="{py0+ph+12}" font-size="9" text-anchor="middle" fill="#666">{d}</text>')
    for s, col in S.items():
        v = vals[h][s]
        pts = [(x0 + 8 + D[k] * 16 + {"sync": -3, "naive": 0, "inpaint": 3}[s], py0 + ph - v[k] / 100 * (ph - 10) - 4) for k in range(len(v))]
        add(f'<polyline points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}" fill="none" stroke="{col}" stroke-width="1.8"/>')
        for a, b in pts:
            add(f'<line x1="{a:.1f}" x2="{a:.1f}" y1="{b-9:.1f}" y2="{b+9:.1f}" stroke="{col}" stroke-opacity=".35"/>')
            add(f'<circle cx="{a:.1f}" cy="{b:.1f}" r="2.4" fill="{col}"/>')
    if h == 4:
        sx, sy = x0 + 8 + 4 * 16 - 3, py0 + ph - 14 / 100 * (ph - 10) - 4
        cx_, cy_ = x0 + 8 + 4 * 16 + 3, py0 + ph - 60 / 100 * (ph - 10) - 4
        add(f'<circle cx="{sx}" cy="{sy}" r="6" fill="none" stroke="{R}" stroke-width="2"/><text x="{sx-10}" y="{sy+4}" font-size="10" font-weight="bold" text-anchor="end">R</text>')
        add(f'<circle cx="{cx_}" cy="{cy_}" r="6" fill="none" stroke="{C}" stroke-width="2"/><text x="{cx_}" y="{cy_-9}" font-size="10" font-weight="bold" text-anchor="middle" fill="#9a6a00">C</text>')
add(f'<text x="{ax+aw-10}" y="{py0+ph+26}" font-size="10" text-anchor="end" fill="#555">x = latency d (100 ms steps) · y = metric (shared) · │ = 95 % interval</text>')
note(ax + 10, ay + ah - 8, "question bar sets A and B · click mark = C · shift-click = R · hover = value &amp; Δ vs R")

# ---- B paired seed table
bx, by, bw, bh = 8, 298, 512, 354
panel(bx, by, bw, bh, "B · Paired Seed Table   (T2, T4)")
add(f'<text x="{bx+10}" y="{by+37}" font-size="11">right part: attribute of the question chosen in A (no own controls)</text>')
mx, my, cw, rh = bx + 40, by + 70, 6, 5.2
groups = [("re", 1), ("sync", 20), ("naive", 13), ("inpaint", 13)]
x = mx
for g, n in groups:
    col = "#bbb" if g == "re" else S[g]
    add(f'<rect x="{x}" y="{my-18}" width="{n*cw-1}" height="3" fill="{col}"/>')
    if g != "re":
        add(f'<text x="{x+n*cw/2}" y="{my-22}" font-size="10" font-weight="bold" text-anchor="middle">{dict(sync="Sync",naive="Naive",inpaint="Inpaint")[g]}</text>')
    x += n * cw + 4
bands = [("R ✓ → C ✗", 3, 0.75), ("R ✗ → C ✓", 12, 0.3), ("both ✓", 9, 0.85), ("both ✗", 16, 0.15)]
y = my
Rcol, Ccol = 1 + 14, 1 + 20 + 13 + 9
for name, n, p in bands:
    add(f'<rect x="{bx+4}" y="{y}" width="{bw-8}" height="11" rx="2" fill="#ececf0"/><text x="{bx+8}" y="{y+9}" font-size="9" font-weight="bold">{name}  {n}</text>')
    y += 12
    for r in range(n):
        x = mx
        ci = 0
        for g, cnt in groups:
            for c in range(cnt):
                ok = random.random() < p
                if ci == Rcol: ok = name in ("R ✓ → C ✗", "both ✓")
                if ci == Ccol: ok = name in ("R ✗ → C ✓", "both ✓")
                fill = (R if ci == Rcol else C if ci == Ccol else "#8e8e98") if ok else "#efeff2"
                add(f'<rect x="{x}" y="{y:.1f}" width="{cw-1}" height="{rh-0.8:.1f}" fill="{fill}"/>')
                x += cw; ci += 1
            x += 4
        # dumbbell
        d0x = bx + 360
        rv = random.uniform(40, 130) if name != "R ✗ → C ✓" else random.uniform(120, 145)
        cv = random.uniform(5, 40)
        add(f'<line x1="{d0x+rv:.0f}" x2="{d0x+cv:.0f}" y1="{y+rh/2:.1f}" y2="{y+rh/2:.1f}" stroke="#b4b4bc"/><circle cx="{d0x+rv:.0f}" cy="{y+rh/2:.1f}" r="2" fill="{R}"/><circle cx="{d0x+cv:.0f}" cy="{y+rh/2:.1f}" r="2" fill="{C}"/>')
        y += rh
add(f'<text x="{bx+360}" y="{my-22}" font-size="10" font-weight="bold">● R → <tspan fill="{C}">●</tspan> C (same seed)</text>')
add(f'<rect x="{bx+352}" y="{my+80}" width="150" height="60" fill="none" stroke="{IA}" stroke-dasharray="4 3"/>')
note(bx + 505, my + 154, "drag = select seeds", "end"); note(bx + 505, my + 167, "→ A recomputes on them", "end")
note(bx + 10, by + bh - 8, "click cell = open episode (column → C) · click header = C · click band = select its seeds")
add(f'<path d="M{bx+352},{my+110} C{bx+300},{by-20} {bx+300},{ay+120} {bx+260},{ay+120}" fill="none" stroke="{IA}" stroke-dasharray="4 3" marker-end="url(#arr)"/>')

# ---- C workspace replay
cx0, cy0, cwid, cht = 528, 54, 664, 330
panel(cx0, cy0, cwid, cht, "C · Workspace Replay   (T3)")
for k, (lab, col, good) in enumerate([("R · Sync d4 h4 ✗ · idle: waiting for inference", R, False), ("C · Inpaint d4 h4 ✓ · acting, 4 steps stale · thinking", C, True)]):
    x0 = cx0 + 24 + k * 320
    add(f'<text x="{x0}" y="{cy0+40}" font-size="10.5" font-weight="bold" fill="{"#222" if k == 0 else "#9a6a00"}">{lab}</text>')
    add(f'<rect x="{x0}" y="{cy0+48}" width="300" height="230" rx="4" fill="#fafafb" stroke="#ccc"/>')
    # goal and block
    gx, gy = x0 + 150, cy0 + 160
    add(f'<path d="M{gx-40},{gy-30} l80,0 l0,18 l-30,0 l0,60 l-20,0 l0,-60 l-30,0 z" fill="#e9e9ee" stroke="#777" stroke-dasharray="4 3" transform="rotate(45 {gx} {gy})"/>')
    bxx, byy = gx + (10 if good else 40), gy + (5 if good else -30)
    add(f'<path d="M{bxx-40},{byy-30} l80,0 l0,18 l-30,0 l0,60 l-20,0 l0,-60 l-30,0 z" fill="#a9adb5" stroke="#777" transform="rotate({40 if good else 75} {bxx} {byy})"/>')
    # fan
    pts = [(gx - 80 + j * 7, gy + 70 - math.sin(j / 4) * 30) for j in range(16)]
    add(f'<polyline points="{" ".join(f"{a:.0f},{b:.0f}" for a, b in pts[:5])}" fill="none" stroke="{col}" stroke-width="2.4"/>')
    add(f'<polyline points="{" ".join(f"{a:.0f},{b:.0f}" for a, b in pts[4:])}" fill="none" stroke="{col}" stroke-width="1.2" stroke-dasharray="4 3"/>')
    for j, (a, b) in enumerate(pts):
        add(f'<circle cx="{a:.0f}" cy="{b:.0f}" r="2.6" fill="{col if j < 5 else "#fff"}" stroke="{col}"/>')
    add(f'<circle cx="{pts[0][0]:.0f}" cy="{pts[0][1]:.0f}" r="10" fill="{col}" fill-opacity=".25" stroke="{col}" stroke-width="2"/>')
    if good:
        add(f'<polyline points="{" ".join(f"{a+10:.0f},{b-14:.0f}" for a, b in pts[3:])}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="1 3"/>')
    else:
        add(f'<line x1="{pts[0][0]:.0f}" y1="{pts[0][1]:.0f}" x2="{pts[0][0]+40:.0f}" y2="{pts[0][1]-40:.0f}" stroke="{SEAM}" stroke-width="2.4"/><circle cx="{pts[0][0]+40:.0f}" cy="{pts[0][1]-40:.0f}" r="3.5" fill="#fff" stroke="{SEAM}"/><text x="{pts[0][0]+46:.0f}" y="{pts[0][1]-40:.0f}" font-size="10" font-weight="bold" fill="{SEAM}">discontinuity 12 px</text>')
add(f'<text x="{cx0+24}" y="{cy0+300}" font-size="10" fill="#555">— executed part of chunk   ┄ thrown away   ⋯ next chunk computing   <tspan fill="{SEAM}">━ boundary discontinuity</tspan></text>')
add(f'<rect x="{cx0+24}" y="{cy0+308}" width="40" height="14" rx="3" fill="#fff" stroke="#555"/><text x="{cx0+30}" y="{cy0+319}" font-size="10">▶ play</text><line x1="{cx0+74}" x2="{cx0+600}" y1="{cy0+315}" y2="{cy0+315}" stroke="#333" stroke-width="3"/><circle cx="{cx0+330}" cy="{cy0+315}" r="6" fill="#333"/>')
note(cx0 + cwid - 10, cy0 + 19, "hover planned point = when planned / executed · click = jump · ← → space", "end")

# ---- D execution timeline
dx, dy, dw, dh = 528, 392, 664, 260
panel(dx, dy, dw, dh, "D · Execution Timeline   (T3)")
add(f'<text x="{dx+10}" y="{dy+36}" font-size="10.5"><tspan font-weight="bold">think</tspan> = inference · <tspan font-weight="bold">act</tspan> = chunk executed (hatched = idle) · <tspan fill="{SEAM}">lollipop = boundary discontinuity</tspan> · sync alternates, async overlaps</text>')
t0, U = dx + 70, 4.6
for k, (lab, col, kind) in enumerate([("R ✗", R, "sync"), ("C ✓", C, "async")]):
    y0 = dy + 50 + k * 52
    add(f'<text x="{dx+10}" y="{y0+32}" font-weight="bold" fill="{"#222" if k == 0 else "#9a6a00"}">{lab}</text><text x="{t0-4}" y="{y0+18}" font-size="9" text-anchor="end" fill="#777">think</text><text x="{t0-4}" y="{y0+33}" font-size="9" text-anchor="end" fill="#777">act</text>')
    if kind == "sync":
        t = 0
        while t + 8 <= 125:
            add(f'<rect x="{t0+t*U}" y="{y0+12}" width="{4*U-1}" height="5" fill="{col}" fill-opacity=".45"/><rect x="{t0+t*U}" y="{y0+22}" width="{4*U-1}" height="12" fill="url(#hatch)"/><rect x="{t0+(t+4)*U}" y="{y0+22}" width="{4*U-1}" height="12" fill="{col}" fill-opacity="{.85 if (t//8)%2 == 0 else .5}"/>')
            add(f'<line x1="{t0+(t+4)*U}" x2="{t0+(t+4)*U}" y1="{y0+10}" y2="{y0+6}" stroke="{SEAM}"/>')
            t += 8
    else:
        for c in range(31):
            add(f'<rect x="{t0+c*4*U}" y="{y0+22}" width="{4*U-1}" height="12" fill="{col}" fill-opacity="{.85 if c%2 == 0 else .5}"/><rect x="{t0+c*4*U}" y="{y0+12}" width="{4*U-1}" height="5" fill="{col}" fill-opacity=".45"/>')
            if c:
                add(f'<line x1="{t0+c*4*U}" x2="{t0+c*4*U}" y1="{y0+10}" y2="{y0+10-random.uniform(1, 6):.1f}" stroke="{SEAM}"/>')
cy_top, cy_bot = dy + 160, dy + 236
add(f'<line x1="{t0}" x2="{dx+dw-12}" y1="{cy_bot}" y2="{cy_bot}" stroke="#999"/><line x1="{t0}" x2="{dx+dw-12}" y1="{cy_top+6}" y2="{cy_top+6}" stroke="#999" stroke-dasharray="4 3"/><text x="{dx+dw-12}" y="{cy_top+2}" font-size="9" text-anchor="end" fill="#555">success 95 %</text>')
add(f'<text x="{dx+10}" y="{cy_top+20}" font-size="10">coverage</text>')
add(f'<polyline points="{t0},{cy_bot} {t0+120},{cy_bot-20} {t0+250},{cy_bot-45} {t0+380},{cy_bot-50} {t0+560},{cy_bot-40}" fill="none" stroke="{R}" stroke-width="1.8"/>')
add(f'<polyline points="{t0},{cy_bot} {t0+100},{cy_bot-30} {t0+200},{cy_bot-55} {t0+300},{cy_bot-70}" fill="none" stroke="{C}" stroke-width="1.8"/>')
add(f'<rect x="{t0+200}" y="{dy+44}" width="80" height="{cy_bot-dy-44}" fill="{IA}" fill-opacity=".06" stroke="{IA}" stroke-dasharray="4 3"/><line x1="{t0+240}" x2="{t0+240}" y1="{dy+44}" y2="{cy_bot}" stroke="#1d1d1f"/>')
note(dx + 10, dy + dh - 6, "drag = time window (→ path highlighted in C) · hover chunk = its plan in C · click = cursor")
add(f'<path d="M{t0+240},{dy+44} C{t0+240},{dy+10} {cx0+200},{cy0+290} {cx0+160},{cy0+250}" fill="none" stroke="{IA}" stroke-dasharray="4 3" marker-end="url(#arr)"/>')
add('</svg>')
OUT.write_text("\n".join(o))
print("wrote", OUT)
