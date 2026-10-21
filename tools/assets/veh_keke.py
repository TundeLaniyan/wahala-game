"""Keke (v4): three-wheeled auto-rickshaw in clean glossy yellow with green accents.

Single front wheel on a visible chrome steering fork under a rounded front cowl, raked windscreen, green vinyl
canopy with piped edges on black struts, driver seat + handlebar, maroon passenger bench, closed rear panel
with a small back window, two rear wheels in arched wells. Original design; no real brand."""
from __future__ import annotations

import numpy as np

import vehicles_lib as V
from vehicles_lib import Model, place
from veh_common import add_premium_wheels, clean_specs, livery_fn, poly_window

YELLOW = 0xffc214
GREEN = 0x169a4c
GREEN_DARK = 0x0d6a33
Y0 = 0.135
RWR, RWW, RRIM, RWX, RWZ = 0.132, 0.088, 0.080, 0.272, -0.30
FWR, FWW, FRIM, FWZ = 0.122, 0.074, 0.074, 0.455
BAND = (0.235, 0.300)
PIN = (0.300, 0.310)
TUB_TOP = 0.415
ROOF_Y = 0.925
COWL_DZ = 0.30  # the front fairing is a short shield ahead of the driver


def make_atlas() -> V.Atlas:
    at = V.Atlas(512, seed=31)

    def plate(img, d, rng):
        d.rectangle([0, 0, 127, 55], fill=(0xf2, 0xf2, 0xea), outline=(0x20, 0x20, 0x20), width=3)
        d.rectangle([4, 4, 123, 16], fill=(0x1b, 0x7a, 0x3a))
        V.hand_text(d, rng, "LAGOS", (4, 3, 124, 17), (0xff, 0xff, 0xff), 13, jitter=0.0, tracking=3)
        V.hand_text(d, rng, "AKD 913 YK", (4, 18, 124, 52), (0x10, 0x10, 0x14), 19, path=V.FONT_MONO, jitter=0.0)

    def tail(img, d, rng):
        d.rectangle([0, 0, 39, 79], fill=(0x40, 0x06, 0x08))
        d.rounded_rectangle([3, 3, 36, 44], 5, fill=(0xe2, 0x1c, 0x24))
        d.rounded_rectangle([3, 47, 36, 60], 3, fill=(0xff, 0x98, 0x18))
        d.rounded_rectangle([3, 63, 36, 76], 3, fill=(0xf2, 0xee, 0xe4))
        d.rectangle([7, 7, 13, 40], fill=(0xff, 0x78, 0x74))

    def amber(img, d, rng):
        d.rectangle([0, 0, 31, 31], fill=(0x50, 0x2a, 0x06))
        d.rounded_rectangle([2, 2, 29, 29], 6, fill=(0xff, 0xa8, 0x1c))
        d.rectangle([6, 6, 14, 12], fill=(0xff, 0xe0, 0x96))

    def side(img, d, rng):
        d.rectangle([0, 0, 255, 39], fill=(0x16, 0x9a, 0x4c))
        V.hand_text(d, rng, "KEKE  E DEY GO!", (6, 3, 250, 37), (0xff, 0xf4, 0xd8), 25, jitter=0.4, tracking=1)

    def back(img, d, rng):
        d.rectangle([0, 0, 255, 63], fill=(0x0d, 0x6a, 0x33))
        V.hand_text(d, rng, "NO SHAKING", (4, 4, 252, 36), (0xff, 0xc2, 0x14), 26, jitter=0.4, tracking=2)
        V.hand_text(d, rng, "JESUS IS LORD", (4, 36, 252, 60), (0xf4, 0xf0, 0xe0), 17, jitter=0.4)

    at.cell("side", 256, 40, side)
    at.cell("back", 256, 64, back)
    at.cell("plate", 128, 56, plate)
    at.cell("tail", 40, 80, tail)
    at.cell("amber", 32, 32, amber)
    at.build()
    return at


