"""LAGride yellow cab (v4): clean, glossy three-box saloon with a black-and-white chequered door band and a
lit TAXI roof sign. Long bonnet, cabin set back, short boot, low roof - a silhouette nothing like the danfo.
Original design; no real brand."""
from __future__ import annotations

import numpy as np

import vehicles_lib as V
from vehicles_lib import Model
from veh_common import add_premium_wheels, clean_specs, livery_fn, poly_window

Y0 = 0.095
WR, WW, RIM = 0.143, 0.098, 0.090
WX, WZF, WZR = 0.276, 0.448, -0.428
CAB_DZ = -0.090  # greenhouse set back towards the rear
SILL = (0.115, 0.142)  # black rocker band
HULL_TOP = 0.362
ROOF = 0.572
YELLOW = 0xffc414


def make_atlas() -> V.Atlas:
    at = V.Atlas(512, seed=23)

    def plate(img, d, rng):
        d.rectangle([0, 0, 127, 55], fill=(0xf2, 0xf2, 0xea), outline=(0x20, 0x20, 0x20), width=3)
        d.rectangle([4, 4, 123, 16], fill=(0x1b, 0x7a, 0x3a))
        V.hand_text(d, rng, "LAGOS", (4, 3, 124, 17), (0xff, 0xff, 0xff), 13, jitter=0.0, tracking=3)
        V.hand_text(d, rng, "LND 207 TX", (4, 18, 124, 52), (0x10, 0x10, 0x14), 19, path=V.FONT_MONO, jitter=0.0)

    def tail(img, d, rng):
        d.rectangle([0, 0, 95, 39], fill=(0x40, 0x06, 0x08))
        d.rounded_rectangle([3, 3, 62, 36], 5, fill=(0xe2, 0x1c, 0x24))
        d.rounded_rectangle([65, 3, 92, 17], 3, fill=(0xff, 0x98, 0x18))
        d.rounded_rectangle([65, 20, 92, 36], 3, fill=(0xf2, 0xee, 0xe4))
        d.rectangle([8, 7, 44, 12], fill=(0xff, 0x78, 0x74))

    def amber(img, d, rng):
        d.rectangle([0, 0, 31, 31], fill=(0x50, 0x2a, 0x06))
        d.rounded_rectangle([2, 2, 29, 29], 6, fill=(0xff, 0xa8, 0x1c))
        d.rectangle([6, 6, 14, 12], fill=(0xff, 0xe0, 0x96))

    def sign_taxi(img, d, rng):
        d.rectangle([0, 0, 159, 47], fill=(0xfb, 0xf6, 0xe2))
        d.rectangle([0, 0, 159, 6], fill=(0x10, 0x10, 0x12))
        d.rectangle([0, 41, 159, 47], fill=(0x10, 0x10, 0x12))
        for i in range(8):
            d.rectangle([i * 20, 0, i * 20 + 9, 6], fill=(0xff, 0xc4, 0x14))
            d.rectangle([i * 20 + 10, 41, i * 20 + 19, 47], fill=(0xff, 0xc4, 0x14))
        V.hand_text(d, rng, "TAXI", (4, 6, 156, 41), (0x14, 0x14, 0x18), 34, jitter=0.0, tracking=6)

    def sign_side(img, d, rng):
        d.rectangle([0, 0, 83, 47], fill=(0xfb, 0xf6, 0xe2))
        d.rectangle([0, 0, 83, 6], fill=(0x10, 0x10, 0x12))
        d.rectangle([0, 41, 83, 47], fill=(0x10, 0x10, 0x12))
        V.hand_text(d, rng, "LAGride", (2, 7, 82, 41), (0x14, 0x14, 0x18), 18, jitter=0.0)

    def checker(img, d, rng):
        # two rows of black/white squares with thin black borders
        d.rectangle([0, 0, 511, 47], fill=(0x0c, 0x0c, 0x0e))
        sq = 21
        for row in range(2):
            for i in range(512 // sq + 1):
                if (i + row) % 2 == 0:
                    x0 = i * sq
                    d.rectangle([x0, 3 + row * sq, x0 + sq - 1, 3 + row * sq + sq - 1], fill=(0xf6, 0xf4, 0xee))

    def door_word(img, d, rng):
        d.rectangle([0, 0, 255, 63], fill=(0x0c, 0x0c, 0x0e))
        V.hand_text(d, rng, "LAGride", (4, 4, 252, 44), (0xff, 0xc4, 0x14), 34, jitter=0.0, tracking=2)
        V.hand_text(d, rng, "0800-TAXI-LAG", (4, 42, 252, 62), (0xf4, 0xf0, 0xe0), 15, path=V.FONT_MONO, jitter=0.0)

    at.cell("checker", 512, 48, checker)
    at.cell("door_word", 256, 64, door_word)
    at.cell("sign_taxi", 160, 48, sign_taxi)
    at.cell("sign_side", 84, 48, sign_side)
    at.cell("plate", 128, 56, plate)
    at.cell("tail", 96, 40, tail)
    at.cell("amber", 32, 32, amber)
    at.build()
    return at


def decal(proj, uc, vc, w, h, atlas, name, flip=False, off=0.0045, spacing=0.07, r=0.002, ref_fn=V.axis_ref):
    u0, v0, u1, v1 = atlas.rect(name)
    rect = (u1, v0, u0, v1) if flip else (u0, v0, u1, v1)
    return V.grid_patch(proj, uc, vc, w, h, r, spacing, off=off, uv_rect=rect, ref_fn=ref_fn)


def build():
    m = Model("veh_taxi")
    atlas = make_atlas()
    V.register_generator("decals_taxi", atlas.tex)

    # lower hull: bonnet + wings + doors + boot (the roof cap of this body is the bonnet/boot surface)
    hull = V.Body(
        [
            (Y0, 0.300, 0.612, 0.590, 3.6),
            (0.15, 0.322, 0.640, 0.612, 3.5),
            (0.27, 0.328, 0.650, 0.620, 3.4),
            (0.335, 0.325, 0.642, 0.612, 3.3),
            (HULL_TOP, 0.318, 0.625, 0.598, 3.2),
        ],
        ytop=HULL_TOP,
        roof_r=0.035,
        crown=0.009,
        roof_steps=5,
        extra_ys=[0.21],
        bottom_round=0.012,
    )
    shell = hull.build(sides=56, color_fn=livery_fn([(*SILL, 0x121214)], base=YELLOW, ao_y=(Y0, 0.24), dark=0.2, dust_y=0.15), seams=SILL, cap_rings=(0.86, 0.66, 0.42, 0.2))
    m.add(shell, "paint")

    # greenhouse: set back towards the rear, raked screen, sloping C-pillars, gentle tumblehome
    cabin = V.Body(
        [
            (0.350, 0.305, 0.345, 0.385, 3.4),
            (0.395, 0.300, 0.305, 0.350, 3.3),
            (0.52, 0.276, 0.170, 0.245, 3.1),
            (ROOF, 0.262, 0.100, 0.190, 3.0),
        ],
        ytop=ROOF,
        roof_r=0.04,
        crown=0.012,
        roof_steps=5,
        extra_ys=[0.52],
        bottom_round=0.004,
    )
    cab = cabin.build(sides=44, color_fn=livery_fn([], base=YELLOW, ao_y=(0.3, 0.31), dark=0.0, dust_y=0.0), cap_rings=(0.8, 0.5))
    cab_parts = [cab]

    glass, gasket, trim, chrome, steel, decals, lamps, deco = [], [], [], [], [], [], [], []

    def run(a, b, n):
        return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]

    def seam(proj, pts, w=0.0036, ref_fn=V.axis_ref):
        r = V.ribbon(proj, pts, w, off=0.0035, ref_fn=ref_fn)
        V.paint(r, 0x241a0c)
        trim.append(r)

    # ---- side windows: front door + rear door glass, black B-pillar, black window frames
    YL, YH = 0.396, 0.528
    m_edge = 0.040
    c_edge = 0.085  # wide body-colour C-pillar

    def front_edge(y):
        return cabin.params(y)[1] - m_edge

    def rear_edge(y):
        return -(cabin.params(y)[2] - c_edge)

    for sign in (+1, -1):
        proj = cabin.side(sign)
        w1 = [(front_edge(YL), YL), (front_edge(YH), YH), (0.022, YH), (0.022, YL)]
        w2 = [(-0.022, YL), (-0.022, YH), (rear_edge(YH), YH), (rear_edge(YL), YL)]
        for corners in (w1, w2):
            cc = np.array(corners, dtype=np.float64)
            cen = cc.mean(axis=0)
            ang = np.arctan2(cc[:, 1] - cen[1], cc[:, 0] - cen[0])
            cc = cc[np.argsort(ang)]
            poly = V.fillet_poly(cc, 0.022, 3, 0.07)
            poly_window(proj, poly, glass, gasket, rings=2, off_g=0.0058, pad=0.014, glass_col=(0.03, 0.06, 0.085), sky=(0.2, 0.27, 0.32))
        bp = V.ribbon(proj, run((0.0, YL - 0.01), (0.0, YH + 0.012), 4), 0.05, off=0.0050)
        V.paint(bp, 0x0e0e10)
        trim.append(bp)
        # chrome beltline strip under the glass
        bl = V.ribbon(proj, run((rear_edge(YL) - 0.02, YL - 0.018), (front_edge(YL) + 0.02, YL - 0.018), 10), 0.008, off=0.0040, height=0.003)
        V.paint(bl, 0xd2d4d8)
        chrome.append(bl)

    def screen(proj, y_lo, y_hi, mrg):
        a_lo, a_hi = cabin.params(y_lo)[0] - mrg, cabin.params(y_hi)[0] - mrg
        cc = np.array([(-a_lo, y_lo), (a_lo, y_lo), (a_hi, y_hi), (-a_hi, y_hi)])
        return V.fillet_poly(cc, 0.03, 3, 0.06)

    poly_window(cabin.front, screen(cabin.front, 0.376, 0.558, 0.045), glass, gasket, rings=3, off_g=0.0072, pad=0.014, glass_col=(0.03, 0.065, 0.09), sky=(0.24, 0.31, 0.36))
    poly_window(cabin.back, screen(cabin.back, 0.376, 0.556, 0.05), glass, gasket, rings=2, off_g=0.0072, pad=0.014, streaks=False)
    for sx in (-1, 1):
        wp = V.ribbon(cabin.front, [(sx * 0.02, 0.392), (sx * 0.12, 0.44), (sx * 0.21, 0.49)], 0.007, off=0.011)
        V.paint(wp, 0x0b0b0d)
        trim.append(wp)
    # everything built on the cabin so far moves back with it
    for lst in (glass, gasket, trim, chrome, cab_parts):
        for mesh in lst:
            mesh.v[:, 2] += CAB_DZ
    m.add(cab_parts, "paint")
    m.add(glass, "glass")
    trim += gasket

    # ---- doors: seams, handles, chequered band, door lettering, mirrors
    for sign in (+1, -1):
        proj = hull.side(sign)
        for zz in (0.225, -0.085, -0.25):
            seam(proj, run((zz, 0.15), (zz, 0.352), 5))
        for zz in (0.02, -0.14):
            h = V.bevel_box((sign * 0.331, 0.322, zz), (0.014, 0.020, 0.058), bevel=0.006)
            V.paint(h, 0xd2d4d8)
            chrome.append(h)
        decals.append(decal(proj, -0.01, 0.331, 0.92, 0.030, atlas, "checker", flip=(sign > 0), off=0.0042, spacing=0.06, r=0.001))
        decals.append(decal(proj, -0.02, 0.228, 0.20, 0.05, atlas, "door_word", flip=(sign > 0), off=0.0042, spacing=0.06, r=0.001))
        arm = V.tube_poly([(sign * 0.296, 0.418, 0.15), (sign * 0.322, 0.430, 0.14)], 0.006, 5)
        V.paint(arm, 0x15151a)
        trim.append(arm)
        mir = V.bevel_box((sign * 0.334, 0.434, 0.135), (0.030, 0.046, 0.062), bevel=0.012)
        V.paint(mir, 0x121214)
        trim.append(mir)
        mf = V.bevel_box((sign * 0.334, 0.434, 0.103), (0.024, 0.038, 0.004), bevel=0.002)
        V.paint(mf, 0xcdd5da)
        chrome.append(mf)

    # ---- shoulder crease, bonnet / boot shut lines, bonnet ribs
    def top_proj(x, z):
        return np.array([x, hull.roof_y(x, z), z])

    below = lambda c: c - np.array([0.0, 1.0, 0.0])
    for sign in (+1, -1):
        proj = hull.side(sign)
        cr = V.ribbon(proj, run((-0.52, 0.350), (0.56, 0.350), 10), 0.012, off=0.0, height=0.005)
        V.paint(cr, YELLOW)
        deco.append(cr)
    hood = [(0.20, 0.585), (0.20, 0.26), (-0.20, 0.26), (-0.20, 0.585)]
    seam(top_proj, hood, 0.0034, below)
    trunk = [(0.20, -0.575), (0.20, -0.485), (-0.20, -0.485), (-0.20, -0.575)]
    seam(top_proj, trunk, 0.0034, below)
    for xr in (-0.09, 0.09):
        rb = V.ribbon(top_proj, [(xr, 0.56 - 0.26 * i / 4) for i in range(5)], 0.03, off=0.0, height=0.004, ref_fn=below)
        V.paint(rb, YELLOW)
        deco.append(rb)

    # ---- wheel arches
    for sign in (+1, -1):
        proj = hull.side(sign)
        for zc in (WZF, WZR):
            RA = WR + 0.036
            phi0 = np.arcsin((Y0 + 0.003 - WR) / RA)
            arc = [(zc + RA * np.cos(p), WR + RA * np.sin(p)) for p in np.linspace(phi0, np.pi - phi0, 14)]
            chord = [(arc[-1][0] + (arc[0][0] - arc[-1][0]) * k / 4, Y0 + 0.003) for k in range(1, 4)]
            well = V.patch(proj, np.array(arc + chord), (zc, 0.17), rings=2, off=0.0045)
            V.paint(well, 0x070708)
            trim.append(well)
            lip = V.ribbon(proj, [(zc + (u - zc) * 1.03, WR + (v - WR) * 1.03) for u, v in arc], 0.016, off=0.002, height=0.008)
            V.paint(lip, YELLOW)
            lip.c[:, :3] *= 0.85
            deco.append(lip)

    # ---- bumpers (body-colour wrap with a black rub strip and chrome blade)
    for zc, sgn in ((0.635, 1), (-0.612, -1)):
        bar = V.bevel_box((0, 0.165, zc), (0.66, 0.072, 0.05), bevel=0.024, seg=1)
        V.paint(bar, 0x17171a)
        trim.append(bar)
        blade = V.bevel_box((0, 0.183, zc + sgn * 0.022), (0.52, 0.018, 0.012), bevel=0.005)
        V.paint(blade, 0xd2d4d8)
        chrome.append(blade)
        for sx in (-1, 1):
            e = V.bevel_box((sx * 0.31, 0.165, zc - sgn * 0.04), (0.04, 0.072, 0.10), bevel=0.016)
            V.paint(e, 0x17171a)
            trim.append(e)

    # ---- front: chrome-framed grille, wide head lamps, indicators, plate
    gp = V.grid_patch(hull.front, 0.0, 0.262, 0.26, 0.065, 0.014, 0.05, off=0.0042)
    V.paint(gp, 0x050506)
    trim.append(gp)
    gf = V.frame_strip(hull.front, 0.0, 0.262, 0.26, 0.065, 0.014, 0.011, 0.05, off=0.0055)
    V.paint(gf, 0xd2d4d8)
    chrome.append(gf)
    for yy in (0.248, 0.262, 0.276):
        sl = V.ribbon(hull.front, [(-0.12 + 0.24 * i / 6, yy) for i in range(7)], 0.006, off=0.0072, height=0.004)
        V.paint(sl, 0xd2d4d8)
        chrome.append(sl)
    for sx in (-1, 1):
        zc = hull.front(sx * 0.232, 0.275)[2]
        bez = V.bevel_box((sx * 0.232, 0.275, zc - 0.004), (0.118, 0.058, 0.026), bevel=0.016)
        V.paint(bez, 0xd8dade)
        chrome.append(bez)
        lens = V.bevel_box((sx * 0.232, 0.275, zc + 0.004), (0.100, 0.044, 0.018), bevel=0.013)
        V.paint(lens, 0xfff4d8)
        lamps.append(lens)
        decals.append(decal(hull.front, sx * 0.25, 0.215, 0.05, 0.03, atlas, "amber", off=0.0055))
        decals.append(decal(hull.back, sx * 0.225, 0.29, 0.11, 0.046, atlas, "tail", flip=True, off=0.0055, spacing=0.05))
    decals.append(decal(hull.front, 0.0, 0.165, 0.14, 0.0612, atlas, "plate", off=0.032))
    decals.append(decal(hull.back, 0.0, 0.232, 0.14, 0.0612, atlas, "plate", flip=True, off=0.0055))

    # ---- roof sign: lit box on a black base, TAXI front/back, LAGride on the sides
    ry = cabin.roof_y(0, -0.02)
    sz = -0.02 + CAB_DZ
    base = V.bevel_box((0, ry + 0.008, sz), (0.14, 0.016, 0.06), bevel=0.006)
    V.paint(base, 0x141416)
    trim.append(base)
    sign_box = V.bevel_box((0, ry + 0.046, sz), (0.22, 0.060, 0.092), bevel=0.014, seg=1)
    V.paint(sign_box, 0xfbf6e2)
    lamps.append(sign_box)
    for sgn in (1, -1):
        u0, v0, u1, v1 = atlas.rect("sign_taxi")
        decals.append(V.quad((0, ry + 0.046, sz + sgn * 0.0468), (sgn * 1.0, 0, 0), (0, 1, 0), 0.208, 0.0565, (u0, v0, u1, v1)))
        u0, v0, u1, v1 = atlas.rect("sign_side")
        decals.append(V.quad((sgn * 0.1115, ry + 0.046, sz), (0, 0, -sgn), (0, 1, 0), 0.080, 0.0565, (u0, v0, u1, v1)))

    # antenna, underbody, axles, exhaust
    ant = V.tube_poly([(0.21, 0.365, -0.52), (0.225, 0.49, -0.565)], 0.0035, 4)
    V.paint(ant, 0x111111)
    trim.append(ant)
    ch = V.bevel_box((0, 0.088, 0.0), (0.48, 0.05, 1.12), bevel=0.01)
    V.paint(ch, 0x131214)
    trim.append(ch)
    for z in (WZF, WZR):
        ax = V.cylinder((0, WR, z), 0.016, 0.48, sides=8, axis="x")
        V.paint(ax, 0x262628)
        steel.append(ax)
    ex = V.tube_poly([(-0.17, 0.09, -0.45), (-0.17, 0.09, -0.63), (-0.17, 0.10, -0.655)], 0.017, 8)
    V.paint(ex, 0x5a595e)
    steel.append(ex)

    m.add(deco, "paint")
    m.add(trim, "trim")
    m.add(chrome, "chrome")
    m.add(steel, "steel")
    m.add(decals, "decal")
    m.add(lamps, "lamp")
    add_premium_wheels(m, WR, WW, RIM, [("wheel_FL", WX, WR, WZF, 1), ("wheel_FR", -WX, WR, WZF, -1), ("wheel_RL", WX, WR, WZR, 1), ("wheel_RR", -WX, WR, WZR, -1)], rim_colour=0xd5d7dc)
    V.scale_model(m, 0.985)
    return m, clean_specs(decal_tex="decals_taxi")
