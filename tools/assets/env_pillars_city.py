"""Per-arena permanent blockers ("pillars"): one family per Lagos arena, all about character height (1.35-1.78 m,
characters are drawn 1.86) and filling most of the tile, so they read as heavy, permanent obstacles.

    prop_pillar_market    Balogun Market: plastered sandcrete stall pier, rusted corrugated collar, timber bracket
    prop_pillar_column    Lekki Roadworks: unfinished cast column, rebar cage, half-stripped plywood formwork, tape
    prop_pillar_pier      Oshodi Interchange: flyover pier with a flared capital, drainage stains and bills
    prop_pillar_wallstub  Ajegunle Backstreets: broken sandcrete compound-wall stub with peeling render, iron rods
    prop_pillar_bollard   Lagoon Jetty: tarred timber piles lashed with rope on a pad with a cast-iron bollard
    prop_pillar_cabinet   Surulere Power Yard: steel transformer cabinet with fins on a concrete plinth
    prop_pillar_kiosk     Yaba After Dark: shuttered steel kiosk with a painted sign and a neon trim
    prop_pillar_jersey    Third Mainland: two stacked concrete jersey barriers with worn red/white paint

Each model = one material and one baked atlas (game instances it). Texts on signs are fictional.
Conventions: Y-up, metres, front = +Z, origin on the ground at the footprint centre."""
from __future__ import annotations

import numpy as np

from env_lib import EnvModel, box_uv, chamfer_prism, cyl_uv, extrude_x, lathe, obox, polytube, rect_poly, rod, vc_fn, vc_ground, vc_mul, value_noise
from tex_env import (
    Atlas,
    Sheet,
    concrete_sheet,
    corrugated_panel,
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
    weather,
    wood_sheet,
)

Q = dict(jpeg_q=72, normal_q=66, orm_q=60)  # keeps every pillar around 100-190 KB


# ----------------------------------------------------------------------------- helpers


def octo(w: float, c: float, d: float | None = None):
    """Rectangle w x d with chamfered corners (convex, counter-clockwise)."""
    hx, hz = w / 2, (w if d is None else d) / 2
    return [(-hx + c, -hz), (hx - c, -hz), (hx, -hz + c), (hx, hz - c), (hx - c, hz), (-hx + c, hz), (-hx, hz - c), (-hx, -hz + c)]


class Elev:
    """A side elevation tile: `ppm` pixels per metre on both axes, y measured up from the ground."""

    def __init__(self, w_m: float, h_m: float, ppm: float):
        self.ppm = ppm
        self.w = int(round(w_m * ppm))
        self.h = int(np.ceil(h_m * ppm)) + 2

    def y(self, metres: float) -> float:
        return self.h - 1 - metres * self.ppm

    def x(self, metres_from_left: float) -> float:
        return metres_from_left * self.ppm


def band_shadow(s: Sheet, e: Elev, y0: float, y1: float, k: float, up: bool = True, tone=0x2a251f):
    """Soft occlusion between two heights (under an overhang / in a crease)."""
    ys = np.arange(s.h)[:, None] + 0.5
    ya, yb = e.y(y1), e.y(y0)
    t = np.clip((ys - ya) / max(yb - ya, 1e-6), 0, 1)
    f = t if up else 1 - t
    s.comp(tone, np.broadcast_to(f**1.5 * k, (s.h, s.w)))


def hline(s: Sheet, e: Elev, y: float, color=0x4a443c, width=1.4, a=0.75):
    with s.paint(height=-0.3, rough=0.95) as d:
        d.line([(0, e.y(y)), (s.w, e.y(y))], color, width, a=a)


def paste_band(s: Sheet, e: Elev, y0: float, y1: float, seed: int, c1=0xf2b705, c2=0x16161a, stripe=22, angle=45, wear=0.3):
    bh = int(e.y(y0) - e.y(y1))
    band, cov = hazard_band(s.w, bh, c1=c1, c2=c2, stripe=stripe, angle=angle, seed=seed, wear=wear)
    top = int(e.y(y1))
    reg = Sheet(s.w, s.h)
    reg.paste(band, 0, top)
    m = np.zeros((s.h, s.w))
    m[top : top + bh] = cov
    s.comp(reg.rgb, m, height=0.1, rough=0.7)


def finish(m: EnvModel, mesh, rects, lo, hi, seed: int, ground_h: float = 0.16, dark: float = 0.38):
    mm = box_uv(mesh, lo, hi, rects)
    vc_ground(mm, h=ground_h, dark=dark, seed=seed)
    vc_fn(mm, lambda p: 0.93 + 0.07 * value_noise(p, 7.0, seed + 5))
    m.add(mm)
    return mm


def side_rects(atlas: Atlas, front: str, right: str, left: str, top: str, back: str | None = None):
    return {"+z": atlas.rect(front), "-z": atlas.rect(back or right), "+x": atlas.rect(right), "-x": atlas.rect(left), "+y": atlas.rect(top), "-y": atlas.rect(top)}


def top_tile(seed: int, size: int = 192, tone=0xcfc8bb, grime=0.35, extra=None) -> Sheet:
    s = concrete_sheet(size, size, seed, tone, stains=0.3, grit=0.6)
    yy, xx = np.mgrid[0:size, 0:size]
    edge = size / 2 - np.maximum(np.abs(xx - size / 2 + 0.5), np.abs(yy - size / 2 + 0.5))
    n = noise2(size, size, seed + 1, fx=8, fy=8)
    s.comp(0x3a342c, np.clip(1 - edge / (size * 0.08), 0, 1) * grime * (0.6 + 0.4 * n))
    s.comp(0x5a5248, np.clip(n * 1.6 - 0.9, 0, 1) * 0.3)
    speckle(s, seed + 2, amount=0.3, density=0.004)
    if extra:
        extra(s)
    return s


# ============================================================================ Balogun Market: stall pier

