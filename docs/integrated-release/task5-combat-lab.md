# Task 5: City Rumble Combat Test Lab

Reference: `docs/COMBAT_TEST_LAB.md`.

| # | Decision | Where |
| --- | --- | --- |
| CL-L1 | **Local City Rumble only, off until picked.** `setCombatLabLevel` refuses every match that is not a City Rumble ruleset or that has a campaign mission or raid; the app calls it between ticks from the pause menu. Online code is untouched. A match starts with the lab off (today's rules), so no level is preselected. The picked level carries over to rematches and later local Rumble matches in the same page session. | `sim/systems/combatLab.ts`, `app/MatchController.ts` |
| CL-L2 | **One combat system, four data presets.** `COMBAT_LAB_PRESETS` scales and caps every catalogue attack's startup, hit / whiff recovery and same-target lockout from the match's own numbers (never slower), and switches the reach shape, aim help, press buffer and air swing. Each fighter keeps their attack (push / shove / daze) and its daze, displacement and immunity. | `sim/config.ts`, `combatLab.ts` |
| CL-L3 | **Reach shapes never pass walls.** Level 2 adds the forward corners (one open side tile needed), Level 3 the tile two ahead (open tile between), Level 4 the tiles two ahead and one aside (an open route). Aim help (Levels 2-4) turns the fighter to a rival in reach on another side. | `combatLab.ts` `labReach`, `skills.ts` |
| CL-L4 | **Every accepted press swings.** A punch draws its swing at the press (`punchSwing`); with nobody in reach and nothing else for B to do, the press is a visible swing at the air and a miss. | `skills.ts` `beginAirSwing`, `actions.ts` |
| CL-L5 | **Presses are kept, not ignored.** A B press during recovery or a short daze is kept for 10 / 12 / 15 / 15 ticks and done the moment it can be; one that outlives the buffer is counted as dropped. | `actions.ts` `labSpecial`, `retryKeptSpecial`, `tick.ts` |
| CL-L6 | **No stun-lock, no loops.** The victim's daze immunity is untouched at every level; Level 4 mashed every tick for 10 s keeps the victim dazed under 50 % of the time (tested). Hit counts come from sim ticks, never frame rate. | `tests/combat-lab.test.ts` |
| CL-L7 | **B hold stays the Remote Detonator.** No hold-to-repeat: the input layer decides tap vs hold before the sim; rapid punching is rapid tapping, protected by the buffer. | `input/specialHold.ts` (unchanged) |
| CL-L8 | **Visible but out of the way.** A small "LAB n Name" chip under the minimap; the picker and the press diagnostics live in the pause menu; nothing is drawn over the board. Bots use the same rules through `chooseAttack`. | `ui/CombatLab.tsx`, `app/hud.ts` |
