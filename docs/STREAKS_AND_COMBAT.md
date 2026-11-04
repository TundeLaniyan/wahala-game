# Kill streaks, close combat and touch input (branch `claude/wahala-streaks-combat-input-v1`)

Started from the deployed release branch `claude/wahala-stitch-uiux-v1` at `8ebf3f4`. Decisions: MI1-MI5, CB1-CB4, SK1-SK4, VG1-VG4, GK1 (`docs/DECISIONS.md`). This page is the reference for the numbers and the measurements; the code is the authority.

## 1. Touch movement (decisions MI1-MI5)

Audit findings (measured on the release with the real `InputManager`, the real stick model and the real simulation, `AssistRig`):

| Problem | Before | After |
| --- | --- | --- |
| A tap while dazed (any point of the 1 s daze) | spent on a tick the simulation ignores: the avatar never moved | kept (newest wins, up to 90 ticks) and done 1-2 ticks after the daze ends |
| A tap during a stumble, an oil slide or a trapdoor arrival | the same | the same fix (`movementLocked`) |
| A diagonal flick, then an opposite tap 1-4 ticks later | the tap was lost; at 8 ticks it waited until tick 20 | the owed second step is cancelled; the tap is done when the first step ends (tick 10) |
| A diagonal flick, then holding the opposite direction | both route tiles first (13-20 ticks) | the route ends at the first tile, the new direction starts at once |
| Second diagonal step | re-validated (floor, solid, danger) | unchanged: re-validated immediately before it is handed over; the reverse order (horizontal first) is still tried when vertical-first is blocked |
| Own generator under the player, a diagonal flick | one tile (the assist refused every footprint tile) | two tiles; the settle is skipped; never nearer the generator, never onto a lethal tile |
| Wall, then a new direction | 2 ticks after the step (no bump-guard delay) | unchanged (verified: the bump guard was not a cause) |
| Held against a crate that disappears | 1 tick | unchanged (verified) |
| Keyboard / gamepad | - | byte-for-byte the same intent streams (`tests/mobile-input-reliability.test.ts` section 7) |

The 2-tick direction-switch settle measures one tick (about 17 ms) in practice; a 1-tick settle already blocks a 1-tick swing through a third direction but not a 2-tick one, so it stays at 2 and is skipped only in an emergency (MI3).

Input trace (`?debug` or `?trace`): `__WAHALA__.inputTrace().dump()` returns the last 1200 records of raw touch event -> quantised direction + wish -> gate decision and reason -> simulation result.

## 2. Close attacks (decisions CB1-CB4)

Ticks at 60 per second. `config.skills.attacks`.

| | Punch / Street Jab (`push`, Street Baller) | Shove (`shove`, Campus Queen) | Daze Punch (`daze`, Lekki Boy) |
| --- | --- | --- | --- |
| range | adjacent | adjacent | adjacent |
| startup | 4 (0.07 s) | 12 (0.2 s) | 18 (0.3 s) |
| effect | 30 ticks (0.5 s) daze, no push | pushes 2 tiles where the map allows, no daze | 60 ticks (1 s) daze, 2 s daze immunity after |
| whiff recovery | 12 (0.2 s) | 36 (0.6 s): the failed Shove leaves the attacker exposed | 30 (0.5 s) |
| hit recovery (global; other rivals hittable after) | 60 (1 s) | 120 (2 s) | 240 (4 s) |
| per-target lockout (same rival) | 180 (3 s) | 180 (3 s) | 240 (4 s) |
| cost | weak effect, one tile of reach | a wall / crate / generator behind the rival makes it a whiff; slowest recovery of the quick pair | slow telegraph, longest recovery, a jab cuts its wind-up short |

Nothing roots the attacker: the recoveries only delay their next attack. Measured through the simulation (`npm run combat-balance`, 60 s):

```
# Close attacks: measured through the simulation (60 s each)

| attack | startup | whiff rec. | hit rec. | target lockout | daze | push | alone: hits/min | alone: victim control s/min | flee: hits/min | flee: whiffs/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| push | 4 | 12 | 60 | 180 | 30 | 0 | 20.0 | 10.0 | 20.0 | 2.0 |
| shove | 12 | 36 | 120 | 180 | 0 | 2 | 5.0 | 1.3 | 4.0 | 56.0 |
| daze | 18 | 30 | 240 | 240 | 60 | 0 | 14.0 | 14.0 | 14.0 | 0.0 |

## Duels (both walk up and press B at every chance; 60 s)

| row attack vs column attack | hits landed (row / col) | seconds controlled (row / col) | row control share |
| --- | --- | --- | --- |
| push vs push | 20 / 20 | 10.0 / 10.0 | 50.0 % |
| push vs shove | 20 / 2 | 0.4 / 10.5 | 96.6 % |
| push vs daze | 20 / 13 | 13.0 / 10.0 | 43.5 % |
| shove vs push | 5 / 20 | 11.5 / 1.3 | 9.8 % |
| shove vs shove | 19 / 19 | 10.5 / 10.5 | 50.0 % |
| shove vs daze | 5 / 14 | 15.5 / 1.3 | 7.5 % |
| daze vs push | 13 / 20 | 10.0 / 13.0 | 56.5 % |
| daze vs shove | 14 / 2 | 0.4 / 14.5 | 97.5 % |
| daze vs daze | 14 / 14 | 14.0 / 14.0 | 50.0 % |

## Positional use: a flame lane the rival cannot leave in time (1 = the hit kills)

| attack | flame under the rival at tick 45 | flame two tiles beyond at tick 25 |
| --- | --- | --- |
| push | 0 | 0 |
| shove | 0 | 1 |
| daze | 1 | 0 |
```

