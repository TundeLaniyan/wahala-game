"""Lagos tenement / shopfront blocks (env_building_a..d). Each: one 1024 atlas, one material, <= 4k tris.

Block: 3.2 wide (x) x 2.4 deep (z), facade on +z. The facade is painted on one tile (plaster, windows, shutters,
sign boards ...); balconies, awnings, AC units, tanks, dishes, parapet, corrugated roofs and cables are geometry."""
from __future__ import annotations

import numpy as np

import tex as texlib
from env_facade import Facade, bevel_light, plaster_sheet
from env_lib import EnvModel, beam, box_uv, cyl_uv, flat_box, flat_uv, lathe, obox, orient_from, outward, place, polytube, rod, sag_path, vc_ground, vc_mul, Mesh, merge
from tex_env import Atlas, Sheet, concrete_sheet, fit_px, gblur, noise2, plastic_sheet, scuffs, speckle, srgb, steel_sheet

BW, BD = 3.2, 2.4
PARAPET = 0.26


# ----------------------------------------------------------------------------- misc tiles


def corrugated_tile(w, h, seed, tone=0x8c9196, rust=0.6) -> Sheet:
    t = texlib.corrugated(256, seed, tone, 16, rust)
    s = Sheet.from_tex(t, w, h, 0, 0)
    return s


def tank_tile(w, h, seed, tone) -> Sheet:
    s = plastic_sheet(w, h, seed, tone, rough=0.55, grime=0.45)
    ys = np.arange(h)[:, None]
    ribs = np.clip(1 - np.abs(((ys % 22) - 11) / 4.0), 0, 1) * np.ones((1, w))
    s.hgt += 0.25 * ribs
    s.rgb *= (1 - 0.12 * ribs)[..., None]
    return s


def ac_tile(w, h, seed) -> Sheet:
    s = plastic_sheet(w, h, seed, 0xe8e6df, rough=0.5, grime=0.6)
    with s.paint(height=-0.3) as d:
        for k in range(7):  # louvre slats of the front panel
            y = h * (0.52 + k * 0.058)
            d.rect((w * 0.1, y, w * 0.9, y + 3), 0x55524c, a=0.8)
        d.ellipse((w * 0.5 - 14, h * 0.18 - 6, w * 0.5 + 14, h * 0.18 + 6), 0x2a2a2c, a=0.0)
    with s.paint(height=0.1) as d:
        d.rect((w * 0.08, h * 0.08, w * 0.35, h * 0.14), 0x8a8780, a=0.7)
    return s


def awning_tile(w, h, seed, c1, c2, stripes=8) -> Sheet:
    s = Sheet(w, h, c1, rough=0.9)
    xs = np.arange(w)[None, :]
    pitch = w / stripes
    k = (np.floor(xs / pitch) % 2).astype(float) * np.ones((h, 1))
    s.rgb = srgb(c1)[None, None, :] * (1 - k[..., None]) + srgb(c2)[None, None, :] * k[..., None]
    n = noise2(w, h, seed, fx=8, fy=3, octaves=5, beta=1.8)
    s.rgb = s.rgb * (0.82 + 0.28 * n[..., None])
    s.comp(0x3a3128, np.clip(noise2(w, h, seed + 1, fx=5, fy=3) * 1.6 - 0.8, 0, 1) * 0.5)
    s.hgt = 0.5 + 0.05 * n
    return s


def laundry_tile(w, h, seed) -> Sheet:
    rng = np.random.default_rng(seed)
    cols = [0xd62839, 0xf6f1e0, 0x1f6fe0, 0xffc300, 0x0b8f5c, 0xff4f9a, 0xf4f1de, 0x7c3aed]
    s = Sheet(w, h, 0xf6f1e0, rough=0.95)
    bw = w // 8
    for i in range(8):
        s.rgb[:, i * bw : (i + 1) * bw] = srgb(cols[i])
    n = noise2(w, h, seed, fx=10, fy=4, octaves=5, beta=1.4)
    s.rgb = s.rgb * (0.78 + 0.4 * n[..., None])
    s.hgt = 0.5 + 0.2 * n
    return s


