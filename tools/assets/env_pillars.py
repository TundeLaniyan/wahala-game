"""Indestructible concrete pillars (three variants). One baked 512x512 atlas + one material per model.

Shape (footprint 0.90, height 0.78): wide hazard-banded plinth, narrower shaft, overhanging chamfered cap.
Atlas: top tile + three side elevations (front/right/left; the back reuses 'right'), painted per variant."""
from __future__ import annotations

import numpy as np

from env_lib import EnvModel, box_uv, chamfer_prism, obox, polytube, rect_poly, rod, vc_fn, vc_ground, value_noise
from tex_env import (
    PAL,
    Atlas,
    Sheet,
    concrete_sheet,
    cracks,
    drips,
    hazard_band,
    noise2,
    scuffs,
    speckle,
    spray_tag,
    stencil,
    stick_poster,
    weather,
)

H = 0.78
W = 0.90
CAP_TOP = 0.735
CAPW = 0.82
SHAFTW = 0.76
PLINTH_H = 0.17
SHAFT_Y0 = 0.16
CAP_BOT = 0.62
CAP_C = 0.03  # cap chamfer (top and bottom)
TW, TH = 256, 224  # side tile
PPM = TW / W  # pixels per metre (both axes)


def ypx(y: float) -> float:
    return TH - 1 - y * PPM


def _band_shadow(s: Sheet, y0: float, y1: float, k: float, up: bool = True):
    """Soft darkening between two heights (ambient occlusion under overhangs / in creases)."""
    ys = np.arange(s.h)[:, None] + 0.5
    ya, yb = ypx(y1), ypx(y0)
    t = np.clip((ys - ya) / max(yb - ya, 1e-6), 0, 1)
    f = t if up else 1 - t
    s.comp(0x2a251f, np.broadcast_to(f**1.5 * k, (s.h, s.w)))


def _side(seed: int, tone, band_cfg: dict, posters: list, extra=None) -> Sheet:
    s = concrete_sheet(TW, TH, seed, tone, stains=0.5)
    for yy, wd in ((PLINTH_H, 1.3), (CAP_BOT, 1.6), (CAP_TOP - CAP_C, 1.0)):  # formwork lines
        with s.paint(height=-0.3, rough=0.95) as d:
            d.line([(0, ypx(yy)), (TW, ypx(yy))], 0x4a443c, wd, a=0.75)
        with s.paint(height=0.1) as d:
            d.line([(0, ypx(yy) + 1.6), (TW, ypx(yy) + 1.6)], 0xd8d2c4, 0.9, a=0.3)
    weather(s, seed + 1, ground=0.45, ground_h=0.14, streaks=0.5, top_soot=0.25, edge=0.4, tone_dark=0x34312e)
    ys = np.arange(TH)[:, None] + 0.5
    cap = np.clip((ypx(CAP_BOT + 0.02) - ys) / 6, 0, 1) * np.ones((1, TW))
    s.comp(0xd9d3c6, cap * 0.16)  # sun-bleached cap
    # hazard band on the plinth
    b0, b1 = band_cfg["y0"], band_cfg["y1"]
    bh = int(ypx(b0) - ypx(b1))
    band, cov = hazard_band(TW, bh, c2=0x2672d2, stripe=band_cfg.get("stripe", 24), angle=band_cfg.get("angle", 50), seed=seed + 3, wear=band_cfg.get("wear", 0.55))
    y0 = int(ypx(b1))
    region = Sheet(TW, TH)
    region.paste(band, 0, y0)
    cmask = np.zeros((TH, TW))
    cmask[y0 : y0 + bh, :] = cov
    s.comp(region.rgb, cmask, height=0.1, rough=0.7)
    weather(s, seed + 4, ground=0.30, ground_h=0.10, streaks=0.0, top_soot=0.0, edge=0.0, tone_dark=0x34312e)
    for p in posters:
        stick_poster(s, **p)
    if extra:
        extra(s)
    # vertical-edge AO per section (plinth / shaft / cap have different widths: px from tile edge to the solid's edge)
    xs = np.arange(TW)[None, :] + 0.5
    ys_ = np.arange(TH)[:, None] + 0.5
    inset = np.where(ys_ > ypx(PLINTH_H), 3.0, np.where(ys_ > ypx(CAP_BOT), (W - SHAFTW) / 2 * PPM, (W - CAPW) / 2 * PPM))
    dist = np.minimum(xs, TW - xs) - inset
    e = np.clip(1 - np.abs(dist) / 9.0, 0, 1) ** 1.5 * (dist > -9)
    s.comp(0x2a251f, e * 0.20)
    _band_shadow(s, CAP_BOT - 0.09, CAP_BOT, 0.42, up=True)
    _band_shadow(s, PLINTH_H, PLINTH_H + 0.07, 0.34, up=False)
    speckle(s, seed + 7, amount=0.45, density=0.006)
    scuffs(s, seed + 8, n=10)
    return s


