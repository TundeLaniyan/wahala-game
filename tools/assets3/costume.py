"""Costume recipes on the MakeHuman-derived skin: tops, trousers, skirts, robes, vests, armour, headgear, hair and props.

Every recipe cuts a garment from the body surface (charkit.garment: clipped exactly on an SDF, offset along the smooth body
normals), decimates it with its borders locked and appends it to `ctx.G`.  `Ctx` carries the body, joints, masks and head box.
"""
from __future__ import annotations

import numpy as np

import charkit as ck
import mhbody
from charkit import Part, bsum, hexrgb


def _col(c):
    return hexrgb(int(c)) if isinstance(c, (int, np.integer)) else np.asarray(c, dtype=float)


class Ctx:
    def __init__(self, spec: mhbody.BodySpec, height_m: float, src_verts: int = 9500):
        self.spec = spec
        self.skin, self.b = ck.make_skin(spec, height_m, target_verts=src_verts)
        self.j = self.b.joints
        self.v = self.skin.v
        w = self.skin.w
        self.M = dict(
            torso=bsum(w, ["hips", "spine", "chest", "clavicle_L", "clavicle_R"]),
            arms=bsum(w, ["upperarm_L", "upperarm_R", "forearm_L", "forearm_R"]),
            hands=bsum(w, ["hand_L", "hand_R"]),
            legs=bsum(w, ["thigh_L", "thigh_R", "shin_L", "shin_R"]),
            feet=bsum(w, ["foot_L", "foot_R", "toe_L", "toe_R"]),
            head=bsum(w, ["head", "neck"]),
        )
        self.G: list[Part] = []
        self.neck_y = self.j["neck"][1] + 0.005
        self.hip_y = self.j["hips"][1]
        j = self.j
        hv = self.v[self.v[:, 1] > j["head"][1] + 0.03]
        self.H = dict(
            cx=0.0, cz=(hv[:, 2].min() + hv[:, 2].max()) / 2, rx=(hv[:, 0].max() - hv[:, 0].min()) / 2, rz=(hv[:, 2].max() - hv[:, 2].min()) / 2,
            top=hv[:, 1].max(), eye_y=(self.b.helpers["eye_L"][1] + self.b.helpers["eye_R"][1]) / 2,
        )
        self.torso_arm = (self.M["torso"] > 0.35) | (self.M["arms"] > 0.35)
        self.legs_reg = (self.M["legs"] > 0.35) | (self.M["feet"] > 0.2) | ((self.M["torso"] > 0.3) & (self.v[:, 1] < self.hip_y + 0.05))

    # --------------------------------------------------------------------------------------- helpers
    def add(self, p: Part | list, verts: int | None = None) -> None:
        for q in p if isinstance(p, list) else [p]:
            self.G.append(ck.decimate_part(q, verts) if verts else q)

    def armw(self, p: np.ndarray) -> np.ndarray:
        """Arm skin-weight (upper arm + forearm + hand) at arbitrary points, from the nearest body vertices."""
        if not hasattr(self, "_tree"):
            from scipy.spatial import cKDTree

            self._tree = cKDTree(self.v)
            self._armw = bsum(self.skin.w, ["upperarm_L", "upperarm_R", "forearm_L", "forearm_R", "hand_L", "hand_R"])
        _, i = self._tree.query(p)
        return self._armw[i]

    def arm_cut(self, frac: float):
        """Keep-field ending both sleeves with a clean cut perpendicular to the arm, `frac` of the way from shoulder to wrist
        (frac >= 1 cuts just past the wrist joint)."""
        planes = {}
        for s in ("L", "R"):
            sh, wr = self.j[f"upperarm_{s}"], self.j[f"hand_{s}"]
            d = wr - sh
            L = np.linalg.norm(d)
            d = d / L
            pt = sh + d * (L * frac + (0.035 if frac >= 1 else 0.0))
            planes[s] = (pt, -d)  # normal points back toward the shoulder: positive = kept

        def f(v):
            out = np.full(len(v), 1e3)
            for s, (pt, nrm) in planes.items():
                side = (v[:, 0] > 0) if s == "L" else (v[:, 0] < 0)
                out = np.where(side & (np.abs(v[:, 0]) > 0.17), np.minimum(out, (v - pt) @ nrm), out)
            return out

        return f

    def neck_hole(self, radius: float, depth: float = 0.13, y_off: float = 0.0):
        j = self.j

        def f(p):
            r = np.sqrt(p[:, 0] ** 2 + (p[:, 2] - j["neck"][2]) ** 2)
            return np.where(p[:, 1] > self.neck_y + y_off - depth, r - radius, 1.0)

        return f

    # --------------------------------------------------------------------------------------- garments
    def top(self, name, color, *, hem=0.115, sleeve=1.0, base=0.012, loose=0.014, loose_from=1.32, neck_r=0.064, neck_drop=0.0, open_front=0.0, budget=1900, mat="cloth", relax=3, short_hem=None) -> Part:
        """Shirt / tee / jacket. hem = metres below the hip joint; sleeve = fraction of the arm (0 = sleeveless cut at the shoulder)."""
        j = self.j
        hem_y = self.hip_y - hem
        ac = self.arm_cut(sleeve) if sleeve > 0 else None
        reg = self.torso_arm if sleeve > 0 else ((self.M["torso"] > 0.3) | (self.M["arms"] > 0.2))
        neck = self.neck_hole(neck_r, y_off=-neck_drop)

        def sdf(p):
            fs = [p[:, 1] - hem_y, neck(p)]
            if ac is not None:
                fs.append(ac(p))
            else:
                fs.append(0.42 - self.armw(p))  # sleeveless: the armhole follows the arm's skin-weight gradient
            if open_front > 0:
                fs.append(np.maximum(np.abs(p[:, 0]) - open_front, -(p[:, 2] - (j["spine"][2] + 0.012))))
            return np.minimum.reduce(fs)

        off = lambda p: base + loose * np.clip((loose_from - p[:, 1]) / 0.35, 0, 1) * (np.abs(p[:, 0]) < 0.17)
        g = ck.garment(self.skin, reg, sdf, off, name, mat, color=_col(color), relax_iters=relax)
        self.add(g, budget)
        return self.G[-1]

    def trousers(self, name, color, *, top_off=0.0, hem=0.05, base=0.014, flare=0.0, loose=0.0, budget=1400, mat="cloth", knee=None, taper=0.0) -> Part:
        """Long trousers / shorts: from the waist to `hem` metres above the ground (shorts: hem = knee height)."""
        top_y = self.hip_y + 0.045 + top_off

        def sdf(p):
            return np.minimum(p[:, 1] - hem, top_y - p[:, 1])

        def off(p):
            t = np.clip((self.hip_y - p[:, 1]) / max(self.hip_y - hem, 0.1), 0, 1)
            return base + loose * np.sin(np.pi * np.clip(t, 0, 1)) * 0.6 + flare * t**2 - taper * t

        g = ck.garment(self.skin, self.legs_reg | self.torso_arm, sdf, off, name, mat, color=_col(color), relax_iters=2)
        self.add(g, budget)
        return self.G[-1]

    def skirt(self, name, color, *, hem=0.08, base=0.03, flare=0.14, waist_off=0.0, budget=1500, mat="cloth") -> Part:
        """Wrapper / long skirt: waist to `hem`, hanging and flaring (offset grows with the distance below the hip)."""
        top_y = self.hip_y + 0.07

        def sdf(p):
            return np.minimum(p[:, 1] - hem, top_y - p[:, 1])

        def off(p):
            t = np.clip((self.hip_y - p[:, 1]) / max(self.hip_y - hem, 0.1), 0, 1)
            return base + flare * t**1.3

        g = ck.garment(self.skin, self.legs_reg | self.torso_arm, sdf, off, name, mat, color=_col(color), relax_iters=4, gap=0.012)
        self.add(g, budget)
        return self.G[-1]

    def robe(self, name, color, *, hem=0.20, base=0.03, body_flare=0.10, sleeve_flare=0.11, sleeve=0.95, budget=2400, mat="cloth", neck_r=0.07) -> Part:
        """Agbada-style loose robe: wide body and wide sleeves hanging from the shoulders."""
        j = self.j
        ac = self.arm_cut(sleeve)
        neck = self.neck_hole(neck_r)
        reg = self.torso_arm | ((self.M["legs"] > 0.3) & (self.v[:, 1] > 0.5))

        def sdf(p):
            return np.minimum.reduce([p[:, 1] - hem, neck(p), ac(p)])

        def off(p):
            arm = np.clip((np.abs(p[:, 0]) - 0.16) / 0.2, 0, 1)
            torso = np.clip((1.40 - p[:, 1]) / 0.55, 0, 1) * (np.abs(p[:, 0]) < 0.17)
            return base + sleeve_flare * arm**1.2 + body_flare * torso

        g = ck.garment(self.skin, reg, sdf, off, name, mat, color=_col(color), relax_iters=5, gap=0.014)
        self.add(g, budget)
        return self.G[-1]

    def shoes(self, kind="sneaker", **kw) -> None:
        import kit_shoes

        for s in ("L", "R"):
            parts = kit_shoes.boot(self.skin, self.j, s, **kw) if kind == "boot" else kit_shoes.sneaker(self.skin, self.j, s, **kw)
            for sp in parts:
                self.add(sp, 450)

    # --------------------------------------------------------------------------------------- body parts
    def box(self, name, center, size, bone, color, radius=0.006, mat="cloth", R=None, budget=None) -> Part:
        p = ck.prim_box(name, mat, center, size, bone, _col(color), radius=radius, R=R)
        self.add(p, budget)
        return p

    def limb_ring(self, name, side: str, a: str, b_: str, at: float, length: float, grow: float, color, mat="cloth", bone=None, sides=14) -> Part:
        """A band / bracelet / glove cuff around a limb segment from joint a toward b at fraction `at`."""
        pa, pb = self.j[a], self.j[b_]
        ax = (pb - pa) / np.linalg.norm(pb - pa)
        c = pa + (pb - pa) * at
        d = np.linalg.norm(self.v - c, axis=1)
        near = d < 0.05
        # radius from skin vertices within a slab around the centre
        rel = self.v - c
        along = rel @ ax
        perp = rel - along[:, None] * ax
        pn = np.linalg.norm(perp, axis=1)
        slab = (np.abs(along) < 0.025) & (pn < 0.10) & (pn > 0.01)
        r = float(np.percentile(pn[slab], 75)) if slab.sum() > 4 else 0.04
        r = min(r, 0.09)
        p = ck.prim_cyl(name, mat, c - ax * length / 2, c + ax * length / 2, r + grow, r + grow, bone or a, _col(color), sides=sides)
        self.add(p)
        return p

    # --------------------------------------------------------------------------------------- face / head
    def eyewear(self, name="glasses", color=0x0b0b0e, frame=0xc8a24a, lens_alpha=1.0, wide=1.0) -> None:
        j, hp = self.j, self.b.helpers
        ey, ez = (hp["eye_L"][1] + hp["eye_R"][1]) / 2, hp["eye_L"][2]
        ex = abs(hp["eye_L"][0])
        for s in (1, -1):
            lens = ck.prim_ellipsoid(f"{name}_lens", "plastic", (s * ex, ey, ez + 0.024), (0.022 * wide, 0.016, 0.0035), "head", hexrgb(color), lat=6, lon=12)
            self.add(lens)
        self.add(ck.prim_box(f"{name}_bridge", "metal", (0, ey + 0.004, ez + 0.026), (0.016, 0.004, 0.004), "head", hexrgb(frame), radius=0.0015))
        for s in (1, -1):
            self.add(ck.prim_box(f"{name}_arm", "metal", (s * (ex + 0.024), ey + 0.004, ez - 0.02), (0.003, 0.004, 0.09), "head", hexrgb(frame), radius=0.0012))


