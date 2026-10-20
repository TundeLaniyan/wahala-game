"""Perimeter wall segments, corner posts and the spectator railing section."""
from __future__ import annotations

import numpy as np

from env_lib import EnvModel, box_uv, chamfer_prism, extrude_x, obox, rect_poly, rod, vc_fn, vc_ground, vc_mul, value_noise
from tex_env import (
    PAL,
    Atlas,
    Sheet,
    concrete_sheet,
    cracks,
    drips,
    gblur,
    hazard_band,
    noise2,
    scuffs,
    speckle,
    spray_tag,
    steel_sheet,
    stencil,
    stick_poster,
    tile_x,
    tile_x_arr,
    weather,
)

# ----------------------------------------------------------------------------- wall segment (1.0 long, 0.62 high, 0.30 thick)

WL, WH, WT = 1.0, 0.62, 0.30
FW, FH = 512, 320  # front/back tile (512 px per metre)
PX = 512.0


def wy(y: float) -> float:
    return FH - 1 - y * PX


def _wall_face(seed: int, posters: list, extra=None, band_angle=45, tag=None) -> Sheet:
    s = concrete_sheet(FW, FH, seed, 0xa8a398, stains=0.5)
    tile_x(s)
    for yy, wd in ((0.14, 1.6), (0.555, 1.8)):  # footing top / cap underside
        with s.paint(height=-0.3, rough=0.95) as d:
            d.line([(0, wy(yy)), (FW, wy(yy))], 0x4a443c, wd, a=0.8)
        with s.paint(height=0.1) as d:
            d.line([(0, wy(yy) + 2), (FW, wy(yy) + 2)], 0xd8d2c4, 1.0, a=0.3)
    # panel joint: a thin vertical groove right at the segment ends (neighbours add the other half)
    with s.paint(height=-0.35, rough=0.95) as d:
        d.rect((0, wy(0.555), 2.2, wy(0.14)), 0x3a352e, a=0.9)
        d.rect((FW - 2.2, wy(0.555), FW, wy(0.14)), 0x3a352e, a=0.9)
    weather(s, seed + 1, ground=0.5, ground_h=0.12, streaks=0.55, top_soot=0.3, tone_dark=0x34312e, tile=True)
    ys = np.arange(FH)[:, None] + 0.5
    cap = np.clip((wy(0.555) - ys) / 8, 0, 1) * np.ones((1, FW))
    s.comp(0xd9d3c6, cap * 0.18)
    # hazard band on the footing (stripe pitch divides the 512 px width exactly: 8 colour pairs)
    b0, b1 = 0.022, 0.118
    bh = int(wy(b0) - wy(b1))
    band, cov = hazard_band(FW, bh, stripe=512 / 8 * 0.7071 / 2, angle=band_angle, seed=seed + 3, wear=0.5, tile=True)
    y0 = int(wy(b1))
    region = Sheet(FW, FH)
    region.paste(band, 0, y0)
    cm = np.zeros((FH, FW))
    cm[y0 : y0 + bh, :] = cov
    s.comp(region.rgb, cm, height=0.1, rough=0.7)
    weather(s, seed + 4, ground=0.3, ground_h=0.07, streaks=0.0, top_soot=0.0, tone_dark=0x34312e, tile=True)
    for p in posters:
        stick_poster(s, **p)
    if tag:
        tag(s)
    if extra:
        extra(s)
    speckle(s, seed + 7, amount=0.5, density=0.004)
    scuffs(s, seed + 8, n=22)
    return s


def _wall_top(seed: int) -> Sheet:
    w, h = FW, 160
    s = concrete_sheet(w, h, seed + 30, 0xb0a99c, stains=0.35, grit=0.7)
    tile_x(s)
    yy = (np.arange(h)[:, None] + 0.5) / h * np.ones((1, w))
    edge = np.minimum(yy, 1 - yy)
    s.comp(0x34312e, np.clip(1 - edge / 0.05, 0, 1) * 0.35)  # grimy drip edges
    n = tile_x_arr(noise2(w, h, seed + 31, fx=6, fy=2, octaves=5))
    s.comp(0x4d463d, np.clip(n * 1.6 - 0.85, 0, 1) * 0.35)
    speckle(s, seed + 32, amount=0.35, density=0.004)
    scuffs(s, seed + 33, n=18, length=(10, 40))
    return s


