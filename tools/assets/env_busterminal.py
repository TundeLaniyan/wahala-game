"""Danfo Bus Park terminal dressing: waiting shelter, jersey road barrier, route sign post, loading-bay booth.
Grey concrete / galvanised steel / transport yellow + black, so it stays in the bus-park palette. Original text only.

Conventions: Y-up, metres, front = +Z, origin on the ground at the footprint centre, one atlas + one material."""
from __future__ import annotations

import numpy as np

from env_buildings import corrugated_roof
from env_lib import EnvModel, box_uv, extrude_x, flat_box, obox, place, rod, vc_ground
from tex_env import (
    PAL,
    Atlas,
    Sheet,
    concrete_sheet,
    corrugated_panel,
    fit_px,
    hazard_board,
    noise2,
    plastic_sheet,
    scuffs,
    speckle,
    steel_sheet,
    stencil,
    stick_poster,
    weather,
    wood_sheet,
)

YEL, BLK = PAL["hazard_yellow"], PAL["hazard_black"]


def painted_steel(w: int, h: int, seed: int, paint, rib: float = 0.0) -> Sheet:
    """Clean-ish enamel-painted sheet steel: gentle mottling, light scuffs, a little edge rust; optional panel ribs."""
    s = Sheet(w, h, paint, rough=0.45, metal=0.1)
    n = noise2(w, h, seed, fx=4, fy=4, octaves=5, beta=2.2)
    s.rgb = s.rgb * (0.93 + 0.1 * n[..., None])
    if rib > 0:
        xs = np.arange(w)[None, :] + 0.5
        r = (np.abs(((xs / rib) % 1.0) - 0.5) < 0.06).astype(float) * np.ones((h, 1))
        s.comp(0x1a1612, r * 0.35, height=-0.2)
    rr = np.clip(noise2(w, h, seed + 1, fx=9, fy=9, octaves=6, beta=1.4) * 1.8 - 1.25, 0, 1)
    s.comp(0x7a3f1c, rr * 0.8, rough=0.9)
    scuffs(s, seed + 2, n=int(w * h / 5000), color=0xd8d4cc, a=0.35)
    return s


def U(mesh, rect):
    return box_uv(mesh, mesh.v.min(axis=0), mesh.v.max(axis=0), rect)


