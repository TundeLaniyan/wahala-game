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
    # --- street life (calm states): standing, watching, chatting, carrying, walking
    "idle": {**_arms(((4, 0, -4), (-14, 0, 0)), ((6, 0, 6), (-10, 0, 0))), "head": (2, 8, 0), "hips": (0, 0, 2)},
    "hips": {**_arms(((10, 0, 16), (-95, 0, 0)), ((10, 0, -16), (-95, 0, 0))), "head": (-4, -6, 0)},
    "talk": {**_arms(((4, 0, -4), (-12, 0, 0)), ((-34, 0, -12), (-78, 0, 0))), "chest": (2, -8, 0), "head": (0, -16, 0)},
    "talk_b": {**_arms(((-30, 0, 14), (-84, 0, 0)), ((6, 0, 6), (-10, 0, 0))), "chest": (2, 8, 0), "head": (-2, 14, 0)},
    "phone_ear": {**_arms(((4, 0, -4), (-14, 0, 0)), ((-22, 0, -38), (-142, 0, 0))), "head": (4, 0, -8)},
    "carry": {**_arms(((4, 0, -4), (-12, 0, 0)), ((-12, 0, -158), (-22, 0, 0))), "head": (0, 0, 0)},
    "carry_point": {**_arms(((-80, 0, 40), (-6, 0, 0)), ((-12, 0, -158), (-22, 0, 0))), "head": (-4, 14, 0), "chest": (2, 10, 0)},
    "shout": {**_arms(((-42, 0, 16), (-122, 0, 0)), ((-42, 0, -16), (-122, 0, 0))), "head": (-12, 0, 0), "chest": (-4, 0, 0)},
    "walk_a": {**_arms(((-22, 0, -4), (-18, 0, 0)), ((20, 0, 4), (-8, 0, 0))), "thigh_L": (24, 0, 0), "shin_L": (18, 0, 0), "thigh_R": (-26, 0, 0), "shin_R": (6, 0, 0), "chest": (4, -4, 0), "_t": {"hips": (0, -0.012, 0)}},
    "walk_b": {**_arms(((20, 0, -4), (-8, 0, 0)), ((-22, 0, 4), (-18, 0, 0))), "thigh_L": (-26, 0, 0), "shin_L": (6, 0, 0), "thigh_R": (24, 0, 0), "shin_R": (18, 0, 0), "chest": (4, 4, 0), "_t": {"hips": (0, -0.012, 0)}},
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


