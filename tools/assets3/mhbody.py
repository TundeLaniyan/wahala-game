"""MakeHuman (CC0) body loader for the WAHALA! character pipeline.

Loads the CC0 MakeHuman 1.x base mesh, macro / detail morph targets, default skeleton and skin weights from a checkout of
https://github.com/makehumancommunity/makehuman (assets: CC0 1.0, see docs/ASSETS.md and tools/assets3/fetch_makehuman.sh),
builds a morphed adult body, poses it to the game's A-pose and collapses the 163-bone MakeHuman weights onto WAHALA!'s
existing 22-bone skeleton (tools/assets/rig.py) so every existing clip keeps working.

Conventions (WAHALA! / glTF): metres, Y-up, character faces +Z, the character's left is +X.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

DATA = os.environ.get(
    "MAKEHUMAN_DATA",
    os.path.join(os.path.dirname(__file__), "vendor", "makehuman", "makehuman", "data"),
)
#: MakeHuman units -> metres for the neutral adult male (decimetres: base mesh is about 16.5 units tall for a 1.75 m body).
SCALE_GUESS = 0.1


# ------------------------------------------------------------------------------------------------ base mesh


@dataclass
class Base:
    verts: np.ndarray  # [19158, 3] original base vertices (all helper groups included), MakeHuman units
    uv: np.ndarray  # [T, 2]
    tri_v: np.ndarray  # [F, 3] triangles over the ORIGINAL vertex indices (body group only)
    tri_t: np.ndarray  # [F, 3] triangles over uv indices
    groups: dict  # group name -> vertex index array (the vertex groups: joints, helpers)


@lru_cache(maxsize=1)
def load_base() -> Base:
    verts, uvs, faces, fgroup = [], [], [], []
    cur = ""
    for line in open(os.path.join(DATA, "3dobjs", "base.obj")):
        if line.startswith("v "):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("vt "):
            uvs.append([float(x) for x in line.split()[1:3]])
        elif line.startswith("g "):
            cur = line.split()[1]
        elif line.startswith("f "):
            idx = [tuple(int(i) - 1 for i in p.split("/")[:2]) for p in line.split()[1:]]
            faces.append(idx)
            fgroup.append(cur)
    verts = np.array(verts, dtype=np.float64)
    uv = np.array(uvs, dtype=np.float64)
    groups: dict[str, set] = {}
    tri_v, tri_t = [], []
    for f, g in zip(faces, fgroup):
        groups.setdefault(g, set()).update(i for i, _ in f)
        if g != "body":
            continue
        for k in range(1, len(f) - 1):  # fan triangulation (quads -> 2 triangles)
            tri_v.append([f[0][0], f[k][0], f[k + 1][0]])
            tri_t.append([f[0][1], f[k][1], f[k + 1][1]])
    return Base(verts, uv, np.array(tri_v), np.array(tri_t), {k: np.array(sorted(v)) for k, v in groups.items()})


# ------------------------------------------------------------------------------------------------ targets


@lru_cache(maxsize=4096)
def _target(path: str) -> tuple[np.ndarray, np.ndarray]:
    idx, d = [], []
    for line in open(path):
        if line.startswith("#") or not line.strip():
            continue
        p = line.split()
        idx.append(int(p[0]))
        d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(d, dtype=np.float64).reshape(-1, 3)


def target_path(rel: str) -> str:
    return os.path.join(DATA, "targets", rel if rel.endswith(".target") else rel + ".target")


def _ramp(v: float) -> tuple[float, float, float]:
    """Slider 0..1 with 0.5 average -> (min, average, max) weights."""
    lo = max(0.0, 1.0 - 2.0 * v)
    hi = max(0.0, 2.0 * v - 1.0)
    return lo, 1.0 - lo - hi, hi


def age_weights(age: float) -> dict[str, float]:
    """MakeHuman age slider: 0 -> 1 y, 0.1875 -> 11 y, 0.5 -> 25 y, 1 -> 90 y."""
    w = {"baby": 0.0, "child": 0.0, "young": 0.0, "old": 0.0}
    if age < 0.1875:
        w["baby"], w["child"] = 1 - age / 0.1875, age / 0.1875
    elif age < 0.5:
        w["child"], w["young"] = 1 - (age - 0.1875) / 0.3125, (age - 0.1875) / 0.3125
    else:
        w["young"], w["old"] = 1 - (age - 0.5) / 0.5, (age - 0.5) / 0.5
    return w


@dataclass
class BodySpec:
    gender: float = 1.0  # 0 female .. 1 male
    age: float = 0.5  # 0.5 = 25 y; 0.62 ~ 40 y; 0.8 ~ 65 y
    muscle: float = 0.5
    weight: float = 0.5
    height: float = 0.5  # 0.5 average, up to 1 tall, down to 0 short
    african: float = 1.0
    asian: float = 0.0
    caucasian: float = 0.0
    #: detail modifiers: "group/target" -> value; value in [-1, 1] for two-sided targets ("head/head-age-decr|incr") or [0, 1]
    detail: dict = field(default_factory=dict)


def _macro_deltas(spec: BodySpec, n: int) -> np.ndarray:
    acc = np.zeros((n, 3))
    g = {"female": 1.0 - spec.gender, "male": spec.gender}
    a = age_weights(spec.age)
    mus = dict(zip(("minmuscle", "averagemuscle", "maxmuscle"), _ramp(spec.muscle)))
    wei = dict(zip(("minweight", "averageweight", "maxweight"), _ramp(spec.weight)))
    race = {"african": spec.african, "asian": spec.asian, "caucasian": spec.caucasian}
    tot = sum(race.values()) or 1.0
    race = {k: v / tot for k, v in race.items()}
    hmin, havg, hmax = _ramp(spec.height)

    def add(rel: str, w: float) -> None:
        if w <= 1e-6:
            return
        path = target_path(rel)
        if not os.path.exists(path):
            return
        i, d = _target(path)
        acc[i] += d * w

    for gn, gw in g.items():
        for an, aw in a.items():
            if gw * aw <= 0:
                continue
            for mn, mw in mus.items():
                for wn, ww in wei.items():
                    add(f"macrodetails/universal-{gn}-{an}-{mn}-{wn}", gw * aw * mw * ww)
                    if hmin or hmax:
                        add(f"macrodetails/height/{gn}-{an}-{mn}-{wn}-minheight", gw * aw * mw * ww * hmin)
                        add(f"macrodetails/height/{gn}-{an}-{mn}-{wn}-maxheight", gw * aw * mw * ww * hmax)
            for rn, rw in race.items():
                add(f"macrodetails/{rn}-{gn}-{an}", gw * aw * rw)
    return acc


def _detail_deltas(spec: BodySpec, n: int) -> np.ndarray:
    acc = np.zeros((n, 3))
    for key, val in spec.detail.items():
        group, name = key.split("/")
        if "|" in name:
            head, tail = name.split("|")
            stem = head.rsplit("-", 1)[0]
            lo, hi = f"{stem}-{head.rsplit('-', 1)[1]}", f"{stem}-{tail}"
            rel, w = (lo, -val) if val < 0 else (hi, val)
        else:
            rel, w = name, val
        if abs(w) < 1e-6:
            continue
        path = target_path(f"{group}/{rel}")
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        i, d = _target(path)
        acc[i] += d * w
    return acc


# ------------------------------------------------------------------------------------------------ skeleton, weights


@lru_cache(maxsize=1)
def _skeleton() -> dict:
    return json.load(open(os.path.join(DATA, "rigs", "default.mhskel")))


@lru_cache(maxsize=1)
def _weights() -> dict:
    return json.load(open(os.path.join(DATA, "rigs", "default_weights.mhw")))["weights"]


def _bone22(name: str) -> str | None:
    """Collapse a MakeHuman default-rig bone onto WAHALA!'s 22-bone skeleton (tools/assets/rig.py)."""
    side = "_L" if name.endswith(".L") else "_R" if name.endswith(".R") else ""
    n = name.split(".")[0]
    if n in ("root", "pelvis", "spine05", "breast"):
        return "hips"
    if n in ("spine04", "spine03"):
        return "spine"
    if n in ("spine02", "spine01"):
        return "chest"
    if n.startswith("neck"):
        return "neck"
    if n in ("head", "jaw") or n.startswith(("eye", "levator", "oculi", "orbicularis", "oris", "risorius", "special", "temporalis", "tongue")):
        return "head"
    if n in ("clavicle", "shoulder01"):
        return "clavicle" + side
    if n in ("upperarm01", "upperarm02"):
        return "upperarm" + side
    if n in ("lowerarm01", "lowerarm02"):
        return "forearm" + side
    if n == "wrist" or n.startswith(("finger", "metacarpal")):
        return "hand" + side
    if n in ("upperleg01", "upperleg02"):
        return "thigh" + side
    if n in ("lowerleg01", "lowerleg02"):
        return "shin" + side
    if n == "foot":
        return "foot" + side
    if n.startswith("toe"):
        return "toe" + side
    return None


