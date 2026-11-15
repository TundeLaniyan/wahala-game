# Tactical Trap pilot (decisions TT1-TT10)

Founder problem: campaign enemies escape generators too reliably (docs/ENEMY_COMBAT_FAIRNESS.md: the enemy planner saw every
generator) while punching finishes them faster than a generator does. This pilot makes the generator the tactical weapon
against ordinary enemies, as ONE isolated, reversible experiment. It is on only in the Training Academy "Generator Tactics"
lessons; the normal campaign, Classic Blast, City Rumble, multiplayer, online, raids, boss missions and the accepted Level 2
combat feel are untouched.

## Isolation and removal

- `GameConfig.tacticalTrap?: TacticalTrapConfig` (`src/sim/config.ts`, constant `TACTICAL_TRAP_PILOT`, layer `tacticalTrapLayer()`).
  Absent everywhere by default: `createGame` never adds it (tested for Classic, Survival, Deathmatch, Team, boss and field
  missions, the raid and the Oshodi pilot mission), so every other match's state is unchanged. The runtime
  (`GameState.tacticalTrap.slows`) is created on the first slowing hit only.
- Every hook is guarded by the key: `skills.ts` (slow, punch floor), `ai/world.ts` (step time, ready tick),
  `ai/enemyBot.ts` (perception), `systems/pilotCombat.ts` (`pilotBlocksStep` also reads the key).
- Not combined with the Oshodi combat pilot (its own punch path never calls the tactical hooks).
- Remove: delete the `tacticalTrap` type, constants and layer in `config.ts`, `systems/sight.ts`, `systems/tacticalTrap.ts`,
  `ai/trapSight.ts`, `tutorial/lessons/tactics.ts` (and its three entries in `tutorial/index.ts`), the `enemySeats` /
  `ScenarioBot` plumbing if wanted, the tests `tests/tactical-trap-*.test.ts`, `tests/tutorial/tactics*.ts`,
  `e2e/academy-tactics.spec.ts`, and the guarded lines listed above. The rules are inert without the key.

## 1. Perception (what an enemy knows about a generator)

Computed in `ai/trapSight.ts` from the `Observation` only (no hidden pickup, no RNG, no clock), O(enemies x generators x
trace length) per decision. Visibility never reads graphics quality (the architecture test forbids it).

