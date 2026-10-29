# Adaptive graphics and runtime performance

Branch `claude/uiux-adaptive-performance-v1` (from `15466fc`). Presentation only: no simulation, AI, input,
collision, blast, timing or match rule changed, and none of the code below may import or alter them. Decisions:
`DECISIONS.md` PF1-PF10.

## What the player sees

- **Settings > Graphics:** `Auto` (default) and six fixed levels: Very Low, Low, Medium-Low, Medium, Medium-High,
  High. The screen always says what is in use ("Now using Medium-Low  Auto" or "... (set by you)").
- **Auto** starts from a guess about the device, then follows measured frame times, one step at a time.
- **A manual level is never changed** by performance.
- In a match, when Auto moves quality a short notice appears in the HUD rail (top-left, under the portraits, never
  over the board): "Graphics reduced for smoother performance", "Graphics increased" or "Performance mode: Very
  Low". At most one per 25 s and three per match (`app/qualityNotice.ts`). Settings shows the level at any time.
- `?fps` adds the level, render scale and where the frame goes: `sim`, `ai` (per tick) and `render` in ms.

## Architecture

```
capabilities.ts  --first guess-->  AdaptiveQuality  --rung-->  GameRenderer.applyQuality()  -->  live knobs
 (WebGL probe, memory,            (adaptive.ts: window,         (profileFor(rung))               (pixel ratio, shadows,
  cores, screen, dpr)              thresholds, hysteresis)                                         particles, crowd, ...)
learned.ts  <-- rung that worked on this device (localStorage, optional)
```

| File | Role |
| --- | --- |
| `src/render/quality.ts` | The ladder: 8 rungs (`Very Low`, `Very Low+`, `Low`, `Low+`, `Medium-Low`, `Medium`, `Medium-High`, `High`), each a full budget profile. Manual presets are named anchors on it. Pure data; every budget is non-decreasing up the ladder (tested), so "down" always means cheaper. `QUALITY` keeps one profile per coarse tier (`veryLow / low / medium / high`) for the environment and art budgets. |
| `src/render/perf/capabilities.ts` | `detectCapabilities` (throwaway WebGL probe, `deviceMemory`, `hardwareConcurrency`, screen, DPR, touch) and `estimateRung`. Pure and fed through an injectable environment; every field may be missing or throw. |
| `src/render/perf/adaptive.ts` | `AdaptiveQuality`: the controller. Clock-free (`frame(dt, now)`), so it is tested on a virtual clock. |
| `src/render/perf/learned.ts` | Remembers the rung Auto settled on, per device fingerprint, 30 days. Separate from the game settings (it is a measurement, not a preference; "Restore defaults" leaves it). |
| `src/render/GameRenderer.ts` | Owns the controller, measures the wall-clock gap between renders, applies rungs, exposes `qualityStatus()` and the debug seam. |
| `src/app/qualityNotice.ts` | Wording and rate limit of the notice. |
| `src/app/sectionTimers.ts` | Smoothed ms per frame for sim / ai / render (measuring only). |

### The ladder

| Rung | Name | Pixel ratio cap | Shadows | Particles | Crowd | Flame lights | Street life | Anim. stride |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Very Low (preset) | 0.60 | off | 0.20 | 30 | 0 | 2 | 3 |
| 1 | Very Low+ | 0.80 | off | 0.30 | 48 | 0 | 3 | 3 |
| 2 | Low (preset) | 1.00 | off | 0.40 | 70 | 0 | 4 | 2 |
| 3 | Low+ | 1.15 | off | 0.50 | 90 | 0 | 6 | 2 |
| 4 | Medium-Low (preset) | 1.25 | 512 | 0.60 | 105 | 0 | 8 | 2 |
| 5 | Medium (preset) | 1.50 | 1024 | 0.75 | 130 | 1 | 10 | 1 |
| 6 | Medium-High (preset) | 1.75 | 1024 | 0.88 | 180 | 2 | 13 | 1 |
| 7 | High (preset) | 2.00 | 2048 | 1.00 | 230 | 3 | 16 | 1 |

