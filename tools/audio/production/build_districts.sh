#!/usr/bin/env bash
# Rebuilds the mastered district candidates from the founder's ZIP (WAHALA_Seven_District_Soundtracks_VERIFIED).
# usage: build_districts.sh ZIP [FADEYI_INSTRUMENTAL.wav]
# Needs python3 with numpy scipy soundfile librosa, ffmpeg (libmp3lame). Output goes to the git-ignored MP3 area of
# tools/audio/candidates/lagos_districts_v1/ (manifest.json, report.json and qa_report.txt are the committed pieces).
# The optional instrumental is the Fadeyi-Somolu stems sum (drums+bass+other, 44.1 kHz stereo WAV) made with
# separate.sh-style Demucs separation; without it the Fadeyi master keeps its vocals (see docs/AUDIO_DISTRICTS.md).
set -euo pipefail
ZIP="$1"; INST="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"; PACK="$HERE/../candidates/lagos_districts_v1"; W="$(mktemp -d)"
unzip -q "$ZIP" -d "$W/zip"
python3 - "$W/zip" <<'PY'
import csv, hashlib, sys, os
root = sys.argv[1]; bad = 0
for r in csv.DictReader(open(os.path.join(root, "MANIFEST.csv"))):
    p = os.path.join(root, "tracks", r["pack_filename"]); h = hashlib.sha256(open(p, "rb").read()).hexdigest()
    ok = h == r["sha256"] and os.path.getsize(p) == int(r["size_bytes"]); bad += not ok
    print(("OK   " if ok else "FAIL ") + r["pack_filename"])
sys.exit(1 if bad else 0)
PY
mkdir -p "$W/wav"
for f in "$W"/zip/tracks/*.mp3; do ffmpeg -y -loglevel error -i "$f" -ar 44100 -ac 2 "$W/wav/$(basename "${f%.mp3}").wav"; done
python3 -I "$HERE/district_analyse.py" "$W/wav" "$W/analysis.json"  # add an MDX stems dir as 2nd argument to also measure vocals
ARGS=(); [ -n "$INST" ] && ARGS=(--instrumental "fadeyi=$INST")
python3 -I "$HERE/make_districts.py" --wav "$W/wav" --analysis "$W/analysis.json" --out "$PACK" "${ARGS[@]}"
python3 -I "$HERE/make_district_manifest.py" "$PACK"
python3 -I "$HERE/qa_districts.py" "$PACK" | tee "$PACK/qa_report.txt"
cp "$W/analysis.json" "$PACK/source_analysis.json"
echo "built $PACK ; stage with: npm run audio:stage-candidates"
