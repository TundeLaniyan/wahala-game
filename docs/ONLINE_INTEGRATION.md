# City Rumble online: integration into the real game, behind flags (decisions ON1-ON12)

Branch `claude/wahala-online-integration`, from the mobile-performance integration (production `66f3e3d` + `claude/wahala-mobile-optimization`).
The multiplayer foundation is `claude/wahala-city-rumble-online-30w0rm` (`docs/CITY_RUMBLE_ONLINE.md`: server, replication codec, load results).
**Online Play is not public.** GitHub Pages stays the fully offline game; the public build contains none of this code.

## 1. Founder boundaries (do not drift)
- Public GitHub Pages must keep working with NO backend, forever. No paid hosting, cloud provisioning or domain work. No tunnels or LAN addresses hardcoded.
- Classic Blast keeps its name and place. City Rumble is the only multiplayer priority: 32 fighters, up to 32 humans, bots fill the rest.
- Offline City Rumble, Classic Blast, campaign, BREAK THE RING never depend on a server. No change to their simulation, progression or initial network need.
- The server is authoritative for movement validity, generator placement, collisions, explosions, damage and results. A client can never create a kill or an outcome.
- Do not rebalance gameplay, change the offline movement/assist behaviour, the iPhone zoom fix, Lekki visibility, night lighting or the mobile performance gains. Do not merge unapproved audio.

## 2. Two independent switches (ON1)
| Switch | Where | Effect |
| --- | --- | --- |
| **Build-time** `WAHALA_ONLINE_ENABLED=true` AND `WAHALA_ONLINE_URL=<endpoint>` | `vite build` / dev server environment | Compiles the online client in (`__WAHALA_SERVER_ONLINE__ = true`). Without BOTH, the constant is `false`, the bundler drops every online branch and no online chunk is emitted. `WAHALA_ONLINE_URL` may contain `{host}`, replaced at run time by `location.hostname` (the LAN development case) |
| **Runtime** `?online` | URL of a build that has the build-time switch | Shows the Online City Rumble entry on Home (`home-rumble-online`). Without it a server-enabled build looks exactly like the public game (no entry, no connection, no polling) |

A URL parameter alone can never enable online in a build made without the build-time switch (`?online`, `?server=`, `?mockonline` change nothing about sockets: no code exists to open one). The existing `?mockonline` preview stays as it was (local mock, no sockets). The endpoint is never taken from the URL, never from source: only from `WAHALA_ONLINE_URL`.

**Implemented (work package F, decisions ON1 / ON2 / ON11 [integration] in `docs/DECISIONS.md`)**
- `src/platform/flags.ts`: `rumbleOnline` (build switch AND endpoint AND `?online`) and `onlineEndpoint` (`WAHALA_ONLINE_URL` with `{host}` replaced by `location.hostname`; `resolveFlags(env, search, hostname)` is pure). The endpoint must be a `ws://` `wss://` `http://` `https://` URL, otherwise it is null and `rumbleOnline` is false. Nothing is read from the URL but the `?online` request itself. `?mockonline=0` (or `off` / `false` / `no`) now means "not set"; a bare `?mockonline` is unchanged.
- Truth table (build -> URL -> `rumbleOnline`, `onlineEndpoint`): default build, ANY query (`?online`, `?mockonline`, `?server=ws://x`, `?online&endpoint=...`) -> `false`, `null`; build switch without a URL, or a URL without the build switch -> `false`, `null`; server build without `?online` -> `false`, endpoint resolved; server build with `?online` -> `true`, endpoint resolved (`?endpoint=` / `?server=` ignored); bad scheme or bad hostname with `{host}` -> `false`, `null`.
- `src/online/rumbleEntry.ts` exports `rumbleOnlineAvailable()` (= `flags().rumbleOnline`, gates the Home button and any lazy screen), `rumbleOnlineEndpoint()` and `loadRumbleOnline()` (the single guarded dynamic import). For the public bundle to contain none of the Home button's code, gate its JSX on the build constant itself (`__WAHALA_SERVER_ONLINE__ && rumbleOnlineAvailable() && ...`): `scripts/check-static-build.mjs` fails a default build that still contains the `home-rumble-online` test id.
- `npm run build:online` builds a server-enabled app into git-ignored `dist-online/` with the template endpoint `ws://{host}:2567`.
- Proofs: `tests/platform-flags.test.ts` (truth table), `tests/platform-static.test.ts` + `tests/online/import-guard.test.ts` (import zone and guard detector), `tests/online/public-bundle.test.ts` (two real builds, source maps + manifest + string scans; part of the normal `vitest run`), `scripts/check-static-build.mjs` (CI: scans `dist`), `e2e/online-public-offline.spec.ts` (browser, default preview, desktop and mobile).

Nothing online runs until the player taps the entry: no WebSocket, no `fetch`, no discovery, no polling at load. The online code is a dynamic `import()` behind `if (__WAHALA_SERVER_ONLINE__)`, so ordinary visitors never download it.

