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


## 7. Validation results (Stage 2 and 3)

Full tables, method and raw JSON: `docs/measurements/rumble-online/LOAD_RESULTS.md`. Every number below was measured in this container (4 vCPU Xeon @ 2.3 GHz, 16 GB, Node 22.23); each configuration ran once with random seeds, so compare orders of magnitude, not decimals.

**What kind of client.** *Real browsers*: two Chromium instances (separate contexts) with the real renderer on software WebGL (`server/e2e/two-clients.mjs`). *Simulated clients*: headless Node processes running the real `@colyseus/sdk`, the real `NetReplica` and 60 Hz playout over real WebSockets, driving their seat with the real bot brain reading their own (delayed) replica, through an application-level impairment proxy (`server/bench/impairProxy.ts`: per-chunk delay + jitter with TCP ordering, loss modelled as retransmission stalls with head-of-line blocking; no kernel `tc netem` here). **No physical phone has been tested yet.**

### 7.1 Two real browsers (`npm run demo:two`)
Two Chromium players: A creates a private room, B joins with the invite link, a full match runs (2 humans + 30 server bots, Oshodi), B is forced offline for 9 s mid-match. Result: both replicas and both results carry the same final hash (`56cc4255` at tick 7596), identical results, 0 hash mismatches, B reconnected and resynced from a keyframe. Screenshots: `docs/screenshots/rumble-online/` (lobby host/guest, both players in the real 3D arena, both results screens with "MATCH: identical"). Caveat: software WebGL draws ~1–2 frames/s here, so the browsers' ping readings and the 33 s reconnection time are main-thread stalls, not network figures.

### 7.2 Connected clients, clean network (32 fighters every time, the rest server bots)

| connected clients | 2 | 4 | 8 | 16 | 32 |
| --- | --- | --- | --- | --- | --- |
| server CPU, % of one core (mean) | 28.7 | 29.7 | 23.8 | 20.1 | 9.3 |
| step ms mean / p99 | 3.2 / 9.3 | 3.2 / 10.1 | 2.5 / 7.5 | 2.0 / 6.0 | 0.6 / 1.8 |
| down KB/s per client | 10.3 | 10.4 | 10.6 | 10.2 | 10.2 |
| total egress KB/s | 21 | 42 | 84 | 163 | 326 |
| input → visible ms p50 / p95 | 80 / 97 | 65 / 81 | 64 / 98 | 65 / 93 | 82 / 130 |
| hash mismatches / resyncs | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| missed / duplicated eliminations | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Server CPU *falls* as humans replace bots: the bots' AI is the dominant server cost (~0.67 % of a core per bot), a 32-human room costs ~9–10 % of one core. Ticks dropped: 0 in every run.

### 7.3 Impaired networks, 32 clients

| profile | RTT p50 / p95 | input → visible p50 / p95 | tick lag p50 | mismatches | kicks |
| --- | --- | --- | --- | --- | --- |
| europe (Lagos→London, ~114 ms RTT ±10) | 116 / 129 ms | 191 / 211 ms | 123 ms | 0 | 0 |
| mobile (~150 ms ±30, 1 % loss) | 162 / 354 ms | 261 / 457 ms | 183 ms | 0 | 0 |
| bad-mobile (~250 ms ±60, 3 % loss) | 294 / 615 ms | 448 / 678 ms | 382 ms | 0 | 0 |
| bad-mobile, unthrottled client inputs, after the fix | 302 / 647 ms | 386 / 683 ms | 388 ms | 0 | **0** (was 9 of 32) |

Generator detonations (`generatorExploded`) and eliminations were identical on every client in every run. "Input → visible" is wall time from sending a new direction to the replica showing that step start: RTT + server tick wait + send batching + jitter buffer. Above ~250 ms it will feel sluggish; client-side prediction of the local fighter is the planned remedy (section 10).

