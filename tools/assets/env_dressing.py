"""Street set dressing: kiosk with parasol, lamp, utility pole, tyre stack, barrels, hanging shop signs."""
from __future__ import annotations

import numpy as np

from env_lib import (
    EnvModel,
    Mat,
    beam,
    bevel_box,
    box_uv,
    cyl_uv,
    flat_box,
    flat_uv,
    lathe,
    lathe_mesh,
    noisy,
    obox,
    orient_from,
    outward,
    place,
    planar_uv,
    polytube,
    rod,
    sag_path,
    vc_fn,
    vc_ground,
    vc_mul,
    value_noise,
)
from loft import Mesh, tube
from tex_env import (
    Atlas,
    Sheet,
    concrete_sheet,
    corrugated_panel,
    cracks,
    fit_px,
    gblur,
    hazard_board,
    noise2,
    plastic_sheet,
    scuffs,
    speckle,
    srgb,
    steel_sheet,
    stencil,
    stick_poster,
    striped_canopy_tile,
    wood_sheet,
)

def U(mesh, rect):
    """Box-project a (small, roughly uniform) part onto a tile using its own bounds."""
    return box_uv(mesh, mesh.v.min(axis=0), mesh.v.max(axis=0), rect)


# ============================================================================ kiosk with parasol


def _kiosk_front(seed: int) -> Sheet:
    w, h = 512, 346  # 1.7 x 1.15 m @ 300 px/m
    s = corrugated_panel(w, h, seed, 0x1f8a4c, ribs=24, rust=0.45, wear=0.55)
    ppm = 300.0
    # yellow fascia band above the hatch with the name
    with s.paint(height=0.1, rough=0.55) as d:
        d.rect((0, 12, w, 74), 0xf2c21b)
        d.rect((0, 74, w, 82), 0x14562f)
        d.rect((0, h - 28, w, h - 6), 0xf2c21b, a=0.0)
    with s.paint(height=0.14, rough=0.5) as d:
        px = fit_px("RECHARGE CARDS", w * 0.9, 50, "black", 0.88, 0.02)
        d.text((w / 2 + 2, 44 + 2), "RECHARGE CARDS", px, 0x14201a, "black", "cm", squeeze=0.88, spacing=0.02, a=0.5, wobble=0.01, seed=2)
        d.text((w / 2, 44), "RECHARGE CARDS", px, 0xd62839, "black", "cm", squeeze=0.88, spacing=0.02, wobble=0.01, seed=2)
    # hatch area (painted dark so the edges read as a recess)
    hx0, hx1 = (1.2 - 0.95) * ppm, (1.2 + 0.05) * ppm
    # side stripe + name
    with s.paint(height=0.12, rough=0.5) as d:
        d.text((hx1 + 40, 250), "MAMA JOY", 38, 0xf6f1e0, "black", "cm", squeeze=0.85, rot=0, spacing=0.02)
        d.text((hx1 + 40, 290), "ENT.", 26, 0xf2c21b, "black", "cm", squeeze=0.9)
        d.text((hx0 - 6, 200), "PURE", 24, 0xf6f1e0, "bold", "rm", squeeze=0.85, rot=0)
        d.text((hx0 - 6, 226), "WATER", 24, 0xf6f1e0, "bold", "rm", squeeze=0.85)
        d.text((hx0 - 6, 252), "SNACKS", 24, 0xf2c21b, "bold", "rm", squeeze=0.85)
    stick_poster(s, int(hx1 + 22), 100, 62, 76, seed + 3, rot=3, kind="concert", amount=0.4, shadow=0.4)
    stick_poster(s, 22, 98, 52, 66, seed + 4, rot=-4, kind="sale", amount=0.4, shadow=0.4)
    speckle(s, seed + 5, amount=0.4, density=0.004)
    return s


def _kiosk_side(seed: int) -> Sheet:
    w, h = 300, 346
    s = corrugated_panel(w, h, seed + 8, 0x1f8a4c, ribs=15, rust=0.5, wear=0.6)
    with s.paint(height=0.1, rough=0.55) as d:
        d.rect((0, 12, w, 74), 0xf2c21b)
        d.rect((0, 74, w, 82), 0x14562f)
    with s.paint(height=0.12, rough=0.5) as d:
        px = fit_px("MAMA JOY ENT.", w * 0.9, 44, "black", 0.88, 0.02)
        d.text((w / 2, 44), "MAMA JOY ENT.", px, 0x14201a, "black", "cm", squeeze=0.88, spacing=0.02)
    stencil(s, "NO 07", (w / 2, 240), 54, 0xf6f1e0, "black", a=0.8, squeeze=0.9, wear=0.7, seed=3)
    return s


