# WAHALA! audio: music, Lagos ambience, spoken Pidgin

Branch `claude/wahala-lagos-audio` (based on `claude/presentation-overhaul`). Owned code: `src/audio/`,
`public/audio/`, `tools/audiogen/`, `tools/audio/`, `src/ui/AudioSettings.*`, `tests/audio/`.

## Read this first: what is real and what is not

| Part | State |
| --- | --- |
| Afrobeats music | **Original, generated, shipped.** Loopable Ogg/MP3 files. Structure, tempo, loop length and loudness are measured. **It has not been listened to by a human or by me** (no audio output available), so groove, taste and mix balance are unjudged. It is synthesised audio and should not be described as professional studio quality. |
| Lagos street / bus-park / market ambience | **Generated, shipped.** Babble made from the synthetic Pidgin clips plus synthesised engines, generators, horns and clanks. **Not a field recording of Lagos.** Not listened to. |
| Spoken Nigerian Pidgin | **Synthetic placeholder speech, shipped, and clearly flagged.** 134 lines are audible in the game, but they come from English-trained neural voices reading Pidgin spelling. **They are not recordings of Nigerian speakers and the accent is not authentic.** A Nigerian listener will hear that immediately. Pidgin tone/intonation is not modelled. Whether the lines are intelligible *to a Pidgin speaker* has not been assessed by any human. |
| Slots for real voice recordings | **Done and tested** (`public/audio/voices/recorded.json`, per-line override, licence required) plus a recording script (`docs/VOICE_RECORDING_SCRIPT.md`). |

Why no authentic Pidgin speech: the sandbox has no Nigerian speakers, no Pidgin/Yoruba/Igbo TTS model is reachable
(Hugging Face, Freesound and most model hosts are blocked; the only free neural TTS reachable was Kokoro-82M via a
GitHub release, which has American/British/Hindi/Spanish/etc. voices but no Nigerian one), and espeak-ng ships no
Yoruba/Igbo/Pidgin voice. Paid speech services were ruled out by the brief. Captions, whistles and groans were not
accepted as a substitute, so the honest result is: intelligible-to-English-listeners placeholder speech now,
real recordings later through the prepared slots.

## What ships

```
public/audio/
  music/            manifest.json, match_loop, menu_loop, match_tension, sting_win/lose/draw   (.ogg + .mp3)
  voices/           voices.json (index, flagged synthetic), react.ogg/.mp3, ambient.ogg/.mp3 (sprite sheets),
                    recorded.json + recorded/ (empty slot for real recordings)
  crowd_loop, buspark_loop, crowd_loop_hype   (.ogg + .mp3)  Lagos ambience beds, loaded as sample slots
  slots.json, ambience_report.json
tools/audiogen/     the generators (Python): everything above is reproducible from these scripts
src/audio/          music.ts, pidgin.ts, pidginReactions.ts, prefs.ts (+ buses/engine changes)
src/ui/AudioSettings.tsx   the settings panel (title screen + pause menu)
```

Total shipped audio is about 11 MB of files (Ogg and MP3 copies), but a player downloads the Ogg set only (about 4.8 MB) unless the
browser cannot decode Ogg Vorbis, in which case it falls back to the MP3 of the same name.

## 1. Music ("Lagos Lunch Rush" and friends)

Original compositions written as note data in `tools/audiogen/compose_match.py` / `compose_extra.py` and rendered to
audio by numpy/scipy synthesis (`instruments.py`, `dsp.py`, `songlib.py`). No samples, no existing songs or melodies,
no lyrics. Nothing is copied: the hook and riffs were written for this project.

