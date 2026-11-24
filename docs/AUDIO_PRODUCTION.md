# WAHALA! soundtrack production: "Lagos No Dey Sleep" (branch `audio/wahala-production-soundtrack-v1`, decision AU2)

Not merged, not deployed; the Architecture chat owns releases. **Everything here is a candidate. Nothing is approved, nothing is in `public/audio/`, no existing audio was replaced.** Based on `claude/wahala-stitch-uiux-v1` at `f7cf2ae`, with the earlier audition overlay (`audio/wahala-original-theme-integration-v1`, AU1) merged in.

Listening page (private link, plays everything): https://claude.ai/artifact/7A8NRnRmhi39iAcqSD1S7d

## 1. The approved recording, as inspected

| | |
| --- | --- |
| Title | Lagos No Dey Sleep (founder-selected, Gemini-created) |
| File | `lagos_no_dey_sleep201.mp3` (attached), 2,381,307 bytes |
| SHA-256 | `e4b6314d4c27cc2719e51f7cc9f97f4df03dec8920696e744211afc29be3bebc` (**matches** the fingerprint given) |
| Format | MP3, 44.1 kHz stereo, 192 kb/s CBR, no tags, **98.90 s** |
| Loudness | -12.6 LUFS integrated, LRA 4.5 LU |
| Tempo | **110.00 BPM** (measured on the drums stem; first beat 0.05 s; 45 bars of 2.1818 s). Machine-steady, so bar-aligned edits are exact |
| Key | F major / A minor (chroma F, C, A dominant) |
| Not in the repo | `reference/audio/WAHALA_APPROVED_MAIN_THEME_Lagos_No_Dey_Sleep.mp3` does not exist on any branch I can reach. The recording and its stems are deliberately **not committed** (see section 6) |

Structure (found from stem levels and chroma similarity; lyrics not transcribed): intro 0-8.8 s (pad and bass, no drums) · fill into **chorus A bars 9-16 (17.5-35.0 s)** · verse 1 bars 17-24 (no bass) · verse 2 bars 25-32 · **chorus B bars 33-40 (69.9-87.3 s, vocal and instrumental 0.94-0.95 identical to chorus A)** · outro bars 41-45 (drums and pad) ending at about 96 s.

## 2. Vocal separation and stems (what was possible here)

- **Done:** Demucs `htdemucs_ft` (a machine-learning separator) split the recording into vocals, drums, bass and other. Stem sum vs original: -14.7 dB residual (normal for the method). Independent check with a second model (UVR-MDX-NET Voc FT) on the finished instrumental loops: the remaining vocal is **about 50 dB below the original vocal** in the menu and rumble loops, about 35 dB in the quiet campaign bed (intro bleed). That is a measurement, not a listening test: soft backing vocals, ad-libs and reverb tails may still ghost.
- **Not possible:** true original stems (the Gemini session produced one stereo file). Separated stems carry artefacts (smeared cymbals, thin transients, some phasing where parts overlap). They are good enough to judge and to ship as candidates, not equal to a studio multitrack.
- **Minimum for professional quality:** ask the Gemini/Lyria session for an instrumental or stem export if the product offers one (cost: nothing), or have a producer rebuild the arrangement from the recording as a stem-based project in a DAW (a day or two of studio time; my rough estimate is a few hundred to a few thousand USD depending on the producer, **not a quote**). A cleaner automatic route is a paid separation service (roughly USD 10-25 a month) but it is the same class of method.
- Tools used here (free): `audio-separator` (MIT) with Demucs weights (Meta, MIT licence; re-check) and ffmpeg. All pulled through the container's allowed hosts.

## 3. Candidate cue sheet

Built by `tools/audio/production/make_candidates.py` from the stems and the original; files in `tools/audio/candidates/lagos_no_dey_sleep_v1/`. 110 BPM everywhere, MP3 (LAME with gapless header), full file 128 kb/s and Data Saver file 64 kb/s. Joins are 40 ms equal-power crossfades on bar lines; loops close the same way.

