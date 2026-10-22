"""Skeleton, skin weights and procedural animation clips for the WAHALA! characters.

Conventions: bones have identity rest rotation (axes = world axes), so Euler angles are intuitive:
  * rx > 0 swings a downward-pointing bone BACKWARD (-Z) and leans an upward bone FORWARD (+Z)
  * rz > 0 swings a downward bone toward +X (the character's left)
Angles in the clip functions are degrees.
"""
from __future__ import annotations

import numpy as np

from chargen import Body, joints_for, smoothstep
from gltfio import quat_from_euler_xyz

# (bone, parent) in creation order
HIERARCHY = [
    ("root", None),
    ("hips", "root"),
    ("spine", "hips"),
    ("chest", "spine"),
    ("neck", "chest"),
    ("head", "neck"),
    ("clavicle_L", "chest"),
    ("upperarm_L", "clavicle_L"),
    ("forearm_L", "upperarm_L"),
    ("hand_L", "forearm_L"),
    ("clavicle_R", "chest"),
    ("upperarm_R", "clavicle_R"),
    ("forearm_R", "upperarm_R"),
    ("hand_R", "forearm_R"),
    ("thigh_L", "hips"),
    ("shin_L", "thigh_L"),
    ("foot_L", "shin_L"),
    ("toe_L", "foot_L"),
    ("thigh_R", "hips"),
    ("shin_R", "thigh_R"),
    ("foot_R", "shin_R"),
    ("toe_R", "foot_R"),
]
BONE_NAMES = [b for b, _ in HIERARCHY]
TAIL = {  # segment end used for skin weighting
    "hips": "spine", "spine": "chest", "chest": "neck", "neck": "head", "head": "head_top",
    "clavicle_L": "upperarm_L", "upperarm_L": "forearm_L", "forearm_L": "hand_L", "hand_L": "hand_tip_L",
    "clavicle_R": "upperarm_R", "upperarm_R": "forearm_R", "forearm_R": "hand_R", "hand_R": "hand_tip_R",
    "thigh_L": "shin_L", "shin_L": "foot_L", "foot_L": "toe_L", "toe_L": "toe_tip_L",
    "thigh_R": "shin_R", "shin_R": "foot_R", "foot_R": "toe_R", "toe_R": "toe_tip_R",
}
REGION_BONES = {
    "torso": ["hips", "spine", "chest", "neck", "clavicle_L", "clavicle_R", "upperarm_L", "upperarm_R", "thigh_L", "thigh_R"],
    "neck": ["chest", "neck", "head"],
    "head": ["neck", "head"],
    "arm_L": ["chest", "clavicle_L", "upperarm_L", "forearm_L", "hand_L"],
    "arm_R": ["chest", "clavicle_R", "upperarm_R", "forearm_R", "hand_R"],
    "leg_L": ["hips", "thigh_L", "shin_L", "foot_L", "toe_L"],
    "leg_R": ["hips", "thigh_R", "shin_R", "foot_R", "toe_R"],
}
SIGMA = {"hips": 0.10, "spine": 0.10, "chest": 0.12, "neck": 0.05, "head": 0.09, "clavicle_L": 0.06, "clavicle_R": 0.06}


def region_group(region: str) -> str:
    for prefix, grp in (("upperarm", "arm"), ("forearm", "arm"), ("hand", "arm"), ("thigh", "leg"), ("shin", "leg"), ("foot", "leg")):
        if region.startswith(prefix):
            return f"{grp}_{region[-1]}"
    return region


