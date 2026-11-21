"""Dedicated campaign-enemy models (Stage 4 character production). Each builder returns the same spec dict as
`characters.py` (`body`, `skin`, `cloth`, `hair`, `eyes`, `accessory`, `name`), so `build_characters.build` exports it on
the SAME 22-bone skeleton as the hero cast: every existing clip, the AnimationMixer, the head-scale rule and the
procedural fallback keep working.

Agbero / Park Enforcer (docs/CHARACTER_PRODUCTION_AGBERO.md): a rugged Lagos park enforcer. Reference sheet
`Enemies/01_Agbero_Park_Enforcer`: sleeveless olive utility vest with chest pockets over a dark graphic tee, orange hazard
bandana on the RIGHT upper arm, taped hands, utility fanny pack (character's left hip, front), radio and keys on the right
belt, faded dark jeans, scuffed grey trainers, short fade. An original fictional face: broad nose, heavy brow, square jaw.
"""
from __future__ import annotations

from dataclasses import replace

import numpy as np

import outfits as o
from characters import cloth_fx, finish_hair, pick, set_rgb, tag
from chargen import MALE_ATHLETIC, build_body, build_face_details, hexrgb, joints_for, paint, smoothstep, srgb_to_linear
from loft import Mesh, box_round, displace_along_normals, sphere, tube, value_noise

# Bulkier than the hero athlete: a working man's frame (wide chest and shoulders, thick neck and forearms).
AGBERO_BODY = replace(
    MALE_ATHLETIC,
    name="agbero",
    height=1.82,
    skin=0x68412a,
    torso=[(y, a * (1.07 + 0.10 * min(1.0, max(0.0, (y - 1.0) / 0.35))), f * 1.06, k * 1.05) for (y, a, f, k) in MALE_ATHLETIC.torso],
    neck_r=MALE_ATHLETIC.neck_r * 1.16,
    head=(0.116, 0.146, 0.132),
    head_y=1.72,
    shoulder_x=MALE_ATHLETIC.shoulder_x * 1.09,
    arm_r=tuple(r * 1.24 for r in MALE_ATHLETIC.arm_r),
    leg_r=tuple(r * 1.07 for r in MALE_ATHLETIC.leg_r),
)


def _lin(h: int) -> np.ndarray:
    return srgb_to_linear(hexrgb(h))


def _box(center, size, h: int, region: str, radius=0.008) -> Mesh:
    m = box_round(center, size, radius=radius, seg=2)
    set_rgb(m, h)
    return tag(m, region)


def _ring(y: float, rx: float, rz: float, h_tall: float, color: int, region: str, cz: float = 0.0, sides: int = 36) -> Mesh:
    """A flat band around the body at height y (belt, strap)."""
    pts = np.array([(0.0, y - h_tall / 2, cz), (0.0, y + h_tall / 2, cz)])
    m = tube(pts, [rx, rx], [rz, rz], sides=sides, rings=3, exponent=2.4, cap_start=False, cap_end=False)
    set_rgb(m, color)
    return tag(m, region)


def _cut_faces(m: Mesh, drop) -> Mesh:
    """Remove faces whose centroid satisfies drop(centroids[N,3]) -> bool[N] (open vest front, armholes)."""
    cen = m.v[m.f].mean(axis=1)
    m.f = m.f[~drop(cen)]
    return m


def _cut_grid(m: Mesh, sides: int, exponent: float, drop) -> Mesh:
    """Remove faces of a `tube` (ring-major vertices) by ring height / column position so the edge follows the grid:
    drop(ax[N,3], uy[N], y[N]) -> bool[N], with ax = |unit x| of the face's three vertex columns and uy the face's mean unit y
    (> 0 = front). Both triangles of a quad see the same columns, so a cut follows the grid in straight lines."""
    from loft import superellipse

    unit = superellipse(sides, exponent)
    col = np.arange(len(m.v)) % sides
    ax = np.abs(unit[col, 0][m.f])
    uy = unit[col, 1][m.f].mean(axis=1)
    y = m.v[m.f][:, :, 1].mean(axis=1)
    m.f = m.f[~drop(ax, uy, y)]
    return m


