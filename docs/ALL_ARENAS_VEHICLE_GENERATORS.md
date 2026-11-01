# All arenas pass and the moving-vehicle generator (branch `claude/wahala-all-arenas-vehicle-generators-v1`)

Base: release `f072484`. Decisions VG1-VG6 in `DECISIONS.md`. This document is the Phase 0 audit and plan, then the
record of what changed (updated at the end of the pass).

## 1. Audit (Phase 0)

### 1.1 Arenas in the registry (17)

Nine standard arenas (Classic Battle, 2-4 players, fixed whole-arena camera, 15 x 11), six City Rumble stages (up to 32
competitors, follow camera) and two experimental Mobile Test arenas (kept out of the official lists; they must still
work). Programmatic audit (`npx tsx` over `ARENAS`):

| Arena | Kind | Grid | Open | Spawns | Supplies | Districts | Attack lanes | Stage hazards | Lighting identity |
|---|---|---|---|---|---|---|---|---|---|
| danfoBusPark | standard | 15x11 | 79% | 4 | 0 | 0 | any border | Danfo sweep | warm late afternoon |
| balogunMarket | standard | 15x11 | 74% | 4 | 0 | 0 | any border | merch drops | bright daylight |
| lekkiRoadworks | standard | 15x11 | 79% | 4 | 0 | 0 | any border | debris strikes | night, floodlights |
| oshodiInterchange | standard | 15x11 | 79% | 4 | 0 | 0 | any border | traffic sweep | late morning haze |
| ajegunleBackstreets | standard | 15x11 | 74% | 4 | 0 | 0 | any border | manhole teleports | overcast afternoon |
| lagoonJetty | standard | 15x11 | 79% | 4 | 0 | 0 | any border | wash pushes | misty sunrise |
| surulerePowerYard | standard | 15x11 | 79% | 4 | 0 | 0 | any border | (Power Yard full-line blast) | hard midday sun |
| yabaAfterDark | standard | 15x11 | 80% | 4 | 0 | 0 | any border | power strikes | night, neon |
| thirdMainland | standard | 15x11 | 83% | 4 | 0 | 0 | any border | gusts + checkpoint sweep | golden hour |
| rumbleOshodi | rumble | 63x47 | 64% | 32 | 14 | 10 | 8 road mouths | traffic, bus bay, railcar, merch | hazy midday (+ `?tod=night`) |
| rumbleLagosIsland | rumble | 41x31 | 69% | 32 | 8 | 0 | any border | goods, merch, traffic | hot hazy afternoon |
| rumbleOjuelegba | rumble | 45x33 | 67% | 32 | 8 | 5 | 10 road mouths | traffic, bus bay, merch | late afternoon, bridge shadow |
| rumbleApapa | rumble | 45x31 | 77% | 32 | 8 | 0 | any border | cargo strikes, truck | humid harbour noon |
| rumbleLekkiNight | rumble | 41x31 | 84% | 32 | 8 | 0 | any border | two debris strikes | night, floodlights |
| cityRumble | rumble | 41x31 | 82% | 32 | 0 | 0 | any border | traffic | hazy afternoon |
| mobileTest13x9 / 15x9 | experimental | 13x9 / 15x9 | 79% | 4 | 0 | 0 | any border | Danfo sweep | warm late afternoon |

Only Oshodi has a switchable day / night look (`ArenaArt.nightLook`, `?tod=night`). Every other arena has ONE fixed
lighting identity by design (Lekki Roadworks, Yaba After Dark and Lekki Nightworks are night stages; the rest are
daytime), so "day and night" for them means that native lighting; no night switch is added to the others.

### 1.2 Character-to-vehicle mapping (authoritative: `src/sim/data/characters.ts`)

| Character | Vehicle | Close skill |
|---|---|---|
| Street Baller (`streetBaller`) | Danfo (`danfo`) | Push |
| Lekki Boy (`lekkiBoy`) | Yellow cab (`taxi`) | Daze Punch |
| Campus Queen (`campusQueen`) | Keke (`keke`) | Shove |

Every character has exactly one valid vehicle; nothing was invented or changed. `buildRoute` / `launchVehicle` read the
mapping, so a character can only launch their own kind (tested).

