"""WAHALA! roster: one builder per character on the MakeHuman-derived pipeline (docs/CHARACTER_PRODUCTION_ROSTER.md).

    python3 tools/assets3/roster.py [id ...]       # writes src/assets/models/lazy/char_<id>.glb

Each builder returns a Ctx (skin + garments + props) and the skin-texture parameters.  Measurements come from the morphed body,
so garments, hats and props follow every body type.
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "assets"))

import charkit as ck
import costume
import kit_head as kh
import mhbody
from charkit import Part, hexrgb
from costume import Ctx

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets", "models", "lazy")


def stripes(draw_cb):
    return draw_cb


def spec_of(**kw) -> mhbody.BodySpec:
    d = dict(african=1.0, asian=0.0, caucasian=0.0)
    d.update(kw)
    return mhbody.BodySpec(**d)


def wrap_forearm(c: Ctx, side: str, color, color2=None, at=0.12, length=0.17, stripe=False, grow=0.010):
    p = c.limb_ring(f"wrap_{side}", side, f"forearm_{side}", f"hand_{side}", at + length / 2 / 0.25, length, grow, color, bone=f"forearm_{side}")
    if stripe and color2 is not None:
        t = (p.v[:, 1] * 0.0) + np.sin((p.v[:, 1] + 0.6 * p.v[:, 0]) * 190) > 0.0
        p.c[t] = hexrgb(color2)
    return p


# ============================================================================================== ENEMIES


def agbero() -> Ctx:
    c = Ctx(spec_of(gender=1.0, age=0.57, muscle=0.66, weight=0.55, height=0.56), 1.82)
    j = c.j
    olive, olive_dk, tee, denim = 0x6a7d58, 0x45543a, 0x575b62, 0x4c6b92
    c.trousers("jeans", denim, hem=0.06, base=0.016, loose=0.010, budget=1500)
    c.top("tee", tee, hem=0.10, sleeve=0.30, base=0.008, loose=0.006, budget=900)
    v = c.top("vest", olive, hem=0.045, sleeve=0.0, base=0.022, loose=0.012, open_front=0.060, budget=1700, neck_r=0.068)
    v.c[(v.v[:, 1] < c.hip_y - 0.02)] = hexrgb(olive_dk)
    c.belt("belt", 0x2a2622, c.hip_y - 0.045, 0.036)
    rx, rz, cz = c.torso_radii(c.hip_y - 0.07)
    c.box("fanny_pack", (0.090, c.hip_y - 0.085, cz + rz + 0.050), (0.200, 0.120, 0.085), "hips", hexrgb(0x8c8664), radius=0.024)
    c.box("radio", (-0.165, c.hip_y - 0.050, cz + 0.02), (0.040, 0.115, 0.032), "hips", hexrgb(0x15161a), radius=0.005)
    for s_ in ("L", "R"):
        wrap_forearm(c, s_, 0xd9ccaa, 0xb2a581, at=0.10, length=0.20, stripe=True)
    # orange hazard bandana, right upper arm
    c.limb_ring("bandana", "R", "upperarm_R", "forearm_R", 0.45, 0.075, 0.014, 0xf06a1c, bone="upperarm_R")
    c.shoes("sneaker", upper=0x7b8088, sole=0xe0dacb, accent=0x2e3d78)
    return c, dict(base=0x5b3822, kw=dict(brow_thick=1.25, beard=0.35, mustache=0.4, seed=5, scalp=dict(color=0x0b0908, line=0.060)))


def area_boy() -> Ctx:
    c = Ctx(spec_of(gender=1.0, age=0.46, muscle=0.40, weight=0.30, height=0.55), 1.76)
    j, H = c.j, c.H
    burg, burg_dk, navy = 0x8f2236, 0x5d1424, 0x1d2a52
    c.trousers("tights", 0x17181c, hem=0.10, base=0.0045, budget=1100)
    c.trousers("shorts", 0x2b2e34, hem=0.50, base=0.020, loose=0.016, budget=900)
    for sx in (1, -1):
        c.box("pocket", (sx * 0.150, 0.70, 0.050), (0.034, 0.11, 0.100), "thigh_L" if sx > 0 else "thigh_R", hexrgb(0x2b2e34), radius=0.008)
    c.top("tee", 0x70747b, hem=0.085, sleeve=0.0, base=0.008, loose=0.0, neck_r=0.060, budget=700)
    jk = c.top("jacket", burg, hem=0.115, sleeve=1.0, base=0.013, loose=0.015, open_front=0.034, neck_r=0.064, budget=1900)
    jv = jk.v
    jk.c[(jv[:, 1] > j["chest"][1] + 0.12)] = hexrgb(navy)
    jk.c[(np.abs(jv[:, 0]) > 0.19) & (jv[:, 1] > j["forearm_L"][1] + 0.06)] = hexrgb(navy)
    jk.c[(jv[:, 1] < c.hip_y - 0.115 + 0.045) & (np.abs(jv[:, 0]) < 0.22)] = hexrgb(burg_dk)
    sd = c.arm_cut(1.0)(jk.v)
    jk.c[(sd < 0.04) & (np.abs(jv[:, 0]) > 0.19)] = hexrgb(burg_dk)
    jk.c[(np.abs(np.abs(jv[:, 0]) - 0.034) < 0.010) & (jv[:, 2] > j["spine"][2]) & (jv[:, 1] > c.hip_y - 0.12)] = hexrgb(0xb5b8bd)
    hood = ck.prim_ellipsoid("hood", "cloth", (0.0, c.neck_y + 0.015, j["neck"][2] - 0.078), (0.092, 0.080, 0.088), "chest", hexrgb(navy), lat=10, lon=18)
    c.add(ck.weights_from_skin(hood, c.skin))
    c.shoes("sneaker", upper=0x4a525e, sole=0xe9e5dc, accent=0xcfcac0)
    kh.cap(c, 0x8b8478, 0x77716a, backward=True)
    ax = (j["forearm_L"] - j["hand_L"]) / np.linalg.norm(j["forearm_L"] - j["hand_L"])
    ctr = j["hand_L"] + ax * 0.035
    c.add(ck.prim_cyl("watch", "metal", ctr - ax * 0.012, ctr + ax * 0.012, 0.0345, 0.0345, "forearm_L", hexrgb(0xc8a24a), sides=14))
    return c, dict(base=0x6b432b, kw=dict(brow_thick=1.1, beard=0.25, mustache=0.35, seed=3, scalp=dict(color=0x0d0a09, line=0.072)))


def bottle_thrower() -> Ctx:
    c = Ctx(spec_of(gender=1.0, age=0.47, muscle=0.44, weight=0.40, height=0.50), 1.76)
    j, H = c.j, c.H
    c.trousers("cargo", 0x66784f, hem=0.07, base=0.020, loose=0.018, budget=1500)
    for sx in (1, -1):
        c.box("cargo_pkt", (sx * 0.155, 0.62, 0.060), (0.034, 0.13, 0.115), "thigh_L" if sx > 0 else "thigh_R", hexrgb(0x5d6e47), radius=0.008)
    c.top("tee", 0x5a5e64, hem=0.07, sleeve=0.34, base=0.012, loose=0.020, budget=1300)
    # cargo backpack with bottle necks sticking out
    rx, rz, cz = c.torso_radii(j["chest"][1] + 0.02)
    c.box("pack", (0.0, j["chest"][1] - 0.02, cz - rz - 0.085), (0.300, 0.340, 0.150), "chest", hexrgb(0x454a38), radius=0.035)
    c.box("pack_flap", (0.0, j["chest"][1] + 0.095, cz - rz - 0.098), (0.300, 0.120, 0.060), "chest", hexrgb(0x52583f), radius=0.022)
    for i, x in enumerate((-0.09, -0.02, 0.07)):
        c.add(ck.prim_path(f"bottle{i}", "plastic", [(x, j["chest"][1] + 0.12, cz - rz - 0.08), (x + 0.01 * (1 - i), j["chest"][1] + 0.26, cz - rz - 0.075 + 0.01 * i)], [0.022, 0.011], "chest", hexrgb([0x3f8f4f, 0x6b4a1f, 0x3f8f4f][i]), sides=8))
    for s_ in ("L", "R"):  # shoulder straps
        c.add(ck.prim_path("strap", "cloth", [(0.095 if s_ == "L" else -0.095, j["chest"][1] + 0.19, cz - rz - 0.05), (0.095 if s_ == "L" else -0.095, j["chest"][1] + 0.19, cz + rz + 0.02), (0.075 if s_ == "L" else -0.075, j["chest"][1] - 0.10, cz + rz + 0.02)], [0.020, 0.020, 0.020], "chest", hexrgb(0x242820), sides=5, caps=False))
    w = wrap_forearm(c, "R", 0xd8b236, 0x1a1a1a, at=0.10, length=0.22, stripe=True, grow=0.014)
    c.shoes("sneaker", upper=0x6e6a5c, sole=0xcfc9b8, accent=0x56524a)
    kh.cap(c, 0x8e8a74, 0x7d7964, backward=False, base_off=0.030)
    return c, dict(base=0x5d3c26, kw=dict(brow_thick=1.0, beard=0.15, mustache=0.2, seed=9, scalp=dict(color=0x0c0a09, line=0.062)))


def market_enforcer() -> Ctx:
    c = Ctx(spec_of(gender=0.05, age=0.60, muscle=0.55, weight=0.80, height=0.45), 1.66)
    j, H = c.j, c.H
    c.skirt("wrapper", 0x2f4f86, hem=0.30, base=0.030, flare=0.07, budget=1600)
    c.top("blouse", 0x3a5aa0, hem=0.12, sleeve=0.38, base=0.014, loose=0.020, budget=1500, neck_r=0.070)
    rx, rz, cz = c.torso_radii(j["chest"][1] - 0.05)
    c.top("apron", 0x6b5640, hem=0.30, sleeve=0.0, base=0.030, loose=0.022, budget=1100, neck_r=0.066, open_front=0.0)
    c.belt("hip_cloth", 0x8f8a64, c.hip_y - 0.02, 0.085, grow=0.052, buckle=None)
    c.box("cloth_knot", (0.04, c.hip_y - 0.09, cz + rz + 0.07), (0.15, 0.17, 0.05), "hips", hexrgb(0x8f8a64), radius=0.022)
    c.box("tool_pouch", (0.11, j["chest"][1] - 0.18, cz + rz + 0.045), (0.07, 0.12, 0.03), "chest", hexrgb(0x4a3b2a), radius=0.008)
    for s_ in ("L", "R"):
        wrap_forearm(c, s_, 0xcfc29e, 0xd8b236, at=0.10, length=0.20, stripe=True)
    c.shoes("sneaker", upper=0x3d2f22, sole=0x2a2018, accent=0x4a3a2c, toe_box=0.8)
    kh.gele(c, 0x1d2342, 0x2a3260, size=0.80)
    return c, dict(base=0x53331f, kw=dict(brow_thick=1.0, beard=0.0, mustache=0.0, lip=0.45, seed=11, cheek_warm=0.07))


def heavy_enforcer() -> Ctx:
    bulk = {
        "torso/torso-scale-horiz-decr|incr": 0.55, "torso/torso-scale-depth-decr|incr": 0.45, "torso/torso-muscle-dorsi-decr|incr": 0.9,
        "torso/torso-muscle-pectoral-decr|incr": 0.9, "torso/torso-vshape-decr|incr": 0.6, "measure/measure-neck-circ-decr|incr": 0.9,
        "measure/measure-upperarm-circ-decr|incr": 0.8, "measure/measure-thigh-circ-decr|incr": 0.6, "measure/measure-waist-circ-decr|incr": 0.5,
        "measure/measure-shoulder-dist-decr|incr": 0.5, "head/head-scale-horiz-decr|incr": 0.2, "chin/chin-width-decr|incr": 0.5,
    }
    c = Ctx(spec_of(gender=1.0, age=0.58, muscle=0.92, weight=0.78, height=0.80, detail=bulk), 1.95)
    j, H = c.j, c.H
    olive, dark = 0x707658, 0x4c5040
    c.trousers("trousers", olive, hem=0.12, base=0.024, loose=0.022, budget=1500)
    c.top("jacket", olive, hem=0.10, sleeve=1.0, base=0.020, loose=0.020, neck_r=0.072, budget=2000)
    c.top("vest", dark, hem=0.02, sleeve=0.0, base=0.052, loose=0.020, neck_r=0.070, budget=1700)
    for s_ in ("L", "R"):
        sgn = 1 if s_ == "L" else -1
        sh = j[f"upperarm_{s_}"]
        c.add(ck.prim_ellipsoid("shoulder_pad", "cloth", (sgn * (sh[0] * 0.98 + 0.006), sh[1] + 0.024, sh[2]), (0.082, 0.046, 0.075), f"upperarm_{s_}", hexrgb(dark), lat=10, lon=16, R=ck.rotmat("z", -sgn * 22)))
        c.limb_ring("arm_guard", s_, f"forearm_{s_}", f"hand_{s_}", 0.5, 0.20, 0.020, 0x464a3a, bone=f"forearm_{s_}")
        c.limb_ring("glove", s_, f"hand_{s_}", f"hand_{s_}", 0.0, 0.05, 0.016, 0x16171a, bone=f"hand_{s_}") if False else None
    c.belt("belt", 0x2a2a28, c.hip_y - 0.03, 0.060, grow=0.062)
    c.shoes("boot", leather=0x2c2a27, sole=0x151516, toecap=0x3d3a35, shaft=0.24)
    kh.helmet(c, 0x4d5340, rim_color=0x3a3e30)
    return c, dict(base=0x4a2e1c, kw=dict(brow_thick=1.25, beard=0.4, mustache=0.45, seed=13, scalp=dict(color=0x0c0a09, line=0.12), eye_shadow=0.25))


def route_marshal() -> Ctx:
    c = Ctx(spec_of(gender=1.0, age=0.70, muscle=0.50, weight=0.62, height=0.55), 1.80)
    j, H = c.j, c.H
    olive, orange, navy = 0x5a6b4c, 0xf5832e, 0x2c3a68
    c.trousers("trousers", olive, hem=0.10, base=0.018, loose=0.020, budget=1500)
    c.top("jacket", olive, hem=0.09, sleeve=1.0, base=0.016, loose=0.016, neck_r=0.068, budget=1900)
    vest = c.top("hivis", orange, hem=0.045, sleeve=0.0, base=0.034, loose=0.012, open_front=0.0, neck_r=0.068, budget=1600)
    vv = vest.v
    vest.c[(vv[:, 1] < c.hip_y + 0.22)] = hexrgb(navy)
    for xs in (-0.085, 0.085):  # reflective bands
        vest.c[(np.abs(vv[:, 0] - xs) < 0.014) & (vv[:, 1] > c.hip_y - 0.04)] = hexrgb(0xc9ced6)
    vest.c[(np.abs(vv[:, 1] - (c.hip_y + 0.22)) < 0.012)] = hexrgb(0xc9ced6)
    c.belt("belt", 0x23251f, c.hip_y - 0.03, 0.050, grow=0.040)
    rx, rz, cz = c.torso_radii(c.hip_y - 0.04)
    for x in (-0.13, 0.13):
        c.box("pouch", (x, c.hip_y - 0.05, cz + rz + 0.05), (0.07, 0.10, 0.04), "hips", hexrgb(0x2b2d25), radius=0.008)
    c.box("radio", (-0.12, j["chest"][1] + 0.19, cz + rz + 0.05), (0.045, 0.11, 0.035), "chest", hexrgb(0x15161a), radius=0.006)
    # orange traffic wand in the right hand
    h = j["hand_R"]
    c.add(ck.prim_cyl("wand", "plastic", h + np.array([0.0, 0.07, 0.02]), h + np.array([0.0, -0.30, 0.10]), 0.018, 0.018, "hand_R", hexrgb(0xff8a1f), sides=10))
    c.shoes("boot", leather=0x2c2a27, sole=0x151516, toecap=0x3a3834, shaft=0.20)
    kh.beret(c, 0x1f2a4c, tilt=10) if False else kh.peaked_cap(c, 0x4b5b40, band=0x26261f, badge=0xf0782a)
    return c, dict(base=0x4f3220, kw=dict(brow_thick=1.15, beard=0.55, mustache=0.6, seed=17, scalp=dict(color=0x8d8d8a, line=0.085), eye_shadow=0.22))


def ring_security() -> Ctx:
    c = Ctx(spec_of(gender=1.0, age=0.55, muscle=0.80, weight=0.62, height=0.62), 1.86)
    j, H = c.j, c.H
    navy, olive, orange = 0x2b3b6e, 0x66784f, 0xf5822a
    c.trousers("trousers", navy, hem=0.12, base=0.020, loose=0.020, budget=1500)
    c.top("jacket", navy, hem=0.10, sleeve=1.0, base=0.018, loose=0.016, neck_r=0.070, budget=1900)
    vest = c.top("vest", olive, hem=0.03, sleeve=0.0, base=0.048, loose=0.018, neck_r=0.070, budget=1700)
    vv = vest.v
    vest.c[(np.abs(vv[:, 0]) > 0.12) & (vv[:, 1] > j["chest"][1])] = hexrgb(orange)
    for s_ in ("L", "R"):
        sgn = 1 if s_ == "L" else -1
        sh = j[f"upperarm_{s_}"]
        c.add(ck.prim_ellipsoid("shoulder_plate", "cloth", (sgn * (sh[0] * 0.98 + 0.004), sh[1] + 0.022, sh[2]), (0.085, 0.050, 0.080), f"upperarm_{s_}", hexrgb(olive), lat=10, lon=16, R=ck.rotmat("z", -sgn * 20)))
        c.limb_ring("arm_guard", s_, f"forearm_{s_}", f"hand_{s_}", 0.5, 0.18, 0.022, 0x4a5a3a, bone=f"forearm_{s_}")
        kn = j[f"shin_{s_}"]
        c.add(ck.prim_ellipsoid("knee_pad", "cloth", (kn[0], kn[1] + 0.0, kn[2] + 0.075), (0.065, 0.075, 0.032), f"shin_{s_}", hexrgb(0x4a5a3a), lat=8, lon=14))
    c.belt("belt", 0x2a2a2b, c.hip_y - 0.03, 0.055, grow=0.045)
    rx, rz, cz = c.torso_radii(c.hip_y - 0.05)
    c.add(ck.prim_cyl("baton", "plastic", (0.17, c.hip_y - 0.03, cz + 0.02), (0.20, c.hip_y - 0.42, cz + 0.02), 0.014, 0.012, "thigh_L", hexrgb(0x111113), sides=8))
    c.box("radio", (-0.13, c.hip_y - 0.05, cz + rz + 0.05), (0.05, 0.11, 0.04), "hips", hexrgb(0x15161a), radius=0.006)
    c.shoes("boot", leather=0x2c2b28, sole=0x151516, toecap=0x3d3b36, shaft=0.22)
    return c, dict(base=0x3e2619, kw=dict(brow_thick=1.2, beard=0.45, mustache=0.4, seed=19, scalp=dict(color=0x0b0908, line=0.075), eye_shadow=0.24))


def lieutenant() -> Ctx:
    c = Ctx(spec_of(gender=1.0, age=0.50, muscle=0.62, weight=0.40, height=0.62), 1.83)
    j, H = c.j, c.H
    navy, black = 0x2a3a68, 0x2c2e36
    c.trousers("trousers", 0x2c3a62, hem=0.12, base=0.016, loose=0.010, budget=1500)
    c.top("shirt", navy, hem=0.09, sleeve=1.0, base=0.012, loose=0.008, neck_r=0.062, budget=1900)
    c.top("plate_vest", black, hem=0.06, sleeve=0.0, base=0.040, loose=0.008, neck_r=0.064, budget=1500)
    c.belt("belt", 0x25262b, c.hip_y - 0.03, 0.045, grow=0.034)
    rx, rz, cz = c.torso_radii(c.hip_y + 0.05)
    for x in (-0.11, 0.0, 0.11):
        c.box("mag_pouch", (x, j["chest"][1] - 0.04, cz + rz + 0.05), (0.075, 0.10, 0.035), "chest", hexrgb(0x1b1c1f), radius=0.008)
    for s_ in ("L", "R"):
        kn = j[f"shin_{s_}"]
        c.add(ck.prim_ellipsoid("knee_pad", "cloth", (kn[0], kn[1] + 0.0, kn[2] + 0.072), (0.060, 0.070, 0.030), f"shin_{s_}", hexrgb(0x15161a), lat=8, lon=14))
    c.box("radio", (-0.17, j["chest"][1] + 0.12, cz + 0.0), (0.040, 0.100, 0.030), "chest", hexrgb(0x15161a), radius=0.005)
    h = j["hand_L"]
    c.add(ck.prim_box("tablet", "plastic", h + np.array([0.02, 0.03, 0.09]), (0.16, 0.012, 0.22), "hand_L", hexrgb(0x1a1d24), radius=0.004, R=ck.rotmat("x", -55)))
    c.shoes("boot", leather=0x2a2a2e, sole=0x141415, toecap=0x3a3a3f, shaft=0.20)
    return c, dict(base=0x4a2f1d, kw=dict(brow_thick=1.0, beard=0.18, mustache=0.15, seed=23, scalp=dict(color=0x0a0908, line=0.070, low_fade=0.5)))


# ============================================================================================== BUILD

BUILDERS = {
    "agbero": (agbero, "enemy"),
    "areaBoy": (area_boy, "enemy"),
    "bottleThrower": (bottle_thrower, "thrower"),
    "marketEnforcer": (market_enforcer, "enemy"),
    "heavyEnforcer": (heavy_enforcer, "heavy"),
    "routeMarshal": (route_marshal, "enemy"),
    "ringSecurity": (ring_security, "enemy"),
    "lieutenant": (lieutenant, "enemy"),
}


def clips_for(kind: str):
    from enemy_clips import AGBERO_CLIPS
    import rig

    if kind == "thrower":
        extra = [cl for cl in rig.CLIPS if cl.name == "Throw"]
        return AGBERO_CLIPS + extra
    return AGBERO_CLIPS


def build(name: str, tex_res: int = 1024, head_scale: float = 1.06) -> dict:
    import skinbake

    fn, kind = BUILDERS[name]
    c, tex_cfg = fn()
    skin = ck.finish_skin(c.skin, c.G, c.j, 4300)
    skin.mat = "skin"
    skin.c[:] = 1.0
    tex = {"skin": skinbake.bake(skin, c.skin, c.b.helpers, c.j, tex_cfg["base"], res=tex_res, **tex_cfg["kw"])}
    atlas = c.decal_atlas()
    if atlas is not None:
        tex["decal"] = atlas
    parts = [skin] + c.G + ck.make_eyes(c.b)
    os.makedirs(OUT, exist_ok=True)
    return ck.export_glb(os.path.join(OUT, f"char_{name}.glb"), name, parts, c.j, clips_for(kind), textures=tex, head_scale=head_scale)


if __name__ == "__main__":
    for n in sys.argv[1:] or list(BUILDERS):
        print(n, build(n))