def _kiosk_interior(seed: int) -> Sheet:
    w, h = 256, 192
    s = Sheet(w, h, 0x1b130d, rough=0.9)
    n = noise2(w, h, seed, fx=4, fy=3)
    s.rgb = s.rgb * (0.6 + 0.9 * n[..., None])
    rng = np.random.default_rng(seed)
    with s.paint() as d:
        for y in (60, 118):  # shelves with lit goods
            d.rect((6, y, w - 6, y + 4), 0x6a4a2c)
            x = 12
            while x < w - 22:
                ww = rng.integers(10, 22)
                hh = rng.integers(16, 36)
                d.rect((x, y - hh, x + ww, y), int(rng.choice([0xd62839, 0xffc300, 0x1f6fe0, 0xf6f1e0, 0x0b8f5c])), a=0.85)
                x += ww + rng.integers(2, 8)
    # a lamp glow from the top
    yy, xx = np.mgrid[0:h, 0:w]
    glow = np.clip(1 - np.hypot((xx - w * 0.7) / w, (yy - 8) / h * 1.2) * 2.2, 0, 1) ** 1.5
    s.comp(0xffd890, glow * 0.45)
    return s


def _kiosk_flap(seed: int) -> Sheet:
    w, h = 256, 112
    s = Sheet(w, h, 0xf2c21b, rough=0.55)
    n = noise2(w, h, seed, fx=5, fy=3)
    s.rgb = s.rgb * (0.85 + 0.25 * n[..., None])
    with s.paint(height=0.1, rough=0.5) as d:
        for k in range(-3, 10):
            d.poly([(k * 40, 0), (k * 40 + 20, 0), (k * 40 + 20 - 40, h), (k * 40 - 40, h)], 0xd62839, a=0.9)
        d.rect((12, 12, w - 12, h - 12), 0xf6f1e0, r=6)
        px = fit_px("MAMA JOY", w - 48, 46, "black", 0.9, 0.03)
        d.text((w / 2, 40), "MAMA JOY", px, 0x0f6b3a, "black", "cm", squeeze=0.9, spacing=0.03)
        px2 = fit_px("AIRTIME + CARDS", w - 56, 24, "black", 0.9, 0.03)
        d.text((w / 2, 82), "AIRTIME + CARDS", px2, 0xb3172b, "black", "cm", squeeze=0.9, spacing=0.03)
    s.comp(0x3a3128, np.clip(noise2(w, h, seed + 2, fx=5, fy=3) * 1.5 - 0.7, 0, 1) * 0.4)
    speckle(s, seed + 3, amount=0.4, density=0.006)
    return s


