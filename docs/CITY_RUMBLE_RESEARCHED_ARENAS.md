# City Rumble: the seven researched arenas (branch `claude/wahala-city-rumble-researched-arenas-v1`)

Continues `claude/wahala-all-arenas-vehicle-generators-v1` (the moving-vehicle generator stays as built). Source of
truth: _WAHALA Canonical Lagos City Rumble Map Build Bible v2_ (30 October 2026, in the repository's research
uploads) and its image manifest (199 entries, `WAHALA_image_manifest.json`). Decisions: `DECISIONS.md` section CR.

## 1. Inventory (R0)

### 1.1 The six approved researched areas (Bible v2, section 1: "Build six new arenas")

| # | Area | Bible section | Districts (bible ids) | Status before this pass |
|---|---|---|---|---|
| 1 | **Oshodi** | 3.2 | O1 Interchange Plaza, O2 Skywalk Quarter, O3 Trading Streets, O4 Expressway Junction, O5 Railway Edge, O6 Cappa Works + Recreation (+ four expansion districts, LA17) | built (63 x 47, `rumbleOshodi`); kept, not downgraded |
| 2 | **Mushin** | 3.1 | M1 Ladipo Machine Quarter, M2 Ojuwoye Trading Grid, M3 Idi-Oro Transit Square, M4 Daleko Grain Quarter, M5 Timber Row, M6 Neighbourhood Courtyards | not built |
| 3 | **Fadeyi** | 3.3 | F1 BRT Centreline, F2 Westbound Shopfronts, F3 Inner Neighbourhood Grid, F4 Onipanu Approach, F5 Recreation + Workshops | not built |
| 4 | **Lagos Island** | 3.4 | L1 Balogun Trading Maze, L2 Idumota Gateway, L3 Broad Street Row, L4 Old Eko Civic Square, L5 Onikan Recreation, L6 Marina Waterfront | only a generic V2 "Lagos Island Markets" mirrored grid (`rumbleLagosIsland`) |
| 5 | **Lekki** (Phase 1 + Ikate) | 3.5 | K1 Expressway Gateway, K2 Admiralty Commerce, K3 Freedom Way Estates, K4 Lagoon-Side Promenade, K5 Ikate Recreation Edge, K6 Coastal Access Roads | only a generic mirrored "Lekki Nightworks" roadworks grid (`rumbleLekkiNight`) |
| 6 | **Ebute-Metta** | 3.6 | E1 Railway Heritage, E2 Working Rail Yard, E3 Station Boulevard, E4 Oyingbo Trade Quarter, E5 Residential Mainland, E6 Oko-Baba Foreshore | not built |

Plus **Ojuelegba** (the completed reference arena, `rumbleOjuelegba`, 45 x 33; retained, only improved where needed).
The Bible's own recommended build order was Oshodi, Lagos Island, Ebute-Metta, Mushin, Lekki, Fadeyi.

Note on wording: the brief calls Oshodi "a completed standard arena at 63 x 47". In the code the 63 x 47 researched
Oshodi is the City Rumble stage `rumbleOshodi`; the standard Classic arena `oshodiInterchange` is a separate 15 x 11
board and is not part of this task.

### 1.2 Final seven-arena mapping

| Final Rumble arena | Id | Researched area | What happens to the old entry |
|---|---|---|---|
| Ojuelegba Underbridge | `rumbleOjuelegba` | Ojuelegba (reference) | kept |
| Oshodi Transport Metropolis | `rumbleOshodi` | Oshodi | kept (63 x 47) |
| Mushin | `rumbleMushin` | Mushin | **new** |
| Fadeyi | `rumbleFadeyi` | Fadeyi | **new** |
| Lagos Island | `rumbleLagosIsland` | Lagos Island | the generic mirrored V2 grid is **replaced in place** (same id: saved settings, music and voice assignments carry over, as Oshodi did in LA1) |
| Lekki | `rumbleLekki` | Lekki | the generic Lekki Nightworks grid (`rumbleLekkiNight`) is **replaced** and re-keyed (its music assignment moves to the new id) |
| Ebute-Metta | `rumbleEbuteMetta` | Ebute-Metta | **new** |

### 1.3 Generic Rumble maps removed