def roof_tile(w, h, seed) -> Sheet:
    s = concrete_sheet(w, h, seed, 0x74706a, stains=0.9, grit=0.8)
    n = noise2(w, h, seed + 1, fx=4, fy=3, octaves=5, beta=1.8)
    s.comp(0x24241f, np.clip(n * 1.5 - 0.65, 0, 1) * 0.6)
    s.comp(0x4a5a30, np.clip(noise2(w, h, seed + 2, fx=5, fy=4, octaves=5) * 1.6 - 1.0, 0, 1) * 0.35)  # moss
    speckle(s, seed + 3, amount=0.4, density=0.005)
    return s


def side_tile(w, h, seed, tone, peel, windows=((0.55, 1.7), (1.85, 1.7)), floors=(1.5,)) -> Sheet:
    f = Facade(w / 100.0, h / 100.0, 100.0, seed, tone, peel_tone=peel, patchy=0.6)
    for k, (x, y) in enumerate(windows):
        f.window(x, y, 0.4, 0.55, "louver", seed=k)
    for yy in floors:
        f.band(yy - 0.04, yy + 0.05, 0xf0e8d4, a=0.5)
    f.pipe(w / 100.0 - 0.18, 0.05, h / 100.0 - 0.3)
    f.finish()
    return f.s


# ----------------------------------------------------------------------------- geometry helpers


def balcony_parts(x, yfloor, width, atlas: Atlas, laundry: bool = True, rail_tile="rail", depth=0.34, seed=0):
    """Slab + railing (+ laundry) projecting from the facade (+z), centred at x."""
    rng = np.random.default_rng(seed)
    parts = []
    x = x - BW / 2  # facade coordinate (0 = left edge) -> world
    z0 = BD / 2
    slab = obox((x, yfloor - 0.05, z0 + depth / 2 - 0.02), (width, 0.1, depth), bevel=0.01, seg=1)
    parts.append(("conc", slab))
    rz = z0 + depth - 0.03
    top = obox((x, yfloor + 0.34, rz), (width, 0.03, 0.03))
    parts.append((rail_tile, top))
    for dx in (-1, 1):
        parts.append((rail_tile, obox((x + dx * (width / 2 - 0.02), yfloor + 0.17, z0 + depth / 2 - 0.03), (0.025, 0.34, depth - 0.04))))
        parts.append((rail_tile, obox((x + dx * (width / 2 - 0.02), yfloor + 0.34, z0 + depth / 2 - 0.03), (0.03, 0.03, depth - 0.04))))
    nb = int(width / 0.09)
    for k in range(nb + 1):
        xx = x - width / 2 + 0.02 + (width - 0.04) * k / nb
        parts.append((rail_tile, obox((xx, yfloor + 0.17, rz), (0.012, 0.34, 0.012))))
    if laundry:
        for k in range(rng.integers(2, 4)):
            lx = x - width / 2 + 0.2 + rng.uniform(0, width - 0.4)
            q = flat_box((0.17 + rng.uniform(0, 0.08), 0.28 + rng.uniform(0, 0.1), 0.012), (0, 0, 0))
            q.v[:, 1] += 0.0
            parts.append(("laundry", place(q, (lx, yfloor + 0.34 - 0.16, rz + 0.04), (0, rng.uniform(-8, 8), rng.uniform(-3, 3)))))
        line = polytube(sag_path((x - width / 2 + 0.03, yfloor + 0.5, rz + 0.04), (x + width / 2 - 0.03, yfloor + 0.5, rz + 0.04), 0.03, 6), 0.004, 4, caps=False)
        parts.append((rail_tile, line))
    return parts


def awning_part(x, y, w, depth=0.42, drop=0.16, thick=0.03):
    """Tilted shop awning attached to the facade at height y, sloping down towards +z."""
    z0 = BD / 2
    x = x - BW / 2
    b = flat_box((w, thick, depth))
    ang = np.degrees(np.arctan2(drop, depth))
    b = place(b, (x, y - drop / 2, z0 + depth / 2 - 0.02), (ang, 0, 0))
    valance = flat_box((w, 0.07, 0.015))
    valance = place(valance, (x, y - drop - 0.03, z0 + depth - 0.01))
    return b, valance


