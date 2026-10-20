"""Developer helper: composes a mock arena GLB out of the generated environment models so the whole kit can be
judged from the game camera (not shipped; writes src/assets/models/_test_arena.glb which should be deleted).

    python3 tools/assets/env_preview.py [name]

Scenes: arena (default), row (buildings), etc. -- see SCENES."""
from __future__ import annotations

import json
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from env_lib import OUT_DIR, rot_matrix  # noqa: E402


def load_glb(path: str):
    data = open(path, "rb").read()
    jl = struct.unpack("<I", data[12:16])[0]
    js = json.loads(data[20 : 20 + jl])
    bl = struct.unpack("<I", data[20 + jl : 24 + jl])[0]
    binary = data[28 + jl : 28 + jl + bl]
    return js, binary


def quat_y(deg: float):
    a = np.radians(deg) / 2
    return [0.0, float(np.sin(a)), 0.0, float(np.cos(a))]


def compose(instances, out_name: str):
    """instances: list of (glb file name without extension, (x, y, z), yaw_deg, uniform scale)."""
    doc = dict(asset={"version": "2.0", "generator": "env_preview"}, scene=0, scenes=[{"nodes": []}], nodes=[], buffers=[], bufferViews=[], accessors=[], materials=[], meshes=[], images=[], textures=[], samplers=[{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}])
    blob = bytearray()
    sources: dict[str, dict] = {}
    used_ext = set()

    def add_source(name):
        if name in sources:
            return sources[name]
        js, b = load_glb(os.path.join(OUT_DIR, name + ".glb"))
        bv_off = len(doc["bufferViews"])
        acc_off = len(doc["accessors"])
        mat_off = len(doc["materials"])
        mesh_off = len(doc["meshes"])
        img_off = len(doc["images"])
        tex_off = len(doc["textures"])
        base = len(blob)
        blob.extend(b)
        for v in js["bufferViews"]:
            v = dict(v)
            v["buffer"] = 0
            v["byteOffset"] = v.get("byteOffset", 0) + base
            doc["bufferViews"].append(v)
        for a in js["accessors"]:
            a = dict(a)
            a["bufferView"] += bv_off
            doc["accessors"].append(a)
        for im in js.get("images", []):
            im = dict(im)
            im["bufferView"] += bv_off
            doc["images"].append(im)
        for t in js.get("textures", []):
            t = dict(t)
            t["source"] += img_off
            t["sampler"] = 0
            doc["textures"].append(t)
        for m in js["materials"]:
            m = json.loads(json.dumps(m))
            pbr = m["pbrMetallicRoughness"]
            for k in ("baseColorTexture", "metallicRoughnessTexture"):
                if k in pbr:
                    pbr[k]["index"] += tex_off
            for k in ("normalTexture", "occlusionTexture"):
                if k in m:
                    m[k]["index"] += tex_off
            for e in m.get("extensions", {}):
                used_ext.add(e)
            doc["materials"].append(m)
        for me in js["meshes"]:
            me = json.loads(json.dumps(me))
            for p in me["primitives"]:
                p["attributes"] = {k: v + acc_off for k, v in p["attributes"].items()}
                p["indices"] += acc_off
                p["material"] += mat_off
            doc["meshes"].append(me)
        sources[name] = dict(js=js, mesh_off=mesh_off)
        return sources[name]

    for name, pos, yaw, scale in instances:
        src = add_source(name)
        js, mesh_off = src["js"], src["mesh_off"]
        base_idx = len(doc["nodes"])
        for n in js["nodes"]:
            n = dict(n)
            if "mesh" in n:
                n["mesh"] += mesh_off
            if "children" in n:
                n["children"] = [c + base_idx for c in n["children"]]
            doc["nodes"].append(n)
        root = base_idx + js["scenes"][0]["nodes"][0]
        r = doc["nodes"][root]
        r["translation"] = [float(x) for x in pos]
        r["rotation"] = quat_y(yaw)
        if scale != 1.0:
            r["scale"] = [scale] * 3
        doc["scenes"][0]["nodes"].append(root)
    doc["buffers"] = [{"byteLength": len(blob)}]
    if used_ext:
        doc["extensionsUsed"] = sorted(used_ext)
    js_b = json.dumps(doc, separators=(",", ":")).encode()
    js_b += b" " * ((4 - len(js_b) % 4) % 4)
    blob += b"\x00" * ((4 - len(blob) % 4) % 4)
    total = 12 + 8 + len(js_b) + 8 + len(blob)
    path = os.path.join(OUT_DIR, out_name)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js_b), b"JSON"))
        f.write(js_b)
        f.write(struct.pack("<I4s", len(blob), b"BIN\x00"))
        f.write(blob)
    print(f"{out_name}: {len(instances)} instances, {total // 1024} KB")


