# City Rumble Online — authoritative 32-player multiplayer foundation

Branch `claude/wahala-city-rumble-online-30w0rm` (isolated worktree), based on production reference `00eff0a` (the head of `claude/wahala-stitch-uiux-v1`, published as `gh-pages` d0625b5). **Development foundation only: nothing here is deployed, and the shipped static game is unchanged** (no file it builds from was modified; the new client lives behind a separate dev-only page).

Target (founder decision): City Rumble, 32 fighters per match, up to 32 real humans, empty seats filled by clearly labelled server bots; Free-for-All first, teams next; free private rooms and public matchmaking; browser-first on mobile landscape and desktop. The 2/4/8/16/32-client numbers below are engineering validation milestones, not product limits.

## 1. Summary of decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Authority | Server runs the real `src/sim` `tick()` and `src/ai` bots; clients send intents only | The sim is already pure, seeded and deterministic (ESLint-enforced), so the server reuses it unchanged: no second, divergent City Rumble |
| Replication | Server → client public-state deltas, one patch per tick, encoded once per room | Lockstep would hand every client the seed and hidden data and stall 32 mobile players on the slowest one |
| Framework | Colyseus 0.18 (`@colyseus/core` + `ws-transport`) for rooms, codes, matchmaking, reconnection; **no `@colyseus/schema`** | Schema would need a hand-maintained mirror of `GameState`'s ~150 fields (a second representation that can drift from the sim). Colyseus still earns its place for room lifecycle and its Redis-backed multi-process path |
| State codec | Own exact MessagePack + structural delta + shared counter predictor + deflate | JSON loses `Infinity` (the sim uses it); measured 9–11 KB/s per client at 20–30 Hz |
| Client | A separate dev page drives the REAL `GameRenderer`, `InputManager` and audio from the replica | Zero change to the shipped bundle or to `src/app/session.ts` (no conflict with the parallel gameplay / audio / performance workstreams) |

## 2. Stage 1 feasibility (measured on real code)

Machine: 4 vCPU Intel Xeon @ 2.30 GHz, 16 GB, Node 22.23. Scripts: `server/bench/feasibility.ts`, `server/bench/bandwidth.ts`.

1. **Headless**: `src/sim` and `src/ai` import no DOM, Three.js, WebGL, storage or timers (`grep` + the ESLint boundary rules); `createGame` + `tick` + `createBot` run unchanged in Node.
2. **Browser dependencies** exist only in `render`, `ui`, `audio`, `input`, `app`. The renderer reads `state.seed` for cosmetic paving noise and the minimap cache key only (the client uses a placeholder).
3. **Determinism**: on all 7 Rumble arenas, replaying a 3600-tick 32-fighter match from its seed + intent log gives an identical state hash. Time is ticks (60/s), randomness is the seeded mulberry32 in the state.
4. **32 fighters** are 32 `Player` seats in one `GameState` (`MAX_PLAYERS = 32`); bots are `Player.isBot` seats driven by `createBot(...).decide(observe(state, id))`, exactly like humans' `Intent`s. Note: the sim gives bot seats a minimum attack wind-up (`skills.ts:272`), so human seats must be `isBot: false` — the server sets this from the seat kind.
5. **Server authority reuses the combat rules as-is**: the server calls the same `tick`. No rule was copied or simplified.
6. **Server-owned results**: `RumbleMatch.results()` reads `state.match.result` and `matchResultFrom` (the existing progression helper) from the server's own state; no client message can carry a result (`validateInput` accepts exactly four fields).
7. **Cost per tick** (32 fighters, mean / p99): sim 0.11–0.12 ms / ~2 ms; 32 bots' AI 1.5–2.2 ms / ~6 ms (rare spikes to 37 ms); replication codec (diff + apply + pack, shared by all clients) ~0.45–0.6 ms / ~1.3–2 ms. Public state: 55–104 KB JSON, ~33 KB MessagePack, ~2.5 KB deflated keyframe.
8. **Bandwidth** (server → each client, deflated, incl. WebSocket framing, excl. TCP/IP headers): see section 5.
9. **Offline play is preserved**: the shipped bundle never imports `src/net` or `server/`; `npm run check:static` and `tests/platform-static.test.ts` still prove the default build has no socket code.

## 3. Architecture

```
 browser (each of up to 32)                         server process (Node 22, one or more rooms)
 ┌───────────────────────────────┐                 ┌──────────────────────────────────────────────┐
 │ InputManager (real, A/B rules)│  InputMsg        │ RumbleRoom (Colyseus): lobby, code, seats,    │
 │   └─ NetMatchClient ──────────┼─ {s,m,h,b} ─────▶│   reconnection window, rate limits, metrics   │
 │        │  frames / keyframe    │  (WebSocket,     │   └─ RumbleMatch (transport-agnostic)         │
 │        ▼                       │   TLS in prod)   │        state: GameState  (createGame/tick)    │
 │   NetReplica                   │◀─ deflate(pack)──┤        bots: createBot (server-side)          │
 │    predict + applyPatch        │   one buffer for │        mirror: PublicState (what clients hold)│
 │    jitter buffer, hash check   │   every client   │        per tick: predict(mirror); diff; apply │
 │        │ GameState + SimEvents │                  │        results(): from its own state only     │
 │        ▼                       │                  └──────────────────────────────────────────────┘
 │ GameRenderer / audio (real)    │
 └───────────────────────────────┘
```

Code map:

