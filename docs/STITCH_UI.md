# Stitch menu: the WAHALA! game interface

Branch `claude/wahala-stitch-uiux-v1` (from `claude/wahala-gameplay-rumble-v2` at `cd502b8`). The founder-approved
Google Stitch direction ("Lagos Generator Wars UI": midnight gunmetal, Danfo amber, generator green, hazard red;
Bebas Neue + Space Grotesk; square panels, chamfered buttons) turned into the game's real, working menu.
Presentation only: no simulation, AI, arena, camera or collision rule changed. Decisions: `DECISIONS.md` UI1-UI11.

The Stitch export is a design reference, not code: its fake network / grid telemetry, accounts, PvP, rewards,
numeric fighter ratings, locked fighters and electrical powers were not built. Every word on screen about a mode,
arena or fighter comes from the game's own data (`src/sim` registries and config, `src/tutorial` lessons).

## Mobile-first flow (branch `claude/uiux-adaptive-performance-v1`, decisions UX1-UX6)

The first version was a four-step wizard with a numbered strip. It is now: **Home -> Select game mode (tap) ->
Arena & settings -> Fighter -> Review -> Start Match**. No step numbers, no "Continue to setup": tapping a mode
opens the arena and settings at once. Classic Battle on Home goes straight to them (the mode is implied).