def kiosk() -> dict:
    seed = 401
    atlas = Atlas(1024, 1024, 0x606060)
    atlas.add("front", 0, 0, _kiosk_front(seed))
    atlas.add("side", 520, 0, _kiosk_side(seed))
    roof = corrugated_panel(512, 300, seed + 20, 0x6e7a80, ribs=22, rust=0.8, wear=0.8)
    atlas.add("roof", 0, 350, roof)
    atlas.add("interior", 520, 350, _kiosk_interior(seed + 21))
    atlas.add("flap", 520, 546, _kiosk_flap(seed + 22))
    atlas.add("canopy", 0, 660, striped_canopy_tile(256, 128, seed + 23, 0xe8512a, 0xf6f1e0))
    atlas.add("wood", 260, 660, wood_sheet(128, 64, seed + 24, 0x8a6038, "x", wear=0.8, knots=1, gap=2))
    atlas.add("steel", 392, 660, steel_sheet(64, 64, seed + 25, tone=0x8a8e92, rust=0.5))
    atlas.add("blue", 460, 660, plastic_sheet(64, 64, seed + 26, 0x1f66d6, rough=0.45))
    bottle = Sheet(64, 64, 0x1f7a45, rough=0.2)
    with bottle.paint() as d:
        d.rect((0, 20, 64, 44), 0xf6f1e0)
        d.rect((0, 20, 64, 26), 0xd62839)
    atlas.add("bottle", 530, 660, bottle)
    atlas.add("rubber", 600, 660, steel_sheet(64, 64, seed + 27, tone=0x4a4a4c, rust=0.2, paint=0x2a2a2c))
    atlas.add("buck", 670, 660, plastic_sheet(64, 64, seed + 28, 0xd9d4c4, rough=0.6, grime=0.7))
    m = EnvModel("env_kiosk")

    W, D, Hh = 1.7, 1.0, 1.2
    cx = -0.35  # kiosk centre; parasol on the right
    R = lambda n: atlas.rect(n)  # noqa: E731
    lo, hi = (cx - W / 2, 0.0, -D / 2), (cx + W / 2, Hh, D / 2)
    front_r = {"+z": R("front"), "-z": R("side"), "+x": R("side"), "-x": R("side"), "+y": R("roof"), "-y": R("steel")}

    def wall(center, size, rects):
        mm = flat_box(size, center)
        return box_uv(mm, lo, hi, rects)

    t = 0.045
    # hollow body: back, left, right, roof, floor + front pieces around the hatch
    hx0, hx1, hy0, hy1 = cx - 0.5, cx + 0.5, 0.52, 0.98
    pieces = [
        ((cx + W / 2 - (W / 2 + cx + 0.0 - hx1 + (W / 2 - 0)) / 2 + 0.0, 0.0, 0.0), None, None),
    ]
    zf = D / 2 - t / 2
    for (x0, x1, y0, y1) in [(cx - W / 2, hx0, 0.1, Hh), (hx1, cx + W / 2, 0.1, Hh), (hx0, hx1, hy1, Hh), (hx0, hx1, 0.1, hy0)]:
        p = flat_box((x1 - x0, y1 - y0, t), ((x0 + x1) / 2, (y0 + y1) / 2, zf))
        mm = box_uv(p, lo, hi, front_r)
        vc_ground(mm, 0.25, 0.4, seed)
        m.add(mm)
    back_r = dict(front_r)
    back_r["+z"] = R("interior")
    back_r["-z"] = R("side")
    mm = wall((cx, 0.1 + (Hh - 0.1) / 2, -D / 2 + t / 2), (W, Hh - 0.1, t), back_r)
    vc_ground(mm, 0.25, 0.4, seed)
    m.add(mm)
    for sx in (-1, 1):
        sr = dict(front_r)
        sr["+x" if sx < 0 else "-x"] = R("interior")
        mm = wall((cx + sx * (W / 2 - t / 2), 0.1 + (Hh - 0.1) / 2, 0), (t, Hh - 0.1, D - 2 * t), sr)
        vc_ground(mm, 0.25, 0.4, seed)
        m.add(mm)
    rr = dict(front_r)
    rr["-y"] = R("interior")
    m.add(wall((cx, Hh - t / 2 + 0.0, 0), (W, t, D), rr))
    fr = dict(front_r)
    fr["+y"] = R("interior")
    m.add(wall((cx, 0.1 + t / 2, 0), (W, t, D - 2 * t), fr))
    # roof overhang with a rain lip, steel skids, corner posts
    ro = flat_box((W + 0.12, 0.04, D + 0.14), (cx, Hh + 0.02, 0.02))
    m.add(box_uv(ro, ro.v.min(axis=0), ro.v.max(axis=0), {"any": R("roof"), "+y": R("roof"), "-y": R("steel")}))
    for (c, s_) in [((cx, Hh + 0.055, D / 2 + 0.07), (W + 0.12, 0.03, 0.02)), ((cx, Hh + 0.055, -D / 2 - 0.03), (W + 0.12, 0.03, 0.02)), ((cx + W / 2 + 0.06, Hh + 0.055, 0.02), (0.02, 0.03, D + 0.14)), ((cx - W / 2 - 0.06, Hh + 0.055, 0.02), (0.02, 0.03, D + 0.14))]:
        mm = flat_box(s_, c)
        m.add(box_uv(mm, mm.v.min(axis=0), mm.v.max(axis=0), R("steel")))
    for z in (-D / 2 + 0.08, D / 2 - 0.08):
        sk = flat_box((W + 0.06, 0.1, 0.08), (cx, 0.05, z))
        m.add(vc_ground(box_uv(sk, sk.v.min(axis=0), sk.v.max(axis=0), R("steel")), 0.1, 0.5, seed))
    for sx in (-1, 1):
        for sz in (-1, 1):
            p = obox((cx + sx * (W / 2 + 0.005), 0.65, sz * (D / 2 + 0.005)), (0.05, 1.1, 0.05), bevel=0.006, seg=1)
            m.add(box_uv(p, p.v.min(axis=0), p.v.max(axis=0), R("steel")))
    # counter plank + hinged flap propped on two sticks
    ct = flat_box((1.14, 0.04, 0.26), (cx, 0.52, D / 2 + 0.1))
    m.add(box_uv(ct, ct.v.min(axis=0), ct.v.max(axis=0), R("wood")))
    ang = 26.0
    L = 0.5
    hinge = np.array([cx, hy1 + 0.02, D / 2 + 0.02])
    flap = flat_box((1.18, 0.025, L))
    flap = box_uv(flap, flap.v.min(axis=0), flap.v.max(axis=0), {"+y": R("flap"), "-y": R("steel"), "any": R("steel")})
    fcen = hinge + np.array([0, np.sin(np.radians(ang)) * L / 2, np.cos(np.radians(ang)) * L / 2])
    m.add(place(flap, fcen, (-ang, 0, 0)))
    tipf = hinge + np.array([0, np.sin(np.radians(ang)) * L, np.cos(np.radians(ang)) * L])
    for sx in (-0.48, 0.48):
        m.add(U(rod((cx + sx, 0.54, D / 2 + 0.24), (cx + sx, tipf[1] - 0.02, tipf[2] - 0.04), 0.012, 5), R("wood")))
    # goods on the counter: bottles, a card box, a basket
    for k in range(5):
        x = cx - 0.42 + k * 0.1
        b = lathe([(0.028, 0.0), (0.03, 0.12), (0.016, 0.17), (0.016, 0.22), (0.02, 0.22), (0.02, 0.235), (0.0, 0.235)], 6, closed_axis=True)
        b = cyl_uv(b, (0, 0, 0), R("bottle"), axis="y", v_range=(0, 0.235), mirror=True)
        m.add(place(b, (x, 0.54, D / 2 + 0.08 + 0.02 * (k % 2))))
    cb = flat_box((0.22, 0.1, 0.14), (cx + 0.33, 0.59, D / 2 + 0.12))
    m.add(box_uv(cb, cb.v.min(axis=0), cb.v.max(axis=0), R("flap")))
    # plastic chair beside the kiosk
    chx, chz = cx - W / 2 - 0.34, 0.25
    m.add(U(obox((chx, 0.42, chz), (0.36, 0.035, 0.36), bevel=0.01, seg=1), R("blue")))
    for dx in (-0.15, 0.15):
        for dz in (-0.15, 0.15):
            m.add(U(rod((chx + dx, 0.0, chz + dz), (chx + dx, 0.41, chz + dz), 0.014, 5), R("blue")))
    back = obox((0, 0, 0), (0.36, 0.3, 0.03), bevel=0.008, seg=1)
    m.add(U(place(back, (chx, 0.6, chz - 0.17), (-10, 0, 0)), R("blue")))
    # parasol: pole in a bucket of concrete, 12-sided striped canopy with a valance, underside spokes
    px, pz = 0.95, 0.3
    base = rod((px, 0.0, pz), (px, 0.15, pz), 0.17, 12, r2=0.15)
    m.add(vc_ground(U(base, R("buck")), 0.1, 0.4, seed))
    m.add(U(rod((px, 0.1, pz), (px, 1.62, pz), 0.021, 6), R("steel")))
    cr = 0.82
    prof = [(0.0, 1.66), (0.04, 1.655), (0.3, 1.58), (0.6, 1.46), (cr, 1.34), (cr + 0.02, 1.30), (cr, 1.27), (cr - 0.06, 1.285), (0.5, 1.37), (0.2, 1.48), (0.0, 1.5)]
    can = outward(lathe(prof, 12, closed_axis=True))
    can = cyl_uv(can, (0, 0, 0), R("canopy"), axis="y", v_range=(1.27, 1.66), u_repeat=6, mirror=True)
    can = place(can, (px, 0.0, pz), (3, 20, -3))
    vc_mul(can, (1, 1, 1), 0.98)
    m.add(can)
    for k in range(6):
        a = 2 * np.pi * k / 6
        sp = rod((px, 1.5, pz), (px + 0.7 * np.cos(a), 1.37, pz + 0.7 * np.sin(a)), 0.007, 4)
        m.add(place(U(sp, R("steel")), (0, 0, 0)))
    return m.export({"main": atlas.mat(normal_strength=0.6, nblur=0.4)})


