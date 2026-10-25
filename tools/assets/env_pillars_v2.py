"""City Rumble V2 permanent blockers ("pillars") for the new Lagos stages, in the same conventions as
env_pillars_city.py (one material + one baked atlas each, about character height, filling most of the tile):

    prop_pillar_container_a  Apapa Docks: two short boxes stacked, rust-red under faded blue
    prop_pillar_container_b  Apapa Docks: two short boxes stacked, green under sun-bleached cream
    prop_pillar_scaffold     Lekki Nightworks: tube-and-coupler scaffold bay on sole boards, plywood
                             hoarding and green debris netting

Container markings are fictional (no real shipping line). Y-up, metres, front = +Z, origin on the ground
at the footprint centre."""
from __future__ import annotations

import numpy as np

from env_lib import EnvModel, box_uv, chamfer_prism, obox, rect_poly, rod
from env_pillars_city import Elev, finish, hline, top_tile
from tex_env import (
    Atlas,
    Sheet,
    concrete_sheet,
    corrugated_panel,
    noise2,
    scuffs,
    speckle,
    steel_sheet,
    stencil,
    weather,
    wood_sheet,
)

Q = dict(jpeg_q=72, normal_q=66, orm_q=60)


# ============================================================================ Apapa Docks: stacked containers


def _container(name: str, seed: int, lower: int, upper: int, codes: tuple[str, str]) -> dict:
    W, D = 0.9, 0.84  # footprint of the stack (the tile is 1 m)
    H1, H2 = 0.86, 0.84  # lower / upper box heights
    e1 = Elev(W, H1, 280)
    e2 = Elev(W, H2, 280)
    atlas = Atlas(1024, 1024, 0x808080)

    def side(el: Elev, sd: int, tone: int, code: str | None, rust: float):
        s = corrugated_panel(el.w, el.h, sd, tone, ribs=11, rust=rust, wear=0.8)
        s.metal = s.metal * 0.15  # painted boxes: a bare-metal response reads black under the game's low env light
        # top / bottom rails and a salt-bleached upper half
        hline(s, el, 0.04, 0x1e1c1a, 4.0, a=0.85)
        hline(s, el, el.h / el.ppm - 0.06, 0x2a2622, 3.0, a=0.8)
        n = noise2(el.w, el.h, sd + 5, fx=3, fy=6)
        ys = (np.arange(el.h)[:, None] + 0.5) / el.h
        s.comp(0xd8d2c4, np.clip((0.45 - ys) * 1.2, 0, 1) * (0.25 + 0.25 * n))
        if code:
            stencil(s, code, (el.w * 0.36, el.y(el.h / el.ppm - 0.18)), 26, 0xf1ead2, "black", a=0.9, squeeze=0.8, wear=0.5, seed=sd)
            stencil(s, "MAX GROSS 24,000 KG", (el.w * 0.36, el.y(el.h / el.ppm - 0.3)), 11, 0xf1ead2, "black", a=0.8, squeeze=0.85, wear=0.5, seed=sd + 1)
        weather(s, sd + 2, ground=0.4, ground_h=0.1, streaks=0.5, top_soot=0.05, edge=0.25, tone_dark=0x2a2018)
        speckle(s, sd + 3, amount=0.4, density=0.004)
        return s

    def doors(el: Elev, sd: int, tone: int, code: str):
        s = steel_sheet(el.w, el.h, sd, tone=tone, rust=0.7, paint=tone)
        s.metal = s.metal * 0.15
        with s.paint(height=-0.3, rough=0.8) as d:
            d.line([(el.w / 2, el.y(0.03)), (el.w / 2, el.y(el.h / el.ppm - 0.03))], 0x161412, 2.4)  # door split
            for fx in (0.18, 0.38, 0.62, 0.82):  # locking bars
                x = el.w * fx
                d.line([(x, el.y(0.05)), (x, el.y(el.h / el.ppm - 0.05))], 0x3a3632, 4.0)
                d.rect((x - 6, el.y(0.42), x + 6, el.y(0.36)), 0x8a8478)
        stencil(s, code, (el.w * 0.75, el.y(el.h / el.ppm - 0.14)), 18, 0xf1ead2, "black", a=0.9, squeeze=0.8, wear=0.5, seed=sd)
        weather(s, sd + 2, ground=0.45, ground_h=0.1, streaks=0.5, top_soot=0.05, edge=0.25, tone_dark=0x2a2018)
        scuffs(s, sd + 4, n=18, length=(8, 30))
        return s

    def roof(sd: int, tone: int):
        s = steel_sheet(256, 256, sd, tone=tone, rust=0.9, paint=tone)
        s.metal = s.metal * 0.15
        ys, xs = np.mgrid[0:256, 0:256]
        s.comp(0x1c1a18, ((xs // 32) % 2 == 0) * 0.12)  # roof panel dents
        s.comp(0x6e3a1c, np.clip(noise2(256, 256, sd + 1, fx=5, fy=5) * 1.6 - 0.8, 0, 1) * 0.6)
        return s

    atlas.add("side_lo", 0, 0, side(e1, seed, lower, codes[0], 0.6))
    atlas.add("side_lo_b", 260, 0, side(e1, seed + 10, lower, None, 0.7))
    atlas.add("side_up", 520, 0, side(e2, seed + 20, upper, codes[1], 0.4))
    atlas.add("side_up_b", 0, 260, side(e2, seed + 30, upper, None, 0.5))
    atlas.add("door_lo", 260, 260, doors(e1, seed + 40, lower, codes[0][:4]))
    atlas.add("door_up", 520, 260, doors(e2, seed + 50, upper, codes[1][:4]))
    atlas.add("roof_lo", 0, 520, roof(seed + 60, lower))
    atlas.add("roof_up", 260, 520, roof(seed + 70, upper))
    cast = steel_sheet(64, 64, seed + 80, tone=0x2a2826, rust=0.6)
    atlas.add("cast", 520, 520, cast)
    pad = concrete_sheet(256, 64, seed + 90, 0x8e8a80, stains=0.7)
    weather(pad, seed + 91, ground=0.6, ground_h=0.5, streaks=0.0, top_soot=0.0, tone_dark=0x2e2a24)
    atlas.add("pad", 600, 520, pad)

    m = EnvModel(name)
    lo_r = {"+z": atlas.rect("door_lo"), "-z": atlas.rect("side_lo_b"), "+x": atlas.rect("side_lo"), "-x": atlas.rect("side_lo_b"), "+y": atlas.rect("roof_lo"), "-y": atlas.rect("roof_lo")}
    up_r = {"+z": atlas.rect("side_up"), "-z": atlas.rect("door_up"), "+x": atlas.rect("side_up_b"), "-x": atlas.rect("side_up"), "+y": atlas.rect("roof_up"), "-y": atlas.rect("roof_up")}
    pad_r = {k: atlas.rect("pad") for k in ("+x", "-x", "+z", "-z", "+y", "-y")}
    # a low concrete pad (the yard's stacking blocks) under the lower box
    finish(m, chamfer_prism(rect_poly(0.96, 0.92), 0.0, 0.06, ct=0.01), pad_r, (-0.48, 0, -0.46), (0.48, 0.06, 0.46), seed, 0.1, 0.4)
    finish(m, chamfer_prism(rect_poly(W, D), 0.06, 0.06 + H1, ct=0.006, cb=0.006), lo_r, (-W / 2, 0.06, -D / 2), (W / 2, 0.06 + H1, D / 2), seed, 0.12, 0.3)
    # the upper box sits a little askew, as stacks do
    up = chamfer_prism(rect_poly(W - 0.02, D - 0.02), 0.06 + H1 + 0.01, 0.06 + H1 + 0.01 + H2, ct=0.006, cb=0.006)
    ang = np.radians(2.5)
    rot = np.array([[np.cos(ang), 0, np.sin(ang)], [0, 1, 0], [-np.sin(ang), 0, np.cos(ang)]])
    up.v = up.v @ rot.T
    up.v[:, 0] += 0.015
    top = 0.06 + H1 + 0.01 + H2
    finish(m, up, up_r, (-W / 2, 0.06 + H1, -D / 2), (W / 2, top, D / 2), seed + 1, 0.02, 0.0)
    # corner castings on both boxes
    cr = {k: atlas.rect("cast") for k in ("+x", "-x", "+z", "-z", "+y", "-y")}
    for y in (0.06 + 0.05, 0.06 + H1 - 0.05, 0.06 + H1 + 0.06, top - 0.05):
        for sx in (-1, 1):
            for sz in (-1, 1):
                c = obox((sx * (W / 2 - 0.035), y, sz * (D / 2 - 0.035)), (0.08, 0.1, 0.08))
                m.add(box_uv(c, c.v.min(axis=0), c.v.max(axis=0), cr))
    # door hinges / lock rods standing proud of the lower door
    rr = atlas.rect("cast")
    for fx in (-0.28, -0.1, 0.1, 0.28):
        r = rod((fx, 0.12, D / 2 + 0.012), (fx, 0.06 + H1 - 0.06, D / 2 + 0.012), 0.012, 5)
        m.add(box_uv(r, r.v.min(axis=0), r.v.max(axis=0), rr))
    return m.export({"main": atlas.mat(normal_strength=0.5, **Q)})


def pillar_container_a() -> dict:
    return _container("prop_pillar_container_a", 701, 0x8a3a26, 0x2e5a7a, ("LGSU 204118 2", "ECWU 551730 4"))


def pillar_container_b() -> dict:
    return _container("prop_pillar_container_b", 731, 0x3e6a48, 0xb8b09a, ("APPU 730294 1", "TCLU 118462 0"))


# ============================================================================ Lekki Nightworks: scaffold bay


def pillar_scaffold() -> dict:
    seed = 761
    S, H = 0.86, 1.7  # bay width, height to the top guardrail
    atlas = Atlas(1024, 512, 0x808080)
    tube = steel_sheet(128, 64, seed, tone=0x9a9c9e, rust=0.5)
    atlas.add("tube", 0, 0, tube)
    coupler = steel_sheet(64, 64, seed + 1, tone=0x5a5a58, rust=0.8)
    atlas.add("coupler", 140, 0, coupler)
    board = wood_sheet(256, 96, seed + 2, 0xa88250, "x", wear=0.9, knots=1, gap=2)
    stencil(board, "BOARD 3.9M", (128, 50), 18, 0x1a1a1a, "black", a=0.5, squeeze=0.9, wear=0.6, seed=2)
    atlas.add("board", 220, 0, board)
    ply = wood_sheet(256, 256, seed + 3, 0xb48c5c, "y", wear=0.8, knots=1, gap=0)
    stencil(ply, "DANGER", (128, 70), 38, 0xd23a2a, "black", a=0.85, squeeze=0.85, wear=0.4, seed=3)
    stencil(ply, "KEEP OFF", (128, 118), 30, 0x1a1a1a, "black", a=0.85, squeeze=0.85, wear=0.4, seed=4)
    stencil(ply, "SITE 7 LEKKI", (128, 200), 20, 0x1a1a1a, "black", a=0.6, squeeze=0.9, wear=0.6, seed=5)
    weather(ply, seed + 4, ground=0.6, ground_h=0.25, streaks=0.4, top_soot=0.05, tone_dark=0x3a2c20)
    atlas.add("ply", 480, 0, ply)
    # green debris netting (opaque weave; the game instances one material)
    net = Sheet(256, 256, 0x2e5a34, rough=0.9)
    ys, xs = np.mgrid[0:256, 0:256]
    weave = ((xs % 6) < 2) | ((ys % 6) < 2)
    net.comp(0x163018, weave * 0.6)
    net.comp(0x8a8a6a, np.clip(noise2(256, 256, seed + 5, fx=4, fy=4) * 1.4 - 0.9, 0, 1) * 0.5)  # cement dust
    weather(net, seed + 6, ground=0.5, ground_h=0.2, streaks=0.2, top_soot=0.0, tone_dark=0x1c241a)
    atlas.add("net", 740, 0, net)
    sole = wood_sheet(128, 64, seed + 7, 0x7a5a3a, "x", wear=1.0, knots=0, gap=1)
    atlas.add("sole", 0, 80, sole)
    atlas.add("top", 0, 260, top_tile(seed, 192, 0xa29e95, 0.5))

    m = EnvModel("prop_pillar_scaffold")
    T = atlas.rect("tube")
    allr = lambda n: {k: atlas.rect(n) for k in ("+x", "-x", "+z", "-z", "+y", "-y")}  # noqa: E731
    h = S / 2

    def tube_(p0, p1, r=0.024):
        t = rod(p0, p1, r, 6)
        m.add(box_uv(t, t.v.min(axis=0), t.v.max(axis=0), T))

    # sole boards and base plates under the four standards
    for sx in (-1, 1):
        finish(m, obox((sx * h, 0.02, 0.0), (0.16, 0.04, 0.96)), allr("sole"), (sx * h - 0.08, 0, -0.48), (sx * h + 0.08, 0.04, 0.48), seed, 0.02, 0.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            tube_((sx * h, 0.04, sz * h), (sx * h, H + 0.12, sz * h), 0.026)
    # ledgers at three lifts, a diagonal brace on the west face
    for y in (0.18, 0.95, 1.55):
        for sz in (-1, 1):
            tube_((-h - 0.05, y, sz * h), (h + 0.05, y, sz * h))
        for sx in (-1, 1):
            tube_((sx * h, y + 0.04, -h - 0.05), (sx * h, y + 0.04, h + 0.05))
    tube_((-h, 0.12, -h), (-h, 1.5, h))
    # couplers at the ledger joints
    for y in (0.18, 0.95, 1.55):
        for sx in (-1, 1):
            for sz in (-1, 1):
                c = obox((sx * h, y + 0.02, sz * h), (0.07, 0.08, 0.07))
                m.add(box_uv(c, c.v.min(axis=0), c.v.max(axis=0), atlas.rect("coupler")))
    # the working deck: scaffold boards at the middle lift and the top, a toe board
    for y in (0.99, 1.59):
        finish(m, obox((0.0, y, 0.0), (S + 0.06, 0.04, S - 0.02)), {"+x": atlas.rect("board"), "-x": atlas.rect("board"), "+z": atlas.rect("board"), "-z": atlas.rect("board"), "+y": atlas.rect("board"), "-y": atlas.rect("board")}, (-h, y - 0.02, -h), (h, y + 0.02, h), seed, 0.02, 0.0)
    # plywood hoarding on the south (camera) face up to the deck, debris netting on the other three faces
    finish(m, obox((0.0, 0.5, h + 0.03), (S + 0.04, 0.9, 0.025), rot=(-2, 0, 0)), allr("ply"), (-h, 0.05, h), (h, 0.95, h + 0.06), seed, 0.15, 0.4)
    for (cx, cz, w, d) in ((0.0, -h - 0.02, S, 0.012), (-h - 0.02, 0.0, 0.012, S), (h + 0.02, 0.0, 0.012, S)):
        finish(m, obox((cx, 0.86, cz), (w, 1.3, d)), allr("net"), (cx - w / 2, 0.21, cz - d / 2), (cx + w / 2, 1.51, cz + d / 2), seed, 0.02, 0.0)
    return m.export({"main": atlas.mat(normal_strength=0.5, **Q)})


V2_PILLARS = {
    "prop_pillar_container_a": pillar_container_a,
    "prop_pillar_container_b": pillar_container_b,
    "prop_pillar_scaffold": pillar_scaffold,
}
