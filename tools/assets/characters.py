"""The WAHALA! cast: outfit definitions. Each builder returns material-grouped meshes with region tags."""
from __future__ import annotations

import numpy as np

import outfits as o
from chargen import FEMALE, MALE_ATHLETIC, MALE_SLIM, build_body, build_face_details, hexrgb, paint, srgb_to_linear
from loft import Mesh, displace_along_normals, sphere, value_noise


def tag(m: Mesh, region: str) -> Mesh:
    m.region = [region] * len(m.v)
    return m


def cloth_fx(m: Mesh, wrinkle: float = 0.0028, seed: int = 11, shade: float = 0.20) -> Mesh:
    """Fabric wrinkles + fold shading baked into vertex colours."""
    n = value_noise(m.v, 26.0, seed=seed)
    displace_along_normals(m, n * wrinkle)
    m.c[:, :3] *= (1.0 - shade * (0.5 - 0.5 * n))[:, None]
    return m


def pick(n: int, rules, default: int) -> np.ndarray:
    """Colour per vertex: first matching (mask, hex) rule wins, else `default`. Returns [n,3] sRGB 0..1."""
    out = np.tile(hexrgb(default), (n, 1))
    taken = np.zeros(n, dtype=bool)
    for mask, h in rules:
        sel = mask & ~taken
        out[sel] = hexrgb(h)
        taken |= mask
    return out


def set_rgb(m: Mesh, h: int) -> Mesh:
    m.c[:, :3] = srgb_to_linear(hexrgb(h))
    return m


def finish_hair(meshes: list[Mesh], base: int, sheen: float = 0.25, seed: int = 2) -> list[Mesh]:
    for hm in meshes:
        set_rgb(hm, base)
        hm.c[:, :3] *= (1.0 + sheen * value_noise(hm.v, 70.0, seed=seed))[:, None].clip(0.6, 1.4)
    return meshes


# ----------------------------------------------------------------------------- Street Baller


