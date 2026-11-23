# SFX hierarchy, mix, integration plan and file budget (Stages 3 and 4)

All effects in `audio-pipeline/drafts/sfx/` are **procedural placeholders with a considered design hierarchy**. They show the intended loudness, priority and ducking behaviour; a sound designer or licensed library should replace them (same ids, same levels). Review them on the page: https://claude.ai/artifact/HAiW3N7kdwYmsaH81RjYrW

## 1. Combat audio hierarchy

Priority decides who survives when the 24-voice budget is full. "Level" is the loudest 100 ms RMS after normalisation (loops use mean RMS). Music sits at -16 LUFS (menu) and -21 LUFS (all three match layers), then the default bus volumes (music 0.7, effects 0.9) apply.

| Tier | Cues (ids) | Priority | Level / peak ceiling | Behaviour |
|---|---|---|---|---|
| 1 Life-or-death warnings | `gen_warn_a/b`, `gen_arm_final`, `boss_telegraph` | 90-95 | -14 dB / -3 dBFS | tonal 2.4 and 3.15 kHz beeps; never pitch-varied, so they stay recognisable; duck music to 50% and bed to 35% |
| 1 Blasts | `expl_gen`, `expl_chain`, `boss_defeat`, `boss_slam` | 90-95 | -11.5 / -2 | loudest; duck music to 42% for 0.45 s; `expl_chain` is layered 80-120 ms behind `expl_gen`; far blasts use `distance` (quieter and darker) |
| 2 State changes | `sd_alarm`, `sd_slam`, `elim_comic`, `boss_vuln_open` | 80-88 | -14 / -3 | alarm is a two-tone siren at 540/400 Hz; boss "window open" is a bright arpeggio, distinct from wind-up |
| 3 Feedback | `gen_fuse_loop`, `damage_hit`, `shield_hit/break`, `boss_hit`, `daze` | 60-75 | -15 to -17 | fuse loop is quiet, mid-low and non-tonal, so it never competes with the beeps |
| 4 Actions | `gen_place`, punches, push, kick, pickups, `shield_up`, countdown | 45-70 | -15 to -19 | random pitch variance 2-4% so repeats do not machine-gun |
| 5 Interface | `ui_*` | 20-30 | -19 / -7 | short, high, quiet |
| 6 Atmosphere | `horn_honk`, `keke_putt`, `amb_lagos` | 5-15 | -27 (events), -34 (bed) | band-limited under about 1.8 kHz; bed and horns duck under danger cues |

Rules enforced in `AudioManager.js`: per-id cooldown (a chain reaction cannot stack 60 identical blasts), per-id voice cap with oldest-steal, global 24-voice cap with lowest-priority-steals-first, danger cues never lose to quieter sounds.

**Intelligibility under music** is protected three ways: the match music is EQ-carved around 1-4 kHz where the warnings live; the engine ducks music and ambience while a danger or blast cue plays; and levels put warnings above music by roughly 7 dB or more at default settings. These are designed and unit-tested for the ducking behaviour; they have not been judged by ear. That is the first item on the founder listening list.

## 2. Missing sound effects (not yet in any form)

1. **Pidgin voice**: crowd shouts, laughs, teasing, per-event reactions (elimination, near miss, big blast, final 30 s), countdown voice. Needs native-speaker recording and review. Suggested starter lines for a session: "Wahala dey!", "Omo!", "Chai!", "E don do!", "Oya, oya!", "Abeg!", "No vex!", "Who do this one?". Avoid reusing the same take; record three to five variants per line. No synthetic or text-to-speech voice is used or recommended for final.
2. Non-verbal crowd beds: cheer, laugh, groan, gasp, near-silence moments.
3. Vehicles: Okada, Danfo, Keke engine loops and passes (a one-shot Keke putt exists as a placeholder), tyre screech, special-vehicle attack warning.
4. Pickup-specific: Remote Starter click, Kill Switch, Vehicle Voucher, Okada protection on/off, Bad Fuel/Mystery Package reveal.
5. Arena hazards: pothole/gutter, crowd-thrown bottle landing telegraph and smash, Wahala Crush advance rumble (a single slam exists).
6. Campaign and boss: dedicated boss music, per-boss attack sounds, campaign stingers. Only generic boss cues exist.
7. Footsteps/movement (optional) and a countdown voice.
8. Real foley for the generator (metal, fuel, engine) to replace the synthesised sounds.

## 3. Integration plan (no gameplay file is changed by this workstream)