def _wall(name: str, seed: int, posters_f, posters_b, extra_f=None, extra_b=None, tag_f=None) -> dict:
    atlas = Atlas(512, 1024, 0x808080)
    atlas.add("front", 0, 0, _wall_face(seed, posters_f, extra_f, 45, tag_f))
    atlas.add("back", 0, 320, _wall_face(seed + 50, posters_b, extra_b, -45))
    atlas.add("top", 0, 640, _wall_top(seed))

    def rect(nm):  # no padding in u: the atlas is repeat-wrapped and the tile is periodic in x
        x0, y0, x1, y1 = atlas.tiles[nm]
        pad = 3
        return (0.0, 1 - (y1 - pad) / atlas.h, 1.0, 1 - (y0 + pad) / atlas.h)

    rects = {"+z": rect("front"), "-z": rect("back"), "+y": rect("top"), "-y": rect("top"), "+x": rect("top"), "-x": rect("top")}
    footing = extrude_x([(-0.15, 0.0), (0.15, 0.0), (0.15, 0.12), (0.135, 0.14), (-0.135, 0.14), (-0.155, 0.12)], -WL / 2, WL / 2)
    body = extrude_x([(-0.135, 0.13), (0.135, 0.13), (0.135, 0.56), (-0.135, 0.56)], -WL / 2, WL / 2)
    cap = extrude_x([(-0.15, 0.555), (0.15, 0.555), (0.15, 0.59), (0.125, 0.62), (-0.125, 0.62), (-0.155, 0.59)], -WL / 2, WL / 2)
    m = EnvModel(name)
    lo, hi = (-WL / 2, 0.0, -WT / 2), (WL / 2, WH, WT / 2)
    for part in (footing, body, cap):
        mm = box_uv(part, lo, hi, rects)
        vc_ground(mm, 0.12, 0.35, seed)
        m.add(mm)
    return m.export({"main": atlas.mat(normal_strength=0.3)})


def wall_a() -> dict:
    seed = 101
    pf = [dict(x=70, y=int(wy(0.50)), w=100, h=125, seed=201, rot=2, kind="concert"), dict(x=290, y=int(wy(0.47)), w=96, h=104, seed=202, rot=-3, kind="stripe"), dict(x=372, y=int(wy(0.35)), w=70, h=84, seed=203, rot=4, kind="notice")]
    pb = [dict(x=160, y=int(wy(0.50)), w=100, h=120, seed=211, rot=-2, kind="sunburst")]

    def num(s):
        stencil(s, "B4", (262, wy(0.30)), 70, 0xf1ead2, "black", a=0.85, squeeze=0.85, wear=0.6, seed=5)

    return _wall("env_wall", seed, pf, pb, None, num)


def wall_b() -> dict:
    seed = 131
    pf = [dict(x=250, y=int(wy(0.51)), w=104, h=132, seed=231, rot=-2, kind="type")]
    pb = [dict(x=60, y=int(wy(0.50)), w=96, h=120, seed=241, rot=3, kind="sale"), dict(x=300, y=int(wy(0.48)), w=100, h=100, seed=242, rot=-2, kind="concert")]

    def tag(s):
        spray_tag(s, 4, 60, wy(0.46), 230, wy(0.28), 0x151515, 4.0, loops=5)
        spray_tag(s, 9, 62, wy(0.44), 228, wy(0.26), 0xff3d7f, 1.5, loops=5)

    def rust(s):
        drips(s, 5, 330, 440, wy(0.50), 0x7a3d1c, n=7, length=(10, 60), width=2.4)

    return _wall("env_wall_b", seed, pf, pb, rust, None, tag)