# ------------------------------------------------------------------------------------------------ extras on Ctx


def torso_radii(self, y: float, width: float = 0.02):
    """Half width, half depth and centre z of the torso at height y (from the skin vertices of the trunk)."""
    sel = (np.abs(self.v[:, 1] - y) < width) & (self.M["torso"] > 0.5) & (self.M["arms"] < 0.3)
    q = self.v[sel]
    return (q[:, 0].max() - q[:, 0].min()) / 2, (q[:, 2].max() - q[:, 2].min()) / 2, (q[:, 2].max() + q[:, 2].min()) / 2


def belt(self, name, color, y: float, height: float = 0.04, grow: float = 0.030, buckle: int | None = 0xb7b2a4) -> None:
    rx, rz, cz = self.torso_radii(y)
    self.add(ck.prim_cyl(name, "leather", (0, y - height / 2, cz), (0, y + height / 2, cz), rx + grow, rx + grow, "hips", hexrgb(color), sides=30, rz=rz + grow, exponent=2.5))
    if buckle is not None:
        self.add(ck.prim_box(name + "_buckle", "metal", (0, y, cz + rz + grow + 0.002), (0.045, height * 0.8, 0.006), "hips", hexrgb(buckle), radius=0.002))


def pouch(self, name, x: float, y: float, size, color, bone="hips", side_z=None, radius=0.008) -> None:
    rx, rz, cz = self.torso_radii(y)
    z = cz + np.sqrt(max(rz**2 * (1 - min((abs(x) / (rx + 1e-6)) ** 2, 0.95)), 0.0)) + size[2] / 2 + 0.028 if side_z is None else side_z
    self.add(ck.prim_box(name, "cloth", (x, y, z), size, bone, hexrgb(color), radius=radius))


