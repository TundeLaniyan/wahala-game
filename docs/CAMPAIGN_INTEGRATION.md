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
- (Fixed after founder review, see "Mobile HUD fit" below: the phone-landscape dock was clipped.)
- The bot level is a gentle step on its own in the scripted harness; the per-level awareness / recovery / pressure knobs are not scaled yet (CI2, unmeasured).
- The boss-intro panel the story spec captures is Mushin's; the Oshodi and Fadeyi provisional boss presentations are unchanged from the Lagos branch and covered by its unit tests, not re-photographed here.
- (Fixed: `e2e/campaign-difficulty.spec.ts` now waits for the settled selected state before the picture and asserts it.)
- No seven-district redesign, no Ojuelegba boss: the district order is the release's (Ojuelegba home + six).

## Mobile HUD fit (final fix)
**Defect.** On a phone in landscape the campaign dock under the minimap (objective, health, lives, phase) was cut off at the bottom: it ends above the action buttons, and its content was 39-83 px taller than the room (measured at 667x375, 844x390, 915x412, 932x430; worst while holding the depot door, because the hold bar is the tallest content). Portrait and desktop were fine.

**Correction (CSS and two small component changes; the HUD is not redesigned, desktop and portrait are untouched).** All rules apply only below 520 px height (landscape phones):
- `ui/Minimap.tsx`: with a campaign mission the map is at most 64 px tall (52 px under 400 px tall); a tall board is drawn scaled down smoothly instead of at its 2 px-per-tile floor. That gives the dock about 40 px.
- `ui/CampaignHealth.css`: the title / number and the segments share one row; chips stay on their own row.
- `ui/MissionPanel.tsx` / `.css`: a field-mission panel drops its callout (the objective block above says it) and lays the progress text and lives side by side; under 400 px tall the thin progress bar also goes (the count is in the text).
- `ui/FieldGoal.tsx` / `.css`: while a door hold is showing, the notes ("stand still on it", "fights optional") give way to the bar and "STAY ON IT".
- Nothing else moved: safe-area insets already applied to the column (`env(safe-area-inset-*)`), `MissionDock` still measures against the action buttons on resize, text sizes (clamped to height) and the 44 px touch rules are unchanged; the dock is `pointer-events: none` and is checked not to overlap `.abtn`.

**Verification.** `scripts/hud-fit-check.mjs` (staged on the depot door after the three checkpoints, hold bar showing) at 667x375, 844x390, 915x412, 932x430 landscape and 390x844, 360x740, 430x932 portrait plus 1280x720 desktop: **0 px clipped, hold and lives present, no overlap with the controls at every size**. Regression test `e2e/mobile-hud-fit.spec.ts` (5 phone sizes) passes. Screenshots `docs/screenshots/mobile-hud-fit/` (`before-*` are the checkpoint state, where the clip was already visible; `after-*` are the door-hold state, the worst case).

Final visual checks: Admiralty Way continuous interlocking blocks distinct from the asphalt (`4-lekki-admiralty-*`); the selector's selected state is checked settled (colour asserted); Oshodi beacons and the door hold readable at 667x375 (`2-*`); the classic raid camera shows all corridors (`1-depot-maze-*`).
