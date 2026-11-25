#!/usr/bin/env bash
# Separates the approved recording into vocals / drums / bass / other (Demucs htdemucs_ft through audio-separator).
# usage: separate.sh ORIGINAL.mp3 OUT_DIR       (needs: python3 -m venv V && V/bin/pip install "audio-separator[cpu]" audioread; ~8 min on 4 CPU cores)
# Verifies the recording's SHA-256 first. The stems are derivatives of the approved song: keep them out of git.
set -euo pipefail
EXPECT=e4b6314d4c27cc2719e51f7cc9f97f4df03dec8920696e744211afc29be3bebc
GOT=$(sha256sum "$1" | cut -d' ' -f1)
[ "$GOT" = "$EXPECT" ] || { echo "not the approved recording ($GOT)"; exit 1; }
mkdir -p "$2/raw" "$2/stems"
audio-separator "$1" -m htdemucs_ft.yaml --output_dir "$2/raw" --output_format WAV
for n in Vocals Drums Bass Other; do cp "$2/raw/$(basename "${1%.*}")_(${n})_htdemucs_ft.wav" "$2/stems/$(echo $n | tr A-Z a-z).wav"; done
