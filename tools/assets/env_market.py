"""Balogun Market set: permanent stall blocks, destructible goods, perimeter stall wall, stalls, parasols, fabric
racks and two-storey market shop buildings. Bright, saturated and patterned so the arena reads as a different place
from the grey precast Danfo Bus Park at a glance.

Conventions as everywhere: Y-up, metres (1 tile = 1.0), front = +Z, origin on the ground at the footprint centre,
one atlas + one material per model (soft blocks MUST stay single mesh / single material for instancing)."""
from __future__ import annotations

import numpy as np

import tex as texlib
from env_buildings import BD, BW, PARAPET, awning_part, awning_tile, balcony_parts, build_building, tank
from env_facade import Facade
from env_lib import (
    EnvModel,
    beam,
    bevel_box,
    box_uv,
    chamfer_prism,
    cyl_uv,
    flat_box,
    flat_uv,
    lathe,
    noisy,
    obox,
    outward,
    place,
    planar_uv,
    rect_poly,
    rod,
    vc_ground,
    vc_mul,
)
from loft import Mesh, sphere
from tex_env import (
    Atlas,
    Sheet,
    concrete_sheet,
    corrugated_panel,
    fit_px,
    noise2,
    plastic_sheet,
    scuffs,
    speckle,
    srgb,
    stencil,
    steel_sheet,
    tile_x,
    weather,
    wood_sheet,
)
from tex_market import MKT, ANKARA_SETS, ankara_sheet, asooke_sheet, fold_shade, painted_plaster, produce_sheet, raffia_sheet, yam_sheet


def U(mesh, rect):
    """Box-project a part onto one tile using its own bounds."""
    return box_uv(mesh, mesh.v.min(axis=0), mesh.v.max(axis=0), rect)


def brick_sheet(w: int, h: int, seed: int, tone=0xa8553a, rows: int = 6, cols: int = 4) -> Sheet:
    t = texlib.brick(256, seed, tone, rows=rows * 2, cols=cols)
    s = Sheet.from_tex(t, w, h)
    s.rough[:] = 0.92
    return s


# ============================================================================ shared geometry


def cloth_panel(w: float, h: float, waves: float = 2.0, amp: float = 0.02, nx: int = 8, ny: int = 4, sag: float = 0.0, thick: float = 0.012) -> Mesh:
    """A hanging cloth (x across, y down from the top edge at y=0), rippled in z; closed thin slab so both faces shade.
    Front face (+z) and back share the same planar UV over the panel."""
    xs = np.linspace(-w / 2, w / 2, nx + 1)
    ys = np.linspace(0, -h, ny + 1)
    verts = []
    for side in (1, -1):
        for y in ys:
            k = -y / max(h, 1e-6)
            for x in xs:
                z = amp * (0.3 + 0.7 * k) * np.sin((x / w + 0.5) * waves * 2 * np.pi) + side * thick / 2
                yy = y - sag * (1 - (2 * x / w) ** 2) * (1 - k)
                verts.append((x, yy, z))
    n = (nx + 1) * (ny + 1)
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            b, c, d = a + 1, a + nx + 1, a + nx + 2
            faces += [(a, c, b), (b, c, d)]  # front (+z)
            faces += [(n + a, n + b, n + c), (n + b, n + d, n + c)]  # back
    # side edges
    for j in range(ny):
        for i in (0, nx):
            a, c = j * (nx + 1) + i, (j + 1) * (nx + 1) + i
            faces += [(a, n + a, c), (n + a, n + c, c)] if i == 0 else [(a, c, n + a), (n + a, c, n + c)]
    for i in range(nx):
        a, b = i, i + 1
        faces += [(a, b, n + a), (b, n + b, n + a)]
        a, b = ny * (nx + 1) + i, ny * (nx + 1) + i + 1
        faces += [(a, n + a, b), (b, n + a, n + b)]
    return Mesh(np.array(verts), np.array(faces))


def cloth_uv(m: Mesh, rect, w: float, h: float) -> Mesh:
    return planar_uv(m, rect, (-w / 2, -h, 0), (1, 0, 0), (0, 1, 0), w, h)


def basin(r_top: float, r_bot: float, h: float, lip: float = 0.025, sides: int = 16) -> Mesh:
    """Open plastic basin (outer wall + rolled lip + inner wall + floor), lathe."""
    prof = [(0.0, 0.0), (r_bot, 0.0), (r_top, h), (r_top + lip, h + 0.004), (r_top + lip * 0.6, h + 0.016), (r_top - 0.012, h + 0.008), (r_bot - 0.012, 0.014), (0.0, 0.014)]
    return lathe(prof, sides, closed_axis=False)


def basin_uv(m: Mesh, rect, h: float) -> Mesh:
    return cyl_uv(m, (0, 0, 0), rect, axis="y", v_range=(0, h + 0.02), u_repeat=2, mirror=True)


def heap(cx: float, y0: float, cz: float, rx: float, ry: float, rz: float, seed: int, lumpy: float = 0.012, res=(6, 14)) -> Mesh:
    """Upper half-ellipsoid mound of produce sitting at y0 (flat underside hidden in the container)."""
    s = sphere((0, 0, 0), (rx, ry, rz), *res)
    s.v[:, 1] = np.maximum(s.v[:, 1], -0.01)
    s = noisy(s, lumpy, 9.0, seed)
    s.v += np.array([cx, y0, cz])
    return s


def heap_uv(m: Mesh, rect) -> Mesh:
    lo, hi = m.v.min(axis=0), m.v.max(axis=0)
    return planar_uv(m, rect, (lo[0], 0, hi[2]), (1, 0, 0), (0, 0, -1), hi[0] - lo[0], hi[2] - lo[2])


def ball(c, r, lat=4, lon=7) -> Mesh:
    return sphere(c, (r, r * 0.9, r), lat, lon)


def tin_cap(size: float, y0: float, rise: float, eave: float = 0.02) -> Mesh:
    """Low hip roof of corrugated tin (square pyramid frustum) for posts."""
    return chamfer_prism(rect_poly(size, size), y0, y0 + eave + rise, ct=size / 2 - 0.03, ct_h=rise)


# ============================================================================ permanent: stall post


def _post_side(seed: int, w: int, h: int, H: float, band, label: str | None, base_tone, paint_tone) -> Sheet:
    """Side tile of a market post: exposed brick foot, bright painted render, two-colour band, stencilled stall code."""
    s = painted_plaster(w, h, seed, paint_tone, grime=0.3)
    ppm = h / H
    yp = lambda y: h - 1 - y * ppm  # noqa: E731
    br = brick_sheet(w, int(0.30 * ppm) + 2, seed + 1, base_tone, rows=4, cols=3)
    s.paste(br, 0, int(yp(0.30)))
    with s.paint(height=0.15, rough=0.8) as d:  # rendered skirting lip over the brick
        d.rect((0, yp(0.33), w, yp(0.295)), 0xd9d2c2)
        c1, c2 = band
        d.rect((0, yp(0.47), w, yp(0.40)), c1)
        d.rect((0, yp(0.395), w, yp(0.375)), c2)
        d.rect((0, yp(0.88), w, yp(0.85)), c2)
    if label:
        stencil(s, label, (w / 2, yp(0.66)), int(h * 0.15), 0xf8f4ea, "black", a=0.92, squeeze=0.85, wear=0.35, seed=seed + 3)
    weather(s, seed + 4, ground=0.4, ground_h=0.1, streaks=0.25, top_soot=0.1, tone_dark=0x3a2e26)
    scuffs(s, seed + 5, n=10, color=0xe6dfd0)
    speckle(s, seed + 6, amount=0.4, density=0.004)
    return s


