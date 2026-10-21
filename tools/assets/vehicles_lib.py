"""Shared vehicle-modelling helpers (numpy only): stacked super-ellipse body shells, surface-conforming patches
(glass, seams, decals), swept tubes, wheels and a small decal atlas generator.

Everything is expressed in game units (1 tile = 1.0), Y up, front = +Z.  See build_vehicles.py for the entry point.
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))

import tex as texlib
import prim as _prim
from loft import Mesh, frame_for, merge, normalize, sphere, value_noise
from prim import Model, Spec, _orient, quad, colorize, cylinder, lathe, outward, place, rot_matrix  # noqa: F401

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FONT_SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


# ----------------------------------------------------------------------------- colour helpers


def lin(hex_or_rgb) -> np.ndarray:
    """sRGB 0xRRGGBB -> linear RGB (what glTF vertex colours expect)."""
    c = texlib.srgb(hex_or_rgb)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def paint(m: Mesh, hex_color, a: float = 1.0) -> Mesh:
    m.c[:] = [*lin(hex_color), a]
    return m


def mul_color(m: Mesh, factor) -> Mesh:
    f = np.asarray(factor, dtype=np.float64)
    m.c[:, :3] *= f[:, None] if f.ndim == 1 else f
    return m


def sgnpow(x, p):
    return np.sign(x) * np.abs(x) ** p


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


# ----------------------------------------------------------------------------- generic mesh builders


def grid_faces(nv: int, nu: int, closed_u: bool = False) -> np.ndarray:
    f = []
    ucount = nu if closed_u else nu - 1
    for i in range(nv - 1):
        for j in range(ucount):
            j2 = (j + 1) % nu
            a, b, c, d = i * nu + j, i * nu + j2, (i + 1) * nu + j, (i + 1) * nu + j2
            f += [(a, b, c), (b, d, c)]
    return np.array(f, dtype=np.int64)


def face_normals(m: Mesh) -> np.ndarray:
    t = m.v[m.f]
    return np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])


def orient_faces(m: Mesh, ref_fn) -> Mesh:
    """Flip triangles whose normal points towards `ref_fn(centroid)` (a point inside the solid / on its axis)."""
    t = m.v[m.f]
    cen = t.mean(axis=1)
    fn = face_normals(m)
    ref = ref_fn(cen)
    flip = np.einsum("ij,ij->i", fn, cen - ref) < 0
    f = m.f.copy()
    f[flip] = f[flip][:, ::-1]
    m.f = f
    return m


def axis_ref(c):
    """Reference points on the vehicle's vertical axis (same height) - fine for sides/ends of a convex body."""
    r = np.array(c, dtype=np.float64)
    r[:, 0] = 0.0
    r[:, 2] = 0.0
    return r


def bevel_box(center, size, bevel: float = 0.02, seg: int = 1) -> Mesh:
    """prim.bevel_box with a cheaper default (seg=1 -> 48 triangles, a chamfer-like bevel)."""
    return _prim.bevel_box(center, size, bevel, seg)


def rrect(w: float, h: float, r: float, n: int = 4) -> np.ndarray:
    """Counter-clockwise rounded-rectangle outline (u right, v up), centred on the origin."""
    r = min(r, w / 2 - 1e-6, h / 2 - 1e-6)
    pts = []
    if r <= 1e-5:
        return np.array([(w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2), (-w / 2, -h / 2)], dtype=np.float64)
    for cx, cy, a0 in [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]:
        for k in range(n):
            a = np.radians(a0 + 90 * k / (n - 1))
            pts.append((cx + r * np.cos(a), cy + r * np.sin(a)))
    return np.array(pts)


def rrect_dense(w: float, h: float, r: float, n: int = 4, sub_h: int = 1, sub_v: int = 1) -> np.ndarray:
    """rrect with the straight edges subdivided (so the outline can follow a curved surface). Same (n, sub_*) -> same point count."""
    base = rrect(w, h, r, n)
    out = []
    subs = [sub_h, sub_v, sub_h, sub_v]
    for c in range(4):
        arc = base[c * n:(c + 1) * n]
        out.extend(arc)
        nxt = base[((c + 1) % 4) * n]
        a, b = arc[-1], nxt
        for k in range(1, subs[c]):
            out.append(a + (b - a) * k / subs[c])
    return np.array(out)


