"""Environment kit: extra geometry helpers, atlas UV projection and a GLB exporter for baked single-atlas props.

Built on prim.py / loft.py / gltfio.py (which stay untouched).  The idea used for every environment asset:

* geometry carries the big forms (bevels, chamfers, slats, tyre treads ...)
* ONE painted atlas per model (albedo + height->normal + roughness/metal) carries the surface detail
  (posters, hazard bands, grime, wood grain, stencils ...), unwrapped by `box_uv` / `cyl_uv` below
* vertex colours add ground-contact darkening and per-instance tint

Conventions: Y-up, metres, front = +Z, origin on the ground at the footprint centre.
UV rectangles are `(u0, v0, u1, v1)` with v pointing UP (image bottom = 0); see `px_rect`.
"""
from __future__ import annotations

import io
import os
import sys
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFile

ImageFile.MAXBLOCK = 1 << 26  # JPEG optimize=True needs a big encoder buffer

sys.path.insert(0, os.path.dirname(__file__))

import tex as texlib  # noqa: E402
from gltfio import GltfBuilder, Material  # noqa: E402
from loft import Mesh, merge, normalize, value_noise  # noqa: E402,F401
from prim import (  # noqa: E402,F401
    Model,
    bevel_box,
    colorize,
    cylinder,
    grime,
    lathe,
    outward,
    place,
    prism,
    rot_matrix,
    tint_by_height,
    torus,
)

OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets", "models"))


# ============================================================================ geometry


def flat_box(size, center=(0, 0, 0)) -> Mesh:
    """Plain 12-triangle box (no bevel)."""
    sx, sy, sz = (np.asarray(size, dtype=np.float64) / 2.0)
    v = np.array([(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]) + np.asarray(center)
    f = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 4, 7), (0, 7, 3), (1, 2, 6), (1, 6, 5), (3, 7, 6), (3, 6, 2), (0, 1, 5), (0, 5, 4)]
    return outward(Mesh(v, np.array(f)))


def obox(center, size, rot=(0, 0, 0), bevel: float = 0.0, seg: int = 1) -> Mesh:
    """Box at `center`, rotated (degrees XYZ) about its own centre; optional rounded edges."""
    m = bevel_box((0, 0, 0), size, bevel, seg) if bevel > 0 else flat_box(size)
    return place(m, center, rot)


def rot_to(direction) -> np.ndarray:
    """3x3 rotation taking +Y to `direction`."""
    d = normalize(np.asarray(direction, dtype=np.float64))
    y = np.array([0.0, 1.0, 0.0])
    c = float(y @ d)
    if c > 0.999999:
        return np.eye(3)
    if c < -0.999999:
        return np.diag([1.0, -1.0, -1.0])
    axis = np.cross(y, d)
    s = np.linalg.norm(axis)
    k = axis / s
    kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + kx * s + kx @ kx * (1 - c)


def rod(p0, p1, r: float, sides: int = 8, r2: float | None = None, caps: bool = True) -> Mesh:
    """Cylinder/frustum between two points."""
    p0, p1 = np.asarray(p0, dtype=np.float64), np.asarray(p1, dtype=np.float64)
    length = float(np.linalg.norm(p1 - p0))
    m = cylinder((0, 0, 0), r, length, sides, radius2=r2, caps=caps)
    m.v = m.v @ rot_to(p1 - p0).T + (p0 + p1) / 2
    return m


def beam(p0, p1, w: float, h: float, up=(0, 1, 0), bevel: float = 0.0) -> Mesh:
    """Box of cross-section (h along `up`, w sideways) running from p0 to p1."""
    p0, p1 = np.asarray(p0, dtype=np.float64), np.asarray(p1, dtype=np.float64)
    ax = normalize(p1 - p0)
    upv = np.asarray(up, dtype=np.float64)
    ay = normalize(upv - ax * (upv @ ax))
    az = np.cross(ax, ay)
    length = float(np.linalg.norm(p1 - p0))
    m = bevel_box((0, 0, 0), (length, h, w), bevel, 1) if bevel > 0 else flat_box((length, h, w))
    basis = np.stack([ax, ay, az], axis=1)
    m.v = m.v @ basis.T + (p0 + p1) / 2
    return m


