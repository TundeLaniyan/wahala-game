# WAHALA! final approved audio: release handoff (decision AU4)

Branch `audio/wahala-production-soundtrack-v1`, based on production `claude/wahala-stitch-uiux-v1` at `31d583b` (merged in; nothing newer existed when this was written). **Not merged, not deployed; Architecture owns the release.** Everything the founder approved (2026-11-25: the seven mastered district songs and the *Lagos No Dey Sleep* package) is now ordinary shipped audio on this branch, through the existing engine: no second audio system, no new playback path. No song was generated or changed for this handoff; the creative approval is not reopened.

Rights are **not** cleared: see section 10 and `docs/AUDIO_PROVENANCE.md`. That is a release blocker for a commercial release, not for merging into a development branch.

## 1. What plays when

| Situation | Music | Mechanism |
| --- | --- | --- |
| Main menu | `lnds_menu` (Lagos No Dey Sleep instrumental loop) | `manifest.menu`, played by the existing menu scene |
| City Rumble match | the selected arena's own district song (section 2) | `playlists.arenas[rumbleX]` |
| City Rumble Sudden Death | that song's own intensified loop (`dist_<family>_sd`), entered on the same beat phase | `variants.suddenDeathFor[family]`, `musicVariantFor(state)` from the authoritative sim state |
| Campaign boss fight | `lnds_boss_1..3` (stalking, engaged, all-out), by mission phase and hits taken | `variants.boss`; the three share one 16-bar grid and switch at the same playback position |
| Match result | `win_sting` / `lose_sting` = `lnds_victory.mp3` / `lnds_defeat.mp3` (the synthesised `draw_sting` stays) | `public/audio/slots.json` |
| Standard arenas (nine), experimental, raid and campaign boards | unchanged: founder-assigned Pixabay song (standard) or the default Pixabay pool | unchanged |
| Gameplay effects | the synthesised engine, plus the new generator / combat / movement / UI / boss / warning sounds of AU2 | `src/audio/recipes`, `eventRouter.ts` |

The generic *Lagos No Dey Sleep* rumble mix (`lnds_rumble`) and its Sudden Death are **not shipped and not wired**: no arena uses them (founder: do not replace the district songs with it). They stay in `tools/audio/candidates/lagos_no_dey_sleep_v1/` and in `?audiodraft=lnds`. Also not shipped, because the engine has no event for them yet: the logo sting and the three campaign atmosphere cues (`lnds_sting`, `lnds_camp_*`); they stay candidates (`?audiodraft`). Each is one manifest/hook addition when a hook exists.

## 2. Arena map (every id the game can start)

Source of truth: `public/audio/music/manifest.json` (`playlists.arenas`), checked for every arena id by `tests/audio/releaseWiring.test.ts` (it reads `ARENAS`, `RAID_ARENAS` and `CAMPAIGN_ARENAS`, so a new arena fails the test until it is assigned or documented).

| Arena id | Song (start point A, then B alternate) | Tempo | Sudden Death loop | Earlier Pixabay track, kept as fallback |
| --- | --- | --- | --- | --- |
| `rumbleOjuelegba` | Asphalt Throne `dist_ojuelegba_a/b` | 110 | `dist_ojuelegba_sd` | `pixabay_515507` |
| `rumbleOshodi` | Oshodi Transit `dist_oshodi_a/b` | 124 | `dist_oshodi_sd` | `pixabay_601035` |
| `rumbleMushin` | Mushin Heat `dist_mushin_a/b` | 110 | `dist_mushin_sd` | none: the default Pixabay pool |
| `rumbleFadeyi` | We Still Dey Move `dist_fadeyi_a/b` | 110 | `dist_fadeyi_sd` | none: the default Pixabay pool |
| `rumbleEbuteMetta` | Steel and Skin `dist_ebute_a/b` | 105 | `dist_ebute_sd` | none: the default Pixabay pool |
| `rumbleLagosIsland` | Lagos Market Swagger `dist_lagosisland_a/b` | 110 | `dist_lagosisland_sd` | `pixabay_554543` |
| `rumbleLekki` | Lekki Power Move `dist_lekki_a/b` | 110 | `dist_lekki_sd` | `pixabay_623364` |
| the nine standard arenas | unchanged founder signature (decision N12) | | none (no loop of its own) | n/a |
| `mobileTest13x9`, `mobileTest15x9`, the six raid boards, campaign boards | default Pixabay pool (unchanged) | | none | n/a |

