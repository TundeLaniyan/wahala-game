# Online City Rumble: local movement prediction (decisions ON4-ON5)

Branch `claude/wahala-online-p` (from `claude/wahala-online-integration`). Code: `src/net/client/prediction/`, the driver hook in
`src/net/client/driver.ts`. Tests: `tests/net/prediction.test.ts`, `tests/net/prediction-latency.test.ts`,
`tests/net/prediction-latency-heavy.test.ts` (skipped unless `WAHALA_NET_HEAVY=1`). Report: `npx tsx scripts/net-latency-report.ts`.

## 1. Goal and boundaries
Online, the local fighter's step used to appear only after uplink + server tick wait + send batching + downlink + the
replica's jitter buffer (measured 191-457 ms in docs/CITY_RUMBLE_ONLINE.md section 7.3). Prediction draws the LOCAL fighter's
WALKING ahead, at the moment the server will apply an input sent now, and corrects it smoothly when the server disagrees.

It is presentation only (founder boundary, docs/ONLINE_INTEGRATION.md section 1):
- it changes where the local fighter is DRAWN: `x`, `y`, `facing`, `stepFromX`, `stepFromY`, `stepRemaining`, `stepTotal` of
  the replica's local Player, and nothing else;
- it never creates or implies a generator, hit, pickup, elimination, score or result; it is never sent (the wire input is still
  `{s, m, h, b}`, byte-identical with prediction on or off); the HUD scores, kill feed and results read fields it never touches;
- the replica's authoritative data is never changed in a way that survives into the next `replica.advance` (section 3);
- other fighters, generators, flames, blasts and vehicles are not predicted: the server's view of them is shown as before.

## 2. Design in ten lines
1. Every frame starts from the replica's AUTHORITATIVE local player (tick R): errors cannot accumulate.
2. Each sent input is tagged when sent with the server tick it will arrive at, from the existing ping / pong (`PongMsg.t` is the
   server tick when the ping was handled, the same moment an input sent then is handled; median of 5, plus a small bias learned
   from "probes": a press from rest whose authoritative step start is later seen in the replica). No protocol change.
3. The inputs the server has not applied by R are replayed tick by tick through a model of the server's press latch
   (`RumbleMatch.input` / `intentsForTick`: held direction, a new press kept until it steps or 24 ticks pass).
4. The replay calls the sim's OWN `updateMovement` (and `armTeleports`) on a private view: a shallow copy of the state with
   `players: [deep copy of the local player]` and copied generators (contact abilities mutate generators).
5. The fighter is drawn at the moment an input sent now reaches the server (`arrival(now)`), capped at 40 ticks ahead of R and
   slewed (at most 1.5x / 0.5x real time) so the look-ahead never jumps or oscillates.
