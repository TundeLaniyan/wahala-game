"""The Lagos Danfo (v4): clean, glossy yellow minibus in the stylised Gemini direction.

Short sloped semi-bonnet flowing into a raked windscreen, rounded roof, a continuous dark glasshouse band,
bold black side stripe with white pinstripes, chrome grille and round head lamps, deep dished wheels and
a light roof rack. Original design; no real brand."""
from __future__ import annotations

import numpy as np

import vehicles_lib as V
from vehicles_lib import Model, place
from veh_common import add_premium_wheels, clean_specs, livery_fn, poly_window

# ----------------------------------------------------------------------------- dimensions
Y0 = 0.15  # underside of the body shell
WR, WW, RIM = 0.178, 0.118, 0.106  # wheel radius / tyre width / rim radius
WX = 0.335  # tyre centre x
WZ = 0.50  # axle z (front +, rear -)
YTOP = 0.965
YELLOW = 0xffbe0f
BLACK = 0x0d0d0f
WHITE = 0xf3efe2
# livery bands (y ranges); every edge is also a body seam
PIN_LO = (0.300, 0.313)
STRIPE = (0.313, 0.420)
PIN_HI = (0.420, 0.433)
GLASS_BAND = (0.585, 0.900)
BANDS = [(*PIN_LO, WHITE), (*STRIPE, BLACK), (*PIN_HI, WHITE), (*GLASS_BAND, 0x121316)]
SEAMS = [PIN_LO[0], STRIPE[0], STRIPE[1], PIN_HI[1], GLASS_BAND[0], GLASS_BAND[1]]


def make_atlas() -> V.Atlas:
    at = V.Atlas(512, seed=17)

    def dest(img, d, rng):
        d.rectangle([0, 0, 255, 63], fill=(0xf4, 0xef, 0xd8))
        d.rectangle([0, 0, 255, 63], outline=(0x2a, 0x2a, 0x2a), width=3)
        V.hand_text(d, rng, "OSHODI", (6, 2, 170, 62), (0x16, 0x16, 0x1c), 36, jitter=0.6)
        d.polygon([(176, 32), (198, 12), (198, 23), (248, 23), (248, 41), (198, 41), (198, 52)], fill=(0xd0, 0x1c, 0x1c))

    def plate(img, d, rng):
        d.rectangle([0, 0, 127, 55], fill=(0xf2, 0xf2, 0xea), outline=(0x20, 0x20, 0x20), width=3)
        d.rectangle([4, 4, 123, 16], fill=(0x1b, 0x7a, 0x3a))
        V.hand_text(d, rng, "LAGOS", (4, 3, 124, 17), (0xff, 0xff, 0xff), 13, jitter=0.0, tracking=3)
        V.hand_text(d, rng, "KJA 482 DK", (4, 18, 124, 52), (0x10, 0x10, 0x14), 19, path=V.FONT_MONO, jitter=0.0)

    def side_stripe(img, d, rng):
        d.rectangle([0, 0, 383, 39], fill=(0x0d, 0x0d, 0x0f))
        V.hand_text(d, rng, "GOD'S TIME IS THE BEST", (4, 3, 380, 37), (0xff, 0xc4, 0x1c), 27, jitter=0.4, tracking=1)

    def rear_stripe(img, d, rng):
        d.rectangle([0, 0, 255, 35], fill=(0x0d, 0x0d, 0x0f))
        V.hand_text(d, rng, "NO CONDITION IS PERMANENT", (4, 3, 252, 33), (0xf2, 0xea, 0xd0), 13, jitter=0.4, tracking=0)

    def tail(img, d, rng):
        d.rectangle([0, 0, 47, 95], fill=(0x40, 0x06, 0x08))
        d.rounded_rectangle([3, 3, 44, 46], 6, fill=(0xe2, 0x1c, 0x24))
        d.rounded_rectangle([3, 50, 44, 68], 4, fill=(0xff, 0x98, 0x18))
        d.rounded_rectangle([3, 72, 44, 92], 4, fill=(0xf2, 0xee, 0xe4))
        d.rectangle([9, 8, 15, 40], fill=(0xff, 0x78, 0x74))

    def amber(img, d, rng):
        d.rectangle([0, 0, 31, 31], fill=(0x50, 0x2a, 0x06))
        d.rounded_rectangle([2, 2, 29, 29], 6, fill=(0xff, 0xa8, 0x1c))
        d.rectangle([6, 6, 14, 12], fill=(0xff, 0xe0, 0x96))

    def badge(img, d, rng):
        d.rectangle([0, 0, 127, 31], fill=(0x0d, 0x0d, 0x0f))
        V.hand_text(d, rng, "DANFO", (2, 1, 126, 31), (0xff, 0xc4, 0x1c), 24, jitter=0.0, tracking=4)

    at.cell("side_stripe", 384, 40, side_stripe)
    at.cell("dest", 256, 64, dest)
    at.cell("rear_stripe", 256, 36, rear_stripe)
    at.cell("plate", 128, 56, plate)
    at.cell("tail", 48, 96, tail)
    at.cell("amber", 32, 32, amber)
    at.cell("badge", 128, 32, badge)
    at.build()
    return at