def wall_c() -> dict:
    seed = 161
    pf = [dict(x=64, y=int(wy(0.49)), w=90, h=108, seed=251, rot=-3, kind="sunburst"), dict(x=336, y=int(wy(0.50)), w=100, h=116, seed=252, rot=2, kind="concert")]

    def cr(s):
        cracks(s, 22, n=2, length=1.0, width=1.5, start_edge="top")
        stencil(s, "KEEP CLEAR", (256, wy(0.30)), 36, 0xf2b705, "black", a=0.8, squeeze=0.9, wear=0.7, seed=3, spacing=0.05)

    return _wall("env_wall_c", seed, pf, [], cr, cr)


# ----------------------------------------------------------------------------- corner post


def corner() -> dict:
    seed = 181
    PW, PH = 0.42, 0.76
    TWd, THt = 192, 336  # side tile (px) for a 0.42 x 0.76 face -> ~440 px/m
    ppm = TWd / PW

    def ypx(y):
        return THt - 1 - y * ppm * (THt / (PH * ppm))

    def side(sd, posters, extra=None):
        s = concrete_sheet(TWd, THt, sd, 0xa8a398, stains=0.5)
        scale = THt / PH
        yp = lambda y: THt - 1 - y * scale  # noqa: E731
        for yy, wd in ((0.18, 1.3), (0.66, 1.6)):
            with s.paint(height=-0.3, rough=0.95) as d:
                d.line([(0, yp(yy)), (TWd, yp(yy))], 0x4a443c, wd, a=0.75)
        weather(s, sd + 1, ground=0.5, ground_h=0.12, streaks=0.5, top_soot=0.3, edge=0.4, tone_dark=0x34312e)
        b0, b1 = 0.025, 0.15
        bh = int(yp(b0) - yp(b1))
        band, cov = hazard_band(TWd, bh, stripe=20, angle=50, seed=sd + 3, wear=0.5)
        y0 = int(yp(b1))
        reg = Sheet(TWd, THt)
        reg.paste(band, 0, y0)
        cm = np.zeros((THt, TWd))
        cm[y0 : y0 + bh] = cov
        s.comp(reg.rgb, cm, height=0.1, rough=0.7)
        weather(s, sd + 4, ground=0.3, ground_h=0.08, streaks=0.0, top_soot=0.0, tone_dark=0x34312e)
        for p in posters:
            stick_poster(s, **p)
        if extra:
            extra(s, yp)
        xs = np.arange(TWd)[None, :] + 0.5
        e = np.clip(1 - np.minimum(xs, TWd - xs) / 9.0, 0, 1) ** 1.5
        s.comp(0x2a251f, e * 0.2)
        speckle(s, sd + 7, amount=0.4, density=0.006)
        return s

    def num(s, yp):
        stencil(s, "7", (96, yp(0.42)), 120, 0xf1ead2, "black", a=0.85, squeeze=0.85, wear=0.6, seed=5)

    atlas = Atlas(512, 512, 0x808080)
    atlas.add("front", 0, 0, side(seed, [dict(x=34, y=int(THt - 1 - 0.60 * THt / PH), w=76, h=92, seed=301, rot=2, kind="concert")]))
    atlas.add("right", 192, 0, side(seed + 10, [], num))
    top = concrete_sheet(176, 176, seed + 20, 0xa59f94, stains=0.3, grit=0.7)
    yy, xx = np.mgrid[0:176, 0:176]
    edge_px = 88.0 - np.maximum(np.abs(xx - 87.5), np.abs(yy - 87.5))
    top.comp(0x34312e, np.clip(1 - edge_px / 14.0, 0, 1) * 0.5)
    speckle(top, seed + 22, amount=0.3, density=0.004)
    atlas.add("top", 0, 340, top)
    rects = {"+z": atlas.rect("front"), "-z": atlas.rect("right"), "+x": atlas.rect("right"), "-x": atlas.rect("front"), "+y": atlas.rect("top"), "-y": atlas.rect("top")}
    plinth = chamfer_prism(rect_poly(PW, PW), 0.0, 0.18, cb=0.0, ct=0.03)
    shaft = obox((0, 0.42, 0), (0.34, 0.50, 0.34), bevel=0.01, seg=1)
    cap = chamfer_prism(rect_poly(0.46, 0.46), 0.64, PH, cb=0.03, ct=0.04)
    m = EnvModel("env_wall_corner")
    lo, hi = (-PW / 2, 0.0, -PW / 2), (PW / 2, PH, PW / 2)
    for part in (plinth, shaft, cap):
        mm = box_uv(part, lo, hi, rects)
        vc_ground(mm, 0.14, 0.4, seed)
        m.add(mm)
    return m.export({"main": atlas.mat(normal_strength=0.3)})


