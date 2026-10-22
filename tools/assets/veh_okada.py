"""Okada: Lagos commuter motorcycle (crimson-red Bajaj Boxer tank and fenders, gold/black stripe, dual gauges, amber blinkers, ribbed seat, rear cargo rack, chrome exhaust). Mount only, no rider."""
from __future__ import annotations

import numpy as np

import vehicles_lib as V
from vehicles_lib import Model, place
from veh_common import std_specs

RED = 0xd91e26  # Bajaj-red tank and fenders: contrasts with the yellow danfos and the pale floor
R = 0.160
FZ, RZ = 0.33, -0.31
HEAD = (0.0, 0.50, 0.215)  # steering head pivot


def make_atlas() -> V.Atlas:
    at = V.Atlas(256, seed=41)

    def plate(img, d, rng):
        d.rectangle([0, 0, 63, 27], fill=(0xf2, 0xf2, 0xea), outline=(0x20, 0x20, 0x20), width=2)
        d.rectangle([2, 2, 61, 8], fill=(0x1b, 0x7a, 0x3a))
        V.hand_text(d, rng, "LAGOS", (2, 2, 62, 9), (0xff, 0xff, 0xff), 7, jitter=0.0, tracking=2)
        V.hand_text(d, rng, "OKD 419", (2, 9, 62, 26), (0x10, 0x42, 0x9c), 11, path=V.FONT_MONO, jitter=0.0)

    def tail(img, d, rng):
        d.rectangle([0, 0, 31, 15], fill=(0x8a, 0x10, 0x14))
        d.rectangle([2, 2, 29, 13], fill=(0xe8, 0x1f, 0x26))
        d.rectangle([4, 4, 27, 8], fill=(0xff, 0x7a, 0x66))

    def label(img, d, rng):
        d.rectangle([0, 0, 127, 31], fill=(0xc8, 0x18, 0x20))
        d.polygon([(0, 4), (118, 4), (126, 15), (4, 15)], fill=(0x14, 0x15, 0x18))
        d.polygon([(6, 15), (124, 15), (116, 27), (0, 27)], fill=(0xf6, 0xc4, 0x1c))
        V.hand_text(d, rng, "OKADA", (10, 3, 118, 25), (0xff, 0xf8, 0xe6), 19, jitter=0.3, tracking=2)

    at.cell("plate", 64, 28, plate)
    at.cell("tail", 32, 16, tail)
    at.cell("label", 128, 32, label)
    at.build()
    return at


