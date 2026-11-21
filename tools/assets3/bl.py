"""Headless Blender (bpy) helpers for the character pipeline: decimation with a density mask, UV unwrap / pack, smoothing."""
from __future__ import annotations

import numpy as np

import bpy  # pip install bpy  (Blender as a Python module)


def _new_object(name: str, verts: np.ndarray, faces: list, uv: np.ndarray | None = None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], [list(map(int, f)) for f in faces])
    me.update()
    if uv is not None:
        layer = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uv[me.loops[li].vertex_index]
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _read(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    v = np.array([tuple(x.co) for x in me.vertices])
    tri = np.array([tuple(t.vertices) for t in me.loop_triangles])
    lt = np.array([tuple(t.loops) for t in me.loop_triangles])
    uv = None
    if me.uv_layers:
        l = me.uv_layers[0].data
        uv_loop = np.array([tuple(d.uv) for d in l])
        uv = uv_loop[lt]  # [F, 3, 2] per triangle corner
    ev.to_mesh_clear()
    return v, tri, uv


def decimate(verts: np.ndarray, tris: np.ndarray, keep: np.ndarray, ratio: float, uv_corner: np.ndarray | None = None, factor: float = 1.0):
    """Collapse-decimate a triangle mesh. `keep` in 0..1 per vertex (1 = protect detail); `uv_corner` [F,3,2] per-corner UVs.
    Returns (verts, tris, uv_corner)."""
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    me = bpy.data.meshes.new("m")
    me.from_pydata(verts.tolist(), [], tris.tolist())
    me.update()
    if uv_corner is not None:
        layer = me.uv_layers.new(name="UVMap")
        for fi, poly in enumerate(me.polygons):
            for k, li in enumerate(poly.loop_indices):
                layer.data[li].uv = uv_corner[fi, k]
    ob = bpy.data.objects.new("m", me)
    bpy.context.scene.collection.objects.link(ob)
    vg = ob.vertex_groups.new(name="keep")
    for i, w in enumerate(keep):
        vg.add([i], float(1.0 - w), "REPLACE")  # Blender: weight 1 = collapse more; callers pass keep = detail to protect
    md = ob.modifiers.new("dec", "DECIMATE")
    md.decimate_type = "COLLAPSE"
    md.ratio = ratio
    md.vertex_group = "keep"
    md.vertex_group_factor = factor
    md.use_collapse_triangulate = True
    md.use_symmetry = False
    return _read(ob)
