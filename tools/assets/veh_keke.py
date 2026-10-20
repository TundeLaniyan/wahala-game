"""Keke (three-wheeler auto-rickshaw): yellow lower body, green canopy, open sides, handlebar steering."""
from __future__ import annotations

import numpy as np

import vehicles_lib as V
from vehicles_lib import Model, place
from veh_common import Wheels, add_wheel_set, poly_window, rust_color_fn, std_specs

YELLOW = 0xf9c80e
GREEN = 0x1c8a4a
Y0 = 0.13
RWR, RWW, RWX, RWZ = 0.125, 0.085, 0.255, -0.30
FWR, FWW, FWZ = 0.12, 0.07, 0.43
BAND = (0.215, 0.275)
TUB_TOP = 0.40
ROOF_Y = 0.905


def make_atlas() -> V.Atlas:
    at = V.Atlas(512, seed=31)

    def plate(img, d, rng):
        d.rectangle([0, 0, 127, 55], fill=(0xf2, 0xf2, 0xea), outline=(0x20, 0x20, 0x20), width=3)
        d.rectangle([4, 4, 123, 16], fill=(0x1b, 0x7a, 0x3a))
        V.hand_text(d, rng, "LAGOS", (4, 3, 124, 17), (0xff, 0xff, 0xff), 13, jitter=0.0, tracking=3)
        V.hand_text(d, rng, "AKD 913 YK", (4, 18, 124, 52), (0x10, 0x10, 0x14), 19, path=V.FONT_MONO, jitter=0.0)

    def tail(img, d, rng):
        d.rectangle([0, 0, 39, 79], fill=(0x8a, 0x10, 0x14))
        d.rectangle([3, 3, 36, 44], fill=(0xd8, 0x1f, 0x26))
        d.rectangle([3, 47, 36, 60], fill=(0xff, 0x9a, 0x1c))
        d.rectangle([3, 63, 36, 76], fill=(0xe9, 0xe4, 0xd8))
        d.rectangle([6, 6, 12, 40], fill=(0xff, 0x6a, 0x66))

    def amber(img, d, rng):
        d.rectangle([0, 0, 31, 31], fill=(0xff, 0xa4, 0x1c))
        d.rectangle([3, 3, 14, 12], fill=(0xff, 0xdd, 0x8a))

    def side(img, d, rng):
        d.rectangle([0, 0, 255, 39], fill=(0x05, 0x05, 0x06))
        d.rectangle([0, 3, 255, 4], fill=(0xf2, 0xb7, 0x05))
        d.rectangle([0, 35, 255, 36], fill=(0xf2, 0xb7, 0x05))
        V.hand_text(d, rng, "KEKE  E DEY GO", (6, 5, 250, 35), (0xf6, 0xc4, 0x1c), 24, jitter=1.0, tracking=1)

    at.cell("side", 256, 40, side)
    at.cell("plate", 128, 56, plate)
    at.cell("tail", 40, 80, tail)
    at.cell("amber", 32, 32, amber)
    at.build()
    return at


def decal(proj, uc, vc, w, h, atlas, name, flip=False, off=0.0055, spacing=0.07, r=0.002):
    u0, v0, u1, v1 = atlas.rect(name)
    rect = (u1, v0, u0, v1) if flip else (u0, v0, u1, v1)
    return V.grid_patch(proj, uc, vc, w, h, r, spacing, off=off, uv_rect=rect)


def arc_fender(cy, cz, r, width, a0, a1, sides=18, thick=0.012):
    """Mudguard: part of a thin tyre-hugging shell around the wheel axle (axis X). Angles in degrees, 0 = +Z, positive towards +Y."""
    ang = np.radians(np.linspace(a0, a1, sides))
    prof = [(-width / 2, 0.0), (-width / 2 * 0.95, thick), (0.0, thick * 1.3), (width / 2 * 0.95, thick), (width / 2, 0.0)]
    Vv = []
    for a in ang:
        for x, t in prof:
            rr = r + t
            Vv.append((x, cy + rr * np.sin(a), cz + rr * np.cos(a)))
    m = V.Mesh(np.array(Vv), V.grid_faces(len(ang), len(prof)))
    return V.orient_faces(m, lambda c: np.stack([np.zeros(len(c)), np.full(len(c), cy), np.full(len(c), cz)], axis=1))


