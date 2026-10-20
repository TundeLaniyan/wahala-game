"""Extra procedural textures for the vehicle set (own registry; `install()` makes them visible to Model.export)."""
from __future__ import annotations

import numpy as np

import tex as texlib
from tex import Tex, blur, fbm, srgb


def tyre_rubber(size: int = 512, seed: int = 51, tone=0x2c2c2f) -> Tex:
    n = fbm(size, 7, 1.2, seed, base=8)
    d = fbm(size, 3, 2.0, seed + 1, base=1)
    fine = fbm(size, 8, 0.4, seed + 2, base=50)
    t = srgb(tone)
    v = 0.78 + 0.35 * n + 0.25 * np.clip(d - 0.5, 0, 1) + 0.08 * (fine - 0.5)
    alb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    return Tex(alb, 0.6 * n + 0.4 * fine, np.clip(0.82 + 0.1 * (fine - 0.5), 0, 1), normal_strength=1.4)


def dull_steel(size: int = 512, seed: int = 71, tone=0x8d9096) -> Tex:
    """Brushed / lightly rusty steel for racks, rims and generator frames."""
    n = fbm(size, 6, 1.6, seed, base=4)
    fine = fbm(size, 8, 0.5, seed + 1, base=40)
    rust = np.clip(fbm(size, 5, 2.2, seed + 2, base=3) - 0.62, 0, 1) * 4
    t = srgb(tone)
    v = 0.8 + 0.3 * n + 0.1 * (fine - 0.5)
    alb = np.clip(t[None, None, :] * v[..., None], 0, 1)
    rr = np.clip(rust, 0, 1)[..., None]
    alb = alb * (1 - 0.7 * rr) + srgb(0x6a3515) * 0.7 * rr
    return Tex(alb, 0.5 * n + 0.3 * fine, np.clip(0.45 + 0.4 * rr[..., 0] + 0.1 * fine, 0, 1), normal_strength=0.9)


def van_paint(size: int = 512, seed: int = 11, tone=0xf6c20a, wear: float = 0.5) -> Tex:
    """Glossy-ish vehicle paint: gentle mottling, vertical dirt streaks, hairline scratches, a few chips down to grey primer / rust."""
    rng = np.random.default_rng(seed)
    low = fbm(size, 4, 2.2, seed, base=1)
    mid = fbm(size, 6, 1.6, seed + 1, base=4)
    fine = fbm(size, 8, 0.3, seed + 2, base=60)
    row = fbm(size, 3, 1.2, seed + 3, base=40)[:1, :]
    streak = np.clip(blur(np.tile(row, (size, 1)), 1.2) * 1.0, 0, 1)
    streak = (streak - streak.min()) / max(np.ptp(streak), 1e-9)
    ys = np.mgrid[0:size, 0:size][0] / size
    streak = streak * (0.5 + 0.5 * mid)
    scr = np.zeros((size, size))
    for _ in range(int(40 * wear)):
        x0, y0 = rng.integers(0, size, 2)
        ln = rng.integers(5, 28)
        ang = rng.normal(0.0, 0.5) + (np.pi / 2 if rng.random() < 0.3 else 0)
        for k in range(ln):
            scr[int(y0 + np.sin(ang) * k) % size, int(x0 + np.cos(ang) * k) % size] = rng.uniform(0.4, 1.0)
    scr = np.clip(blur(scr, 0.55) * 3.5, 0, 1)
    chips = np.zeros((size, size))
    for _ in range(int(9 * wear)):
        cx, cy = rng.integers(0, size, 2)
        r = rng.integers(1, 4)
        yy, xx = np.ogrid[-r:r + 1, -r:r + 1]
        mask = (xx**2 + yy**2) <= r * r
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if mask[dy + r, dx + r]:
                    chips[(cy + dy) % size, (cx + dx) % size] = 1.0
    chips = np.clip(blur(chips, 0.5) * 2.2, 0, 1)
    rust = np.clip(fbm(size, 6, 2.0, seed + 4, base=3) - 0.74, 0, 1) * 6 * wear
    t = srgb(tone)
    v = 1.0 + 0.10 * (low - 0.5) + 0.05 * (mid - 0.5) + 0.02 * (fine - 0.5)
    alb = t[None, None, :] * v[..., None]
    dirt_c = srgb(0x6e5a3a)
    k = np.clip(0.22 * wear * streak, 0, 0.4)[..., None]
    alb = alb * (1 - k) + dirt_c * k * 0.7
    alb = alb * (1 - 0.22 * scr[..., None]) + srgb(0xfff0b0) * 0.22 * scr[..., None] * 0.6
    c = chips[..., None]
    alb = alb * (1 - 0.6 * c) + srgb(0x7a5a30) * 0.6 * c
    rr = np.clip(rust, 0, 1)[..., None]
    alb = alb * (1 - 0.8 * rr) + srgb(0x6a3515) * 0.8 * rr
    h = blur(0.5 * low + 0.2 * mid, 2.0) - 0.25 * scr - 0.5 * chips + 0.2 * np.clip(rust, 0, 1)
    rough = np.clip(0.40 + 0.25 * streak + 0.25 * np.clip(rust, 0, 1) + 0.15 * scr + 0.1 * (fine - 0.5), 0.2, 1)
    return Tex(np.clip(alb, 0, 1), (h - h.min()) / (np.ptp(h) + 1e-9), rough, normal_strength=0.14)


VEH_GENERATORS = {"tyre_rubber": tyre_rubber, "dull_steel": dull_steel, "van_paint": van_paint}


def install() -> None:
    texlib.GENERATORS.update(VEH_GENERATORS)
