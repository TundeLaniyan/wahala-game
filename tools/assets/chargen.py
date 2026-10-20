"""Procedural, realistic-proportion stylised characters (young Nigerian adults) built from lofted
tubes, written straight to glTF by `build_characters.py`.

Everything is original work generated from code. Units are metres, Y-up, character faces +Z,
character's left is +X.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from loft import Mesh, displace_along_normals, merge, normalize, sphere, tube, value_noise, vertex_normals

# --------------------------------------------------------------------------- colour helpers


def hexrgb(h: int) -> np.ndarray:
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255]) / 255.0


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def paint(m: Mesh, fn) -> Mesh:
    """fn(positions[N,3]) -> colors[N,3] in sRGB 0..1 (converted to linear for glTF vertex colours)."""
    rgb = np.asarray(fn(m.v))
    m.c[:, :3] = srgb_to_linear(rgb)
    return m


# --------------------------------------------------------------------------- body specs


@dataclass
class Body:
    """Control values of a body, measured for a character facing +Z. Heights are absolute metres."""

    name: str
    height: float
    skin: int
    # torso control rows: y, half-width a, front depth, back depth
    torso: list = field(default_factory=list)
    neck_r: float = 0.058
    head: tuple = (0.112, 0.144, 0.128)  # head ellipsoid radii
    head_y: float = 1.70
    shoulder_x: float = 0.205
    arm_r: tuple = (0.054, 0.046, 0.034)  # upper arm top, elbow, wrist
    leg_r: tuple = (0.104, 0.072, 0.063, 0.044)  # thigh top, knee, calf, ankle
    hip_x: float = 0.095
    bust: float = 0.0
    shoe_scale: float = 1.0
    face_soft: float = 0.0  # softer jaw / fuller lips for female look


MALE_ATHLETIC = Body(
    name="athletic",
    height=1.80,
    skin=0x6b4226,
    torso=[
        # y,     a,     front, back
        (0.84, 0.182, 0.108, 0.124),
        (0.96, 0.172, 0.104, 0.116),
        (1.08, 0.150, 0.098, 0.100),
        (1.22, 0.172, 0.112, 0.104),
        (1.36, 0.196, 0.108, 0.100),
        (1.45, 0.200, 0.092, 0.086),
        (1.51, 0.095, 0.070, 0.066),
    ],
)

MALE_SLIM = Body(
    name="slim",
    height=1.77,
    skin=0x56351f,
    torso=[
        (0.84, 0.170, 0.098, 0.112),
        (0.96, 0.160, 0.094, 0.104),
        (1.08, 0.138, 0.088, 0.090),
        (1.22, 0.158, 0.100, 0.094),
        (1.36, 0.178, 0.098, 0.090),
        (1.45, 0.184, 0.085, 0.080),
        (1.51, 0.088, 0.066, 0.062),
    ],
    neck_r=0.050,
    head=(0.106, 0.138, 0.122),
    head_y=1.67,
    shoulder_x=0.192,
    arm_r=(0.048, 0.040, 0.031),
    leg_r=(0.094, 0.065, 0.056, 0.041),
    hip_x=0.088,
)

FEMALE = Body(
    name="female",
    height=1.69,
    skin=0x7d4d2e,
    torso=[
        (0.82, 0.176, 0.100, 0.126),
        (0.92, 0.172, 0.096, 0.120),
        (1.02, 0.128, 0.080, 0.086),
        (1.14, 0.136, 0.092, 0.084),
        (1.26, 0.150, 0.100, 0.088),
        (1.38, 0.168, 0.094, 0.082),
        (1.44, 0.092, 0.066, 0.060),
    ],
    neck_r=0.046,
    head=(0.100, 0.132, 0.116),
    head_y=1.59,
    shoulder_x=0.172,
    arm_r=(0.042, 0.034, 0.027),
    leg_r=(0.098, 0.065, 0.055, 0.039),
    hip_x=0.088,
    bust=0.020,
    face_soft=1.0,
)

# Skeleton rest positions are derived from the same numbers so geometry and rig always agree.


def joints_for(b: Body) -> dict[str, np.ndarray]:
    s = b.height / 1.80
    hx = b.hip_x
    sx = b.shoulder_x
    j = {
        "hips": (0, 0.95 * s, 0),
        "spine": (0, 1.06 * s, 0),
        "chest": (0, 1.24 * s, 0),
        "neck": (0, b.torso[-1][0] - 0.01, 0.005),
        "head": (0, b.torso[-1][0] + 0.065, 0.01),
        "head_top": (0, b.head_y + b.head[1] + 0.005, 0.01),
    }
    for side, m in (("L", 1.0), ("R", -1.0)):
        j[f"clavicle_{side}"] = (0.045 * m, b.torso[-2][0] + 0.01, 0.0)
        j[f"upperarm_{side}"] = (sx * m, b.torso[-2][0] - 0.005, 0.0)
        elbow_y = (b.torso[-2][0] - 0.005) - 0.275 * s
        j[f"forearm_{side}"] = ((sx + 0.088) * m, elbow_y, 0.012)
        wrist_y = elbow_y - 0.245 * s
        j[f"hand_{side}"] = ((sx + 0.155) * m, wrist_y, 0.035)
        j[f"hand_tip_{side}"] = ((sx + 0.172) * m, wrist_y - 0.095 * s, 0.06)
        j[f"thigh_{side}"] = (hx * m, 0.93 * s, 0.0)
        j[f"shin_{side}"] = ((hx + 0.006) * m, 0.51 * s, 0.014)
        j[f"foot_{side}"] = ((hx + 0.006) * m, 0.085 * s, -0.012)
        j[f"toe_{side}"] = ((hx + 0.006) * m, 0.045 * s, 0.115)
        j[f"toe_tip_{side}"] = ((hx + 0.006) * m, 0.03 * s, 0.2)
    return {k: np.array(v, dtype=np.float64) for k, v in j.items()}


# --------------------------------------------------------------------------- body geometry

#: Level of detail multiplier for limb/head tessellation (the crowd builder lowers it).
LOD = 1.0


def _limb(points, ra, rb=None, sides=14, rings=10, exp=2.0, **kw) -> Mesh:
    pts = np.array(points)
    ra = np.asarray(ra, dtype=np.float64)
    rb = ra if rb is None else np.asarray(rb, dtype=np.float64)
    return tube(pts, ra, rb, sides=max(6, int(round(sides * LOD))), rings=max(3, int(round(rings * LOD))), exponent=exp, **kw)


def build_body(b: Body, detail: float = 1.0, skip: frozenset = frozenset(), lowres: frozenset = frozenset()) -> dict[str, Mesh]:
    """Returns named skin parts (region-tagged). Clothes are built separately from the same joints."""
    j = joints_for(b)
    parts: dict[str, Mesh] = {}
    lo = lambda name, hi, lowv: lowv if name in lowres else hi  # noqa: E731

    ys = [r[0] for r in b.torso]
    path = [(0.0, y, 0.0) for y in ys]
    torso = tube(np.array(path), [r[1] for r in b.torso], [(r[2] + r[3]) / 2 for r in b.torso], sides=lo('torso', 22, 12), rings=lo('torso', 18, 8),
                 exponent=2.3, front=[r[2] for r in b.torso], back=[r[3] for r in b.torso], cap_start=True, cap_end=False)
    # bust / chest definition
    if b.bust > 0:
        n = torso.v
        for cy in (b.torso[3][0] + 0.07,):
            for sx in (-0.052, 0.052):
                d = np.exp(-(((n[:, 0] - sx) / 0.045) ** 2 + ((n[:, 1] - cy) / 0.05) ** 2))
                torso.v[:, 2] += np.where(n[:, 2] > 0, d * b.bust, 0)
    torso.region = ["torso"] * len(torso.v)
    parts["torso"] = torso

    neck_path = [j["neck"] + (0, -0.02, 0), j["neck"] + (0, 0.05, 0.012), j["head"] + (0, 0.04, 0.02)]
    neck = _limb(neck_path, [b.neck_r * 1.05, b.neck_r, b.neck_r * 0.95], [b.neck_r * 1.0, b.neck_r * 0.95, b.neck_r * 0.92], sides=14, rings=6, cap_start=False, cap_end=False)
    neck.region = ["neck"] * len(neck.v)
    parts["neck"] = neck

    parts["head"] = build_head(b)

    for side, m in (("L", 1.0), ("R", -1.0)):
        up = _limb([j[f"upperarm_{side}"] + (0, 0.015, 0), j[f"upperarm_{side}"] * 0.5 + j[f"forearm_{side}"] * 0.5, j[f"forearm_{side}"]],
                   [b.arm_r[0] * 0.86, ((b.arm_r[0] + b.arm_r[1]) / 2 + 0.002) * 0.94, b.arm_r[1]], sides=lo('upperarm', 12, 8), rings=lo('upperarm', 8, 5))
        up.region = [f"upperarm_{side}"] * len(up.v)
        fo = _limb([j[f"forearm_{side}"], j[f"forearm_{side}"] * 0.45 + j[f"hand_{side}"] * 0.55, j[f"hand_{side}"]],
                   [b.arm_r[1], b.arm_r[1] * 0.98, b.arm_r[2]], sides=12, rings=7, cap_start=False, cap_end=False)
        fo.region = [f"forearm_{side}"] * len(fo.v)
        hand = _limb([j[f"hand_{side}"] + (0, 0.01, 0), j[f"hand_{side}"] * 0.5 + j[f"hand_tip_{side}"] * 0.5, j[f"hand_tip_{side}"]],
                     [b.arm_r[2] * 1.05, b.arm_r[2] * 1.25, b.arm_r[2] * 0.7], [b.arm_r[2] * 0.62, b.arm_r[2] * 0.7, b.arm_r[2] * 0.42], sides=8, rings=5)
        hand.region = [f"hand_{side}"] * len(hand.v)
        thumb = _limb([j[f"hand_{side}"] + (0.012 * m * -1, -0.01, 0.025), j[f"hand_{side}"] + (0.016 * m * -1, -0.05, 0.05)], [0.011, 0.008], sides=5, rings=3)
        thumb.region = [f"hand_{side}"] * len(thumb.v)
        parts[f"upperarm_{side}"], parts[f"forearm_{side}"], parts[f"hand_{side}"], parts[f"thumb_{side}"] = up, fo, hand, thumb

        thigh = _limb([j[f"thigh_{side}"] + (0, 0.06, 0), j[f"thigh_{side}"] * 0.5 + j[f"shin_{side}"] * 0.5, j[f"shin_{side}"]],
                      [b.leg_r[0] * 0.92, (b.leg_r[0] + b.leg_r[1]) / 2 * 0.95, b.leg_r[1]], sides=lo('thigh', 14, 8), rings=lo('thigh', 9, 5))
        thigh.region = [f"thigh_{side}"] * len(thigh.v)
        shin = _limb([j[f"shin_{side}"], j[f"shin_{side}"] * 0.62 + j[f"foot_{side}"] * 0.38, j[f"foot_{side}"] + (0, 0.02, 0)],
                     [b.leg_r[1], b.leg_r[2], b.leg_r[3]], sides=12, rings=8, cap_start=False)
        shin.region = [f"shin_{side}"] * len(shin.v)
        parts[f"thigh_{side}"], parts[f"shin_{side}"] = thigh, shin

        foot = _limb([j[f"foot_{side}"] + (0, 0.0, -0.02), j[f"toe_{side}"], j[f"toe_tip_{side}"]], [0.036, 0.04, 0.032], [0.05, 0.034, 0.02], sides=10, rings=6, hint=(0, 1, 0))
        foot.region = [f"foot_{side}"] * len(foot.v)
        if 'foot' not in skip:
            parts[f"foot_{side}"] = foot

    # tiny wobble so skin does not look like perfect plastic; base skin colour everywhere except the head
    skin_lin = srgb_to_linear(hexrgb(b.skin))
    for name, m in parts.items():
        if name != 'head':
            m.c[:, :3] = skin_lin
        m.material = 'skin'
    for m in parts.values():
        n = value_noise(m.v, 18.0, seed=3)
        displace_along_normals(m, n * 0.0012)
    return parts


def build_head(b: Body) -> Mesh:
    """Deformed ellipsoid: jaw taper, chin, nose, brow, cheekbones, lips; eyes/brows/ears are separate parts."""
    rx, ry, rz = b.head
    cy = b.head_y
    m = sphere((0, cy, 0.012), (rx, ry, rz), lat=max(8, int(16 * LOD)), lon=max(12, int(24 * LOD)))
    v = m.v
    y = (v[:, 1] - cy) / ry  # -1..1
    # jaw / chin taper
    taper = 1.0 - 0.20 * smoothstep(0.1, -1.0, y) * (1.0 + 0.0 * b.face_soft)
    v[:, 0] = (v[:, 0]) * taper
    chin = np.exp(-(((v[:, 0]) / 0.03) ** 2 + ((v[:, 1] - (cy - ry * 0.92)) / 0.035) ** 2))
    v[:, 2] += np.where(v[:, 2] > 0, chin * 0.012, 0)
    # flatten the back of the head slightly and lengthen the skull
    v[:, 2] -= np.where(v[:, 2] < 0, 0.008 * (1 - np.abs(y)), 0)
    # brow ridge
    brow = np.exp(-(((v[:, 1] - (cy + ry * 0.22)) / 0.022) ** 2)) * np.where(v[:, 2] > 0, 1, 0)
    v[:, 2] += brow * 0.007 * (1 - 0.4 * b.face_soft)
    # eye sockets
    for sx in (-1, 1):
        sock = np.exp(-(((v[:, 0] - sx * rx * 0.40) / 0.020) ** 2 + ((v[:, 1] - (cy + ry * 0.10)) / 0.012) ** 2)) * np.where(v[:, 2] > 0, 1, 0)
        v[:, 2] -= sock * 0.006
        cheek = np.exp(-(((v[:, 0] - sx * rx * 0.62) / 0.030) ** 2 + ((v[:, 1] - (cy - ry * 0.28)) / 0.030) ** 2)) * np.where(v[:, 2] > 0, 1, 0)
        v[:, 2] += cheek * 0.006
        v[:, 0] += cheek * sx * 0.003
    # nose: bridge, tip, wings
    bridge = np.exp(-(((v[:, 0]) / 0.010) ** 2 + ((v[:, 1] - (cy - ry * 0.05)) / 0.030) ** 2)) * np.where(v[:, 2] > 0, 1, 0)
    tip = np.exp(-(((v[:, 0]) / 0.014) ** 2 + ((v[:, 1] - (cy - ry * 0.30)) / 0.014) ** 2)) * np.where(v[:, 2] > 0, 1, 0)
    wings = sum(np.exp(-(((v[:, 0] - s * 0.017) / 0.011) ** 2 + ((v[:, 1] - (cy - ry * 0.33)) / 0.010) ** 2)) for s in (-1, 1)) * np.where(v[:, 2] > 0, 1, 0)
    v[:, 2] += bridge * 0.007 + tip * (0.020 - 0.004 * b.face_soft) + wings * 0.008
    # mouth region: lips pushed forward, philtrum + mouth line dip
    lips_y = cy - ry * 0.58
    lips = np.exp(-(((v[:, 0]) / 0.024) ** 2 + ((v[:, 1] - lips_y) / 0.012) ** 2)) * np.where(v[:, 2] > 0, 1, 0)
    v[:, 2] += lips * (0.008 + 0.004 * b.face_soft)
    line = np.exp(-(((v[:, 0]) / 0.020) ** 2 + ((v[:, 1] - (lips_y + 0.001)) / 0.0025) ** 2)) * np.where(v[:, 2] > 0, 1, 0)
    v[:, 2] -= line * 0.004
    m.v = v
    skin = srgb_to_linear(hexrgb(b.skin))
    warm = srgb_to_linear(hexrgb(b.skin) * np.array([1.12, 0.92, 0.86]))
    lip = srgb_to_linear(hexrgb(b.skin) * np.array([0.95, 0.62, 0.62]))
    col = np.tile(skin, (len(v), 1))
    col = col * (1 - 0.5 * tip[:, None]) + warm * 0.5 * tip[:, None]
    for sx in (-1, 1):
        cheek = np.exp(-(((v[:, 0] - sx * rx * 0.62) / 0.03) ** 2 + ((v[:, 1] - (cy - ry * 0.28)) / 0.03) ** 2)) * np.where(v[:, 2] > 0, 1, 0)
        col = col * (1 - 0.35 * cheek[:, None]) + warm * 0.35 * cheek[:, None]
    lipmask = np.exp(-(((v[:, 0]) / 0.020) ** 2 + ((v[:, 1] - lips_y) / 0.008) ** 2)) * np.where(v[:, 2] > 0, 1, 0)
    col = col * (1 - 0.8 * lipmask[:, None]) + lip * 0.8 * lipmask[:, None]
    m.c[:, :3] = col
    m.region = ["head"] * len(v)
    m.material = "skin"
    return m


def build_face_details(b: Body) -> dict[str, Mesh]:
    """Eyes (white + iris), brows, ears. Returned as separate parts."""
    rx, ry, rz = b.head
    cy = b.head_y
    parts: dict[str, Mesh] = {}
    white = srgb_to_linear(np.array([0.96, 0.95, 0.92]))
    iris = srgb_to_linear(np.array([0.10, 0.06, 0.04]))
    eyes = []
    for sx in (-1, 1):
        ex, ey, ez = sx * rx * 0.40, cy + ry * 0.10, 0.012 + rz * 0.90
        e = sphere((ex, ey, ez - 0.004), (0.0125, 0.0105, 0.010), lat=6, lon=9)
        e.c[:, :3] = white
        i = sphere((ex, ey, ez + 0.004), (0.0072, 0.0072, 0.004), lat=4, lon=8)
        i.c[:, :3] = iris
        e.region = ["head"] * len(e.v)
        i.region = ["head"] * len(i.v)
        eyes += [e, i]
    parts["eyes"] = merge(eyes, "eyes")
    brow_col = srgb_to_linear(hexrgb(0x120b08))
    brows = []
    for sx in (-1, 1):
        pts = np.array([[sx * rx * 0.20, cy + ry * 0.30, 0.012 + rz * 0.93], [sx * rx * 0.42, cy + ry * 0.35, 0.012 + rz * 0.90], [sx * rx * 0.66, cy + ry * 0.28, 0.012 + rz * 0.78]])
        t = tube(pts, [0.0055, 0.0055, 0.0045], [0.004, 0.004, 0.003], sides=6, rings=6)
        t.c[:, :3] = brow_col
        t.region = ["head"] * len(t.v)
        brows.append(t)
    parts["brows"] = merge(brows, "hair")
    skin = srgb_to_linear(hexrgb(b.skin))
    ears = []
    for sx in (-1, 1):
        ear = sphere((sx * (rx * 0.99), cy - ry * 0.05, 0.0), (0.010, 0.024, 0.017), lat=8, lon=10)
        ear.c[:, :3] = skin * 0.92
        ear.region = ["head"] * len(ear.v)
        ears.append(ear)
    parts["ears"] = merge(ears, "skin")
    return parts