def board(w: int, h: int, seed: int, bg, fg, title: str, sub: str | None = None, arrow: str | None = None, border=None) -> Sheet:
    """Painted route / notice board with optional arrow (left/right)."""
    s = Sheet(w, h, bg, rough=0.55)
    n = noise2(w, h, seed, fx=5, fy=3)
    s.rgb = s.rgb * (0.88 + 0.2 * n[..., None])
    with s.paint(height=0.1, rough=0.5) as d:
        b = border if border is not None else fg
        bw = max(3, h // 16)
        d.rect((0, 0, w, bw), b)
        d.rect((0, h - bw, w, h), b)
        d.rect((0, 0, bw, h), b)
        d.rect((w - bw, 0, w, h), b)
        x0, x1 = bw * 2, w - bw * 2
        if arrow:
            aw = h * 0.7
            ax = x1 - aw if arrow == "right" else x0
            cy = h * 0.5 if not sub else h * 0.42
            if arrow == "right":
                d.poly([(ax, cy - h * 0.12), (ax + aw * 0.55, cy - h * 0.12), (ax + aw * 0.55, cy - h * 0.26), (ax + aw, cy), (ax + aw * 0.55, cy + h * 0.26), (ax + aw * 0.55, cy + h * 0.12), (ax, cy + h * 0.12)], fg)
                x1 = ax - bw
            else:
                d.poly([(ax + aw, cy - h * 0.12), (ax + aw * 0.45, cy - h * 0.12), (ax + aw * 0.45, cy - h * 0.26), (ax, cy), (ax + aw * 0.45, cy + h * 0.26), (ax + aw * 0.45, cy + h * 0.12), (ax + aw, cy + h * 0.12)], fg)
                x0 = ax + aw + bw
        ty = h * (0.42 if sub else 0.52)
        px = fit_px(title, x1 - x0, h * (0.48 if sub else 0.62), "black", 0.88)
        d.text(((x0 + x1) / 2, ty), title, px, fg, "black", "cm", squeeze=0.88)
        if sub:
            d.text(((x0 + x1) / 2, h * 0.8), sub, fit_px(sub, x1 - x0, h * 0.18, "bold"), fg, "bold", "cm")
    weather(s, seed + 1, ground=0.1, streaks=0.35, top_soot=0.2)
    speckle(s, seed + 2, amount=0.35, density=0.004)
    return s


# ============================================================================ waiting shelter


def bp_shelter() -> dict:
    """Terminal waiting shelter (3.0 x 1.4, 2.4 high): yellow steel posts, galvanised corrugated canopy sloping back,
    back screen with posters, bench, hanging destination board. Front = +Z."""
    seed = 1201
    atlas = Atlas(1024, 512, 0x808080)
    atlas.add("roof", 0, 0, corrugated_panel(384, 192, seed, 0xb4bcc2, ribs=20, rust=0.45, wear=0.5))
    atlas.add("post", 388, 0, painted_steel(96, 96, seed + 1, YEL))
    atlas.add("dark", 488, 0, steel_sheet(64, 64, seed + 2, tone=0x3a3c40, rust=0.3, paint=0x2a2c30))
    scr = concrete_sheet(384, 160, seed + 3, 0xb9b4aa, stains=0.45)
    stick_poster(scr, x=30, y=20, w=80, h=110, seed=1301, rot=2, kind="concert")
    stick_poster(scr, x=150, y=28, w=74, h=100, seed=1302, rot=-3, kind="sale")
    stick_poster(scr, x=262, y=22, w=82, h=112, seed=1303, rot=1, kind="notice")
    weather(scr, seed + 4, ground=0.3, streaks=0.3, top_soot=0.2)
    atlas.add("screen", 0, 196, scr)
    atlas.add("dest", 388, 100, board(448, 96, seed + 5, 0x0b5a33, 0xffffff, "OSHODI  -  OBALENDE  -  CMS", "LOADING BAY 4  *  NO SMOKING", border=YEL))
    atlas.add("bench", 0, 360, wood_sheet(384, 48, seed + 6, 0x8a6038, "x", wear=0.7, knots=1, gap=2))
    atlas.add("hazard", 388, 200, hazard_board(256, 64, seed + 7, stripe=20, wear=0.5))
    m = EnvModel("bp_shelter")
    R = atlas.rect
    W, D, H = 3.0, 1.4, 2.4
    for sx in (-1, 0, 1):
        x = sx * (W / 2 - 0.06)
        for z, hh in ((-D / 2 + 0.08, H), (D / 2 - 0.08, H - 0.22)):
            p = obox((x, hh / 2, z), (0.08, hh, 0.08), bevel=0.01, seg=1)
            m.add(vc_ground(U(p, R("post")), 0.2, 0.4, seed))
            m.add(U(obox((x, 0.02, z), (0.18, 0.04, 0.18)), R("dark")))
        # hazard sleeve on the front posts (bumper height)
        m.add(U(obox((x, 0.45, D / 2 - 0.08), (0.095, 0.5, 0.095)), R("hazard")))
        # roof beam front-back
        m.add(U(obox((x, H - 0.11, 0), (0.07, 0.07, D + 0.1), rot=(np.degrees(np.arctan2(0.22, D)), 0, 0)), R("dark")))
    pitch = np.degrees(np.arctan2(0.22, D))
    a, b = corrugated_roof((0, H - 0.05, 0), (W + 0.3, D + 0.4), pitch, 0, 14)
    m.add(U(a, R("roof")))
    m.add(U(b, R("dark")))
    # back screen
    sc = flat_box((W - 0.2, 1.55, 0.04), (0, 0.35 + 0.775, -D / 2 + 0.08))
    m.add(vc_ground(box_uv(sc, sc.v.min(axis=0), sc.v.max(axis=0), {"+z": R("screen"), "-z": R("screen"), "any": R("dark")}), 0.4, 0.3, seed))
    # bench: slats on steel legs
    for k in range(3):
        sl = flat_box((W - 0.4, 0.03, 0.09), (0, 0.46, -D / 2 + 0.3 + k * 0.1))
        m.add(U(sl, R("bench")))
    for sx in (-1, 0, 1):
        m.add(vc_ground(U(obox((sx * (W / 2 - 0.35), 0.225, -D / 2 + 0.4), (0.05, 0.45, 0.3)), R("dark")), 0.12, 0.4, seed))
    # destination board hanging under the front edge
    db = flat_box((1.9, 0.4, 0.03))
    db = box_uv(db, db.v.min(axis=0), db.v.max(axis=0), {"+z": R("dest"), "-z": R("dest"), "any": R("dark")})
    m.add(place(db, (0, H - 0.6, D / 2 - 0.02)))
    for sx in (-0.8, 0.8):
        m.add(U(rod((sx, H - 0.4, D / 2 - 0.02), (sx, H - 0.22, D / 2 - 0.06), 0.008, 4), R("dark")))
    return m.export({"main": atlas.mat(normal_strength=0.5, jpeg_q=74, nblur=0.3)})


# ============================================================================ jersey barrier


def bp_barrier() -> dict:
    """Concrete jersey road barrier 1.6 m long, red / white painted blocks with reflector studs. Front = +Z."""
    seed = 1231
    atlas = Atlas(512, 256, 0x808080)
    face = concrete_sheet(512, 128, seed, 0xc9c4ba, stains=0.4)
    with face.paint(height=0.06, rough=0.7) as d:
        for k in range(4):
            if k % 2 == 0:
                d.rect((k * 128, 0, (k + 1) * 128, 128), 0xc8262a, a=0.95)
    weather(face, seed + 1, ground=0.45, ground_h=0.25, streaks=0.3, top_soot=0.15, tone_dark=0x3a342e)
    scuffs(face, seed + 2, n=18, color=0xe0dbd0)
    speckle(face, seed + 3, amount=0.5, density=0.006)
    atlas.add("face", 0, 0, face)
    top = concrete_sheet(512, 64, seed + 4, 0xb4afa5, stains=0.4)
    atlas.add("top", 0, 132, top)
    atlas.add("refl", 0, 200, Sheet(32, 32, 0xffb81c, rough=0.25))
    m = EnvModel("bp_barrier")
    R = atlas.rect
    L = 1.6
    prof = [(-0.30, 0.0), (0.30, 0.0), (0.30, 0.08), (0.24, 0.26), (0.09, 0.78), (-0.09, 0.78), (-0.24, 0.26), (-0.30, 0.08)]
    body = extrude_x(prof, -L / 2, L / 2)
    rects = {"+z": R("face"), "-z": R("face"), "+y": R("top"), "-y": R("top"), "+x": R("top"), "-x": R("top")}
    m.add(vc_ground(box_uv(body, (-L / 2, 0, -0.3), (L / 2, 0.78, 0.3), rects), 0.1, 0.45, seed))
    for x in (-0.5, 0.5):
        for sz in (-1, 1):
            st = obox((x, 0.58, sz * 0.155), (0.07, 0.05, 0.02), rot=(sz * 16, 0, 0))
            m.add(U(st, R("refl")))
    return m.export({"main": atlas.mat(normal_strength=0.5, jpeg_q=78)})


# ============================================================================ route sign post


def bp_sign() -> dict:
    """Green route sign post (2.6 m) with four destination boards pointing both ways. Front = +Z."""
    seed = 1261
    atlas = Atlas(512, 512, 0x808080)
    dests = [("OSHODI", "right", 0x0b6b3c), ("CMS", "left", 0x0b6b3c), ("OBALENDE", "right", 0x1d4f9c), ("YABA", "left", 0x1d4f9c)]
    for i, (t, ar, bg) in enumerate(dests):
        atlas.add(f"d{i}", 0, i * 84, board(320, 80, seed + i, bg, 0xffffff, t, None, ar))
    atlas.add("pole", 330, 0, steel_sheet(96, 256, seed + 9, tone=0x9a9ea2, rust=0.4))
    atlas.add("band", 330, 260, hazard_board(96, 64, seed + 10, stripe=14, wear=0.5))
    top = board(160, 80, seed + 11, YEL, BLK, "BUS STOP", "DANFO PARK", border=BLK)
    atlas.add("top", 330, 330, top)
    m = EnvModel("bp_sign")
    R = atlas.rect
    m.add(vc_ground(U(rod((0, 0, 0), (0, 2.6, 0), 0.04, 8), R("pole")), 0.2, 0.4, seed))
    m.add(U(rod((0, 0.0, 0), (0, 0.06, 0), 0.12, 8), R("pole")))
    m.add(U(rod((0, 0.1, 0), (0, 0.55, 0), 0.046, 8), R("band")))
    for i, (_, ar, _) in enumerate(dests):
        y = 2.2 - i * 0.28
        x = 0.38 if ar == "right" else -0.38
        b = flat_box((0.72, 0.18, 0.025))
        b = box_uv(b, b.v.min(axis=0), b.v.max(axis=0), {"+z": R(f"d{i}"), "-z": R(f"d{i}"), "any": R("pole")})
        m.add(place(b, (x, y, 0.03 if i % 2 == 0 else -0.03), (0, (8 if ar == "right" else -8) * (1 if i < 2 else -1), 0)))
    tb = flat_box((0.6, 0.3, 0.025))
    tb = box_uv(tb, tb.v.min(axis=0), tb.v.max(axis=0), {"+z": R("top"), "-z": R("top"), "any": R("pole")})
    m.add(place(tb, (0, 2.48, 0.05)))
    return m.export({"main": atlas.mat(normal_strength=0.4, jpeg_q=80)})


# ============================================================================ loading-bay booth


def bp_booth() -> dict:
    """Park union loading-bay booth (1.4 x 1.1, 2.3 high): yellow/black painted steel box with a ticket window,
    sloping tin roof, a roof sign, a plastic chair and a megaphone horn. Front = +Z."""
    seed = 1291
    atlas = Atlas(1024, 512, 0x808080)
    front = painted_steel(320, 320, seed, YEL, rib=64)
    with front.paint(height=-0.3) as d:  # ticket hatch recess
        d.rect((60, 70, 260, 190), 0x1a1612)
    with front.paint(height=0.1, rough=0.5) as d:
        d.rect((0, 240, 320, 320), BLK)
        d.rect((56, 66, 264, 72), 0x2a2a2c)
        d.text((160, 280), "LOADING BAY 3", 34, YEL, "black", "cm", squeeze=0.88)
        d.text((160, 220), "TICKETS HERE", 22, BLK, "black", "cm", squeeze=0.9)
    with front.paint(height=0.05) as d:
        for k in range(5):
            d.rect((70 + k * 38, 74, 78 + k * 38, 186), 0x3a3a3c)  # bars
    weather(front, seed + 1, ground=0.35, ground_h=0.15, streaks=0.4, top_soot=0.2, tone_dark=0x3a3024)
    atlas.add("front", 0, 0, front)
    side = painted_steel(256, 320, seed + 2, YEL, rib=64)
    with side.paint(height=0.1) as d:
        d.rect((0, 240, 256, 320), BLK)
    stick_poster(side, x=60, y=40, w=100, h=140, seed=1311, rot=-2, kind="notice")
    weather(side, seed + 3, ground=0.35, ground_h=0.15, streaks=0.4, top_soot=0.2, tone_dark=0x3a3024)
    atlas.add("side", 324, 0, side)
    atlas.add("roof", 584, 0, corrugated_panel(256, 160, seed + 4, 0xa8aeb4, ribs=12, rust=0.6, wear=0.6))
    atlas.add("sign", 0, 330, board(384, 96, seed + 5, 0x14141a, YEL, "PARK UNION", "LOADING BAY  *  PAY HERE", border=YEL))
    atlas.add("dark", 584, 170, steel_sheet(64, 64, seed + 6, tone=0x3a3c40, rust=0.3, paint=0x2a2c30))
    atlas.add("chair", 660, 170, plastic_sheet(64, 64, seed + 7, 0xd62839, rough=0.4))
    atlas.add("horn", 730, 170, plastic_sheet(64, 64, seed + 8, 0xe8e6df, rough=0.4))
    atlas.add("counter", 390, 330, wood_sheet(256, 48, seed + 9, 0x8a6038, "x", wear=0.6, knots=1, gap=2))
    m = EnvModel("bp_booth")
    R = atlas.rect
    W, D, H = 1.4, 1.1, 2.0
    rects = {"+z": R("front"), "-z": R("side"), "+x": R("side"), "-x": R("side"), "+y": R("dark"), "-y": R("dark")}
    body = flat_box((W, H, D), (0, H / 2 + 0.05, 0))
    m.add(vc_ground(box_uv(body, (-W / 2, 0.05, -D / 2), (W / 2, H + 0.05, D / 2), rects), 0.3, 0.35, seed))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(U(obox((sx * (W / 2 - 0.05), 0.025, sz * (D / 2 - 0.05)), (0.1, 0.05, 0.1)), R("dark")))
    a, b = corrugated_roof((0, H + 0.12, 0.05), (W + 0.3, D + 0.35), -9, 0, 9)
    m.add(U(a, R("roof")))
    m.add(U(b, R("dark")))
    ct = flat_box((0.85, 0.035, 0.22), (0, 0.78, D / 2 + 0.1))
    m.add(U(ct, R("counter")))
    sg = flat_box((1.3, 0.34, 0.03))
    sg = box_uv(sg, sg.v.min(axis=0), sg.v.max(axis=0), {"+z": R("sign"), "-z": R("sign"), "any": R("dark")})
    m.add(place(sg, (0, H + 0.42, 0.2)))
    for sx in (-0.5, 0.5):
        m.add(U(rod((sx, H + 0.2, 0.2), (sx, H + 0.27, 0.2), 0.015, 5), R("dark")))
    # megaphone horn on a bracket at the roof corner (the park caller)
    from env_lib import lathe, outward

    horn = outward(lathe([(0.0, 0.0), (0.03, 0.0), (0.035, 0.05), (0.12, 0.22), (0.13, 0.23), (0.0, 0.23)], 10, closed_axis=True))
    horn = U(horn, R("horn"))
    m.add(place(horn, (W / 2 + 0.05, H + 0.05, D / 2 - 0.1), (70, 30, 0)))
    # red plastic chair beside the booth
    cx, cz = W / 2 + 0.35, 0.3
    m.add(U(obox((cx, 0.42, cz), (0.38, 0.035, 0.38), bevel=0.01, seg=1), R("chair")))
    for dx in (-0.16, 0.16):
        for dz in (-0.16, 0.16):
            m.add(U(rod((cx + dx, 0.0, cz + dz), (cx + dx * 0.85, 0.41, cz + dz * 0.85), 0.015, 5), R("chair")))
    m.add(U(place(obox((0, 0, 0), (0.38, 0.32, 0.03), bevel=0.008, seg=1), (cx, 0.62, cz - 0.18), (-10, 0, 0)), R("chair")))
    return m.export({"main": atlas.mat(normal_strength=0.5, jpeg_q=74, nblur=0.3)})


BUSTERMINAL = {"bp_shelter": bp_shelter, "bp_barrier": bp_barrier, "bp_sign": bp_sign, "bp_booth": bp_booth}