def pillar_market() -> dict:
    seed = 401
    W, H = 0.80, 1.60
    e = Elev(W, H, 300)
    atlas = Atlas(1024, 512, 0x808080)

    def plaster(sd, posters, extra=None):
        s = concrete_sheet(e.w, e.h, sd, 0xc9b58f, stains=0.55)  # ochre-washed render
        # the wash has flaked off in patches, showing grey sandcrete with block joints
        n = noise2(e.w, e.h, sd + 3, fx=4, fy=6, octaves=6, beta=1.7)
        bare = np.clip(n * 2.4 - 1.35, 0, 1)
        blocks = Sheet(e.w, e.h)
        blocks.rgb = concrete_sheet(e.w, e.h, sd + 9, 0x8d877c, stains=0.3).rgb
        ys, xs = np.mgrid[0 : e.h, 0 : e.w]
        course = (ys / (0.225 * e.ppm)).astype(int)
        joint = ((ys % (0.225 * e.ppm)) < 3) | (((xs + (course % 2) * 0.22 * e.ppm) % (0.45 * e.ppm)) < 3)
        blocks.rgb[joint] *= 0.55
        s.comp(blocks.rgb, bare, height=-0.15, rough=0.95)
        s.comp(0x7a6a52, gblur((bare > 0.05).astype(float) - bare, 1.2).clip(0, 1) * 0.5)
        weather(s, sd + 1, ground=0.5, ground_h=0.16, streaks=0.4, top_soot=0.15, edge=0.15, tone_dark=0x3a2e22)
        for p in posters:
            stick_poster(s, **p)
        if extra:
            extra(s)
        speckle(s, sd + 7, amount=0.45, density=0.005)
        scuffs(s, sd + 8, n=12)
        band_shadow(s, e, H - 0.22, H - 0.1, 0.35)
        return s

    def fr(s):
        stencil(s, "NO PARKING", (e.w / 2, e.y(0.42)), 30, 0xf1ead2, "black", a=0.8, squeeze=0.85, wear=0.6, seed=4)
        spray_tag(s, 11, 20, e.y(1.38), e.w - 30, e.y(1.18), 0x1a1a1a, 2.6, loops=4)

    def rt(s):
        stencil(s, "C47", (e.w / 2, e.y(1.3)), 64, 0xd8473a, "black", a=0.8, squeeze=0.85, wear=0.55, seed=6)

    atlas.add("front", 0, 0, plaster(seed, [dict(x=36, y=int(e.y(1.30)), w=96, h=138, seed=411, rot=3, kind="sale"), dict(x=130, y=int(e.y(1.24)), w=86, h=118, seed=412, rot=-4, kind="type")], fr))
    atlas.add("right", 248, 0, plaster(seed + 20, [dict(x=60, y=int(e.y(0.98)), w=90, h=124, seed=413, rot=-2, kind="notice")], rt))
    atlas.add("left", 496, 0, plaster(seed + 40, [dict(x=40, y=int(e.y(1.32)), w=100, h=136, seed=414, rot=2, kind="concert")]))
    atlas.add("top", 744, 0, top_tile(seed, 192, 0xb8a888))
    sheet = corrugated_panel(256, 128, seed + 3, 0x8a6a4c, ribs=10, rust=0.85, wear=0.75)
    atlas.add("tin", 744, 200, sheet)
    wood = wood_sheet(256, 64, seed + 5, 0x7a5434, "x", wear=0.7, knots=2, gap=0)
    atlas.add("wood", 744, 336, wood)

    m = EnvModel("prop_pillar_market")
    lo, hi = (-W / 2, 0, -W / 2), (W / 2, H, W / 2)
    R = side_rects(atlas, "front", "right", "left", "top")
    finish(m, chamfer_prism(rect_poly(0.84, 0.84), 0.0, 0.14, ct=0.02), R, (-0.42, 0, -0.42), (0.42, H, 0.42), seed)
    finish(m, chamfer_prism(octo(0.74, 0.03), 0.13, H - 0.12), R, (-0.37, 0, -0.37), (0.37, H, 0.37), seed)
    finish(m, chamfer_prism(rect_poly(0.82, 0.82), H - 0.12, H, cb=0.02, ct=0.02), R, (-0.41, 0, -0.41), (0.41, H, 0.41), seed)
    # rusted corrugated collar nailed round the middle (stall posts in the market wear the same)
    tin = {k: atlas.rect("tin") for k in ("+x", "-x", "+z", "-z", "+y", "-y")}
    finish(m, chamfer_prism(rect_poly(0.80, 0.80), 0.62, 1.04, cb=0.01, ct=0.01), tin, (-0.4, 0.62, -0.4), (0.4, 1.04, 0.4), seed)
    # a timber stall bracket and a short rafter stub on the north face
    wr = {k: atlas.rect("wood") for k in ("+x", "-x", "+z", "-z", "+y", "-y")}
    finish(m, obox((0, 1.30, -0.40), (0.62, 0.09, 0.07)), wr, (-0.31, 1.25, -0.44), (0.31, 1.35, -0.36), seed)
    finish(m, obox((0.22, 1.12, -0.40), (0.07, 0.36, 0.06), rot=(0, 0, 18)), wr, (0.18, 0.94, -0.43), (0.26, 1.30, -0.37), seed)
    return m.export({"main": atlas.mat(normal_strength=0.35, **Q)})


# ============================================================================ Lekki Roadworks: unfinished column