def tank(pos, r=0.34, h=0.62, tile="tank", lid_tile="tank", stand=True, seed=0):
    prof = [(0.0, 0.0), (r * 0.92, 0.0), (r, 0.03), (r, h * 0.2), (r * 1.03, h * 0.24), (r, h * 0.28), (r, h * 0.55), (r * 1.03, h * 0.59), (r, h * 0.63), (r, h * 0.92), (r * 0.78, h * 0.98), (r * 0.45, h), (0.0, h)]
    m = lathe(prof, 14, closed_axis=True)
    m = outward(m)
    out = [(tile, place(m, pos))]
    lid = rod((pos[0], pos[1] + h, pos[2]), (pos[0], pos[1] + h + 0.05, pos[2]), r * 0.22, 8, r2=r * 0.18)
    out.append((tile, lid))
    return out


def dish(pos, yaw=0.0, size=0.2, tilt=38):
    prof = [(0.0, 0.0), (0.05, 0.008), (0.1, 0.03), (0.15, 0.068), (0.2, 0.12), (0.2, 0.126), (0.15, 0.074), (0.1, 0.037), (0.05, 0.014), (0.0, 0.006)]
    m = lathe([(r * size / 0.2, y * size / 0.2) for r, y in prof], 12, closed_axis=True)
    m = outward(m)
    m = place(m, (0, 0, 0), (-90 + (90 - tilt), 0, 0))  # concave side faces +z, tilted up
    m = place(m, pos, (0, yaw, 0))
    arm = rod((pos[0], pos[1] - 0.2, pos[2] - 0.02), (pos[0], pos[1] + 0.02, pos[2] - 0.02), 0.012, 5)
    lnb = rod((pos[0], pos[1] + 0.02, pos[2]), (pos[0], pos[1] + size * 1.05, pos[2] + size * 0.9), 0.008, 4)
    return m, arm, lnb


def corrugated_roof(center, size=(1.5, 1.0), pitch_deg=10, yaw=0.0, ridges=8):
    """Corrugated sheet (single-sided sine profile along z) tilted about x; returns top sheet + flat underside."""
    w, d = size
    n = ridges * 4
    zs = np.linspace(-d / 2, d / 2, n + 1)
    amp = 0.022
    ys = amp * np.sin(zs / d * ridges * 2 * np.pi)
    verts = []
    for x in (-w / 2, w / 2):
        for z, y in zip(zs, ys):
            verts.append((x, y, z))
    faces = []
    for i in range(n):
        a, b, c, e = i, i + 1, n + 1 + i + 1, n + 1 + i
        faces += [(a, e, c), (a, c, b)]
    top = Mesh(np.array(verts), np.array(faces))
    # ensure up-facing
    t = top.v[top.f]
    if (np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])[:, 1]).sum() < 0:
        top.f = top.f[:, ::-1]
    under = flat_box((w, 0.012, d), (0, -amp - 0.01, 0))
    return place(top, center, (pitch_deg, yaw, 0)), place(under, center, (pitch_deg, yaw, 0))


def antenna(pos, h=0.8, rng=None):
    out = [rod(pos, (pos[0], pos[1] + h, pos[2]), 0.008, 5)]
    for k, f in enumerate((0.45, 0.65, 0.85)):
        w = 0.28 - k * 0.06
        out.append(rod((pos[0] - w / 2, pos[1] + h * f, pos[2]), (pos[0] + w / 2, pos[1] + h * f, pos[2]), 0.005, 4))
    return out


# ----------------------------------------------------------------------------- the generic builder


