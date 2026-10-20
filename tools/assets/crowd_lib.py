"""Static posed spectators for the arena perimeter, derived from the character pipeline.

Each variant is built from the same lofted bodies as the playable cast (so scale/proportions match), clothed in
simple street outfits, then CPU-skinned into a pose and exported as one low-poly vertex-coloured mesh.
"""
from __future__ import annotations

import numpy as np

import chargen
import outfits as o
from chargen import FEMALE, MALE_ATHLETIC, MALE_SLIM, Body, build_body, hexrgb, joints_for, srgb_to_linear
from loft import Mesh, merge, sphere, tube
from rig import BONE_NAMES, HIERARCHY, rest_translations, skin_weights


# ----------------------------------------------------------------------------- skinning on the CPU


def _rot(rx: float, ry: float, rz: float) -> np.ndarray:
    rx, ry, rz = np.radians([rx, ry, rz])
    cx, sx, cy, sy, cz, sz = np.cos(rx), np.sin(rx), np.cos(ry), np.sin(ry), np.cos(rz), np.sin(rz)
    mx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    my = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    mz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return mx @ my @ mz  # intrinsic X, Y, Z == quaternion qx*qy*qz used by the glTF writer


def pose_matrices(body: Body, pose: dict) -> dict[str, np.ndarray]:
    """Skinning matrices (posed world * inverse rest world) per bone for a pose given in degrees."""
    rest_local, rest_world = rest_translations(body)
    pose = dict(pose)
    trans = pose.pop("_t", {})
    world: dict[str, np.ndarray] = {}
    out: dict[str, np.ndarray] = {}
    for name, parent in HIERARCHY:
        local = np.eye(4)
        local[:3, :3] = _rot(*pose.get(name, (0.0, 0.0, 0.0)))
        local[:3, 3] = rest_local[name] + np.array(trans.get(name, (0.0, 0.0, 0.0)))
        world[name] = (world[parent] if parent else np.eye(4)) @ local
        rest = np.eye(4)
        rest[:3, 3] = rest_world[name]
        out[name] = world[name] @ np.linalg.inv(rest)
    return out


def pose_mesh(m: Mesh, body: Body, pose: dict) -> Mesh:
    joints, weights = skin_weights(m.v, m.region, body)
    mats = pose_matrices(body, pose)
    stack = np.array([mats[b] for b in BONE_NAMES])  # [B,4,4]
    vh = np.c_[m.v, np.ones(len(m.v))]
    out = np.zeros((len(m.v), 3))
    for k in range(4):
        out += weights[:, k : k + 1] * np.einsum("nij,nj->ni", stack[joints[:, k]], vh)[:, :3]
    r = m.copy()
    r.v = out
    return r


# ----------------------------------------------------------------------------- poses (degrees)


def _arms(l, r):
    return {"upperarm_L": l[0], "forearm_L": l[1], "upperarm_R": r[0], "forearm_R": r[1]}


POSES = {
    # both arms thrown up
    "cheer": {**_arms(((-15, 0, 150), (-18, 0, 0)), ((-15, 0, -150), (-18, 0, 0))), "chest": (-6, 0, 0), "head": (-14, 0, 0), "_t": {"hips": (0, 0.0, 0)}},
    # one fist punched into the air, other hand on hip
    "fist": {**_arms(((10, 0, 14), (-95, 0, 0)), ((-168, 0, -12), (-10, 0, 0))), "chest": (-4, 0, 6), "head": (-10, -8, 0)},
    # filming on a phone
    "phone": {**_arms(((6, 0, 10), (-14, 0, 0)), ((-75, 0, -14), (-110, 0, 0))), "head": (6, 0, 0), "chest": (3, 0, 0)},
    # clapping at chest height
    "clap": {**_arms(((-55, 0, 8), (-100, 0, 0)), ((-55, 0, -8), (-100, 0, 0))), "head": (-4, 0, 0)},
    # pointing / shouting
    "point": {**_arms(((8, 0, 12), (-20, 0, 0)), ((-80, 0, -52), (-6, 0, 0))), "chest": (4, -10, 0), "head": (-6, -10, 0)},
    # relaxed, arms folded
    "folded": {**_arms(((-26, 0, 22), (-118, 0, 0)), ((-26, 0, -22), (-118, 0, 0))), "head": (0, 0, 4)},
    # waving a towel / flag overhead on one side
    "wave": {**_arms(((8, 0, 12), (-24, 0, 0)), ((-30, 0, -150), (-30, 0, 0))), "head": (-8, 0, -6), "chest": (0, 0, -6)},
}


# ----------------------------------------------------------------------------- outfit pieces


