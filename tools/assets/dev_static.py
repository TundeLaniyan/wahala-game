"""Dev helper: export the raw body as a static GLB to judge proportions."""
import sys
import numpy as np
from chargen import *
from gltfio import GltfBuilder, Material
from loft import merge, vertex_normals

def export(parts, path):
    g = GltfBuilder()
    skin_mat = g.add_material(Material("skin", roughness=0.55))
    prims = []
    for name, m in parts.items():
        pass
    allm = merge(list(parts.values()))
    n = vertex_normals(allm.v, allm.f)
    prims.append(dict(positions=allm.v, normals=n, indices=allm.f, material=skin_mat, colors=allm.c))
    mesh = g.add_mesh("body", prims)
    g.add_node("body", mesh=mesh)
    print(path, g.save(path), 'bytes', len(allm.f), 'tris')

b = {"athletic": MALE_ATHLETIC, "slim": MALE_SLIM, "female": FEMALE}[sys.argv[1]]
parts = build_body(b)
for k, m in parts.items():
    if m.material == "": m.set_color(srgb_to_linear(hexrgb(b.skin)))
parts.update(build_face_details(b))
export(parts, sys.argv[2])