def grid_patch(project, uc: float, vc: float, w: float, h: float, r: float, spacing: float = 0.05, off: float = 0.003, ref_fn=None, uv_rect=None, shrink: float = 0.0) -> Mesh:
    """Rounded-rectangle grid laid on a surface (conforms to curvature at `spacing`); lifted `off` along the normal."""
    ref_fn = ref_fn or axis_ref
    nu = max(2, int(np.ceil(w / spacing)) + 1)
    nv = max(2, int(np.ceil(h / spacing)) + 1)
    xs = np.linspace(-w / 2, w / 2, nu)
    ys = np.linspace(-h / 2, h / 2, nv)
    X, Y = np.meshgrid(xs, ys)
    ax, ay = np.abs(X) - (w / 2 - r), np.abs(Y) - (h / 2 - r)
    corner = (ax > 0) & (ay > 0)
    l2 = np.hypot(ax, ay)
    li = np.maximum(ax, ay)
    f = np.where(corner & (l2 > 1e-9), li / np.maximum(l2, 1e-9), 1.0)
    X = np.where(corner, np.sign(X) * ((w / 2 - r) + ax * f), X)
    Y = np.where(corner, np.sign(Y) * ((h / 2 - r) + ay * f), Y)
    P = np.zeros((nv, nu, 3))
    for i in range(nv):
        for j in range(nu):
            u, v = uc + X[i, j], vc + Y[i, j]
            p = project(u, v)
            n = surface_normal(project, u, v)
            if np.dot(n, ref_fn(p[None])[0] - p) > 0:
                n = -n
            P[i, j] = p + n * off
    m = Mesh(P.reshape(-1, 3), grid_faces(nv, nu))
    orient_faces(m, ref_fn)
    if uv_rect is not None:
        u0, v0, u1, v1 = uv_rect
        fu = (X + w / 2).reshape(-1) / w
        fv = (Y + h / 2).reshape(-1) / h
        m.uv = np.stack([u0 + fu * (u1 - u0), 1 - (v0 + fv * (v1 - v0))], axis=1)
    return m


def frame_strip(project, uc: float, vc: float, w: float, h: float, r: float, pad: float, spacing: float = 0.05, off: float = 0.003, ref_fn=None) -> Mesh:
    """Rounded-rect picture frame (the gap between an inner w x h window and an outer one `pad` larger on all sides)."""
    ref_fn = ref_fn or axis_ref
    sh, sv = max(1, int(np.ceil(w / spacing))), max(1, int(np.ceil(h / spacing)))
    inner = rrect_dense(w - 0.008, h - 0.008, max(r - 0.004, 0.004), 4, sh, sv)
    outer = rrect_dense(w + 2 * pad, h + 2 * pad, r + pad, 4, sh, sv)
    # radially paired points: outer sampled at the same indices
    rows = []
    for ring in (outer, inner):
        P = []
        for x, y in ring:
            u, v = uc + x, vc + y
            p = project(u, v)
            n = surface_normal(project, u, v)
            if np.dot(n, ref_fn(p[None])[0] - p) > 0:
                n = -n
            P.append(p + n * off)
        rows.append(P)
    P = np.array(rows)
    m = Mesh(P.reshape(-1, 3), grid_faces(2, len(inner), closed_u=True))
    return orient_faces(m, ref_fn)


def circle_outline(r: float, n: int = 16, rx: float | None = None) -> np.ndarray:
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.stack([np.cos(t) * (rx if rx else r), np.sin(t) * r], axis=1)


def surface_normal(project, u: float, v: float, eps: float = 1e-3) -> np.ndarray:
    du = project(u + eps, v) - project(u - eps, v)
    dv = project(u, v + eps) - project(u, v - eps)
    return normalize(np.cross(du, dv))


def patch(project, outline, centre=(0.0, 0.0), rings: int = 2, off: float = 0.003, ref_fn=axis_ref, uv_rect=None, extent=None, colors=None) -> Mesh:
    """Fill a convex 2D outline (in the surface's (u, v) parameters) with concentric rings and drop it onto the surface.

    `project(u, v) -> xyz` defines the surface; vertices are lifted `off` along the surface normal.  With `uv_rect`
    (u0, v0, u1, v1; v up) explicit UVs are produced from the outline's bounding box (or `extent`=(umin,vmin,umax,vmax)).
    """
    o = np.asarray(outline, dtype=np.float64) + 0.0
    cen = np.asarray(centre, dtype=np.float64)
    n = len(o)
    layers = []
    for k in range(rings):
        s = 1.0 - k / rings
        layers.append(cen + (o - cen) * s)
    flat = np.concatenate(layers + [cen[None]])
    pos, nrm = [], []
    for u, v in flat:
        p = project(u, v)
        nn = surface_normal(project, u, v)
        if np.dot(nn, ref_fn(p[None])[0] - p) > 0:
            nn = -nn
        pos.append(p + nn * off)
        nrm.append(nn)
    verts = np.array(pos)
    faces = []
    for k in range(rings - 1):
        for j in range(n):
            j2 = (j + 1) % n
            a, b, c, d = k * n + j, k * n + j2, (k + 1) * n + j, (k + 1) * n + j2
            faces += [(a, b, c), (b, d, c)]
    last = (rings - 1) * n
    ci = rings * n
    for j in range(n):
        faces.append((last + j, last + (j + 1) % n, ci))
    m = Mesh(verts, np.array(faces))
    orient_faces(m, ref_fn)
    if uv_rect is not None:
        if extent is None:
            extent = (o[:, 0].min() + 0.0, o[:, 1].min() + 0.0, o[:, 0].max() + 0.0, o[:, 1].max() + 0.0)
        fu = (flat[:, 0] - extent[0]) / max(extent[2] - extent[0], 1e-9)
        fv = (flat[:, 1] - extent[1]) / max(extent[3] - extent[1], 1e-9)
        u0, v0, u1, v1 = uv_rect
        m.uv = np.stack([u0 + fu * (u1 - u0), 1 - (v0 + fv * (v1 - v0))], axis=1)
    if colors is not None:
        m.c[:] = colors
    return m


