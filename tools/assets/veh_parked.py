"""Low-poly parked danfo (env_danfo_parked.glb): the v4 danfo silhouette and livery in ~1.5k triangles for the
dozen-plus buses instanced around the bus park. One static mesh per material (paint, trim, lamp)."""
from __future__ import annotations

import numpy as np

import vehicles_lib as V
from vehicles_lib import Model, Spec
import veh_danfo as D
from veh_common import livery_fn

LOD_BANDS = [(D.PIN_LO[0], D.PIN_HI[1], D.BLACK), (*D.GLASS_BAND, 0x15181c)]
LOD_SEAMS = [D.PIN_LO[0], D.PIN_HI[1], D.GLASS_BAND[0], D.GLASS_BAND[1]]


def build():
    m = Model("env_danfo_parked")
    full = D.body_shell()
    body = V.Body(full.k, ytop=D.YTOP, roof_r=0.065, crown=0.014, roof_steps=3, extra_ys=[], bottom_round=0.0)
    shell = body.build(sides=30, color_fn=livery_fn(LOD_BANDS, base=D.YELLOW, ao_y=(D.Y0, 0.30), dark=0.2), seams=LOD_SEAMS, cap_rings=(0.6,))
    # lighter "glass" sheen high on the band so the windows read as glass, not paint
    hi = (shell.v[:, 1] > 0.80) & (shell.v[:, 1] < D.GLASS_BAND[1])
    shell.c[hi, :3] = V.lin(0x2a3640)
    m.add(shell, "paint")

    trim, lamps = [], []
    for sx in (-1, 1):
        for z in (D.WZ, -D.WZ):
            t = V.cylinder((sx * (D.WX + 0.01), D.WR, z), D.WR, D.WW, sides=12, axis="x")
            V.paint(t, 0x1c1c1f)
            trim.append(t)
            hub = V.cylinder((sx * (D.WX + 0.01 + D.WW / 2), D.WR, z), D.RIM * 0.9, 0.008, sides=10, axis="x")
            V.paint(hub, 0xb8bbc1)
            trim.append(hub)
    for zc in (0.812, -0.792):
        bar = V.bevel_box((0, 0.20, zc), (0.80, 0.07, 0.055), bevel=0.02, seg=1)
        V.paint(bar, 0xb8bbc1)
        trim.append(bar)
    for sx in (-1, 1):
        zc = body.front(sx * 0.268, 0.367)[2]
        lens = V.cylinder((sx * 0.268, 0.367, zc + 0.008), 0.055, 0.02, sides=10, axis="z")
        V.paint(lens, 0xfff4d8)
        lamps.append(lens)
        tl = V.bevel_box((sx * 0.322, 0.53, -body.params(0.53)[2] - 0.004), (0.05, 0.10, 0.012), bevel=0.004)
        V.paint(tl, 0xd8202a)
        trim.append(tl)
    grille = V.bevel_box((0, 0.367, body.front(0, 0.367)[2] + 0.004), (0.34, 0.09, 0.012), bevel=0.004)
    V.paint(grille, 0x0a0a0b)
    trim.append(grille)
    # luggage on the roof
    tarp = V.bevel_box((0.03, D.YTOP + 0.06, -0.20), (0.46, 0.09, 0.42), bevel=0.03, seg=1)
    V.paint(tarp, 0x2f62a8)
    trim.append(tarp)
    bag = V.bevel_box((-0.08, D.YTOP + 0.075, 0.15), (0.26, 0.08, 0.18), bevel=0.025, seg=1)
    V.paint(bag, 0xc23a2e)
    trim.append(bag)
    m.add(trim, "trim")
    m.add(lamps, "lamp")
    V.scale_model(m, 0.95)
    specs = {
        "paint": Spec(color=(1, 1, 1, 1), roughness=0.32, smooth_deg=58),
        "trim": Spec(color=(1, 1, 1, 1), roughness=0.6, smooth_deg=45),
        "lamp": Spec(color=(1, 1, 1, 1), roughness=0.2, emissive=(1.0, 0.92, 0.70), emissive_strength=1.0, smooth_deg=60),
    }
    return m, specs