- **Arena & settings** (`SetupScreen.tsx`): "Select Arena" first (`ArenaPicker.tsx`: picture cards, chosen one marked
  Selected and described, hazards in a disclosure), then Opponents (fighters, bot difficulty) and Match rules (only
  the chosen mode's: length, friendly fire, blast shape, crowd throws; Wahala Crush and floor traps stay facts).
- **Bot difficulty** (`DifficultyControl.tsx`): one slider over the seven levels, "Very easy" to "Extremely hard",
  the level named and explained; "Same for all bots" / "Mixed roster" (Rumble) or "Set each bot" (Classic) with a
  plain sentence saying who plays at which level. Native range input: touch drag and tap, arrow keys, gamepad D-pad,
  screen-reader value text.
- **Fighter** (`FighterScreen.tsx`): selected card first (portrait, name, one-line description, melee / cooldown /
  vehicle from the sim data), abilities, roster strip; one screen at every size from 360x740 to 1440x900.
- **Review** (`ReadyScreen.tsx`): mode, arena, fighter, opponents, bot level, each with Edit; "Start Match".
  Editing the arena or settings returns with "Back to review".

Navigation is still the pure state machine in `app/menu.ts` (the `arena` screen was removed: it is part of the
setup now). Layouts for the screens above live in `src/ui/menu/flow.css` (loaded after `menu.css`).

## Screens

| Screen | Stitch reference | What it does | Main test ids |
| --- | --- | --- | --- |
| Home | `wahala_aaa_console_title_main_menu_1`, mobile home (portrait + landscape) | Logo over the Lagos key art; City Rumble (flagship), Classic Battle, Training Academy, Settings; your fighter + last setup with **Quick play** and **Review**; mute and settings shortcuts | `menu-home`, `home-rumble`, `home-classic`, `home-academy`, `home-settings`, `quick-play`, `quick-review`, `home-mute`, `setup-summary` |
| Game mode | `wahala_aaa_mode_selection_2` | Survival, Deathmatch, Team Rumble, Classic Battle as large cards with real stage previews and facts; a tap opens the arena and settings | `menu-mode`, `mode-survival` / `-deathmatch` / `-team` / `-classic` |
| Arena & settings | `wahala_match_setup`, mobile setup (portrait + landscape) | "Select Arena" cards, then Opponents and Match rules, only the chosen mode's options: Rumble fighters (team splits in Team Rumble), length (timed modes), friendly fire (Team Rumble), blast shape, bot difficulty slider with same / mixed roster; Classic fighters 2-4, same-for-all or per-bot levels, crowd throws, Wahala Crush (always on), floor-trap note | `rumble-setup` / `classic-setup`, `setup-arena`, `rumble-stage-<id>`, `arena-<id>`, `arena-selected`, `arena-detail`, `arena-rule`, `rumble-8..32`, `minutes-5/10`, `ff-on/off`, `blast-*`, `diff-slider`, `bots-same`, `mixed-roster`, `diff-bot-N`, `level-hint`, `players-2..4`, `toggle-crowd`, `crush-badge`, `traps-note`, `menu-continue` |
| Fighter | `wahala_aaa_character_select_screen_1`, mobile fighter (portrait + landscape) | Selected card first (portrait, name, one-line description, melee / cooldown / vehicle from the sim data), abilities, roster from `CHARACTER_IDS` (new fighters appear automatically) | `menu-fighter`, `char-<id>`, `fighter-name`, `fighter-tagline`, `fighter-stats`, `fighter-skill`, `fighter-vehicle` |
| Ready | `wahala_match_setup_ready_to_deploy` | Mode, arena, fighter, opponents, bot level (says whether all bots or a mixed roster), match rules, each with **Edit**; **Start Match** (one launch, waits for the 3D assets) | `menu-ready`, `edit-mode/arena/fighter/setup/bots`, `ready-*`, `start-button` |
| Settings | `wahala_aaa_game_settings` | Audio / Graphics / Controls / Accessibility tabs; Restore defaults; Save & close (changes save instantly) | `menu-settings`, `settings-tab-*`, `audio-*`, `toggle-mute`, `toggle-voices`, `toggle-subtitles`, `audio-reset`, `quality-*`, `camera-*`, `touch-*`, `subtitles-*`, `shake-*`, `toggle-narration`, `settings-restore`, `settings-close` |
| Training Academy | `wahala_training_academy` | Real lessons grouped Beginner / Advanced, progress on this device, Continue / Start / Train again, replay any lesson, Reset progress; each lesson is the existing playable tutorial | `menu-academy`, `academy-continue`, `academy-lesson-<id>`, `academy-reset` |
| Pause | `wahala_in_game_pause_overlay` | Resume, Settings (match stays paused), Restart, Main menu; live match summary | `pause-overlay`, `resume`, `pause-settings-open`, `pause-settings`, `pause-settings-close`, `restart`, `quit` |
| Results | `wahala_post_match_results_screen` | Victory / Defeat / Draw from the real result, eliminations and standings (Rumble leaderboards and team scores; Classic winner + eliminations), Rematch, Change setup (-> Ready), Main menu | `results`, `result-title`, `standings`, `rumble-results`, `rematch`, `to-title`, `results-home` |

## Architecture

- `src/app/menu.ts` - pure navigation state machine (`MenuState.stack`): `openScreen`, `back`, `advance`,
  `editScreen`, `menuAt`. Flow: mode -> setup -> fighter -> ready; a screen opened with Edit from Ready returns to Ready. Unit-tested (`tests/app/menu.test.ts`).
- `UiState.menu` (store) holds it; `commands.menuOpen / menuBack / menuContinue / menuEdit / menuHome` apply it
  with the menu sounds; `commands.toTitle(path)` lands on a given menu screen after a match.
- `src/app/menuNav.ts` - the showing menu (main menu, pause, results) gets keyboard / gamepad menu commands before
  the match (`session.ts` `onNav`). `src/ui/menu/focusNav.ts` turns them into spatial focus moves, presses and
  slider steps.
- Settings: `GameSettings` (`app/settings.ts`, `sanitizeSettings`, `PREFERENCE_KEYS` / `preferenceDefaults`) and the
  separate persistent audio prefs (`audio/prefs.ts`) - both written live, both persisted by their own stores.
- `src/ui/menu/` - one module per screen plus `Frame.tsx` (screen frame, buttons, options, toggles, fields),
  `arenaInfo.ts`, `fighters.ts`, `art.ts`, `FighterImage.tsx` and the design system `menu.css`.
- `src/ui/Overlays.tsx` - pause, results and rotate overlays in the same design system.

## Artwork

`tools/ui/build_menu_art.py` (Pillow only, deterministic) builds `src/assets/ui/*.webp` from the masters in
`tools/ui/masters/` (the Stitch PNG exports, re-saved as quality-95 JPEG):

- key art 768 / 1376 px wide (33 / 83 KB); fighter portraits 360 / 720 px wide (35-120 KB), loaded with `srcset`;
- the Campus Queen export had a mock fighting-game HUD baked in (level badges, "VS", a tagline): cropped;
- real-world brand marks are blended out (telecom, bank and beer signs in the key art; sportswear and league
  marks on the Street Baller kit), so the build ships no third-party trademarks;
- the portraits are concept art for the menus (the Fighter screen says so); in a match every fighter is its
  3D model. If an image fails, the rendered in-game bust is shown instead.

Re-run `python3 tools/ui/build_menu_art.py` after changing a master or a rule and commit the outputs.

## Responsive layouts

One set of components, three compositions in `menu.css`:

- desktop / laptop (1440 x 900, 1280 x 720): split panes, four mode cards side by side, everything without scrolling;
- phone landscape (<= 520 px tall: 844 x 390, 667 x 375, 915 x 412): compact top bar, horizontal mode strip,
  two-column setup / fighter / arena / ready, menus fit without page scroll;
- phone portrait (<= 700 px wide: 390 x 844): stacked layouts, full-width main action at the bottom, roster as a
  three-column grid, arena preview first.

Safe-area insets pad every edge; every button is >= 44 px tall; the menu root is `overflow: clip`. Combat still
asks for landscape, but the pause menu shows above the rotate notice (which has a Pause button).

## Verification

- Unit: `tests/app/menu.test.ts`, `tests/app/settingsSanitize.test.ts`, `tests/ui/menuScreens.test.ts`,
  `tests/ui/focusNav.test.ts`, plus the existing suites.
- Browser: `e2e/menu.spec.ts` (full journey with Edit returns and the launched match checked against every choice,
  the difficulty slider (touch, keyboard, persistence), the one-screen fighter check at eight sizes, keyboard, gamepad, broken-save repair, results actions, the responsive sweep at six sizes: 1440 x 900, 1280 x 720, 390 x 844, 844 x 390, 667 x 375, 915 x 412); every existing spec
  now walks the new journey (`e2e/helpers.ts`: `toClassicSetup`, `toRumbleSetup`, `chooseArena`, `launch`,
  `openSettings`, `pauseSettings`).
- Screenshots: `scripts/menu-shots.mjs` walks every screen, pause and results at the five release viewports; a
  selection is in `docs/screenshots/stitch-ui/`.

## Known limitations

- Frame rate on physical phones was not measured (only software-rendered Chromium was available).
- The live 3D attract demo no longer plays behind the menu (`?attract` brings it back for experiments).
- The Stitch export had no separate designs for the phone Settings / Arena / Academy / Pause / Results screens;
  they follow the same system responsively.
