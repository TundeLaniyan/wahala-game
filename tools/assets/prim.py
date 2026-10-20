"""Hard-surface modelling kit for props, vehicles and buildings (numpy only, no Blender).

    from prim import *
    m = Model("prop_pillar")
    m.add(bevel_box((0, 0.37, 0), (0.84, 0.74, 0.84), bevel=0.03), "concrete")
    m.export(MATERIALS)

Conventions (docs/ASSET_PIPELINE.md): Y-up, metres, front = +Z, origin on the ground at the centre of the footprint.
Meshes are split into crease-angle shaded corners at export, UVs are box-projected (metres / `uv_m`) unless a
part carries explicit UVs (see `quad`). `Model.add(..., node="wheel_FL", pivot=(x,y,z))` puts a part under its own
named node (origin at `pivot`) so the game can animate it.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import tex as texlib
from gltfio import GltfBuilder, Material
from loft import Mesh, box_round, merge, normalize, sphere, tube, value_noise  # noqa: F401  (re-exported)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets", "models")


# ----------------------------------------------------------------------------- transforms


def rot_matrix(rx=0.0, ry=0.0, rz=0.0) -> np.ndarray:
    """Degrees, applied X then Y then Z (extrinsic), 4x4."""
    rx, ry, rz = np.radians([rx, ry, rz])
    cx, sx, cy, sy, cz, sz = np.cos(rx), np.sin(rx), np.cos(ry), np.sin(ry), np.cos(rz), np.sin(rz)
    mx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    my = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    mz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    r = np.eye(4)
    r[:3, :3] = mz @ my @ mx
    return r


def place(m: Mesh, pos=(0, 0, 0), rot=(0, 0, 0), scale=1.0) -> Mesh:
    """Rotate (degrees XYZ) and scale about the origin, then translate. Returns a copy."""
    out = m.copy()
    s = np.broadcast_to(np.asarray(scale, dtype=np.float64), (3,))
    out.v = out.v * s
    if any(abs(r) > 1e-9 for r in rot):
        out.v = out.v @ rot_matrix(*rot)[:3, :3].T
    out.v = out.v + np.asarray(pos)
    if np.prod(s) < 0:
        out.f = out.f[:, ::-1]
    return out


def colorize(m: Mesh, rgb, a: float = 1.0) -> Mesh:
    """Set a flat vertex colour (sRGB 0xRRGGBB or 0..1 tuple); multiplies the material texture."""
    c = texlib.srgb(rgb)
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m.c[:] = [lin[0], lin[1], lin[2], a]
    return m


def tint_by_height(m: Mesh, y0: float, y1: float, dark: float = 0.35) -> Mesh:
    """Cheap ground-contact darkening (fake AO) baked into vertex colours."""
    k = 1.0 - dark * np.clip((y1 - m.v[:, 1]) / max(y1 - y0, 1e-6), 0, 1)
    m.c[:, :3] *= k[:, None]
    return m


def grime(m: Mesh, amount: float = 0.25, seed: int = 0, scale: float = 9.0) -> Mesh:
    n = value_noise(m.v, scale, seed)
    m.c[:, :3] *= (1.0 - amount * (0.5 - 0.5 * n))[:, None]
    return m


# ----------------------------------------------------------------------------- primitives


def bevel_box(center, size, bevel: float = 0.02, seg: int = 2) -> Mesh:
    """Box with rounded edges (`bevel` = radius). Oriented along the axes."""
    bevel = float(min(bevel, min(size) / 2 - 1e-4))
    return outward(box_round(center, size, bevel, seg))


def cylinder(center, radius, height, sides: int = 24, axis: str = "y", radius2: float | None = None, bevel: float = 0.0, caps: bool = True) -> Mesh:
    """Frustum/cylinder centred at `center`; `axis` is its long axis. `bevel` rounds both rims."""
    r2 = radius if radius2 is None else radius2
    prof = []
    h = height / 2
    if caps:
        prof.append((0.0, -h))
    if bevel > 0 and caps:
        b = min(bevel, radius * 0.9, r2 * 0.9, h * 0.9)
        prof += [(radius - b, -h), (radius - b * 0.2929, -h + b * 0.2929), (radius, -h + b)]
        prof += [(r2, h - b), (r2 - b * 0.2929, h - b * 0.2929), (r2 - b, h)]
    else:
        prof += [(radius, -h), (r2, h)]
    if caps:
        prof.append((0.0, h))
    m = lathe(prof, sides)
    return _orient(m, axis, center)


def lathe(profile, sides: int = 32, closed_axis: bool = True) -> Mesh:
    """Revolve a (radius, y) profile around the Y axis. Profile points go bottom -> top."""
    prof = np.asarray(profile, dtype=np.float64)
    rings = len(prof)
    th = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    verts = []
    for r, y in prof:
        for t in th:
            verts.append((r * np.cos(t), y, r * np.sin(t)))
    verts = np.array(verts)
    faces = []
    for i in range(rings - 1):
        for j in range(sides):
            a = i * sides + j
            b = i * sides + (j + 1) % sides
            c = (i + 1) * sides + j
            d = (i + 1) * sides + (j + 1) % sides
            faces += [(a, c, b), (b, c, d)]
    m = Mesh(verts, np.array(faces))
    return outward(_drop_degenerate(m)) if closed_axis and prof[0][0] < 1e-9 and prof[-1][0] < 1e-9 else _drop_degenerate(m)


def torus(center, major, minor, major_seg: int = 28, minor_seg: int = 10, axis: str = "y") -> Mesh:
    verts, faces = [], []
    for i in range(major_seg):
        a = 2 * np.pi * i / major_seg
        for j in range(minor_seg):
            b = 2 * np.pi * j / minor_seg
            r = major + minor * np.cos(b)
            verts.append((r * np.cos(a), minor * np.sin(b), r * np.sin(a)))
    for i in range(major_seg):
        for j in range(minor_seg):
            a = i * minor_seg + j
            b = i * minor_seg + (j + 1) % minor_seg
            c = ((i + 1) % major_seg) * minor_seg + j
            d = ((i + 1) % major_seg) * minor_seg + (j + 1) % minor_seg
            faces += [(a, b, c), (b, d, c)]
    return _orient(outward(Mesh(np.array(verts), np.array(faces))), axis, center)


def _orient(m: Mesh, axis: str, center) -> Mesh:
    if axis == "x":
        m.v = m.v @ rot_matrix(0, 0, -90)[:3, :3].T
    elif axis == "z":
        m.v = m.v @ rot_matrix(90, 0, 0)[:3, :3].T
    m.v = m.v + np.asarray(center)
    return m


def outward(m: Mesh) -> Mesh:
    """Flip the winding of a closed mesh if its signed volume is negative (so faces point outwards)."""
    t = m.v[m.f]
    vol = np.einsum("ij,ij->i", t[:, 0], np.cross(t[:, 1], t[:, 2])).sum() / 6.0
    if vol < 0:
        m.f = m.f[:, ::-1]
    return m


def _drop_degenerate(m: Mesh) -> Mesh:
    a, b, c = m.v[m.f[:, 0]], m.v[m.f[:, 1]], m.v[m.f[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
    m.f = m.f[area > 1e-12]
    return m


def prism(poly_xz, y0: float, y1: float, bevel: float = 0.0) -> Mesh:
    """Convex polygon (list of (x,z), counter-clockwise seen from +Y) extruded from y0 to y1."""
    p = np.asarray(poly_xz, dtype=np.float64)
    n = len(p)
    verts = [(x, y0, z) for x, z in p] + [(x, y1, z) for x, z in p]
    cx, cz = p.mean(axis=0)
    verts += [(cx, y0, cz), (cx, y1, cz)]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces += [(i, j, n + i), (j, n + j, n + i)]
        faces += [(2 * n, j, i), (2 * n + 1, n + i, n + j)]
    return outward(Mesh(np.array(verts), np.array(faces)))


def quad(center, right, up, width: float, height: float, uv_rect=(0.0, 0.0, 1.0, 1.0), double: bool = False) -> Mesh:
    """Flat rectangle facing `right x up`, with explicit UVs mapping to `uv_rect` = (u0, v0, u1, v1) (v up)."""
    r, u = normalize(np.asarray(right, dtype=np.float64)), normalize(np.asarray(up, dtype=np.float64))
    c = np.asarray(center, dtype=np.float64)
    v = np.array([c - r * width / 2 - u * height / 2, c + r * width / 2 - u * height / 2, c + r * width / 2 + u * height / 2, c - r * width / 2 + u * height / 2])
    f = np.array([(0, 1, 2), (0, 2, 3)])
    u0, v0, u1, v1 = uv_rect
    m = Mesh(v, f)
    m.uv = np.array([(u0, 1 - v0), (u1, 1 - v0), (u1, 1 - v1), (u0, 1 - v1)])
    if double:
        m = merge([m, _flip(m.copy())])
    return m


def _flip(m: Mesh) -> Mesh:
    m.f = m.f[:, ::-1]
    return m


def sheet(poly_xy, z: float, thickness: float = 0.02, double: bool = False) -> Mesh:
    """Extrude a convex 2D outline given in the XY plane (e.g. a window or sign) along Z."""
    p = np.asarray(poly_xy, dtype=np.float64)
    poly_xz = np.c_[p[:, 0], p[:, 1]]
    m = prism(poly_xz, 0.0, thickness)
    # prism extrudes along Y with outline in XZ; map (x, y, z) -> (x, z, y)
    m.v = np.c_[m.v[:, 0], m.v[:, 2], m.v[:, 1] + z]
    m.f = m.f[:, ::-1]
    return m


def rounded_rect_outline(w: float, h: float, r: float, n: int = 5) -> np.ndarray:
    pts = []
    for cx, cy, a0 in [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]:
        for k in range(n):
            a = np.radians(a0 + 90 * k / (n - 1))
            pts.append((cx + r * np.cos(a), cy + r * np.sin(a)))
    return np.array(pts)


# ----------------------------------------------------------------------------- model + export


@dataclass
class Spec:
    """Material definition: uses a procedural texture generator (name in tex.GENERATORS) or plain factors."""

    color: tuple = (1.0, 1.0, 1.0, 1.0)
    roughness: float = 0.8
    metallic: float = 0.0
    texture: str | None = None  # generator name
    tex_args: dict = field(default_factory=dict)
    uv_m: float = 1.0  # metres per texture repeat for box-projected UVs
    smooth_deg: float = 40.0
    emissive: tuple = (0.0, 0.0, 0.0)
    emissive_strength: float = 1.0
    double_sided: bool = False
    alpha: str | None = None


@dataclass
class _Item:
    mesh: Mesh
    material: str
    node: str | None
    pivot: tuple


class Model:
    def __init__(self, name: str) -> None:
        self.name = name
        self.items: list[_Item] = []

    def add(self, mesh: Mesh | list[Mesh], material: str, node: str | None = None, pivot=(0, 0, 0)) -> "Model":
        for m in mesh if isinstance(mesh, list) else [mesh]:
            self.items.append(_Item(m, material, node, tuple(pivot)))
        return self

    def tri_count(self) -> int:
        return int(sum(len(i.mesh.f) for i in self.items))

    def export(self, specs: dict[str, Spec], out_dir: str = OUT_DIR, quiet: bool = False) -> str:
        g = GltfBuilder(f"WAHALA asset tools / {self.name}")
        mat_ids: dict[str, int] = {}
        tex_cache: dict[tuple, tuple] = {}

        def material(name: str) -> int:
            if name in mat_ids:
                return mat_ids[name]
            s = specs[name]
            tex_i = nrm_i = orm_i = None
            if s.texture:
                key = (s.texture, tuple(sorted(s.tex_args.items())))
                if key not in tex_cache:
                    pngs = texlib.GENERATORS[s.texture](**s.tex_args).png_set()
                    tex_cache[key] = (g.add_texture(g.add_image(pngs["albedo"], "image/jpeg")), g.add_texture(g.add_image(pngs["normal"], "image/jpeg")), g.add_texture(g.add_image(pngs["orm"], "image/jpeg")))
                tex_i, nrm_i, orm_i = tex_cache[key]
            mat_ids[name] = g.add_material(
                Material(name, base_color=s.color, metallic=s.metallic, roughness=1.0 if orm_i is not None and s.metallic == 0 else s.roughness, emissive=s.emissive,
                         emissive_strength=s.emissive_strength, double_sided=s.double_sided, alpha=s.alpha, texture=tex_i, normal_texture=nrm_i, orm_texture=orm_i)
            )
            return mat_ids[name]

        groups: dict[str | None, list[_Item]] = {}
        for it in self.items:
            groups.setdefault(it.node, []).append(it)
        root = g.add_node(self.name)
        for node_name, items in groups.items():
            pivot = items[0].pivot
            by_mat: dict[str, list[Mesh]] = {}
            for it in items:
                m = it.mesh.copy()
                m.v = m.v - np.asarray(pivot)
                by_mat.setdefault(it.material, []).append(m)
            prims = [_prim_for(merge(ms), specs[mname], material(mname)) for mname, ms in by_mat.items()]
            mesh_id = g.add_mesh(node_name or f"{self.name}_body", prims)
            if node_name is None:
                g.add_node(f"{self.name}_body", root, mesh=mesh_id)
            else:
                g.add_node(node_name, root, translation=pivot, mesh=mesh_id)
        path = os.path.join(out_dir, f"{self.name}.glb")
        os.makedirs(out_dir, exist_ok=True)
        size = g.save(path)
        if not quiet:
            print(f"{self.name}: {self.tri_count()} tris, {len(mat_ids)} materials, {size // 1024} KB -> {os.path.relpath(path)}")
        return path


def _prim_for(m: Mesh, s: Spec, material_id: int) -> dict:
    """Corner-split shading normals + (box or explicit) UVs -> a glTF primitive dict."""
    f = m.f
    tri = m.v[f]  # [T,3,3]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = np.linalg.norm(fn, axis=1, keepdims=True)
    fnu = fn / np.maximum(area, 1e-12)
    ok = area[:, 0] > 1e-12
    f, tri, fn, fnu = f[ok], tri[ok], fn[ok], fnu[ok]
    cos_t = np.cos(np.radians(s.smooth_deg))
    # per-vertex incident faces
    nv = len(m.v)
    incident: list[list[int]] = [[] for _ in range(nv)]
    for t, face in enumerate(f):
        for k in range(3):
            incident[face[k]].append(t)
    normals = np.zeros((len(f), 3, 3))
    for t, face in enumerate(f):
        for k in range(3):
            acc = np.zeros(3)
            for o in incident[face[k]]:
                if fnu[o] @ fnu[t] >= cos_t:
                    acc += fn[o]  # area-weighted
            normals[t, k] = acc / max(np.linalg.norm(acc), 1e-12)
    pos = tri.reshape(-1, 3)
    nrm = normals.reshape(-1, 3)
    col = m.c[f].reshape(-1, 4)
    # UVs
    if m.uv is not None:
        uv = m.uv[f].reshape(-1, 2)
        need = np.isnan(uv).any(axis=1)
    else:
        uv = np.zeros((len(pos), 2))
        need = np.ones(len(pos), dtype=bool)
    if need.any():
        face_axis = np.argmax(np.abs(fnu), axis=1)
        fa = np.repeat(face_axis, 3)
        p = pos
        box = np.where((fa == 0)[:, None], np.c_[p[:, 2], p[:, 1]], np.where((fa == 1)[:, None], np.c_[p[:, 0], p[:, 2]], np.c_[p[:, 0], p[:, 1]])) / s.uv_m
        uv = np.where(need[:, None], box, uv)
    # re-index identical corners
    key = np.concatenate([np.round(pos, 5), np.round(nrm, 3), np.round(col, 3), np.round(uv, 4)], axis=1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return dict(
        positions=pos[first],
        normals=nrm[first],
        colors=col[first],
        uvs=uv[first],
        indices=inv.reshape(-1, 3),
        material=material_id,
    )