def build_building(name: str, seed: int, H: float, wall, peel, painter, parts_fn, side_windows=None, awning=(0xd62839, 0xf6f1e0), roof_metal=0x8c9196, patchy=0.55, jpeg_q=84) -> dict:
    """painter(f: Facade) draws the facade; parts_fn(atlas, rng) -> list of (tile, mesh) extra geometry."""
    atlas = Atlas(1024, 1024, 0x808080)
    D = min(200.0, 900.0 / H)
    f = Facade(BW, H, D, seed, wall, peel_tone=peel, patchy=patchy)
    painter(f)
    f.finish()
    atlas.add("facade", 0, 0, f.s)
    atlas.tiles["facade"] = (0, 0, f.w, f.h)
    side_h = int(H * 100)
    atlas.add("side", 660, 0, side_tile(240, side_h, seed + 5, wall, peel, **(side_windows or {})))
    atlas.add("roof", 660, side_h + 10, roof_tile(320, 240, seed + 6))
    regions = [(0, f.h + 4, 640, 1024), (660, side_h + 260, 1024, 1024)]
    P = lambda nm, tile: atlas.pack(nm, tile, regions=regions)  # noqa: E731
    P("corr", corrugated_tile(192, 96, seed + 14, roof_metal, 0.7))
    P("awning", awning_tile(144, 80, seed + 17, awning[0], awning[1], 8))
    P("tank", tank_tile(96, 96, seed + 9, 0x23272b))
    P("tankw", tank_tile(96, 96, seed + 10, 0xdfe5e8))
    P("tankb", tank_tile(96, 96, seed + 11, 0x2a64b0))
    P("conc", concrete_sheet(96, 96, seed + 7, 0xa59f94, stains=0.6))
    P("rail", steel_sheet(48, 48, seed + 8, tone=0x6a7a6e, rust=0.6, paint=0x3c5a4a))
    P("ac", ac_tile(96, 80, seed + 12))
    P("laundry", laundry_tile(96, 24, seed + 13))
    P("steel", steel_sheet(80, 80, seed + 15, tone=0x9a9ea2, rust=0.5))
    P("wood", __import__("tex_env").wood_sheet(96, 40, seed + 16, 0x6b4a2c, "x", wear=0.7, knots=1, gap=2))

    rng = np.random.default_rng(seed)
    m = EnvModel(name)
    lo, hi = (-BW / 2, 0.0, -BD / 2), (BW / 2, H, BD / 2)
    side = atlas.rect("side")
    rects = {"+z": atlas.rect("facade"), "-z": side, "+x": side, "-x": side, "+y": atlas.rect("roof"), "-y": atlas.rect("roof")}
    body = box_uv(flat_box((BW, H - PARAPET, BD), (0, (H - PARAPET) / 2, 0)), lo, hi, rects)
    vc_ground(body, 0.35, 0.35, seed)
    m.add(body)
    # parapet ring (carries the top of the facade/side tiles)
    pt = 0.14
    for (c, s_) in [((0, H - PARAPET / 2, BD / 2 - pt / 2), (BW, PARAPET, pt)), ((0, H - PARAPET / 2, -BD / 2 + pt / 2), (BW, PARAPET, pt)), ((BW / 2 - pt / 2, H - PARAPET / 2, 0), (pt, PARAPET, BD - 2 * pt)), ((-BW / 2 + pt / 2, H - PARAPET / 2, 0), (pt, PARAPET, BD - 2 * pt))]:
        p = box_uv(flat_box(s_, c), lo, hi, rects)
        m.add(p)
    # coping: slightly wider cap strips (concrete)
    conc = atlas.rect("conc")
    for (c, s_) in [((0, H + 0.015, BD / 2 - pt / 2), (BW + 0.06, 0.03, pt + 0.06)), ((0, H + 0.015, -BD / 2 + pt / 2), (BW + 0.06, 0.03, pt + 0.06)), ((BW / 2 - pt / 2, H + 0.015, 0), (pt + 0.06, 0.03, BD - 2 * pt)), ((-BW / 2 + pt / 2, H + 0.015, 0), (pt + 0.06, 0.03, BD - 2 * pt))]:
        mm = flat_box(s_, c)
        m.add(box_uv(mm, mm.v.min(axis=0), mm.v.max(axis=0), conc))
    # corner quoins: slim concrete strips up each front corner (give the box edge relief)
    for sx in (-1, 1):
        q = flat_box((0.07, H - PARAPET, 0.07), (sx * (BW / 2 + 0.005), (H - PARAPET) / 2, BD / 2 + 0.005))
        m.add(vc_ground(box_uv(q, q.v.min(axis=0), q.v.max(axis=0), conc), 0.35, 0.3, seed))
    for tile, mesh in parts_fn(atlas, rng):
        r = atlas.rect(tile)
        if tile in ("tank", "tankw", "tankb"):
            mm = cyl_uv(mesh, mesh.v.mean(axis=0) * np.array([1, 0, 1]), r, axis="y", v_range=(mesh.v[:, 1].min(), mesh.v[:, 1].max()), mirror=True)
        else:
            mm = box_uv(mesh, mesh.v.min(axis=0), mesh.v.max(axis=0), r)
        m.add(mm)
    return m.export({"main": atlas.mat(normal_strength=0.6, jpeg_q=jpeg_q, nblur=0.5)})


