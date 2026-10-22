"""Destructible 'soft block' props: crates, tyres, sacks, barrier, water cartons, bottle crates.

Each model = one baked atlas + one material (so the game can instance it)."""
from __future__ import annotations

import numpy as np

from env_lib import (
    EnvModel,
    close_tube_ends,
    lathe_mesh,
    orient_from,
    planar_uv,
    beam,
    bevel_box,
    box_uv,
    cyl_uv,
    flat_box,
    flat_uv,
    lathe,
    merge,
    noisy,
    obox,
    outward,
    place,
    polytube,
    px_rect,
    rod,
    torus,
    vc_fn,
    vc_ground,
    vc_mul,
    value_noise,
)
from loft import tube
from tex_env import (
    PAL,
    hazard_board,
    film_sheet,
    plastic_sheet,
    rubber_base,
    steel_sheet,
    tyre_tread_tile,
    tyre_wall_tile,
    burlap_sheet,
    stitch_row,
    Atlas,
    Sheet,
    concrete_sheet,
    gblur,
    noise2,
    speckle,
    stencil,
    wood_sheet,
)

# ============================================================================ wooden crate


def _strip_rects(r):
    """uv rects for a board whose full strip tile is `r`: faces (+-z) get the whole strip, top/bottom faces a thin
    centre sample (so they do not show a squashed copy of the strip) and the end faces the end-grain band."""
    u0, v0, u1, v1 = r
    vm = (v0 + v1) / 2
    dv = (v1 - v0) * 0.12
    du = (u1 - u0) * 0.03
    return {"+z": r, "-z": r, "+y": (u0, vm - dv, u1, vm + dv), "-y": (u0, vm - dv, u1, vm + dv), "+x": (u1 - du * 2, v0, u1, v1), "-x": (u0, v0, u0 + du * 2, v1)}


def _crate_atlas(seed: int, stencilled: bool, slat_h: float = 0.135, post_nail_fracs=None):
    """512x512: six 512x80 wood strips + a dark interior tile."""
    atlas = Atlas(512, 512)
    tones = [0xd89b52, 0xcc8c44, 0xc0803a, 0xe0aa64, 0xd4954c, 0xc6863f]  # warm golden-brown timber matching reference crate
    rng = np.random.default_rng(seed)
    nail_slat = [(0.045, 0.5), (0.955, 0.5)]
    for i, tone in enumerate(tones):
        nails = nail_slat if i in (0, 1, 2, 3) else [(0.05, 0.5), (0.95, 0.5)]
        if i in (4, 5):
            nails = nail_slat
        sh = wood_sheet(512, 80, seed + i * 7, tone, "x", wear=0.32 + 0.12 * (i % 3), knots=1 if i % 2 == 0 else 2, gap=3, nails=nails)
        if stencilled and i == 4:
            stencil(sh, "FRAGILE", (256, 40), 44, 0xf8f4e8, "black", a=0.92, squeeze=0.95, wear=0.35, seed=3, spacing=0.12)
        if stencilled and i == 5:
            # White fragile wine-glass stencil & up arrows matching reference crate
            for k, x in enumerate((120, 256, 392)):
                with sh.paint(height=0.05) as d:
                    d.ellipse((x - 16, 12, x + 16, 44), 0xf8f4e8, a=0.92)
                    d.rect((x - 20, 8, x + 20, 22), tone, a=1.0)
                    d.rect((x - 3, 42, x + 3, 62), 0xf8f4e8, a=0.92)
                    d.rect((x - 12, 60, x + 12, 66), 0xf8f4e8, a=0.92)
        if stencilled and i == 3:
            with sh.paint(height=0.04) as d:
                d.rect((0, 34, 512, 46), 0xf4eee0, a=0.82)
        atlas.add(f"s{i}", 0, i * 80, sh)
    dark = Sheet(512, 32, 0x20150d)
    dark.hgt[:] = 0.3
    atlas.add("dark", 0, 480, dark)
    return atlas


def _post_atlas_fracs(slat_h, gap, y0, n):
    return [(y0 + slat_h / 2 + k * (slat_h + gap)) for k in range(n)]


