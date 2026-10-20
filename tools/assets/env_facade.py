"""Painters for Lagos tenement facades: plaster, windows, shutters, sign boards, balconies' shadows, stains.

Everything is drawn on a `Sheet` in *pixel* coordinates; `Facade` converts metres (x from the left of the facade,
y up from the ground) to pixels so building layouts are written in game units."""
from __future__ import annotations

import numpy as np

from tex_env import PAL, Sheet, fit_px, gblur, noise2, scuffs, speckle, srgb, stencil, text_mask, weather


def plaster_sheet(w: int, h: int, seed: int, tone, peel_tone=0x9d978c, damp: float = 0.55, grime: float = 0.5, patchy: float = 0.5) -> Sheet:
    """Painted render: blotches, fine grain, peeling patches showing the cement/old paint beneath, rising damp."""
    rng = np.random.default_rng(seed)
    base = noise2(w, h, seed, fx=3, fy=4, octaves=4, beta=2.4)
    mid = noise2(w, h, seed + 1, fx=14, fy=18, octaves=5, beta=1.6)
    fine = gblur(rng.random((h, w)), 0.6)
    fine = (fine - fine.mean()) / (fine.std() + 1e-9)
    t = srgb(tone)
    v = 0.95 + 0.14 * (base - 0.5) + 0.06 * (mid - 0.5) + 0.02 * fine
    s = Sheet(w, h)
    s.rgb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    s.hgt = 0.5 + 0.08 * (mid - 0.5) + 0.01 * fine
    s.rough = np.full((h, w), 0.9)
    # peeling patches
    pn = noise2(w, h, seed + 2, fx=5, fy=6, octaves=6, beta=1.3)
    peel = np.clip((pn - (0.80 - 0.1 * patchy)) * 14, 0, 1)
    edge = np.clip(1 - np.abs(pn - (0.80 - 0.1 * patchy)) / 0.012, 0, 1)
    s.comp(peel_tone, peel * 0.92, height=-0.18, rough=0.95)
    s.comp(0xf3ecdc, edge * 0.35 * (1 - peel), height=0.12)
    # rising damp and grime
    ys = (np.arange(h)[:, None] + 0.5) / h
    dn = noise2(w, h, seed + 3, fx=8, fy=6, octaves=5, beta=1.8)
    damp_m = np.clip(1 - (1 - ys) / (0.07 + 0.06 * dn), 0, 1) ** 1.2
    s.comp(0x4b4034, damp_m * damp * 0.65)
    gn = noise2(w, h, seed + 4, fx=4, fy=5, octaves=5, beta=2.0)
    s.comp(0x3a3128, np.clip(gn * 1.5 - 0.8, 0, 1) * grime * 0.5)
    return s


def tint_block(s: Sheet, x0, y0, x1, y1, color, a: float = 1.0, height: float = 0.0, rough=None):
    with s.paint(height=height, rough=rough, box=(x0 - 2, y0 - 2, x1 + 2, y1 + 2)) as d:
        d.rect((x0, y0, x1, y1), color, a=a)


def bevel_light(s: Sheet, x0, y0, x1, y1, size: float = 3.0, raised: bool = True, k: float = 0.35):
    """Add light on the top/left edges and dark on bottom/right (or inverse) of a rectangle: cheap relief."""
    hi, lo = (0xfff4d8, 0x1a140e) if raised else (0x1a140e, 0xfff4d8)
    with s.paint(box=(x0 - 2, y0 - 2, x1 + 2, y1 + 2)) as d:
        d.rect((x0, y0, x1, y0 + size), hi, a=k)
        d.rect((x0, y0, x0 + size, y1), hi, a=k * 0.8)
        d.rect((x0, y1 - size, x1, y1), lo, a=k)
        d.rect((x1 - size, y0, x1, y1), lo, a=k * 0.8)


