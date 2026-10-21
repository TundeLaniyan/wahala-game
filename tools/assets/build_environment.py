"""Builds the environment GLBs (pillars, soft blocks, walls, buildings, dressing) into src/assets/models/.

    python3 tools/assets/build_environment.py [name ...]      # no names = everything
    python3 tools/assets/build_environment.py market busterminal   # only the Balogun Market / bus-terminal sets

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
    for modname, attr in (("env_soft", "SOFT"), ("env_walls", "WALLS"), ("env_buildings", "BUILDINGS"), ("env_dressing", "DRESSING"), ("env_market", "MARKET"), ("env_busterminal", "BUSTERMINAL")):
        try:
            mod = __import__(modname)
        except ModuleNotFoundError as e:  # module not written yet
            if e.name != modname:
                raise
            continue
        reg.update(getattr(mod, attr))
    return reg


GROUPS = {"market": "MARKET", "busterminal": "BUSTERMINAL"}  # whole-set aliases -> module dict


def main(argv: list[str]) -> None:
    reg = registry()
    names = []
    for a in argv:
        if a in GROUPS:
            mod = __import__({"market": "env_market", "busterminal": "env_busterminal"}[a])
            names += list(getattr(mod, GROUPS[a]))
        else:
            names.append(a)
    names = names or list(reg)
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