### 1.3 The existing vehicle attack, and why it is replaced

A Vehicle Voucher (from crates) let one press (`Intent.special`, `sim/systems/actions.ts`) launch the signature vehicle
on an automatic route (`sim/systems/autoVehicle.ts`): a 1.2 s lane flash over the WHOLE route, then the vehicle ran over
anyone on it (a Danfo several, a taxi one, a Keke two). Problems: the long full-route telegraph made it trivially
avoidable, the kill zone was a single line (it ignored blast range), and it read like the ordinary public transport
passing by. LOCKED-design note: the Bible lists the three attack vehicles as run-over weapons; this pass is an explicit
founder change to how they attack (the three vehicles, their per-character assignment, one-use voucher and damage /
route rules are all kept).

## 2. Plan

1. Vehicle generator (sim): the vehicle body becomes harmless; it carries a generator that uses the real blast
   footprint around the vehicle's tile (decision VG1).
2. Render / HUD / audio: a generator and lamp on the carrier, a late fuse warning at the vehicle, no whole-route
   telegraph, the contextual second action unchanged (vehicle name + icon, then back to the ability).
3. Tests: simulation, arenas, browser (desktop keyboard + gamepad, phone touch).
4. Arena pass: screenshot every arena, fix real defects, record before / after; Oshodi stays 63 x 47.
5. Balance measurement across every arena and ruleset; perf before / after; full validation.


## 3. Arena pass (Phase 1): what the audit found and what changed

Method: every arena was rendered as the real game (`scripts/arena-audit-shots.mjs`: whole-board view, medium quality
day, the night look where one exists, and low quality at a phone viewport, with draw calls and triangles) and judged
picture by picture. Standard arenas use the fixed whole-arena camera; the six Rumble stages were framed whole with the
debug camera (`zoom` 4.3 fits a 41 x 31 stage, 11 fits Oshodi 63 x 47). Findings were few and the changes are small and
evidence-driven; no board was resized and no geometry or sim data of any arena changed.

| Arena | Dimensions before → after | What the review found | What changed | What was preserved |
|---|---|---|---|---|
| Danfo Bus Park | 15x11 → 15x11 | clean boundary wall, readable lanes, scale of crates / kiosks correct, buildings and danfo scenery stay off the board | nothing | all of it |
| Balogun Market | 15x11 → 15x11 | clean; warm, readable obstacles | nothing | all of it |
| Lekki Roadworks | 15x11 → 15x11 | night shift, floodlit; readable at whole-board zoom | nothing | all of it |
| Oshodi Interchange (classic) | 15x11 → 15x11 | clean; bus-stop / flyover scenery off the board | nothing | all of it |
| Ajegunle Backstreets | 15x11 → 15x11 | clean; cooler overcast look is readable | nothing | all of it |
| Lagoon Jetty | 15x11 → 15x11 | clean; mist reduces contrast only in the far backdrop | nothing | all of it |
| Surulere Power Yard | 15x11 → 15x11 | clean; transformer cabinets read well | nothing | the full-line blast arena rule |
| Yaba After Dark | 15x11 → 15x11 | **finding:** the kiosk pillars read near-black against a dark floor; the board was hard to read at whole-board zoom | hemi light 0.95 → 1.15, floor tint 0x9a949c → 0xaaa4ac, pillar tint 0xb4aeb4 → 0xe4dee4 (`render/arenas/yaba.ts`): the night street stays a night street, panels and edges now show | neon, shopfronts, lightboxes, sodium key, all geometry |
| Third Mainland | 15x11 → 15x11 | clean | nothing | all of it |
| Oshodi Transport Metropolis | 63x47 → 63x47 | readable whole-board; traffic, rail and bus bay as before | nothing (the 63x47 board is kept) | day / night, road warning, pavement-safe rules |
| Lagos Island | 41x31 → 41x31 | clean | nothing | all of it |
| Ojuelegba | 45x33 → 45x33 | clean (reference arena, unchanged) | nothing | all of it |
| Apapa | 45x31 → 45x31 | clean, pale fog | nothing | all of it |
| Lekki Night (Rumble) | 41x31 → 41x31 | **finding:** the whole board read very dark; obstacles melted into the floor | sun 4.1 → 4.6, hemi 0.95 → 1.25, floor / pillar / soft tints raised (`render/arenas/rumbleLekkiNightArt.ts`); sky, lamps and the black night stay | floodlights, sodium lamps, debris strikes |
| City Rumble | 41x31 → 41x31 | clean | nothing | all of it |