# ----------------------------------------------------------------------------- A: teal block with a buka + phones


def building_a() -> dict:
    H = 4.1
    F1, F2, F3 = 1.40, 2.65, 3.82  # floor levels (top of ground floor / floor 2 / floor 3)

    def paint(f: Facade):
        f.band(F1 - 0.06, F1 + 0.09, 0xf0e4c8, a=0.95)
        f.band(F2 - 0.06, F2 + 0.07, 0xf0e4c8, a=0.9)
        f.band(H - 0.34, H - 0.26, 0xd9a441, a=0.9)
        f.pipe(0.12, 0.05, H - 0.3)
        f.pipe(3.08, 0.05, H - 0.3, 0.03, 0x4a4a4c)
        # ground floor: two shop bays
        f.shutter(0.22, 1.62, 0.04, 0.98, tone=0x6f8a7e, seed=3, rust=0.55, graffiti="14")
        f.sign(0.92, 1.15, 1.45, 0.34, "MAMA PUT", 0x0b6b3c, 0xffd23c, border=0xffd23c, seed=4, sub="HOT FOOD ALL DAY")
        f.door(1.78, 2.05, 0.96, seed=5)
        f.window(2.55, 0.34, 0.62, 0.55, "dark", seed=6, bars=True, curtain=0xd62839)
        f.sign(2.4, 1.15, 1.3, 0.3, "GLORY BE PHONES", 0xd62839, 0xf6f1e0, border=0xf6f1e0, seed=7, sub="SALES - REPAIR - RECHARGE")
        # floor 2 and 3
        for k, x in enumerate((0.55, 1.6, 2.65)):
            f.window(x, F1 + 0.24, 0.5, 0.66, "louver" if k != 1 else "dark", seed=10 + k, bars=(k == 0), curtain=0x3b82f6 if k == 1 else None)
            f.window(x, F2 + 0.18, 0.5, 0.62, "dark" if k != 1 else "louver", seed=20 + k, bars=(k != 1), curtain=0xffc300 if k == 0 else (0xf4f1de if k == 2 else None))
        f.stain_streaks(0.2, 3.0, F3, 0.6, 7)
        f.cable([(0.0, H - 0.5), (1.6, H - 0.62), (3.2, H - 0.45)], sag=0.05)

    def parts(atlas, rng):
        out = []
        out += balcony_parts(1.6, F2, 1.15, atlas, True, seed=3)
        # AC unit under the right window of floor 3, shade hood over left window
        ac = obox((2.65 - BW / 2, F2 + 0.12, BD / 2 + 0.12), (0.44, 0.3, 0.24), bevel=0.02, seg=1)
        out.append(("ac", ac))
        out.append(("conc", obox((0.55 - BW / 2, F2 + 0.88, BD / 2 + 0.08), (0.64, 0.05, 0.16))))
        aw = awning_part(2.4, 1.0, 1.3, 0.34, 0.12)
        out.append(("awning", aw[0]))
        out.append(("awning", aw[1]))
        # roof: two tanks on a plinth, dish, aerial
        y0 = H - PARAPET
        out.append(("conc", obox((-0.9, y0 + 0.07, -0.2), (1.2, 0.14, 0.8))))
        out += tank((-1.15, y0 + 0.14, -0.2), 0.3, 0.62, "tank", "tank")
        out += tank((-0.62, y0 + 0.14, -0.2), 0.3, 0.62, "tank", "tank")
        d = dish((1.0, y0 + 0.4, 0.2), 25, 0.2)
        out += [("steel", d[0]), ("steel", d[1]), ("steel", d[2])]
        out += [("steel", a) for a in antenna((1.3, y0, -0.4), 0.85)]
        out.append(("conc", obox((0.6, y0 + 0.2, -0.55), (0.5, 0.4, 0.5))))  # stair head
        # drooping cables off the roof corner
        c = polytube(sag_path((-1.55, H - 0.2, BD / 2 + 0.02), (-0.2, H - 0.12, BD / 2 + 0.45), 0.08, 8), 0.007, 4, caps=False)
        out.append(("rail", c))
        return out

    return build_building("env_building_a", 301, H, 0x4fa89a, 0x9d978c, paint, parts, awning=(0x0b6b3c, 0xffd23c))