def street_baller() -> dict:
    """Green & white varsity jacket, dark grey cargo joggers, colorful chunky sneakers, short twists with fade."""
    b = MALE_ATHLETIC
    green, white, deep = 0x168a44, 0xf4f2ea, 0x0c5e2c
    cargo_grey, cargo_pkt = 0x3b3e44, 0x2f3238
    gold, red_acc = 0xf5b814, 0xd82c24
    skin = build_body(b, skip=frozenset({"foot", "ForeArm", "Shin"}), lowres=frozenset({"torso", "upperarm", "thigh"}))
    cloth: list[Mesh] = []

    # Varsity jacket torso: green body, striped green/white rib-knit waistband & collar, white snap-button placket & chest emblem
    bounds = [0.83, 0.855, 0.88, 1.465, 1.49]
    jacket = o.torso_cloth(b, 0.81, 1.51, extra=0.020, baggy=0.014, sides=64, rings=34, boundaries=bounds, bottom_flare=0.018)

    def varsity_col(v):
        y, x, z = v[:, 1], v[:, 0], v[:, 2]
        placket = (z > 0.04) & (np.abs(x) < 0.016) & (y >= 0.88)
        snaps = (z > 0.05) & (np.abs(x) < 0.009) & (np.sin(y * 78.0) > 0.65)
        rib_stripe = ((y < 0.88) & (y >= 0.835) & (np.sin(y * 160.0) > 0.0)) | ((y > 1.465) & (np.sin(y * 160.0) > 0.0))
        pocket_slit = (z > 0.04) & (np.abs(np.abs(x) - 0.085) < 0.012) & (y > 0.94) & (y < 1.07)
        chest_patch = (z > 0.05) & (np.abs(x - 0.072) < 0.028) & (np.abs(y - 1.32) < 0.032)
        chest_patch_inner = (z > 0.05) & (np.abs(x - 0.072) < 0.016) & (np.abs(y - 1.32) < 0.018)
        return pick(
            len(v),
            [
                (snaps, white),
                (chest_patch_inner, gold),
                (chest_patch, white),
                (rib_stripe, white),
                (y < 0.88, deep),
                (y > 1.465, deep),
                (placket, deep),
                (pocket_slit, white),
            ],
            green,
        ) * (1 - 0.14 * np.clip((np.abs(x) - 0.11) / 0.07, 0, 1))[:, None]

    paint(jacket, varsity_col)
    cloth.append(tag(cloth_fx(jacket, wrinkle=0.0028, seed=11), "torso"))
    # White long sleeves with green shoulder inset & green/white striped rib cuffs
    for side in "LR":
        sl = o.sleeve(b, side, 1.92, extra=0.012, cuff_flare=0.004, sides=22, rings=16, cut=0.88)
        paint(
            sl,
            lambda v, m=sl: pick(
                len(v),
                [
                    (m.along < 0.16, green),
                    (m.along > 0.94, green),
                    (m.along > 0.90, white),
                    (m.along > 0.86, green),
                ],
                white,
            ),
        )
        cloth.append(tag(cloth_fx(sl, wrinkle=0.0028, seed=12), f"arm_{side}"))

    # Dark grey cargo joggers with side thigh cargo pockets
    pants = o.pelvis_cloth(b, 0.87, 0.72, extra=0.016)
    set_rgb(pants, cargo_grey)
    cloth.append(tag(cloth_fx(pants, seed=13), "torso"))
    for side in "LR":
        ms = 1.0 if side == "L" else -1.0
        jog = o.leg_cloth(b, side, 0.14, extra=0.018, flare=0.006, y_start_offset=-0.06)
        paint(
            jog,
            lambda v, mm=ms: pick(
                len(v),
                [
                    (v[:, 1] < 0.175, cargo_pkt),
                    ((np.abs(v[:, 1] - 0.56) < 0.085) & (v[:, 0] * mm > 0.105), cargo_pkt),
                ],
                cargo_grey,
            ),
        )
        cloth.append(tag(cloth_fx(jog, seed=14), f"leg_{side}"))
        sk = o.sock(b, side, 0.18)
        set_rgb(sk, white)
        cloth.append(tag(sk, f"leg_{side}"))
        # Multi-color chunky sneakers (green, white, yellow, red accents)
        shoe = o.sneaker(b, side, bulk=1.12)
        paint(
            shoe,
            lambda v: pick(
                len(v),
                [
                    (v[:, 1] < 0.028, white),
                    ((v[:, 1] >= 0.028) & (v[:, 1] < 0.038) & (v[:, 2] < 0.02), gold),
                    (v[:, 2] < -0.045, green),
                    ((v[:, 2] > 0.12) & (v[:, 1] > 0.032), green),
                    ((np.abs(v[:, 1] - 0.056) < 0.009) & (v[:, 2] > -0.01) & (v[:, 2] < 0.11), red_acc),
                ],
                white,
            ),
        )
        cloth.append(tag(shoe, f"foot_{side}"))

    # Short dreads/twists on top with a clean fade
    hair = [
        tag(o.hair_shell(b, 0.006, hairline=0.34, nape=-0.30, bumps=0.003), "head"),
        tag(o.short_curls(b, seed=7, n=65, radius=0.013), "head"),
        tag(o.locs(b, 18, 0.085, seed=8, droop=0.75, radius=0.0115), "head"),
    ]
    finish_hair(hair, 0x14100d)
    face = build_face_details(b)
    return dict(body=b, skin=list(skin.values()) + [face["ears"]], cloth=cloth, hair=hair + [face["brows"]], eyes=[face["eyes"]], accessory=[], name="streetBaller")


# ----------------------------------------------------------------------------- Lekki Boy


