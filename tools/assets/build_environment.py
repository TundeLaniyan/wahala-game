"""Builds the environment GLBs (pillars, soft blocks, walls, buildings, dressing) into src/assets/models/.

    python3 tools/assets/build_environment.py [name ...]      # no names = everything

numpy + scipy + PIL only (no Blender). Each module registers its builders in a dict of name -> function.
"""
from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))


def registry() -> dict:
    reg: dict = {}
    from env_pillars import PILLARS

    reg.update(PILLARS)
    for modname, attr in (("env_soft", "SOFT"), ("env_walls", "WALLS"), ("env_buildings", "BUILDINGS"), ("env_dressing", "DRESSING")):
        try:
            mod = __import__(modname)
        except ModuleNotFoundError as e:  # module not written yet
            if e.name != modname:
                raise
            continue
        reg.update(getattr(mod, attr))
    return reg


def main(argv: list[str]) -> None:
    reg = registry()
    names = argv or list(reg)
    infos = []
    for n in names:
        if n not in reg:
            # allow prefix match, e.g. "pillar"
            matches = [k for k in reg if n in k]
            if not matches:
                print(f"unknown asset {n!r}; known: {', '.join(reg)}")
                continue
        else:
            matches = [n]
        for k in matches:
            t0 = time.time()
            infos.append(reg[k]())
            print(f"   ({time.time() - t0:.1f}s)")
    tot = sum(i["kb"] for i in infos if i)
    print(f"built {len(infos)} assets, {tot} KB")


if __name__ == "__main__":
    main(sys.argv[1:])