def inset_poly(poly, c: float) -> np.ndarray:
    """Inset a convex polygon (list of (x,z)) by distance c (positive = inwards)."""
    p = np.asarray(poly, dtype=np.float64)
    n = len(p)
    area = 0.5 * sum(p[i, 0] * p[(i + 1) % n, 1] - p[(i + 1) % n, 0] * p[i, 1] for i in range(n))
    sgn = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        a, b, d = p[i - 1], p[i], p[(i + 1) % n]
        e1, e2 = normalize(b - a), normalize(d - b)
        n1 = sgn * np.array([-e1[1], e1[0]])
        n2 = sgn * np.array([-e2[1], e2[0]])
        k = 1.0 + float(n1 @ n2)
        out.append(b + c * (n1 + n2) / max(k, 0.2))
    return np.array(out)


def chamfer_prism(poly, y0: float, y1: float, cb: float = 0.0, ct: float = 0.0, cb_h: float | None = None, ct_h: float | None = None) -> Mesh:
    """Extruded convex polygon with a bevelled bottom (`cb` inset over height `cb_h`) and top (`ct` / `ct_h`)."""
    cb_h = cb if cb_h is None else cb_h
    ct_h = ct if ct_h is None else ct_h
    rings = []
    rings.append((cb, y0))
    if cb > 0:
        rings.append((0.0, y0 + cb_h))
    if ct > 0:
        rings.append((0.0, y1 - ct_h))
    rings.append((ct, y1))
    poly = np.asarray(poly, dtype=np.float64)
    n = len(poly)
    verts, faces = [], []
    for inset, y in rings:
        pp = inset_poly(poly, inset) if inset > 0 else poly
        verts += [(x, y, z) for x, z in pp]
    for r in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            a, b, c, d = r * n + i, r * n + j, (r + 1) * n + j, (r + 1) * n + i
            faces += [(a, b, c), (a, c, d)]
    base_c = np.mean([v for v in verts[:n]], axis=0)
    top_c = np.mean([v for v in verts[-n:]], axis=0)
    bi, ti = len(verts), len(verts) + 1
    verts += [tuple(base_c), tuple(top_c)]
    for i in range(n):
        j = (i + 1) % n
        faces.append((bi, j, i))
        faces.append((ti, (len(rings) - 1) * n + i, (len(rings) - 1) * n + j))
    m = Mesh(np.array(verts), np.array(faces))
    t = m.v[m.f]
    fn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    if np.einsum("ij,ij->i", fn, t.mean(axis=1) - m.v.mean(axis=0)).sum() < 0:  # rare: reversed polygon order
        m.f = m.f[:, ::-1]
    return m


def extrude_x(poly_zy, x0: float, x1: float) -> Mesh:
    """Convex cross-section given as (z, y) points, extruded along X from x0 to x1 (flat ends)."""
    p = np.asarray(poly_zy, dtype=np.float64)
    n = len(p)
    verts = [(x0, y, z) for z, y in p] + [(x1, y, z) for z, y in p]
    cz, cy = p.mean(axis=0)
    verts += [(x0, cy, cz), (x1, cy, cz)]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces += [(i, j, n + j), (i, n + j, n + i)]
        faces += [(2 * n, j, i), (2 * n + 1, n + i, n + j)]
    m = Mesh(np.array(verts), np.array(faces))
    t = m.v[m.f]
    fn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    if np.einsum("ij,ij->i", fn, t.mean(axis=1) - m.v.mean(axis=0)).sum() < 0:
        m.f = m.f[:, ::-1]
    return m


def rect_poly(w: float, d: float, cx: float = 0.0, cz: float = 0.0):
    return [(cx - w / 2, cz - d / 2), (cx + w / 2, cz - d / 2), (cx + w / 2, cz + d / 2), (cx - w / 2, cz + d / 2)]