# ============================================================================ street lamp


def lamp() -> dict:
    seed = 421
    atlas = Atlas(512, 512, 0x606060)
    pole = steel_sheet(128, 512, seed, tone=0x9fa3a6, rust=0.55, paint=0x5d6a64)
    # hazard band at the foot, a pasted poster mid-way, a stencilled pole number
    from tex_env import hazard_band

    b, cov = hazard_band(128, 70, stripe=18, angle=45, seed=seed + 1, wear=0.5)
    reg = Sheet(128, 512)
    reg.paste(b, 0, 512 - 70 - 8)
    cm = np.zeros((512, 128))
    cm[512 - 78 : 512 - 8] = cov
    pole.comp(reg.rgb, cm, height=0.1, rough=0.7)
    stick_poster(pole, 14, 300, 52, 66, seed + 2, rot=3, kind="concert", amount=0.4, shadow=0.3)
    stencil(pole, "LS 047", (64, 260), 20, 0xf1ead2, "black", a=0.75, squeeze=0.9, wear=0.6, seed=3, rot=90)
    atlas.add("pole", 0, 0, pole)
    atlas.add("steel", 130, 0, steel_sheet(128, 128, seed + 4, tone=0x8a8e92, rust=0.6, paint=0x6a7478))
    atlas.add("cable", 130, 130, steel_sheet(32, 32, seed + 5, tone=0x1a1a1c, rust=0.0, paint=0x161618))
    glow = Sheet(16, 16, 0xfff0c0, rough=0.3)
    atlas.add("glow", 130, 170, glow)
    m = EnvModel("env_lamp")
    R = lambda n: atlas.rect(n)  # noqa: E731
    # tapered pole (lathe, 8 sides)
    prof = [(0.07, 0.0), (0.066, 0.05), (0.052, 0.07), (0.05, 0.3), (0.046, 0.32), (0.04, 1.2), (0.034, 2.9), (0.03, 3.0), (0.0, 3.0)]
    pm = outward(lathe(prof, 8, closed_axis=True))
    pm = cyl_uv(pm, (0, 0, 0), R("pole"), axis="y", v_range=(0, 3.0), mirror=True)
    vc_ground(pm, 0.3, 0.4, seed)
    m.add(pm)
    # base plate + bolts
    plate = obox((0, 0.012, 0), (0.24, 0.024, 0.24), bevel=0.004, seg=1)
    m.add(box_uv(plate, plate.v.min(axis=0), plate.v.max(axis=0), R("steel")))
    for sx in (-1, 1):
        for sz in (-1, 1):
            bo = rod((sx * 0.1, 0.024, sz * 0.1), (sx * 0.1, 0.05, sz * 0.1), 0.014, 5)
            m.add(U(bo, R("steel")))
    # curved arm towards +z and the cobra-head luminaire
    arm_path = [(0, 2.80, 0.0), (0, 2.98, 0.05), (0, 3.10, 0.2), (0, 3.15, 0.42), (0, 3.15, 0.6)]
    arm = polytube(arm_path, 0.022, 6, caps=True)
    m.add(box_uv(arm, arm.v.min(axis=0), arm.v.max(axis=0), R("steel")))
    path = np.array([(0, 3.15, 0.40), (0, 3.15, 0.66), (0, 3.15, 0.98)])
    head = tube(path, [0.030, 0.056, 0.026], [0.05, 0.088, 0.036], sides=10, rings=9, exponent=2.6)
    head = noisy(head, 0.0, 4, 0)
    m.add(box_uv(head, head.v.min(axis=0), head.v.max(axis=0), R("steel")))
    lens = flat_box((0.14, 0.012, 0.38), (0, 3.092, 0.68))
    # separate emissive material for the lens
    m.add(flat_uv(lens, R("glow")), material="lamp")
    # tangled cables: four strands drooping off the top, plus a wrapped bundle round the pole
    rng = np.random.default_rng(seed)
    for k in range(4):
        sgn = -1 if k % 2 == 0 else 1
        p0 = (0.03 * sgn, 2.78 - 0.05 * k, 0.02 * (k - 2))
        p1 = (sgn * rng.uniform(1.1, 1.5), 2.35 - rng.uniform(0, 0.3), rng.uniform(-0.5, 0.5))
        c = polytube(sag_path(p0, p1, 0.18 + 0.06 * k, 9, sway=(0, 0, rng.uniform(-0.1, 0.1))), 0.0075, 4, caps=False)
        m.add(flat_uv(c, R("cable")))
    for turn in range(2):
        pts = []
        for i in range(17):
            a = i / 16 * 2 * np.pi * 2.0 + turn * 1.5
            y = 2.05 + turn * 0.04 + i * 0.03 + 0.0
            r = 0.056 + 0.007 * turn
            pts.append((r * np.cos(a), y, r * np.sin(a)))
        c = polytube(pts, 0.0085, 4, caps=False)
        m.add(flat_uv(c, R("cable")))
    # a loose strand dangling off the arm
    dang = [(0.02, 2.80, 0.03), (0.06, 2.55, 0.10), (0.04, 2.30, 0.16), (-0.02, 2.12, 0.10)]
    m.add(flat_uv(polytube(dang, 0.0075, 4, caps=False), R("cable")))
    am = atlas.mat(normal_strength=0.6, nblur=0.4)
    lm = Mat(albedo=np.full((4, 4, 3), 1.0), height=None, rough=0.4, metal=0.0, emissive=(1.0, 0.82, 0.5), emissive_strength=2.5)
    return m.export({"main": am, "lamp": lm})


