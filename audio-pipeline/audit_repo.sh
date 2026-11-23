#!/usr/bin/env bash
# Re-runnable Stage 1 audit. usage: audio-pipeline/audit_repo.sh [path-to-game-checkout]
# Lists audio files (with codec/size/duration), audio-API usage, and licence/provenance files.
set -u
R="${1:-.}"
echo "== audio files in $R =="
find "$R" \( -path '*/.git' -o -path '*/node_modules' -o -path '*/audio-pipeline/build' \) -prune -o -type f \
  \( -iname '*.mp3' -o -iname '*.ogg' -o -iname '*.oga' -o -iname '*.opus' -o -iname '*.wav' -o -iname '*.m4a' -o -iname '*.aac' -o -iname '*.flac' -o -iname '*.webm' -o -iname '*.mid' \) -print |
while read -r f; do printf '%s  %s bytes  ' "$f" "$(stat -c %s "$f")"; ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels:format=duration -of csv=p=0 "$f" 2>/dev/null | tr '\n' ' '; echo; done
echo "== video files carrying an audio track =="
find "$R" \( -path '*/.git' -o -path '*/node_modules' \) -prune -o -type f \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.webm' \) -print |
while read -r f; do a=$(ffprobe -v error -select_streams a -show_entries stream=codec_name,sample_rate,channels,bit_rate -of csv=p=0 "$f" 2>/dev/null); [ -n "$a" ] && echo "$f  audio: $a  (provenance of this track must be established before it can ship)"; done
echo "== audio API usage in source =="
grep -rInE 'AudioContext|new Audio\(|Howl\b|Tone\.|createOscillator|speechSynthesis|<audio' "$R" --include='*.js' --include='*.ts' --include='*.tsx' --include='*.jsx' --include='*.html' --include='*.mjs' \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=audio-pipeline | head -40
echo "== licence / credits files =="
find "$R" \( -path '*/.git' -o -path '*/node_modules' \) -prune -o -type f \( -iname 'LICENSE*' -o -iname 'CREDITS*' -o -iname 'ATTRIBUTION*' -o -iname 'NOTICE*' \) -print
