"""LAGride taxi: generic yellow sedan with a black band and a glowing roof sign (original design, no real brand)."""
from __future__ import annotations

import numpy as np

import vehicles_lib as V
from vehicles_lib import Model, place
from veh_common import Wheels, add_wheel_set, poly_window, rust_color_fn, std_specs

Y0 = 0.095
WR, WW = 0.135, 0.09
WX, WZ = 0.262, 0.40
BAND = (0.205, 0.285)
HULL_TOP = 0.385
ROOF = 0.635


def make_atlas() -> V.Atlas:
    at = V.Atlas(512, seed=23)

    def plate(img, d, rng):
        d.rectangle([0, 0, 127, 55], fill=(0xf2, 0xf2, 0xea), outline=(0x20, 0x20, 0x20), width=3)
        d.rectangle([4, 4, 123, 16], fill=(0x1b, 0x7a, 0x3a))
        V.hand_text(d, rng, "LAGOS", (4, 3, 124, 17), (0xff, 0xff, 0xff), 13, jitter=0.0, tracking=3)
        V.hand_text(d, rng, "LND 207 TX", (4, 18, 124, 52), (0x10, 0x10, 0x14), 19, path=V.FONT_MONO, jitter=0.0)

    def tail(img, d, rng):
        d.rectangle([0, 0, 95, 39], fill=(0x8a, 0x10, 0x14))
        d.rectangle([3, 3, 62, 36], fill=(0xd8, 0x1f, 0x26))
        d.rectangle([65, 3, 92, 17], fill=(0xff, 0x9a, 0x1c))
        d.rectangle([65, 20, 92, 36], fill=(0xe9, 0xe4, 0xd8))
        d.rectangle([7, 7, 40, 12], fill=(0xff, 0x6a, 0x66))

    def amber(img, d, rng):
        d.rectangle([0, 0, 31, 31], fill=(0xff, 0xa4, 0x1c))
        d.rectangle([3, 3, 14, 12], fill=(0xff, 0xdd, 0x8a))

    def sign_taxi(img, d, rng):
        d.rectangle([0, 0, 159, 39], fill=(0xf4, 0xf0, 0xdc))
        d.rectangle([0, 0, 159, 5], fill=(0x10, 0x10, 0x12))
        d.rectangle([0, 34, 159, 39], fill=(0x10, 0x10, 0x12))
        for i in range(8):
            d.rectangle([i * 20, 0, i * 20 + 9, 5], fill=(0xf2, 0xb7, 0x05))
            d.rectangle([i * 20 + 10, 34, i * 20 + 19, 39], fill=(0xf2, 0xb7, 0x05))
        V.hand_text(d, rng, "TAXI", (4, 5, 156, 35), (0x14, 0x14, 0x18), 30, jitter=0.0, tracking=6)

    def sign_side(img, d, rng):
        d.rectangle([0, 0, 83, 39], fill=(0xf4, 0xf0, 0xdc))
        d.rectangle([0, 0, 83, 5], fill=(0x10, 0x10, 0x12))
        d.rectangle([0, 34, 83, 39], fill=(0x10, 0x10, 0x12))
        V.hand_text(d, rng, "LAGride", (2, 6, 82, 34), (0x14, 0x14, 0x18), 17, jitter=0.0)

    def door_band(img, d, rng):
        d.rectangle([0, 0, 255, 39], fill=(0x05, 0x05, 0x06))
        d.rectangle([0, 3, 255, 4], fill=(0xf2, 0xb7, 0x05))
        d.rectangle([0, 35, 255, 36], fill=(0xf2, 0xb7, 0x05))
        V.hand_text(d, rng, "LAGride", (4, 5, 252, 35), (0xf4, 0xf0, 0xe0), 27, jitter=0.0, tracking=3)

    at.cell("door_band", 256, 40, door_band)
    at.cell("sign_taxi", 160, 40, sign_taxi)
    at.cell("sign_side", 84, 40, sign_side)
    at.cell("plate", 128, 56, plate)
    at.cell("tail", 96, 40, tail)
    at.cell("amber", 32, 32, amber)
    at.build()
    return at


def decal(proj, uc, vc, w, h, atlas, name, flip=False, off=0.0055, spacing=0.07, r=0.002):
    u0, v0, u1, v1 = atlas.rect(name)
    rect = (u1, v0, u0, v1) if flip else (u0, v0, u1, v1)
    return V.grid_patch(proj, uc, vc, w, h, r, spacing, off=off, uv_rect=rect)