6. Moves the client cannot foresee hold the prediction (draw the server's position): an oil slide, a manhole trip, a vehicle
   entrance, inverted controls, the SUDDEN DEATH title card, a daze / knockdown, an attack's planted wind-up; dead, countdown,
   match over and "no clock yet" switch it off.
7. A change of belief is measured at the moment shown last frame (old drawn point minus what the new path says about that
   moment), so motion and new presses never count as errors; <= 0.55 tile blends out (120 ms), more snaps.
8. Evidence beats the estimate: a server step the latch model cannot explain credits the first matching press estimated just
   after it (it really arrived earlier), so a one-tick estimate error never shows a step too many.
9. The result is encoded into the seven step fields so the real renderer (`playerGridPos`), at this frame's alpha, draws
   exactly the predicted point; the logical tile is the predicted tile.
10. The driver applies it as an in-place overlay with a strict revert / advance / apply protocol (section 3).

## 3. The overlay protocol (why in place, why it cannot leak)
`MatchController`, the renderer and the kill feed key off the `GameState` object returned by `driver.state()` (a new object per
frame would reset the kill feed), so the prediction is an in-place overlay on the replica's local Player
(`prediction/overlay.ts`). `NetMatchDriver.advance` runs, every frame:

| step | what | what it guarantees |
| --- | --- | --- |
| (a) `overlay.revert()` | the seven saved authoritative values are written back | the replica is purely authoritative again |
| (b) `replica.advance(dt)` | the server's frames: shared counter `predict`, `applyPatch`, the canonical hash check every 120 ticks | patches and hash checks never see a predicted value |
| (c) `predictor.update(...)`, `overlay.apply(...)` | the new authoritative values are saved, the prediction written | the controller draws the prediction until the next (a) |

Also reverted: before a keyframe replaces the state, before a new match's replica, on `dispose()`. `driver.readAuthoritative(fn)`
runs `fn` on the authoritative values (overlay off, then put back): anything that hashes or reports the replica (for example a
final-state check against the server's results) must read through it.

Leak checks: with `verifyOverlay: true` (tests, and available for `?debug`), `revert()` hashes the whole local player and throws
`OverlayLeakError` unless it is bit-identical to the copy taken before `apply()` (any outside write to the overlaid player is
caught too). Tests prove, on every frame of a 900-frame match, that the authoritative replica hashes exactly as the server mirror
at the same tick; that the drawn player differs from the authoritative one in the seven step fields only; and, as a control, that
an overlay left in place while frames are applied IS caught by the replica's own hash check.

Why not a separate drawn copy: the controller holds the state object it gets from `driver.state()`; a second object for drawing
would need a controller change (the kill feed, the entry controller, the camera all key off that object). The overlay keeps the
identity and the replica pure at every point where the replica is used as data.

## 4. Constants (one place: `src/net/client/prediction/config.ts`)
| constant | default | meaning |
| --- | --- | --- |
| `maxHorizonTicks` | 40 (667 ms) | furthest the drawn fighter may run ahead of the replica; beyond it the prediction waits |
| `blendMs` | 120 | a small correction is ~95 % gone after this |
| `snapTiles` | 0.55 | a correction longer than this snaps (a refused step, a push); shorter ones blend |
| `deadbandTiles` | 0.01 | float noise, ignored |
| `slewTicksPerSecond` | 30 | the shown time may run at most 1.5x / 0.5x real time while the look-ahead changes (hysteresis) |
| `clockSamples` | 5 | pongs in the clock's median |
| `probeGain` / `probeMaxErrorTicks` / `probeIdleMs` / `probeTimeoutMs` | 0.25 / 12 / 400 / 2000 | calibration from presses from rest |
| `SERVER_PRESS_KEEP_TICKS` | 24 | mirror of the server's `PRESS_KEEP_TICKS` (tested equal) |
| `CREDIT_WINDOW_TICKS` (predictor.ts) | 8 | how late an estimate may be and still be credited to an observed step |

Switches: `new NetMatchDriver(deps, { prediction: true | Partial<PredictionConfig>, verifyOverlay?: boolean })`; off by default.
`predictionFromSearch(location.search)` is the browser default (on) with the `?nopredict` escape hatch. `driver.status()` adds
`predictionEnabled` and `prediction` (mode, look-ahead, corrections, snaps, probes, clock bias) for diagnostics.

## 5. Why no server ack (ON5)
An ack of the last applied input sequence would have to ride on a per-client message: the frames are encoded ONCE for the whole
room (that is the bandwidth design), and the pong comes once a second. The ping / pong already carries what an ack would give:
the server tick at which a message sent at a given client time is handled. Measured estimate error (estimated minus true receipt
tick of every input): p95 0 ticks on LAN and europe-like links, 1 tick on mobile; on bad-mobile the p95 is 16 ticks only because
3 % uplink loss and radio stalls delay single inputs by a retransmission, which no ack sent afterwards could predict. Probes and
step crediting correct the rest from evidence in the replica. So the estimate-from-RTT approach is kept and the protocol is
unchanged (no server file touched).

## 6. Measurements
Harness (`tests/net/predictionHarness.ts`, no sockets, fake clock): the real `RumbleMatch` (1 human + 15 server bots, Oshodi,
deathmatch) at 60 ticks/s behind a link model applied to both directions; the real `NetMatchDriver` at a 60 Hz frame. Two
clients play ONE match: the predicting client is connected, the plain client is a shadow fed the same bytes at the same times
(its would-be messages are compared with the connected one's: 0 differences). 3 simulated minutes per profile, seed 11,
254 presses (taps, held walks, corner turns, reversals, bursts of 4-7 presses, the odd generator).

"Input -> visible": wall time from the frame the new direction enters the intent to the first frame the DRAWN local fighter
(the renderer's own `playerGridPos` formula at that frame's alpha) has moved 0.05 tile that way. "From rest": nothing held for
700 ms and the server's fighter could step that way at the press (alive, not locked, tile open) - the clean latency figure.
"All presses" includes presses that must wait for the current step to end (the rule, offline too) or for a tile to open.
Corrections are changes of belief >= 0.05 tile; "mispredicted frames" = such corrections per predicted frame.

| profile | from rest p50 / p95, no prediction (ms) | from rest p50 / p95, prediction (ms) | all presses p50 / p95, none | all presses p50 / p95, prediction | look-ahead p50 (ticks) | arrival estimate error p50 / p95 (ticks) | mispredicted frames | corrections / min | snaps / min | correction p95 / max (tiles) | max drawn jump in one frame, prediction / none (tiles) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clean LAN (~20 ms RTT) | 67 / 67 | 17 / 33 | 67 / 367 | 17 / 500 | 2.6 | 0 / 0 | 0.08 % | 2.3 | 0.0 | 0.10 / 0.10 | 0.15 / 0.10 |
| europe-like (~115 ms RTT) | 167 / 167 | 33 / 33 | 167 / 400 | 33 / 450 | 8.6 | 0 / 0 | 0.03 % | 1.0 | 0.3 | 0.75 / 0.75 | 0.75 / 0.10 |
| mobile (~150 ms +/-30, 1 % loss) | 283 / 383 | 17 / 167 | 267 / 550 | 17 / 567 | 14.8 | 0 / 1 | 1.02 % | 29.3 | 4.0 | 1.20 / 1.65 | 1.65 / 0.12 |
| bad-mobile (~250 ms +/-60, 3 % loss) | 600 / 983 | 17 / 300 | 433 / 883 | 33 / 883 | 31.6 | 1 / 16 | 1.04 % | 27.7 | 8.3 | 1.90 / 2.90 | 3.04 / 0.12 |

Stress variant, independent per-message jitter (`--independent-jitter`: a burst of inputs queues behind its slowest message):
mobile 283 / 433 -> 33 / 33 ms from rest, 20.7 corrections and 3.7 snaps per minute, correction max 1.41 tile; bad-mobile
583 / 633 -> 33 / 167 ms, 41.7 corrections and 8.0 snaps per minute, max 1.41 tile.

Authority, every profile and both jitter models: replica hash checks 91 / 91 with 0 mismatches and 0 resyncs on both clients,
0 overlay leaks (verify mode on the predicting client), 0 differences between the messages the two clients send, both final
replicas hash-identical to the server's final state. `tests/net/prediction-latency.test.ts` also runs two SEPARATE matches
(predicting / not) on the same seed and link: the server receives identical messages and produces identical results and final
state; it checks the server only ever receives `in` (exactly `{s, m, h, b}`, validated) and `ping`.

Where the corrections come from (traced with the harness's `onCorrection` / `inputLog` hooks): an input delayed by uplink loss or
a radio stall (estimated arrival 10-20 ticks early: a held walk shown too long or too short, up to the look-ahead), presses timed
within a tick of a step boundary (bursts), and server events the client cannot foresee (a daze or knockback, a speed pickup, a
generator dropped in the path). The small 0.1-tile corrections are one-tick timing differences, blended.

With an exact clock the replay is the server: `prediction.test.ts` compares the predicted path with the server's own state tick
for tick (over 5000 ticks of random taps, holds, turns and mid-step presses) and finds no difference.

Reproduce: `npx tsx scripts/net-latency-report.ts` (about 25 s per profile on this machine) or
`WAHALA_NET_HEAVY=1 npx vitest run tests/net/prediction-latency-heavy.test.ts`.

## 7. Limits (what this does not do, and what the harness cannot show)
- Walking only. Generator placement, contact abilities' effect on generators, kicks, melee, pickups, damage, deaths and
  respawns appear when the server says so. A pickup that changes the step speed, a knockback, a daze, a generator another fighter
  drops in the path, a train: all are corrected when the server's frames show them (blend or snap).
- The input layer reads `driver.state()`, so the touch move-assist's `legal` / `board` checks see the predicted tile (where the
  fighter is drawn, about where it will be when the input lands). Keyboard and gamepad intents do not depend on it; with touch the
  sent intent may differ from a client without prediction, but it is still only `{s, m, h, b}`. If the authoritative tile is
  preferred there, the controller can build the intent inside `driver.readAuthoritative(...)`.
- An input delayed by uplink loss or a radio stall arrives later than estimated; the prediction is then wrong for that moment
  and is corrected (up to the 40-tick look-ahead: about 4 tiles on a held walk, snapped). Press bursts timed within a tick of a
  step boundary are a coin flip at +-1 tick of estimate error.
- The harness is a model: the real server match core and client driver, but a statistical link (smoothly varying queueing delay,
  per-message noise, TCP-ordered delivery, loss as retransmission stalls, radio stalls in both directions), a fixed 60 Hz client
  frame, and a scripted human (timing fixed by a seed, directions chosen among the tiles open on the server's board). No real phone,
  radio, browser event loop, touch latency, display latency or thermal throttling is in these numbers; they measure the network
  part of input -> visible only. Real-device checks remain to be done.