def decal(proj, uc, vc, w, h, atlas, name, flip=False, off=0.0045, spacing=0.07, r=0.003):
    u0, v0, u1, v1 = atlas.rect(name)
    rect = (u1, v0, u0, v1) if flip else (u0, v0, u1, v1)
    return V.grid_patch(proj, uc, vc, w, h, r, spacing, off=off, uv_rect=rect)


def body_shell() -> V.Body:
    return V.Body(
        [
            (Y0, 0.368, 0.742, 0.762, 6.0),
            (0.24, 0.379, 0.778, 0.768, 5.6),
            (0.36, 0.382, 0.795, 0.770, 5.2),  # T2-style rounded nose: fullest at the lamps
            (0.44, 0.382, 0.790, 0.770, 5.2),
            (0.49, 0.382, 0.770, 0.770, 5.2),
            (0.53, 0.381, 0.738, 0.770, 5.2),
            (0.585, 0.379, 0.690, 0.768, 5.0),  # windscreen base
            (0.90, 0.362, 0.535, 0.752, 4.6),  # raked windscreen top
            (YTOP, 0.352, 0.505, 0.738, 4.6),
        ],
        ytop=YTOP,
        roof_r=0.065,
        crown=0.014,
        roof_steps=6,
        extra_ys=[0.51, 0.56, 0.74, 0.30],
        bottom_round=0.014,
    )


