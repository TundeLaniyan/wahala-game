"""Headgear and hair, fitted to the measured head box (Ctx.H): caps, helmets, peaked caps, berets, fila, gele, hats, afro, locs."""
from __future__ import annotations

import numpy as np

import charkit as ck
from charkit import hexrgb


def _dome(ctx, name, color, base_y, mx=0.008, mz=0.010, top_m=0.010, shift_z=0.0, scale_h=1.0, lat=14, lon=24, mat="cloth"):
    H = ctx.H
    rad = (H["rx"] + mx, (H["top"] - base_y + top_m) * scale_h, H["rz"] + mz)
    p = ck.prim_ellipsoid(name, mat, (0.0, base_y, H["cz"] + shift_z), rad, "head", hexrgb(color), lat=lat, lon=lon)
    return ck.clip(p, p.v[:, 1] - (base_y - 0.002))


def cap(ctx, color, brim_color=None, backward=False, base_off=0.040, panel=None):
    """Baseball cap: crown dome, curved brim, button, optional contrast front panel colour."""
    H = ctx.H
    base_y = H["eye_y"] + base_off
    crown = _dome(ctx, "cap", color, base_y, mx=0.010, mz=0.012, top_m=0.013, shift_z=-0.006 if backward else 0.004)
    ctx.add(crown)
    sgn = -1.0 if backward else 1.0
    brim = ck.prim_ellipsoid("brim", "cloth", (0.0, base_y + 0.002, H["cz"] + sgn * (H["rz"] + 0.046)), (0.060, 0.0045, 0.072), "head", hexrgb(brim_color or color), lat=6, lon=16, R=ck.rotmat("x", -sgn * 16))
    ctx.add(brim)
    ctx.add(ck.prim_ellipsoid("cap_button", "cloth", (0.0, H["top"] + 0.012, H["cz"]), (0.009, 0.006, 0.009), "head", hexrgb(color), lat=5, lon=8))


def helmet(ctx, color, rim_color=None, strap=0x1c1b1a, brim=True, ear_cover=0.0):
    """Military-style helmet: deep dome, rolled rim, chin strap and a small front badge plate."""
    H = ctx.H
    base_y = H["eye_y"] + 0.012
    dome = _dome(ctx, "helmet", color, base_y, mx=0.022, mz=0.024, top_m=0.030, lat=16, lon=26)
    ctx.add(dome)
    rim = ck.prim_cyl("helmet_rim", "cloth", (0, base_y - 0.012, H["cz"]), (0, base_y + 0.006, H["cz"]), H["rx"] + 0.030, H["rx"] + 0.026, "head", hexrgb(rim_color or color), sides=26, rz=H["rz"] + 0.032)
    ctx.add(rim)
    if brim:
        ctx.add(ck.prim_ellipsoid("helmet_brim", "cloth", (0.0, base_y - 0.002, H["cz"] + H["rz"] + 0.030), (0.074, 0.005, 0.034), "head", hexrgb(color), lat=6, lon=14, R=ck.rotmat("x", -10)))
    for s in (1, -1):
        ctx.add(ck.prim_path("strap", "leather", [(s * (H["rx"] + 0.020), base_y - 0.012, H["cz"] + 0.01), (s * (H["rx"] + 0.012), base_y - 0.085, H["cz"] + 0.035), (s * 0.03, ctx.j["head"][1] - 0.10, H["cz"] + 0.095)], [0.004, 0.004, 0.004], "head", hexrgb(strap), sides=5, caps=False))
    ctx.add(ck.prim_box("badge", "metal", (0.0, base_y + 0.032, H["cz"] + H["rz"] + 0.018), (0.034, 0.030, 0.004), "head", hexrgb(0x9b8a55), radius=0.0015, R=ck.rotmat("x", -18)))


def hardhat(ctx, color, band=None):
    H = ctx.H
    base_y = H["eye_y"] + 0.025
    ctx.add(_dome(ctx, "hardhat", color, base_y, mx=0.016, mz=0.018, top_m=0.022, lat=14, lon=26))
    ctx.add(ck.prim_cyl("hat_brim", "cloth", (0, base_y - 0.004, H["cz"]), (0, base_y + 0.004, H["cz"]), H["rx"] + 0.045, H["rx"] + 0.042, "head", hexrgb(color), sides=26, rz=H["rz"] + 0.050))
    ctx.add(ck.prim_box("hat_ridge", "cloth", (0.0, H["top"] + 0.020, H["cz"]), (0.026, 0.012, H["rz"] * 1.7), "head", hexrgb(band or color), radius=0.005))


