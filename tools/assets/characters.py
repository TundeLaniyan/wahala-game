"""The WAHALA! cast: outfit definitions. Each builder returns material-grouped meshes with region tags."""
from __future__ import annotations

import numpy as np

import outfits as o
from chargen import FEMALE, MALE_ATHLETIC, MALE_SLIM, build_body, build_face_details, hexrgb, paint, srgb_to_linear
from loft import Mesh, displace_along_normals, sphere, value_noise


def tag(m: Mesh, region: str) -> Mesh:
    m.region = [region] * len(m.v)
    return m


def cloth_fx(m: Mesh, wrinkle: float = 0.0028, seed: int = 11, shade: float = 0.20) -> Mesh:
    """Fabric wrinkles + fold shading baked into vertex colours."""
    n = value_noise(m.v, 26.0, seed=seed)
    displace_along_normals(m, n * wrinkle)
    m.c[:, :3] *= (1.0 - shade * (0.5 - 0.5 * n))[:, None]
    return m


def pick(n: int, rules, default: int) -> np.ndarray:
    """Colour per vertex: first matching (mask, hex) rule wins, else `default`. Returns [n,3] sRGB 0..1."""
    out = np.tile(hexrgb(default), (n, 1))
    taken = np.zeros(n, dtype=bool)
    for mask, h in rules:
        sel = mask & ~taken
        out[sel] = hexrgb(h)
        taken |= mask
    return out


def set_rgb(m: Mesh, h: int) -> Mesh:
    m.c[:, :3] = srgb_to_linear(hexrgb(h))
    return m


def finish_hair(meshes: list[Mesh], base: int, sheen: float = 0.25, seed: int = 2) -> list[Mesh]:
    for hm in meshes:
        set_rgb(hm, base)
        hm.c[:, :3] *= (1.0 + sheen * value_noise(hm.v, 70.0, seed=seed))[:, None].clip(0.6, 1.4)
    return meshes


# ----------------------------------------------------------------------------- Street Baller


def street_baller() -> dict:
    b = MALE_ATHLETIC
    green, white, deep = 0x0a8a43, 0xf3f0e6, 0x066b33
    skin = build_body(b, skip=frozenset({"foot"}), lowres=frozenset({"torso"}))
    cloth: list[Mesh] = []

    bounds = [0.82, 1.17, 1.25, 1.272, 1.475]
    jersey = o.torso_cloth(b, 0.78, 1.505, extra=0.022, baggy=0.014, rings=10, boundaries=bounds, bottom_flare=0.034)

    def jersey_col(v):
        y, x = v[:, 1], v[:, 0]
        return pick(len(v), [(y < 0.82, white), (y > 1.475, white), ((y >= 1.25) & (y < 1.272), deep), ((y >= 1.17) & (y < 1.25), white)], green) * (1 - 0.16 * np.clip((np.abs(x) - 0.10) / 0.07, 0, 1))[:, None]

    paint(jersey, jersey_col)
    cloth.append(tag(cloth_fx(jersey), "torso"))
    for side in "LR":
        sl = o.sleeve(b, side, 0.62, extra=0.012, cuff_flare=0.003, cut=0.70)
        paint(sl, lambda v, m=sl: pick(len(v), [(m.along > 0.70, white)], green))
        cloth.append(tag(cloth_fx(sl, seed=12), f"arm_{side}"))
        cloth.append(tag(o.wristband(b, side, white), f"arm_{side}"))
    shorts = o.pelvis_cloth(b, 0.88, 0.74, extra=0.012)
    set_rgb(shorts, white)
    cloth.append(tag(cloth_fx(shorts, seed=13), "torso"))
    for side in "LR":
        sh = o.leg_cloth(b, side, 0.60, extra=0.020, flare=0.012, y_start_offset=-0.06)
        set_rgb(sh, white)
        cloth.append(tag(cloth_fx(sh, seed=14), f"leg_{side}"))
        sk = o.sock(b, side, 0.30)
        paint(sk, lambda v, m=sk: pick(len(v), [(m.along < 0.22, green)], white))
        cloth.append(tag(sk, f"leg_{side}"))
        shoe = o.sneaker(b, side, bulk=1.05)
        paint(shoe, lambda v: pick(len(v), [(v[:, 1] < 0.026, 0xa9a69c), ((v[:, 2] < -0.045) | ((np.abs(v[:, 1] - 0.05) < 0.007) & (v[:, 2] > -0.02) & (v[:, 2] < 0.14)), green)], white))
        cloth.append(tag(shoe, f"foot_{side}"))

    hair = [tag(o.hair_shell(b, 0.007, hairline=0.30, nape=-0.35, bumps=0.003), "head"), tag(o.locs(b, 22, 0.18, seed=8), "head")]
    finish_hair(hair, 0x14100d)
    face = build_face_details(b)
    return dict(body=b, skin=list(skin.values()) + [face["ears"]], cloth=cloth, hair=hair + [face["brows"]], eyes=[face["eyes"]], accessory=[], name="streetBaller")


