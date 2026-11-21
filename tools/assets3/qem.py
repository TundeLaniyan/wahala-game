"""Quadric-error edge-collapse decimation with per-vertex importance, locked vertices and attribute interpolation.

Written for the WAHALA! character pipeline because Blender's Decimate modifier gives no reliable way to protect a face
and keep UV seams / skin weights consistent.  Pure numpy + heapq; deterministic.

    verts, tris, attrs = decimate(verts, tris, attrs, locked, importance, target_verts)

* `attrs`: dict name -> [N, k] arrays interpolated along the collapsed edge (UVs, skin weights, colours ...).
* `locked`: bool [N]; locked vertices never move and are never removed (UV seams, mesh borders, attachment points).
* `importance`: float [N] >= 0; an edge's cost is multiplied by 1 + protect * max(importance) of its ends.
"""
from __future__ import annotations

import heapq

import numpy as np


def _plane_quadrics(verts: np.ndarray, tris: np.ndarray) -> np.ndarray:
    n = len(verts)
    Q = np.zeros((n, 4, 4))
    p0, p1, p2 = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    c = np.cross(p1 - p0, p2 - p0)
    area = np.linalg.norm(c, axis=1)
    nrm = c / np.maximum(area[:, None], 1e-18)
    d = -(nrm * p0).sum(axis=1)
    pl = np.concatenate([nrm, d[:, None]], axis=1)
    K = pl[:, :, None] * pl[:, None, :] * (area * 0.5)[:, None, None]
    for k in range(3):
        np.add.at(Q, tris[:, k], K)
    return Q


def decimate(verts, tris, attrs, locked, importance, target_verts, protect: float = 40.0, flip_limit: float = 0.25):
    verts = np.array(verts, dtype=np.float64)
    tris = np.array(tris, dtype=np.int64)
    n = len(verts)
    attrs = {k: np.array(v, dtype=np.float64) for k, v in attrs.items()}
    locked = np.asarray(locked, dtype=bool)
    imp = np.asarray(importance, dtype=np.float64)
    Q = _plane_quadrics(verts, tris)
    faces = [list(map(int, t)) for t in tris]
    alive_f = [True] * len(faces)
    vfaces: list[set] = [set() for _ in range(n)]
    for fi, f in enumerate(faces):
        for v in f:
            vfaces[v].add(fi)
    alive_v = np.ones(n, dtype=bool)
    stamp = np.zeros(n, dtype=np.int64)
    count = int(alive_v.sum())

    def neighbours(v: int) -> set:
        s = set()
        for fi in vfaces[v]:
            s.update(faces[fi])
        s.discard(v)
        return s

    def quad_err(q: np.ndarray, p: np.ndarray) -> float:
        h = np.append(p, 1.0)
        return float(h @ q @ h)

    heap: list = []
    counter = 0

    def push_edge(a: int, b: int) -> None:
        nonlocal counter
        if locked[a] and locked[b]:
            return
        if locked[b]:  # `a` survives and `b` is removed, so the locked end must be `a`
            a, b = b, a
        q = Q[a] + Q[b]
        pa, pb = verts[a], verts[b]
        cands = [(0.0, pa)]  # b collapses into a, which stays put
        if not locked[a]:
            cands.append((1.0, pb))  # a moves onto b
            cands.append((0.5, (pa + pb) * 0.5))
        best = min(((quad_err(q, p), t, p) for t, p in cands), key=lambda x: x[0])
        cost = max(best[0], 0.0) * (1.0 + protect * max(imp[a], imp[b])) + 1e-9 * np.linalg.norm(pa - pb)
        counter += 1
        heapq.heappush(heap, (cost, counter, a, b, stamp[a], stamp[b], best[1], tuple(best[2])))

    seen = set()
    for f in faces:
        for i in range(3):
            a, b = f[i], f[(i + 1) % 3]
            key = (min(a, b), max(a, b))
            if key not in seen:
                seen.add(key)
                push_edge(*key)

    def would_flip(a: int, b: int, p: np.ndarray) -> bool:
        # faces around a or b that survive (not containing both) must keep their orientation
        both = vfaces[a] & vfaces[b]
        for fi in (vfaces[a] | vfaces[b]) - both:
            f = faces[fi]
            old = [verts[v] for v in f]
            new = [p if v in (a, b) else verts[v] for v in f]
            no = np.cross(old[1] - old[0], old[2] - old[0])
            nn = np.cross(new[1] - new[0], new[2] - new[0])
            lo, ln = np.linalg.norm(no), np.linalg.norm(nn)
            if ln < 1e-14 or lo < 1e-14:
                return True
            if (no @ nn) / (lo * ln) < flip_limit:
                return True
        return False

    while heap and count > target_verts:
        cost, _, a, b, sa, sb, t, p = heapq.heappop(heap)
        if not (alive_v[a] and alive_v[b]) or stamp[a] != sa or stamp[b] != sb:
            continue
        p = np.array(p)
        both = vfaces[a] & vfaces[b]
        if not both:
            continue
        # link condition: shared neighbours must be exactly the opposite corners of the shared faces
        shared = neighbours(a) & neighbours(b)
        if len(shared) > len(both):
            continue
        if would_flip(a, b, p):
            continue
        # collapse b into a (a survives at p); attributes interpolate a -> b by t
        for k, arr in attrs.items():
            arr[a] = arr[a] * (1.0 - t) + arr[b] * t
        verts[a] = p
        Q[a] = Q[a] + Q[b]
        for fi in list(vfaces[b]):
            if fi in both:
                alive_f[fi] = False
                for v in faces[fi]:
                    if v not in (a, b):
                        pass
                for v in set(faces[fi]):
                    vfaces[v].discard(fi)
                continue
            faces[fi] = [a if v == b else v for v in faces[fi]]
            vfaces[a].add(fi)
        vfaces[b] = set()
        alive_v[b] = False
        count -= 1
        stamp[a] += 1
        for v in neighbours(a):
            stamp[v] += 0  # neighbours keep valid stamps; edges of `a` are re-queued below
            push_edge(min(a, v), max(a, v))

    keep = np.where(alive_v)[0]
    remap = -np.ones(n, dtype=np.int64)
    remap[keep] = np.arange(len(keep))
    out_tris = np.array([[remap[v] for v in f] for fi, f in enumerate(faces) if alive_f[fi] and len(set(f)) == 3], dtype=np.int64)
    return verts[keep], out_tris, {k: v[keep] for k, v in attrs.items()}, keep


def smooth_normals(verts: np.ndarray, tris: np.ndarray, decimals: int = 5) -> np.ndarray:
    """Vertex normals averaged over vertices that share a position (so UV-seam duplicates shade smoothly)."""
    fn = np.cross(verts[tris[:, 1]] - verts[tris[:, 0]], verts[tris[:, 2]] - verts[tris[:, 0]])
    key = np.round(verts, decimals)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    acc = np.zeros((inv.max() + 1, 3))
    for k in range(3):
        np.add.at(acc, inv[tris[:, k]], fn)
    n = acc[inv]
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