A and B are two start points of the **same file** (no extra download): the first match on an arena opens on A, later matches alternate, never the same start twice in a row. **Choice to confirm:** the candidate overlay also mapped three standard arenas that share a district (`oshodiInterchange`, `lekkiRoadworks`, `balogunMarket`) to a third start point. That was not part of the founder's approval and would replace those arenas' founder-assigned Pixabay songs, so it is **not applied**; the same applies to the four proposed new-arena fits in `tools/audio/candidates/lagos_districts_v1/manifest.json` (`proposedNotApplied`). Enabling either is a manifest edit plus a deliberate test change.

Fallbacks (`playlists.arenas[x].fallback`, new in the manifest schema): when none of an arena's own files can be played (missing, 404, decode failure), the player uses the arena's listed fallback, then the default pool; silence only if nothing at all is available. A missing Sudden Death file leaves the song playing.

## 3. Sudden Death reliability

How it works (`src/audio/music.ts`): the sim sets `match.suddenDeath`; `musicVariantFor` is a pure function of state; the engine calls `setVariant` each tick (idempotent). The player starts the Sudden Death stream **while the old song keeps playing**, and only when the new stream reports `playing` does it hand over: it seeks the new loop to the old song's place in the **bar** (`new = grid.first + ((old - old.grid.first) mod bar) + 0.04 s`, `bar = 240 / BPM`, so 124 and 105 BPM are handled, nothing assumes 110) and crossfades 1.4 s. If the stream has not started within 12 s the song simply continues. Back to normal returns to the song's own track.

Evidence: `tests/audio/releaseWiring.test.ts` runs the **shipped manifest** through the real player for each of the seven arenas: opens the right song, switches to that family's `_sd`, keeps the old stream playing until the new one is up, and lands on the computed bar phase to 1 ms; returns to the song on `normal`; a missing file falls back to Pixabay. The earlier real-browser check (Chromium, candidate overlay) ran the same code. **Not measured:** the real-device error in milliseconds on iOS Safari and low-end Android, and the `<audio loop>` seam; the hand-over is beat-locked, not phrase-locked (it can enter mid-phrase).

## 4. Event wiring audit

Method: `eventRouter.ts` is a `Record<SimEvent['type'], ...>` (adding a sim event is a compile error until it is routed); `UI_SOUND` is a `Record` over the `playUi` kinds; both are checked by `tsc`. `tests/audio/soundDesign.test.ts` pins the sound each combat / boss / Sudden Death event uses.

| Item | Before | Now |
| --- | --- | --- |
| Menu music | silent menus (empty `menu` list) | `lnds_menu` |
| Menu click / back / start / countdown / go | wired | unchanged |
| Confirmation (campaign upgrade bought / refunded) | click | `ui_confirm` (`session.ts`) |
| Error (upgrade refused, nothing to refund) | back | `ui_error` (`session.ts`) |
| Ready screen | click | `ui_ready` (`menuContinue` when the next screen is Ready) |
| Pause / resume | silent (no sound existed) | `ui_pause` / `ui_resume` from `MatchController.setPaused`, once per real change; the match itself stays silent while paused (`tests/app/pause-audio.test.ts`) |
| Footsteps, punch, knockback, hurt, boss entrance / wind-up / impact / exposed / shield / down, jammer, Sudden Death rise, crush debris | borrowed sounds | their own synthesised sounds (AU2), unchanged here |
| Logo sting, campaign atmosphere cues | n/a | not wired (no engine event); see section 1 |

Not audited by ear; the matrix is from code and tests (`docs/AUDIO_COVERAGE.md` has the full table).