def arena(cols=13, rows=11, seed=3):
    rng = np.random.default_rng(seed)
    inst = []
    ox, oz = -(cols - 1) / 2, -(rows - 1) / 2
    # pillars on odd/odd grid points
    variants = ["prop_pillar_a", "prop_pillar_b", "prop_pillar_c"]
    for ix in range(cols):
        for iz in range(rows):
            if ix % 2 == 1 and iz % 2 == 1:
                inst.append((variants[(ix * 3 + iz) % 3], (ox + ix, 0, oz + iz), float(rng.choice([0, 90, 180, 270])), 1.0))
    softs = ["prop_soft_crate", "prop_soft_crates", "prop_soft_tyres", "prop_soft_sacks", "prop_soft_barrier", "prop_soft_cartons", "prop_soft_kegs", "prop_soft_crate_b"]
    for ix in range(cols):
        for iz in range(rows):
            if ix % 2 == 1 and iz % 2 == 1:
                continue
            if (ix < 2 and iz < 2) or (ix > cols - 3 and iz > rows - 3):
                continue
            if rng.random() < 0.42:
                inst.append((softs[int(rng.integers(len(softs)))], (ox + ix, 0, oz + iz), float(rng.uniform(-14, 14)) + float(rng.choice([0, 90])), 1.0))
    # perimeter walls (z rows north/south, x columns west/east) with corner posts
    wl = ["env_wall", "env_wall_b", "env_wall_c"]
    x0, x1 = ox - 0.5, ox + cols - 0.5
    z0, z1 = oz - 0.5, oz + rows - 0.5
    k = 0
    for i in range(cols):
        for z, yaw in ((z0 - 0.15, 0), (z1 + 0.15, 180)):
            inst.append((wl[(i + k) % 3], (ox + i, 0, z), float(yaw), 1.0))
        k += 1
    for j in range(rows):
        for x, yaw in ((x0 - 0.15, 90), (x1 + 0.15, -90)):
            inst.append((wl[(j + k) % 3], (x, 0, oz + j), float(yaw), 1.0))
        k += 1
    for x, z in ((x0 - 0.15, z0 - 0.15), (x1 + 0.15, z0 - 0.15), (x0 - 0.15, z1 + 0.15), (x1 + 0.15, z1 + 0.15)):
        inst.append(("env_wall_corner", (x, 0, z), 0.0, 1.0))
    # buildings behind the north wall and along the sides
    bl = ["env_building_a", "env_building_b", "env_building_c", "env_building_d"]
    for i, x in enumerate(np.arange(x0 + 1.6, x1, 3.3)):
        inst.append((bl[i % 4], (float(x), 0, z0 - 2.0), 0.0, 1.0))
    for j, z in enumerate(np.arange(z0 + 2.0, z1 - 1.0, 3.0)):
        inst.append((bl[(j + 1) % 4], (x0 - 2.3, 0, float(z)), 90.0, 1.0))
    inst.append(("env_kiosk", (x1 + 2.5, 0, oz + 2.0), -90.0, 1.0))
    inst.append(("env_lamp", (x1 + 0.9, 0, oz + 1.0), -90.0, 1.0))
    inst.append(("env_poles", (x0 - 0.9, 0, z1 + 1.2), 0.0, 1.0))
    inst.append(("env_tyrestack", (x1 + 0.7, 0, z1 + 0.2), 0.0, 1.0))
    inst.append(("env_barrel", (x0 - 0.7, 0, z1 + 0.3), 0.0, 1.0))
    for i in range(cols):
        if i % 2 == 0:
            inst.append(("env_bleacher", (ox + i, 0, z1 + 0.65), 0.0, 1.0))
    return inst


def row(names=("env_building_a", "env_building_b", "env_building_c", "env_building_d"), gap=3.3):
    return [(n, (i * gap - gap * (len(names) - 1) / 2, 0, 0), 0.0, 1.0) for i, n in enumerate(names)]


SCENES = {"arena": arena, "row": row}


if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "arena"
    compose(SCENES[name](), f"_test_{name}.glb")
