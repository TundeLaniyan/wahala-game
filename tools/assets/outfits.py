"""Clothing, footwear, hair and accessories for the WAHALA! cast. Pure geometry + vertex colours."""
from __future__ import annotations

import numpy as np
from scipy.interpolate import PchipInterpolator

from chargen import Body, build_face_details, hexrgb, joints_for, paint, smoothstep, srgb_to_linear
from loft import Mesh, displace_along_normals, merge, normalize, sphere, tube, value_noise


def _row_interp(b: Body, y: float) -> tuple[float, float, float]:
    ys = np.array([r[0] for r in b.torso])
    a = PchipInterpolator(ys, [r[1] for r in b.torso])(y)
    f = PchipInterpolator(ys, [r[2] for r in b.torso])(y)
    k = PchipInterpolator(ys, [r[3] for r in b.torso])(y)
    return float(a), float(f), float(k)


def ring_positions(y0: float, y1: float, n: int, boundaries=()) -> np.ndarray:
    """Normalised ring heights: `n` even rings plus a tight pair at every colour boundary (for crisp bands)."""
    ts = list(np.linspace(0, 1, n))
    for yb in boundaries:
        t = (yb - y0) / (y1 - y0)
        if 0.01 < t < 0.99:
            ts += [t - 0.0015, t + 0.0015]
    return np.array(sorted(ts))


def torso_cloth(b: Body, y0: float, y1: float, extra: float = 0.012, baggy: float = 0.0, sides: int = 22, rings: int = 10, cap_top: bool = False, bottom_flare: float = 0.0, boundaries=()) -> Mesh:
    ys = np.linspace(y0, y1, 18)
    rows = [_row_interp(b, y) for y in ys]
    flare = np.linspace(bottom_flare, 0, len(ys))
    a = [r[0] + extra + baggy + fl for r, fl in zip(rows, flare)]
    f = [r[1] + extra + baggy * 0.9 + fl * 0.6 for r, fl in zip(rows, flare)]
    k = [r[2] + extra + baggy * 0.9 + fl * 0.6 for r, fl in zip(rows, flare)]
    if b.bust > 0:
        f = [v + b.bust * 0.6 * float(np.exp(-((y - (b.torso[3][0] + 0.07)) / 0.09) ** 2)) for v, y in zip(f, ys)]
    path = np.array([(0.0, y, 0.0) for y in ys])
    m = tube(path, a, [(x + y) / 2 for x, y in zip(f, k)], sides=sides, rings=rings, exponent=2.3, front=f, back=k, cap_start=False, cap_end=cap_top, ring_ts=ring_positions(y0, y1, rings, boundaries))
    return m


def pelvis_cloth(b: Body, y_top: float, y_bottom: float = 0.74, extra: float = 0.02, boundaries=(), sides: int = 20, rings: int = 7) -> Mesh:
    """Closed shorts/pants pelvis enclosing both leg tops (dome bottom = crotch)."""
    a, f, k = _row_interp(b, 0.90)
    width = a + extra
    ys = np.linspace(y_bottom, y_top, 4)
    path = np.array([(0.0, y, 0.0) for y in ys])
    taper = [1.0, 0.97, 0.88, 0.80]
    return tube(path, [width * t for t in taper], [((f + k) / 2 + extra) * t for t in taper], sides=sides, rings=rings, exponent=2.4, front=[(f + extra + 0.004) * t for t in taper], back=[(k + extra + 0.006) * t for t in taper], cap_start=True, cap_end=False, ring_ts=ring_positions(y_bottom, y_top, rings, boundaries))


def sleeve(b: Body, side: str, length: float, extra: float = 0.010, cuff_flare: float = 0.0, sides: int = 12, rings: int = 8, cut: float | None = None) -> Mesh:
    """Sleeve from the shoulder; `length` 0..1 covers the upper arm, up to 2.0 reaches the wrist."""
    j = joints_for(b)
    msign = 1.0 if side == "L" else -1.0
    sh, el, wr = j[f"upperarm_{side}"] + (-0.028 * msign, -0.006, 0), j[f"forearm_{side}"], j[f"hand_{side}"]
    pts = [sh, el, wr]
    radii = [b.arm_r[0], b.arm_r[1], b.arm_r[2]]
    n = max(3, int(rings * min(length, 2.0) / 1.0))
    ts = np.linspace(0, length, n)
    centers, rr = [], []
    for t in ts:
        if t <= 1.0:
            c = sh + (el - sh) * t
            r = radii[0] + (radii[1] - radii[0]) * t
        else:
            u = min(t - 1.0, 1.0)
            c = el + (wr - el) * u
            r = radii[1] + (radii[2] - radii[1]) * u
        centers.append(c)
        rr.append(r + extra)
    rr[-1] += cuff_flare
    rr[-2] += cuff_flare * 0.4
    rr[0] += 0.003
    rr[1] += 0.002
    ts = np.linspace(0, 1, rings)
    if cut is not None:
        ts = np.array(sorted(list(ts) + [cut - 0.003, cut + 0.003]))
    return tube(np.array(centers), rr, rr, sides=sides, rings=rings, cap_start=True, cap_end=False, ring_ts=ts)