def _rgb(m: Mesh, h: int, jitter: float = 0.0, seed: int = 0) -> Mesh:
    m.c[:, :3] = srgb_to_linear(hexrgb(h))
    if jitter:
        rng = np.random.default_rng(seed)
        m.c[:, :3] *= 1.0 + jitter * (rng.random(len(m.v)) - 0.5)[:, None]
    return m


def _tag(m: Mesh, region: str) -> Mesh:
    m.region = [region] * len(m.v)
    return m


def cap(b: Body, color: int, brim_color: int | None = None, back: bool = False) -> list[Mesh]:
    rx, ry, rz = b.head
    cy = b.head_y
    dome = sphere((0, cy + 0.012, 0.0), (rx + 0.012, ry * 0.78, rz + 0.012), lat=8, lon=14)
    keep = dome.v[:, 1] > cy + 0.02
    dome.f = dome.f[keep[dome.f].all(axis=1)]
    out = [_tag(_rgb(dome, color), "head")]
    brim = sphere((0, cy + 0.03, rz * (-0.9 if back else 0.95)), (rx * 0.78, 0.007, rz * 0.55), lat=4, lon=10)
    out.append(_tag(_rgb(brim, brim_color or color), "head"))
    return out


def gele(b: Body, color: int) -> list[Mesh]:
    """Big folded head-tie."""
    rx, ry, rz = b.head
    cy = b.head_y
    out = []
    for i, (dx, dz, s) in enumerate([(-0.07, 0.0, 0.085), (0.07, 0.0, 0.085), (0.0, 0.05, 0.075), (0.0, -0.05, 0.07)]):
        out.append(_tag(_rgb(sphere((dx, cy + ry * 0.72 + 0.02, dz), (s * 1.1, s * 0.75, s), lat=7, lon=12), color, 0.18, i), "head"))
    out.append(_tag(_rgb(sphere((0, cy + ry * 0.35, 0), (rx + 0.03, ry * 0.5, rz + 0.03), lat=7, lon=14), color, 0.12, 9), "head"))
    return out


def skirt(b: Body, y_top: float, y_bot: float, flare: float, color: int) -> Mesh:
    a = b.torso[1][1]
    ys = np.linspace(y_bot, y_top, 5)
    path = np.array([(0.0, y, 0.0) for y in ys])
    t = np.linspace(1.0, 0.0, 5)
    r = np.array([a + 0.02 + flare * k for k in t])
    m = tube(path, r, r * 0.8, sides=14, rings=6, cap_start=False, cap_end=False)
    return _tag(_rgb(m, color, 0.08, 3), "torso")


VARIANTS = [
    # name, body, skin, pose, top colour, top style, bottom, bottom colour, hair, extras
    dict(name="a", body=MALE_ATHLETIC, skin=0x6b4226, pose="cheer", top=0x0a8a43, bottom="jeans", bcol=0x2a4a7a, hair="short", hcol=0x120d0a, extra="cap_green"),
    dict(name="b", body=MALE_SLIM, skin=0x5a3a22, pose="fist", top=0xf4f1e8, bottom="shorts", bcol=0x1a1a1a, hair="curls", hcol=0x0e0b09, extra="none"),
    dict(name="c", body=FEMALE, skin=0x7d4d2e, pose="phone", top=0xe8453c, bottom="skirt", bcol=0x1a1a1a, hair="puff", hcol=0x120d0a, extra="none"),
    dict(name="d", body=MALE_ATHLETIC, skin=0x4a2c18, pose="clap", top=0xffc21a, bottom="jeans", bcol=0x15171b, hair="locs", hcol=0x0e0b09, extra="none"),
    dict(name="e", body=FEMALE, skin=0x5b3822, pose="wave", top=0xf08a2c, bottom="jeans", bcol=0x2f3f5a, hair="gele", hcol=0x7a2fe0, extra="gele"),
    dict(name="f", body=MALE_SLIM, skin=0x6b4226, pose="point", top=0x2f8cff, bottom="shorts", bcol=0xd8d2c2, hair="short", hcol=0x120d0a, extra="cap_white"),
    dict(name="g", body=MALE_ATHLETIC, skin=0x563320, pose="folded", top=0x33343a, bottom="jeans", bcol=0x24324a, hair="short", hcol=0x0e0b09, extra="none"),
    dict(name="h", body=FEMALE, skin=0x6e4128, pose="cheer", top=0xffffff, bottom="skirt", bcol=0x0a8a43, hair="puff", hcol=0x120d0a, extra="none"),
    dict(name="i", body=MALE_SLIM, skin=0x7a4a2c, pose="cheer", top=0x0a8a43, bottom="shorts", bcol=0xf4f1e8, hair="curls", hcol=0x0e0b09, extra="cap_green"),
    dict(name="j", body=MALE_ATHLETIC, skin=0x4f301c, pose="wave", top=0xa23cff, bottom="jeans", bcol=0x1a1a1a, hair="short", hcol=0x0e0b09, extra="none"),
    dict(name="k", body=FEMALE, skin=0x80502f, pose="clap", top=0x34c26a, bottom="jeans", bcol=0x2a4a7a, hair="locs", hcol=0x120d0a, extra="none"),
    dict(name="l", body=MALE_SLIM, skin=0x5a3a22, pose="phone", top=0xff7aa8, bottom="jeans", bcol=0x22304a, hair="short", hcol=0x0e0b09, extra="none"),
]