def ribbon(project, pts_uv, width: float, off: float = 0.003, closed: bool = False, height: float = 0.0, ref_fn=axis_ref, profile: int = 3) -> Mesh:
    """Narrow strip following a polyline on a surface (door seams, ribs, wiper blades). `height` > 0 makes a rounded bead."""
    pts = np.asarray(pts_uv, dtype=np.float64)
    P, N = [], []
    for u, v in pts:
        p = project(u, v)
        n = surface_normal(project, u, v)
        if np.dot(n, ref_fn(p[None])[0] - p) > 0:
            n = -n
        P.append(p)
        N.append(n)
    P, N = np.array(P), np.array(N)
    k = len(P)
    T = np.zeros_like(P)
    for i in range(k):
        a = P[(i + 1) % k] if (closed or i < k - 1) else P[i]
        b = P[i - 1] if (closed or i > 0) else P[i]
        T[i] = normalize(a - b)
    S = normalize(np.cross(N, T))
    if height > 0 and profile == 5:
        prof = [(-0.5, 0.0), (-0.32, 0.8), (0.0, 1.0), (0.32, 0.8), (0.5, 0.0)]
    elif height > 0:
        prof = [(-0.5, 0.0), (0.0, 1.0), (0.5, 0.0)]
    else:
        prof = [(-0.5, 0.0), (0.5, 0.0)]
    rows = []
    for (s, hgt) in prof:
        rows.append(P + S * (s * width) + N * (off + hgt * height))
    V = np.stack(rows, axis=1).reshape(-1, 3)  # k, prof, 3
    np_ = len(prof)
    faces = []
    for i in range(k if closed else k - 1):
        i2 = (i + 1) % k
        for j in range(np_ - 1):
            a, b, c, d = i * np_ + j, i * np_ + j + 1, i2 * np_ + j, i2 * np_ + j + 1
            faces += [(a, b, c), (b, d, c)]
    m = Mesh(V, np.array(faces))
    orient_faces(m, ref_fn)
    return m


# ----------------------------------------------------------------------------- tubes / struts


def tube_poly(points, radius, sides: int = 6, caps: bool = True, radius_end: float | None = None) -> Mesh:
    """Swept round tube along a polyline (rack rails, handlebars, ladders). Rings are mitred to the mean tangent."""
    p = np.asarray(points, dtype=np.float64)
    k = len(p)
    tang = np.zeros_like(p)
    for i in range(k):
        a = p[min(i + 1, k - 1)]
        b = p[max(i - 1, 0)]
        tang[i] = normalize(a - b)
    th = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    rings = []
    for i in range(k):
        u, v = frame_for(tang[i])
        r = radius if radius_end is None else radius + (radius_end - radius) * i / max(k - 1, 1)
        rings.append(p[i][None] + r * (np.cos(th)[:, None] * u[None] + np.sin(th)[:, None] * v[None]))
    V = [np.concatenate(rings)]
    faces = []
    for i in range(k - 1):
        for j in range(sides):
            j2 = (j + 1) % sides
            a, b, c, d = i * sides + j, i * sides + j2, (i + 1) * sides + j, (i + 1) * sides + j2
            faces += [(a, c, b), (b, c, d)]
    n = k * sides
    if caps:
        for end, idx in ((0, 0), (1, k - 1)):
            V.append(p[idx][None])
            ci = n
            n += 1
            for j in range(sides):
                j2 = (j + 1) % sides
                a, b = idx * sides + j, idx * sides + j2
                faces.append((a, b, ci) if end == 0 else (b, a, ci))
    m = Mesh(np.concatenate(V), np.array(faces))
    return outward(m) if caps else m


def strut(p0, p1, r: float, sides: int = 6, r1: float | None = None, caps: bool = True) -> Mesh:
    return tube_poly([p0, p1], r, sides, caps, r1)


def blob(center, radii, lat: int = 6, lon: int = 10, seed: int = 0, bumpy: float = 0.0, squash_bottom: float = 0.0) -> Mesh:
    """Lumpy ellipsoid for sacks and bundles."""
    from loft import sphere

    m = sphere((0, 0, 0), radii, lat, lon)
    if bumpy > 0:
        n = value_noise(m.v * 9.0, 1.0, seed)
        m.v = m.v * (1 + bumpy * n)[:, None]
    if squash_bottom > 0:
        low = m.v[:, 1] < 0
        m.v[low, 1] *= (1 - squash_bottom)
    m.v = m.v + np.asarray(center)
    return m


# ----------------------------------------------------------------------------- stacked super-ellipse body shell


