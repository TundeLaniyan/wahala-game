"""Destructible 'soft block' props for the newer arenas (one atlas + one material each, so the game can instance them):

    prop_soft_cabledrum   power yard / roadworks: a wooden cable drum on its side wound with black cable, a coil beside it
    prop_soft_drums       Third Mainland / power yard / jetty: a cluster of ribbed oil drums, one a red-white checkpoint drum
    prop_soft_fishcrates  Lagoon Jetty: stacked plastic fish crates with a rolled net and floats on top

All about 0.85-1.0 m tall (characters are drawn 1.86), filling most of the tile."""
from __future__ import annotations

import numpy as np

from env_lib import EnvModel, bevel_box, box_uv, cyl_uv, flat_uv, lathe, obox, place, polytube, rod, torus, vc_ground, vc_mul
from tex_env import Atlas, Sheet, noise2, plastic_sheet, speckle, steel_sheet, stencil, weather, wood_sheet

Q = dict(jpeg_q=74, normal_q=66, orm_q=60)


# ============================================================================ cable drum

def soft_cabledrum() -> dict:
    seed = 701
    atlas = Atlas(512, 512, 0x806040)
    planks = wood_sheet(256, 256, seed, 0x9a7448, "y", wear=0.7, knots=2, gap=3)
    stencil(planks, "NCC 240MM", (128, 92), 22, 0x1a1a1a, "black", a=0.75, squeeze=0.9, wear=0.6, seed=2)
    stencil(planks, "DRUM 17", (128, 170), 26, 0xc0392b, "black", a=0.7, squeeze=0.9, wear=0.6, seed=3)
    atlas.add("flange", 0, 0, planks)
    edge = wood_sheet(256, 48, seed + 1, 0x7a5a38, "x", wear=0.8, knots=1, gap=0)
    atlas.add("edge", 256, 0, edge)
    cable = Sheet(256, 128, 0x1a1a1c, rough=0.55)
    ys = np.arange(128)[:, None] * np.ones((1, 256))
    cable.rgb = cable.rgb * (0.7 + 0.5 * np.abs(np.sin(ys * 0.55)))[..., None]
    cable.hgt = 0.5 + 0.4 * np.abs(np.sin(ys * 0.55))
    cable.comp(0x6a5a48, np.clip(noise2(256, 128, seed + 2, fx=6, fy=3) * 1.6 - 0.9, 0, 1) * 0.5)  # dust
    atlas.add("cable", 256, 64, cable)
    bolt = steel_sheet(64, 64, seed + 3, tone=0x6a6a66, rust=0.8)
    atlas.add("bolt", 256, 200, bolt)
    m = EnvModel("prop_soft_cabledrum")
    R, r_core, half = 0.41, 0.23, 0.3  # flange radius, barrel radius, half width along x
    # two plank flanges (x axis), the barrel wound with cable, an axle bolt
    for sx in (-1, 1):
        fl = rod((sx * (half + 0.05), R, 0), (sx * half, R, 0), R, 18)
        fl = cyl_uv(fl, (0, R, 0), atlas.rect("edge"), "x", cap_rect=atlas.rect("flange"))
        vc_ground(fl, 0.12, 0.45, seed)
        m.add(fl)
    for k in range(7):  # wound cable layers
        x = -half + 0.04 + k * (2 * half - 0.08) / 6
        t = torus((x, R, 0), r_core + 0.07, 0.045, 14, 6, axis="x")
        m.add(vc_ground(cyl_uv(t, (0, R, 0), atlas.rect("cable"), "x"), 0.1, 0.4, seed))
    ax = rod((-half - 0.09, R, 0), (half + 0.09, R, 0), 0.05, 8)
    m.add(flat_uv(ax, atlas.rect("bolt")))
    # the loose cable end hanging down the front to the ground
    tail = polytube([(half - 0.06, R + r_core + 0.08, 0.06), (half - 0.02, R + 0.12, 0.3), (half - 0.05, 0.12, 0.38), (half - 0.2, 0.04, 0.4)], 0.04, 6)
    m.add(flat_uv(tail, atlas.rect("cable")))
    return m.export({"main": atlas.mat(normal_strength=0.6, **Q)})


