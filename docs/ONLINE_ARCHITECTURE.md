# Online play: architecture, mock flows and what a real backend must provide

Branch `claude/wahala-campaign-online-v1`, worker `online-scaffold`. **Nothing here is a working online game.** There is no server, no database, no matchmaking service, no account system and no anti-cheat. What exists is: the interfaces, the wire schema and validators, the lifecycle rules, a complete in-memory **mock** of every service (so the flows can be designed, tested and demonstrated), and a **skeleton** of the real transport that has never talked to a real back end. All of it is **disabled by default**; the static GitHub Pages build is a fully working front-end-only game and contains none of the transport code (proved below).

Honest status table:

| Piece | State |
| --- | --- |
| Service contracts (`src/online/contracts.ts`) | complete, typed |
| Wire schema + validators (`schema.ts`, `validate.ts`) | complete for client messages (strict); server messages are validated shallowly |
| Lifecycle rules (`lifecycle.ts`: rooms, matches, teams, parties) | complete, pure, unit-tested |
| Mock services (`src/online/mock/`) | complete and tested; scripted bots stand in for players |
| Mock match = real simulation behind `MatchService` | works (same `src/sim` + `src/ai` bots); tested incl. replay-hash determinism |
| Server adapter (`src/online/server/`) | **skeleton**: unit-tested with fake transports only, never run against a back end |
| Online preview UI (`src/ui/online/`, `src/app/online.ts`) | works against the mock; flag-gated |
| Real backend, DB, auth, matchmaking, anti-cheat, moderation | **not built** |

## 1. Layers

```
src/platform/flags.ts          feature flags (build env + the ?mockonline URL switch)
src/platform/storage.ts        KeyValueStore port (localStorage / Map)
src/online/
  contracts.ts                 service interfaces + OnlineClient (all async, all Result<T, OnlineError>)
  types.ts, errors.ts, result.ts
  lifecycle.ts                 room / match state machines, party / room / team permission rules (pure)
  validate.ts                  tiny hand-written validation toolkit (no dependency)
  schema.ts                    PROTOCOL_VERSION, ClientMessage / ServerEvent unions, validators, encode / decode
  util.ts                      token bucket, FNV-1a, opaque token
  mock/                        in-memory implementation of every service (injectable clock + seeded rng)
  server/                      REAL adapter skeleton (https commands + streaming socket) - build-time opt-in only
  index.ts                     createOnline(flags, env): null | mock | (dynamic import) server adapter
src/progression/               XP, rank, totals, streaks, seasons, leaderboard model (pure)      docs/PROGRESSION.md
src/voice/                     voice interfaces, pure policy, NullVoiceProvider, mock             docs/VOICE_CHAT_DESIGN.md
src/ads/, src/seasons/, src/cosmetics/                                                           docs/ADS_AND_SEASONS.md
src/app/online.ts              the preview's controller (zustand store + `onlineApi`)
src/ui/online/                 Online preview screens, VoiceStatus, the read-only Settings flag row
```

Import rules (tested in `tests/platform-static.test.ts`):