# ----------------------------------------------------------------------------- spectator railing + kerb


def bleacher() -> dict:
    seed = 211
    atlas = Atlas(512, 512, 0x808080)
    kt = concrete_sheet(512, 256, seed, 0xa8a398, stains=0.5)
    tile_x(kt)
    # painted yellow edge with black blocks along the front lip (period 1/8 m -> divides the length)
    with kt.paint(height=0.1, rough=0.75) as d:
        d.rect((0, 214, 512, 252), 0xf2b705)
        for k in range(0, 8, 2):
            d.rect((k * 64, 214, k * 64 + 64, 252), 0x16161a)
    weather(kt, seed + 1, ground=0.2, ground_h=0.08, streaks=0.2, top_soot=0.0, tone_dark=0x34312e, tile=True)
    speckle(kt, seed + 2, amount=0.4, density=0.005)
    atlas.add("top", 0, 0, kt)
    kf = concrete_sheet(512, 64, seed + 5, 0xa0998d, stains=0.5)
    tile_x(kf)
    weather(kf, seed + 6, ground=0.5, ground_h=0.4, streaks=0.2, top_soot=0.0, tone_dark=0x34312e, tile=True)
    with kf.paint(height=0.1) as d:
        d.rect((0, 0, 512, 16), 0xf2b705)
        for k in range(0, 8, 2):
            d.rect((k * 64, 0, k * 64 + 64, 16), 0x16161a)
    atlas.add("front", 0, 262, kf)
    st = steel_sheet(256, 64, seed + 9, tone=0xb0b4b8, rust=0.45)
    atlas.add("steel", 0, 336, st)

    def rect(nm):
        x0, y0, x1, y1 = atlas.tiles[nm]
        return (0.0, 1 - (y1 - 3) / atlas.h, 1.0, 1 - (y0 + 3) / atlas.h)

    m = EnvModel("env_bleacher")
    kerb = extrude_x([(-0.26, 0.0), (0.26, 0.0), (0.26, 0.10), (0.235, 0.12), (-0.26, 0.12)], -0.5, 0.5)
    kb = box_uv(kerb, (-0.5, 0, -0.26), (0.5, 0.12, 0.26), {"+y": rect("top"), "+z": rect("front"), "-z": rect("front"), "+x": rect("front"), "-x": rect("front"), "-y": rect("top")})
    vc_ground(kb, 0.05, 0.3, seed)
    m.add(kb)
    sr = atlas.rect("steel")
    S = lambda mesh: vc_ground(box_uv(mesh, mesh.v.min(axis=0), mesh.v.max(axis=0), sr), 0.14, 0.3, seed)  # noqa: E731
    zf = 0.19
    for x in (-0.25, 0.25):  # posts with base plates
        m.add(S(rod((x, 0.12, zf), (x, 0.62, zf), 0.016, 6)))
        m.add(S(obox((x, 0.126, zf), (0.07, 0.012, 0.07))))
    for y in (0.60, 0.40):  # rails run through the ends so neighbouring sections join up
        m.add(S(rod((-0.5, y, zf), (0.5, y, zf), 0.012, 6)))
    for x in np.linspace(-0.45, 0.45, 5):  # vertical pickets
        m.add(S(rod((x, 0.12, zf), (x, 0.60, zf), 0.006, 4, caps=False)))
    return m.export({"main": atlas.mat(normal_strength=0.35)})


WALLS = {"env_wall": wall_a, "env_wall_b": wall_b, "env_wall_c": wall_c, "env_wall_corner": corner, "env_bleacher": bleacher}