def pillar_column() -> dict:
    seed = 431
    W, H = 0.64, 1.52
    e = Elev(W, H, 320)
    atlas = Atlas(1024, 512, 0x808080)

    def raw(sd, extra=None):
        s = concrete_sheet(e.w, e.h, sd, 0xa9a59c, stains=0.55)
        # board-marked formwork: horizontal plank imprints, a lift joint and honeycombing at the base
        for k in range(int(H / 0.15) + 1):
            hline(s, e, k * 0.15 + 0.02, 0x5a554c, 1.0, a=0.35)
        hline(s, e, 0.76, 0x3c3832, 2.2, a=0.8)
        n = noise2(e.w, e.h, sd + 4, fx=10, fy=6, octaves=6, beta=1.3)
        ys = (np.arange(e.h)[:, None] + 0.5) / e.h
        honey = np.clip(n * 2.2 - 1.2, 0, 1) * np.clip((ys - 0.82) / 0.1, 0, 1)
        s.comp(0x2e2a24, honey * 0.8, height=-0.3, rough=1.0)
        weather(s, sd + 1, ground=0.55, ground_h=0.18, streaks=0.55, top_soot=0.05, edge=0.2, tone_dark=0x3a342c)
        drips(s, sd + 2, 6, e.w - 6, e.y(H - 0.02), 0x6e3a1c, n=6, length=(20, 90), width=2.2)  # rust run-off from the cage
        if extra:
            extra(s)
        speckle(s, sd + 7, amount=0.6, density=0.006)
        return s

    def mark(s):
        stencil(s, "C-12", (e.w / 2, e.y(1.18)), 54, 0xd23a2a, "black", a=0.85, squeeze=0.85, wear=0.5, seed=3)
        with s.paint(height=0.02) as d:  # survey cross and level line in spray paint
            d.line([(30, e.y(1.0)), (e.w - 30, e.y(1.0))], 0xd23a2a, 2.0, a=0.8)

    atlas.add("front", 0, 0, raw(seed, mark))
    atlas.add("right", 210, 0, raw(seed + 20, lambda s: cracks(s, 9, n=2, length=0.7, width=1.3, start_edge="top")))
    atlas.add("left", 420, 0, raw(seed + 40))
    atlas.add("top", 630, 0, top_tile(seed, 192, 0xa29e95, 0.5))
    ply = wood_sheet(256, 256, seed + 6, 0xb08a5a, "y", wear=0.8, knots=1, gap=0)
    stencil(ply, "SITE 4", (128, 90), 34, 0x1a1a1a, "black", a=0.7, squeeze=0.9, wear=0.6, seed=2)
    atlas.add("ply", 630, 200, ply)
    rust = steel_sheet(128, 64, seed + 7, tone=0x6e4a32, rust=1.0)
    atlas.add("rust", 830, 0, rust)
    tape, _ = hazard_band(256, 32, c1=0xe23b2b, c2=0xf1ead2, stripe=14, angle=0, seed=seed + 8, wear=0.15, border=False)
    atlas.add("tape", 630, 470, tape)
    footing = concrete_sheet(192, 64, seed + 9, 0x8e8a82, stains=0.7)
    weather(footing, seed + 10, ground=0.7, ground_h=0.5, streaks=0.0, top_soot=0.0, tone_dark=0x2e2a24)
    atlas.add("footing", 830, 80, footing)

    m = EnvModel("prop_pillar_column")
    R = side_rects(atlas, "front", "right", "left", "top")
    F = {k: atlas.rect("footing") for k in ("+x", "-x", "+z", "-z")}
    F["+y"] = F["-y"] = atlas.rect("top")
    # mass footing (spoil-stained), the cast shaft
    finish(m, chamfer_prism(rect_poly(0.88, 0.88), 0.0, 0.16, ct=0.025), F, (-0.44, 0, -0.44), (0.44, 0.16, 0.44), seed, 0.2, 0.5)
    finish(m, chamfer_prism(octo(W, 0.02), 0.15, H), R, (-W / 2, 0, -W / 2), (W / 2, H, W / 2), seed)
    # half-stripped plywood formwork leaning on the south-east and west faces, held by a timber waler
    P = {k: atlas.rect("ply") for k in ("+x", "-x", "+z", "-z", "+y", "-y")}
    finish(m, obox((0.06, 0.62, W / 2 + 0.03), (0.54, 1.0, 0.025), rot=(-4, 0, 2)), P, (-0.21, 0.12, 0.3), (0.33, 1.12, 0.36), seed)
    finish(m, obox((-W / 2 - 0.03, 0.48, 0.0), (0.025, 0.74, 0.6), rot=(0, 0, -5)), P, (-0.36, 0.1, -0.3), (-0.33, 0.85, 0.3), seed)
    finish(m, obox((0.0, 0.98, W / 2 + 0.06), (0.74, 0.07, 0.06)), P, (-0.37, 0.95, 0.42), (0.37, 1.02, 0.48), seed)
    # warning tape round the column
    T = {k: atlas.rect("tape") for k in ("+x", "-x", "+z", "-z", "+y", "-y")}
    finish(m, chamfer_prism(octo(W + 0.016, 0.03), 0.30, 0.36), T, (-0.33, 0.30, -0.33), (0.33, 0.36, 0.33), seed)
    # the rebar cage sticking out of the top: starter bars with bent ends and two stirrups
    rr = atlas.rect("rust")
    rng = np.random.default_rng(seed)
    for (x, z) in [(-0.22, -0.22), (0.22, -0.22), (-0.22, 0.22), (0.22, 0.22), (0.0, -0.22), (0.0, 0.22), (-0.22, 0.0), (0.22, 0.0)]:
        h = 0.32 + rng.uniform(-0.06, 0.08)
        lean = rng.uniform(-0.05, 0.05, 2)
        top = (x + lean[0], H + h, z + lean[1])
        bar = rod((x, H - 0.05, z), top, 0.016, 5)
        hook = rod(top, (top[0] + np.sign(x or 0.1) * 0.05, top[1] + 0.03, top[2] + np.sign(z or 0.1) * 0.04), 0.016, 5)
        for b in (bar, hook):
            m.add(box_uv(b, b.v.min(axis=0), b.v.max(axis=0), rr))
    for yy in (H + 0.08, H + 0.2):
        ring = [(-0.23, yy, -0.23), (0.23, yy, -0.23), (0.23, yy, 0.23), (-0.23, yy, 0.23), (-0.23, yy, -0.23)]
        st = polytube(ring, 0.009, 4)
        m.add(box_uv(st, st.v.min(axis=0), st.v.max(axis=0), rr))
    return m.export({"main": atlas.mat(normal_strength=0.45, **Q)})


