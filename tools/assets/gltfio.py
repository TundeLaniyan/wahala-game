"""Minimal glTF 2.0 (GLB) writer: meshes with vertex colours, skins, animations and embedded images.

Pure numpy, no Blender required. Conventions follow docs/ASSET_PIPELINE.md: Y-up, metres, front = +Z.
"""
from __future__ import annotations

import io
import json
import struct
from dataclasses import dataclass, field

import numpy as np

FLOAT, UBYTE, USHORT, UINT = 5126, 5121, 5123, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def _pad4(b: bytes, pad: bytes = b"\x00") -> bytes:
    return b + pad * ((4 - len(b) % 4) % 4)


@dataclass
class Material:
    name: str
    base_color: tuple = (1.0, 1.0, 1.0, 1.0)
    metallic: float = 0.0
    roughness: float = 0.8
    emissive: tuple = (0.0, 0.0, 0.0)
    emissive_strength: float = 1.0
    double_sided: bool = False
    alpha: str | None = None  # 'BLEND' | 'MASK'
    texture: int | None = None  # image index (sRGB base colour)
    normal_texture: int | None = None
    orm_texture: int | None = None  # R=occlusion G=roughness B=metallic


class GltfBuilder:
    def __init__(self, generator: str = "WAHALA asset tools") -> None:
        self.generator = generator
        self.bin = bytearray()
        self.views: list[dict] = []
        self.accessors: list[dict] = []
        self.meshes: list[dict] = []
        self.nodes: list[dict] = []
        self.materials: list[Material] = []
        self.images: list[dict] = []
        self.textures: list[dict] = []
        self.skins: list[dict] = []
        self.animations: list[dict] = []
        self.scene_nodes: list[int] = []

    # ------------------------------------------------------------------ buffers
    def _view(self, data: bytes, target: int | None = None) -> int:
        offset = len(self.bin)
        self.bin += _pad4(data)
        v = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target:
            v["target"] = target
        self.views.append(v)
        return len(self.views) - 1

    def _accessor(self, arr: np.ndarray, ctype: int, kind: str, target: int | None = None, normalized: bool = False, minmax: bool = False) -> int:
        dt = {FLOAT: np.float32, UBYTE: np.uint8, USHORT: np.uint16, UINT: np.uint32}[ctype]
        a = np.ascontiguousarray(arr.astype(dt))
        view = self._view(a.tobytes(), target)
        acc = {"bufferView": view, "componentType": ctype, "count": int(a.shape[0]), "type": kind}
        if normalized:
            acc["normalized"] = True
        if minmax:
            acc["min"] = a.min(axis=0).astype(float).tolist() if a.ndim > 1 else [float(a.min())]
            acc["max"] = a.max(axis=0).astype(float).tolist() if a.ndim > 1 else [float(a.max())]
        self.accessors.append(acc)
        return len(self.accessors) - 1

    # ------------------------------------------------------------------ resources
    def add_material(self, m: Material) -> int:
        self.materials.append(m)
        return len(self.materials) - 1

    def add_image(self, png_or_jpeg: bytes, mime: str = "image/png") -> int:
        view = self._view(png_or_jpeg)
        self.images.append({"bufferView": view, "mimeType": mime})
        return len(self.images) - 1

    def add_texture(self, image: int) -> int:
        self.textures.append({"source": image, "sampler": 0})
        return len(self.textures) - 1

    def add_mesh(self, name: str, primitives: list[dict]) -> int:
        """primitives: dicts with positions[N,3], normals[N,3], indices[M,3], material(int) and optional
        colors[N,4] (0..1), uvs[N,2], joints[N,4] (int), weights[N,4]."""
        prims = []
        for p in primitives:
            attrs = {
                "POSITION": self._accessor(p["positions"], FLOAT, "VEC3", ARRAY_BUFFER, minmax=True),
                "NORMAL": self._accessor(p["normals"], FLOAT, "VEC3", ARRAY_BUFFER),
            }
            if p.get("colors") is not None:
                c = np.clip(np.asarray(p["colors"]), 0, 1)
                if c.shape[1] == 3:
                    c = np.concatenate([c, np.ones((c.shape[0], 1))], axis=1)
                attrs["COLOR_0"] = self._accessor(np.round(c * 255), UBYTE, "VEC4", ARRAY_BUFFER, normalized=True)
            if p.get("uvs") is not None:
                attrs["TEXCOORD_0"] = self._accessor(p["uvs"], FLOAT, "VEC2", ARRAY_BUFFER)
            if p.get("joints") is not None:
                attrs["JOINTS_0"] = self._accessor(p["joints"], USHORT, "VEC4", ARRAY_BUFFER)
                attrs["WEIGHTS_0"] = self._accessor(p["weights"], FLOAT, "VEC4", ARRAY_BUFFER)
            idx = np.asarray(p["indices"]).reshape(-1)
            ctype = UINT if idx.max() > 65534 else USHORT
            prim = {
                "attributes": attrs,
                "indices": self._accessor(idx, ctype, "SCALAR", ELEMENT_ARRAY_BUFFER),
                "material": p["material"],
                "mode": 4,
            }
            prims.append(prim)
        self.meshes.append({"name": name, "primitives": prims})
        return len(self.meshes) - 1

    def add_node(self, name: str, parent: int | None = None, translation=None, rotation=None, scale=None, mesh: int | None = None, skin: int | None = None) -> int:
        n: dict = {"name": name}
        if translation is not None and any(abs(t) > 1e-9 for t in translation):
            n["translation"] = [float(t) for t in translation]
        if rotation is not None:
            n["rotation"] = [float(r) for r in rotation]
        if scale is not None:
            n["scale"] = [float(s) for s in scale]
        if mesh is not None:
            n["mesh"] = mesh
        if skin is not None:
            n["skin"] = skin
        self.nodes.append(n)
        idx = len(self.nodes) - 1
        if parent is None:
            self.scene_nodes.append(idx)
        else:
            self.nodes[parent].setdefault("children", []).append(idx)
        return idx

    def add_skin(self, name: str, joints: list[int], inverse_bind: np.ndarray, skeleton_root: int) -> int:
        acc = self._accessor(_col_major(inverse_bind), FLOAT, "MAT4")
        self.skins.append({"name": name, "joints": joints, "inverseBindMatrices": acc, "skeleton": skeleton_root})
        return len(self.skins) - 1

    def add_animation(self, name: str, channels: list[tuple[int, str, np.ndarray, np.ndarray]]) -> None:
        """channels: (node, 'rotation'|'translation'|'scale', times[K], values[K,3|4])."""
        samplers, chans = [], []
        for node, path, times, values in channels:
            t = self._accessor(np.asarray(times, dtype=np.float32), FLOAT, "SCALAR", minmax=True)
            kind = "VEC4" if path == "rotation" else "VEC3"
            v = self._accessor(np.asarray(values, dtype=np.float32), FLOAT, kind)
            samplers.append({"input": t, "output": v, "interpolation": "LINEAR"})
            chans.append({"sampler": len(samplers) - 1, "target": {"node": node, "path": path}})
        self.animations.append({"name": name, "samplers": samplers, "channels": chans})

    # ------------------------------------------------------------------ output
    def to_glb(self) -> bytes:
        mats = []
        for m in self.materials:
            pbr: dict = {"baseColorFactor": list(m.base_color), "metallicFactor": m.metallic, "roughnessFactor": m.roughness}
            if m.texture is not None:
                pbr["baseColorTexture"] = {"index": m.texture}
            if m.orm_texture is not None:
                pbr["metallicRoughnessTexture"] = {"index": m.orm_texture}
            d: dict = {"name": m.name, "pbrMetallicRoughness": pbr, "doubleSided": m.double_sided}
            if any(m.emissive):
                d["emissiveFactor"] = list(m.emissive)
                if m.emissive_strength != 1.0:
                    d.setdefault("extensions", {})["KHR_materials_emissive_strength"] = {"emissiveStrength": m.emissive_strength}
            if m.normal_texture is not None:
                d["normalTexture"] = {"index": m.normal_texture}
            if m.orm_texture is not None:
                d["occlusionTexture"] = {"index": m.orm_texture}
            if m.alpha:
                d["alphaMode"] = m.alpha
            mats.append(d)
        used = []
        if any(m.emissive_strength != 1.0 for m in self.materials):
            used.append("KHR_materials_emissive_strength")
        doc: dict = {
            "asset": {"version": "2.0", "generator": self.generator},
            "scene": 0,
            "scenes": [{"nodes": self.scene_nodes}],
            "nodes": self.nodes,
            "buffers": [{"byteLength": len(self.bin)}],
            "bufferViews": self.views,
            "accessors": self.accessors,
            "materials": mats,
        }
        if self.meshes:
            doc["meshes"] = self.meshes
        if self.skins:
            doc["skins"] = self.skins
        if self.animations:
            doc["animations"] = self.animations
        if self.images:
            doc["images"] = self.images
            doc["textures"] = self.textures
            doc["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
        if used:
            doc["extensionsUsed"] = used
        js = _pad4(json.dumps(doc, separators=(",", ":")).encode(), b" ")
        binary = _pad4(bytes(self.bin))
        total = 12 + 8 + len(js) + 8 + len(binary)
        out = io.BytesIO()
        out.write(struct.pack("<4sII", b"glTF", 2, total))
        out.write(struct.pack("<I4s", len(js), b"JSON"))
        out.write(js)
        out.write(struct.pack("<I4s", len(binary), b"BIN\x00"))
        out.write(binary)
        return out.getvalue()

    def save(self, path: str) -> int:
        data = self.to_glb()
        with open(path, "wb") as f:
            f.write(data)
        return len(data)


def _col_major(mats: np.ndarray) -> np.ndarray:
    """glTF matrices are column-major; our numpy matrices are row-major [N,4,4] -> flat [N,16]."""
    return np.asarray(mats).transpose(0, 2, 1).reshape(-1, 16)


def quat_from_euler_xyz(rx: float, ry: float, rz: float) -> np.ndarray:
    """Euler angles in radians applied in X, then Y, then Z order (intrinsic XYZ) -> quaternion (x,y,z,w)."""
    cx, sx = np.cos(rx / 2), np.sin(rx / 2)
    cy, sy = np.cos(ry / 2), np.sin(ry / 2)
    cz, sz = np.cos(rz / 2), np.sin(rz / 2)
    # q = qx * qy * qz
    qx = np.array([sx, 0, 0, cx])
    qy = np.array([0, sy, 0, cy])
    qz = np.array([0, 0, sz, cz])
    return qmul(qmul(qx, qy), qz)


def qmul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array(
        [
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz,
        ]
    )
