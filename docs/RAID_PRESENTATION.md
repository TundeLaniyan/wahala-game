# Raid presentation

Branch of `claude/wahala-campaign-online-v1`, worker `raid-render`. How a classic raid (docs/CAMPAIGN_EXPANSION_PLAN.md, section 1) is **seen and steered**: the three arena looks, the world markers for cargo / belts / shipments / doors / the exit, the damage and projectile feedback, and the mobile cross control. Presentation and input only: every picture is read from `raidView(state)`, `Player.vitals` (through the sim's `enemyHealthView`) and `SimEvent`s; nothing here decides a rule. Contracts: `src/sim/raid/types.ts`, `src/sim/campaign/types.ts`. Decisions: `DECISIONS.md` RR1-RR10. Camera: the fixed whole-arena `arena` camera (raids never follow or zoom). HUD rule: no text over the board; words go to the rail (`app/raidNotices.ts`).

## What is drawn per mechanic

| Mechanic (source) | Drawn as | File |
| --- | --- | --- |
| Marked cargo (`cargo[]`, `marked`) | Dispatch-yellow crate with a black target cross and a "DD" stencil, a gold pulsing ring on the floor; punches (scale) on `cargoHit` | `RaidViews.ts`, `raidTextures.ts` |
| Cargo damage (`hp`, `maxHp`, `state`) | Crack decal over the crate: none intact, hairline above half, broken at half or less (a `damaged` state is never drawn clean); barrels get the same on the drum | `raidStyle.ts` `crackLevel` |
| Plain crates / barrels | Weathered board crate; red drum with a yellow-black hazard band | same |
| `cargoDestroyed` | The piece vanishes; debris (crate or concrete), dust, and a gold sparkle if it was marked | `RaidViews.handleEvents` |
| Conveyor (`conveyors[]`, `stepTicks`) | Dark rubber belt with steel rails and amber chevrons pointing the way it moves; the texture scrolls one tile per `stepTicks`, locked to `tick + alpha` (stops with the pause) | `RaidViews.updateBelts` |
| Shipment (`shipments[]`, `warnTicks`) | Blue-grey crate on a pallet gliding between tiles; while `warnTicks > 0` its next two tiles are hatched red (and it shudders). Sim `warnings` of kind `shipment` / `wave` are hatched too (wave = blue); `projectile` warnings are left to the projectile preview. A tile is never drawn twice | `RaidViews.updateShipments/Warnings` |
| Doors (`doors[]`) | Steel frame + roller shutter + crossed chain + gold padlock while `locked`; amber frame for a main door, **teal** for an optional-room door; a frame outline on the floor. Opening (state flip or `raidDoorOpened`): shutter rolls up in 0.7 s, chain falls, padlock fades, frame turns green / light teal. A door already open when first seen has no animation. The shutter spans the wall it sits in (read from the tiles) | `RaidViews.updateDoors`, `doorSpansZ` |
| Extraction (`extraction.open`, `raidExtractionOpened`) | Hidden until the exit opens; then a green pad, rising chevrons and a beam grow in over 0.6 s and pulse; a green shockwave and sparkle on the event | `RaidViews.updateExtraction` |
| Wave (`raidWaveStarted`) | Nothing in the world; a rail notice "WAVE 2 OF 3" / "FINAL WAVE 3 OF 3". Door, room, exit and marked-cargo notices too | `app/raidNotices.ts` |
| Enemy health | Thin pips above the head (one per segment, colour by remaining fraction). Shown by the sim's `enemyHealthView(...).showBar` (targeted, hurt in the last 3 s, or near), never for a boss or lieutenant (their bar is the rail's), never for the dead; one instanced, camera-facing draw | `DamageViews.ts`, `damageModel.ts` |
| `campaignHit` | See the table below | `DamageViews.handleEvents` |
| Dazed | The stars halo and Dazed pose already in `PlayerViews` (from `dazedUntil`); this layer adds a yellow flash | `PlayerViews.ts` |
| `campaignDefeated` | Comic-star poof, dust, a white flash and ring; the player's defeat also jolts the camera | `DamageViews.ts` |
| Projectiles (`projectileLaunched` / `projectileHit`) | Launch cue (flash + ring at the thrower, the object held overhead, the Throw clip, a ring-dot path preview for `warnTicks`), then bottle / brick / stone / tool low-poly objects spinning along the path at `stepTicks` per tile with a shadow, then the landing | `ProjectileViews.ts` |