Ctx.torso_radii = torso_radii
Ctx.belt = belt
Ctx.pouch = pouch


def decal(self, src: Part, rect, face: str, draw, size=(512, 256), lift: float = 0.0013, name="decal") -> None:
    """A printed patch on a garment: the garment faces inside `rect` = (x0, x1, y0, y1), front or back, lifted 1.3 mm, with
    planar UVs into this character's decal atlas (2 x 2 tiles of 512 px). `draw(ImageDraw, (w, h))` paints the tile."""
    from PIL import Image, ImageDraw

    x0, x1, y0, y1 = rect
    g = src.copy()
    zc = self.j["spine"][2]
    sgn = 1.0 if face == "front" else -1.0
    f = np.minimum.reduce([g.v[:, 0] - x0, x1 - g.v[:, 0], g.v[:, 1] - y0, y1 - g.v[:, 1], sgn * (g.v[:, 2] - zc) + 0.02])
    g = ck.clip(g, f)
    if len(g.t) == 0:
        return
    n = ck.normals(g)
    g.v = g.v + n * lift
    k = len(self.decals)
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw(ImageDraw.Draw(img), size)
    self.decals.append(img)
    u = (g.v[:, 0] - x0) / (x1 - x0)
    if face == "back":
        u = 1.0 - u
    v = (g.v[:, 1] - y0) / (y1 - y0)
    tx, ty = (k % 2) * 0.5, (k // 2) * 0.5
    g.uv = np.stack([tx + np.clip(u, 0, 1) * 0.5, 1.0 - (ty + (1.0 - np.clip(v, 0, 1)) * 0.5)], axis=1)  # OBJ-style v (flipped at export)
    g.mat = "decal"
    g.c[:] = 1.0
    g.name = name
    self.G.append(g)


def decal_atlas(self):
    from PIL import Image

    if not self.decals:
        return None
    atlas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    for k, img in enumerate(self.decals[:4]):
        atlas.paste(img.resize((512, 512)), ((k % 2) * 512, (k // 2) * 512))
    return atlas


Ctx.decal = decal
Ctx.decal_atlas = decal_atlas
_orig_init = Ctx.__init__


def _init(self, *a, **kw):
    _orig_init(self, *a, **kw)
    self.decals = []


Ctx.__init__ = _init