| Path | Role | Runs in |
| --- | --- | --- |
| `src/net/pack.ts` | exact MessagePack (Infinity/NaN/-0), defensive decoder, `packFramesPayload` | both |
| `src/net/delta.ts` | `diff` / `applyPatch` (entity, sequence, sparse array, object) | both |
| `src/net/predict.ts` | shared counter predictor (clock, steps, fuses) | both |
| `src/net/hash.ts` | canonical (key-order independent) FNV-1a hash | both |
| `src/net/publicState.ts` | strips `seed`, `rngState`, `hidden`, `config` | both |
| `src/net/protocol.ts` | wire protocol v1, strict input validator | both |
| `src/net/replica.ts` | client replica + adaptive jitter buffer | browser |
| `server/src/core/RumbleMatch.ts` | the authoritative match | server |
| `server/src/core/Lobby.ts`, `server/src/rooms/RumbleRoom.ts`, `server/src/main.ts` | rooms, codes, lifecycle, tick loop, HTTP health/metrics | server |
| `server/client/` | dev browser client (real renderer/input/audio) | browser (dev only) |
| `server/bench/` | feasibility, bandwidth, load and impairment harnesses | Node |

`src/net` is pure (no DOM, no sockets) and is covered by the root CI (`tsc`, ESLint, Vitest `tests/net/`). `server/` is a separate npm package (Colyseus is not added to the game's dependencies).

## 4. Protocol and replication

### 4.1 Messages
Client → server: `in` `{s, m, h, b}` (sequence, held direction or null, A held, one-shot button mask: place 1, special 2, detonate 4), `ping` `{c}`, `resync` `{}`, lobby `ready` / `start` / `rematch`. That is the whole client vocabulary: no message can carry a position, hit, elimination, score, result, team or seed.

Server → client: `welcome` `{descriptor, seat, roomCode}` (the descriptor is public: arena, normalised settings, seat list with bot flags; no seed), `kf` keyframe (binary), `fr` frames (binary), `pong`, `lobby`, `results`, `notice`.

### 4.2 Codec
MessagePack subset written for this purpose (`pack.ts`): JSON would turn the sim's `Infinity` ("never") into `null`. The decoder bounds depth, container sizes and string lengths, rejects `__proto__` / `constructor` / `prototype` keys and trailing bytes.

### 4.3 Delta
`diff(mirror, current)` → patch; `applyPatch` is the same function on server and client, so the server's mirror is byte-identical to every client's replica by construction. Entity arrays (objects with numeric `id`: players, generators, vehicles, blasts, pickups) are keyed by id and keep object identity; id-less lists the sim filters and appends (flames) use keep/remove/append; same-length arrays (tiles) are sparse. **Frames are packed at their own tick**: a patch can reference live sim objects (`{ $r: generator }`) that the next tick mutates — this bug was found by the smoke test and is covered by a regression test.

### 4.4 Shared predictor
Most per-tick change is counters stepping by one (`tick`, `playTicks`, each moving player's `stepRemaining`, each generator's `timer`). Server and client both run `predict()` before each tick's patch; the patch carries only wrong guesses. It never decides a rule outcome. Measured effect: per-client bandwidth roughly halved (e.g. Oshodi 20 Hz: 21.3 → 9.9 KB/s), zero desyncs.

### 4.5 Client replica
Keyframe on join / reconnect / resync, then frames in order (`t` must be `replica.tick + 1`, duplicates skipped, a gap → resync). A canonical hash rides on a frames message every 120 ticks; a mismatch → resync. Playout at 60 ticks/s from a jitter buffer targeting `sendEvery + 3` ticks, 15 % faster / slower to steer the buffer, catch-up beyond 45 ticks.

### 4.6 Input semantics
Offline, `MoveGate` turns a tap into one step by holding the press until the step finishes. Online only the server knows when the authoritative step finishes, so the server latches a new direction press until it produces a step (or a short timeout); a held direction walks continuously. A/B tap-versus-hold is decided on the client by the real `InputManager` (same thresholds as offline) and sent as button bits.

## 5. Bandwidth (measured)

32 fighters, deathmatch, 60 s per arena, deflated per send batch, + 8 bytes framing per message:

| Send rate | Without predictor | With predictor |
| --- | --- | --- |
| 60 Hz (every tick) | 25.6–28.9 KB/s | 12.1–13.2 KB/s |
| 30 Hz (every 2 ticks, default) | 20.7–23.5 KB/s | 9.9–11.0 KB/s |
| 20 Hz (every 3 ticks) | 18.6–21.3 KB/s | 8.9–9.9 KB/s |

Default 30 Hz: ~11 KB/s ≈ 40 MB per player-hour ≈ 3.3 MB per 5-minute match. Keyframe ≈ 2.5 KB. Where the bytes go (Oshodi, with predictor off): players 26 KB/s raw (mostly `stepRemaining`), generators 25 (fuse), flames 11, events 3 — the predictor removes most of the first two.

Further levers, not yet needed: interest management (only send far entities at a lower rate; the follow camera shows ~12 × 8 of a 63 × 47 city), a key dictionary for repeated flame/event objects, 20 Hz on poor connections.

## 6. Client integration

`server/client/NetMatchClient.ts` plays the role of `MatchController` without simulating: replica → `renderer.loadGame` / `handleEvents` / `render` and `audio.handleEvents` (events filtered to the camera focus as offline), `InputManager.buildIntent` → `InputMsg` on change. The dev page `server/client/index.html` is served by Vite with its own config and is not part of the production build. Full integration into the main app (menus, React HUD, touch controls) is a follow-up behind a build-time flag (section 10).

<!-- sections 7+ are filled in after the load tests -->