| Track | Length | Tempo | Role |
| --- | --- | --- | --- |
| `match_loop` | 71.1 s, 32 bars | 108 BPM, A minor | In-match bed. 8 bars groove (guitar riff, congas, shakers, rim, bass) / 8 bars hook (kalimba lead, Rhodes-style stabs, pad, agogo, clap) / 8 bars variation (pluck lead over e-piano, talking-drum fills) / 8 bars breakdown and build (kick drops out, pad and arpeggio, then rim roll, riser, conga and talking-drum fill into bar 1). |
| `menu_loop` | 38.4 s, 16 bars | 100 BPM | Title, menus, results. Softer and sparser, different chords (Fmaj7 Em7 Dm7 Cadd9 ...). |
| `match_tension` | 17.8 s, 8 bars | 108 BPM | Pitchless percussion stem (four-on-the-floor pulse, 16th shaker, congas, claves, rim build, riser). Fades in over the match loop for the final 30 s. 8 bars divide the 32-bar loop exactly, so it stays phase-locked. |
| `sting_win` / `sting_lose` / `sting_draw` | 6.5-8.2 s | | Result stings in the same palette (fanfare with talking drum / wry descending guitar / unresolved suspension). |

Instruments (all built from first principles): Karplus-Strong plucked strings (clean electric and nylon guitar, palm
mutes), warm sub bass with finger noise, FM Rhodes-style electric piano, inharmonic kalimba/marimba lead, additive
pads, a rounded synth pluck, and percussion models: kick, rim, snare, clap, hats, seed shaker/sekere, congas
(membrane partial model with slap, mute, heel), bongos, agogo bell, clave, cowbell and a pitch-gliding talking
drum. Rhythm: syncopated 3-3-2 style kick/bass placement, 16th shaker contour, conga phrases that alternate every
bar, offbeat keys stabs, per-hit timing/velocity humanisation (seeded), kick side-chain on bass and pad, dotted-8th
ping-pong delay on guitar and lead, plate reverb, gentle bus compression and per-section level automation.

**Loops are seamless by construction**: notes and the reverb/delay tails wrap around the end of the loop (circular
mixing and circular convolution), so the tail of the last bar sounds under bar 1. Checked three ways:
`build_music.py` records the wrap-around jump ratio; ffmpeg's decode of both the Ogg and the MP3 has exactly the
rendered sample count (3,136,000 frames for `match_loop`); and the player loops `[0, manifest samples)` so a decoder
that pads (some MP3 decoders do) still loops on the musical boundary. Real Chromium decodes the Ogg to the exact
length (verified).

Regenerate: `pip install numpy scipy pyloudnorm`, ffmpeg with libvorbis + libmp3lame, then
`python3 tools/audiogen/build_music.py` (about 5 minutes; `OMP_NUM_THREADS=1` avoids thread oversubscription).

Honest limits: this is physical-model/FM synthesis driven by a step sequencer. Real players, real room sound and
real mixing engineers would do better; the groove has been analysed (the 108 BPM beat period dominates the onset
autocorrelation; the strongest repeat is the dotted-quarter 3-3-2 feel; sections show the intended dynamics) but not
heard.

## 2. Lagos street ambience

Three seamless beds replace the old synthesised ones through the sample-slot mechanism (so any real recording named
`crowd_loop.ogg` etc. would replace them in turn), plus a scheduler that adds conversations on top:

- `crowd_loop` (44 s): market/bus-park babble. About 34 overlapping voice streams built from the synthetic Pidgin
  clips (random pitch +/-15%, band-limited, panned, with silence gaps), so it has speech rhythm and phonemes but no
  intelligible words, plus faint metallic market clinks. Murmur, not roar.
- `buspark_loop` (38 s): four idling diesels, two two-stroke generators, distant traffic wash, seven passing
  danfos/okadas/trucks with Doppler, car/danfo/truck horns in sparse two-tone patterns, door clanks.
- `crowd_loop_hype` (33 s): the same babble livelier and brighter plus a few scattered handclaps, for exciting
  moments. There is no cheering swell and no roar.
- **Stadium behaviour removed:** `roar` and `cheerBig` crowd reactions are demoted to ordinary quiet cheers
  ("street mode" in `reactions.ts`), and the babble beds were lowered so speech sits on top of them.
- Beds duck while someone speaks (`buses.duck('speech')`), and for blasts/warnings as before.

## 3. Spoken Nigerian Pidgin

### What you can hear

