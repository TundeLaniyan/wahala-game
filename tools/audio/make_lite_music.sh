#!/usr/bin/env bash
# Builds the Data Saver music variants: public/audio/music/lite/<file>.mp3, 96 kbps joint-stereo MP3 (same codec, so the
# player's decoding, looping and gain handling are unchanged) from the approved masters in public/audio/music.
# Reproducible: `tools/audio/make_lite_music.sh`; then `node tools/audio/lite_manifest.mjs` records them in manifest.json.
# The default (full-quality) files are NEVER replaced: Data Saver is an explicit player choice (docs/MOBILE_PERFORMANCE.md).
set -euo pipefail
cd "$(dirname "$0")/../../public/audio/music"
mkdir -p lite
for f in *.mp3; do
  ffmpeg -nostdin -loglevel error -y -i "$f" -vn -map_metadata -1 -c:a libmp3lame -b:a 96k -joint_stereo 1 -ar "$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of csv=p=0 "$f")" "lite/$f"
done
ls -l lite | awk 'NR>1 {s+=$5} END {printf "lite total: %.1f MB\n", s/1e6}'