def lekki_boy() -> dict:
    """Royal-blue patterned bomber jacket over white tee + gold chain, dark navy tapered pants, blue/white chunky sneakers."""
    b = MALE_SLIM
    skin = build_body(b, skip=frozenset({"foot", "ForeArm", "Shin"}), lowres=frozenset({"torso", "upperarm", "thigh"}))
    royal, cyan_pat, gold_pat, white, dark_rib = 0x1d56c4, 0x18a8d8, 0xf2b718, 0xf4f2ec, 0x141824
    navy_pants = 0x1c2230
    cloth: list[Mesh] = []
    bounds = [0.85, 0.88, 1.46, 1.49]
    jacket = o.torso_cloth(b, 0.83, 1.51, extra=0.019, baggy=0.015, bottom_flare=0.012, sides=64, rings=34, boundaries=bounds)

    def jacket_col(v):
        y, x, z = v[:, 1], v[:, 0], v[:, 2]
        # Open-front bomber showing crisp white inner tee down the centre front
        inner_tee = (z > 0.03) & (np.abs(x) < 0.042) & (y >= 0.85) & (y < 1.48)
        zip_edge = (z > 0.03) & (np.abs(np.abs(x) - 0.045) < 0.006) & (y >= 0.88) & (y < 1.46)
        # Subtle luxury/Ankara geometric diamond pattern on the royal blue jacket panels
        pat_val = np.sin(x * 42.0) * np.sin(y * 42.0 + z * 20.0)
        pat_gold = (pat_val > 0.62) & (~inner_tee) & (y >= 0.88) & (y <= 1.46)
        pat_cyan = (pat_val < -0.58) & (~inner_tee) & (y >= 0.88) & (y <= 1.46)
        return pick(
            len(v),
            [
                (inner_tee, white),
                (zip_edge, gold_pat),
                (y < 0.88, dark_rib),
                (y > 1.46, dark_rib),
                (pat_gold, gold_pat),
                (pat_cyan, cyan_pat),
            ],
            royal,
        )

    paint(jacket, jacket_col)
    cloth.append(tag(cloth_fx(jacket, wrinkle=0.0035, seed=21), "torso"))
    for side in "LR":
        sl = o.sleeve(b, side, 1.92, extra=0.016, cuff_flare=0.006, sides=22, rings=16, cut=0.89)
        paint(
            sl,
            lambda v, m=sl: pick(
                len(v),
                [
                    (m.along > 0.89, dark_rib),
                    ((np.sin(v[:, 1] * 40.0) * np.cos(v[:, 2] * 40.0)) > 0.60, cyan_pat),
                ],
                royal,
            ),
        )
        cloth.append(tag(cloth_fx(sl, wrinkle=0.004, seed=22), f"arm_{side}"))

    pants = o.pelvis_cloth(b, 0.88, 0.72, extra=0.016)
    set_rgb(pants, navy_pants)
    cloth.append(tag(cloth_fx(pants, seed=23), "torso"))
    for side in "LR":
        m = 1.0 if side == "L" else -1.0
        jog = o.leg_cloth(b, side, 0.14, extra=0.016, flare=0.004, y_start_offset=-0.06)
        paint(jog, lambda v, mm=m: pick(len(v), [(v[:, 1] < 0.17, 0x2c3548), ((v[:, 0] * mm > 0.126) & (v[:, 0] * mm < 0.142), cyan_pat)], navy_pants))
        cloth.append(tag(cloth_fx(jog, seed=24), f"leg_{side}"))
        sk = o.sock(b, side, 0.18)
        set_rgb(sk, white)
        cloth.append(tag(sk, f"leg_{side}"))
        shoe = o.sneaker(b, side, bulk=1.14)
        paint(shoe, lambda v: pick(len(v), [(v[:, 1] < 0.030, white), ((v[:, 2] > 0.09) | (v[:, 2] < -0.045), royal), (np.abs(v[:, 1] - 0.052) < 0.008, cyan_pat)], white))
        cloth.append(tag(shoe, f"foot_{side}"))
    hair = [tag(o.hair_shell(b, 0.005, hairline=0.38, nape=-0.40), "head"), tag(o.short_curls(b, n=58, radius=0.014), "head")]
    finish_hair(hair, 0x0e0b09)
    face = build_face_details(b)
    acc = [tag(m, "head") for m in o.sunglasses(b)] + [tag(o.chain(b, 1.32), "torso")]
    return dict(body=b, skin=list(skin.values()) + [face["ears"]], cloth=cloth, hair=hair + [face["brows"]], eyes=[face["eyes"]], accessory=acc, name="lekkiBoy")


# ----------------------------------------------------------------------------- Campus Queen


