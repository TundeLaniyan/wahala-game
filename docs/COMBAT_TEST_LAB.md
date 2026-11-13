# City Rumble Combat Test Lab (decisions CL-L1 to CL-L8)

A **temporary playtest tool**. The founder compares four punch behaviours in one local City Rumble match, switching
between them from the pause menu without restarting. It is not a final balance, and no level is recommended.

## Using it (phone or desktop)

1. Home -> City Rumble -> any mode -> Start (bots are fine).
2. Pause: the pause button on the HUD (phone), or P / Esc / Start.
3. Under **Combat test lab**, tap **Off**, **1 Classic+**, **2 Balanced**, **3 Arcade** or **4 Maximum Punch**.
4. Resume. The new level is in force at once. A small chip under the minimap shows it, for example "LAB 3 Arcade".
5. Pause again and pick another level at any time; the match goes on.

The level is kept for rematches and for later local Rumble matches in the same page session. It is never offered
in Classic, campaign missions, raids or online play.

## What changes between levels (one combat system, data in `src/sim/config.ts` `COMBAT_LAB_PRESETS`)

Every fighter keeps their own attack: Street Baller the Punch (push), Lekki Boy the Daze Punch, Campus Queen the
Shove. The daze, the displacement and the victim's daze immunity never change, so a victim always gets a free window
after each daze and there is no stun-lock at any level.

| | Off (today) | 1 Classic+ | 2 Balanced | 3 Arcade | 4 Maximum Punch |
| --- | --- | --- | --- | --- | --- |
| Punch startup / hit recovery / same-target lockout (ticks) | 4 / 60 / 180 | 4 / 36 / 144 | 3 / 24 / 108 | 2 / 15 / 72 | 2 / 10 / 36 |
| Daze Punch startup / hit recovery | 18 / 240 | 18 / 144 | 14 / 90 | 8 / 45 | 4 / 14 |
| Shove startup / hit recovery | 12 / 120 | 12 / 72 | 10 / 48 | 7 / 30 | 4 / 12 |
| Reach | 4 neighbours | 4 neighbours | + the 2 forward corners | + 2 tiles straight ahead | + 2 ahead and 1 to the side |
| Aim help (turns to a rival on another side) | no | no | yes | yes | yes |
| B press kept while recovering or briefly dazed | no (ignored) | 10 ticks | 12 ticks | 15 ticks | 15 ticks |
| Nobody in reach | nothing happens | visible swing and miss | same | same | same |
| Impact feedback | white ring | white swing arc + ring | cyan fan to the corners + ring | amber 2-tile fan + big flash + wide ring | red-orange wide fan + big flash + wider ring |

(60 ticks = 1 second.) Reach never passes walls: a corner needs one open side tile, and a two-tile reach needs an
open tile between.

## Hit confirmation and level identity (decision CL-L9)

Presentation only, fed by the existing `punchSwing` / `attackResolved` events (no sim change), all in the lab's local
Rumble. Each level has its own colour (1 white, 2 cyan, 3 amber, 4 red-orange; `render/combatLabLook.ts`):

- **Swing arc**: a floor fan from the fighter whose size is the reach: a narrow one-tile fan at level 1, a wider fan
  that covers the forward corners at level 2, a two-tile fan at 3 and a wide two-tile fan at 4.
- **A hit**: a coloured ring and flash on the rival (bigger with the level), dust, the rival flinches (Stumble clip), and a
  small bounded camera jolt when the local fighter threw or took it (`render/shake.ts` budget; off on touch and with reduced
  motion), plus a thud (`gen_drop`, louder and lower with the level; `audio/combatLabCue.ts`).
- **A miss**: always a thin short grey arc with a puff of dust at its tip, no flash, and a quiet low swish: plainly not a hit.
- **Pause menu**: under the level buttons a plain-words line says what the selected level changes against the one before
  it (generated from `COMBAT_LAB_PRESETS` and the real Punch numbers by `app/combatLabText.ts`).
- **HUD chip** (under the minimap): `LAB 2 Balanced` and a second small line (`8 around · aim help`), in the level's colour.

`npm run combat-lab-compare` measures any two levels through the real sim; `scripts/combat-lab-shots.mjs` takes the
review frames.

## B hold and the Remote Detonator

Holding B (or A) still sets off a Remote Detonator generator, exactly as before. The input layer
(`input/specialHold.ts`) decides tap or hold before the game sees the press. The lab adds no hold-to-repeat: rapid
punching is rapid tapping, and the kept-press buffer makes sure no tap is lost while the punch recovers.

## Diagnostics

The pause menu shows your record for the current match: B presses, punches started, air swings, hits, misses,
presses kept by the buffer, and presses that did nothing. The same per-seat record is on the `?debug` handle
(`__WAHALA__.combatLab()`). There is no overlay over the board.

