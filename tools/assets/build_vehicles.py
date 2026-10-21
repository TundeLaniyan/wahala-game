"""Builds the vehicle and generator GLBs into src/assets/models/.

    python3 tools/assets/build_vehicles.py [danfo taxi keke okada generator parked]

numpy + scipy + PIL only (no Blender). Deterministic."""
from __future__ import annotations

import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

MODULES = {
    "danfo": "veh_danfo",
    "taxi": "veh_taxi",
    "keke": "veh_keke",
    "okada": "veh_okada",
    "generator": "veh_generator",
    "parked": "veh_parked",
}


def build(name: str) -> None:
    mod = importlib.import_module(MODULES[name])
    model, specs = mod.build()
    model.export(specs)


if __name__ == "__main__":
    for n in sys.argv[1:] or list(MODULES):
        build(n)
