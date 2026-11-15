# WAHALA! Campaign Gameplay Bible

**Status: proposed long-term gameplay design for the BREAK THE RING campaign (created 2026-11-15).** Story canon is
`docs/STORY_BIBLE.md`; core rules canon is `docs/GAME_DESIGN_BIBLE.md` (it wins on any conflict); tuning decisions are
logged in `docs/DECISIONS.md`.

Every section separates three states:

| Label | Meaning |
| --- | --- |
| **CURRENT** | Implemented and shipped (or shipped behind the stated scope). |
| **PILOT** | Implemented, isolated to one place, measured; not campaign-wide. |
| **PROPOSED** | Design only. Needs founder gameplay approval before it is built or rolled out. |

---

## 1. Generator-first fighting

### 1.1 Principles (founder requirement, LOCKED)

- **Generators are the primary weapon.** Melee supports generator tactics: interruption, knockback, slowdown,
  positioning and limited damage.
- **Enemies are challenging but realistically punishable**: their attacks commit them (wind-up, attack, recovery) and
  they cannot dodge generators they could not plausibly know about.
- **Traps are achieved through skill**: concealment, baiting a commitment, cornering, slowing.
- Heavies and bosses should strongly reward generator tactics; major infrastructure objectives require generator-based
  destruction.
- **No arbitrary immunity** and no enemy left stuck at one health without a coherent, explained rule.
- **Distinct balance per mode**: Classic Blast, City Rumble and campaign missions keep separate tuning (they already do:
  `RUMBLE_ECONOMY`, `CAMPAIGN_CONFIG`, per-arena `ArenaDef.config`, campaign levels).

### 1.2 CURRENT campaign combat

- Field-section enemies are punch/throw enemies with hit points by kind (`src/sim/data/enemies.ts`): agbero 1, guard 2,
  thrower 2, heavy 3, lieutenant 8, boss 14. A punch currently can finish them.
- Enemy wind-up and recovery exist (decision EF2); the enemy planner sees every generator (EF1, measured in
  `docs/ENEMY_COMBAT_FAIRNESS.md`).
- Mission generator loadout: base capacity 2 (cap 3), base range 2 (cap 5), radial blasts; temporary pickups as in
  section 2.4. Three-second fuse.
- The Oshodi combat pilot (`docs/OSHODI_COMBAT_PILOT.md`, decision CP1) adjusts Oshodi field mission 1 only.

### 1.3 PILOT: Tactical Trap (actual parameters, Training Academy only)

Source of truth: `docs/TACTICAL_TRAP_PILOT.md`, decisions TT1–TT10, `TACTICAL_TRAP_PILOT` in `src/sim/config.ts`. On only
in the Academy "Generator Tactics" lessons (`trap-agbero`, `trap-thrower`, `trap-hidden`); absent from every campaign
mission, Classic, Rumble, raids and online (tested).

| Parameter | Actual value |
| --- | --- |
| Generator fuse | 3 s (unchanged) |
| Perception | grid line of sight (two Bresenham traces, ends excluded); blocked by any non-floor tile or another living body; a body on the generator's tile hides it |
| Vision / reaction / memory / hearing (tiles, ticks, ticks, tiles) | agbero 6/30/150/4; guard 7/26/150/5; thrower 8/26/150/5; heavy 6/36/150/4; lieutenant 9/16/240/7; boss 10/10/240/8 |
| Memory hold | a ticking generator with ≤ 120 ticks of fuse left is remembered until it blows; a moved unseen generator is forgotten |
| Hearing | CAUTION 36 ticks + one investigating step along the dominant axis; never reveals the tile |
| Enemy recovery | 48 ticks (agbero, guard, thrower, heavy); lieutenant 30; boss 24 |
| Enemy cooldowns | agbero 180, guard 156, thrower 210, heavy 228 ticks (each > wind-up + recovery + 36) |
| Human punch slow | 1st hit 25 % for 90 ticks; 2nd inside it 40 % (cap); 3rd nothing; chain ≤ 150 ticks; then 120 ticks resistance |
| Punch damage | floors an enemy at 1 segment (lieutenant/boss: half health); only a blast or trap finishes |
| Measured result | scripted trap: 0/48 hits (EF1 baseline and perfect knowledge) vs 18/48 (cover) and 48/48 (cover + two punches) |

**Not campaign-wide.** Do not apply these numbers to missions without founder gameplay approval.