# ============================================================================ utility pole


def pole() -> dict:
    seed = 431
    atlas = Atlas(512, 512, 0x606060)
    wood = wood_sheet(512, 128, seed, 0x7a5a3a, "x", wear=0.9, knots=3, gap=1)
    wood = Sheet._rot90(wood)  # grain vertical: 128 wide (around) x 512 tall
    cracks(wood, seed + 1, n=3, length=0.9, width=1.4, start_edge="top", color=0x2a1c10)
    stencil(wood, "KB 231", (64, 330), 22, 0xf1ead2, "black", a=0.85, squeeze=0.9, wear=0.6, seed=2, rot=90)
    with wood.paint(height=0.3, rough=0.5, metal=0.8) as d:  # metal band + staples
        d.rect((0, 120, 128, 132), 0x6a6e72)
        for k in range(10):
            d.rect((50 + (k % 3) * 8, 160 + k * 22, 56 + (k % 3) * 8, 166 + k * 22), 0x8a8e92)
    atlas.add("pole", 0, 0, wood)
    atlas.add("arm", 130, 0, wood_sheet(256, 64, seed + 3, 0x6e5030, "x", wear=0.9, knots=1, gap=1))
    atlas.add("steel", 130, 70, steel_sheet(128, 128, seed + 4, tone=0x8a8e92, rust=0.5))
    atlas.add("ins", 260, 70, plastic_sheet(32, 32, seed + 5, 0x8a5a3c, rough=0.25, grime=0.3))
    can = steel_sheet(128, 96, seed + 6, tone=0x6a7078, rust=0.5, paint=0x5a6670)
    with can.paint(height=0.1) as d:
        d.rect((0, 40, 128, 54), 0xf2b705)
    stencil(can, "11kV", (64, 30), 16, 0xf1ead2, "black", a=0.8, squeeze=0.9, wear=0.5, seed=6)
    atlas.add("can", 130, 200, can)
    atlas.add("cable", 260, 110, steel_sheet(32, 32, seed + 7, tone=0x1a1a1c, rust=0.0, paint=0x161618))
    m = EnvModel("env_poles")
    R = lambda n: atlas.rect(n)  # noqa: E731
    prof = [(0.08, 0.0), (0.075, 0.4), (0.063, 2.0), (0.052, 3.6), (0.0, 3.6)]
    pm = outward(lathe(prof, 8, closed_axis=True))
    pm = cyl_uv(pm, (0, 0, 0), R("pole"), axis="y", v_range=(0, 3.6), mirror=True)
    pm = place(pm, (0, 0, 0), (0.8, 0, -0.6))
    vc_ground(pm, 0.3, 0.5, seed)
    m.add(pm)

    def arm(y, length, w=0.075, h=0.09, tile="arm"):
        b = obox((0, y, 0), (w, h, length))
        return box_uv(b, b.v.min(axis=0), b.v.max(axis=0), R(tile))

    m.add(arm(3.38, 1.15))
    m.add(arm(2.98, 0.82))
    for sz in (-1, 1):
        for y0, y1, zz in ((3.1, 3.36, 0.38), (2.8, 2.97, 0.28)):
            br = beam((0, y0, 0.0), (0, y1, sz * zz), 0.04, 0.04, up=(1, 0, 0))
            m.add(box_uv(br, br.v.min(axis=0), br.v.max(axis=0), R("arm")))
    # pin insulators on both arms
    for y, zs in ((3.38, (-0.48, 0.0, 0.48)), (2.98, (-0.34, 0.34))):
        for z in zs:
            pin = rod((0, y + 0.045, z), (0, y + 0.1, z), 0.01, 5)
            m.add(U(pin, R("steel")))
            for k, (r0, y0) in enumerate(((0.032, 0.095), (0.026, 0.135))):
                bell = rod((0, y + y0, z), (0, y + y0 + 0.04, z), r0, 8, r2=r0 * 0.7)
                m.add(U(bell, R("ins")))
    # transformer can on a bracket
    tc = rod((0.2, 2.5, 0.0), (0.2, 2.86, 0.0), 0.13, 12)
    m.add(cyl_uv(tc, (0.2, 0, 0), R("can"), axis="y", v_range=(2.5, 2.86), mirror=True))
    lid = rod((0.2, 2.86, 0.0), (0.2, 2.9, 0.0), 0.1, 12, r2=0.06)
    m.add(U(lid, R("steel")))
    m.add(U(beam((0.075, 2.7, 0.0), (0.2, 2.7, 0.0), 0.04, 0.03), R("steel")))
    # sagging wires running along +-x from every insulator, ends hanging towards the next pole
    rng = np.random.default_rng(seed)
    wires = [(3.5, z) for z in (-0.48, 0.0, 0.48)] + [(3.1, -0.34), (3.1, 0.34)]
    for (y, z) in wires:
        for sx in (-1, 1):
            end = (sx * 1.55, y - 0.28 - rng.uniform(0, 0.06), z + rng.uniform(-0.05, 0.05))
            c = polytube(sag_path((0, y, z), end, 0.10, 9), 0.008, 4, caps=False)
            m.add(U(c, R("cable")))
    # a drop-wire down the pole and a coil of slack cable
    drop = [(0.03, 3.1, 0.04), (0.08, 2.7, 0.1), (0.1, 2.2, 0.1), (0.08, 1.6, 0.07), (0.075, 1.1, 0.0)]
    m.add(U(polytube(drop, 0.0085, 4, caps=False), R("cable")))
    return m.export({"main": atlas.mat(normal_strength=0.6, nblur=0.4)})