def campus_queen() -> dict:
    """Vibrant multi-color Ankara bomber jacket over white top, green track pants with dual yellow side stripes, long braids & gold hoops."""
    b = FEMALE
    skin = build_body(b, skip=frozenset({"foot", "ForeArm", "Shin"}), lowres=frozenset({"torso", "upperarm", "thigh"}))
    ank_red, ank_gold, ank_cyan, ank_navy = 0xe23228, 0xf6c218, 0x169ad8, 0x181c2c
    track_green, stripe_yel, white = 0x167c42, 0xf8cc1b, 0xf5f2ea
    cloth: list[Mesh] = []
    bounds = [1.06, 1.09, 1.42, 1.45]
    jacket = o.torso_cloth(b, 1.05, 1.46, extra=0.017, baggy=0.013, bottom_flare=0.014, sides=64, rings=34, boundaries=bounds)

    def ankara_jacket_col(v):
        y, x, z = v[:, 1], v[:, 0], v[:, 2]
        inner_top = (z > 0.03) & (np.abs(x) < 0.038) & (y >= 1.06) & (y < 1.43)
        # Bold multi-color Ankara floral/geometric motifs across the bomber jacket
        u1 = np.sin(x * 38.0 + y * 24.0) * np.cos(y * 36.0 - z * 28.0)
        u2 = np.cos(x * 32.0 - z * 30.0) * np.sin(y * 44.0)
        return pick(
            len(v),
            [
                (inner_top, white),
                (y < 1.09, ank_navy),
                (y > 1.42, ank_navy),
                (u1 > 0.32, ank_gold),
                (u2 > 0.34, ank_cyan),
                ((u1 + u2) < -0.45, ank_navy),
            ],
            ank_red,
        )

    paint(jacket, ankara_jacket_col)
    cloth.append(tag(cloth_fx(jacket, wrinkle=0.0035, seed=31), "torso"))
    for side in "LR":
        sl = o.sleeve(b, side, 1.9, extra=0.014, cuff_flare=0.005, sides=22, rings=16, cut=0.90)
        paint(
            sl,
            lambda v, m=sl: pick(
                len(v),
                [
                    (m.along > 0.90, ank_navy),
                    (np.sin(v[:, 1] * 38.0 + v[:, 2] * 30.0) > 0.30, ank_gold),
                    (np.cos(v[:, 1] * 34.0 - v[:, 0] * 28.0) > 0.36, ank_cyan),
                ],
                ank_red,
            ),
        )
        cloth.append(tag(cloth_fx(sl, seed=32), f"arm_{side}"))

    # Green track pants with dark bomber waist trim & dual yellow vertical side stripes
    pants = o.pelvis_cloth(b, 1.10, 0.72, extra=0.016, boundaries=[1.07])
    paint(pants, lambda v: pick(len(v), [(v[:, 1] > 1.07, ank_navy), (np.abs(v[:, 0]) > 0.135, stripe_yel)], track_green))
    cloth.append(tag(cloth_fx(pants, seed=33), "torso"))
    for side in "LR":
        m = 1.0 if side == "L" else -1.0
        pl = o.leg_cloth(b, side, 0.12, extra=0.016, flare=0.010, y_start_offset=-0.06)
        # Dual yellow vertical track stripes along the outer leg seam
        paint(
            pl,
            lambda v, mm=m: pick(
                len(v),
                [
                    ((v[:, 0] * mm > 0.112) & (np.abs(v[:, 2] - 0.006) < 0.010), stripe_yel),
                    ((v[:, 0] * mm > 0.112) & (np.abs(v[:, 2] + 0.018) < 0.010), stripe_yel),
                ],
                track_green,
            ),
        )
        cloth.append(tag(cloth_fx(pl, seed=34), f"leg_{side}"))
        shoe = o.sneaker(b, side, bulk=1.12)
        paint(
            shoe,
            lambda v: pick(
                len(v),
                [
                    (v[:, 1] < 0.032, white),
                    (v[:, 2] < -0.045, ank_red),
                    (v[:, 2] > 0.11, stripe_yel),
                    (np.abs(v[:, 1] - 0.052) < 0.008, ank_cyan),
                ],
                white,
            ),
        )
        cloth.append(tag(shoe, f"foot_{side}"))
    # Long box braids cascading past the shoulders + dual high puffs
    hair = [
        tag(o.hair_shell(b, 0.006, hairline=0.32, nape=-0.28), "head"),
        tag(o.puff(b, 1, seed=2, size=0.062), "head"),
        tag(o.puff(b, -1, seed=3, size=0.062), "head"),
        tag(o.locs(b, count=28, length=0.22, seed=11, droop=1.05, radius=0.0115), "head"),
    ]
    finish_hair(hair, 0x120d0a)
    face = build_face_details(b)
    acc = [tag(m, "head") for m in o.hoop_earrings(b, stripe_yel)]
    return dict(body=b, skin=list(skin.values()) + [face["ears"]], cloth=cloth, hair=hair + [face["brows"]], eyes=[face["eyes"]], accessory=acc, name="campusQueen")


# ----------------------------------------------------------------------------- Area Boss (4th Competitor / Bot Look)


