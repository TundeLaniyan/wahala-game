"""The Lagos Danfo: yellow high-roof minibus with a black stripe, roof rack and luggage (hero vehicle)."""
from __future__ import annotations

import numpy as np
from PIL import ImageDraw

from vehicles_lib import *  # noqa: F401,F403
import vehicles_lib as V
from veh_common import Wheels, add_wheel_set, std_specs, window_set, headlamp_pair, rust_color_fn  # noqa: F401

# ----------------------------------------------------------------------------- dimensions
Y0 = 0.14  # underside of the body shell
WR, WW = 0.165, 0.11  # wheel radius / tyre width
WX = 0.345  # tyre centre x
WZ = 0.47  # axle z (front +, rear -)
STRIPE = (0.295, 0.405)
YTOP = 0.925


def make_atlas() -> V.Atlas:
    at = V.Atlas(512, seed=17)

    def dest(img, d, rng):
        d.rectangle([0, 0, 255, 63], fill=(0x12, 0x13, 0x16))
        d.rectangle([2, 2, 253, 61], outline=(0xf6, 0xc4, 0x1c), width=3)
        V.hand_text(d, rng, "OJUELEGBA - OSHODI", (8, 8, 248, 56), (0xf6, 0xc4, 0x1c), 26, jitter=0.5, tracking=1)

    def plate(img, d, rng):
        d.rectangle([0, 0, 127, 55], fill=(0xf6, 0xc4, 0x1c), outline=(0x16, 0x16, 0x1a), width=3)
        d.rectangle([4, 4, 123, 16], fill=(0x16, 0x7a, 0x3a))
        V.hand_text(d, rng, "LAGOS", (4, 3, 124, 17), (0xff, 0xff, 0xff), 13, jitter=0.0, tracking=3)
        V.hand_text(d, rng, "LA 419-WAH", (4, 18, 124, 52), (0x10, 0x10, 0x14), 19, path=V.FONT_MONO, jitter=0.0)

    def side_stripe(img, d, rng):
        d.rectangle([0, 0, 511, 35], fill=(0x08, 0x08, 0x0a))
        d.rectangle([0, 2, 511, 5], fill=(0xf6, 0xc4, 0x1c))
        d.rectangle([0, 30, 511, 33], fill=(0xf6, 0xc4, 0x1c))
        V.hand_text(d, rng, "WAHALA!   *   OJUELEGBA - OSHODI", (10, 5, 502, 31), (0xf6, 0xc4, 0x1c), 24, jitter=0.4, tracking=2)

    def rear_stripe(img, d, rng):
        d.rectangle([0, 0, 255, 35], fill=(0x08, 0x08, 0x0a))
        d.rectangle([0, 2, 255, 4], fill=(0xf6, 0xc4, 0x1c))
        d.rectangle([0, 31, 255, 33], fill=(0xf6, 0xc4, 0x1c))
        V.hand_text(d, rng, "EKO ONI BAAJE  *  WAHALA!", (6, 4, 250, 32), (0xf6, 0xc4, 0x1c), 16, jitter=0.4, tracking=1)

    def tail(img, d, rng):
        d.rectangle([0, 0, 47, 95], fill=(0x8a, 0x10, 0x14))
        d.rectangle([4, 4, 43, 40], fill=(0xd8, 0x1f, 0x26))
        d.rectangle([4, 44, 43, 62], fill=(0xff, 0x9a, 0x1c))
        d.rectangle([4, 66, 43, 90], fill=(0xe9, 0xe4, 0xd8))
        d.rectangle([8, 8, 14, 36], fill=(0xff, 0x6a, 0x66))

    def amber(img, d, rng):
        d.rectangle([0, 0, 31, 31], fill=(0xff, 0xa4, 0x1c))
        d.rectangle([3, 3, 14, 12], fill=(0xff, 0xdd, 0x8a))

    at.cell("side_stripe", 512, 36, side_stripe)
    at.cell("dest", 256, 64, dest)
    at.cell("rear_stripe", 256, 36, rear_stripe)
    at.cell("plate", 128, 56, plate)
    at.cell("tail", 48, 96, tail)
    at.cell("amber", 32, 32, amber)
    at.build()
    return at