class Body:
    """A vehicle shell built as a stack of plan-view super-ellipse rings (width `a`, front/back half-lengths `zf`/`zb`).

    That parametrisation makes it trivial to drop windows, seams and decals onto the surface with `side`/`front`/`back`.
    `knots` are (y, a, zf, zb, e) rows (piecewise linear in y). The roof edge is rounded automatically with radius `roof_r`.
    """

    def __init__(self, knots, ytop: float, roof_r: float = 0.07, crown: float = 0.015, roof_steps: int = 6, extra_ys=(), bottom_round: float = 0.012) -> None:
        k = np.asarray(knots, dtype=np.float64)
        self.k = k
        self.ytop, self.roof_r, self.crown = ytop, roof_r, crown
        ys = list(k[:, 0])
        ys += list(extra_ys)
        for i in range(roof_steps + 1):
            ys.append(ytop - roof_r + roof_r * np.sin(0.5 * np.pi * i / roof_steps))
        ys = sorted(set(round(float(y), 5) for y in ys if y <= ytop + 1e-9))
        self.bottom_round = bottom_round
        self.level_ys = ys

    # parameters at height y -> a, zf, zb, e
    def params(self, y):
        k = self.k
        a = np.interp(y, k[:, 0], k[:, 1])
        zf = np.interp(y, k[:, 0], k[:, 2])
        zb = np.interp(y, k[:, 0], k[:, 3])
        e = np.interp(y, k[:, 0], k[:, 4])
        r = self.roof_r
        y_arc = self.ytop - r
        if np.ndim(y) == 0:
            if y > y_arc:
                s = r * (1 - np.sqrt(max(1 - ((min(y, self.ytop) - y_arc) / r) ** 2, 0.0)))
                a, zf, zb = a - s, zf - s, zb - s
        else:
            yy = np.asarray(y)
            s = np.where(yy > y_arc, r * (1 - np.sqrt(np.clip(1 - ((np.minimum(yy, self.ytop) - y_arc) / r) ** 2, 0, 1))), 0.0)
            a, zf, zb = a - s, zf - s, zb - s
        return a, zf, zb, e

    # ---- surface projections (u, v) -> xyz
    def side(self, sign: int):
        def f(z, y):
            a, zf, zb, e = self.params(y)
            zh = zf if z >= 0 else zb
            q = min(abs(z) / zh, 1.0)
            return np.array([sign * a * (1 - q**e) ** (1.0 / e), y, z])

        return f

    def front(self, x, y):
        a, zf, zb, e = self.params(y)
        q = min(abs(x) / a, 1.0)
        return np.array([x, y, zf * (1 - q**e) ** (1.0 / e)])

    def back(self, x, y):
        a, zf, zb, e = self.params(y)
        q = min(abs(x) / a, 1.0)
        return np.array([x, y, -zb * (1 - q**e) ** (1.0 / e)])

    def roof_y(self, x, z):
        a, zf, zb, e = self.params(self.ytop)
        zh = zf if z >= 0 else zb
        s = (abs(x / a) ** e + abs(z / zh) ** e) ** (1.0 / e)
        return self.ytop + self.crown * (1 - min(s, 1.0) ** 2)

    def outline(self, y, t):
        a, zf, zb, e = self.params(y)
        c, s = np.cos(t), np.sin(t)
        zh = np.where(s >= 0, zf, zb)
        return np.stack([a * sgnpow(c, 2.0 / e), np.full_like(t, y), zh * sgnpow(s, 2.0 / e)], axis=1)

    def build(self, sides: int = 64, color_fn=None, cap_rings=(0.8, 0.55, 0.3), seams=(), seam_colors=None) -> Mesh:
        """Return the shell. `color_fn(y, pts)` -> (n,3) linear colours; `seams` = y heights at which a hard colour break
        (duplicated ring) is inserted, `seam_colors` = (below_fn, above_fn)."""
        # arc-length uniform angle samples taken from a mid-height reference outline
        tt = np.linspace(0, 2 * np.pi, 2000, endpoint=False)
        ref = self.outline(0.5, tt)
        seg = np.linalg.norm(np.diff(np.r_[ref, ref[:1]], axis=0)[:, [0, 2]], axis=1)
        cum = np.r_[0, np.cumsum(seg)]
        want = np.linspace(0, cum[-1], sides, endpoint=False) + cum[-1] / sides * 0.5
        t = np.interp(want, cum, np.r_[tt, 2 * np.pi])
        levels = []  # (y, band) band: 0 normal, -1 below seam, +1 above seam
        for y in self.level_ys:
            levels.append((y, 0))
        for sy in seams:
            levels = [l for l in levels if abs(l[0] - sy) > 1e-6]
            levels += [(sy, -1), (sy, +1)]
        levels.sort(key=lambda l: (l[0], l[1]))
        # bottom rounding: first ring is inset
        rings, cols, keep = [], [], []
        br = self.bottom_round
        y_first = levels[0][0]
        base_ring = self.outline(y_first, t)
        inset = base_ring.copy()
        c0 = np.array([0, 0, 0.0])
        d = base_ring - np.array([0, y_first, 0])
        d[:, 1] = 0
        inset = base_ring - normalize(d) * br
        inset[:, 1] = y_first - br
        rings.append(inset)
        keep.append(True)
        bands = [0]
        for (y, band) in levels:
            rings.append(self.outline(y, t))
            bands.append(band)
        # faces between consecutive rings except across a seam pair
        V = np.concatenate(rings)
        n = sides
        faces = []
        for i in range(len(rings) - 1):
            if bands[i] == -1 and bands[i + 1] == +1:
                continue
            for j in range(n):
                j2 = (j + 1) % n
                a, b, c, d2 = i * n + j, i * n + j2, (i + 1) * n + j, (i + 1) * n + j2
                faces += [(a, c, b), (b, c, d2)]
        nv = len(rings) * n
        extra_v = []
        # roof cap rings
        top = rings[-1]
        ctop = np.array([0.0, top[:, 1].mean(), 0.0])
        prev = (len(rings) - 1) * n
        ytop = top[0, 1]
        capcols = []
        for s in list(cap_rings) + [0.0]:
            if s > 0:
                pts = top.copy()
                pts[:, 0] *= s
                pts[:, 2] *= s
                pts[:, 1] = ytop + self.crown * (1 - s**2)
                extra_v.append(pts)
                cur = nv
                for j in range(n):
                    j2 = (j + 1) % n
                    faces += [(prev + j, cur + j, prev + j2), (prev + j2, cur + j, cur + j2)]
                prev = cur
                nv += n
            else:
                apex = np.array([[0.0, ytop + self.crown, 0.0]])
                extra_v.append(apex)
                for j in range(n):
                    faces.append((prev + j, nv, prev + (j + 1) % n))
                nv += 1
        V = np.concatenate([V] + extra_v)
        m = Mesh(V, np.array(faces))
        # colours
        col = np.ones((len(V), 4))
        if color_fn is not None:
            for i, ring in enumerate(rings):
                y = ring[0, 1]
                b = bands[i]
                if i == 0:
                    col[i * n:(i + 1) * n, :3] = color_fn(y, ring, 0)
                else:
                    col[i * n:(i + 1) * n, :3] = color_fn(y, ring, b)
            ex = len(rings) * n
            for pts in extra_v:
                col[ex:ex + len(pts), :3] = color_fn(ytop, pts, +1 if seams else 0)
                ex += len(pts)
        m.c = col
        ymid = 0.5 * (levels[0][0] + self.ytop)
        orient_faces(m, lambda c: np.stack([np.zeros(len(c)), np.full(len(c), ymid), np.zeros(len(c))], axis=1))
        return m


