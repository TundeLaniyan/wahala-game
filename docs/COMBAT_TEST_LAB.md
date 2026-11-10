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
| Impact feedback | white ring | swing arc + ring | swing arc + ring | big flash + wide ring | big flash + wide ring |

(60 ticks = 1 second.) Reach never passes walls: a corner needs one open side tile, and a two-tile reach needs an
open tile between.

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