def agbero() -> dict:
    b = AGBERO_BODY
    j = joints_for(b)
    skin_parts = build_body(b, skip=frozenset({"foot", "Shin"}), lowres=frozenset({"torso", "upperarm", "thigh"}))
    skin = [m for k, m in skin_parts.items()]
    # shaded stubble along the jaw and a slightly darker, ruddier brow/nose bridge
    head = skin_parts["head"]
    rx, ry, rz = b.head
    rel_y = (head.v[:, 1] - b.head_y) / ry
    rel_z = (head.v[:, 2] - 0.012) / rz
    stubble = smoothstep(-0.1, -0.7, rel_y) * smoothstep(0.0, 0.5, rel_z) * (rel_y > -0.97)
    head.c[:, :3] *= (1.0 - 0.17 * stubble)[:, None]

    olive, olive_dk, olive_lt = 0x56684a, 0x36422f, 0x6b7d5c
    tee, tee_print_r, tee_print_w = 0x3a3d42, 0xb83a2e, 0xd8d1c0
    denim, denim_fade, denim_dk = 0x3c5778, 0x6784a6, 0x2a3c57
    orange, tape, tape_dk = 0xf06a1c, 0xd9ccaa, 0xb2a581
    pack, pack_dk, strap = 0x8c8664, 0x5e5a42, 0x2a2622
    cloth: list[Mesh] = []

    # ---- undershirt: dark tee with a worn red/white chest print; short cap sleeves
    shirt = o.torso_cloth(b, 0.80, 1.49, extra=0.011, baggy=0.004, sides=36, rings=16)

    def tee_col(v):
        # a worn chest print as soft, continuous blends (hard-edged masks alias at this vertex density)
        y, x, z = v[:, 1], v[:, 0], v[:, 2]
        d = np.sqrt((x / 0.052) ** 2 + ((y - 1.18) / 0.085) ** 2)
        front = smoothstep(0.0, 0.05, z)
        red = (1.0 - smoothstep(0.35, 0.65, d)) * front
        white = (1.0 - smoothstep(0.75, 1.05, d)) * front * (1.0 - red)
        col = hexrgb(tee)[None, :] * (1 - white[:, None]) + hexrgb(tee_print_w)[None, :] * white[:, None]
        return col * (1 - red[:, None]) + hexrgb(tee_print_r)[None, :] * red[:, None]

    paint(shirt, tee_col)
    cloth.append(tag(cloth_fx(shirt, wrinkle=0.0024, seed=51), "torso"))
    for side in "LR":
        sl = o.sleeve(b, side, 0.26, extra=0.009, sides=18, rings=8)
        set_rgb(sl, tee)
        cloth.append(tag(cloth_fx(sl, wrinkle=0.002, seed=52), f"arm_{side}"))

    # ---- utility vest: open front, armholes cut, standing collar, chest + lower pockets
    VS = 44
    vest = o.torso_cloth(b, 0.895, 1.505, extra=0.024, baggy=0.012, sides=VS, rings=18, bottom_flare=0.010, boundaries=[0.925])
    _cut_grid(vest, VS, 2.3, lambda ax, uy, y: (uy > 0) & (ax.max(axis=1) < 0.30) & (y > 0.93))  # open front
    _cut_grid(vest, VS, 2.3, lambda ax, uy, y: (ax.min(axis=1) > 0.80) & (y > 1.20))  # armholes

    def vest_col(v):
        y = v[:, 1]
        wear = value_noise(v, 30.0, seed=8)
        col = pick(len(v), [(y < 0.925, olive_dk)], olive)
        col = col * (0.92 + 0.14 * wear)[:, None]
        return np.clip(col, 0, 1)

    paint(vest, vest_col)
    cloth.append(tag(cloth_fx(vest, wrinkle=0.0036, seed=53, shade=0.26), "torso"))

    for sx in (-1, 1):  # front edge binding along the open front
        cloth.append(_box((sx * 0.066, 1.2, 0.168), (0.016, 0.58, 0.012), olive_dk, "torso", 0.004))
    # standing collar
    cp = np.array([(0.0, 1.455, 0.0), (0.0, 1.52, 0.012)])
    collar = tube(cp, [b.neck_r * 1.75] * 2, [b.neck_r * 1.55] * 2, sides=24, rings=4, exponent=2.2, cap_start=False, cap_end=False)
    _cut_faces(collar, lambda c: (c[:, 2] > 0.0) & (np.abs(c[:, 0]) < 0.03))
    set_rgb(collar, olive_dk)
    cloth.append(tag(collar, "torso"))

    # chest pockets with flaps and buttons, two big lower pockets
    for sx in (-1, 1):
        cloth.append(_box((sx * 0.105, 1.30, 0.128), (0.074, 0.08, 0.026), olive_dk, "torso", 0.006))
        cloth.append(_box((sx * 0.105, 1.335, 0.139), (0.082, 0.026, 0.012), olive_lt, "torso", 0.004))  # flap
        cloth.append(_box((sx * 0.105, 1.325, 0.146), (0.014, 0.014, 0.006), 0x9b9380, "torso", 0.003))  # button
        cloth.append(_box((sx * 0.118, 1.02, 0.128), (0.088, 0.095, 0.03), olive_dk, "torso", 0.007))
        cloth.append(_box((sx * 0.118, 1.058, 0.14), (0.094, 0.03, 0.012), olive_lt, "torso", 0.004))

    # ---- belt, jeans, fanny pack, radio, keys
    pants = o.pelvis_cloth(b, 0.88, 0.70, extra=0.018)
    paint(pants, lambda v: np.tile(hexrgb(denim), (len(v), 1)))
    cloth.append(tag(cloth_fx(pants, seed=54), "torso"))
    for side in "LR":
        ms = 1.0 if side == "L" else -1.0
        jean = o.leg_cloth(b, side, 0.075, extra=0.030, flare=0.004, sides=14, rings=10, y_start_offset=-0.02)

        def denim_col(v, mm=ms):
            y, z = v[:, 1], v[:, 2]
            n = value_noise(v, 22.0, seed=9)
            fade = smoothstep(0.6, 0.95, y) * 0.0 + (np.exp(-((y - 0.62) / 0.12) ** 2) + np.exp(-((y - 0.30) / 0.10) ** 2)) * (z > 0.0) * 0.55
            fade = np.clip(fade + 0.2 * (n - 0.3), 0, 0.5)
            base = hexrgb(denim)
            col = base[None, :] * (1 - fade[:, None]) + hexrgb(denim_fade)[None, :] * fade[:, None]
            col = np.where((y < 0.095)[:, None], hexrgb(denim_dk)[None, :] * 0.9, col)  # dirty hem
            return col

        paint(jean, denim_col)
        cloth.append(tag(cloth_fx(jean, wrinkle=0.0032, seed=55, shade=0.28), f"leg_{side}"))
        shoe = o.sneaker(b, side, bulk=1.3)
        sole, upper, panel, accent, lace = 0xe3ddd0, 0x9ea3a8, 0x6c7078, 0x2e3d78, 0xe7e2d6

        def shoe_col(v):
            y, z = v[:, 1], v[:, 2]
            n = value_noise(v, 60.0, seed=12)
            col = pick(
                len(v),
                [
                    (y < 0.030, sole),
                    ((z < -0.05) & (y > 0.03), panel),
                    ((z > 0.12) & (y > 0.032) & (y < 0.07), accent),
                    ((np.abs(v[:, 0]) > 0) & (y > 0.075) & (z > 0.0) & (z < 0.1), lace),
                ],
                upper,
            )
            return np.clip(col * (0.86 + 0.2 * n)[:, None], 0, 1)

        paint(shoe, shoe_col)
        cloth.append(tag(shoe, f"foot_{side}"))
        sk = o.sock(b, side, 0.10)
        set_rgb(sk, 0xcfcabe)
        cloth.append(tag(sk, f"leg_{side}"))

    cloth.append(_ring(0.872, b.torso[0][1] * 1.07 + 0.026, (b.torso[0][2] + b.torso[0][3]) / 2 * 1.0 + 0.02, 0.035, strap, "torso"))
    cloth.append(_box((0.0, 0.872, (b.torso[0][2]) + 0.034), (0.04, 0.034, 0.008), 0xb7b2a4, "torso", 0.003))  # buckle
    # fanny pack (character's left hip, front) with a zip seam and a clip
    cloth.append(_box((0.085, 0.815, 0.166), (0.23, 0.14, 0.09), pack, "torso", 0.026))
    cloth.append(_box((0.085, 0.855, 0.206), (0.2, 0.014, 0.014), pack_dk, "torso", 0.004))
    cloth.append(_box((0.085, 0.8, 0.214), (0.09, 0.06, 0.012), pack_dk, "torso", 0.006))
    # radio and keys on the right hip
    cloth.append(_box((-0.166, 0.845, 0.06), (0.04, 0.115, 0.03), 0x15161a, "torso", 0.005))
    cloth.append(_box((-0.166, 0.925, 0.06), (0.009, 0.08, 0.009), 0x15161a, "torso", 0.002))  # aerial
    cloth.append(_box((-0.16, 0.775, 0.115), (0.026, 0.05, 0.01), 0xb9bcc2, "torso", 0.003))  # key ring
    cloth.append(_box((-0.16, 0.775, 0.118), (0.012, 0.03, 0.006), 0xa9acb0, "torso", 0.002))

    # ---- orange hazard bandana on the right upper arm, knot tails hanging off the outer side
    sh, el = j["upperarm_R"], j["forearm_R"]
    c = sh + (el - sh) * 0.34
    r = b.arm_r[0] * 0.82 + (b.arm_r[1] * 0.98 - b.arm_r[0] * 0.82) * 0.34 + 0.011
    band = tube(np.array([c + (0, 0.046, 0), c, c - (0, 0.046, 0)]), [r, r + 0.004, r], [r, r + 0.004, r], sides=18, rings=5, cap_start=False, cap_end=False)
    set_rgb(band, orange)
    cloth.append(tag(band, "arm_R"))
    for k, (dy, ang) in enumerate(((-0.01, 0.5), (-0.02, -0.15))):
        tail = box_round((c[0] - r - 0.004, c[1] + dy - 0.04 * (k + 1), c[2] + 0.002 * k), (0.02, 0.09, 0.036), radius=0.005, seg=2)
        tail.v[:, 0] -= (tail.v[:, 1] - (c[1] + dy - 0.04 * (k + 1))) * ang * 0.6
        set_rgb(tail, orange)
        cloth.append(tag(tail, "arm_R"))
    knot = sphere((c[0] - r - 0.002, c[1] + 0.004, c[2]), (0.022, 0.024, 0.026), lat=6, lon=8)
    set_rgb(knot, 0xd95410)
    cloth.append(tag(knot, "arm_R"))

    # ---- taped hands: wrist wrap + knuckle wrap with an alternating dirty band
    for side in "LR":
        wrist, hand, tip = j[f"forearm_{side}"] * 0.34 + j[f"hand_{side}"] * 0.66, j[f"hand_{side}"], j[f"hand_tip_{side}"]
        pts = np.array([wrist, hand, hand * 0.62 + tip * 0.38])
        rr = [b.arm_r[2] + 0.006, b.arm_r[2] * 1.05 + 0.006, b.arm_r[2] * 1.2 + 0.004]
        wrap = tube(pts, rr, rr, sides=12, rings=10, cap_start=False, cap_end=True)
        paint(wrap, lambda v, m=wrap: np.where((np.sin(m.along * 38.0) > 0.35)[:, None], hexrgb(tape_dk)[None, :], hexrgb(tape)[None, :]))
        cloth.append(tag(wrap, f"arm_{side}"))

    # ---- hair: tight fade, high hairline; face details with a heavy brow
    hair = [tag(o.hair_shell(b, 0.004, hairline=0.40, nape=-0.30, bumps=0.0012, seed=3), "head")]
    finish_hair(hair, 0x0c0a09, sheen=0.1)
    face = build_face_details(b)
    brows = face["brows"]
    brows.v[:, 1] -= 0.006  # a lowered, stern brow
    brows.v[:, 2] += 0.002
    return dict(body=b, skin=skin + [face["ears"]], cloth=cloth, hair=hair + [brows], eyes=[face["eyes"]], accessory=[], name="agbero")


ENEMIES = {"agbero": agbero}