# ----------------------------------------------------------------------------- wheels


def make_tyre(R: float, W: float, rim_r: float, sides: int = 22, tread_depth: float = 0.008) -> Mesh:
    """Tyre about local X (outward +X): rounded sidewalls and a blocky staggered tread. Open at the bead (rim covers it)."""
    hw = W / 2
    prof = [
        (rim_r * 1.0, -hw * 0.9),
        (rim_r + (R - rim_r) * 0.55, -hw * 1.0),
        (R - tread_depth * 0.8, -hw * 0.74),
        (R, -hw * 0.42),
        (R, 0.0),
        (R, hw * 0.42),
        (R - tread_depth * 0.8, hw * 0.74),
        (rim_r + (R - rim_r) * 0.55, hw * 1.0),
        (rim_r * 1.0, hw * 0.9),
    ]
    th = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    Vv = []
    for i, (rho, w) in enumerate(prof):
        for j, a in enumerate(th):
            r = rho
            if i in (3, 4, 5):
                phase = (j + (1 if i == 4 else 0)) % 2
                r = rho - tread_depth * (1.0 if phase else 0.0)
            Vv.append((w, r * np.sin(a), r * np.cos(a)))
    m = Mesh(np.array(Vv), grid_faces(len(prof), sides, closed_u=True))
    rc = (R + rim_r) * 0.5

    def core(c):
        d = np.hypot(c[:, 1], c[:, 2])
        k = rc / np.maximum(d, 1e-9)
        return np.stack([np.zeros(len(c)), c[:, 1] * k, c[:, 2] * k], axis=1)

    return orient_faces(m, core)


def make_rim(R_rim: float, W: float, sides: int = 14, lugs: int = 5, spokes: bool = False) -> tuple[Mesh, Mesh, Mesh | None]:
    """(steel dished disc + barrel, chrome hub cap + lug nuts, None) about local X, outward +X."""
    hw = W / 2
    prof = [(R_rim * 1.02, -hw * 0.70), (R_rim * 1.02, hw * 0.80), (R_rim * 0.90, hw * 0.88), (R_rim * 0.82, hw * 0.60), (R_rim * 0.26, hw * 0.56), (0.0, hw * 0.62)]
    steel = _orient(lathe(prof, sides), "x", (0, 0, 0))
    cap = _orient(lathe([(R_rim * 0.27, hw * 0.60), (R_rim * 0.24, hw * 0.80), (R_rim * 0.13, hw * 0.95), (0.0, hw * 1.0)], 10), "x", (0, 0, 0))
    parts = [cap]
    for i in range(lugs):
        a = 2 * np.pi * i / lugs + 0.3
        c = (hw * 0.70, R_rim * 0.56 * np.sin(a), R_rim * 0.56 * np.cos(a))
        parts.append(cylinder(c, R_rim * 0.085, hw * 0.30, sides=4, axis="x", caps=True))
    return steel, merge(parts), None


def mirror_for_side(m: Mesh, sign: int) -> Mesh:
    return m if sign > 0 else place(m, scale=(-1, 1, 1))


# ----------------------------------------------------------------------------- decal atlas