def build():
    m = Model("veh_danfo")
    atlas = make_atlas()
    V.register_generator("decals_danfo", atlas.tex)

    body = body_shell()
    shell = body.build(sides=46, color_fn=livery_fn(BANDS, base=YELLOW, ao_y=(Y0, 0.30), dark=0.20), seams=SEAMS, cap_rings=(0.82, 0.55, 0.3))
    m.add(shell, "paint")

    glass, gasket, trim, chrome, steel, decals, lamps, deco = [], [], [], [], [], [], [], []

    def run(a, b, n):
        return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]

    def seam(proj, pts, w=0.0042, col=0x241a0c):
        r = V.ribbon(proj, pts, w, off=0.0035)
        V.paint(r, col)
        trim.append(r)

    # ---- glasshouse: one long side window per side (raked front edge), black pillars over it
    WY0, WY1 = 0.612, 0.872

    def zf_at(y):
        return body.params(y)[1]

    for sign in (+1, -1):
        proj = body.side(sign)
        front = [(zf_at(WY0) - 0.115, WY0), (zf_at(WY1) - 0.10, WY1)]
        corners = np.array([(-0.635, WY0), front[0], front[1], (-0.625, WY1)])
        cen = corners.mean(axis=0)
        ang = np.arctan2(corners[:, 1] - cen[1], corners[:, 0] - cen[0])
        corners = corners[np.argsort(ang)]
        poly = V.fillet_poly(corners, 0.035, 4, 0.06)
        poly_window(proj, poly, glass, gasket, rings=2, off_g=0.0055, pad=0.012, glass_col=(0.03, 0.06, 0.085), sky=(0.20, 0.27, 0.32))
        # B/C/D pillars (body-colour black band shows through as frame)
        for zc in (0.215, -0.115, -0.40):
            pil = V.ribbon(proj, run((zc, WY0 - 0.006), (zc - 0.012, WY1 + 0.006), 6), 0.034, off=0.0078)
            V.paint(pil, 0x0b0b0c)
            trim.append(pil)
        # sliding-window rails across the passenger windows
        rail = V.ribbon(proj, run((-0.625, 0.745), (0.20, 0.745), 10), 0.009, off=0.0082)
        V.paint(rail, 0x0b0b0c)
        trim.append(rail)

    # windscreen (raked front surface) and rear window
    def screen(proj_params_a, y_lo, y_hi, mrg_lo, mrg_hi, r=0.045):
        a_lo, a_hi = body.params(y_lo)[0] - mrg_lo, body.params(y_hi)[0] - mrg_hi
        cc = np.array([(-a_lo, y_lo), (a_lo, y_lo), (a_hi, y_hi), (-a_hi, y_hi)])
        return V.fillet_poly(cc, r, 4, 0.055)

    poly_window(body.front, screen(None, 0.605, 0.885, 0.06, 0.075), glass, gasket, rings=3, off_g=0.0068, pad=0.013, glass_col=(0.03, 0.065, 0.09), sky=(0.24, 0.31, 0.36))
    poly_window(body.back, screen(None, 0.62, 0.87, 0.08, 0.085), glass, gasket, rings=2, off_g=0.0068, pad=0.012, streaks=False)
    m.add(glass, "glass")
    trim += gasket

    # destination board behind the windscreen top + wipers
    decals.append(decal(body.front, 0.0, 0.845, 0.30, 0.075, atlas, "dest", off=0.0105, spacing=0.06, r=0.002))
    for sx in (-1, 1):
        wp = V.ribbon(body.front, [(sx * 0.03, 0.618), (sx * 0.15, 0.665), (sx * 0.27, 0.71)], 0.008, off=0.011)
        V.paint(wp, 0x0b0b0d)
        trim.append(wp)

    # ---- door seams, handles (below the glass band, on the yellow)
    for sign in (+1, -1):
        proj = body.side(sign)
        seam(proj, run((0.275, 0.18), (0.275, 0.585), 8))
        seam(proj, run((0.64, 0.585), (0.68, 0.24), 6))
        h = V.bevel_box((sign * 0.384, 0.50, 0.31), (0.016, 0.026, 0.075), bevel=0.007)
        V.paint(h, 0xc9cbd0)
        chrome.append(h)
    projR = body.side(-1)
    seam(projR, run((-0.12, 0.18), (-0.12, 0.585), 8))
    rail = V.ribbon(projR, run((-0.42, 0.53), (0.26, 0.53), 10), 0.010, off=0.0025, height=0.005)
    V.paint(rail, 0x15110c)
    trim.append(rail)
    h2 = V.bevel_box((-0.385, 0.50, -0.09), (0.016, 0.026, 0.075), bevel=0.007)
    V.paint(h2, 0xc9cbd0)
    chrome.append(h2)
    projL = body.side(+1)
    seam(projL, run((-0.12, 0.18), (-0.12, 0.585), 8), 0.0036)
    cap = V.cylinder((0.385, 0.50, -0.46), 0.024, 0.01, sides=12, axis="x")
    V.paint(cap, 0xb9bbc0)
    chrome.append(cap)

    # stripe lettering + rear lettering
    for sign in (+1, -1):
        proj = body.side(sign)
        decals.append(decal(proj, 0.01, 0.3665, 0.45, 0.047, atlas, "side_stripe", flip=(sign > 0), off=0.0042, spacing=0.07, r=0.001))
    decals.append(decal(body.back, 0.0, 0.3665, 0.44, 0.062, atlas, "rear_stripe", flip=True, off=0.0042, r=0.001))

    # ---- wheel arches: dark wells + flared black lips
    RA = WR + 0.05
    phi0 = np.arcsin((Y0 + 0.003 - WR) / RA)
    arc = [(RA * np.cos(p), WR + RA * np.sin(p)) for p in np.linspace(phi0, np.pi - phi0, 14)]
    for sign in (+1, -1):
        proj = body.side(sign)
        for zc in (WZ, -WZ):
            poly = [(zc + dx, y) for dx, y in arc]
            chord = [(poly[-1][0] + (poly[0][0] - poly[-1][0]) * k / 4, Y0 + 0.003) for k in range(1, 4)]
            well = V.patch(proj, np.array(poly + chord), (zc, 0.24), rings=2, off=0.0032)
            V.paint(well, 0x070708)
            trim.append(well)
            lip = V.ribbon(proj, [(zc + dx * 1.03, WR + (y - WR) * 1.03) for dx, y in arc], 0.026, off=0.002, height=0.013)
            V.paint(lip, 0x141416)
            trim.append(lip)

    # ---- bumpers (wrap-around chrome with a black rubber rub strip and corner caps)
    def bumper(zc, sgn):
        bar = V.bevel_box((0, 0.20, zc), (0.80, 0.07, 0.055), bevel=0.024, seg=1)
        V.paint(bar, 0xd2d4d8)
        chrome.append(bar)
        rub = V.bevel_box((0, 0.20, zc + sgn * 0.026), (0.66, 0.026, 0.012), bevel=0.005)
        V.paint(rub, 0x141416)
        trim.append(rub)
        for sx in (-1, 1):
            endc = V.bevel_box((sx * 0.386, 0.20, zc - sgn * 0.05), (0.036, 0.07, 0.12), bevel=0.016)
            V.paint(endc, 0xc7c9ce)
            chrome.append(endc)
        sk = V.bevel_box((0, 0.145, zc - sgn * 0.012), (0.62, 0.05, 0.045), bevel=0.014)
        V.paint(sk, 0x18181a)
        trim.append(sk)

    bumper(0.812, 1)
    bumper(-0.792, -1)

    # ---- front: chrome-slat grille in the black stripe, round head lamps, indicators, plate, badge
    gp = V.grid_patch(body.front, 0.0, 0.367, 0.34, 0.092, 0.016, 0.05, off=0.0045)
    V.paint(gp, 0x050506)
    trim.append(gp)
    gframe = V.frame_strip(body.front, 0.0, 0.367, 0.34, 0.092, 0.016, 0.012, 0.05, off=0.0058)
    V.paint(gframe, 0xd2d4d8)
    chrome.append(gframe)
    for yy in (0.343, 0.367, 0.391):
        sl = V.ribbon(body.front, [(-0.16 + 0.32 * i / 8, yy) for i in range(9)], 0.010, off=0.008, height=0.006)
        V.paint(sl, 0xd2d4d8)
        chrome.append(sl)
    for sx in (-1, 1):
        x = sx * 0.268
        zc = body.front(x, 0.367)[2]
        ring = V.cylinder((x, 0.367, zc + 0.008), 0.064, 0.022, sides=14, axis="z", bevel=0.006)
        V.paint(ring, 0xd8dade)
        chrome.append(ring)
        lens = V.lathe([(0.0, 0.0), (0.052, 0.0), (0.054, 0.006), (0.046, 0.019), (0.026, 0.026), (0.0, 0.028)], 14)
        lens = place(lens, (x, 0.367, zc + 0.016), (90, 0, 0))
        V.paint(lens, 0xfff4d8)
        lamps.append(lens)
        decals.append(decal(body.front, sx * 0.272, 0.268, 0.062, 0.04, atlas, "amber", off=0.005))
    decals.append(decal(body.front, 0.0, 0.272, 0.17, 0.0743, atlas, "plate", off=0.03))
    # bonnet shut line + vents on the sloped nose
    def nose(x, t):
        y = 0.49 + 0.09 * t
        return body.front(x, y)

    seam(nose, run((-0.30, 0.25), (0.30, 0.25), 10), 0.0035)

    # ---- rear: tail lamps, plate, ladder
    for sx in (-1, 1):
        decals.append(decal(body.back, sx * 0.322, 0.53, 0.05, 0.10, atlas, "tail", flip=True, off=0.0055))
    decals.append(decal(body.back, 0.0, 0.272, 0.17, 0.0743, atlas, "plate", flip=True, off=0.03))
    seam(body.back, run((-0.27, 0.18), (-0.27, 0.58), 6))
    seam(body.back, run((0.27, 0.18), (0.27, 0.58), 6))
    hb = V.bevel_box((0.0, 0.50, -body.params(0.5)[2] - 0.004), (0.10, 0.022, 0.016), bevel=0.007)
    V.paint(hb, 0xc9cbd0)
    chrome.append(hb)

    # mirrors on stalks from the A-pillar
    for sx in (-1, 1):
        arm = V.tube_poly([(sx * 0.36, 0.63, 0.61), (sx * 0.39, 0.665, 0.64), (sx * 0.405, 0.70, 0.635)], 0.008, 5)
        V.paint(arm, 0x18181a)
        trim.append(arm)
        mir = V.bevel_box((sx * 0.41, 0.735, 0.635), (0.044, 0.11, 0.026), bevel=0.012, seg=1)
        V.paint(mir, 0x121214)
        trim.append(mir)
        face = V.bevel_box((sx * 0.41, 0.735, 0.623), (0.034, 0.094, 0.006), bevel=0.003)
        V.paint(face, 0xcdd5da)
        chrome.append(face)

    # mud flaps, exhaust, chassis, axles
    for sx in (-1, 1):
        fl = V.bevel_box((sx * 0.33, 0.11, -WZ - 0.15), (0.11, 0.13, 0.01), bevel=0.004)
        V.paint(fl, 0x131315)
        trim.append(fl)
    ex = V.tube_poly([(-0.22, 0.12, -0.55), (-0.22, 0.12, -0.80), (-0.22, 0.135, -0.84)], 0.022, 8)
    V.paint(ex, 0x55545a)
    steel.append(ex)
    ch = V.bevel_box((0, 0.11, 0.0), (0.66, 0.07, 1.30), bevel=0.012)
    V.paint(ch, 0x121214)
    trim.append(ch)
    for z in (WZ, -WZ):
        ax = V.cylinder((0, WR, z), 0.022, 0.60, sides=8, axis="x")
        V.paint(ax, 0x262628)
        steel.append(ax)

    # ---- roof: pressed ribs, gutter beads, a light rack with a few bundles
    def roof_proj(x, z):
        return np.array([x, body.roof_y(x, z), z])

    below = lambda c: c - np.array([0.0, 1.0, 0.0])
    for xr in (-0.19, -0.065, 0.065, 0.19):
        rb = V.ribbon(roof_proj, [(xr, -0.62 + 1.04 * i / 10) for i in range(11)], 0.036, off=0.0, height=0.005, ref_fn=below)
        V.paint(rb, YELLOW)
        rb.c[:, :3] *= 0.96
        deco.append(rb)
    for sign in (+1, -1):
        proj = body.side(sign)
        gut = V.ribbon(proj, run((-0.70, 0.918), (0.48, 0.918), 12), 0.012, off=0.0, height=0.007)
        V.paint(gut, YELLOW)
        deco.append(gut)

    YR = 1.025
    rack_col = 0x2c2e33
    rx, z0, z1 = 0.29, -0.60, 0.30

    def rod(p0, p1, r=0.0085, sides=6):
        t = V.strut(p0, p1, r, sides, caps=False)
        V.paint(t, rack_col)
        steel.append(t)

    for sx in (-1, 1):
        rod((sx * rx, YR, z0), (sx * rx, YR, z1))
        for zz in (z0, -0.15, z1):
            rod((sx * rx, body.roof_y(sx * rx, zz) - 0.004, zz), (sx * rx, YR, zz), 0.010)
    for zz in np.linspace(z0, z1, 5):
        rod((-rx, YR, zz), (rx, YR, zz), 0.0075)

    def bundle(c, r, col, seed):
        b = V.blob(c, r, 5, 10, seed=seed, bumpy=0.07)
        V.paint(b, col)
        V.finish(b, ao=0.25, ao_h=(c[1] - r[1], c[1] + r[1]))
        trim.append(b)

    bundle((0.10, 1.065, -0.42), (0.16, 0.058, 0.11), 0xe4dcc6, 1)
    bundle((-0.12, 1.06, -0.40), (0.13, 0.052, 0.10), 0x2f62a8, 2)
    bag = V.bevel_box((0.02, 1.07, -0.08), (0.36, 0.085, 0.20), bevel=0.035, seg=1)
    V.paint(bag, 0xc23a2e)
    trim.append(bag)
    for zz in (-0.13, -0.03):
        band = V.bevel_box((0.02, 1.07, zz), (0.366, 0.09, 0.014), bevel=0.004, seg=1)
        V.paint(band, 0x2a2018)
        trim.append(band)
    jug = V.bevel_box((-0.16, 1.075, 0.18), (0.08, 0.09, 0.13), bevel=0.022, seg=1)
    V.paint(jug, 0x2f9a58)
    trim.append(jug)

    m.add(deco, "paint")
    m.add(trim, "trim")
    m.add(chrome, "chrome")
    m.add(steel, "steel")
    m.add(decals, "decal")
    m.add(lamps, "lamp")
    add_premium_wheels(m, WR, WW, RIM, [("wheel_FL", WX, WR, WZ, 1), ("wheel_FR", -WX, WR, WZ, -1), ("wheel_RL", WX, WR, -WZ, 1), ("wheel_RR", -WX, WR, -WZ, -1)], rim_colour=0xd5d7dc)
    V.scale_model(m, 0.95)
    return m, clean_specs(decal_tex="decals_danfo")