def crate_parts(atlas: Atlas, seed: int, w: float = 0.82, d: float = 0.82, h: float = 0.74, tint=True, stencil_face: str | None = "+z", n_slats: int = 4, brace_faces=("+z", "-z", "+x", "-x"), broken: bool = False):
    """Return a list of UV-mapped meshes for one wooden crate centred at the origin (y from 0)."""
    rng = np.random.default_rng(seed)
    parts = []
    post = 0.075
    lid_t = 0.024
    y_lo = 0.035
    y_hi = h - lid_t - 0.004
    gap = 0.02
    slat_h = (y_hi - y_lo - gap * (n_slats - 1)) / n_slats

    def mk(mesh, strip_i, rects_fn=_strip_rects, swap=False, lo=None, hi=None, tintk=(0.86, 1.08), local=None):
        b0 = mesh.v.min(axis=0) if lo is None else lo
        b1 = mesh.v.max(axis=0) if hi is None else hi
        mm = box_uv(mesh, b0, b1, rects_fn(atlas.rect(f"s{strip_i}")), swap=swap)
        k = rng.uniform(*tintk)
        vc_mul(mm, (1, 1, 1), k)
        vc_ground(mm, 0.14, 0.45, seed + 1)
        return mm

    plain = [0, 1, 2, 3]
    # interior (seen through the gaps)
    inner = flat_box((w - 0.09, h - 0.07, d - 0.09), (0, h / 2, 0))
    parts.append(flat_uv(inner, atlas.rect("dark")))
    # corner posts (slightly proud of the slats)
    for sx in (-1, 1):
        for sz in (-1, 1):
            p = obox((sx * (w / 2 - post / 2), h / 2, sz * (d / 2 - post / 2)), (post, h, post), bevel=0.008, seg=1)
            strip = int(rng.choice([2, 3, 1]))
            parts.append(mk(p, strip, swap=True))
    # side slats (between posts)
    for side in ("+z", "-z", "+x", "-x"):
        along_x = side in ("+z", "-z")
        L = (w if along_x else d) - 2 * post + 0.006
        for k in range(n_slats):
            yc = y_lo + slat_h / 2 + k * (slat_h + gap) + rng.uniform(-0.003, 0.003)
            hh = slat_h + rng.uniform(-0.006, 0.004)
            tk = rng.uniform(0.012, 0.02)
            off = (d if along_x else w) / 2 - tk / 2 - 0.004 + rng.uniform(-0.003, 0.003)
            strip = int(rng.choice(plain))
            if stencil_face == side and k in (1, 2):
                strip = 4 if k == 1 else 5
            short = broken and side == "+x" and k == 2
            length = L * (0.58 if short else 1.0)
            shift = (L - length) / 2 * (1 if short else 0)
            size = (length, hh, tk) if along_x else (tk, hh, length)
            sgn = 1 if side[0] == "+" else -1
            center = (shift, yc, sgn * off) if along_x else (sgn * off, yc, shift)
            rot = (0, 0, rng.uniform(-0.8, 0.8))
            if not along_x:
                rot = (rng.uniform(-0.8, 0.8), 0, 0)
            sl = obox((0, 0, 0), size)
            mm = mk(sl, strip)
            parts.append(place(mm, center, rot))
            if short:  # splintered-off remainder hanging by one nail
                size2 = (tk, hh * 0.9, L * 0.34) if not along_x else (L * 0.34, hh * 0.9, tk)
                sl2 = obox((0, 0, 0), size2)
                mm2 = mk(sl2, strip)
                c2 = (sgn * (off + 0.01), yc - 0.03, -(L * 0.33)) if not along_x else (-(L * 0.33), yc - 0.03, sgn * (off + 0.01))
                parts.append(place(mm2, c2, (0, 0, 0) if along_x else (14, 0, 0) if True else (0, 0, 0)))
    # lid slats (run along x)
    n_lid = 5
    lid_w = (d - (n_lid - 1) * 0.016) / n_lid
    for k in range(n_lid):
        zc = -d / 2 + lid_w / 2 + k * (lid_w + 0.016)
        strip = int(rng.choice(plain))
        sl = obox((0, 0, 0), (w + rng.uniform(-0.004, 0.0), lid_t + rng.uniform(-0.003, 0.003), lid_w))
        mm = mk(sl, strip)
        parts.append(place(mm, (rng.uniform(-0.004, 0.004), h - lid_t / 2, zc), (0, rng.uniform(-0.6, 0.6), 0)))
    # diagonal braces on two faces
    for side in brace_faces:
        bt = 0.018
        a, b = (-(w / 2 - post - 0.01), y_lo + 0.02), ((w / 2 - post - 0.01), y_hi - 0.02)
        if side in ("+z", "-z"):
            sg = 1 if side == "+z" else -1
            p0 = (a[0], a[1], sg * (d / 2 + 0.002 + bt / 2 - 0.004))
            p1 = (b[0], b[1], sg * (d / 2 + 0.002 + bt / 2 - 0.004))
        else:
            sg = 1 if side == "+x" else -1
            p0 = (sg * (w / 2 + 0.002 + bt / 2 - 0.004), a[1], a[0])
            p1 = (sg * (w / 2 + 0.002 + bt / 2 - 0.004), b[1], b[0])
        br = beam(p0, p1, 0.066, bt, up=(0, 0, 1) if side in ("+z", "-z") else (1, 0, 0))
        strip = int(rng.choice([1, 2]))
        parts.append(mk(br, strip, swap=False, lo=br.v.min(axis=0), hi=br.v.max(axis=0)))
    return parts


def soft_crate(name="prop_soft_crate", stencilled=True, seed=5) -> dict:
    atlas = _crate_atlas(seed, stencilled)
    m = EnvModel(name)
    m.add(crate_parts(atlas, seed, stencil_face="+z" if stencilled else None))
    return m.export({"main": atlas.mat(normal_strength=0.45)})


def soft_crate_b() -> dict:
    return soft_crate("prop_soft_crate_b", True, 9)


def soft_crates() -> dict:
    seed = 21
    atlas = _crate_atlas(seed, True)
    m = EnvModel("prop_soft_crates")
    bottom = crate_parts(atlas, seed, w=0.84, d=0.84, h=0.48, n_slats=3, stencil_face="+z", brace_faces=("+x",), broken=False)
    top = crate_parts(atlas, seed + 3, w=0.64, d=0.64, h=0.44, n_slats=3, stencil_face=None, brace_faces=("+z",), broken=True)
    m.add(bottom)
    m.add([place(p, (0.02, 0.48, -0.01), (0, 27, 0)) for p in top])
    return m.export({"main": atlas.mat(normal_strength=0.45)})


# ============================================================================ tyres

TR, TRI, TW = 0.335, 0.19, 0.108  # outer radius, bead radius, half width