class Facade:
    def __init__(self, width_m: float, height_m: float, density: float, seed: int, tone, peel_tone=0x9d978c, **plaster_kw):
        self.W, self.H, self.D = width_m, height_m, density
        self.w, self.h = int(round(width_m * density)), int(round(height_m * density))
        self.seed = seed
        self.rng = np.random.default_rng(seed + 999)
        self.s = plaster_sheet(self.w, self.h, seed, tone, peel_tone, **plaster_kw)
        self.rects: dict[str, tuple] = {}

    # ---- coordinates
    def X(self, x):
        return x * self.D

    def Y(self, y):
        return self.h - 1 - y * self.D

    def R(self, x0, y0, x1, y1):
        """metre rect (x0,y0 bottom-left; x1,y1 top-right) -> pixel rect (left, top, right, bottom)"""
        return (self.X(x0), self.Y(y1), self.X(x1), self.Y(y0))

    # ---- decoration passes
    def band(self, y0, y1, color, a=0.95, trim=True):
        """Horizontal painted band (floor slab / cornice line) with a light top and a shadow underneath."""
        x0, t, x1, b = self.R(0, y0, self.W, y1)
        with self.s.paint(height=0.12, rough=0.85, box=(x0, t - 2, x1, b + 2)) as d:
            d.rect((x0, t, x1, b), color, a=a)
        if trim:
            with self.s.paint(box=(x0, t - 2, x1, b + 4)) as d:
                d.rect((x0, t, x1, t + 1.6), 0xfff6e0, a=0.5)
                d.rect((x0, b - 2.4, x1, b + 1.0), 0x1a140e, a=0.35)

    def pipe(self, x, y0, y1, r=0.025, color=0x6e6a64):
        xx0, t, xx1, b = self.R(x - r, y0, x + r, y1)
        with self.s.paint(height=0.35, rough=0.5, metal=0.4, box=(xx0 - 2, t, xx1 + 6, b)) as d:
            d.rect((xx0, t, xx1, b), color)
        with self.s.paint(box=(xx0 - 2, t, xx1 + 6, b)) as d:
            d.rect((xx0, t, xx0 + max(1.0, (xx1 - xx0) * 0.3), b), 0xe9e4da, a=0.4)
            d.rect((xx1, t, xx1 + 3, b), 0x1a140e, a=0.25)  # drop shadow on the wall

    def cable(self, pts_m, color=0x1a1a1c, width=1.6, sag=0.04):
        """Polyline cable in metre coords drawn as a sagging line with its shadow."""
        pts = [(self.X(x), self.Y(y)) for x, y in pts_m]
        xs_, ys_ = [p[0] for p in pts], [p[1] for p in pts]
        with self.s.paint(box=(min(xs_) - 4, min(ys_) - 4, max(xs_) + 6, max(ys_) + 8)) as d:
            d.line([(x + 2, y + 3) for x, y in pts], 0x1a140e, width * 1.5, a=0.18)
            d.line(pts, color, width, a=0.95)

    def stain_streaks(self, x0, x1, y_top, length=0.5, n=4, color=0x3a3128, a=0.4):
        rng = self.rng
        with self.s.paint(box=(self.X(x0) - 8, self.Y(y_top) - 2, self.X(x1) + 8, self.Y(y_top) + length * self.D * 1.1 + 4)) as d:
            for _ in range(n):
                x = self.X(rng.uniform(x0, x1))
                y = self.Y(y_top)
                ln = rng.uniform(0.4, 1.0) * length * self.D
                wd = rng.uniform(2, 6)
                for k in range(6):
                    d.rect((x - wd / 2 + rng.normal(0, 0.4), y + ln * k / 6, x + wd / 2, y + ln * (k + 1) / 6), color, a=a * (1 - k / 7))

    # ---- windows
    def window(self, cx, ybot, w, h, style="louver", frame=0xeee6d2, seed=0, bars=False, curtain=None, open_amount=0.0, sill=True, lintel=True):
        s, rng = self.s, np.random.default_rng(self.seed + seed * 7 + 5)
        x0, t, x1, b = self.R(cx - w / 2, ybot, cx + w / 2, ybot + h)
        fw = max(2.5, self.D * 0.035)
        # recess (height down) + dark reveal
        WB = (x0 - fw - 6, t - fw - 10, x1 + fw + 6, b + fw + 14)
        with s.paint(height=-0.45, rough=0.9, box=WB) as d:
            d.rect((x0 - fw, t - fw, x1 + fw, b + fw), 0x2a221a)
        # frame
        with s.paint(height=0.2, rough=0.6, box=WB) as d:
            d.rect((x0 - fw, t - fw, x1 + fw, b + fw), frame)
        gx0, gy0, gx1, gy1 = x0 + fw, t + fw, x1 - fw, b - fw
        if style == "louver":
            with s.paint(height=-0.2, box=WB) as d:
                d.rect((gx0, gy0, gx1, gy1), 0x1c1914)
            n = max(4, int((gy1 - gy0) / (self.D * 0.055)))
            sl = (gy1 - gy0) / n
            with s.paint(height=0.25, rough=0.5, box=WB) as d:
                for k in range(n):
                    y = gy0 + k * sl
                    if rng.random() < 0.06:
                        continue  # missing blade
                    d.rect((gx0, y + sl * 0.15, gx1, y + sl * 0.78), 0x9fb7c4 if k % 3 else 0xb4c8d2, a=0.95)
                    d.rect((gx0, y + sl * 0.78, gx1, y + sl * 0.98), 0x2a2a2c, a=0.9)
        elif style == "dark":
            with s.paint(height=-0.2, box=WB) as d:
                d.rect((gx0, gy0, gx1, gy1), 0x151210)
            # interior: a dim room lit from one side (soft gradient, not a flat patch)
            iw, ih = int(gx1 - gx0), int(gy1 - gy0)
            if iw > 2 and ih > 2:
                yy, xx = np.mgrid[0:ih, 0:iw]
                lit = np.clip(1.0 - np.hypot((xx - iw * rng.uniform(0.2, 0.8)) / iw, (yy - ih * 0.85) / ih * 0.9) * 1.7, 0, 1) ** 1.5
                col = np.array(srgb(int(rng.choice([0x8a5a30, 0x7a6a50, 0x5a6a7a]))))
                a_ = np.zeros((s.h, s.w))
                a_[int(gy0) : int(gy0) + ih, int(gx0) : int(gx0) + iw] = lit * 0.75
                s.comp(col[None, None, :], a_)
            if curtain is not None:
                with s.paint(height=0.1, rough=0.95, box=WB) as d:
                    cw = (gx1 - gx0) * rng.uniform(0.35, 0.55)
                    for k in range(5):
                        d.rect((gx0 + k * cw / 5, gy0, gx0 + (k + 1) * cw / 5 - 0.5, gy1 - (gy1 - gy0) * 0.1), curtain, a=0.9 if k % 2 else 0.7)
        elif style == "glass":
            gh = gy1 - gy0
            ys = (np.arange(s.h)[:, None] - gy0) / max(gh, 1)
            with s.paint(height=-0.1, rough=0.2, box=WB) as d:
                d.rect((gx0, gy0, gx1, gy1), 0x7fa4c2)
                d.poly([(gx0, gy1), (gx0 + (gx1 - gx0) * 0.55, gy0), (gx0 + (gx1 - gx0) * 0.8, gy0), (gx0 + (gx1 - gx0) * 0.25, gy1)], 0xcfe4f0, a=0.4)
            with s.paint(height=0.2, box=WB) as d:
                d.rect((gx0 + (gx1 - gx0) / 2 - 1.2, gy0, gx0 + (gx1 - gx0) / 2 + 1.2, gy1), frame)
                d.rect((gx0, gy0 + (gy1 - gy0) * 0.35, gx1, gy0 + (gy1 - gy0) * 0.35 + 2.4), frame)
        # interior AO (top & left shadow)
        with s.paint(box=WB) as d:
            d.rect((gx0, gy0, gx1, gy0 + (gy1 - gy0) * 0.16), 0x0e0a06, a=0.45)
            d.rect((gx0, gy0, gx0 + (gx1 - gx0) * 0.1, gy1), 0x0e0a06, a=0.3)
        if bars:
            with s.paint(height=0.4, rough=0.5, metal=0.5, box=WB) as d:
                nb = max(3, int((gx1 - gx0) / (self.D * 0.07)))
                for k in range(nb + 1):
                    x = gx0 + (gx1 - gx0) * k / nb
                    d.line([(x, gy0 - 1), (x, gy1 + 1)], 0x2e2c2a, 1.7)
                for yy in (0.33, 0.66):
                    d.line([(gx0 - 1, gy0 + (gy1 - gy0) * yy), (gx1 + 1, gy0 + (gy1 - gy0) * yy)], 0x2e2c2a, 1.7)
        if sill:
            with s.paint(height=0.35, rough=0.8, box=WB) as d:
                d.rect((x0 - fw - 3, b + fw - 1, x1 + fw + 3, b + fw + 4.5), 0xe4dcc8)
            with s.paint(box=WB) as d:
                d.rect((x0 - fw - 3, b + fw + 4.5, x1 + fw + 3, b + fw + 8), 0x1a140e, a=0.35)
            # drip stain below the sill
            self.stain_streaks(cx - w * 0.4, cx + w * 0.4, ybot - 0.04, 0.35, 3, 0x40362a, 0.28)
        if lintel:
            with s.paint(height=0.3, rough=0.8, box=WB) as d:
                d.rect((x0 - fw - 3, t - fw - 5.5, x1 + fw + 3, t - fw + 0.5), 0xe4dcc8)
            with s.paint(box=WB) as d:
                d.rect((x0 - fw - 3, t - fw + 0.5, x1 + fw + 3, t - fw + 6), 0x1a140e, a=0.4)

    # ---- ground-floor shop pieces
    def shutter(self, x0m, x1m, y0m, y1m, tone=0x7c8a86, seed=0, open_frac=0.0, rust=0.5, graffiti: str | None = None):
        """Roll-down corrugated shutter (vertical ribs), rusty bottom, handle plate."""
        s = self.s
        x0, t, x1, b = self.R(x0m, y0m, x1m, y1m)
        w, h = int(x1 - x0), int(b - t)
        if w < 4 or h < 4:
            return
        rng = np.random.default_rng(self.seed + seed)
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
        pitch = max(5.0, self.D * 0.055)
        rib = 0.5 + 0.5 * np.sin(xs / pitch * 2 * np.pi)
        slat = np.clip(1 - np.abs(((ys / (self.D * 0.045)) % 1.0) - 0.5) * 0, 0, 1)
        rows = (ys / (self.D * 0.05)) % 1.0
        n1 = noise2(w, h, seed + 11, fx=6, fy=6, octaves=5, beta=1.8)
        n2 = noise2(w, h, seed + 12, fx=4, fy=3, octaves=5, beta=1.8)
        base = srgb(tone)[None, None, :] * (0.70 + 0.45 * rib + 0.1 * (n1 - 0.5))[..., None]
        base = base * (1 - 0.35 * (rows < 0.09)[..., None])  # horizontal slat joints
        rustm = np.clip(n2 * 1.8 - (1.35 - rust), 0, 1) * np.clip(ys / h * 1.8, 0, 1) ** 1.0
        base = base * (1 - rustm[..., None] * 0.8) + srgb(0x7a3f1c)[None, None, :] * rustm[..., None] * 0.8
        # bottom lip + top box
        lip = np.clip((ys - (h - self.D * 0.05)) / (self.D * 0.05), 0, 1)
        base = base * (1 - 0.4 * lip[..., None])
        sh = Sheet(w, h)
        sh.rgb = np.clip(base, 0, 1)
        sh.hgt = 0.5 + 0.35 * rib - 0.15 * (rows < 0.09) + 0.15 * rustm
        sh.rough = 0.55 + 0.4 * rustm
        sh.metal = 0.5 * (1 - rustm)
        if graffiti:
            with sh.paint(height=0.04, rough=0.7) as d:
                d.text((w * 0.5, h * 0.4), graffiti, h * 0.36, 0xf1ead2, "black", "cm", squeeze=0.9, rot=3, a=0.85)
        with sh.paint(height=0.4, rough=0.4, metal=0.7) as d:
            d.rect((w * 0.46, h * 0.88, w * 0.54, h * 0.93), 0x4a4a4c)
        # dents
        for _ in range(3):
            cx, cy = rng.uniform(0.15, 0.85) * w, rng.uniform(0.3, 0.8) * h
            with sh.paint(height=-0.12) as d:
                d.ellipse((cx - 10, cy - 7, cx + 10, cy + 7), 0x000000, a=0.0)
        self.s.paste(sh, int(x0), int(t))
        bevel_light(self.s, x0, t, x1, b, size=2.0, raised=False, k=0.35)

    def sign(self, cx, cy, w, h, text, bg, fg, border=None, style="black", seed=0, sub: str | None = None, squeeze=0.88, wobble=0.012, rot=0.0):
        """Hand-painted sign board with a lettered border and slightly uneven letters."""
        s = self.s
        x0, t, x1, b = self.R(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
        pw, ph = int(x1 - x0), int(b - t)
        board = Sheet(pw, ph, bg, rough=0.6)
        n = noise2(pw, ph, seed + 3, fx=6, fy=3, octaves=4, beta=2.0)
        board.rgb = board.rgb * (0.88 + 0.22 * n[..., None])
        # weathering: dirt rising and flaking at the corners
        board.comp(0x3a3128, np.clip(noise2(pw, ph, seed + 4, fx=5, fy=3) * 1.5 - 0.8, 0, 1) * 0.4)
        bw = max(2.5, ph * 0.07)
        with board.paint(height=0.1, rough=0.55) as d:
            d.rect((0, 0, pw, bw), border or fg, a=1.0)
            d.rect((0, ph - bw, pw, ph), border or fg, a=1.0)
            d.rect((0, 0, bw, ph), border or fg, a=1.0)
            d.rect((pw - bw, 0, pw, ph), border or fg, a=1.0)
        ty = ph * (0.46 if sub else 0.52)
        tpx = fit_px(text, pw * 0.86, ph * (0.50 if sub else 0.62), style, squeeze, 0.02)
        with board.paint(height=0.14, rough=0.5) as d:
            d.text((pw * 0.5 + 2.0, ty + 2.0), text, tpx, 0x1a1410, style, "cm", squeeze=squeeze, spacing=0.02, wobble=wobble, seed=seed, a=0.45)
            d.text((pw * 0.5, ty), text, tpx, fg, style, "cm", squeeze=squeeze, spacing=0.02, wobble=wobble, seed=seed)
            if sub:
                spx = fit_px(sub, pw * 0.8, ph * 0.2, "bold", 0.9, 0.02)
                d.text((pw * 0.5, ph * 0.82), sub, spx, border or fg, "bold", "cm", squeeze=0.9, spacing=0.02)
        # rust/age flecks along the border
        speckle(board, seed + 8, amount=0.5, dark=0x2a1c12, light=0xe8dcc0, density=0.01)
        # board hangs slightly crooked and casts a shadow
        s.paste(board, int(x0), int(t))
        with s.paint(box=(x0, b - 1, x1 + 4, b + 6)) as d:
            d.rect((x0 + 3, b, x1 + 3, b + 5), 0x1a140e, a=0.3)
        bevel_light(s, x0, t, x1, b, size=2.0, raised=True, k=0.3)

    def door(self, x0m, x1m, y1m, color=0x4d3a2a, seed=0):
        s = self.s
        x0, t, x1, b = self.R(x0m, 0.0, x1m, y1m)
        with s.paint(height=-0.3, box=(x0 - 4, t - 4, x1 + 4, b + 1)) as d:
            d.rect((x0 - 3, t - 3, x1 + 3, b), 0x1a140e)
        w, h = int(x1 - x0), int(b - t)
        dr = Sheet(w, h, color, rough=0.7)
        n = noise2(w, h, seed + 1, fx=2, fy=8, octaves=4, beta=1.4)
        dr.rgb = dr.rgb * (0.8 + 0.4 * n[..., None])
        with dr.paint(height=0.1) as d:
            for k in range(1, 5):
                d.line([(w * k / 5, 0), (w * k / 5, h)], 0x1a1410, 1.5, a=0.7)
            d.ellipse((w * 0.78, h * 0.5, w * 0.78 + 6, h * 0.5 + 6), 0xd8c070)
        s.paste(dr, int(x0), int(t))
        bevel_light(s, x0, t, x1, b, size=2.5, raised=False, k=0.4)

    def finish(self, grime_down: float = 0.35):
        """Final global weathering: soot under the roof line + dark ground contact."""
        s = self.s
        ys = (np.arange(s.h)[:, None] + 0.5) / s.h
        n = noise2(s.w, s.h, self.seed + 77, fx=7, fy=2, octaves=5, beta=1.6)
        s.comp(0x2a221a, np.clip(1 - ys / 0.05, 0, 1) * (0.3 + 0.5 * n))
        s.comp(0x1a140e, np.clip((ys - 0.97) / 0.03, 0, 1) * 0.5)
        speckle(s, self.seed + 79, amount=0.35, density=0.004)
        scuffs(s, self.seed + 80, n=18, color=0xe8dfc8, a=0.18)
        return s
