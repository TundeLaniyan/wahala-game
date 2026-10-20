"""Builds src/assets/models/crowd.glb: a dozen posed spectators (one node each, one shared vertex-coloured material).

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


def main(spread: float = 0.0, name: str = "crowd") -> None:
    g = GltfBuilder("WAHALA crowd")
    mat = g.add_material(Material("crowd", roughness=0.75))
    root = g.add_node("crowd")
    total = 0
    for i, v in enumerate(VARIANTS):
        m = spectator(v, seed=i * 7)
        n = vertex_normals(m.v, m.f)
        mesh = g.add_mesh(f"spec_{v['name']}", [dict(positions=m.v, normals=n, indices=m.f, material=mat, colors=m.c)])
        g.add_node(f"spec_{v['name']}", root, translation=(i * spread, 0, 0), mesh=mesh)
        total += len(m.f)
        print(f"spec_{v['name']}: {len(m.f)} tris, pose={v['pose']}")
    path = os.path.join(OUT if not spread else "/tmp", f"{name}.glb")
    size = g.save(path)
    print(f"crowd.glb: {total} tris total, {size / 1024:.0f} KB")


if __name__ == "__main__":
    sp = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0
    main(sp, "crowd_dev" if sp else "crowd")