def polytube(path, radius, sides: int = 5, caps: bool = True) -> Mesh:
    """Round tube swept along a polyline (radius scalar or per-point list). Cheap cables/rails."""
    path = np.asarray(path, dtype=np.float64)
    k = len(path)
    rad = np.full(k, radius, dtype=np.float64) if np.isscalar(radius) else np.asarray(radius, dtype=np.float64)
    tang = np.zeros_like(path)
    tang[1:-1] = path[2:] - path[:-2]
    tang[0], tang[-1] = path[1] - path[0], path[-1] - path[-2]
    tang = normalize(tang)
    ref = np.array([0.0, 1.0, 0.0])
    if abs(tang[0] @ ref) > 0.95:
        ref = np.array([1.0, 0.0, 0.0])
    u = normalize(np.cross(tang[0], ref))
    verts = []
    ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    for i in range(k):
        if i > 0:  # parallel transport
            u = u - tang[i] * (u @ tang[i])
            u = normalize(u)
        v = np.cross(tang[i], u)
        for a in ang:
            verts.append(path[i] + rad[i] * (np.cos(a) * u + np.sin(a) * v))
    faces = []
    for i in range(k - 1):
        for j in range(sides):
            j2 = (j + 1) % sides
            a, b, c, d = i * sides + j, i * sides + j2, (i + 1) * sides + j2, (i + 1) * sides + j
            faces += [(a, c, b), (a, d, c)]
    if caps:
        c0, c1 = len(verts), len(verts) + 1
        verts += [tuple(path[0]), tuple(path[-1])]
        for j in range(sides):
            j2 = (j + 1) % sides
            faces.append((c0, j, j2))
            faces.append((c1, (k - 1) * sides + j2, (k - 1) * sides + j))
    m = Mesh(np.array(verts), np.array(faces))
    # make sure the winding points away from the axis
    t = m.v[m.f]
    fn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    cen = t.mean(axis=1)
    near = np.argmin(np.linalg.norm(cen[:, None, :] - path[None, :, :], axis=2), axis=1)
    if np.mean(np.einsum("ij,ij->i", fn, cen - path[near])) < 0:
        m.f = m.f[:, ::-1]
    return m


def sag_path(p0, p1, sag: float, n: int = 10, sway=(0.0, 0.0, 0.0)) -> np.ndarray:
    """Parabolic cable path between two points hanging down by `sag` at the middle (+ optional sideways sway)."""
    p0, p1 = np.asarray(p0, dtype=np.float64), np.asarray(p1, dtype=np.float64)
    t = np.linspace(0, 1, n)[:, None]
    pts = p0 + (p1 - p0) * t
    pts[:, 1] -= sag * 4 * t[:, 0] * (1 - t[:, 0])
    pts += np.asarray(sway) * (4 * t * (1 - t))
    return pts


def displace(m: Mesh, fn) -> Mesh:
    """Apply a vertex function (N,3)->(N,3) in place; returns m."""
    m.v = fn(m.v)
    return m


def noisy(m: Mesh, amount: float, scale: float = 6.0, seed: int = 0) -> Mesh:
    """Low-frequency 3D noise displacement (lumpy, slumped)."""
    out = m.copy()
    for k in range(3):
        out.v[:, k] += amount * value_noise(out.v, scale, seed * 3 + k)
    return out


def subdiv(m: Mesh, times: int = 1) -> Mesh:
    """Midpoint-subdivide triangles (no smoothing) so a coarse mesh can be deformed."""
    for _ in range(times):
        verts = list(map(tuple, m.v))
        cols = list(m.c)
        cache: dict = {}
        faces = []

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                cache[key] = len(verts)
                verts.append(tuple((m.v[a] + m.v[b]) / 2))
                cols.append((m.c[a] + m.c[b]) / 2)
            return cache[key]

        for a, b, c in m.f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            faces += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
        n = Mesh(np.array(verts), np.array(faces), np.array(cols))
        m = n
    return m


def jitter_rot(rng, deg: float):
    return tuple(rng.uniform(-deg, deg, 3))


def mirror_part(m: Mesh, axis: int = 0, offset: float = 0.0) -> Mesh:
    out = m.copy()
    out.v[:, axis] = 2 * offset - out.v[:, axis]
    out.f = out.f[:, ::-1]
    return out


# ============================================================================ vertex colours