# ----------------------------------------------------------------------------- B: ochre bakery block


def building_b() -> dict:
    H = 4.5
    F1, F2, F3, F4 = 1.42, 2.52, 3.58, 4.22

    def paint(f: Facade):
        for y in (F1, F2, F3):
            f.band(y - 0.06, y + 0.09, 0xf6f1e0, a=0.95)
        f.band(H - 0.36, H - 0.27, 0xc0392b, a=0.9)
        f.pipe(3.1, 0.05, H - 0.3, 0.03)
        f.shutter(0.2, 1.1, 0.04, 0.98, tone=0x808a72, seed=4, rust=0.4, graffiti="OPEN")
        f.sign(1.65, 1.2, 2.5, 0.44, "Lagos Fresh Bread", 0xf6f1e0, 0xb3172b, border=0xb3172b, style="serif", seed=5, sub="BAKED HOT EVERY MORNING", squeeze=0.95, wobble=0.006)
        f.door(1.25, 1.6, 0.96, color=0x7a4a2a, seed=6)
        f.window(2.25, 0.36, 0.8, 0.55, "glass", seed=7, frame=0xf6f1e0)
        f.window(2.88, 0.38, 0.36, 0.5, "dark", seed=8, bars=True)
        for fl, (y0, wins) in enumerate(((F1, (0.55, 1.45, 2.45)), (F2, (0.55, 1.45, 2.45)), (F3, (0.55, 1.45, 2.45)))):
            for k, x in enumerate(wins):
                f.window(x, y0 + 0.2, 0.42, 0.58, "louver" if (k + fl) % 2 == 0 else "dark", seed=30 + fl * 3 + k, frame=0xf6f1e0, bars=((k + fl) % 3 == 0), curtain=[0xd62839, 0x3b82f6, 0xffc300][(k + fl) % 3] if (k + fl) % 2 else None)
        f.window(2.88, F2 + 0.2, 0.36, 0.5, "dark", seed=50, frame=0xf6f1e0, bars=True)
        f.stain_streaks(0.2, 3.0, F4, 0.7, 8)
        f.cable([(0.0, H - 0.56), (1.3, H - 0.7), (3.2, H - 0.52)])
        f.cable([(0.0, H - 0.66), (1.8, H - 0.82), (3.2, H - 0.7)], width=1.2)

    def parts(atlas, rng):
        out = []
        out += balcony_parts(0.62, F2, 0.95, atlas, True, seed=5)
        out += balcony_parts(0.62, F3, 0.95, atlas, True, seed=4)
        out += balcony_parts(2.45, F3, 0.95, atlas, True, seed=6)
        aw = awning_part(1.65, 1.0, 2.2, 0.46, 0.15)
        out.append(("awning", aw[0]))
        out.append(("awning", aw[1]))
        out.append(("ac", obox((1.45 - BW / 2, F3 + 0.75, BD / 2 + 0.12), (0.44, 0.3, 0.24), bevel=0.02, seg=1)))
        y0 = H - PARAPET
        # sloping rusty corrugated roof over the back half
        a, b = corrugated_roof((0.2, y0 + 0.33, -0.5), (2.9, 1.2), 12, 0, 9)
        out.append(("corr", a))
        out.append(("corr", b))
        for x in (-1.3, 0.1, 1.5):
            out.append(("wood", obox((x, y0 + 0.14, -1.0), (0.07, 0.28, 0.07))))
        out += tank((1.2, y0, 0.55), 0.3, 0.65, "tankw", "tankw")
        d = dish((-1.2, y0 + 0.35, 0.5), -20, 0.2)
        out += [("steel", d[0]), ("steel", d[1]), ("steel", d[2])]
        c = polytube(sag_path((1.55, H - 0.25, BD / 2 + 0.02), (1.0, H - 0.5, BD / 2 + 0.5), 0.06, 8), 0.007, 4, caps=False)
        out.append(("rail", c))
        return out

    return build_building("env_building_b", 331, H, 0xdba94a, 0xa8a094, paint, parts, side_windows=dict(windows=((0.55, 1.7), (1.85, 1.7), (1.2, 3.0))), awning=(0x1f8a4c, 0xf6f1e0), roof_metal=0xa8553a)


