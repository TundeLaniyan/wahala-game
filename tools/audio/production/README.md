# Lagos No Dey Sleep production tools

Builds the **unapproved candidate** arrangements from the founder-approved recording (see `docs/AUDIO_PRODUCTION.md`).
The recording (SHA-256 `e4b6314d4c27cc2719e51f7cc9f97f4df03dec8920696e744211afc29be3bebc`) and its stems are NOT in git.

```
separate.sh ORIGINAL.mp3 WORK          # 4 stems with Demucs htdemucs_ft (checks the SHA-256 first)
analyse_grid.py ORIGINAL.wav WORK/stems   # tempo (110.00 BPM), beat grid, sections, per-bar stem levels
make_candidates.py --stems WORK/stems --original ORIGINAL.wav --out OUT   # the 12 cues + report.json (closed-loop codec peak guard)
make_manifest.py OUT                    # manifest.json (schema v2 + variants/syncGroups) + slots.json
qa_candidates.py OUT ORIGINAL.wav       # decoded length, loop seams, loudness, phone-speaker loudness, spectral balance
render_set.ts / listening_set.json      # renders the sound-effect listening set through the game's own recipes
build_review.py / review_template.html  # one self-contained listening page (embeds the original: do not commit its output)
```
Python needs numpy, scipy, soundfile, librosa and ffmpeg (libmp3lame). Copy the result to `tools/audio/candidates/lagos_no_dey_sleep_v1/`.
