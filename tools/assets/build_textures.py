"""Builds shared surface textures into src/assets/textures/.

    python3 tools/assets/build_textures.py

floor_*.jpg: a 4x4 atlas of distinct concrete slabs (albedo, tangent normal, ORM) for the arena floor, one slab = one tile.
"""
from __future__ import annotations

import io
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))

import tex as T

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets", "textures")


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def jpeg(arr: np.ndarray, path: str, q: int = 88) -> int:
    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8) if arr.dtype != np.uint8 else arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=q, subsampling=0)
    with open(path, "wb") as f:
        f.write(buf.getvalue())
    return len(buf.getvalue())


def floor_atlas(cells: int = 4, px: int = 256, seed: int = 5) -> None:
    S = cells * px
    # Warm sunlit concrete bus-park / market slabs (reference: warm grey-beige slabs, crisp sandy seams, subtle cracks).
    base = T.concrete(1024, seed=seed, tone=0xc2bbb0, stains=0.28)
    # Smooth trowelled finish: keep broad tonal variation, drop high-frequency speckle so lanes stay clean.
    for c in range(3):
        base.albedo[..., c] = 0.25 * base.albedo[..., c] + 0.75 * T.blur(base.albedo[..., c], 3.2)
    base.height[...] = 0.35 * base.height + 0.65 * T.blur(base.height, 2.4)
    rng = np.random.default_rng(seed)
    alb = np.zeros((S, S, 3))
    hgt = np.zeros((S, S))
    rgh = np.zeros((S, S))
    yy, xx = np.mgrid[0:px, 0:px] / px
    d = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy))
    for cy in range(cells):
        for cx in range(cells):
            ox, oy = rng.integers(0, 1024 - px, 2)
            a = base.albedo[oy : oy + px, ox : ox + px].copy()
            h = 0.30 * T.blur(base.height[oy : oy + px, ox : ox + px], 3.0)
            r = base.rough[oy : oy + px, ox : ox + px].copy()
            # per-slab warm/cool concrete pour variation
            a *= 0.95 + 0.09 * rng.random()
            a *= (1.0 + 0.035 * (rng.random(3) - 0.48))[None, None, :]
            # joint: crisp expansion groove with warm sandy mortar in the seam and bevelled concrete lip
            chip = T.fbm(px, 5, 1.5, seed + cx * 13 + cy * 31, base=3)
            width = 0.013 + 0.005 * chip
            groove = smoothstep(width, width * 0.28, d)
            sand = smoothstep(width * 2.1, width * 0.6, d) * (1 - groove * 0.6)
            lip = smoothstep(width * 3.8, width * 1.3, d) * (1 - groove)
            sand_col = np.array([0.74, 0.65, 0.50])[None, None, :]
            a = a * (1 - 0.62 * groove[..., None])
            a = a * (1 - 0.22 * sand[..., None]) + sand_col * (0.22 * sand[..., None]) + 0.065 * lip[..., None]
            h = h - 1.05 * groove + 0.14 * lip
            # subtle warm oil / dust patches without noisy diagonal scribble lines
            for _ in range(rng.integers(0, 2)):
                bx, by, br = rng.random(), rng.random(), rng.uniform(0.10, 0.22)
                blot = smoothstep(br, 0.0, np.hypot(xx - bx, yy - by) + 0.05 * chip)
                a *= 1 - 0.12 * blot[..., None] * np.array([1.0, 1.02, 1.05])[None, None, :]
                r = np.clip(r - 0.15 * blot, 0, 1)
            # fine weathered crack in select slabs
            if rng.random() < 0.28:
                t = np.linspace(0, 1, 450)
                x = rng.random() + np.cumsum(rng.normal(0, 0.0038, 450)) + t * rng.uniform(-0.45, 0.45)
                y = rng.random() + t * rng.uniform(0.3, 0.75)
                crack = np.zeros((px, px))
                for xi, yi in zip(x % 1, y % 1):
                    crack[int(yi * (px - 1)), int(xi * (px - 1))] = 1
                crack = np.clip(T.blur(crack, 0.75) * 6.5, 0, 1)
                a *= 1 - 0.28 * crack[..., None]
                h -= 0.45 * crack
            alb[cy * px : (cy + 1) * px, cx * px : (cx + 1) * px] = a
            hgt[cy * px : (cy + 1) * px, cx * px : (cx + 1) * px] = h
            rgh[cy * px : (cy + 1) * px, cx * px : (cx + 1) * px] = r
    hgt = (hgt - hgt.min()) / (np.ptp(hgt) + 1e-9)
    nrm = T.normal_from_height(hgt, 1.4)
    ao = np.clip(0.6 + 0.4 * hgt, 0, 1)
    orm = np.stack([ao, np.clip(rgh, 0, 1), np.zeros_like(hgt)], axis=-1)
    os.makedirs(OUT, exist_ok=True)
    sizes = [
        jpeg(np.clip(alb, 0, 1), os.path.join(OUT, "floor_albedo.jpg"), 90),
        jpeg(nrm, os.path.join(OUT, "floor_normal.jpg"), 70),
        jpeg(orm, os.path.join(OUT, "floor_orm.jpg"), 88),
    ]
    print("floor atlas", S, "px:", [f"{s // 1024} KB" for s in sizes])


if __name__ == "__main__":
    floor_atlas()
