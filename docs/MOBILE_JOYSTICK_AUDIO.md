# WAHALA! - mobile joystick and music-first audio

Branch `claude/wahala-mobile-joystick-audio`, started from `claude/wahala-nine-arenas-city-rumble` at `39af53b`.
Founder instruction of 2026-10-24, after testing the live preview on a real phone. Decisions M1-M9 are in
`DECISIONS.md`; audio details in `AUDIO.md`; verification in `IMPLEMENTATION_STATUS.md`. All nine arenas, City
Rumble, stage hazards, tutorials, the nine signature tracks, bots and the gameplay rules are unchanged.

## 1. Floating thumbstick (replaces the touch D-pad)

- **Activation zone:** the whole lower-left of the screen, from below the portraits down to the bottom edge and
  from the left edge to the action-button column (`.stick-zone`). On a landscape phone it is about half the
  screen width. A faint dashed "MOVE" ring shows where a thumb naturally rests; the thumb can land anywhere in
  the zone.
- **Floating origin:** the stick appears where the thumb lands and reads the drag relative to that point. The
  knob follows the thumb smoothly, clamped to the ring; dragging past 1.35 ring radii pulls the origin along, so
  changing direction is always a short flick, never a long trip back.
- **Grid movement only:** the stick only ever reports up, down, left, right or nothing. Dead zone 24% of the
  radius (a resting thumb never walks), release zone 16% (no flicker at the edge), hysteresis (another axis
  must be 1.35x stronger to take over; crossing the origin reverses at once) so a thumb drifting near a diagonal
  never zig-zags.
- **Same movement as the keyboard:** each direction goes to `InputManager.setTouchDir` and the existing MoveGate:
  one slide = exactly one legal tile, holding repeats at the player's own step cadence (speed upgrades
  included), collisions are the simulation's, lifting the thumb stops at once.
- **Multitouch:** one finger owns the stick; the other thumb places generators and uses the action buttons.
  Cancelled touches, lost pointer capture, rotation and resize release the stick.
- **Sizes:** radius 14% of the short side (44-72 px), so the same feel on a 320 px tall iPhone SE and a tablet.
  `touch-action: none` and no text selection or callout in the zone: it never scrolls the page.
- **How to Play** shows the floating thumbstick (zone, ring, knob, "THUMB ANYWHERE HERE") in the touch legend,
  and the move / vehicle-entrance captions describe sliding the thumb.

## 2. Phone readability (whole arena, still the fixed camera)

The standard-match camera is still the fixed whole-arena camera at the approved 42-degree three-quarter angle;
it never follows or zooms. On landscape phones (height <= 480 px) the action buttons now sit in one column at the
right edge (28% of the screen height wide: GENERATOR at the bottom, the contextual buttons stacked above), and
the camera's near-corner limit is derived from the same strip, so the board grows into the space the old fan of
buttons and the fixed D-pad used to reserve:

| Phone (landscape CSS px) | Board width on screen before -> after |
| --- | --- |
| iPhone SE 568 x 320 | 318 -> 368 px |
| iPhone 8 667 x 375 | 373 -> 433 px |
| iPhone 14 844 x 390 | 472 -> 590 px (height 211 -> 250 px) |
| iPhone Pro Max 932 x 430 | 520 -> 652 px |

Desktop and tablets are unchanged. The match clock is capped on short phones so it stays inside the 13% top band;
the thumbstick is see-through so the tiles under a thumb stay readable. City Rumble keeps its follow camera and
minimap.

## 3. Music-first audio

| Slider | Old default | New default |
| --- | --- | --- |
| Master | 80% | **85%** |
| Music | 45% | **90%** |
| Ambience & voices | 65% | **45%** |
| Effects | 85% | **50%** |

- No double boost: the earlier +2.5 dB music-bus lift was removed, so the louder music comes from the slider
  alone. Measured with ffmpeg on the nine shipped tracks (each levelled to -14 LUFS by its manifest gain): the
  music lands at about -16.8 LUFS after the master limiter, which takes about 0.9 dB off its peaks (1.6 dB at most);
  keeping the lift would have meant 1.6-2.5 dB of limiting and pumping. The music is about 1.5 dB louder than
  before and the effects 4.6 dB quieter: the music sits about 6 dB further forward.