def decal(proj, uc, vc, w, h, atlas, name, flip=False, off=0.0032, spacing=0.07, r=0.003):
    u0, v0, u1, v1 = atlas.rect(name)
    rect = (u1, v0, u0, v1) if flip else (u0, v0, u1, v1)
    return V.grid_patch(proj, uc, vc, w, h, r, spacing, off=off, uv_rect=rect)


def dent(mesh, cx, cy, cz, sigma, depth, scuff=0.35):
    """Push side-panel vertices inwards around a point and scuff the paint there."""
    d2 = (mesh.v[:, 0] - cx) ** 2 + (mesh.v[:, 1] - cy) ** 2 + (mesh.v[:, 2] - cz) ** 2
    k = np.exp(-d2 / (2 * sigma**2))
    sign = np.sign(cx)
    mesh.v[:, 0] -= sign * depth * k
    mesh.c[:, :3] *= (1 - scuff * k)[:, None]


def build():
    m = Model("veh_danfo")
    atlas = make_atlas()
    V.register_generator("decals_danfo", atlas.tex)

    body = V.Body(
        [
            (Y0, 0.374, 0.752, 0.752, 8.0),
            (0.30, 0.378, 0.757, 0.757, 8.0),
            (0.52, 0.381, 0.758, 0.758, 7.5),
            (0.56, 0.381, 0.752, 0.758, 7.5),
            (0.86, 0.372, 0.640, 0.752, 7.0),
            (YTOP, 0.366, 0.628, 0.746, 6.5),
        ],
        ytop=YTOP,
        roof_r=0.05,
        crown=0.010,
        extra_ys=[0.40, 0.50, 0.75],
        bottom_round=0.01,
    )
    axle_pts = [(WX, WR, WZ), (WX, WR, -WZ), (-WX, WR, WZ), (-WX, WR, -WZ)]
    color_fn = rust_color_fn(body, axle_pts, seed=3, stripe=STRIPE)
    shell = body.build(sides=60, color_fn=color_fn, seams=STRIPE)
    # dented / scuffed panels
    dent(shell, 0.383, 0.22, -0.36, 0.07, 0.014)
    dent(shell, -0.383, 0.26, 0.60, 0.06, 0.016, 0.5)
    dent(shell, -0.37, 0.58, -0.62, 0.08, 0.010)
    m.add(shell, "paint")

    # ---- glass, gaskets, sliding-window rails
    glass_meshes, gasket_meshes, frame_meshes = [], [], []
    WY, WH = 0.655, 0.30
    wins = [(0.45, 0.31), (0.085, 0.31), (-0.28, 0.30), (-0.58, 0.20)]
    for sign in (+1, -1):
        proj = body.side(sign)
        for zc, w in wins:
            window_set(proj, zc, WY, w, WH, 0.04, glass_meshes, gasket_meshes, frame_meshes, spacing=0.06)
    window_set(body.front, 0.0, 0.685, 0.62, 0.27, 0.05, glass_meshes, gasket_meshes, frame_meshes, spacing=0.055, mullion=False)
    window_set(body.back, 0.0, WY, 0.44, WH, 0.05, glass_meshes, gasket_meshes, frame_meshes, spacing=0.06, mullion=False)
    m.add(glass_meshes, "glass")

    trim = list(gasket_meshes) + list(frame_meshes)
    deco, chrome, steel, decals, lamps = [], [], [], [], []

    # ---- panel seams (dark ribbons)
    seam_col = 0x20180f

    def seam(proj, pts, w=0.0035, closed=False):
        r = V.ribbon(proj, pts, w, off=0.0042, closed=closed)
        V.paint(r, seam_col)
        trim.append(r)

    def run(a, b, n):
        return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]

    for sign in (+1, -1):
        proj = body.side(sign)
        # cab door: rear edge, top edge, front edge (stops above the wheel arch)
        top = [(0.2675 + (0.655 - 0.2675) * i / 8, 0.885) for i in range(9)]
        front = run((0.655, 0.885), (0.655, 0.36), 6)
        seam(proj, [(0.2675, 0.17 + 0.0)] + run((0.2675, 0.17), (0.2675, 0.86), 8)[1:] + [(0.2675 + 0.02, 0.885)] + top[1:-1] + [(0.655 - 0.02, 0.885)] + front)
        # handles
        hz = 0.305
        hnd = V.bevel_box((sign * 0.384, 0.46, hz), (0.014, 0.026, 0.07), bevel=0.006)
        V.paint(hnd, 0xb9bbc0)
        chrome.append(hnd)
    # sliding door on the right-hand (-X) side: rear edge, bottom, top rail + handle + roller track
    proj = body.side(-1)
    seam(proj, run((-0.105, 0.17), (-0.105, 0.885), 10))
    seam(proj, run((-0.105, 0.17), (0.2675, 0.17), 5))
    seam(proj, run((-0.105, 0.885), (0.2675, 0.885), 5))
    rail = V.ribbon(proj, run((-0.34, 0.325), (0.27, 0.325), 12), 0.012, off=0.0025, height=0.006)
    V.paint(rail, 0x15110c)
    trim.append(rail)
    h2 = V.bevel_box((-0.385, 0.46, 0.17), (0.014, 0.026, 0.075), bevel=0.006)
    V.paint(h2, 0xb9bbc0)
    chrome.append(h2)
    # left (+X) side: fuel flap + a panel line behind the cab door
    projL = body.side(+1)
    seam(projL, run((-0.105, 0.17), (-0.105, 0.885), 10), 0.003)
    cap = V.cylinder((0.384, 0.452, -0.40), 0.022, 0.01, sides=10, axis="x")
    V.paint(cap, 0xa9abb0)
    chrome.append(cap)

    # beltline ribs and lower black Danfo stripe + C-pillar rear air intake vents
    for sign in (+1, -1):
        proj = body.side(sign)
        for yy in (0.262,):
            rb = V.ribbon(proj, run((-0.245, yy), (0.245, yy), 6), 0.012, off=0.0, height=0.006)
            deco.append(rb)
        low_s = V.ribbon(proj, run((-0.25, 0.228), (0.25, 0.228), 8), 0.022, off=0.0038, height=0.003)
        V.paint(low_s, 0x0c0c0e)
        trim.append(low_s)
        # C-pillar black air intake louvre block behind rear window
        for vy in (0.58, 0.63, 0.68, 0.73):
            vl = V.ribbon(proj, run((-0.73, vy), (-0.69, vy), 2), 0.012, off=0.004, height=0.003)
            V.paint(vl, 0x0e0e11)
            trim.append(vl)

    # ---- wheel arches: dark wells + black flare lips
    RA = 0.218
    phi0 = np.arcsin((Y0 + 0.003 - WR) / RA)
    arc = [(RA * np.cos(p), WR + RA * np.sin(p)) for p in np.linspace(phi0, np.pi - phi0, 18)]
    for sign in (+1, -1):
        proj = body.side(sign)
        for zc in (WZ, -WZ):
            poly = [(zc + dx, y) for dx, y in arc]
            chord = [(poly[-1][0] + (poly[0][0] - poly[-1][0]) * k / 4, Y0 + 0.003) for k in range(1, 4)]
            poly = poly + chord
            well = V.patch(proj, np.array(poly), (zc, 0.22), rings=3, off=0.0035)
            V.paint(well, 0x0a0a0b)
            trim.append(well)
            lip = V.ribbon(proj, [(zc + dx, y) for dx, y in [(RA * np.cos(p) * 1.0, WR + RA * np.sin(p)) for p in np.linspace(phi0, np.pi - phi0, 14)]], 0.02, off=0.002, height=0.010)
            V.paint(lip, 0x17171a)
            trim.append(lip)

    # ---- bumpers, grille, lamps (front); tail lamps, plate (rear)
    def bumper(zc, sgn):
        bar = V.bevel_box((0, 0.172, zc), (0.79, 0.066, 0.05), bevel=0.02, seg=2)
        V.paint(bar, 0xb9bbc0)
        chrome.append(bar)
        for sx in (-1, 1):
            blk = V.bevel_box((sx * 0.25, 0.172, zc + sgn * 0.028), (0.075, 0.05, 0.016), bevel=0.007)
            V.paint(blk, 0x1a1a1c)
            trim.append(blk)
            endc = V.bevel_box((sx * 0.384, 0.172, zc - sgn * 0.045), (0.034, 0.066, 0.115), bevel=0.014)
            V.paint(endc, 0xb0b2b7)
            chrome.append(endc)
        sk = V.bevel_box((0, 0.118, zc - sgn * 0.01), (0.60, 0.05, 0.04), bevel=0.012)
        V.paint(sk, 0x1b1a1a)
        trim.append(sk)

    bumper(0.781, 1)
    bumper(-0.781, -1)

    # grille: black panel with chrome slats between the head lamps
    gp = V.grid_patch(body.front, 0.0, 0.352, 0.30, 0.095, 0.015, 0.06, off=0.0045)
    V.paint(gp, 0x08080a)
    trim.append(gp)
    for yy in (0.322, 0.352, 0.382):
        sl = V.ribbon(body.front, [(-0.145 + 0.29 * i / 8, yy) for i in range(9)], 0.010, off=0.0075, height=0.006)
        V.paint(sl, 0xc3c5ca)
        chrome.append(sl)
    # headlamps (chrome bezel + emissive lens), set on the surface
    for sx in (-1, 1):
        zc = body.front(sx * 0.265, 0.352)[2]
        bez = V.bevel_box((sx * 0.265, 0.352, zc + 0.002), (0.108, 0.078, 0.022), bevel=0.014)
        V.paint(bez, 0xbfc1c6)
        chrome.append(bez)
        lens = V.bevel_box((sx * 0.265, 0.352, zc + 0.010), (0.090, 0.060, 0.016), bevel=0.011)
        V.paint(lens, 0xfff2cf)
        lamps.append(lens)
        # indicator + reflector low on the corner
        decals.append(decal(body.front, sx * 0.335, 0.262, 0.05, 0.04, atlas, "amber", off=0.0055))
    decals.append(decal(body.front, 0.0, 0.252, 0.17, 0.0743, atlas, "plate", off=0.0055))
    decals.append(decal(body.back, 0.0, 0.252, 0.17, 0.0743, atlas, "plate", flip=True, off=0.0055))
    for sx in (-1, 1):
        decals.append(decal(body.back, sx * 0.322, 0.50, 0.046, 0.092, atlas, "tail", flip=True, off=0.0055))

    # lettering on the stripe (sides and tail)
    for sign in (+1, -1):
        proj = body.side(sign)
        decals.append(decal(proj, -0.18, 0.350, 0.80, 0.0562, atlas, "side_stripe", flip=(sign > 0), off=0.0045, spacing=0.07, r=0.001))
    decals.append(decal(body.back, 0.0, 0.350, 0.44, 0.062, atlas, "rear_stripe", flip=True, off=0.0045, r=0.001))

    # destination board behind the windscreen, wipers
    decals.append(decal(body.front, 0.0, 0.775, 0.30, 0.075, atlas, "dest", off=0.0095, spacing=0.06, r=0.002))
    for sx in (-1, 1):
        wp = V.ribbon(body.front, [(sx * 0.03, 0.58), (sx * 0.16, 0.66), (sx * 0.27, 0.735)], 0.007, off=0.0110)
        V.paint(wp, 0x0b0b0d)
        trim.append(wp)

    # mirrors on stalks
    for sx in (-1, 1):
        arm = V.tube_poly([(sx * 0.36, 0.60, 0.59), (sx * 0.395, 0.64, 0.615)], 0.007, 5)
        V.paint(arm, 0x18181a)
        trim.append(arm)
        mir = V.bevel_box((sx * 0.397, 0.675, 0.615), (0.046, 0.105, 0.02), bevel=0.008)
        V.paint(mir, 0x111113)
        trim.append(mir)
        face = V.bevel_box((sx * 0.397, 0.675, 0.605), (0.036, 0.092, 0.006), bevel=0.003)
        V.paint(face, 0xc0c8cc)
        chrome.append(face)

    # mud flaps and exhaust
    for sx in (-1, 1):
        fl = V.bevel_box((sx * 0.335, 0.095, -WZ - 0.115), (0.11, 0.12, 0.008), bevel=0.003)
        V.paint(fl, 0x131315)
        trim.append(fl)
    ex = V.tube_poly([(-0.22, 0.105, -0.55), (-0.22, 0.105, -0.80), (-0.22, 0.12, -0.83)], 0.02, 8)
    V.paint(ex, 0x3b3a3c)
    steel.append(ex)
    # chassis box and axles
    ch = V.bevel_box((0, 0.098, 0.0), (0.66, 0.06, 1.28), bevel=0.01)
    V.paint(ch, 0x131214)
    trim.append(ch)
    for z in (WZ, -WZ):
        ax = V.cylinder((0, WR, z), 0.02, 0.62, sides=8, axis="x")
        V.paint(ax, 0x262628)
        steel.append(ax)

    # roof: pressed ribs, drip-rail beads along the edge and a vent hatch
    def roof_proj(x, z):
        return np.array([x, body.roof_y(x, z), z])

    below = lambda c: c - np.array([0.0, 1.0, 0.0])
    for xr in (-0.2, -0.09, 0.09, 0.2):
        rb = V.ribbon(roof_proj, [(xr, -0.66 + 1.2 * i / 10) for i in range(11)], 0.034, off=0.0, height=0.0045, ref_fn=below)
        deco.append(rb)
    hatch = V.bevel_box((0.0, body.roof_y(0, 0.2) + 0.004, 0.2), (0.17, 0.012, 0.13), bevel=0.005, seg=1)
    V.paint(hatch, 0xd6a410)
    deco.append(hatch)
    for sign in (+1, -1):
        proj = body.side(sign)
        gut = V.ribbon(proj, run((-0.70, 0.872), (0.60, 0.872), 12), 0.012, off=0.0, height=0.006)
        V.paint(gut, 0x2a2316)
        trim.append(gut)

    # ---- roof rack, luggage and rear ladder
    YR = 0.975
    rack_col = 0x3d3f45
    rx = 0.305
    z0, z1 = -0.64, 0.46

    def rod(p0, p1, r=0.0075, sides=5):
        t = V.strut(p0, p1, r, sides, caps=False)
        V.paint(t, rack_col)
        steel.append(t)

    for sx in (-1, 1):
        rod((sx * rx, YR, z0), (sx * rx, YR, z1))
    for zz in np.linspace(z0, z1, 7):
        rod((-rx, YR, zz), (rx, YR, zz), 0.0065)
    for sx in (-1, 1):
        for zz in (z0, -0.18, z1):
            rod((sx * rx, body.roof_y(sx * rx, zz) - 0.004, zz), (sx * rx, YR, zz), 0.009)
        # raised fence over the rear half
        rod((sx * rx, YR, z0), (sx * rx, 1.02, z0), 0.0075)
        rod((sx * rx, 1.02, z0), (sx * rx, 1.02, -0.20), 0.0065)
        rod((sx * rx, 1.02, -0.20), (sx * rx, YR, -0.20), 0.0075)
    rod((-rx, 1.02, z0), (rx, 1.02, z0), 0.0065)

    # luggage
    def sack(c, r, col, seed, tilt=0.0):
        b = V.blob(c, r, 7, 14, seed=seed, bumpy=0.10)
        V.paint(b, col)
        V.finish(b, dirt=0.35, seed=seed)
        trim.append(b)

    sack((0.13, 1.0, -0.45), (0.175, 0.066, 0.10), 0xdcd5c2, 1)
    sack((-0.14, 0.995, -0.45), (0.15, 0.062, 0.095), 0x9c7a49, 2)
    sack((0.02, 1.012, -0.32), (0.14, 0.062, 0.085), 0xcfc7b0, 5)
    tarp = V.bevel_box((0.06, 0.998, 0.0), (0.40, 0.07, 0.25), bevel=0.032, seg=2)
    V.paint(tarp, 0x2a5a98)
    V.finish(tarp, dirt=0.3, seed=9)
    trim.append(tarp)
    for zz in (-0.065, 0.075):
        band = V.bevel_box((0.06, 0.998, zz), (0.408, 0.078, 0.012), bevel=0.004, seg=1)
        V.paint(band, 0x3c2c1c)
        trim.append(band)
    mat = V.cylinder((0.0, 1.0, 0.30), 0.048, 0.50, sides=9, axis="x")
    V.paint(mat, 0xdcc66e)
    V.finish(mat, dirt=0.3, seed=11)
    trim.append(mat)
    for xx in (-0.14, 0.12):
        st = V.cylinder((xx, 1.0, 0.30), 0.052, 0.014, sides=9, axis="x")
        V.paint(st, 0x9a3430)
        trim.append(st)
    bag = V.bevel_box((-0.19, 1.025, -0.02), (0.17, 0.075, 0.20), bevel=0.034, seg=2)
    V.paint(bag, 0xa8352f)
    V.finish(bag, dirt=0.3, seed=13)
    trim.append(bag)
    for zz in (-0.06, 0.03):
        bb = V.bevel_box((-0.19, 1.025, zz), (0.176, 0.08, 0.022), bevel=0.006, seg=1)
        V.paint(bb, 0x2f5a96 if zz < 0 else 0xe6e0d0)
        trim.append(bb)
    jug = V.bevel_box((0.215, 1.03, 0.02), (0.075, 0.085, 0.13), bevel=0.022, seg=2)
    V.paint(jug, 0x3b8654)
    trim.append(jug)
    cap2 = V.cylinder((0.215, 1.078, 0.0), 0.016, 0.012, sides=6)
    V.paint(cap2, 0x1a1a1a)
    trim.append(cap2)
    bucket = V.lathe([(0.0, 0.0), (0.040, 0.0), (0.060, 0.075), (0.066, 0.075), (0.0, 0.075)], 10)
    bucket = place(bucket, (-0.20, 0.985, 0.37))
    V.paint(bucket, 0xc4553a)
    trim.append(bucket)

    # ladder on the tail (right of the rear window)
    for lx in (0.255, 0.345):
        pts = []
        for yy in (0.30, 0.55, 0.85):
            pts.append(body.back(lx, yy) + np.array([0.0, 0.0, -0.022]))
        pts.append(np.array([lx, 0.968, body.back(lx, 0.9)[2] - 0.02]))
        pts.append(np.array([lx, YR, -0.64]))
        t = V.tube_poly(pts, 0.0065, 5, caps=False)
        V.paint(t, rack_col)
        steel.append(t)
    for yy in (0.36, 0.48, 0.60, 0.72, 0.84):
        pa, pb = body.back(0.255, yy) + np.array([0, 0, -0.022]), body.back(0.345, yy) + np.array([0, 0, -0.022])
        rod(tuple(pa), tuple(pb), 0.0075)

    m.add(deco, "paint")
    m.add(trim, "trim")
    m.add(chrome, "chrome")
    m.add(steel, "steel")
    m.add(decals, "decal")
    m.add(lamps, "lamp")
    add_wheel_set(m, Wheels(WR, WW, 0.1), [("wheel_FL", WX, WR, WZ, 1), ("wheel_FR", -WX, WR, WZ, -1), ("wheel_RL", WX, WR, -WZ, 1), ("wheel_RR", -WX, WR, -WZ, -1)])
    V.scale_model(m, 0.965)
    return m, std_specs(decal_tex="decals_danfo")
