"""Builds the dedicated campaign-enemy GLBs into src/assets/models/ (docs/CHARACTER_PRODUCTION_AGBERO.md).

    python3 tools/assets/build_enemies.py [name ...]

Same skeleton, skinning and exporter as the hero cast (`build_characters.build`); enemy-specific clips come from
`enemy_clips.py`. Needs only numpy + scipy (no Blender)."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import enemies
from build_characters import build
from rig import CLIPS

try:
    from enemy_clips import AGBERO_CLIPS
except ImportError:  # geometry-only preview before the clips exist
    AGBERO_CLIPS = CLIPS

CLIPS_OF = {"agbero": AGBERO_CLIPS}
#: Head enlargement about the chin (hero cast 1.2, then the game's ADULT_HEAD_SCALE 0.82 is applied at runtime). The Agbero
#: is a little larger so his face reads under the gameplay camera.
HEAD_SCALE_OF = {"agbero": 1.3}
if __name__ == "__main__":
    for n in sys.argv[1:] or list(enemies.ENEMIES):
        build(n, spec=enemies.ENEMIES[n](), clips=CLIPS_OF.get(n), head_scale=HEAD_SCALE_OF.get(n))