def decal(proj, uc, vc, w, h, atlas, name, flip=False, off=0.0045, spacing=0.07, r=0.002, ref_fn=V.axis_ref):
    u0, v0, u1, v1 = atlas.rect(name)
    rect = (u1, v0, u0, v1) if flip else (u0, v0, u1, v1)
    return V.grid_patch(proj, uc, vc, w, h, r, spacing, off=off, uv_rect=rect, ref_fn=ref_fn)


def arc_fender(cy, cz, r, width, a0, a1, sides=16, thick=0.014):
    """Mudguard shell around a wheel axle (axis X). Angles in degrees, 0 = +Z, positive towards +Y."""
    ang = np.radians(np.linspace(a0, a1, sides))
    prof = [(-width / 2, 0.0), (-width / 2 * 0.92, thick), (0.0, thick * 1.35), (width / 2 * 0.92, thick), (width / 2, 0.0)]
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

    bands = [(*BAND, GREEN), (*PIN, 0xf4f0e2)]
    seams = [BAND[0], BAND[1], PIN[1]]
    glass, gasket, trim, chrome, steel, decals, lamps, deco, paint = [], [], [], [], [], [], [], [], []

    # ---- passenger tub (rear body)
    tub = V.Body(
        [(Y0, 0.290, 0.20, 0.500, 3.8), (0.19, 0.305, 0.22, 0.518, 3.5), (TUB_TOP, 0.305, 0.22, 0.518, 3.5)],
        ytop=TUB_TOP, roof_r=0.03, crown=0.004, roof_steps=4, extra_ys=[0.36], bottom_round=0.012,
    )
    shell = tub.build(sides=44, color_fn=livery_fn(bands, base=YELLOW, ao_y=(Y0, 0.28), dark=0.2, dust_y=0.17), seams=seams, cap_rings=(0.8, 0.55, 0.3))
    floor = (shell.v[:, 1] > TUB_TOP - 0.012) & (np.hypot(shell.v[:, 0] / 0.305, shell.v[:, 2] / 0.42) < 0.93)
    shell.c[floor, :3] = V.lin(0x26241f)
    paint.append(shell)

    # ---- front cowl (driver's fairing) with the round head lamp
    cowl = V.Body(
        [(0.25, 0.165, 0.150, 0.095, 2.8), (0.34, 0.205, 0.172, 0.105, 2.8), (0.48, 0.214, 0.150, 0.105, 2.8), (0.585, 0.205, 0.088, 0.105, 2.6)],
        ytop=0.60, roof_r=0.05, crown=0.010, roof_steps=5, extra_ys=[0.42], bottom_round=0.012,
    )
    cw = cowl.build(sides=36, color_fn=livery_fn([(0.305, 0.345, GREEN)], base=YELLOW, ao_y=(0.25, 0.3), dark=0.15, dust_y=0.0), seams=(0.305, 0.345), cap_rings=(0.7, 0.4))
    cw.v[:, 2] += COWL_DZ
    paint.append(cw)
    cowl_front = lambda x, y: cowl.front(x, y) + np.array([0.0, 0.0, COWL_DZ])

    def run(a, b, n):
        return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]

    # ---- canopy: green vinyl roof with black piping and a short valance skirt
    canopy = V.Body(
        [(0.855, 0.300, 0.355, 0.552, 3.6), (0.885, 0.305, 0.365, 0.560, 3.6), (ROOF_Y, 0.300, 0.358, 0.552, 3.5)],
        ytop=ROOF_Y, roof_r=0.035, crown=0.022, roof_steps=5, extra_ys=[], bottom_round=0.008,
    )

    def cf_roof(y, pts, band):
        n = len(pts)
        y_eff = y + band * 1e-4
        c = np.tile(V.lin(GREEN), (n, 1))
        if y_eff < 0.872:
            c = np.tile(V.lin(GREEN_DARK), (n, 1))
        # subtle quilting across the top so the vinyl does not read as flat plastic
        q = 0.94 + 0.06 * np.cos(pts[:, 2] * 40.0) ** 2
        return c * q[:, None]

    cp = canopy.build(sides=44, color_fn=cf_roof, seams=(0.872,), cap_rings=(0.86, 0.66, 0.42, 0.2))
    paint.append(cp)
    for sign in (+1, -1):
        pipe = V.ribbon(canopy.side(sign), run((-0.55, 0.887), (0.36, 0.887), 14), 0.010, off=0.0, height=0.006)
        V.paint(pipe, 0x0c0c0e)
        trim.append(pipe)
    for proj in (canopy.front, canopy.back):
        pipe = V.ribbon(proj, run((-0.29, 0.887), (0.29, 0.887), 8), 0.010, off=0.0, height=0.006)
        V.paint(pipe, 0x0c0c0e)
        trim.append(pipe)

    # canopy frame: A pillars along the windscreen, B behind the driver, C at the back
    def pillar(p0, p1, r=0.012, col=0x141416):
        t = V.strut(p0, p1, r, 6, caps=True)
        V.paint(t, col)
        trim.append(t)

    px = 0.292
    for sx in (-1, 1):
        pillar((sx * 0.200, 0.585, 0.355), (sx * px, 0.862, 0.255))
        pillar((sx * px, TUB_TOP - 0.01, -0.10), (sx * px, 0.862, -0.10))
        pillar((sx * px, TUB_TOP - 0.01, -0.49), (sx * px, 0.862, -0.49))
        # grab rail along the side opening
        rail = V.tube_poly([(sx * px, 0.62, -0.10), (sx * (px + 0.004), 0.64, -0.30), (sx * px, 0.62, -0.49)], 0.007, 5, caps=False)
        V.paint(rail, 0xd2d4d8)
        chrome.append(rail)

    # raked windscreen between the cowl top and the canopy
    def screen_proj(x, y):
        return np.array([x, y, 0.355 - (y - 0.585) * (0.10 / 0.277)])

    wpoly = V.fillet_poly([(-0.205, 0.600), (0.205, 0.600), (0.275, 0.848), (-0.275, 0.848)], 0.03, 3, 0.06)
    poly_window(screen_proj, wpoly, glass, gasket, rings=3, off_g=0.004, pad=0.014, glass_col=(0.03, 0.065, 0.09), sky=(0.24, 0.31, 0.36))
    for sx in (-1, 1):
        wp = V.ribbon(screen_proj, [(sx * 0.03, 0.612), (sx * 0.12, 0.67), (sx * 0.20, 0.73)], 0.006, off=0.0075)
        V.paint(wp, 0x0b0b0d)
        trim.append(wp)

    # closed rear: body-colour lower wall + green vinyl back panel with a small window and lettering
    rear = V.bevel_box((0, 0.52, -0.478), (0.58, 0.22, 0.09), bevel=0.035, seg=1)
    V.paint(rear, YELLOW)
    paint.append(rear)
    back_panel = V.bevel_box((0, 0.745, -0.515), (0.58, 0.24, 0.025), bevel=0.01, seg=1)
    V.paint(back_panel, GREEN_DARK)
    paint.append(back_panel)
    back_plane = lambda x, y: np.array([x, y, -0.5285])
    bpoly = V.fillet_poly([(-0.16, 0.72), (0.16, 0.72), (0.16, 0.835), (-0.16, 0.835)], 0.025, 3, 0.06)
    poly_window(back_plane, bpoly, glass, gasket, rings=2, off_g=0.003, pad=0.012, streaks=False)
    decals.append(decal(back_plane, 0.0, 0.665, 0.30, 0.075, atlas, "back", flip=True, off=0.0015, spacing=0.08, r=0.001))
    rear_low = lambda x, y: np.array([x, y, -0.5235])
    for sx in (-1, 1):
        decals.append(decal(rear_low, sx * 0.235, 0.53, 0.045, 0.09, atlas, "tail", flip=True, off=0.0015, spacing=0.05))
    decals.append(decal(tub.back, 0.0, 0.33, 0.15, 0.0656, atlas, "plate", flip=True, off=0.006))
    bump = V.bevel_box((0, 0.19, -0.53), (0.52, 0.045, 0.035), bevel=0.016, seg=1)
    V.paint(bump, 0xd2d4d8)
    chrome.append(bump)

    # ---- seats
    def seat(c, size, col, bev=0.025):
        s = V.bevel_box(c, size, bevel=bev, seg=1)
        V.paint(s, col)
        trim.append(s)

    seat((0.0, 0.445, 0.07), (0.26, 0.06, 0.22), 0x1d1b1c)  # driver
    seat((0.0, 0.53, -0.055), (0.26, 0.15, 0.05), 0x1d1b1c)
    seat((0.0, 0.445, -0.30), (0.52, 0.07, 0.22), 0x8a2a24)  # passenger bench
    seat((0.0, 0.565, -0.415), (0.52, 0.20, 0.06), 0x8a2a24)
    for xx in (-0.13, 0.0, 0.13):
        st = V.bevel_box((xx, 0.565, -0.384), (0.006, 0.18, 0.004), bevel=0.002)
        V.paint(st, 0x5c1b17)
        trim.append(st)

    # ---- tub side detail: arches, lettering, sill rub strip, step
    RA = RWR + 0.036
    phi0 = np.arcsin((Y0 + 0.003 - RWR) / RA)
    for sign in (+1, -1):
        proj = tub.side(sign)
        arc = [(RWZ + RA * np.cos(p), RWR + RA * np.sin(p)) for p in np.linspace(phi0, np.pi - phi0, 14)]
        chord = [(arc[-1][0] + (arc[0][0] - arc[-1][0]) * k / 4, Y0 + 0.003) for k in range(1, 4)]
        well = V.patch(proj, np.array(arc + chord), (RWZ, 0.17), rings=2, off=0.0045)
        V.paint(well, 0x070708)
        trim.append(well)
        lip = V.ribbon(proj, [(RWZ + (u - RWZ) * 1.03, RWR + (v - RWR) * 1.03) for u, v in arc], 0.018, off=0.002, height=0.009)
        V.paint(lip, 0x141416)
        trim.append(lip)
        decals.append(decal(proj, 0.0, 0.2675, 0.25, 0.039, atlas, "side", flip=(sign > 0), off=0.0042, spacing=0.07, r=0.001))
        rb = V.ribbon(proj, run((-0.08, 0.38), (0.18, 0.38), 6), 0.012, off=0.0, height=0.005)
        V.paint(rb, 0xd2d4d8)
        chrome.append(rb)
    for sx in (-1, 1):
        step = V.bevel_box((sx * 0.30, 0.17, 0.06), (0.06, 0.018, 0.14), bevel=0.006)
        V.paint(step, 0x2a2a2d)
        steel.append(step)

    # ---- front: head lamp, indicators, plate, fender, steering fork, handlebar, dash, mirrors
    zf = cowl_front(0.0, 0.445)[2]
    ring = V.cylinder((0, 0.445, zf + 0.004), 0.07, 0.02, sides=16, axis="z", bevel=0.006)
    V.paint(ring, 0xd8dade)
    chrome.append(ring)
    lens = V.lathe([(0.0, 0.0), (0.056, 0.0), (0.058, 0.006), (0.048, 0.020), (0.026, 0.027), (0.0, 0.029)], 14)
    lens = place(lens, (0, 0.445, zf + 0.012), (90, 0, 0))
    V.paint(lens, 0xfff4d8)
    lamps.append(lens)
    decals.append(decal(cowl_front, 0.0, 0.375, 0.12, 0.0525, atlas, "plate", off=0.006, ref_fn=lambda c: c - np.array([0.0, 0.0, 1.0])))
    for sx in (-1, 1):
        decals.append(decal(cowl_front, sx * 0.135, 0.445, 0.038, 0.038, atlas, "amber", off=0.0048, ref_fn=lambda c: c - np.array([0.0, 0.0, 1.0])))
    fend = arc_fender(FWR, FWZ, FWR + 0.022, 0.10, 5, 150)
    V.paint(fend, YELLOW)
    deco.append(fend)
    for sx in (-1, 1):
        fk = V.strut((sx * 0.052, FWR, FWZ), (sx * 0.048, 0.33, 0.395), 0.011, 8, caps=True)
        V.paint(fk, 0xd2d4d8)
        chrome.append(fk)
        boot = V.cylinder((sx * 0.05, 0.27, 0.418), 0.016, 0.07, sides=8, axis="y")
        boot = place(boot, (0, 0, 0))
        V.paint(boot, 0x141416)
        trim.append(boot)
    hub = V.cylinder((0, FWR, FWZ), 0.02, 0.12, sides=8, axis="x")
    V.paint(hub, 0x2a2a2d)
    steel.append(hub)
    hb = V.tube_poly([(-0.22, 0.672, 0.205), (-0.12, 0.684, 0.235), (0.12, 0.684, 0.235), (0.22, 0.672, 0.205)], 0.0095, 6)
    V.paint(hb, 0xd2d4d8)
    chrome.append(hb)
    col = V.strut((0, 0.60, 0.30), (0, 0.684, 0.235), 0.014, 8)
    V.paint(col, 0x1a1a1c)
    trim.append(col)
    for sx in (-1, 1):
        gr = V.cylinder((sx * 0.235, 0.670, 0.200), 0.016, 0.065, sides=8, axis="x")
        V.paint(gr, 0x131315)
        trim.append(gr)
    dash = V.bevel_box((0, 0.615, 0.27), (0.30, 0.06, 0.08), bevel=0.02, seg=1)
    V.paint(dash, 0x18181a)
    trim.append(dash)
    for sx in (-1, 1):
        st = V.tube_poly([(sx * 0.27, 0.80, 0.27), (sx * 0.32, 0.79, 0.25)], 0.005, 5)
        V.paint(st, 0x141416)
        trim.append(st)
        mr = V.cylinder((sx * 0.33, 0.79, 0.245), 0.028, 0.014, sides=12, axis="z")
        V.paint(mr, 0x151517)
        trim.append(mr)
        mf = V.cylinder((sx * 0.33, 0.79, 0.255), 0.022, 0.006, sides=12, axis="z")
        V.paint(mf, 0xcdd5da)
        chrome.append(mf)

    # chassis + rear axle + exhaust
    ch = V.bevel_box((0, 0.11, -0.12), (0.40, 0.05, 0.80), bevel=0.01)
    V.paint(ch, 0x131214)
    trim.append(ch)
    ax = V.cylinder((0, RWR, RWZ), 0.018, 0.52, sides=8, axis="x")
    V.paint(ax, 0x262628)
    steel.append(ax)
    ex = V.tube_poly([(0.16, 0.11, -0.40), (0.16, 0.11, -0.56), (0.16, 0.125, -0.58)], 0.016, 8)
    V.paint(ex, 0x5a595e)
    steel.append(ex)

    m.add(paint + deco, "paint")
    m.add(glass, "glass")
    m.add(gasket + trim, "trim")
    m.add(chrome, "chrome")
    m.add(steel, "steel")
    m.add(decals, "decal")
    m.add(lamps, "lamp")
    add_premium_wheels(m, RWR, RWW, RRIM, [("wheel_RL", RWX, RWR, RWZ, 1), ("wheel_RR", -RWX, RWR, RWZ, -1)], rim_colour=0xd5d7dc)
    add_premium_wheels(m, FWR, FWW, FRIM, [("wheel_F", 0.0, FWR, FWZ, 1), ("wheel_F", 0.0, FWR, FWZ, -1)], rim_colour=0xd5d7dc)
    V.scale_model(m, 0.93)
    return m, clean_specs(decal_tex="decals_keke")