# ============================================================================ Oshodi Interchange: flyover pier

def pillar_pier() -> dict:
    seed = 461
    W, H = 0.80, 1.78
    e = Elev(0.88, H, 280)
    atlas = Atlas(1024, 512, 0x808080)

    def face(sd, posters, extra=None):
        s = concrete_sheet(e.w, e.h, sd, 0xb2aca1, stains=0.6)
        for yy in (0.18, 1.38, 1.52, 1.64):
            hline(s, e, yy, 0x3e3a34, 1.6, a=0.7)
        # long drainage stains from the deck above and from the bearing shelf
        n = noise2(e.w, e.h, sd + 3, fx=2, fy=12, octaves=5, beta=2.0)
        ys = (np.arange(e.h)[:, None] + 0.5) / e.h
        streak = np.clip(n * 2.2 - 1.15, 0, 1) * (1.1 - ys)
        s.comp(0x2e2a24, gblur(streak, 1.0) * 0.75)
        weather(s, sd + 1, ground=0.45, ground_h=0.12, streaks=0.5, top_soot=0.25, edge=0.12, tone_dark=0x34302a)
        for p in posters:
            stick_poster(s, **p)
        if extra:
            extra(s)
        speckle(s, sd + 7, amount=0.5, density=0.005)
        scuffs(s, sd + 8, n=16)
        band_shadow(s, e, 1.30, 1.38, 0.35)
        return s

    def num(s):
        stencil(s, "P14", (e.w / 2, e.y(1.22)), 52, 0xf1ead2, "black", a=0.85, squeeze=0.85, wear=0.5, seed=4)
        spray_tag(s, 12, 30, e.y(0.62), e.w - 40, e.y(0.38), 0x151515, 3.2, loops=5)
        spray_tag(s, 13, 34, e.y(0.60), e.w - 44, e.y(0.36), 0x2a8a3a, 1.2, loops=5)

    def bills(s):
        stencil(s, "POST NO BILL", (e.w / 2, e.y(0.30)), 22, 0xf1ead2, "black", a=0.85, squeeze=0.9, wear=0.6, seed=7, spacing=0.05)

    pf = [dict(x=24, y=int(e.y(1.18)), w=84, h=120, seed=471, rot=-2, kind="concert"), dict(x=104, y=int(e.y(1.14)), w=82, h=112, seed=472, rot=3, kind="sale"), dict(x=150, y=int(e.y(0.92)), w=70, h=96, seed=473, rot=-5, kind="notice")]
    atlas.add("front", 0, 0, face(seed, pf, bills))
    atlas.add("right", 250, 0, face(seed + 20, [], num))
    atlas.add("left", 500, 0, face(seed + 40, [dict(x=60, y=int(e.y(1.2)), w=96, h=128, seed=474, rot=2, kind="sunburst")]))
    atlas.add("top", 750, 0, top_tile(seed, 192, 0xa8a297, 0.5))
    pad = concrete_sheet(192, 96, seed + 9, 0x8a857c, stains=0.6)
    weather(pad, seed + 10, ground=0.6, ground_h=0.4, streaks=0.0, top_soot=0.0, tone_dark=0x2e2a24)
    atlas.add("pad", 750, 200, pad)

    m = EnvModel("prop_pillar_pier")
    R = side_rects(atlas, "front", "right", "left", "top")
    lo, hi = (-0.44, 0, -0.44), (0.44, H, 0.44)
    finish(m, chamfer_prism(rect_poly(0.88, 0.88), 0.0, 0.18, ct=0.03), R, lo, hi, seed)
    finish(m, chamfer_prism(octo(W, 0.09), 0.17, 1.39), R, lo, hi, seed)
    # flared capital, bearing shelf and a stub of the deck beam
    cap = chamfer_prism(octo(0.88, 0.10), 1.38, 1.53, cb=0.05, cb_h=0.14)
    finish(m, cap, R, lo, hi, seed)
    finish(m, chamfer_prism(rect_poly(0.86, 0.80), 1.53, 1.64, cb=0.0, ct=0.01), R, lo, hi, seed)
    finish(m, chamfer_prism(rect_poly(0.88, 0.62), 1.64, H, cb=0.01, ct=0.02), R, lo, hi, seed)
    # drain pipe down the east face
    P = atlas.rect("pad")
    pipe = rod((0.43, 0.18, -0.12), (0.43, 1.40, -0.12), 0.035, 8)
    m.add(vc_mul(box_uv(pipe, pipe.v.min(axis=0), pipe.v.max(axis=0), P), (0.55, 0.52, 0.5)))
    return m.export({"main": atlas.mat(normal_strength=0.35, **Q)})


# ============================================================================ Ajegunle: broken compound-wall stub