134 lines, spoken by 20 different synthetic voices (10 male, 10 female presets, 6-7 lines each), rotated so the same
voice does not speak twice in a row. 85 reaction lines and 49 street conversation/call lines in 27 scenes. The full text with
ids and triggers is in `docs/VOICE_RECORDING_SCRIPT.md`; `voices.json` also stores the phoneme string and a rough
speech-to-text check for every clip. Examples from the brief, all present: "Oga, abeg shift small!", "Wetin dey
happen for that side?", "How much you wan collect?" (as "Aunty, how much you wan collect for this one?"), "Abeg,
make I pass!", "Ah! You don finish am!", "Omo! See as e take escape!", "Wetin be this one?", "Chai! That Danfo don
carry am go!", "See calculation! This guy wicked!", "Oga, where you dey run go?". Conductor calls ("Oshodi! Oshodi!
Enter, enter!", "Ikeja!", "Yaba!", "Obalende! Island!"), hawkers ("Pure water!", "Gala!", "Suya!", "Agege bread!"),
bargaining, arguing, teasing and everyday chatter are included as ambient scenes.

### How the speech was made

`tools/audiogen/build_voices.py`: Kokoro-82M (Apache-2.0, offline, CPU) reads the Pidgin lines of
`tools/audiogen/pidgin_script.py` (the single source for every line). Clips are trimmed, high-passed, levelled to a
consistent loudness and packed into two sprite sheets (`react`, `ambient`) indexed by `voices.json`. The script also
keeps a hand-written pronunciation lexicon (West-African-style vowel set) for the optional `--method ipa`, and fails
on any line containing a word missing from it, which doubles as a typo check.

### Measured, not heard

A Whisper-small.en speech-to-text round trip is stored per clip. It is a crude proxy: it knows English, not Pidgin,
so it cannot judge pronunciation. On the 134 isolated shipped clips the transcript matches the intended Pidgin spelling with mean
similarity 0.86 (median 0.91; 104 clips at 0.8 or better, 3 below 0.5, one of those a digit-formatting artefact).
That number rewards English-like pronunciation and says nothing about how Nigerian the speech sounds. Two ways of
feeding Kokoro were compared on 66 reaction lines: the Pidgin spelling through Kokoro's English front end scored
0.88 and my hand-written West-African-style IPA pronunciations scored 0.72, so the spelling route ships
(`build_voices.py --method ipa` still produces the IPA version). **Inside the mixed engine output** (a real-Chromium
recording of a bot match at default volumes) the same recogniser recovers roughly half of the lines (mean
similarity to the isolated transcript 0.45): reactions that land in quiet moments are clear, ambient lines and lines
under explosions are partly masked.

### Limitations (please read)

1. **Not authentic Nigerian speech.** English-trained voices; accent, rhythm and tone are not Nigerian.
2. **Not assessed by any human**, let alone a Nigerian Pidgin speaker. Some lines may be hard to understand.
3. **Synthetic placeholder by design.** It is flagged in `voices.json` (`"synthetic": true`), in the settings panel
   and here. A "Pidgin voices" switch lets a player turn it off.
4. Masking: speech has to compete with music and effects. Levels were tuned with a real-Chromium recording of the
   engine output and the same speech-to-text proxy; ambient lines are deliberately quieter than reactions and are
   still partly masked during busy moments.
5. Each line exists in one synthetic voice only; variety comes from 20 voices across 134 lines and from small
   per-play rate changes.

### Replacing the placeholders with real recordings

See `public/audio/voices/recorded/README.md`. In short: record the lines from `docs/VOICE_RECORDING_SCRIPT.md`, drop
`<clip id>.ogg` into `public/audio/voices/recorded/`, list it in `recorded.json` with a licence/consent statement. It
replaces the synthetic line with the same id (or adds a line to a category). Nothing else changes.

### Regenerating everything

```
pip install numpy scipy pyloudnorm kokoro-onnx sherpa-onnx     # + ffmpeg with libvorbis and libmp3lame
python3 tools/audiogen/build_music.py                           # music (OMP_NUM_THREADS=1 recommended), ~5 min
# Kokoro model files (~350 MB, not committed): kokoro-v1.0.onnx + voices-v1.0.bin from the kokoro-onnx GitHub
# release "model-files-v1.0"; optional ASR check: sherpa-onnx-whisper-small.en from the sherpa-onnx "asr-models" release
python3 tools/audiogen/build_voices.py --models <dir> [--asr <whisper dir>] --work <scratch dir>   # ~15 min
python3 tools/audiogen/build_ambience.py --voices <scratch dir>                                      # needs the clips above
python3 tools/audiogen/export_script.py                                                              # docs/VOICE_RECORDING_SCRIPT.md
```