def leg_cloth(b: Body, side: str, y_end: float, extra: float = 0.014, flare: float = 0.0, sides: int = 14, rings: int = 9, y_start_offset: float = 0.075, cuts=()) -> Mesh:
    j = joints_for(b)
    hip, knee, ankle = j[f"thigh_{side}"] + (0, y_start_offset, 0), j[f"shin_{side}"], j[f"foot_{side}"] + (0, 0.02, 0)
    poly = np.array([hip, knee, ankle])
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(poly, axis=0), axis=1))]
    ra = np.array([b.leg_r[0] * 1.02, b.leg_r[1], b.leg_r[3]])
    # cut where y == y_end
    ts = np.linspace(0, 1, rings + 4)
    pos = np.stack([np.interp(ts * seg[-1], seg, poly[:, i]) for i in range(3)], axis=1)
    keep = pos[:, 1] >= y_end - 1e-6
    pos = pos[keep]
    if len(pos) < 3:
        pos = np.array([hip, (hip + knee) / 2, knee])
    t_keep = ts[keep]
    r = np.interp(t_keep * seg[-1], seg, ra)
    r = np.maximum(r, np.interp(t_keep, [0, 0.5, 1], [b.leg_r[0], b.leg_r[2] * 1.04, b.leg_r[3]]))
    r = r + extra + np.linspace(0, flare, len(r)) ** 1.5
    ts = np.linspace(0, 1, rings)
    for c in cuts:
        ts = np.append(ts, [c - 0.003, c + 0.003])
    return tube(pos, r, r, sides=sides, rings=rings, cap_start=True, cap_end=False, ring_ts=np.sort(ts))


def sneaker(b: Body, side: str, sole_h: float = 0.032, bulk: float = 1.0, sides: int = 12) -> Mesh:
    j = joints_for(b)
    m = 1.0 if side == "L" else -1.0
    x = j[f"foot_{side}"][0]
    s = b.shoe_scale
    path = np.array([[x, 0.062, -0.078 * s], [x, 0.064, 0.015 * s], [x, 0.052, 0.115 * s], [x, 0.038, 0.215 * s]])
    chunky = 0.5 + 0.5 * s  # stylised bodies wear proportionally chunkier trainers
    wid = np.array([0.040, 0.049, 0.050, 0.040]) * bulk * chunky
    top = np.array([0.088, 0.066, 0.046, 0.032]) * bulk * chunky
    bot = np.array([0.060, 0.052, 0.046, 0.036]) * bulk * chunky
    mesh = tube(path, wid, top, sides=sides, rings=9, exponent=2.4, front=top, back=bot, hint=(0, 1, 0), cap_start=True, cap_end=True)
    return mesh


def sock(b: Body, side: str, top_y: float, extra: float = 0.006) -> Mesh:
    j = joints_for(b)
    p0 = j[f"shin_{side}"] * 0.0 + np.array([j[f"foot_{side}"][0], top_y, j[f"shin_{side}"][2] * 0.9])
    p1 = j[f"foot_{side}"] + (0, 0.035, 0)
    r0 = b.leg_r[2] * 0.82 + extra
    r1 = b.leg_r[3] + extra
    return tube(np.array([p0, (p0 + p1) / 2, p1]), [r0, (r0 + r1) / 2, r1], [r0, (r0 + r1) / 2, r1], sides=12, rings=6, cap_start=False, cap_end=False)


# ------------------------------------------------------------------ hair & accessories


def hair_shell(b: Body, thickness: float = 0.006, hairline: float = 0.25, nape: float = -0.25, bumps: float = 0.0, seed: int = 1) -> Mesh:
    rx, ry, rz = b.head
    cy = b.head_y
    m = sphere((0, cy, 0.012), (rx + thickness, ry + thickness, rz + thickness), lat=16, lon=28)
    y = (m.v[:, 1] - cy) / ry
    zr = (m.v[:, 2] - 0.012) / rz
    xr = m.v[:, 0] / rx
    # hairline: high at the front, drops to the nape at the back, ear gap at the sides
    line = hairline + (nape - hairline) * smoothstep(0.1, -0.9, zr) - 0.16 * smoothstep(0.55, 1.0, np.abs(xr)) * (zr > -0.2)
    keep_v = y > line
    keep_f = keep_v[m.f].all(axis=1)
    m.f = m.f[keep_f]
    if bumps > 0:
        displace_along_normals(m, value_noise(m.v, 90.0, seed=seed) * bumps)
    m.region = ["head"] * len(m.v)
    return m