def vc_mul(m: Mesh, rgb=(1, 1, 1), k: float = 1.0) -> Mesh:
    """Multiply vertex colours by an sRGB tint (0xRRGGBB or tuple) and scalar."""
    c = texlib.srgb(rgb)
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m.c[:, :3] *= lin * k
    return m


def vc_fn(m: Mesh, fn) -> Mesh:
    """Multiply vertex colours by fn(points)->(N,) scalar or (N,3)."""
    k = np.asarray(fn(m.v))
    m.c[:, :3] *= k[:, None] if k.ndim == 1 else k
    return m


def vc_ground(m: Mesh, h: float = 0.18, dark: float = 0.45, seed: int = 0, mud: float = 0.3) -> Mesh:
    """Darken (and dirty) vertices near the ground; irregular via noise."""
    n = 0.5 + 0.5 * value_noise(m.v * np.array([1.0, 0.4, 1.0]), 14.0, seed)
    k = np.clip(1.0 - m.v[:, 1] / (h * (0.7 + 0.6 * n)), 0, 1)
    m.c[:, :3] *= (1.0 - dark * k)[:, None] * (1.0 - 0.0 * mud)
    m.c[:, 0] *= 1.0 + 0.08 * mud * k
    return m


# ============================================================================ UV projection


def px_rect(size, x0: int, y0: int, x1: int, y1: int, pad: int = 3):
    """Pixel rect in an atlas (top-left origin, size = int or (w,h)) -> uv rect (u0, v0, u1, v1) with v up, inset by `pad` px."""
    w, h = (size, size) if np.isscalar(size) else size
    x0, y0, x1, y1 = x0 + pad, y0 + pad, x1 - pad, y1 - pad
    return (x0 / w, 1 - y1 / h, x1 / w, 1 - y0 / h)


def unweld(m: Mesh) -> Mesh:
    """Per-triangle-corner copy (each triangle owns its 3 vertices) so UVs can differ per face."""
    t = m.f.reshape(-1)
    out = Mesh(m.v[t], np.arange(len(t)).reshape(-1, 3), m.c[t].copy())
    out.along = m.along[t]
    out.region = [m.region[i] for i in t] if len(m.region) == len(m.v) else [""] * len(t)
    return out


def _face_axis(m: Mesh):
    tri = m.v[m.f]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    fn = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    ax = np.argmax(np.abs(fn), axis=1)
    sg = np.sign(fn[np.arange(len(fn)), ax])
    return ax, sg


def box_uv(m: Mesh, lo, hi, rects, swap: bool = False) -> Mesh:
    """Project every face of `m` onto atlas rectangles by its dominant normal axis.

    `lo`/`hi` are the bounds of the (virtual) box that maps to a full rect.  `rects` is either one rect (used for
    all faces) or a dict with keys '+x','-x','+y','-y','+z','-z' (missing keys fall back to key 'side', then 'any').
    Orientation is as seen from outside: +z faces u=x, v=y; +x faces u=-z; -x faces u=z; -z faces u=-x; +y faces
    u=x, v=-z (front edge at the bottom of the tile).  `swap` exchanges u and v (for wood grain direction)."""
    m = unweld(m)
    lo, hi = np.asarray(lo, dtype=np.float64), np.asarray(hi, dtype=np.float64)
    ext = np.maximum(hi - lo, 1e-9)
    ax, sg = _face_axis(m)
    uvs = np.zeros((len(m.f), 3, 2))
    pts = m.v[m.f]
    for fi in range(len(m.f)):
        a, s = int(ax[fi]), int(sg[fi])
        key = ("+" if s > 0 else "-") + "xyz"[a]
        if isinstance(rects, dict):
            r = rects.get(key) or rects.get("side" if a != 1 else "any") or rects.get("any")
        else:
            r = rects
        if r is None:
            r = (0, 0, 1, 1)
        p = (pts[fi] - lo) / ext
        if a == 2:
            u, v = (p[:, 0], p[:, 1]) if s > 0 else (1 - p[:, 0], p[:, 1])
        elif a == 0:
            u, v = (1 - p[:, 2], p[:, 1]) if s > 0 else (p[:, 2], p[:, 1])
        else:
            u, v = (p[:, 0], 1 - p[:, 2]) if s > 0 else (p[:, 0], p[:, 2])
        if swap:
            u, v = v, u
        uu = r[0] + np.clip(u, -0.2, 1.2) * (r[2] - r[0])
        vv = r[1] + np.clip(v, -0.2, 1.2) * (r[3] - r[1])
        uvs[fi, :, 0] = uu
        uvs[fi, :, 1] = 1 - vv
    m.uv = uvs.reshape(-1, 2)
    return m