# ------------------------------------------------------------------------------------------------ body


@dataclass
class Body:
    spec: BodySpec
    verts: np.ndarray  # [N, 3] metres, A-posed, the body-group vertices only (compacted)
    src: np.ndarray  # [N] original base vertex index of each compact vertex
    uv: np.ndarray  # [N, 2] per compact vertex (seams are duplicated vertices)
    tris: np.ndarray  # [F, 3] over compact vertices
    joints: dict  # 22-bone joint positions (world, metres)
    weights: np.ndarray  # [N, 22] skin weights over BONES
    helpers: dict  # extra anchors in metres (eyes, crown, nose tip, ...)


BONES = [
    "root", "hips", "spine", "chest", "neck", "head",
    "clavicle_L", "upperarm_L", "forearm_L", "hand_L",
    "clavicle_R", "upperarm_R", "forearm_R", "hand_R",
    "thigh_L", "shin_L", "foot_L", "toe_L",
    "thigh_R", "shin_R", "foot_R", "toe_R",
]


def _rot(axis: str, deg: float) -> np.ndarray:
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    return {
        "x": np.array([[1, 0, 0], [0, c, -s], [0, s, c]]),
        "y": np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
        "z": np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]]),
    }[axis]


def build_body(spec: BodySpec, arm_drop: float = 17.0, finger_curl: float = 38.0, height_m: float | None = None) -> Body:
    """Morph, pose (A-pose, relaxed fingers) and collapse the skin weights.  `height_m` rescales the result."""
    base = load_base()
    n = len(base.verts)
    v = base.verts + _macro_deltas(spec, n) + _detail_deltas(spec, n)
    sk = _skeleton()
    joint_pos = {name: v[np.array(ix)].mean(axis=0) for name, ix in sk["joints"].items()}
    bones = sk["bones"]
    head = {b: joint_pos[d["head"]] for b, d in bones.items()}
    parent = {b: d["parent"] for b, d in bones.items()}

    # --- pose: aim limb bones at desired WORLD directions (the game rig's relaxed A-pose); rotations about each bone's
    # rest head, expressed in the parent's rest frame so that parent poses compose correctly
    tail = {b: joint_pos[d["tail"]] for b, d in bones.items()}

    def align(a: np.ndarray, b: np.ndarray) -> np.ndarray:
        a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
        v = np.cross(a, b)
        c = float(a @ b)
        if np.linalg.norm(v) < 1e-9:
            return np.eye(3)
        k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
        return np.eye(3) + k + k @ k * (1.0 / (1.0 + c))

    aims: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for side, sgn in (("L", 1.0), ("R", -1.0)):
        ang = np.radians(arm_drop)  # degrees from vertical, outward
        aims[f"upperarm01.{side}"] = (head[f"lowerarm01.{side}"] - head[f"upperarm01.{side}"], np.array([sgn * np.sin(ang), -np.cos(ang), 0.05]))
        aims[f"lowerarm01.{side}"] = (head[f"wrist.{side}"] - head[f"lowerarm01.{side}"], np.array([sgn * np.sin(ang * 1.05), -np.cos(ang * 1.05), 0.16]))
        aims[f"wrist.{side}"] = (tail[f"finger3-3.{side}"] - head[f"wrist.{side}"], np.array([sgn * 0.05, -1.0, 0.18]))
        aims[f"upperleg01.{side}"] = (head[f"lowerleg01.{side}"] - head[f"upperleg01.{side}"], np.array([sgn * 0.035, -1.0, 0.0]))
        aims[f"lowerleg01.{side}"] = (head[f"foot.{side}"] - head[f"lowerleg01.{side}"], np.array([sgn * 0.02, -1.0, 0.03]))
    rots: dict[str, np.ndarray] = {}
    world: dict[str, np.ndarray] = {}

    def W(b: str) -> np.ndarray:
        if b in world:
            return world[b]
        P = W(parent[b]) if parent.get(b) else np.eye(4)
        r = None
        if b in aims:
            rest_dir, want = aims[b]
            r = align(rest_dir, P[:3, :3].T @ want)
        elif b.startswith("finger") and finger_curl:
            side = b[-1]
            seg = int(b[8])
            amount = finger_curl * (0.55 if b.startswith("finger1") else 1.0) * (0.8 if seg == 1 else 1.1)
            # curl toward the palm: after the hand hangs, the palm faces the thigh (toward the body centre)
            rest_dir = tail[b] - head[b]
            toward = np.array([(-1.0 if side == "L" else 1.0), -0.25, 0.0])
            cur = P[:3, :3] @ rest_dir
            curled = cur / np.linalg.norm(cur) * np.cos(np.radians(amount)) + toward / np.linalg.norm(toward) * np.sin(np.radians(amount))
            r = align(rest_dir, P[:3, :3].T @ curled)
        local = np.eye(4)
        if r is not None:
            h = head[b]
            local[:3, :3] = r
            local[:3, 3] = h - r @ h
        world[b] = P @ local
        return world[b]

    wts = _weights()
    out = np.zeros_like(v)
    acc = np.zeros(n)
    for b, lst in wts.items():
        idx = np.array([i for i, _ in lst], dtype=np.int64)
        w = np.array([x for _, x in lst])
        M = W(b)
        out[idx] += w[:, None] * (v[idx] @ M[:3, :3].T + M[:3, 3])
        acc[idx] += w
    miss = acc < 1e-6
    out[miss] = v[miss]
    acc[miss] = 1.0
    out /= acc[:, None]
    posed = out

    # --- bone22 weights over the original vertices
    W22 = np.zeros((n, len(BONES)))
    for b, lst in wts.items():
        t = _bone22(b)
        if t is None:
            continue
        j = BONES.index(t)
        for i, x in lst:
            W22[i, j] += x
    s = W22.sum(axis=1)
    W22[s < 1e-6, BONES.index("hips")] = 1.0
    W22 /= W22.sum(axis=1, keepdims=True)

    # --- joint positions of the 22 bones from the POSED helper joints
    jp = {}
    for name, ix in sk["joints"].items():
        jp[name] = posed[np.array(ix)].mean(axis=0)
    # (the posed joint of a bone whose parent rotated: recompute through the bone transforms)
    def posed_head(b: str) -> np.ndarray:
        M = W(b)
        return M[:3, :3] @ head[b] + M[:3, 3]

    ph = {b: posed_head(b) for b in bones}
    j22 = {
        "root": np.array([0.0, 0.0, 0.0]),
        "hips": ph["spine05"] * 0.5 + ph["root"] * 0.5 if False else ph["spine05"],
        "spine": ph["spine04"],
        "chest": ph["spine02"],
        "neck": ph["neck01"],
        "head": ph["head"],
        "clavicle_L": ph["clavicle.L"], "upperarm_L": ph["upperarm01.L"], "forearm_L": ph["lowerarm01.L"], "hand_L": ph["wrist.L"],
        "clavicle_R": ph["clavicle.R"], "upperarm_R": ph["upperarm01.R"], "forearm_R": ph["lowerarm01.R"], "hand_R": ph["wrist.R"],
        "thigh_L": ph["upperleg01.L"], "shin_L": ph["lowerleg01.L"], "foot_L": ph["foot.L"], "toe_L": ph["toe1-1.L"],
        "thigh_R": ph["upperleg01.R"], "shin_R": ph["lowerleg01.R"], "foot_R": ph["foot.R"], "toe_R": ph["toe1-1.R"],
    }
    def grp(name: str) -> np.ndarray:
        ix = base.groups.get(name)
        return posed[np.array(ix)].mean(axis=0) if ix is not None and len(ix) else np.zeros(3)

    helpers = {
        "eye_L": grp("joint-l-eye"),
        "eye_R": grp("joint-r-eye"),
        "head_top": grp("joint-head-2"),
        "ground": grp("joint-ground"),
        "jaw": grp("joint-jaw"),
        "head_base": grp("joint-head"),
    }

    # --- compact to the body group, ground at y = 0, metres
    used = np.unique(base.tri_v)
    remap = -np.ones(n, dtype=np.int64)
    remap[used] = np.arange(len(used))
    # one compact vertex per (vertex, uv) pair so UV seams are real
    pair = {}
    cuv, csrc = [], []
    tris = np.zeros_like(base.tri_v)
    for k in range(base.tri_v.shape[0]):
        for c in range(3):
            key = (int(base.tri_v[k, c]), int(base.tri_t[k, c]))
            ix = pair.get(key)
            if ix is None:
                ix = len(csrc)
                pair[key] = ix
                csrc.append(key[0])
                cuv.append(base.uv[key[1]])
            tris[k, c] = ix
    src = np.array(csrc, dtype=np.int64)
    cvv = posed[src]
    floor = min(cvv[:, 1].min(), 0.0)
    ground = jp["joint-ground"][1] if "joint-ground" in jp else floor
    shift = np.array([0.0, -min(cvv[:, 1].min(), ground), 0.0])
    scale = SCALE_GUESS
    if height_m is not None:
        scale = height_m / (cvv[:, 1].max() + shift[1])
    cvv = (cvv + shift) * scale
    j22 = {k: (v_ + shift) * scale for k, v_ in j22.items()}
    helpers = {k: (v_ + shift) * scale for k, v_ in helpers.items()}
    # centre x/z on the pelvis
    cx = np.array([j22["hips"][0], 0.0, 0.0])
    cvv -= cx
    j22 = {k: v_ - cx for k, v_ in j22.items()}
    helpers = {k: v_ - cx for k, v_ in helpers.items()}
    return Body(spec, cvv, src, np.array(cuv), tris, j22, W22[src], helpers)
