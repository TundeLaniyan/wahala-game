"""Balogun Market surface painters: interlock paver floor atlas, ankara / aso-oke prints, produce heaps, raffia.

Everything is numpy + PIL + scipy and seeded (deterministic). Sheets come from `tex_env.Sheet`."""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from tex_env import Sheet, burlap_sheet, gblur, noise2, scuffs, speckle, srgb  # noqa: E402

# Vivid Lagos market palette (wax prints, plastic ware, paint).
MKT = dict(
    red=0xd8262f,
    orange=0xf2731d,
    yellow=0xffc21a,
    green=0x12a150,
    teal=0x14a3a0,
    blue=0x1f5fd6,
    navy=0x15306e,
    purple=0x7b2fbe,
    pink=0xe8458b,
    cream=0xf6ecd2,
    black=0x1a1716,
    white=0xf8f4ea,
)

ANKARA_SETS = [
    (MKT["blue"], MKT["yellow"], MKT["orange"], MKT["white"]),
    (MKT["red"], MKT["yellow"], MKT["green"], MKT["black"]),
    (MKT["purple"], MKT["orange"], MKT["teal"], MKT["yellow"]),
    (MKT["green"], MKT["pink"], MKT["yellow"], MKT["white"]),
    (MKT["navy"], MKT["red"], MKT["cream"], MKT["orange"]),
    (MKT["orange"], MKT["navy"], MKT["white"], MKT["green"]),
    (MKT["teal"], MKT["red"], MKT["yellow"], MKT["black"]),
    (MKT["pink"], MKT["navy"], MKT["yellow"], MKT["green"]),
]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ============================================================================ fabrics


def ankara_sheet(w: int, h: int, seed: int = 0, colors=None, cell: float = 32.0, kind: int | None = None) -> Sheet:
    """Wax-print style pattern: a coloured ground with repeating motifs (rings, leaves, diamonds) in 2-3 accent
    colours. `cell` = motif pitch in pixels."""
    rng = np.random.default_rng(seed)
    bg, c1, c2, c3 = colors or ANKARA_SETS[seed % len(ANKARA_SETS)]
    kind = int(rng.integers(0, 4)) if kind is None else kind
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64) + 0.5
    s = Sheet(w, h, bg, rough=0.88)
    # half-drop repeat
    row = np.floor(ys / cell)
    u = (xs + (row % 2) * cell * 0.5) / cell
    v = ys / cell
    fu, fv = u - np.floor(u) - 0.5, v - np.floor(v) - 0.5
    r = np.hypot(fu, fv)
    if kind == 0:  # concentric rings with a dot
        m1 = smoothstep(0.05, 0.03, np.abs(r - 0.36))
        m2 = smoothstep(0.045, 0.025, np.abs(r - 0.22))
        m3 = smoothstep(0.11, 0.08, r)
    elif kind == 1:  # leaf / almond shapes on a diagonal grid
        a = (fu + fv) / 1.414
        b = (fu - fv) / 1.414
        leaf = (a / 0.42) ** 2 + (b / 0.16) ** 2
        m1 = smoothstep(1.05, 0.85, leaf)
        m2 = smoothstep(0.3, 0.18, leaf) * 1.0
        m3 = smoothstep(0.07, 0.05, np.hypot(fu - 0.38, fv + 0.38))
    elif kind == 2:  # diamonds with a cross bar
        d = np.abs(fu) + np.abs(fv)
        m1 = smoothstep(0.03, 0.0, np.abs(d - 0.38) - 0.04)
        m2 = smoothstep(0.17, 0.14, d)
        m3 = smoothstep(0.03, 0.01, np.minimum(np.abs(fu), np.abs(fv))) * (d > 0.44)
    else:  # sunburst / petals
        ang = np.arctan2(fv, fu)
        petal = r - (0.26 + 0.1 * np.cos(ang * 8))
        m1 = smoothstep(0.03, 0.0, petal)
        m2 = smoothstep(0.1, 0.08, r)
        m3 = smoothstep(0.035, 0.015, np.abs(r - 0.45))
    s.comp(c1, m1, height=0.05)
    s.comp(c2, m2, height=0.05)
    s.comp(c3, m3 * 0.95, height=0.03)
    # wax crackle + slight print misregistration speckle + weave + fold shading
    crack = noise2(w, h, seed + 5, fx=10, fy=10, octaves=6, beta=1.2)
    s.comp(0xffffff, np.clip(1 - np.abs(crack - 0.5) / 0.012, 0, 1) * 0.12)
    weave = 0.96 + 0.04 * np.sin(xs * 1.7) * np.sin(ys * 1.7)
    n = noise2(w, h, seed + 6, fx=3, fy=3, octaves=4, beta=2.2)
    s.rgb = s.rgb * (weave * (0.9 + 0.16 * n))[..., None]
    s.hgt = 0.5 + 0.04 * (weave - 0.96) * 10 + 0.05 * n
    return s