def cyl_uv(m: Mesh, center, rect, axis: str = "y", v_range=(0.0, 1.0), u_repeat: float = 1.0, cap_rect=None, mirror: bool = True) -> Mesh:
    """Cylindrical projection around an axis through `center` (u = angle, mirrored so there is no seam; v = height).
    Faces that look along the axis (caps) use `cap_rect` planar mapping if given."""
    m = unweld(m)
    c = np.asarray(center, dtype=np.float64)
    ia = "xyz".index(axis)
    others = [i for i in range(3) if i != ia]
    rel = m.v - c
    ang = np.arctan2(rel[:, others[1]], rel[:, others[0]])  # -pi..pi
    t = (ang + np.pi) / (2 * np.pi)
    if mirror:  # triangle wave: continuous over the wrap, repeated u_repeat times around the circumference
        x = t * u_repeat
        u = 1 - np.abs(2 * (x - np.floor(x)) - 1)
    else:
        u = (t * u_repeat) % 1.0 if u_repeat != 1.0 else t
    v = (m.v[:, ia] - v_range[0]) / max(v_range[1] - v_range[0], 1e-9)
    uu = rect[0] + u * (rect[2] - rect[0])
    vv = rect[1] + np.clip(v, 0, 1) * (rect[3] - rect[1])
    uv = np.stack([uu, 1 - vv], axis=1)
    if not mirror:  # faces straddling the u wrap: clamp the wrapped corners (the seam is expected to be hidden)
        uf = uv[:, 0][m.f]
        bad = (uf.max(axis=1) - uf.min(axis=1)) > 0.5 * (rect[2] - rect[0])
        for fi in np.nonzero(bad)[0]:
            mid = rect[0] + 0.5 * (rect[2] - rect[0])
            for k in range(3):
                vi = m.f[fi, k]
                uv[vi, 0] = rect[0] if uv[vi, 0] < mid else rect[2]
    if cap_rect is not None:
        tri = m.v[m.f]
        fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        fn = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
        capf = np.abs(fn[:, ia]) > 0.8
        rad = np.max(np.linalg.norm(rel[:, others], axis=1)) + 1e-9
        for fi in np.nonzero(capf)[0]:
            for k in range(3):
                vi = m.f[fi, k]
                pu = 0.5 + 0.5 * rel[vi, others[0]] / rad
                pv = 0.5 + 0.5 * rel[vi, others[1]] / rad
                uv[vi] = (cap_rect[0] + pu * (cap_rect[2] - cap_rect[0]), 1 - (cap_rect[1] + pv * (cap_rect[3] - cap_rect[1])))
    m.uv = uv
    return m


def planar_uv(m: Mesh, rect, origin, u_axis, v_axis, size_u: float, size_v: float) -> Mesh:
    """Map all vertices with one plane projection into `rect` (u = (p-o).u_axis/size_u ...)."""
    m = unweld(m)
    o, ua, va = np.asarray(origin, dtype=np.float64), normalize(np.asarray(u_axis, dtype=np.float64)), normalize(np.asarray(v_axis, dtype=np.float64))
    rel = m.v - o
    u = np.clip(rel @ ua / size_u, -0.1, 1.1)
    v = np.clip(rel @ va / size_v, -0.1, 1.1)
    m.uv = np.stack([rect[0] + u * (rect[2] - rect[0]), 1 - (rect[1] + v * (rect[3] - rect[1]))], axis=1)
    return m


