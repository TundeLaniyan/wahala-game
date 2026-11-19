# Menu architecture: audit against the approved six-screen structure, and the integration plan

Created 2026-11-15. The founder approved the overall direction of the Gemini six-screen UI/UX package. The Gemini art
assets are **not in the repository**, so this pass audits the existing menus (`app/menu.ts`, `src/ui/menu/**`,
`src/ui/campaign/**`, `src/ui/Overlays.tsx`), makes only label-level changes (decision OB5) and plans the rest. Menu rules
in `CLAUDE.md` ("Stitch menu") still apply: no invented stats, ranks, currencies, shops, locks or online features.

## 1. Audit

| Target screen | Target contents | Today | Gap |
| --- | --- | --- | --- |
| **Home** | Play · Story Campaign · Learn to Play · Settings and Sound | Campaign · City Rumble · Classic Battle · Learn to Play (renamed from Training Academy) · Online (flag only) · Settings & Sound (renamed); quick-play card | City Rumble and Classic are separate Home rows instead of one **Play** row. "Campaign" vs "Story Campaign" label. |
| **Choose How to Play** | Quick Match · Classic Blast · City Rumble | `mode` screen exists for Rumble rulesets (Free-for-All, Team, Last Player Standing); Classic goes straight to Setup; the quick-play card on Home starts a quick match | No single chooser with the three styles; "Classic Battle" vs "Classic Blast" naming. |
| **Match Setup** | style · arena · opponent count · settings · Start Match | `setup` (arena + settings), `fighter`, `ready` (review) → Start Match | Covered across three screens; acceptable. Opponent count is in setup. |
| **Story Campaign** | current district · current mission · objective · Continue Story · saved progress | `campaign` map: district card, sections with objectives, Continue, progress bar and stars, difficulty, Workshop (Oshodi) | Covered. A compact "current mission + objective" header above the map would match the mock. |
| **Learn to Play** | existing Training Academy lessons | `academy` screen: beginner, combat, power, tricks, modes, Generator Tactics (pilot) | Covered. |
| **Pause** | Resume · Restart · Settings/Controls · Exit confirmation | Resume · Settings · Restart · Main menu (missions: Retry / Back to map; raids: Retry / Leave) | **No exit confirmation**: "Main menu" leaves at once. |

## 2. Done in this pass (low risk, tested)

- Home labels "Learn to Play" and "Settings & Sound" (test ids unchanged; no test asserted the old text).
- First-visit START TUTORIAL / SKIP TO MENU (decisions OB1-OB5) with Learn to Play still on Home.

## 3. Plan for the remaining integration (in order)

1. **Pause exit confirmation** (no art needed). Add a confirm step to `quit`, `mission-map` and `raid-leave` (a second
   panel "Leave this match? Progress in this match is lost." with Leave / Stay; Esc = Stay). Update the seven E2E specs
   that click `quit` (`arenas`, `audio` ×2, `game`, `menu`, `rumble`, `sudden-death-test`) to confirm. One commit, full
   browser suite.
2. **Play row + Choose How to Play** (no art needed). Replace the City Rumble and Classic rows on Home with one **Play**
   row opening a new `play` screen of three cards: Quick Match (the existing quick-play path), Classic Blast (→ `setup`
   with `play: 'classic'`), City Rumble (→ `mode`). Keep the old test ids on the new cards (`home-rumble`,
   `home-classic`, `quick-play`) or migrate specs in the same commit. Add the screen to `app/menu.ts`, `menuNav.ts` and
   the `e2e/menu.spec.ts` size sweep (portrait and landscape, 44 px targets).
3. **Naming decision** (founder): "Classic Battle" → "Classic Blast" and "Campaign" → "Story Campaign" everywhere a
   player sees them (menu, results, settings text). Text-only once approved.
4. **Visual integration** (needs the approved Gemini masters committed under `tools/ui/masters/`): extend
   `tools/ui/build_menu_art.py` to crop/clean them into `src/assets/ui/*.webp`; apply per screen in `flow.css` only.
   Never ship mock HUD numbers, currencies, ranks or brand marks from the mockups.
5. **W-AR branding** (needs approved art): replace `render/perf/brand.ts` (name, tagline, description, mark). The
   loading screen, menu note and first-visit card update from that one file.
6. **Story Campaign header**: a "current mission + objective" strip above the map from `nextMission()` (no new data).

Each step is one commit with its own tests; none needs a save or sim change.

## 4. Status (2026-11-19, branch `claude/wahala-ui-redesign-v1`)

Plan steps 1 (Pause exit confirmation), 2 (Play row and Choose How to Play), 3 (Classic Blast / Story campaign names) and 6
(Story Campaign current-mission strip) are implemented, plus the visual pass of step 4 from the existing assets (the Gemini
masters are still not in the repository). Step 5 (W-AR branding) stays open. See `docs/SIX_SCREEN_UI.md` and decisions SX1-SX10.