### 1.4 PROPOSED campaign-wide combat parameters (for a later approved rollout)

| Parameter | Proposal | Reason |
| --- | --- | --- |
| Perception model | adopt the pilot's sight/memory/hearing model for all field enemies | removes omniscient evasion (EF1) |
| Punch damage floor | adopt for agbero/guard/thrower/heavy: melee cannot finish; blast/trap finishes | makes generators the finisher; coherent rule replaces "stuck on one health" |
| Lieutenant / boss | punches take them to half health at most; generator hits do segment damage; phase changes on generator hits | strongly rewards traps on big targets |
| Slow | 25 % / 40 % cap as piloted; resistance window as piloted | already measured, no stun-lock |
| Enemy recovery | 0.6–0.8 s by kind as piloted | readable punish window |
| Fuse | keep 3 s; revisit only with measurements | founder instruction |
| Rollout order | Oshodi field missions first, measure (trap rate, clear time, deaths), then district by district | reversible |

Rollout requires: a config layer per mission (like `pilotConfigLayer`), measurement with `scripts/lib/trapDrill.ts`, and a
DECISIONS entry. Classic and City Rumble never receive campaign combat rules.

### 1.5 Infrastructure objectives (PROPOSED direction; CURRENT objectives listed)

CURRENT objective kinds: `dispatchRelays` (Oshodi), `supplyRoutes` (Mushin), `junctionAccess` (Fadeyi), `dispatchWindows`
(Ebute Metta), `evidenceRun` (Lagos Island), `contingencyGrid` (Lekki). PROPOSED: every "break the Ring's equipment"
objective (relays, toll boxes, switches, control points) is destroyed **only by blasts**; melee can only interrupt the
crews who repair or defend them.

---

## 2. Campaign progression: Generator Parts

### 2.1 One resource (PROPOSED design; Oshodi slice CURRENT, see 2.6)

**Generator Parts** is the only campaign resource. No crafting, loot boxes, timers, purchases or second currency.

### 2.2 Acquisition

| Source | Parts | Status |
| --- | --- | --- |
| First clear of a mission (any win = 1 star) | 3 | CURRENT for the three Oshodi missions |
| Improving best stars to 2 | +1 (once) | CURRENT for Oshodi |
| Improving best stars to 3 | +1 (once) | CURRENT for Oshodi |
| Hidden optional rooms | 1–2 each, once | PROPOSED |
| Selected optional challenges | 1–2 each, once | PROPOSED |

Parts are **derived from best stars**, not counted per clear: replaying a cleared mission at the same or fewer stars
pays nothing, and improving stars pays exactly the difference. Maximum per mission: 5.

### 2.3 Spending

| Upgrade | Effect | Cap | Status |
| --- | --- | --- | --- |
| Generator capacity | +1 generator at once, and the seat's own capacity cap rises by the same amount so the Extra Socket pickup still adds one | slice: +1 (1 level) · proposed campaign cap: +2 | CURRENT (Oshodi slice) |
| Blast range | +1 range | slice: +1 (1 level) · proposed campaign cap: +2 | CURRENT (Oshodi slice) |

Costs and earning rate (slice):

| | Value |
| --- | --- |
| Oshodi Parts available | 9 (all three at 1 star) to 15 (all at 3 stars) |
| Capacity level 1 | 6 Parts |
| Range level 1 | 6 Parts |
| Both | 12 Parts = an average of 2 stars over the three Oshodi missions |

Reasoning: finishing Oshodi at all buys one upgrade; buying both needs better play (stars), which is the intended pull to
replay. PROPOSED level-2 costs (campaign-wide, not implemented): 14 Parts each; with 18 missions × 5 = 90 Parts plus
optional rooms, both level-2 upgrades are reachable around district 4 at average play. Refunds/respec: PROPOSED free
respec (Parts are never lost), not implemented.

### 2.4 Temporary pickups stay temporary (CURRENT)

Petrol (+1 range), Diesel (long range), Extra Socket (+1 capacity), Remote Detonator and the other pickups remain
**mission-only bonuses**: they are reset on death (`respawn.resetOnDeath`) and at the end of a mission. Permanent upgrades
raise the seat's *base*, which pickups build on; an upgrade is never dropped as loot and never lost on death.

### 2.5 Mode isolation (LOCKED)