# ============================================================================ tyre stack, barrels, shop signs


def tyrestack() -> dict:
    from env_soft import TW, _tyre_atlas, rim_mesh, tyre_mesh

    seed = 441
    atlas = _tyre_atlas(seed)
    m = EnvModel("env_tyrestack")
    sides = 14
    y = TW + 0.002
    rng = np.random.default_rng(seed)
    for i in range(4):
        parts = tyre_mesh(atlas, sides, seed + i, level="full" if i == 3 else "low", tilt=(rng.uniform(-1.5, 1.5), 0, rng.uniform(-1.5, 1.5)), pos=(rng.uniform(-0.02, 0.02), y + i * (2 * TW - 0.012), rng.uniform(-0.02, 0.02)), yaw=rng.uniform(0, 180))
        for p in parts:
            vc_ground(p, 0.1, 0.4, seed + i)
            m.add(p)
    for p in rim_mesh(atlas, pos=(0, y + 3 * (2 * TW - 0.012) + 0.045, 0), yaw=30):
        m.add(p)
    # one tyre leaning against the stack
    parts = tyre_mesh(atlas, 18, seed + 9, level="full", tilt=(0, 0, 0), pos=(0, 0, 0), yaw=0)
    for p in parts:
        q = place(p, (0.0, 0.0, 0.0), (-72, 0, 0))
        q.v = q.v + np.array([0.03, 0.34, 0.50])
        vc_ground(q, 0.1, 0.35, seed)
        m.add(q)
    return m.export({"main": atlas.mat(normal_strength=0.9)})


