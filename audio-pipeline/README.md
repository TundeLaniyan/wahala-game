# audio-pipeline

Isolated audio workstream for WAHALA! — Lagos City Rumble. Nothing here depends on or modifies gameplay code.

```
synth/        Python sources: DSP, instruments, composition (theme.py), SFX (sfx.py), build + QA tools
src/          AudioManager.js (runtime engine) + audio-manifest.json (ids, groups, events, ducking)
drafts/       encoded draft assets (music/, sfx/ as .ogg Opus and .m4a AAC), MIDI score, build manifest
review/       WAHALA_audio_review.html: one self-contained page to listen to everything
tests/        Chromium tests for AudioManager and encoded assets
audit_repo.sh Stage-1 audit for any checkout
```

Rebuild (deterministic, about 40 s):
```
pip install numpy scipy            # ffmpeg with libopus + aac must be on PATH
python3 -I synth/build.py          # renders WAVs to build/masters (git-ignored), encodes drafts/, writes manifest.generated.json
python3 -I synth/runtime_manifest.py
python3 -I synth/export_midi.py
python3 -I synth/verify_theme.py   # pitch, consonance, clipping, DC, loop-seam checks
python3 -I synth/build_review.py   # review/WAHALA_audio_review.html
node tests/audio.spec.mjs          # needs playwright + chromium
```
Tempo 112 BPM, 48 kHz. Replacing a draft with a final recording: keep the id, loop length (16 bars = 1,645,714 samples) and loudness targets in `docs/audio/THEME_BRIEF.md`.
