"""Animation clips for the Agbero / Park Enforcer (docs/CHARACTER_PRODUCTION_AGBERO.md), authored on the shared 22-bone
skeleton (`rig.py` conventions: bone rest rotations are identity, angles in degrees, rx < 0 raises an arm forward).

Clip names are the game's `ClipName`s; the enemy-only ones are:

  Walk    patrol: an upright, unhurried strut, left fist on the belt
  Windup  the punch wind-up, ONE clip from stance to the fully extended blow. The telegraph stretches it over the sim's
          wind-up (`playOnceOver`: 38-60 ticks), so the blow lands on its last frames; the long readable part is the
          coil (rear fist drawn back to the ear, torso wound away from the target, weight loaded on the back leg).
  Strike  after the blow (hit or not, the enemy stays planted for the sim's recovery window): follow-through held for a
          beat, then the fist comes back and the shoulders heave. Starts exactly on Windup's last pose.
  Alert   the generator / intruder awareness cue: point at it, head turned, then settle.

Everything else (Idle, Run, Push, Stumble, Dazed, DieBlast, DieVehicle, Win, Lose) is re-authored or reused so the
existing animation selection in `render/views/PlayerViews.ts` keeps working unchanged.
"""
from __future__ import annotations

import numpy as np

import rig
from rig import Clip, sin

SMOOTH = lambda a, b, x: float(np.clip((x - a) / (b - a), 0.0, 1.0) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0.0, 1.0)))  # noqa: E731


def lerp_pose(a: dict, b: dict, w: float) -> dict:
    """Blend two pose dicts (bone -> Euler degrees, `_t` -> translations)."""
    out: dict = {}
    for k in set(a) | set(b):
        if k == "_t":
            ta, tb = a.get("_t", {}), b.get("_t", {})
            out["_t"] = {bone: tuple(np.array(ta.get(bone, (0, 0, 0))) * (1 - w) + np.array(tb.get(bone, (0, 0, 0))) * w) for bone in set(ta) | set(tb)}
        else:
            va, vb = np.array(a.get(k, (0, 0, 0)), dtype=float), np.array(b.get(k, (0, 0, 0)), dtype=float)
            out[k] = tuple(va * (1 - w) + vb * w)
    return out


# --------------------------------------------------------------------------------------------- stances


def guard(t: float = 0.0) -> dict:
    """Fighting guard: feet staggered, weight on the back foot, fists up by the chin, chin tucked."""
    ph = 2 * np.pi * t / 2.0
    return {
        "hips": (0, -12, 2),
        "spine": (4 + 1.0 * sin(ph), 6, 0),
        "chest": (4 + 1.5 * sin(ph), 8, 0.8 * sin(ph * 0.5)),
        "head": (-5, -10 + 3 * sin(ph * 0.5), 0),
        "upperarm_L": (-48, 0, 14),
        "forearm_L": (-100, 0, 0),
        "upperarm_R": (-38, 0, -16),
        "forearm_R": (-112, 0, 0),
        "thigh_L": (-20, 0, -7),
        "shin_L": (18, 0, 0),
        "foot_L": (2, 0, 0),
        "thigh_R": (14, 0, 3),
        "shin_R": (22, 0, 0),
        "_t": {"hips": (0, -0.05 + 0.004 * sin(ph * 2), 0)},
    }


def idle(t: float) -> dict:
    """Wary park-gate stance: broad, weight on one hip, loose fists at the belt, shoulders rolling, head scanning."""
    ph = 2 * np.pi * t / 2.4
    look = 22.0 * sin(ph * 0.5)
    return {
        "chest": (3 + 2.0 * sin(ph), -0.3 * look, 1.2 * sin(ph * 0.5)),
        "spine": (3 + 0.8 * sin(ph), 0, -2),
        "head": (3 + 1.2 * sin(ph - 0.6), look, 1.5),
        "upperarm_L": (-6 + 2 * sin(ph + 0.3), 0, 20),
        "forearm_L": (-52 - 3 * sin(ph), 0, 0),
        "upperarm_R": (-4 + 2 * sin(ph + 0.9), 0, -20),
        "forearm_R": (-60 - 3 * sin(ph + 0.5), 0, 0),
        "clavicle_L": (0, 0, 4 + 2 * sin(ph)),
        "clavicle_R": (0, 0, -4 - 2 * sin(ph)),
        "hips": (0, 5, 5 + 1.0 * sin(ph * 0.5)),
        "thigh_L": (-2, -4, -8),
        "thigh_R": (3, -4, 2),
        "shin_L": (6, 0, 0),
        "shin_R": (5, 0, 0),
        "_t": {"hips": (0, -0.018 + 0.004 * sin(ph * 2), 0)},
    }


