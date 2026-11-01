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