## 3. Layers and import rules (ON2)
```
src/net/            pure shared netcode (protocol, pack, delta, replica, predict, hash, publicState): no DOM, no sockets      [from the foundation]
src/net/client/     browser client modules: Colyseus connection, inflate, RemoteMatchDriver implementation, local prediction [NEW, online chunk only]
src/app/remoteMatch.ts   types-only port between MatchController and an online match (no net imports)                       [NEW, in the main bundle: tiny]
src/app/rumbleOnline.ts  the lazily loaded online controller: store, room flow, results, status                              [NEW, online chunk only]
src/ui/online/rumble/    React screens of the online flow (entry, room, status chip, results)                               [NEW, online chunk only]
server/             authoritative Colyseus server, its own package, never bundled into the game                             [from the foundation]
```
- `src/app/MatchController.ts`, `session.ts`, `src/sim`, `src/ai`, `src/input`, `src/render` and the campaign NEVER import `src/net`, `src/online`, `src/app/rumbleOnline.ts` or `src/ui/online/**`. They may import `src/app/remoteMatch.ts` (types).
- The only edge from the main graph into online code is ONE guarded dynamic import (`src/online/rumbleEntry.ts`): `if (!__WAHALA_SERVER_ONLINE__) return null; return import('../app/rumbleOnline')`.
- `@colyseus/sdk` is a root devDependency imported only from `src/net/client/connection.ts`.

## 4. The remote match (ON3)
`MatchController.startRemote(driver)` (see `src/app/remoteMatch.ts`): the controller keeps its whole presentation pipeline and replaces only the two sources:
state comes from `driver.advance(dtMs)` (server frames played out at 60 ticks/s), the local intent goes to `driver.sendIntent(...)`. The local seat is `driver.localId`, not the literal `0` (the `LOCAL_ID` constant in the controller becomes a field). No bots run on the client; the controller's results flow is replaced by the online controller's results screen over the frozen board; Retry / Menu leave the room.

## 5. Prediction (ON4-ON5)
Goal: remove the measured 191-457 ms input-to-visible delay under Nigerian/mobile network profiles for the LOCAL fighter's movement, without ever letting the client decide an outcome. The server remains authoritative; the client renders the local fighter ahead using the sim's own movement rules on the replica's board and reconciles against server frames (smoothly when close, snap when far). Prediction covers walking only: generator placement, damage, kills, pickups and results are shown when the server says so. The predicted copy never feeds the HUD's scores, the results, or anything the sim reports.
Design, overlay protocol, constants and measurements: `docs/ONLINE_PREDICTION.md`.

## 6. Disconnects (ON6-ON8), all values configurable on the server
`RUMBLE_GRACE_SECONDS` (0..60, default 5: the seat just stands where it is, no bot yet), `RUMBLE_RECONNECT_SECONDS` (default 30: the reserved window to come back to the SAME living fighter), `RUMBLE_DROP_POLICY` (`bot`, default: a bot plays the seat after the grace period without pausing the match; `idle`). Details, the results fields and the open questions: `docs/CITY_RUMBLE_ONLINE.md` section 8. Scope: the reserved seat applies while a match is playing (including while a client is still loading it). A drop in the lobby or the countdown is a lobby drop: the member leaves the room, the match starts without them, and the client shows "You were disconnected from the room" with Try again (`e2e/rumble-online.spec.ts` scenario 3 covers the loading-phase drop). Reconnecting returns to the same fighter at its current place: no extra life, no position reset. Results and stats separate what the human did from what the replacement bot did; **bot kills are never credited to the absent player's personal achievements** (the match score that decides a team or Sudden Death result still follows the sim's rules). Unresolved, to be decided by the founder before ranked play or rewards: whether bot-time counts toward ranks/XP, whether a long absence forfeits, whether a returning player keeps autopilot kills in team scores.

## 7. Local testing on a laptop and phones (ON9)
See section "Run it" in `docs/CITY_RUMBLE_ONLINE_LOCAL.md` (written by the dev-setup work package): `npm run dev:online` starts the Node server and the Vite dev server with the build-time switch on; phones on the same Wi-Fi open `http://<laptop-lan-ip>:5173/?online` (the Vite dev server serves `/`; only build / preview use `/wahala-game/`); the endpoint is `ws://{host}:2567` with `{host}` the page's own hostname. HTTPS pages (GitHub Pages) cannot reach an insecure `ws://` server (mixed content): the LAN setup is HTTP-to-WS on purpose; a secure temporary path (a TLS tunnel or `mkcert`) is documented as a future option, nothing is provisioned.