def walk(t: float) -> dict:
    """Patrol: an upright, slow strut with a rolling swagger; left hand rests on the belt, right arm swings."""
    phi = 2 * np.pi * t / 0.9
    out = rig._legs(phi, 30, 38)
    out["hips"] = (0, 7 * sin(phi), 3.5 * sin(phi))
    out["spine"] = (2, -4 * sin(phi), -2 * sin(phi))
    out["chest"] = (2, -8 * sin(phi), 1.5 * sin(phi + 1))
    out["head"] = (2, 4 * sin(phi) + 8 * sin(phi * 0.5), 0)
    out["upperarm_L"] = (4, 0, 40)  # elbow out, hand on the belt
    out["forearm_L"] = (-62, 22, 0)
    out["upperarm_R"] = (-22 * sin(phi), 0, -9)
    out["forearm_R"] = (-34 - 12 * sin(phi + 1.2), 0, 0)
    out["clavicle_L"] = (0, 0, 5)
    out["_t"] = {"hips": (0, -0.03 + 0.016 * float(np.cos(2 * phi)), 0)}
    return out


def run(t: float) -> dict:
    """Pursuit: forward lean, pumping fists, head down and locked on the target."""
    phi = 2 * np.pi * t / 0.58
    out = rig._legs(phi, 52, 74)
    lean = 17
    out["spine"] = (lean * 0.55, 8 * sin(phi), 0)
    out["chest"] = (lean * 0.55, -13 * sin(phi), 0)
    out["head"] = (-lean * 0.55 + 6, 6 * sin(phi), 0)
    out["hips"] = (0, 6 * sin(phi), 2.5 * sin(phi))
    for side, sgn in (("L", 1), ("R", -1)):
        a = 52 * sgn * sin(phi)
        out[f"upperarm_{side}"] = (a, 0, 8 if side == "L" else -8)
        out[f"forearm_{side}"] = (-(96 + 10 * sin(phi + (0 if side == "L" else np.pi))), 0, 0)
    out["_t"] = {"hips": (0, -0.05 + 0.034 * float(np.cos(2 * phi)), 0)}
    return out


# --------------------------------------------------------------------------------------------- the punch

WINDUP_DURATION = 1.0


def punch_extended() -> dict:
    """The fully extended right straight: shoulders squared to the target, front knee over the toe, fist at chest height."""
    return {
        "hips": (0, 22, 0),
        "spine": (16, 20, 0),
        "chest": (12, 40, 0),
        "head": (-6, -34, 0),
        "upperarm_R": (-86, 0, -6),
        "forearm_R": (-6, 0, 0),
        "hand_R": (-12, 0, 0),
        "upperarm_L": (-12, 0, 14),
        "forearm_L": (-108, 0, 0),
        "thigh_L": (-40, 0, -6),
        "shin_L": (34, 0, 0),
        "foot_L": (6, 0, 0),
        "thigh_R": (26, 0, 4),
        "shin_R": (16, 0, 0),
        "foot_R": (10, 0, 0),
        "_t": {"hips": (0, -0.12, 0.16)},
    }


