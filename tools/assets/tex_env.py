"""Hand-painting toolkit for the environment atlases (numpy + PIL + scipy).

A `Sheet` is a small multi-channel canvas (albedo, height, roughness, metal).  Everything the models show as
"surface detail" -- concrete, wood, rubber, posters, hazard bands, stencils, grime -- is painted here and then
packed into one atlas per model (`Atlas`).  All randomness is seeded so the output is deterministic.
"""
from __future__ import annotations

import os
import sys
from contextlib import contextmanager

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))

import tex as texlib  # noqa: E402
from tex import blur, fbm, srgb  # noqa: E402,F401

# ----------------------------------------------------------------------------- palette (Lagos street)

PAL = dict(
    hazard_yellow=0xf2b705,
    hazard_blue=0x1d5fb4,
    hazard_black=0x16161a,
    concrete=0xa39d92,
    concrete_dark=0x7d776e,
    poster_red=0xd62839,
    poster_yellow=0xffc300,
    poster_green=0x0b8f5c,
    poster_blue=0x1f6fe0,
    poster_pink=0xff4f9a,
    poster_purple=0x7c3aed,
    poster_orange=0xff7f11,
    paper=0xf1ead2,
    wood=0xb88a54,
    rubber=0x1c1c1e,
    steel=0x8b8f94,
    rust=0x8a4b24,
)


def rgb01(c):
    return srgb(c)


# ----------------------------------------------------------------------------- fonts