| Cue id | Game event | Length | Loop | LUFS | Full / Data Saver | Made from |
| --- | --- | --- | --- | --- | --- | --- |
| `lnds_menu` | title and menus | 34.9 s (16 bars) | yes | -15.2 | 546 / 273 KB | verse 2 + chorus B, vocals removed |
| `lnds_rumble` | City Rumble match | 34.9 s | yes | -14.7 | 546 / 273 KB | chorus A + chorus B instrumental; drums +1.8 dB, bass harmonics for phone speakers, 3.2 kHz -3.5 dB and 1.1 kHz -1.5 dB pocket for danger sounds |
| `lnds_suddendeath` | Sudden Death | 34.9 s, same grid | yes | -14.7 | 546 / 273 KB | same material, drums +3.5 dB, brighter, **plus synthesised** heartbeat toms, hats, snare rolls, risers, impacts |
| `lnds_boss_1/2/3` | boss encounter, levels 1-3 | 34.9 s each, same grid | yes | -17.0 / -15.4 / -14.9 | 546 / 273 KB each | verse 2 + chorus B: bass and other parts **-5 semitones (F to C)** over the original drums. L1 stalking (low drums, bass, dark pad); L2 full drums and heartbeat; L3 all-out **plus synthesised** brass stabs (C-G), snare rolls, risers, impacts |
| `lnds_sting` | logo reveal (no game hook yet) | 4.1 s | no | -13.2 | 65 KB | riser + impact + the **original recording's** first chorus line (bars 9-10) |
| `lnds_victory` | match won | 7.5 s | no | -15.0 | 118 KB | the song's own outro and ending + a low impact |
| `lnds_defeat` | match lost | 2.6 s | no | -15.0 | 41 KB | one bar of the groove with a tape-stop slow-down and a low thud |
| `lnds_camp_calm` | campaign briefing, safe areas | 13.1 s | yes | -22.0 | 205 / 102 KB | intro pad + bass, no drums |
| `lnds_camp_tension` | raids, stealth | 17.5 s | yes | -22.0 | 273 / 136 KB | verse 1's other part -5 st, low-passed, plus a **synthesised** slow heartbeat |
| `lnds_camp_alert` | alert, boss approach | 17.5 s | yes | -19.3 | 273 / 136 KB | drums above 1.5 kHz over the bass -5 st, plus **synthesised** risers |

Total of everything: 4.2 MB full, 2.2 MB with Data Saver. The synthesised layers are percussion, risers and brass stabs made by code at the song's tempo; they are the only content that does not come from the recording, and each is named above.

**Measured (no ears involved), `qa_report.txt` next to the files:** every loop decodes to the exact authored sample count (1,539,491 samples for the 16-bar loops) and its wrap step is within the normal sample-to-sample range; the rumble, Sudden Death and three boss files have identical length, so a switch lands on the same bar; decoded true peaks are -2.5 dBTP or lower; loudness of the match mixes is within 1 dB of the game's existing tracks (their manifest gains level to -14 LUFS; candidate manifest gains of 1.0-1.12 do the same). On a phone-speaker simulation (high-pass at 150 Hz) the rumble mix measures -18.6 LUFS against a median -17.6 for the 14 existing tracks after their gains, and Sudden Death -18.0.

**Not verified:** how any of it sounds; whether the joins and loop points are musically right; whether the vocal is fully gone; whether the -5 semitone boss material sounds menacing or odd; loop gaplessness inside the game, which streams `<audio>` elements and browsers do not guarantee sample-accurate looping there (the listening page loops with Web Audio and is gapless).

## 4. Interactive behaviour (existing engine, no second manager)

All of it lives in `src/audio` and only acts when candidate variants are listed (`?audiodraft`), so the shipped playlist behaves exactly as before.