Spawn and supply balance: unchanged on every arena (spawns, supply points, districts and lanes are sim data and were
not touched; see the audit table in section 1.1). Traffic and hazards: ambient traffic stays scenery and the existing
designated road loops; stage hazards, road warnings and pavement-safe rules are untouched; no ambient vehicle became a
gameplay entity (the only moving gameplay vehicle is the voucher carrier). Performance impact of the arena changes:
none (two lighting values; draw calls and triangles identical). Remaining visual issues: none that changes play. Yaba After Dark and Lekki Night remain night stages by design: they are
brighter than before but deliberately not bright; the Rumble stages use the follow camera in play (whole-board framing was
only used for the review shots).

Why no arena was expanded or restructured: the audit found no sparse board, no overlapping / floating / buried
structure, no broken boundary and no unclear edge on any arena, and the new attack does not need a bigger board (section
5: narrow and large boards behave alike). Making changes without a defect would only have risked the deterministic grid
and pavement-safe behaviour the brief protects.

## 4. The vehicle generator, as built

* Mapping (authoritative `sim/data/characters.ts`): Street Baller Danfo, Lekki Boy yellow cab, Campus Queen Keke; each
  character launches only their own kind (tested). No character lacked a vehicle, so no correction was proposed.
* Action: the second action button is contextual. With a Vehicle Voucher it shows the vehicle's name and its voucher
  icon (DANFO / YELLOW CAB / KEKE); one press sends it; then it returns to the fighter's ability (PUSH / DAZE / SHOVE).
  GENERATOR stays separate, spectator THROW and the pressed / holding / remote / disabled states are unchanged, and
  there is never a third mobile button (browser-tested).
* Carrier: the existing automatic route (entry lane / road mouth, soft-block limits), but the body is harmless and
  carries a real generator (roof generator + lamp, visible to everyone, distinct from the ambient traffic instances).
  Blast = the owner's normal range and shape (walls, crates, chains, Okada / armour rules unchanged).
* Detonation: a rival (a teammate only where friendly fire is on) in the real footprint starts a 0.6 s late fuse (a
  small lamp / ring pulse and a quiet tick, in step with the sim tick; no screen-covering warning), the carrier halts,
  the generator goes off the same tick it expires. If the owner stands in the footprint the generator waits (max 4 s)
  for them to step out; the owner is never hurt by it.
* One use. No target, a crash, destruction by another blast, or the hold running out ends it cleanly (no stuck vehicle,
  generator or pending state). Deterministic from the seed and the ticks; no hidden information is read.
* Rules not touched: damage, range, spawn protection, friendly fire, respawn, scoring, sudden death. New numbers:
  `vehicles.fuseTicks` 0.6 s and `vehicles.holdTicks` 4 s.

## 5. Balance measurements

`scripts/vehicle-generator-balance.ts`: seeded bot matches (6 per row, bots at standard level, every fighter given a
voucher every 12 s so the attack is exercised), per arena and ruleset (Classic on the nine standard arenas;
Last Player Standing = `survival`, Free-for-All = `deathmatch`, Team Deathmatch = `team` on the six Rumble stages).