def pillar_wallstub() -> dict:
    seed = 491
    W, H = 0.84, 1.52
    e = Elev(W, H, 280)
    atlas = Atlas(1024, 512, 0x808080)
    course = 0.225

    def blocks(sd, extra=None):
        s = concrete_sheet(e.w, e.h, sd, 0x9a948a, stains=0.6)
        ys, xs = np.mgrid[0 : e.h, 0 : e.w]
        yy = (e.h - 1 - ys) / e.ppm
        row = (yy / course).astype(int)
        jx = (xs / e.ppm + (row % 2) * 0.225) % 0.45
        joint = ((yy % course) < 0.012) | (jx < 0.012)
        s.comp(0x4a453e, gblur(joint.astype(float), 0.6) * 0.8, height=-0.25)
        # remains of a cement render, painted a faded blue-green, peeling
        n = noise2(e.w, e.h, sd + 3, fx=5, fy=5, octaves=6, beta=1.6)
        render = np.clip(n * 2.6 - 1.0, 0, 1) * np.clip(yy / 0.4, 0, 1)
        s.comp(0x7c9a8e, render * 0.85, height=0.12, rough=0.85)
        edge = np.clip(gblur((render > 0.3).astype(float), 1.0) - (render > 0.3), 0, 1)
        s.comp(0x2a2620, edge * 0.6)
        weather(s, sd + 1, ground=0.6, ground_h=0.2, streaks=0.45, top_soot=0.2, edge=0.15, tone_dark=0x2e2a22)
        if extra:
            extra(s)
        speckle(s, sd + 7, amount=0.55, density=0.006)
        scuffs(s, sd + 8, n=14)
        return s

    def fr(s):
        stencil(s, "THIS HOUSE IS NOT FOR SALE", (e.w / 2, e.y(0.86)), 15, 0xb02a22, "black", a=0.85, squeeze=0.8, wear=0.45, seed=2, spacing=0.02)
        stick_poster(s, x=40, y=int(e.y(1.24)), w=80, h=100, seed=501, rot=-3, kind="type")

    def rt(s):
        spray_tag(s, 21, 20, e.y(1.1), e.w - 30, e.y(0.8), 0x111111, 3.4, loops=5)
        cracks(s, 4, n=2, length=0.8, width=1.4, start_edge="top")

    atlas.add("front", 0, 0, blocks(seed, fr))
    atlas.add("right", 240, 0, blocks(seed + 20, rt))
    atlas.add("left", 480, 0, blocks(seed + 40))
    atlas.add("top", 720, 0, top_tile(seed, 192, 0x8e887e, 0.6))
    rust = steel_sheet(128, 64, seed + 7, tone=0x6e4a32, rust=1.0)
    atlas.add("rust", 720, 200, rust)

    m = EnvModel("prop_pillar_wallstub")
    R = side_rects(atlas, "front", "right", "left", "top")
    lo, hi = (-W / 2, 0, -W / 2), (W / 2, H, W / 2)
    finish(m, chamfer_prism(rect_poly(0.86, 0.86), 0.0, 0.10, ct=0.015), R, lo, hi, seed, 0.2, 0.5)
    # the stub: full courses to 1.15, then the top courses broken away stepwise towards the south-east
    finish(m, chamfer_prism(rect_poly(W, W), 0.09, 1.12, ct=0.01), R, lo, hi, seed)
    finish(m, chamfer_prism(rect_poly(W, 0.46, 0.0, -0.19), 1.11, 1.34, cb=0.0, ct=0.01), R, lo, hi, seed)
    finish(m, chamfer_prism(rect_poly(0.42, 0.40, -0.21, -0.22), 1.33, H, cb=0.0, ct=0.012), R, lo, hi, seed)
    finish(m, chamfer_prism(rect_poly(0.38, 0.36, 0.19, 0.18), 1.11, 1.30, ct=0.012), R, lo, hi, seed)
    # loose broken block resting on the ledge
    finish(m, obox((0.24, 1.17, -0.02), (0.3, 0.12, 0.18), rot=(0, 24, 7)), R, lo, hi, seed)
    # corner reinforcement rods sticking out of the broken top
    rr = atlas.rect("rust")
    for (x, z, top) in [(-0.34, -0.34, H + 0.22), (0.34, -0.34, 1.34 + 0.28), (0.34, 0.34, 1.12 + 0.3)]:
        b = rod((x, top - 0.45, z), (x + 0.03, top, z - 0.02), 0.014, 5)
        m.add(box_uv(b, b.v.min(axis=0), b.v.max(axis=0), rr))
    return m.export({"main": atlas.mat(normal_strength=0.55, **Q)})


# ============================================================================ Lagoon Jetty: timber piles + bollard