class Atlas:
    """Shelf-packed decal atlas. Add cells with draw callbacks, call `build()`, then use `rect(name)` for quad/patch UVs."""

    def __init__(self, size: int = 512, seed: int = 5) -> None:
        self.size = size
        self.cells: list[tuple[str, int, int, object]] = []
        self.rects: dict[str, tuple] = {}
        self.rng = np.random.default_rng(seed)
        self.tex: texlib.Tex | None = None

    def cell(self, name: str, w: int, h: int, draw) -> None:
        self.cells.append((name, w, h, draw))

    def build(self) -> texlib.Tex:
        S = self.size
        img = Image.new("RGB", (S, S), (8, 8, 9))
        x = y = rowh = 0
        pad = 2
        for name, w, h, draw in self.cells:
            if x + w + pad > S:
                x, y, rowh = 0, y + rowh + pad, 0
            if y + h > S:
                raise RuntimeError(f"atlas overflow at {name}")
            tile = Image.new("RGB", (w, h))
            draw(tile, ImageDraw.Draw(tile), self.rng)
            img.paste(tile, (x, y))
            # edge bleed so bilinear filtering never picks neighbours
            self.rects[name] = ((x + 0.5) / S, 1 - (y + h - 0.5) / S, (x + w - 0.5) / S, 1 - (y + 0.5) / S)
            x += w + pad
            rowh = max(rowh, h)
        arr = np.asarray(img, dtype=np.float64) / 255.0
        lum = arr.mean(axis=2)
        h_ = 0.5 + 0.12 * (lum - lum.mean())
        self.tex = texlib.Tex(arr, h_, np.full((S, S), 0.62), normal_strength=0.4)
        return self.tex

    def rect(self, name: str) -> tuple:
        return self.rects[name]


def font(size: int, path: str = FONT_BOLD):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def hand_text(draw: ImageDraw.ImageDraw, rng, text: str, box, fill, size: int, path: str = FONT_BOLD, jitter: float = 1.0, tracking: float = 0.0, tilt: float = 0.0):
    """Hand-painted look: per-letter baseline/size jitter and tiny rotation. box = (x0, y0, x1, y1); text is centred."""
    f0 = font(size, path)
    x0, y0, x1, y1 = box
    widths = [draw.textlength(ch, font=f0) + tracking for ch in text]
    total = sum(widths)
    x = x0 + (x1 - x0 - total) / 2
    cy = (y0 + y1) / 2
    for ch, w in zip(text, widths):
        fs = max(6, int(size * (1 + 0.05 * jitter * rng.normal())))
        f = font(fs, path)
        dy = jitter * rng.normal() * size * 0.03 + tilt * (x - (x0 + x1) / 2) / max(x1 - x0, 1)
        draw.text((x + w / 2, cy + dy), ch, font=f, fill=fill, anchor="mm")
        x += w


GENERATORS_EXTRA: dict = {}


def register_generator(name: str, tex: texlib.Tex) -> None:
    """Make `Spec(texture=name)` resolve to a pre-built Tex (the Model exporter looks names up in tex.GENERATORS)."""
    GENERATORS_EXTRA[name] = tex
    texlib.GENERATORS[name] = lambda **_kw: tex


def finish(mesh: Mesh, colour=None, ao=None, dirt: float = 0.0, seed: int = 0, ao_h=(0.0, 0.3)) -> Mesh:
    if colour is not None:
        paint(mesh, colour)
    if ao is not None:
        k = 1.0 - ao * np.clip((ao_h[1] - mesh.v[:, 1]) / max(ao_h[1] - ao_h[0], 1e-6), 0, 1)
        mesh.c[:, :3] *= k[:, None]
    if dirt > 0:
        n = value_noise(mesh.v, 11.0, seed)
        mesh.c[:, :3] *= (1.0 - dirt * (0.5 - 0.5 * n))[:, None]
    return mesh


# ----------------------------------------------------------------------------- convex polygon helpers (trapezoid windows etc.)


def fillet_poly(corners, r: float, n_arc: int = 4, spacing: float | None = None) -> np.ndarray:
    """Round the corners of a convex CCW polygon (list of (u, v)) with radius `r`; optionally densify the edges."""
    c = np.asarray(corners, dtype=np.float64)
    k = len(c)
    out = []
    for i in range(k):
        p, a, b = c[i], c[i - 1], c[(i + 1) % k]
        e1, e2 = normalize(a - p), normalize(b - p)
        ang = np.arccos(np.clip(np.dot(e1, e2), -1, 1))
        t = min(r / max(np.tan(ang / 2), 1e-6), 0.45 * np.linalg.norm(a - p), 0.45 * np.linalg.norm(b - p))
        p0, p1 = p + e1 * t, p + e2 * t
        for j in range(n_arc):
            s = j / (n_arc - 1)
            out.append((1 - s) ** 2 * p0 + 2 * s * (1 - s) * p + s**2 * p1)
    out = np.array(out)
    if spacing is None:
        return out
    dense = []
    for i in range(len(out)):
        a, b = out[i], out[(i + 1) % len(out)]
        m = max(1, int(np.ceil(np.linalg.norm(b - a) / spacing)))
        for j in range(m):
            dense.append(a + (b - a) * j / m)
    return np.array(dense)


def offset_poly(poly, d: float) -> np.ndarray:
    """Offset a convex CCW polygon outward by `d` (negative = inward) using averaged vertex normals."""
    p = np.asarray(poly, dtype=np.float64)
    k = len(p)
    out = np.zeros_like(p)
    for i in range(k):
        t1 = normalize(p[i] - p[i - 1])
        t2 = normalize(p[(i + 1) % k] - p[i])
        n1, n2 = np.array([t1[1], -t1[0]]), np.array([t2[1], -t2[0]])
        nb = normalize(n1 + n2)
        out[i] = p[i] + nb * d / max(np.dot(nb, n1), 0.3)
    return out