## 5. Package, checksums, how to rebuild

Shipped files (38): 14 district MP3s and 14 Data Saver MP3s, 4 + 4 for the menu and boss, 2 stingers. Total **30.4 MB standard + 15.2 MB Data Saver + 0.16 MB stingers = 45.7 MB** added to the repository and the deploy (about +80% of the audio folder); a player downloads one song and, only when needed, its Sudden Death loop, never the whole set.

- `tools/audio/release/SHA256SUMS`: SHA-256 of every shipped file. `npm run audio:release-verify` checks them from a clean clone (also checks every listed track and its Data Saver file exist, the Data Saver file is smaller, every arena/variant id exists).
- `tools/audio/release/audio-release.json`: the integration manifest (file, bytes, SHA-256, kind; arena map; Sudden Death map; boss; menu; stingers; what is not shipped).
- `tools/audio/release/release.config.json`: the only wiring input (which approved tracks play where). `provenance.json`: sources, hashes, tools, unresolved rights items.
- `npm run audio:release-build` regenerates `public/audio/` from the two packs; `npm run audio:release-check` fails when the committed files differ from a fresh build (CI-usable). The Pixabay manifest entries are never touched.

Rebuilding the masters themselves from the founder's recordings: `tools/audio/production/build_districts.sh WAHALA_Seven_District_Soundtracks_VERIFIED_2026-11-24.zip [fadeyi_instrumental.wav]` (verifies the ZIP against its SHA-256 manifest first), `tools/audio/production/make_candidates.py` for the *Lagos No Dey Sleep* pack (steps in `docs/AUDIO_PRODUCTION.md`), then `npm run audio:release-build`. The pipeline is scripted with fixed loop points in `report.json`, but source separation (Demucs) and MP3 encoding are not guaranteed bit-identical across machines or library versions: **the SHA-256 list pins the shipped bytes, not the build**. The source recordings are not committed (rights); keep them with the generation history.

## 6. Mobile performance, Data Saver, lazy loading

- Nothing is downloaded before it is needed: at start the player fetches the manifest (about 25 KB), HEAD-probes each distinct file once (A and B share one probe; 32 probes now against 14, headers only), and opens the menu theme (0.56 MB, 0.28 MB with Data Saver). A match fetches its arena song (standard 2.7-3.7 MB, Data Saver 1.4-1.9 MB) and, only when Sudden Death starts, its loop (0.74-0.88 MB, Data Saver 0.37-0.44 MB). Boss music (0.56 MB / 0.28 MB each) loads on the boss level.
- Music Data Saver plays the `lite/` file of **every** new track (tested for menu, district, Sudden Death and boss). Existing behaviour is otherwise unchanged (a failing lite file falls back to the full file).
- Playback is the existing streamed `<audio>` player: no decoded buffers in memory, no new Web Audio nodes.
- Open: the extra 45.7 MB in a public repository / GitHub Pages deploy (cache and clone size); decide whether to keep the files in the repo or move them to a CDN at commercial release (`docs/AUDIO.md`).

## 7. Source files changed

Engine / app: `src/audio/playlist.ts` (manifest may carry `startAt`, `grid`, `family`, `syncGroup`, `variants`, per-arena `fallback`; `url` / `candidate` / `liteUrl` are still never read from a manifest), `src/audio/candidates.ts` (overlay keeps shipped variants and fallbacks), `src/audio/music.ts`, `src/audio/musicState.ts`, `src/audio/engine.ts`, `src/audio/eventRouter.ts`, `src/audio/footsteps.ts`, `src/audio/stateLoops.ts`, `src/audio/recipes/production.ts` and `recipes/index.ts` (AU2, AU3), and **three small app edits** in Architecture-owned files: `src/app/ports.ts` (the `playUi` kind union), `src/app/MatchController.ts` (one line in `setPaused`), `src/app/session.ts` (three lines: confirm / error / ready). Data: `public/audio/music/manifest.json`, `public/audio/slots.json`, 38 audio files, `public/audio/LICENSES.md`, `public/audio/README.md`. Tests: `tests/audio/assets.test.ts` (updated deliberately), `playlist.test.ts`, `samples.test.ts`, `musicVariants.test.ts`, `engine.test.ts`, new `releaseWiring.test.ts`, `candidates.test.ts`, `districtMusic.test.ts`, `soundDesign.test.ts`, `tests/app/pause-audio.test.ts`. Tools / docs: `tools/audio/` (production, candidates, release), `package.json` (five `audio:*` scripts), `docs/AUDIO*.md`, `docs/DECISIONS.md` (AU1-AU4), `CLAUDE.md`.

