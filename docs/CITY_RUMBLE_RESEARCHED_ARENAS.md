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
