# Provenance and licensing checks: the founder-approved WAHALA! originals

Machine-readable record: `tools/audio/release/provenance.json` (source file names, sizes, SHA-256, tool versions). Nothing here is a legal conclusion; Google's terms pages could not be opened from the build environment.

## Release status (decision AU5)

**Commercial clearance: not cleared.** The record is `public/audio/release-clearance.json`; `tests/audio/releaseGate.test.ts` keeps it consistent with this document, and the deploy workflow refuses to publish the soundtrack to GitHub Pages from the publishing branch until the record says `cleared` (with who, when and where the evidence is kept). The full assessment of Google's terms and the open questions is being written to `docs/AUDIO_RIGHTS_ASSESSMENT.md`; this section is the interim state.

## What was generated, by whom, from what

| Item | Source | SHA-256 of the source |
| --- | --- | --- |
| *Lagos No Dey Sleep* | `lagos_no_dey_sleep201.mp3`, created by the founder with Gemini, 98.9 s, 110 BPM; arranged into the menu loop, three boss levels, victory and defeat stingers (`tools/audio/production/make_candidates.py`) | `e4b6314d4c27cc2719e51f7cc9f97f4df03dec8920696e744211afc29be3bebc` |
| Seven district songs | `WAHALA_Seven_District_Soundtracks_VERIFIED_2026-11-24.zip` (founder, Gemini; the pack README names Lyria), each file verified against the pack's own SHA-256 manifest | the seven hashes are in `provenance.json` (e.g. Ojuelegba `2a9efe2b...`) |

Processing (all in `tools/audio/`): loudness to -14 LUFS with decoded true peak at most -1 dBTP, bar-aligned seamless loops of 75-91% of each song, per-song Sudden Death loops from the same recording plus code-generated percussion / risers, MP3 192 / 96 kb/s. Fadeyi-Somolu: the instrumental is the sum of the Demucs `htdemucs_ft` drums, bass and other stems. The boss levels are the song's own bass and harmony pitched down five semitones over its drums plus synthesised brass stabs, risers and impacts. Tools: audio-separator 0.48.0 with Demucs (MIT), librosa 1.0.1, ffmpeg 6.1.1 + libmp3lame. A second separation model (UVR-MDX-NET-Voc_FT) was used only to **measure** leftover vocals; nothing from it ships.

## Unresolved licensing checks (open until the founder / counsel close them)

1. **Product terms.** Which Gemini / Lyria product, tier and model made each file, and whether its terms allow commercial use in a distributed game. Likely sources: the Gemini API Additional Terms, the Generative AI Prohibited Use Policy and the product's own terms.
2. **Watermark and disclosure.** Whether the output carries a SynthID-style watermark; what AI-content disclosure the target stores and regions require.
3. **Similarity clearance.** No melody, lyric or title comparison against existing works was done for any of the eight songs. Use a musicologist or a clearance service.
4. **Authorship / copyright.** AI-generated music may not be copyrightable in some countries, so exclusivity and enforcement are uncertain; Google may generate similar content for others. Ask counsel before registering, licensing or building brand identity on the theme.
5. **Records.** Keep the generation history (account, date, prompt, model) and the original ZIP: they are the evidence. They are deliberately not in the repository.
6. **Derivatives.** Masters, loops, stem instrumental, pitch-shifted boss material, stingers and Sudden Death loops inherit the source's rights, whatever they are.
7. **Vocals.** Fadeyi-Somolu has sung lines (instrumental from stems, ghost vocals possible); the others have short sung bursts inside the loops. Performer / lyric questions follow the recordings.
8. **Public repository.** The files are downloadable from the repository and the deployed site. The Pixabay Content License forbids standalone distribution of the Pixabay tracks; for the originals, the same discipline applies (`public/audio/LICENSES.md`): no "download the soundtrack".

Not affected: the Pixabay tracks (licence unchanged) and the Gemini TTS voice clips (their own open points are in `docs/AUDIO.md`).