def flat_uv(m: Mesh, rect, uv=(0.5, 0.5)) -> Mesh:
    """Collapse every vertex of m to one point of an atlas rect (solid-colour parts)."""
    m = unweld(m)
    u = rect[0] + uv[0] * (rect[2] - rect[0])
    v = rect[1] + uv[1] * (rect[3] - rect[1])
    m.uv = np.tile([u, 1 - v], (len(m.v), 1))
    return m


def orient_from(m: Mesh, ref_fn) -> Mesh:
    """Flip individual faces so their normals point away from `ref_fn(centroids)` (an interior reference point per face)."""
    t = m.v[m.f]
    cen = t.mean(axis=1)
    fn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    flip = np.einsum("ij,ij->i", fn, cen - ref_fn(cen)) < 0
    f = m.f.copy()
    f[flip] = f[flip][:, ::-1]
    m.f = f
    return m


def lathe_mesh(profile, sides: int, rect, mirror: bool = True, u_repeat: float = 1.0, v_span=(0.0, 1.0), ref_fn=None, seam_fix: bool = True) -> Mesh:
    """Revolve a (radius, y) profile about Y into an *open* strip with atlas UVs (u = angle, v = profile arclength).
    `ref_fn` gives an interior point per face centroid for orientation (see `orient_from`)."""
    prof = np.asarray(profile, dtype=np.float64)
    m = lathe(prof, sides, closed_axis=False)
    arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(prof, axis=0), axis=1))]
    vv = v_span[0] + (arc / max(arc[-1], 1e-9)) * (v_span[1] - v_span[0])
    t = np.arange(sides) / sides
    if mirror:
        x = t * u_repeat
        uu = 1 - np.abs(2 * (x - np.floor(x)) - 1)
    else:
        uu = (t * u_repeat) % 1.0 if u_repeat != 1.0 else t
    U, V = np.meshgrid(uu, vv)
    m.uv = np.stack([rect[0] + U.reshape(-1) * (rect[2] - rect[0]), 1 - (rect[1] + V.reshape(-1) * (rect[3] - rect[1]))], axis=1)
    if ref_fn is not None:
        orient_from(m, ref_fn)
    return m


def close_tube_ends(m: Mesh, sides: int, rings: int) -> Mesh:
    """For a loft.tube(...) built with cap_start=cap_end=False: fan-close both end rings (cheap flat caps)."""
    v = list(map(tuple, m.v))
    f = [tuple(x) for x in m.f]
    c0 = m.v[:sides].mean(axis=0)
    c1 = m.v[(rings - 1) * sides : rings * sides].mean(axis=0)
    i0, i1 = len(v), len(v) + 1
    v += [tuple(c0), tuple(c1)]
    for j in range(sides):
        j2 = (j + 1) % sides
        f.append((i0, j2, j))
        f.append((i1, (rings - 1) * sides + j, (rings - 1) * sides + j2))
    out = Mesh(np.array(v), np.array(f))
    return outward(out)


# ============================================================================ materials + export


@dataclass
class Mat:
    albedo: np.ndarray  # (H,W,3) float 0..1 sRGB
    height: np.ndarray | None = None  # (H,W) 0..1 -> normal map
    rough: np.ndarray | float = 0.85
    metal: np.ndarray | float = 0.0
    normal_strength: float = 1.2
    emissive: tuple | None = None
    emissive_strength: float = 1.0
    double_sided: bool = False
    jpeg_q: int = 84


def _jpeg(arr: np.ndarray, q: int, subsampling: int | None = None) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=q, subsampling=(0 if q >= 80 else 2) if subsampling is None else subsampling, optimize=True)
    return buf.getvalue()