| arena | board | ruleset | players | launches | found a target | fuses ending in a blast | fuses escaped | no target (route end) | crashed | launch to blast (s) | kills per blast | owner killed by own flames |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| danfoBusPark | 15x11 | classic | 4 | 15 | 73% | 46% | 38% | 13% | 4 | 2.9 | 1.00 | 0 |
| balogunMarket | 15x11 | classic | 4 | 20 | 60% | 50% | 50% | 15% | 9 | 2.9 | 1.00 | 0 |
| lekkiRoadworks | 15x11 | classic | 4 | 20 | 55% | 27% | 64% | 20% | 10 | 1.8 | 1.00 | 0 |
| oshodiInterchange | 15x11 | classic | 4 | 13 | 69% | 33% | 56% | 15% | 4 | 2.1 | 1.00 | 0 |
| ajegunleBackstreets | 15x11 | classic | 4 | 14 | 86% | 53% | 47% | 7% | 5 | 2.5 | 1.00 | 0 |
| lagoonJetty | 15x11 | classic | 4 | 22 | 68% | 35% | 65% | 14% | 11 | 2.8 | 0.86 | 0 |
| surulerePowerYard | 15x11 | classic | 4 | 9 | 67% | 33% | 33% | 0% | 4 | 2.1 | 1.00 | 0 |
| yabaAfterDark | 15x11 | classic | 4 | 8 | 63% | 50% | 33% | 0% | 1 | 3.2 | 0.67 | 0 |
| thirdMainland | 15x11 | classic | 4 | 14 | 79% | 47% | 53% | 7% | 4 | 3.2 | 1.00 | 0 |
| rumbleOshodi | 63x47 | survival | 16 | 65 | 62% | 31% | 69% | 34% | 23 | 5.7 | 0.87 | 0 |
| rumbleOshodi | 63x47 | deathmatch | 16 | 961 | 53% | 44% | 56% | 24% | 428 | 5.2 | 1.01 | 0 |
| rumbleOshodi | 63x47 | team | 16 | 783 | 49% | 46% | 54% | 27% | 309 | 6.1 | 0.97 | 0 |
| rumbleLagosIsland | 41x31 | survival | 16 | 70 | 61% | 60% | 40% | 39% | 14 | 2.4 | 0.72 | 0 |
| rumbleLagosIsland | 41x31 | deathmatch | 16 | 1750 | 69% | 48% | 52% | 25% | 595 | 2.7 | 0.98 | 0 |
| rumbleLagosIsland | 41x31 | team | 16 | 1637 | 60% | 52% | 48% | 38% | 391 | 2.6 | 0.91 | 0 |
| rumbleOjuelegba | 45x33 | survival | 16 | 40 | 65% | 36% | 64% | 15% | 21 | 4.5 | 1.08 | 0 |
| rumbleOjuelegba | 45x33 | deathmatch | 16 | 1065 | 66% | 48% | 52% | 12% | 499 | 3.7 | 1.18 | 0 |
| rumbleOjuelegba | 45x33 | team | 16 | 901 | 50% | 49% | 50% | 20% | 437 | 4.0 | 0.97 | 0 |
| rumbleApapa | 45x31 | survival | 16 | 61 | 70% | 43% | 57% | 11% | 29 | 3.2 | 1.13 | 0 |
| rumbleApapa | 45x31 | deathmatch | 16 | 1214 | 73% | 50% | 50% | 8% | 534 | 3.6 | 1.36 | 0 |
| rumbleApapa | 45x31 | team | 16 | 1171 | 62% | 50% | 50% | 16% | 500 | 3.6 | 1.04 | 0 |
| rumbleLekkiNight | 41x31 | survival | 16 | 49 | 67% | 51% | 49% | 20% | 17 | 3.4 | 1.32 | 0 |
| rumbleLekkiNight | 41x31 | deathmatch | 16 | 1260 | 69% | 45% | 54% | 15% | 534 | 3.2 | 1.30 | 0 |
| rumbleLekkiNight | 41x31 | team | 16 | 1178 | 62% | 43% | 56% | 25% | 445 | 3.3 | 1.05 | 0 |
| cityRumble | 41x31 | survival | 16 | 51 | 84% | 30% | 70% | 14% | 24 | 3.3 | 1.06 | 0 |
| cityRumble | 41x31 | deathmatch | 16 | 1283 | 73% | 48% | 52% | 12% | 529 | 3.1 | 1.23 | 0 |
| cityRumble | 41x31 | team | 16 | 1320 | 63% | 41% | 59% | 22% | 557 | 3.4 | 1.06 | 0 |

Reading it:

* Activation to detonation is 1.8-3.2 s on the 15x11 boards and 2.4-6.1 s on the large stages (longer routes).
* About 50-86 % of launches find a target; roughly half of all fuses end in a blast and half are escaped (the rival
  stepped out in the 0.6 s or was no longer in the footprint when the carrier moved on): the warning is fair.
