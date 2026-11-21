#!/usr/bin/env bash
# Fetches the CC0 MakeHuman assets (base mesh, morph targets, default rig and weights) used by the character pipeline.
# Pinned to the commit the shipped models were built from.  Assets: CC0 1.0 (LICENSE.ASSETS.md in the checkout); the
# MakeHuman SOURCE CODE (AGPL) is neither used nor distributed here.
set -euo pipefail
DEST="${1:-$(dirname "$0")/vendor/makehuman}"
PIN=a8bc2d54ff0ac92e78ff71431b1023eda42bf482
if [ ! -d "$DEST/.git" ]; then
  git clone --depth 1 https://github.com/makehumancommunity/makehuman "$DEST"
fi
git -C "$DEST" fetch --depth 1 origin "$PIN" 2>/dev/null || true
git -C "$DEST" checkout -q "$PIN" 2>/dev/null || echo "note: using the cloned HEAD (pin $PIN not reachable)"
echo "export MAKEHUMAN_DATA=$DEST/makehuman/data"