def locs(b: Body, count: int = 22, length: float = 0.17, seed: int = 4, droop: float = 1.0, radius: float = 0.0125) -> Mesh:
    """Shoulder-length locs hanging from the scalp, with variation in length and wave."""
    rng = np.random.default_rng(seed)
    rx, ry, rz = b.head
    cy = b.head_y
    strands = []
    for i in range(count):
        # sample on the upper-back/side scalp
        th = rng.uniform(0, 2 * np.pi)
        ph = rng.uniform(0.25, 0.92)  # polar angle from top (0..pi/2)
        dirv = np.array([np.sin(ph) * np.sin(th), np.cos(ph), np.sin(ph) * np.cos(th)])
        if dirv[2] > 0.55 and dirv[1] < 0.8:  # keep the face clear
            dirv[2] *= -0.5
        root = np.array([0.0, cy, 0.012]) + dirv * np.array([rx, ry, rz]) * 0.98
        out = normalize(dirv * np.array([1, 0.5, 1]))
        L = length * rng.uniform(0.75, 1.15)
        pts = [root, root + out * 0.03 + (0, 0.004, 0), root + out * 0.05 + (0, -0.04 * droop, 0), root + out * 0.058 + (0, -L * 0.7 * droop, 0), root + out * 0.05 + (0.004 * np.sin(th * 3), -L * droop, 0)]
        pts = np.array(pts)
        r = radius * rng.uniform(0.85, 1.1)
        s = tube(pts, [r, r * 1.0, r * 0.9, r * 0.8, r * 0.5], [r, r, r * 0.9, r * 0.8, r * 0.5], sides=4, rings=6, cap_start=False, cap_end=True)
        strands.append(s)
    m = merge(strands)
    return m


def puff(b: Body, side: float, seed: int = 2, size: float = 0.075) -> Mesh:
    rx, ry, rz = b.head
    cy = b.head_y
    m = sphere((side * (rx * 0.62), cy + ry * 0.95, -0.02), (size, size * 0.9, size * 0.92), lat=12, lon=18)
    displace_along_normals(m, value_noise(m.v, 70.0, seed=seed) * 0.012)
    m.region = ["head"] * len(m.v)
    return m


def short_curls(b: Body, seed: int = 5, n: int = 150, radius: float = 0.0105) -> Mesh:
    """A coarse, textured high-top of small curls (reads as short twists / curls)."""
    rng = np.random.default_rng(seed)
    rx, ry, rz = b.head
    cy = b.head_y
    balls = []
    for _ in range(n):
        th = rng.uniform(0, 2 * np.pi)
        ph = rng.uniform(0.0, 0.85)
        d = np.array([np.sin(ph) * np.sin(th) * 0.95, np.cos(ph), np.sin(ph) * np.cos(th) * 0.9])
        if d[2] > 0.7 and d[1] < 0.75:
            continue
        pos = np.array([0.0, cy, 0.012]) + d * np.array([rx, ry, rz]) * 1.04
        balls.append(sphere(pos, (radius,) * 3, lat=4, lon=6))
    return merge(balls) if balls else sphere((0, 0, 0), (0.001,) * 3)


def sunglasses(b: Body, tint: int = 0x0c0e12, frame_col: int = 0xd9a62e) -> list[Mesh]:
    rx, ry, rz = b.head
    cy = b.head_y
    z = 0.012 + rz * 0.94
    out = []
    lens_col = srgb_to_linear(hexrgb(tint))
    gold_col = srgb_to_linear(hexrgb(frame_col))
    for sx in (-1, 1):
        l = sphere((sx * rx * 0.42, cy + ry * 0.11, z + 0.005), (0.028, 0.021, 0.005), lat=8, lon=14)
        l.c[:, :3] = lens_col
        out.append(l)
        top_bar = tube(np.array([[sx * rx * 0.16, cy + ry * 0.24, z + 0.005], [sx * rx * 0.68, cy + ry * 0.22, z - 0.001]]), [0.0032, 0.0032], [0.0032, 0.0032], sides=5, rings=4)
        top_bar.c[:, :3] = gold_col
        out.append(top_bar)
        arm = tube(np.array([[sx * rx * 0.64, cy + ry * 0.14, z - 0.003], [sx * rx * 0.99, cy + ry * 0.13, 0.012 + rz * 0.35], [sx * rx * 1.0, cy + ry * 0.08, 0.0]]), [0.0028] * 3, [0.0028] * 3, sides=5, rings=5)
        arm.c[:, :3] = gold_col
        out.append(arm)
    bridge = tube(np.array([[-rx * 0.16, cy + ry * 0.15, z + 0.005], [rx * 0.16, cy + ry * 0.15, z + 0.005]]), [0.0034, 0.0034], [0.0034, 0.0034], sides=5, rings=3)
    bridge.c[:, :3] = gold_col
    out.append(bridge)
    return out