def asooke_sheet(w: int, h: int, seed: int = 0, colors=None) -> Sheet:
    """Hand-woven strip cloth: warp stripes of varying width with a metallic-ish thread."""
    rng = np.random.default_rng(seed)
    cols = colors or [MKT["purple"], MKT["yellow"], MKT["teal"], MKT["red"], MKT["cream"]]
    s = Sheet(w, h, cols[0], rough=0.8)
    x = 0
    k = 0
    while x < w:
        sw = int(rng.integers(3, 14))
        c = cols[k % len(cols)] if rng.random() > 0.2 else cols[0]
        s.rgb[:, x : x + sw] = srgb(c)
        if rng.random() < 0.3:
            s.rgb[:, x + sw // 2 : x + sw // 2 + 1] = srgb(0xe8d27a)
            s.rough[:, x + sw // 2 : x + sw // 2 + 1] = 0.4
        x += sw
        k += 1
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    weave = 0.9 + 0.1 * (np.sin(ys * 2.2) * 0.5 + 0.5)
    s.rgb = s.rgb * weave[..., None]
    s.hgt = 0.5 + 0.1 * weave
    return s


def fold_shade(s: Sheet, pitch: float, axis: int = 0, k: float = 0.22) -> Sheet:
    """Soft repeated fold shading (folded cloth bolts seen side-on)."""
    ys, xs = np.mgrid[0 : s.h, 0 : s.w].astype(np.float64)
    t = (ys if axis == 0 else xs) / pitch
    f = 0.5 + 0.5 * np.cos(2 * np.pi * t)
    s.rgb = s.rgb * (1 - k + k * f)[..., None]
    s.hgt = s.hgt + 0.3 * (f - 0.5)
    return s


# ============================================================================ produce, raffia, plastic


def produce_sheet(w: int, h: int, seed: int = 0, kind: str = "tomato") -> Sheet:
    """A heap of small round produce seen from above: shaded discs packed with dark gaps and glossy highlights."""
    rng = np.random.default_rng(seed)
    pal = {
        "tomato": [0xd8261f, 0xe8401f, 0xc41a1a, 0xf05a28, 0xb81818],
        "pepper": [0xe8301c, 0xf58a1a, 0xffc21a, 0xd8261f, 0x3a9a2a],
        "onion": [0xb5483f, 0xc85e4a, 0xa63c3a, 0xd9a07a, 0xc06a58],
        "orange": [0xf28a1a, 0xf5a020, 0x9ac02a, 0xe87a12, 0xf2b32a],
    }[kind]
    gap = {"tomato": 0x6a1a10, "pepper": 0x6a2a10, "onion": 0x5a2a20, "orange": 0x7a4a10}[kind]
    s = Sheet(w, h, gap, rough=0.6)
    s.hgt[:] = 0.1
    rad = {"tomato": 13.0, "pepper": 9.0, "onion": 12.0, "orange": 14.0}[kind]
    n = int(w * h / (rad * rad * 1.3))
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    zbuf = np.full((h, w), -1.0)
    rgb = s.rgb.copy()
    hh = s.hgt.copy()
    for i in range(n):
        cx, cy = rng.uniform(0, w), rng.uniform(0, h)
        r = rad * rng.uniform(0.8, 1.2)
        x0, x1 = int(max(0, cx - r - 1)), int(min(w, cx + r + 2))
        y0, y1 = int(max(0, cy - r - 1)), int(min(h, cy + r + 2))
        if x1 <= x0 or y1 <= y0:
            continue
        dx = (xs[y0:y1, x0:x1] - cx) / r
        dy = (ys[y0:y1, x0:x1] - cy) / (r * (0.85 if kind == "pepper" else 1.0))
        d2 = dx * dx + dy * dy
        inside = d2 < 1
        z = np.sqrt(np.clip(1 - d2, 0, 1)) + rng.uniform(0, 0.6)
        upd = inside & (z > zbuf[y0:y1, x0:x1])
        col = srgb(pal[int(rng.integers(0, len(pal)))])
        shade = 0.55 + 0.55 * np.sqrt(np.clip(1 - d2, 0, 1)) - 0.25 * np.clip(dx + dy, -1, 1) * 0.5
        spec = np.clip(1 - np.hypot(dx + 0.35, dy + 0.4) / 0.28, 0, 1) ** 2
        c = col[None, None, :] * shade[..., None] + spec[..., None] * 0.55
        sub = rgb[y0:y1, x0:x1]
        sub[upd] = c[upd]
        hsub = hh[y0:y1, x0:x1]
        hsub[upd] = 0.3 + 0.6 * np.sqrt(np.clip(1 - d2, 0, 1))[upd]
        zbuf[y0:y1, x0:x1][upd] = z[upd]
        # stalk
        if kind in ("tomato", "pepper") and rng.random() < 0.7:
            st = np.hypot(dx + 0.05, dy + 0.1) < 0.18
            sub[st & upd] = srgb(0x2f6a1c)
    s.rgb = np.clip(rgb, 0, 1)
    s.hgt = hh
    s.rough = np.where(zbuf > 0, 0.35, 0.9)
    return s


def raffia_sheet(w: int, h: int, seed: int = 0, tone=0xc99b52, band=None) -> Sheet:
    """Woven raffia / cane basket: tight diagonal weave + optional dyed bands."""
    s = burlap_sheet(w, h, seed, tone=tone, weave=4.0, dirt=0.25)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    diag = 0.5 + 0.5 * np.sin((xs + ys) * 0.7) * np.sin((xs - ys) * 0.7)
    s.rgb = s.rgb * (0.85 + 0.25 * diag)[..., None]
    s.hgt = s.hgt * 0.6 + 0.4 * diag
    if band:
        for (y0f, y1f, c) in band:
            m = ((ys / h >= y0f) & (ys / h < y1f)).astype(float)
            s.comp(c, m * 0.85)
    return s


def yam_sheet(w: int, h: int, seed: int = 0) -> Sheet:
    """Rough brown yam bark with root hairs and a few pale cut ends."""
    n = noise2(w, h, seed, fx=6, fy=14, octaves=6, beta=1.4)
    f = noise2(w, h, seed + 1, fx=40, fy=40, octaves=3, beta=1.0)
    s = Sheet(w, h, 0x6b4a2e, rough=0.95)
    s.rgb = s.rgb * (0.7 + 0.5 * n[..., None]) * (0.9 + 0.2 * f[..., None])
    s.hgt = 0.4 + 0.5 * n
    rng = np.random.default_rng(seed)
    with s.paint(height=0.1) as d:
        for _ in range(int(w * h / 900)):
            x, y = rng.uniform(0, w), rng.uniform(0, h)
            d.line([(x, y), (x + rng.uniform(-6, 6), y + rng.uniform(-6, 6))], 0x3a2616, 1.0, a=0.7)
    speckle(s, seed + 2, amount=0.5, dark=0x2a1a0e, light=0xa88a5a, density=0.01)
    return s


def painted_plaster(w: int, h: int, seed: int, tone, grime: float = 0.35) -> Sheet:
    """Bright painted render (market walls/posts): soft blotches, chips to grey, dirt from the ground."""
    from env_facade import plaster_sheet

    return plaster_sheet(w, h, seed, tone, peel_tone=0xb8b0a2, damp=0.4, grime=grime, patchy=0.1)


# ============================================================================ floor: interlock pavers


def _paver_field(px: int, seed: int, frame: int = 9, sq: int = 5):
    """One tile of basket-weave interlock with a grey soldier-course frame.
    Returns (albedo HxWx3, height HxW, rough HxW)."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:px, 0:px].astype(np.float64) + 0.5
    reds = [0xb35c3e, 0xbb6542, 0xa9553a, 0xc26f48, 0xad5a40, 0xb8613f]
    greys = [0x8d8780, 0x7c7670, 0x9a948a]
    char = [0x5d5650, 0x6a625a]
    inner = px - 2 * frame
    s = inner / sq
    ix, iy = xs - frame, ys - frame
    alb = np.zeros((px, px, 3))
    hgt = np.zeros((px, px))
    # --- inner basket weave
    ci, cj = np.floor(ix / s), np.floor(iy / s)
    fx, fy = ix / s - ci, iy / s - cj
    horiz = ((ci + cj) % 2) == 0
    half = np.where(horiz, fy >= 0.5, fx >= 0.5).astype(int)
    lx = np.where(horiz, fx, np.where(half == 1, fx - 0.5, fx) * 2)  # local 0..1 along each paver
    ly = np.where(horiz, np.where(half == 1, fy - 0.5, fy) * 2, fy)
    pid = (ci.astype(int) * 7 + cj.astype(int) * 13 + half * 3) % 997
    tone_tab = np.zeros((1000, 3))
    for k in range(1000):
        r = rng.random()
        c = reds[int(rng.integers(0, len(reds)))] if r < 0.93 else (greys[int(rng.integers(0, 3))] if r < 0.99 else char[int(rng.integers(0, 2))])
        tone_tab[k] = srgb(c) * rng.uniform(0.94, 1.04)
    col = tone_tab[pid]
    # distance to the paver edge in pixels (paver is s x s/2)
    pw = np.where(horiz, s, s / 2)
    ph = np.where(horiz, s / 2, s)
    ex = np.minimum(lx, 1 - lx) * pw
    ey = np.minimum(ly, 1 - ly) * ph
    e = np.minimum(ex, ey)
    inside = (ix >= 0) & (iy >= 0) & (ix < inner) & (iy < inner)
    # --- frame: soldier course of grey pavers along each edge
    fd = np.minimum(np.minimum(xs, px - xs), np.minimum(ys, px - ys))  # distance to tile edge
    along = np.where(np.minimum(xs, px - xs) < np.minimum(ys, px - ys), ys, xs)
    seg = np.floor(along / (s * 0.5))
    fe = np.minimum(np.minimum(fd, frame - fd), np.minimum(along / (s * 0.5) - seg, 1 - (along / (s * 0.5) - seg)) * s * 0.5)
    fcol_tab = np.array([srgb(greys[k % 3]) * (0.9 + 0.08 * ((k * 37) % 5) / 4) for k in range(64)])
    fcol = fcol_tab[(seg.astype(int) * 5 + (xs < ys).astype(int) * 11) % 64]
    col = np.where(inside[..., None], col, fcol * 0.95)
    e = np.where(inside, e, fe)
    joint = smoothstep(1.6, 0.4, e)
    bevel = smoothstep(4.0, 1.2, e) * (1 - joint)
    alb = col * (1 - 0.18 * bevel[..., None])
    alb = alb * (1 - joint[..., None]) + srgb(0x5a4a3c)[None, None, :] * joint[..., None]
    hgt = 0.75 - 0.35 * bevel - 0.7 * joint
    # per-paver surface grain (lighter pitted tops)
    grain = noise2(px, px, seed + 3, fx=30, fy=30, octaves=3, beta=1.0)
    alb = alb * (0.93 + 0.12 * grain[..., None])
    rough = 0.82 + 0.1 * joint - 0.05 * grain
    return alb, hgt, rough


def market_floor_atlas(out_dir: str, jpeg, cells: int = 4, px: int = 256, seed: int = 31) -> list[int]:
    """4x4 atlas of distinct interlock-paver tiles (one tile per arena cell): terracotta basket weave framed by a
    grey soldier course (reads as the grid), red-earth dust, a little spilled produce and litter."""
    S = cells * px
    rng = np.random.default_rng(seed)
    alb = np.zeros((S, S, 3))
    hgt = np.zeros((S, S))
    rgh = np.zeros((S, S))
    yy, xx = np.mgrid[0:px, 0:px] / px
    for cy in range(cells):
        for cx in range(cells):
            k = cy * cells + cx
            a, h, r = _paver_field(px, seed + k * 17)
            # red-earth dust drifts (stronger in the joints / low areas), sun bleaching
            dn = noise2(px, px, seed + 100 + k, fx=3, fy=3, octaves=5, beta=2.0)
            dust = np.clip(dn * 1.6 - 0.45, 0, 1) * (0.4 + 0.6 * (1 - h)) * rng.uniform(0.5, 0.9)
            a = a * (1 - 0.55 * dust[..., None]) + srgb(0xcaa47e)[None, None, :] * 0.55 * dust[..., None]
            a = a * 0.86 + srgb(0xc9a07a)[None, None, :] * 0.14  # sun-bleached, dusty overall
            r = np.clip(r + 0.08 * dust, 0, 1)
            # worn traffic path (lighter, smoother) on some tiles
            if rng.random() < 0.5:
                ang = rng.uniform(0, np.pi)
                d = np.abs((xx - 0.5) * np.sin(ang) - (yy - 0.5) * np.cos(ang))
                wear = smoothstep(0.28, 0.0, d) * 0.5
                a = a * (1 + 0.1 * wear[..., None])
                r = np.clip(r - 0.12 * wear, 0, 1)
            # dark damp / oil patch
            if rng.random() < 0.35:
                bx, by, br = rng.random(), rng.random(), rng.uniform(0.08, 0.18)
                blot = smoothstep(br, 0.0, np.hypot(xx - bx, yy - by) + 0.04 * dn)
                a = a * (1 - 0.3 * blot[..., None])
                r = np.clip(r - 0.3 * blot, 0, 1)
            sheet = Sheet(px, px)
            sheet.rgb, sheet.hgt, sheet.rough = a, h, r
            # litter: squashed tomato, pepper, onion skin, paper scrap, leaf, nylon bag corner
            with sheet.paint(height=0.06, rough=0.5) as dr:
                for _ in range(int(rng.integers(0, 4))):
                    kind = int(rng.integers(0, 6))
                    x, y = rng.uniform(20, px - 20), rng.uniform(20, px - 20)
                    if kind == 0:
                        dr.ellipse((x - 5, y - 4, x + 6, y + 4), 0xb81818, a=0.9)
                        dr.ellipse((x - 2, y - 2, x + 1, y), 0xf05a40, a=0.8)
                    elif kind == 1:
                        dr.ellipse((x - 4, y - 3, x + 4, y + 3), 0xf58a1a, a=0.9)
                    elif kind == 2:
                        dr.poly([(x, y), (x + 9, y + 3), (x + 4, y + 8)], 0xe8d2b0, a=0.75)
                    elif kind == 3:
                        dr.poly([(x, y), (x + 12, y + 2), (x + 10, y + 10), (x - 1, y + 8)], 0xf2eee2, a=0.85)
                    elif kind == 4:
                        dr.poly([(x, y), (x + 10, y - 5), (x + 14, y + 1), (x + 4, y + 5)], 0x4a8a2a, a=0.85)
                    else:
                        dr.poly([(x, y), (x + 9, y - 2), (x + 12, y + 7), (x + 2, y + 9)], [0x1f5fd6, 0x111111, 0xd8262f][int(rng.integers(0, 3))], a=0.8)
            speckle(sheet, seed + 300 + k, amount=0.35, dark=0x2e221a, light=0xd8c0a0, density=0.004)
            alb[cy * px : (cy + 1) * px, cx * px : (cx + 1) * px] = sheet.rgb
            hgt[cy * px : (cy + 1) * px, cx * px : (cx + 1) * px] = sheet.hgt
            rgh[cy * px : (cy + 1) * px, cx * px : (cx + 1) * px] = sheet.rough
    hgt = (hgt - hgt.min()) / (np.ptp(hgt) + 1e-9)
    import tex as T

    nrm = T.normal_from_height(hgt, 1.6)
    ao = np.clip(0.55 + 0.45 * hgt, 0, 1)
    orm = np.stack([ao, np.clip(rgh, 0, 1), np.zeros_like(hgt)], axis=-1)
    os.makedirs(out_dir, exist_ok=True)
    return [
        jpeg(np.clip(alb, 0, 1), os.path.join(out_dir, "market_albedo.jpg"), 85),
        jpeg(nrm, os.path.join(out_dir, "market_normal.jpg"), 60),
        jpeg(orm, os.path.join(out_dir, "market_orm.jpg"), 80),
    ]