_FONT_CACHE: dict = {}
_FONTS = {
    "black": ["/usr/share/fonts/opentype/inter/Inter-Black.otf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "bold": ["/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "narrow": ["/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"],
    "serif": ["/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"],
    "mono": ["/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
}


def font(px: int, style: str = "black"):
    key = (px, style)
    if key not in _FONT_CACHE:
        for path in _FONTS.get(style, _FONTS["bold"]):
            if os.path.exists(path):
                _FONT_CACHE[key] = ImageFont.truetype(path, px)
                break
        else:
            _FONT_CACHE[key] = ImageFont.load_default(size=px)
    return _FONT_CACHE[key]


def text_mask(text: str, px: int, style: str = "black", squeeze: float = 1.0, spacing: float = 0.0, wobble: float = 0.0, seed: int = 0) -> Image.Image:
    """Antialiased 'L' mask of text; `squeeze` narrows letters, `wobble` shifts letter baselines (hand-painted sign look)."""
    f = font(px, style)
    rng = np.random.default_rng(seed)
    widths = [f.getlength(ch) + spacing * px for ch in text]
    total = int(sum(widths)) + px
    img = Image.new("L", (total, int(px * 1.5)), 0)
    d = ImageDraw.Draw(img)
    x = px * 0.25
    for ch, wd in zip(text, widths):
        d.text((x, px * 0.12 + (rng.uniform(-wobble, wobble) * px)), ch, font=f, fill=255)
        x += wd
    bbox = img.getbbox()
    if bbox is None:
        return Image.new("L", (1, 1), 0)
    img = img.crop(bbox)
    if squeeze != 1.0:
        img = img.resize((max(1, int(img.width * squeeze)), img.height), Image.LANCZOS)
    return img


def fit_px(text: str, max_w: float, max_h: float, style: str = "black", squeeze: float = 1.0, spacing: float = 0.0) -> float:
    """Largest font size (px) such that the rendered text fits max_w x max_h."""
    m = text_mask(text, 100, style, squeeze, spacing)
    return max(4.0, min(100.0 * max_w / m.width, 100.0 * max_h / m.height))


# ----------------------------------------------------------------------------- noise helpers


def noise2(w: int, h: int, seed: int = 0, fx: float = 8.0, fy: float = 8.0, octaves: int = 5, beta: float = 2.0) -> np.ndarray:
    """Anisotropic value-noise fBm in 0..1: the lowest octave has ~fx x fy cells over the sheet; each octave doubles
    the frequency and scales the amplitude by 2^(-beta/2)."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp = 1.0
    for o in range(octaves):
        gx = max(2, int(round(fx * 2**o)) + 1)
        gy = max(2, int(round(fy * 2**o)) + 1)
        if gx > w * 1.2 and gy > h * 1.2:
            break
        g = rng.random((gy, gx))
        z = ndimage.zoom(g, (h / gy, w / gx), order=3, mode="reflect")
        z = z[:h, :w]
        if z.shape != (h, w):
            z = np.pad(z, ((0, h - z.shape[0]), (0, w - z.shape[1])), mode="edge")
        out += amp * (z - 0.5)
        amp *= 2 ** (-beta / 2)
    lo, hi = out.min(), out.max()
    return (out - lo) / max(hi - lo, 1e-9)


def gblur(a: np.ndarray, s: float) -> np.ndarray:
    return ndimage.gaussian_filter(a, s, mode="nearest")


# ----------------------------------------------------------------------------- Sheet


class Sheet:
    """Multi-channel canvas: albedo (sRGB 0..1), height (0..1), roughness, metal."""

    def __init__(self, w: int, h: int, color=0x888888, rough: float = 0.85, metal: float = 0.0):
        self.w, self.h = w, h
        self.rgb = np.tile(srgb(color), (h, w, 1)).astype(np.float64)
        self.hgt = np.full((h, w), 0.5)
        self.rough = np.full((h, w), rough)
        self.metal = np.full((h, w), metal)

    # --- construction helpers
    @classmethod
    def from_tex(cls, t: texlib.Tex, w: int, h: int, ox: int = 0, oy: int = 0) -> "Sheet":
        s = cls(w, h)
        S = t.albedo.shape[0]
        reps_y = int(np.ceil((h + oy) / S))
        reps_x = int(np.ceil((w + ox) / S))
        tile = lambda a: np.tile(a, (reps_y, reps_x) + (1,) * (a.ndim - 2))[oy : oy + h, ox : ox + w]  # noqa: E731
        s.rgb = tile(t.albedo).copy()
        s.hgt = tile(t.height).copy()
        s.rough = tile(np.broadcast_to(t.rough, t.height.shape)).copy()
        s.metal = tile(np.broadcast_to(np.asarray(t.metal, dtype=np.float64), t.height.shape)).copy()
        return s

    def copy(self) -> "Sheet":
        o = Sheet(self.w, self.h)
        o.rgb, o.hgt, o.rough, o.metal = self.rgb.copy(), self.hgt.copy(), self.rough.copy(), self.metal.copy()
        return o

    def paste(self, other: "Sheet", x: int, y: int, mask: np.ndarray | None = None) -> "Sheet":
        w = min(other.w, self.w - x)
        h = min(other.h, self.h - y)
        if w <= 0 or h <= 0:
            return self
        sl = (slice(y, y + h), slice(x, x + w))
        if mask is None:
            self.rgb[sl], self.hgt[sl], self.rough[sl], self.metal[sl] = other.rgb[:h, :w], other.hgt[:h, :w], other.rough[:h, :w], other.metal[:h, :w]
        else:
            a = mask[:h, :w]
            self.rgb[sl] = self.rgb[sl] * (1 - a[..., None]) + other.rgb[:h, :w] * a[..., None]
            self.hgt[sl] = self.hgt[sl] * (1 - a) + other.hgt[:h, :w] * a
            self.rough[sl] = self.rough[sl] * (1 - a) + other.rough[:h, :w] * a
            self.metal[sl] = self.metal[sl] * (1 - a) + other.metal[:h, :w] * a
        return self

    # --- compositing
    def comp(self, rgb=None, alpha=None, height: float = 0.0, rough: float | None = None, metal: float | None = None) -> "Sheet":
        """Blend colour `rgb` (HxWx3 or colour) through `alpha` (HxW 0..1), adding `height` thickness."""
        a = np.clip(alpha, 0, 1)
        if rgb is not None:
            c = rgb if isinstance(rgb, np.ndarray) and rgb.ndim == 3 else srgb(rgb)[None, None, :]
            self.rgb = self.rgb * (1 - a[..., None]) + c * a[..., None]
        self.hgt = self.hgt + height * a
        if rough is not None:
            self.rough = self.rough * (1 - a) + rough * a
        if metal is not None:
            self.metal = self.metal * (1 - a) + metal * a
        return self

    def mul(self, k) -> "Sheet":
        k = np.asarray(k)
        self.rgb = self.rgb * (k[..., None] if k.ndim == 2 else k)
        return self

    def tint(self, color, amount) -> "Sheet":
        a = np.broadcast_to(np.asarray(amount, dtype=np.float64), (self.h, self.w))
        return self.comp(color, a)

    @contextmanager
    def paint(self, height: float = 0.0, rough: float | None = None, metal: float | None = None, opacity: float = 1.0, ss: int = 3, soften: float = 0.0, box=None):
        """Draw with PIL primitives (coordinates in sheet pixels) onto a transparent layer, then composite.
        `box` = (x0, y0, x1, y1) restricts the (supersampled) layer to that region -- much faster on big sheets."""
        if box is None:
            ox, oy, bw, bh = 0, 0, self.w, self.h
        else:
            ox = int(max(0, np.floor(box[0])))
            oy = int(max(0, np.floor(box[1])))
            bw = int(min(self.w, np.ceil(box[2])) - ox)
            bh = int(min(self.h, np.ceil(box[3])) - oy)
            if bw <= 0 or bh <= 0:
                yield _NullDraw()
                return
        layer = Image.new("RGBA", (bw * ss, bh * ss), (0, 0, 0, 0))
        d = _Draw(layer, ss, ox, oy)
        yield d
        arr = np.asarray(layer).astype(np.float32) / 255.0
        a = arr[..., 3]
        pre = arr[..., :3] * a[..., None]
        a = a.reshape(bh, ss, bw, ss).mean(axis=(1, 3))
        pre = pre.reshape(bh, ss, bw, ss, 3).mean(axis=(1, 3))
        col = pre / np.maximum(a[..., None], 1e-6)
        if soften > 0:
            a = gblur(a, soften)
        if box is not None:
            fa = np.zeros((self.h, self.w))
            fc = np.zeros((self.h, self.w, 3))
            fa[oy : oy + bh, ox : ox + bw] = a
            fc[oy : oy + bh, ox : ox + bw] = col
            a, col = fa, fc
        self.comp(col, a * opacity, height=height, rough=rough, metal=metal)

    def overlay_image(self, img: Image.Image, x: int, y: int, height: float = 0.0, rough: float | None = None, shadow: float = 0.0, opacity: float = 1.0):
        """Alpha-composite a PIL RGBA image at (x, y) (clipped to the sheet); optional soft drop shadow underneath."""
        full = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        full.paste(img, (x, y), img)
        arr = np.asarray(full).astype(np.float64) / 255.0
        a = arr[..., 3]
        if shadow > 0:
            sh = gblur(np.roll(np.roll(a, 2, 0), 1, 1), 1.6) * shadow
            self.rgb = self.rgb * (1 - sh[..., None] * 0.75)
        self.comp(arr[..., :3], a * opacity, height=height, rough=rough)

    def to_mat(self, normal_strength: float = 1.2, jpeg_q: int = 84, nblur: float = 0.0, **kw):
        from env_lib import Mat

        hgt = gblur(self.hgt, nblur) if nblur > 0 else self.hgt
        return Mat(albedo=self.rgb, height=np.clip(hgt, 0, 1) if hgt.max() > hgt.min() else None, rough=self.rough, metal=self.metal, normal_strength=normal_strength, jpeg_q=jpeg_q, **kw)


class _NullDraw:
    def __getattr__(self, name):
        return lambda *a, **k: (0.0, 0.0)


class _Draw:
    """ImageDraw wrapper that scales output-pixel coordinates by the supersampling factor (and shifts by the box origin)."""

    def __init__(self, layer: Image.Image, ss: int, ox: int = 0, oy: int = 0):
        self.layer, self.ss, self.ox, self.oy = layer, ss, ox, oy
        self.d = ImageDraw.Draw(layer)

    def _c(self, v):
        a = np.asarray(v, dtype=np.float64).reshape(-1, 2) - np.array([self.ox, self.oy])
        return [float(x) * self.ss for x in a.reshape(-1)]

    @staticmethod
    def _col(c, a=1.0):
        if isinstance(c, str):
            return c
        s = srgb(c)
        return (int(s[0] * 255), int(s[1] * 255), int(s[2] * 255), int(255 * a))

    def rect(self, xy, fill, a=1.0, r=0):
        x0, y0, x1, y1 = self._c(xy)
        if r > 0:
            self.d.rounded_rectangle([x0, y0, x1, y1], radius=r * self.ss, fill=self._col(fill, a))
        else:
            self.d.rectangle([x0, y0, x1, y1], fill=self._col(fill, a))

    def poly(self, pts, fill, a=1.0):
        self.d.polygon(self._c(pts), fill=self._col(fill, a))

    def ellipse(self, xy, fill, a=1.0):
        self.d.ellipse(self._c(xy), fill=self._col(fill, a))

    def line(self, pts, fill, width=1.0, a=1.0):
        self.d.line(self._c(pts), fill=self._col(fill, a), width=max(1, int(round(width * self.ss))), joint="curve")

    def text(self, xy, s, px, color, style="black", anchor="lm", squeeze=1.0, rot=0.0, a=1.0, spacing=0.0, wobble=0.0, seed=0):
        """Draw text with its anchor ('l|c|r' + 'm|t|b') at xy (output px). Rotation in degrees (counter-clockwise)."""
        m = text_mask(s, int(px * self.ss), style, squeeze, spacing, wobble, seed)
        if rot:
            m = m.rotate(rot, expand=True, resample=Image.BICUBIC)
        x, y = (xy[0] - self.ox) * self.ss, (xy[1] - self.oy) * self.ss
        ax = {"l": 0.0, "c": 0.5, "r": 1.0}[anchor[0]]
        ay = {"t": 0.0, "m": 0.5, "b": 1.0}[anchor[1]]
        pos = (int(x - ax * m.width), int(y - ay * m.height))
        col = Image.new("RGBA", m.size, self._col(color, a))
        alpha = m.point(lambda v: int(v * a))
        self.layer.paste(col, pos, alpha)
        return m.width / self.ss, m.height / self.ss


def tile_x_arr(a: np.ndarray) -> np.ndarray:
    """Make an array horizontally periodic (seamless left/right) by blending with a half-width-shifted copy."""
    w = a.shape[1]
    x = (np.arange(w) + 0.5) / w
    wt = np.sin(np.pi * x) ** 2
    wt = wt.reshape((1, w) + (1,) * (a.ndim - 2))
    return a * wt + np.roll(a, w // 2, axis=1) * (1 - wt)


def tile_x(s: "Sheet") -> "Sheet":
    s.rgb, s.hgt, s.rough, s.metal = (tile_x_arr(a) for a in (s.rgb, s.hgt, s.rough, s.metal))
    return s


# ----------------------------------------------------------------------------- generic surface painters


def concrete_sheet(w: int, h: int, seed: int = 1, tone=0xa39d92, stains: float = 0.45, grit: float = 1.0) -> Sheet:
    """Painted-looking poured concrete: soft blotches, fine grain, a few air pits. Low contrast so decals read."""
    rng = np.random.default_rng(seed)
    base = noise2(w, h, seed, fx=3, fy=3, octaves=4, beta=2.4)
    mid = noise2(w, h, seed + 1, fx=12, fy=12, octaves=5, beta=1.6)
    fine = gblur(rng.random((h, w)), 0.55)
    fine = (fine - fine.mean()) / (fine.std() + 1e-9)
    stain = noise2(w, h, seed + 2, fx=2, fy=3, octaves=4, beta=2.6)
    pits = np.zeros((h, w))
    n = int(w * h * 0.0009 * grit)
    pits[rng.integers(0, h, n), rng.integers(0, w, n)] = rng.uniform(0.4, 1.0, n)
    pits = np.clip(gblur(pits, 0.85) * 5.0, 0, 1)
    t = srgb(tone)
    v = 0.95 + 0.11 * (base - 0.5) + 0.07 * (mid - 0.5) + 0.028 * fine * grit - 0.14 * pits - stains * 0.20 * np.clip(stain - 0.5, 0, 1) * 2
    s = Sheet(w, h)
    s.rgb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    s.hgt = 0.5 + 0.22 * (mid - 0.5) + 0.03 * fine * grit - 0.20 * pits
    s.rough = np.clip(0.9 - 0.12 * pits - 0.03 * fine, 0, 1)
    return s


def weather(s: Sheet, seed: int = 0, ground: float = 0.35, ground_h: float = 0.16, streaks: float = 0.35, top_soot: float = 0.2, edge: float = 0.0, tone_dark=0x3a3128, tile: bool = False):
    """Dirt toward the bottom edge (irregular), vertical rain streaks from the top, soot along the top, edge darkening."""
    h, w = s.h, s.w
    ys = (np.arange(h)[:, None] + 0.5) / h
    n1 = noise2(w, h, seed, fx=9, fy=4, octaves=5)
    n2 = noise2(w, h, seed + 1, fx=3, fy=14, octaves=5, beta=2.2)
    if tile:
        n1, n2 = tile_x_arr(n1), tile_x_arr(n2)
    g = np.clip(1 - (1 - ys) / (ground_h * (0.6 + 0.9 * n1)), 0, 1) ** 1.3
    s.comp(tone_dark, g * ground, rough=0.95)
    st = np.clip(n2 * 1.5 - 0.55, 0, 1) * (0.5 + 0.5 * (1 - ys)) * streaks
    st = gblur(st, 0.7)
    s.comp(tone_dark, st * 0.9)
    top = np.clip(1 - ys / 0.12, 0, 1) * (0.4 + n1) * top_soot
    s.comp(tone_dark, top)
    if edge > 0:
        xs = (np.arange(w)[None, :] + 0.5) / w
        e = np.clip(1 - np.minimum(xs, 1 - xs) / 0.06, 0, 1)
        s.comp(tone_dark, e * edge * (0.4 + n1))
    return s


def speckle(s: Sheet, seed: int = 0, amount: float = 0.5, dark=0x1c1a18, light=0xd8d2c4, density: float = 0.004):
    """Tiny pits and flecks (cheap micro-detail)."""
    rng = np.random.default_rng(seed)
    n = int(s.w * s.h * density)
    ys, xs = rng.integers(0, s.h, n), rng.integers(0, s.w, n)
    a = np.zeros((s.h, s.w))
    a[ys, xs] = rng.uniform(0.4, 1.0, n)
    a = np.clip(gblur(a, 0.7) * 4, 0, 1)
    b = np.zeros((s.h, s.w))
    ys, xs = rng.integers(0, s.h, n // 2), rng.integers(0, s.w, n // 2)
    b[ys, xs] = rng.uniform(0.4, 1.0, n // 2)
    b = np.clip(gblur(b, 0.7) * 4, 0, 1)
    s.comp(dark, a * amount, height=-0.06)
    s.comp(light, b * amount * 0.6, height=0.03)
    return s


def cracks(s: Sheet, seed: int = 0, n: int = 3, length: float = 0.5, width: float = 1.2, color=0x1e1b18, start_edge=None):
    rng = np.random.default_rng(seed)
    with s.paint(height=-0.25, rough=0.95) as d:
        for _ in range(n):
            if start_edge == "top":
                x, y = rng.uniform(0.1, 0.9) * s.w, 0
            elif start_edge == "bottom":
                x, y = rng.uniform(0.1, 0.9) * s.w, s.h
            else:
                x, y = rng.uniform(0.15, 0.85) * s.w, rng.uniform(0.15, 0.85) * s.h
            ang = rng.uniform(0, 2 * np.pi) if start_edge is None else (np.pi / 2 if start_edge == "top" else -np.pi / 2) + rng.uniform(-0.5, 0.5)
            pts = [(x, y)]
            steps = int(length * min(s.w, s.h) / 4)
            for k in range(steps):
                ang += rng.uniform(-0.7, 0.7)
                x += np.cos(ang) * 4
                y += np.sin(ang) * 4
                pts.append((x, y))
                if rng.random() < 0.08:  # branch
                    bx, by, ba = x, y, ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.2)
                    bp = [(bx, by)]
                    for _ in range(rng.integers(3, 8)):
                        ba += rng.uniform(-0.6, 0.6)
                        bx += np.cos(ba) * 3.5
                        by += np.sin(ba) * 3.5
                        bp.append((bx, by))
                    d.line(bp, color, width * 0.7)
            d.line(pts, color, width)


def scuffs(s: Sheet, seed: int = 0, n: int = 14, color=0xcfc9bb, a=0.35, length=(6, 22)):
    """Short light scrape marks."""
    rng = np.random.default_rng(seed)
    with s.paint(height=-0.04, rough=0.8) as d:
        for _ in range(n):
            x, y = rng.uniform(0, s.w), rng.uniform(0, s.h)
            ang = rng.normal(-0.4, 0.4)
            ln = rng.uniform(*length)
            d.line([(x, y), (x + np.cos(ang) * ln, y + np.sin(ang) * ln)], color, rng.uniform(0.6, 1.6), a=a * rng.uniform(0.5, 1.0))


def paint_edge_wear(s: Sheet, mask: np.ndarray, seed: int, color, amount: float = 0.9):
    """Chip a painted region's edges: knock the paint (mask 0..1) back with noise."""
    n = noise2(s.w, s.h, seed, fx=30, fy=30, octaves=6, beta=1.2)
    return np.clip(mask - amount * np.clip(n - 0.55, 0, 1) * 3, 0, 1)


# ----------------------------------------------------------------------------- hazard stripes


def hazard_band(w: int, h: int, c1=PAL["hazard_yellow"], c2=PAL["hazard_blue"], stripe: float = 22.0, angle: float = 45.0, seed: int = 0, wear: float = 0.5, border=True, tile: bool = False) -> tuple[Sheet, np.ndarray]:
    """Diagonal two-colour stripes (hand-painted: slightly irregular, worn). Returns (sheet, coverage mask)."""
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    a = np.radians(angle)
    coord = (xs * np.cos(a) + ys * np.sin(a)) / stripe
    n = noise2(w, h, seed, fx=6, fy=6)
    if tile:
        n = tile_x_arr(n)
    coord = coord + 0.18 * (n - 0.5)
    k = (np.floor(coord) % 2).astype(np.float64)
    s = Sheet(w, h, rough=0.75)
    col = srgb(c1)[None, None, :] * (1 - k[..., None]) + srgb(c2)[None, None, :] * k[..., None]
    mott = noise2(w, h, seed + 2, fx=14, fy=14)
    if tile:
        mott = tile_x_arr(mott)
    s.rgb = col * (0.88 + 0.16 * mott[..., None])
    s.hgt[:] = 0.55
    cov = np.ones((h, w))
    if border:
        edge = np.minimum(np.minimum(ys, h - 1 - ys), 1e9)
        lines = (edge < max(1.5, h * 0.06)).astype(float)
        s.comp(PAL["hazard_black"], gblur(lines, 0.5) * 0.9)
    # wear: knock back to bare concrete
    nn = noise2(w, h, seed + 3, fx=22, fy=10, octaves=6, beta=1.4)
    if tile:
        nn = tile_x_arr(nn)
    cov = np.clip(1 - wear * np.clip(nn - 0.5, 0, 1) * 4.5, 0, 1)
    return s, cov


# ----------------------------------------------------------------------------- posters


_HEADLINES = [("AFRO", "JAM"), ("GRAND", "GOSPEL"), ("WAHALA", "FEST"), ("BUKA", "FEAST"), ("SPIN", "& WIN"), ("DJ KOBO", "LIVE"), ("MEGA", "SALE"), ("FRESH", "JUICE"), ("ROOM", "TO LET"), ("CHAMPS", "FINAL"), ("PURE", "WATER"), ("LAGOS", "NITE"), ("HIGH", "LIFE"), ("TAILOR", "24/7"), ("OWAMBE", "BASH")]
_SUBS = ["SAT 9PM", "FREE ENTRY", "ALL WELCOME", "CALL NOW", "THIS FRIDAY", "LIVE ON STAGE", "BIG DISCOUNT", "OPEN DAILY", "TICKETS AT GATE", "NO BILLS"]


def poster(w: int, h: int, seed: int = 0, kind: str | None = None) -> Image.Image:
    """One painted flyer as an RGBA PIL image (opaque rectangle; tear it with `tear`). Fictional text only."""
    rng = np.random.default_rng(seed)
    cols = [0xd62839, 0xffc300, 0x0b8f5c, 0x1f6fe0, 0xff4f9a, 0x7c3aed, 0xff7f11, 0xf1ead2, 0x14b8a6]
    kind = kind or rng.choice(["concert", "sunburst", "type", "sale", "notice", "stripe"])
    bg = int(cols[rng.integers(len(cols))])
    fg = int(cols[rng.integers(len(cols))])
    if fg == bg:
        fg = 0xf1ead2
    ink = 0x15151a if kind != "notice" else 0x222222
    s = Sheet(w, h)
    s.rgb[:] = srgb(bg)
    if kind == "notice":
        s.rgb[:] = srgb(0xf1ead2) * (0.93 + 0.07 * noise2(w, h, seed, fx=8, fy=8)[..., None])
    ys, xs = np.mgrid[0:h, 0:w]
    with s.paint() as d:
        if kind in ("concert", "sunburst"):
            cx, cy = w * rng.uniform(0.35, 0.65), h * rng.uniform(0.38, 0.5)
            nr = int(rng.integers(8, 18))
            for r in range(nr):
                a0 = 2 * np.pi * r / nr
                a1 = a0 + np.pi / nr
                R = max(w, h) * 1.4
                d.poly([(cx, cy), (cx + R * np.cos(a0), cy + R * np.sin(a0)), (cx + R * np.cos(a1), cy + R * np.sin(a1))], fg, a=0.55)
        if kind == "stripe":
            for k in range(-4, 10):
                d.poly([(k * w / 4, 0), (k * w / 4 + w / 6, 0), (k * w / 4 + w / 6 - h * 0.5, h), (k * w / 4 - h * 0.5, h)], fg, a=0.8)
        if kind in ("concert", "sunburst", "sale"):
            # portrait silhouette: head + shoulders
            px, py = w * rng.uniform(0.3, 0.7), h * 0.52
            skin = int(rng.choice([0x5a3a28, 0x7a4a30, 0x3f2a1e, 0x6b4430]))
            d.ellipse((px - w * 0.2, py + h * 0.1, px + w * 0.2, py + h * 0.55), ink)
            d.ellipse((px - w * 0.115, py - h * 0.13, px + w * 0.115, py + h * 0.13), skin)
            d.ellipse((px - w * 0.125, py - h * 0.17, px + w * 0.125, py - h * 0.02), ink if rng.random() < 0.7 else 0x6a2d12)
    h1, h2 = _HEADLINES[rng.integers(len(_HEADLINES))]
    sub = _SUBS[rng.integers(len(_SUBS))]
    with s.paint(height=0.03) as d:
        if kind == "notice":
            d.text((w / 2, h * 0.14), "NOTICE", h * 0.11, 0xb01020, "black", "cm", squeeze=0.8)
            for k in range(7):
                d.rect((w * 0.12, h * (0.32 + k * 0.09), w * rng.uniform(0.55, 0.88), h * (0.32 + k * 0.09) + max(1.5, h * 0.022)), ink, a=0.7)
            d.text((w / 2, h * 0.9), h2 + " " + h1, h * 0.08, ink, "bold", "cm", squeeze=0.8)
        elif kind == "sale":
            d.rect((0, 0, w, h * 0.3), ink, a=0.92)
            d.text((w / 2, h * 0.15), h1, h * 0.19, fg, "black", "cm", squeeze=0.85)
            d.text((w / 2, h * 0.88), h2, h * 0.2, ink, "black", "cm", squeeze=0.85)
            d.ellipse((w * 0.58, h * 0.52, w * 0.97, h * 0.52 + w * 0.39), 0xffc300)
            d.text((w * 0.775, h * 0.52 + w * 0.195), "50%", w * 0.17, 0xd62839, "black", "cm")
        else:
            d.text((w / 2, h * 0.14), h1, h * 0.2, fg if kind != "type" else ink, "black", "cm", squeeze=0.8, wobble=0.01, seed=seed)
            d.text((w / 2, h * 0.9), h2, h * 0.2, 0xf6f1e0 if bg != 0xf1ead2 else ink, "black", "cm", squeeze=0.8, wobble=0.01, seed=seed + 1)
            d.rect((w * 0.1, h * 0.755, w * 0.9, h * 0.755 + max(1.5, h * 0.06)), ink, a=0.9)
            d.text((w / 2, h * 0.785), sub, h * 0.05, 0xf6f1e0, "bold", "cm", squeeze=0.9)
            d.rect((0, 0, w, max(2, h * 0.03)), ink, a=0.9)
    # printing: halftone dots + paper fibre + creases
    dots = (np.sin(xs * 1.9) * np.sin(ys * 1.9) > 0.55).astype(float) * 0.06
    s.rgb = s.rgb * (1 - dots[..., None])
    paper = noise2(w, h, seed + 5, fx=24, fy=24, octaves=6, beta=1.0)
    s.rgb = s.rgb * (0.9 + 0.2 * paper[..., None])
    crease = noise2(w, h, seed + 6, fx=3, fy=3, octaves=3, beta=1.5)
    s.rgb = s.rgb * (0.92 + 0.12 * np.clip(crease, 0, 1)[..., None])
    for k in range(rng.integers(1, 3)):
        yy = int(h * rng.uniform(0.2, 0.8))
        s.rgb[max(0, yy - 1) : yy + 1, :, :] *= 0.86
    arr = np.concatenate([np.clip(s.rgb, 0, 1), np.ones((h, w, 1))], axis=2)
    return Image.fromarray((arr * 255).astype(np.uint8), "RGBA")


def tear(img: Image.Image, seed: int, amount: float = 0.5, corner_peel: bool = True) -> Image.Image:
    """Roughen edges and tear chunks out of a poster (returns RGBA)."""
    w, h = img.size
    rng = np.random.default_rng(seed)
    arr = np.asarray(img).astype(np.float64) / 255.0
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    edge = np.minimum(np.minimum(xs, w - 1 - xs), np.minimum(ys, h - 1 - ys))
    n = noise2(w, h, seed, fx=18, fy=18, octaves=6, beta=1.4)
    alpha = (edge > (n * max(2.0, min(w, h) * 0.07 * amount))).astype(np.float64)
    # bite out a big torn corner / strip
    for _ in range(int(rng.integers(0, 3) * amount + 0.5)):
        cx = rng.choice([0, w]) + rng.normal(0, w * 0.1)
        cy = rng.choice([0, h]) + rng.normal(0, h * 0.1)
        r = rng.uniform(0.18, 0.4) * min(w, h)
        rr = r * (0.8 + 0.4 * n)
        alpha[(xs - cx) ** 2 + (ys - cy) ** 2 < rr**2] = 0
    if corner_peel and rng.random() < 0.7:  # lifted corner shows paper back: lighten a triangle
        c = rng.choice(4)
        sz = min(w, h) * rng.uniform(0.12, 0.25)
        fx_ = xs if c % 2 == 0 else w - 1 - xs
        fy_ = ys if c < 2 else h - 1 - ys
        tri = (fx_ + fy_) < sz
        arr[..., :3] = np.where(tri[..., None], np.array([0.86, 0.82, 0.72]) * (0.9 + 0.1 * n[..., None]), arr[..., :3])
        alpha = np.where((fx_ + fy_) < sz * 0.35, 0.0, alpha)
    arr[..., 3] = gblur(alpha, 0.5)
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA")


def stick_poster(s: Sheet, x: int, y: int, w: int, h: int, seed: int, rot: float = 0.0, kind: str | None = None, amount: float = 0.45, shadow: float = 0.5):
    img = tear(poster(w, h, seed, kind), seed + 100, amount)
    if rot:
        img = img.rotate(rot, expand=True, resample=Image.BICUBIC)
    s.overlay_image(img, x, y, height=0.08, rough=0.9, shadow=shadow)


# ----------------------------------------------------------------------------- stencil / hand paint


def stencil(s: Sheet, text: str, xy, px: float, color=0xf1ead2, style="black", a=0.9, rot: float = 0.0, squeeze: float = 1.0, wear: float = 0.5, seed: int = 0, anchor="cm", spacing=0.0):
    """Spray-stencil text: worn through noise, slightly rough edges. Returns the coverage mask."""
    base = Sheet(s.w, s.h, color=0x000000)
    with base.paint() as d:
        d.text(xy, text, px, 0xffffff, style, anchor, squeeze=squeeze, rot=rot, spacing=spacing)
    mask = base.rgb[..., 0]
    n = noise2(s.w, s.h, seed, fx=40, fy=40, octaves=6, beta=1.0)
    mask = np.clip(mask - wear * np.clip(n - 0.5, 0, 1) * 3.0, 0, 1)
    s.comp(color, mask * a, height=0.04, rough=0.85)
    return mask


def spray_tag(s: Sheet, seed: int, x0, y0, x1, y1, color=0x111111, width=3.0, loops=4):
    """A scribbled graffiti tag: smooth looping polyline with a thin highlight."""
    rng = np.random.default_rng(seed)
    pts = []
    n = loops * 5
    xs = np.linspace(x0, x1, n)
    for i, x in enumerate(xs):
        y = (y0 + y1) / 2 + np.sin(i * 1.7 + rng.uniform(0, 1)) * (y1 - y0) / 2 * rng.uniform(0.5, 1.0)
        pts.append((x + np.cos(i * 2.3) * (x1 - x0) * 0.03, y))
    from scipy.interpolate import CubicSpline

    t = np.arange(len(pts))
    cs = CubicSpline(t, np.array(pts))
    tt = np.linspace(0, len(pts) - 1, len(pts) * 8)
    smooth = [tuple(p) for p in cs(tt)]
    with s.paint(height=0.03, rough=0.7, soften=0.5) as d:
        d.line(smooth, color, width, a=0.95)
    with s.paint(rough=0.7, soften=0.5) as d:
        d.line([(x + 0.8, y - 0.8) for x, y in smooth], 0xffffff, max(0.8, width * 0.25), a=0.25)


def drips(s: Sheet, seed: int, x0, x1, y, color, n=5, length=(6, 24), width=1.6):
    rng = np.random.default_rng(seed)
    with s.paint() as d:
        for _ in range(n):
            x = rng.uniform(x0, x1)
            d.line([(x, y), (x, y + rng.uniform(*length))], color, width, a=0.85)


# ----------------------------------------------------------------------------- atlas


class Atlas:
    """A square/rect atlas of Sheets laid out on a pixel grid. `rect(name)` gives the inset uv rect for a tile."""

    def __init__(self, w: int, h: int | None = None, color=0x808080):
        self.w, self.h = w, (w if h is None else h)
        self.sheet = Sheet(self.w, self.h, color)
        self.tiles: dict[str, tuple[int, int, int, int]] = {}

    def add(self, name: str, x: int, y: int, tile: Sheet) -> Sheet:
        """Place a tile (top-left at x,y); gutter pixels are extended outward so mip-mapping doesn't bleed."""
        self.sheet.paste(tile, x, y)
        self.tiles[name] = (x, y, x + tile.w, y + tile.h)
        return tile

    def rect(self, name: str, pad: int = 3):
        from env_lib import px_rect

        x0, y0, x1, y1 = self.tiles[name]
        return px_rect((self.w, self.h), x0, y0, x1, y1, pad)

    def pack(self, name: str, tile: Sheet, gap: int = 2, regions=None) -> Sheet:
        """Shelf-pack a tile (left to right, new row when full) into the whole atlas or into the first of `regions`
        (x0, y0, x1, y1 pixel boxes, tried in order) with room for it."""
        if not hasattr(self, "_cursors"):
            self._cursors = {}
        for reg in regions or [(0, 0, self.w, self.h)]:
            x0, y0, x1, y1 = reg
            x, y, rh = self._cursors.get(reg, (x0, y0, 0))
            if x + tile.w > x1:
                x, y, rh = x0, y + rh + gap, 0
            if y + tile.h > y1 or tile.w > x1 - x0:
                continue
            self.add(name, x, y, tile)
            self._cursors[reg] = (x + tile.w + gap, y, max(rh, tile.h))
            return tile
        raise ValueError(f"atlas full while packing {name}")

    def mat(self, normal_strength: float = 1.2, jpeg_q: int = 84, nblur: float = 0.0, **kw):
        return self.sheet.to_mat(normal_strength, jpeg_q, nblur, **kw)


# ----------------------------------------------------------------------------- material tiles


def wood_sheet(w: int, h: int, seed: int = 0, tone=0xb88a54, planks_axis: str = "x", wear: float = 0.5, knots: int = 1, gap: int = 2, nails=None) -> Sheet:
    """A single wooden board painted with grain along x (planks_axis='x') or y; dark edge gaps; knots; nail heads; grime."""
    gw, gh = (w, h) if planks_axis == "x" else (h, w)
    rng = np.random.default_rng(seed)
    n1 = noise2(gw, gh, seed, fx=1.4, fy=22, octaves=6, beta=1.7)
    n2 = noise2(gw, gh, seed + 1, fx=1.0, fy=60, octaves=6, beta=1.0)
    n3 = noise2(gw, gh, seed + 2, fx=3, fy=6, octaves=4, beta=2.2)
    ys = (np.arange(gh)[:, None] + 0.5) / gh * np.ones((1, gw))
    xs = (np.arange(gw)[None, :] + 0.5) / gw * np.ones((gh, 1))
    warp = 0.25 * (n3 - 0.5)
    # knots
    kmap = np.zeros((gh, gw))
    for _ in range(knots):
        kx, ky = rng.uniform(0.2, 0.8) * gw, rng.uniform(0.25, 0.75) * gh
        r = rng.uniform(0.045, 0.07) * gw
        dx, dy = (np.mgrid[0:gh, 0:gw][1] - kx), (np.mgrid[0:gh, 0:gw][0] - ky) * 2.2
        dist = np.sqrt(dx**2 + dy**2)
        kmap = np.maximum(kmap, np.clip(1 - dist / (r * 2.2), 0, 1))
        warp += 0.0
    rings = 0.5 + 0.5 * np.sin((ys * (5 + 3 * rng.random()) + warp + 0.5 * n1) * 2 * np.pi + kmap * 14)
    grain = 0.55 * rings + 0.3 * n2 + 0.15 * n1
    t = srgb(tone)
    shade = 0.62 + 0.62 * grain - 0.30 * kmap
    rgb = t[None, None, :] * shade[..., None] * np.array([1.0, 0.97, 0.93])[None, None, :]
    # cool dust / weathered grey over time
    grey = np.clip(n3 * 1.4 - 0.55, 0, 1) * 0.45 * wear
    rgb = rgb * (1 - grey[..., None]) + np.array([0.52, 0.47, 0.42])[None, None, :] * grey[..., None] * shade[..., None]
    # dark gaps / edges
    edge = np.minimum(ys, 1 - ys) * gh
    gapm = np.clip(1 - edge / max(gap, 1), 0, 1) ** 0.8
    rgb = rgb * (1 - 0.7 * gapm[..., None])
    hi = np.clip(1 - np.abs(edge - gap - 1.0) / 1.6, 0, 1)  # lit lip just inside the edge
    rgb = rgb * (1 + 0.16 * hi[..., None])
    end = np.minimum(xs, 1 - xs) * gw
    rgb = rgb * (1 - 0.45 * np.clip(1 - end / 3.0, 0, 1)[..., None])  # end-grain dark line
    hgt = 0.5 + 0.35 * grain - 0.55 * gapm - 0.15 * kmap
    rough = 0.82 - 0.12 * grain
    # cracks along the grain
    for _ in range(int(2 * wear + rng.integers(0, 2))):
        y = int(rng.uniform(0.2, 0.8) * gh)
        x0 = int(rng.uniform(0.0, 0.7) * gw)
        ln = int(rng.uniform(0.1, 0.35) * gw)
        rgb[y, x0 : x0 + ln] *= 0.45
        hgt[y, x0 : x0 + ln] -= 0.25
    sh = Sheet(gw, gh)
    sh.rgb, sh.hgt, sh.rough = np.clip(rgb, 0, 1), hgt, rough
    if nails:
        # nails: list of (u_frac, v_frac) positions; heads with a highlight and a rust streak running down
        with sh.paint() as d:
            for nu, nv in nails:
                nx, ny = nu * gw, nv * gh
                d.line([(nx, ny + 2), (nx + rng.uniform(-1, 1), ny + rng.uniform(7, 16))], 0x3d2a1a, 1.6, a=0.45)
        with sh.paint(height=0.3, rough=0.45, metal=0.8) as d:
            for nu, nv in nails:
                nx, ny = nu * gw, nv * gh
                d.ellipse((nx - 2.6, ny - 2.6, nx + 2.6, ny + 2.6), 0x4a4540)
                d.ellipse((nx - 1.8, ny - 1.8, nx + 1.8, ny + 1.8), 0x7d776f)
                d.ellipse((nx - 1.2, ny - 1.5, nx + 0.1, ny - 0.4), 0xd8d3cb, a=0.8)
    if planks_axis == "y":
        sh = Sheet._rot90(sh)
    return sh


def _rot90(sh: Sheet) -> Sheet:
    o = Sheet(sh.h, sh.w)
    o.rgb, o.hgt, o.rough, o.metal = [np.ascontiguousarray(np.rot90(a, 1)) for a in (sh.rgb, sh.hgt, sh.rough, sh.metal)]
    return o


Sheet._rot90 = staticmethod(_rot90)  # type: ignore[attr-defined]


# ----------------------------------------------------------------------------- rubber / metal / fabric tiles


def rubber_base(w: int, h: int, seed: int = 0, tone=0x242426, dust: float = 0.5) -> Sheet:
    """Charcoal rubber with sun-bleached dust and dirt."""
    n = noise2(w, h, seed, fx=10, fy=4, octaves=5, beta=2.0)
    f = noise2(w, h, seed + 1, fx=60, fy=30, octaves=3, beta=1.0)
    s = Sheet(w, h, tone, rough=0.82)
    s.rgb = s.rgb * (0.85 + 0.35 * f[..., None])
    s.hgt = 0.5 + 0.1 * f
    d = np.clip(n * 1.7 - 0.7, 0, 1) * dust
    s.comp(0x7b7266, d * 0.55, rough=0.95)
    return s


def tyre_tread_tile(w: int = 512, h: int = 128, seed: int = 1, grooves=(0.29, 0.71), lugs: int = 24) -> Sheet:
    """Chevron lugs with circumferential grooves; the lug field is raised in the height map (-> strong normal-mapped tread)."""
    s = rubber_base(w, h, seed, dust=0.35)
    hh = np.full((h, w), 0.8)
    mask_g = np.zeros((h, w))
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    pitch = w / lugs
    # chevron: grooves run from the centre line outwards, slanted
    for sign_y, (y0, y1) in ((1, (0, h / 2)), (-1, (h / 2, h))):
        pass
    dist_to_c = np.abs(ys - h / 2)
    shifted = xs + dist_to_c * 0.55
    phase = (shifted / pitch) % 1.0
    lug_groove = np.clip(1 - np.abs(phase - 0.0) / 0.16, 0, 1) + np.clip(1 - np.abs(phase - 1.0) / 0.16, 0, 1)
    lug_groove = np.clip(lug_groove, 0, 1)
    for g in grooves:
        lug_groove = np.maximum(lug_groove, np.clip(1 - np.abs(ys / h - g) / 0.045, 0, 1))
    lug_groove = np.maximum(lug_groove, np.clip(1 - np.minimum(ys, h - 1 - ys) / 6, 0, 1) * 0.6)  # shoulder falloff
    hh = 0.85 - 0.7 * lug_groove
    s.hgt = hh + 0.05 * (s.hgt - 0.5)
    s.rgb = s.rgb * (1 - 0.6 * lug_groove[..., None])
    # worn lug tops are a little lighter/greyer
    wear = noise2(w, h, seed + 3, fx=8, fy=3)
    s.comp(0x6f6a62, (1 - lug_groove) * np.clip(wear * 1.6 - 0.8, 0, 1) * 0.5)
    return s


def tyre_wall_tile(w: int = 512, h: int = 96, seed: int = 2, text: str = "NAIJA GRIP RADIAL TUBELESS") -> Sheet:
    s = rubber_base(w, h, seed, dust=0.6)
    with s.paint(height=0.18, rough=0.8) as d:
        for yy in (h * 0.18, h * 0.84):
            d.line([(0, yy), (w, yy)], 0x3a3a3c, 2.2)
        for yy in (h * 0.26, h * 0.76):
            d.line([(0, yy), (w, yy)], 0x303032, 1.2)
        x = 18
        while x < w:
            tw, _ = d.text((x, h * 0.5), text, h * 0.2, 0x57575a, "bold", "lm", squeeze=0.9, spacing=0.06)
            x += tw + 40
            for k in range(3):
                d.poly([(x + k * 9, h * 0.5 - 6), (x + k * 9 + 6, h * 0.5), (x + k * 9, h * 0.5 + 6)], 0x57575a)
            x += 40
    # radial ribs near the bead
    with s.paint(height=0.1) as d:
        for k in range(0, w, 11):
            d.line([(k, h * 0.88), (k, h * 0.97)], 0x303032, 1.6)
    return s


def steel_sheet(w: int, h: int, seed: int = 0, tone=0x8d9094, rust: float = 0.4, paint=None) -> Sheet:
    """Worn painted steel: panel noise, scratches, rust at the edges. `paint` colour (e.g. dark grey) optional."""
    base = tone if paint is None else paint
    s = Sheet(w, h, base, rough=0.5, metal=0.75)
    f = noise2(w, h, seed, fx=40, fy=40, octaves=3, beta=1.0)
    n = noise2(w, h, seed + 1, fx=4, fy=4, octaves=5, beta=2.0)
    s.rgb = s.rgb * (0.88 + 0.22 * f[..., None]) * (0.9 + 0.2 * n[..., None])
    r = np.clip(noise2(w, h, seed + 2, fx=5, fy=5, octaves=6, beta=1.6) * 1.8 - (1.3 - 0.8 * rust), 0, 1)
    s.comp(0x7a3f1c, r * 0.9, rough=0.9, metal=0.3, height=0.1)
    s.comp(0x3b2a20, gblur(r, 2) * 0.4)
    scuffs(s, seed + 3, n=int(w * h / 4000), color=0xb4b6b8, a=0.4)
    return s


def burlap_sheet(w: int, h: int, seed: int = 0, tone=0xc7a46a, weave: float = 3.2, dirt: float = 0.4) -> Sheet:
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    cols = rng.uniform(0.82, 1.15, int(w / weave) + 2)
    rows = rng.uniform(0.82, 1.15, int(h / weave) + 2)
    cx = (xs / weave)
    cy = (ys / weave)
    hx = np.abs(np.sin(np.pi * cx))
    hy = np.abs(np.sin(np.pi * cy))
    over = ((np.floor(cx) + np.floor(cy)) % 2 == 0)
    thread = np.where(over, hx**0.6 * cols[np.floor(cx).astype(int)], hy**0.6 * rows[np.floor(cy).astype(int)])
    gaps = (1 - hx) * (1 - hy)
    n = noise2(w, h, seed, fx=3, fy=3, octaves=5, beta=2.2)
    v = (0.62 + 0.45 * thread) * (0.88 + 0.25 * n) - 0.25 * gaps
    s = Sheet(w, h)
    s.rgb = np.clip(srgb(tone)[None, None, :] * v[..., None], 0, 1)
    s.hgt = 0.35 + 0.5 * thread - 0.2 * gaps
    s.rough = np.full((h, w), 0.95)
    dirt_n = np.clip(noise2(w, h, seed + 5, fx=4, fy=4, octaves=5) * 1.6 - 0.7, 0, 1)
    s.comp(0x4b3a26, dirt_n * dirt)
    return s


def stitch_row(s: Sheet, y: float, color=0x2b2118, step: float = 7.0, slant: float = 4.0, seed: int = 0, width: float = 1.6):
    rng = np.random.default_rng(seed)
    with s.paint(height=0.25, rough=0.9) as d:
        x = 2.0
        while x < s.w - 2:
            d.line([(x, y - slant), (x + step * 0.55, y + slant)], color, width, a=0.95)
            d.line([(x + step * 0.55, y + slant), (x + step, y - slant + rng.uniform(-0.6, 0.6))], color, width * 0.85, a=0.9)
            x += step
        d.line([(0, y), (s.w, y)], color, 0.7, a=0.5)


# ----------------------------------------------------------------------------- plastic / film / paint tiles


def plastic_sheet(w: int, h: int, seed: int = 0, tone=0x2a64c8, rough: float = 0.42, grime: float = 0.35, sheen: float = 0.0) -> Sheet:
    """Moulded plastic: soft colour variation, scuffs and dirt; glossy."""
    n = noise2(w, h, seed, fx=4, fy=4, octaves=5, beta=2.2)
    f = noise2(w, h, seed + 1, fx=50, fy=50, octaves=3, beta=1.0)
    s = Sheet(w, h, tone, rough=rough)
    s.rgb = s.rgb * (0.9 + 0.2 * n[..., None]) * (0.97 + 0.06 * f[..., None])
    s.hgt = 0.5 + 0.05 * f
    dirt = np.clip(noise2(w, h, seed + 2, fx=3, fy=3, octaves=5) * 1.7 - 0.8, 0, 1) * grime
    s.comp(0x4a3d2c, dirt, rough=0.8)
    scuffs(s, seed + 3, n=max(4, int(w * h / 5000)), color=0xd8dde2, a=0.3)
    return s


def hazard_board(w: int, h: int, seed: int = 0, angle: float = 45.0, stripe: float = 26.0, wear: float = 0.5) -> Sheet:
    """Black / yellow diagonal-striped sign board with chipped paint, rust and a dark edge."""
    band, cov = hazard_band(w, h, PAL["hazard_yellow"], PAL["hazard_black"], stripe, angle, seed, wear=0.0, border=False)
    s = band
    ys, xs = np.mgrid[0:h, 0:w]
    edge = np.minimum(np.minimum(xs, w - 1 - xs), np.minimum(ys, h - 1 - ys))
    s.comp(0x1a1a1c, np.clip(1 - edge / 3.5, 0, 1) * 0.8, height=-0.1)
    n = noise2(w, h, seed + 7, fx=14, fy=5, octaves=6, beta=1.3)
    chips = np.clip(n * 1.8 - (1.55 - wear), 0, 1)
    s.comp(0x6a3a1e, chips, rough=0.9, metal=0.3, height=-0.15)
    dirt = np.clip(noise2(w, h, seed + 8, fx=5, fy=3, octaves=5) * 1.6 - 0.75, 0, 1)
    s.comp(0x3a2f22, dirt * 0.45)
    s.rough = np.full((h, w), 0.55)  # painted reflective sheeting is a bit glossy
    s.rough = s.rough + 0.35 * chips
    bolts = [(14, h / 2), (w - 14, h / 2)]
    with s.paint(height=0.3, rough=0.4, metal=0.8) as d:
        for bx, by in bolts:
            d.ellipse((bx - 4, by - 4, bx + 4, by + 4), 0x5d5a57)
            d.ellipse((bx - 2.4, by - 3, bx - 0.4, by - 1.2), 0xd0ccc6, a=0.8)
    return s


def film_sheet(w: int, h: int, seed: int = 0, film=0x2f78dc, sachet=0xcfe6f7, text: str | None = "PURE WATER", text_color=0xffffff, big: bool = True, cell=(34, 26)) -> Sheet:
    """Shrink-wrapped sachet bale: grid of puffy water sachets under glossy printed polythene with wrinkles."""
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    cw, ch = cell
    fx = ((xs % cw) / cw) * 2 - 1
    fy = ((ys % ch) / ch) * 2 - 1
    pillow = np.clip(1 - (np.abs(fx) ** 2.6 + np.abs(fy) ** 2.6), 0, 1) ** 0.6
    s = Sheet(w, h, sachet, rough=0.35)
    shade = 0.72 + 0.4 * pillow
    s.rgb = (srgb(sachet)[None, None, :] * 0.55 + srgb(film)[None, None, :] * 0.45) * shade[..., None]
    wr = noise2(w, h, seed, fx=9, fy=5, octaves=6, beta=1.2)
    ridge = np.clip(1 - np.abs(wr - 0.5) / 0.06, 0, 1)
    s.rgb = s.rgb * (1 - 0.18 * ridge[..., None]) + 0.12 * ridge[..., None]
    s.hgt = 0.45 + 0.35 * pillow + 0.2 * ridge
    s.comp(film, np.full((h, w), 0.0))
    if text:
        with s.paint(height=0.02, rough=0.3) as d:
            d.rect((w * 0.04, h * 0.18, w * 0.96, h * 0.82), film, a=0.75)
            tpx = fit_px(text, w * 0.62, h * 0.34, "black", 0.9, 0.03)
            d.text((w / 2 + w * 0.05, h * 0.45), text, tpx, text_color, "black", "cm", squeeze=0.9, spacing=0.03)
            d.text((w / 2, h * 0.74), "SACHET WATER 50cl x 20", fit_px("SACHET WATER 50cl x 20", w * 0.8, h * 0.1, "bold", 0.9), text_color, "bold", "cm", squeeze=0.9, a=0.95)
            d.poly([(w * 0.08, h * 0.38), (w * 0.095, h * 0.5), (w * 0.065, h * 0.5)], text_color, a=0.9)
            d.ellipse((w * 0.063, h * 0.46, w * 0.097, h * 0.60), text_color, a=0.9)
    s.comp(0x2a2118, np.clip(noise2(w, h, seed + 4, fx=3, fy=3, octaves=5) * 1.6 - 0.9, 0, 1) * 0.3)
    return s


# ----------------------------------------------------------------------------- painted steel panels / canopies


def corrugated_panel(w: int, h: int, seed: int, tone, ribs: float = 14.0, rust: float = 0.5, wear: float = 0.5) -> Sheet:
    """Painted corrugated steel (vertical ribs): chipped paint, rust creeping from the bottom/edges, scratches."""
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    pitch = w / ribs
    ph = (xs / pitch) % 1.0
    rib = 0.5 + 0.5 * np.sin(ph * 2 * np.pi)
    n = noise2(w, h, seed, fx=5, fy=5, octaves=5, beta=1.8)
    f = noise2(w, h, seed + 1, fx=40, fy=40, octaves=3, beta=1.0)
    s = Sheet(w, h, tone, rough=0.5, metal=0.0)
    base = srgb(tone)[None, None, :] * (0.66 + 0.5 * rib + 0.1 * (n - 0.5) + 0.04 * (f - 0.5))[..., None]
    edge = np.minimum(np.minimum(xs, w - 1 - xs), np.minimum(ys, h - 1 - ys))
    rn = noise2(w, h, seed + 2, fx=7, fy=6, octaves=6, beta=1.6)
    rustm = np.clip(rn * 1.7 - (1.45 - rust), 0, 1) * (0.35 + 0.65 * np.clip(ys / h * 1.5, 0, 1)) + np.clip(1 - edge / 7.0, 0, 1) * 0.4 * rn
    rustm = np.clip(rustm * wear * 2, 0, 1)
    base = base * (1 - rustm[..., None] * 0.85) + srgb(0x7a3f1c)[None, None, :] * rustm[..., None] * 0.85 * (0.7 + 0.5 * rib[..., None])
    s.rgb = np.clip(base, 0, 1)
    s.hgt = 0.5 + 0.4 * rib + 0.12 * rustm
    s.rough = 0.45 + 0.45 * rustm
    s.metal = 0.45 * (1 - rustm)
    scuffs(s, seed + 3, n=int(w * h / 6000), color=0xd0cdc6, a=0.35, length=(8, 30))
    # grime near the ground
    g = np.clip(1 - (1 - ys / h) / 0.2, 0, 1) * (0.4 + 0.6 * n)
    s.comp(0x2a2118, g * 0.5)
    return s


def striped_canopy_tile(w: int, h: int, seed: int, c1=0xe8512a, c2=0xf6f1e0) -> Sheet:
    """Half-stripe tile for a parasol (u<0.5 colour 1, u>0.5 colour 2), faded, dusty and patched."""
    s = Sheet(w, h, c1, rough=0.9)
    s.rgb[:, w // 2 :] = srgb(c2)
    n = noise2(w, h, seed, fx=6, fy=3, octaves=5, beta=1.8)
    s.rgb = s.rgb * (0.78 + 0.3 * n[..., None])
    s.comp(0x4a3d2c, np.clip(noise2(w, h, seed + 1, fx=5, fy=3) * 1.6 - 0.8, 0, 1) * 0.5)
    ys = (np.arange(h)[:, None] + 0.5) / h
    s.comp(0x3a3128, np.clip(1 - ys / 0.15, 0, 1) * 0.25 * np.ones((1, w)))
    s.hgt = 0.5 + 0.06 * n
    return s
