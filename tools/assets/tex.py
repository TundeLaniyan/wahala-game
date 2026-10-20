"""Procedural, tileable PBR texture synthesis (numpy + PIL). Everything is generated from code.

Each generator returns a `Tex` holding albedo (sRGB uint8 RGB), a height field (0..1) and roughness (0..1);
`Tex.png_set()` turns those into PNG bytes for glTF (albedo, tangent-space normal, ORM).
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image


def _png(arr: np.ndarray) -> bytes:
    """JPEG-encode (the name is historical): ~8x smaller than PNG for noisy surface textures."""
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=86, subsampling=0)
    return buf.getvalue()


def srgb(c) -> np.ndarray:
    """0xRRGGBB or (r,g,b) 0..1 -> float RGB 0..1 (sRGB)."""
    if isinstance(c, int):
        return np.array([(c >> 16) & 255, (c >> 8) & 255, c & 255]) / 255.0
    return np.asarray(c, dtype=np.float64)


def fbm(size: int, octaves: int = 5, beta: float = 2.0, seed: int = 0, base: int = 2) -> np.ndarray:
    """Tileable fractal noise in 0..1 using a 1/f^beta spectrum (FFT); `base` lowers the lowest frequency."""
    rng = np.random.default_rng(seed)
    fx = np.fft.fftfreq(size)[:, None]
    fy = np.fft.fftfreq(size)[None, :]
    f = np.sqrt(fx**2 + fy**2)
    f[0, 0] = 1.0
    amp = 1.0 / f ** (beta / 2)
    amp[f * size < base] = 0
    amp[0, 0] = 0
    amp[f * size > 2 ** (octaves + 1)] = 0
    spec = amp * np.exp(2j * np.pi * rng.random((size, size)))
    n = np.real(np.fft.ifft2(spec))
    n -= n.min()
    return n / max(n.max(), 1e-9)


def blur(a: np.ndarray, k: float) -> np.ndarray:
    fx = np.fft.fftfreq(a.shape[0])[:, None]
    fy = np.fft.fftfreq(a.shape[1])[None, :]
    g = np.exp(-2 * (np.pi * k) ** 2 * (fx**2 + fy**2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def normal_from_height(h: np.ndarray, strength: float = 2.0) -> np.ndarray:
    """Tangent-space normal map (OpenGL / +Y up convention used by glTF) from a tileable height field."""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    nx, ny = -dx * strength * h.shape[0] * 0.04, dy * strength * h.shape[0] * 0.04  # image y runs down
    nz = np.ones_like(nx)
    ln = np.sqrt(nx**2 + ny**2 + nz**2)
    n = np.stack([nx / ln, ny / ln, nz / ln], axis=-1)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


@dataclass
class Tex:
    albedo: np.ndarray  # float 0..1 sRGB [S,S,3]
    height: np.ndarray  # 0..1
    rough: np.ndarray  # 0..1
    metal: np.ndarray | float = 0.0
    normal_strength: float = 2.0

    def png_set(self) -> dict[str, bytes]:
        alb = _png((np.clip(self.albedo, 0, 1) * 255).astype(np.uint8))
        nrm = _png(normal_from_height(self.height, self.normal_strength))
        r = np.clip(self.rough, 0, 1)
        m = np.broadcast_to(np.asarray(self.metal, dtype=np.float64), r.shape)
        ao = np.clip(0.55 + 0.45 * self.height, 0, 1)
        orm = _png((np.stack([ao, r, m], axis=-1) * 255).astype(np.uint8))
        return {"albedo": alb, "normal": nrm, "orm": orm}


# ----------------------------------------------------------------------------- generators


def concrete(size: int = 512, seed: int = 1, tone=0x9a958b, stains: float = 0.5) -> Tex:
    base = fbm(size, 6, 2.2, seed)
    fine = fbm(size, 8, 1.0, seed + 1, base=24)
    pits = (fbm(size, 8, 0.6, seed + 2, base=40) > 0.955).astype(float)
    pits = blur(pits, 0.8)
    stain = fbm(size, 3, 2.8, seed + 3, base=1)
    t = srgb(tone)
    v = 0.80 + 0.30 * base + 0.05 * (fine - 0.5) - 0.30 * pits - stains * 0.30 * np.clip(stain - 0.55, 0, 1) * 2
    alb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    h = 0.5 * base + 0.12 * fine - 0.5 * pits
    return Tex(alb, (h - h.min()) / (np.ptp(h) + 1e-9), 0.88 - 0.1 * pits - 0.05 * fine, normal_strength=1.1)


def asphalt(size: int = 512, seed: int = 4, tone=0x55524e) -> Tex:
    base = fbm(size, 5, 2.0, seed)
    grit = fbm(size, 9, 0.2, seed + 1, base=60)
    cracks = np.abs(fbm(size, 4, 3.0, seed + 2, base=2) - 0.5)
    crack = (cracks < 0.006).astype(float)
    crack = blur(crack, 0.7)
    t = srgb(tone)
    v = 0.7 + 0.35 * base + 0.35 * (grit - 0.5) - 0.7 * crack
    alb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    h = 0.3 * base + 0.6 * grit - 1.0 * crack
    return Tex(alb, (h - h.min()) / (np.ptp(h) + 1e-9), 0.92 - 0.2 * (grit > 0.8), normal_strength=3.0)


def wood(size: int = 512, seed: int = 7, tone=0xb8864b, planks: int = 4, vertical: bool = True) -> Tex:
    rng = np.random.default_rng(seed)
    n = fbm(size, 7, 1.6, seed, base=2)
    stretch = fbm(size, 6, 1.4, seed + 1, base=1)
    ys, xs = np.mgrid[0:size, 0:size] / size
    u = xs if vertical else ys
    w = ys if vertical else xs
    pid = np.floor(u * planks)
    shift = rng.random(planks + 1)[pid.astype(int)]
    grain = np.sin((w * (3 + 6 * shift) + 14 * stretch * 0.3 + n * 5) * 2 * np.pi * 3.0) * 0.5 + 0.5
    grain = 0.55 * grain + 0.45 * n
    edge = np.abs(((u * planks) % 1.0) - 0.5) * 2
    seam = np.clip((edge - 0.93) / 0.07, 0, 1)
    tint = 0.85 + 0.3 * rng.random(planks + 1)[pid.astype(int)]
    t = srgb(tone)
    v = (0.62 + 0.55 * grain) * tint * (1 - 0.8 * seam)
    alb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    h = 0.5 * grain - 0.9 * seam
    return Tex(alb, (h - h.min()) / (np.ptp(h) + 1e-9), 0.8 - 0.1 * grain, normal_strength=2.0)


def painted_metal(size: int = 512, seed: int = 11, tone=0xf2b705, wear: float = 0.5) -> Tex:
    """Panel metal with orange-peel, scratches, dirt and rust at the edges (Danfo-yellow by default)."""
    peel = fbm(size, 8, 0.8, seed, base=30)
    dirt = fbm(size, 4, 2.6, seed + 1, base=1)
    rust = np.clip(fbm(size, 6, 2.0, seed + 2, base=4) - (1 - 0.35 * wear), 0, 1) * 5
    scr = np.zeros((size, size))
    rng = np.random.default_rng(seed)
    for _ in range(int(40 * wear)):
        x0, y0 = rng.integers(0, size, 2)
        ln = rng.integers(10, 60)
        ang = rng.uniform(0, np.pi)
        for k in range(ln):
            x = int(x0 + np.cos(ang) * k) % size
            y = int(y0 + np.sin(ang) * k) % size
            scr[y, x] = 1.0
    scr = blur(scr, 0.6) * 3
    t = srgb(tone)
    v = 0.92 + 0.06 * (peel - 0.5) - 0.28 * wear * np.clip(dirt - 0.4, 0, 1)
    alb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    rust_c = srgb(0x6b3a1c)
    alb = alb * (1 - np.clip(rust, 0, 1)[..., None] * 0.8) + rust_c * np.clip(rust, 0, 1)[..., None] * 0.8
    alb = np.clip(alb + 0.1 * np.clip(scr, 0, 1)[..., None], 0, 1)
    h = 0.2 * peel - 0.4 * np.clip(scr, 0, 1) + 0.3 * np.clip(rust, 0, 1)
    return Tex(alb, (h - h.min()) / (np.ptp(h) + 1e-9), 0.42 + 0.35 * np.clip(rust, 0, 1) + 0.1 * dirt, normal_strength=1.0)


def corrugated(size: int = 512, seed: int = 21, tone=0x8a8f94, ribs: int = 14, rust: float = 0.5) -> Tex:
    ys, xs = np.mgrid[0:size, 0:size] / size
    wave = np.sin(xs * ribs * 2 * np.pi) * 0.5 + 0.5
    r = np.clip(fbm(size, 6, 2.2, seed, base=2) - (1 - 0.5 * rust), 0, 1) * 4
    d = fbm(size, 4, 2.5, seed + 1, base=1)
    t = srgb(tone)
    v = 0.65 + 0.4 * wave - 0.3 * np.clip(d - 0.5, 0, 1)
    alb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    rc = srgb(0x7a4521)
    rr = np.clip(r, 0, 1)[..., None]
    alb = alb * (1 - rr * 0.85) + rc * rr * 0.85
    return Tex(alb, 0.8 * wave + 0.2 * np.clip(r, 0, 1), 0.55 + 0.4 * np.clip(r, 0, 1), metal=0.0, normal_strength=3.0)


def plaster(size: int = 512, seed: int = 31, tone=0xd9c8a0, grime: float = 0.7) -> Tex:
    n = fbm(size, 6, 2.4, seed)
    f = fbm(size, 8, 0.8, seed + 1, base=30)
    drips = blur(fbm(size, 3, 1.5, seed + 2, base=6) ** 2, 0.5)
    ys, xs = np.mgrid[0:size, 0:size] / size
    streak = blur(np.tile(fbm(size, 2, 0.5, seed + 4, base=40)[:1, :], (size, 1)), 2.0)
    t = srgb(tone)
    v = 0.82 + 0.25 * n + 0.07 * (f - 0.5) - grime * 0.35 * drips * (1.0 - ys * 0.3) - grime * 0.15 * streak
    alb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    h = 0.4 * n + 0.5 * f
    return Tex(alb, (h - h.min()) / (np.ptp(h) + 1e-9), 0.92, normal_strength=1.6)


def brick(size: int = 512, seed: int = 41, tone=0xa8553a, rows: int = 12, cols: int = 6) -> Tex:
    ys, xs = np.mgrid[0:size, 0:size] / size
    row = np.floor(ys * rows)
    xo = xs * cols + (row % 2) * 0.5
    cx = np.floor(xo)
    fx_ = xo - cx
    fy_ = ys * rows - row
    rng = np.random.default_rng(seed)
    tint = 0.75 + 0.5 * rng.random((rows, cols * 2 + 2))[row.astype(int), (cx.astype(int)) % (cols * 2)]
    mortar = ((fx_ < 0.05) | (fx_ > 0.95) | (fy_ < 0.08) | (fy_ > 0.92)).astype(float)
    mortar = blur(mortar, 1.0)
    n = fbm(size, 7, 1.4, seed + 1, base=6)
    t = srgb(tone)
    brick_c = t[None, None, :] * (tint * (0.8 + 0.4 * n))[..., None]
    m_c = srgb(0xb8b0a0)[None, None, :] * (0.8 + 0.3 * n)[..., None]
    alb = np.clip(brick_c * (1 - mortar[..., None]) + m_c * mortar[..., None], 0, 1)
    h = 1.0 - mortar + 0.2 * n
    return Tex(alb, (h - h.min()) / (np.ptp(h) + 1e-9), 0.9, normal_strength=2.2)


def rubber(size: int = 256, seed: int = 51, tone=0x232325) -> Tex:
    n = fbm(size, 7, 1.2, seed, base=8)
    d = fbm(size, 3, 2.0, seed + 1, base=1)
    t = srgb(tone)
    v = 0.7 + 0.5 * n + 0.3 * np.clip(d - 0.5, 0, 1)
    alb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    return Tex(alb, n, 0.85, normal_strength=1.5)


def poster_atlas(size: int = 1024, seed: int = 61, grid: int = 4) -> Tex:
    """grid x grid cells of loud, layered street posters / handbills (abstract: blocks of type, no real brands)."""
    rng = np.random.default_rng(seed)
    pal = [0xe63946, 0xffb703, 0x06a77d, 0x1d7cf2, 0xf4f1de, 0x9b5de5, 0xff7f11, 0x111111, 0xff4f9a]
    img = np.zeros((size, size, 3))
    h = np.zeros((size, size))
    cell = size // grid
    yy, xx = np.mgrid[0:cell, 0:cell]
    for gy in range(grid):
        for gx in range(grid):
            bg = srgb(pal[rng.integers(len(pal))])
            fg = srgb(pal[rng.integers(len(pal))])
            tile = np.tile(bg, (cell, cell, 1)).astype(float)
            # diagonal / radial burst + headline bars + a big "face" disc + small print lines
            if rng.random() < 0.5:
                ang = np.arctan2(yy - cell * 0.4, xx - cell * 0.5)
                rays = (np.sin(ang * rng.integers(6, 16)) > 0).astype(float)
                tile = tile * (0.8 + 0.2 * rays[..., None]) + 0.05
            cx, cy = rng.uniform(0.3, 0.7) * cell, rng.uniform(0.25, 0.5) * cell
            r = rng.uniform(0.15, 0.28) * cell
            disc = ((xx - cx) ** 2 + (yy - cy) ** 2 < r * r)[..., None]
            tile = np.where(disc, srgb(0x6b4226) * rng.uniform(0.7, 1.3), tile)
            for k in range(rng.integers(2, 5)):
                y0 = int(cell * (0.62 + 0.09 * k))
                x0 = int(cell * rng.uniform(0.08, 0.2))
                x1 = int(cell * rng.uniform(0.6, 0.92))
                tile[y0 : y0 + int(cell * (0.075 if k == 0 else 0.03)), x0:x1] = fg if k % 2 == 0 else srgb(0x111111)
            tile[: int(cell * 0.05)] = fg
            img[gy * cell : (gy + 1) * cell, gx * cell : (gx + 1) * cell] = tile
            h[gy * cell : (gy + 1) * cell, gx * cell : (gx + 1) * cell] = 0.5
    n = fbm(size, 7, 1.5, seed + 1, base=4)
    tears = fbm(size, 5, 2.0, seed + 2, base=3)
    img = img * (0.8 + 0.25 * n[..., None])
    img = np.where((tears > 0.78)[..., None], srgb(0xcdbf9f), img)
    return Tex(np.clip(img, 0, 1), 0.5 * n + 0.2 * (tears > 0.78), 0.85, normal_strength=0.8)


GENERATORS = {
    "concrete": concrete,
    "asphalt": asphalt,
    "wood": wood,
    "painted_metal": painted_metal,
    "corrugated": corrugated,
    "plaster": plaster,
    "brick": brick,
    "rubber": rubber,
    "poster_atlas": poster_atlas,
}
