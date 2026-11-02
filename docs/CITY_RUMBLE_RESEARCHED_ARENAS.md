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