def _tyre_profiles(level: str = "full"):
    """(bottom wall, tread, top wall) profiles as (r, y) lists; each strip shares end points with its neighbour.
    level 'full' = the top tyre of the stack; 'low' = tyres whose walls are mostly hidden by their neighbours."""
    tread = [(TR - 0.006, -0.072), (TR, -0.050), (TR - 0.011, -0.030), (TR, -0.010), (TR, 0.010), (TR - 0.011, 0.030), (TR, 0.050), (TR - 0.006, 0.072)]
    if level == "full":
        bottom = [(TRI, -TW), (0.26, -TW - 0.004), (TR - 0.006, -0.072)]
        top = [(TR - 0.006, 0.072), (0.318, TW - 0.006), (0.265, TW + 0.006), (0.215, TW), (TRI, TW - 0.016), (TRI - 0.004, 0.0)]
    else:
        bottom = [(TRI + 0.02, -TW), (TR - 0.006, -0.072)]
        top = [(TR - 0.006, 0.072), (0.30, TW), (0.215, TW), (TRI, TW - 0.016), (TRI - 0.004, 0.0)]
    return bottom, tread, top


def _core_ref(c):
    r = np.linalg.norm(c[:, [0, 2]], axis=1, keepdims=True) + 1e-9
    core = np.c_[c[:, 0:1] / r * 0.265, np.zeros((len(c), 1)), c[:, 2:3] / r * 0.265]
    return core


def tyre_mesh(atlas: Atlas, sides: int, seed: int, level: str = "full", tilt=(0, 0, 0), pos=(0, 0, 0), yaw: float = 0.0):
    bottom, tread, top = _tyre_profiles(level)
    parts = []
    inner = [(TRI - 0.004, 0.0), (TRI, -TW + 0.016)]
    # strip UVs: walls sample the sidewall tile (v: bead->shoulder), tread its own tile, inner wall a plain tile
    rw = atlas.rect("wall")
    rt = atlas.rect("tread")
    ri = atlas.rect("bead")
    parts.append(lathe_mesh(bottom, sides, rw, ref_fn=_core_ref, v_span=(0.0, 1.0)))
    parts.append(lathe_mesh(tread, sides, rt, ref_fn=_core_ref))
    parts.append(lathe_mesh(top, sides, rw, ref_fn=_core_ref, v_span=(1.0, 0.0)))
    k = np.random.default_rng(seed).uniform(0.85, 1.1)
    out = []
    for m in parts:
        vc_mul(m, (1, 1, 1), k)
        out.append(place(m, pos, (tilt[0], yaw, tilt[2])))
    return out


def rim_mesh(atlas: Atlas, pos=(0, 0, 0), yaw=0.0):
    """Steel wheel seen inside the top tyre: dished disc, lip ring, hub cap and bolt heads."""
    rr = atlas.rect("rim")
    prof = [(0.0, 0.020), (0.052, 0.022), (0.060, 0.034), (0.098, 0.030), (0.150, 0.012), (0.176, 0.044), (0.188, 0.0)]
    disc = lathe(prof, 14, closed_axis=False)
    orient = _core_ref
    from env_lib import planar_uv, orient_from

    disc = orient_from(disc, lambda c: np.c_[c[:, 0] * 0, np.full(len(c), -0.2), c[:, 2] * 0])
    disc = planar_uv(disc, rr, (-0.19, 0, -0.19), (1, 0, 0), (0, 0, 1), 0.38, 0.38)
    parts = [disc]
    for k in range(5):
        a = 2 * np.pi * (k + 0.5) / 5
        b = rod((0.066 * np.cos(a), 0.034, 0.066 * np.sin(a)), (0.066 * np.cos(a), 0.047, 0.066 * np.sin(a)), 0.011, 5)
        parts.append(planar_uv(b, rr, (-0.19, 0, -0.19), (1, 0, 0), (0, 0, 1), 0.38, 0.38))
    hub = rod((0, 0.030, 0), (0, 0.054, 0), 0.034, 10, r2=0.026)
    parts.append(planar_uv(hub, rr, (-0.19, 0, -0.19), (1, 0, 0), (0, 0, 1), 0.38, 0.38))
    for p in parts:
        vc_mul(p, (1, 1, 1), 0.9)
    return [place(p, pos, (0, yaw, 0)) for p in parts]


def _tyre_atlas(seed: int) -> Atlas:
    a = Atlas(512, 512, 0x202022)
    a.add("tread", 0, 0, tyre_tread_tile(512, 128, seed))
    a.add("wall", 0, 128, tyre_wall_tile(512, 96, seed + 1))
    a.add("bead", 0, 224, rubber_base(512, 32, seed + 2, dust=0.2))
    # steel wheel (top-down): dark silver with bolt pattern, rust, mud
    r = steel_sheet(256, 256, seed + 4, tone=0x9a9ea3, rust=0.7, paint=0x6d7278)
    yy, xx = np.mgrid[0:256, 0:256]
    rad = np.hypot(xx - 127.5, yy - 127.5) / 128.0
    with r.paint(height=-0.3, rough=0.7) as d:
        for k in range(5):
            ang = 2 * np.pi * (k + 0.5) / 5
            cx, cy = 127.5 + 100 * np.cos(ang) * 0.36 * 2.0 / 2.0 * 1.0, 127.5 + 100 * np.sin(ang) * 0.36 * 2.0 / 2.0
            d.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), 0x0e0e10)
    for k in range(5):  # cut-outs between the bolts
        ang = 2 * np.pi * k / 5
        cx, cy = 127.5 + np.cos(ang) * 78, 127.5 + np.sin(ang) * 78
        with r.paint(height=-0.35, rough=0.8) as d:
            d.ellipse((cx - 17, cy - 24, cx + 17, cy + 24), 0x0c0c0e)
    r.comp(0x3a2a1c, np.clip(rad - 0.7, 0, 1) * 0.5)
    a.add("rim", 0, 256, r)
    return a