Permanent campaign upgrades never reach City Rumble, Classic standalone matches, raids (slice), the Training Academy,
multiplayer or any future online mode. Enforced in the sim (`createGame` ignores a seat bonus outside mission matches) and
in the app (only the campaign controller passes one, only for eligible districts).

### 2.6 What the Oshodi slice implements (CURRENT)

See `docs/DECISIONS.md` PR1–PR8: Parts derived from the save's best stars for `oshodi.approach`, `oshodi.railEdge` and
`oshodi.boss`; upgrade levels stored in the campaign save (optional field, no version bump, repaired and clamped on
load); capacity and range +1 each; applied to the human seat in Oshodi field and boss missions only; the result screen
shows Parts earned. Other districts earn and use nothing yet.

---

## 3. Character special abilities

Two-button control philosophy (LOCKED): A = generator (hold: remote), B = one context special. No third button.

| Fighter | CURRENT | PROPOSED | Not now |
| --- | --- | --- | --- |
| Street Baller | Punch/kick contact; Long Leg opening kick | Present the regular B melee as a "Street Kick" (presentation only); later **Football Volley**: a short-range daze shot (2–3 tiles, daze only, no damage, long cooldown) | No unrestricted damage projectile |
| Campus Queen | Shove / positional control | A tactical **counter** special: a timed parry that plants an attacker for a generator | — |
| Lekki Boy | Daze / control | A **disruption** special: briefly blinds enemy perception (they lose memory of generators in a small radius) | — |

No new specials are implemented in this milestone.

---

## 4. Enemy families

A few reusable AI behaviour families, many visually distinct characters. Families map to the existing `EnemyKind`s.

| Family | Kind(s) | Appearance (fictional) | Combat role | Generator awareness (proposed, pilot model) | Counters |
| --- | --- | --- | --- | --- | --- |
| Agberos / street enforcers | `agbero`, `guard` | Touts and wardens in invented faction colours, caps, whistles | Rush and punch; guards swing bottles | Short vision, slow reaction; easily hidden from | Bait the swing, lay in the recovery |
| Bottle / object throwers | `thrower` | Hawker-style crews with crates of bottles/bricks | Keep range; ground warning before each throw | Long vision, normal reaction | Break line of sight, corner in dead ends |
| Market attackers | `guard`, `thrower` (Mushin skin) | Runners and stall muscle | Restock objectives, swarm aisles | As agbero/thrower | Chain blasts along aisles |
| Heavy enforcers | `heavy` | Big, slow, blocks narrow streets | Body-block lanes; brick throws | Short vision, slowest reaction | Lure into a lane, two generators either side |
| Ring patrol units (fictional traffic/control) | `guard` + vehicle hazards | Invented uniforms, no real agency colours or insignia | Patrol routes, call convoys | Normal | Disable their relays first |
| Lieutenants | `lieutenant` | Named crew captains | Long fight, mixed attacks | Wide vision, fast reaction, longer memory | Slow + trap, use cover |
| District bosses | `boss` | The six existing bosses | Phased fight around the district objective | Best perception, but still no omniscience | Objective-driven traps; generator finishes |

---

## 5. Campaign rewards

Every mission victory provides (PROPOSED as a standard; Oshodi slice CURRENT):

1. **A clear result**: mission complete, stars, time.
2. **Progression or an unlock**: Parts (Oshodi now), next mission, titles/costumes (CURRENT titles and costumes).
3. **A narrative consequence**: one line on what the Ring lost (Oshodi result now shows it; other districts PROPOSED).

Visible world changes after district victories (PROPOSED): consequence flags (`oshodi.dispatchBroken` etc., CURRENT in
the save) drive presentation-only changes on the campaign map and in the district's arena dressing (e.g. Oshodi's impound
gate shown open). No rule or balance changes from world state.

---

## 6. Implementation status summary

| Item | Status |
| --- | --- |
| Tactical Trap pilot (Academy) | PILOT, shipped |
| Campaign-wide perception/punch-floor rollout | PROPOSED, needs approval |
| Generator Parts + capacity/range upgrades, Oshodi | CURRENT (slice) |
| Parts for other districts, rooms, challenges, level-2 upgrades | PROPOSED |
| Football Volley, counter, disruption specials | PROPOSED |
| Visible world-state changes | PROPOSED (map/arena dressing) |
| Missions 19–21 | PLANNED (`docs/STORY_BIBLE.md` 5.2) |