# Each spectator is exported in two poses: `pose` (calm: watching, chatting, carrying, walking) and `react`
# (cheering, pointing, shouting...). The game flips between the pair per person (a two-frame flipbook that
# costs nothing to animate) and walks the walkers. `role` decides where the game places them.
# top styles: tee | singlet | ankara | kaftan; bottoms: jeans | shorts | skirt | wrapper
VARIANTS = [
    dict(name="a", body=MALE_ATHLETIC, skin=0x6b4226, pose="idle", react="cheer", role="watch", top=0x0a8a43, bottom="jeans", bcol=0x2a4a7a, hair="short", hcol=0x120d0a, extra="cap_green"),
    dict(name="b", body=MALE_SLIM, skin=0x5a3a22, pose="hips", react="fist", role="watch", top=0xf4f1e8, bottom="shorts", bcol=0x1a1a1a, hair="curls", hcol=0x0e0b09, extra="none"),
    dict(name="c", body=FEMALE, skin=0x7d4d2e, pose="phone", react="cheer", role="watch", top=0xe8453c, bottom="skirt", bcol=0x1a1a1a, hair="puff", hcol=0x120d0a, extra="none"),
    dict(name="d", body=MALE_ATHLETIC, skin=0x4a2c18, pose="folded", react="clap", role="watch", top=0xffc21a, bottom="jeans", bcol=0x15171b, hair="locs", hcol=0x0e0b09, extra="none"),
    dict(name="e", body=FEMALE, skin=0x5b3822, pose="carry", react="carry_point", role="watch", top="ankara", tcols=(0xf08a2c, 0x1d5fb4, 0xf6e7c8), bottom="wrapper", bcol=0x7a2fe0, hair="gele", hcol=0x7a2fe0, extra="basin"),
    dict(name="f", body=MALE_SLIM, skin=0x6b4226, pose="idle", react="point", role="watch", top=0x2f8cff, bottom="shorts", bcol=0xd8d2c2, hair="short", hcol=0x120d0a, extra="cap_white"),
    dict(name="g", body=MALE_ATHLETIC, skin=0x563320, pose="folded", react="shout", role="watch", top=0x33343a, bottom="jeans", bcol=0x24324a, hair="short", hcol=0x0e0b09, extra="none"),
    dict(name="h", body=FEMALE, skin=0x6e4128, pose="hips", react="cheer", role="watch", top=0xffffff, bottom="skirt", bcol=0x0a8a43, hair="puff", hcol=0x120d0a, extra="none"),
    dict(name="i", body=MALE_SLIM, skin=0x7a4a2c, pose="phone_ear", react="cheer", role="watch", top="singlet", tcols=(0xf2efe6,), bottom="jeans", bcol=0x2a3a52, hair="curls", hcol=0x0e0b09, extra="none"),
    dict(name="j", body=MALE_ATHLETIC, skin=0x4f301c, pose="idle", react="wave", role="watch", top="kaftan", tcols=(0x8fb7d9,), bottom="jeans", bcol=0x2a2a30, hair="short", hcol=0x0e0b09, extra="fila"),
    dict(name="k", body=FEMALE, skin=0x80502f, pose="phone", react="clap", role="watch", top="ankara", tcols=(0x0a8a43, 0xffc21a, 0xb3172b), bottom="wrapper", bcol=0x0a8a43, hair="locs", hcol=0x120d0a, extra="none"),
    dict(name="l", body=MALE_SLIM, skin=0x5a3a22, pose="phone", react="point", role="watch", top=0xff7aa8, bottom="jeans", bcol=0x22304a, hair="short", hcol=0x0e0b09, extra="none"),
    # conversation partners (placed in facing pairs)
    dict(name="m", body=MALE_ATHLETIC, skin=0x5e3820, pose="talk", react="point", role="talk", top=0xd94f2a, bottom="jeans", bcol=0x2a3a52, hair="short", hcol=0x0e0b09, extra="cap_white"),
    dict(name="n", body=FEMALE, skin=0x744628, pose="talk_b", react="clap", role="talk", top="ankara", tcols=(0xb3172b, 0xf2b705, 0x1a1a1a), bottom="wrapper", bcol=0xb3172b, hair="gele", hcol=0xf2b705, extra="gele"),
    dict(name="o", body=MALE_SLIM, skin=0x4a2c18, pose="talk_b", react="shout", role="talk", top="kaftan", tcols=(0xf3efe2,), bottom="jeans", bcol=0xe8e2d2, hair="short", hcol=0x0e0b09, extra="fila"),
    dict(name="p", body=FEMALE, skin=0x5b3822, pose="talk", react="wave", role="talk", top=0x2fb5a8, bottom="jeans", bcol=0x1a1a22, hair="puff", hcol=0x120d0a, extra="none"),
    # passers-by (walk cycle: pose / react are the two stride frames)
    dict(name="q", body=MALE_ATHLETIC, skin=0x6b4226, pose="walk_a", react="walk_b", role="walk", top=0x3a7d44, bottom="jeans", bcol=0x24324a, hair="short", hcol=0x0e0b09, extra="none"),
    dict(name="r", body=FEMALE, skin=0x7d4d2e, pose="walk_a", react="walk_b", role="walk", top="ankara", tcols=(0x7a2fe0, 0xf08a2c, 0xf6e7c8), bottom="wrapper", bcol=0x7a2fe0, hair="gele", hcol=0x7a2fe0, extra="basin"),
    dict(name="s", body=MALE_SLIM, skin=0x56351f, pose="walk_a", react="walk_b", role="walk", top="singlet", tcols=(0xf2b705,), bottom="shorts", bcol=0x1a1a1a, hair="curls", hcol=0x0e0b09, extra="none"),
    dict(name="t", body=MALE_ATHLETIC, skin=0x4f301c, pose="walk_a", react="walk_b", role="walk", top="kaftan", tcols=(0xc9b07a,), bottom="jeans", bcol=0x3a3226, hair="short", hcol=0x0e0b09, extra="fila"),
]


def _ankara(m: Mesh, cols, seed: int) -> Mesh:
    """Wax-print look in vertex colours: a hashed 3-colour block pattern with dotted accents."""
    q = np.floor(m.v / 0.045).astype(np.int64)
    h = (q[:, 0] * 73856093) ^ (q[:, 1] * 19349663) ^ (q[:, 2] * 83492791) ^ seed
    idx = np.abs(h) % len(cols)
    rgb = np.array([hexrgb(c) for c in cols])[idx]
    m.c[:, :3] = srgb_to_linear(rgb)
    return m


def basin(b: Body, seed: int = 0) -> list[Mesh]:
    """Enamel basin balanced on the head (pure-water sachets / oranges / bread), market-seller style."""
    rx, ry, rz = b.head
    top = b.head_y + ry + 0.01
    pan = tube(np.array([(0, top, 0.0), (0, top + 0.07, 0.0)]), np.array([0.13, 0.20]), np.array([0.13, 0.20]), sides=14, rings=2, cap_start=True, cap_end=False)
    pan = _tag(_rgb(pan, [0x9a9ea3, 0x2c6fd0, 0xc0392b][seed % 3]), "head")
    rng = np.random.default_rng(seed)
    goods = []
    col = [0xf08a2c, 0xe8c33a, 0xc58a3c][seed % 3]  # oranges, plantain, agege bread
    for k in range(7):
        a = k / 7 * 2 * np.pi + rng.uniform(0, 0.4)
        r = 0.0 if k == 0 else 0.11
        goods.append(_tag(_rgb(sphere((np.cos(a) * r, top + 0.08 + (0.04 if k == 0 else 0), np.sin(a) * r), (0.055, 0.045, 0.055), lat=4, lon=6), col, 0.1, k), "head"))
    return [pan] + goods