- **Sudden Death:** `musicVariantFor(state)` (pure, read-only) returns `suddenDeath` when `state.match.suddenDeath` is set. The player crossfades to `lnds_suddendeath` over 1.4 s **at the old track's position** (the new stream seeks to where the beat has got to, tempo carried over), and the old track keeps playing until the new one has really started, so a slow network never leaves silence. The existing endgame tempo and tone escalation keep running.
- **Boss:** a campaign boss mission that is not over picks level 1-3 from the mission phase and the blast hits already taken, whichever is further on; the levels crossfade on the same grid. A defeated boss or finished mission returns to the match track.
- **Fallbacks:** a variant whose file is missing or broken is skipped, and a stream that breaks puts the match track back. Missing candidates mean nothing changes.
- **Data Saver:** the candidate manifest lists a `lite` file per loop; the player uses it exactly as for shipped tracks.
- **First load:** nothing candidate is requested without the flag. With it: the manifest (about 3 KB) plus HEAD probes at unlock, then one 273-546 KB file per scene (menu on the title, the rumble mix at match start, a variant only when the state asks for it).
- **Warnings over music:** the engine already ducks music under danger and blast cues (warn bus never ducked); the candidate rumble and Sudden Death mixes add a 3.2 kHz pocket.
- Verified in real Chromium with the candidates staged: `?audiodraft` plays the menu loop; in a real Rumble match the rumble mix plays and a forced Sudden Death switches to `lnds_suddendeath`, landing within the clock tolerance of the old position (measured: 19.6 s against 18.6 s expected at 1.09x tempo, which is the tempo difference, not drift). Boss switching is covered by unit tests with fake media, not run in a real boss mission.

## 5. Founder audition and approval

1. `npm run audio:stage-candidates && npm run dev`, open `/?audiodraft` (all) or `?audiodraft=menu|match|stings`. Menu loop on the title screen; any match plays the rumble mix; a Sudden Death round switches music; victory/defeat use the candidate stingers. `npm run audio:unstage-candidates` removes them again.
2. Or use the listening page above: original, every cue with its file, duration, size and event, the two transition demos, a danger-over-music test, and the effects with before/after buttons.
3. Approve or reject each item in writing. Promotion steps (release owner only, after approval and the rights decision): move approved files to `public/audio/music/`, list them in `manifest.json` with `approved:true` and their real licence rows in `LICENSES.md`, update `tests/audio/assets.test.ts` deliberately, add the menu/arena playlists, re-measure loops in the game, remove or keep the overlay.

## 6. Rights and provenance (unresolved items)

I could not open Google's terms pages from this container, so none of this is a legal conclusion.

1. **The recording.** Created by the founder with a Gemini product. Open questions: which exact product and tier made it (Gemini app, Lyria, API), whether that product's terms allow **commercial use in a game**, whether the output carries a **SynthID** watermark or a disclosure duty, and whether the generation account, prompt and date are recorded. Keep that evidence. The repository's `docs/AUDIO.md` already lists the same questions for the voice clips.
2. **Copyright of AI-generated music** is unsettled in many countries; ask counsel before registering or licensing the theme, and about exclusivity (Google "may generate the same or similar content for others", as quoted in AUDIO.md for Gemini TTS).
3. **Similarity.** No check of the melody, lyrics or title against existing songs was done. Do one before release (a musicologist or clearance service).
4. **Derivatives.** Stems, loops, pitch-shifted boss material and the sting inherit whatever rights the source has. Separation models used for the arrangement: Demucs (MIT). The UVR-MDX model was used only to measure leftover vocals and nothing from it ships.
5. **Added synthesis** (percussion, risers, brass stabs, impacts) and the new sound effects are generated by code with no samples; they are repository work, but AI-assisted authorship carries the same open question.
6. **The vocals in the logo sting** are the original recording's: any lyric or performer concerns apply.
7. **Public repository.** The branch holds the derived candidate files under `tools/audio/candidates/` (about 6 MB). If the repository is public, they are downloadable before approval. The original and the stems are not committed. If you prefer, remove the candidate folder from the branch and keep the files on the listening page only.
8. Unchanged and unaffected: the Pixabay tracks (Pixabay licence, `LICENSES.md`) and the Gemini TTS voice clips. No existing file was replaced.

## 7. What remains

- Founder listening decisions (page checklist).
- A producer pass if separation artefacts or the loop points are not good enough; ideally from stems exported by the generator.
- Rights decisions above.
- A hook for the logo sting (title reveal) and, if wanted, `playUi('pause'|'resume'|'confirm'|'error'|'ready')` calls in `src/app/session.ts` (see `docs/AUDIO_COVERAGE.md`).
- Recorded sources for Lagos street life (see the coverage doc), human-recorded Pidgin voice if the synthetic clips are not to be final, boss and campaign voice (none exists), campaign narration clips.
- Real-device checks: iOS/Safari, a low-end Android, loop gaplessness on `<audio>`.