def ring_strip(project, outer_uv, inner_uv, off: float, ref_fn=None) -> Mesh:
    """Band between two index-paired closed outlines laid on a surface (window gasket)."""
    ref_fn = ref_fn or axis_ref
    rows = []
    for ring in (outer_uv, inner_uv):
        P = []
        for u, v in ring:
            p = project(u, v)
            n = surface_normal(project, u, v)
            if np.dot(n, ref_fn(p[None])[0] - p) > 0:
                n = -n
            P.append(p + n * off)
        rows.append(P)
    P = np.array(rows)
    m = Mesh(P.reshape(-1, 3), grid_faces(2, len(outer_uv), closed_u=True))
    return orient_faces(m, ref_fn)


# ----------------------------------------------------------------------------- loft along Z (tanks, seats, fuselages)


def loft_z(rings, sides: int = 16, e: float = 2.4, round_ends: int = 3) -> Mesh:
    """Closed lofted solid along Z from rings (z, cx, cy, rx, ry_top, ry_bot). Both ends get rounded tapers + a cap."""
    rg = [tuple(r) for r in rings]
    if round_ends:
        def taper(ring, outward_sign):
            out = []
            rmax = max(ring[3], ring[4], ring[5])
            for k in range(1, round_ends + 1):
                ang = (k / (round_ends + 0.6)) * (np.pi / 2)
                sc = np.cos(ang)
                out.append((ring[0] + outward_sign * 0.75 * rmax * np.sin(ang), ring[1], ring[2], ring[3] * sc, ring[4] * sc, ring[5] * sc))
            return out

        s0 = np.sign(rg[0][0] - rg[1][0]) or -1.0
        s1 = np.sign(rg[-1][0] - rg[-2][0]) or 1.0
        rg = taper(rg[0], s0)[::-1] + rg + taper(rg[-1], s1)
    th = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    c, s_ = np.cos(th), np.sin(th)
    ex = 2.0 / e
    pts = []
    for (z, cx, cy, rx, rt, rb) in rg:
        x = cx + rx * sgnpow(c, ex)
        y = cy + np.where(s_ >= 0, rt, rb) * sgnpow(s_, ex)
        pts.append(np.stack([x, y, np.full(sides, z)], axis=1))
    P = np.array(pts)
    verts = [P.reshape(-1, 3)]
    faces = [grid_faces(len(rg), sides, closed_u=True)]
    nv = len(verts[0])
    for ring_i in (0, len(rg) - 1):
        verts.append(P[ring_i].mean(axis=0)[None])
        ci = nv
        nv += 1
        faces.append(np.array([(ring_i * sides + j, ring_i * sides + (j + 1) % sides, ci) for j in range(sides)]))
    m = Mesh(np.concatenate(verts), np.concatenate(faces))
    cen = m.v.mean(axis=0)
    return orient_faces(m, lambda c_: np.broadcast_to(cen, c_.shape).copy())


def spoked_wheel(R: float, W: float, rim_r: float, hub_r: float = 0.028, spokes: int = 14, sides: int = 20, tread_depth: float = 0.006):
    """(tyre, steel rim+spokes, chrome hub) about local X for motorcycles."""
    tyre = make_tyre(R, W, rim_r, sides, tread_depth)
    hw = W * 0.5
    rim = lathe([(rim_r + 0.002, -hw * 0.55), (rim_r - 0.006, -hw * 0.55), (rim_r - 0.010, -hw * 0.30), (rim_r - 0.006, hw * 0.55), (rim_r + 0.002, hw * 0.55)], sides)
    rim = _orient(rim, "x", (0, 0, 0))
    parts = [rim]
    for i in range(spokes):
        a = 2 * np.pi * i / spokes
        side = 1 if i % 2 == 0 else -1
        p0 = np.array([side * hub_r * 0.55, hub_r * 0.9 * np.sin(a + 0.15 * side), hub_r * 0.9 * np.cos(a + 0.15 * side)])
        p1 = np.array([0.0, (rim_r - 0.008) * np.sin(a), (rim_r - 0.008) * np.cos(a)])
        parts.append(strut(p0, p1, 0.0024, 3, caps=False))
    hub = merge([cylinder((0, 0, 0), hub_r, W * 0.7, sides=10, axis="x"), cylinder((hw * 0.4, 0, 0), hub_r * 1.25, 0.008, sides=10, axis="x"), cylinder((-hw * 0.4, 0, 0), hub_r * 1.25, 0.008, sides=10, axis="x")])
    return tyre, merge(parts), hub


