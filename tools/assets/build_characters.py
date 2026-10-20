"""Builds the skinned, animated character GLBs into src/assets/models/.

    python3 tools/assets/build_characters.py [name ...]

Needs only numpy + scipy (no Blender)."""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import characters
from gltfio import GltfBuilder, Material
from loft import merge, vertex_normals
from rig import BONE_NAMES, CLIPS, HIERARCHY, rest_translations, sample_clip, skin_weights

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets", "models")

MATERIALS = {
    "skin": dict(roughness=0.55, metallic=0.0),
    "cloth": dict(roughness=0.82, metallic=0.0),
    "hair": dict(roughness=0.55, metallic=0.0),
    "eyes": dict(roughness=0.12, metallic=0.0),
    "accessory": dict(roughness=0.28, metallic=0.55),
}


def build(name: str) -> str:
    spec = characters.CAST[name]()
    body = spec["body"]
    g = GltfBuilder()
    rest, world = rest_translations(body)
    nodes: dict[str, int] = {}
    for bone, parent in HIERARCHY:
        nodes[bone] = g.add_node(bone, nodes.get(parent) if parent else None, translation=rest[bone], rotation=(0, 0, 0, 1))
    joint_nodes = [nodes[b] for b in BONE_NAMES]
    ibm = np.array([np.linalg.inv(np.block([[np.eye(3), world[b][:, None]], [np.zeros((1, 3)), np.ones((1, 1))]])) for b in BONE_NAMES])
    skin = g.add_skin(f"{name}_skin", joint_nodes, ibm, nodes["root"])

    prims = []
    total = 0
    for group in ("skin", "cloth", "hair", "eyes", "accessory"):
        meshes = spec.get(group) or []
        if not meshes:
            continue
        m = merge(meshes, group)
        normals = vertex_normals(m.v, m.f)
        joints, weights = skin_weights(m.v, m.region, body)
        mat = g.add_material(Material(group, roughness=MATERIALS[group]["roughness"], metallic=MATERIALS[group]["metallic"], double_sided=(group == "hair")))
        prims.append(dict(positions=m.v, normals=normals, indices=m.f, material=mat, colors=m.c, joints=joints, weights=weights))
        total += len(m.f)
    mesh = g.add_mesh(name, prims)
    g.add_node(f"{name}_mesh", None, mesh=mesh, skin=skin)
    for clip in CLIPS:
        chans = [(nodes[b], path, t, v) for b, path, t, v in sample_clip(clip, rest)]
        g.add_animation(clip.name, chans)
    path = os.path.join(OUT, f"char_{name}.glb")
    os.makedirs(OUT, exist_ok=True)
    size = g.save(path)
    print(f"{name}: {total} tris, {len(prims)} materials, {len(CLIPS)} clips, {size / 1024:.0f} KB -> {path}")
    return path


if __name__ == "__main__":
    for n in sys.argv[1:] or list(characters.CAST):
        build(n)
