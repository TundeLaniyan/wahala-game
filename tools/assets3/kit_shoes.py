"""Footwear fitted to the measured foot: lofted sneaker / boot shells with a flat sole, toe cap and heel."""
from __future__ import annotations

import numpy as np

import charkit as ck
from charkit import Part, hexrgb
from loft import tube


def foot_profile(skin: Part, j: dict, side: str, bins: int = 7):
    """Per-z bins of the foot: centre x, half width, top y (instep) over the foot vertices."""
    sgn = 1 if side == "L" else -1
    sel = ((skin.v[:, 0] * sgn) > 0.03) & (skin.v[:, 1] < 0.11)
    fv = skin.v[sel]
    z0, z1 = fv[:, 2].min(), fv[:, 2].max()
    edges = np.linspace(z0, z1, bins + 1)
    out = []
    for i in range(bins):
        m = (fv[:, 2] >= edges[i]) & (fv[:, 2] <= edges[i + 1] + 1e-9)
        if m.sum() < 3:
            m = np.abs(fv[:, 2] - (edges[i] + edges[i + 1]) / 2) < (edges[1] - edges[0])
        q = fv[m]
        out.append(((edges[i] + edges[i + 1]) / 2, (q[:, 0].min() + q[:, 0].max()) / 2, (q[:, 0].max() - q[:, 0].min()) / 2, q[:, 1].max(), q[:, 1].min()))
    return np.array(out), z0, z1


def sneaker(skin: Part, j: dict, side: str, upper=0x7e838a, sole=0xe9e5dc, accent=0xd9d4c8, name: str = "shoe", bulk: float = 1.0, high: float = 0.0, toe_box: float = 1.0) -> list[Part]:
    """High: extra shaft height (boot).  Returns the shoe shell part(s)."""
    prof, z0, z1 = foot_profile(skin, j, side)
    z = prof[:, 0]
    pad = 0.011 * bulk
    zs = np.concatenate([[z0 - pad], z, [z1 + pad * 1.4]])
    xc = np.concatenate([[prof[0, 1]], prof[:, 1], [prof[-1, 1]]])
    hw = np.concatenate([[prof[0, 2] * 0.55 + pad], prof[:, 2] + pad, [prof[-1, 2] * 0.6 + pad]])
    top = np.concatenate([[prof[0, 3] * 0.7], np.maximum(prof[:, 3], 0.04) + pad * 0.8, [0.035 + pad]])
    top[1:-1] = np.maximum(top[1:-1], 0.05)
    # ankle area (back third) is taller; the toe box is lower
    n = len(zs)
    top[: n // 2 + 1] = np.maximum(top[: n // 2 + 1], 0.085 + high)
    top[-3:] = np.minimum(top[-3:], 0.052 * toe_box + pad)
    bot = np.zeros(n) - 0.0
    ycen = (top + bot) / 2
    path = np.stack([xc, ycen, zs], axis=1)
    m = tube(path, hw, (top - bot) / 2, sides=18, rings=16, exponent=2.5, front=(top - bot) / 2, back=(top - bot) / 2, hint=(0, 1, 0), cap_start=True, cap_end=True)
    p = ck._mk(f"{name}_{side}", "cloth", m, ck.bone_w(1, f"foot_{side}"), hexrgb(upper))
    p.w = ck.bone_w(len(p.v), f"foot_{side}")
    toe_w = ck.bone_w(1, f"toe_{side}")[0]
    # toe part follows the toe bone
    tz = j[f"toe_{side}"][2]
    t = np.clip((p.v[:, 2] - (tz - 0.01)) / 0.05, 0, 1)[:, None]
    p.w = p.w * (1 - t) + toe_w[None, :] * t
    p.v[:, 1] = np.maximum(p.v[:, 1], 0.0)
    y = p.v[:, 1]
    zrel = (p.v[:, 2] - z0) / max(z1 - z0, 1e-6)
    col = np.tile(hexrgb(upper), (len(p.v), 1))
    col[y < 0.030] = hexrgb(sole)
    col[(zrel > 0.78) & (y >= 0.030)] = hexrgb(accent)  # toe cap
    col[(zrel < 0.14) & (y >= 0.030) & (y < 0.085)] = hexrgb(accent) * 0.85  # heel counter
    p.c = col
    return [p]


def boot(skin: Part, j: dict, side: str, leather=0x1d1b19, sole=0x0e0e0f, name="boot", shaft=0.20, toecap=0x2c2a27) -> list[Part]:
    parts = sneaker(skin, j, side, upper=leather, sole=sole, accent=toecap, name=name, bulk=1.25, high=0.02, toe_box=1.25)
    f = j[f"foot_{side}"]
    shin = j[f"shin_{side}"]
    sh = ck.prim_cyl(f"{name}_shaft_{side}", "cloth", (shin[0] * 0.2 + f[0] * 0.8, 0.045, f[2] + 0.0), (shin[0] * 0.3 + f[0] * 0.7, shaft, shin[2] * 0.5 + f[2] * 0.5), 0.060, 0.064, f"shin_{side}", hexrgb(leather), sides=16, exponent=2.2)
    sh.w = ck.bone_w(len(sh.v), f"shin_{side}")
    ycl = (sh.v[:, 1] - 0.045) / (shaft - 0.045)
    sh.w = sh.w * np.clip(ycl, 0, 1)[:, None] + ck.bone_w(len(sh.v), f"foot_{side}") * (1 - np.clip(ycl, 0, 1))[:, None]
    return parts + [sh]