# ----------------------------------------------------------------------------- C: peach spares shop + chemist


def building_c() -> dict:
    H = 3.65
    F1, F2 = 1.45, 2.62

    def paint(f: Facade):
        f.band(F1 - 0.06, F1 + 0.09, 0x6e3b2a, a=0.9)
        f.band(F2 - 0.06, F2 + 0.07, 0x6e3b2a, a=0.9)
        f.band(H - 0.36, H - 0.26, 0x6e3b2a, a=0.9)
        f.pipe(0.1, 0.05, H - 0.3)
        f.shutter(0.18, 1.7, 0.04, 1.0, tone=0x5f7a96, seed=3, rust=0.6, graffiti="NO 3")
        f.sign(0.94, 1.18, 1.6, 0.36, "ROYAL SPARES", 0x1d3a6b, 0xffd23c, border=0xffd23c, seed=4, sub="TYRES - BATTERIES - OIL")
        f.sign(2.45, 1.18, 1.25, 0.34, "NEW LIFE CHEMIST", 0xf6f1e0, 0x0b8f5c, border=0x0b8f5c, seed=5, sub="DRUGS & PROVISIONS")
        f.window(2.45, 0.32, 0.9, 0.6, "glass", seed=6, frame=0xf6f1e0)
        f.door(1.8, 2.0, 1.0, seed=7)
        for k, x in enumerate((0.55, 1.6, 2.65)):
            f.window(x, F1 + 0.2, 0.5, 0.66, "dark" if k != 1 else "louver", seed=10 + k, frame=0x6e3b2a, bars=True, curtain=0xf4f1de if k == 0 else None)
            f.window(x, F2 + 0.18, 0.5, 0.56, "louver" if k != 1 else "glass", seed=20 + k, frame=0x6e3b2a, bars=(k != 1))
        f.stain_streaks(0.2, 3.0, F2, 0.6, 7)
        f.cable([(0.0, H - 0.5), (1.6, H - 0.64), (3.2, H - 0.46)])

    def parts(atlas, rng):
        out = []
        out += balcony_parts(1.6, F2, 1.4, atlas, True, seed=7)
        out.append(("ac", obox((0.55 - BW / 2, F2 + 0.1, BD / 2 + 0.12), (0.44, 0.3, 0.24), bevel=0.02, seg=1)))
        out.append(("ac", obox((2.65 - BW / 2, F1 + 0.08, BD / 2 + 0.12), (0.44, 0.3, 0.24), bevel=0.02, seg=1)))
        y0 = H - PARAPET
        out.append(("conc", obox((0.0, y0 + 0.25, -0.35), (0.9, 0.5, 0.9))))  # stair head
        out += tank((-1.0, y0, 0.45), 0.3, 0.66, "tankb", "tankb")
        out += tank((-0.45, y0, 0.55), 0.28, 0.6, "tankb", "tankb")
        for (x, yaw) in ((1.1, 15), (1.4, -30)):
            d = dish((x, y0 + 0.36, 0.35), yaw, 0.18)
            out += [("steel", d[0]), ("steel", d[1]), ("steel", d[2])]
        out += [("steel", a) for a in antenna((0.9, y0, -0.7), 0.9)]
        return out

    return build_building("env_building_c", 361, H, 0xe3a283, 0x9a9488, paint, parts, side_windows=dict(windows=((0.55, 1.7), (1.85, 1.7)), floors=(1.5, 2.6)), awning=(0x1d3a6b, 0xffd23c))


# ----------------------------------------------------------------------------- D: faded-blue tailor/salon block