def pillar_bollard() -> dict:
    seed = 521
    H = 1.42
    atlas = Atlas(512, 512, 0x808080)
    tar = wood_sheet(256, 256, seed, 0x6a5440, "y", wear=0.85, knots=2, gap=0)
    n = noise2(256, 256, seed + 1, fx=4, fy=8)
    tar.comp(0x1e1812, np.clip(n * 1.6 - 0.5, 0, 1) * 0.55, rough=0.55)  # tar coat, worn through in places
    ys = (np.arange(256)[:, None] + 0.5) / 256
    tar.comp(0x3c4a3a, np.clip((ys - 0.78) / 0.2, 0, 1) * 0.6 * np.ones((1, 256)))  # algae tide line at the foot
    atlas.add("tar", 0, 0, tar)
    endgrain = Sheet(128, 128, 0x5a4632)
    yy, xx = np.mgrid[0:128, 0:128]
    rr = np.hypot(xx - 64, yy - 64)
    endgrain.rgb = endgrain.rgb * (0.8 + 0.2 * np.sin(rr * 0.9))[..., None]
    endgrain.comp(0x221a12, np.clip(rr / 64 - 0.75, 0, 1) * 2)
    atlas.add("end", 256, 0, endgrain)
    rope = Sheet(256, 32, 0xa8946a, rough=0.95)
    xs = np.arange(256)[None, :] * np.ones((32, 1))
    rope.rgb = rope.rgb * (0.7 + 0.3 * np.abs(np.sin((xs + np.arange(32)[:, None] * 2) * 0.45)))[..., None]
    rope.comp(0x3a3020, noise2(256, 32, seed + 3, fx=10, fy=2) * 0.5)
    atlas.add("rope", 256, 136, rope)
    iron = steel_sheet(256, 128, seed + 4, tone=0x2c2e30, rust=0.75, paint=0x23262a)
    atlas.add("iron", 256, 176, iron)
    pad = concrete_sheet(256, 128, seed + 5, 0x8c877d, stains=0.8)
    weather(pad, seed + 6, ground=0.8, ground_h=0.5, streaks=0.0, top_soot=0.0, tone_dark=0x2e3228)
    stencil(pad, "J6", (128, 64), 40, 0xf1ead2, "black", a=0.6, squeeze=0.9, wear=0.7, seed=3)
    atlas.add("pad", 0, 264, pad)

    m = EnvModel("prop_pillar_bollard")
    PAD = {k: atlas.rect("pad") for k in ("+x", "-x", "+z", "-z", "+y", "-y")}
    finish(m, chamfer_prism(rect_poly(0.86, 0.86), 0.0, 0.16, ct=0.03), PAD, (-0.43, 0, -0.43), (0.43, 0.16, 0.43), seed, 0.1, 0.4)
    tr, er = atlas.rect("tar"), atlas.rect("end")
    rng = np.random.default_rng(seed)
    piles = [((-0.17, -0.16), 0.17, H), ((0.18, -0.12), 0.155, H - 0.24), ((-0.04, 0.17), 0.15, H - 0.12)]
    for (x, z), r, h in piles:
        lean = rng.uniform(-1.5, 1.5, 2)
        pile = rod((x, 0.1, z), (x + np.radians(lean[0]) * h, h, z + np.radians(lean[1]) * h), r, 12, r2=r * 0.92)
        pile = cyl_uv(pile, (x, 0, z), tr, "y", v_range=(0.0, 1.0), cap_rect=er)
        vc_ground(pile, 0.3, 0.45, seed)
        m.add(pile)
    # rope lashings round the three piles
    rp = atlas.rect("rope")
    for yy in (0.72, 1.0):
        loop = [(-0.36, yy, -0.18), (-0.02, yy + 0.02, -0.33), (0.36, yy, -0.12), (0.12, yy - 0.02, 0.33), (-0.2, yy, 0.32), (-0.36, yy, -0.18)]
        t = polytube(loop, 0.022, 6)
        m.add(box_uv(t, t.v.min(axis=0), t.v.max(axis=0), rp))
    # cast-iron mooring bollard on the south-east corner of the pad
    ir = atlas.rect("iron")
    prof = [(0.0, 0.16), (0.13, 0.16), (0.12, 0.2), (0.085, 0.24), (0.075, 0.42), (0.11, 0.47), (0.115, 0.52), (0.0, 0.53)]
    b = lathe(prof, 14)
    b.v[:, 0] += 0.24
    b.v[:, 2] += 0.25
    m.add(cyl_uv(b, (0.24, 0, 0.25), ir, "y"))
    return m.export({"main": atlas.mat(normal_strength=0.6, **Q)})


# ============================================================================ Surulere Power Yard: transformer cabinet

def pillar_cabinet() -> dict:
    seed = 551
    W, D, H = 0.80, 0.66, 1.56
    e = Elev(W, H, 290)
    ed = Elev(D, H, 290)
    atlas = Atlas(1024, 512, 0x808080)

    def steel_face(el: Elev, sd, kind):
        s = steel_sheet(el.w, el.h, sd, tone=0x5c6b58, rust=0.55, paint=0x4e6650)
        s.metal = s.metal * 0.6
        # panel seams, louvres and the plinth line
        hline(s, el, 0.22, 0x1e211e, 2.0, a=0.9)
        hline(s, el, H - 0.1, 0x1e211e, 2.0, a=0.9)
        if kind == "front":
            with s.paint(height=-0.3, rough=0.8) as d:
                d.line([(el.w / 2, el.y(0.24)), (el.w / 2, el.y(H - 0.12))], 0x161816, 2.2)  # double door split
                for side in (-1, 1):
                    hx = el.w / 2 + side * 26
                    d.rect((hx - 4, el.y(0.98), hx + 4, el.y(0.84)), 0x9a9a92)  # handles
            with s.paint(height=0.08, rough=0.5) as d:  # warning triangle + plate
                cx, cy = el.w / 2, el.y(1.26)
                d.poly([(cx, cy - 34), (cx - 36, cy + 26), (cx + 36, cy + 26)], 0xf2c21b)
                d.poly([(cx, cy - 22), (cx - 24, cy + 18), (cx + 24, cy + 18)], 0x161616)
                d.poly([(cx + 4, cy - 14), (cx - 8, cy + 4), (cx + 2, cy + 4), (cx - 4, cy + 16), (cx + 9, cy - 2), (cx, cy - 2)], 0xf2c21b)
            stencil(s, "DANGER", (el.w / 2, el.y(0.66)), 30, 0xe8e0c8, "black", a=0.9, squeeze=0.9, wear=0.4, seed=2)
            stencil(s, "11,000 VOLTS", (el.w / 2, el.y(0.54)), 18, 0xe8e0c8, "black", a=0.9, squeeze=0.9, wear=0.4, seed=3)
        else:
            with s.paint(height=-0.35, rough=0.8) as d:  # louvres
                for k in range(9):
                    y = el.y(0.5 + k * 0.08)
                    d.rect((18, y - 3, el.w - 18, y + 2), 0x141614)
            stencil(s, "TR-3", (el.w / 2, el.y(1.32)), 34, 0xe8e0c8, "black", a=0.8, squeeze=0.9, wear=0.5, seed=5)
        weather(s, sd + 1, ground=0.55, ground_h=0.16, streaks=0.4, top_soot=0.1, edge=0.15, tone_dark=0x2a2a22)
        spray_tag(s, sd + 9, 20, el.y(0.42), el.w - 20, el.y(0.26), 0x111111, 2.4, loops=3)
        speckle(s, sd + 7, amount=0.4, density=0.004)
        return s

    atlas.add("front", 0, 0, steel_face(e, seed, "front"))
    atlas.add("side", 240, 0, steel_face(ed, seed + 20, "side"))
    atlas.add("back", 440, 0, steel_face(e, seed + 40, "side"))
    roof = steel_sheet(192, 192, seed + 5, tone=0x4a5448, rust=0.8, paint=0x46524a)
    atlas.add("top", 680, 0, roof)
    plinth = concrete_sheet(256, 64, seed + 6, 0x9a958b, stains=0.6)
    weather(plinth, seed + 7, ground=0.6, ground_h=0.5, streaks=0.0, top_soot=0.0, tone_dark=0x2e2a24)
    atlas.add("plinth", 680, 200, plinth)
    cable = Sheet(64, 64, 0x161616, rough=0.6)
    atlas.add("cable", 680, 280, cable)

    m = EnvModel("prop_pillar_cabinet")
    R = {"+z": atlas.rect("front"), "-z": atlas.rect("back"), "+x": atlas.rect("side"), "-x": atlas.rect("side"), "+y": atlas.rect("top"), "-y": atlas.rect("top")}
    PL = {k: atlas.rect("plinth") for k in ("+x", "-x", "+z", "-z")}
    PL["+y"] = PL["-y"] = atlas.rect("plinth")
    finish(m, chamfer_prism(rect_poly(0.86, 0.80), 0.0, 0.22, ct=0.02), PL, (-0.43, 0, -0.4), (0.43, 0.22, 0.4), seed, 0.15, 0.5)
    lo, hi = (-W / 2, 0, -D / 2), (W / 2, H, D / 2)
    finish(m, chamfer_prism(rect_poly(W, D), 0.21, H - 0.06, ct=0.0), R, lo, hi, seed)
    finish(m, chamfer_prism(rect_poly(W + 0.06, D + 0.08), H - 0.07, H, cb=0.02, ct=0.015), R, (-0.43, 0, -0.37), (0.43, H, 0.37), seed)
    # cooling fins on both sides
    for sx in (-1, 1):
        for k in range(5):
            fin = obox((sx * (W / 2 + 0.03), 0.78, -0.2 + k * 0.1), (0.06, 0.86, 0.018))
            finish(m, fin, R, lo, hi, seed)
    # HV cables dropping from the roof into the ground
    cr = atlas.rect("cable")
    for z in (-0.12, 0.0, 0.12):
        path = [(-0.18, H - 0.02, z - 0.37), (-0.18, H + 0.08, z - 0.4), (-0.18, H - 0.2, -0.44), (-0.2, 0.2, -0.44), (-0.22, 0.0, -0.46)]
        t = polytube(path, 0.022, 6)
        m.add(box_uv(t, t.v.min(axis=0), t.v.max(axis=0), cr))
    return m.export({"main": atlas.mat(normal_strength=0.4, **Q)})


