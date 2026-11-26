# Player platform in the browser client (private multiplayer tests)

Branch `claude/wahala-mp-client`. The browser half of the private multiplayer integration: invited testers enter Online City Rumble as **guests of the player platform** (`player-platform/`), pick a nickname, add friends by code, form a party, and enter the **same private City Rumble room** with signed match tickets; in the room they see who is a verified platform player, send preset quick signals, and can mute / block / report. The server side (ticket verification, result reporting, signal relay) is the lead's change in `server/**` and is coded against here as the contract below; nothing in `server/**`, `player-platform/**`, `.github/**` or `src/sim|ai|render|audio|campaign` was changed.

**Nothing here is public.** The GitHub Pages build contains none of it (section 2). No browser run of these screens was done on this branch: what is proven is in section 8.

## 1. What was built

| Area | What the tester gets | Where |
| --- | --- | --- |
| Guest identity | Opening the Online screen signs this device in as a platform guest (`POST /v1/auth/guest`, once; the session is reused afterwards). The first nickname offered is the one typed on the entry screen (unless it is the default "Player"); if the platform refuses it, it picks one. | `src/online/platform/client.ts` `ensureGuest`, `controller.ts` `open` |
| Identity card | Nickname, a **Guest** label (from the platform's `kind`), friend code (grouped 4 + 4, Copy), the fighter chosen in the game, a line that a guest lives on this device only | `PlatformPanel.tsx` `Identity` |
| Nickname | Change it in place; `name_taken`, `name_rejected` (the platform's own words) and the once-a-day cooldown (with the retry time) are shown under the field | `controller.ts` `setNickname`, `nameErrorText` |
| Friends | Add by friend code (8 characters of the room-code alphabet, typed or pasted with spaces / dashes), incoming requests (accept / decline), outgoing (cancel), friends with presence, remove, blocked players (unblock) | `PlatformPanel.tsx` `Friends` |
| Party | Create (Free-for-All or Team Rumble), join by party code, invitations (accept / decline), members with LEADER / READY / YOU tags and presence, ready toggle, leader: mode, make leader, remove, invite friends, **Start private match**; everyone: **Join match**, **Leave party**; leader outside the room: **Back to party lobby** | `PlatformPanel.tsx` `NoParty`, `PartyBlock` |
| Match handoff | Leader: host ticket -> creates the private room with it -> reports the room code to the party. Members: the party poll sees the code -> fetch a member ticket -> join (automatically once per code while on the entry screen, else the Join match button) | `controller.ts` `startMatch`, `roomChanged`, `joinMatch`; flow `openTicketed` |
| In the room | A **VERIFIED** tag next to platform players, a "⋯" menu on every other member, a party strip ("Your party is in room ..."), the quick-signal picker and feed | `connected.tsx` `PlatformRoomScreen`, `MemberMenu.tsx`, `Signals.tsx` |
| Member menu | Verified player: **Mute / Unmute**, **Block** (with a confirm step), **Report**. Guest (no platform id): **Hide their signals** only, local to this page, nothing sent. A verified player while the platform is down: the local hide too | `MemberMenu.tsx` |
| Report | One of the platform's 7 categories, optional note (at most 200 characters, counted; the text is cleaned like the platform does), sent with the context the platform needs (section 5) | `MemberMenu.tsx`, `controller.ts` `report` |
| Quick signals | The 21 presets only, filtered by phase: room and results = `lobby` ids, Free-for-All match = `match` ids, Team match = `team` + `match` ids, countdown = none. The same id is not resent within 2 s. Incoming: the room / results feed, and **in a match one line in the HUD rail** (the game's own notice column beside the board), never over the arena | `src/online/platform/signals.ts`, flow `sendSignal` / `signal`, `rumbleOnline.ts` `railSignal` |
| In a match | A small **Signal** button under the connection chip (top-right); the presets open only when tapped and close after one is sent | `Signals.tsx` `MatchSignalButton` |
| After the match | Results show the signal panel (Good game, Rematch?) and a line that Rematch returns everyone to the room lobby and that leaving the room does not leave the party. Back in the room the party strip shows the party again; the leader can **Send this room to my party** when the platform has put the party back into its lobby | `PlatformResultsExtra`, `RoomParty` |

No ranked, XP, reward, text-chat or voice UI exists; the platform's dev text-chat, voice and party-signal routes are never called.

## 2. Flags and build

| Switch | Effect |
| --- | --- |
| `WAHALA_PLATFORM_URL` (build time, `{host}` allowed, http:// or https:// only) | Only inside a SERVER build (`WAHALA_ONLINE_ENABLED=true` + `WAHALA_ONLINE_URL`): `flags().platformEndpoint` is the URL with `{host}` filled in. Any other build: `null` |
| `flags().platform` | `rumbleOnline` (server build + `?online`) AND `platformEndpoint`. The URL query can never turn it on |
| `__WAHALA_PLATFORM__` (vite `define`) | Same rule as `platformEndpoint` at build time (`vite.config.ts`, `tests/online/build-guard.test.ts` compares both); false in test mode |
| `platformEnabled()` (`src/online/platform/enabled.ts`) | `__WAHALA_PLATFORM__ && flags().platform`: the online screens mount the platform parts only then; otherwise they render exactly as before (guests only, no party / friends / signal UI) |

Build a test client: `WAHALA_ONLINE_ENABLED=true WAHALA_ONLINE_URL='ws://{host}:2567' WAHALA_PLATFORM_URL='http://{host}:4567' npx vite build --outDir dist-online --emptyOutDir` (the same as `npm run build:online` plus the platform URL; `dist-online/` is git-ignored). The platform must list the page's exact origin in `PLATFORM_ALLOWED_ORIGINS` (its CORS rule), e.g. `http://192.168.1.20:4173`.

**Bundle proof** (`tests/online/public-bundle.test.ts`, real builds): the default build contains no platform module, no `wahala.platform.v1`, `/v1/auth/guest` or `/match/ticket` string (also scanned by `scripts/check-static-build.mjs` in CI: these are now `ONLINE_CHUNK_MARKERS`); a server + platform build has the platform code only in chunks reachable from the online dynamic entries (`rumbleOnline-*.js` and a shared `connected-*.js`), never in what the page loads at start-up; a platform URL without the server build adds nothing. Source-level: `src/online/platform/**` and `src/ui/online/platform/**` are in the online zone (`tests/online/importGuard.ts`), reachable only through the guarded dynamic import. The one platform trace in a server + platform build's entry chunk is the URL template inside the inlined `import.meta.env` (the same as `WAHALA_ONLINE_URL` today). Note: the older scaffold `src/online/server/adapter.ts` (its own guarded chunk, pre-existing) also names `/v1/auth/guest`; it is not used by this client.

**Nothing runs at page load.** The controller is created when the online chunk loads (the player tapped PLAY ONLINE) and sends nothing until the Online screen calls `open()` (`tests/ui/platform-screens.test.ts` loads the chunk with a throwing `fetch`).

## 3. Files

| File | Role |
| --- | --- |
| `src/platform/flags.ts` | `platform`, `platformEndpoint`, `resolvePlatformEndpoint` |
| `vite.config.ts`, `src/vite-env.d.ts` | `__WAHALA_PLATFORM__` |
| `src/online/platform/types.ts` | The platform's wire shapes this client reads (copied; the game never imports `player-platform/`) |
| `src/online/platform/tokens.ts` | The `wahala.platform.v1` session store, memory fallback |
| `src/online/platform/client.ts` | `PlatformClient`: fetch with timeout, error envelope, Bearer token, ONE shared refresh, typed routes |
| `src/online/platform/controller.ts` | Zustand store + actions, polling, heartbeat, match handoff, report context |
| `src/online/platform/signals.ts` | Preset labels (copied from the platform catalogue), phase filtering |
| `src/online/platform/enabled.ts` | `platformEnabled()`, `platformEndpoint()` |
| `src/ui/online/platform/*` | `PlatformPanel`, `MemberMenu`, `Signals`, `connected` (the store-connected screens), `models`, `platform.css` |
| `src/net/client/{types,connection,session}.ts` | `OpenRequest.ticket` (create / join only), `MSG.signal` send, `MSG.signalIn` receive, failure reason `ticket` |
| `src/app/rumbleOnlineFlow.ts` | `openTicketed`, one automatic retry with a NEW ticket, `sendSignal`, signal feed, local mutes, `matchId`, `ticketed` |
| `src/app/rumbleOnline.ts` | Creates the controller (platform builds only), the room bridge, the HUD-rail signal line, open / close with the Online screen |
| `src/ui/online/rumble/{EntryScreen,RoomScreen,ResultsPanel}.tsx` | Optional slots only (`extra`, `memberExtra`, `overlay`) |
| `src/ui/online/rumble/{RumbleOnlineScreen,RumbleOnlineOverlay}.tsx` | Pick the platform screens when `platformEnabled()` |

## 4. Sessions and tokens

- One localStorage key, `wahala.platform.v1`: `{ v: 1, accessToken, accessExpiresAt, refreshToken, refreshExpiresAt }`. Every access is in try/catch; when storage is missing, throws, or a write fails, the session lives in memory for the page (private mode works; the guest is lost when the tab closes). `tests/online/identity-and-wording.test.ts` checks that `tokens.ts` is the only platform module touching storage and that it uses that one key.
- An authenticated call that gets 401 `unauthenticated` refreshes once and repeats. **Refresh rotates both tokens**; the new pair is stored before anyone can send the old refresh token again; concurrent 401s share one `POST /v1/auth/refresh`; a call that used an access token that has since been rotated (by this tab or another one, re-read from storage) just uses the new one. A refused refresh forgets the session (it is never presented again) and the panel offers Retry, which starts a new guest.
- Identity is always the token's. No body carries a player id, status or owner: the only player ids in bodies are the routes' own target fields (`kick` / `promote` `playerId`, invite `friendId`, report `reportedId`); `status` appears only in the presence heartbeat (`"online"`).
- Fetch: `credentials: 'omit'`, `cache: 'no-store'`, 8 s timeout (abort), only to the configured base URL.

## 5. The server contract as implemented

1. **Tickets.** `OpenRequest` has an optional `ticket`; `Connection.open` adds `ticket` to the options of `create` (with `private: true`) and `joinById`, never to Quick Play. A ticket is fetched (`POST /v1/parties/{id}/match/ticket`) right before it is used. A refusal whose message contains `ticket` (`invalid ticket`, `ticket not valid for this room`, `ticket already used`) is the new failure reason `ticket` ("Your sign-in for this match expired. Try again.", `classifyFailure` and `errorMessage`; the existing reasons and tests are unchanged; `room_unavailable;retry=...` still wins when the server answers that way). The flow then fetches ONE new ticket and retries once; a second refusal, or no new ticket, shows that error. "Try again" always asks for a new ticket, and after a lost ticketed create it rejoins the room by code with a member ticket (never as an anonymous guest).
2. **Verified seats.** A member is shown as verified only with `verified: true` AND a non-empty `playerId` (`memberTarget`). Platform actions use that `playerId`; guests get the local hide only.
3. **Quick signals.** `RumbleSession.sendSignal(id)` -> `room.send('sig', { id })`; `ConnHandlers.signal` / `RumbleSessionEvents.signal` receive `SignalInMsg` (`'sigr'`). Unknown ids are dropped; names are React text (cut at 40 characters). Mine = the same seat (match) or name (lobby) as my lobby member. Both fakes (`rumbleOnlineFake.ts`, the tests' sessions) implement `sendSignal`.
4. **Results.** The client never reports a result. The match id (descriptor / results) is kept only as the `contextRef` of a report.
5. **Reconnection.** Unchanged (`Connection`, 30 s, the SDK's own token); the room's "Connection lost. Trying to get you back." line and the match banner are the existing ones; no ticket is ever used for it.

**Report context** (the platform needs a real interaction): the current room's match id (`context: "match"`) once a match has started (needs the server's `matches/started` call to list both players), else the party both are in (`party` + party id), else a friendship (`profile`); otherwise the form is refused client-side with a plain line.

## 6. Polling, presence and failure behaviour

- `PUT /v1/presence {status:"online"}` on open and every 30 s while the Online screen is open (the platform forgets presence after 90 s; any authenticated call also refreshes its "last seen", which keeps a party member from being dropped after 10 minutes).
- `GET /v1/parties/current` every 2 s **only while a platform panel is on screen** (entry or room; not during the match); invitations and friend requests every third tick; every timer stops when the Online screen closes.
- Platform down, 5xx, timeout: the entry panel says "Friends and parties are unavailable right now. You can still play online as a guest." with Retry; during polling a small "not answering, retrying" line (the room strip adds "The room is not affected"). 429: the platform's message plus a wait hint. Nothing a platform call does can close, leave or change the room or a running match; the only room actions are the player's own (start, join, leave).
- Party gone (closed, kicked): "You are no longer in a party ..."; leaving yourself: "You left the party."; a leader who leaves is replaced by the platform (the poll shows it).
- Auto-join: a member on the entry screen whose party has an open room joins it once per room code; leaving that room does not pull them back (Join match does).

## 7. data-testids

Platform (`pf-`): `pf-panel` (with `data-phase`), `pf-connecting`, `pf-unavailable`, `pf-retry`, `pf-stale`, `pf-message`, `pf-message-dismiss`, `pf-tab-you`, `pf-tab-friends`, `pf-tab-party`;
identity `pf-identity`, `pf-nickname`, `pf-guest-label`, `pf-name-edit`, `pf-name-input`, `pf-name-save`, `pf-name-cancel`, `pf-name-error`, `pf-friend-code`, `pf-copy-friend-code`, `pf-fighter`;
friends `pf-friends-tab`, `pf-friend-code-input`, `pf-add-friend`, `pf-friends`, `pf-friend`, `pf-friend-presence`, `pf-friend-invite`, `pf-friend-remove`, `pf-requests-in`, `pf-request-in`, `pf-request-accept`, `pf-request-decline`, `pf-requests-out`, `pf-request-out`, `pf-request-cancel`, `pf-blocks`, `pf-blocked`, `pf-unblock`;
party `pf-no-party`, `pf-party-new-mode-ffa`, `pf-party-new-mode-team`, `pf-party-create`, `pf-party-code-input`, `pf-party-join`, `pf-invites`, `pf-invite`, `pf-invite-accept`, `pf-invite-decline`, `pf-party` (with `data-status`), `pf-party-code`, `pf-party-copy-code`, `pf-party-mode-ffa`, `pf-party-mode-team`, `pf-party-mode` (read-only), `pf-party-members`, `pf-party-member` (`data-ready`, `data-you`), `pf-member-promote`, `pf-member-kick`, `pf-party-status`, `pf-party-ready`, `pf-party-start`, `pf-party-join-match`, `pf-party-end-match`, `pf-party-leave`, `pf-party-invite-list`, `pf-party-invite`;
room `pf-room-party`, `pf-room-party-members`, `pf-room-party-status`, `pf-party-share-room`, `pf-verified`, `pf-member-menu`, `pf-member-dialog` (`data-verified`), `pf-member-mute`, `pf-member-unmute`, `pf-member-block`, `pf-member-block-confirm`, `pf-member-blocked`, `pf-member-report`, `pf-member-local-mute`, `pf-member-local-unmute`, `pf-member-guest-note`, `pf-member-close`;
report `pf-report-form`, `pf-report-category-<category>` (`abusive_name`, `harassment`, `cheating`, `spam`, `inappropriate_content`, `impersonation`, `other`), `pf-report-note`, `pf-report-count`, `pf-report-cancel`, `pf-report-send`;
results `pf-results-extra`, `pf-results-hint`.

Quick signals (`qs-`): `qs-panel`, `qs-picker`, `qs-send-<id with dots as dashes>` (e.g. `qs-send-chat-ready`, `qs-send-ping-attack`), `qs-blocked`, `qs-feed`, `qs-feed-item` (`data-signal`), `qs-hud`, `qs-hud-toggle`, `qs-hud-picker`, `qs-hud-send-<id>`. Incoming signals during a match are the HUD rail's existing `toast` rows.

## 8. Verification

Run in this worktree: `npm run typecheck`, `npm run lint`, `npx vitest run tests/online tests/platform-static.test.ts tests/platform-flags.test.ts tests/ui tests/app tests/net` (all green), `npm run build` + `node scripts/check-static-build.mjs dist` + a grep of `dist` for the platform strings (none), and the server + platform build above (strings only in `rumbleOnline-*.js`; the platform UI in the lazy `connected-*.js`).

| Test | Proves |
| --- | --- |
| `tests/online/platform-client.test.ts` | Guest once then reused; taken nickname fallback; rotation; concurrent 401s -> one refresh; no refresh token sent twice over 5 expiries; another tab's rotation picked up; refused refresh forgets the session; error envelope; down / 503 / timeout as values; no smuggled body keys; base URL only, no cookies; throwing or missing storage |
| `tests/online/platform-controller.test.ts` | (against `tests/online/fakePlatform.ts`, an in-memory platform with rotating refresh and strict bodies) open / unavailable / retry; polling only while visible; timers stop; nickname errors; friends both ways; block / mute; host ticket -> create -> code report; member auto-join once with a fresh ticket, refetch gives a new ticket; Quick Play never reported; closing a stale match first; leader controls, kicked vs left; invitations; outage never touches the room; share room after the match; report context and note |
| `tests/app/rumble-online-flow.test.ts` (new blocks) | Tickets only on create / join; one automatic ticket retry; sign-in-expired error; Try again never re-sends a ticket and never drops to a guest join; phase-allowed signals, 2 s repeat guard, no send while disconnected; labelled feed, unknown ids dropped, six kept; local mute; HUD hook only in a match; restricted notice; match id |
| `tests/online/platform-signals.test.ts` | Labels / ids equal the platform catalogue (parsed from its source) and `SIGNAL_IDS`; places; `ticket` classification and wording |
| `tests/ui/platform-screens.test.ts` | SSR of every panel state, member menu (verified / guest / platform down), report form, signal picker per phase, 44 px rules in the stylesheet, the room / results slots, and the online screens with / without a platform build (no request when the chunk loads) |
| `tests/platform-flags.test.ts`, `tests/online/build-guard.test.ts`, `tests/online/public-bundle.test.ts`, `tests/platform-static.test.ts`, `tests/online/identity-and-wording.test.ts` | Flag truth table; define = flags; the bundle facts of section 2; the online zone; one storage module / key |

**Not done here:** no browser or phone run of these screens (the lead writes the e2e; the `pf-` / `qs-` ids above are for it), no run against the real platform service or the lead's server change, no screenshots. Layout was written to the online screens' rules (44 px targets, wrap, no sideways scroll, landscape and portrait media queries) but not looked at.

## 9. Decisions and known limits

- **Restricted signals.** `/v1/me` capabilities carry `textChat`, `voice`, `purchases`, `friendCodeOnly`: there is no "signals" capability. Text and voice are never offered whatever they say. A signals restriction is learnt from the server: a `notice` whose `code` contains `restrict` hides the picker until the next room (`signalsBlocked`). **Ask for the server change:** send such a notice (e.g. `signals_restricted`) when the filter refuses a sender.
- **Local mute is by name.** `SignalInMsg` has no stable member key; a hidden name is compared with `name` (and stays hidden for the page). Two guests with the same name would both be hidden. A platform mute also hides the name at once (the server applies the mute within its 30 s filter refresh).
- **No friend request from the room.** The platform adds friends by code only (decision PP7); a player id is not enough.
- **Party signals** (`/v1/parties/{id}/signals`, platform-relayed) are not used: signals are the room's.
- **Fighter.** Before a ticket is fetched the platform's `selectedCharacter` is set to the game's fighter (`PATCH /v1/me`, best effort) so the ticket's `char` matches.
- **Entry name.** The platform nickname is copied into the entry's name field (unticketed rooms and Quick Play keep using that field; a ticketed room uses the ticket's name on a verifying server).
- **Two tabs refreshing in the same instant** could both present the same refresh token (the platform then revokes the session; Retry starts a new guest). Each tab re-reads storage before refreshing, which closes all but a few-millisecond window.
- **Rematch vs the party.** After the server reports the match finished, the platform puts the party back into its lobby while the room lingers for a rematch; members still in the room stay; the leader can send the room to the party again (`pf-party-share-room`).
- **The leader's "Back to party lobby"** (`DELETE /v1/parties/{id}/match`) is offered only outside the room; starting a new match while the party is still marked in one closes it first.
