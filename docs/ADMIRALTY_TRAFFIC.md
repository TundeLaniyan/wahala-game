# Occasional cars on Admiralty Way: feasibility (assessment only, not implemented)

Question: can Lekki's Admiralty Way (x 20-23, y 9-29, north-south, 4 lanes wide) get occasional cars using the
existing stage-hazard and vehicle systems, without hurting navigation, fairness, performance or readability?

## What exists

- `rumbleLekki` already has two lethal `sweep` hazards, `style: 'traffic'`: the expressway (y 30-34, every 6-9 s)
  and Freedom Way (y 18-20, every 9-13 s). A sweep is a route (tile list), a `stepTicks` speed, a warning of at least
  1.5 s (`config.stage.minLethalWarnTicks`; Lekki asks for 2 s), one lethal event at a time
  (`maxLethalEvents: 1`), none in the last 5 s or once Wahala Crush starts. The vehicle is lethal on its tile and the
  tile it is leaving, and sets off any generator on its path (`stage.ts` `advanceSweep`).
- Render (`StageHazardViews`, `mouthTraffic`): the warning lane burns, a car is drawn on the approach and drives at the
  sim's speed. Today it enters from beyond the board; short approach, 4 tiles.
- Admiralty Way is a shared route: it is the spine between the plaza, Freedom Way and the expressway, and the
  arena info promises that Admiralty Way and Freedom Way "never close at their crossing" (Wahala Crush leaves them open).

## Feasible, with conditions

1. **A new `sweep` entry in `rumbleLekki.ts` is data only.** Routes would be four north-south `line()`s (one per lane) from
   y 9 to y 29. No new sim code. The tile route must be `Tile.Empty` end to end; a crate or Crush block on the lane
   ends the run early (`advanceSweep` already does that), so it degrades safely.
2. **Lethal or not is the real decision.** A lethal car on the main road competes with the two existing lethal waves
   for the single `maxLethalEvents` slot and would roughly double the lethal traffic on the spine players use to
   cross the map. Recommendation: do NOT make it lethal. A non-lethal third kind (a slow "slide" shove like the wash
   `push` hazard, or purely visual cars that never touch a tile) keeps fairness. A lethal version is only acceptable
   if it is rare (about every 20 s), warned 2.5 s or more, and a lane is never closed for more than 4 s.
3. **Telegraph.** The existing lane burn plus the approaching car is enough for a 21-tile run, but 21 tiles at
   `stepTicks` 4 is 1.4 s of travel: players on the road mid-way get 2 s of warning only. `laneIsEscapable` (departure
   hazards, `depart: true`) already refuses to announce a lane someone cannot leave in time: reuse it so a lethal Admiralty
   car never starts on a player who is boxed in by the buildings either side (the road is 4 wide, the
   exits are the junction and the open plaza, so this would often delay it).
4. **Visual only is cheapest and safest.** Ambient cars on Admiralty Way that only drive on the drawn road surface
   and do not exist in the sim cost a few instanced vehicles (the street life and `mouthTraffic` pools). They must be
   pure decoration, never on a tile a fighter can stand on without the tile being lethal: otherwise players see a car
   pass through a fighter with no consequence. Readability rule: they cross only when the lane is empty of fighters, or
   keep to a lane drawn as "closed" by lane paint (the road is a wide interlocking-paving road, so a median or parked
   row is plausible).

## Risks

- Navigation: Admiralty Way is the key north-south route. A lethal wave there raises time-to-cross and rewards
  camping; the map's three connected routes (bible 3.5) assume it is open.
- Performance: negligible for the sim (one more entry in `st.nextAt`); render about +1 vehicle model for the run.
- Readability: more lethal lanes means more simultaneous burning lanes in the follow camera; two crossing waves at the
  Freedom Way junction (y 18-20) is a legibility trap (the junction would be hit from two axes in one second). Keep the
  junction tiles out of the Admiralty route or forbid the two waves within 6 s of each other.
- Balance: any lethal change is a gameplay change and needs a DECISIONS.md entry plus the stage tests
  (`tests/arenas.test.ts`, the rumble stage suites) to include the new route.

## Recommendation

Ship first as non-lethal, decoration-only traffic (or the `push` slide) on Admiralty Way, with a short
telegraph. Consider a lethal version only after playtests, rare, and with the junction excluded.