- `src/online` imports only `src/platform`, `src/sim`, `src/ai` (the mock's bots), `src/progression`, `src/seasons` and `src/cosmetics`; never `render`, `ui`, `audio`, `input` or `app`. No React or DOM outside the optional browser adapters.
- `src/sim`, `src/ai`, `src/input`, `src/render`, `src/audio`, `src/app/MatchController.ts`, `src/app/session.ts` and the campaign never reach `online`, `voice`, `progression`, `ads`, `cosmetics` or `seasons`. The local game cannot depend on, or be changed by, any of them.
- Outside those layers only the menu shell imports them: `MainMenu.tsx` (the Online screen is a **lazy chunk**, so a default user never downloads it) and `SettingsScreen.tsx` (the read-only flag row).

## 2. Feature flags and the build

| Switch | Effect |
| --- | --- |
| nothing (default) | `flags().online` false, `onlineMode: 'off'`: no Online entry, `createOnline` returns `null`, nothing is constructed |
| `?mockonline` (URL) | `onlineMode: 'mock'`: the local mock only. No socket, no `fetch`, no WebRTC, no microphone |
| `WAHALA_ONLINE_ENABLED=true` (build) | `onlineMode: 'mock'` unless an endpoint is also given |
| `WAHALA_ONLINE_ENABLED=true` + `WAHALA_ONLINE_URL=https://...` (build) | `onlineMode: 'server'`; also defines `__WAHALA_SERVER_ONLINE__ = true`, which compiles the adapter in |
| `WAHALA_VOICE_ENABLED=true` (build) | shows the **disabled** voice UI state only; there is no provider |

No URL parameter can enable the server transport or voice (`tests/platform-flags.test.ts`).

The adapter guard: `vite.config.ts` computes `__WAHALA_SERVER_ONLINE__` with the same rule as `resolveFlags` (checked equal on a table of inputs in `tests/online/build-guard.test.ts`; always `false` under Vitest). `src/online/index.ts`:

```ts
if (flags.onlineMode === 'server') {
  if (__WAHALA_SERVER_ONLINE__ && env.serverUrl) {
    const { createServerOnline } = await import('./server/adapter');
    return createServerOnline({ url: env.serverUrl });
  }
  return null; // asked for 'server' but this build has no transport: never a silent fallback to the mock
}
```

With the constant `false` the bundler removes the branch and the adapter chunk is never emitted. Proof, two ways:

1. `npm run check:static` (`vite build` + `scripts/check-static-build.mjs`) scans every built `.js` for `WebSocket`, `EventSource`, `RTCPeerConnection`, `getUserMedia`, `XMLHttpRequest` and `wss://` endpoints. It passes on the default build (the mock is in its own `OnlineScreen-*.js` chunk and contains none of them). A build made with `WAHALA_ONLINE_ENABLED=true WAHALA_ONLINE_URL=https://x.invalid` emits an `adapter-*.js` chunk and **fails** that script on purpose: a server build is a different product and must not be published by the static Pages workflow.
2. `tests/platform-static.test.ts` walks the import graph from `src/main.tsx` (the single guarded dynamic import is the only edge ignored) and asserts that `src/online/server/**` and any file naming a socket / WebRTC / microphone API is unreachable, and that `createOnline` with default flags touches no network global (they are replaced with throwing stubs in the test).

`.github/` is untouched: the single Pages publisher and `docs/CI.md` rules are unchanged.

## 3. Service interfaces

Every method is async and returns `Result<T, OnlineError>`; nothing throws across the boundary (the mock wraps each call and turns an unexpected exception into `internal`). Push events arrive on `OnlineClient.events.subscribe(listener)`.

| Service | Methods | Server endpoint (adapter) |
| --- | --- | --- |
| `AccountService` | `signInGuest`, `signIn` (placeholder credentials), `signOut`, `currentProfile`, `setDisplayName` | `POST /v1/auth/guest`, `/v1/auth/signin`, `/v1/auth/signout`, `/v1/account/profile`, `/v1/account/name` |
| `MatchmakingService` | `enqueue`, `status`, `cancel` | `/v1/queue/enqueue`, `/status`, `/cancel` |
| `PartyService` | `create`, `join(code)`, `get`, `leave`, `invite`, `promote`, `kick`, `setReady` | `/v1/party/create`, `/join`, `/get`, `/leave`, `/invite`, `/promote`, `/kick`, `/ready` |
| `TeamService` | `requestSwitch` (ask, never assign), `balance` (host) | `/v1/team/switch`, `/balance` |
| `LobbyService` | `createFromParty`, `get`, `setSettings`, `setReady`, `setCharacter`, `startReadyCheck`, `leave` | `/v1/lobby/create`, `/get`, `/settings`, `/ready`, `/character`, `/readycheck`, `/leave` |
| `MatchService` | `start`, `join`, `leave`, `ready`, `submitInput(matchId, tick, Intent)`, `snapshot`, `results` | `/v1/match/start`, `/join`, `/leave`, `/ready`, `/snapshot`, `/results`; **input over the stream** (`match.input`) |
| `ReconnectService` | `resume({ matchId, resumeToken, lastAckedTick })` | `/v1/match/resume` |
| `ProgressionService` | `get`, `settle(matchId)` (the client asks, the server derives the result) | `/v1/progress/get`, `/settle` |
| `RankingService` | `rating`, `leaderboard(boardId, limit)` | `/v1/ranking/rating`, `/leaderboard` |
| `SocialService` | `friends`, `requestFriend`, `respondFriend`, `invitations`, `respondInvitation` | `/v1/social/friends`, `/request`, `/respond`, `/invitations`, `/invitation-respond` |
| `EventStream` | `subscribe` | `GET .../v1/stream` (secure WebSocket; first frame `hello`) |

Every endpoint takes a JSON `POST` with `Authorization: Bearer <opaque token>` and `X-Wahala-Protocol: 1`.

## 4. Wire protocol (`src/online/schema.ts`)

`PROTOCOL_VERSION = 1`. Every message is a flat JSON object `{ v, type, id?, ...fields }`. Limits (`LIMITS`): client message at most 4096 bytes, server message at most 256 KiB, ids at most 64 characters of `[A-Za-z0-9_.:-]`, `tick` at most 1,000,000.

Client -> server (`ClientMessage`, a discriminated union on `type`, derived from the schema):

| type | fields |
| --- | --- |
| `hello` | `client`, `token?` |
| `ping` | `t` |
| `queue.join` / `queue.leave` | `game`, `arenaId` / `ticketId` |
| `party.create`, `party.join`, `party.leave`, `party.invite`, `party.promote`, `party.kick`, `party.ready` | party ids, `code`, `friendId`, `memberId`, `ready` |
| `lobby.create`, `lobby.settings`, `lobby.ready`, `lobby.character`, `lobby.startReadyCheck`, `lobby.leave` | `roomId` plus `game`, `arenaId`, `characterId`, `ready` |
| `team.requestSwitch`, `team.balance` | `roomId` only: **no team field exists** |
| `match.start`, `match.join`, `match.leave`, `match.ready` | `roomId` / `matchId`, `ready` |
| `match.input` | `matchId`, `tick`, `intent` (the sim's `Intent`: `move`, `place`, `placeHeld`, `special`, `action`, `disarm`, `skill`, `detonate`, `vehicle`) |
| `match.resume` | `matchId`, `resumeToken`, `lastAckedTick` |
| `progress.settle` | `matchId` only |
| `social.friendRequest`, `social.friendRespond`, `social.inviteRespond` | `code` / `requestId` / `invitationId`, `accept` |

Server -> client (`ServerEvent`; on the wire `ServerMessage` adds `v`): `hello.ack`, `error`, `pong`, `queue.update`, `party.update`, `party.closed`, `room.update`, `match.countdown`, `match.snapshot`, `match.connection`, `match.results`, `progress.update`, `social.invitation`.

## 5. Validation boundary

- `validateClientMessage(unknown): Result<ClientMessage, ValidationError>` is strict: unknown `type` (`unknownType`), wrong `v` (`versionMismatch`), unknown keys (`unknownField`, which also stops `__proto__` / `constructor` smuggling), wrong types and out-of-range numbers (`invalid`), oversize strings / arrays / nesting (`tooLarge`), and **client-supplied authority** (`forbiddenField`: positions, `x`/`y`, kills, deaths, rewards, XP, rating, results, `team` / `teams`, `seed`, `state`, `snapshot` ... at any level). The only coordinates a client may send are the border `entry` of a vehicle launch, which is a choice the server checks against the legal entries.
- `decodeClientMessage(text)` checks the byte size and JSON first. `validateServerMessage` / `decodeServerMessage` validate the envelope and field kinds of server frames **shallowly**; nested payloads are trusted structurally, so a client treats everything it receives as display data.
- **These validators are for client UX and for the mock. A real server must re-validate every message itself, whatever the client already checked, and must never trust a client for anything but intent.** The mock does re-validate (`MatchService.submitInput` runs the intent schema, a tick window and a rate limit), as the real server must.
- The adapter drops a server frame that fails validation (it never acts on it) and never throws.

## 6. Authority model

The server runs the same `src/sim` (pure, deterministic, tick-based, seeded) and owns the `GameState`. Clients send **intents** (`submitInput(matchId, tick, Intent)`, the same `Intent` humans and bots use) and receive **public snapshots** (`MatchSnapshot`: tiles, players, generators, flames, clock, state hash) and events. A client never sends positions, kills, results, rewards or team assignments, and never learns the seed, the hidden pickups under crates or the rng (the descriptor and snapshots carry none; tested). Progression is applied by the server from the match it ran (`ProgressionService.settle`, idempotent per match id). Cosmetics never change a rule.

The mock proves this boundary on the real simulation: `createGame` + `tick` + the real `createBot` bots run behind `MatchService`; every accepted input is logged; `control.verifyReplay` re-runs the match from its seed and the input log and the state hash must equal the live one (tested), which is also what makes a resync from "snapshot + input log" meaningful.

## 7. Lifecycles

Room (pure `nextRoomState(state, event)`, table `ROOM_TRANSITIONS`):

```
              open            startReadyCheck           allReady              countdownDone
  created ----------> open -------------------> readyCheck ---------> starting -------------> inProgress
                        ^                           |                     |                       |
                        +------- readyFailed ------+                     |                       | matchEnded
                        +------------------ cancelStart ----------------+                       v
  any non-final state --- abort ---> aborted                                                  finished
```

Match (`nextMatchPhase`): `lobby -> countdown -> playing -> ended -> resultsPosted` (`cancelCountdown`: countdown back to lobby; `abort`: any live phase to ended; results can only be posted after the end). Input is accepted only in `countdown` / `playing` (`acceptsInput`).

Permissions (pure, in `lifecycle.ts`, used by the mock and mirrored by the UI to enable buttons):

- Party: the leader invites (while not full), kicks, promotes and opens the lobby; every member can leave; a started party cannot start again.
- Room: only the host changes settings and starts the ready check, and only while the room is `open`; a member toggles ready until the countdown; a team game needs a player on every team (checked after the server fills empty seats with bots).
- Teams: the **server** assigns them (even round-robin, bots balance the sides). A member can only **ask** to switch (`requestSwitch`): allowed in a team game, while the room is open, if not ready and if the other team has a free seat. The host can rebalance (clears ready flags). Teams lock at the ready check.

## 8. Reconnect

The descriptor of a match carries `graceMs` and a secret, seat-bound `resumeToken` (memory only). On a dropped connection the server holds the seat for the grace window (the seat idles; input is refused with `conflict`). `resume({ matchId, resumeToken, lastAckedTick })` inside the window returns the descriptor (with a **rotated** token: single use), a fresh snapshot, the input log since the client's last tick and the remaining grace. After the window a bot takes the seat for good and `resume` fails with `reconnectExpired`; a wrong token is `forbidden`; a finished match is `reconnectExpired`. The adapter's socket reconnects with exponential backoff and jitter (500 ms doubling to 15 s, 30 % jitter) and re-sends `hello`; the UI then calls `resume`. The preview has a "Simulate dropped connection" button (mock only) for the whole sequence.

## 9. Error states

`OnlineError` is a discriminated union on `code`: `unauthenticated`, `forbidden`, `notFound`, `conflict`, `roomFull`, `invalidMessage` (with the validator's `issues`), `invalidState` (with the state), `rateLimited` (`retryAfterMs`), `versionMismatch` (both versions), `serverUnavailable`, `timeout`, `reconnectExpired`, `internal`. HTTP mapping in the adapter: 400/422 invalidMessage, 401 unauthenticated, 403 forbidden, 404 notFound, 409 conflict, 426 versionMismatch, 429 rateLimited (Retry-After), 5xx serverUnavailable, abort timeout. The mock offers `control.faults.inject({ service, method, error, times })` to produce any of them in tests (including `serverUnavailable`, `timeout`, `roomFull`) and optional simulated latency (off by default).

## 10. Auth placeholder

`AuthToken` is opaque: `reveal()` gives the value to the transport only; `toJSON` / `toString` return `[redacted]`; it lives in memory only (never localStorage, never a URL, never a log line; tested against the stores). Mock sign-in: a guest account (id + display name remembered in `localStorage` through the `KeyValueStore` port, this device only) or a placeholder handle. **A real system must define real authentication** (accounts, OAuth / passkeys, guest-to-account linking, age and privacy rules); nothing here decides that.

## 11. What a real backend must implement

1. The endpoint list in section 3 (HTTPS, JSON, bearer token) and the secure streaming endpoint `/v1/stream`: first client frame `hello` (token), then the messages in section 4; the server pushes the events in section 4.
2. Authentication, account storage, guest accounts, session expiry and revocation.
3. Matchmaking (queues per game / arena / rating), parties, rooms, the lifecycles in section 7 and the permission rules, all enforced server-side.
4. **Server-authoritative match runners** executing `src/sim` (a Node process importing the same package, tick loop at 60 Hz, intents applied per tick), the input log, snapshot / delta broadcasting, reconnect handling.
5. Progression, ranking and leaderboards derived from matches the server itself ran (never from client reports); persistent storage; season rollover.
6. Re-validation of every message, rate limits, abuse handling, reporting and moderation.
7. Anti-cheat beyond authority: timing / input-rate analysis, collusion detection (none exists here).
8. Observability, deployment and scaling; privacy and data-protection compliance.

## 12. How to connect one later

1. Build the back end against section 3 / 4 (the TypeScript types and validators are the shared contract; publish `src/online/schema.ts` and `src/sim` to the server).
2. Build the client with `WAHALA_ONLINE_ENABLED=true WAHALA_ONLINE_URL=https://your-host/api npm run build` (public values, never secrets). The adapter chunk is emitted; `onlineMode` is `server`.
3. **Do not run that build through the static Pages deploy** (`check:static` rejects it on purpose; the single Pages publisher is described in `docs/CI.md`). Host it separately.
4. Replace the placeholder auth with the real flow; run the adapter's unit tests plus contract tests of the real server against `contracts.ts`.
5. Review `docs/VOICE_CHAT_DESIGN.md` before any voice work: voice is a separate, unfinished design.

## 13. Security notes

- No secrets in the browser: endpoints come from build env only, tokens are memory-only and redacted when serialised, `credentials: 'omit'`, `cache: 'no-store'`, the stream URL is derived from the API URL (secure scheme), never from user input.
- The default build has no network code at all (section 2); the mock uses no network API.
- The server must treat every client field as hostile (section 5), cap rooms / parties / queue sizes, rate limit per account and per address, and never echo another player's `resumeToken`.
- Snapshots must stay public views (no seed, no hidden pickups, no rng): add a test on the real server.
- Display names are validated (2 to 24 letters, digits, space, `_ . ' -`); render all names as text, never HTML.

## 14. What is NOT built

No server, database, accounts, matchmaking service, anti-cheat, moderation, payments, push notifications or real players. Voice chat, ads and seasons are data and interfaces only (their own documents). The server adapter skeleton is untested against a real back end, input acknowledgement over the stream is optimistic, and snapshot delta compression, clock-offset estimation and client-side prediction are not designed. The preview's "play it yourself" path hands a locally simulated final state to the mock server (`control.adoptLocalMatch`, marked PREVIEW ONLY): a real server never accepts a result from a client.

## 15. Tests

`tests/online/*` (schema incl. malicious payloads, lifecycle, every mock service, match authority and replay determinism, reconnect, error injection, the build guard, the adapter with fake transports), `tests/platform-static.test.ts` (the import-graph boundary and the no-network proof), `tests/app/menu-online.test.ts`, `tests/ui/onlineScreens.test.ts`, `e2e/online.spec.ts` (default build: no Online entry, nothing constructs a socket / WebRTC / microphone, campaign and a normal match start; `?mockonline`: the full mock flow to results with XP). Screenshots: `docs/screenshots/online-preview/`.