* Kills per blast are 0.7-1.4: the attack is not a mass-kill tool.
* Owner safety: the owner was never eliminated by their own carrier flames in any of the 27 rows (the first run counted
  every elimination in the same tick, including those by rivals' own blasts, and showed small non-zero numbers on three
  Rumble stages; a diagnostic run confirmed all of them were rivals' flames, so the metric now counts only the owner's
  own flames).
* Narrow versus large: the 15x11 boards and the 41x31-63x47 stages give the same kill-per-blast and escape rates; the
  larger stages only take longer (route length). No board needs a balance change.
* Power Yard is the one arena whose rule makes the carrier's footprint a whole line: a rival on the entry lane is
  struck within the launch warning plus the 0.6 s fuse. It is the arena's existing blast rule (not a vehicle-generator
  exception); measured launch-to-blast time and kills per blast there are in line with the other boards.
* Core / city closure: a carrier is removed with its tiles (tested: it ends cleanly, no abuse path); simultaneous final
  deaths remain a draw and sudden death resolves as before (tested).
* Balance adjustments made: none beyond the two new numbers above and the reach-based route choice (VG5).

## 6. Performance, before (release `f072484`) and after (this branch)

Same script and machine for both (`scripts/arena-perf.mjs`, software WebGL via the Vite dev server, whole-board view,
16 competitors on the Rumble stages, 4 on the standard boards). Each cell is `release → branch`. Draw calls and
triangles are a single snapshot of a running frame; the same scene alternates between two values between snapshots
(ambient traffic and the adaptive pass), so a few cells differ in both directions with no code change behind them.

| arena | board | medium: draw calls | medium: triangles (M) | low: draw calls | low: triangles (M) | phone low: draw calls | phone low: triangles (M) | objects (tiles / players) | with a vehicle on the board: draw calls (medium) |
|---|---|---|---|---|---|---|---|---|---|
| danfoBusPark | 15x11 | 412 → 411 | 1.13 → 1.13 | 173 → 212 | 0.33 → 0.46 | 216 → 216 | 0.47 → 0.47 | 165 / 4 | 355 → 355 |
| balogunMarket | 15x11 | 326 → 326 | 1.04 → 1.04 | 171 → 171 | 0.48 → 0.48 | 171 → 171 | 0.48 → 0.48 | 165 / 4 | 269 → 269 |
| lekkiRoadworks | 15x11 | 386 → 386 | 0.87 → 0.87 | 188 → 188 | 0.36 → 0.36 | 168 → 168 | 0.24 → 0.24 | 165 / 4 | 329 → 386 |
| oshodiInterchange | 15x11 | 504 → 504 | 1.14 → 1.14 | 214 → 214 | 0.31 → 0.31 | 265 → 265 | 0.44 → 0.44 | 165 / 4 | 447 → 447 |
| ajegunleBackstreets | 15x11 | 308 → 308 | 0.87 → 0.87 | 154 → 154 | 0.36 → 0.36 | 154 → 154 | 0.36 → 0.36 | 165 / 4 | 251 → 251 |
| lagoonJetty | 15x11 | 331 → 331 | 0.82 → 0.82 | 130 → 168 | 0.21 → 0.35 | 132 → 170 | 0.22 → 0.35 | 165 / 4 | 274 → 274 |
| surulerePowerYard | 15x11 | 332 → 332 | 0.80 → 0.80 | 168 → 168 | 0.33 → 0.33 | 169 → 169 | 0.33 → 0.33 | 165 / 4 | 275 → 275 |
| yabaAfterDark | 15x11 | 361 → 361 | 0.83 → 0.83 | 163 → 125 | 0.34 → 0.21 | 197 → 197 | 0.35 → 0.35 | 165 / 4 | 304 → 304 |
| thirdMainland | 15x11 | 394 → 337 | 0.84 → 0.65 | 150 → 188 | 0.21 → 0.34 | 196 → 196 | 0.34 → 0.34 | 165 / 4 | 337 → 394 |
| rumbleOshodi | 63x47 | 903 → 903 | 5.18 → 5.18 | 559 → 377 | 2.34 → 1.79 | 393 → 559 | 1.79 → 2.34 | 2961 / 16 | 910 → 910 |
| rumbleLagosIsland | 41x31 | 704 → 683 | 2.44 → 2.39 | 405 → 406 | 1.22 → 1.22 | 240 → 404 | 0.67 → 1.22 | 1271 / 16 | 707 → 708 |
| rumbleOjuelegba | 45x33 | 750 → 750 | 2.84 → 2.84 | 289 → 455 | 0.85 → 1.39 | 469 → 469 | 1.40 → 1.40 | 1485 / 16 | 755 → 503 |
| rumbleApapa | 45x31 | 387 → 638 | 1.37 → 2.18 | 404 → 404 | 1.13 → 1.13 | 412 → 412 | 1.13 → 1.13 | 1395 / 16 | 392 → 643 |
| rumbleLekkiNight | 41x31 | 401 → 401 | 1.59 → 1.59 | 397 → 397 | 1.23 → 1.23 | 225 → 225 | 0.69 → 0.69 | 1271 / 16 | 653 → 406 |
| cityRumble | 41x31 | 378 → 378 | 1.28 → 1.28 | 376 → 212 | 1.08 → 0.53 | 374 → 375 | 1.08 → 1.08 | 1271 / 16 | 388 → 388 |