Reading it: the Punch wins plain duels (fast, and a 3 s lockout is its only limit); the Daze Punch is the one that holds a rival inside a lane that is about to burn; the Shove is the only one that drives a rival onto a lane two tiles away, and a plain duel is its worst case (its value is the map). No attack is better than another on every axis (`tests/combat-attacks.test.ts`).

## 3. The fixed initial kill-streak loadout (decisions SK1-SK4)

For the nth credited elimination of the current life (`stats.streak`), in every City Rumble ruleset (not Classic):

| kills | reward | what it is |
| --- | --- | --- |
| 3 | QUICK HANDS | 18 s; +5 generator charges (2 -> 7); a held A lays a generator on every tile you step onto; a placement press that cannot be done yet is kept 1.2 s; normal fuse, flames and owner vulnerability |
| 5 | VEHICLE GENERATOR | one use; a public vehicle (any, drawn when earned and shown on the button) carries a live generator |
| 7 | GLOBAL KNOCKDOWN / LOCAL CHAMPION | one use; every rival is knocked flat by a thrown object; non-lethal |

Earned once per threshold; consumed once; a death ends the streak but loses no earned reward (decision AS7): unused VEHICLE GENERATOR / GLOBAL KNOCKDOWN stay, and a running QUICK HANDS is paused with its unspent time stored and resumed on the respawn; kills, deaths and assists are never reduced; the respawn is the normal one. The existing elimination ladder (`config.rewards`), supply crates and the rule that ordinary crates drop nothing in Rumble are unchanged. Assists pay nothing (future work; not required by the streak system).

B resolves in this order: an attackable adjacent rival -> melee, else VEHICLE GENERATOR, else GLOBAL KNOCKDOWN, else a voucher vehicle, else nothing. Still exactly two action buttons.

## 4. VEHICLE GENERATOR (decisions VG1-VG4)

| step | ticks after the vehicle starts driving |
| --- | --- |
| lane warning (existing, before driving) | -72 to 0 |
| launch: the generator is mounted, the 3 s fuse starts | 0 |
| release: the carrier lets go and the generator is thrown at the rival | 120 (2 s); earlier if the carrier leaves the board or crashes |
| flight (visible projectile, landing footprint on the ground) | 120 to 160 |
| boom | 180 (3 s), measured for every vehicle |

Any fighter, any public vehicle (`config.vehicles.allowed`: danfo, taxi, keke; the Rumble stages add the okada). Carrier pace per tile: danfo 12, taxi 9, keke 10, okada 8 ticks. The carrier never rams, uses no generator capacity, and its blast never catches its owner. Never a cross-map lob: a throw is at most 10 tiles.

## 5. GLOBAL KNOCKDOWN (decision GK1)

Throw 36 ticks (0.6 s) -> each rival is hit on the head and lies flat 120 ticks (2 s; 90-180 tested) -> they get up; 4 s of immunity after. Non-lethal; the owner may move, place and attack throughout.

Measured follow-up (`npm run streak-measure`, 150 seeded Survival matches per row, four Standard bots, the reward handed to seat 0 after 3 s and thrown by the bots' own rule; kills in the next 10 s against the SAME match without it):

## GLOBAL KNOCKDOWN

| knockdown | uses | kills/use | same match without it | extra kills/use | uses with 0 / 1 / 2 / 3 kills | user died in window |
| --- | --- | --- | --- | --- | --- | --- |
| 1.5 s | 94 | 0.47 | 0.31 | 0.16 | 55 / 34 / 5 / 0 | 20 |
| 2 s (default) | 94 | 0.57 | 0.31 | 0.27 | 48 / 38 / 8 / 0 | 15 |
| 2.5 s | 94 | 0.64 | 0.31 | 0.33 | 42 / 44 / 8 / 0 | 9 |
| 3 s | 94 | 0.64 | 0.31 | 0.33 | 38 / 52 / 4 / 0 | 7 |

## VEHICLE GENERATOR timeline (a still rival in the middle row, owner in the far corner)

| vehicle | launch to release (ticks) | launch to boom (ticks) | target killed if it stays | target killed if it runs at the release |
| --- | --- | --- | --- | --- |
| danfo | 120 | 180 | yes | no |
| taxi | 120 | 180 | yes | no |
| keke | 120 | 180 | yes | no |
| okada | 120 | 180 | yes | no |

Reading it: at the default 2 s a use is worth about +0.27 kills over the same match (0.57 against 0.31 in the next 10 s), about one use in eleven kills two rivals and none kills three, and the thrower dies within 10 s in about one use in six. A fallen rival loses two of the generator's three seconds, so it is a strong set-up, never an automatic multi-kill. (The bots are Standard level; a human who prepares a generator before throwing gets more.)

## 6. HUD

Rail notices and reward cards (`StreakStatus`) beside the board: QUICK HANDS with seconds left, a draining bar and generator charges; VEHICLE GENERATOR with the vehicle; GLOBAL KNOCKDOWN ready; kills to the next. Notices when earned, used, over, lost, and what the others see (a vehicle with a generator, LOCAL CHAMPION). Touch buttons name the action (GENERATOR + HOLD: LAY; the vehicle's name + GENERATOR; KNOCKDOWN), never a letter. Keyboard: A = Space / J (hold to lay under QUICK HANDS), B = K / E / F / L / Shift. `e2e/streaks.spec.ts` checks the cards, the labels, the circle fit and no overlap with the timer, portraits, inventory and controls, by day and by night; `tests/ui/streakContrast.test.ts` checks AA contrast of every text colour on the plate over a white (day) and a black (night) board.

## 7. Future work

- A custom streak-reward selection menu (the loadout is fixed here).
- Assist credit toward a reward (assists pay nothing).
- More vehicle art (the Okada vehicle is a procedural model; no glTF yet).
