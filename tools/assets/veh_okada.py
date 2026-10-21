"""Okada: Lagos commuter motorcycle (red tank and fenders, black seat, rear rack). Mount only, no rider."""
from __future__ import annotations

import numpy as np

import vehicles_lib as V
from vehicles_lib import Model, place
from veh_common import std_specs

YELLOW = 0xd3262c  # Bajaj-red tank and fenders: contrasts with the yellow danfos and the pale floor
R = 0.155
FZ, RZ = 0.32, -0.30
HEAD = (0.0, 0.50, 0.215)  # steering head pivot


def make_atlas() -> V.Atlas:
    at = V.Atlas(256, seed=41)

    def plate(img, d, rng):
        d.rectangle([0, 0, 63, 27], fill=(0xf2, 0xf2, 0xea), outline=(0x20, 0x20, 0x20), width=2)
        d.rectangle([2, 2, 61, 8], fill=(0x1b, 0x7a, 0x3a))
        V.hand_text(d, rng, "LAGOS", (2, 2, 62, 9), (0xff, 0xff, 0xff), 7, jitter=0.0, tracking=2)
        V.hand_text(d, rng, "ABC 05 JK", (2, 9, 62, 26), (0x10, 0x10, 0x14), 11, path=V.FONT_MONO, jitter=0.0)

    def tail(img, d, rng):
        d.rectangle([0, 0, 31, 15], fill=(0x8a, 0x10, 0x14))
        d.rectangle([2, 2, 29, 13], fill=(0xd8, 0x1f, 0x26))
        d.rectangle([4, 4, 12, 6], fill=(0xff, 0x6a, 0x66))

    def label(img, d, rng):
        d.rectangle([0, 0, 127, 31], fill=(0x07, 0x07, 0x08))
        d.rectangle([0, 2, 127, 3], fill=(0xf2, 0xb7, 0x05))
        d.rectangle([0, 28, 127, 29], fill=(0xf2, 0xb7, 0x05))
        V.hand_text(d, rng, "OKADA", (4, 4, 124, 28), (0xf6, 0xc4, 0x1c), 22, jitter=1.0, tracking=2)

    at.cell("plate", 64, 28, plate)
    at.cell("tail", 32, 16, tail)
    at.cell("label", 128, 32, label)
    at.build()
    return at


def arc_fender(cy, cz, r, width, a0, a1, sides=14, thick=0.010):
    ang = np.radians(np.linspace(a0, a1, sides))
    prof = [(-width / 2, 0.0), (-width / 2 * 0.9, thick), (0.0, thick * 1.3), (width / 2 * 0.9, thick), (width / 2, 0.0)]
    Vv = []
    for a in ang:
        for x, t in prof:
            rr = r + t
            Vv.append((x, cy + rr * np.sin(a), cz + rr * np.cos(a)))
    mm = V.Mesh(np.array(Vv), V.grid_faces(len(ang), len(prof)))
    return V.orient_faces(mm, lambda c: np.stack([np.zeros(len(c)), np.full(len(c), cy), np.full(len(c), cz)], axis=1))