- Explosions and hazard warnings stay audible: warnings follow the effects slider on a square-root curve (only
  1.6 dB below their old level), the music ducks deeper for warnings (to 0.5) and big blasts (to 0.45). A bug in
  the ducking (a blast during a spoken-line duck left the music at the shallower depth) is fixed with a regression
  test.
- Existing players: anyone who never moved a slider simply gets the new mix. A mix saved by the previous version
  is migrated once: if it still equals the old defaults it becomes the new mix; a mix the player chose is kept
  (its music slider converted so it sounds the same). **"Use recommended mix"** on the title screen and the pause
  menu restores the new mix in one press, whatever the browser had saved; it reads "Recommended mix ✓" while the
  mix is the recommended one.
- The nine signature tracks and the final-30-second escalation are unchanged; no music was downloaded or
  generated.

## 4. Screenshots (real game, Chromium, landscape phone viewports at 2x)

`docs/screenshots/mobile-joystick/`: for each of iPhone SE 568x320, iPhone 8 667x375, Android 740x360,
iPhone 14 844x390 and iPhone Pro Max 932x430, `<phone>-buttons.jpg` (every contextual button shown at once, so
the frame proves none of them sits on the board) and `<phone>-thumbstick.jpg` (a thumb holding the stick to the
right: the player has moved exactly one tile and shows through the see-through knob); plus
`iphone-14-city-rumble.jpg` (follow camera, minimap, compact survivor count, button column). Regenerate with
`node scripts/mobile-shots.mjs --url <preview url>`.

## 5. Tests

- `tests/input-joystick.test.ts` (17): activation anywhere in the zone at every phone size, four directions,
  dead zone, release zone, hysteresis near a diagonal, reversal, clamp and origin follow, single owning finger,
  taps; and with the real InputManager + simulation: one tile per flick in each direction, held repeats at the
  player's step cadence (and the faster cadence after a speed upgrade), diagonal wobble never zig-zags or skips,
  collisions with pillars and crates, a resting thumb never walks, placing a generator with another finger while
  walking, cancellation stops.
- `tests/render/camera.test.ts`: whole arena framed and clear of the button column at five phone sizes; the board
  fills more of an iPhone 14 screen.
- `tests/audio/prefs.test.ts`, `audioSettings.test.ts`, `engineMusic.test.ts`, `engine.test.ts`: new defaults
  for new players, persistence, migration of old defaults and of a chosen mix, the recommended-mix button,
  unity music bus (no double boost), warning curve, duck depths and the duck regression; the existing playlist,
  signature-track and final-30-second escalation tests still pass.
- Playwright (desktop + phone): thumbstick flicks from anywhere in the zone, hold and release, no page scroll,
  zone never reaches the buttons, multitouch generator placement, vehicle entry by thumbstick, How to Play
  showing the thumbstick, keyboard / touch device switching, the stick gone once the player is out, audio
  defaults, persistence, migration and the recommended-mix button on the title screen and the pause menu.

## 6. GitHub Pages

CI now publishes the preview from this branch, and only after the full check (typecheck, lint, unit tests,
build, Playwright desktop + phone) has passed on the pushed commit (`DEPLOYMENT.md`). First publish: CI green on
`0abf93b`, `gh-pages` commit `92c7e0b`, `build.json` = `0abf93b`, GitHub's Pages build succeeded. Check the live
build at https://tundelaniyan.github.io/wahala-game/build.json (not reachable from the build container).

## 7. Remaining limits

- Nobody has heard the new mix (no audio output in the build container); levels are measured, not judged by ear.
- The stick was tested with emulated touch and pointer events, not on a physical touch screen.
- Phone frame rate is unmeasured here (software WebGL); use `?fps` and `?q=low` on a real device.
