# WAHALA! V2 gameplay rules

Rules of the V2 gameplay revolution, by workstream. Decisions and their reasons are in `DECISIONS.md`
section "W - V2 gameplay revolution"; the shared contracts in `V2_CONTRACTS.md`.

## Elimination economy (City Rumble) - workstream C

Applies to the three Rumble rulesets (survival, deathmatch, team; `RUMBLE_ECONOMY` in `sim/config.ts`,
merged by `sim/modes.ts`). Classic is unchanged (crate finds, loot drops, no rewards).

- **Crates open routes, nothing else.** No pickup is hidden in a crate (`pickups.hiddenChance = 0`) and an
  eliminated fighter drops nothing (`drops.maxDeathDrops = 0`).
- **Power comes from eliminations, at once.** In the tick of a credited elimination the living eliminator
  receives the rung's items directly (`rewardGranted` events); nothing lands on the floor, so a camper can
  never steal it. Bots and the human are paid the same way.
- **The ladder** (`config.rewards.ladder`, indexed by `stats.streak` = credited eliminations this life):

  | Elimination | Reward |
  | --- | --- |
  | 1 | Extra Socket, Petrol |
  | 2 | the character's contact tool (Street Baller kick, Lekki Boy punch, Campus Queen disarm), Roller Skates |
  | 3 | Armour, Extra Socket |
  | 4 | Square Blast (3 x 3), Petrol |
  | 5 | Remote Detonator, Vehicle Voucher, Extra Socket |
  | 6 | Okada, Armour, Petrol |
  | 7 | Square Blast (5 x 5), Extra Socket, Roller Skates |
  | 8 | Armour, Vehicle Voucher, Petrol, Extra Socket |
  | 9 | Square Blast (7 x 7), Okada, contact tool |
  | 10+ | rungs 6-9 again, in a cycle |

- **No wasted rung.** An item that would do nothing (capped, already owned, Okada already ridden, a
  different contact tool already equipped) becomes the first useful item of `rewards.fallback`
  (socket, petrol, armour, skates, square, voucher, okada). A Disarm holder's contact reward tops up its
  charges. Carry and curses are never rewards.
- **Caps in Rumble** (only technical limits remain): generator capacity 10, flame reach 10, Armour 3
  plates, Square Blast tier 3 (7 x 7). Speed keeps the standard ceiling (grid step timing).
- **Survival** keeps everything until the end (a top fighter snowballs, a hider stays weak). **Respawn
  modes** reset upgrades on death and the streak restarts, so the ladder is per life.
- **Several eliminations in one tick** pay consecutive rungs in event order.
- HUD: `HudMe.streak` / `HudMe.nextRewards` (`previewRewards`), shown by `ui/ProgressionBadge.tsx`.

## Elimination credit - workstream C

`sim/systems/attribution.ts`, applied once per death in `lethality.ts eliminate()`.

| Cause | Credited to |
| --- | --- |
| Flame of an opponent's generator | that generator's owner |
| Flame of the victim's own (or a teammate's) generator | who set the chain off: the player who kicked / punched its first generator or rammed it with a vehicle (`Generator.touchedBy`), else the owner of the chain's first generator (`BlastEvent.instigatorId`) - if an opponent |
| Vehicle | its owner, if an opponent |
| Spectator throw | nobody, ever |
| Crush, stage hazard, crowd, own blast nobody else touched | the newest opponent who melee'd the victim within `credit.assistWindowTicks` (3 s), else nobody |

- **Same tick, several lethal causes**: the first credited cause in hit order (vehicles, crush, crowd,
  stage, then flames by explosion order) scores; the other credited opponents and the recent melee
  attackers get assists. Draws stay draws.
- **One death, one credit**: a dead player is never hit again, so no reward can be paid twice for a victim.
- **Killer falls in the same tick**: the elimination counts for the scoreboard but no reward is paid and the
  streak does not grow (rewards are for living fighters).
- **Teammates** never score off each other (friendly fire on or off); a teammate's shove is no credit.
- Unrelated accidents (own generator with no shove, traffic, the closing city) are nobody's free kill.

## Square Blast - workstream C

- A default generator keeps the plus. `Player.squareTier` 1 / 2 / 3 adds a 3 x 3 / 5 x 5 / 7 x 7 square
  around the generator's tile (`config.square.radiusByTier`; tier 3 only where the cap allows it: Rumble).
  The blast is the **union** of the plus arms (with the generator's own range, Hot Fuel and Power Yard full
  lines as before) and the square; each tile burns once per generator.
- **Propagation through cover (monotone wave)**: the square spreads out from the generator one tile at a
  time and only ever away from it (each step increases |dx| or |dy|). A tile is reached when one of its one-
  step-closer neighbours (towards the centre along x or along y) passes the wave on. Concrete and the arena
  edge are never entered; a crate is hit (it breaks) but does not pass the wave on; a tile holding another
  generator is hit (that generator chains in the same blast event) but does not pass the wave on.
  - Consequence: a tile is safe from the square only when every outward path to it is blocked - standing
    straight behind a pillar or crate in line with the centre is cover; a diagonal tile next to a pillar is
    usually still reached around it. Damage never goes through concrete.
  - On the classic pillar grid a 3 x 3 at a pillar crossing is just the plus (its diagonals are pillars); in a
    corridor it reaches the four open diagonals; a 5 x 5 flows around the pillars.
- Chains, vehicles (blast exposure counts each tile of the whole chain once), Okada / Armour and
  simultaneous eliminations work exactly as for the plus. Hot Fuel pierces only the plus arms.
- AI: `ai/danger.ts` and `ai/analysis.ts` call the simulation's exported `squareFootprint`, so bots dodge
  square blasts, count the square when valuing a placement, and model rivals' square generators.
- Presentation: an electric blue-white frame marks the footprint from placement (strobing as the fuse runs
  out), the danger lanes cover the exact tiles, the square tiles burn blue-white on the floor and the
  detonation snaps a square ring out to the footprint.
- Square Blast is earned through eliminations only (Classic crate weight 0, see WC8): round-long in survival,
  life-long in respawn modes.

## Protection layers (Okada + Armour) - workstream C

- No layer: one lethal hit eliminates. Each layer absorbs **one separate** lethal hit: Okada first, then
  Armour plates. Okada + 1 plate survives two separate hits and falls to the third.
- **One tick, one layer**: all lethal events of a tick are absorbed by a single layer, and those events
  stay harmless for their grace window, so one explosion frame (even two blasts at once) never takes the
  Okada, a plate and the life as three impacts.
- **Wahala Crush**: a protected player under a landing tile loses one layer and is shoved to the nearest
  free tile (preferring one not burning or about to close). With no free tile left (the final closure) the
  landing kills through every layer.
- Presentation: the Okada's gold bubble, a fainter steel-blue shell plus one plate pip per Armour layer
  beside the name tag, a shard burst and shell flash when a plate breaks; the HUD badge shows the layers.