def normal_map(h: np.ndarray, strength: float) -> np.ndarray:
    p = np.pad(h, 1, mode="edge")
    dx = (p[1:-1, 2:] - p[1:-1, :-2]) * 0.5
    dy = (p[2:, 1:-1] - p[:-2, 1:-1]) * 0.5
    k = strength * max(h.shape) * 0.04
    nx, ny = -dx * k, dy * k
    nz = np.ones_like(nx)
    ln = np.sqrt(nx**2 + ny**2 + nz**2)
    n = np.stack([nx / ln, ny / ln, nz / ln], axis=-1)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def smooth_prim(m: Mesh, smooth_deg: float, material_id: int) -> dict:
    """glTF primitive from a mesh: crease-angle shading normals computed over *welded positions* (so unwelded UV
    meshes still shade smoothly), per-corner colours and UVs."""
    f = m.f
    tri = m.v[f]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = np.linalg.norm(fn, axis=1)
    ok = area > 1e-12
    f, tri, fn, area = f[ok], tri[ok], fn[ok], area[ok]
    fnu = fn / area[:, None]
    T = len(f)
    pos = tri.reshape(-1, 3)
    key = np.round(pos / 1e-5).astype(np.int64)
    _, wid = np.unique(key, axis=0, return_inverse=True)
    wid = wid.reshape(-1)
    face_of = np.repeat(np.arange(T), 3)
    order = np.argsort(wid, kind="stable")
    cos_t = np.cos(np.radians(smooth_deg))
    nrm = np.zeros((T * 3, 3))
    bounds = np.r_[0, np.nonzero(np.diff(wid[order]))[0] + 1, T * 3]
    for s, e in zip(bounds[:-1], bounds[1:]):
        corners = order[s:e]
        faces = face_of[corners]
        fu = fnu[faces]
        dots = fu @ fu.T
        wmat = (dots >= cos_t) * area[faces][None, :]
        acc = wmat @ fu
        acc /= np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-12)
        nrm[corners] = acc
    col = m.c[f].reshape(-1, 4)
    # UVs are stored per vertex index (unwelded meshes: one vertex per triangle corner)
    uv = m.uv[f].reshape(-1, 2) if m.uv is not None else np.zeros((len(pos), 2))
    if np.isnan(uv).any():
        raise ValueError("part without UVs in an atlas model; call box_uv/cyl_uv/flat_uv on every part")
    k2 = np.concatenate([np.round(pos, 5), np.round(nrm, 3), np.round(col, 3), np.round(uv, 5)], axis=1)
    _, first, inv = np.unique(k2, axis=0, return_index=True, return_inverse=True)
    return dict(positions=pos[first], normals=nrm[first], colors=col[first], uvs=uv[first], indices=inv.reshape(-1, 3), material=material_id)