def baseball_cap(b: Body, crown_col: int = 0xd9242c, visor_col: int = 0xb81820, badge_col: int = 0xf6c41c) -> list[Mesh]:
    rx, ry, rz = b.head
    cy = b.head_y
    dome = sphere((0, cy + 0.016, -0.002), (rx + 0.012, ry * 0.82, rz + 0.012), lat=10, lon=18)
    keep = dome.v[:, 1] > cy + ry * 0.22
    dome.f = dome.f[keep[dome.f].all(axis=1)]
    dome.c[:, :3] = srgb_to_linear(hexrgb(crown_col))
    # Front gold emblem on crown
    front_badge = (dome.v[:, 2] > rz * 0.78) & (np.abs(dome.v[:, 0]) < 0.022) & (dome.v[:, 1] > cy + ry * 0.36) & (dome.v[:, 1] < cy + ry * 0.68)
    dome.c[front_badge, :3] = srgb_to_linear(hexrgb(badge_col))
    dome.region = ["head"] * len(dome.v)
    visor = sphere((0, cy + ry * 0.26, rz * 0.92), (rx * 0.84, 0.009, rz * 0.62), lat=6, lon=14)
    visor.c[:, :3] = srgb_to_linear(hexrgb(visor_col))
    visor.region = ["head"] * len(visor.v)
    return [dome, visor]


def chain(b: Body, y: float, color: int = 0xd9a62e, sag: float = 0.09, radius: float = 0.0045) -> Mesh:
    a, f, k = _row_interp(b, y + 0.05)
    pts = []
    for t in np.linspace(0, np.pi, 18):
        ang = t
        x = np.cos(ang) * (a * 0.52)
        zz = f * 0.75 + 0.008 + np.sin(ang) * 0.0
        yy = y + 0.02 - np.sin(ang) * sag
        pts.append((x, yy, zz))
    m = tube(np.array(pts), [radius] * len(pts), [radius] * len(pts), sides=5, rings=22, cap_start=True, cap_end=True)
    m.c[:, :3] = srgb_to_linear(hexrgb(color))
    return m


def hoop_earrings(b: Body, color: int = 0xd9a62e) -> list[Mesh]:
    rx, ry, rz = b.head
    cy = b.head_y
    out = []
    for sx in (-1, 1):
        pts = []
        for t in np.linspace(0, 2 * np.pi * 0.92, 14):
            pts.append((sx * (rx * 1.02) + 0.0, cy - ry * 0.18 - 0.018 + 0.018 * np.cos(t) - 0.0, 0.0 + 0.018 * np.sin(t)))
        m = tube(np.array(pts), [0.0028] * 14, [0.0028] * 14, sides=5, rings=18, cap_start=True, cap_end=True)
        m.c[:, :3] = srgb_to_linear(hexrgb(color))
        out.append(m)
    return out


def headband(b: Body, color: int, width: float = 0.03, z_off: float = 0.0) -> Mesh:
    rx, ry, rz = b.head
    cy = b.head_y
    pts = []
    for t in np.linspace(0, 2 * np.pi, 28, endpoint=False):
        pts.append((np.sin(t) * (rx + 0.012), cy + ry * 0.42 + 0.0 - 0.0, 0.012 + np.cos(t) * (rz + 0.012)))
    pts.append(pts[0])
    m = tube(np.array(pts), [0.004] * 29, [width / 2] * 29, sides=8, rings=40, cap_start=False, cap_end=False)
    m.c[:, :3] = srgb_to_linear(hexrgb(color))
    return m


def wristband(b: Body, side: str, color: int, h: float = 0.032) -> Mesh:
    j = joints_for(b)
    w = j[f"hand_{side}"]
    up = j[f"forearm_{side}"]
    p0 = w + (up - w) * 0.05 + (0, 0.0, 0)
    p1 = w + (up - w) * 0.05 + (up - w) * h / np.linalg.norm(up - w)
    r = b.arm_r[2] + 0.007
    m = tube(np.array([p0, (p0 + p1) / 2, p1]), [r] * 3, [r] * 3, sides=12, rings=4, cap_start=False, cap_end=False)
    m.c[:, :3] = srgb_to_linear(hexrgb(color))
    return m