def soft_tyres() -> dict:
    seed = 31
    atlas = _tyre_atlas(seed)
    m = EnvModel("prop_soft_tyres")
    sides = 14
    y = TW + 0.002
    specs = [
        ((0.0, 0.0), (0.8, -0.4), 10.0, True),
        ((0.018, -0.015), (-1.2, 1.0), 62.0, True),
        ((-0.012, 0.016), (1.1, -1.2), 140.0, True),
        ((0.042, -0.028), (6.5, -4.5), 215.0, False),
    ]
    for i, ((x, z), (tx, tz), yaw, simple) in enumerate(specs):
        parts = tyre_mesh(atlas, sides, seed + i, level="full" if i == 3 else "low", tilt=(tx, 0, tz), pos=(x, y + i * (2 * TW - 0.018), z), yaw=yaw)
        for p in parts:
            vc_ground(p, 0.1, 0.45, seed + i)
        m.add(parts)
        if i == 3:
            for p in rim_mesh(atlas, pos=(x, y + i * (2 * TW - 0.018) + 0.045, z), yaw=yaw):
                m.add(p)
    return m.export({"main": atlas.mat(normal_strength=0.9)})


# ============================================================================ sacks

SACK_TILE = (512, 256)


def _sack_tile(kind: str, seed: int) -> Sheet:
    """512 (around the sack) x 256 (along it). Along-sack text is drawn rotated: mouth at the top rows, label on the
    front half (u ~ 0.75) reading bottom->top and on the back half (u ~ 0.25) reading top->bottom."""
    w, h = SACK_TILE
    if kind == "rice":
        s = burlap_sheet(w, h, seed, 0xd4b075, 3.8, dirt=0.25)
        ink, ink2, text, sub = 0xc4162a, 0x0b7a3e, "OFADA RICE", "50 KG NET"
    elif kind == "pp":
        s = burlap_sheet(w, h, seed, 0xede9dc, 3.0, dirt=0.22)
        ink, ink2, text, sub = 0x1648b8, 0xd82232, "IJEBU GARRI", "PREMIUM GRADE 50KG"
    else:
        s = burlap_sheet(w, h, seed, 0xc49e60, 4.0, dirt=0.35)
        ink, ink2, text, sub = 0x0e7c46, 0x1e1e22, "BROWN BEANS", "PRODUCE OF NIGERIA"
    for cx, rot in ((0.75, 90), (0.25, -90)):
        px = cx * w
        if kind == "pp":
            with s.paint(height=0.04, rough=0.45) as d:
                for off in (-80, 80):
                    d.rect((px + off - 5, 0, px + off + 5, h), ink2, a=0.9)
        # label panel (a printed rectangle that is a bit lighter than the weave) + big text
        with s.paint(height=0.03, rough=0.7) as d:
            d.rect((px - 62, h * 0.12, px + 62, h * 0.88), 0xf0e6c8 if kind != "pp" else 0xf6f3ea, a=0.55 if kind != "pp" else 0.8)
            d.rect((px - 60, h * 0.14, px + 60, h * 0.86), ink, a=0.0)
            tpx = min(38, 0.58 * h / (len(text) * 0.66 * 1.25))
            spx = min(17, 0.58 * h / (len(sub) * 0.62 * 1.25))
            d.text((px - 14, h * 0.5), text, tpx, ink, "black", "cm", squeeze=1.25, rot=rot, spacing=0.02)
            d.text((px + 26 * (1 if rot == 90 else -1), h * 0.5), sub, spx, ink2, "bold", "cm", squeeze=1.25, rot=rot)
            for k in (-1, 1):
                d.rect((px - 58 if k < 0 else px + 52, h * 0.13, px - 52 if k < 0 else px + 58, h * 0.87), ink2, a=0.85)
    stitch_row(s, 9, 0x2b2118 if kind != "pp" else 0x1f3f8a, 8.0, 3.0, seed)
    stitch_row(s, 15, 0x2b2118 if kind != "pp" else 0x1f3f8a, 8.0, 3.0, seed + 1)
    stitch_row(s, h - 8, 0x2b2118 if kind != "pp" else 0x1f3f8a, 8.0, 3.0, seed + 2)
    with s.paint(height=0.2, rough=0.9) as d:  # rope tie under the mouth
        d.rect((0, 26, w, 33), 0x5a4126 if kind != "pp" else 0xc0392b, a=0.95)
    return s


