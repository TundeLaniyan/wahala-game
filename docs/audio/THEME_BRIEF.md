# WAHALA! — Lagos City Rumble (Main Theme): composition brief

Status: **draft 1, synthesised by code, not heard by its author.** Founder listening approval is required. Playable review page: https://claude.ai/artifact/HAiW3N7kdwYmsaH81RjYrW (private link; share from its Share menu).

## 1. Concept

A generator that will not start, then does. The brand sound is a pull-start sputter that accelerates and catches into an ignition boom, followed by the three-note shout **"wa-HA-la!"** (short, long-accented, short). That one rhythmic cell is the hook, the logo sting and the victory fanfare, so every cue is recognisably the same game.

It avoids a generic Afrobeat loop by building identity from three things:
1. **The spoken hook.** The melody is the rhythm of the word. It rises on repeat and falls in the answer, landing on D4 so the phrase loops into its own pickup.
2. **A 3-3-3-3-2-2 agogo bell cycle** laid across a 4/4 grid (a tresillo cousin), with a syncopated kick, rim ghost notes and a conga tumbao. This is traditional rhythmic vocabulary, used as a framework, not a copy of any recording.
3. **A talking-drum voice** that "answers" the melody at phrase ends, and a generator-sputter sound as the brand's own texture.

It does not quote or imitate any artist, song or existing game theme. The melody is original; no automated or musicological similarity check has been run (see `DELIVERY.md`).

## 2. Musical spec

| | |
|---|---|
| Tempo | **112 BPM** for every cue, so stems, stings and transitions can be beat-synced. One bar = 2.143 s. |
| Metre | 4/4, 16 steps per bar |
| Key | D Dorian / D minor pentatonic centre (D E F G A B C). Victory lifts to D major (F sharp). |
| Palette | sub bass with saturated upper harmonics (phone speakers); kick; clap on 2 and 4; rim; hi-hats; shaker; agogo bells (D5, A5); congas; talking drum; palm-wine-guitar style pluck ostinato; synth horn lead with pluck double; brass stabs; soft pad. |
| Chords | Dm7, Dm7, G, Am (verse) / Bb, C, Dm7, Dm7 (chorus lift) / Dm7, Dm7, G, A (turnaround) |
| Emotion arc | tension and groove (bars 1-4), the hook arrives (5-8), the crowd roars (9-12), cool-down that pulls you back in (13-16) |

### Hook (Dm7, bars 1-2 of the phrase; step = sixteenth, MIDI pitch)
`A4(1) D5(3) C5(2) | A4(1) D5(3) F5(2) E5(2) D5(2) || C5(2) D5(1) C5(3) A4(2) G4(2) A4(2) F4(2) D4(2)`
Syllables: wa-HA-la, wa-HA-LA, then a falling answer. Full note lists for the answer, chorus and victory phrases are in `audio-pipeline/synth/theme.py` (`HOOK_A`, `ANSWER`, `CHORUS`, `VICTORY`) and in the MIDI score `audio-pipeline/drafts/WAHALA_main_theme_score.mid` (5 tracks, 480 PPQ, ready for a producer to re-record).

Automated check (done): every melody note on a strong beat is a chord tone or a sanctioned tension, and the rendered lead plays the scored pitches (108 checks, `synth/verify_theme.py`). That proves the notes are right, not that the tune is good.

## 3. Structure of the 16-bar menu loop (34.3 s)

| Bars | Section | Content |
|---|---|---|
| 1-4 | Groove | kick, shaker, bells, congas, bass, pad, pluck ostinato, a teased hook cell on pluck |
| 5-8 | Hook | horn + pluck play the hook (5-6) and the answer over G and Am (7-8), brass stabs on the offbeats |
| 9-12 | Lift | chorus melody over Bb, C, Dm7, Dm7; four-on-the-floor kick; open hats; talking-drum fill |
| 13-16 | Return | the hook cell again, then drums thin, a talking-drum turnaround leads back to bar 1 |

Loop is seamless by construction: reverb and delay tails are wrapped circularly. Measured: Opus and AAC decode to the exact authored sample count in Chromium.

## 4. Cue sheet and variations (shared material, not duplicated)

| Cue id | Use | Length | Loop | Loudness | Built from |
|---|---|---|---|---|---|
| `sting` | logo and title reveal | 4.2 s | no | -14.9 LUFS | sputter, riser, boom, hook cell on horn, bell glitter |
| `menu_loop` | main menu, loopable instrumental | 34.3 s | seamless | -16.0 LUFS | full arrangement above |
| `rumble_base` | City Rumble, calm layer | 34.3 s | seamless | -24.0 LUFS alone | sparse kick, hats, pedal bass, quiet bell, pad |
| `rumble_perc` | + normal intensity | 34.3 s | seamless | -21.4 with base | congas, shaker, clap, rim, talking-drum fills every 4 bars |
| `rumble_hype` | + final 30 s / Sudden Death | 34.3 s | seamless | -21.0 with all | stabs, ostinato, hook cell every 4 bars, riser into the loop point |
| `victory` | round/match win | 9.9 s | no | -15.0 LUFS | hook in D major over D, Bb, C, D; tutti end chord, bell glitter, roll |
| `defeat` | loss | 3.3 s | no | -17.0 LUFS | three sagging horn slides, low talking drum; comic, not cruel |
| `trailer` | optional trailer treatment | 42.1 s | no | -15.1 LUFS | 20 bars: dread, build, drop, stop-time, title hit |

**City Rumble design rules.** Chords are Dm7, Dm7, Bb, C (darker, less melodic than the menu). The in-match stems are EQ-carved at 3.2 kHz (-4 dB) and 1.1 kHz (-1.5 dB) to leave room for danger cues. No sustained lead plays in the base layer, so Pidgin voice lines and warnings stay clear. The stems are mixed with one shared gain, so they sum cleanly. Engine switches layers on the beat grid with `setIntensity(0|1|2)`.

**Transitions.** All cues share 112 BPM. `playMusic(id, {quantize:"bar"})` starts the next cue on the next bar line. Stingers stop the bed (`playStinger`) and the next bed starts after the stinger or on a bar.

**Trailer treatment (optional).** Bars 1-4: low drone, sparse congas, generator trying to start. 5-8: groove arrives, hook on pluck, clap roll, riser. 9-16: the drop, with the full chorus twice. 17-18: stop-time hits. 19-20: title hit, then the hook shout. Voice-over goes in the gaps at bars 1-4 and 17-18.

## 5. What is and is not a finished recording

- The draft is **synthesised**: realistic enough to judge melody, rhythm, structure and mix, but it will sound like synthesis. It is not a professional recording and should not be presented as one.
- **External production requirement for the final theme:** a composer/producer to re-record from the MIDI score with a drummer or percussionist (congas, shaker, agogo), a talking-drum (gangan) player, guitar, bass and brass, then mix and master. Deliver stems per layer at 48 kHz/24-bit for the three City Rumble layers so the engine's adaptive system keeps working. Keep the tempo at 112 BPM and the loop at exactly 16 bars.
- Hand over to them: this brief, `WAHALA_main_theme_score.mid`, the review page, the loudness targets above, and the instruction "buyout, work-for-hire, no samples without licence, supply cue sheet and splits".
