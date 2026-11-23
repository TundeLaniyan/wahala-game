# Original-theme audio integration (branch `audio/wahala-original-theme-integration-v1`, decision AU1)

Based on `claude/wahala-stitch-uiux-v1` at `66f3e3d` (2026-11-23, verified against `origin`). Not merged, not deployed; the Architecture chat owns releases. Nothing shipped was replaced, and **the theme is not final: it is an unapproved candidate until the founder has listened and approved it.**

The standalone audio work (synth source, MIDI score, listening page, 39 SFX drafts, runtime manifest, its own `AudioManager.js` and tests) stays untouched on branch `ccr-c34a3c6b-ag8exj` (`audio-pipeline/`, `docs/audio/`). It is deliberately not copied here.

## 1. What the game already has (inspected)

| Area | Existing implementation |
| --- | --- |
| Engine | `src/audio/engine.ts` (`createAudio`): lazy unlock on first gesture, iOS priming, four persistent volumes + mute + voices switch (`prefs.ts`), buses with limiter and ducking (`buses.ts`), pause, lifecycle, `dispose()` |
| Music | `music.ts` + `playlist.ts` + `escalation.ts`: streamed `<audio>` tracks through Web Audio, manifest-driven (`public/audio/music/manifest.json`), per-arena signature tracks, no immediate repeat, crossfades, endgame tempo (pitch preserved) and tone lift from the game clock. Fourteen approved Pixabay MP3s (about 55 MB). The `menu` playlist is **empty**, so menus are silent |
| Effects | About 90 sounds synthesised at runtime (`src/audio/recipes`): UI, generators, fuse, blasts, vehicles, Danfo/Keke/Okada/train, crowd, pickups, stings. Routed by `eventRouter.ts` from `SimEvent`s. `slots.json` can replace any of them with a licensed file (empty today) |
| Voice | 47 of 47 planned founder Gemini-TTS Pidgin clips (synthetic voices), per-arena loading, director with priorities and cooldowns (`pidgin.ts`, `pidginReactions.ts`), subtitles in the HUD rail |
| Guards | `tests/audio/assets.test.ts` fails on any audio file other than the approved tracks and clips; the previously rejected generated music, TTS voices and ambience may not return (`menu_loop`, `match_loop`, ... name patterns) |
| Policy | `CLAUDE.md`: do not generate or reintroduce music, voices or ambience yourself; music only through the manifest; never call synthesised or TTS sound a recording |

## 2. Standalone `AudioManager` vs the existing engine

The game already does everything my manager did, more completely. **No second manager was added.**

| Concern | Standalone manager | Existing engine | Decision |
| --- | --- | --- | --- |
| Mobile unlock, iOS prime, interrupted resume | yes | `unlock()`, `primeContext`, `resumeContext` | use existing |
| Volumes, mute, persistence | 4 buses + mute | 4 sliders + mute + voices, migrated saves | use existing |
| Ducking, danger over music | music duck on danger/blast | richer: warn bus never ducked, per-cause depths, voice ducks | use existing |
| Voice limiting, priority, cooldown | per-id caps, global 24 | mixer voice pool + director | use existing |
| Music streaming | decode stems into memory (about 40 MB) | `<audio>` streaming, nothing decoded | use existing (so stems are **not** ported) |
| Intensity layers | 3 beat-synced stems | endgame tempo and tone from the clock | use existing; stems premixed |
| Stop on restart/navigation | epoch tokens | `stopMusic`, `dispose`, deck release, tests | use existing |
| Event map | `audio-manifest.json` `events` | `eventRouter.ts` (SimEvent-driven) | use existing |

Only one thing was missing in the game: a way to **audition unapproved candidate audio** without touching shipped assets. That is the scaffolding below.

## 3. How each draft asset is handled

| Draft asset | Handling | Why |
| --- | --- | --- |
| Menu loop (34.3 s, -16 LUFS) | candidate music track, menu scene | the game's menu playlist is empty, so this replaces nothing |
| City Rumble stems | **premixed to one loop** (`wahala_draft_rumble`, -16 LUFS), candidate match track | stems need decoded memory and a second engine; the existing escalation already raises intensity |
| Victory / defeat stingers | candidate slot overrides for `win_sting` / `lose_sting`, `?audiodraft=stings` only | the game has synthesised stings; override is per page load, never default |
| Logo sting | staged for review only, no hook | the game has no title-reveal event; needs a UI decision |
| 39 SFX drafts | **not imported** | every category already exists as a synthesised recipe; importing would replace existing audio. Keep as A/B reference on the audio branch |
| MIDI score, listening page, synth source, tests | stay on `ccr-c34a3c6b-ag8exj` | not game assets; the `tools/audiogen/` precedent shows generators must not sit in the game repo |
| Trailer | not imported | marketing asset |

## 4. The scaffolding (all additive, off by default)