def sack_mesh(atlas: Atlas, kind_tile: str, length=0.62, ha=0.105, hb=0.17, seed=0, boxy: float = 3.4, slump=0.0, mouth=0.28):
    """One slumped sack lying along x (mouth at +x), UV-mapped around the x axis."""
    rng = np.random.default_rng(seed)
    K = 6
    path = np.array([(x, 0.0, 0.0) for x in np.linspace(-length / 2, length / 2, K)])
    # pillow: thickness collapses towards the sewn ends while the width stays (flat seams); the mouth end is gathered
    prof_a = np.array([0.30, 0.92, 1.05, 1.0, 0.80, 0.34]) * ha
    prof_b = np.array([0.94, 1.0, 1.04, 1.0, 0.94, mouth * 1.5]) * hb
    t = tube(path, prof_a, prof_b, sides=10, rings=10, exponent=boxy, cap_start=False, cap_end=False)
    t = close_tube_ends(t, 10, 10)
    t = noisy(t, 0.012, 10.0, seed)
    # slump: wider/flatter in the middle, pinched mouth leans over
    v = t.v
    belly = np.exp(-((v[:, 0] + 0.05) / 0.22) ** 2)
    v[:, 1] *= 1.0 - 0.18 * slump * belly
    v[:, 2] *= 1.0 + 0.10 * slump * belly
    v[:, 1] += 0.012 * np.clip((v[:, 0] - 0.1) / 0.2, 0, 1) ** 2 * (1 + rng.uniform(-0.5, 0.5))  # drooping mouth ear
    t.v = v
    r = atlas.rect(kind_tile)
    m = cyl_uv(t, (0, 0, 0), r, axis="x", v_range=(-length / 2 - 0.01, length / 2 + 0.01), mirror=False)
    vc_mul(m, (1, 1, 1), rng.uniform(0.9, 1.08))
    return m


def soft_sacks() -> dict:
    seed = 41
    w, h = SACK_TILE
    atlas = Atlas(512, 768, 0x806040)
    atlas.add("rice", 0, 0, _sack_tile("rice", seed))
    atlas.add("pp", 0, 256, _sack_tile("pp", seed + 1))
    atlas.add("beans", 0, 512, _sack_tile("beans", seed + 2))
    m = EnvModel("prop_soft_sacks")
    # (tile, centre xz, y0, yaw, slump, length)
    layout = [
        ("rice", (-0.2, -0.07), 0.0, 93, 0.5, 0.68),
        ("pp", (0.2, -0.06), 0.0, 85, 0.5, 0.68),
        ("beans", (0.0, -0.08), 0.17, 8, 0.7, 0.72),
        ("rice", (0.02, 0.27), 0.0, -4, 0.55, 0.62),
        ("pp", (-0.03, -0.05), 0.36, 62, 0.8, 0.62),
    ]
    for i, (tile, (x, z), y0, yaw, slump, ln) in enumerate(layout):
        sk = sack_mesh(atlas, tile, seed=seed + i, slump=slump, length=ln, ha=0.128, hb=0.16)
        sk = place(sk, (0, 0, 0), (0, yaw, 0))
        sk.v = sk.v + np.array([x, 0, z])
        sk.v[:, 1] += y0 - sk.v[:, 1].min()
        vc_ground(sk, 0.08, 0.5, seed + i)
        m.add(sk)
    return m.export({"main": atlas.mat(normal_strength=1.6, nblur=1.6, jpeg_q=80)})


# ============================================================================ road barrier


def soft_barrier() -> dict:
    seed = 51
    atlas = Atlas(512, 512, 0x606060)
    for i, ang in enumerate((45, -45, 45)):
        atlas.pack(f"b{i}", hazard_board(512, 96, seed + i, angle=ang, stripe=26 + 2 * i, wear=0.20 + 0.06 * i))
    st = steel_sheet(256, 128, seed + 9, tone=0x969aa0, rust=0.35, paint=0x4d5258)
    atlas.pack("steel", st)
    red = Sheet(64, 64, 0xe01e28, rough=0.25)
    with red.paint(height=0.12) as d:
        d.ellipse((6, 6, 58, 58), 0xff4a54)
        d.ellipse((16, 16, 48, 48), 0xd81b26)
        d.ellipse((20, 18, 34, 30), 0xffe0e4, a=0.9)
    atlas.pack("red", red)
    cone_t = Sheet(64, 128, 0xff5e0e, rough=0.42)
    with cone_t.paint(height=0.06) as d:
        d.rect((0, 36, 64, 72), 0xfaf6ec)
        d.rect((0, 102, 64, 128), 0x18181b)
    cone_t.comp(0x3a3128, np.clip(noise2(64, 128, seed + 5, fx=3, fy=4) * 1.5 - 0.85, 0, 1) * 0.35)
    atlas.pack("cone", cone_t)
    m = EnvModel("prop_soft_barrier")
    rng = np.random.default_rng(seed)
    steel = atlas.rect("steel")
    S = lambda mesh, tr=None: mesh  # noqa: E731

    def unit(width: float, pos, yaw: float, shade: float, board_ids=(0, 1, 2), height=0.62, depth=0.34):
        """One barricade: two T-footed posts, diagonal struts, three striped boards bolted to the front."""
        px = width / 2 + 0.02
        parts = []

        def add(mesh, tile=None):
            if tile is None:
                mm = box_uv(mesh, mesh.v.min(axis=0), mesh.v.max(axis=0), steel)
            else:
                mm = tile
            vc_ground(mm, 0.12, 0.4, seed)
            vc_mul(mm, (1, 1, 1), shade)
            m.add(place(mm, pos, (0, yaw, 0)))

        for sx in (-1, 1):
            add(obox((sx * px, height / 2, 0), (0.05, height, 0.05), bevel=0.008, seg=1))
            add(obox((sx * px, 0.022, 0), (0.05, 0.044, depth), bevel=0.01, seg=1))
            for sz in (-1, 1):
                add(rod((sx * px, height - 0.16, 0.0), (sx * px, 0.04, sz * (depth / 2 - 0.02)), 0.012, 6))
            add(rod((sx * px - 0.03, height, 0), (sx * px + 0.03, height, 0), 0.02, 8))
        ys = np.linspace(height - 0.10, 0.23, 3)
        for k, y in enumerate(ys):
            w = width + rng.uniform(-0.01, 0.01)
            bd = obox((0, 0, 0), (w, 0.125, 0.022), bevel=0.005, seg=1)
            bd = box_uv(bd, bd.v.min(axis=0), bd.v.max(axis=0), _strip_rects(atlas.rect(f"b{board_ids[k]}")))
            vc_mul(bd, (1, 1, 1), rng.uniform(0.92, 1.05) * shade)
            vc_ground(bd, 0.12, 0.4, seed)
            m.add(place(place(bd, (rng.uniform(-0.004, 0.004), y, 0.036), (0, 0, rng.uniform(-0.8, 0.8))), pos, (0, yaw, 0)))
        for sx in (-1, 1):
            r = rod((sx * px, height + 0.01, 0.0), (sx * px, height + 0.04, 0.0), 0.026, 10)
            m.add(place(flat_uv(r, atlas.rect("red"), (0.5, 0.5)), pos, (0, yaw, 0)))

    unit(0.74, (0.0, 0.0, 0.22), 0.0, 1.0)
    unit(0.46, (-0.1, 0.0, -0.2), 20.0, 0.9, board_ids=(1, 2, 0), height=0.55, depth=0.30)
    cone = lathe([(0.075, 0.0), (0.075, 0.02), (0.052, 0.12), (0.034, 0.24), (0.026, 0.30), (0.0, 0.30)], 10, closed_axis=True)
    cone = cyl_uv(cone, (0, 0, 0), atlas.rect("cone"), axis="y", v_range=(0, 0.3), mirror=True)
    base = flat_box((0.17, 0.02, 0.17), (0, 0.01, 0))
    base = flat_uv(base, atlas.rect("cone"), (0.5, 0.95))
    for part in (cone, base):
        m.add(vc_ground(place(part, (0.33, 0.0, 0.31), (0, 20, 0)), 0.08, 0.35, seed))
    return m.export({"main": atlas.mat(normal_strength=0.5)})


