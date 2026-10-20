"""WAHALA petrol generator: red casing, silver tube cage, fuel tank, control panel, recoil starter, muffler.

Special nodes for the game: `lamp` (emissive indicator), `antenna` (aerial stalk + glowing ball, pivot at its base);
the paint material is named exactly `casing` (base colour factor (0.85, 0.18, 0.12), white vertex colours)."""
from __future__ import annotations

import numpy as np

import tex_veh
import vehicles_lib as V
from vehicles_lib import Model, Spec, place

tex_veh.install()
CAGE_X, CAGE_Z = 0.294, 0.232
TOP, BOT = 0.60, 0.06
CAGE_COL = 0xa7aab1


def make_atlas() -> V.Atlas:
    at = V.Atlas(512, seed=51)

    def panel(img, d, rng):
        d.rectangle([0, 0, 379, 189], fill=(0x0b, 0x0b, 0x0d))
        d.rounded_rectangle([5, 5, 374, 184], radius=10, outline=(0x55, 0x58, 0x5e), width=3)
        for cx, label in ((70, "230V"), (155, "16A")):
            V.hand_text(d, rng, label, (cx - 40, 128, cx + 40, 160), (0xe8, 0xe8, 0xe0), 22, jitter=0.0)
        V.hand_text(d, rng, "BREAKER", (212, 132, 300, 158), (0xe8, 0xe8, 0xe0), 12, jitter=0.0)
        V.hand_text(d, rng, "ON    OFF", (306, 132, 374, 158), (0xe8, 0xe8, 0xe0), 11, jitter=0.0)
        V.hand_text(d, rng, "WAHALA POWER 3000W", (16, 16, 300, 50), (0xf2, 0xb7, 0x05), 19, jitter=0.0, tracking=0)
        d.rectangle([14, 62, 366, 64], fill=(0x55, 0x58, 0x5e))
        V.hand_text(d, rng, "READY", (286, 70, 340, 92), (0xe8, 0xe8, 0xe0), 11, jitter=0.0)

    def flame(img, d, rng):
        d.rectangle([0, 0, 63, 63], fill=(0x0b, 0x0b, 0x0d))
        d.polygon([(32, 4), (60, 56), (4, 56)], fill=(0xf4, 0xc2, 0x0a), outline=(0x0b, 0x0b, 0x0d))
        d.polygon([(32, 14), (54, 52), (10, 52)], outline=(0x0b, 0x0b, 0x0d), width=3)
        d.polygon([(32, 22), (42, 40), (38, 50), (26, 50), (22, 40), (29, 34)], fill=(0xd0, 0x2a, 0x10))
        d.polygon([(32, 34), (37, 44), (33, 50), (27, 50), (27, 43)], fill=(0xff, 0xc0, 0x30))

    def petrol(img, d, rng):
        d.rectangle([0, 0, 159, 39], fill=(0xf4, 0xc2, 0x0a))
        d.rectangle([0, 0, 159, 39], outline=(0x0b, 0x0b, 0x0d), width=3)
        V.hand_text(d, rng, "PETROL ONLY", (4, 4, 156, 36), (0x10, 0x10, 0x12), 19, jitter=0.0, tracking=0)

    def brand(img, d, rng):
        d.rectangle([0, 0, 199, 47], fill=(0x0b, 0x0b, 0x0d))
        d.rectangle([0, 0, 199, 4], fill=(0xf2, 0xb7, 0x05))
        d.rectangle([0, 43, 199, 47], fill=(0xf2, 0xb7, 0x05))
        V.hand_text(d, rng, "WAHALA GEN", (4, 6, 196, 42), (0xf4, 0xf0, 0xe0), 26, jitter=0.0, tracking=2)

    def gauge(img, d, rng):
        d.rectangle([0, 0, 63, 63], fill=(0x10, 0x10, 0x12))
        d.ellipse([3, 3, 60, 60], fill=(0xee, 0xea, 0xdc), outline=(0x20, 0x20, 0x24), width=3)
        d.pieslice([8, 8, 55, 55], 200, 250, fill=(0xd0, 0x28, 0x18))
        d.pieslice([8, 8, 55, 55], 250, 340, fill=(0x2a, 0x9a, 0x44))
        d.ellipse([14, 14, 49, 49], fill=(0xee, 0xea, 0xdc))
        d.line([32, 32, 44, 20], fill=(0xc0, 0x20, 0x14), width=3)
        d.ellipse([29, 29, 35, 35], fill=(0x10, 0x10, 0x12))

    at.cell("panel", 380, 190, panel)
    at.cell("flame", 64, 64, flame)
    at.cell("petrol", 160, 40, petrol)
    at.cell("brand", 200, 48, brand)
    at.cell("gauge", 64, 64, gauge)
    at.build()
    return at


