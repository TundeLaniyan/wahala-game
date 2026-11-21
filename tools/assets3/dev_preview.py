"""Dev helper: build a body and write a static GLB (no skin) for the viewer.  python dev_preview.py out.glb [male|female]"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'assets'))
import numpy as np
import mhbody
from gltfio import GltfBuilder, Material
from loft import vertex_normals
import qem

def write_static(path, verts, tris, color=(0.55, 0.36, 0.25)):
    g = GltfBuilder()
    m = g.add_material(Material('skin', base_color=(*color, 1.0), roughness=0.6))
    mesh = g.add_mesh('body', [dict(positions=verts, normals=qem.smooth_normals(verts, tris), indices=tris, material=m)])
    g.add_node('body', None, mesh=mesh)
    return g.save(path)

if __name__ == '__main__':
    spec = mhbody.BodySpec(gender=1.0 if (sys.argv[2:3] or ['male'])[0] == 'male' else 0.0)
    b = mhbody.build_body(spec, height_m=1.80)
    print('verts', len(b.verts), 'tris', len(b.tris), 'bbox', b.verts.min(0).round(3), b.verts.max(0).round(3))
    for k in ('hips','spine','chest','neck','head','clavicle_L','upperarm_L','forearm_L','hand_L','thigh_L','shin_L','foot_L','toe_L'):
        print(k, b.joints[k].round(3))
    print('eyes', b.helpers['eye_L'].round(3), b.helpers['eye_R'].round(3), 'top', b.helpers['head_top'].round(3))
    print(write_static(sys.argv[1], b.verts, b.tris), 'bytes')
