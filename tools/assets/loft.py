"""Numpy geometry helpers: lofted tubes, caps, normals and noise. No Blender needed."""
from __future__ import annotations

import numpy as np
from scipy.interpolate import CubicSpline, PchipInterpolator


def normalize(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


class Mesh:
    """A triangle mesh with optional per-vertex attributes. Parts are concatenated with `merge`."""

    def __init__(self, verts: np.ndarray, faces: np.ndarray, colors: np.ndarray | None = None, region: str = "", material: str = "") -> None:
        self.v = np.asarray(verts, dtype=np.float64)
        self.f = np.asarray(faces, dtype=np.int64)
        self.c = np.ones((len(self.v), 4)) if colors is None else np.asarray(colors, dtype=np.float64)
        self.region = [region] * len(self.v)
        self.material = material
        self.along = np.zeros(len(self.v))  # tube parameter 0..1 of each vertex (set by `tube`)
        self.uv: np.ndarray | None = None  # optional explicit per-vertex UVs (else the exporter box-projects)

    def copy(self) -> "Mesh":
        m = Mesh(self.v.copy(), self.f.copy(), self.c.copy(), "", self.material)
        m.region = list(self.region)
        m.along = self.along.copy()
        m.uv = None if self.uv is None else self.uv.copy()
        return m

    def set_color(self, rgb, a: float = 1.0) -> "Mesh":
        self.c[:] = [rgb[0], rgb[1], rgb[2], a]
        return self

    def transform(self, matrix: np.ndarray) -> "Mesh":
        self.v = (np.c_[self.v, np.ones(len(self.v))] @ matrix.T)[:, :3]
        return self

    def translate(self, t) -> "Mesh":
        self.v = self.v + np.asarray(t)
        return self

    def mirror_x(self) -> "Mesh":
        """Mirror across the YZ plane (flips winding)."""
        m = self.copy()
        m.v[:, 0] *= -1
        m.f = m.f[:, ::-1]
        return m


def merge(parts: list[Mesh], material: str | None = None) -> Mesh:
    verts, faces, cols, regions, off, alongs = [], [], [], [], 0, []
    for p in parts:
        verts.append(p.v)
        faces.append(p.f + off)
        cols.append(p.c)
        regions.extend(p.region)
        alongs.append(p.along)
        off += len(p.v)
    m = Mesh(np.concatenate(verts), np.concatenate(faces), np.concatenate(cols), "", material or parts[0].material)
    m.region = regions
    m.along = np.concatenate(alongs)
    if any(p.uv is not None for p in parts):
        m.uv = np.concatenate([p.uv if p.uv is not None else np.full((len(p.v), 2), np.nan) for p in parts])
    return m


def vertex_normals(v: np.ndarray, f: np.ndarray) -> np.ndarray:
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    n = np.zeros_like(v)
    for k in range(3):
        np.add.at(n, f[:, k], fn)
    return normalize(n)


def frame_for(direction: np.ndarray, hint=(0.0, 0.0, 1.0)) -> tuple[np.ndarray, np.ndarray]:
    """Two unit vectors u, v perpendicular to `direction` (u roughly along +X if direction is vertical)."""
    d = normalize(np.asarray(direction, dtype=np.float64))
    h = np.asarray(hint, dtype=np.float64)
    if abs(np.dot(d, h)) > 0.95:
        h = np.array([1.0, 0.0, 0.0])
    u = normalize(np.cross(h, d))  # for d = (0,-1,0) and hint +Z: u = +X
    v = normalize(np.cross(d, u))
    return u, v


def superellipse(n: int, exponent: float = 2.0) -> np.ndarray:
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    c, s = np.cos(t), np.sin(t)
    e = 2.0 / exponent
    return np.stack([np.sign(c) * np.abs(c) ** e, np.sign(s) * np.abs(s) ** e], axis=1)


def tube(path: np.ndarray, a: np.ndarray, b: np.ndarray, sides: int = 16, rings: int = 12, exponent: float = 2.0, front: np.ndarray | None = None, back: np.ndarray | None = None,
         cap_start: bool = True, cap_end: bool = True, hint=(0.0, 0.0, 1.0), offset_x: np.ndarray | None = None, ring_ts: np.ndarray | None = None) -> Mesh:
    """Loft a tube along `path` (K,3 control points) with per-control radii `a` (local u axis) and `b` (local v axis).

    `front`/`back` optionally replace `b` on the +v / -v halves to model asymmetric torsos. Caps are rounded
    domes so the result is closed. Control radii are interpolated with a monotone cubic (no overshoot).
    """
    path = np.asarray(path, dtype=np.float64)
    k = len(path)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    t = seg / seg[-1]
    ts = np.linspace(0, 1, rings) if ring_ts is None else np.asarray(ring_ts, dtype=np.float64)
    rings = len(ts)
    if k >= 3:
        centers = CubicSpline(t, path, bc_type="natural")(ts)
    else:
        centers = np.stack([np.interp(ts, t, path[:, i]) for i in range(3)], axis=1)

    def interp(vals, default=None):
        vals = np.asarray(vals if vals is not None else default, dtype=np.float64)
        if len(vals) == 1:
            return np.full(rings, vals[0])
        return PchipInterpolator(t, vals)(ts)

    A = interp(a)
    B = interp(b)
    F = interp(front, b) if front is not None else B
    Bk = interp(back, b) if back is not None else B
    ox = interp(offset_x, [0.0] * k) if offset_x is not None else np.zeros(rings)
    tang = np.gradient(centers, axis=0)
    unit = superellipse(sides, exponent)
    ring_pts = []
    for i in range(rings):
        u, v = frame_for(tang[i], hint)
        px = unit[:, 0] * A[i]
        py = np.where(unit[:, 1] >= 0, unit[:, 1] * F[i], unit[:, 1] * Bk[i])
        pts = centers[i][None] + px[:, None] * u[None] + py[:, None] * v[None] + (ox[i] * u)[None]
        ring_pts.append(pts)
    ring_pts = np.array(ring_pts)  # rings, sides, 3
    verts = [ring_pts.reshape(-1, 3)]
    faces = []
    for i in range(rings - 1):
        for j in range(sides):
            j2 = (j + 1) % sides
            a0, a1 = i * sides + j, i * sides + j2
            b0, b1 = (i + 1) * sides + j, (i + 1) * sides + j2
            faces.append((a0, b0, a1))
            faces.append((a1, b0, b1))
    nverts = rings * sides

    def dome(ring_index: int, direction: float, steps: int = 3):
        nonlocal nverts
        base = ring_pts[ring_index]
        c = base.mean(axis=0)
        tdir = normalize(tang[ring_index]) * direction
        radius = np.linalg.norm(base - c, axis=1).mean()
        prev = ring_index * sides
        for s in range(1, steps + 1):
            ang = (s / steps) * (np.pi / 2)
            shrink = np.cos(ang)
            lift = np.sin(ang) * radius * 0.9
            pts = c + (base - c) * shrink + tdir * lift
            verts.append(pts)
            cur = nverts
            for j in range(sides):
                j2 = (j + 1) % sides
                if direction > 0:
                    faces.append((prev + j, cur + j, prev + j2))
                    faces.append((prev + j2, cur + j, cur + j2))
                else:
                    faces.append((prev + j, prev + j2, cur + j))
                    faces.append((prev + j2, cur + j2, cur + j))
            prev = cur
            nverts += sides
        # close the apex
        apex = c + tdir * radius * 0.92
        verts.append(apex[None])
        ai = nverts
        nverts += 1
        for j in range(sides):
            j2 = (j + 1) % sides
            if direction > 0:
                faces.append((prev + j, ai, prev + j2))
            else:
                faces.append((prev + j, prev + j2, ai))

    if cap_end:
        dome(rings - 1, +1.0)
    if cap_start:
        dome(0, -1.0)
    # winding chosen so normals point outward (verified by signed volume in tests)
    mesh = Mesh(np.concatenate(verts), np.array(faces)[:, ::-1])
    along = np.concatenate([np.repeat(ts, sides)] + [np.full(sum(len(x) for x in verts[1:]), 0.0)] if False else [np.repeat(ts, sides)])
    extra = len(mesh.v) - len(along)
    if extra:
        # domes: distinguish start/end by their position along the tangent
        tail = np.zeros(extra)
        c0, c1 = ring_pts[0].mean(axis=0), ring_pts[-1].mean(axis=0)
        pts = mesh.v[len(along):]
        tail = np.where(np.linalg.norm(pts - c0, axis=1) < np.linalg.norm(pts - c1, axis=1), 0.0, 1.0)
        along = np.concatenate([along, tail])
    mesh.along = along
    return mesh


def sphere(center, radii, lat: int = 12, lon: int = 20) -> Mesh:
    """Ellipsoid centred at `center` with radii (rx, ry, rz); vertex (0,1,0) at the top. Seam-free (no duplicated verts)."""
    verts = [np.array([0.0, 1.0, 0.0])]
    for i in range(1, lat):
        phi = np.pi * i / lat
        for j in range(lon):
            th = 2 * np.pi * j / lon
            verts.append(np.array([np.sin(phi) * np.sin(th), np.cos(phi), np.sin(phi) * np.cos(th)]))
    verts.append(np.array([0.0, -1.0, 0.0]))
    verts = np.array(verts)
    faces = []
    for j in range(lon):
        faces.append((0, 1 + (j + 1) % lon, 1 + j))
    for i in range(lat - 2):
        for j in range(lon):
            a = 1 + i * lon + j
            b = 1 + i * lon + (j + 1) % lon
            c = 1 + (i + 1) * lon + j
            d = 1 + (i + 1) * lon + (j + 1) % lon
            faces.append((a, b, c))
            faces.append((b, d, c))
    last = len(verts) - 1
    for j in range(lon):
        faces.append((last, 1 + (lat - 2) * lon + j, 1 + (lat - 2) * lon + (j + 1) % lon))
    v = verts * np.asarray(radii) + np.asarray(center)
    return Mesh(v, np.array(faces)[:, ::-1])


def box_round(center, size, radius: float = 0.01, seg: int = 3) -> Mesh:
    """Rounded box built as a deformed subdivided cube (cheap bevel look)."""
    n = seg * 2 + 1
    lin = np.linspace(-1, 1, n)
    verts, faces, index = [], [], {}
    for face_axis in range(3):
        for sign in (-1, 1):
            for iu in range(n):
                for iv in range(n):
                    p = np.zeros(3)
                    a1, a2 = [i for i in range(3) if i != face_axis]
                    p[face_axis] = sign
                    p[a1] = lin[iu]
                    p[a2] = lin[iv]
                    key = tuple(np.round(p, 6))
                    if key not in index:
                        index[key] = len(verts)
                        verts.append(p)
    # rebuild faces from the index map
    for face_axis in range(3):
        for sign in (-1, 1):
            a1, a2 = [i for i in range(3) if i != face_axis]
            for iu in range(n - 1):
                for iv in range(n - 1):
                    def vid(du, dv):
                        p = np.zeros(3)
                        p[face_axis] = sign
                        p[a1] = lin[iu + du]
                        p[a2] = lin[iv + dv]
                        return index[tuple(np.round(p, 6))]
                    q = [vid(0, 0), vid(1, 0), vid(1, 1), vid(0, 1)]
                    if (face_axis + (0 if sign > 0 else 1)) % 2 == 0:
                        q = q[::-1]
                    faces.append((q[0], q[1], q[2]))
                    faces.append((q[0], q[2], q[3]))
    verts = np.array(verts)
    half = np.asarray(size) / 2.0
    # pull corners toward a rounded shape: scale along the cube by a "super-ellipsoid" projection
    inner = np.clip(half - radius, 0, None)
    v = np.empty_like(verts)
    for i, p in enumerate(verts):
        core = np.clip(p * half, -inner, inner)
        dirn = p * half - core
        ln = np.linalg.norm(dirn)
        v[i] = core + (dirn / ln * radius if ln > 1e-9 else 0)
    return Mesh(v + np.asarray(center), np.array(faces))


def value_noise(points: np.ndarray, scale: float, seed: int = 0) -> np.ndarray:
    """Cheap smooth 3D noise in [-1,1] (sum of sines with random phases), good enough for fabric wrinkles."""
    rng = np.random.default_rng(seed)
    out = np.zeros(len(points))
    for _ in range(4):
        d = normalize(rng.normal(size=3))
        ph = rng.uniform(0, 2 * np.pi)
        f = scale * rng.uniform(0.7, 1.4)
        out += np.sin(points @ d * f + ph)
    return out / 4.0


def displace_along_normals(m: Mesh, amount: np.ndarray | float) -> Mesh:
    n = vertex_normals(m.v, m.f)
    m.v = m.v + n * (amount[:, None] if isinstance(amount, np.ndarray) else amount)
    return m