## 8. Instructions for Architecture: merge and validate

1. Fetch your latest production branch. This branch already contains `31d583b`; merge `audio/wahala-production-soundtrack-v1` into a **trial branch** first (not your running branch). Expected conflicts: `docs/DECISIONS.md` and `CLAUDE.md` (append-only rows, keep both) and, if you changed them, `src/app/session.ts`, `MatchController.ts`, `ports.ts` (the audio edits are 1-3 lines each; re-apply by hand if needed: `playUi` kinds in `ports.ts`; `setPaused` plays `pause` / `resume` on change; `campaignBuyUpgrade` / `campaignRefundUpgrades` use `confirm` / `error`; `menuContinue` uses `ready` when the next screen is Ready).
2. `npm ci && npm run check` (typecheck, lint, all unit tests incl. `tests/audio/*`, build). Then `npm run audio:release-verify` (must print `ok`).
3. Run the browser suite on your CI (`e2e/`); this branch ran the unit suite and a scratch real-browser check, not the 14-shard e2e run. Expect no e2e change; anything asserting empty menus, silent `slots.json` or the old arena music would be stale.
4. Manual, on a phone and on desktop: title screen plays the menu theme after the first tap; each of the seven City Rumble arenas plays its own song; force Sudden Death on each (the sim timer or a short match) and listen for the swap on the beat; campaign boss fight plays boss music and escalates; win and lose stingers; Data Saver On: check in DevTools Network that only `music/lite/*.mp3` loads; pause / resume ticks; mute really silences.
5. Rollback is deleting the new `tracks`, `menu`, `variants` and `fallback` entries (or `git revert` of the promotion commit); the Pixabay entries and files are untouched, so the previous behaviour returns.
6. Do not run `audio:stage-candidates` in CI or release; `?audiodraft` remains an opt-in audition of the files that are not shipped.

## 9. Pixabay fallback audio

All 15 Pixabay tracks, their files, Data Saver files and manifest entries are retained unchanged; the four Rumble arenas that had a Pixabay signature keep it as `fallback`; every other arena still plays them. Removing them (smaller repo) is a later decision after real-device verification and the rights resolution.

## 10. Unresolved blockers (stated, not hidden)

**Commercial release blockers (founder / counsel, nothing the code can fix):**
1. Commercial-use rights of the Gemini / Lyria recordings and of the mastered derivatives are unverified (the exact product, tier and terms; Google's terms pages were unreachable from the build environment). The manifest tags every track `rights review pending`.
2. Watermark / AI-content disclosure duties (store and platform policies) not checked.
3. No similarity / clearance check against existing songs, lyrics and titles.
4. Copyright in AI-generated music is unsettled; exclusivity is not guaranteed.
5. Generation records (account, date, prompt, model) are not in the repository: keep them.
6. The files sit in a public repository, so they are downloadable before any rights decision.

**Technical, open:**
7. Nothing was listened to by the assistant; approval is the founder's. The Fadeyi master is the Demucs stem instrumental and may carry ghost vocals.
8. Real-device verification absent: iOS Safari / low-end Android autoplay, `<audio loop>` seam on both, Sudden Death hand-over error in ms, memory and battery with the larger streams.
9. Repository and deploy weight +45.7 MB.
10. The e2e shards were not run here.
11. Builds are pinned by checksum, not bit-reproducible across machines.
12. The three "start C" standard-arena assignments and four proposed arenas are undecided (section 2).