def windup(t: float) -> dict:
    """Stance -> coil -> held tension (a visible tremble) -> the blow, over `WINDUP_DURATION` (stretched by the game)."""
    k = min(1.0, t / WINDUP_DURATION)
    load = SMOOTH(0.0, 0.34, k)  # drop into the coil
    tense = SMOOTH(0.30, 0.82, k)  # keep winding tighter
    blow = SMOOTH(0.86, 0.985, k)  # the strike itself, the last 12 % of the clip
    shake = (1.0 - blow) * tense * sin(k * 2 * np.pi * 9.0)
    g = guard(0.0)
    out = dict(g)
    c = 0.65 * load + 0.35 * tense  # 0..1 coil amount
    out["hips"] = (0, -12 - 22 * c, 2)  # hips wound away (right hip back)
    out["spine"] = (-6 * c + 4, -12 * c, 0)
    out["chest"] = (-8 * c + 4, -34 * c + 2 * shake, 2.5 * shake)  # torso turned right shoulder BACK, leaning away
    out["head"] = (-4, -14 + 22 * c, 0)  # eyes stay on the target
    out["upperarm_R"] = (18 * c - 38 * (1 - c), 0, -26 * c - 4 * (1 - c) + 2 * shake)  # elbow drawn back
    out["forearm_R"] = (-128 * c - 112 * (1 - c) + 3 * shake, 0, 0)  # fist cocked by the ear
    out["upperarm_L"] = (-62 * c - 48 * (1 - c), 0, 20)  # lead hand up as the sight
    out["forearm_L"] = (-98, 0, 0)
    out["thigh_L"] = (-24 * c - 20 * (1 - c), 0, -7)
    out["shin_L"] = (14, 0, 0)
    out["thigh_R"] = (22 * c + 14 * (1 - c), 0, 3)
    out["shin_R"] = (42 * c + 22 * (1 - c), 0, 0)  # rear knee loaded
    out["_t"] = {"hips": (0, -0.05 - 0.07 * c, -0.04 * c)}
    return lerp_pose(out, punch_extended(), blow)


def strike(t: float) -> dict:
    """After the blow: hold the follow-through, then pull back to the guard while the chest heaves."""
    D = 1.2
    k = min(1.0, t / D)
    back = SMOOTH(0.14, 0.82, k)
    out = lerp_pose(punch_extended(), guard(t), back)
    heave = sin(k * 2 * np.pi * 2.0) * back * (1 - SMOOTH(0.85, 1.0, k))
    out["chest"] = tuple(np.array(out.get("chest", (0, 0, 0))) + np.array((3 * heave, 0, 0)))
    out["head"] = tuple(np.array(out.get("head", (0, 0, 0))) + np.array((2 * heave, 0, 0)))
    return out


def alert(t: float) -> dict:
    """Spot-the-generator cue: point with the left arm, head and chest turned toward it, then settle."""
    D = 1.0
    k = min(1.0, t / D)
    env = SMOOTH(0.0, 0.22, k) * (1.0 - SMOOTH(0.72, 1.0, k))
    out = idle(t)
    out["chest"] = (4 + 4 * env, -0.3 * 22 * 0 + 22 * env, 0)
    out["spine"] = (4 + 6 * env, 8 * env, -2)
    out["head"] = (3 - 6 * env, 26 * env, 0)
    out["upperarm_L"] = (-84 * env - 6 * (1 - env), 0, 16 + 4 * env)
    out["forearm_L"] = (-4 * env - 52 * (1 - env), 0, 0)
    out["hand_L"] = (-10 * env, 0, 0)
    out["upperarm_R"] = (-30 * env - 4 * (1 - env), 0, -22)
    out["forearm_R"] = (-100 * env - 60 * (1 - env), 0, 0)
    out["thigh_L"] = (-2 - 14 * env, -4, -8)
    out["shin_L"] = (6 + 10 * env, 0, 0)
    return out


def push(t: float) -> dict:
    """Quick jab (kept for `Push` requests that are not an enemy wind-up)."""
    k = min(1.0, t / 0.4)
    f = sin(np.pi * k) ** 0.7
    return lerp_pose(guard(t), punch_extended(), f)


def stumble(t: float) -> dict:
    """Staggered by a hit or a whiffed blow: knocked off balance, arms flung, one foot skipping back."""
    return rig.stumble(t)


def dazed(t: float) -> dict:
    out = rig.dazed(t)
    out["hips"] = (0, 0, 6)
    return out


CLIP_DEFS = {
    "Idle": Clip("Idle", 2.4, idle),
    "Walk": Clip("Walk", 0.9, walk),
    "Run": Clip("Run", 0.58, run),
    "Windup": Clip("Windup", WINDUP_DURATION, windup, loop=False),
    "Strike": Clip("Strike", 1.2, strike, loop=False),
    "Alert": Clip("Alert", 1.0, alert, loop=False),
    "Push": Clip("Push", 0.45, push, loop=False),
    "Stumble": Clip("Stumble", 0.8, stumble, loop=False),
    "Dazed": Clip("Dazed", 1.4, dazed),
}

#: Shared-rig clips the enemy keeps unchanged (defeat poses and the match-end reactions).
SHARED = ("Win", "Lose", "DieBlast", "DieVehicle")

AGBERO_CLIPS = list(CLIP_DEFS.values()) + [c for c in rig.CLIPS if c.name in SHARED]