# ============================================================================ water cartons + jerrycans


def _bale_tiles(variant: str, seed: int):
    if variant == "blue":
        kw = dict(film=0x2f78dc, sachet=0xb9d8f4, text_color=0xffffff)
        label = "PURE WATER"
    else:
        kw = dict(film=0xdff0fa, sachet=0xf1f7fb, text_color=0x1f5fbf)
        label = "COOL WATER"
    return dict(
        front=film_sheet(224, 108, seed, text=label, cell=(30, 22), **kw),
        side=film_sheet(160, 108, seed + 1, text=None, cell=(30, 22), **kw),
        top=film_sheet(224, 160, seed + 2, text=None, cell=(30, 22), **kw),
    )


def _jerrycan_tiles(seed: int, tone, cap=0xc0392b):
    """front/back (ribbed with an X-brace pressing), side, top."""
    front = plastic_sheet(96, 144, seed, tone, rough=0.4)
    ys = np.arange(144)[:, None]
    ribs = np.clip(1 - np.abs(((ys % 18) - 9) / 4.0), 0, 1) * np.ones((1, 96))
    front.hgt += 0.18 * ribs
    front.rgb *= (1 - 0.1 * ribs)[..., None]
    with front.paint(height=0.1) as d:
        d.line([(10, 20), (86, 124)], tone, 2.6)
        d.line([(86, 20), (10, 124)], tone, 2.6)
        d.text((48, 72), "20L", 18, 0x3a2f10 if tone == 0xe5b81e else 0x10243f, "black", "cm", a=0.7)
    side = plastic_sheet(48, 144, seed + 1, tone, rough=0.4)
    top = plastic_sheet(96, 48, seed + 2, tone, rough=0.4)
    return dict(front=front, side=side, top=top)


def jerrycan_parts(atlas: Atlas, name: str, pos, yaw, cap_tile="cap"):
    rects = {"+z": atlas.rect(f"{name}_front"), "-z": atlas.rect(f"{name}_front"), "+x": atlas.rect(f"{name}_side"), "-x": atlas.rect(f"{name}_side"), "+y": atlas.rect(f"{name}_top"), "-y": atlas.rect(f"{name}_top")}
    body = bevel_box((0, 0.14, 0), (0.20, 0.28, 0.115), 0.022, 1)
    parts = [box_uv(body, body.v.min(axis=0), body.v.max(axis=0), rects)]
    handle = polytube([(0.045, 0.27, 0.0), (0.055, 0.31, 0.0), (0.0, 0.335, 0.0), (-0.035, 0.31, 0.0), (-0.035, 0.27, 0.0)], 0.011, 5, caps=False)
    parts.append(flat_uv(handle, atlas.rect(f"{name}_top"), (0.5, 0.5)))
    spout = rod((0.065, 0.28, 0.0), (0.065, 0.315, 0.0), 0.027, 8)
    parts.append(flat_uv(spout, atlas.rect(f"{name}_top"), (0.5, 0.5)))
    cap = rod((0.065, 0.315, 0.0), (0.065, 0.332, 0.0), 0.031, 8)
    parts.append(flat_uv(cap, atlas.rect(cap_tile), (0.5, 0.5)))
    return [place(p, pos, (0, yaw, 0)) for p in parts]