The order of what is given up follows cost: pixels first (render scale: the pixel-ratio cap is the "dynamic render
scale", moved in 0.1 to 0.25 steps), then the shadow pass and its map size, flame lights, particles, crowd and
background people, atmosphere emission, and finally how often background animation updates (`animationStride`).
The manual presets are rungs 0, 2, 4, 5, 6, 7; Auto also uses the half-steps.

### Live knobs and built knobs

Changing a rung must never hitch, so the knobs are split:

- **Live** (applied to the running match, no rebuild): pixel ratio, shadows on/off and map size (materials are
  recompiled only when the shadow pass flips), particle density, crowd share (`Crowd.setShare`: evenly spread
  stands, instance counts shrink), street-life share (`StreetLife.setShare`: the most important scenes stay),
  atmosphere emission (`AmbientFx.setScale`), animation stride for the crowd, street life, atmosphere and the
  living environment (the time of skipped frames is passed on, so motion stays smooth), and, only when the coarse
  tier changes, the living environment's traffic / crowd / lights (an existing rebuild).
- **Built** (decided when the arena is built, so they apply from the next match): particle pool sizes, parked
  buses, flame lights, street-life and crowd counts built, set content, and **antialiasing**, which is a WebGL
  context attribute and cannot change in a session. Live knobs only thin what was built. Auto therefore builds
  each match from the rung it is on at the start (and the rung is remembered per device, so the next match or
  visit builds at the level that worked).

Not present in this renderer (so nothing to scale): post-processing and bloom (grading is a tone-mapping shader),
reflections beyond one static sky environment map, a texture-size ladder (textures are small procedural / baked
sets). LOD by distance exists for the City Rumble follow camera (`inView`) and is unchanged.

### First guess (hints only)

`estimateRung` (tests: `tests/render/capabilities.test.ts`):

1. GPU class from the unmasked renderer string: software renderers (SwiftShader, llvmpipe) -> rung 0 and a ceiling
   of 2; Mali-T/400 and old Adreno / PowerVR -> 0-1; Mali-G3x/G5x and Adreno 610 -> 1-2; mid Mali-G / Adreno 6xx ->
   3-5; Adreno 7xx -> 6; Apple GPU -> 5 on phones, 7 on desktops; NVIDIA / modern AMD / Iris Xe / Arc -> 7; Intel
   HD / UHD -> 4. Unknown or hidden string: **3 on mobile, 5 on desktop**.
2. Caps: `deviceMemory` <= 1 GB -> 0, <= 2 -> 1 (and a lower ceiling), <= 3 -> 3, <= 4 on mobile -> 4; <= 2 cores ->
   2, <= 4 cores on mobile -> 4; WebGL 1 only -> 3; max texture < 4096 -> 2; one rung off screens above ~5 MPx.
3. If this device was measured before (same fingerprint, under 30 days), Auto starts from that rung instead.

**Fallbacks:** no WebGL probe, a blocked probe, masked renderer, no `deviceMemory` (Safari, Firefox), no
`hardwareConcurrency`, no `matchMedia`, unreadable `localStorage` (private mode) all degrade to the safe starting
rung above; the game still runs and Auto still measures. If measurement is impossible (a tab that never renders,
fewer than 5 frames in a window) the rung simply stays where it started.

### The controller

All numbers in `DEFAULT_ADAPTIVE` (`adaptive.ts`), tested in `tests/render/adaptive-quality.test.ts`:

- A rolling **4 s window** of frame times; decisions use its **median**, **p90** and **spike count** (> 80 ms), never
  one frame. Warm-up (4 s), loading and fast-forward are not sampled; a gap over 2.5 s (background tab, sleep)
  restarts the window instead of counting as a slow frame; paused matches are not sampled.
- **Down:** median below 45 fps held for 3 s (or below 24 fps held 1.5 s: two rungs at once, "severe"), or
  repeated frame spikes ("hitching"); at least 8 s since the last change; a normal drop waits up to 6 s for an
  explosion burst to pass, a severe one does not.
- **Up:** p90 at or above 55 fps (comfortable headroom: even the slowest tenth of frames makes the target) held for
  15 s and at least 30 s since the last change; one rung at a time.
- **Hysteresis:** the dead band between 45 fps median and 55 fps p90 does nothing; after every change the window
  is emptied and sampling pauses 3 s.
- **No ping-pong:** a rung that was just raised to and dropped within 60 s is blocked from going up for 90 s, then
  180 s, 360 s ... (cap 15 min).
- **Futile drops:** if two drops in a row do not make frames at least 8 % faster (a 30 Hz display or power-saver
  cap, a CPU-bound device), the descent stops, the quality it took away is restored, and Auto pauses 2 min, doubling
  each time it recurs. A device that cannot be helped by lower graphics is left alone.
- Devices at 1-2 fps still get decisions (a window needs only 5 frames).

### Where the frame goes (non-graphics)

Measured, not assumed (`scripts/simulate.ts`, CPU time of this development machine; a phone is several times
slower):

| Case | Sim + all bots per tick | Notes |
| --- | --- | --- |
| Classic, 4 players, Expert | avg 0.17 ms, p99 1.7 ms | negligible |
| City Rumble Survival, 32 fighters, Nightmare | avg 1.9 ms, p50 1.2, **p99 10 ms**, max 117 ms | the one place the CPU matters |

Bot decisions are about 140 us each at 32 fighters. On a slow phone a 32-fighter Rumble can be CPU-bound in the sim,
not the GPU: Auto's futility check then leaves graphics alone. **Reducing bot think rate, collision work or debris
simulation would change gameplay or determinism, so it was deliberately not done**; it needs a founder decision (see
"Follow-up"). `?fps` shows `sim`, `ai` and `render` ms on a real device to settle it.

Audio was inspected: one-shot voices are capped at 24 with priorities (`audio/voices.ts`), background Pidgin
conversations are one line at a time every 7-15 s (`pidgin.ts`), looping beds are three. That is already bounded,
so no audio shedding was added and no gameplay cue or voice line was touched.

## Measuring and testing

- Unit: `tests/render/quality-ladder.test.ts` (ladder invariants), `capabilities.test.ts` (probe and estimate
  fallbacks, learned-rung persistence), `adaptive-quality.test.ts` (thresholds, hysteresis, cooldowns, backoff,
  futility, suspend / stall / reset, 1 fps devices), `tests/app/qualityNotice.test.ts`, `settingsSanitize.test.ts`
  (Auto default, presets persist, legacy values load).
- Browser: `e2e/quality.spec.ts` (Auto default, software renderer recognised, manual persists, Auto down and up with
  the notice, isolated slow frames ignored, manual never changed, notice clear of the board, identical simulation at
  every quality). The e2e feeds synthetic frames on a virtual clock through `__WAHALA__.feedFrames(ms, count)`;
  `__WAHALA__.quality()` returns the status.
- Cost per rung: `node scripts/quality-bench.mjs classic|rumble desktop|mobile` (needs `vite preview`). In the
  software-rendered Chromium of the container (1280x720, Classic) the order is what counts: draw calls 193 / 207 /
  389 / 408 / 440 / 442 and triangles 378k / 464k / 1.0M / 1.1M / 1.3M / 1.35M from Very Low to High; render time
  rises with it (about 1.2 s to 2.7 s per frame in software).

## Known limits

- Real phones were not measured (only software-rendered Chromium was available): thresholds are conservative
  starting values; `?fps` and `quality()` exist to tune them on devices.
- Antialiasing cannot change mid-session (WebGL limitation); it follows the rung at start-up. Switching a manual
  preset up from Very Low to High in a session keeps the no-MSAA context.
- A rung raised mid-match thins/restores only what was built; content that is built per match (parked buses, set
  content, flame lights, pool sizes) catches up at the next match.
- Fixed-rate (30 Hz) displays and iOS Low Power Mode look like slow devices; the futility check prevents Auto from
  needlessly flattening the graphics there.