# ============================================================================ oil / checkpoint drums

def _drum_tile(seed: int, tone, stripes: bool = False, text: str | None = None) -> Sheet:
    s = steel_sheet(256, 256, seed, tone=tone, rust=0.7, paint=tone)
    if stripes:
        with s.paint(height=0.05, rough=0.4) as d:
            for y in (40, 120, 200):
                d.rect((0, y, 256, y + 34), 0xf1ead2)
    if text:
        stencil(s, text, (128, 112), 30, 0xf1ead2, "black", a=0.85, squeeze=0.9, wear=0.55, seed=seed + 1)
    weather(s, seed + 2, ground=0.6, ground_h=0.25, streaks=0.35, top_soot=0.2, tone_dark=0x2a2018)
    speckle(s, seed + 3, amount=0.3, density=0.004)
    return s


def drum_mesh(atlas: Atlas, tile: str, lid: str, pos, yaw=0.0, h=0.88, r=0.2, tilt=(0.0, 0.0)) -> list:
    # rolled ribs at 1/3 and 2/3 and rims top and bottom
    prof = [(0.0, 0.0), (r - 0.012, 0.0), (r, 0.015), (r, h * 0.32), (r + 0.012, h * 0.335), (r, h * 0.35), (r, h * 0.65), (r + 0.012, h * 0.665), (r, h * 0.68), (r, h - 0.015), (r - 0.006, h), (0.0, h)]
    d = lathe(prof, 16)
    d = cyl_uv(d, (0, 0, 0), atlas.rect(tile), "y", v_range=(0, h), cap_rect=atlas.rect(lid))
    vc_ground(d, 0.12, 0.45, 7)
    return [place(d, pos, (tilt[0], yaw, tilt[1]))]


def soft_drums() -> dict:
    seed = 731
    atlas = Atlas(512, 512, 0x604030)
    atlas.add("red", 0, 0, _drum_tile(seed, 0xa8322a, stripes=True))
    atlas.add("blue", 256, 0, _drum_tile(seed + 10, 0x2a4a7a, text="FUEL"))
    atlas.add("rust", 0, 256, _drum_tile(seed + 20, 0x5a3a24))
    lid = steel_sheet(128, 128, seed + 30, tone=0x55524c, rust=0.6)
    yy, xx = np.mgrid[0:128, 0:128]
    lid.comp(0x1e1a16, (np.abs(np.hypot(xx - 64, yy - 64) - 56) < 3).astype(float) * 0.8)
    lid.comp(0x1e1a16, (np.hypot(xx - 88, yy - 52) < 7).astype(float) * 0.9)  # bung
    atlas.add("lid", 256, 256, lid)
    m = EnvModel("prop_soft_drums")
    for part in drum_mesh(atlas, "red", "lid", (-0.2, 0, -0.17), 20):
        m.add(part)
    for part in drum_mesh(atlas, "blue", "lid", (0.21, 0, -0.15), 140, h=0.84):
        m.add(part)
    # a dented drum lying on its side in front (axis along x)
    for part in drum_mesh(atlas, "rust", "lid", (0.0, 0.0, 0.0), 0, h=0.72, r=0.18):
        part.v = part.v - np.array([0, 0.36, 0])
        part = place(part, (0.0, 0.18, 0.0), (0, 0, 90))
        part = place(part, (0.0, 0.0, 0.25), (0, 6, 0))
        m.add(part)
    return m.export({"main": atlas.mat(normal_strength=0.5, **Q)})


# ============================================================================ fish crates + net