def soft_cartons() -> dict:
    seed = 61
    atlas = Atlas(512, 640, 0x404850)
    for variant in ("blue", "clear"):
        for k, t in _bale_tiles(variant, seed + (0 if variant == "blue" else 40)).items():
            atlas.pack(f"{variant}_{k}", t)
    for nm, tone in (("jy", 0xe5b81e), ("jb", 0x2c6fd0)):
        for k, t in _jerrycan_tiles(seed + 80, tone).items():
            atlas.pack(f"{nm}_{k}", t)
    cap = Sheet(32, 32, 0xc0392b, rough=0.4)
    atlas.pack("cap", cap)
    m = EnvModel("prop_soft_cartons")
    rng = np.random.default_rng(seed)

    def bale(variant, pos, yaw, seg=2, size=(0.42, 0.20, 0.30)):
        rects = {"+z": atlas.rect(f"{variant}_front"), "-z": atlas.rect(f"{variant}_front"), "+x": atlas.rect(f"{variant}_side"), "-x": atlas.rect(f"{variant}_side"), "+y": atlas.rect(f"{variant}_top"), "-y": atlas.rect(f"{variant}_top")}
        b = bevel_box((0, size[1] / 2, 0), size, 0.04, seg)
        b = noisy(b, 0.006, 9.0, int(rng.integers(0, 99)))
        b.v[:, 1] = np.maximum(b.v[:, 1], 0.0)
        b = box_uv(b, (-size[0] / 2, 0, -size[2] / 2), (size[0] / 2, size[1], size[2] / 2), rects)
        vc_mul(b, (1, 1, 1), rng.uniform(0.92, 1.06))
        vc_ground(b, 0.07, 0.4, seed)
        m.add(place(b, pos, (0, yaw, 0)))

    # left stack: two bales + a clear bale; right stack: two bales topped with jerrycans; one bale in front
    bale("blue", (-0.20, 0.0, -0.17), 3, seg=1)
    bale("clear", (-0.19, 0.2, -0.17), -4, seg=2)
    bale("clear", (0.22, 0.0, -0.17), -2, seg=1)
    bale("blue", (0.21, 0.2, -0.18), 6, seg=2)
    bale("blue", (0.0, 0.0, 0.22), 88, seg=1, size=(0.42, 0.20, 0.30))
    for p in jerrycan_parts(atlas, "jy", (0.20, 0.4, -0.17), 20):
        m.add(vc_ground(p, 0.05, 0.1, seed))
    for p in jerrycan_parts(atlas, "jb", (-0.18, 0.4, -0.17), -24):
        m.add(p)
    for p in jerrycan_parts(atlas, "jy", (-0.34, 0.0, 0.2), 70):
        m.add(vc_ground(p, 0.05, 0.3, seed))
    return m.export({"main": atlas.mat(normal_strength=1.0, nblur=0.8, jpeg_q=82)})


# ============================================================================ blue bottle crates + bucket