def build():
    m = Model("gen_generator")
    at = make_atlas()
    V.register_generator("decals_gen", at.tex)
    casing, frame, trim, chrome, decals = [], [], [], [], []
    lamp_m, ant_trim, ant_lamp = [], [], []

    def col(mesh, c, dirt=0.0, seed=0):
        V.paint(mesh, c)
        if dirt:
            V.finish(mesh, dirt=dirt, seed=seed)
        return mesh

    def cage_tube(pts, r=0.0155, d=0.075, sides=7):
        path = V.fillet_path(pts, d, 5)
        t = V.tube_poly(path, r, sides, caps=True)
        col(t, CAGE_COL, 0.25, int(abs(sum(pts[0])) * 100))
        frame.append(t)

    # ---- tube cage: two side loops, long top / bottom rails, skids
    for sx in (-1, 1):
        x = sx * CAGE_X
        cage_tube([(x, BOT, 0.0), (x, BOT, CAGE_Z), (x, TOP, CAGE_Z), (x, TOP, -CAGE_Z), (x, BOT, -CAGE_Z), (x, BOT, 0.0)], d=0.075)
    IN = 0.0188  # rails end on the mid-point of the loops' rounded corners so their ends stay hidden
    for sz in (-1, 1):
        cage_tube([(-CAGE_X, TOP - IN, sz * (CAGE_Z - IN)), (CAGE_X, TOP - IN, sz * (CAGE_Z - IN))], d=0.01)
        cage_tube([(-CAGE_X, BOT + IN, sz * (CAGE_Z - IN)), (CAGE_X, BOT + IN, sz * (CAGE_Z - IN))], d=0.01)
    for xx in (-0.15, 0.15):
        cage_tube([(xx, BOT + IN, -(CAGE_Z - IN)), (xx, BOT + IN, CAGE_Z - IN)], r=0.013, d=0.01, sides=6)
    cage_tube([(-CAGE_X, 0.33, -CAGE_Z), (CAGE_X, 0.33, -CAGE_Z)], r=0.012, d=0.01, sides=6)
    # carry-handle grips over the top rails
    for sz in (-1, 1):
        g = V.cylinder((0.0, TOP - IN, sz * (CAGE_Z - IN)), 0.0215, 0.17, sides=10, axis="x", bevel=0.006)
        col(g, 0x1a1a1c)
        trim.append(g)
    for sx in (-1, 1):
        for sz in (-1, 1):
            foot = V.cylinder((sx * 0.235, 0.022, sz * (CAGE_Z - IN)), 0.030, 0.045, sides=8)
            col(foot, 0x151517)
            trim.append(foot)
            brk = V.strut((sx * 0.235, 0.035, sz * (CAGE_Z - IN)), (sx * 0.235, BOT + IN, sz * (CAGE_Z - IN)), 0.012, 5)
            col(brk, CAGE_COL)
            frame.append(brk)

    # ---- main housing (casing red) and fuel tank
    house = V.bevel_box((0.0, 0.265, 0.0), (0.47, 0.38, 0.36), bevel=0.055, seg=2)
    V.paint(house, 0xffffff)
    casing.append(house)
    tank = V.loft_z(
        [(-0.22, 0.0, 0.50, 0.070, 0.045, 0.050), (-0.15, 0.0, 0.50, 0.116, 0.075, 0.062), (0.12, 0.0, 0.50, 0.120, 0.078, 0.062), (0.22, 0.0, 0.50, 0.072, 0.048, 0.050)],
        sides=20, e=3.6, round_ends=3)
    tank = place(tank, (0, 0, 0), (0, 90, 0))
    V.paint(tank, 0xffffff)
    casing.append(tank)
    base_pl = V.bevel_box((0.0, 0.092, 0.0), (0.485, 0.045, 0.375), bevel=0.015, seg=1)
    col(base_pl, 0x1a1a1d)
    trim.append(base_pl)
    af = V.bevel_box((-0.135, 0.466, -0.095), (0.17, 0.05, 0.13), bevel=0.018, seg=1)
    col(af, 0x18181b)
    trim.append(af)
    for k in range(5):
        rb = V.quad((-0.135, 0.4915, -0.095 + 0.026 * (k - 2)), (1, 0, 0), (0, 0, -1), 0.15, 0.010)
        col(rb, 0x34343a)
        trim.append(rb)
    capb = V.cylinder((0.125, 0.583, 0.0), 0.034, 0.020, sides=12, bevel=0.005)
    col(capb, 0x17171a)
    trim.append(capb)
    capr = V.cylinder((0.125, 0.594, 0.0), 0.026, 0.008, sides=12)
    col(capr, 0xbfc2c8)
    chrome.append(capr)
    knob = V.bevel_box((0.125, 0.606, 0.0), (0.040, 0.010, 0.012), bevel=0.004)
    col(knob, 0x17171a)
    trim.append(knob)
    u0, v0, u1, v1 = at.rect("gauge")
    decals.append(V.quad((-0.115, 0.5815, 0.0), (1, 0, 0), (0, 0, -1), 0.060, 0.060, (u0, v0, u1, v1)))
    u0, v0, u1, v1 = at.rect("petrol")
    decals.append(V.quad((0.0, 0.5785, 0.012), (1, 0, 0), (0, 0, -1), 0.100, 0.025, (u0, v0, u1, v1)))
    u0, v0, u1, v1 = at.rect("brand")
    decals.append(V.quad((0.06, 0.505, 0.1265), (1, 0, 0), (0, 1, 0), 0.17, 0.040, (u0, v0, u1, v1)))
    decals.append(V.quad((0.06, 0.505, -0.1265), (-1, 0, 0), (0, 1, 0), 0.17, 0.040, (u0, v0, u1, v1)))
    u0, v0, u1, v1 = at.rect("flame")
    decals.append(V.quad((-0.14, 0.505, 0.1262), (1, 0, 0), (0, 1, 0), 0.045, 0.045, (u0, v0, u1, v1)))
    decals.append(V.quad((-0.14, 0.505, -0.1262), (-1, 0, 0), (0, 1, 0), 0.045, 0.045, (u0, v0, u1, v1)))
    # fuel valve / hose on the tank end
    fv = V.cylinder((-0.235, 0.46, 0.0), 0.014, 0.03, sides=8, axis="x")
    col(fv, 0x17171a)
    trim.append(fv)

    # tank straps with buckles
    for xs_ in (-0.12, 0.05):
        loop = []
        for t in np.linspace(0, 2 * np.pi, 17):
            c_, s_ = np.cos(t), np.sin(t)
            loop.append((xs_, 0.50 + (0.0805 if s_ >= 0 else 0.0645) * V.sgnpow(s_, 2 / 3.6), 0.1215 * V.sgnpow(c_, 2 / 3.6)))
        strap = V.tube_poly(loop, 0.0055, 4, caps=False)
        col(strap, 0x141416)
        trim.append(strap)
        bk_ = V.bevel_box((xs_, 0.583, 0.0), (0.016, 0.006, 0.022), bevel=0.002, seg=1)
        col(bk_, 0xbfc2c8)
        chrome.append(bk_)
    # moulded seam ribs on the housing and bolts
    for sz in (-1, 1):
        plane = (lambda z_: (lambda x, y: np.array([x, y, z_])))(sz * 0.1805)
        rib = V.ribbon(plane, [(-0.16, 0.36), (0.16, 0.36)], 0.010, off=0.0, height=0.004, ref_fn=V.axis_ref)
        col(rib, 0xffffff)
        casing.append(rib)
    for bx in (-0.19, 0.19):
        for by in (0.16, 0.40):
            for bz in (-1, 1):
                bolt = V.cylinder((bx, by, bz * 0.182), 0.0085, 0.008, sides=6, axis="z")
                col(bolt, 0xb4b7bd)
                chrome.append(bolt)
    endx = lambda y, z: np.array([-0.2362, y, z])
    for k in range(5):
        sl = V.ribbon(endx, [(0.32 + 0.022 * k, -0.07), (0.32 + 0.022 * k, 0.07)], 0.011, off=0.0, ref_fn=V.axis_ref)
        col(sl, 0x08080a)
        trim.append(sl)
    u0, v0, u1, v1 = at.rect("flame")
    decals.append(V.quad((-0.2378, 0.18, 0.12), (0, 0, 1), (0, 1, 0), 0.04, 0.04, (u0, v0, u1, v1)))

    # ---- control panel on the +Z face
    panel_z = 0.180
    pl = V.bevel_box((0.0, 0.265, panel_z), (0.40, 0.205, 0.016), bevel=0.006, seg=1)
    col(pl, 0x0b0b0d)
    trim.append(pl)
    u0, v0, u1, v1 = at.rect("panel")
    decals.append(V.quad((0.0, 0.265, panel_z + 0.0085), (1, 0, 0), (0, 1, 0), 0.38, 0.19, (u0, v0, u1, v1)))
    for sx in (-0.12, -0.035):
        ring = V.cylinder((sx, 0.235, panel_z + 0.012), 0.031, 0.014, sides=12, axis="z")
        col(ring, 0x1c1c1f)
        trim.append(ring)
        face = V.cylinder((sx, 0.235, panel_z + 0.020), 0.022, 0.004, sides=12, axis="z")
        col(face, 0xcfd2d6)
        chrome.append(face)
        for px in (-0.008, 0.008):
            pin = V.quad((sx + px, 0.235, panel_z + 0.0227), (1, 0, 0), (0, 1, 0), 0.004, 0.014)
            col(pin, 0x111113)
            trim.append(pin)
        flap = V.strut((sx - 0.022, 0.262, panel_z + 0.014), (sx + 0.022, 0.262, panel_z + 0.014), 0.004, 4)
        col(flap, 0x2a2a2e)
        trim.append(flap)
    brk = V.cylinder((0.065, 0.235, panel_z + 0.014), 0.014, 0.014, sides=10, axis="z", bevel=0.003)
    col(brk, 0xd13a22)
    trim.append(brk)
    sw_base = V.cylinder((0.140, 0.235, panel_z + 0.012), 0.018, 0.010, sides=10, axis="z")
    col(sw_base, 0x2a2a2e)
    trim.append(sw_base)
    sw = V.strut((0.140, 0.235, panel_z + 0.016), (0.150, 0.250, panel_z + 0.036), 0.0065, 6)
    col(sw, 0xc7cacf)
    chrome.append(sw)
    # volt-meter style window
    vm = V.cylinder((0.065, 0.30, panel_z + 0.011), 0.019, 0.006, sides=14, axis="z")
    col(vm, 0xcfd3cf)
    chrome.append(vm)
    needle = V.strut((0.065, 0.30, panel_z + 0.015), (0.075, 0.308, panel_z + 0.015), 0.0018, 3, caps=False)
    col(needle, 0x1a1a1a)
    trim.append(needle)
    # indicator lamp (game node `lamp`)
    lamp = V.lathe([(0.0, 0.0), (0.014, 0.0), (0.0155, 0.004), (0.012, 0.010), (0.0, 0.0125)], 14)
    lamp = place(lamp, (0.145, 0.30, panel_z + 0.0085), (90, 0, 0))
    col(lamp, 0xffffff)
    lamp_m.append(lamp)
    lamp_ring = V.cylinder((0.145, 0.30, panel_z + 0.010), 0.0185, 0.006, sides=14, axis="z")
    col(lamp_ring, 0x1c1c1f)
    trim.append(lamp_ring)

    # ---- vents on the back and the muffler end
    back = lambda x, y: np.array([x, y, -0.180])
    for k in range(7):
        yy = 0.20 + 0.032 * k
        sl = V.ribbon(back, [(-0.15, yy), (0.15, yy)], 0.014, off=0.0, ref_fn=V.axis_ref)
        col(sl, 0x08080a)
        trim.append(sl)

    # ---- recoil starter (+X end) and its handle
    rec = V.cylinder((0.262, 0.31, 0.0), 0.090, 0.045, sides=20, axis="x", bevel=0.010)
    col(rec, 0x232427, 0.3, 2)
    trim.append(rec)
    rec_plane = lambda z, y: np.array([0.2848, y, z])
    for k in range(10):
        a = 2 * np.pi * k / 10
        sl = V.ribbon(rec_plane, [(0.046 * np.cos(a), 0.31 + 0.046 * np.sin(a)), (0.078 * np.cos(a), 0.31 + 0.078 * np.sin(a))], 0.011, off=0.0, ref_fn=V.axis_ref)
        col(sl, 0x08080a)
        trim.append(sl)
    cap = V.cylinder((0.289, 0.31, 0.0), 0.030, 0.006, sides=12, axis="x")
    col(cap, 0xb8bbc0)
    chrome.append(cap)
    rope = V.tube_poly([(0.290, 0.31, 0.0), (0.292, 0.22, 0.012), (0.292, 0.18, 0.045)], 0.0035, 4, caps=False)
    col(rope, 0xe0d8b4)
    trim.append(rope)
    hnd = V.cylinder((0.292, 0.17, 0.060), 0.012, 0.085, sides=10, axis="z", bevel=0.004)
    col(hnd, 0xe3b21a)
    trim.append(hnd)

    # ---- muffler (-X end) with heat-shield bands and a tail pipe
    mu = V.cylinder((-0.262, 0.20, -0.04), 0.034, 0.27, sides=14, axis="z", bevel=0.010)
    col(mu, 0x8f9298, 0.3, 4)
    chrome.append(mu)
    for zz in (-0.13, -0.05, 0.03):
        bd = V.cylinder((-0.262, 0.20, zz), 0.0365, 0.010, sides=14, axis="z")
        col(bd, 0x2b2c30)
        trim.append(bd)
    tp = V.cylinder((-0.262, 0.20, 0.115), 0.016, 0.05, sides=10, axis="z", bevel=0.003)
    col(tp, 0x303136)
    trim.append(tp)
    ex_pipe = V.tube_poly([(-0.262, 0.20, 0.135), (-0.262, 0.20, 0.215)], 0.012, 8, caps=False)
    col(ex_pipe, 0x8f9298)
    chrome.append(ex_pipe)
    shield = V.cylinder((-0.262, 0.236, -0.04), 0.011, 0.20, sides=6, axis="z")
    col(shield, 0xc7c9cf)
    chrome.append(shield)

    # ---- antenna (game node)
    base = (-0.20, 0.452, -0.13)
    sw2 = V.cylinder(base, 0.011, 0.012, sides=10)
    col(sw2, 0x17171a)
    ant_trim.append(sw2)
    stalk = V.tube_poly([base, (base[0], base[1] + 0.09, base[2]), (base[0] + 0.004, base[1] + 0.17, base[2])], 0.0032, 5, caps=True)
    col(stalk, 0x17171a)
    ant_trim.append(stalk)
    ball = V.sphere((base[0] + 0.004, base[1] + 0.185, base[2]), (0.0135, 0.0135, 0.0135), 6, 10)
    col(ball, 0xffffff)
    ant_lamp.append(ball)

    m.add(casing, "casing")
    m.add(frame, "frame")
    m.add(trim, "trim")
    m.add(chrome, "chrome")
    m.add(decals, "decal")
    m.add(lamp_m, "lamp", node="lamp", pivot=(0.145, 0.30, panel_z + 0.0085))
    m.add(ant_trim, "trim", node="antenna", pivot=base)
    m.add(ant_lamp, "lamp", node="antenna", pivot=base)

    specs = {
        "casing": Spec(color=(0.694, 0.027, 0.013, 1.0), roughness=0.5, texture="van_paint", tex_args=dict(tone=0xf6f6f6, wear=0.32), uv_m=0.9, smooth_deg=55),
        "frame": Spec(color=(1, 1, 1, 1), roughness=0.38, metallic=0.85, smooth_deg=60),
        "trim": Spec(color=(1, 1, 1, 1), roughness=0.7, smooth_deg=55),
        "chrome": Spec(color=(0.88, 0.89, 0.92, 1), roughness=0.22, metallic=1.0, smooth_deg=55),
        "lamp": Spec(color=(1, 1, 1, 1), roughness=0.3, emissive=(1.0, 0.55, 0.1), emissive_strength=1.5, smooth_deg=60),
        "decal": Spec(color=(1, 1, 1, 1), roughness=1.0, texture="decals_gen", smooth_deg=89),
    }
    return m, specs