def soft_fishcrates() -> dict:
    seed = 761
    atlas = Atlas(512, 512, 0x405060)

    def crate_tile(sd, tone):
        s = plastic_sheet(256, 96, sd, tone, rough=0.5, grime=0.55)
        with s.paint(height=-0.5, rough=0.9) as d:
            for ix in range(7):
                d.rect((14 + ix * 34, 22, 34 + ix * 34, 70), 0x0c1418, r=4)
        weather(s, sd + 1, ground=0.5, ground_h=0.4, streaks=0.3, top_soot=0.0, tone_dark=0x2a3a2e)  # lagoon slime
        return s

    atlas.add("blue", 0, 0, crate_tile(seed, 0x2b6aa8))
    atlas.add("red", 256, 0, crate_tile(seed + 10, 0xb0402e))
    atlas.add("green", 0, 100, crate_tile(seed + 20, 0x3a7a4a))
    inner = Sheet(128, 128, 0x14181a, rough=0.8)
    atlas.add("inner", 256, 100, inner)
    net = Sheet(256, 128, 0x2e4a3a, rough=0.9)
    ys, xs = np.mgrid[0:128, 0:256]
    mesh = ((xs + ys) % 14 < 3) | ((xs - ys) % 14 < 3)
    net.comp(0x7a9a6a, mesh.astype(float) * 0.85, height=0.3)
    net.comp(0x101410, noise2(256, 128, seed + 3, fx=6, fy=3) * 0.5)
    atlas.add("net", 0, 200, net)
    fl = plastic_sheet(64, 64, seed + 4, 0xe86a1a, rough=0.4)
    atlas.add("float", 256, 240, fl)
    m = EnvModel("prop_soft_fishcrates")
    rng = np.random.default_rng(seed)

    def crate(tile, pos, yaw, size=(0.6, 0.27, 0.4)):
        w, h, d = size
        rects = {k: atlas.rect(tile) for k in ("+x", "-x", "+z", "-z")}
        rects["+y"] = rects["-y"] = atlas.rect("inner")
        c = bevel_box((0, h / 2, 0), size, 0.02, 1)
        c = box_uv(c, (-w / 2, 0, -d / 2), (w / 2, h, d / 2), rects)
        vc_mul(c, (1, 1, 1), rng.uniform(0.88, 1.05))
        vc_ground(c, 0.1, 0.4, seed)
        m.add(place(c, pos, (0, yaw, 0)))

    crate("blue", (-0.1, 0.0, 0.18), 3)
    crate("red", (-0.12, 0.27, 0.17), -4)
    crate("blue", (-0.09, 0.54, 0.19), 6)
    crate("green", (0.12, 0.0, -0.2), 92, size=(0.58, 0.27, 0.4))
    crate("red", (0.13, 0.27, -0.19), 86, size=(0.58, 0.27, 0.4))
    # a rolled net slung over the top and floats
    roll = rod((-0.36, 0.0, 0.0), (0.36, 0.0, 0.0), 0.12, 10)
    roll = cyl_uv(roll, (0, 0, 0), atlas.rect("net"), "x")
    m.add(vc_ground(place(roll, (0.0, 0.93, 0.06), (0, 18, 0)), 0.05, 0.2, seed))
    drape = rod((0.0, 0.0, 0.0), (0.0, -0.4, 0.0), 0.09, 8, r2=0.14)
    drape = cyl_uv(drape, (0, 0, 0), atlas.rect("net"), "y")
    m.add(place(drape, (0.33, 0.84, 0.14), (8, 0, 6)))
    for (x, y, z) in [(-0.3, 1.0, -0.05), (0.26, 0.6, -0.42), (0.36, 0.32, 0.3)]:
        b = lathe([(0.0, -0.07), (0.06, -0.06), (0.08, 0.0), (0.06, 0.06), (0.0, 0.07)], 10)
        m.add(place(cyl_uv(b, (0, 0, 0), atlas.rect("float"), "y"), (x, y, z), (90, 0, 0)))
    return m.export({"main": atlas.mat(normal_strength=0.7, **Q)})


SOFT_CITY = {"prop_soft_cabledrum": soft_cabledrum, "prop_soft_drums": soft_drums, "prop_soft_fishcrates": soft_fishcrates}
