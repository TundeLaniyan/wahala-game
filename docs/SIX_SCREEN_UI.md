# Six-screen UI (Home, Choose How to Play, Match Setup, Story Campaign, Learn to Play, Pause / Exit)

Branch `claude/wahala-ui-redesign-v1`. Decisions SX1-SX10 in `docs/DECISIONS.md`. Visual source of truth: the approved Gemini
six-screen composite (reference copy kept by the founder; the cropped excerpts are not in the repository). Functional
authority: the navigation specification below, never the concept art's invented numbers or buttons.

## Navigation

```
Home ── PLAY ───────────► Choose How to Play ─ CITY RUMBLE (first, flagship) ──► Match Setup (City Rumble selected)
  │                          ├ QUICK START ─► loading ─► match (offline City Rumble Free-for-All: 16 fighters, Rookie bots, 3:00, Ojuelegba; FU2-1)
  │                          └ CLASSIC BLAST ─────────────► Match Setup (Junction Blast selected)
  │                                    Match Setup ── START MATCH ─► loading ─► match
  │                                               └ Review ─► Fighter ─► Ready (Edit rows) ─► Start
  ├ STORY CAMPAIGN / CONTINUE STORY ─► Story campaign (current mission strip, map, Continue story)
  ├ LEARN TO PLAY ─► sections ─► lessons (the existing Academy) ; Advanced Training: Sudden Death Test
  └ Settings · Sound · Music Data Saver (small buttons; the saver is the Settings > Audio preference, FU2-6)
In a match: Esc / Pause ─► Resume · Restart · Controls · Settings & Sound · EXIT MATCH ─► "Leave this match?" ─► KEEP PLAYING | EXIT MATCH
```

## Design reference mapping

| Gemini screen | Implemented as | Fidelity notes |
| --- | --- | --- |
| 1 Main Menu | `HomeScreen` + `redesign.css`: gold PLAY, dark STORY CAMPAIGN, orange LEARN TO PLAY, settings and sound icons bottom-left, three fighters flanking | The concept's Lekki Bridge dusk painting with the heroes composited in is **not in the repository**. The existing Lagos key art is washed with a dusk gradient and the three approved fighter portraits (rectangular, edge-faded) stand in. |
| 2 Choose How to Play | `PlayScreen`: three cards in the order City Rumble (widest, gold-framed), Quick Start (teal, "START HERE"), Junction Blast (plain); FU2-4 | Card pictures are real arena previews and the selected fighter's portrait, not the concept's illustrated icons. |
| 3 Match Setup | `SetupScreen`: Battle style, arena cards, opponents, difficulty slider, rules, fighter chip, START MATCH | Concept shows "Lives 3 / Time 3:00" for every mode; real rules differ per mode, so the real, per-mode controls are shown. |
| 4 Story Campaign | `CampaignMap` + the current-mission strip | The concept's "Mission 3 / Osodi Under-bridge / 15%" are placeholders; the strip shows the real next mission. Replay Missions / Explore District map onto the existing map selection and section list. |
| 5 Learn to Play | `AcademyScreen`: section rail + lesson list | The concept's virtual-joystick illustration is not rebuilt (the Academy lessons themselves teach the controls); not a duplicated simulation. |
| 6 Pause / Exit | `PauseOverlay` + `ExitConfirm` | "Unsaved progress will be lost" is reworded per match kind (campaign: only cleared missions are saved). |

## Missing artwork and dependencies

- Final Lekki-bridge hero key art with the three characters (transparent cut-outs): **not supplied**. Drop approved masters into
  `tools/ui/masters/` and extend `tools/ui/build_menu_art.py`; only `redesign.css` (`.mn-home-heroes`, `.mn-backdrop.hero`) changes.
- Per-card Quick Match / Classic / Rumble illustrations: arena previews are used.
- W-AR branding: not integrated (decision SX10); `render/perf/brand.ts` stays the single place to replace it.

## Testing

- Unit: `tests/app/quickMatch.test.ts`, `tests/ui/academyModel.test.ts`, `tests/ui/currentMission.test.ts`, and the updated
  `tests/ui/menuScreens.test.ts`, `tests/app/menu*.test.ts`.
- Browser: `e2e/six-screen-ui.spec.ts` (Home navigation, the three choices at 844x390 / 740x360 / desktop, Quick Start
  (a City Rumble Free-for-All), duplicate starts, Classic and City Rumble setup, Campaign Continue and saved progress, Academy, Pause / Exit,
  portrait); `e2e/menu.spec.ts`, `onboarding`, `match-loading`, `rumble`, `academy-tactics` and the helpers carry the new route.
- Review screenshots: `scripts/menu-shots.mjs` and the `six-*` shots written by the spec.