| Rule | Behaviour |
| --- | --- |
| **A. Visible** | within the kind's `visionTiles` (straight distance between tile centres) and with a clear grid line of sight. A visible generator is taken seriously `reactTicks` after it was first seen, using its real fuse and range/pierce. |
| **B. Body concealment** | the line of sight is two Bresenham traces between tile centres (enemy to generator, and generator to enemy: they differ on lines that are not straight), ends excluded. A trace is blocked by any non-floor tile or any other living body (the player, another enemy). The generator is seen when AT LEAST ONE trace is clear, so a body exactly on a straight line hides it, one covering only half of an oblique line does not. A body standing ON the generator's tile hides it (the placer has just laid it under his feet). Grid space only, never the camera. |
| **C. Solid obstacles** | concrete and crates block sight. The engine has no low-cover tile (Oshodi's cover is presentation over wall tiles), so nothing lets sight pass over cover. An enemy that never saw a generator does not react to it. |
| **D. Memory** | position and fuse are kept while the generator is out of sight for `memoryTicks` (150; lieutenant and boss 240), refreshed whenever it is seen. A ticking generator with at most `memoryHoldFuseTicks` (120) of fuse left is held until it blows, so with the 3 s fuse a seen generator is never forgotten before it matters. If it moved while unseen (kicked, punched) it is forgotten. Stepping in front of it never erases the awareness. |
| **E. Hearing** | a generator that appears within `hearingTiles` (Manhattan; agbero 4, guard 5, thrower 5, heavy 4, lieutenant 7, boss 8) is heard on the tick it appears: CAUTION for 36 ticks (no new wind-up or cue, reaction to newly visible generators halved) and one investigating step along the dominant axis of the sound. It never reveals the tile or the blast zone. |
| **F. Fairness** | remote, triggered, disarmed, thrown, carried and the enemy's own generators, flames and the engine's warnings stay always visible. A known generator feeds the ordinary danger map and time search; an enemy never starts a wind-up or cue inside the cross of a generator it knows; it leaves when it can. It does not leave when it is planted by its own wind-up, recovery or cue, or slowed with no route (the planner now knows its real step time and root: decision TT7). |

| Kind | vision | react (ticks) | memory | hearing |
| --- | --- | --- | --- | --- |
| agbero | 6 | 30 | 150 | 4 |
| guard | 7 | 26 | 150 | 5 |
| thrower | 8 | 26 | 150 | 5 |
| heavy | 6 | 36 | 150 | 4 |
| lieutenant | 9 | 16 | 240 | 7 |
| boss | 10 | 10 | 240 | 8 |

## 2. Attack commitment

`enemyAttackPhase(state, enemy)`: `windup` (a pending punch or a throw's cue), `attack` (6 ticks after the swing resolves or
the object leaves), `recovery` (planted by `rootedUntil`), `idle`. The existing rules already plant the enemy for the wind-up
and the recovery (EF2); the pilot sets the recovery to 48 ticks (0.8 s) for agbero, guard, thrower and heavy (lieutenant
30, boss 24). Per-enemy cooldowns (agbero 180, guard 156, thrower 210, heavy 228 ticks, from the start of the swing)
exceed wind-up + recovery + 36 ticks for every kind (asserted), and a bot never chains (tested over 25 s).

## 3. The human's punch (slow stacking, non-lethal)

- 1st landed punch: 25 % slower for 90 ticks; 2nd inside the running slow: the 40 % cap, 90 ticks from that hit; 3rd: nothing.
  The chain never outlasts 150 ticks from its first hit; then 120 ticks of resistance. Realised numbers (base 10-tick step):
  +3 ticks (13 per tile, 23.1 % slower) and +7 ticks (17 per tile, 41.2 % slower); a thrower (13) +4 / +9 (23.5 % / 40.9 %).
- A punch takes an enemy down to its floor (1 segment; half the health for lieutenant and boss) and no further; it still
  staggers (daze, wind-up cut short) and slows. Only a blast (or trap) finishes: a guard (2) is left on 1, an agbero (1) is never hurt.
- No stun-lock: a daze never exceeds 30 ticks at a time (existing daze immunity), the slow chain ends and the enemy then
  walks at full speed for at least a quarter of a 20 s barrage (tested).

## 4. Throwers

Cue and recovery as in EF2 (recovery 48 ticks in the pilot, throw cooldowns 138-150 ticks, at most one throw in flight per
group gap); a stagger during the cue cancels the throw. A thrower that knows a generator never starts a throw inside its
cross and otherwise escapes through the ordinary planner.

## 5. Training Academy: Generator Tactics

A new course in `src/tutorial/lessons/tactics.ts`, shown as its own "Generator Tactics - pilot" group in the Academy menu
(`academy-group-tactics`; no new Home row). New lesson ids only: `trap-agbero`, `trap-thrower`, `trap-hidden`; the
`wahala.academy.v1` format is unchanged (the total reads 23 lessons). Each lesson turns the pilot on through
`tacticalTrapLayer()`, gives the human four health segments and the Street Jab, and seats real enemies
(`Actor.enemyKind`) played by `createBot` (the campaign Normal baseline, Casual); a passive bystander keeps the round alive.

1. **Agbero: bait and blast.** Step back so his swing misses (task done only on a miss), lay a generator next to him
   while he is stuck, punch twice (25 % then 40 %), step off when he swings again, let the blast finish him.
2. **Bottle Thrower: the corner.** The scene opens on a flashing bottle; step off the lane, step back in while he is
   planted and lay a generator two tiles from him in his corner (crate above him, the generator seals the lane).
3. **The hidden generator.** Control run: lay it in plain sight and step aside ("It saw it and ran"); then lay it
   under your feet and stay on it ("It never saw it").

Captions live in the existing lesson panel (no text over the board). A failure restarts from the checkpoint; an enemy that
falls before the steps are done restarts the lesson rather than leaving it stuck. A mixed agbero + thrower challenge was not built.

## Measurements

`tests/tactical-trap-evasion.test.ts` (printed), `scripts/lib/trapDrill.ts`: a scripted human (ordinary intents) lays a
generator under his feet beside an enemy on the bottom lane and leaves up the open column 0.57 s before the blast; 24 seeds
per kind, agbero and guard (48 runs, the enemy was inside the blast footprint in every run):

| plan | perfect knowledge | EF1 baseline | pilot |
| --- | --- | --- | --- |
| flee at once | 0 / 48 | 0 / 48 | 0 / 48 |
| stay on it (cover) | 0 / 48 | 0 / 48 | 18 / 48 |
| stay on it and punch twice (combo) | 0 / 48 | 0 / 48 | 48 / 48 |

Known-generator runs (agbero 2 tiles from a generator, human far, 24 seeds): in plain sight 0 hit, hidden behind a body
24 hit, planted by its own swing 24 hit. Honest reading: concealment and commitment make the trap; slowing plus staggering
makes it reliable for a human who leaves late. The window is narrow (leave at 0.57 s of fuse: the human needs about 0.4 s to
get out; at 0.7 s or more the enemy usually walks out). Casual enemies also leave a free generator late: a seen generator
under an idle enemy's feet is dodged in about two runs out of three, the stock planner's lateness (not changed here).
Perception cost: one sight check per generator and one body scan per decision (counters in `trapSightStats`, tested).

## Limitations and judgement calls

- The pilot is only reachable in the Academy; the campaign, Rumble and online never exercise it, so its feel in a full
  mission is unmeasured. Enemy movement is the stock Casual planner, which chases the human and so often walks out of a
  cross by accident; a generator under the human's own feet and a committed enemy are the reliable traps.
- The thrower trap relies on a dead end (a crate seals his corner); in open ground a standoff thrower keeps away.
- Slow and stagger have no new art or sound (the existing daze flinch and the slow's step time show it); no new event type.
- Hearing's investigating step is one tile along the sound's dominant axis (a deliberate small leak of direction).