def build_variant(v: dict, seed: int = 0) -> Mesh:
    b: Body = v["body"]
    chargen.LOD = 0.55
    try:
        skin_parts = build_body(b, skip=frozenset({"foot"}), lowres=frozenset({"torso", "upperarm", "thigh"}))
    finally:
        chargen.LOD = 1.0
    skin_parts = {k: m for k, m in skin_parts.items() if not k.startswith("thumb")}
    parts: list[Mesh] = []
    skin_lin = srgb_to_linear(hexrgb(v["skin"]))
    for k, m in skin_parts.items():
        if k == "head":
            m.c[:, :3] *= skin_lin / np.maximum(srgb_to_linear(hexrgb(b.skin)), 1e-3)
        else:
            m.c[:, :3] = skin_lin
        parts.append(m)
    top, bcol = v["top"], v["bcol"]
    bt = {"athletic": 0.86, "slim": 0.84, "female": 0.82}[b.name]
    tee = o.torso_cloth(b, bt, b.torso[-1][0] - 0.03, extra=0.018, baggy=0.012, rings=6, sides=14, bottom_flare=0.02)
    parts.append(_tag(_rgb(tee, top, 0.06, seed), "torso"))
    for side in "LR":
        sl = o.sleeve(b, side, 0.55, extra=0.014, sides=8, rings=4)
        parts.append(_tag(_rgb(sl, top, 0.06, seed + 1), f"arm_{side}"))
    if v["bottom"] == "skirt":
        parts.append(skirt(b, 1.0 if b.name == "female" else 1.0, 0.64, 0.07, bcol))
        for side in "LR":
            parts.append(_tag(_rgb(o.sock(b, side, 0.25), 0xf2f0ec), f"leg_{side}"))
    else:
        parts.append(_tag(_rgb(o.pelvis_cloth(b, 0.90, 0.72, extra=0.016, sides=14, rings=4), bcol, 0.05, seed + 2), "torso"))
        for side in "LR":
            end = 0.60 if v["bottom"] == "shorts" else 0.10
            lg = o.leg_cloth(b, side, end, extra=0.016, flare=0.006, y_start_offset=-0.06, sides=10, rings=6)
            parts.append(_tag(_rgb(lg, bcol, 0.05, seed + 3), f"leg_{side}"))
            if v["bottom"] == "shorts":
                parts.append(_tag(_rgb(o.sock(b, side, 0.26), 0xf2f0ec), f"leg_{side}"))
    for side in "LR":
        sh = o.sneaker(b, side, bulk=1.05, sides=8)
        parts.append(_tag(_rgb(sh, 0xf2f0ec, 0.04, seed + 4), f"foot_{side}"))
    h = v["hair"]
    hair_parts: list[Mesh] = []
    if h == "short":
        hair_parts = [o.hair_shell(b, 0.006, hairline=0.34, nape=-0.30)]
    elif h == "curls":
        hair_parts = [o.hair_shell(b, 0.004, hairline=0.42, nape=-0.45), o.short_curls(b, n=24, radius=0.02)]
    elif h == "puff":
        hair_parts = [o.hair_shell(b, 0.005, hairline=0.34, nape=-0.2), o.puff(b, 1), o.puff(b, -1, seed=3)]
    elif h == "locs":
        hair_parts = [o.hair_shell(b, 0.007, hairline=0.30, nape=-0.35), o.locs(b, 12, 0.17, seed=8)]
    elif h == "gele":
        hair_parts = []
    for hm in hair_parts:
        parts.append(_tag(_rgb(hm, v["hcol"]), "head"))
    extra = v["extra"]
    if extra == "gele":
        parts += gele(b, v["hcol"])
    elif extra.startswith("cap"):
        col = 0x0a8a43 if extra == "cap_green" else 0xf4f1e8
        parts += cap(b, col)
    for m in parts:
        m.material = "crowd"
    return merge(parts, "crowd")


def spectator(v: dict, seed: int = 0) -> Mesh:
    m = build_variant(v, seed)
    return pose_mesh(m, v["body"], POSES[v["pose"]])