def _top(seed: int, extra=None) -> Sheet:
    s = concrete_sheet(256, 256, seed + 20, 0xa59f94, stains=0.3, grit=0.7)
    yy, xx = np.mgrid[0:256, 0:256]
    r = np.maximum(np.abs(xx - 127.5), np.abs(yy - 127.5))  # px from the centre (Chebyshev)
    edge_px = 128.0 - r  # px from the tile edge
    # outer ring: plinth chamfer + ledge collect grime; cap chamfer ring is slightly worn-light
    dirty = np.clip(1 - edge_px / 14.0, 0, 1)
    nn = noise2(256, 256, seed + 24, fx=14, fy=14, octaves=5)
    s.comp(0x34312e, dirty * (0.45 + 0.4 * nn))
    cham = np.clip(1 - np.abs(edge_px - 16.0) / 4.0, 0, 1)
    s.comp(0xcfc8ba, cham * 0.25)
    n = noise2(256, 256, seed + 21, fx=3, fy=3, octaves=4)
    s.comp(0x4d463d, np.clip(n * 1.6 - 0.85, 0, 1) * 0.30)  # rain stains
    speckle(s, seed + 22, amount=0.3, density=0.004)
    scuffs(s, seed + 23, n=18, length=(8, 30))
    if extra:
        extra(s)
    return s


def _build(name, seed, band_cfg, posters_f, posters_r, posters_l, extra_front=None, extra_right=None, extra_left=None, extra_top=None, chip=False, loops=True, rebar=False) -> dict:
    atlas = Atlas(512, 512)
    atlas.add("top", 0, 0, _top(seed, extra_top))
    atlas.add("front", 256, 0, _side(seed + 100, 0xb2ada2, band_cfg, posters_f, extra_front))
    atlas.add("right", 0, 256, _side(seed + 200, 0xb2ada2, band_cfg, posters_r, extra_right))
    atlas.add("left", 256, 256, _side(seed + 300, 0xb2ada2, band_cfg, posters_l, extra_left))
    for k in ("front", "right", "left"):  # tiles are 256x224 on a 256 grid
        x0, y0, x1, y1 = atlas.tiles[k]
        atlas.tiles[k] = (x0, y0, x1, y0 + TH)
    rects = {"+y": atlas.rect("top"), "-y": atlas.rect("top"), "+z": atlas.rect("front"), "+x": atlas.rect("right"), "-x": atlas.rect("left"), "-z": atlas.rect("right")}

    parts = _base_parts(chip, loops)
    if rebar:
        parts += _rebar()
    m = EnvModel(name)
    lo, hi = (-W / 2, 0.0, -W / 2), (W / 2, H, W / 2)
    for mesh in parts:
        mm = box_uv(mesh, lo, hi, rects)
        vc_ground(mm, h=0.15, dark=0.35, seed=seed)
        vc_fn(mm, lambda p: 0.94 + 0.06 * value_noise(p, 8.0, seed + 5))
        m.add(mm)
    return m.export({"main": atlas.mat(normal_strength=0.2)})


def _base_parts(chip: bool, loops: bool):
    shaft = obox((0, (SHAFT_Y0 + CAP_BOT + 0.02) / 2, 0), (SHAFTW, CAP_BOT + 0.02 - SHAFT_Y0, SHAFTW), bevel=0.012, seg=1)
    base = chamfer_prism(rect_poly(W, W), 0.0, PLINTH_H, cb=0.0, ct=0.035)
    if chip:  # the +x/+z corner of the cap has broken away
        c = CAPW / 2
        poly = [(-c, -c), (c, -c), (c, 0.0), (c - 0.10, 0.13), (c - 0.18, 0.25), (c - 0.30, c), (-c, c)]
        cap = chamfer_prism(poly, CAP_BOT, CAP_TOP, cb=CAP_C, ct=CAP_C)
    else:
        cap = chamfer_prism(rect_poly(CAPW, CAPW), CAP_BOT, CAP_TOP, cb=CAP_C, ct=CAP_C)
    parts = [base, shaft, cap]
    if loops:  # precast lifting eyes
        for x in (-0.18, 0.18):
            arch = [(x, 0.725, -0.06), (x, 0.745, -0.06), (x, 0.76, -0.035), (x, 0.768, 0.0), (x, 0.76, 0.035), (x, 0.745, 0.06), (x, 0.725, 0.06)]
            parts.append(polytube(arch, 0.010, 6, caps=False))
    return parts


def _rebar():
    parts = []
    for (x, z, tilt) in [(0.33, 0.13, 12), (0.30, 0.20, -10), (0.265, 0.265, 18), (0.22, 0.325, -6)]:
        top = np.array([x, CAP_BOT + 0.015, z])
        bend = np.array([np.sin(np.radians(tilt)) * 0.04, 0.085, np.cos(np.radians(tilt)) * 0.04])
        parts.append(rod(top + [0, -0.03, 0], top + bend, 0.012, 6))
        parts.append(rod(top + bend, top + bend + np.array([0.03, 0.04, 0.035]), 0.012, 6))
    return parts


