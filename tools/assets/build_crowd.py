"""Builds src/assets/models/crowd.glb: twenty spectators, each as two posed nodes `spec_<name>_<role>_0` (calm)
and `spec_<name>_<role>_1` (react / second stride frame), sharing one vertex-coloured material.

    python3 tools/assets/build_crowd.py
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from crowd_lib import VARIANTS, spectator
from gltfio import GltfBuilder, Material
from loft import vertex_normals

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets", "models")


def cluster_decimate(m, cell: float = 0.034):
    """Vertex-clustering decimation: snaps vertices to a `cell` grid, merges each cell into its mean vertex
    (colours averaged) and drops collapsed triangles. Crowd figures are seen at ~40 px, so a 3.4 cm grid (under a pixel) is
    invisible in game and roughly halves the triangle count."""
    key = np.floor(m.v / cell).astype(np.int64)
    _, inv, counts = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    inv = inv.reshape(-1)
    n = len(counts)
    v = np.zeros((n, 3))
    np.add.at(v, inv, m.v)
    v /= counts[:, None]
    c = np.zeros((n, m.c.shape[1]))
    np.add.at(c, inv, m.c)
    c /= counts[:, None]
    f = inv[m.f]
    ok = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
    f = f[ok]
    f = np.unique(np.sort(f, axis=1), axis=0, return_index=True)[1]
    out = m.copy()
    faces = inv[m.f][ok][np.sort(f)]
    out.v, out.c, out.f = v, c, faces
    return out


def main(spread: float = 0.0, name: str = "crowd") -> None:
    g = GltfBuilder("WAHALA crowd")
    mat = g.add_material(Material("crowd", roughness=0.75))
    root = g.add_node("crowd")
    total = 0
    for i, v in enumerate(VARIANTS):
        for k, m in enumerate(spectator(v, seed=i * 7)):
            m = cluster_decimate(m)
            n = vertex_normals(m.v, m.f)
            nm = f"spec_{v['name']}_{v['role']}_{k}"
            mesh = g.add_mesh(nm, [dict(positions=m.v, normals=n, indices=m.f, material=mat, colors=m.c)])
            g.add_node(nm, root, translation=(i * spread, 0, k * spread), mesh=mesh)
            total += len(m.f)
        print(f"spec_{v['name']}: {len(m.f)} tris, {v['pose']} / {v['react']} ({v['role']})")
    path = os.path.join(OUT if not spread else os.environ.get("CROWD_DEV_DIR", "/tmp"), f"{name}.glb")
    size = g.save(path)
    print(f"crowd.glb: {total} tris total, {size / 1024:.0f} KB")


if __name__ == "__main__":
    sp = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0
    main(sp, "crowd_dev" if sp else "crowd")