def area_boss() -> dict:
    """Purple & gold bomber jacket over yellow tee + gold chain, red baseball cap, dark trousers, purple/yellow chunky sneakers."""
    b = MALE_ATHLETIC
    skin = build_body(b, skip=frozenset({"foot", "ForeArm", "Shin"}), lowres=frozenset({"torso", "upperarm", "thigh"}))
    purple, deep_purp, gold, white = 0x6226b6, 0x3b1574, 0xf6c218, 0xf5f2ea
    dark_pants = 0x22242c
    cloth: list[Mesh] = []
    bounds = [0.83, 0.855, 0.88, 1.465, 1.49]
    jacket = o.torso_cloth(b, 0.81, 1.51, extra=0.020, baggy=0.015, sides=64, rings=34, boundaries=bounds, bottom_flare=0.018)

    def boss_col(v):
        y, x, z = v[:, 1], v[:, 0], v[:, 2]
        inner_tee = (z > 0.03) & (np.abs(x) < 0.040) & (y >= 0.85) & (y < 1.48)
        zip_edge = (z > 0.03) & (np.abs(np.abs(x) - 0.044) < 0.006) & (y >= 0.88) & (y < 1.46)
        rib_stripe = ((y < 0.88) & (y >= 0.835) & (np.sin(y * 160.0) > 0.0)) | ((y > 1.465) & (np.sin(y * 160.0) > 0.0))
        chest_patch = (z > 0.05) & (np.abs(x - 0.072) < 0.028) & (np.abs(y - 1.32) < 0.032)
        return pick(
            len(v),
            [
                (inner_tee, gold),
                (zip_edge, gold),
                (chest_patch, gold),
                (rib_stripe, gold),
                (y < 0.88, deep_purp),
                (y > 1.465, deep_purp),
            ],
            purple,
        ) * (1 - 0.14 * np.clip((np.abs(x) - 0.11) / 0.07, 0, 1))[:, None]

    paint(jacket, boss_col)
    cloth.append(tag(cloth_fx(jacket, wrinkle=0.0028, seed=41), "torso"))
    for side in "LR":
        sl = o.sleeve(b, side, 1.92, extra=0.012, cuff_flare=0.004, sides=22, rings=16, cut=0.88)
        paint(
            sl,
            lambda v, m=sl: pick(
                len(v),
                [
                    (m.along < 0.16, purple),
                    (m.along > 0.94, deep_purp),
                    (m.along > 0.90, gold),
                    (m.along > 0.86, deep_purp),
                ],
                gold,
            ),
        )
        cloth.append(tag(cloth_fx(sl, wrinkle=0.0028, seed=42), f"arm_{side}"))

    pants = o.pelvis_cloth(b, 0.87, 0.72, extra=0.016)
    set_rgb(pants, dark_pants)
    cloth.append(tag(cloth_fx(pants, seed=43), "torso"))
    for side in "LR":
        ms = 1.0 if side == "L" else -1.0
        jog = o.leg_cloth(b, side, 0.14, extra=0.017, flare=0.005, y_start_offset=-0.06)
        paint(
            jog,
            lambda v, mm=ms: pick(
                len(v),
                [
                    ((v[:, 0] * mm > 0.125) & (np.abs(v[:, 2]) < 0.012), gold),
                ],
                dark_pants,
            ),
        )
        cloth.append(tag(cloth_fx(jog, seed=44), f"leg_{side}"))
        sk = o.sock(b, side, 0.18)
        set_rgb(sk, white)
        cloth.append(tag(sk, f"leg_{side}"))
        shoe = o.sneaker(b, side, bulk=1.12)
        paint(
            shoe,
            lambda v: pick(
                len(v),
                [
                    (v[:, 1] < 0.028, white),
                    (v[:, 2] < -0.045, purple),
                    ((v[:, 2] > 0.11) & (v[:, 1] > 0.032), gold),
                    (np.abs(v[:, 1] - 0.054) < 0.008, purple),
                ],
                white,
            ),
        )
        cloth.append(tag(shoe, f"foot_{side}"))

    hair = [tag(o.hair_shell(b, 0.005, hairline=0.36, nape=-0.34), "head")]
    finish_hair(hair, 0x120d0a)
    cap_parts = o.baseball_cap(b, crown_col=0xd9242c, visor_col=0xb81820, badge_col=gold)
    cloth += cap_parts
    face = build_face_details(b)
    acc = [tag(o.chain(b, 1.32, color=gold), "torso")]
    return dict(body=b, skin=list(skin.values()) + [face["ears"]], cloth=cloth, hair=hair + [face["brows"]], eyes=[face["eyes"]], accessory=acc, name="areaBoss")


CAST = {"streetBaller": street_baller, "lekkiBoy": lekki_boy, "campusQueen": campus_queen, "areaBoss": area_boss}
