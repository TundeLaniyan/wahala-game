"""Lagride Lagos Taxi SUV: two-tone white upper cabin/hood & cyan-blue lower body, roof rails, glowing TAXI roof sign."""
from __future__ import annotations

import numpy as np

import vehicles_lib as V
from vehicles_lib import Model, place
from veh_common import Wheels, add_wheel_set, poly_window, rust_color_fn, std_specs

Y0 = 0.095
WR, WW = 0.14, 0.092
WX, WZ = 0.266, 0.40
BAND = (0.205, 0.285)
HULL_TOP = 0.395
ROOF = 0.665
CYAN = 0x00a6e6
WHITE = 0xf4f7fa


def make_atlas() -> V.Atlas:
    at = V.Atlas(512, seed=23)

    def plate(img, d, rng):
        d.rectangle([0, 0, 127, 55], fill=(0xf2, 0xf2, 0xea), outline=(0x20, 0x20, 0x20), width=3)
        d.rectangle([4, 4, 123, 16], fill=(0x1b, 0x7a, 0x3a))
        V.hand_text(d, rng, "LAGOS", (4, 3, 124, 17), (0xff, 0xff, 0xff), 13, jitter=0.0, tracking=3)
        V.hand_text(d, rng, "LND 207 LG", (4, 18, 124, 52), (0x10, 0x10, 0x14), 19, path=V.FONT_MONO, jitter=0.0)

    def tail(img, d, rng):
        d.rectangle([0, 0, 95, 39], fill=(0x8a, 0x10, 0x14))
        d.rectangle([3, 3, 62, 36], fill=(0xe2, 0x22, 0x28))
        d.rectangle([65, 3, 92, 17], fill=(0xff, 0x9a, 0x1c))
        d.rectangle([65, 20, 92, 36], fill=(0xe9, 0xe4, 0xd8))
        d.rectangle([7, 7, 46, 13], fill=(0xff, 0x7a, 0x72))

    def amber(img, d, rng):
        d.rectangle([0, 0, 31, 31], fill=(0xff, 0xa4, 0x1c))
        d.rectangle([3, 3, 14, 12], fill=(0xff, 0xdd, 0x8a))

    def sign_taxi(img, d, rng):
        d.rectangle([0, 0, 159, 39], fill=(0xff, 0xd0, 0x18))
        d.rectangle([0, 0, 159, 5], fill=(0x10, 0x12, 0x16))
        d.rectangle([0, 34, 159, 39], fill=(0x10, 0x12, 0x16))
        V.hand_text(d, rng, "TAXI", (6, 5, 154, 35), (0x10, 0x12, 0x16), 30, jitter=0.0, tracking=6)

    def sign_side(img, d, rng):
        d.rectangle([0, 0, 83, 39], fill=(0xff, 0xd0, 0x18))
        d.rectangle([0, 0, 83, 5], fill=(0x10, 0x12, 0x16))
        d.rectangle([0, 34, 83, 39], fill=(0x10, 0x12, 0x16))
        V.hand_text(d, rng, "TAXI", (4, 6, 80, 34), (0x10, 0x12, 0x16), 20, jitter=0.0, tracking=2)

    def door_band(img, d, rng):
        d.rectangle([0, 0, 255, 47], fill=(0x00, 0x96, 0xd6))
        d.rectangle([0, 0, 255, 4], fill=(0xf4, 0xf7, 0xfa))
        # Colorful Lagride pixel mosaic squares on the left/right
        squares = [
            (10, 8, (0xf6, 0xc4, 0x1c)),
            (24, 8, (0xe8, 0x38, 0x28)),
            (10, 22, (0x1c, 0xa6, 0x4c)),
            (24, 22, (0xf4, 0xf7, 0xfa)),
            (218, 8, (0xf6, 0xc4, 0x1c)),
            (232, 8, (0x1c, 0xa6, 0x4c)),
            (218, 22, (0xe8, 0x38, 0x28)),
            (232, 22, (0xf4, 0xf7, 0xfa)),
        ]
        for sx, sy, sc in squares:
            d.rectangle([sx, sy, sx + 11, sy + 11], fill=sc)
        V.hand_text(d, rng, "LAGRIDE", (44, 6, 212, 42), (0xff, 0xff, 0xff), 28, jitter=0.0, tracking=3)

    at.cell("door_band", 256, 48, door_band)
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
            (Y0, 0.304, 0.585, 0.585, 3.8),
            (0.16, 0.322, 0.614, 0.610, 3.6),
            (0.30, 0.326, 0.622, 0.618, 3.5),
            (HULL_TOP, 0.320, 0.605, 0.602, 3.4),
        ],
        ytop=HULL_TOP,
        roof_r=0.04,
        crown=0.014,
        roof_steps=5,
        extra_ys=[0.205, 0.285, 0.365],
        bottom_round=0.012,
    )
    axle_pts = [(WX, WR, WZ), (WX, WR, -WZ), (-WX, WR, WZ), (-WX, WR, -WZ)]
    cyan_lin = V.lin(CYAN)
    white_lin = V.lin(WHITE)
    dark_skirt = V.lin(0x181c22)
    base_cf = rust_color_fn(hull, axle_pts, seed=7, stripe=None, ao_y=(Y0, 0.26), dark=0.28, arch_r=0.17, base=tuple(cyan_lin))

    def hull_cf(y, pts, band):
        c = base_cf(y, pts, band)
        # White bonnet/hood top panel, cyan-blue doors & fenders, dark lower rocker skirt
        is_hood = (pts[:, 1] > 0.368) & (pts[:, 2] > 0.08) & (np.abs(pts[:, 0]) < 0.26)
        is_skirt = pts[:, 1] < 0.135
        for i in range(len(pts)):
            if is_hood[i]:
                c[i] = white_lin
            elif is_skirt[i]:
                c[i] = dark_skirt
        return c

    shell = hull.build(sides=56, color_fn=hull_cf, seams=(0.135, 0.368), cap_rings=(0.85, 0.65, 0.4, 0.2))
    m.add(shell, "paint")

    # Modern SUV / crossover cabin in crisp white with longer rear roofline
    cabin = V.Body(
        [
            (0.36, 0.304, 0.325, 0.485, 3.4),
            (0.44, 0.298, 0.290, 0.465, 3.3),
            (ROOF, 0.270, 0.135, 0.390, 3.1),
        ],
        ytop=ROOF,
        roof_r=0.035,
        crown=0.014,
        roof_steps=5,
        extra_ys=[0.52],
        bottom_round=0.004,
    )
    cf2 = rust_color_fn(cabin, [], seed=9, stripe=None, ao_y=(0.3, 0.31), dark=0.0, base=tuple(white_lin))
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
        decals.append(decal(proj, -0.03, 0.255, 0.44, 0.080, atlas, "door_band", flip=(sign > 0), off=0.0045, spacing=0.08, r=0.001))
        # mirrors (white caps matching upper cabin)
        arm = V.tube_poly([(sign * 0.296, 0.455, 0.20), (sign * 0.316, 0.465, 0.19)], 0.006, 5)
        V.paint(arm, 0x15151a)
        trim.append(arm)
        mir = V.bevel_box((sign * 0.326, 0.468, 0.185), (0.030, 0.045, 0.06), bevel=0.012)
        V.paint(mir, WHITE)
        deco.append(mir)

    # shoulder crease, hood / trunk shut lines and wipers
    def top_proj(x, z):
        return np.array([x, hull.roof_y(x, z), z])

    below = lambda c: c - np.array([0.0, 1.0, 0.0])
    for sign in (+1, -1):
        proj = hull.side(sign)
        cr = V.ribbon(proj, run((-0.40, 0.356), (0.46, 0.356), 9), 0.012, off=0.0, height=0.005)
        V.paint(cr, CYAN)
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
        V.paint(rb, WHITE)
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

    # ---- bumpers (modern dark lower trim + silver skid plate)
    for zc, sgn in ((0.60, 1), (-0.60, -1)):
        bar = V.bevel_box((0, 0.140, zc), (0.62, 0.046, 0.036), bevel=0.018, seg=2)
        V.paint(bar, 0x181c22)
        trim.append(bar)
        strip = V.bevel_box((0, 0.140, zc + sgn * 0.016), (0.40, 0.020, 0.010), bevel=0.004)
        V.paint(strip, 0xc3c6cc)
        chrome.append(strip)
        sk = V.bevel_box((0, 0.100, zc - sgn * 0.01), (0.48, 0.04, 0.03), bevel=0.01)
        V.paint(sk, 0x14161a)
        trim.append(sk)
        for sx in (-1, 1):
            e = V.bevel_box((sx * 0.305, 0.140, zc - sgn * 0.035), (0.030, 0.046, 0.10), bevel=0.013)
            V.paint(e, 0x181c22)
            trim.append(e)
    # grille slats and head / tail lamps
    gp = V.grid_patch(hull.front, 0.0, 0.255, 0.24, 0.068, 0.012, 0.06, off=0.0042)
    V.paint(gp, 0x080a0e)
    trim.append(gp)
    for yy in (0.235, 0.255, 0.275):
        sl = V.ribbon(hull.front, [(-0.11 + 0.22 * i / 6, yy) for i in range(7)], 0.008, off=0.0075, height=0.005)
        V.paint(sl, 0xc8ccd2)
        chrome.append(sl)
    for sx in (-1, 1):
        zc = hull.front(sx * 0.235, 0.318)[2]
        bez = V.bevel_box((sx * 0.235, 0.318, zc + 0.002), (0.105, 0.050, 0.022), bevel=0.014)
        V.paint(bez, 0xbfc1c6)
        chrome.append(bez)
        lens = V.bevel_box((sx * 0.235, 0.318, zc + 0.009), (0.088, 0.036, 0.016), bevel=0.011)
        V.paint(lens, 0xf2f8ff)
        lamps.append(lens)
        decals.append(decal(hull.front, sx * 0.295, 0.268, 0.034, 0.03, atlas, "amber", off=0.0055))
        decals.append(decal(hull.back, sx * 0.235, 0.318, 0.10, 0.042, atlas, "tail", flip=True, off=0.0055, spacing=0.05))
    decals.append(decal(hull.front, 0.0, 0.185, 0.14, 0.0612, atlas, "plate", off=0.0055))
    decals.append(decal(hull.back, 0.0, 0.245, 0.14, 0.0612, atlas, "plate", flip=True, off=0.0055))

    # ---- SUV roof rails + glowing yellow TAXI roof sign
    ry = cabin.roof_y(0, 0.0)
    for sx in (-1, 1):
        rx = sx * 0.205
        rail_bar = V.strut((rx, ry + 0.018, -0.32), (rx, ry + 0.018, 0.10), 0.0085, 6)
        V.paint(rail_bar, 0x1c1e24)
        trim.append(rail_bar)
        for rz in (-0.30, -0.11, 0.08):
            foot = V.bevel_box((rx, ry + 0.006, rz), (0.018, 0.020, 0.032), bevel=0.004)
            V.paint(foot, 0x14161a)
            trim.append(foot)
    base = V.bevel_box((0, ry + 0.007, 0.02), (0.14, 0.014, 0.055), bevel=0.005)
    V.paint(base, 0x141416)
    trim.append(base)
    sign = V.bevel_box((0, ry + 0.040, 0.02), (0.21, 0.054, 0.088), bevel=0.012, seg=1)
    V.paint(sign, 0xffd018)
    lamps.append(sign)
    for sgn in (1, -1):
        u0, v0, u1, v1 = atlas.rect("sign_taxi")
        decals.append(V.quad((0, ry + 0.040, 0.02 + sgn * 0.0448), (sgn * 1.0, 0, 0), (0, 1, 0), 0.195, 0.048, (u0, v0, u1, v1)))
    for sgn in (1, -1):
        u0, v0, u1, v1 = atlas.rect("sign_side")
        decals.append(V.quad((sgn * 0.106, ry + 0.040, 0.02), (0, 0, -sgn), (0, 1, 0), 0.080, 0.048, (u0, v0, u1, v1)))
    # shark-fin / whip antenna on the rear roof
    ant = V.tube_poly([(0.0, ry, -0.30), (0.0, ry + 0.065, -0.34)], 0.004, 4)
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
    add_wheel_set(m, Wheels(WR, WW, 0.088, sides=20), [("wheel_FL", WX, WR, WZ, 1), ("wheel_FR", -WX, WR, WZ, -1), ("wheel_RL", WX, WR, -WZ, 1), ("wheel_RR", -WX, WR, -WZ, -1)], rim_colour=0xb8bcc4)
    V.scale_model(m, 0.97)
    return m, std_specs(decal_tex="decals_taxi", paint_tone=0xf8fafc, paint_args=dict(wear=0.22))