class EnvModel:
    """Collects (mesh, material-name) parts and writes a GLB. Every part needs UVs (box_uv/cyl_uv/...)."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.parts: list[tuple[Mesh, str, str | None, tuple]] = []

    def add(self, mesh, material: str = "main", node: str | None = None, pivot=(0, 0, 0)) -> "EnvModel":
        for m in mesh if isinstance(mesh, list) else [mesh]:
            self.parts.append((m, material, node, tuple(pivot)))
        return self

    def tri_count(self) -> int:
        return int(sum(len(p[0].f) for p in self.parts))

    def audit(self) -> list[str]:
        """Flag parts whose winding looks inverted (negative signed volume). Open strips (lathe walls, cables) can
        report false positives; closed solids must be positive."""
        bad = []
        for i, (m, mat, node, _) in enumerate(self.parts):
            t = m.v[m.f]
            vol = np.einsum("ij,ij->i", t[:, 0], np.cross(t[:, 1], t[:, 2])).sum() / 6.0
            # edge-manifold test: closed iff every undirected edge is shared by exactly two faces
            e = np.sort(np.concatenate([m.f[:, [0, 1]], m.f[:, [1, 2]], m.f[:, [2, 0]]]), axis=1)
            # weld coincident vertices before counting
            key = np.round(m.v / 1e-5).astype(np.int64)
            _, wid = np.unique(key, axis=0, return_inverse=True)
            we = np.sort(wid.reshape(-1)[e], axis=1)
            _, counts = np.unique(we, axis=0, return_counts=True)
            closed = bool(np.all(counts == 2))
            if closed and vol < -1e-9:
                bad.append(f"part {i} ({len(m.f)} tris) closed but inverted (vol={vol:.5f})")
        return bad

    def bounds(self):
        v = np.concatenate([p[0].v for p in self.parts])
        return v.min(axis=0), v.max(axis=0)

    def export(self, mats: dict[str, Mat], smooth_deg: float = 42.0, out_dir: str = OUT_DIR, quiet: bool = False) -> dict:
        g = GltfBuilder(f"WAHALA env tools / {self.name}")
        mat_ids: dict[str, int] = {}

        def material(name: str) -> int:
            if name in mat_ids:
                return mat_ids[name]
            s = mats[name]
            dump = os.environ.get("ENV_DUMP")
            if dump:
                os.makedirs(dump, exist_ok=True)
                Image.fromarray((np.clip(s.albedo, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(dump, f"{self.name}__{name}_albedo.png"))
            tex_i = g.add_texture(g.add_image(_jpeg((np.clip(s.albedo, 0, 1) * 255 + 0.5).astype(np.uint8), s.jpeg_q), "image/jpeg"))
            nrm_i = orm_i = None
            if s.height is not None:
                nrm_i = g.add_texture(g.add_image(_jpeg(normal_map(s.height, s.normal_strength), 72, 2), "image/jpeg"))
            rough_a, metal_a = np.asarray(s.rough, dtype=np.float64), np.asarray(s.metal, dtype=np.float64)
            flat = float(np.ptp(rough_a)) < 0.04 and float(np.ptp(metal_a)) < 0.02  # constant -> plain factors, no ORM image
            varying = not flat
            if flat:
                s = Mat(**{**s.__dict__, "rough": float(rough_a.mean()), "metal": float(metal_a.mean())})
            if varying:
                shape = s.albedo.shape[:2]
                r = np.broadcast_to(np.asarray(s.rough, dtype=np.float64), shape)
                mt = np.broadcast_to(np.asarray(s.metal, dtype=np.float64), shape)
                ao = np.ones(shape)
                orm_i = g.add_texture(g.add_image(_jpeg((np.stack([ao, r, mt], -1) * 255 + 0.5).astype(np.uint8), 88), "image/jpeg"))
            mat_ids[name] = g.add_material(
                Material(
                    name,
                    base_color=(1, 1, 1, 1),
                    metallic=1.0 if varying else float(s.metal),
                    roughness=1.0 if varying else float(s.rough),
                    emissive=s.emissive or (0, 0, 0),
                    emissive_strength=s.emissive_strength,
                    double_sided=s.double_sided,
                    texture=tex_i,
                    normal_texture=nrm_i,
                    orm_texture=orm_i,
                )
            )
            return mat_ids[name]

        groups: dict[str | None, list] = {}
        for p in self.parts:
            groups.setdefault(p[2], []).append(p)
        root = g.add_node(self.name)
        for node_name, items in groups.items():
            pivot = np.asarray(items[0][3])
            by_mat: dict[str, list[Mesh]] = {}
            for mesh, mname, _, _ in items:
                mm = mesh.copy()
                mm.v = mm.v - pivot
                by_mat.setdefault(mname, []).append(mm)
            prims = [smooth_prim(merge(ms), smooth_deg, material(mname)) for mname, ms in by_mat.items()]
            mesh_id = g.add_mesh(node_name or f"{self.name}_body", prims)
            if node_name is None:
                g.add_node(f"{self.name}_body", root, mesh=mesh_id)
            else:
                g.add_node(node_name, root, translation=tuple(pivot), mesh=mesh_id)
        path = os.path.join(out_dir, f"{self.name}.glb")
        os.makedirs(out_dir, exist_ok=True)
        size = g.save(path)
        lo, hi = self.bounds()
        if os.environ.get("ENV_AUDIT", "1") != "0":
            for line in self.audit():
                print(f"   AUDIT {self.name}: {line}")
        info = dict(name=self.name, tris=self.tri_count(), materials=len(mat_ids), kb=size // 1024, size=tuple(float(x) for x in np.round(hi - lo, 3)), lo=tuple(float(x) for x in np.round(lo, 3)), hi=tuple(float(x) for x in np.round(hi, 3)))
        if not quiet:
            print(f"{self.name}: {info['tris']} tris, {info['materials']} mat, {info['kb']} KB, size {info['size']} y[{lo[1]:.2f},{hi[1]:.2f}]")
        return info
