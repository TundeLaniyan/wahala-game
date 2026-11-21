"""Heroes and campaign bosses (fighter clip set: Place / Throw / Kick / Push ...). Imported by roster.py."""
from __future__ import annotations

import numpy as np
from PIL import ImageFont

import charkit as ck
import kit_head as kh
import patterns
from charkit import hexrgb
from costume import Ctx
import mhbody


def spec_of(**kw) -> mhbody.BodySpec:
    d = dict(african=1.0, asian=0.0, caucasian=0.0)
    d.update(kw)
    return mhbody.BodySpec(**d)


def _font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _jersey_edge(c: Ctx, p, white=0xf4f2ea, neck_band=0.016):
    """White trim on the armholes and the neckline of a sleeveless jersey."""
    v = p.v
    aw = c.armw(v)
    r = np.sqrt(v[:, 0] ** 2 + (v[:, 2] - c.j["neck"][2]) ** 2)
    p.c[(np.abs(aw - 0.42) < 0.07)] = hexrgb(white)
    p.c[(v[:, 1] > c.neck_y - 0.12) & (np.abs(r - 0.078) < neck_band)] = hexrgb(white)


# ============================================================================================== HEROES


def street_baller():
    c = Ctx(spec_of(gender=1.0, age=0.47, muscle=0.64, weight=0.38, height=0.62), 1.84)
    j = c.j
    green = 0x1fa357
    # baggy basketball shorts; compression tights on the LEFT leg only (asymmetric kit)
    c.trousers("tight_L", 0x1b1c20, hem=0.14, base=0.005, side="L", budget=700)
    c.trousers("shorts", 0x30343c, hem=0.46, base=0.024, loose=0.030, budget=1000)
    c.sleeve("L", 0x1b1c20, start=0.05, end=0.97, off=0.005, name="comp_sleeve")  # left arm compression sleeve
    jr = c.top("jersey", green, hem=0.03, sleeve=0.0, base=0.016, loose=0.022, neck_r=0.082, neck_drop=0.02, budget=1700)
    _jersey_edge(c, jr)

    def num(d, size):
        f = _font(420)
        d.text((size[0] // 2, size[1] // 2), "10", font=f, fill=(244, 242, 234, 255), anchor="mm", stroke_width=10, stroke_fill=(20, 80, 40, 255))

    c.decal(jr, (-0.115, 0.115, j["spine"][1] - 0.05, j["chest"][1] + 0.12), "front", num, name="num_front")
    c.decal(jr, (-0.125, 0.125, j["spine"][1] - 0.05, j["chest"][1] + 0.14), "back", num, name="num_back")
    # cross-body bag: strap right shoulder -> left hip, small bag at the left hip
    c.sash("strap", 0x2a2622, width=0.040, side="R", off=0.050, budget=500, mat="leather")
    rx, rz, cz = c.torso_radii(c.hip_y + 0.02)
    c.box("bag", (0.165, c.hip_y - 0.03, cz + 0.02), (0.075, 0.150, 0.190), "hips", hexrgb(0x35302a), radius=0.022, mat="leather")
    c.limb_ring("wristband", "R", "forearm_R", "hand_R", 0.86, 0.045, 0.012, 0xf4f2ea, bone="forearm_R")
    c.shoes("sneaker", upper=0xe9e5dc, sole=0xf5f3ee, accent=0xd8342a, bulk=1.2)
    kh.afro(c, 0x0c0a09, size=0.30, noise=0.008)
    return c, dict(base=0x6a4428, kw=dict(brow_thick=1.1, beard=0.2, mustache=0.25, seed=31, scalp=dict(color=0x0c0a09, line=0.062)))


def campus_queen():
    c = Ctx(spec_of(gender=0.0, age=0.44, muscle=0.52, weight=0.34, height=0.52, detail={"torso/torso-vshape-decr|incr": 0.2}), 1.68)
    j = c.j
    c.pattern_img = patterns.ankara()
    c.trousers("cargo", 0x66754d, hem=0.10, base=0.020, loose=0.018, budget=1500)
    c.top("tank", 0x4a4d54, hem=0.03, sleeve=0.0, base=0.008, loose=0.0, neck_r=0.066, neck_drop=0.02, budget=800)
    jk = c.top("bomber", 0xffffff, hem=-0.045, sleeve=1.0, base=0.018, loose=0.020, loose_from=1.45, open_front=0.030, neck_r=0.066, budget=1900)
    jk.c[:] = 1.0
    c.pattern(jk, scale=0.15)
    # ribbed hem and cuffs (plain bands)
    rib = ck.garment(c.skin, c.torso_arm, lambda p: np.minimum(0.030 - (p[:, 1] - (c.hip_y + 0.045 - 0.032)), (p[:, 1] - (c.hip_y + 0.045 - 0.04)) * 0 + 1.0) * 1.0, 0.022, "rib", "cloth", color=hexrgb(0x1f5f5a), relax_iters=1) if False else None
    rx, rz, cz = c.torso_radii(c.hip_y - 0.04)
    c.box("belt_pouch", (0.150, c.hip_y - 0.07, cz + 0.02), (0.060, 0.120, 0.100), "hips", hexrgb(0x4a3a2a), radius=0.016, mat="leather")
    for x in (0.0, 0.0):
        c.belt("belt", 0x2a2622, c.hip_y - 0.01, 0.034, grow=0.030, buckle=0xb89a4a)
    for s_ in ("L", "R"):
        c.limb_ring("bracelet", s_, f"forearm_{s_}", f"hand_{s_}", 0.88, 0.03, 0.009, 0xc89a3a, bone=f"forearm_{s_}", mat="metal")
    c.shoes("boot", leather=0x2a2826, sole=0x151516, toecap=0x39373a, shaft=0.17)
    kh.locs(c, 0x1b130f, count=16, length=0.30, radius=0.0135)
    return c, dict(base=0x5e3a26, kw=dict(brow_thick=0.85, beard=0.0, mustache=0.0, lip=0.5, seed=37, cheek_warm=0.07, scalp=dict(color=0x120d0a, line=0.060)))


def lekki_boy():
    c = Ctx(spec_of(gender=1.0, age=0.50, muscle=0.52, weight=0.40, height=0.60), 1.80)
    j = c.j
    c.pattern_img = patterns.resort()
    c.trousers("chinos", 0x2a3558, hem=0.07, base=0.014, loose=0.006, budget=1500)
    c.top("tank", 0xf1efe9, hem=0.06, sleeve=0.0, base=0.008, loose=0.0, neck_r=0.060, neck_drop=0.04, budget=800)
    sh = c.top("shirt", 0x7a1d46, hem=0.07, sleeve=0.32, base=0.014, loose=0.018, open_front=0.055, neck_r=0.066, budget=1800)
    c.pattern(sh, scale=0.09)
    sh.c[:] = hexrgb(0x8b2450)
    c.belt("belt", 0x2b2118, c.hip_y - 0.005, 0.030, grow=0.026, buckle=0xc8a24a)
    c.limb_ring("watch", "L", "forearm_L", "hand_L", 0.93, 0.034, 0.009, 0x16171a, bone="forearm_L")
    c.shoes("sneaker", upper=0xf2efe9, sole=0xf8f6f1, accent=0xe6e2d8, bulk=1.05)
    return c, dict(base=0x5a3a26, kw=dict(brow_thick=1.0, beard=0.3, mustache=0.3, seed=41, scalp=dict(color=0x0b0908, line=0.058, low_fade=0.5)))


# ============================================================================================== BOSSES


def oga_sunmola():
    c = Ctx(spec_of(gender=1.0, age=0.70, muscle=0.50, weight=0.90, height=0.40), 1.72)
    j = c.j
    c.pattern_img = patterns.embroidery(ground=(98, 42, 150), motif=(226, 176, 66), line=(226, 176, 66))
    c.trousers("sokoto", 0x8a4ab8, hem=0.07, base=0.020, loose=0.030, budget=1400)
    rb = c.robe("agbada", 0xffffff, hem=0.26, base=0.034, body_flare=0.13, sleeve_flare=0.13, sleeve=0.98, budget=2800, neck_r=0.076)
    rb.c[:] = 1.0  # the printed tile carries the purple and gold
    c.pattern(rb, scale=0.12)
    c.necklace("beads", 0xd8a83a, drop=0.12, radius=0.010)
    h = j["hand_R"]
    c.add(ck.prim_cyl("mic_handle", "metal", h + np.array([0.0, 0.04, 0.03]), h + np.array([0.0, -0.10, 0.06]), 0.016, 0.014, "hand_R", hexrgb(0x2a2a2d), sides=10))
    c.add(ck.prim_ellipsoid("mic_head", "metal", h + np.array([0.0, 0.065, 0.025]), (0.030, 0.034, 0.030), "hand_R", hexrgb(0xb7babf), lat=8, lon=12))
    c.shoes("sneaker", upper=0x3a2a1c, sole=0x201810, accent=0x4a3826, toe_box=0.8)
    kh.fila(c, 0x7a3aa8, trim=0xd8a83a)
    return c, dict(base=0x5c3a24, kw=dict(brow_thick=1.3, beard=0.0, mustache=0.7, lip=0.3, seed=43, scalp=dict(color=0x1a1612, line=0.090)))


def madam_ronke():
    c = Ctx(spec_of(gender=0.0, age=0.78, muscle=0.40, weight=0.72, height=0.38), 1.62)
    j = c.j
    c.pattern_img = patterns.lace()
    sk = c.skirt("wrapper", 0xffffff, hem=0.12, base=0.034, flare=0.10, budget=1700)
    sk.c[:] = hexrgb(0x2f8f8a)
    c.pattern(sk, scale=0.11)
    bl = c.top("blouse", 0xffffff, hem=0.10, sleeve=0.60, base=0.016, loose=0.022, neck_r=0.072, budget=1700)
    bl.c[:] = hexrgb(0xf0c34a)
    c.pattern(bl, scale=0.09)
    c.top("apron", 0x3a3631, hem=0.18, sleeve=0.0, base=0.030, loose=0.018, neck_r=0.066, budget=1000)
    rx, rz, cz = c.torso_radii(c.hip_y - 0.03)
    c.belt("sash", 0x6a5a3a, c.hip_y - 0.01, 0.060, grow=0.040, buckle=None)
    c.box("apron_pocket", (0.0, c.hip_y - 0.14, cz + rz + 0.05), (0.18, 0.12, 0.03), "hips", hexrgb(0x3f3a34), radius=0.010)
    for i, x in enumerate((-0.07, -0.045)):
        c.add(ck.prim_cyl("key", "metal", (x, c.hip_y - 0.10, cz + rz + 0.07), (x, c.hip_y - 0.16, cz + rz + 0.07), 0.006, 0.006, "hips", hexrgb(0xb9a24a), sides=6))
    c.necklace("coral", 0xd8472f, drop=0.11, radius=0.011)
    c.eyewear("glasses", color=0x15151a, frame=0x8a6a3a, wide=0.95)
    h = j["hand_L"]
    c.add(ck.prim_box("ledger", "leather", h + np.array([0.02, 0.0, 0.10]), (0.20, 0.012, 0.27), "hand_L", hexrgb(0xcdb98a), radius=0.004, R=ck.rotmat("x", -50)))
    c.shoes("sneaker", upper=0x2a2420, sole=0x6a5338, accent=0x3a3128, toe_box=0.7, high=0.0)
    kh.gele(c, 0x1f7a78, 0xd8a83a, size=1.12)
    return c, dict(base=0x4f311d, kw=dict(brow_thick=0.9, beard=0.0, mustache=0.0, lip=0.5, seed=47, cheek_warm=0.05))


def marshal_kobo():
    c = Ctx(spec_of(gender=1.0, age=0.64, muscle=0.80, weight=0.74, height=0.66, detail={"torso/torso-scale-horiz-decr|incr": 0.4, "measure/measure-neck-circ-decr|incr": 0.6, "torso/torso-muscle-pectoral-decr|incr": 0.6}), 1.86)
    j = c.j
    navy, grey, orange = 0x30426f, 0x6f747d, 0xf5832e
    tr = c.trousers("trousers", grey, hem=0.12, base=0.020, loose=0.020, budget=1500)
    tv = tr.v
    tr.c[(np.abs(tv[:, 2] - c.j['thigh_L'][2]) < 0.016) & (np.abs(tv[:, 0]) > 0.10) & (tv[:, 1] < c.hip_y - 0.05)] = hexrgb(orange)  # orange side stripes (outer seam only)
    c.top("shirt", navy, hem=0.09, sleeve=1.0, base=0.016, loose=0.016, neck_r=0.070, budget=1900)
    vest = c.top("vest", 0x2f3138, hem=0.03, sleeve=0.0, base=0.046, loose=0.016, neck_r=0.070, budget=1700)
    vv = vest.v
    vest.c[(np.abs(vv[:, 0]) > 0.115) & (vv[:, 1] > j["chest"][1] - 0.05)] = hexrgb(orange)
    c.belt("belt", 0x232326, c.hip_y - 0.03, 0.055, grow=0.044)
    rx, rz, cz = c.torso_radii(c.hip_y - 0.05)
    c.box("radio", (-0.14, c.hip_y - 0.05, cz + rz + 0.05), (0.05, 0.12, 0.04), "hips", hexrgb(0x17181b), radius=0.006)
    h = j["hand_R"]
    c.add(ck.prim_cyl("wand", "plastic", h + np.array([0.0, 0.07, 0.02]), h + np.array([0.0, -0.32, 0.12]), 0.019, 0.019, "hand_R", hexrgb(0xff8a1f), sides=10))
    c.shoes("boot", leather=0x2a2826, sole=0x151516, toecap=0x3c3a3b, shaft=0.22)
    return c, dict(base=0x4a2c1b, kw=dict(brow_thick=1.2, beard=0.5, mustache=0.45, scar=True, seed=53, scalp=dict(color=0x0b0908, line=0.070, low_fade=0.5)))


def ikenna_wayside():
    c = Ctx(spec_of(gender=1.0, age=0.68, muscle=0.58, weight=0.66, height=0.50), 1.76)
    j = c.j
    orange, dark, yellow = 0xf58a2e, 0x4b5058, 0xe8dc4a
    tr = c.trousers("workpants", dark, hem=0.12, base=0.020, loose=0.018, budget=1500)
    tv = tr.v
    for yy in (0.34, 0.74):
        tr.c[np.abs(tv[:, 1] - yy) < 0.020] = hexrgb(yellow)
    jk = c.top("hivis", orange, hem=0.09, sleeve=1.0, base=0.022, loose=0.020, neck_r=0.070, budget=2000)
    jv = jk.v
    for yy in (c.hip_y + 0.12, c.hip_y + 0.32):
        jk.c[np.abs(jv[:, 1] - yy) < 0.022] = hexrgb(yellow)
    sd = c.arm_cut(1.0)(jv)
    jk.c[(sd > 0.10) & (sd < 0.13) & (np.abs(jv[:, 0]) > 0.19)] = hexrgb(yellow)
    c.gloves(0xb9a678, cuff=0.05)
    rx, rz, cz = c.torso_radii(c.hip_y - 0.03)
    c.belt("belt", 0x2a2622, c.hip_y - 0.03, 0.050, grow=0.044)
    c.box("radio", (-0.12, j["chest"][1] + 0.16, cz + rz + 0.06), (0.050, 0.115, 0.04), "chest", hexrgb(0x17181b), radius=0.006)
    c.shoes("boot", leather=0x3a332c, sole=0x151516, toecap=0x4d463c, shaft=0.20)
    kh.peaked_cap(c, 0x2a3354, band=0x1a2040, badge=0xd8a83a)
    c.add(ck.prim_path("headset", "plastic", [(0.075, c.H["eye_y"] + 0.03, 0.0), (0.082, c.H["eye_y"] - 0.02, 0.01), (0.04, c.H["eye_y"] - 0.07, c.H["cz"] + c.H["rz"] * 0.9)], [0.004, 0.004, 0.004], "head", hexrgb(0x1a1a1c), sides=5, caps=True))
    return c, dict(base=0x4b2f1e, kw=dict(brow_thick=1.15, beard=0.35, mustache=0.35, seed=59, scalp=dict(color=0x0d0b0a, line=0.075)))


def barrister_quill():
    c = Ctx(spec_of(gender=1.0, age=0.80, muscle=0.34, weight=0.24, height=0.86), 1.90)
    j = c.j
    c.pattern_img = patterns.brocade()
    c.trousers("trousers", 0x2b3354, hem=0.08, base=0.014, loose=0.004, budget=1400)
    c.top("turtleneck", 0x2a2d36, hem=0.06, sleeve=1.0, base=0.008, loose=0.004, neck_r=0.052, neck_drop=-0.045, budget=1400)
    bz = c.top("blazer", 0xffffff, hem=0.17, sleeve=1.0, base=0.020, loose=0.016, open_front=0.060, neck_r=0.070, budget=2200)
    bz.c[:] = hexrgb(0x8a6a50)
    c.pattern(bz, scale=0.10)
    c.eyewear("glasses", color=0x2a2a2a, frame=0xc8a24a, wide=1.0)
    h = j["hand_R"]
    c.add(ck.prim_box("briefcase", "leather", h + np.array([0.0, -0.20, 0.02]), (0.050, 0.30, 0.40), "hand_R", hexrgb(0x5a3420), radius=0.016))
    c.add(ck.prim_path("case_handle", "leather", [h + np.array([0.0, -0.08, -0.07]), h + np.array([0.0, -0.045, 0.0]), h + np.array([0.0, -0.08, 0.07])], [0.007] * 3, "hand_R", hexrgb(0x3a2214), sides=6))
    c.shoes("sneaker", upper=0x1c1816, sole=0x100d0c, accent=0x2a2420, toe_box=0.9)
    return c, dict(base=0x573820, kw=dict(brow_thick=1.1, beard=0.2, mustache=0.25, seed=61, scalp=dict(color=0x9a9a98, line=0.100), eye_shadow=0.24))


def steward_halcyon():
    c = Ctx(spec_of(gender=1.0, age=0.60, muscle=0.50, weight=0.42, height=0.78), 1.88)
    j = c.j
    c.trousers("trousers", 0x1f2940, hem=0.08, base=0.016, loose=0.010, budget=1300)
    tn = c.robe("tunic", 0x3c4b78, hem=0.52, base=0.020, body_flare=0.030, sleeve_flare=0.018, sleeve=0.98, budget=2400, neck_r=0.066)
    tv = tn.v
    tn.c[(tv[:, 1] > c.hip_y + 0.18) & (np.abs(tv[:, 0]) < 0.040) & (tv[:, 2] > 0.0)] = hexrgb(0xb9c2d8)  # chest embroidery panel
    h = j["hand_L"]
    c.add(ck.prim_box("tablet", "plastic", h + np.array([0.02, 0.03, 0.09]), (0.17, 0.011, 0.23), "hand_L", hexrgb(0x15171d), radius=0.004, R=ck.rotmat("x", -55)))
    c.add(ck.prim_ellipsoid("earpiece", "plastic", (0.082, c.H["eye_y"] - 0.01, c.H["cz"] - 0.02), (0.008, 0.012, 0.012), "head", hexrgb(0x101012), lat=6, lon=8))
    c.shoes("sneaker", upper=0x15110f, sole=0x0b0908, accent=0x201a17, toe_box=0.9)
    return c, dict(base=0x4d301f, kw=dict(brow_thick=1.05, beard=0.4, mustache=0.35, seed=67, scalp=dict(color=0x0a0908, line=0.068, low_fade=0.6)))


def the_landlord():
    c = Ctx(spec_of(gender=1.0, age=0.84, muscle=0.72, weight=0.82, height=0.62, detail={"torso/torso-scale-horiz-decr|incr": 0.4, "measure/measure-neck-circ-decr|incr": 0.6}), 1.84)
    j = c.j
    c.pattern_img = patterns.plaid()
    c.trousers("trousers", 0x2c3b36, hem=0.12, base=0.022, loose=0.020, budget=1500)
    c.top("tunic", 0x34463f, hem=0.12, sleeve=1.0, base=0.020, loose=0.022, neck_r=0.072, budget=1900)
    sa = c.sash("wrap", 0xffffff, width=0.20, side="L", off=0.040, budget=1300)
    sa.c[:] = hexrgb(0x5e8a78)
    c.pattern(sa, scale=0.09)
    vest = c.top("chest_rig", 0x2b2c30, hem=0.04, sleeve=0.0, base=0.052, loose=0.014, neck_r=0.068, budget=1500)
    rx, rz, cz = c.torso_radii(j["chest"][1] - 0.05)
    for x in (-0.09, 0.0, 0.09):
        c.box("rig_pouch", (x, j["chest"][1] - 0.06, cz + rz + 0.07), (0.070, 0.10, 0.035), "chest", hexrgb(0x2a2b30), radius=0.008)
    c.box("rig_patch", (-0.10, j["chest"][1] + 0.08, cz + rz + 0.06), (0.06, 0.05, 0.012), "chest", hexrgb(0xe0902a), radius=0.004)
    c.belt("belt", 0x2a2622, c.hip_y - 0.03, 0.050, grow=0.046)
    h = j["hand_R"]
    c.add(ck.prim_cyl("cane", "metal", h + np.array([0.0, 0.05, 0.02]), h + np.array([0.0, -0.78, 0.06]), 0.013, 0.011, "hand_R", hexrgb(0xc2994a), sides=8))
    c.add(ck.prim_ellipsoid("cane_top", "metal", h + np.array([0.0, 0.065, 0.02]), (0.030, 0.026, 0.030), "hand_R", hexrgb(0xd4ab55), lat=8, lon=12))
    c.shoes("boot", leather=0x3a332c, sole=0x151516, toecap=0x4d463c, shaft=0.22)
    kh.fila(c, 0x4a5a3c, trim=0xc9a24a)
    return c, dict(base=0x4b2d1c, kw=dict(brow_thick=1.35, beard=0.85, mustache=0.8, seed=71, scalp=dict(color=0x8c8c8a, line=0.090), eye_shadow=0.28))


FIGHTERS = {
    "streetBaller": street_baller,
    "campusQueen": campus_queen,
    "lekkiBoy": lekki_boy,
    "bossOgaSunmola": oga_sunmola,
    "bossMadamRonke": madam_ronke,
    "bossMarshalKobo": marshal_kobo,
    "bossIkennaWayside": ikenna_wayside,
    "bossBarristerQuill": barrister_quill,
    "bossStewardHalcyon": steward_halcyon,
    "bossTheLandlord": the_landlord,
}