def barrel() -> dict:
    seed = 451
    atlas = Atlas(512, 512, 0x606060)

    def drum(w, h, seed, tone, band, text):
        s = steel_sheet(w, h, seed, tone=0x9a9ea2, rust=0.6, paint=tone)
        with s.paint(height=0.08, rough=0.5) as d:
            d.rect((0, h * 0.40, w, h * 0.62), band)
        stencil(s, text, (w / 2, h * 0.51), 30, 0x16161a if band != 0x16161a else 0xf1ead2, "black", a=0.85, squeeze=0.9, wear=0.5, seed=seed)
        # rolling hoops are geometry; paint the bumps' dirt lines too
        for yy in (0.1, 0.33, 0.67, 0.9):
            with s.paint(height=-0.2) as d:
                d.line([(0, h * yy), (w, h * yy)], 0x2a221a, 1.8, a=0.5)
        speckle(s, seed + 3, amount=0.4, density=0.004)
        return s

    atlas.add("blue", 0, 0, drum(256, 256, seed, 0x1f5fb4, 0xf2b705, "NAIJA OIL"))
    atlas.add("red", 256, 0, drum(256, 256, seed + 1, 0xb3172b, 0xf6f1e0, "200L"))
    atlas.add("lid", 0, 262, steel_sheet(128, 128, seed + 2, tone=0x8a8e92, rust=0.6, paint=0x5a6068))
    m = EnvModel("env_barrel")
    R = lambda n: atlas.rect(n)  # noqa: E731
    r0, hh = 0.215, 0.58
    prof = [(0.0, 0.0), (0.2, 0.0), (r0, 0.015), (r0, 0.085), (0.228, 0.1), (r0, 0.115), (r0, 0.24), (0.228, 0.26), (r0, 0.28), (r0, 0.30), (0.228, 0.32), (r0, 0.34), (r0, 0.465), (0.228, 0.48), (r0, 0.495), (r0, hh - 0.015), (0.2, hh), (0.0, hh)]

    def make(tile):
        b = outward(lathe(prof, 14, closed_axis=True))
        return cyl_uv(b, (0, 0, 0), R(tile), axis="y", v_range=(0, hh), mirror=True, cap_rect=R("lid"))

    b1 = make("blue")
    vc_ground(b1, 0.12, 0.4, seed)
    m.add(place(b1, (-0.25, 0, -0.18), (0, 20, 0)))
    for dx in (-0.09, 0.09):  # bungs on the lid
        bung = rod((-0.25 + dx, hh, -0.18 + dx * 0.3), (-0.25 + dx, hh + 0.014, -0.18 + dx * 0.3), 0.026, 8)
        m.add(U(bung, R("lid")))
    b2 = make("red")
    b2 = place(b2, (0, 0, 0), (0, 0, 90))  # lying on its side
    b2 = place(b2, (0.22, 0.0, 0.3), (0, 12, 0))
    b2.v[:, 1] += r0 + 0.015 - b2.v[:, 1].min() + 0.0
    vc_ground(b2, 0.1, 0.3, seed)
    m.add(b2)
    return m.export({"main": atlas.mat(normal_strength=0.7, nblur=0.3)})