- `src/audio/candidates.ts` (pure): `?audiodraft` modes `menu`, `match`, `stings`, `all` (bare flag = all, `off`/`0` = off) and `mergeCandidateMusic`, which only **adds** tracks (never replaces an approved id), marks them `candidate`, and returns the same manifest object when off.
- `playlist.ts`: `MusicTrack` gets optional `url` and `candidate`. `parseMusicManifest` never reads them, so a manifest cannot redirect an approved track.
- `music.ts` / `engine.ts`: with the flag, fetch `audio/candidates/manifest.json` (and `slots.json` for stings) after the shipped ones. Without it **no candidate request is ever made.**
- The files live in `tools/audio/candidates/wahala_original_theme_v1/` (AAC `.m4a`, about 0.9 MB, `approved:false`, licence text says NOT approved), **not under `public/`**. `npm run audio:stage-candidates` copies them to the git-ignored `public/audio/candidates/`; `npm run audio:unstage-candidates` removes them. A production build without staging is inert; a force-added file fails `tests/audio/candidates.test.ts`.
- `tests/audio/assets.test.ts` was changed deliberately in one place: it skips the git-ignored staging folder.

Audition: `npm run audio:stage-candidates && npm run dev`, then `/?audiodraft` (menu loop on the title screen, rumble mix in any match, candidate stings), or `?audiodraft=menu|match|stings`.

## 5. Verification (run on this branch)

- Typecheck, ESLint: clean. Full Vitest: 320 files, 4,985 passed, 7 skipped (including 14 new tests in `tests/audio/candidates.test.ts`: modes, pure merge, no mutation, no id clash, manifest cannot set `url`, player with and without staged files, "off requests nothing", committed candidates unapproved, nothing tracked under `public/audio/candidates`).
- Real Chromium, dev server, files staged: default URL requests no candidate file and the menu stays silent as before; `?audiodraft` plays `wahala_draft_menu` (position advancing, AAC streamed); `?audiodraft=match` in a real match plays `wahala_draft_rumble` through the existing chain at rate 1.0.
- Existing `e2e/audio.spec.ts`, desktop and phone: 14 of 14 pass, 12 of them on the automatic retry (the repository documents the single-process Chromium closing a context in this container); I did not run a baseline without my change for comparison.
- **Not verified:** how any of it sounds (nobody has listened); Safari/iOS; `<audio loop>` gaplessness of the AAC loop (browsers do not guarantee sample-accurate looping; the loop is 16 bars, 34.3 s, so a small gap at the seam is possible); levels on phone speakers; the music crossfade and endgame escalation on this material.

## 6. Open risks and decisions for the founder

1. `CLAUDE.md` says generated music was rejected and must not be reintroduced. This candidate is also synthesised. It is gated, unapproved and absent from builds, per the founder's assignment of this workstream. **Only the founder can approve it.**
2. Ownership and similarity clearance of the composition are unresolved (see `docs/audio/DELIVERY.md` on the audio branch).
3. Existing tracks are levelled to about -14 LUFS; candidates are -16 LUFS with manifest gain 1.26 (about -14). Compare by ear.
4. Escalation (tempo up to 1.09, brightness) was designed for different music. Judge it on the candidate.

## 7. Promotion checklist (only after the founder approves, and only by the release owner)

1. Founder listens (`/?audiodraft`, plus the listening page on the audio branch) and approves each piece in writing. Record the decision in `docs/DECISIONS.md`.
2. Settle ownership/clearance; replace the licence text.
3. Move the approved files to `public/audio/music/` with real tracks in `manifest.json` (`approved:true`) and menu/arena playlists; add licence rows in `public/audio/LICENSES.md`.
4. Update `tests/audio/assets.test.ts` deliberately (allowed ids, count, the name guard) and `docs/AUDIO.md`.
5. Re-measure loudness and loop seam on the final files; decide the sting hooks.
6. Remove the overlay or keep it for future auditions.

## 8. What is still missing (exact)

**Music**
- Approved Pixabay track #7 `pixabay_496406.mp3` (listed, file never supplied).
- Menu/title music: none approved (the menu playlist is empty).
- Campaign and story music: none. Missions and bosses use the arena tracks.
- Boss music: none. Seven bosses have no theme.
- Result music: win/lose/draw are synthesised stings only; no approved musical victory/defeat theme.
- Logo or title sting: none, and no game event to play it on.

**Voice**
- All 47 planned lines exist, but they are synthetic Gemini TTS, not recordings of people; the licence/disclosure review in `docs/AUDIO.md` is open.
- No line for defeat or draw, the 3-2-1 countdown, or the campaign.
- Campaign narration: `NARRATION_CLIPS` is empty and `public/audio/narration/` does not exist.
- No boss or campaign dialogue, and no real person's voice or likeness may be used (project rule).
- `conductor_cms_01` stays rejected.

**Environmental and effect recordings** (`slots.json` is empty, so every effect and bed is synthesised)
- The founder manifest's ten `PENDING_SFX_SOURCE` items: `danfo_horn_01`, `danfo_idle_01`, `danfo_accel_01`, `keke_engine_01`, `okada_accel_01`, `street_footsteps_01`, `market_objects_01`, `metal_clatter_01`, `market_trolley_01`, `lagos_traffic_amb_01`.
- Recorded generator, explosion and impact foley, and recorded crowd/market/traffic beds.
- Boss cues borrow other sounds today: `bossHit` uses `pickup_rare`, `bossInterrupted` uses `ui_count`, `bossDefeated` uses `win_sting`; there is no dedicated boss wind-up, vulnerability or slam sound.
- Nothing has been judged by ear.