def fila(b: Body, color: int) -> list[Mesh]:
    """Soft fila cap (kufi) worn with a kaftan."""
    rx, ry, rz = b.head
    cy = b.head_y
    dome = sphere((0, cy + ry * 0.45, -0.005), (rx + 0.008, ry * 0.55, rz + 0.008), lat=6, lon=12)
    keep = dome.v[:, 1] > cy + ry * 0.35
    dome.f = dome.f[keep[dome.f].all(axis=1)]
    return [_tag(_rgb(dome, color, 0.08, 4), "head")]


def build_variant(v: dict, seed: int = 0) -> Mesh:
    b: Body = v["body"]
    chargen.LOD = 0.42  # crowd LOD: ~1.5k triangles a person (hundreds are instanced around the lot)
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
    tcols = v.get("tcols", (top,) if isinstance(top, int) else (0x888888,))
    style = top if isinstance(top, str) else "tee"
    bt = {"athletic": 0.86, "slim": 0.84, "female": 0.82}[b.name]
    if style == "kaftan":
        bt = 0.52  # long tunic over trousers
    tee = o.torso_cloth(b, bt, b.torso[-1][0] - 0.03, extra=0.018, baggy=0.02 if style == "kaftan" else 0.012, rings=6, sides=12, bottom_flare=0.06 if style == "kaftan" else 0.02)
    if style == "ankara":
        parts.append(_tag(_ankara(tee, tcols, seed), "torso"))
    else:
        parts.append(_tag(_rgb(tee, tcols[0], 0.06, seed), "torso"))
    if style != "singlet":
        for side in "LR":
            sl = o.sleeve(b, side, 0.9 if style == "kaftan" else 0.55, extra=0.02 if style == "kaftan" else 0.014, cuff_flare=0.02 if style == "kaftan" else 0.0, sides=7, rings=3)
            if style == "ankara":
                parts.append(_tag(_ankara(sl, tcols, seed + 1), f"arm_{side}"))
            else:
                parts.append(_tag(_rgb(sl, tcols[0], 0.06, seed + 1), f"arm_{side}"))
    if v["bottom"] == "wrapper":  # ankle-length wrapper
        parts.append(skirt(b, 1.0, 0.16, 0.05, bcol))
    elif v["bottom"] == "skirt":
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
        sh = o.sneaker(b, side, bulk=1.05, sides=7)
        shoe = [0xf2f0ec, 0x1c1c20, 0x8a5a32, 0xd8c8a8][seed % 4]  # trainers, black shoes, leather slippers
        parts.append(_tag(_rgb(sh, shoe, 0.04, seed + 4), f"foot_{side}"))
    h = v["hair"]
    hair_parts: list[Mesh] = []
    if h == "short":
        hair_parts = [o.hair_shell(b, 0.006, hairline=0.34, nape=-0.30)]
    elif h == "curls":
        hair_parts = [o.hair_shell(b, 0.004, hairline=0.42, nape=-0.45), o.short_curls(b, n=9, radius=0.026)]
    elif h == "puff":
        hair_parts = [o.hair_shell(b, 0.005, hairline=0.34, nape=-0.2), o.puff(b, 1), o.puff(b, -1, seed=3)]
    elif h == "locs":
        hair_parts = [o.hair_shell(b, 0.007, hairline=0.30, nape=-0.35), o.locs(b, 8, 0.17, seed=8)]
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
    elif extra == "basin":
        parts += gele(b, v["hcol"]) + basin(b, seed)
    elif extra == "fila":
        parts += fila(b, tcols[0] if style == "kaftan" else 0x7a5a3a)
    # same stylised head ratio as the playable cast
    from build_characters import HEAD_SCALE

    pivot = np.array([0.0, b.head_y - b.head[1] * 0.92, 0.012])
    for m in parts:
        sel = np.array([r == "head" for r in m.region])
        if sel.any():
            m.v[sel] = pivot + (m.v[sel] - pivot) * HEAD_SCALE
    for m in parts:
        m.material = "crowd"
    return merge(parts, "crowd")


def spectator(v: dict, seed: int = 0) -> tuple[Mesh, Mesh]:
    """(calm, react) posed copies of one spectator."""
    m = build_variant(v, seed)
    return pose_mesh(m, v["body"], POSES[v["pose"]]), pose_mesh(m, v["body"], POSES[v["react"]])