* `cityRumble` - the original generic "City Rumble" district (a mirrored abstract grid, "kept for tests and as the
  classic Rumble board"). Not one of the seven. Removed from the registry, menu, art, audio keys and tests.
* `rumbleApapa` - the generic V2 Apapa Docks (container / warehouse / port grid). Apapa is not one of the six
  approved areas and the brief forbids a generic port map in the rotation. Removed.
* `rumbleLagosIsland` (old generic version) and `rumbleLekkiNight` (old generic version): replaced by the
  researched Lagos Island and Lekki above.

### 1.4 Reference packs: what was actually looked at

The manifest lists 199 images (Oshodi 43, Lagos Island 64, Lekki 28+, Ebute-Metta 20, Mushin 16, Fadeyi 8+, plus
adjacent / excluded areas flagged "NOT Lekki", "NOT Ebute Metta" ...). Entries flagged `manual_download_required`
(no direct URL) cannot be fetched by a script. The direct-URL images of the five new areas were downloaded and
opened (several Wikimedia / news hosts refused automated requests with 403 / 429 and are NOT inspected; the Oshodi
pack was inspected in the Oshodi pass, LA13). Each is recorded below with what the pictures show and how it drives
the build; the boards were composed from these observations, not from landmark names.

What was opened and what it drove (the pictures, not the captions). Images the hosts refused to serve to a script
(Wikimedia / news hosts: 403 / 429) were not inspected; people-and-ceremony photographs were looked at and ignored.

| Area | Pictures opened | What they show (observed) | Where it landed in the build |
|---|---|---|---|
| Mushin | 7 of 16 (parts-market and Red Line / flyover aerials, Idi-Oro food hub, reopened market) | a dense heap-and-umbrella parts market (tyres, rims, exhaust pipes under bright umbrellas and tarpaulins), rust-red and green corrugated rooftops over a flyover and a rail line, the Red Line station with green flat roofs and a red-and-white fascia and a steel footbridge, a green-crate produce hall with painted vegetable murals and a teal floor with yellow lines | parts stalls (rims, tyre stacks, pipes, umbrellas), tyre heaps, corrugated workshops, the food hall with green roof / mural board / produce crates, grain warehouses, timber yards; the Red Line viaduct, green-roofed station and a white-and-red train behind the north edge |
| Fadeyi | 10 of 17 (old footbridge, BRT queue, bank frontage, network map; hospital / ceremony photos ignored) | a concrete footbridge with stairs over a divided highway, blue BRT buses in a lane between concrete medians with yellow Danfos queued beside them and commuters in line, a three-storey white-and-beige former-bank frontage with blue windows beside older plastered blocks, overhead wires | the BRT centreline (blue lanes, shelters on the medians, median barriers, crossing gaps with zebra bars), the bank frontage, Danfo bay, the (fictional, functional) footbridge beyond the east edge, wires and lamps |
| Lagos Island | 24 | the grey Gothic cathedral with clock tower and pinnacles, the whitewashed Freedom Park wall with razor-wire coils, cream colonial bookshop-corner buildings with verandas and hipped roofs, curved-glass and slab office towers, the harbour jetty, the elevated Carter-bridge approach, colourful 3-storey plastered street houses | textile stall maze with umbrellas, plastered shop rows, office towers, the heritage block, the park wall (protected), the civic square with monument and trees, harbour quay with jetty and boats; the cathedral and the elevated bridge approach as backdrop |
| Lekki | 28 | the single white pylon of the Link Bridge with radiating stays over the lagoon, estates among greenery, the canopy walkway, a tilted beach ferris wheel, the arts-and-crafts market (rows of low corrugated sheds with baskets, pots, hats and cloth), a wide coastal highway | lagoon promenade with palms, the Link Bridge pylon and stays on the horizon, compound walls with villas, the arts-market sheds, the sports club, glass blocks, a construction hoarding, the expressway |
| Ebute-Metta | 10 of 20 | the modern station: a sweeping cantilever canopy over a glass-and-steel front and a big paved forecourt; ballasted track; the old NRC terminus with a veranda on white columns and green-teal trim; the weatherboard Jaekel-style house with a hipped grey roof and water tank; the tan red-balustraded Oyingbo market arcade; white-and-green and white-and-red passenger trains | the terminus, heritage house in a garden, the station hall with canopy and platforms, ballast and rails with solid bridge portals, freight wagons, the market arcade, the foreshore timber stacks |

## 2. The arenas (R1)

All seven are non-mirrored, have named districts and a tested district graph, 32 starts, marked supply crates balanced per
half, the mandatory endgame trap waves inside the core, up to two lethal stage events at once and the shared
crush-from-2:00 rules. Hazards use existing styles; every lethal event is telegraphed (>= 2 s; the railcar 3.5 s).

| Arena | Board | Districts (graph) | Landmarks and community features | Hazards (existing styles) | Ambient traffic / transport |
|---|---|---|---|---|---|
| Ojuelegba (reference, unchanged) | 45 x 33 | 5 | flyover piers, Danfo park, shopfront lane, service loop | traffic sweep, Danfo bay departure, goods, drop | deck traffic and approach roads (scenery) |
| Oshodi (kept, not downgraded) | 63 x 47 | 10 | interchange terminals, skywalk, rail edge, Cappa works | traffic wave, bus-bay departures, railcar, drop | bus-choked loops, deck traffic (scenery) |
| Mushin | 53 x 39 | 6: Ladipo, Ojuwoye, Idi-Oro, Daleko, Timber Row, Courtyards | parts stalls and heaps, stall grid, food hall, grain warehouses, timber yards, courtyard houses, Red Line station behind the north edge | four-lane road waves (bus / keke), delivery truck, shopfront goods, merch drops | danfo / bus / truck loops beyond both road mouths; the Red Line deck |
| Fadeyi | 51 x 33 | 5: BRT centreline, shopfronts, neighbourhood, Onipanu approach, recreation | median barriers and BRT shelters, three crossing gaps, bank frontage, walled court, side roads, footbridge | carriageway waves, BRT-lane wave (2.5 s), Danfo bay departure, goods, drop | highway loops beyond both mouths (west / east) and the Onipanu side roads |
| Lagos Island | 55 x 39 | 6: Balogun, Idumota, Broad Street, civic square, Onikan, Marina | textile stall maze, shop rows, office towers, heritage block, park wall, monument, quay sheds; cathedral and bridge approach behind | boulevard and Marina road waves, shopfront goods, drop, harbour wash (non-lethal) | boulevard loops north, Marina road loops, the elevated bridge deck |
| Lekki | 57 x 39 | 6: promenade, Ikate, Admiralty, coastal, estates, gateway | palm promenade, glass blocks, compound walls and villas, arts-market sheds, sports club, hoarding, fuel canopy; the Link Bridge on the lagoon | expressway and Freedom Way waves, construction debris, drop, lagoon wash (non-lethal) | expressway and Freedom Way loops, dispatch bikes |
| Ebute-Metta | 55 x 39 | 6: heritage, station, Oyingbo, residential, rail yard, foreshore | terminus, heritage house, station hall and platforms, rails between solid portals, wagons, signal cabin, market arcade, timber foreshore | road waves, delivery truck, railcar (3.5 s; open walkway beyond both portals), shopfront goods, drop, foreshore wash | road loops, the commuter viaduct behind the terminus |

Character-to-vehicle mapping (verified in code, `tests/rumble-researched.test.ts` launches each character's vehicle on every
board): Street Baller -> Danfo, Lekki Boy -> Yellow cab (`taxi`), Campus Queen -> Keke. Vehicle-generator rules: unchanged from
VG1-VG7 (the vehicle carries a real generator, harmless body, 0.6 s late fuse, owner-safe, hold <= 4 s, one use, clean expiry).

## 3. Screenshot pack (R3)

Committed at `docs/screenshots/city-rumble-researched-arenas/<arenaId>/` (7 folders x 10 frames, 1280x720 desktop, 844x390
x2 phone frames; generated by `scripts/researched-pack.mjs`, software WebGL). Every frame of every arena was opened and
inspected (contact sheets, then the fuse/detonation and re-shot frames individually). Frames: `01-day-whole` (whole board,
day), `02-night-whole`, `03-medium-play` (follow camera, medium, HUD), `04-low-whole` (low quality), `05-phone-play`,
`06-landmark` (identity close-up), `07-vehicle-approach`, `08-vehicle-fuse-warning`, `09-vehicle-detonation`,
`10-phone-vehicle-control` (the contextual B button reads "DANFO" with the Street Baller). Vehicle phase timing on every
arena: approach 111 ticks, fuse 40 ticks (0.67 s), blast 22 ticks; the owner is never hit (tested).

| Arena | What is visible in the frames |
|---|---|
| Ojuelegba (`rumbleOjuelegba`) | flyover with stair access and the bus-stop sign, the Danfo park (yellow rows), shopfront lane (Blessed Hands, God's Time Chemist), tarp awnings and umbrellas, deck traffic and the road to Mushin / Surulere / Yaba on the gantry sign. No night look by design (frame 02 equals 01). |
| Mushin (`rumbleMushin`) | umbrella parts market with tyre/rim heaps, rust-red and green corrugated roofs, the Idi-Oro Fresh Food Hub (green roof, columns, signboard) in the landmark frame, shop rows with fictional parts/electrical fascias (Temi Electricals, Bola Tyre Centre...), tall courtyard houses with roof tanks on the west, the rail viaduct behind the north edge; night shows lit fascias and umbrellas. |
| Fadeyi (`rumbleFadeyi`) | the blue BRT lane with painted "BRT", median barriers and zebra crossings, yellow Danfos and white cars on the highway beyond the west mouth, shopfront row (Amoke Pharmacy, Fadeyi Provisions, Taiwo Printing), the white bank-style frontage with blue windows, the cut walled court, dense grey towers behind. |
| Lagos Island (`rumbleLagosIsland`) | the textile stall maze (umbrellas, cloth bales) west, the civic square with monument, trees and lawn east, the north-south boulevard between them, heritage frontage and office towers on the north edge, the Marina road and quay row on the south edge. |
| Lekki (`rumbleLekki`) | the Ikate Sports & Leisure Club frontage and Ikate arts-and-crafts sheds (landmark frame), the palm promenade and kiosks (coconut water, ice cream), glass blocks, the construction hoarding, Freedom Way and the expressway with Danfos/cabs/bikes beyond the edge, the Link Bridge pylon and stays faintly on the horizon, low lock-up shops on the gateway pavement. |
| Ebute-Metta (`rumbleEbuteMetta`) | the Ebute-Metta Station hall with canopy, platforms and ballasted rails between solid portals (landmark frame), the Junction frontage with trees, Oyingbo trader arcade shops, the heritage house, the commuter viaduct behind the north edge, timber foreshore. |
| Oshodi (`rumbleOshodi`, 63x47, unchanged scale) | the interchange terminal ("INTERCHANGE", bus bays 1-12), rows of yellow buses in the bays, the umbrella market along the west flank, the skywalk/viaduct and rail edge, night look with lit terminal. |

Two defects found by this inspection and fixed before the pack was finalised: (1) in Lekki the voucher vehicle was hidden behind the
two-tile shopfront row on the expressway's south pavement (those became low lock-ups, as the `lockup` family is documented to
keep the lane behind it visible); (2) the Mushin / Lekki / Ebute-Metta landmark frames were too tight to read, now framed wider.

## 4. Performance (R3)

Method: `scripts/arena-perf.mjs` (draw calls and triangles of the whole-board view; software WebGL in this container, so
**frame times are noisy and unusable**: they swing between 2 s and 20 s per frame and are not reported). Draw calls and triangles
are deterministic for a given quality rung. Baseline is the release build (`f072484`, measured with the same script); the new arenas
Mushin, Fadeyi and Ebute-Metta have no baseline because they did not exist. Lagos Island and Lekki replaced the old maps (the
baseline is the old board, not a like-for-like comparison). Ojuelegba is unchanged and reproduces its baseline. The Lekki
numbers were taken before the gateway shops became low lock-ups (a baked-cover swap that does not change the budget class).
Low-quality counts differ slightly between the desktop and phone viewport and between runs because the adaptive/LOD rung
settles at capture; treat them as +/- 30 %.

| Arena | Config | Draw calls (now) | Triangles (now) | Baseline calls / tris (release f072484) |
|---|---|---|---|---|
| Ojuelegba (45x33) | medium desktop 1280x720 | 750 | 2,840,622 | 750 / 2,840,622 |
| Ojuelegba (45x33) | low desktop | 285 | 844,955 | 289 / 845,041 |
| Ojuelegba (45x33) | low phone 844x390 | 469 | 1,399,811 | 469 / 1,399,811 |
| Oshodi (63x47) | medium desktop 1280x720 | 903 | 5,184,769 | 903 / 5,184,769 |
| Oshodi (63x47) | low desktop | 559 | 2,335,309 | 559 / 2,335,309 |
| Oshodi (63x47) | low phone 844x390 | 559 | 2,335,305 | 393 / 1,792,047 |
| Mushin (53x39) | medium desktop 1280x720 | 884 | 2,970,882 | none (new arena) |
| Mushin (53x39) | low desktop | 353 | 880,351 | none (new arena) |
| Mushin (53x39) | low phone 844x390 | 536 | 1,376,351 | none (new arena) |
| Fadeyi (51x33) | medium desktop 1280x720 | 799 | 2,707,437 | none (new arena) |
| Fadeyi (51x33) | low desktop | 498 | 1,180,422 | none (new arena) |
| Fadeyi (51x33) | low phone 844x390 | 510 | 1,226,668 | none (new arena) |
| Lagos Island (55x39) | medium desktop 1280x720 | 881 | 2,932,832 | 704 / 2,441,313 (old map, 41x31) |
| Lagos Island (55x39) | low desktop | 553 | 1,403,781 | 405 / 1,216,478 (old map, 41x31) |
| Lagos Island (55x39) | low phone 844x390 | 557 | 1,414,502 | 240 / 673,586 (old map, 41x31) |
| Lekki (57x39) | medium desktop 1280x720 | 857 | 2,662,316 | 401 / 1,585,684 (old `rumbleLekkiNight`: replaced map) |
| Lekki (57x39) | low desktop | 534 | 1,251,654 | 397 / 1,231,809 (old `rumbleLekkiNight`: replaced map) |
| Lekki (57x39) | low phone 844x390 | 368 | 708,396 | 225 / 689,247 (old `rumbleLekkiNight`: replaced map) |
| Ebute-Metta (55x39) | medium desktop 1280x720 | 869 | 2,944,711 | none (new arena) |
| Ebute-Metta (55x39) | low desktop | 515 | 1,417,297 | none (new arena) |
| Ebute-Metta (55x39) | low phone 844x390 | 554 | 1,434,397 | none (new arena) |

| Arena | Tick cost, 8 fighters (ms) | Ambient vehicles very low / low / medium / high | Ambient people very low / low / medium / high | Gameplay vehicles |
|---|---|---|---|---|
| Ojuelegba | 0.032 | 2 / 4 / 10 / 18 | 8 / 14 / 31 / 31 | 0 idle, 1 per used voucher (1 per fighter at most) |
| Oshodi | 0.0335 | 2 / 10 / 64 / 64 | 8 / 20 / 47 / 47 | 0 idle, 1 per used voucher (1 per fighter at most) |
| Mushin | 0.0212 | 2 / 3 / 10 / 12 | 8 / 14 / 27 / 27 | 0 idle, 1 per used voucher (1 per fighter at most) |
| Fadeyi | 0.0173 | 2 / 4 / 10 / 18 | 8 / 14 / 22 / 22 | 0 idle, 1 per used voucher (1 per fighter at most) |
| Lagos Island | 0.0264 | 2 / 4 / 10 / 18 | 8 / 14 / 20 / 20 | 0 idle, 1 per used voucher (1 per fighter at most) |
| Lekki | 0.0265 | 2 / 4 / 10 / 18 | 8 / 14 / 17 / 17 | 0 idle, 1 per used voucher (1 per fighter at most) |
| Ebute-Metta | 0.0189 | 2 / 3 / 10 / 14 | 8 / 14 / 19 / 19 | 0 idle, 1 per used voucher (1 per fighter at most) |

Simulation tick cost is far below the 16.7 ms frame budget everywhere. Two clean runs after the work finished (8 fighters,
2400 ticks, idle intents): 0.015-0.033 ms per tick across the seven arenas (Ojuelegba 0.025-0.032, Oshodi 0.024-0.034, Mushin
0.018-0.021, Fadeyi 0.015-0.017, Lagos Island 0.022-0.026, Lekki 0.023-0.027, Ebute-Metta 0.016-0.019). Release baseline,
same method and machine: Ojuelegba 0.020, Oshodi 0.023, old generic City Rumble 0.013, old Apapa 0.015, old Lagos Island 0.011, old
Lekki Night 0.018. The new boards are larger (53-57 x 33-39 against 41 x 31), so a rise of the same order is expected; the
repeat runs vary by about 40 % on this shared machine.


## 5. Validation (final code state `f4507e1`; later commits are docs only)

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `eslint .` | pass |
| Prettier | every file this branch added or changed is formatted except 7 that were already non-conformant on the base branch (`public/audio/music/manifest.json`, `scripts/mobile-shots.mjs`, `scripts/rumble-economy.ts`, `scripts/simulate.ts`, `tests/economy-ai.test.ts`, `tests/spectators.test.ts`, `tests/ui/progressionBadge.test.ts`); 57 files repo-wide are non-conformant, all pre-existing, none touched by formatting here |
| `npm run build` | pass |
| Full Vitest (`vitest run`) | 121 files, 1933 passed, 7 skipped (the 7 are the per-arena "4-fold mirror symmetric" cases in `tests/rumble-stages.test.ts`, which the suite skips for every non-mirrored Rumble arena; all seven are non-mirrored by design), 0 failed |
| Rumble arena suites | `tests/rumble-researched.test.ts` 64, `tests/rumble-stages.test.ts` 108 (+7 skipped), `tests/arenas.test.ts` (all pass) |
| Vehicle-generator suite | `tests/vehicle-generator.test.ts` 63 passed on all seven Rumble arenas (route, carry, trigger, owner safety, fuse, cleanup, determinism, character-to-vehicle) |
| Full Playwright, desktop + phone, `--retries=0`, 2 workers, software WebGL | 262 tests: **189 passed, 0 failed, 0 flaky, 73 skipped** (desktop 86 passed / 45 skipped, phone 103 passed / 28 skipped). Every skip is an in-source project guard (`test.skip(isMobile ...)`, "phone only", "one viewport is enough", "desktop project only", touch / keyboard / gamepad variants); there is no `fixme` and no unconditional skip. Wall time 1.4 h. |

How the browser run got here (nothing hidden): a first full run found one failure of mine, the five-arena night-look sweep in
`e2e/researched-arenas.spec.ts`, which I had given a private 10-minute timeout and which exceeded it under load (each arena
alone passes in about a minute). The fix is at the cause: that spec is now one test per community with the default timeout, no
override. That first run was then voided because I stopped its preview server myself while tidying a port (every later test failed in
1-2 s with no connection), so a second complete run was made from scratch on the fixed code. The result above is that
second run; it is the only browser run counted. A first Vitest pass had two failures (the 32-bot Survival test now
reaches the shortened 75-second clock with two survivors on one seed, and the arena spawn-gap floor for Fadeyi: 3 at 32
fighters, decision CR6); both tests were corrected deliberately, not loosened silently, and the final Vitest run is clean.

Merge check (not merged): the release branch `claude/wahala-stitch-uiux-v1` is one commit ahead of this branch's base (the diagonal-corner
movement commit, MV3). A trial merge in a throwaway worktree has exactly one textual conflict, `docs/DECISIONS.md` (both sides
append a section; resolved by keeping both), and after that `tsc` and the three input suites (172 tests) pass on the merged tree.