### 7.4 Reconnection and app switching (32 clients, mobile profile)
- 4 clients dropped abruptly at ~20 s and came back after 3 s: all re-took their seats; `reconnect()` 447–668 ms, keyframe loaded 599–810 ms after the call, first hash-verified consistent state 840–1212 ms after the call (the hash rides every 2 s). While away their seat was autopiloted; 3.4–3.7 s of events were not replayed to them (the keyframe carries the state, not the missed effects).
- 1 client never returned: after the 10 s window a bot played the seat to the end (139 observed moves, 5 kills / 3 deaths in the results).
- 4 clients stopped playing out for 10 s with the socket open (a backgrounded mobile tab): ~604 ticks queued, caught up in the first frame after resuming, 0 mismatches, 0 missed events (the picture jumps forward).

### 7.5 Capacity (one server process = one main thread)

| load | server CPU (of one core) | result |
| --- | --- | --- |
| 1 room × 32 humans | ~9–10 % | 0 dropped ticks |
| 2 / 3 / 8 rooms × 32 humans (64 / 96 / 256 clients) | ~15 / 19 / ~40 % | all consistent; at 6–8 rooms the CLIENT processes saturated this 4-vCPU box first |
| 3 rooms × (2 humans + 30 bots) | ~73 % | 1 dropped tick |
| 4 rooms × (2 + 30) | ~94 % | 47 dropped ticks: the edge |
| 6 / 8 rooms × (2 + 30) | saturated | 2282 / 10 799 dropped ticks, still consistent (slow motion) |

**Maximum successfully tested: 256 concurrent connected clients (8 rooms × 32 humans) on one server process, all hash-consistent; and 32 connected clients in one 32-fighter room on every network profile.** Rooms per vCPU: about 3 bot-heavy rooms (measured; 2 with margin) or roughly 7–10 all-human rooms (extrapolated from per-room CPU, not measured to saturation because the clients ran out of CPU first). One process uses one core, so production runs one process per vCPU (section 9).

### 7.6 Bots versus real players
- Bots are server-side `createBot` brains (the same as offline), seeded from the secret match seed, reading `observe(state)` exactly as offline: same rules, same `Intent`s. They are named `BOT …` and flagged `isBot` in the descriptor, the lobby and the results.
- Human seats are `isBot: false`; the sim then applies human timing (bots get a minimum attack wind-up, `skills.ts`).
- A dropped human's seat stands for a short grace period (default 5 s), is then played by a replacement bot without pausing the match, can be taken back by the human (the same fighter) within the reconnection window (default 30 s), and belongs to the bot for the rest of the match after it. Replacement-bot kills are NOT credited to the absent player's personal numbers (`ResultsMsg`), while the match score still follows the simulation: see section 8 "Disconnect policy" (decisions ON6-ON8). The measurements in 7.4 were taken before the grace period existed (the bot played from the first moment).
- Humans feel latency; bots do not (they act on the authoritative state every tick). In the measurements, the human-like load clients played *through* their delayed replicas, so their decisions are as late as a person's would be.

## 8. Rooms and matchmaking foundation (Stage 4)
- Room = one Colyseus room `rumble`, id = a 6-character code (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), shareable as `?room=CODE`. Private rooms are joinable only by code; public rooms are listed for `joinOrCreate` (quick play).
- Lifecycle (pure `server/src/core/Lobby.ts`): `lobby → countdown (3 s) → playing → results → (rematch) lobby`. Host = first member, promoted on leave; host-only start (private), settings (arena, mode, 3/5 min, bot level) and rematch; public rooms auto-start 20 s after the first player or at 32 humans.
- Seating: humans in join order, then bots to 32. Team Rumble uses the sim's own `assignTeams` and damage rules (`flameHarms` / `canHarm`), so team play and friendly-fire rules are exactly the offline ones.
- Results are built from the server's own state (`RumbleMatch.results()`), carry the final state hash, and are identical for every client.
- Reconciled with the gameplay release `66f3e3d` (Sudden Death timer, permanent player marker, viewer-relative team blast warnings, decisions TB1–TB4), merged into this branch: the team damage rule is server-authoritative (sim), and the viewer-relative warnings are pure functions of `GameState` + viewer, computed by the renderer from the replica with `localPlayerId = seat` — no protocol change; root tests incl. `tests/blast-safety.test.ts` pass on the merged branch.