def build():
    m = Model("veh_okada")
    at = make_atlas()
    V.register_generator("decals_okada", at.tex)
    paint_c, trim, chrome, steel, decals, lamps = [], [], [], [], [], []
    steer_trim, steer_chrome, steer_paint, steer_lamps, steer_decals = [], [], [], [], []

    def col(mesh, c, dirt=0.0, seed=0):
        V.paint(mesh, c)
        if dirt:
            V.finish(mesh, dirt=dirt, seed=seed)
        return mesh

    # ---- tank, seat, side panels
    tank = V.loft_z(
        [(0.17, 0.0, 0.47, 0.030, 0.040, 0.040), (0.12, 0.0, 0.475, 0.062, 0.050, 0.055), (0.03, 0.0, 0.47, 0.074, 0.052, 0.062), (-0.05, 0.0, 0.45, 0.062, 0.045, 0.055)],
        sides=16, e=2.6, round_ends=2)
    col(tank, YELLOW, 0.25, 1)
    # darker lower edge of the tank
    tank.c[:, :3] *= (0.75 + 0.25 * np.clip((tank.v[:, 1] - 0.41) / 0.08, 0, 1))[:, None]
    paint_c.append(tank)
    cap = V.cylinder((0.0, 0.527, 0.065), 0.020, 0.012, sides=10)
    col(cap, 0xb9bbc0)
    chrome.append(cap)
    for sx in (-1, 1):
        u0, v0, u1, v1 = at.rect("label")
        lab = V.quad((sx * 0.0795, 0.472, 0.04), (0, 0, -sx), (0, 1, 0), 0.105, 0.026, (u0, v0, u1, v1))
        decals.append(lab)
    seat = V.loft_z(
        [(-0.03, 0.0, 0.378, 0.052, 0.022, 0.024), (-0.10, 0.0, 0.378, 0.068, 0.024, 0.028), (-0.24, 0.0, 0.376, 0.078, 0.026, 0.030), (-0.35, 0.0, 0.378, 0.066, 0.022, 0.028)],
        sides=14, e=2.8, round_ends=2)
    col(seat, 0x161517, 0.3, 2)
    trim.append(seat)
    for sx in (-1, 1):
        sp = V.bevel_box((sx * 0.066, 0.30, -0.17), (0.014, 0.105, 0.16), bevel=0.006)
        col(sp, 0x141416)
        trim.append(sp)

    # ---- engine, frame, exhaust
    crank = V.bevel_box((0, 0.215, -0.02), (0.115, 0.13, 0.19), bevel=0.02, seg=2)
    col(crank, 0x6f7176, 0.25, 3)
    steel.append(crank)
    cyl = place(V.bevel_box((0, 0, 0), (0.072, 0.115, 0.095), bevel=0.01), (0, 0.325, 0.075), (-22, 0, 0))
    col(cyl, 0x4a4b4f, 0.2, 4)
    steel.append(cyl)
    for k in range(4):
        fin = place(V.bevel_box((0, 0, 0), (0.095, 0.0065, 0.10), bevel=0.002), (0, 0.285 + 0.022 * k, 0.062 + 0.005 * k), (-22, 0, 0))
        col(fin, 0x2d2e31)
        steel.append(fin)
    cov = V.bevel_box((0.062, 0.225, -0.02), (0.024, 0.09, 0.12), bevel=0.01)
    col(cov, 0x909298)
    steel.append(cov)
    ex = V.tube_poly([(0.0, 0.30, 0.125), (0.040, 0.235, 0.14), (0.062, 0.165, 0.09), (0.066, 0.150, -0.12)], 0.0155, 8, caps=False)
    col(ex, 0xb4b6bb)
    chrome.append(ex)
    mf = V.cylinder((0.068, 0.150, -0.285), 0.027, 0.27, sides=12, axis="z", bevel=0.008)
    col(mf, 0xaeb0b5)
    chrome.append(mf)
    mf_tip = V.cylinder((0.068, 0.15, -0.425), 0.020, 0.012, sides=10, axis="z")
    col(mf_tip, 0x1b1b1d)
    trim.append(mf_tip)
    for pts in ([(0, 0.50, 0.20), (0, 0.33, 0.13), (0, 0.18, 0.07)], [(0, 0.50, 0.19), (0, 0.43, 0.0), (0, 0.35, -0.20), (0, 0.33, -0.30)]):
        t = V.tube_poly(pts, 0.011, 6, caps=False)
        col(t, 0x131315)
        trim.append(t)
    for sx in (-1, 1):
        sw = V.strut((sx * 0.04, 0.175, -0.10), (sx * 0.034, R, RZ), 0.0095, 6)
        col(sw, 0x131315)
        trim.append(sw)
        shock_top, shock_bot = (sx * 0.05, 0.385, -0.33), (sx * 0.042, 0.200, -0.255)
        sh = V.strut(shock_top, shock_bot, 0.0075, 6)
        col(sh, 0xb9bbc0)
        chrome.append(sh)
        spring = V.strut(np.array(shock_top) * 0.4 + np.array(shock_bot) * 0.6, np.array(shock_top) * 0.9 + np.array(shock_bot) * 0.1, 0.0125, 8)
        col(spring, 0x2b2b2e)
        trim.append(spring)
        peg = V.cylinder((sx * 0.105, 0.155, -0.04), 0.008, 0.06, sides=6, axis="x")
        col(peg, 0x1a1a1c)
        trim.append(peg)
        peg2 = V.cylinder((sx * 0.09, 0.19, -0.285), 0.007, 0.05, sides=6, axis="x")
        col(peg2, 0x1a1a1c)
        trim.append(peg2)
    guard = V.bevel_box((0.052, 0.17, -0.20), (0.010, 0.028, 0.20), bevel=0.004)
    col(guard, 0x1a1a1c)
    trim.append(guard)
    ks = V.strut((-0.045, 0.17, -0.09), (-0.07, 0.04, -0.04), 0.006, 5)
    col(ks, 0x1a1a1c)
    trim.append(ks)

    # ---- rear: fender, rack, lights, plate
    rf = arc_fender(R, RZ, R + 0.016, 0.062, 62, 150)
    col(rf, YELLOW, 0.3, 5)
    paint_c.append(rf)
    plate = V.bevel_box((0, 0.395, -0.435), (0.15, 0.012, 0.15), bevel=0.004)
    col(plate, 0x1b1b1d)
    trim.append(plate)
    for sx in (-1, 1):
        r1 = V.tube_poly([(sx * 0.075, 0.40, -0.33), (sx * 0.075, 0.404, -0.46), (sx * 0.03, 0.404, -0.485)], 0.006, 5)
        col(r1, 0x131315)
        trim.append(r1)
    r2 = V.strut((-0.03, 0.404, -0.485), (0.03, 0.404, -0.485), 0.006, 5)
    col(r2, 0x131315)
    trim.append(r2)
    # tail light and plate on a bracket at the end of the fender
    bk = V.bevel_box((0, 0.30, -0.472), (0.075, 0.075, 0.012), bevel=0.004)
    col(bk, 0x151517)
    trim.append(bk)
    u0, v0, u1, v1 = at.rect("plate")
    decals.append(V.quad((0, 0.287, -0.4795), (-1, 0, 0), (0, 1, 0), 0.066, 0.029, (u0, v0, u1, v1)))
    u0, v0, u1, v1 = at.rect("tail")
    decals.append(V.quad((0, 0.331, -0.4795), (-1, 0, 0), (0, 1, 0), 0.040, 0.020, (u0, v0, u1, v1)))

    # ---- front end (steering node): fork, fender, head lamp, handlebar, mirrors, gauge
    for sx in (-1, 1):
        up = V.strut((sx * 0.032, 0.515, 0.21), (sx * 0.032, 0.335, 0.262), 0.0125, 8)
        col(up, 0xb9bbc0)
        steer_chrome.append(up)
        boot = V.strut((sx * 0.032, 0.400, 0.24), (sx * 0.032, 0.340, 0.258), 0.0155, 8)
        col(boot, 0x151517)
        steer_trim.append(boot)
        lo = V.strut((sx * 0.032, 0.35, 0.256), (sx * 0.032, R, FZ), 0.0105, 8)
        col(lo, 0xa8aaaf)
        steer_chrome.append(lo)
        ax_ = V.cylinder((sx * 0.032, R, FZ), 0.013, 0.018, sides=8, axis="x")
        col(ax_, 0xb9bbc0)
        steer_chrome.append(ax_)
    bridge = V.bevel_box((0, 0.505, 0.212), (0.085, 0.020, 0.034), bevel=0.008)
    col(bridge, 0x15151a)
    steer_trim.append(bridge)
    ff = arc_fender(R, FZ, R + 0.018, 0.058, 20, 112)
    col(ff, YELLOW, 0.3, 6)
    steer_paint.append(ff)
    for sx in (-1, 1):
        st = V.strut((sx * 0.032, 0.34, 0.255), (sx * 0.032, 0.30, 0.34), 0.005, 4)
        col(st, 0x151517)
        steer_trim.append(st)
    stem = V.strut((0, 0.50, 0.21), (0, 0.57, 0.195), 0.012, 6)
    col(stem, 0x15151a)
    steer_trim.append(stem)
    hb = V.tube_poly([(-0.14, 0.60, 0.145), (-0.10, 0.618, 0.175), (-0.04, 0.623, 0.196), (0.04, 0.623, 0.196), (0.10, 0.618, 0.175), (0.14, 0.60, 0.145)], 0.0072, 6, caps=False)
    col(hb, 0xb9bbc0)
    steer_chrome.append(hb)
    for sx in (-1, 1):
        gr = V.cylinder((sx * 0.128, 0.604, 0.150), 0.0125, 0.055, sides=8, axis="x")
        col(gr, 0x131315)
        steer_trim.append(gr)
        lever = V.strut((sx * 0.105, 0.612, 0.172), (sx * 0.085, 0.600, 0.215), 0.004, 4)
        col(lever, 0x1a1a1c)
        steer_trim.append(lever)
        arm = V.tube_poly([(sx * 0.12, 0.616, 0.168), (sx * 0.135, 0.65, 0.145)], 0.0035, 4)
        col(arm, 0x1a1a1c)
        steer_trim.append(arm)
        mr = V.cylinder((sx * 0.135, 0.660, 0.139), 0.020, 0.008, sides=10, axis="z")
        col(mr, 0x141416)
        steer_trim.append(mr)
        mf2 = V.cylinder((sx * 0.135, 0.660, 0.1335), 0.016, 0.004, sides=10, axis="z")
        col(mf2, 0xc7ced2)
        steer_chrome.append(mf2)
    lamp_b = V.cylinder((0, 0.545, 0.275), 0.050, 0.05, sides=16, axis="z", bevel=0.01)
    col(lamp_b, 0x16161a)
    steer_trim.append(lamp_b)
    ring = V.cylinder((0, 0.545, 0.300), 0.048, 0.016, sides=16, axis="z", bevel=0.004)
    col(ring, 0xbfc1c6)
    steer_chrome.append(ring)
    lens = V.lathe([(0.0, 0.0), (0.038, 0.0), (0.040, 0.005), (0.032, 0.016), (0.0, 0.022)], 16)
    lens = place(lens, (0, 0.545, 0.304), (90, 0, 0))
    col(lens, 0xfff2cf)
    steer_lamps.append(lens)
    pod = V.bevel_box((0, 0.605, 0.185), (0.075, 0.032, 0.04), bevel=0.012)
    col(pod, 0x131316)
    steer_trim.append(pod)

    # ---- wheels
    tyre, rimsp, hub = V.spoked_wheel(R, 0.052, R - 0.036, hub_r=0.026, spokes=12, sides=20)
    for name, z in (("wheel_F", FZ), ("wheel_R", RZ)):
        for mesh, mat, c in ((tyre, "tyre", 0x2b2b2e), (rimsp, "chrome", 0xc0c3c8), (hub, "chrome", 0xb0b3b8)):
            p = mesh.copy()
            if mat == "tyre":
                p.c[:, :3] = V.lin(c) * (0.9 + 0.2 * V.value_noise(p.v * 5.0, 1.0, 3)[:, None])
            else:
                V.paint(p, c)
            m.add(place(p, (0, R, z)), mat, node=name, pivot=(0, R, z))
    drum = V.cylinder((0.038, R, RZ), 0.050, 0.020, sides=14, axis="x", bevel=0.004)
    col(drum, 0x808287)
    steel.append(drum)

    m.add(paint_c, "paint")
    m.add(trim, "trim")
    m.add(chrome, "chrome")
    m.add(steel, "steel")
    m.add(decals, "decal")
    m.add(steer_paint, "paint", node="steering", pivot=HEAD)
    m.add(steer_trim, "trim", node="steering", pivot=HEAD)
    m.add(steer_chrome, "chrome", node="steering", pivot=HEAD)
    m.add(steer_lamps, "lamp", node="steering", pivot=HEAD)
    V.scale_model(m, 0.95)
    return m, std_specs(decal_tex="decals_okada", paint_tone=0xf0f0f0)