# ----------------------------------------------------------------------------- variants

# shaft face spans px x = 28 .. 228 and y = ypx(0.58) .. ypx(0.22)
def pillar_a() -> dict:
    seed = 11
    posters_f = [
        dict(x=30, y=int(ypx(0.59)), w=76, h=96, seed=3, rot=2, kind="concert"),
        dict(x=104, y=int(ypx(0.56)), w=72, h=80, seed=7, rot=-3, kind="sale"),
        dict(x=156, y=int(ypx(0.44)), w=58, h=68, seed=15, rot=4, kind="notice"),
    ]
    posters_r = [dict(x=50, y=int(ypx(0.58)), w=82, h=100, seed=21, rot=-2, kind="sunburst")]

    def num(s):
        stencil(s, "12", (170, ypx(0.42)), 80, 0xf1ead2, "black", a=0.85, squeeze=0.8, wear=0.55, seed=5)

    def num_top(s):
        stencil(s, "A12", (128, 128), 34, 0xf1ead2, "black", a=0.45, squeeze=0.9, wear=0.8, seed=8)

    return _build("prop_pillar_a", seed, dict(y0=0.02, y1=0.14), posters_f, posters_r, [], None, num, None, num_top)


def pillar_b() -> dict:
    seed = 23
    posters_f = [dict(x=34, y=int(ypx(0.58)), w=70, h=88, seed=31, rot=-3, kind="concert")]
    posters_l = [dict(x=40, y=int(ypx(0.59)), w=80, h=96, seed=36, rot=3, kind="type"), dict(x=126, y=int(ypx(0.55)), w=80, h=72, seed=40, rot=-4, kind="stripe")]

    def tag(s):
        spray_tag(s, 4, 100, ypx(0.52), 224, ypx(0.30), 0x151515, 3.6, loops=5)
        spray_tag(s, 8, 102, ypx(0.50), 222, ypx(0.28), 0xff3d7f, 1.3, loops=5)

    def tag_r(s):
        stencil(s, "KEEP", (128, ypx(0.50)), 42, 0xf2b705, "black", a=0.8, squeeze=0.9, wear=0.7, seed=3)
        stencil(s, "CLEAR", (128, ypx(0.34)), 42, 0xf2b705, "black", a=0.8, squeeze=0.9, wear=0.7, seed=4)

    def rust_top(s):
        yy, xx = np.mgrid[0:256, 0:256]
        d = np.sqrt((xx - 256) ** 2 + (yy - 256) ** 2) / 256.0  # rust bleed from the broken (+x,+z) corner
        n = noise2(256, 256, 31, fx=10, fy=10)
        s.comp(0x7a3d1c, np.clip(1 - d * 1.5, 0, 1) * n * 0.7)

    def chip_front(s):
        drips(s, 3, 170, 226, ypx(0.30), 0x7a3d1c, n=6, length=(10, 40), width=2.2)

    return _build("prop_pillar_b", seed, dict(y0=0.02, y1=0.14, stripe=26, angle=40, wear=0.7), posters_f, [], posters_l, chip_front, tag_r, tag, rust_top, chip=True, loops=False, rebar=True)


def pillar_c() -> dict:
    seed = 37
    posters_f = [
        dict(x=26, y=int(ypx(0.59)), w=66, h=84, seed=52, rot=-2, kind="sunburst"),
        dict(x=84, y=int(ypx(0.585)), w=64, h=78, seed=53, rot=3, kind="type"),
        dict(x=146, y=int(ypx(0.59)), w=62, h=82, seed=57, rot=-2, kind="concert"),
        dict(x=52, y=int(ypx(0.45)), w=76, h=54, seed=61, rot=1, kind="stripe"),
        dict(x=156, y=int(ypx(0.40)), w=60, h=54, seed=64, rot=6, kind="notice"),
    ]
    posters_r = [dict(x=70, y=int(ypx(0.52)), w=64, h=76, seed=70, rot=-3, kind="notice")]

    def crack_side(s):
        cracks(s, 12, n=2, length=0.9, width=1.3, start_edge="top")

    def crack_left(s):
        cracks(s, 15, n=2, length=0.8, width=1.3, start_edge="bottom")
        stencil(s, "B7", (128, ypx(0.40)), 68, 0xf2b705, "black", a=0.85, squeeze=0.85, wear=0.6, seed=9)

    def top_extra(s):
        cracks(s, 18, n=3, length=0.7, width=1.5)
        stencil(s, "NO", (128, 100), 30, 0xf1ead2, "black", a=0.4, squeeze=0.9, wear=0.8, seed=2)

    return _build("prop_pillar_c", seed, dict(y0=0.02, y1=0.14, stripe=22, angle=130, wear=0.5), posters_f, posters_r, [], None, crack_side, crack_left, top_extra)


PILLARS = {"prop_pillar_a": pillar_a, "prop_pillar_b": pillar_b, "prop_pillar_c": pillar_c}
