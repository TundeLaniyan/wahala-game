# WAHALA! - nine arenas, City Rumble, cinematic visuals, mobile preview and tutorial

Branch `claude/wahala-nine-arenas-city-rumble`, started from `claude/wahala-gritty-gameplay-v1` at `2808eba`.
Founder instruction of 2026-10-23. Decisions N1-N21 (core, integration) and E1-E10 (visuals) are in
`DECISIONS.md`; deployment in `DEPLOYMENT.md`; audio in `AUDIO.md`; verification in `IMPLEMENTATION_STATUS.md`.

Every screenshot referenced here is the real game rendered in Chromium (software WebGL in the build container).
Final integrated frames: `docs/screenshots/nine-arenas/final/`. Work-in-progress frames from each workstream
(captured on their own branches before integration, so some show placeholder surroundings or the old clock) are
in `docs/screenshots/nine-arenas/{arenas,hazards,rumble,tutorial,visual-e}/`.

## 1. The nine standard arenas

All nine are 15 x 11, 4-fold mirror-symmetric (every corner spawn faces the same board), fully connected, with legal
entrances for all three signature vehicles, 2-4 competitors, the whole-arena fixed camera, and the mandatory
endgame floor traps at 0:30 and 0:15. Stage hazards are part of each arena (no menu switch); the menu card lists
them.

| Arena | Light | Layout identity | Stage hazards | Signature track |
| --- | --- | --- | --- | --- |
| Danfo Bus Park | warm late afternoon | classic pillar grid; four crate-free side bays | a Danfo noses into a side bay (row 4 or 6, east or west) and reverses out, 2 s telegraph, lethal on contact, sets off generators; oil stains / broken tarmac | `pixabay_504898` |
| Balogun Market | bright daylight | stall counters join pillars into short aisle walls | goods tumble off the stalls: 2 new crates land (telegraphed, never within 2 tiles of anyone, may hide a pickup); palm-oil spills, sunken drain | `pixabay_573648` |
| Lekki Roadworks | night, floodlights (approved look kept) | classic grid | crane debris on a rival's tile (only if they can step away), 1.6 s telegraph; potholes and hydraulic-fluid slicks | `pixabay_491433` |
| Oshodi Interchange | late morning, traffic haze | two crate-free carriageways (rows 4 and 6) either side of flyover piers | buses and kekes race along a whole carriageway, 2 s telegraph, one at a time | `pixabay_569473` |
| Ajegunle Backstreets | overcast afternoon | compound-wall stubs make alleys | four numbered manhole pairs: step on one, pop out of its partner (only if clear and not burning; 2.5 s cooldown; arriving never sends you back) | `pixabay_588999` |
| Lagos Lagoon Jetty | misty sunrise | mooring bollards break the deck into short runs | wet planks (one-tile slide); lagoon wash floods the north or south edge row: one-tile push inland, generators there become duds (still explode from fire) | `pixabay_406552` |
| Surulere Power Yard | hard, clear midday | classic grid of switchgear cabinets | none; **POWER RULE**: every blast fills its whole row and column to the edge, through pillars and crates; everyone starts with 2 generators (max 4); no range pickups | `pixabay_491432` |
| Yaba After Dark | night, neon and street lights | four small plazas, kiosks split rows 2 and 8 | power surges: one of four marked plate zones sparks 1.8 s, then is lethal for 1.2 s | `pixabay_439622` |
| Third Mainland Checkpoint | sunset / golden hour | pillar-free middle carriageway | wind gusts slide everyone one tile east or west (1.8 s telegraph); a car rushes through the checkpoint lane (2 s telegraph) | `pixabay_540950` |

Fairness rules for every stage hazard (tested in `tests/stage-hazards.test.ts`): lethal events telegraphed at least
1.5 s on the floor and in the HUD, never more than one lethal event at a time, nothing new in the last 5 s or once
Wahala Crush starts closing, Okada absorbs lethal stage hits, identical for humans and bots, seeded and replayable.

Bot batches (medium/hard x4, 20 matches per arena, `scripts/arena-balance.ts`): average match 20-57 s, a winner in
90-100 % of matches, 0-10 % of eliminations by stage hazards (bots read the telegraphs).