def mkt_hard_post() -> dict:
    """Isolated permanent block: brick-footed painted stall pillar with a tin hip cap, a hung cloth and a sign."""
    seed = 701
    H = 0.96
    atlas = Atlas(512, 512, 0x808080)
    atlas.add("front", 0, 0, _post_side(seed, 192, 224, H, (MKT["yellow"], MKT["red"]), None, 0xa8553a, 0x1f8fb8))
    atlas.add("side", 196, 0, _post_side(seed + 10, 192, 224, H, (MKT["yellow"], MKT["red"]), "C14", 0xa8553a, 0x1f8fb8))
    atlas.add("top", 392, 0, painted_plaster(112, 112, seed + 20, 0xd8d0c0))
    atlas.add("roof", 0, 230, corrugated_panel(256, 128, seed + 21, 0xb7bcc0, ribs=12, rust=0.55, wear=0.6))
    atlas.add("cloth", 260, 230, fold_shade(ankara_sheet(128, 160, seed + 22, ANKARA_SETS[1], cell=22, kind=0), 40, axis=1, k=0.18))
    atlas.add("cloth2", 392, 120, fold_shade(ankara_sheet(112, 160, seed + 23, ANKARA_SETS[2], cell=20, kind=3), 28, axis=1, k=0.2))
    sign = Sheet(160, 64, MKT["green"], rough=0.6)
    with sign.paint(height=0.1) as d:
        d.rect((0, 0, 160, 5), MKT["yellow"])
        d.rect((0, 59, 160, 64), MKT["yellow"])
        px = fit_px("ALHAJI & SONS", 148, 30, "black", 0.85)
        d.text((80, 26), "ALHAJI & SONS", px, MKT["white"], "black", "cm", squeeze=0.85)
        d.text((80, 49), "LACE & GEORGE", fit_px("LACE & GEORGE", 120, 14, "bold"), MKT["yellow"], "bold", "cm")
    weather(sign, seed + 24, ground=0.1, streaks=0.3, top_soot=0.2)
    atlas.add("sign", 260, 394, sign)
    atlas.add("wood", 0, 362, wood_sheet(256, 48, seed + 25, 0x7a5232, "x", wear=0.6, knots=1, gap=2))
    m = EnvModel("mkt_hard_post")
    R = atlas.rect
    W = 0.80
    side = {"+z": R("front"), "-z": R("side"), "+x": R("side"), "-x": R("side"), "+y": R("top"), "-y": R("top")}
    lo, hi = (-W / 2, 0.0, -W / 2), (W / 2, H, W / 2)
    body = chamfer_prism(rect_poly(W, W), 0.0, H, ct=0.012)
    m.add(vc_ground(box_uv(body, lo, hi, side), 0.16, 0.35, seed))
    foot = chamfer_prism(rect_poly(0.86, 0.86), 0.0, 0.07, ct=0.012)
    m.add(vc_ground(box_uv(foot, (-0.43, 0, -0.43), (0.43, H, 0.43), side), 0.08, 0.45, seed))
    slab = chamfer_prism(rect_poly(0.88, 0.88), H, H + 0.04, cb=0.01, ct=0.01)
    m.add(U(slab, R("top")))
    cap = tin_cap(0.94, H + 0.04, 0.09)
    m.add(box_uv(cap, cap.v.min(axis=0), cap.v.max(axis=0), {"any": R("roof"), "+y": R("roof"), "-y": R("roof")}))
    # cloth draped over the front-left, sign board on the right half of the front face
    c = cloth_uv(cloth_panel(0.30, 0.52, waves=2.5, amp=0.018, nx=6, ny=4), R("cloth"), 0.30, 0.52)
    m.add(place(c, (-0.2, H - 0.02, W / 2 + 0.018)))
    rail = rod((-0.37, H - 0.015, W / 2 + 0.02), (-0.03, H - 0.015, W / 2 + 0.02), 0.012, 6)
    m.add(U(rail, R("wood")))
    sb = obox((0.0, 0.0, 0.0), (0.36, 0.15, 0.02), bevel=0.004, seg=1)
    m.add(place(box_uv(sb, sb.v.min(axis=0), sb.v.max(axis=0), {"+z": R("sign"), "any": R("wood")}), (0.19, 0.72, W / 2 + 0.014), (0, 0, -2)))
    # a second cloth hanging on the right face
    c2 = cloth_uv(cloth_panel(0.26, 0.44, waves=2.0, amp=0.016, nx=5, ny=4), R("cloth2"), 0.26, 0.44)
    m.add(place(c2, (W / 2 + 0.018, H - 0.03, -0.12), (0, 90, 0)))
    return m.export({"main": atlas.mat(normal_strength=0.45, jpeg_q=80)})


# ============================================================================ permanent: counter segment


def _counter_side(seed: int, w: int, h: int, H: float, paint_tone, band) -> Sheet:
    s = painted_plaster(w, h, seed, paint_tone, grime=0.3)
    tile_x(s)
    ppm = h / H
    yp = lambda y: h - 1 - y * ppm  # noqa: E731
    br = brick_sheet(w, int(0.20 * ppm) + 2, seed + 1, 0xa04e34, rows=3, cols=4)
    tile_x(br)
    s.paste(br, 0, int(yp(0.20)))
    with s.paint(height=0.15, rough=0.8) as d:
        d.rect((0, yp(0.225), w, yp(0.195)), 0xd9d2c2)
        d.rect((0, yp(0.56), w, yp(0.50)), band[0])
        d.rect((0, yp(0.495), w, yp(0.48)), band[1])
    weather(s, seed + 4, ground=0.4, ground_h=0.1, streaks=0.2, top_soot=0.05, tone_dark=0x3a2e26, tile=True)
    scuffs(s, seed + 5, n=8, color=0xe6dfd0)
    return s


def mkt_hard_counter() -> dict:
    """Joinable trading counter: masonry base x in [-0.5, 0.5] (textures periodic in x), plank top, goods on top.
    Rotated 90 degrees by the game for vertical runs; both long faces are dressed."""
    seed = 731
    HB = 0.60  # masonry height
    atlas = Atlas(512, 512, 0x808080)
    atlas.add("face", 0, 0, _counter_side(seed, 256, 160, HB, 0x2e9a5a, (MKT["yellow"], MKT["white"])))
    atlas.add("face2", 256, 0, _counter_side(seed + 9, 256, 160, HB, 0x2e9a5a, (MKT["yellow"], MKT["white"])))
    plank = wood_sheet(256, 64, seed + 2, 0x8a5a32, "x", wear=0.6, knots=1, gap=2)
    tile_x(plank)
    atlas.add("plank", 0, 164, plank)
    atlas.add("end", 260, 164, painted_plaster(96, 96, seed + 3, 0x2e9a5a))
    atlas.add("tomato", 360, 164, produce_sheet(128, 128, seed + 4, "tomato"))
    atlas.add("pepper", 0, 232, produce_sheet(128, 128, seed + 5, "pepper"))
    atlas.add("basin_r", 132, 232, plastic_sheet(64, 64, seed + 6, 0xd8262f, rough=0.35, grime=0.2))
    atlas.add("basin_b", 200, 232, plastic_sheet(64, 64, seed + 7, 0x1f5fd6, rough=0.35, grime=0.2))
    atlas.add("ank0", 270, 296, fold_shade(ankara_sheet(112, 96, seed + 8, ANKARA_SETS[0], cell=18, kind=1), 12, axis=0, k=0.25))
    atlas.add("ank1", 386, 296, fold_shade(ankara_sheet(112, 96, seed + 9, ANKARA_SETS[3], cell=18, kind=2), 12, axis=0, k=0.25))
    atlas.add("ank2", 0, 364, fold_shade(ankara_sheet(112, 96, seed + 10, ANKARA_SETS[6], cell=18, kind=0), 12, axis=0, k=0.25))
    atlas.add("onion", 116, 364, produce_sheet(128, 128, seed + 11, "onion"))
    m = EnvModel("mkt_hard_counter")
    R = atlas.rect
    D = 0.80
    face = {"+z": R("face"), "-z": R("face2"), "+x": R("end"), "-x": R("end"), "+y": R("end"), "-y": R("end")}
    body = flat_box((1.0, HB, D), (0, HB / 2, 0))
    m.add(vc_ground(box_uv(body, (-0.5, 0, -D / 2), (0.5, HB, D / 2), face), 0.14, 0.4, seed))
    top = flat_box((1.0, 0.05, 0.88), (0, HB + 0.025, 0))
    pr = R("plank")
    m.add(box_uv(top, (-0.5, HB, -0.44), (0.5, HB + 0.05, 0.44), {"+y": pr, "-y": pr, "+z": pr, "-z": pr, "+x": R("end"), "-x": R("end")}))
    y = HB + 0.05
    # goods: red basin of tomatoes (left), stacked ankara bolts (right), small blue basin of peppers + onions (front)
    b = basin(0.17, 0.12, 0.11)
    m.add(place(basin_uv(b, R("basin_r"), 0.11), (-0.26, y, -0.08)))
    m.add(heap_uv(heap(-0.26, y + 0.1, 0, 0.16, 0.09, 0.16, seed), R("tomato")))
    rng = np.random.default_rng(seed)
    for k in range(5):
        a = rng.uniform(0, 2 * np.pi)
        rr = rng.uniform(0.02, 0.1)
        bb = ball((-0.26 + rr * np.cos(a), y + 0.19 + rng.uniform(-0.01, 0.02), -0.08 + rr * np.sin(a)), 0.034)
        m.add(heap_uv(bb, R("tomato")))
    for k, (tile, hh, ww) in enumerate((("ank0", 0.09, 0.36), ("ank1", 0.085, 0.33), ("ank2", 0.08, 0.30))):
        bolt = bevel_box((0, 0, 0), (ww, hh, 0.26), bevel=0.025, seg=2)
        bolt = box_uv(bolt, bolt.v.min(axis=0), bolt.v.max(axis=0), {"+z": R(tile), "-z": R(tile), "+x": R(tile), "-x": R(tile), "+y": R(tile), "-y": R(tile)})
        m.add(place(bolt, (0.2 + 0.01 * k, y + hh / 2 + sum((0.09, 0.085, 0.08)[:k]), 0.02 - 0.01 * k), (0, (-5, 7, -3)[k], 0)))
    b2 = basin(0.10, 0.07, 0.07)
    m.add(place(basin_uv(b2, R("basin_b"), 0.07), (-0.02, y, 0.24)))
    m.add(heap_uv(heap(-0.02, y + 0.065, 0.0, 0.095, 0.05, 0.095, seed + 1), R("pepper")))
    m.add(heap_uv(heap(0.22, y, 0.26, 0.11, 0.07, 0.08, seed + 2), R("onion")))
    return m.export({"main": atlas.mat(normal_strength=0.45, jpeg_q=80)})


