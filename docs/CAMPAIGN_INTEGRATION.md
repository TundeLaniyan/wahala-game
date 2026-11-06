# Campaign integration: classic grid / combat + Lagos enhancement

Branch `claude/wahala-campaign-integration-v1`, from the live release `a4fe457` (`claude/wahala-stitch-uiux-v1`). **Not merged to the release branch, not published.** Neither feature branch was modified.

| Step | Commit | What |
| --- | --- | --- |
| base | `a4fe457` | the live release (respawn hotfix included) |
| 1 | `b5a5750` | merge `claude/wahala-classic-grid-combat-v1` @ `7058ce8` (clean) |
| 2 | `cc82198` | merge `claude/wahala-lagos-enhancement-v1` @ `4826700` (4 textual conflicts + 1 semantic) |
| 3 | `717e656` | enemy level per campaign level (CI1); Admiralty Way per the founder clarification (LK6-LK8) |
| 4 | this commit | level summaries say what the enemy level does; screenshots; this report |

## Conflict resolutions
Each conflicted file had one hunk; nothing from either side was dropped.

- `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`: both sections kept (the classic grid / checkpoint / combat sections first, then the Lagos sections).
- `src/sim/index.ts`: both export sets (`EnemyAwareness`, `EnemyMeleeSpec` and the campaign level API); the duplicated `CampaignConfig` type export removed.
- `src/sim/mission/fieldDefs.ts`: the Lagos branch's Ebute Metta West coordinates (`ebuteX(10)`, `ebuteX(20)`, `ebuteX(30)`) with the gameplay branch's objective wording ("Walk through the 3 checkpoints to the signal box.").
- **Semantic** (not a textual conflict; found by tsc): the gameplay branch made `CampaignConfig.vsEnemy` required after the difficulty branch wrote `levelConfigLayer`. The layer now spreads it like `damage` / `bar`, so Easy and Hard keep the 1.1 s player-on-enemy lockout (decision CI2).
- Auto-merged files touched by both branches (`sections.ts`, `obstacleStyles.ts`, `config.ts`) were inspected: disjoint hunks.
- Check: every file changed by only one branch is byte-identical to that branch in the merge, except `src/sim/campaign/levels.ts` (the one-line semantic fix above).

## Changes made on the integration branch
1. **Difficulty (CI1).** Normal is now the fair combat baseline: field-mission and raid enemies play at the campaign level's bot level (Easy Beginner, Normal Casual, Hard Standard) instead of the boss-fight "Crew level" (save default Rookie). Boss missions keep the crew level and the Standard floor; the briefing says so; the level summaries say enemies are slower (Easy) / sharper (Hard). Saves are unchanged (an old save loads as Normal and fights Casual). Multiplayer and Rumble never read it.
2. **Admiralty Way (LK6-LK8).** Renamed from "Amarite" everywhere it was safe (identifiers, files, script, doc, screenshot folder); the whole carriageway, both directions, plaza to expressway (68 tiles), is interlocking paving; junction ends with an edge restraint, a soldier course and a stop line; rounded median noses; a slightly darker tone. Paint only: the sim layout and its 524 road tiles are pinned. Details: `docs/LEKKI_ADMIRALTY_WAY.md`.

## Tests
- `npm run typecheck`, `npm run lint`: clean. Prettier: every file this integration changed is clean; 65 untouched files fail `prettier --check` exactly as at `a4fe457` (pre-existing; CI does not run it).
- `vite build` + `check-static-build`: pass.
- Vitest, whole suite: **219 files, 3,469 passed, 7 skipped, 0 failed** (at `717e656`); after the summary-text change the campaign-level and app suites again (26 files, 179 passed).
- Focused Playwright (not the full release suite), desktop 1280x720 and phone 844x390, against the production build: **43 passed, 9 skipped** (the skips are each test's own desktop-only / phone-only guard), then 6 more after the summary change. Covered: Rumble setup has no blast toggle and field missions use radial bombs (Rumble radius bombs unchanged); classic raid with cross bombs and cargo; enemy projectile cue; field -> raid -> field through the real session; boss bar; campaign death -> respawn (never spectating); mobile cross control; Normal campaign start (prologue -> map -> briefing -> boss intro -> mission); save, reload, corrupt save, `?campaign=0`; every campaign screen fits desktop and phone; difficulty select Hard, start, reload, change on the map; an old save resumes as Normal; Oshodi checkpoint beacons and door hold start the raid; depot board on desktop and the phone cross; Ebute Metta (75 x 39) on desktop, at night and on a phone; story panels (prologue, briefing, boss intro) with pictures and with every picture blocked.
- Depot fairness harness by enemy level (12 seeds, fighting / slower player): Beginner 10/12 / 11/12, Casual 11/12 / 10/12, Standard 8/12 / 11/12 won; deaths 1-2 per 12 runs everywhere.
- **The mandatory release CI must still run before any publication.**

## Screenshots (`docs/screenshots/campaign-integration/`)
1. Depot maze: `1-depot-maze-desktop.jpg`, `1-depot-maze-phone.jpg`
2. Oshodi: `2-oshodi-checkpoint-beacon-{desktop,mobile}.jpg`, `2-oshodi-door-hold-{desktop,mobile}.jpg`
3. Ebute Metta: `3-ebute-east-station.jpg`, `3-ebute-west-apapa-road-truck-park.jpg`, `3-ebute-west-ilogbo.jpg`, `3-ebute-whole-east-and-west.jpg`
4. Lekki Admiralty Way: `4-lekki-admiralty-{gameplay,close,junction_close}-{desktop,mobile}.jpg` (more in `docs/screenshots/lekki-admiralty/`)
5. Difficulty selector: `5-difficulty-hard-{desktop,mobile}.jpg`
6. Story: `6-story-{prologue,briefing,boss-intro}-{desktop,mobile}.jpg`

## Known limitations and remaining defects
- Software GL only (SwiftShader), no real device: frame rate is not representative; paver shimmer in motion is unverified (stills only). Draw calls on the Lekki frame are unchanged within the usual run-to-run spread (about 420-520).
- Phone 844x390: the objective / health rail is clipped at its bottom (the LIVES row) in the Oshodi field; the gameplay branch's own screenshot shows the same, so it is not from this merge.
- The bot level is a gentle step on its own in the scripted harness; the per-level awareness / recovery / pressure knobs are not scaled yet (CI2, unmeasured).
- The boss-intro panel the story spec captures is Mushin's; the Oshodi and Fadeyi provisional boss presentations are unchanged from the Lagos branch and covered by its unit tests, not re-photographed here.
- `e2e/campaign-difficulty.spec.ts` screenshots right after a click and can catch the button's 0.12 s colour fade (Normal still lit, Hard's text shown); the selector itself is correct (checked settled, `aria-pressed` and colour). Test-only cosmetic.
- No seven-district redesign, no Ojuelegba boss: the district order is the release's (Ojuelegba home + six).