def soft_kegs() -> dict:
    seed = 71
    atlas = Atlas(512, 512, 0x2060c0)
    cr = plastic_sheet(256, 128, seed, 0x1f66d6, rough=0.45, grime=0.35)
    # moulded slots: a grid of dark rounded holes on the long face
    with cr.paint(height=-0.5, rough=0.9) as d:
        for ix in range(8):
            for iy in range(2):
                x0, y0 = 14 + ix * 29, 20 + iy * 46
                d.rect((x0, y0, x0 + 20, y0 + 30), 0x0a1a38, r=3)
    with cr.paint(height=0.15) as d:
        d.rect((0, 0, 256, 11), 0x2c78e8, a=0.8)
        d.rect((0, 117, 256, 128), 0x1857b8, a=0.8)
    atlas.pack("crate_l", cr)
    cs = plastic_sheet(184, 128, seed + 1, 0x1f66d6, rough=0.45)
    with cs.paint(height=-0.5, rough=0.9) as d:
        for ix in range(5):
            for iy in range(2):
                x0, y0 = 12 + ix * 33, 20 + iy * 46
                d.rect((x0, y0, x0 + 22, y0 + 30), 0x0a1a38, r=3)
    atlas.pack("crate_s", cs)
    ct = plastic_sheet(256, 184, seed + 2, 0x1c5ec4, rough=0.5)
    with ct.paint(height=-0.2) as d:
        d.rect((16, 16, 240, 168), 0x0a1a38, a=0.55)
    atlas.pack("crate_t", ct)
    # bottles: amber and green glass with a paper label, plus caps
    bt = Sheet(128, 128, 0x7a3b10, rough=0.15)
    n = noise2(128, 128, seed + 3, fx=3, fy=3)
    bt.rgb = bt.rgb * (0.7 + 0.5 * n[..., None])
    with bt.paint(height=0.05, rough=0.7) as d:
        d.rect((0, 40, 128, 88), 0xe9dfc2)
        d.rect((0, 40, 128, 52), 0xc0392b)
        d.text((64, 70), "ZOBO", 22, 0x15151a, "black", "cm", squeeze=0.9)
    atlas.pack("amber", bt)
    gr = Sheet(128, 128, 0x1f7a45, rough=0.15)
    gr.rgb = gr.rgb * (0.7 + 0.5 * n[..., None])
    with gr.paint(height=0.05, rough=0.7) as d:
        d.rect((0, 40, 128, 88), 0xf4efe0)
        d.rect((0, 40, 128, 52), 0xffc300)
        d.text((64, 70), "MALT", 22, 0x14502e, "black", "cm", squeeze=0.9)
    atlas.pack("green", gr)
    cap = Sheet(32, 32, 0xd0d3d6, rough=0.35, metal=0.5)
    atlas.pack("cap", cap)
    bk = plastic_sheet(256, 128, seed + 5, 0xd23a2a, rough=0.5, grime=0.5)
    with bk.paint(height=0.12) as d:
        for x in range(0, 256, 16):
            d.line([(x, 0), (x, 128)], 0xa82a1c, 2.2, a=0.8)
        d.rect((0, 0, 256, 18), 0xe85a44, a=0.8)
        d.text((128, 70), "WATER", 30, 0xf4efe0, "black", "cm", squeeze=0.9, a=0.85)
    atlas.pack("bucket", bk)
    steel = Sheet(32, 32, 0x8a8e92, rough=0.4, metal=0.8)
    atlas.pack("wire", steel)
    m = EnvModel("prop_soft_kegs")
    rng = np.random.default_rng(seed)

    def crate(pos, yaw, bottles: bool, h=0.27):
        rects = {"+z": atlas.rect("crate_l"), "-z": atlas.rect("crate_l"), "+x": atlas.rect("crate_s"), "-x": atlas.rect("crate_s"), "+y": atlas.rect("crate_t"), "-y": atlas.rect("crate_t")}
        c = bevel_box((0, h / 2, 0), (0.46, h, 0.32), 0.014, 1)
        c = box_uv(c, (-0.23, 0, -0.16), (0.23, h, 0.16), rects)
        vc_ground(c, 0.1, 0.4, seed)
        m.add(place(c, pos, (0, yaw, 0)))
        if bottles:
            for ix in range(4):
                for iz in range(3):
                    if bottles == "half" and iz == 2:
                        continue
                    bx, bz = -0.157 + ix * 0.105 + rng.uniform(-0.004, 0.004), -0.1 + iz * 0.1 + rng.uniform(-0.004, 0.004)
                    prof = [(0.034, 0.0), (0.034, 0.06), (0.019, 0.118), (0.019, 0.152), (0.022, 0.152), (0.0, 0.166)]
                    b = lathe(prof, 5, closed_axis=True)
                    tile = "amber" if (ix + iz) % 3 else "green"
                    b = cyl_uv(b, (0, 0, 0), atlas.rect(tile), axis="y", v_range=(-0.02, 0.15), mirror=True)
                    cap_faces = b.v[b.f][:, :, 1].min(axis=1) > 0.15
                    b_cap = b.copy()
                    b_cap.f = b.f[cap_faces]
                    b.f = b.f[~cap_faces]
                    cu = atlas.rect("cap")
                    b_cap.uv = np.tile([(cu[0] + cu[2]) / 2, 1 - (cu[1] + cu[3]) / 2], (len(b_cap.v), 1))
                    for part in (b, b_cap):
                        vc_mul(part, (1, 1, 1), rng.uniform(0.9, 1.1))
                        m.add(place(place(part, (bx, h - 0.004, bz)), pos, (0, yaw, 0)))

    crate((-0.17, 0.0, 0.14), 2, False)
    crate((-0.16, 0.27, 0.13), -3, True)
    crate((-0.16, 0.0, -0.22), 5, 'half')
    # bucket (frustum with rim and wire handle)
    outer = [(0.0, 0.0), (0.118, 0.0), (0.122, 0.012), (0.158, 0.27), (0.166, 0.276), (0.166, 0.288), (0.159, 0.288)]
    inner = [(0.159, 0.288), (0.151, 0.262), (0.132, 0.05), (0.0, 0.045)]
    bo = outward(lathe(outer, 16, closed_axis=False))
    bo = cyl_uv(bo, (0, 0, 0), atlas.rect("bucket"), axis="y", v_range=(0, 0.29), mirror=True)
    bi = outward(lathe(inner, 16, closed_axis=False))
    bi = orient_from(bi, lambda c: np.c_[1.5 * c[:, 0], c[:, 1] - 0.5, 1.5 * c[:, 2]])
    bi = cyl_uv(bi, (0, 0, 0), atlas.rect("bucket"), axis="y", v_range=(0, 0.29), mirror=True)
    vc_mul(bi, (1, 1, 1), 0.28)
    for part in (bo, bi):
        part = place(part, (0.29, 0.0, 0.2), (0, 20, 0))
        vc_ground(part, 0.08, 0.4, seed)
        m.add(part)
    arch = [(-0.16, 0.27, 0), (-0.14, 0.34, 0), (-0.07, 0.40, 0), (0, 0.42, 0), (0.07, 0.40, 0), (0.14, 0.34, 0), (0.16, 0.27, 0)]
    handle = flat_uv(polytube(arch, 0.006, 4, caps=False), atlas.rect("wire"))
    m.add(place(handle, (0.29, 0.0, 0.2), (0, 20, 0)))
    return m.export({"main": atlas.mat(normal_strength=0.8, nblur=0.5)})


SOFT = {
    "prop_soft_crate": soft_crate,
    "prop_soft_crate_b": soft_crate_b,
    "prop_soft_crates": soft_crates,
    "prop_soft_tyres": soft_tyres,
    "prop_soft_sacks": soft_sacks,
    "prop_soft_barrier": soft_barrier,
    "prop_soft_cartons": soft_cartons,
    "prop_soft_kegs": soft_kegs,
}