## Scope and removal

- Only local City Rumble matches (Survival, Deathmatch, Team) with no campaign mission or raid; the app switches
  it between ticks through `MatchController.setCombatLab`. Online code is unchanged and never calls it.
- Campaign enemies, raids and the Oshodi combat pilot are untouched: the lab's rules apply only to seats without
  `enemyKind`, and only while `config.combatLab` is set.
- Bots use the same rules: they choose their punches with the same `chooseAttack`, which reads the level.
- To remove: delete `COMBAT_LAB_PRESETS` and `CombatLabPreset` (config.ts), `systems/combatLab.ts`, the lab branches
  in `skills.ts` / `actions.ts` / `tick.ts` (all behind `config.combatLab`), `ui/CombatLab.tsx` + `combatLab.css`,
  their two call sites (Hud.tsx, Overlays.tsx), and `setCombatLab` / `combatLabAvailable` in the app.

## Tests

`tests/combat-lab.test.ts` covers gating, live switching, each level's real numbers, reach shapes and walls, kept
presses, air swings, no stun-lock at Level 4, B-hold detonation, determinism and bot matches at every level.
`e2e/combat-lab.spec.ts` covers the pause-menu flow on desktop and phone, and that the lab is not offered in Classic.

## Findings: why levels 1 and 2 felt almost the same (investigation, `npm run combat-lab-compare`)

Measured in the real sim (a tapping player, B every 6 ticks; a rival who stands still; 60 ticks = 1 s). Nothing was
retuned; these are the reasons, then a recommendation for the founder to decide.

1. **The two levels looked identical.** Both are `feedback: 1`: the same white arc and white ring, the chip said "LAB 2
   Balanced" and nothing else. Since CL-L9 each level has its own colour, arc and hit cue.
2. **The recovery difference is masked by the same-rival lockout.** After a hit, Punch recovery is 36 ticks (1) vs 24 (2),
   but the same rival cannot be hit again until the lockout ends: 144 vs 108. The recovery is shorter than the lockout, so
   against one rival it never limits anything. Real gap between two hits on the same rival: Punch 2.5 s vs 1.9 s, Shove
   2.5 s vs 2.2 s, Daze Punch 3.3 s vs 3.0 s. Hits in 30 s of tapping: 13 vs 16, 12 vs 14, 9 vs 10.
3. **Startup differs by one tick for the Street Baller.** Punch startup 4 vs 3 ticks = 17 ms, a single frame (Shove 12 vs 10,
   Daze Punch 18 vs 14: 33 and 67 ms, only slightly perceptible).
4. **A miss recovers equally fast.** Punch miss recovery is 8 ticks at both levels (both sit on `minRecoveryTicks` 8):
   swings at nobody in 10 s of tapping: 50 vs 55. Only Shove (22 vs 14 ticks) and Daze Punch (18 vs 12) differ.
5. **The Daze Punch is capped by its daze immunity.** Immunity is 60 + 120 = 180 ticks, so from level 2 up Lekki Boy's gap
   between hits is 3.0 / 3.0 / 3.1 s at levels 2 / 3 / 4: the lockout and recovery cuts above that are invisible.
6. **Corner reach and aim help rarely trigger in play.** 4 bots, 8 seeds, 60 s: punches aimed at a forward corner were 2 % of all
   punches at level 1 (the rival had stepped there after the press; level 1 cannot hit a corner) and 0 % at level 2;
   punches that needed the aim-help turn: 0 %. The hit rate rose from 61 % to 83 % (the 8-tile reach stops diagonal misses) but bots always face their
   target, so this under-states what a person on a stick or a D-pad does. Press buffer 10 vs 12 ticks is 33 ms: kept presses
   in 30 s of tapping were 80 vs 118, but a press is only kept when it comes before recovery ends.

**Recommendation (not applied; the founder decides).** If level 2 should be felt, not only seen, change only its numbers:
`startupScale 0.6` (`maxStartupTicks 12`): Punch / Shove / Daze startup 2 / 7 / 11; `recoveryScale 0.35` with
`minRecoveryTicks 5` (`maxRecoveryTicks 90`): Punch hit / miss recovery 21 / 5, Shove 42 / 13, Daze 84 / 11; `lockoutScale 0.5`
(`maxLockoutTicks 120`): Punch and Shove lockout 90, Daze 120. That makes the Punch gap between hits about 1.5 s (level 1:
2.4 s) and its miss cadence 5 ticks (8), sits between level 1 and the Arcade's 72, and leaves reach, aim help and buffer
as they are. The Daze Punch would still be held at about 3 s by its immunity; changing that is a fighter decision
(`dazeImmunityTicks`), not a lab one. If the founder prefers, keep today's numbers and rely on the new presentation.