# ============================================================================ Yaba After Dark: shuttered kiosk

def pillar_kiosk() -> dict:
    seed = 581
    W, H = 0.82, 1.64
    e = Elev(W, H, 290)
    atlas = Atlas(1024, 512, 0x808080)

    def shutter(sd):
        s = steel_sheet(e.w, e.h, sd, tone=0x8a8e92, rust=0.45, paint=0x7d8287)
        ys = np.arange(e.h)[:, None] * np.ones((1, e.w))
        rib = 0.5 + 0.5 * np.sin(ys / 9.0 * 2 * np.pi)
        s.rgb = s.rgb * (0.75 + 0.35 * rib)[..., None]
        s.hgt = 0.5 + 0.4 * rib
        hline(s, e, 0.08, 0x1a1a1a, 3.0, a=0.9)
        hline(s, e, 1.30, 0x1a1a1a, 3.0, a=0.9)
        with s.paint(height=0.1) as d:  # padlock hasp at the foot
            d.rect((e.w / 2 - 10, e.y(0.2), e.w / 2 + 10, e.y(0.1)), 0x2a2a2a)
        spray_tag(s, sd + 3, 16, e.y(0.9), e.w - 18, e.y(0.5), 0x101010, 3.6, loops=6)
        spray_tag(s, sd + 4, 18, e.y(0.86), e.w - 20, e.y(0.48), 0xe0399a, 1.4, loops=6)
        stencil(s, "NO STANDING", (e.w / 2, e.y(1.08)), 22, 0xf1ead2, "black", a=0.8, squeeze=0.9, wear=0.5, seed=5)
        weather(s, sd + 1, ground=0.55, ground_h=0.14, streaks=0.35, top_soot=0.1, edge=0.15, tone_dark=0x22201c)
        sign_y0, sign_y1 = e.y(1.62), e.y(1.32)
        with s.paint(height=0.1, rough=0.6) as d:  # painted fascia board
            d.rect((0, sign_y0, e.w, sign_y1), 0x1a2a6a)
            d.rect((0, sign_y1 - 6, e.w, sign_y1), 0xff3fa8)  # the neon trim (painted bright; glows in the arena's light)
            d.rect((0, sign_y0, e.w, sign_y0 + 5), 0x3ff0ff)
        stencil(s, "RECHARGE", (e.w / 2, (sign_y0 + sign_y1) / 2 - 10), 30, 0xffe14a, "black", a=0.95, squeeze=0.85, wear=0.25, seed=6)
        stencil(s, "CARD & POS", (e.w / 2, (sign_y0 + sign_y1) / 2 + 22), 20, 0xf1ead2, "black", a=0.9, squeeze=0.9, wear=0.3, seed=7)
        speckle(s, sd + 7, amount=0.35, density=0.004)
        return s

    def side(sd):
        s = corrugated_panel(e.w, e.h, sd, 0x6a7078, ribs=12, rust=0.6, wear=0.6)
        stick_poster(s, x=50, y=int(e.y(1.2)), w=100, h=130, seed=sd + 1, rot=3, kind="concert")
        weather(s, sd + 2, ground=0.5, ground_h=0.14, streaks=0.3, top_soot=0.1, tone_dark=0x22201c)
        return s

    atlas.add("front", 0, 0, shutter(seed))
    atlas.add("right", 240, 0, side(seed + 20))
    atlas.add("left", 480, 0, side(seed + 40))
    atlas.add("top", 720, 0, steel_sheet(192, 192, seed + 5, tone=0x5a5e62, rust=0.9))
    base = concrete_sheet(256, 64, seed + 6, 0x8e8a82, stains=0.6)
    atlas.add("base", 720, 200, base)

    m = EnvModel("prop_pillar_kiosk")
    R = side_rects(atlas, "front", "right", "left", "top", back="right")
    B = {k: atlas.rect("base") for k in ("+x", "-x", "+z", "-z", "+y", "-y")}
    finish(m, chamfer_prism(rect_poly(0.86, 0.86), 0.0, 0.08, ct=0.015), B, (-0.43, 0, -0.43), (0.43, 0.08, 0.43), seed)
    lo, hi = (-W / 2, 0, -W / 2), (W / 2, H, W / 2)
    finish(m, chamfer_prism(rect_poly(W, W), 0.07, H - 0.04), R, lo, hi, seed)
    # roof sheet overhanging the front, and the shutter box above the door
    finish(m, obox((0, H - 0.02, 0.04), (0.88, 0.04, 0.92), rot=(-3, 0, 0)), R, lo, hi, seed)
    finish(m, obox((0, 1.36, W / 2 + 0.03), (W, 0.1, 0.06)), R, lo, hi, seed)
    return m.export({"main": atlas.mat(normal_strength=0.4, **Q)})