def peaked_cap(ctx, color, band=0x141416, badge=0xd8a83a):
    """Flat-topped patrol / officer cap with a stiff peak."""
    H = ctx.H
    base_y = H["eye_y"] + 0.040
    ctx.add(ck.prim_cyl("peak_crown", "cloth", (0, base_y, H["cz"]), (0, base_y + 0.070, H["cz"]), H["rx"] + 0.014, H["rx"] + 0.034, "head", hexrgb(color), sides=26, rz=H["rz"] + 0.016))
    ctx.add(ck.prim_cyl("peak_top", "cloth", (0, base_y + 0.066, H["cz"]), (0, base_y + 0.080, H["cz"]), H["rx"] + 0.034, H["rx"] + 0.030, "head", hexrgb(color), sides=26, rz=H["rz"] + 0.038))
    ctx.add(ck.prim_cyl("peak_band", "cloth", (0, base_y - 0.002, H["cz"]), (0, base_y + 0.020, H["cz"]), H["rx"] + 0.016, H["rx"] + 0.019, "head", hexrgb(band), sides=26, rz=H["rz"] + 0.018))
    ctx.add(ck.prim_ellipsoid("peak_visor", "leather", (0.0, base_y - 0.002, H["cz"] + H["rz"] + 0.034), (0.060, 0.004, 0.044), "head", hexrgb(0x0e0e0f), lat=6, lon=16, R=ck.rotmat("x", -14)))
    ctx.add(ck.prim_box("peak_badge", "metal", (0.0, base_y + 0.030, H["cz"] + H["rz"] + 0.019), (0.026, 0.026, 0.004), "head", hexrgb(badge), radius=0.0015))


def beret(ctx, color, tilt=14, badge=None):
    H = ctx.H
    base_y = H["eye_y"] + 0.045
    p = ck.prim_ellipsoid("beret", "cloth", (0.012, base_y + 0.014, H["cz"] - 0.004), (H["rx"] + 0.030, 0.050, H["rz"] + 0.030), "head", hexrgb(color), lat=10, lon=22, R=ck.rotmat("z", tilt))
    ctx.add(p)
    if badge:
        ctx.add(ck.prim_ellipsoid("beret_badge", "metal", (-0.04, base_y + 0.012, H["cz"] + H["rz"] + 0.012), (0.012, 0.012, 0.004), "head", hexrgb(badge), lat=5, lon=8))


def fila(ctx, color, trim=None):
    """Yoruba fila: a soft folded cap, slightly tilted, with a rolled front fold."""
    H = ctx.H
    base_y = H["eye_y"] + 0.045
    ctx.add(ck.prim_cyl("fila", "cloth", (0, base_y, H["cz"]), (0, base_y + 0.090, H["cz"] - 0.01), H["rx"] + 0.014, H["rx"] + 0.050, "head", hexrgb(color), sides=22, rz=H["rz"] + 0.016, exponent=2.4))
    ctx.add(ck.prim_cyl("fila_fold", "cloth", (0, base_y - 0.002, H["cz"]), (0, base_y + 0.030, H["cz"]), H["rx"] + 0.016, H["rx"] + 0.020, "head", hexrgb(trim or color), sides=22, rz=H["rz"] + 0.018))


def gele(ctx, color, accent=None, size=1.0):
    """Gele head tie: a tall, wide folded fan of cloth built from overlapping lobes rising over the head."""
    H = ctx.H
    c = hexrgb(color)
    base_y = H["eye_y"] + 0.040
    lobes = [
        ((0.0, base_y + 0.050, H["cz"]), (H["rx"] + 0.050 * size, 0.060 * size, H["rz"] + 0.040 * size), 0),
        ((0.075 * size, base_y + 0.105 * size, H["cz"] - 0.02), (0.095 * size, 0.070 * size, 0.100 * size), -22),
        ((-0.075 * size, base_y + 0.100 * size, H["cz"] - 0.01), (0.095 * size, 0.070 * size, 0.100 * size), 22),
        ((0.0, base_y + 0.165 * size, H["cz"] + 0.015), (0.125 * size, 0.060 * size, 0.100 * size), 0),
        ((0.045 * size, base_y + 0.215 * size, H["cz"] - 0.01), (0.075 * size, 0.050 * size, 0.075 * size), -30),
    ]
    for i, (cc, rr, rot) in enumerate(lobes):
        ctx.add(ck.prim_ellipsoid(f"gele_{i}", "cloth", cc, rr, "head", c * (0.90 + 0.06 * i), lat=10, lon=18, R=ck.rotmat("z", rot)))
    ctx.add(ck.prim_cyl("gele_band", "cloth", (0, base_y - 0.006, H["cz"]), (0, base_y + 0.026, H["cz"]), H["rx"] + 0.020, H["rx"] + 0.024, "head", hexrgb(accent or color), sides=24, rz=H["rz"] + 0.022))