## 8. Work packages and file ownership
| WP | Owner | Files (exclusive) |
| --- | --- | --- |
| F flags, guards, public-bundle assertions | agent F | `src/platform/flags.ts`, `src/online/rumbleEntry.ts`, `vite.config.ts` (online define only), `scripts/check-static-build.mjs`, `tests/platform-*.test.ts`, `tests/online/*`, `e2e/online-public-offline.spec.ts` |
| S server: disconnect policy, stats, LAN config, dev scripts | agent S | `server/**`, root `package.json` scripts `dev:online`, `docs/CITY_RUMBLE_ONLINE_LOCAL.md` |
| U online UI and controller | agent U | `src/app/rumbleOnline.ts`, `src/ui/online/rumble/**`, `src/ui/menu/HomeScreen.tsx` entry button, `src/app/menu.ts` (screen id), `e2e/rumble-online-*.spec.ts` |
| D remote match integration (MatchController, session, driver, client) | release owner | `src/app/MatchController.ts`, `src/app/session.ts`, `src/app/remoteMatch.ts`, `src/net/client/**` except prediction |
| P prediction | agent P (Opus) | `src/net/client/prediction/**`, `tests/net/prediction*.test.ts` |

## 9. Validation record (branch `claude/wahala-online-integration`)
Everything below was run in the development container (software WebGL, no physical phone, no cloud server). A physical-phone test on a real network is still the founder's acceptance gate.

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Public production mode, no backend | The default build launches with nothing listening on :2567; no WebSocket is opened, no discovery or polling | `npm run check:static` (no socket / WebRTC / microphone code, no online chunk markers, no endpoint or private address in `dist`); `tests/online/public-bundle.test.ts`; `e2e/online.spec.ts` (`?online`, `?server`, `?voice` do nothing) |
| 2, 3 | Offline gameplay, Classic Blast and the campaign unchanged | Full unit suite 334 files / 5,271 tests green on the integrated branch (after two import-guard updates, section 3); the CI browser suite runs on the production merge | `npm run check` |
| 4 | Online flag disabled | No Online entry on Home, no controller loaded | `tests/platform-flags.test.ts`, `tests/platform-static.test.ts`, `tests/online/import-guard.test.ts` |
| 5 | Online flag enabled locally | `npm run build:online` + `npm run dev:online`; `?online` shows PLAY ONLINE | `docs/CITY_RUMBLE_ONLINE_LOCAL.md` |
| 6 | Two real browsers, one match | Desktop host + phone-sized guest (832 x 384, touch): join by invite code, ready, start, play | `npm run test:online-e2e` scenario 1 |
| 7 | 32-fighter room with bots | 2 humans + 30 bots; results table 32 rows, 2 `HUMAN` + 30 `BOT`, identical for both viewers | scenario 1; `docs/CITY_RUMBLE_ONLINE.md` section 7 |
| 8 | Up to 32 simulated human connections | 32 clients in one room on every network profile; 256 clients (8 rooms x 32) all hash-consistent | `server/bench/` (`docs/CITY_RUMBLE_ONLINE.md` sections 7.3, 7.4, 7.5) |
| 9 | Disconnect and reconnect | Mid-match drop: told, a bot plays after the grace, the same fighter returns (no reset, no extra life), bot time is noted in the results and not credited to the human | scenario 1 |
| 10 | Touch controls and prediction | The phone's thumbstick moves the fighter (move assist and server both run); prediction measured per network profile | scenario 1; `docs/ONLINE_PREDICTION.md` |
| 11 | Identical authoritative results | Both clients render the same 32-row table (compared modulo the viewer's own `YOU` tag); the final replica hash matches the server | scenario 1; replica hash checks |
| 12 | Disconnect during loading and during a match | Server unreachable: a plain message, no endless spinner, the offline game still works (scenario 2). Drop while the match is loading (arena models held back): told, reconnects, gets into the same seat (scenario 3). A drop in the lobby / countdown is a lobby drop (ON15) | scenarios 2 and 3, five consecutive passes of scenario 3 after the fixes ON13-ON14 |
| 13 | Mobile-landscape layout | Room, match HUD with the connection chip, the reconnect banner and the results fit 832 x 384 (screens as the two real browsers render them) | `docs/screenshots/online-e2e/` (opt-in capture: `ONLINE_E2E_SHOTS=<dir>`); portrait and other sizes in `docs/screenshots/online-ui/` |
| 14 | No regression of the mobile performance gains | Default build, emulated phone (844 x 390, DPR 2), cold menu, 3 runs: **5,363 KB -> 5,367 KB** raw transfer (+4 KB, +0.14 %), 28 requests both, 0 WebSockets, JS heap 24-31 MB both (noise). Online code is a separate chunk that a default build does not contain. | measured against the production build `f63e40c`; software emulation, not a physical phone |

Found and fixed by the real two-browser run (decisions ON13-ON15): the SDK's 5 s minimum uptime blocked reconnection of a phone that drops while loading; the lazy in-match layer was fetched at match start (a drop at that moment left no banner); model downloads are now prefetched when the lobby names the arena; server liveness tolerance is configurable.

Known limits (not fixed here): the results table shows the top rows first and scrolls (pinning the viewer's own row is a polish item); the e2e needs a generous server liveness setting on a CPU-starved software-GL machine (`scripts/online-e2e.mjs`); `server/` unit tests are run by `cd server && npx vitest run` and are not part of the root CI.