def build():
    m = Model("veh_taxi")
    atlas = make_atlas()
    V.register_generator("decals_taxi", atlas.tex)

    hull = V.Body(
        [
            (Y0, 0.302, 0.585, 0.585, 3.8),
            (0.16, 0.320, 0.612, 0.608, 3.6),
            (0.30, 0.324, 0.620, 0.616, 3.5),
            (HULL_TOP, 0.320, 0.605, 0.600, 3.4),
        ],
        ytop=HULL_TOP,
        roof_r=0.04,
        crown=0.012,
        roof_steps=5,
        extra_ys=[0.205, 0.285],
        bottom_round=0.012,
    )
    axle_pts = [(WX, WR, WZ), (WX, WR, -WZ), (-WX, WR, WZ), (-WX, WR, -WZ)]
    cf = rust_color_fn(hull, axle_pts, seed=7, stripe=BAND, ao_y=(Y0, 0.30), dark=0.4, arch_r=0.17)
    shell = hull.build(sides=56, color_fn=cf, seams=BAND, cap_rings=(0.85, 0.65, 0.4, 0.2))
    m.add(shell, "paint")

    cabin = V.Body(
        [
            (0.35, 0.302, 0.320, 0.400, 3.4),
            (0.42, 0.298, 0.290, 0.375, 3.3),
            (ROOF, 0.268, 0.130, 0.250, 3.0),
        ],
        ytop=ROOF,
        roof_r=0.035,
        crown=0.012,
        roof_steps=5,
        extra_ys=[0.50],
        bottom_round=0.004,
    )
    cf2 = rust_color_fn(cabin, [], seed=9, stripe=None, ao_y=(0.3, 0.31), dark=0.0)
    cab = cabin.build(sides=44, color_fn=cf2, seams=(), cap_rings=(0.8, 0.5))
    m.add(cab, "paint")

    glass, gasket = [], []
    trim, chrome, decals, lamps, deco, steel = [], [], [], [], [], []

    # ---- windows from the cabin's own outline (trapezoids)
    YL, YH = 0.425, 0.605
    m_edge = 0.045

    def front_edge(y):
        return cabin.params(y)[1] - m_edge

    def rear_edge(y):
        return -(cabin.params(y)[2] - m_edge)

    for sign in (+1, -1):
        proj = cabin.side(sign)
        w1 = [(front_edge(YL), YL), (front_edge(YH), YH), (-0.03, YH), (-0.03, YL)]
        w2 = [(-0.10, YL), (-0.10, YH), (rear_edge(YH), YH), (rear_edge(YL), YL)]
        for corners in (w1, w2):
            cc = np.array(corners, dtype=np.float64)
            # order CCW in (z, y): reorder so that polygon is CCW
            cen = cc.mean(axis=0)
            ang = np.arctan2(cc[:, 1] - cen[1], cc[:, 0] - cen[0])
            cc = cc[np.argsort(ang)]
            poly = V.fillet_poly(cc, 0.022, 3, 0.07)
            poly_window(proj, poly, glass, gasket, rings=2, off_g=0.0058)
    # windscreen and rear screen
    def screen(proj, y_lo, y_hi, mrg):
        a_lo, a_hi = cabin.params(y_lo)[0] - mrg, cabin.params(y_hi)[0] - mrg
        cc = np.array([(-a_lo, y_lo), (a_lo, y_lo), (a_hi, y_hi), (-a_hi, y_hi)])
        return V.fillet_poly(cc, 0.03, 3, 0.06)

    poly_window(cabin.front, screen(cabin.front, 0.402, 0.618, 0.045), glass, gasket, rings=3, off_g=0.0075)
    poly_window(cabin.back, screen(cabin.back, 0.402, 0.614, 0.05), glass, gasket, rings=3, off_g=0.0075)
    m.add(glass, "glass")

    def seam(proj, pts, w=0.0032):
        r = V.ribbon(proj, pts, w, off=0.0042)
        V.paint(r, 0x20180f)
        trim.append(r)

    def run(a, b, n):
        return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]

    for sign in (+1, -1):
        proj = hull.side(sign)
        for zz in (0.19, -0.065, -0.265):
            seam(proj, run((zz, 0.115), (zz, 0.368), 5))
        for zz in (0.012, -0.30):
            h = V.bevel_box((sign * 0.325, 0.325, zz), (0.012, 0.02, 0.055), bevel=0.005)
            V.paint(h, 0xb9bbc0)
            chrome.append(h)
        decals.append(decal(proj, 0.10, 0.245, 0.42, 0.066, atlas, "door_band", flip=(sign > 0), off=0.0045, spacing=0.08, r=0.001))
        # mirrors
        arm = V.tube_poly([(sign * 0.296, 0.455, 0.20), (sign * 0.316, 0.465, 0.19)], 0.006, 5)
        V.paint(arm, 0x15151a)
        trim.append(arm)
        mir = V.bevel_box((sign * 0.326, 0.468, 0.185), (0.030, 0.045, 0.06), bevel=0.012)
        deco.append(mir)

    # shoulder crease, hood / trunk shut lines and wipers
    def top_proj(x, z):
        return np.array([x, hull.roof_y(x, z), z])

    below = lambda c: c - np.array([0.0, 1.0, 0.0])
    for sign in (+1, -1):
        proj = hull.side(sign)
        cr = V.ribbon(proj, run((-0.40, 0.356), (0.46, 0.356), 9), 0.012, off=0.0, height=0.005)
        deco.append(cr)
    hood = [(0.19, 0.55), (0.19, 0.36), (-0.19, 0.36), (-0.19, 0.55)]
    r1 = V.ribbon(top_proj, hood, 0.0032, off=0.0035, ref_fn=below)
    V.paint(r1, 0x20180f)
    trim.append(r1)
    trunk = [(0.19, -0.54), (0.19, -0.36), (-0.19, -0.36), (-0.19, -0.54)]
    r2 = V.ribbon(top_proj, trunk, 0.0032, off=0.0035, ref_fn=below)
    V.paint(r2, 0x20180f)
    trim.append(r2)
    for xr in (-0.085, 0.085):
        rb = V.ribbon(top_proj, [(xr, 0.50 - 0.10 * i / 3) for i in range(4)], 0.03, off=0.0, height=0.004, ref_fn=below)
        deco.append(rb)
    for sx in (-1, 1):
        wp = V.ribbon(cabin.front, [(sx * 0.02, 0.43), (sx * 0.12, 0.49), (sx * 0.21, 0.55)], 0.006, off=0.0105)
        V.paint(wp, 0x0b0b0d)
        trim.append(wp)

    # ---- wheel arches
    RA = 0.165
    phi0 = np.arcsin((Y0 + 0.003 - WR) / RA)
    for sign in (+1, -1):
        proj = hull.side(sign)
        for zc in (WZ, -WZ):
            arc = [(zc + RA * np.cos(p), WR + RA * np.sin(p)) for p in np.linspace(phi0, np.pi - phi0, 14)]
            chord = [(arc[-1][0] + (arc[0][0] - arc[-1][0]) * k / 4, Y0 + 0.003) for k in range(1, 4)]
            well = V.patch(proj, np.array(arc + chord), (zc, 0.16), rings=3, off=0.0045)
            V.paint(well, 0x0a0a0b)
            trim.append(well)
            lip = V.ribbon(proj, arc, 0.016, off=0.002, height=0.008)
            V.paint(lip, 0x18181b)
            trim.append(lip)

    # ---- bumpers
    for zc, sgn in ((0.60, 1), (-0.60, -1)):
        bar = V.bevel_box((0, 0.140, zc), (0.62, 0.046, 0.036), bevel=0.018, seg=2)
        V.paint(bar, 0xb9bbc0)
        chrome.append(bar)
        strip = V.bevel_box((0, 0.140, zc + sgn * 0.016), (0.40, 0.020, 0.010), bevel=0.004)
        V.paint(strip, 0x1c1c1f)
        trim.append(strip)
        sk = V.bevel_box((0, 0.100, zc - sgn * 0.01), (0.48, 0.04, 0.03), bevel=0.01)
        V.paint(sk, 0x1b1a1a)
        trim.append(sk)
        for sx in (-1, 1):
            e = V.bevel_box((sx * 0.305, 0.140, zc - sgn * 0.035), (0.030, 0.046, 0.10), bevel=0.013)
            V.paint(e, 0xb0b2b7)
            chrome.append(e)
    # grille slats and head / tail lamps
    gp = V.grid_patch(hull.front, 0.0, 0.245, 0.22, 0.06, 0.012, 0.06, off=0.0042)
    V.paint(gp, 0x08080a)
    trim.append(gp)
    for yy in (0.225, 0.245, 0.265):
        sl = V.ribbon(hull.front, [(-0.1 + 0.2 * i / 6, yy) for i in range(7)], 0.008, off=0.0075, height=0.005)
        V.paint(sl, 0xc3c5ca)
        chrome.append(sl)
    for sx in (-1, 1):
        zc = hull.front(sx * 0.235, 0.318)[2]
        bez = V.bevel_box((sx * 0.235, 0.318, zc + 0.002), (0.105, 0.050, 0.022), bevel=0.014)
        V.paint(bez, 0xbfc1c6)
        chrome.append(bez)
        lens = V.bevel_box((sx * 0.235, 0.318, zc + 0.009), (0.088, 0.036, 0.016), bevel=0.011)
        V.paint(lens, 0xfff2cf)
        lamps.append(lens)
        decals.append(decal(hull.front, sx * 0.295, 0.268, 0.034, 0.03, atlas, "amber", off=0.0055))
        decals.append(decal(hull.back, sx * 0.235, 0.318, 0.10, 0.042, atlas, "tail", flip=True, off=0.0055, spacing=0.05))
    decals.append(decal(hull.front, 0.0, 0.185, 0.14, 0.0612, atlas, "plate", off=0.0055))
    decals.append(decal(hull.back, 0.0, 0.245, 0.14, 0.0612, atlas, "plate", flip=True, off=0.0055))

    # ---- roof sign
    ry = cabin.roof_y(0, 0.0)
    base = V.bevel_box((0, ry + 0.007, 0.0), (0.12, 0.014, 0.05), bevel=0.005)
    V.paint(base, 0x141416)
    trim.append(base)
    sign = V.bevel_box((0, ry + 0.040, 0.0), (0.20, 0.052, 0.085), bevel=0.012, seg=1)
    V.paint(sign, 0xf6f1dc)
    lamps.append(sign)
    for sgn in (1, -1):
        u0, v0, u1, v1 = atlas.rect("sign_taxi")
        decals.append(V.quad((0, ry + 0.040, sgn * 0.0432), (sgn * 1.0, 0, 0), (0, 1, 0), 0.19, 0.0475, (u0, v0, u1, v1)))
    for sgn in (1, -1):
        u0, v0, u1, v1 = atlas.rect("sign_side")
        decals.append(V.quad((sgn * 0.1015, ry + 0.040, 0.0), (0, 0, -sgn), (0, 1, 0), 0.078, 0.0475, (u0, v0, u1, v1)))
    # antenna on the rear deck
    ant = V.tube_poly([(0.2, 0.386, -0.50), (0.215, 0.50, -0.545)], 0.0035, 4)
    V.paint(ant, 0x111111)
    trim.append(ant)
    # underbody + exhaust
    ch = V.bevel_box((0, 0.085, 0.0), (0.46, 0.05, 1.10), bevel=0.01)
    V.paint(ch, 0x131214)
    trim.append(ch)
    for z in (WZ, -WZ):
        ax = V.cylinder((0, WR, z), 0.015, 0.50, sides=8, axis="x")
        V.paint(ax, 0x262628)
        steel.append(ax)
    ex = V.tube_poly([(-0.17, 0.085, -0.45), (-0.17, 0.085, -0.62), (-0.17, 0.10, -0.64)], 0.016, 8)
    V.paint(ex, 0x4a494b)
    steel.append(ex)

    m.add(deco, "paint")
    m.add(trim, "trim")
    m.add(chrome, "chrome")
    m.add(steel, "steel")
    m.add(decals, "decal")
    m.add(lamps, "lamp")
    add_wheel_set(m, Wheels(WR, WW, 0.085, sides=20), [("wheel_FL", WX, WR, WZ, 1), ("wheel_FR", -WX, WR, WZ, -1), ("wheel_RL", WX, WR, -WZ, 1), ("wheel_RR", -WX, WR, -WZ, -1)], rim_colour=0x8a8d94)
    V.scale_model(m, 0.97)
    return m, std_specs(decal_tex="decals_taxi", paint_tone=0xf9c80e)
