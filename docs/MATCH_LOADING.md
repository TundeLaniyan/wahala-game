# Match loading and orientation feedback

Part of the integrated release (`claude/wahala-integrated-release-v1`); decisions ML1-ML8 in `docs/DECISIONS.md`.

## The problem (investigated)

Before this change, Play / Start Match / Rematch / a campaign mission ran the whole match set-up inside the tap handler:
`commands.start` -> `MatchController.start` -> `createGame` + `renderer.loadGame` (board, fighters, props, lights, every
material) and then the first rendered frame compiled its shaders. All of it is synchronous, so the browser could not
paint anything until it was done: on a phone the menu simply sat there for several seconds after the tap, and a second
tap could queue a second start. Quick play and Start Match were also disabled ("Loading...") while the boot model preload
ran, which on a slow connection looked like a dead button. The rotate-phone notice only appeared once the match was on
screen.

## The lifecycle (`src/app/matchLoader.ts`)

Every way into a match goes through `MatchLoader.run(kind, start, back)`:

| Phase | What happens | Shown |
| --- | --- | --- |
| `starting` | The tap is taken; the loading screen is published and the loader waits for it to paint (two animation frames, a 250 ms timer fallback for a throttled tab). | "Getting ready..." |
| `assets` | Only if the boot model preload is still running: the real model count, refreshed four times a second. After 20 s the match starts anyway (every model has a drawn fallback). | "Loading fighters and vehicles 8 / 31" |
| `arena` | One more paint, then the synchronous set-up (`createGame` + scene build). An exception here is a failure. | "Building the arena..." |
| `scene` | The new match is held (no simulation time passes) until the renderer has drawn 2 frames of it, at most 12 s. Then the hold is released and the screen removed. | "Almost there..." |
| `failed` | The reason, **Retry** (the same start again) and **Back** (to the menu, or the campaign map for a mission / raid). | "The match did not start" |

There is no progress bar and no invented percentage: the only number is the real model count.

## Where it applies

| Entry | Kind | Back goes to |
| --- | --- | --- |
| Home > Quick play, Ready > Start Match (any mode, any arena, City Rumble included) | `match` | title menu |
| End screen Rematch, pause menu Restart | `rematch` | title menu |
| Campaign field mission (start, retry) | `mission` | campaign map |
| Campaign raid | `raid` | campaign map |

Not wrapped, on purpose: resuming from Pause (no set-up runs, the match is already drawn), returning from a raid to its
field mission (`resumeField`, a synchronous hand-back the campaign logic depends on), the Training Academy and the title
attract match (their own controllers, no player tap to acknowledge).

## Orientation

On a phone held upright the loading screen leads with the turn-sideways instruction, with the loading line under it,
so both are visible and there is never a second overlay stacked on top (the ordinary rotate notice is suppressed while
the loading screen is up). Once the match is on screen the ordinary rotate notice takes over until the phone is turned.

## Taps, audio, safety

- One run at a time: a Play / Start / Rematch tap while a start is in flight, or while the failure screen is up, starts
  nothing (no second session). Quick play is no longer disabled during the boot preload; the loader shows the real count
  instead.
- Mobile audio is still unlocked synchronously inside the tap (the gesture is required); the loader never waits on audio,
  so an audio context that will not resume cannot stall the start.
- The hold starts with the tap (a field mission whose door asked for a raid stops behind the loading screen) and stays
  under a failure screen until Retry, Back or leaving. It only stops the controller from stepping the simulation; nothing in `src/sim` knows about it. On release the
  frame clock is reset, so the countdown does not jump by the time spent loading.
- The screen can never outlive the start: it is removed after the first frames or after 12 s, whichever comes first,
  and leaving for the menu clears a failure screen.
- The respawn fix (`campaign-respawn-freeze`) is untouched: the loader only wraps the start call.

## Debug flags (`?debug` only)

- `&loaddelay=ms` keeps the loading screen up `ms` longer before building (to see and test a slow start).
- `&loadfail=n` makes the first `n` starts throw (to test the failure screen).
- `window.__WAHALA__.matchLoad()` returns `{ state, starts }`.

## Tests

- `tests/app/match-loader.test.ts` (fake paint, time and frames): nothing heavy before the screen paints; rapid taps start
  one session; slow model loading shows the real count and stops waiting after the limit; settled models continue at
  once; failure -> Retry / Back; a first frame that never comes still removes the screen; `clear()`; titles.
- `e2e/match-loading.spec.ts` (real browser): three rapid Quick play taps -> one match, playable, no screen left over it;
  a slow start shows a real step and the menu is gone at once; an upright phone shows the turn-sideways instruction and
  the loading line together, then the ordinary rotate notice, then the match when turned; a forced failure -> Back to the
  menu, Retry -> playable; every `.glb` download aborted -> drawn fallbacks and the match still starts.
- Browser specs wait for a start with `inMatch(page)` (`e2e/helpers.ts`): the build used to run inside the click, so a
  15 s HUD wait came after it; now it runs after the click returns, and the helper's wait covers a whole start.