def shopsign() -> dict:
    seed = 461
    atlas = Atlas(512, 512, 0x606060)
    names = [("CHOP HERE", 0xd62839, 0xfff6e0), ("OPEN", 0x0b6b3c, 0xffd23c), ("RECHARGE", 0xffc300, 0x1d3a6b), ("POS HERE", 0x1d3a6b, 0xffffff)]
    for i, (text, bg, fg) in enumerate(names):
        sh = Sheet(192, 96, bg, rough=0.55)
        n = noise2(192, 96, seed + i, fx=5, fy=3)
        sh.rgb = sh.rgb * (0.85 + 0.25 * n[..., None])
        with sh.paint(height=0.1, rough=0.5) as d:
            d.rect((0, 0, 192, 6), fg)
            d.rect((0, 90, 192, 96), fg)
            d.rect((0, 0, 6, 96), fg)
            d.rect((186, 0, 192, 96), fg)
            px = fit_px(text, 160, 56, "black", 0.9, 0.03)
            d.text((98, 50), text, px, 0x15151a, "black", "cm", squeeze=0.9, spacing=0.03, a=0.4, wobble=0.012, seed=i)
            d.text((96, 48), text, px, fg, "black", "cm", squeeze=0.9, spacing=0.03, wobble=0.012, seed=i)
        sh.comp(0x3a3128, np.clip(noise2(192, 96, seed + 9 + i, fx=5, fy=3) * 1.6 - 0.8, 0, 1) * 0.45)
        speckle(sh, seed + 20 + i, amount=0.5, dark=0x2a1c12, light=0xe8dcc0, density=0.01)
        atlas.add(f"b{i}", (i % 2) * 196, (i // 2) * 100, sh)
    atlas.add("steel", 0, 210, steel_sheet(128, 128, seed + 7, tone=0x8a8e92, rust=0.6, paint=0x35393d))
    atlas.add("chain", 140, 210, steel_sheet(32, 32, seed + 8, tone=0x6a6e72, rust=0.7))
    m = EnvModel("env_shopsign")
    R = lambda n: atlas.rect(n)  # noqa: E731
    S = lambda mesh: vc_ground(box_uv(mesh, mesh.v.min(axis=0), mesh.v.max(axis=0), R("steel")), 0.2, 0.4, seed)  # noqa: E731
    pole_m = rod((0, 0, 0), (0, 1.75, 0), 0.03, 8, r2=0.025)
    m.add(S(pole_m))
    m.add(S(obox((0, 0.02, 0), (0.22, 0.04, 0.22), bevel=0.005, seg=1)))
    m.add(S(obox((0.35, 1.7, 0), (0.7, 0.035, 0.035))))  # arm along +x
    m.add(S(beam((0, 1.45, 0), (0.33, 1.69, 0), 0.025, 0.025)))  # brace
    for k, (x, y, (f, b)) in enumerate(((0.2, 1.38, (0, 1)), (0.56, 1.25, (2, 3)))):
        board = obox((0, 0, 0), (0.30, 0.16, 0.025), bevel=0.004, seg=1)
        board = box_uv(board, board.v.min(axis=0), board.v.max(axis=0), {"+z": R(f"b{f}"), "-z": R(f"b{b}"), "any": R("steel")})
        ang = (-4, 5)[k]
        m.add(place(board, (x, y, 0), (0, 0, ang)))
        for dx in (-0.12, 0.12):
            ch = rod((x + dx, y + 0.07 + 0.0, 0), (x + dx * 0.9, 1.70, 0), 0.004, 4)
            m.add(U(ch, R("chain")))
    return m.export({"main": atlas.mat(normal_strength=0.5, nblur=0.3)})


DRESSING = {
    "env_kiosk": kiosk,
    "env_lamp": lamp,
    "env_poles": pole,
    "env_tyrestack": tyrestack,
    "env_barrel": barrel,
    "env_shopsign": shopsign,
}