# ============================================================================ destructible goods (single mesh/material)


def _pallet(atlas, seed, w=0.84, d=0.84, h=0.08):
    parts = []
    r = atlas.rect("wood")
    for k in range(5):  # top boards
        z = -d / 2 + d * (k + 0.5) / 5
        b = flat_box((w, 0.022, d / 5 - 0.02), (0, h - 0.011, z))
        parts.append(vc_ground(U(b, r), 0.1, 0.4, seed))
    for x in (-w / 2 + 0.05, 0.0, w / 2 - 0.05):
        b = flat_box((0.08, h - 0.022, d), (x, (h - 0.022) / 2, 0))
        parts.append(vc_ground(vc_mul(U(b, r), (1, 1, 1), 0.6), 0.1, 0.5, seed))
    return parts


def mkt_soft_fabric() -> dict:
    """Stacked folded ankara / aso-oke bolts on a low pallet, a rolled bolt on top."""
    seed = 801
    atlas = Atlas(512, 512, 0x808080)
    for i in range(6):
        sh = ankara_sheet(160, 120, seed + i, ANKARA_SETS[(i * 3) % len(ANKARA_SETS)], cell=26, kind=i % 4)
        atlas.add(f"a{i}", (i % 3) * 164, (i // 3) * 124, fold_shade(sh, 15, axis=0, k=0.28))
    atlas.add("aso", 0, 252, asooke_sheet(256, 96, seed + 9))
    atlas.add("wood", 260, 252, wood_sheet(200, 48, seed + 10, 0x9a6a3e, "x", wear=0.6, knots=1, gap=2))
    m = EnvModel("mkt_soft_fabric")
    m.add(_pallet(atlas, seed))
    rng = np.random.default_rng(seed)
    y = 0.08
    sizes = [(0.80, 0.13, 0.62), (0.76, 0.12, 0.60), (0.74, 0.12, 0.58), (0.70, 0.11, 0.56)]
    for k, (w, h, d) in enumerate(sizes):
        t = f"a{(k * 2 + 1) % 6}"
        bolt = bevel_box((0, 0, 0), (w, h, d), bevel=0.04, seg=2)
        r = atlas.rect(t)
        bolt = box_uv(bolt, bolt.v.min(axis=0), bolt.v.max(axis=0), {"+z": r, "-z": r, "+x": r, "-x": r, "+y": r, "-y": r})
        bolt.v[:, 1] *= 1 + 0.08 * np.cos(bolt.v[:, 0] * 6)  # soft, uneven fold
        m.add(vc_ground(place(bolt, (rng.uniform(-0.02, 0.02), y + h / 2, rng.uniform(-0.03, 0.06)), (0, rng.uniform(-6, 6), 0)), 0.14, 0.35, seed))
        y += h * 0.97
    roll = rod((-0.32, y + 0.065, 0.12), (0.32, y + 0.065, -0.02), 0.068, 12)
    roll = cyl_uv(roll, (0, y + 0.065, 0.05), atlas.rect("aso"), axis="x", v_range=(-0.33, 0.33), u_repeat=1, mirror=True)
    m.add(roll)
    return m.export({"main": atlas.mat(normal_strength=0.4, jpeg_q=82)})


def mkt_soft_produce() -> dict:
    """Low wooden crate heaped with tomatoes, a few peppers and a raffia tray of scotch bonnets on top."""
    seed = 811
    atlas = Atlas(512, 512, 0x808080)
    atlas.add("tomato", 0, 0, produce_sheet(256, 256, seed, "tomato"))
    atlas.add("pepper", 260, 0, produce_sheet(192, 192, seed + 1, "pepper"))
    for i, tone in enumerate((0xc48a52, 0xb47a46, 0xd29a5e)):
        atlas.add(f"w{i}", 0, 260 + i * 52, wood_sheet(256, 48, seed + 2 + i, tone, "x", wear=0.5, knots=1, gap=2))
    atlas.add("raffia", 260, 200, raffia_sheet(192, 96, seed + 6, 0xd2a85e, band=[(0.4, 0.55, MKT["red"]), (0.7, 0.8, MKT["green"])]))
    atlas.add("dark", 260, 300, Sheet(64, 32, 0x2a1810))
    stencil_s = wood_sheet(256, 48, seed + 7, 0xc48a52, "x", wear=0.5, knots=0, gap=2)
    stencil(stencil_s, "OYINGBO FRESH", (128, 24), 26, 0x2a2a2a, "black", a=0.8, squeeze=0.9, wear=0.5, seed=4)
    atlas.add("ws", 0, 420, stencil_s)
    m = EnvModel("mkt_soft_produce")
    R = atlas.rect
    W, Hc = 0.80, 0.34
    rng = np.random.default_rng(seed)
    m.add(flat_uv(flat_box((W - 0.06, Hc - 0.04, W - 0.06), (0, Hc / 2, 0)), R("dark")))
    for side in ("+z", "-z", "+x", "-x"):
        for k in range(2):
            yc = 0.06 + k * 0.155 + 0.07
            along_x = side in ("+z", "-z")
            sgn = 1 if side[0] == "+" else -1
            size = (W, 0.13, 0.02) if along_x else (0.02, 0.13, W - 0.04)
            c = (0, yc, sgn * (W / 2 - 0.01)) if along_x else (sgn * (W / 2 - 0.01), yc, 0)
            tile = "ws" if (side == "+z" and k == 1) else f"w{int(rng.integers(0, 3))}"
            sl = obox(c, size)
            m.add(vc_ground(box_uv(sl, sl.v.min(axis=0), sl.v.max(axis=0), R(tile)), 0.1, 0.45, seed))
    for sx in (-1, 1):
        for sz in (-1, 1):
            p = obox((sx * (W / 2 - 0.03), Hc / 2, sz * (W / 2 - 0.03)), (0.06, Hc, 0.06), bevel=0.006, seg=1)
            m.add(vc_ground(U(p, R("w1")), 0.1, 0.45, seed))
    m.add(heap_uv(heap(0, Hc - 0.04, 0, 0.39, 0.2, 0.39, seed, 0.018), R("tomato")))
    for k in range(9):
        a = rng.uniform(0, 2 * np.pi)
        rr = rng.uniform(0.0, 0.28)
        hy = Hc - 0.04 + 0.2 * np.sqrt(max(0.0, 1 - (rr / 0.39) ** 2))
        m.add(heap_uv(ball((rr * np.cos(a), hy + 0.02, rr * np.sin(a)), 0.05), R("tomato")))
    # raffia tray of peppers perched on the heap
    tray = lathe([(0.0, 0.0), (0.13, 0.0), (0.17, 0.06), (0.18, 0.065), (0.16, 0.06), (0.12, 0.012), (0.0, 0.012)], 14, closed_axis=False)
    tray = cyl_uv(tray, (0, 0, 0), R("raffia"), axis="y", v_range=(0, 0.065), u_repeat=2, mirror=True)
    m.add(place(tray, (0.12, Hc + 0.14, 0.1), (6, 0, -8)))
    m.add(heap_uv(heap(0.12, Hc + 0.18, 0.1, 0.15, 0.06, 0.15, seed + 3), R("pepper")))
    return m.export({"main": atlas.mat(normal_strength=0.5, jpeg_q=82)})


def mkt_soft_buckets() -> dict:
    """Nested stack of bright plastic basins topped with peppers, and two nested buckets behind."""
    seed = 821
    atlas = Atlas(512, 256, 0x808080)
    cols = [MKT["red"], MKT["blue"], MKT["green"], MKT["yellow"], MKT["pink"], 0x14a3a0]
    for i, c in enumerate(cols):
        atlas.add(f"p{i}", (i % 6) * 70, 0, plastic_sheet(64, 64, seed + i, c, rough=0.32, grime=0.25))
    atlas.add("pepper", 0, 70, produce_sheet(176, 176, seed + 10, "pepper"))
    atlas.add("orange", 180, 70, produce_sheet(176, 176, seed + 11, "orange"))
    atlas.add("handle", 360, 70, steel_sheet(48, 48, seed + 12, tone=0x9a9ea2, rust=0.2))
    m = EnvModel("mkt_soft_buckets")
    R = atlas.rect
    # main basin stack (front-left)
    cx, cz = -0.06, 0.06
    order = [0, 1, 3, 2, 4]
    hb = 0.2
    y = 0.0
    for k, ci in enumerate(order):
        sc = 1.0 - 0.0 * k
        b = basin(0.335 * sc, 0.24 * sc, hb)
        b = basin_uv(b, R(f"p{ci}"), hb)
        m.add(vc_ground(place(b, (cx, y, cz), (0, k * 23, 0)), 0.12, 0.35, seed))
        y += 0.065
    ytop = y - 0.065 + hb
    m.add(heap_uv(heap(cx, ytop - 0.03, cz, 0.33, 0.13, 0.33, seed, 0.016), R("pepper")))
    # two nested buckets at the back-right with wire handles
    bx, bz = 0.25, -0.24
    for k, ci in enumerate((5, 0)):
        bu = basin(0.16, 0.12, 0.30, lip=0.015, sides=14)
        bu = basin_uv(bu, R(f"p{ci}"), 0.30)
        m.add(vc_ground(place(bu, (bx, k * 0.07, bz)), 0.12, 0.35, seed))
    yb = 0.07 + 0.30
    m.add(heap_uv(heap(bx, yb - 0.02, bz, 0.15, 0.08, 0.15, seed + 2), R("orange")))
    ang = np.linspace(0, np.pi, 9)
    pts = [(bx + 0.17 * np.cos(a), yb + 0.02 + 0.14 * np.sin(a), bz) for a in ang]
    from env_lib import polytube

    m.add(U(polytube(np.array(pts), 0.006, 4, caps=False), R("handle")))
    return m.export({"main": atlas.mat(normal_strength=0.35, jpeg_q=82)})


def mkt_soft_baskets() -> dict:
    """Yam tubers heaped on a pallet beside two lidded woven baskets."""
    seed = 831
    atlas = Atlas(512, 512, 0x808080)
    atlas.add("yam", 0, 0, yam_sheet(256, 128, seed))
    atlas.add("rafA", 0, 132, raffia_sheet(256, 128, seed + 1, 0xd8ae62, band=[(0.25, 0.35, MKT["purple"]), (0.62, 0.7, MKT["red"])]))
    atlas.add("rafB", 260, 0, raffia_sheet(240, 128, seed + 2, 0xc89850, band=[(0.45, 0.58, MKT["green"])]))
    atlas.add("lid", 260, 132, raffia_sheet(160, 160, seed + 3, 0xd2a458, band=[(0.0, 0.12, MKT["yellow"])]))
    atlas.add("wood", 0, 300, wood_sheet(256, 48, seed + 4, 0x9a6a3e, "x", wear=0.6, knots=1, gap=2))
    atlas.add("cut", 260, 300, Sheet(64, 64, 0xf0e2c0, rough=0.8))
    m = EnvModel("mkt_soft_baskets")
    R = atlas.rect
    m.add(_pallet(atlas, seed, w=0.84, d=0.84))
    rng = np.random.default_rng(seed)
    # yam pile on the left half: elongated lumpy tubers in two layers
    yams = [(-0.22, 0.13, 0.18, 10), (-0.22, 0.13, -0.02, -14), (-0.24, 0.13, -0.22, 6), (-0.04, 0.13, 0.2, -80), (-0.22, 0.24, 0.08, 20), (-0.2, 0.24, -0.13, -8), (-0.1, 0.33, -0.02, 30)]
    for k, (x, y, z, rot) in enumerate(yams):
        t = sphere((0, 0, 0), (0.07, 0.065, 0.2), 5, 9)
        t = noisy(t, 0.012, 10.0, seed + k)
        t.v[:, 0] *= 1 + 0.25 * np.sin(t.v[:, 2] * 9 + k)
        t = cyl_uv(t, (0, 0, 0), R("yam"), axis="z", v_range=(-0.2, 0.2), u_repeat=1, mirror=True)
        m.add(vc_ground(place(t, (x, y, z), (rng.uniform(-8, 8), rot, rng.uniform(-6, 6))), 0.14, 0.3, seed))
    # baskets on the right: tall flared one with a conical lid, a squat one heaped with onions-coloured yams
    prof = [(0.0, 0.0), (0.13, 0.0), (0.17, 0.08), (0.19, 0.30), (0.2, 0.40), (0.21, 0.42), (0.19, 0.42), (0.17, 0.05), (0.0, 0.05)]
    tall = lathe(prof, 14, closed_axis=False)
    tall = cyl_uv(tall, (0, 0, 0), R("rafA"), axis="y", v_range=(0, 0.42), u_repeat=2, mirror=True)
    m.add(vc_ground(place(tall, (0.2, 0.08, -0.16)), 0.18, 0.3, seed))
    lid = lathe([(0.0, 0.0), (0.22, 0.0), (0.2, 0.02), (0.05, 0.13), (0.02, 0.17), (0.0, 0.18)], 14, closed_axis=True)
    lid = cyl_uv(lid, (0, 0, 0), R("lid"), axis="y", v_range=(0, 0.18), u_repeat=2, mirror=True)
    m.add(place(lid, (0.2, 0.5, -0.16), (4, 0, -5)))
    squat = lathe([(0.0, 0.0), (0.14, 0.0), (0.18, 0.05), (0.19, 0.17), (0.2, 0.18), (0.18, 0.18), (0.16, 0.04), (0.0, 0.04)], 14, closed_axis=False)
    squat = cyl_uv(squat, (0, 0, 0), R("rafB"), axis="y", v_range=(0, 0.18), u_repeat=2, mirror=True)
    m.add(vc_ground(place(squat, (0.22, 0.08, 0.22)), 0.12, 0.3, seed))
    for k in range(4):
        a = k * 1.6
        sm = sphere((0, 0, 0), (0.05, 0.045, 0.1), 4, 7)
        sm = cyl_uv(sm, (0, 0, 0), R("yam"), axis="z", v_range=(-0.1, 0.1), u_repeat=1, mirror=True)
        m.add(place(sm, (0.22 + 0.07 * np.cos(a), 0.27 + 0.02 * (k % 2), 0.22 + 0.07 * np.sin(a)), (10, k * 50, 0)))
    return m.export({"main": atlas.mat(normal_strength=0.5, jpeg_q=82)})


# ============================================================================ perimeter: stall wall + corner


WL, WT = 1.0, 0.30
WHB = 0.66  # masonry height


def _mkt_wall(name: str, seed: int, paint_tone, band, goods: int) -> dict:
    atlas = Atlas(512, 512, 0x808080)
    atlas.add("front", 0, 0, _counter_side(seed, 256, 144, WHB, paint_tone, band))
    atlas.add("back", 256, 0, _counter_side(seed + 7, 256, 144, WHB, paint_tone, band))
    plank = wood_sheet(256, 48, seed + 2, 0x7e5230, "x", wear=0.7, knots=1, gap=2)
    tile_x(plank)
    atlas.add("plank", 0, 148, plank)
    atlas.add("end", 260, 148, painted_plaster(96, 96, seed + 3, paint_tone))
    atlas.add("cloth0", 360, 148, ankara_sheet(144, 128, seed + 4, ANKARA_SETS[(goods * 2) % 8], cell=24, kind=goods % 4))
    atlas.add("cloth1", 0, 248, ankara_sheet(144, 128, seed + 5, ANKARA_SETS[(goods * 2 + 3) % 8], cell=24, kind=(goods + 1) % 4))
    atlas.add("tomato", 148, 248, produce_sheet(112, 112, seed + 6, "tomato" if goods == 0 else "orange"))
    atlas.add("basin", 264, 280, plastic_sheet(64, 64, seed + 8, MKT["blue"] if goods == 0 else MKT["red"], rough=0.35, grime=0.2))
    atlas.add("bolt", 332, 280, fold_shade(ankara_sheet(112, 80, seed + 9, ANKARA_SETS[(goods + 5) % 8], cell=16, kind=2), 10, axis=0, k=0.25))
    atlas.add("aso", 0, 380, asooke_sheet(256, 64, seed + 10))
    m = EnvModel(name)
    R = atlas.rect

    def per(nm):  # x-periodic tile: u spans the whole tile, v padded
        x0, y0, x1, y1 = atlas.tiles[nm]
        return (x0 / atlas.w, 1 - (y1 - 3) / atlas.h, x1 / atlas.w, 1 - (y0 + 3) / atlas.h)

    face = {"+z": per("front"), "-z": per("back"), "+x": R("end"), "-x": R("end"), "+y": R("end"), "-y": R("end")}
    body = flat_box((WL, WHB, WT), (0, WHB / 2, 0))
    m.add(vc_ground(box_uv(body, (-WL / 2, 0, -WT / 2), (WL / 2, WHB, WT / 2), face), 0.12, 0.4, seed))
    pl = per("plank")
    top = flat_box((WL, 0.045, WT + 0.12), (0, WHB + 0.0225, 0.04))
    m.add(box_uv(top, (-WL / 2, WHB, -WT / 2), (WL / 2, WHB + 0.045, WT / 2 + 0.1), {"+y": pl, "-y": pl, "+z": pl, "-z": pl, "+x": R("end"), "-x": R("end")}))
    y = WHB + 0.045
    rng = np.random.default_rng(seed)
    if goods == 0:
        # draped ankara over the front edge, a blue basin of tomatoes, a stack of bolts
        c = cloth_uv(cloth_panel(0.34, 0.30, 2.0, 0.015, 6, 3), R("cloth0"), 0.34, 0.30)
        m.add(place(c, (-0.24, y - 0.005, WT / 2 + 0.115)))
        b = basin(0.15, 0.10, 0.10)
        m.add(place(basin_uv(b, R("basin"), 0.1), (-0.22, y, 0.0)))
        m.add(heap_uv(heap(-0.22, y + 0.09, 0.0, 0.14, 0.08, 0.14, seed), R("tomato")))
        for k in range(3):
            bolt = bevel_box((0, 0, 0), (0.30 - 0.02 * k, 0.075, 0.22), bevel=0.02, seg=1)
            bolt = box_uv(bolt, bolt.v.min(axis=0), bolt.v.max(axis=0), R("bolt"))
            m.add(place(bolt, (0.2, y + 0.0375 + 0.075 * k, 0.0), (0, (-6, 5, -2)[k], 0)))
        roll = rod((0.04, y + 0.05, 0.13), (0.4, y + 0.05, 0.13), 0.045, 10)
        m.add(cyl_uv(roll, (0, y + 0.05, 0.13), R("aso"), axis="x", v_range=(0.04, 0.4), mirror=True))
    else:
        # hanging cloths on a rail, onions/oranges heap, rolled fabric
        for k, x in enumerate((-0.28, 0.06)):
            c = cloth_uv(cloth_panel(0.30, 0.34, 2.5, 0.016, 6, 3), R(f"cloth{k}"), 0.30, 0.34)
            m.add(place(c, (x, y - 0.005, WT / 2 + 0.115)))
        m.add(heap_uv(heap(0.26, y, 0.0, 0.18, 0.11, 0.13, seed), R("tomato")))
        for k in range(2):
            roll = rod((-0.4, y + 0.045 + 0.08 * k, -0.04 + 0.02 * k), (0.02, y + 0.045 + 0.08 * k, -0.02 * k), 0.042, 10)
            m.add(cyl_uv(roll, (0, y, 0), R("aso" if k == 0 else "bolt"), axis="x", v_range=(-0.4, 0.02), mirror=True))
    return m.export({"main": atlas.mat(normal_strength=0.4, jpeg_q=78)})


def mkt_wall() -> dict:
    return _mkt_wall("mkt_wall", 841, 0x2e9a5a, (MKT["yellow"], MKT["white"]), 0)


def mkt_wall_b() -> dict:
    return _mkt_wall("mkt_wall_b", 861, 0x2b7fc4, (MKT["yellow"], MKT["red"]), 1)


def mkt_wall_corner() -> dict:
    seed = 881
    PW, PH = 0.42, 1.24
    atlas = Atlas(512, 512, 0x808080)
    atlas.add("side", 0, 0, _post_side(seed, 128, 360, PH - 0.06, (MKT["yellow"], MKT["red"]), None, 0xa8553a, 0xe8458b))
    atlas.add("front", 132, 0, _post_side(seed + 3, 128, 360, PH - 0.06, (MKT["yellow"], MKT["red"]), "B", 0xa8553a, 0xe8458b))
    atlas.add("top", 264, 0, painted_plaster(96, 96, seed + 5, 0xd8d0c0))
    atlas.add("roof", 264, 100, corrugated_panel(160, 96, seed + 6, 0xb7bcc0, ribs=10, rust=0.6, wear=0.6))
    m = EnvModel("mkt_wall_corner")
    R = atlas.rect
    Hs = PH - 0.06
    side = {"+z": R("front"), "-z": R("side"), "+x": R("side"), "-x": R("front"), "+y": R("top"), "-y": R("top")}
    shaft = chamfer_prism(rect_poly(PW - 0.04, PW - 0.04), 0.0, Hs, ct=0.01)
    m.add(vc_ground(box_uv(shaft, (-PW / 2, 0, -PW / 2), (PW / 2, Hs, PW / 2), side), 0.16, 0.4, seed))
    foot = chamfer_prism(rect_poly(PW, PW), 0.0, 0.08, ct=0.01)
    m.add(vc_ground(box_uv(foot, (-PW / 2, 0, -PW / 2), (PW / 2, Hs, PW / 2), side), 0.08, 0.45, seed))
    cap = tin_cap(PW + 0.08, Hs, 0.06)
    m.add(U(cap, R("roof")))
    return m.export({"main": atlas.mat(normal_strength=0.4, jpeg_q=80)})


# ============================================================================ surroundings


def mkt_stall() -> dict:
    """Wooden market stall (2.4 x 1.4, 2.2 high): posts, plank back wall, corrugated lean-to roof, striped awning to the
    front, shelves of goods, trading table and a rail of hanging fabrics. Front = +Z."""
    seed = 901
    atlas = Atlas(1024, 512, 0x808080)
    atlas.add("planks", 0, 0, wood_sheet(256, 256, seed, 0x8a6038, "y", wear=0.7, knots=2, gap=3))
    atlas.add("post", 260, 0, wood_sheet(256, 40, seed + 1, 0x6b4a2c, "x", wear=0.6, knots=1, gap=2))
    atlas.add("roof", 260, 44, corrugated_panel(256, 160, seed + 2, 0x9aa2a8, ribs=16, rust=0.75, wear=0.7))
    atlas.add("awning", 520, 0, awning_tile(256, 96, seed + 3, MKT["orange"], MKT["white"], 8))
    for i in range(4):
        sh = ankara_sheet(112, 200, seed + 10 + i, ANKARA_SETS[(i * 2 + 1) % 8], cell=22, kind=i % 4)
        atlas.add(f"c{i}", 520 + i * 116, 100, fold_shade(sh, 30, axis=1, k=0.18))
    atlas.add("table", 0, 260, wood_sheet(256, 64, seed + 4, 0x9a6a3e, "x", wear=0.6, knots=1, gap=2))
    atlas.add("tomato", 260, 210, produce_sheet(128, 128, seed + 5, "tomato"))
    atlas.add("pepper", 392, 210, produce_sheet(128, 128, seed + 6, "pepper"))
    for i, c in enumerate((MKT["red"], MKT["blue"], MKT["green"], MKT["yellow"])):
        atlas.add(f"p{i}", 0 + i * 68, 330, plastic_sheet(64, 64, seed + 20 + i, c, rough=0.35, grime=0.25))
    for i in range(3):
        atlas.add(f"b{i}", 280 + i * 116, 345, fold_shade(ankara_sheet(112, 80, seed + 30 + i, ANKARA_SETS[(i * 3 + 2) % 8], cell=16, kind=(i + 1) % 4), 10, axis=0, k=0.25))
    sign = Sheet(320, 64, MKT["yellow"], rough=0.6)
    with sign.paint(height=0.1) as d:
        px = fit_px("MAMA BISI FOODSTUFF", 300, 34, "black", 0.86)
        d.text((160, 26), "MAMA BISI FOODSTUFF", px, MKT["red"], "black", "cm", squeeze=0.86)
        d.text((160, 52), "PEPPER - TOMATO - YAM - GARRI", fit_px("PEPPER - TOMATO - YAM - GARRI", 260, 13, "bold"), MKT["black"], "bold", "cm")
    weather(sign, seed + 7, ground=0.15, streaks=0.3, top_soot=0.25)
    atlas.add("sign", 640, 310, sign)
    atlas.add("dark", 980, 310, Sheet(40, 40, 0x1e150e))
    m = EnvModel("mkt_stall")
    R = atlas.rect
    W, D, H = 2.4, 1.4, 2.2
    rng = np.random.default_rng(seed)
    # posts
    for sx in (-1, 1):
        for sz, hh in ((-1, H), (1, H - 0.25)):
            p = obox((sx * (W / 2 - 0.05), hh / 2, sz * (D / 2 - 0.05)), (0.08, hh, 0.08), bevel=0.008, seg=1)
            m.add(vc_ground(U(p, R("post")), 0.2, 0.4, seed))
    # back wall and side half-walls of planks
    bw = flat_box((W - 0.1, H - 0.1, 0.03), (0, (H - 0.1) / 2, -D / 2 + 0.05))
    m.add(vc_ground(box_uv(bw, bw.v.min(axis=0), bw.v.max(axis=0), R("planks")), 0.25, 0.35, seed))
    for sx in (-1, 1):
        sw = flat_box((0.03, 1.1, D - 0.1), (sx * (W / 2 - 0.05), 0.55, 0))
        m.add(vc_ground(box_uv(sw, sw.v.min(axis=0), sw.v.max(axis=0), R("planks")), 0.25, 0.35, seed))
    # lean-to corrugated roof (higher at the back) + rafters
    from env_buildings import corrugated_roof

    pitch = np.degrees(np.arctan2(0.25, D))
    a, b = corrugated_roof((0, H - 0.1 + 0.02 - 0.125, 0.0), (W + 0.3, D + 0.3), pitch, 0, 10)
    m.add(U(a, R("roof")))
    m.add(U(b, R("dark")))
    # striped awning sloping down to the front, valance
    aw = flat_box((W + 0.1, 0.02, 0.7))
    aw = box_uv(aw, aw.v.min(axis=0), aw.v.max(axis=0), R("awning"))
    m.add(place(aw, (0, H - 0.5, D / 2 + 0.3), (18, 0, 0)))
    val = flat_box((W + 0.1, 0.12, 0.012))
    m.add(place(box_uv(val, val.v.min(axis=0), val.v.max(axis=0), R("awning")), (0, H - 0.68, D / 2 + 0.63)))
    for sx in (-1, 1):
        m.add(U(rod((sx * (W / 2 + 0.02), 0.0, D / 2 + 0.6), (sx * (W / 2 + 0.02), H - 0.6, D / 2 + 0.6), 0.02, 6), R("post")))
    # sign board on the roof front
    sb = flat_box((1.7, 0.34, 0.03))
    m.add(place(box_uv(sb, sb.v.min(axis=0), sb.v.max(axis=0), {"+z": R("sign"), "any": R("post")}), (0, H + 0.05, D / 2 - 0.02), (-8, 0, 0)))
    # shelves on the back wall with basins and bolts
    for k, yy in enumerate((0.9, 1.4)):
        sh = flat_box((W - 0.2, 0.03, 0.3), (0, yy, -D / 2 + 0.22))
        m.add(U(sh, R("table")))
        for j in range(4):
            x = -0.85 + j * 0.56
            if (j + k) % 2 == 0:
                bb = basin(0.12, 0.09, 0.09, sides=10)
                m.add(place(basin_uv(bb, R(f"p{(j + k) % 4}"), 0.09), (x, yy + 0.015, -D / 2 + 0.22)))
                m.add(heap_uv(heap(x, yy + 0.095, -D / 2 + 0.22, 0.11, 0.06, 0.11, seed + j + k * 4, res=(4, 8)), R("tomato" if j % 2 else "pepper")))
            else:
                for q in range(3):
                    bo = bevel_box((0, 0, 0), (0.32, 0.07, 0.22), bevel=0.02, seg=1)
                    bo = box_uv(bo, bo.v.min(axis=0), bo.v.max(axis=0), R(f"b{(q + j) % 3}"))
                    m.add(place(bo, (x, yy + 0.05 + q * 0.07, -D / 2 + 0.22), (0, rng.uniform(-6, 6), 0)))
    # trading table at the front with basins of produce
    tt = flat_box((W - 0.3, 0.05, 0.55), (0, 0.78, D / 2 - 0.3))
    m.add(U(tt, R("table")))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(vc_ground(U(obox((sx * (W / 2 - 0.25), 0.39, D / 2 - 0.3 + sz * 0.22), (0.05, 0.78, 0.05)), R("post")), 0.15, 0.4, seed))
    for j, x in enumerate((-0.75, -0.25, 0.25, 0.75)):
        bb = basin(0.17, 0.12, 0.1, sides=12)
        m.add(place(basin_uv(bb, R(f"p{j % 4}"), 0.1), (x, 0.805, D / 2 - 0.3)))
        m.add(heap_uv(heap(x, 0.895, D / 2 - 0.3, 0.16, 0.09, 0.16, seed + 40 + j, res=(4, 10)), R("tomato" if j % 2 == 0 else "pepper")))
    # rail of hanging fabrics across the front opening under the awning
    m.add(U(rod((-W / 2 + 0.05, H - 0.62, D / 2 - 0.04), (W / 2 - 0.05, H - 0.62, D / 2 - 0.04), 0.012, 6), R("post")))
    for k, x in enumerate((-0.95, -0.62, 0.62, 0.95)):
        c = cloth_uv(cloth_panel(0.3, 0.62, 2.5, 0.02, 4, 3), R(f"c{k}"), 0.3, 0.62)
        m.add(place(c, (x, H - 0.62, D / 2 - 0.02), (0, rng.uniform(-8, 8), 0)))
    return m.export({"main": atlas.mat(normal_strength=0.5, jpeg_q=70, nblur=0.3)})


def mkt_umbrella() -> dict:
    """Big multi-colour market parasol (1.8 m) on a pole in a weighted tyre, small table of basins and a stool."""
    seed = 921
    atlas = Atlas(512, 512, 0x808080)
    can = Sheet(256, 128, MKT["red"], rough=0.85)
    bands = [MKT["red"], MKT["yellow"], MKT["blue"], MKT["green"]]
    for i, c in enumerate(bands):
        can.rgb[:, i * 64 : (i + 1) * 64] = srgb(c)
    n = noise2(256, 128, seed, fx=6, fy=3, octaves=5, beta=1.8)
    can.rgb = can.rgb * (0.85 + 0.22 * n[..., None])
    ys = (np.arange(128)[:, None] + 0.5) / 128
    can.comp(0xffffff, np.clip(1 - np.abs(ys - 0.08) / 0.03, 0, 1) * np.ones((1, 256)) * 0.7)
    can.comp(0x3a3128, np.clip(noise2(256, 128, seed + 1, fx=5, fy=3) * 1.6 - 0.85, 0, 1) * 0.35)
    atlas.add("canopy", 0, 0, can)
    atlas.add("under", 260, 0, Sheet(128, 64, 0x6a4a3a, rough=0.9))
    atlas.add("steel", 392, 0, steel_sheet(64, 64, seed + 2, tone=0xa0a4a8, rust=0.4))
    atlas.add("tyre", 260, 70, Sheet(96, 48, 0x222224, rough=0.9))
    atlas.add("table", 0, 132, wood_sheet(256, 64, seed + 3, 0x9a6a3e, "x", wear=0.6, knots=1, gap=2))
    atlas.add("tomato", 260, 132, produce_sheet(128, 128, seed + 4, "tomato"))
    atlas.add("orange", 0, 200, produce_sheet(128, 128, seed + 5, "orange"))
    for i, c in enumerate((MKT["blue"], MKT["pink"], MKT["green"])):
        atlas.add(f"p{i}", 132 + i * 68, 264, plastic_sheet(64, 64, seed + 6 + i, c, rough=0.35, grime=0.2))
    m = EnvModel("mkt_umbrella")
    R = atlas.rect
    from env_lib import torus as _t

    tyre = _t((0, 0.06, 0), 0.2, 0.07, 14, 6)
    m.add(vc_ground(U(tyre, R("tyre")), 0.1, 0.4, seed))
    m.add(U(rod((0, 0.0, 0), (0, 2.12, 0), 0.022, 6), R("steel")))
    cr = 0.92
    prof = [(0.0, 2.2), (0.05, 2.19), (0.35, 2.09), (0.68, 1.95), (cr, 1.83), (cr + 0.02, 1.79), (cr - 0.02, 1.77), (0.6, 1.88), (0.25, 2.0), (0.0, 2.04)]
    c = outward(lathe(prof, 16, closed_axis=True))
    c = cyl_uv(c, (0, 0, 0), R("canopy"), axis="y", v_range=(1.77, 2.2), u_repeat=2, mirror=False)
    m.add(place(c, (0, 0, 0), (4, 15, -3)))
    for k in range(8):
        a = 2 * np.pi * k / 8
        m.add(U(rod((0, 1.98, 0), (0.78 * np.cos(a), 1.86, 0.78 * np.sin(a)), 0.006, 4), R("steel")))
    m.add(U(rod((0.06, 2.21, 0), (-0.06, 2.21, 0), 0.03, 6), R("steel")))  # finial
    # little table with basins
    tx, tz = 0.35, 0.35
    m.add(U(flat_box((0.7, 0.04, 0.5), (tx, 0.62, tz)), R("table")))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.add(vc_ground(U(obox((tx + sx * 0.3, 0.31, tz + sz * 0.2), (0.04, 0.62, 0.04)), R("table")), 0.15, 0.4, seed))
    for j, (x, z, tile) in enumerate(((tx - 0.17, tz, "tomato"), (tx + 0.17, tz + 0.02, "orange"))):
        bb = basin(0.14, 0.1, 0.08, sides=12)
        m.add(place(basin_uv(bb, R(f"p{j}"), 0.08), (x, 0.64, z)))
        m.add(heap_uv(heap(x, 0.71, z, 0.13, 0.08, 0.13, seed + j), R(tile)))
    # plastic stool behind
    sx_, sz_ = -0.35, -0.2
    m.add(U(obox((sx_, 0.36, sz_), (0.3, 0.03, 0.3), bevel=0.01, seg=1), R("p2")))
    for dx in (-0.12, 0.12):
        for dz in (-0.12, 0.12):
            m.add(U(rod((sx_ + dx, 0.0, sz_ + dz), (sx_ + dx * 0.8, 0.35, sz_ + dz * 0.8), 0.015, 5), R("p2")))
    return m.export({"main": atlas.mat(normal_strength=0.4, jpeg_q=82)})


def mkt_fabric_rack() -> dict:
    """Timber display frame (1.6 x 2.0) hung with five lengths of wax print / lace, folded bolts on a bench below."""
    seed = 941
    atlas = Atlas(1024, 512, 0x808080)
    for i in range(5):
        if i == 2:
            sh = asooke_sheet(176, 400, seed + i, [MKT["navy"], MKT["yellow"], MKT["white"], MKT["red"]])
        else:
            sh = ankara_sheet(176, 400, seed + i, ANKARA_SETS[(i * 3) % 8], cell=30, kind=i % 4)
        atlas.add(f"c{i}", i * 180, 0, fold_shade(sh, 44, axis=1, k=0.22))
    atlas.add("wood", 0, 404, wood_sheet(256, 40, seed + 9, 0x6b4a2c, "x", wear=0.6, knots=1, gap=2))
    for i in range(3):
        atlas.add(f"b{i}", 260 + i * 116, 404, fold_shade(ankara_sheet(112, 80, seed + 20 + i, ANKARA_SETS[(i * 3 + 1) % 8], cell=16, kind=(i + 2) % 4), 10, axis=0, k=0.25))
    m = EnvModel("mkt_fabric_rack")
    R = atlas.rect
    W, H = 1.6, 2.0
    for sx in (-1, 1):
        m.add(vc_ground(U(obox((sx * W / 2, H / 2, 0), (0.07, H, 0.07)), R("wood")), 0.2, 0.4, seed))
        m.add(U(obox((sx * W / 2, 0.03, 0), (0.1, 0.06, 0.5)), R("wood")))
    m.add(U(obox((0, H - 0.03, 0), (W + 0.12, 0.06, 0.07)), R("wood")))
    m.add(U(obox((0, H - 0.6, -0.05), (W, 0.04, 0.04)), R("wood")))
    rng = np.random.default_rng(seed)
    for k in range(5):
        x = -W / 2 + 0.2 + k * (W - 0.4) / 4
        hh = 1.3 + rng.uniform(-0.15, 0.1)
        c = cloth_uv(cloth_panel(0.28, hh, 3.0, 0.025, 6, 6), R(f"c{k}"), 0.28, hh)
        m.add(place(c, (x, H - 0.06, 0.02 * (k % 2)), (0, rng.uniform(-10, 10), 0)))
    # bench with folded bolts
    m.add(U(flat_box((W - 0.2, 0.04, 0.32), (0, 0.4, 0.38)), R("wood")))
    for sx in (-1, 1):
        m.add(vc_ground(U(obox((sx * (W / 2 - 0.2), 0.2, 0.38), (0.05, 0.4, 0.28)), R("wood")), 0.12, 0.4, seed))
    for j in range(3):
        for q in range(2 + j % 2):
            bo = bevel_box((0, 0, 0), (0.36, 0.07, 0.24), bevel=0.02, seg=1)
            bo = box_uv(bo, bo.v.min(axis=0), bo.v.max(axis=0), R(f"b{(q + j) % 3}"))
            m.add(place(bo, (-0.45 + j * 0.45, 0.455 + q * 0.07, 0.38), (0, rng.uniform(-6, 6), 0)))
    return m.export({"main": atlas.mat(normal_strength=0.4, jpeg_q=70)})


# ============================================================================ market shop buildings


def _market_building(name: str, seed: int, H: float, wall, paint, awning, extra_parts):
    fh = int(round(H * min(200.0, 900.0 / H)))  # same layout maths as build_building: share its pack regions
    regions = [(0, fh + 4, 640, 1024), (660, int(H * 100) + 260, 1024, 1024)]

    def parts(atlas: Atlas, rng):
        out = []
        for i in range(3):
            sh = fold_shade(ankara_sheet(64, 160, seed + i, ANKARA_SETS[(i * 3 + seed) % 8], cell=14, kind=(i + seed) % 4), 20, axis=1, k=0.2)
            atlas.pack(f"hf{i}", sh, regions=regions)
        out += extra_parts(atlas, rng)
        return out

    return build_building(name, seed, H, wall, 0xb8b0a2, paint, parts, awning=awning, roof_metal=0x9aa2a8, patchy=0.2, jpeg_q=62)


def _cloth_parts(xs, y_top, seed, h=0.95):
    """(tile, mesh) cloth panels hung on the shop front; UVs are fixed later by build_building's box_uv (planar)."""
    rng = np.random.default_rng(seed)
    out = []
    for k, x in enumerate(xs):
        hh = h * rng.uniform(0.8, 1.05)
        c = cloth_panel(0.24, hh, 2.5, 0.02, 4, 4, thick=0.01)
        out.append((f"hf{k % 3}", place(c, (x - BW / 2, y_top, BD / 2 + 0.06), (0, rng.uniform(-8, 8), 0))))
    return out


def mkt_building_a() -> dict:
    """Magenta two-storey textile shops: MAMA T FABRICS + LACE PALACE, cloth hung on the front, balcony, tanks."""
    H = 3.5
    F1 = 1.45

    def paint(f: Facade):
        f.band(F1 - 0.06, F1 + 0.1, 0xf8f0dc, a=0.95)
        f.band(H - 0.34, H - 0.26, MKT["yellow"], a=0.95)
        f.shutter(0.15, 1.45, 0.04, 1.05, tone=0x7d8a90, seed=3, rust=0.4, open_frac=0.75)
        f.shutter(1.7, 3.05, 0.04, 1.05, tone=0x7d8a90, seed=4, rust=0.5, open_frac=0.7, graffiti="SHOP 21")
        f.sign(0.8, 1.25, 1.45, 0.3, "MAMA T FABRICS", MKT["yellow"], MKT["red"], border=MKT["red"], seed=5, sub="ANKARA - LACE - ASO-OKE")
        f.sign(2.38, 1.23, 1.3, 0.3, "LACE PALACE", MKT["navy"], MKT["white"], border=MKT["yellow"], seed=6, sub="WHOLESALE & RETAIL")
        for k, x in enumerate((0.55, 1.6, 2.65)):
            f.window(x, F1 + 0.32, 0.55, 0.7, "louver" if k != 1 else "dark", seed=10 + k, frame=0xf8f0dc, bars=(k == 2), curtain=MKT["yellow"] if k == 1 else None)
        f.stain_streaks(0.2, 3.0, H - 0.3, 0.6, 6)
        f.cable([(0.0, H - 0.45), (1.6, H - 0.6), (3.2, H - 0.42)])

    def extra(atlas, rng):
        out = []
        out += _cloth_parts((0.25, 0.55, 0.85, 1.95, 2.25, 2.55), 0.98, 3, h=0.85)
        out += balcony_parts(1.6, F1 + 0.12, 1.3, atlas, True, seed=7)
        aw = awning_part(1.6, 1.07, 3.1, 0.5, 0.12)
        out += [("awning", aw[0]), ("awning", aw[1])]
        y0 = H - PARAPET
        out += tank((-1.0, y0, -0.3), 0.32, 0.66, "tankb", "tankb")
        out += tank((-0.3, y0, -0.3), 0.3, 0.62, "tank", "tank")
        out.append(("conc", obox((1.0, y0 + 0.2, -0.5), (0.6, 0.4, 0.6))))
        return out

    return _market_building("mkt_building_a", 1101, H, 0xd8578f, paint, (MKT["yellow"], MKT["red"]), extra)


def mkt_building_b() -> dict:
    """Lime / sky-blue provisions block: ALHAJA PROVISIONS + BALOGUN TEXTILE PLAZA, arcade of stacked goods."""
    H = 3.8
    F1 = 1.5

    def paint(f: Facade):
        f.band(F1 - 0.06, F1 + 0.1, 0xf8f0dc, a=0.95)
        f.band(H - 0.36, H - 0.27, MKT["green"], a=0.95)
        f.shutter(0.15, 1.5, 0.04, 1.1, tone=0x6e7c86, seed=4, rust=0.45, open_frac=0.8)
        f.shutter(1.75, 3.05, 0.04, 1.1, tone=0x6e7c86, seed=5, rust=0.5, open_frac=0.65)
        f.sign(1.6, F1 + 1.75, 2.6, 0.36, "BALOGUN TEXTILE PLAZA", MKT["green"], MKT["white"], border=MKT["yellow"], seed=6, sub="SHOPS 1 - 40  UPSTAIRS", squeeze=0.85)
        f.sign(0.82, 1.28, 1.4, 0.3, "ALHAJA PROVISIONS", MKT["red"], MKT["yellow"], border=MKT["yellow"], seed=7, sub="RICE - BEANS - OIL")
        f.sign(2.4, 1.28, 1.25, 0.3, "GOD'S GRACE", MKT["white"], MKT["blue"], border=MKT["blue"], seed=8, sub="TOMATO & PEPPER")
        for k, x in enumerate((0.55, 1.6, 2.65)):
            f.window(x, F1 + 0.28, 0.55, 0.68, "louver" if k % 2 == 0 else "dark", seed=20 + k, frame=0xf8f0dc, bars=(k == 0), curtain=MKT["pink"] if k == 1 else None)
        f.stain_streaks(0.2, 3.0, H - 0.3, 0.7, 7)
        f.cable([(0.0, H - 0.5), (1.4, H - 0.66), (3.2, H - 0.5)])

    def extra(atlas, rng):
        out = []
        out += _cloth_parts((0.3, 0.6, 2.05, 2.35, 2.65), 1.0, 9, h=0.85)
        aw1 = awning_part(0.8, 1.1, 1.5, 0.5, 0.12)
        aw2 = awning_part(2.4, 1.1, 1.4, 0.5, 0.12)
        out += [("awning", aw1[0]), ("awning", aw1[1]), ("awning", aw2[0]), ("awning", aw2[1])]
        out += balcony_parts(0.55, F1 + 0.12, 0.9, atlas, True, seed=3)
        out += balcony_parts(2.65, F1 + 0.12, 0.9, atlas, False, seed=4)
        y0 = H - PARAPET
        out += tank((1.1, y0, -0.2), 0.32, 0.66, "tankw", "tankw")
        out += tank((0.4, y0, -0.2), 0.3, 0.62, "tankb", "tankb")
        from env_buildings import corrugated_roof

        a, b = corrugated_roof((-0.8, y0 + 0.3, -0.4), (1.4, 1.2), 10, 0, 8)
        out += [("corr", a), ("corr", b)]
        for x in (-1.4, -0.2):
            out.append(("wood", obox((x, y0 + 0.14, -0.9), (0.07, 0.28, 0.07))))
        return out

    return _market_building("mkt_building_b", 1131, H, 0x7cc4e0, paint, (MKT["green"], MKT["white"]), extra)


MARKET = {
    "mkt_hard_post": mkt_hard_post,
    "mkt_hard_counter": mkt_hard_counter,
    "mkt_soft_fabric": mkt_soft_fabric,
    "mkt_soft_produce": mkt_soft_produce,
    "mkt_soft_buckets": mkt_soft_buckets,
    "mkt_soft_baskets": mkt_soft_baskets,
    "mkt_wall": mkt_wall,
    "mkt_wall_b": mkt_wall_b,
    "mkt_wall_corner": mkt_wall_corner,
    "mkt_stall": mkt_stall,
    "mkt_umbrella": mkt_umbrella,
    "mkt_fabric_rack": mkt_fabric_rack,
    "mkt_building_a": mkt_building_a,
    "mkt_building_b": mkt_building_b,
}