def bucket_hat(ctx, color):
    H = ctx.H
    base_y = H["eye_y"] + 0.040
    ctx.add(_dome(ctx, "bucket", color, base_y, mx=0.012, mz=0.014, top_m=0.012, scale_h=0.9))
    ctx.add(ck.prim_cyl("bucket_brim", "cloth", (0, base_y - 0.006, H["cz"]), (0, base_y + 0.004, H["cz"]), H["rx"] + 0.062, H["rx"] + 0.055, "head", hexrgb(color), sides=24, rz=H["rz"] + 0.064))


def flat_cap(ctx, color):
    H = ctx.H
    base_y = H["eye_y"] + 0.038
    ctx.add(_dome(ctx, "flatcap", color, base_y, mx=0.020, mz=0.024, top_m=-0.004, scale_h=0.55, shift_z=0.012))
    ctx.add(ck.prim_ellipsoid("flatcap_peak", "cloth", (0.0, base_y + 0.002, H["cz"] + H["rz"] + 0.034), (0.052, 0.0045, 0.044), "head", hexrgb(color), lat=6, lon=14, R=ck.rotmat("x", -10)))


def afro(ctx, color, size=1.0, noise=0.010, seed=4):
    """Rounded natural hair volume around the crown."""
    H = ctx.H
    rng = np.random.default_rng(seed)
    base_y = H["eye_y"] + 0.040
    p = ck.prim_ellipsoid("afro", "hair", (0.0, base_y + 0.030 * size, H["cz"] - 0.004), (H["rx"] + 0.032 * size, (H["top"] - base_y) + 0.050 * size, H["rz"] + 0.034 * size), "head", hexrgb(color), lat=14, lon=24)
    p = ck.clip(p, p.v[:, 1] - (base_y - 0.015))
    n = ck.normals(p)
    bump = rng.normal(0, 1, len(p.v))
    disp = noise * 0.5 * np.sin(p.v[:, 0] * 90 + p.v[:, 2] * 70) + noise * 0.4 * bump
    p.v = p.v + n * disp[:, None]
    p.c = p.c * (0.85 + 0.3 * rng.random((len(p.v), 1)))
    ctx.add(p)


def locs(ctx, color, count=26, length=0.30, ponytail=True, radius=0.0115, seed=7, tie_y=None):
    """Faux locs: tubes from the crown that gather into a high ponytail and hang down the back."""
    H = ctx.H
    rng = np.random.default_rng(seed)
    base_y = H["eye_y"] + 0.045
    tie = np.array([0.0, base_y + 0.065, H["cz"] - H["rz"] * 0.55])
    for i in range(count):
        ang = 2 * np.pi * i / count + rng.uniform(-0.1, 0.1)
        start = np.array([np.sin(ang) * (H["rx"] * 0.9), base_y + 0.030 + 0.030 * np.cos(ang * 2), H["cz"] + np.cos(ang) * H["rz"] * 0.9])
        mid = tie + (start - tie) * 0.35 + np.array([0, 0.015, -0.01])
        end = tie + np.array([rng.uniform(-0.04, 0.04), -length * rng.uniform(0.6, 1.0), -0.05 - rng.uniform(0, 0.05)])
        pts = [start, mid, tie, (tie + end) / 2 + np.array([0, 0, -0.03]), end]
        w = ck.prim_path("loc", "hair", pts, [radius, radius * 0.9, radius, radius * 0.95, radius * 0.7], "head", hexrgb(color) * (0.85 + 0.25 * rng.random()), sides=5, caps=True, rings=10)
        # the lower half hangs from the head / neck: blend weights toward the chest with the drop below the head joint
        t = np.clip((ctx.j["head"][1] - w.v[:, 1] + 0.05) / 0.3, 0, 1)
        w.w = w.w * (1 - t)[:, None] + ck.bone_w(len(w.v), "chest") * t[:, None]
        ctx.add(w)
    ctx.add(ck.prim_cyl("pony_tie", "cloth", tie + np.array([0, 0.012, 0]), tie + np.array([0, -0.014, 0]), 0.035, 0.035, "head", hexrgb(0xd9a22a), sides=12))


def bun(ctx, color, size=1.0):
    H = ctx.H
    ctx.add(ck.prim_ellipsoid("bun", "hair", (0.0, H["top"] - 0.004, H["cz"] - 0.050), (0.040 * size, 0.032 * size, 0.040 * size), "head", hexrgb(color), lat=8, lon=14))