def building_d() -> dict:
    H = 4.25
    F1, F2, F3 = 1.42, 2.56, 3.62

    def paint(f: Facade):
        for y in (F1, F2):
            f.band(y - 0.06, y + 0.09, 0xf2efe6, a=0.95)
        f.band(H - 0.36, H - 0.27, 0x2f6f5a, a=0.9)
        f.pipe(0.1, 0.05, H - 0.3, 0.03, 0x4a4a4c)
        f.pipe(3.1, 0.05, H - 0.3)
        f.shutter(1.55, 3.0, 0.04, 0.98, tone=0x7a8a6a, seed=3, rust=0.5, graffiti="B2")
        f.sign(2.28, 1.16, 1.4, 0.34, "KOLADE TAILORING", 0xf6f1e0, 0x1d3a6b, border=0x1d3a6b, seed=4, sub="MEN & WOMEN - OWAMBE LACE")
        f.sign(0.8, 1.16, 1.3, 0.34, "TOLA'S SALON", 0xff4f9a, 0xfff6e0, border=0xfff6e0, seed=5, sub="BRAIDS - CUTS - NAILS")
        f.window(0.62, 0.3, 0.7, 0.6, "glass", seed=6, frame=0xfff6e0)
        f.door(1.12, 1.4, 0.96, color=0x2f6f5a, seed=7)
        for k, x in enumerate((0.55, 1.6, 2.65)):
            f.window(x, F1 + 0.22, 0.5, 0.68, "louver", seed=10 + k, frame=0x2f6f5a, bars=(k == 1))
            f.window(x, F2 + 0.2, 0.5, 0.7, "dark" if k != 1 else "louver", seed=20 + k, frame=0x2f6f5a, bars=(k != 1), curtain=[0xd62839, None, 0xffc300][k])
        # a hand-painted ad on the plaster
        f.sign(1.6, F3 - 0.02, 0.9, 0.24, "ROOM TO LET", 0xf1ead2, 0xb3172b, border=None, seed=8, squeeze=0.9)
        f.stain_streaks(0.2, 3.0, F3, 0.6, 7)
        f.cable([(0.0, H - 0.5), (1.2, H - 0.66), (3.2, H - 0.5)])
        f.cable([(0.0, H - 0.6), (2.0, H - 0.8), (3.2, H - 0.62)], width=1.2)

    def parts(atlas, rng):
        out = []
        out += balcony_parts(1.6, F2, 1.35, atlas, True, seed=8)
        # louvred wooden shutters beside the middle window (floor 3)
        for dx in (-0.36, 0.36):
            out.append(("wood", obox((1.6 + dx - BW / 2, F3 - 1.0 + 0.55, BD / 2 + 0.03), (0.22, 0.62, 0.025))))
        out.append(("ac", obox((2.65 - BW / 2, F2 + 0.1, BD / 2 + 0.12), (0.44, 0.3, 0.24), bevel=0.02, seg=1)))
        y0 = H - PARAPET
        a, b = corrugated_roof((-0.5, y0 + 0.3, 0.1), (1.8, 1.4), -9, 0, 10)
        out.append(("corr", a))
        out.append(("corr", b))
        for x in (-1.3, -0.1):
            out.append(("wood", obox((x, y0 + 0.14, 0.8), (0.07, 0.28, 0.07))))
            out.append(("wood", obox((x, y0 + 0.24, -0.6), (0.07, 0.48, 0.07))))
        out.append(("conc", obox((1.0, y0 + 0.07, -0.2), (0.9, 0.14, 0.9))))
        out += tank((1.0, y0 + 0.14, -0.2), 0.32, 0.7, "tank", "tank")
        d = dish((1.3, y0 + 0.4, 0.7), 10, 0.2)
        out += [("steel", d[0]), ("steel", d[1]), ("steel", d[2])]
        out += [("steel", a) for a in antenna((0.4, y0, -0.8), 0.75)]
        return out

    return build_building("env_building_d", 391, H, 0x7ea0c4, 0x9f998e, paint, parts, awning=(0xff4f9a, 0xf6f1e0), roof_metal=0x3c8a86)


BUILDINGS = {"env_building_a": building_a, "env_building_b": building_b, "env_building_c": building_c, "env_building_d": building_d}