## 4. Context-aware audio

`src/audio/pidginReactions.ts` (`reactionsFor` is a pure function) and the existing `eventRouter.ts` map gameplay to
sound. Spoken categories and their triggers:

| Trigger | Category |
| --- | --- |
| match starts | `match_start` |
| generator placed | `gen_placed` |
| a timed generator within 4 tiles of the player has under 50 ticks of fuse (once per generator) | `fuse` |
| near miss (flame / vehicle) | `escape`, or the vehicle's line |
| player eliminated / opponent eliminated | `elim_human` / `elim_bot`, or the killer vehicle's line |
| Danfo, taxi, Keke warning / launch / near miss / kill | `danfo`, `taxi`, `keke` |
| vehicle destroyed | `vehicle_destroyed` |
| Okada saves the player / an opponent's Okada breaks | `okada_save` / `okada_break` |
| last 30 s, last 10 s | `final` |
| win, loss, draw | `win`, `lose`, `draw` (plus the music sting) |
| kicks/throws, rare pickups, pushes, dazes, crowd bottles and firecrackers, crush landings, potholes and oil | `kicked`, `pickup`, `pushed`, `dazed`, `thrown`, `crush`, `hazard` |

Variety and restraint (all unit-tested, `src/audio/pidgin.ts`): per-category cooldowns of 8-30 s; at least 4.5 s
between unforced reaction lines; one reaction voice at a time (forced lines never overlap another line); shuffle-bag
line choice (every line of a category before any repeat) with a 40 s recent-line memory; the previous speaker is
avoided; duplicate triggers (same category and key within 0.6 s) collapse to one; ambient conversations wait 2.5 s
after any reaction and never overlap each other; chatter is ducked while a reaction speaks. The synthesised effects
(generator place/fuse tick/blast/vehicle sounds) are unchanged; the street ambience runs underneath the whole match.
Music: menu loop from the first gesture, crossfade to the match loop on match start, tension stem for the last 30 s,
sting on the result, menu loop again on the results screen.

## 5. Settings

`src/ui/AudioSettings.tsx` (used on the title screen and the pause menu): four independent sliders

| Slider | Default | Controls |
| --- | --- | --- |
| Master | 80% | everything |
| Afrobeats music | 45% | music loops and stings |
| Lagos ambience & voices | 65% | street beds, crowd reactions, spoken Pidgin |
| Gameplay effects | 85% | synthesised effects and warnings |

plus a mute button (shared with the HUD button; stored in the existing app settings) and a "Pidgin voices" on/off
switch and a reset. Preferences are saved in `localStorage` key `wahala.audio.v1`; corrupt or unavailable storage
falls back to the defaults. The engine follows the store by itself (the legacy `setVolumes()` is ignored while a store
is active, so a stale caller cannot override what the user saved). Browser autoplay rules: nothing is created before
the first pointer/key gesture; `unlock()` then creates and resumes the context and the menu music starts as soon as
its file has decoded.

## 6. Verification

Automated (all in `tests/audio/`): preferences (defaults, persistence, corruption, clamping), music player (loading,
fallback to MP3, scene crossfades, loop points from the manifest including padded decodes, phase-locked stem, stings,
silent fallbacks), spoken-Pidgin director (cooldowns, shuffle bag, voice variety, dedupe, one-voice-at-a-time,
ambient scheduling, off switch, recordings override), reaction mapping, engine integration (menu music after unlock,
volume independence of master/music/ambience/effects, saved preferences, sting on result, tension stem, mute),
shipped-asset checks (loop lengths = bars x tempo, Ogg frame counts, manifests, licences, honesty flags, example
lines), and the settings panel markup. Real-browser check: `tools/audio/browserSmoke.mjs` (headless Chromium, real
Web Audio, real files) plays a four-bot match through the real engine and records the mixed output.

Not verified: how anything sounds. See the table at the top.
