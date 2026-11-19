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
- **CURRENT since 2026-11-18 (founder direction, decisions SA3-SA12):** the campaign tactics layer below (1.6) replaces
  the two bullets above for every campaign field and boss mission; the Oshodi combat pilot is archived.

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

### 1.4 PROPOSED campaign-wide combat parameters (for a later approved rollout) - SUPERSEDED by 1.6 (CURRENT)

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

**CURRENT since 2026-11-18 for the six boss missions (decisions BX1-BX8, `docs/CAMPAIGN_SECTOR_AI.md` "Part 3. Bosses"):**
every boss objective node is broken only by blasts, each broken phase exposes the boss, and three blast hits defeat him;
melee only interrupts his restore. Field missions are unchanged.

### 1.6 CURRENT: the campaign tactics layer (decisions SA3-SA12, `docs/CAMPAIGN_SECTOR_AI.md`)

Approved by the founder on 2026-11-18 and built campaign-wide (field and boss missions only; never Classic, City Rumble,
raids, the Academy or online). It differs from the 1.4 proposal where noted.

**CURRENT since the reliability pass (decisions RC1-RC8, `docs/CAMPAIGN_COMBAT_RELIABILITY.md`):** ordinary enemies are slower than the
player on every level (12 ticks a tile on Normal against the player's 10; 9 % slower even on Hard), a calm patrol walks slower still,
every ordinary roamer walks a readable route, and a chase breaks off (walking gap, maximum chase 7 / 10 / 15 s) and returns to its
route. Brawlers stay planted longer after a swing (about a second on Normal). The numbers in the table below that these change
(step time, recovery, patrol pause, notice range) are listed in that document; the hidden-generator, fuse and generator-first
rules are unchanged.

| Parameter | CURRENT value |
| --- | --- |
| Perception | the pilot's sight / memory / hearing for every enemy, plus a calm view cone and trap sense; hearing yields a coarse direction band only; an unseen generator is absent from the enemy's plan; boss-mission bots perceive too |
| Punch | stagger, 1-tile knockback, ONE 25 % slow (no stacking, then resisted); ordinary enemies CAN be punched out, slowly (per-target lockout) - unlike 1.4 |
| Blast | one blast defeats any ordinary enemy; ARMOURED kinds (heavy, lieutenant, boss) stop at a punch floor and lose 3 to a blast: only a blast finishes them |
| Enemy commitment | wind-up about 1.0 / 0.8 / 0.63 s (Easy / Normal / Hard), recovery 0.8 / 0.7 / 0.6 s, cooldowns with a response window, group wind-up limits |
| Behaviour | one territorial state machine (patrol, watch, investigate, alert, pursue, return) with variant personalities |
| Fuse | 3 s (unchanged) |

---

## 2. Campaign progression: Generator Parts

### 2.1 One resource (CURRENT campaign-wide, see 2.6 and 2.7)

**Generator Parts** is the only campaign resource. No crafting, loot boxes, timers, purchases or second currency.

### 2.2 Acquisition

| Source | Parts | Status |
| --- | --- | --- |
| First clear of a mission (any win = 1 star) | 3 | CURRENT for all 18 missions (PR9; new content missions included automatically) |
| Improving best stars to 2 | +1 (once) | CURRENT for all missions |
| Improving best stars to 3 | +1 (once) | CURRENT for all missions |
| Hidden optional rooms | 1–2 each, once | PROPOSED (PR15: raid side rooms already pay their own bonus) |
| Three-star door raid | 1 once | PROPOSED (PR15: it already earns the field mission's third star) |
| Selected optional challenges | 1–2 each, once | PROPOSED |

Parts are **derived from best stars**, not counted per clear: replaying a cleared mission at the same or fewer stars
pays nothing, and improving stars pays exactly the difference. Maximum per mission: 5.

### 2.3 Spending

| Upgrade | Effect | Cap | Status |
| --- | --- | --- | --- |
| Generator capacity | +1 generator at once per level, and the seat's own capacity cap rises by the same amount so the Extra Socket pickup still adds one | +2 (2 levels: 6, then 14 Parts) | CURRENT (PR10) |
| Blast range | +1 range per level (radius cap unchanged) | +2 (2 levels: 6, then 14 Parts) | CURRENT (PR10) |

Costs and earning rate (slice):

| | Value |
| --- | --- |
| Oshodi Parts available | 9 (all three at 1 star) to 15 (all at 3 stars) |
| Capacity level 1 | 6 Parts |
| Range level 1 | 6 Parts |
| Both | 12 Parts = an average of 2 stars over the three Oshodi missions |

Reasoning: finishing Oshodi at all buys one upgrade; buying both needs better play (stars), which is the intended pull to
replay. Level-2 costs (CURRENT since PR10, was PROPOSED): 14 Parts each; with 18 missions × 5 = 90 Parts, both level-2
upgrades are reachable around district 4 at average play (arithmetic below). Refunds/respec: CURRENT free respec
(PR12, "Refund all (free)" on the Workshop; Parts are never lost).

Campaign-wide arithmetic (CURRENT, PR10). Everything costs 6 + 6 + 14 + 14 = 40 Parts.

| Play | Parts per district | After district 1 | 2 | 3 | 4 | 5 | 6 | Everything (40) bought |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| One star everywhere | 9 | 9 | 18 | 27 | 36 | 45 | 54 | during district 5 |
| Two stars (average) | 12 | 12 | 24 | 36 | 48 | 60 | 72 | district 4, first mission (36 + 4) |
| Three stars everywhere | 15 | 15 | 30 | 45 | 60 | 75 | 90 | during district 3 |

The Parts above 40 are deliberate headroom for the Ojuelegba finale missions and any approved bonus sources.

### 2.4 Temporary pickups stay temporary (CURRENT)

Petrol (+1 range), Diesel (long range), Extra Socket (+1 capacity), Remote Detonator and the other pickups remain
**mission-only bonuses**: they are reset on death (`respawn.resetOnDeath`) and at the end of a mission. Permanent upgrades
raise the seat's *base*, which pickups build on; an upgrade is never dropped as loot and never lost on death.

### 2.5 Mode isolation (LOCKED)

Permanent campaign upgrades never reach City Rumble, Classic standalone matches, raids (door and standalone, PR11), the
Training Academy, multiplayer or any future online mode. Enforced in the sim (`createGame` ignores a seat bonus outside
mission matches) and in the app (only the campaign controller passes one, only to its field and boss mission builders).

### 2.6 What the Oshodi slice implements (CURRENT)

See `docs/DECISIONS.md` PR1–PR8: Parts derived from the save's best stars for `oshodi.approach`, `oshodi.railEdge` and
`oshodi.boss`; upgrade levels stored in the campaign save (optional field, no version bump, repaired and clamped on
load); capacity and range +1 each; applied to the human seat in Oshodi field and boss missions only; the result screen
shows Parts earned. Other districts earn and use nothing yet. (Superseded by 2.7.)

### 2.7 Campaign-wide rollout (CURRENT)

See `docs/DECISIONS.md` PR9–PR15: every section mission of every district earns Parts by best stars (the standalone
Ebute Metta raid too); capacity and range have two levels each (6 and 14 Parts, +2 at most); the bonus applies to the
human seat in every district's field and boss missions, never in raids; free refund; no save-version change (repair
refunds the highest level first). Hidden rooms, door raids and optional challenges stay PROPOSED (PR15).

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

Every mission victory provides (CURRENT for all 18 missions, PR14):

1. **A clear result**: mission complete, stars, time.
2. **Progression or an unlock**: Parts (CURRENT for every mission), next mission ("Up next" line, CURRENT), titles/costumes
   (CURRENT titles and costumes).
3. **A narrative consequence**: one line on what the Ring lost (CURRENT on every section and boss result; the 16 lines
   outside the two Oshodi field missions are content written for this milestone).

Visible world changes after district victories: the campaign map shows each district's liberation state (sections
reclaimed n/3 or FREED, and the list of what the Ring lost there) and the existing consequence line, all derived from the
save (CURRENT, PR14). Changes to the district's arena dressing (e.g. Oshodi's impound gate shown open) stay PROPOSED. No
rule or balance changes from world state.

