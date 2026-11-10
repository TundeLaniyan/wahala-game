# Task 1 - Sudden Death banner lifecycle (decisions SD-B1-SD-B4)

## Root cause

The founder saw a large SUDDEN DEATH announcement stay over the arena after the fight had begun. Investigation:

- The title card (`SuddenDeathCard`) was **not** the culprit: it renders only while `match.suddenDeath.stage` is
  `'transition'`, which is exactly the window in which `suddenDeathHoldsInput` holds every intent (240 ticks), and it is
  gone on the first tick of play in every Rumble ruleset (measured: survival, deathmatch, team). It is
  `pointer-events: none`. Its length is counted in simulation ticks, so a slow device (below 10 frames a second the
  frame loop drops time) stretches it in wall time, but input is held for exactly that long, so hiding it earlier would
  only hide why the fighter cannot move.
- The blast clock (`SuddenDeathClock`) **was**: during the whole countdown (60 s to blast 1, then 15 s, then 15 s) it
  rendered the full announcement block, i.e. the title, "BLAST 1 OF 3 · SHIELDS RESPECTED · 0:42", the line about your own
  shield and the kill ranking. In City Rumble the HUD rail is `rail-top`: it hangs top-centre over the arena (the follow
  camera keeps the player in the middle), so a 420 x 81 px panel (desktop 1280 x 720 and phone 844 x 390 alike) sat
  over the play area, right above the local fighter, for the entire round. Screenshot evidence was taken on both sizes
  before the fix.

## Decisions

| # | Decision | Where |
| --- | --- | --- |
| SD-B1 | **The blast clock announces, then folds.** When a countdown begins (the round's first, and the next one after every blast) the clock shows its full announcement for `SUDDEN_DEATH_ANNOUNCE_TICKS` (180 ticks, 3 s), then folds into a one-line chip: SUDDEN DEATH · BLAST n OF 3 (plus SHIELDS IGNORED on the final blast) · the countdown. The chip still pulses in the 5 s warning window; it does not expand again over the fight. The long lines (your shield, the ranking) stay in the chip's accessible label. | `app/hud.ts` (`SuddenDeathHud.announce`), `ui/SuddenDeath.tsx`, `ui/SuddenDeath.css` |
| SD-B2 | **Counted in simulation ticks, read from the sim state.** `announce` is derived from `transitionEndTick` / `lastBlastTick` (presentation only, no new sim field, no rule change), so a paused game keeps the banner as it was, a resume carries on, a rematch (a new state) starts with no banner, and a fresh round started mid-match (the last contenders fell together) gets its own card and its own announcement. | `app/hud.ts` `buildSuddenDeath` |
| SD-B3 | **The title card keeps its sim lifecycle.** It shows exactly while input is held and disappears on the first tick of play; it is `pointer-events: none` and has no controls. Not shortened by wall time: the sim holds input for those ticks whatever the device's frame rate. | `ui/SuddenDeath.tsx` (unchanged rule), `tests/ui/sudden-death-banner.test.ts` |
| SD-B4 | **Nothing on the board takes a touch.** The card, the chip, the rail and the blast flash are all `pointer-events: none`; the e2e checks a tap where the chip is reaches the game, and the fighter moves (keys on desktop, the touch pad on a phone) with the chip up. | `e2e/sudden-death-banner.spec.ts` |

## Tests

- `tests/ui/sudden-death-banner.test.ts`: card only while input is held (gone on the first tick of play); full
  announcement for 180 ticks then compact; compact through the warning window; re-announced after each blast and folded
  again (final blast keeps SHIELDS IGNORED); a mid-match fresh round gets its own card and announcement; pause (no
  ticks) keeps the banner; a rematch starts clean; the same lifecycle in survival, deathmatch and team.
- `e2e/sudden-death-banner.spec.ts` (desktop 1280 x 720 and phone 844 x 390): card visible and `pointer-events: none`
  while input is held; gone on the first tick of play with the full clock; pause holds it, resume carries on; after the
  announce window a chip no taller than 32 px and narrower than 45 % of the screen, with blast and countdown; a tap at
  the chip reaches the game; the fighter moves with the chip up.
- Unchanged and passing: `tests/ui/combatHud.test.ts`, `tests/sudden-death.test.ts`. The existing
  `e2e/sudden-death.spec.ts` checks the clock 20 ticks into the countdown (still the full announcement).