### Disconnect policy (decisions ON6-ON8)
What happens when a human's connection drops during a match, all values configurable on the server (`server/src/core/options.ts`):

| Setting | Env var | Default | Meaning |
| --- | --- | --- | --- |
| `graceSeconds` | `RUMBLE_GRACE_SECONDS` (0..60) | 5 | The fighter just stands where it is (no bot yet; it can still be hit). Counted in simulation ticks. |
| `reconnectSeconds` | `RUMBLE_RECONNECT_SECONDS` (1..3600) | 30 | The reserved window, counted from the drop: the human can take back THE SAME fighter until it ends. |
| `dropPolicy` | `RUMBLE_DROP_POLICY` = `bot` \| `idle` | `bot` | After the grace period a replacement bot plays the seat (`bot`), or the fighter keeps standing until the window ends (`idle`). After the window a bot keeps the seat in both cases. |

Invalid values fall back to the defaults. A deliberate leave (the player quits) skips all of this: a bot has the seat at once and there is no way back. The match never pauses for anyone. Reconnecting only changes who controls the seat: the `Player`, its position, step, lives, protection and respawn timers are untouched; a fighter who fell while the human was away returns as the same down or respawning fighter (the mode's normal rules), never a fresh one. The lobby view marks the member `connected: false` while away and `botControlled: true` once the bot plays (the row leaves the lobby when the window ends; the seat is then a human seat of the descriptor with no connected member).

**Statistics.** The server splits what the simulation credited, per human seat, by who controlled the seat on the tick the credit happened (a tick on which nobody acts, during the grace period or `idle`, belongs to the human). `ResultsMsg.players[]`:

| Field | Meaning |
| --- | --- |
| `kills`, `deaths`, `assists` | PERSONAL numbers: only human-controlled time (what a future ranking / XP / achievement layer reads). For a server-bot seat (`isBot`) they are the simulation's totals. |
| `botKills`, `botDeaths`, `botAssists` (optional, human seats) | What the replacement bot did on the seat. `kills + botKills` = the simulation's total for the seat. |
| `autopilotSeconds`, `absentSeconds`, `drops` (optional) | Seconds a bot controlled the seat; seconds the seat stood with no controller; connection drops. |
| `controlledByBotAtEnd` (optional) | A bot (not the human) controlled the seat when the match ended. |

The simulation, team score, Sudden Death and the winner are unchanged: every credited kill counts for the match result, `placement` is the simulation's. Only the personal numbers are split. Older clients keep working (all new fields are optional, protocol version unchanged).

**Open policy questions for the founder** (NOT decided here; the implementation only records the facts so any answer can be applied later):
1. Does time played by a replacement bot count toward rank, XP or achievements at all (today: no, the personal numbers exclude it, but a match still counts as played)?
2. Does a long absence forfeit something (rank points, rewards, the seat's placement), and from which length: more than the grace period, the whole window, the whole match?
3. Does a returning player keep, in the TEAM score, the kills the bot made for their seat while they were away (today yes: the match result follows the simulation; the personal numbers do not)? Should the bot's deaths count against the team?
4. Should a player who is the host or in a ranked room be treated differently (e.g. a ranked match with a bot-controlled seat)?
5. Should repeated drops (`drops`) be visible to matchmaking or moderation (e.g. a penalty for leaving, or leniency for a mobile network that keeps dropping)?
6. Should the grace period and the window differ between public and private rooms or between casual and ranked play?

## 9. Hosting, data and cost (Stage 5)

**Shape.** One Node 22 process per vCPU, each hosting many rooms; TLS (`wss://`) terminated by a reverse proxy; `server/dist/rumble-server.mjs` (one file, `npm run bundle`) runs anywhere Node 22 runs (verified with a full load test against the bundle); `server/Dockerfile` wraps it (not built here). Multi-process / multi-machine matchmaking: Colyseus' Redis presence + driver (`@colyseus/redis-presence`, `@colyseus/redis-driver`), not yet configured. GitHub Pages stays fine for the static client; it cannot host the server.

**Latency from Nigeria.** Published wired ping (WonderNetwork, 2026): Lagos → London ~114 ms, Lagos → Frankfurt ~125 ms; mobile radio access adds to that. With the London-like profile, measured input → visible was 191 / 211 ms (p50 / p95). Prefer London (or another western-European site well peered with the West African cables) over Germany or Finland; a Lagos-local host could roughly halve it but must be measured. **Before choosing, measure from real Nigerian phones** (MTN, Airtel, Glo; 4G and Wi-Fi) to 2–3 candidate regions with a small ping page — the only latency data here is emulated.

**Data per player** (measured, 30 Hz): ~10 KB/s down + ~0.1–0.5 KB/s up ≈ **36 MB per player-hour, ~3 MB per 5-minute match**. The impaired-profile runs measured less (6–7.6 KB/s, also in the server's own count); the cause was not isolated (most likely less in-match activity from the delayed human-like clients), so plan on 10 KB/s. Levers if needed: 20 Hz sends (−10 %), interest management, a key dictionary.

**Server resources per concurrent human (CCU)**, from section 7: full 32-human rooms ≈ 0.3 % of a core per player; bot-filled rooms cost ≈ 9–10 % of a core per room plus ≈ 0.67 % per bot. Egress ≈ 10 KB/s per player ≈ 26 TB per month per 1000 CCU sustained around the clock.

**Cost estimate.** Assumptions: target ≤ 70 % CPU per vCPU; dedicated vCPUs (shared vCPUs risk tick jitter from neighbours — test before relying on them); prices from November 2026 third-party summaries, **to be checked on the providers' own pages before any decision**: Hetzner dedicated CCX13 (2 vCPU) ~€43/month after the June 2026 increase, ≥ 20 TB egress included per server in the EU then ~€1/TB; DigitalOcean extra egress $0.01/GiB; AWS internet egress ~$0.09/GB. CCU = average concurrent humans over the month.

| average CCU | room fill | vCPU needed | egress / month | Hetzner-class (dedicated) | egress on a hyperscaler alone |
| --- | --- | --- | --- | --- | --- |
| 100 | 4 humans + 28 bots per room | ~10 | ~2.6 TB | ~5 × CCX13 ≈ €215 | ~$230 |
| 100 | full (32 humans) | ~1 (2 for redundancy) | ~2.6 TB | 1–2 × CCX13 ≈ €45–90 | ~$230 |
| 1 000 | 4 humans + 28 bots | ~100 | ~26 TB | ~50 × CCX13 ≈ €2 150 | ~$2 200 |
| 1 000 | full | ~5 | ~26 TB | 3 × CCX13 ≈ €130 (traffic included) | ~$2 200 |
| 10 000 | full | ~45 | ~260 TB | ~23 × CCX13 ≈ €1 000 + overage ≈ €0 (460 TB included) | ~$16 800 (tiered $0.09→0.05/GB) |

Reading: **bandwidth is cheap on EU hosts with included traffic and expensive on hyperscalers; CPU is dominated by bots.** Until public matchmaking fills rooms with people, the cost driver is bot AI — profiling and cheapening the bot brain (or a cheaper "filler bot" level) is the main cost lever, not the netcode. Add a small fixed cost for a Redis instance and a monitoring stack. Nothing has been bought, deployed or registered.

**Security.**
- Authority: clients send only `{s, m, h, b}`; strict validators (exact keys, bounded values, no `__proto__` smuggling), defensive MessagePack decoder limits on the client, Colyseus message size limits on the server.
- Results, kills, eliminations, teams and the seed come only from the server's simulation; snapshots contain no seed, rng state or hidden pickups (tested).
- Flooding: invalid messages (> 20 / 10 s) or a sustained flood (> 600 messages / 5 s) → disconnect; a stall burst is never punished (measured fix, regression test).
- Origins: `RUMBLE_ALLOWED_ORIGINS` allowlist (nothing allowed in production by default), CORS without credentials, optional bearer token for `/metrics`; private room codes are not exposed in metrics.
- Reconnection tokens: Colyseus' single-use `reconnectionToken`, kept in memory by the client (not localStorage).
- Not yet done (must be before a public launch): TLS deployment, per-IP limits on room creation and joins (DoS), real accounts / guest identity and name moderation, reporting / bans, abuse of the autopilot policy, an "information" consideration (every client receives every fighter's position: fine for the current full-visibility rules, but interest management would be needed if any rule ever hides players), dependency and container scanning.

## 10. Gaps and next steps

Outstanding implementation gaps (none is hidden behind a passing test):
1. **No physical phones tested**; real Nigerian network latency not measured (only emulated).
2. **Client-side prediction** of the local fighter is not built: input → visible is RTT + ~70 ms. Approach: run the local fighter's movement through the real `tick` on a predicted copy and reconcile against server frames (rollback) — the deterministic sim makes this feasible.
3. **Main-app integration**: the online match runs in a dev page; the main menus, React HUD, kill feed styling, touch controls and settings are not wired (needs a build-time flag like `__WAHALA_SERVER_ONLINE__`, kept out of the static Pages build).
4. Touch input: the dev page's stick and buttons are untested on devices; the offline touch move-assist features (corner routes, sidestep, beginner assist) are not available online yet (they need the authoritative board, i.e. a server-side port of `MoveGate` assist).
5. Missed effects after a reconnect are not replayed (state is exact; the 3–4 s of FX/audio while away are skipped).
6. Multi-process scaling (Redis presence/driver), deployment, TLS, monitoring and per-IP limits are not set up.
7. Bot CPU is the cost driver; the bot brain has not been profiled for server use.
8. Spectators (non-playing viewers) and late join into a running match are not supported (rooms lock at start; only reconnection is allowed).
9. ~~Autopilot kills count for the absent player~~ Done: personal numbers are human-only, bot numbers are separate (section 8, ON7). The open ranking / reward questions are listed there for the founder.

**Next concrete step:** a phone test. Deploy the bundled server on one small EU VM (London region, dedicated vCPU, TLS) — with the founder's approval of the provider and cost — and add a minimal latency/ping page; then run two to four real phones in Lagos on MTN / Airtel / Glo through a full match with the dev client, recording input → visible latency, data used and reconnection on app switches. That single test decides the hosting region and whether client-side prediction is needed before anything else.

## 11. Sources for external figures (checked 2026-11-23; verify before any purchase)
- Lagos ↔ London / Frankfurt ping: [WonderNetwork Lagos–London](https://wondernetwork.com/pings/Lagos/London), [WonderNetwork Lagos–Frankfurt](https://wondernetwork.com/pings/Lagos/Frankfurt).
- Hetzner 2026 pricing and included traffic (third-party summaries): [Better Stack review](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/), [costgoat calculator](https://costgoat.com/pricing/hetzner), [ployz.dev](https://ployz.dev/blog/hetzner-pricing).
- DigitalOcean bandwidth billing: [docs](https://docs.digitalocean.com/platform/billing/bandwidth/). AWS egress tiers as summarised by [DigitalOcean's AWS egress article](https://www.digitalocean.com/resources/articles/aws-egress-costs) (check the AWS pricing page for the exact region).
