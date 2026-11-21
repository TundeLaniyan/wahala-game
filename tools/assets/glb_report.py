"""Static statistics of GLB files: size, triangles, vertices, materials, textures, skins/joints and animation data.

    python3 tools/assets/glb_report.py src/assets/models/char_agbero.glb [more.glb ...]

Animation memory = the bytes of every animation sampler's input (times) and output (values) accessor, which is what the
loaded clip keeps as keyframe tracks (three.js copies them into Float32 arrays)."""
from __future__ import annotations

import json
import struct
import sys

CT = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def report(path: str) -> dict:
    data = open(path, "rb").read()
    jl = struct.unpack_from("<I", data, 12)[0]
    g = json.loads(data[20 : 20 + jl])
    acc = g["accessors"]
    size = lambda i: acc[i]["count"] * NC[acc[i]["type"]] * CT[acc[i]["componentType"]]  # noqa: E731
    tris = verts = 0
    for m in g.get("meshes", []):
        for p in m["primitives"]:
            tris += acc[p["indices"]]["count"] // 3 if "indices" in p else 0
            verts += acc[p["attributes"]["POSITION"]]["count"]
    anim_bytes = keys = 0
    for a in g.get("animations", []):
        for s in a["samplers"]:
            anim_bytes += size(s["input"]) + size(s["output"])
        keys += max(acc[s["input"]]["count"] for s in a["samplers"])
    return dict(
        file=path.split("/")[-1],
        file_kb=round(len(data) / 1024),
        triangles=tris,
        vertices=verts,
        meshes=len(g.get("meshes", [])),
        materials=len(g.get("materials", [])),
        textures=len(g.get("textures", [])),
        joints=sum(len(s["joints"]) for s in g.get("skins", [])),
        clips=len(g.get("animations", [])),
        clip_names=[a["name"] for a in g.get("animations", [])],
        anim_kb=round(anim_bytes / 1024, 1),
        keyframes_per_track_total=keys,
    )


if __name__ == "__main__":
    for p in sys.argv[1:]:
        r = report(p)
        names = r.pop("clip_names")
        print(json.dumps(r))
        print("   clips:", ", ".join(names))