def build():
    m = Model("veh_keke")
    atlas = make_atlas()
    V.register_generator("decals_keke", atlas.tex)
    yel, grn = V.lin(YELLOW), V.lin(GREEN)

    tub = V.Body(
        [(Y0, 0.286, 0.200, 0.500, 3.8), (0.18, 0.298, 0.215, 0.515, 3.5), (TUB_TOP, 0.298, 0.215, 0.515, 3.5)],
        ytop=TUB_TOP, roof_r=0.03, crown=0.004, roof_steps=4, extra_ys=[0.215, 0.275, 0.33], bottom_round=0.01,
    )
    axle_pts = [(RWX, RWR, RWZ), (-RWX, RWR, RWZ)]
    cf = rust_color_fn(tub, axle_pts, seed=5, stripe=BAND, ao_y=(Y0, 0.30), dark=0.4, arch_r=0.17, base=tuple(yel))
    shell = tub.build(sides=40, color_fn=cf, seams=BAND, cap_rings=(0.8, 0.55, 0.3))
    # the open top of the tub is a dark floor: recolour the cap (everything above the rolled edge)
    cap = (shell.v[:, 1] > TUB_TOP - 0.012) & (np.hypot(shell.v[:, 0] / 0.298, shell.v[:, 2] / 0.4) < 0.93)
    shell.c[cap, :3] = V.lin(0x2a2826)
    m.add(shell, "paint")

    cowl = V.Body(
        [(0.22, 0.150, 0.43, 0.16, 3.4), (0.34, 0.190, 0.455, 0.16, 3.2), (0.50, 0.196, 0.40, 0.16, 3.2), (0.58, 0.192, 0.335, 0.16, 3.0)],
        ytop=0.585, roof_r=0.06, crown=0.012, roof_steps=5, extra_ys=[0.42], bottom_round=0.01,
    )
    cf3 = rust_color_fn(cowl, [], seed=6, stripe=(0.275, 0.335), ao_y=(0.2, 0.3), dark=0.25, base=tuple(yel))
    cw = cowl.build(sides=32, color_fn=cf3, seams=(0.275, 0.335), cap_rings=(0.7, 0.4))
    m.add(cw, "paint")

    canopy = V.Body(
        [(0.855, 0.292, 0.345, 0.545, 3.4), (ROOF_Y, 0.292, 0.345, 0.545, 3.4)],
        ytop=ROOF_Y, roof_r=0.03, crown=0.014, roof_steps=5, extra_ys=[], bottom_round=0.012,
    )

    def cf_roof(y, pts, band):
        n = len(pts)
        c = np.tile(grn, (n, 1))
        if y < 0.868 + band * 1e-4:
            c = np.tile(yel * 0.9, (n, 1))
        noise = V.value_noise(pts, 7.0, 4)
        return c * (1 - 0.18 * (0.5 - 0.5 * noise))[:, None]

    cp = canopy.build(sides=40, color_fn=cf_roof, seams=(0.868,), cap_rings=(0.85, 0.65, 0.4, 0.2))
    m.add(cp, "paint")

    trim, chrome, decals, lamps, deco, glass, gasket = [], [], [], [], [], [], []

    def run(a, b, n):
        return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]

    def seam(proj, pts, w=0.0032):
        r = V.ribbon(proj, pts, w, off=0.0042)
        V.paint(r, 0x20180f)
        trim.append(r)

    # ---- wheel arches on the tub, side lettering
    RA = 0.158
    phi0 = np.arcsin((Y0 + 0.003 - RWR) / RA)
    for sign in (+1, -1):
        proj = tub.side(sign)
        arc = [(RWZ + RA * np.cos(p), RWR + RA * np.sin(p)) for p in np.linspace(phi0, np.pi - phi0, 14)]
        chord = [(arc[-1][0] + (arc[0][0] - arc[-1][0]) * k / 4, Y0 + 0.003) for k in range(1, 4)]
        well = V.patch(proj, np.array(arc + chord), (RWZ, 0.17), rings=3, off=0.0045)
        V.paint(well, 0x0a0a0b)
        trim.append(well)
        lip = V.ribbon(proj, arc, 0.016, off=0.002, height=0.008)
        V.paint(lip, 0x18181b)
        trim.append(lip)
        decals.append(decal(proj, -0.03, 0.245, 0.30, 0.047, atlas, "side", flip=(sign > 0), off=0.0045, spacing=0.08, r=0.001))
        seam(proj, run((0.06, 0.32), (0.06, 0.395), 2))
        # door-sill rub strip
        rb = V.ribbon(proj, run((-0.12, 0.165), (0.17, 0.165), 6), 0.012, off=0.0, height=0.005)
        deco.append(rb)

    # ---- seats
    def seat(c, size, col, bev=0.02):
        s = V.bevel_box(c, size, bevel=bev, seg=2)
        V.paint(s, col)
        V.finish(s, dirt=0.3, seed=int(abs(c[2]) * 100))
        trim.append(s)

    seat((0.0, 0.405, 0.02), (0.30, 0.06, 0.22), 0x1d1b1c)
    seat((0.0, 0.50, -0.105), (0.30, 0.17, 0.05), 0x1d1b1c)
    seat((0.0, 0.405, -0.28), (0.50, 0.06, 0.20), 0x6e2a22)
    seat((0.0, 0.52, -0.395), (0.50, 0.21, 0.05), 0x6e2a22)

    # ---- rear body panel, louvres, lights, plate, bumper
    rear = V.bevel_box((0, 0.50, -0.47), (0.56, 0.24, 0.10), bevel=0.03, seg=2)
    V.paint(rear, YELLOW)
    V.finish(rear, dirt=0.25, seed=2)
    m.add(rear, "paint")
    back_plane = lambda x, y: np.array([x, y, -0.522])
    for yy in (0.45, 0.48, 0.51, 0.54):
        lv = V.ribbon(back_plane, [(-0.14 + 0.28 * i / 4, yy) for i in range(5)], 0.016, off=0.0, height=0.007, ref_fn=V.axis_ref)
        V.paint(lv, 0x0e0e10)
        trim.append(lv)
    decals.append(decal(tub.back, 0.0, 0.30, 0.15, 0.0656, atlas, "plate", flip=True, off=0.0055))
    for sx in (-1, 1):
        decals.append(decal(back_plane, sx * 0.225, 0.58, 0.04, 0.08, atlas, "tail", flip=True, off=0.001, spacing=0.05))
    bump = V.bevel_box((0, 0.175, -0.525), (0.50, 0.04, 0.03), bevel=0.014, seg=2)
    V.paint(bump, 0xb9bbc0)
    chrome.append(bump)

    # ---- front end: head lamp, trim, plate, indicators, fender, fork, handlebar
    zf = cowl.front(0.0, 0.43)[2]
    ring = V.cylinder((0, 0.43, zf + 0.004), 0.066, 0.018, sides=16, axis="z", bevel=0.005)
    V.paint(ring, 0xbfc1c6)
    chrome.append(ring)
    lens = V.lathe([(0.0, 0.0), (0.052, 0.0), (0.054, 0.006), (0.044, 0.020), (0.0, 0.026)], 16)
    lens = place(lens, (0, 0.43, zf + 0.014), (90, 0, 0))
    V.paint(lens, 0xfff2cf)
    lamps.append(lens)
    trim_strip = V.ribbon(cowl.front, [(-0.15 + 0.3 * i / 6, 0.335) for i in range(7)], 0.012, off=0.003, height=0.004)
    V.paint(trim_strip, 0xbfc1c6)
    chrome.append(trim_strip)
    decals.append(decal(cowl.front, 0.0, 0.295, 0.11, 0.0482, atlas, "plate", off=0.0055))
    for sx in (-1, 1):
        decals.append(decal(cowl.front, sx * 0.14, 0.43, 0.036, 0.036, atlas, "amber", off=0.0045))
    fend = arc_fender(FWR, FWZ, FWR + 0.02, 0.095, -15, 125)
    V.paint(fend, YELLOW)
    V.finish(fend, dirt=0.35, seed=8)
    deco.append(fend)
    for sx in (-1, 1):
        fk = V.strut((sx * 0.05, FWR, FWZ), (sx * 0.045, 0.40, 0.36), 0.009, 6, caps=False)
        V.paint(fk, 0xb9bbc0)
        chrome.append(fk)
    # handlebar, grips, dash
    hb = V.tube_poly([(-0.20, 0.655, 0.20), (-0.10, 0.665, 0.205), (0.10, 0.665, 0.205), (0.20, 0.655, 0.20)], 0.009, 6)
    V.paint(hb, 0xb9bbc0)
    chrome.append(hb)
    for sx in (-1, 1):
        gr = V.cylinder((sx * 0.215, 0.653, 0.198), 0.015, 0.06, sides=8, axis="x")
        V.paint(gr, 0x131315)
        trim.append(gr)
    dash = V.bevel_box((0, 0.615, 0.235), (0.24, 0.07, 0.09), bevel=0.02, seg=1)
    V.paint(dash, 0x18181a)
    trim.append(dash)
    gauge = V.cylinder((0, 0.632, 0.2885), 0.026, 0.008, sides=12, axis="z")
    V.paint(gauge, 0xd0d4d8)
    chrome.append(gauge)

    # ---- canopy frame: pillars, windscreen, rear window
    def pillar(p0, p1, r=0.0115):
        t = V.strut(p0, p1, r, 6, caps=True)
        V.paint(t, 0x17201a)
        trim.append(t)

    px = 0.283
    pillar((px, TUB_TOP - 0.01, 0.30), (px, 0.855, 0.205))
    pillar((-px, TUB_TOP - 0.01, 0.30), (-px, 0.855, 0.205))
    for zz in (-0.12, -0.46):
        pillar((px, TUB_TOP - 0.01, zz), (px, 0.855, zz))
        pillar((-px, TUB_TOP - 0.01, zz), (-px, 0.855, zz))
    # windscreen on the raked plane through the A-pillars
    def screen_proj(x, y):
        return np.array([x, y, 0.30 - (y - 0.60) * (0.095 / 0.255)])

    wpoly = V.fillet_poly([(-0.262, 0.60), (0.262, 0.60), (0.255, 0.848), (-0.255, 0.848)], 0.03, 3, 0.06)
    poly_window(screen_proj, wpoly, glass, gasket, rings=3, off_g=0.004, pad=0.012)
    for sx in (-1, 1):
        wp = V.ribbon(screen_proj, [(sx * 0.03, 0.615), (sx * 0.12, 0.68), (sx * 0.22, 0.745)], 0.006, off=0.0075)
        V.paint(wp, 0x0b0b0d)
        trim.append(wp)
    rpoly = V.fillet_poly([(-0.20, 0.64), (0.20, 0.64), (0.195, 0.82), (-0.195, 0.82)], 0.025, 3, 0.06)
    rear_proj = lambda x, y: np.array([x, y, -0.508])
    poly_window(rear_proj, rpoly, glass, gasket, rings=2, off_g=0.004, pad=0.012, streaks=False)
    # mirrors on the screen posts
    for sx in (-1, 1):
        st = V.tube_poly([(sx * 0.283, 0.80, 0.215), (sx * 0.298, 0.80, 0.18)], 0.005, 5)
        V.paint(st, 0x17201a)
        trim.append(st)
        mr = V.cylinder((sx * 0.296, 0.80, 0.168), 0.024, 0.012, sides=12, axis="z")
        V.paint(mr, 0x151517)
        trim.append(mr)
        mf = V.cylinder((sx * 0.296, 0.80, 0.160), 0.019, 0.006, sides=12, axis="z")
        V.paint(mf, 0xc8d0d4)
        chrome.append(mf)
    # roof rack and a bundle on top
    for sx in (-1, 1):
        t = V.strut((sx * 0.16, 0.945, -0.46), (sx * 0.16, 0.945, 0.24), 0.007, 5, caps=False)
        V.paint(t, 0x17201a)
        trim.append(t)
    for zz in np.linspace(-0.46, 0.24, 5):
        t = V.strut((-0.16, 0.945, zz), (0.16, 0.945, zz), 0.0065, 5, caps=False)
        V.paint(t, 0x17201a)
        trim.append(t)
    for sx in (-1, 1):
        for zz in (-0.46, -0.1, 0.24):
            t = V.strut((sx * 0.16, canopy.roof_y(sx * 0.16, zz) - 0.004, zz), (sx * 0.16, 0.945, zz), 0.008, 5, caps=False)
            V.paint(t, 0x17201a)
            trim.append(t)
    bundle = V.blob((0.0, 0.975, -0.25), (0.14, 0.04, 0.10), 6, 12, seed=4, bumpy=0.08)
    V.paint(bundle, 0xd3ccb6)
    V.finish(bundle, dirt=0.35, seed=4)
    trim.append(bundle)

    m.add(glass, "glass")
    m.add(gasket + trim, "trim")
    m.add(deco, "paint")
    m.add(chrome, "chrome")
    m.add(decals, "decal")
    m.add(lamps, "lamp")
    add_wheel_set(m, Wheels(RWR, RWW, 0.082, sides=20), [("wheel_RL", RWX, RWR, RWZ, 1), ("wheel_RR", -RWX, RWR, RWZ, -1)], rim_colour=0x8a8d94)
    add_wheel_set(m, Wheels(FWR, FWW, 0.078, sides=20), [("wheel_F", 0.0, FWR, FWZ, 1)], rim_colour=0x8a8d94)
    V.scale_model(m, 0.92)
    return m, std_specs(decal_tex="decals_keke", paint_tone=0xf0f0f0, paint_args=dict(wear=0.5))