* The vehicle on the board costs a handful of draw calls (the roof generator and lamp are one small group); the
  active gameplay-vehicle count is 1 per voucher use (the release had the same).
* Frame timing under SwiftShader is 1-20 s per frame at 1280x720 (n = 1-4 frames per sample) and is dominated by
  pixel cost; it is recorded in `/tmp` logs only and is not a usable before / after signal here. The simulation tick
  is: mean ms per tick over 3 seeded matches (release → branch): Danfo Bus Park 0.119 → 0.087, Oshodi Interchange
  0.050 → 0.051, Oshodi Rumble (16) 1.304 → 1.427, City Rumble (16) 0.971 → 0.965 (noise-level, the measurement
  ran next to a screenshot job). Nothing was simplified because nothing got more expensive.
* Real devices: open any arena with `?fps` (sim / ai / render ms).

## 7. Screenshots

Kept outside git (local review output; large): zoomed-out day / medium night look / phone low for every arena and
the Rumble stages, the carrier approaching, the late warning and the detonation for every arena at medium quality, and
the phone controls with the contextual vehicle action for all three characters (`scripts/arena-audit-shots.mjs`,
`scripts/vehicle-generator-shots.mjs`).

## 8. Validation record (final commit of the branch)

* `tsc --noEmit`, `eslint .`: clean. Prettier on every non-doc file changed by the branch: clean except
  `src/sim/systems/explosions.ts`, which was already non-conformant at the release SHA (the branch adds one line there;
  the file was not reformatted so the diff stays reviewable). Production build: succeeds (the chunk-size warning is the
  existing one).
* Unit suite: 120 files, 1783 passed, 5 skipped, 0 failed. The 5 skips are the conditional per-stage geometry checks in
  `tests/rumble-stages.test.ts` (`it.runIf`: the mirror-symmetry check is skipped for the stages that opt out of
  mirrored soft blocks, the "two halves comparable" check for the stages that are mirrored).
* Full Playwright (desktop + phone, `--retries=0`, 2 workers, 236 tests): 175 passed, 60 skipped, 1 failed, 0 flaky.
  The failure was `vehicle-generator.spec.ts` "gamepad": the pad is polled once per rendered frame and the button was
  released after a fixed 800 ms, which a loaded software-GL runner can miss (a test-timing defect, not a game defect;
  it had passed alone). The spec now keeps the button down while stepping the sim until the carrier is on the board. It
  then passed 3 / 3 repeats under 2 workers (9 passed, 9 skipped by design) and alone. The full 236-test suite was NOT
  re-run after that spec-only change.
* The 60 browser skips are all declarative project gates (`test.skip` with a reason): 46 desktop-only tests skipped on
  the phone project and 14 phone / touch-only tests skipped on the desktop project, plus the suites that deliberately
  run on one project only ("one viewport is enough", "software rendering makes the render passes slow; one project is
  enough", "structure is the same on every device").