def arc_fender(cy, cz, r, width, a0, a1, sides=14, thick=0.012):
    ang = np.radians(np.linspace(a0, a1, sides))
    prof = [(-width / 2, 0.0), (-width / 2 * 0.9, thick), (0.0, thick * 1.35), (width / 2 * 0.9, thick), (width / 2, 0.0)]
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

    # ---- tank, knee pads, ribbed seat, side panels
    tank = V.loft_z(
        [(0.18, 0.0, 0.475, 0.036, 0.044, 0.042), (0.12, 0.0, 0.485, 0.072, 0.056, 0.058), (0.02, 0.0, 0.48, 0.082, 0.058, 0.064), (-0.06, 0.0, 0.455, 0.066, 0.046, 0.056)],
        sides=16, e=2.6, round_ends=2)
    col(tank, RED, 0.16, 1)
    tank.c[:, :3] *= (0.78 + 0.22 * np.clip((tank.v[:, 1] - 0.41) / 0.08, 0, 1))[:, None]
    paint_c.append(tank)
    cap = V.cylinder((0.0, 0.538, 0.070), 0.022, 0.014, sides=12)
    col(cap, 0xd4d8de)
    chrome.append(cap)
    for sx in (-1, 1):
        u0, v0, u1, v1 = at.rect("label")
        lab = V.quad((sx * 0.086, 0.480, 0.05), (0, 0, -sx), (0, 1, 0), 0.115, 0.030, (u0, v0, u1, v1))
        decals.append(lab)
        # black rubber knee pad on tank rear flank
        pad = V.bevel_box((sx * 0.076, 0.455, -0.02), (0.012, 0.042, 0.065), bevel=0.004)
        col(pad, 0x16171a)
        trim.append(pad)

    seat = V.loft_z(
        [(-0.03, 0.0, 0.385, 0.058, 0.025, 0.026), (-0.10, 0.0, 0.386, 0.074, 0.028, 0.030), (-0.24, 0.0, 0.388, 0.082, 0.030, 0.032), (-0.36, 0.0, 0.390, 0.070, 0.025, 0.028)],
        sides=14, e=2.8, round_ends=2)
    col(seat, 0x18181b, 0.2, 2)
    trim.append(seat)
    # Seat ribbing straps
    for rz in (-0.12, -0.20, -0.28):
        rib = V.bevel_box((0.0, 0.414, rz), (0.148, 0.008, 0.014), bevel=0.003)
        col(rib, 0x0e0e10)
        trim.append(rib)
    for sx in (-1, 1):
        sp = V.bevel_box((sx * 0.068, 0.305, -0.15), (0.018, 0.105, 0.16), bevel=0.006)
        col(sp, RED, 0.15, 9)
        paint_c.append(sp)
        stripe = V.bevel_box((sx * 0.078, 0.31, -0.15), (0.004, 0.022, 0.13), bevel=0.001)
        col(stripe, 0xf6c41c)
        paint_c.append(stripe)

    # ---- engine, frame, exhaust with heat shield
    crank = V.bevel_box((0, 0.215, -0.02), (0.122, 0.135, 0.195), bevel=0.02, seg=2)
    col(crank, 0x7c8086, 0.2, 3)
    steel.append(crank)
    cyl = place(V.bevel_box((0, 0, 0), (0.078, 0.12, 0.10), bevel=0.01), (0, 0.328, 0.075), (-20, 0, 0))
    col(cyl, 0x56595e, 0.18, 4)
    steel.append(cyl)
    for k in range(5):
        fin = place(V.bevel_box((0, 0, 0), (0.102, 0.0065, 0.106), bevel=0.002), (0, 0.280 + 0.020 * k, 0.060 + 0.004 * k), (-20, 0, 0))
        col(fin, 0x323438)
        steel.append(fin)
    for sx in (-1, 1):
        cov = V.cylinder((sx * 0.066, 0.220, -0.01), 0.048, 0.024, sides=12, axis="x", bevel=0.006)
        col(cov, 0xa8acb2)
        chrome.append(cov)
    ex = V.tube_poly([(0.0, 0.30, 0.125), (0.044, 0.235, 0.145), (0.068, 0.160, 0.09), (0.072, 0.150, -0.12)], 0.017, 8, caps=False)
    col(ex, 0xd0d4da)
    chrome.append(ex)
    mf = place(V.cylinder((0, 0, 0), 0.032, 0.29, sides=12, axis="z", bevel=0.008), (0.074, 0.168, -0.285), (6, 0, 0))
    col(mf, 0xd4d8de)
    chrome.append(mf)
    shield = place(V.bevel_box((0, 0, 0), (0.008, 0.036, 0.18), bevel=0.003), (0.106, 0.172, -0.275), (6, 0, 0))
    col(shield, 0xe2e6ec)
    chrome.append(shield)
    mf_tip = V.cylinder((0.074, 0.182, -0.432), 0.022, 0.014, sides=10, axis="z")
    col(mf_tip, 0x161618)
    trim.append(mf_tip)

    # Tubular steel frame + crash bar (engine guard)
    for pts in ([(0, 0.50, 0.20), (0, 0.33, 0.13), (0, 0.18, 0.07)], [(0, 0.50, 0.19), (0, 0.43, 0.0), (0, 0.35, -0.20), (0, 0.33, -0.30)]):
        t = V.tube_poly(pts, 0.012, 6, caps=False)
        col(t, 0x151518)
        trim.append(t)
    for sx in (-1, 1):
        crash = V.tube_poly([(0, 0.38, 0.16), (sx * 0.125, 0.35, 0.15), (sx * 0.130, 0.21, 0.12), (0, 0.19, 0.09)], 0.009, 6, caps=False)
        col(crash, 0xc8ccd2)
        chrome.append(crash)
        sw = V.strut((sx * 0.042, 0.175, -0.10), (sx * 0.038, R, RZ), 0.011, 6)
        col(sw, 0x151518)
        trim.append(sw)
        shock_top, shock_bot = (sx * 0.054, 0.385, -0.33), (sx * 0.044, 0.200, -0.26)
        sh = V.strut(shock_top, shock_bot, 0.0085, 6)
        col(sh, 0xd0d4da)
        chrome.append(sh)
        spring = V.strut(np.array(shock_top) * 0.35 + np.array(shock_bot) * 0.65, np.array(shock_top) * 0.92 + np.array(shock_bot) * 0.08, 0.0145, 8)
        col(spring, RED)
        paint_c.append(spring)
        peg = V.cylinder((sx * 0.11, 0.155, -0.04), 0.009, 0.065, sides=6, axis="x")
        col(peg, 0x1a1a1c)
        trim.append(peg)
        peg2 = V.cylinder((sx * 0.095, 0.19, -0.285), 0.008, 0.055, sides=6, axis="x")
        col(peg2, 0x1a1a1c)
        trim.append(peg2)
    guard = V.bevel_box((0.054, 0.175, -0.20), (0.012, 0.032, 0.21), bevel=0.004)
    col(guard, 0x1a1a1c)
    trim.append(guard)
    ks = V.strut((-0.045, 0.17, -0.09), (-0.07, 0.04, -0.04), 0.006, 5)
    col(ks, 0x1a1a1c)
    trim.append(ks)

    # ---- rear: fender, heavy-duty chrome luggage rack, lights, blinkers, plate
    rf = arc_fender(R, RZ, R + 0.016, 0.068, 60, 152)
    col(rf, RED, 0.2, 5)
    paint_c.append(rf)
    # Rear carrier rack with transverse bars
    for sx in (-1, 1):
        r1 = V.tube_poly([(sx * 0.072, 0.39, -0.28), (sx * 0.078, 0.415, -0.36), (sx * 0.078, 0.415, -0.50), (sx * 0.035, 0.415, -0.525)], 0.0075, 6)
        col(r1, 0xc8ccd2)
        chrome.append(r1)
    r2 = V.strut((-0.035, 0.415, -0.525), (0.035, 0.415, -0.525), 0.0075, 6)
    col(r2, 0xc8ccd2)
    chrome.append(r2)
    for rz in (-0.38, -0.43, -0.48):
        cross = V.strut((-0.076, 0.415, rz), (0.076, 0.415, rz), 0.006, 6)
        col(cross, 0xc8ccd2)
        chrome.append(cross)
    # tail light, rear blinkers, and plate on bracket
    bk = V.bevel_box((0, 0.305, -0.478), (0.082, 0.082, 0.014), bevel=0.004)
    col(bk, 0x151517)
    trim.append(bk)
    for sx in (-1, 1):
        stalk = V.cylinder((sx * 0.062, 0.335, -0.468), 0.005, 0.035, sides=6, axis="x")
        col(stalk, 0x18181c)
        trim.append(stalk)
        blinker = V.cylinder((sx * 0.082, 0.335, -0.468), 0.014, 0.018, sides=10, axis="z", bevel=0.004)
        col(blinker, 0xff9d1a)
        lamps.append(blinker)
    u0, v0, u1, v1 = at.rect("plate")
    decals.append(V.quad((0, 0.287, -0.486), (-1, 0, 0), (0, 1, 0), 0.070, 0.031, (u0, v0, u1, v1)))
    u0, v0, u1, v1 = at.rect("tail")
    decals.append(V.quad((0, 0.334, -0.486), (-1, 0, 0), (0, 1, 0), 0.044, 0.022, (u0, v0, u1, v1)))

    # ---- front end (steering node): fork, fender, head lamp, blinkers, handlebar, mirrors, dual gauges
    for sx in (-1, 1):
        up = V.strut((sx * 0.034, 0.515, 0.21), (sx * 0.034, 0.335, 0.262), 0.0135, 8)
        col(up, 0xd0d4da)
        steer_chrome.append(up)
        boot = V.strut((sx * 0.034, 0.405, 0.24), (sx * 0.034, 0.338, 0.260), 0.0175, 8)
        col(boot, 0x151517)
        steer_trim.append(boot)
        lo = V.strut((sx * 0.034, 0.35, 0.256), (sx * 0.034, R, FZ), 0.0115, 8)
        col(lo, 0xb8bcc2)
        steer_chrome.append(lo)
        ax_ = V.cylinder((sx * 0.034, R, FZ), 0.014, 0.018, sides=8, axis="x")
        col(ax_, 0xd0d4da)
        steer_chrome.append(ax_)
    bridge = V.bevel_box((0, 0.505, 0.212), (0.092, 0.022, 0.036), bevel=0.008)
    col(bridge, 0x15151a)
    steer_trim.append(bridge)
    ff = arc_fender(R, FZ, R + 0.018, 0.064, 18, 114)
    col(ff, RED, 0.2, 6)
    steer_paint.append(ff)
    for sx in (-1, 1):
        st = V.strut((sx * 0.034, 0.34, 0.255), (sx * 0.034, 0.30, 0.34), 0.0055, 4)
        col(st, 0xc8ccd2)
        steer_chrome.append(st)
    stem = V.strut((0, 0.50, 0.21), (0, 0.57, 0.195), 0.013, 6)
    col(stem, 0x15151a)
    steer_trim.append(stem)
    hb = V.tube_poly([(-0.15, 0.605, 0.145), (-0.105, 0.622, 0.175), (-0.04, 0.626, 0.196), (0.04, 0.626, 0.196), (0.105, 0.622, 0.175), (0.15, 0.605, 0.145)], 0.008, 6, caps=False)
    col(hb, 0xd4d8de)
    steer_chrome.append(hb)
    for sx in (-1, 1):
        gr = V.cylinder((sx * 0.136, 0.608, 0.150), 0.0135, 0.058, sides=8, axis="x")
        col(gr, 0x131315)
        steer_trim.append(gr)
        lever = V.strut((sx * 0.108, 0.614, 0.172), (sx * 0.086, 0.602, 0.215), 0.0045, 4)
        col(lever, 0xc8ccd2)
        steer_chrome.append(lever)
        arm = V.tube_poly([(sx * 0.12, 0.618, 0.168), (sx * 0.14, 0.66, 0.145)], 0.004, 4)
        col(arm, 0xc8ccd2)
        steer_chrome.append(arm)
        mr = V.cylinder((sx * 0.142, 0.670, 0.139), 0.022, 0.009, sides=10, axis="z")
        col(mr, 0x141416)
        steer_trim.append(mr)
        mf2 = V.cylinder((sx * 0.142, 0.670, 0.1335), 0.018, 0.004, sides=10, axis="z")
        col(mf2, 0xd4dce2)
        steer_chrome.append(mf2)
        # Front amber turn-signal blinkers flanking the headlamp
        f_stalk = V.cylinder((sx * 0.058, 0.535, 0.265), 0.005, 0.032, sides=6, axis="x")
        col(f_stalk, 0xc8ccd2)
        steer_chrome.append(f_stalk)
        f_blink = V.cylinder((sx * 0.076, 0.535, 0.265), 0.015, 0.018, sides=10, axis="z", bevel=0.004)
        col(f_blink, 0xffa018)
        steer_lamps.append(f_blink)

    lamp_b = V.cylinder((0, 0.545, 0.275), 0.056, 0.055, sides=16, axis="z", bevel=0.012)
    col(lamp_b, 0x16161a)
    steer_trim.append(lamp_b)
    ring = V.cylinder((0, 0.545, 0.302), 0.054, 0.018, sides=16, axis="z", bevel=0.004)
    col(ring, 0xd8dce2)
    steer_chrome.append(ring)
    lens = V.lathe([(0.0, 0.0), (0.043, 0.0), (0.045, 0.005), (0.036, 0.018), (0.0, 0.025)], 16)
    lens = place(lens, (0, 0.545, 0.306), (90, 0, 0))
    col(lens, 0xfff5d6)
    steer_lamps.append(lens)
    # Dual round speedometer / tachometer pods
    for sx in (-0.026, 0.026):
        pod_cup = place(V.cylinder((0, 0, 0), 0.022, 0.028, sides=12, axis="y", bevel=0.003), (sx, 0.612, 0.222), (-25, 0, 0))
        col(pod_cup, 0x15161a)
        steer_trim.append(pod_cup)
        pod_rim = place(V.cylinder((0, 0, 0), 0.023, 0.006, sides=12, axis="y"), (sx, 0.625, 0.216), (-25, 0, 0))
        col(pod_rim, 0xd4d8de)
        steer_chrome.append(pod_rim)

    # ---- 5-spoke alloy wheels
    tyre, rimsp, hub = V.spoked_wheel(R, 0.056, R - 0.038, hub_r=0.030, spokes=5, sides=20)
    for name, z in (("wheel_F", FZ), ("wheel_R", RZ)):
        for mesh, mat, c in ((tyre, "tyre", 0x26262a), (rimsp, "chrome", 0xd0d4da), (hub, "chrome", 0xb8bcc2)):
            p = mesh.copy()
            if mat == "tyre":
                p.c[:, :3] = V.lin(c) * (0.9 + 0.2 * V.value_noise(p.v * 5.0, 1.0, 3)[:, None])
            else:
                V.paint(p, c)
            m.add(place(p, (0, R, z)), mat, node=name, pivot=(0, R, z))
    drum = V.cylinder((0.038, R, RZ), 0.052, 0.022, sides=14, axis="x", bevel=0.004)
    col(drum, 0x8a8e94)
    steel.append(drum)

    m.add(paint_c, "paint")
    m.add(trim, "trim")
    m.add(chrome, "chrome")
    m.add(steel, "steel")
    m.add(decals, "decal")
    m.add(lamps, "lamp")
    m.add(steer_paint, "paint", node="steering", pivot=HEAD)
    m.add(steer_trim, "trim", node="steering", pivot=HEAD)
    m.add(steer_chrome, "chrome", node="steering", pivot=HEAD)
    m.add(steer_lamps, "lamp", node="steering", pivot=HEAD)
    V.scale_model(m, 0.95)
    return m, std_specs(decal_tex="decals_okada", paint_tone=0xf8f8f8)