## 2. Generators first

- Extra Socket and Petrol Top-Up are 60 of the 97 beneficial pickup weight points (~62 %); Kick, Punch, Carry,
  Remote, Jump and Generator Pass are rarer; crates hide a pickup 45 % of the time (was 40 %). Caps: 6 generators,
  range 8. The HUD shows active / maximum generators and the current reach.
- **Generator Pass** (new pickup): walk over grounded generators (own and rivals') for the rest of the match; never
  through pillars or crates; no fire protection; Boots still kick a generator that can slide; dropped as loot.
  Bots path through generators when they hold it. Mint ring at the holder's feet; HUD chip; tutorial chapter.
- **Power Yard full-line blasts** are an arena config (`generator.blastMode: 'fullLine'`); every other arena keeps
  the range-limited plus (tested).

## 3. City Rumble

One human plus 7, 15, 23 or 31 bots on a 41 x 31 district (three-tile avenues, twelve blocks, a central square).
3:00 match; the city closes ring by ring from 2:00 left; only the 11 x 9 central square is left from 0:30, where the
mandatory trap waves land. Follow camera (never the whole city), minimap, compact roster on phones, full roster on
desktop, spectator camera with survivor cycling, sliced skip to results, placings out of N. Bots reason in a local
window with deterministic work budgets: 32 medium bots cost 0.43 ms per tick on average (3.3 ms p99) in the build
container, with 0 draws and 0 timeouts in the measured batches.

## 4. Visual quality

Pillars about character height (1.4-1.8 m) with per-arena construction, volumetric breakables, 1.5 m perimeter
walls with a low camera-side barrier, dither fade of anything in front of a player or generator, instanced fire
(constant draw calls even for 15-tile Power Yard lines), real 3D debris, scorch and cracks, a 42-degree whole-arena
camera, a broadcast-style match clock. Six new arena surroundings built from code, each with its own lighting.

## 5. How to Play

15 chapters played by the real engine (captions, pause, replay, chapter list, keyboard / gamepad / touch legend),
13 with a safe practice against passive training dummies, including the six-step vehicle attack with the Keke turn.
Isolated from real matches (never writes settings, never produces a result).

## 6. Mobile preview

Published to the `gh-pages` branch on every push; GitHub Pages must be pointed at that branch once by an admin
(see `DEPLOYMENT.md`).

## 7. Screenshots (integrated build)

| What | Files (`docs/screenshots/nine-arenas/final/`) |
| --- | --- |
| All nine arenas, desktop 1280x720 and phone 844x390: countdown, running, blast, north side | `arenas/<arenaId>-<desktop|mobile>-<0-countdown|1-running|2-blast|3-north>.jpg` |
| Power Yard: one blast fills its whole row and column | `features/powerYard-full-line-blast-<desktop|phone>.jpg` |
| Vehicle attack: voucher, entrances, route preview, Keke turn, warning, driving | `features/vehicle-<1..6>-*-<desktop|phone>.jpg` |
| Stage hazards telegraphed and active | `../hazards/` |
| City Rumble (32 competitors): follow camera, minimap, roster, spectating, standings, results | `../rumble/` |
| How to Play demos and practice | `../tutorial/` |
| Obstacles, walls, destruction before/after | `../visual-e/` |

## 8. Verification and limits

See `IMPLEMENTATION_STATUS.md` ("integrated branch") for the exact commands and results: 752 unit tests, the full
Playwright suite on desktop and phone (60 passed, 1 flaky, 0 failed), CI green on GitHub, bot batches per arena
and for City Rumble.

Limits, honestly:
- Nobody has listened to the music or the hazard cues (no audio output in the build container).
- Frame rate on real phones is unmeasured; the scenes are heavier than before (about 450-500 draw calls for the
  new arenas on high quality, ~700 in City Rumble at medium). Use `?fps` on a real device and the `q=low` profile.
- Balance numbers (pickup weights, hazard timing, City Rumble length) come from bot batches, not human playtests.
- Some north-side scenery (skylines, upper floors) sits under the HUD band on desktop; the phone framing shows more.
- Balogun Market's pillar sides render dark under its sun angle.
- The GitHub Pages site needs one admin setting before the URL works.