# ============================================================================ Third Mainland: stacked jersey barriers

def pillar_jersey() -> dict:
    seed = 611
    L = 0.86
    atlas = Atlas(512, 512, 0x808080)
    face = concrete_sheet(512, 192, seed, 0xc4c0b6, stains=0.5)
    for k in range(4):  # worn red/white reflective paint blocks
        with face.paint(height=0.05, rough=0.6) as d:
            d.rect((k * 128, 20, k * 128 + 64, 70), 0xc8322a, a=0.85)
    weather(face, seed + 1, ground=0.6, ground_h=0.35, streaks=0.3, top_soot=0.1, edge=0.0, tone_dark=0x2e2a24, tile=True)
    scuffs(face, seed + 2, n=40, length=(10, 50))
    stencil(face, "FMW", (380, 120), 36, 0x1a1a1a, "black", a=0.6, squeeze=0.9, wear=0.6, seed=4)
    speckle(face, seed + 3, amount=0.5, density=0.006)
    atlas.add("face", 0, 0, face)
    end = concrete_sheet(256, 192, seed + 5, 0xb4b0a6, stains=0.5)
    weather(end, seed + 6, ground=0.5, ground_h=0.3, streaks=0.2, top_soot=0.0, tone_dark=0x2e2a24)
    atlas.add("end", 0, 200, end)
    top = concrete_sheet(256, 96, seed + 7, 0xbab6ac, stains=0.6)
    atlas.add("top", 256, 200, top)

    def jersey(y0: float, h: float):
        # New-Jersey profile (z, y) for a 0.6 m base, 0.15 m top, scaled to height h
        k = h / 0.81
        prof = [(-0.30, 0.0), (0.30, 0.0), (0.30, 0.075 * k), (0.21, 0.33 * k), (0.075, h), (-0.075, h), (-0.21, 0.33 * k), (-0.30, 0.075 * k)]
        return extrude_x([(z, y + y0) for z, y in prof], -L / 2, L / 2)

    m = EnvModel("prop_pillar_jersey")
    rects = {"+z": atlas.rect("face"), "-z": atlas.rect("face"), "+y": atlas.rect("top"), "-y": atlas.rect("top"), "+x": atlas.rect("end"), "-x": atlas.rect("end")}
    lo, hi = (-L / 2, 0, -0.3), (L / 2, 0.81, 0.3)
    low = jersey(0.0, 0.81)
    finish(m, low, rects, lo, hi, seed, 0.2, 0.45)
    # the second barrier dropped on top crosswise, slightly askew
    up = jersey(0.0, 0.78)
    up.v = up.v @ np.array([[np.cos(np.radians(84)), 0, -np.sin(np.radians(84))], [0, 1, 0], [np.sin(np.radians(84)), 0, np.cos(np.radians(84))]]).T
    up.v[:, 1] += 0.80
    up.v[:, 0] += 0.02
    mm = box_uv(up, (-0.3, 0.8, -L / 2), (0.3, 1.58, L / 2), {"+x": atlas.rect("face"), "-x": atlas.rect("face"), "+y": atlas.rect("top"), "-y": atlas.rect("top"), "+z": atlas.rect("end"), "-z": atlas.rect("end")})
    vc_fn(mm, lambda p: 0.95 + 0.05 * value_noise(p, 7.0, seed))
    m.add(mm)
    # lifting loops
    for x in (-0.25, 0.25):
        loop = polytube([(x - 0.04, 1.58, 0.0), (x, 1.63, 0.0), (x + 0.04, 1.58, 0.0)], 0.012, 5, caps=False)
        m.add(vc_mul(box_uv(loop, loop.v.min(axis=0), loop.v.max(axis=0), atlas.rect("end")), (0.5, 0.35, 0.25)))
    return m.export({"main": atlas.mat(normal_strength=0.4, **Q)})


CITY_PILLARS = {
    "prop_pillar_market": pillar_market,
    "prop_pillar_column": pillar_column,
    "prop_pillar_pier": pillar_pier,
    "prop_pillar_wallstub": pillar_wallstub,
    "prop_pillar_bollard": pillar_bollard,
    "prop_pillar_cabinet": pillar_cabinet,
    "prop_pillar_kiosk": pillar_kiosk,
    "prop_pillar_jersey": pillar_jersey,
}