def segment_distance(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ab = b - a
    t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


def skin_weights(verts: np.ndarray, regions: list[str], b: Body) -> tuple[np.ndarray, np.ndarray]:
    """Per-vertex (joints[N,4], weights[N,4]) from proximity to bone segments, limited per region."""
    j = joints_for(b)
    n = len(verts)
    index = {name: i for i, name in enumerate(BONE_NAMES)}
    full = np.zeros((n, len(BONE_NAMES)))
    regs = np.array([region_group(r) for r in regions])
    for grp, bones in REGION_BONES.items():
        mask = regs == grp
        if not mask.any():
            continue
        p = verts[mask]
        for bone in bones:
            a = j[bone] if bone in j else np.zeros(3)
            tail = j[TAIL[bone]]
            d = segment_distance(p, a, tail)
            sig = SIGMA.get(bone, 0.05)
            w = np.exp(-((d / sig) ** 2))
            if grp == "torso":
                y = p[:, 1]
                if bone.startswith(("upperarm", "clavicle")):
                    w = w * smoothstep(1.34, 1.44, y)
                if bone.startswith("thigh"):
                    w = w * smoothstep(0.98, 0.86, y)
            if grp in ("arm_L", "arm_R"):
                sh_y = j[f"upperarm_{grp[-1]}"][1]
                if bone.startswith("upperarm"):
                    w = w * smoothstep(sh_y + 0.02, sh_y - 0.065, p[:, 1])
                if bone.startswith("clavicle"):
                    w = w * (1.0 + 3.0 * smoothstep(sh_y - 0.06, sh_y + 0.02, p[:, 1]))
            if grp == "head" and bone == "neck":
                w = w * smoothstep(b.head_y - b.head[1] * 0.4, b.head_y - b.head[1] * 1.1, p[:, 1])
            full[np.where(mask)[0], index[bone]] = w
    # keep the four strongest, normalise; fall back to hips for anything unweighted
    order = np.argsort(-full, axis=1)[:, :4]
    wts = np.take_along_axis(full, order, axis=1)
    sums = wts.sum(axis=1)
    bad = sums < 1e-6
    wts[bad] = [1, 0, 0, 0]
    order[bad] = index["hips"]
    wts = wts / wts.sum(axis=1, keepdims=True)
    return order, wts


def rest_translations(b: Body) -> dict[str, np.ndarray]:
    """Local rest translation of every bone relative to its parent."""
    j = joints_for(b)
    world = {"root": np.zeros(3)}
    for name, parent in HIERARCHY[1:]:
        world[name] = j[name]
    out = {}
    for name, parent in HIERARCHY:
        out[name] = world[name] - (world[parent] if parent else 0)
    return out, world


# ---------------------------------------------------------------------------------------- clips

FPS = 30


class Clip:
    """A looping or one-shot clip described by pose(t) -> {bone: (rx, ry, rz)} (+ translations)."""

    def __init__(self, name: str, duration: float, fn, loop: bool = True) -> None:
        self.name, self.duration, self.fn, self.loop = name, duration, fn, loop


def _p(**kw):
    return kw


def sin(x):
    return float(np.sin(x))


def idle(t: float) -> dict:
    """Relaxed, alert stance: weight settled on one hip, soft knees, loose arms, breathing, glancing around."""
    ph = 2 * np.pi * t / 2.4
    look = 12.0 * sin(ph * 0.5)
    return {
        "chest": (2.0 * sin(ph), -0.3 * look, 1.0 * sin(ph * 0.5)),
        "spine": (1.5 + 0.8 * sin(ph), 0, -1.5),
        "head": (-2 + 1.2 * sin(ph - 0.6), look, 1.5),
        "upperarm_L": (3 + 2.5 * sin(ph + 0.3), 0, -5 + 1.5 * sin(ph)),
        "upperarm_R": (5 + 2.5 * sin(ph + 0.9), 0, 5 - 1.5 * sin(ph)),
        "forearm_L": (-16 - 3 * sin(ph), 0, 0),
        "forearm_R": (-22 - 3 * sin(ph + 0.5), 0, 0),
        "hips": (0, 4, 3.5 + 1.0 * sin(ph * 0.5)),
        "thigh_L": (-3, -4, -5),
        "thigh_R": (4, -4, -1.0),
        "shin_L": (7, 0, 0),
        "shin_R": (5, 0, 0),
        "_t": {"hips": (0, -0.012 + 0.004 * sin(ph * 2), 0)},
    }


def _legs(phi: float, stride: float, knee: float) -> dict:
    out = {}
    for side, off in (("L", 0.0), ("R", np.pi)):
        a = phi + off
        swing = stride * sin(a)
        flex = 10 + knee * max(0.0, float(np.cos(a))) ** 1.4
        out[f"thigh_{side}"] = (-swing, 0, 0)
        out[f"shin_{side}"] = (flex + max(0.0, swing) * 0.1, 0, 0)
        out[f"foot_{side}"] = (swing * 0.35 - flex * 0.15, 0, 0)
    return out


def run(t: float, carry: bool = False) -> dict:
    phi = 2 * np.pi * t / 0.62
    out = _legs(phi, 46, 62)
    lean = 11
    out["spine"] = (lean * 0.5, 6 * sin(phi), 0)
    out["chest"] = (lean * 0.5, -10 * sin(phi), 0)
    out["head"] = (-lean * 0.7, 5 * sin(phi), 0)
    out["hips"] = (0, 5 * sin(phi), 2.0 * sin(phi))
    if carry:
        for side, m in (("L", 1), ("R", -1)):
            out[f"upperarm_{side}"] = (-168, 0, m * 10)
            out[f"forearm_{side}"] = (-12, 0, 0)
            out[f"hand_{side}"] = (-10, 0, 0)
        out["chest"] = (-4 + lean * 0.5, -3 * sin(phi), 0)
    else:
        for side, sgn in (("L", 1), ("R", -1)):
            a = 40 * sgn * sin(phi)
            out[f"upperarm_{side}"] = (a * 1.0, 0, sgn * 0 + (6 if side == "L" else -6))
            out[f"forearm_{side}"] = (-(78 + 14 * sin(phi + (0 if side == "L" else np.pi))), 0, 0)
    out["_t"] = {"hips": (0, -0.03 + 0.032 * float(np.cos(2 * phi)), 0)}
    return out


def idle_carry(t: float) -> dict:
    out = idle(t)
    for side, m in (("L", 1), ("R", -1)):
        out[f"upperarm_{side}"] = (-168 + 2 * sin(t * 2.6), 0, m * 10)
        out[f"forearm_{side}"] = (-12, 0, 0)
    return out


def ride(t: float) -> dict:
    ph = 2 * np.pi * t / 1.2
    out = {"chest": (10 + 1.0 * sin(ph), 0, 0), "spine": (6, 0, 0), "head": (-9, 0, 0), "hips": (-8, 0, 0)}
    for side, m in (("L", 1), ("R", -1)):
        out[f"thigh_{side}"] = (-82, 0, m * -14)
        out[f"shin_{side}"] = (86, 0, 0)
        out[f"foot_{side}"] = (-10, 0, 0)
        out[f"upperarm_{side}"] = (-46, 0, m * 20)
        out[f"forearm_{side}"] = (-22, 0, 0)
    out["_t"] = {"hips": (0, -0.12 + 0.004 * sin(ph * 2), 0)}
    return out


def place(t: float) -> dict:
    k = min(1.0, t / 0.45)
    c = sin(np.pi * k)
    out = {"spine": (28 * c, 0, 0), "chest": (14 * c, 0, 0), "head": (-14 * c, 0, 0)}
    for side, m in (("L", 1), ("R", -1)):
        out[f"thigh_{side}"] = (-62 * c, 0, 0)
        out[f"shin_{side}"] = (92 * c, 0, 0)
        out[f"upperarm_{side}"] = (-70 * c, 0, m * 8)
        out[f"forearm_{side}"] = (-30 * c, 0, 0)
    out["_t"] = {"hips": (0, -0.26 * c, 0.02 * c)}
    return out


def kick(t: float) -> dict:
    k = min(1.0, t / 0.5)
    w = sin(np.pi * k) ** 0.8
    out = {"spine": (-8 * w, 0, 0), "chest": (-6 * w, -10 * w, 0), "thigh_R": (-82 * w, 0, 0), "shin_R": (30 * (1 - w) + 12, 0, 0), "foot_R": (-20 * w, 0, 0), "thigh_L": (6 * w, 0, 0), "shin_L": (14 * w, 0, 0)}
    out["upperarm_L"] = (-35 * w, 0, 30 * w)
    out["upperarm_R"] = (30 * w, 0, -35 * w)
    out["_t"] = {"hips": (0, -0.03 * w, 0)}
    return out


def throw(t: float) -> dict:
    k = min(1.0, t / 0.5)
    wind = smoothstep(0.0, 0.35, np.array([k]))[0] * (1 - smoothstep(0.35, 0.55, np.array([k]))[0])
    fwd = smoothstep(0.35, 0.6, np.array([k]))[0] * (1 - smoothstep(0.85, 1.0, np.array([k]))[0])
    out = {"chest": (4 * fwd, 40 * wind - 45 * fwd, 0), "spine": (6 * fwd, 14 * wind - 20 * fwd, 0), "hips": (0, 8 * wind - 12 * fwd, 0)}
    out["upperarm_R"] = (-30 * wind - 130 * fwd + 20 * 0, 0, -50 * wind - 12 * fwd)
    out["forearm_R"] = (-90 * wind - 15 * fwd, 0, 0)
    out["upperarm_L"] = (-60 * fwd, 0, 20)
    out["thigh_L"] = (-24 * fwd, 0, 0)
    out["thigh_R"] = (16 * fwd, 0, 0)
    out["shin_R"] = (24 * fwd, 0, 0)
    return out


def push(t: float) -> dict:
    k = min(1.0, t / 0.4)
    f = sin(np.pi * k) ** 0.7
    out = {"spine": (14 * f, 0, 0), "chest": (8 * f, 0, 0), "thigh_L": (-30 * f, 0, 0), "shin_L": (30 * f, 0, 0), "thigh_R": (22 * f, 0, 0)}
    for side, m in (("L", 1), ("R", -1)):
        out[f"upperarm_{side}"] = (-95 * f, 0, m * 12)
        out[f"forearm_{side}"] = (-8 * f, 0, 0)
    out["_t"] = {"hips": (0, -0.03 * f, 0.03 * f)}
    return out


def stumble(t: float) -> dict:
    k = min(1.0, t / 0.8)
    f = sin(np.pi * k)
    out = {"spine": (26 * f, 0, 0), "chest": (14 * f, 0, 0), "head": (-10 * f, 0, 0), "thigh_L": (-38 * f, 0, 0), "shin_L": (20 * f, 0, 0), "thigh_R": (18 * f, 0, 0), "shin_R": (30 * f, 0, 0)}
    for side, m in (("L", 1), ("R", -1)):
        out[f"upperarm_{side}"] = (-30 * f, 0, m * 70 * f)
        out[f"forearm_{side}"] = (-20 * f, 0, 0)
    return out


def dazed(t: float) -> dict:
    ph = 2 * np.pi * t / 1.4
    out = idle(t)
    out["head"] = (8 + 6 * sin(ph), 14 * sin(ph), 12 * sin(ph + 1.2))
    out["spine"] = (6 + 2 * sin(ph), 0, 6 * sin(ph))
    out["chest"] = (4, 0, 5 * sin(ph + 0.5))
    out["upperarm_L"] = (10, 0, 14)
    out["upperarm_R"] = (10, 0, -14)
    out["_t"] = {"hips": (0.025 * sin(ph), 0, 0)}
    return out


def cheer(t: float) -> dict:
    ph = 2 * np.pi * t / 0.7
    out = {"chest": (-6, 8 * sin(ph), 0), "head": (-10, 6 * sin(ph), 0)}
    for side, m, off in (("L", 1, 0.0), ("R", -1, np.pi)):
        out[f"upperarm_{side}"] = (-150 + 25 * sin(ph + off), 0, m * 28)
        out[f"forearm_{side}"] = (-30 + 20 * sin(ph + off + 1), 0, 0)
        out[f"thigh_{side}"] = (-10 * max(0.0, sin(ph + off)), 0, 0)
    out["_t"] = {"hips": (0, 0.05 * abs(sin(ph)), 0)}
    return out


def win(t: float) -> dict:
    ph = 2 * np.pi * t / 1.0
    out = cheer(t)
    out["upperarm_R"] = (-175, 0, -14 + 6 * sin(ph))
    out["forearm_R"] = (-25, 0, 0)
    out["upperarm_L"] = (-35, 0, 24)
    out["forearm_L"] = (-70, 0, 0)
    out["chest"] = (-10, -8 * sin(ph), 0)
    out["_t"] = {"hips": (0, 0.06 * abs(sin(ph)), 0)}
    return out


def lose(t: float) -> dict:
    k = min(1.0, t / 0.6)
    out = {"spine": (22 * k, 0, 0), "chest": (14 * k, 0, 0), "head": (28 * k, 0, 0)}
    for side, m in (("L", 1), ("R", -1)):
        out[f"upperarm_{side}"] = (14 * k, 0, m * 6)
        out[f"forearm_{side}"] = (-6 * k, 0, 0)
        out[f"thigh_{side}"] = (0, 0, 0)
    out["_t"] = {"hips": (0, -0.03 * k, 0)}
    return out


def die_blast(t: float) -> dict:
    """Launched backwards, tumbles and lands on the back. Root translation lifts the whole body."""
    T = 0.62
    k = min(1.0, t / T)
    rot = -90 * smoothstep(0.0, 1.0, np.array([k]))[0]
    lift = 1.35 * 4 * k * (1 - k) if t < T else 0.0
    out = {"root": (rot, 0, 0)}
    flail = sin(t * 28) * (1 - k * 0.8) if t < T else 0.0
    for side, m in (("L", 1), ("R", -1)):
        out[f"upperarm_{side}"] = (-60 + 50 * flail * m, 0, m * (80 if t < T else 35))
        out[f"forearm_{side}"] = (-30, 0, 0)
        out[f"thigh_{side}"] = (-40 + 30 * flail * -m, 0, m * 14)
        out[f"shin_{side}"] = (50, 0, 0)
    out["head"] = (-15, 0, 0)
    ground = 0.12
    after = max(0.0, t - T)
    twitch = 0.012 * sin(after * 14) * max(0.0, 1 - after * 1.5)
    out["_t"] = {"root": (0, ground + lift + twitch, -0.35 * smoothstep(0.0, 1.0, np.array([k]))[0])}
    return out


def die_vehicle(t: float) -> dict:
    """Sent cartwheeling sideways and ends lying on the side."""
    T = 0.8
    k = min(1.0, t / T)
    spin = 540 * smoothstep(0.0, 1.0, np.array([k]))[0]
    lift = 1.0 * 4 * k * (1 - k) if t < T else 0.0
    out = {"root": (0, 0, spin + 90 * 0)}
    for side, m in (("L", 1), ("R", -1)):
        out[f"upperarm_{side}"] = (-30, 0, m * 130)
        out[f"thigh_{side}"] = (-20, 0, m * 30)
        out[f"shin_{side}"] = (40, 0, 0)
    out["_t"] = {"root": (0, 0.12 + lift, 0)}
    return out


CLIPS = [
    Clip("Idle", 2.4, idle),
    Clip("Run", 0.62, run),
    Clip("RunCarry", 0.62, lambda t: run(t, True)),
    Clip("IdleCarry", 2.4, idle_carry),
    Clip("Ride", 1.2, ride),
    Clip("Place", 0.5, place, loop=False),
    Clip("Kick", 0.55, kick, loop=False),
    Clip("Throw", 0.6, throw, loop=False),
    Clip("Push", 0.45, push, loop=False),
    Clip("Stumble", 0.8, stumble, loop=False),
    Clip("Dazed", 1.4, dazed),
    Clip("Cheer", 0.7, cheer),
    Clip("Win", 1.0, win),
    Clip("Lose", 1.2, lose, loop=False),
    Clip("DieBlast", 1.8, die_blast, loop=False),
    Clip("DieVehicle", 1.5, die_vehicle, loop=False),
]


def sample_clip(clip: Clip, rest_t: dict[str, np.ndarray]) -> list[tuple[str, str, np.ndarray, np.ndarray]]:
    """Returns glTF-style channels as (bone, path, times, values)."""
    n = int(round(clip.duration * FPS))
    if clip.loop:
        times = np.arange(n) / FPS
    else:
        times = np.arange(n + 1) / FPS
    rot = {name: [] for name in BONE_NAMES}
    trans = {name: [] for name in ("root", "hips")}
    for t in times:
        pose = clip.fn(float(t))
        tr = pose.pop("_t", {})
        for name in BONE_NAMES:
            rx, ry, rz = pose.get(name, (0.0, 0.0, 0.0))
            rot[name].append(quat_from_euler_xyz(np.radians(rx), np.radians(ry), np.radians(rz)))
        for name in trans:
            d = tr.get(name, (0.0, 0.0, 0.0))
            trans[name].append(rest_t[name] + np.array(d))
    # make quaternions continuous
    channels = []
    for name in BONE_NAMES:
        q = np.array(rot[name])
        for i in range(1, len(q)):
            if np.dot(q[i], q[i - 1]) < 0:
                q[i] = -q[i]
        channels.append((name, "rotation", times, q))
    for name, vals in trans.items():
        channels.append((name, "translation", times, np.array(vals)))
    return channels