# ----------------------------------------------------------------------------- Lekki Boy


def lekki_boy() -> dict:
    b = MALE_SLIM
    skin = build_body(b, skip=frozenset({"foot"}), lowres=frozenset({"torso", "upperarm"}))
    teal, white, pink, orange, blue = 0x14b8c8, 0xf4f1e8, 0xf0408a, 0xff8a1f, 0x2c6bff
    cloth: list[Mesh] = []
    bounds = [0.87, 1.20, 1.33, 1.49]
    jacket = o.torso_cloth(b, 0.84, 1.51, extra=0.018, baggy=0.014, bottom_flare=0.012, rings=10, boundaries=bounds)

    def jacket_col(v):
        y = v[:, 1]
        return pick(len(v), [(y < 0.87, 0x1a1a22), (y < 1.20, pink), (y < 1.33, white), (y > 1.49, 0x0f8d9b), ((np.abs(v[:, 0]) < 0.007) & (v[:, 2] > 0), 0xdddddd)], teal)

    paint(jacket, jacket_col)
    cloth.append(tag(cloth_fx(jacket, wrinkle=0.0035, seed=21), "torso"))
    for side, col in (("L", orange), ("R", blue)):
        sl = o.sleeve(b, side, 1.92, extra=0.016, cuff_flare=0.006, cut=0.90)
        paint(sl, lambda v, c=col, m=sl: pick(len(v), [(m.along > 0.90, 0x1a1a22)], c))
        cloth.append(tag(cloth_fx(sl, wrinkle=0.004, seed=22), f"arm_{side}"))
    hood = sphere((0, 1.50, -0.07), (0.105, 0.062, 0.072), lat=7, lon=12)
    set_rgb(hood, 0x0f8d9b)
    cloth.append(tag(cloth_fx(hood, seed=3), "torso"))
    pants = o.pelvis_cloth(b, 0.88, 0.72, extra=0.016)
    set_rgb(pants, 0x15171b)
    cloth.append(tag(cloth_fx(pants, seed=23), "torso"))
    for side in "LR":
        m = 1.0 if side == "L" else -1.0
        jog = o.leg_cloth(b, side, 0.14, extra=0.016, flare=0.004, y_start_offset=-0.06)
        paint(jog, lambda v, mm=m: pick(len(v), [(v[:, 1] < 0.17, 0x15171b), ((v[:, 0] * mm > 0.126) & (v[:, 0] * mm < 0.142), white)], 0x15171b))
        cloth.append(tag(cloth_fx(jog, seed=24), f"leg_{side}"))
        sk = o.sock(b, side, 0.18)
        set_rgb(sk, white)
        cloth.append(tag(sk, f"leg_{side}"))
        shoe = o.sneaker(b, side, bulk=1.14)
        paint(shoe, lambda v: pick(len(v), [(v[:, 1] < 0.03, white), ((v[:, 2] > 0.1) | (v[:, 2] < -0.05), pink)], 0xeeeef2))
        cloth.append(tag(shoe, f"foot_{side}"))
    hair = [tag(o.hair_shell(b, 0.004, hairline=0.42, nape=-0.45), "head"), tag(o.short_curls(b, n=48, radius=0.0145), "head")]
    finish_hair(hair, 0x0e0b09)
    face = build_face_details(b)
    acc = [tag(m, "head") for m in o.sunglasses(b)] + [tag(o.chain(b, 1.32), "torso")]
    return dict(body=b, skin=list(skin.values()) + [face["ears"]], cloth=cloth, hair=hair + [face["brows"]], eyes=[face["eyes"]], accessory=acc, name="lekkiBoy")


