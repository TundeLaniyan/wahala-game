"""Skin texture baking: rasterise the skin mesh into UV space (positions per texel) and paint facial features procedurally.

All features are defined in 3D (metres, character space) from measured landmarks, so one painter serves every body type.
Textures are returned as PIL images (RGB); UVs follow the OBJ convention (v up) and are flipped at export.
"""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage

from charkit import Part, hexrgb


def raster(verts: np.ndarray, tris: np.ndarray, uv: np.ndarray, res: int):
    """Per-texel 3D position and coverage mask (barycentric rasterisation, v up -> image rows from the top)."""
    pos = np.zeros((res, res, 3))
    mask = np.zeros((res, res), dtype=bool)
    px = uv[:, 0] * res
    py = (1.0 - uv[:, 1]) * res
    for t in tris:
        x, y = px[t], py[t]
        x0, x1 = int(np.floor(x.min())), int(np.ceil(x.max()))
        y0, y1 = int(np.floor(y.min())), int(np.ceil(y.max()))
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, res - 1), min(y1, res - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if abs(d) < 1e-12:
            continue
        l0 = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / d
        l1 = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / d
        l2 = 1 - l0 - l1
        inside = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not inside.any():
            continue
        p = l0[..., None] * verts[t[0]] + l1[..., None] * verts[t[1]] + l2[..., None] * verts[t[2]]
        sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
        pos[sl][inside] = p[inside]
        mask[sl] |= inside
    return pos, mask


def dilate(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Fill uncovered texels from the nearest covered one (padding against seams / mip bleeding)."""
    _, (iy, ix) = ndimage.distance_transform_edt(~mask, return_indices=True)
    return img[iy, ix]


def value_noise3(p: np.ndarray, scale: float, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    g = rng.normal(0, 1, (9, 3))
    ph = rng.uniform(0, 6.28, 9)
    q = p.reshape(-1, 3) * scale
    out = np.zeros(len(q))
    for k in range(9):
        out += np.sin(q @ g[k] + ph[k])
    return (out / 3.0).reshape(p.shape[:-1])


def landmarks(skin_src: Part, helpers: dict, joints: dict) -> dict:
    v = skin_src.v
    ey = (helpers["eye_L"][1] + helpers["eye_R"][1]) / 2
    ez = helpers["eye_L"][2]
    ex = abs(helpers["eye_L"][0])
    face = (v[:, 1] > ey - 0.115) & (v[:, 1] < ey + 0.01) & (np.abs(v[:, 0]) < 0.03)
    nose = v[face][np.argmax(v[face][:, 2])]
    chin_sel = (v[:, 1] > ey - 0.16) & (v[:, 1] < ey - 0.05) & (np.abs(v[:, 0]) < 0.02) & (v[:, 2] > nose[2] - 0.045)
    chin = v[chin_sel][np.argmin(v[chin_sel][:, 1])] if chin_sel.any() else np.array([0, ey - 0.12, nose[2] - 0.02])
    mouth_y = nose[1] + (chin[1] - nose[1]) * 0.46
    return dict(eye_y=ey, eye_z=ez, eye_x=ex, nose=nose, chin=chin, mouth_y=mouth_y)


def paint_skin(pos: np.ndarray, mask: np.ndarray, lm: dict, base: int, *, brow: int = 0x1a110c, brow_thick: float = 1.0, brow_len: float = 1.0, beard: float = 0.0, mustache: float = 0.0, lip: float = 0.35,
               seed: int = 1, freckles: float = 0.0, scar: bool = False, eye_shadow: float = 0.18, cheek_warm: float = 0.05, scalp: dict | None = None) -> np.ndarray:
    res = pos.shape[0]
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    b = hexrgb(base)
    n1 = value_noise3(pos, 9.0, seed)
    n2 = value_noise3(pos, 55.0, seed + 1)
    col = np.ones((res, res, 3)) * b
    col *= (1.0 + 0.035 * n1 + 0.012 * n2)[..., None]
    ey, ez, ex = lm["eye_y"], lm["eye_z"], lm["eye_x"]
    front = z > ez - 0.045
    # cheeks a touch warmer / redder
    for s in (1, -1):
        d = ((x - s * (ex + 0.012)) / 0.03) ** 2 + ((y - (ey - 0.035)) / 0.03) ** 2
        w = np.exp(-d) * front * cheek_warm
        col = col * (1 - w[..., None]) + col * np.array([1.12, 0.96, 0.92]) * w[..., None]
    # eye sockets: soft darker rings
    for s in (1, -1):
        d = ((x - s * ex) / 0.026) ** 2 + ((y - (ey - 0.002)) / 0.017) ** 2
        w = np.clip(1.2 - d, 0, 1) * front * eye_shadow
        col *= (1 - w[..., None] * 0.55)
    # eyebrows
    for s in (1, -1):
        t = (np.abs(x) - (ex - 0.017)) / (0.050 * brow_len)
        ok = (t > 0) & (t < 1) & (np.sign(x) == s) & front
        yc = ey + 0.026 + 0.010 * np.sin(np.pi * np.clip(t, 0, 1)) * 0.9 - 0.005 * (1 - np.clip(t, 0, 1)) + 0.003 * t
        th = 0.0062 * brow_thick * (1.0 - 0.55 * np.clip(t, 0, 1) ** 1.5)
        inside = ok & (np.abs(y - yc) < th)
        hair = 0.55 + 0.45 * (value_noise3(pos, 160.0, seed + 5) > -0.2)
        a = np.clip((1 - np.abs(y - yc) / np.maximum(th, 1e-6)) * 1.8, 0, 1) * inside * hair
        col = col * (1 - a[..., None]) + hexrgb(brow) * a[..., None]
    # lips
    my, nz = lm["mouth_y"], lm["nose"][2]
    lip_d = (x / 0.027) ** 2 + ((y - my) / 0.0105) ** 2
    lip_m = (lip_d < 1.0) & (z > nz - 0.04)
    lip_col = np.array([0.34, 0.15, 0.13]) * (0.95 + 0.1 * n2[..., None])
    a = lip_m * lip
    col = col * (1 - a[..., None]) + (col * 0.55 + lip_col * 0.45) * a[..., None]
    line = (np.abs(y - my + 0.0008) < 0.0011) & (np.abs(x) < 0.0225 * (1 - 0.15 * np.abs(x) / 0.02)) & (z > nz - 0.04)
    col = np.where(line[..., None], col * 0.35, col)
    # nostrils
    for s in (1, -1):
        d = ((x - s * 0.0105) / 0.0042) ** 2 + ((y - (lm["nose"][1] - 0.0045)) / 0.0032) ** 2
        col *= (1 - (d < 1)[..., None] * 0.6)
    # stubble / beard / mustache
    chin_y = lm["chin"][1]
    jaw = (y < my + 0.003) & (y > chin_y - 0.012) & (np.abs(x) < 0.075) & (z > lm["eye_z"] - 0.1) & (z < nz)
    must = (y > my + 0.011) & (y < lm["nose"][1] - 0.007) & (np.abs(x) < 0.024) & (z > nz - 0.03)
    dots = (value_noise3(pos, 400.0, seed + 9) + 0.6 * value_noise3(pos, 700.0, seed + 11)) > (1.3 - 1.6 * 0.0)
    for region, amt in ((jaw, beard), (must, mustache)):
        if amt > 0:
            soft = 0.18 * amt * region
            dense = (value_noise3(pos, 480.0, seed + 13) > (0.9 - 1.5 * amt)) * region * 0.85
            col *= (1 - soft[..., None])
            col = col * (1 - dense[..., None] * 0.9) + hexrgb(0x0f0a08) * dense[..., None] * 0.9
    if freckles > 0:
        fr = (value_noise3(pos, 300.0, seed + 21) > 1.15 - freckles) & front & (y > ey - 0.05) & (y < ey + 0.0)
        col = np.where(fr[..., None], col * 0.82, col)
    if scar:
        sc = (np.abs((x - 0.03) * 0.8 + (y - (ey - 0.02)) * 0.6) < 0.0016) & (np.abs(y - (ey - 0.012)) < 0.03) & front
        col = np.where(sc[..., None], col * np.array([1.2, 1.05, 1.0]), col)
    if scalp:
        # painted short hair: colour above a curved hairline (higher at the temples), soft fade edge, strand speckle
        hy = ey + scalp.get("line", 0.075) + scalp.get("temple", 0.012) * np.clip(np.abs(x) / 0.07, 0, 1) ** 1.5
        back = np.clip((lm["nose"][2] - 0.06 - z) / 0.05, 0, 1)  # always hair behind the ears
        fade = scalp.get("fade", 0.025)
        a = np.clip((y - hy) / fade, 0, 1)
        a = np.maximum(a, back * (y > lm["chin"][1] + 0.06))
        # ear gap: no hair on the ears themselves
        hairc = hexrgb(scalp.get("color", 0x0d0a09))
        strand = 1.0 + 0.25 * value_noise3(pos, 380.0, seed + 31)
        hc = hairc * strand[..., None]
        # fade haircut: lower near the sides / nape shows skin through
        low = scalp.get("low_fade", 0.0)
        if low > 0:
            sideb = np.clip((np.abs(x) - 0.060) / 0.03, 0, 1) * np.clip((ey + 0.035 - y) / 0.05 + 0.5, 0, 1)
            hc = hc * (1 - 0.0) + col * (1 - low * (0.35 + 0.6 * sideb))[..., None] * 0 + hc
        col = col * (1 - a[..., None]) + hc * a[..., None]
    return np.clip(col, 0, 1)


def bake(skin: Part, skin_src: Part, helpers: dict, joints: dict, base: int, res: int = 1024, **kw) -> Image.Image:
    pos, mask = raster(skin.v, skin.t, skin.uv, res)
    lm = landmarks(skin_src, helpers, joints)
    col = paint_skin(pos, mask, lm, base, **kw)
    col = dilate(col, mask)
    return Image.fromarray((col * 255 + 0.5).astype(np.uint8), "RGB")
