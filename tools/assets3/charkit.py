"""WAHALA! character kit: parts, garment shells cut from the body surface, primitives, hair / headgear / props helpers and GLB export.

A character = a decimated, morphed MakeHuman (CC0) skin mesh + garments derived from that surface + hair / headgear / props +
eyes, all skinned to the existing 22-bone skeleton (tools/assets/rig.py) so every existing animation clip applies.

Colours are stored as sRGB 0..1 per vertex and converted to linear at export.  Winding is CCW outward (glTF).
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "assets"))

import mhbody
import qem
from loft import box_round, sphere, tube

BONES = mhbody.BONES


def hexrgb(h: int) -> np.ndarray:
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255]) / 255.0


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ------------------------------------------------------------------------------------------------ parts


@dataclass
class Part:
    name: str
    mat: str  # 'skin' | 'cloth' | 'hair' | 'metal' | 'decal' | 'eyes' | 'leather' ...
    v: np.ndarray
    t: np.ndarray
    w: np.ndarray  # [N, 22]
    c: np.ndarray  # [N, 3] sRGB
    uv: np.ndarray | None = None
    covers: bool = False  # True for body garments: skin hidden beneath them is dropped

    def copy(self) -> "Part":
        return Part(self.name, self.mat, self.v.copy(), self.t.copy(), self.w.copy(), self.c.copy(), None if self.uv is None else self.uv.copy())


def bone_w(n: int, bone: str) -> np.ndarray:
    w = np.zeros((n, len(BONES)))
    w[:, BONES.index(bone)] = 1.0
    return w


def bsum(w: np.ndarray, names: list[str]) -> np.ndarray:
    return w[:, [BONES.index(n) for n in names]].sum(axis=1)


def merge(parts: list[Part], name: str, mat: str) -> Part:
    v, t, w, c, uv, off = [], [], [], [], [], 0
    have_uv = all(p.uv is not None for p in parts)
    for p in parts:
        v.append(p.v)
        t.append(p.t + off)
        w.append(p.w)
        c.append(p.c)
        if have_uv:
            uv.append(p.uv)
        off += len(p.v)
    return Part(name, mat, np.concatenate(v), np.concatenate(t), np.concatenate(w), np.concatenate(c), np.concatenate(uv) if have_uv else None)


def normals(p: Part) -> np.ndarray:
    return qem.smooth_normals(p.v, p.t)


def sub(p: Part, fmask: np.ndarray, name: str, mat: str) -> Part:
    t = p.t[fmask]
    used = np.unique(t)
    remap = -np.ones(len(p.v), dtype=np.int64)
    remap[used] = np.arange(len(used))
    return Part(name, mat, p.v[used].copy(), remap[t], p.w[used].copy(), p.c[used].copy(), None if p.uv is None else p.uv[used].copy())


def faces_where(p: Part, vmask: np.ndarray, mode: str = "all") -> np.ndarray:
    m = vmask[p.t]
    return m.all(axis=1) if mode == "all" else m.any(axis=1) if mode == "any" else m.mean(axis=1) > 0.5


def boundary_vertices(p: Part) -> np.ndarray:
    """Vertices on open edges, welded by position (so a UV-seam duplicate is not a boundary)."""
    key = np.round(p.v, 5)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    edges = {}
    for a, b in ((0, 1), (1, 2), (2, 0)):
        for x, y in zip(inv[p.t[:, a]], inv[p.t[:, b]]):
            k = (min(x, y), max(x, y))
            edges[k] = edges.get(k, 0) + 1
    bw = np.zeros(inv.max() + 1, dtype=bool)
    for (x, y), n in edges.items():
        if n == 1:
            bw[x] = bw[y] = True
    return bw[inv]


def adjacency(p: Part) -> list[np.ndarray]:
    key = np.round(p.v, 5)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    nb: list[set] = [set() for _ in range(inv.max() + 1)]
    for a, b in ((0, 1), (1, 2), (2, 0)):
        for x, y in zip(inv[p.t[:, a]], inv[p.t[:, b]]):
            nb[x].add(y)
            nb[y].add(x)
    return [np.array(sorted(s), dtype=np.int64) for s in nb], inv


def relax(p: Part, iters: int = 3, lam: float = 0.4, keep: np.ndarray | None = None) -> Part:
    """Laplacian smoothing over welded vertices; `keep` (bool) vertices stay put."""
    nb, inv = adjacency(p)
    n = len(nb)
    pos = np.zeros((n, 3))
    pos[inv] = p.v
    fixed = np.zeros(n, dtype=bool)
    if keep is not None:
        fixed[inv[keep]] = True
    for _ in range(iters):
        new = pos.copy()
        for i in range(n):
            if fixed[i] or len(nb[i]) == 0:
                continue
            new[i] = pos[i] + lam * (pos[nb[i]].mean(axis=0) - pos[i])
        pos = new
    p.v = pos[inv]
    return p


def push_out(p: Part, skin: Part, gap: float) -> Part:
    """Move vertices out along the nearest skin normal until they clear the body by `gap`."""
    tree = cKDTree(skin.v)
    sn = normals(skin)
    for _ in range(2):
        d, i = tree.query(p.v)
        sep = ((p.v - skin.v[i]) * sn[i]).sum(axis=1)
        short = sep < gap
        p.v[short] += sn[i][short] * (gap - sep[short])[:, None]
    return p


def shell(skin: Part, fmask: np.ndarray, off, name: str, mat: str, color=None, relax_iters: int = 2, gap: float | None = None) -> Part:
    """Garment shell: the selected skin faces offset along the smooth normals by `off` (float, or fn(v)->[N])."""
    g = sub(skin, fmask, name, mat)
    sn = normals(skin)
    # normals of the selected vertices: recompute against the full skin through the vertex mapping by position
    tree = cKDTree(skin.v)
    _, idx = tree.query(g.v)
    n = sn[idx]
    o = off(g.v) if callable(off) else np.full(len(g.v), float(off))
    g.v = g.v + n * o[:, None]
    if color is not None:
        g.c[:] = color if np.ndim(color) == 1 else color
    if relax_iters:
        relax(g, relax_iters, 0.35, keep=boundary_vertices(g))
    push_out(g, skin, gap if gap is not None else float(np.min(o)) * 0.8)
    return g


def clip(p: Part, f: np.ndarray) -> Part:
    """Keep the part of the mesh where the per-vertex field f >= 0; triangles crossing f = 0 are split exactly on it
    (clean straight hems, cuffs, openings).  Attributes interpolate linearly."""
    keep = f >= 0
    out_v, out_w, out_c, out_uv = [p.v], [p.w], [p.c], [p.uv] if p.uv is not None else None
    n0 = len(p.v)
    newv: dict = {}
    extra_v, extra_w, extra_c, extra_uv = [], [], [], []

    def cut(a: int, b: int) -> int:
        key = (a, b) if a < b else (b, a)
        i = newv.get(key)
        if i is None:
            t = f[a] / (f[a] - f[b])
            if a > b:
                a, b, t = b, a, 1.0 - t
            i = n0 + len(extra_v)
            newv[key] = i
            extra_v.append(p.v[a] * (1 - t) + p.v[b] * t)
            extra_w.append(p.w[a] * (1 - t) + p.w[b] * t)
            extra_c.append(p.c[a] * (1 - t) + p.c[b] * t)
            if p.uv is not None:
                extra_uv.append(p.uv[a] * (1 - t) + p.uv[b] * t)
        return i

    tris = []
    k3 = keep[p.t]
    cnt = k3.sum(axis=1)
    tris.extend(p.t[cnt == 3].tolist())
    for ti in np.where((cnt == 1) | (cnt == 2))[0]:
        a, b, c = [int(x) for x in p.t[ti]]
        ka, kb, kc = keep[a], keep[b], keep[c]
        verts = [a, b, c]
        flags = [ka, kb, kc]
        if cnt[ti] == 1:
            i = flags.index(True)
            v0, v1, v2 = verts[i], verts[(i + 1) % 3], verts[(i + 2) % 3]
            tris.append([v0, cut(v0, v1), cut(v2, v0)])
        else:
            i = flags.index(False)
            v0, v1, v2 = verts[i], verts[(i + 1) % 3], verts[(i + 2) % 3]  # v0 outside; v1, v2 inside
            e1, e2 = cut(v0, v1), cut(v2, v0)
            tris.append([e1, v1, v2])
            tris.append([e1, v2, e2])
    v = np.concatenate([p.v] + ([np.array(extra_v)] if extra_v else []))
    w = np.concatenate([p.w] + ([np.array(extra_w)] if extra_w else []))
    c = np.concatenate([p.c] + ([np.array(extra_c)] if extra_c else []))
    uv = None
    if p.uv is not None:
        uv = np.concatenate([p.uv] + ([np.array(extra_uv)] if extra_uv else []))
    full = Part(p.name, p.mat, v, np.array(tris, dtype=np.int64).reshape(-1, 3), w, c, uv)
    used = np.unique(full.t)
    remap = -np.ones(len(v), dtype=np.int64)
    remap[used] = np.arange(len(used))
    return Part(p.name, p.mat, v[used], remap[full.t], w[used], c[used], None if uv is None else uv[used])


def garment(skin: Part, region: np.ndarray, sdf, off, name: str, mat: str, color=None, relax_iters: int = 2, gap: float | None = None) -> Part:
    """A garment: skin faces touching `region` (bool per skin vertex, generous), clipped to sdf(v) >= 0, then offset along the
    smooth body normals by `off` (float or fn(v) -> [N])."""
    g = sub(skin, faces_where(skin, region, "any"), name, mat)
    g = clip(g, sdf(g.v))
    sn = normals(skin)
    tree = cKDTree(skin.v)
    _, idx = tree.query(g.v)
    o = off(g.v) if callable(off) else np.full(len(g.v), float(off))
    g.v = g.v + sn[idx] * o[:, None]
    if color is not None:
        g.c[:] = color
    if relax_iters:
        relax(g, relax_iters, 0.35, keep=boundary_vertices(g))
    push_out(g, skin, gap if gap is not None else float(np.min(o)) * 0.8)
    g.covers = True
    return g


def plane(point, normal):
    """SDF of a half-space: positive on the side `normal` points to."""
    point, normal = np.asarray(point, float), np.asarray(normal, float)
    normal = normal / np.linalg.norm(normal)
    return lambda v: (v - point) @ normal


def snap_boundary(p: Part, axis: int, value: float, within: float) -> Part:
    """Straighten a hem: boundary vertices within `within` of `value` along `axis` are moved onto the plane."""
    b = boundary_vertices(p)
    near = b & (np.abs(p.v[:, axis] - value) < within)
    p.v[near, axis] = value
    return p


# ------------------------------------------------------------------------------------------------ primitives


def _mk(name: str, mat: str, m, w: np.ndarray, color) -> Part:
    v = np.asarray(m.v, dtype=np.float64)
    t = np.asarray(m.f, dtype=np.int64)
    c = np.tile(np.asarray(color, dtype=np.float64), (len(v), 1)) if np.ndim(color) == 1 else np.asarray(color)
    return Part(name, mat, v, t.copy(), w if w.shape[0] == len(v) else np.tile(w[0], (len(v), 1)), c)


def rotmat(axis, deg) -> np.ndarray:
    return mhbody._rot(axis, deg)


def transform(p: Part, R: np.ndarray | None = None, T=(0, 0, 0), S=(1, 1, 1)) -> Part:
    v = p.v * np.asarray(S)
    if R is not None:
        v = v @ R.T
    p.v = v + np.asarray(T)
    return p


def prim_box(name, mat, center, size, bone: str, color, radius=0.004, R=None) -> Part:
    m = box_round((0, 0, 0), tuple(size), radius=radius, seg=2)
    p = _mk(name, mat, m, bone_w(1, bone), color)
    p.w = bone_w(len(p.v), bone)
    return transform(p, R, center)


def prim_ellipsoid(name, mat, center, radii, bone: str, color, R=None, lat=10, lon=16) -> Part:
    m = sphere((0, 0, 0), tuple(radii), lat=lat, lon=lon)
    p = _mk(name, mat, m, bone_w(1, bone), color)
    p.w = bone_w(len(p.v), bone)
    return transform(p, R, center)


def prim_cyl(name, mat, p0, p1, r0, r1, bone: str, color, sides=12, caps=True, exponent=2.0, rz=None) -> Part:
    """Straight tube / frustum from p0 to p1 (elliptical when rz is given: radii along the local u, v axes)."""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    ru = [r0, r1]
    rv = [rz if rz is not None else r0, (rz if rz is not None else r1)]
    m = tube(np.array([p0, p1]), ru, rv, sides=sides, rings=3, exponent=exponent, cap_start=caps, cap_end=caps)
    p = _mk(name, mat, m, bone_w(1, bone), color)
    p.w = bone_w(len(p.v), bone)
    return p


def prim_path(name, mat, pts, radii, bone: str, color, sides=8, caps=True, rings=None) -> Part:
    pts = np.asarray(pts, float)
    m = tube(pts, list(radii), list(radii), sides=sides, rings=rings or max(4, len(pts) * 2), cap_start=caps, cap_end=caps)
    p = _mk(name, mat, m, bone_w(1, bone), color)
    p.w = bone_w(len(p.v), bone)
    return p


def weights_from_skin(p: Part, skin: Part, k: int = 3) -> Part:
    """Skin-weight transfer from the nearest body vertices (inverse-distance blend)."""
    tree = cKDTree(skin.v)
    d, i = tree.query(p.v, k=k)
    wt = 1.0 / np.maximum(d, 1e-4)
    wt /= wt.sum(axis=1, keepdims=True)
    p.w = np.einsum("nk,nkb->nb", wt, skin.w[i])
    return p


def tint(p: Part, color, amount: float = 1.0) -> Part:
    p.c = p.c * (1 - amount) + np.asarray(color) * amount
    return p


# ------------------------------------------------------------------------------------------------ body -> skin part


def make_skin(spec: mhbody.BodySpec, height_m: float, target_verts: int = 9000, head_importance: float = 1.0, hand_importance: float = 0.45, protect: float = 40.0):
    """Morphed, posed, decimated skin Part + the rig joints + head / eye anchors."""
    b = mhbody.build_body(spec, height_m=height_m)
    # lock seams (open edges of the UV-split mesh)
    import collections

    e = collections.Counter()
    for tr in b.tris:
        for i in range(3):
            x, y = int(tr[i]), int(tr[(i + 1) % 3])
            e[(min(x, y), max(x, y))] += 1
    locked = np.zeros(len(b.verts), dtype=bool)
    for (x, y), n in e.items():
        if n == 1:
            locked[x] = locked[y] = True
    v = b.verts
    imp = np.zeros(len(v))
    top = b.joints["neck"][1] - 0.02
    imp[v[:, 1] > top] = head_importance
    hand_l, hand_r = b.joints["hand_L"], b.joints["hand_R"]
    for h in (hand_l, hand_r):
        imp[np.linalg.norm(v - h, axis=1) < 0.12] = hand_importance
    imp[(v[:, 1] < 0.13)] = np.maximum(imp[(v[:, 1] < 0.13)], 0.3)
    nv, nt, at, _ = qem.decimate(v, b.tris, {"uv": b.uv, "w": b.weights}, locked, imp, target_verts, protect=protect)
    w = np.clip(at["w"], 0, None)
    w /= np.maximum(w.sum(axis=1, keepdims=True), 1e-9)
    skin = Part("skin", "skin", nv, nt, w, np.tile(hexrgb(0x8a5a3a), (len(nv), 1)), at["uv"])
    return skin, b


def decimate_part(p: Part, target_verts: int, lock_boundary: bool = True, protect: float = 0.0, importance: np.ndarray | None = None) -> Part:
    """Quadric decimation of a part (borders and UV seams locked) with weights / colours / UVs interpolated."""
    if len(p.v) <= target_verts:
        return p
    locked = boundary_vertices(p) if lock_boundary else np.zeros(len(p.v), dtype=bool)
    imp = np.zeros(len(p.v)) if importance is None else importance
    attrs = {"w": p.w, "c": p.c}
    if p.uv is not None:
        attrs["uv"] = p.uv
    nv, nt, at, _ = qem.decimate(p.v, p.t, attrs, locked, imp, target_verts, protect=protect or 10.0)
    w = np.clip(at["w"], 0, None)
    w /= np.maximum(w.sum(axis=1, keepdims=True), 1e-9)
    q = Part(p.name, p.mat, nv, nt, w, np.clip(at["c"], 0, 1), at.get("uv"))
    q.covers = p.covers
    return q


def strip_covered(skin: Part, garments: list[Part], depth: float = 0.03, keep: np.ndarray | None = None) -> Part:
    """Remove skin faces hidden under garments (all three vertices below a garment surface within `depth`)."""
    covered = np.zeros(len(skin.v), dtype=bool)
    for g in garments:
        if not g.covers:
            continue
        tree = cKDTree(g.v)
        gn = normals(g)
        d, i = tree.query(skin.v)
        below = ((skin.v - g.v[i]) * gn[i]).sum(axis=1) < -0.002
        covered |= below & (d < depth)
    if keep is not None:
        covered &= ~keep
    fm = ~covered[skin.t].all(axis=1)
    out = sub(skin, fm, skin.name, skin.mat)
    return out


def finish_skin(skin: Part, garments: list[Part], joints: dict, target_verts: int = 4200, head_importance: float = 1.0, hand_importance: float = 0.5) -> Part:
    """Visible skin only (hidden faces dropped), decimated with the head and hands protected."""
    vis = strip_covered(skin, garments)
    v = vis.v
    imp = np.zeros(len(v))
    imp[v[:, 1] > joints["neck"][1] - 0.02] = head_importance
    for h in ("hand_L", "hand_R"):
        imp[np.linalg.norm(v - joints[h], axis=1) < 0.12] = hand_importance
    return decimate_part(vis, target_verts, lock_boundary=True, protect=40.0, importance=imp)


# ------------------------------------------------------------------------------------------------ eyes


def make_eyes(b, scale: float = 1.0, iris: int = 0x4a2f1c) -> list[Part]:
    """Eyeballs (sclera, iris, pupil painted by vertex colour) seated at the eye joints, rigged to the head."""
    parts = []
    for side in ("L", "R"):
        c = b.helpers[f"eye_{side}"].copy()
        r = 0.0135 * scale
        m = sphere((0, 0, 0), (r, r, r), lat=12, lon=18)
        p = _mk(f"eye_{side}", "eyes", m, bone_w(1, "head"), (1, 1, 1))
        p.w = bone_w(len(p.v), "head")
        d = p.v / r
        ang = np.degrees(np.arccos(np.clip(d[:, 2], -1, 1)))  # angle from +Z (looking forward)
        col = np.tile(hexrgb(0xeae4d8), (len(p.v), 1))
        col[ang < 27] = hexrgb(iris)
        col[ang < 12] = hexrgb(0x050505)
        p.c = col
        p.v = p.v + c
        parts.append(p)
    return parts


# ------------------------------------------------------------------------------------------------ export


MATERIAL_PROPS = {
    "skin": dict(roughness=0.58, metallic=0.0),
    "cloth": dict(roughness=0.86, metallic=0.0),
    "leather": dict(roughness=0.55, metallic=0.0),
    "hair": dict(roughness=0.5, metallic=0.0, double_sided=True),
    "metal": dict(roughness=0.32, metallic=0.7),
    "plastic": dict(roughness=0.4, metallic=0.0),
    "rubber": dict(roughness=0.8, metallic=0.0),
    "eyes": dict(roughness=0.1, metallic=0.0),
    "decal": dict(roughness=0.8, metallic=0.0, alpha="MASK", double_sided=True),
}


def export_glb(path: str, name: str, parts: list[Part], joints: dict, clips: list, textures: dict | None = None, head_scale: float = 1.0) -> dict:
    """Skinned GLB on the shared 22-bone skeleton. `textures`: material name -> PIL image (base colour)."""
    import io

    from gltfio import GltfBuilder, Material
    from rig import HIERARCHY, sample_clip

    textures = textures or {}
    g = GltfBuilder()
    world = {b: np.asarray(joints[b], float) for b in BONES}
    world["root"] = np.zeros(3)
    rest = {}
    for bone, parent in HIERARCHY:
        rest[bone] = world[bone] - (world[parent] if parent else 0)
    nodes: dict[str, int] = {}
    for bone, parent in HIERARCHY:
        nodes[bone] = g.add_node(bone, nodes.get(parent) if parent else None, translation=rest[bone], rotation=(0, 0, 0, 1))
    g.nodes[nodes["head"]]["extras"] = {"headScale": head_scale}
    joint_nodes = [nodes[b] for b in BONES]
    ibm = np.array([np.linalg.inv(np.block([[np.eye(3), world[b][:, None]], [np.zeros((1, 3)), np.ones((1, 1))]])) for b in BONES])
    skin_i = g.add_skin(f"{name}_skin", joint_nodes, ibm, nodes["root"])

    by_mat: dict[str, list[Part]] = {}
    for p in parts:
        by_mat.setdefault(p.mat, []).append(p)
    prims, stats = [], {"tris": 0, "verts": 0, "materials": 0}
    tex_index = {}
    for mname, plist in by_mat.items():
        m = merge(plist, mname, mname)
        n = qem.smooth_normals(m.v, m.t) if mname not in ("hair",) else qem.smooth_normals(m.v, m.t, 4)
        # top-4 weights
        idx = np.argsort(-m.w, axis=1)[:, :4]
        wt = np.take_along_axis(m.w, idx, axis=1)
        wt /= np.maximum(wt.sum(axis=1, keepdims=True), 1e-9)
        props = dict(MATERIAL_PROPS.get(mname, dict(roughness=0.7, metallic=0.0)))
        tex = None
        if mname in textures:
            buf = io.BytesIO()
            img = textures[mname]
            if img.mode == "RGB":
                img.save(buf, format="JPEG", quality=88, optimize=True)
                tex = g.add_texture(g.add_image(buf.getvalue(), "image/jpeg"))
            else:
                img.save(buf, format="PNG", optimize=True)
                tex = g.add_texture(g.add_image(buf.getvalue(), "image/png"))
            tex_index[mname] = tex
        mat = g.add_material(Material(mname, texture=tex, **props))
        col = srgb_to_linear(np.clip(m.c, 0, 1))
        prim = dict(positions=m.v, normals=n, indices=m.t, material=mat, colors=col, joints=idx, weights=wt)
        if m.uv is not None:
            prim["uvs"] = np.stack([m.uv[:, 0], 1.0 - m.uv[:, 1]], axis=1)
        prims.append(prim)
        stats["tris"] += len(m.t)
        stats["verts"] += len(m.v)
    stats["materials"] = len(by_mat)
    mesh = g.add_mesh(name, prims)
    g.add_node(f"{name}_mesh", None, mesh=mesh, skin=skin_i)
    for clip in clips:
        chans = [(nodes[b], pth, t, v) for b, pth, t, v in sample_clip(clip, rest)]
        g.add_animation(clip.name, chans)
    stats["bytes"] = g.save(path)
    stats["clips"] = len(clips)
    return stats