def fillet_path(points, d: float, n: int = 4) -> np.ndarray:
    """Round the interior corners of a 3D polyline (tube frames): each corner becomes a quadratic arc of 'size' d."""
    p = np.asarray(points, dtype=np.float64)
    out = [p[0]]
    for i in range(1, len(p) - 1):
        a, b, c = p[i - 1], p[i], p[i + 1]
        da, dc = np.linalg.norm(a - b), np.linalg.norm(c - b)
        t = min(d, 0.48 * da, 0.48 * dc)
        p0 = b + normalize(a - b) * t
        p1 = b + normalize(c - b) * t
        for k in range(n):
            s = k / (n - 1)
            out.append((1 - s) ** 2 * p0 + 2 * s * (1 - s) * b + s**2 * p1)
    out.append(p[-1])
    return np.array(out)


def scale_model(m: Model, s: float) -> Model:
    """Uniformly scale every part (and node pivots) about the ground origin - used to land on the target footprint."""
    seen = {}
    for it in m.items:
        if id(it.mesh) not in seen:
            it.mesh = it.mesh.copy()
            it.mesh.v = it.mesh.v * s
            seen[id(it.mesh)] = True
        else:
            it.mesh = it.mesh.copy()
            it.mesh.v = it.mesh.v * s
        it.pivot = tuple(p * s for p in it.pivot)
    return m


# ----------------------------------------------------------------------------- v4 wheels (rounder, deeper)


def make_tyre_round(R: float, W: float, rim_r: float, sides: int = 18, tread_depth: float = 0.009) -> Mesh:
    """Tyre about local X (outward +X): bulged outer sidewall, bevelled shoulders and a staggered block tread.
    The inner side is kept minimal (it is hidden in the wheel arch)."""
    hw = W / 2
    s = R - rim_r
    prof = [
        (rim_r + s * 0.45, -hw * 1.0),
        (R - s * 0.14, -hw * 0.94),
        (R, -hw * 0.62),
        (R, -hw * 0.18),
        (R, hw * 0.18),
        (R, hw * 0.62),
        (R - s * 0.14, hw * 0.96),
        (rim_r + s * 0.58, hw * 1.05),
        (rim_r * 0.99, hw * 0.80),
    ]
    th = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    Vv = []
    for i, (rho, w) in enumerate(prof):
        for j, a in enumerate(th):
            r = rho
            if i in (2, 3, 4, 5):
                phase = (j + (1 if i in (3, 4) else 0)) % 2
                r = rho - tread_depth * (1.0 if phase else 0.0)
            Vv.append((w, r * np.sin(a), r * np.cos(a)))
    m = Mesh(np.array(Vv), grid_faces(len(prof), sides, closed_u=True))
    rc = (R + rim_r) * 0.5

    def core(c):
        d = np.hypot(c[:, 1], c[:, 2])
        k = rc / np.maximum(d, 1e-9)
        return np.stack([np.zeros(len(c)), c[:, 1] * k, c[:, 2] * k], axis=1)

    return orient_faces(m, core)


def make_rim_dished(R_rim: float, W: float, sides: int = 28, lugs: int = 5, vents: int = 6) -> tuple[Mesh, Mesh, Mesh]:
    """(dished steel rim, chrome hubcap + lug nuts, dark vent holes) about local X, outward +X.

    The rim face sits well inside the tyre's sidewall so the wheel reads as deep, with a bright rolled lip."""
    hw = W / 2
    prof = [
        (R_rim * 1.00, -hw * 0.40),
        (R_rim * 1.00, hw * 0.62),
        (R_rim * 1.05, hw * 0.70),  # rolled lip
        (R_rim * 0.90, hw * 0.62),  # dish wall
        (R_rim * 0.74, hw * 0.24),
        (R_rim * 0.40, hw * 0.30),  # dish face
        (0.0, hw * 0.36),
    ]
    rim = _orient(lathe(prof, sides), "x", (0, 0, 0))
    rim = orient_faces(rim, lambda c: np.stack([c[:, 0] - 1.0, c[:, 1] * 0.0, c[:, 2] * 0.0], axis=1))
    cap = _orient(lathe([(R_rim * 0.40, hw * 0.34), (R_rim * 0.36, hw * 0.56), (R_rim * 0.22, hw * 0.72), (0.0, hw * 0.79)], 10), "x", (0, 0, 0))
    cap = orient_faces(cap, lambda c: np.stack([c[:, 0] - 1.0, c[:, 1] * 0.0, c[:, 2] * 0.0], axis=1))
    parts = [cap]
    for i in range(lugs):
        a = 2 * np.pi * i / lugs + 0.3
        c = (hw * 0.30, R_rim * 0.52 * np.sin(a), R_rim * 0.52 * np.cos(a))
        parts.append(cylinder(c, R_rim * 0.07, hw * 0.16, sides=5, axis="x", caps=True))
    holes = []
    for i in range(vents):
        a = 2 * np.pi * (i + 0.5) / vents
        c = (hw * 0.245, R_rim * 0.63 * np.sin(a), R_rim * 0.63 * np.cos(a))
        t = np.linspace(0, 2 * np.pi, 7, endpoint=False)
        ring = np.stack([np.full(7, c[0]), c[1] + R_rim * 0.09 * np.sin(t), c[2] + R_rim * 0.09 * np.cos(t)], axis=1)
        disc = Mesh(np.vstack([ring, [c]]), np.array([(k, (k + 1) % 7, 7) for k in range(7)]))
        holes.append(orient_faces(disc, lambda q: q - np.array([1.0, 0.0, 0.0])))
    return rim, merge(parts), merge(holes)