"What the Ring lost" lines (`SectionMissionDef.ringWeakened`, shown on the result and in the map's district card). Short,
physical, about what the Ring loses and what reopens for ordinary people; consistent with `docs/STORY_BIBLE.md` section 6
(existing consequences) and fictional only. Lines marked NEW were written for this milestone and need the same founder
and native-speaker review as other new copy.

| Mission | Name | Line | Status |
| --- | --- | --- | --- |
| `oshodi.approach` | Terminal Approach | The depot’s dispatch cargo is broken: the convoys lose their schedule. | EXISTING (PR8) |
| `oshodi.railEdge` | Rail Edge | The trailer crews lose the rail-edge lane: the controller has nowhere left to hide. | EXISTING (PR8) |
| `oshodi.boss` | Oga Sunmola | The relay masts are jammed and the dispatch radio goes quiet: buses leave on honest timetables. | NEW (written for this milestone, PR14) |
| `mushin.approach` | Spare-Parts Row | The storeroom shelves are emptied back onto the row: the Ring’s rental stock has a hole in it. | NEW (written for this milestone, PR14) |
| `mushin.market` | Aisle Sweep | The runners lose the north aisles: the broker has no one left to restock her stacks. | NEW (written for this milestone, PR14) |
| `mushin.boss` | Madam Ronke | The hoarded stacks are blasted open: mechanics take the parts the Ring was renting back. | NEW (written for this milestone, PR14) |
| `fadeyiSomolu.approach` | Toll Approach | The tool shed’s chains and padlocks are broken: the toll approach cannot be shut again. | NEW (written for this milestone, PR14) |
| `fadeyiSomolu.junctions` | Junction Run | The junction posts are knocked flat: the marshals lose their count of who crossed and who paid. | NEW (written for this milestone, PR14) |
| `fadeyiSomolu.boss` | Marshal Gbenga Kobo | The toll bars at every junction come down: commuters cross without paying by the hour. | NEW (written for this milestone, PR14) |
| `ebuteMetta.approach` | Yard Approach | The signal shed is wrecked: the yard can no longer clear the lines for its night trains. | NEW (written for this milestone, PR14) |
| `ebuteMetta.railYard` | Rail Yard Goods | The marked freight is broken open where it stands: the night cargo never leaves the yard. | NEW (written for this milestone, PR14) |
| `ebuteMetta.boss` | Ikenna Wayside | The dispatch switches are dead and the yard bells stop: no more Ring freight by night. | NEW (written for this milestone, PR14) |
| `lagosIsland.approach` | Ledger Row | The records annexe is cracked open: the forged ledgers are out of the vault. | NEW (written for this milestone, PR14) |
| `lagosIsland.press` | Press Run | The audit slips reach the press lane: the bureau can no longer bury its paper trail. | NEW (written for this milestone, PR14) |
| `lagosIsland.boss` | Barrister Tolani Quill | The forged ledgers are on the press: the bureau can no longer decide who exists on paper. | NEW (written for this milestone, PR14) |
| `lekki.approach` | Gate Approach | The standby plant’s switchgear is blasted: the estates’ private feed starts to flicker. | NEW (written for this milestone, PR14) |
| `lekki.estate` | Estate Sweep | The estate patrol is broken up: the grid’s control house stands unguarded. | NEW (written for this milestone, PR14) |
| `lekki.boss` | Bamidele Halcyon | The standby grid goes dark: the estates lose the power they bought with the mainland’s blackouts. | NEW (written for this milestone, PR14) |

---

## 6. Implementation status summary

| Item | Status |
| --- | --- |
| Tactical Trap pilot (Academy) | PILOT, shipped |
| Campaign-wide perception/punch-floor rollout | CURRENT as the campaign tactics layer (1.6, SA3-SA12) |
| Generator Parts + capacity/range upgrades, Oshodi | CURRENT (slice) |
| Parts for every mission, level-2 upgrades, bonus in every district, free respec | CURRENT (PR9–PR13) |
| Parts for rooms, door raids, challenges | PROPOSED (PR15) |
| Football Volley, counter, disruption specials | PROPOSED |
| Visible world-state changes | CURRENT on the map and result screens (PR14); arena dressing PROPOSED |
| Missions 19–21 | PLANNED (`docs/STORY_BIBLE.md` 5.2) |
