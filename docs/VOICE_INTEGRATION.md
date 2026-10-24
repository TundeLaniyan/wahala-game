# WAHALA! - Nigerian voice integration and clean gameplay HUD

Branch `claude/wahala-voice-integration`, started from `claude/wahala-mobile-joystick-audio` at `7ef982f`.
Founder instruction of 2026-10-24. Decisions V1-V10 are in `DECISIONS.md`; the full audio description (event
mapping, mixing, loading, how to add clips, licensing) is in `AUDIO.md` "Voice lines"; verification in
`IMPLEMENTATION_STATUS.md`. The nine arenas, City Rumble, the floating joystick, the music-first mix and the nine
arena songs, all generator mechanics and power-ups, vehicle attacks, stage hazards, Wahala Crush, tutorials, the
camera and the CI-gated Pages deployment are unchanged.

## 1. Import and validation

`WAHALA_VOICES_CURRENT.zip` held `manifest.json` (the founder's plan: 58 entries = 47 voice lines + 1 rejected
conductor line + 10 sound-effect requests) and 21 WAVs: **19 usable clips** and the two rejected
`conductor_cms_01` versions (in `rejected/`, not imported). Every usable clip: RIFF PCM 16-bit, mono, 24 kHz,
0.57-4.59 s, peaks -0.6 to -3.4 dBFS, no clipped samples, no long internal silences. Notes for the founder's ear:
`elimination_01` is 4.6 s (planned 2.0 s), `danfo_hit_03` 3.2 s with two short pauses (planned 2.0 s),
`keke_approach_01` 0.6 s. Nothing was generated, substituted or re-synthesised; no TTS request was made.

The clips are trimmed to 40 ms of silence, loudness-matched to -16 LUFS (measured afterwards: -16.4 to -16.8 LUFS,
peaks at most -1.3 dBFS) and encoded MP3 mono 24 kHz 64 kbps: 0.33 MB for all 19 (1.8 MB as WAV). MP3 decodes with
`decodeAudioData` on iOS Safari, Android Chrome, desktop Chrome/Firefox/Safari.

**Available (19):** `danger_run_01-03`, `danger_explosion_01-03`, `escape_01-03`, `elimination_01-03`,
`danfo_hit_01-03`, `keke_approach_01-03`, `market_come_buy_01`.

**Missing (28 of the 47 planned):** `okada_saved_01-03`, `victory_01-02`, `final_seconds_01`, `conductor_shift_01`,
`conductor_no_change_01`, `park_driver_move_01`, `park_transport_fare_01`, `park_going_yaba_01`,
`market_how_much_01`, `market_last_price_01`, `market_no_price_01`, `market_customer_back_01`,
`market_make_i_pass_01`, `market_bargain_exchange_01-02`, `park_fare_exchange_01`, `park_route_exchange_02`,
`crowd_gasp_01`, `crowd_ahhh_01`, `crowd_laugh_01`, `crowd_irritated_01`, `crowd_excited_01`, `crowd_argument_01`,
`crowd_groan_01`, `crowd_scream_01`. Rejected (never ships): `conductor_cms_01`.

## 2. Events -> voices

| Game event | Voice trigger | Clips now |
| --- | --- | --- |
| Generator about to blow (<= 1.25 s) with you in its cross | `ON_GENERATOR_CRITICAL_PROXIMITY` (urgent, forced) | "Oga! Run o!", "Ah! E wan blow!", "Abeg, comot for there!" |
| A blast (30 %, 55 % if a chain or near you) | `ON_GENERATOR_DETONATE` | "Chai!", "Wahala don burst!", "Omo! Wetin be this?" |
| Flame right beside a player who survives | `ON_PLAYER_NARROW_ESCAPE` | "Omo! See as e take escape!", "Na small remain!", "This guy sharp o!" |
| A player is out (yours forced) | `ON_PLAYER_ELIMINATED` | "Ah! E don finish!", "You don carry last!", "Na so dem take catch am!" |
| Out by a Danfo (attack vehicle or stage sweep) | `ON_DANFO_HAZARD_IMPACT` | "Danfo don carry am go!", "Chai! See accident!" |
| Danfo launching / Danfo sweep warning | `ON_DANFO_HAZARD_SWEEP` | "Oga driver, easy!" |
| A bot's Keke attack warning / Keke sweep warning | `ON_KEKE_HAZARD_SPAWN` | "See Keke!", "Omo! Na who dey drive?", "Wetin this Keke dey find?" |
| Market background talk (Balogun, Oshodi, Yaba, City Rumble) | `AMBIENT_SCHEDULER_MARKET` | "Aunty, come buy!" |
| Okada saves you; you win; 0:30 left; bus-park talk; crowd gasps, laughs, groans... | 12 more triggers, all wired | silent until their clips arrive |

## 3. Reaction text removed from the board

- The crowd speech bubbles (bottom centre: over the bottom row and the lower-left spawn on phones) and their
  generator are gone. The crowd speaks only through the clips.
- Kept, but moved into the **HUD rail** beside the board, under the left portraits: stage-hazard alerts, the
  status notices (vehicle incoming, floor traps, Okada saved you, manhole, generator soaked, City Rumble counts),
  the Power Yard rule during the countdown, and the subtitles. The rail is sized from the board's real on-screen
  corners so it ends 10 px short of the board edge; City Rumble's follow camera keeps the column top-centre.
- Unchanged: clock, portraits, inventory and pickup chips, countdown digits, spectate bar, vehicle entry panel,
  menus and every tutorial text.

## 4. Subtitles

Setting **Off (default) / On / Large** on the title screen and in the pause menu. Shows the line being spoken, for
its length, in the rail; urgent warnings have a red edge, background talk is italic; no fallback box for a line
without a clip. Critical warnings stay visual whatever the setting (stage alerts, notices, floor telegraphs).

## 5. Mixing

Foreground voices on their own bus (no warning-band notch, `1.3 x sqrt(ambience slider)`), music ducked to 0.5
under a line and 0.4 under an urgent one, smoothly restored; background talk about 8 dB quieter on the ambience
path, never ducks the music; one foreground line at a time, urgent forced lines interrupt less urgent ones; manifest
cooldowns, shuffle bags, 40 s no-repeat. Defaults, sliders, mute, the voices switch, the nine arena songs and the
endgame tempo escalation unchanged. Not judged by ear (no speakers in the build container).

## 6. Adding the next batch

`python3 tools/audio/voices/import_voices.py --add /folder/with/new_wavs` (file names as in the founder manifest),
then update the expected list in `tests/audio/assets.test.ts`, `npm run check`, listen, commit. No game code
change; missing lines stay silent. Details: `AUDIO.md` "Adding voice clips".

## 7. Licensing

Synthetic voices (Google Gemini TTS, voices Puck/Kore), founder-approved; Google does not claim ownership of
generated content; open items before a commercial release (preview-model status, free-tier data use, a possible
SynthID watermark, AI-content disclosure): `AUDIO.md` "Licensing and publication". No credentials in the repository.

## Screenshots

`docs/screenshots/voice/`: phone and desktop frames during play with a stage alert, a status notice and a subtitle
in the rail and the bottom row (with the lower-left spawn) uncovered.
