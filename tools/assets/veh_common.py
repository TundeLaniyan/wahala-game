"""Pieces shared by all vehicle builders: material specs, wheels, windows, grime colour function."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

import tex_veh
import vehicles_lib as V
from vehicles_lib import Mesh, Model, Spec, merge, place


tex_veh.install()


def std_specs(paint_tone=0xf9c80e, wear=0.45, decal_tex: str | None = None, paint_uv=1.2, paint_args=None) -> dict[str, Spec]:
    args = dict(tone=paint_tone, wear=wear)
    if paint_args:
        args.update(paint_args)
    specs = {
        "paint": Spec(color=(1, 1, 1, 1), roughness=0.5, texture="van_paint", tex_args=args, uv_m=paint_uv, smooth_deg=55),
        "glass": Spec(color=(1, 1, 1, 1), roughness=0.07, metallic=0.3, smooth_deg=60),
        "trim": Spec(color=(1, 1, 1, 1), roughness=0.72, smooth_deg=50),
        "tyre": Spec(color=(1, 1, 1, 1), roughness=0.9, texture="tyre_rubber", tex_args=dict(tone=0x2c2c2f), uv_m=0.35, smooth_deg=65),
        "chrome": Spec(color=(0.88, 0.89, 0.92, 1), roughness=0.2, metallic=1.0, smooth_deg=55),
        "steel": Spec(color=(1, 1, 1, 1), roughness=0.5, metallic=0.55, smooth_deg=55),
        "lamp": Spec(color=(1, 1, 1, 1), roughness=0.2, emissive=(1.0, 0.90, 0.62), emissive_strength=0.85, smooth_deg=60),
    }
    if decal_tex:
        specs["decal"] = Spec(color=(1, 1, 1, 1), roughness=1.0, texture=decal_tex, smooth_deg=89)
    return specs


# ----------------------------------------------------------------------------- grime / rust vertex colours


def rust_color_fn(body: V.Body, axle_pts, seed: int = 1, stripe=(0.295, 0.415), yellow_ok: bool = True, ao_y=(0.14, 0.50), dark=0.42, black=(0.05, 0.05, 0.055), arch_r=0.27, base=(1.0, 1.0, 1.0)):
    """Vertex colour function for Body.build: paint bands, ground grime / AO and rust near the wheel arches."""
    rustc = V.lin(0x8a4518)
    muddy = V.lin(0x7b6a4c)
    axles = np.array(axle_pts)

    def fn(y, pts, band):
        y_eff = y + band * 1e-4
        n = len(pts)
        black_band = stripe is not None and (stripe[0] < y_eff < stripe[1])
        col = np.tile(np.array(black if black_band else base, dtype=np.float64), (n, 1))
        if black_band:
            col = np.tile(np.array([0.006, 0.006, 0.007]), (n, 1))
        noise = V.value_noise(pts, 7.0, seed)
        gr = V.value_noise(pts, 21.0, seed + 5)
        # ground contact AO / dust
        k = np.full(n, 1.0 - dark * float(np.clip((ao_y[1] - y) / (ao_y[1] - ao_y[0]), 0, 1)) ** 1.3)
        col = col * k[:, None]
        if not black_band:
            col = col * (1.0 - 0.14 * (0.5 - 0.5 * noise))[:, None]
            mud = float(np.clip((0.32 - y) / 0.2, 0, 1)) * np.clip(0.5 + 0.7 * gr, 0, 1)
            col = col * (1 - mud[:, None] * 0.45) + muddy[None] * (mud[:, None] * 0.45) * 0.55
            # rust blooming around each arch (only on sides)
            for ax in axles:
                dz = pts[:, 2] - ax[2]
                dy = y - ax[1]
                d = np.sqrt(dz**2 + dy**2)
                side = np.clip((np.abs(pts[:, 0]) - 0.22) * 14, 0, 1) * (np.sign(pts[:, 0]) == np.sign(ax[0]))
                amt = np.clip((arch_r + 0.07 * gr - d) / 0.06, 0, 1) * side * np.clip(0.7 + 1.0 * noise, 0, 1)
                col = col * (1 - amt[:, None] * 0.85) + rustc[None] * amt[:, None] * 0.85
            # low scuffs at the nose / tail corners
            corner = np.clip((np.abs(pts[:, 2]) - 0.68) * 12, 0, 1) * float(np.clip((0.30 - y) * 8, 0, 1)) * np.clip(0.5 + 0.8 * gr, 0, 1)
            col = col * (1 - 0.35 * corner[:, None])
        return col

    return fn


# ----------------------------------------------------------------------------- windows


def window_set(proj, uc, vc, w, h, r, glass_out, gasket_out, frame_out, spacing=0.05, mullion=True, glass_col=(0.035, 0.07, 0.095), tint=1.0, ref_fn=V.axis_ref, pad=0.014, mull_at=-0.06, streaks=True, **_kw):
    """Glass + black gasket frame + sliding-window rail for one window on a surface (u across, v up)."""
    gk = V.frame_strip(proj, uc, vc, w, h, r, pad, spacing, off=0.0055, ref_fn=ref_fn)
    V.paint(gk, 0x0e0e10)
    gasket_out.append(gk)
    gl = V.grid_patch(proj, uc, vc, w, h, r, spacing, off=0.0068, ref_fn=ref_fn)
    frac = np.clip((gl.v[:, 1] - (vc - h / 2)) / h, 0, 1)
    lo = np.array(glass_col) * 2.2
    hi = np.array(glass_col) * 0.8
    gl.c[:, :3] = (hi[None] + (lo - hi)[None] * (frac[:, None] ** 1.6)) * tint
    warm = np.clip((0.34 - frac) / 0.34, 0, 1)[:, None] ** 1.2 * 0.55
    gl.c[:, :3] = gl.c[:, :3] * (1 - warm) + np.array([0.075, 0.05, 0.03])[None] * warm
    glass_out.append(gl)
    # soft sky-reflection streaks (thin lighter parallelograms)
    if streaks:
        sky = np.array([0.13, 0.18, 0.22])
        for (x0, x1, wd) in ((-0.26, -0.02, 0.085), (-0.12, 0.0, 0.03)):
            slant = 0.22 * h
            a0, a1 = uc + w * x0, uc + w * x0 + w * wd
            xs = [a0 + slant * 0.0, a1, a1 + slant * 1.6 * (w / h) * 0.5, a0 + slant * 1.6 * (w / h) * 0.5]
            ytop_, ybot_ = vc + h / 2 - 0.012, vc - h / 2 + 0.012
            poly = np.array([(xs[0], ybot_), (xs[1], ybot_), (xs[2], ytop_), (xs[3], ytop_)])
            # clamp into the window span
            poly[:, 0] = np.clip(poly[:, 0], uc - w / 2 + 0.02, uc + w / 2 - 0.02)
            cen = poly.mean(axis=0)
            sp = V.patch(proj, poly, tuple(cen), rings=2, off=0.0071, ref_fn=ref_fn)
            sp.c[:, :3] = sky * (0.55 + 0.45 * np.clip((sp.v[:, 1] - ybot_) / max(ytop_ - ybot_, 1e-6), 0, 1))[:, None]
            glass_out.append(sp)
    if mullion:
        pts = [(uc - w / 2 + 0.01, vc + h * mull_at), (uc + w / 2 - 0.01, vc + h * mull_at)]
        rb = V.ribbon(proj, pts, 0.008, off=0.0088, ref_fn=ref_fn)
        V.paint(rb, 0x151517)
        frame_out.append(rb)


def poly_window(proj, poly, glass_out, gasket_out, frame_out=None, pad=0.012, rings=3, glass_col=(0.035, 0.07, 0.095), tint=1.0, ref_fn=V.axis_ref, off_g=0.0055, streaks=True, sky=(0.13, 0.18, 0.22)):
    """Window from a dense convex CCW outline in surface (u, v): black gasket ring + glass (+ optional reflection streak)."""
    poly = np.asarray(poly)
    cen = poly.mean(axis=0)
    outer = V.offset_poly(poly, pad)
    inner = V.offset_poly(poly, -0.004)
    gk = V.ring_strip(proj, outer, inner, off=off_g - 0.0015, ref_fn=ref_fn)
    V.paint(gk, 0x0e0e10)
    gasket_out.append(gk)
    gl = V.patch(proj, poly, tuple(cen), rings=rings, off=off_g, ref_fn=ref_fn)
    lo, hi = poly[:, 1].min(), poly[:, 1].max()
    # the glass mesh's own vertices carry the height gradient
    fr = np.clip((gl.v[:, 1] - gl.v[:, 1].min()) / max(np.ptp(gl.v[:, 1]), 1e-6), 0, 1)
    dark = np.array(glass_col)
    gl.c[:, :3] = (dark * 0.8 + dark * 1.4 * (fr[:, None] ** 1.6)) * tint
    warm = np.clip((0.30 - fr) / 0.30, 0, 1)[:, None] ** 1.2 * 0.5
    gl.c[:, :3] = gl.c[:, :3] * (1 - warm) + np.array([0.075, 0.05, 0.03])[None] * warm
    glass_out.append(gl)
    if streaks:
        w = poly[:, 0].max() - poly[:, 0].min()
        h = hi - lo
        x0 = poly[:, 0].min() + 0.34 * w
        shape = np.array([(x0, lo + 0.1 * h), (x0 + 0.12 * w, lo + 0.1 * h), (x0 + 0.12 * w + 0.12 * h, hi - 0.1 * h), (x0 + 0.12 * h, hi - 0.1 * h)])
        # keep the streak inside the window outline (clamp to its bbox)
        shape[:, 0] = np.clip(shape[:, 0], poly[:, 0].min() + 0.03, poly[:, 0].max() - 0.03)
        sp = V.patch(proj, shape, tuple(shape.mean(axis=0)), rings=2, off=off_g + 0.0016, ref_fn=ref_fn)
        yy = np.clip((sp.v[:, 1] - sp.v[:, 1].min()) / max(np.ptp(sp.v[:, 1]), 1e-6), 0, 1)
        sp.c[:, :3] = np.array(sky)[None] * (0.55 + 0.45 * yy)[:, None]
        glass_out.append(sp)


# ----------------------------------------------------------------------------- wheels


@dataclass
class Wheels:
    R: float
    W: float
    rim_r: float
    sides: int = 22
    lugs: int = 5


def add_wheel_set(m: Model, w: Wheels, spots, tyre_colour=0x2b2b2e, rim_colour=0x70737a, rim_dark=False):
    """spots: list of (node_name, x, y, z, outward_sign). Wheel parts are created about X with origin at the axle."""
    tyre = V.make_tyre(w.R, w.W, w.rim_r, w.sides)
    steel, chrome, slots = V.make_rim(w.rim_r * 0.98, w.W, sides=14, lugs=w.lugs)
    V.paint(steel, rim_colour)
    steel.c[:, :3] *= (0.78 + 0.22 * np.clip((np.abs(steel.v[:, 1]) + np.abs(steel.v[:, 2])) / w.R * 2, 0, 1))[:, None]
    for name, x, y, z, sgn in spots:
        for mesh, mat, col in ((tyre, "tyre", tyre_colour), (steel, "steel", None), (chrome, "chrome", None)):
            p = mesh.copy()
            if col is not None:
                p.c[:, :3] = V.lin(col)
                p.c[:, :3] *= 0.9 + 0.2 * V.value_noise(p.v * 5.0, 1.0, 3)[:, None]
            p = V.mirror_for_side(p, sgn)
            p = place(p, (x, y, z))
            m.add(p, mat, node=name, pivot=(x, y, z))


def headlamp_pair(m: Model, x: float, y: float, z: float, w: float = 0.1, h: float = 0.07, depth: float = 0.02):
    """Rectangular head lamps: chrome bezel + emissive lens, facing +Z."""
    for sx in (-1, 1):
        bez = V.bevel_box((sx * x, y, z), (w + 0.018, h + 0.018, depth), bevel=0.012)
        V.paint(bez, 0xb8b8bc)
        m.add(bez, "chrome")
        lens = V.bevel_box((sx * x, y, z + depth * 0.35), (w, h, depth * 0.8), bevel=0.012)
        V.paint(lens, 0xfff4d6)
        m.add(lens, "lamp")