### Hit results (what the player sees, and why)

| `campaignHit.result` | Cue |
| --- | --- |
| `damaged` / `defeated` | Red flash on the player (cream on an enemy), ring, 0.2 s flinch along the hit direction, small camera shake only when the player is hit |
| `dazed` | Yellow flash and a small flinch (plus the stars) |
| `blockedArmour` / `blockedOkada` | **White-blue** spark, blue ring, cold sparkles; no flinch, no shake (the shield took it) |
| `invulnerable` | Nothing (the recovery flicker is the cue) |

| `projectileHit.result` | Landing |
| --- | --- |
| `wall` | Shatter: glass sparkle (bottle) or stone debris, a puff |
| `blocked` / `blockedArmour` / `blockedOkada` | Cold white-blue spark |
| `damaged` / `dazed` / `defeated` | Impact flash and dust at the point (the victim's own flash is `campaignHit`'s) |
| `expired` | Thud ring and dust (a miss) |

Reduced motion: the flinch is off, camera shake goes through `fx.shake` whose mode is off for `prefers-reduced-motion` and on touch by default.

### Colour legend

| Colour | Means |
| --- | --- |
| Yellow crate, gold ring | The objective: destroy it |
| Red hatch on the floor | A shipment (or a thrown object's last tiles) will pass here |
| Blue hatch | A wave arrives here |
| Amber door frame, padlock | Locked main door |
| Teal door frame | Optional side-room door (locked: teal, open: light teal) |
| Green door frame / green pad and beam | Open / the way out |
| Amber chevrons on the belt | Direction of travel |
| Red-hot cue ring on a throw | A strong projectile (slow, a whole segment) |
| White-blue spark | A shield absorbed it |

## The cross control (movement only)

On a touch device in a raid the left control is four arrow buttons instead of the floating stick; **the two action buttons on the right are unchanged** (A generator, B context; the cross is not a third action button).

- Model `input/dpad.ts` `CrossPad`: one finger per arrow; the newest held arrow wins; a finger sliding onto another arrow switches to it; lifting hands back to the arrow still held. Output: one of up / down / left / right or none, never two, never a diagonal (tested with a random-gesture property test).
- Layout `crossLayout`: up above, left and right side by side, down below (the control is two buttons wide so it fits the 36 vh movement strip of a landscape phone). Arrows are at least 56 px (58 px on 640x360, 64 px on 844x390), safe areas respected; on roomy screens 56 to 84 px so the board's near corner stays free. `actionColumn` mirrors the CSS of `.actions` so tests prove no overlap with A / B; a camera test proves no tile of a 13 x 9 or 15 x 11 board sits under the cross on 640x360, 740x360, 844x390, 932x430 and 1280x720, and portrait is checked against the bottom row. 568x320 (strip 115 px) gets 56 px arrows and so reaches about 9 px past the strip.
- Input: `InputManager.setCardinalOnly(on)`. Every device sends one cardinal direction; the move gate runs without `legal` or assist (no corner-turn buffer, no corner route, no sidestep or bend, no settle); the touch wish is ignored; the gamepad stick snaps to four cardinals and a thumb resting on a diagonal gives nothing (`snapStick(..., strict)`); keyboard (arrows / WASD) sends the newest key only. A press is one tile; a hold repeats at the step cadence through the existing gate. Normal modes are unchanged.
- UI `ui/DpadControl.tsx` (`data-testid` `cross-control`, `cross-up|down|left|right`), shown by `TouchControls` when `input.isCardinalOnly`.

### Wiring the integrator must add

1. **Input mode** (where a match starts, e.g. `MatchController` start / `session.ts` after `loadGame`): `input.setCardinalOnly(inputModeFor(state).cardinalOnly);` (`import { inputModeFor } from '../input'`). Call it for every match start so a normal match after a raid resets it. `TouchControls` reads `input.isCardinalOnly` to show the cross.
2. **Rail notices** (`MatchController`'s event-to-toast switch): `const n = raidNotice(e); if (n) return n;` (`import { raidNotice } from './raidNotices'`; a `Toast` also takes `ttlMs`). If raid-sim's `raidWaveStarted.index` counts from 1, set `RAID_WAVE_INDEX_BASE = 1`.
3. Nothing in `GameRenderer` is left to wire: it builds `RaidViews` when `settings.game === 'raid'` or `state.raid` exists, and `DamageViews` + `ProjectileViews` for any match with campaign vitals or a mission. `RaidViews` reads `sim.raidView` once raid-sim exports it (looked up at run time).

## Arena art

One generic raid look, three variants, registered by arena id in `render/arenas/newArenas.ts` (`raidArt.ts` `RAID_VARIANT_BY_ARENA`; any sim arena of kind `raid` not listed gets the warehouse). Everything is drawn around and over the small fixed board and reads the board size, off the board, tall things north, the camera side below a metre; fictional signage only.

| Variant | Arena ids | Look |
| --- | --- | --- |
| Warehouse interior | `warehouseDispatchDepot`, `standbyPlant` | Cold tube light and dust; steel racking three to four tiers high behind and beside the board; four roller doors half open on a glare of yard light with "BAY n" boards and a "DISPATCH DEPOT" sign; strip lights; a forklift, wrapped pallets, containers; yellow floor lines |
| Rail / goods yard | `railYardGoods`, `junctionToolShed` | Low orange sun through yard smoke; two tracks with a rusted boxcar, a flat wagon with a container, a semaphore signal, a floodlight tower, sheet fence; sacks under tarpaulins, drums, timber; sleepers, buffer stops, a points lever on the camera side |
| Under-bridge storeroom | `partsStoreroom`, `recordsVault` | Dim shade under a flyover deck with fat piers; padlocked lock-up stores (SPARES, TYRES, RECORDS, PARTS); a house storeroom with a barred window; a transformer pole and sagging wires; bare bulbs on cables; tyre stacks and sacks |

Floors (the board itself) are painted per variant (power-floated concrete with bays and hazard corners; cinder with a loading apron and weeds; cracked damp concrete with swept dust). Day and night parity is not provided. Art review: `?raidart=warehouse|yard|storeroom` puts a look on the Oshodi Interchange standard board (review flag only), `scripts/raid-shots.mjs <prefix> <variant> <desktop|phone>`.

## Performance

No new `QualityProfile` field (decision RR10): the raid layer is a handful of instanced draws.

- `RaidViews` for a crowded fixture (24 pieces of cargo incl. 3 marked and cracked ones, a belt, a shipment with its telegraph, two locked doors, the open exit): **28 draw calls, about 1.0k triangles**, `update` 0.6 ms in software headless; 80 pieces of cargo cost the same few calls (tested: under 40 drawables). Door parts (about 7 meshes each) are the bulk; there are 2 to 6 doors.
- `DamageViews`: 1 instanced draw (at most 12 enemies x 8 pips). `ProjectileViews`: one overlay draw plus about 3 small meshes per object in flight (at most a few at a time).
- Arena sets are baked to a few merged meshes like every other set: the warehouse on desktop Medium software GL measured 248 draw calls and 623k triangles for the whole frame (4 bots, `?raidart=warehouse`).

## Tests and screenshots

`tests/render/raid-views.test.ts` (pure looks, the views against hand-made `RaidView` / events), `tests/input-raid-cross.test.ts` (cross, cardinal-only, gamepad snap, layout), `tests/app/raidNotices.test.ts`, `e2e/raid-render.spec.ts` (runs only when `warehouseDispatchDepot` is in the build; otherwise skipped with the reason; screenshots to `docs/screenshots/raid-render/`). Art-review pictures of the three looks on a standard board are in `docs/screenshots/raid-render/` (`look-*.jpg`).

## Still missing

- No real raid has been seen with the world markers: raid-sim's arenas and `raidView` were not in this base, so the markers are tested on fixtures only; the e2e spec needs raid-sim's start entry (`startRaid` in the spec tries `campaign().startRaid` then the briefing path).
- If raid-sim keeps crates as `Tile.Soft`, the tile pillar is drawn by `ArenaView` as well as the cargo crate; keep cargo out of `state.tiles` or hide the soft block under it.
- Procedural props only (no glTF): racking, forklift, wagons, doors are boxes and cylinders; the cargo crates are generic boxes (no model from `tools/assets/`).
- Door shutter orientation is a heuristic from the neighbouring tiles; belts and shipments assume the belt tiles are open floor.
- Thrown-object shapes are tiny low-poly; at phone size the path preview dots are the main read.
- No sound was added (the contracts' silent audio placeholders stay; synthesised cues for cargo hits, doors and the exit are future work).
- Day / night variants, a portrait raid layout (the game shows the rotate card in portrait) and the 568x320 cross strip (9 px over) are not done.
