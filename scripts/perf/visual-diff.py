#!/usr/bin/env python3
"""Pixel comparison of two screenshot folders (scripts/perf/visual-capture.mjs output).
   python3 -I scripts/perf/visual-diff.py A_dir B_dir [out_dir]   ->  per scene: mean abs diff (0-255), % pixels differing by > 24
   and, when out_dir is given, a side-by-side PNG (A | B | amplified diff)."""
import sys, os
import numpy as np
from PIL import Image

a_dir, b_dir = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
if out: os.makedirs(out, exist_ok=True)
for name in sorted(os.listdir(a_dir)):
    if not name.endswith('.png') or not os.path.exists(os.path.join(b_dir, name)): continue
    a = np.asarray(Image.open(os.path.join(a_dir, name)).convert('RGB'), dtype=np.int16)
    b = np.asarray(Image.open(os.path.join(b_dir, name)).convert('RGB'), dtype=np.int16)
    d = np.abs(a - b).max(axis=2)
    print(f"{name:14s} mean abs diff {np.abs(a-b).mean():6.3f}/255   pixels differing >24: {100*(d>24).mean():6.3f}%   >64: {100*(d>64).mean():6.3f}%")
    if out:
        amp = np.clip(d * 4, 0, 255).astype(np.uint8)
        side = np.concatenate([a.astype(np.uint8), b.astype(np.uint8), np.stack([amp] * 3, axis=2)], axis=1)
        Image.fromarray(side).save(os.path.join(out, name))