# ----------------------------------------------------------------------------- Campus Queen


def campus_queen() -> dict:
    b = FEMALE
    skin = build_body(b, skip=frozenset({"foot"}), lowres=frozenset({"torso", "upperarm", "thigh"}))
    purple, gold, olive, white = 0x8f3dff, 0xffc61a, 0x6a6b3c, 0xf4f1e8
    cloth: list[Mesh] = []
    hoodie = o.torso_cloth(b, 1.07, 1.45, extra=0.016, baggy=0.012, bottom_flare=0.014, rings=8, boundaries=[1.10])

    def hoodie_col(v):
        pocket = (v[:, 2] > 0) & (v[:, 1] < 1.20) & (v[:, 1] > 1.12) & (np.abs(v[:, 0]) < 0.10)
        return pick(len(v), [(v[:, 1] < 1.10, gold), (pocket, 0x7a2fe0)], purple)

    paint(hoodie, hoodie_col)
    cloth.append(tag(cloth_fx(hoodie, wrinkle=0.0035, seed=31), "torso"))
    for side in "LR":
        sl = o.sleeve(b, side, 1.9, extra=0.014, cuff_flare=0.005, cut=0.92)
        paint(sl, lambda v, m=sl: pick(len(v), [(m.along > 0.92, gold)], purple))
        cloth.append(tag(cloth_fx(sl, seed=32), f"arm_{side}"))
    back = sphere((0, 1.38, -0.068), (0.10, 0.058, 0.068), lat=7, lon=12)
    set_rgb(back, 0x7a2fe0)
    cloth.append(tag(cloth_fx(back, seed=5), "torso"))
    pants = o.pelvis_cloth(b, 1.10, 0.72, extra=0.016, boundaries=[1.07])
    paint(pants, lambda v: pick(len(v), [(v[:, 1] > 1.07, 0x3d3d22)], olive))
    cloth.append(tag(cloth_fx(pants, seed=33), "torso"))
    for side in "LR":
        m = 1.0 if side == "L" else -1.0
        pl = o.leg_cloth(b, side, 0.12, extra=0.016, flare=0.012, y_start_offset=-0.06)
        paint(pl, lambda v, mm=m: pick(len(v), [((np.abs(v[:, 1] - 0.62) < 0.08) & (v[:, 0] * mm > 0.10), 0x585a30)], olive))
        cloth.append(tag(cloth_fx(pl, seed=34), f"leg_{side}"))
        shoe = o.sneaker(b, side, bulk=1.1)
        paint(shoe, lambda v: pick(len(v), [(v[:, 1] < 0.034, white), (v[:, 2] < -0.05, gold)], 0xf2f0ec))
        cloth.append(tag(shoe, f"foot_{side}"))
    hair = [tag(o.hair_shell(b, 0.005, hairline=0.34, nape=-0.2), "head"), tag(o.puff(b, 1), "head"), tag(o.puff(b, -1, seed=3), "head")]
    finish_hair(hair, 0x120d0a)
    face = build_face_details(b)
    acc = [tag(m, "head") for m in o.hoop_earrings(b)] + [tag(o.headband(b, gold), "head")]
    return dict(body=b, skin=list(skin.values()) + [face["ears"]], cloth=cloth, hair=hair + [face["brows"]], eyes=[face["eyes"]], accessory=acc, name="campusQueen")


CAST = {"streetBaller": street_baller, "lekkiBoy": lekki_boy, "campusQueen": campus_queen}