1. **Copy** `audio-pipeline/src/AudioManager.js`, `audio-manifest.json` and `drafts/{music,sfx}` to the game's static assets (for example `public/audio/`). Keep the paths in the manifest (`music/…`, `sfx/…`).
2. **Boot**: `const audio = new AudioManager({baseUrl:'/audio/', manifest}); audio.installUnlock();` then `audio.preload('boot')` (about 41 KB). Show the title screen with the logo sting on the first tap.
3. **Menu**: `audio.event('music.menu')` (queues until unlock). Preload `menu` behind the title (279 KB).
4. **Before a match**: `audio.preload('match')` while the player picks a character; `audio.release('menu')` once the match starts to give back about 13 MB of decoded memory.
5. **Match**: `audio.event('music.rumble')`; `audio.startAmbience()`. Fire gameplay cues with `audio.event('generator.explode', {pan, distance})`. Drive the intensity: `audio.event('music.intensity.1')` at start, `…2` at 30 s left or Wahala Crush.
6. **Fuse**: `generator.fuse.start {id}` loops per generator; `generator.warn.a/b` on an accelerating timer; `generator.fuse.stop {id}` on detonation or removal.
7. **Result**: `audio.event('stinger.victory')` or `stinger.defeat` (stops the bed). **Restart or navigation**: always call `audio.stopAll()` first.
8. **Settings screen**: bind sliders to `setVolume('music'|'sfx'|'ambience'|'voice'|'master')` and a switch to `setMuted()`. Values persist.
9. Replace drafts with final files of the same ids; no code changes needed.

Event names are listed in `audio-manifest.json` under `events`. Unknown events are ignored and counted, never thrown.

## 4. Quality, mobile and efficiency: what is built and what is verified

Verified in headless Chromium (`node audio-pipeline/tests/audio.spec.mjs`, 20 checks, all pass):

| Requirement | Result |
|---|---|
| Audio unlock on first gesture; early music request is remembered; early SFX dropped without error | pass |
| Format negotiation | Ogg Opus chosen in Chromium |
| Seamless loops | Opus and AAC decode to the exact authored sample count in Chromium; wrap step is within the file's normal sample-to-sample range |
| Mute and volume | master reaches 0 on mute; settings persisted and restored by a fresh manager |
| Layers | three stems start on one clock tick; `setIntensity(2)` brings all in |
| Danger ducking | music gain goes 1.0 to 0.5 and recovers |
| Voice budget | 60 identical blasts collapse to 1; 28 distinct cues stay at 24 voices |
| Leaks | `stopAll()` leaves 0 voices, 0 loops, no music, and resets the duck; a music request made then cancelled before decode never starts |
| Page contract | review page loads, plays, and has no horizontal scroll at 400 px |

**Not verified (needs real devices):** iOS Safari behaviour (the silent-switch workaround uses `navigator.audioSession`, Safari 16.4+), AAC loop gaplessness on Safari, whether older iOS accepts the Ogg Opus files (the engine falls back to AAC `.m4a`), real-device latency and CPU, and perceived loudness on phone speakers. Test on at least one iPhone, one low-end Android, one laptop.

## 5. Proposed final formats and download sizes

Ship **Ogg Opus** (smaller) with **AAC-LC `.m4a`** fallback, chosen at runtime by `canPlayType`. A device downloads only one. Do not ship WAV or MP3 to the browser. Keep 48 kHz masters (the build writes them to `audio-pipeline/build/masters`, git-ignored).

| Group | When loaded | Files | Opus | AAC | Decoded memory |
|---|---|---|---|---|---|
| `boot` | at first load (the only mandatory download) | 5 UI sounds + logo sting | **41 KB** | 51 KB | 1.8 MB |
| `menu` | behind the title screen | `menu_loop` | 279 KB | 312 KB | 13.2 MB |
| `match` | during character select | 3 rumble layers, arena bed, 28 effects | 825 KB | 1,113 KB | 46.1 MB |
| `result` | during the match, idle | `victory`, `defeat` | 105 KB | 121 KB | 5.1 MB |
| `boss` | only for boss fights | 5 cues | 28 KB | 45 KB | 1.1 MB |
| not shipped in game | | `trailer` (marketing) | 335 KB | 394 KB | |

Total of everything: about 1.6 MB Opus. First paint cost: **41 KB**. Release `menu` when the match starts: peak decoded memory in a match is about 47 MB, which is the main risk on low-end phones. If testing shows trouble, make `rumble_base` and `rumble_hype` mono (about 13 MB saved) or lengthen nothing.