## 6. Remaining visual issues and honest limits

- Software WebGL only: frame times are unusable here and nothing was measured on a real phone or GPU; draw calls and triangles are exact, frame rate is not.
- Ojuelegba has no night look (by design; its night/day frames are identical).
- The Lekki Link Bridge is faint in the whole-board frame (it is far, on the horizon); the pylon and stays are readable in the landmark-area frames only as a silhouette.
- Voucher vehicles are not x-rayed through tall baked cover. Lekki's one real case (two-tile shopfronts on the expressway) was fixed with low lock-ups; other arenas showed the vehicle in every frame, but a vehicle on the lane directly behind a tall frontage can still be partly covered from the camera.
- Menu preview cards for the five new / replaced arenas are crops of the whole-board day frames, not countdown frames.
- Very Low quality was not captured in the pack (medium, low and phone-low are); it only removes ambient traffic and crowd detail.
- Fadeyi is the compact board (51 x 33): the spawn spread floor is 12 / 7 / 3 at 8 / 16 / 32 fighters, an accepted, documented exception (CR6).
- Lekki performance rows were measured just before the gateway shops became low lock-ups.
- No founder-assigned music, voice or ambience was added; Apapa's old Rumble track is unassigned and Lekki Night's track is re-keyed to Lekki (CR8).

## 7. What changed (files)

97 added (70 of them pack frames) / 58 modified / 23 deleted files against the vehicle-generator branch: `src/sim/arenas/` (painter, community assembler, five
arena modules, registry; deleted `cityRumble.ts`, `rumbleApapa.ts`, `rumbleLekkiNight.ts`), `src/render/arenas/` (community kit,
families, floor, env, looks, set kit, five art modules, `newArenas.ts`, `obstacleStyles.ts`), `src/render/env`, `src/ui/menu`
(arena info, mode screen), audio manifests, 8 menu previews, tests (new `tests/rumble-researched.test.ts`,
`e2e/researched-arenas.spec.ts`; ~40 existing suites re-pointed at the seven-arena set), scripts (`researched-pack.mjs`,
`arena-perf.mjs`, `board-ascii.ts`), and `docs/screenshots/city-rumble-researched-arenas/` (70 frames).
