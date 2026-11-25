# Player platform: Stage 0 audit of what already exists

Branch `claude/wahala-player-platform-v1` (worktree off `0507d47`). Written BEFORE the platform code. Rule that follows from it: **do not build a second account, party or matchmaking system next to the ones that exist**. The match server owns lobbies, seats, teams, the 30 s wait, bot fill and reconnection. The platform owns who a player *is* and who they *know*.

Legend: **IMPLEMENTED** = real code that runs and is tested. **MOCKED** = in-memory scaffold, no real back end. **MISSING** = nothing exists. **INCOMPATIBLE** = exists but cannot be reused as is (reason given).

## 1. Matrix

| # | Area | State | Where | What this means for the platform |
| --- | --- | --- | --- | --- |
| 1 | Authoritative City Rumble match server (Colyseus, 32 fighters, FFA / Team, server bots, reconnect) | **IMPLEMENTED** | `server/src/app.ts`, `rooms/RumbleRoom.ts`, `core/*`; `docs/CITY_RUMBLE_ONLINE.md` | Untouched. Approved rules kept: 32 seats, 30 s public wait then labelled bots (`PUBLIC_WAIT_SECONDS`), 5 s grace + 30 s reconnection, no new humans after start. |
| 2 | Private room codes (6 chars, `create` / `joinById`), public Quick Play filtered by mode | **IMPLEMENTED** | `src/net/protocol.ts` (`ROOM_CODE_*`, `normalizeRoomCode`), `app.ts` `guardedInvoke` | The *match room code* is the only thing the platform needs to hand a party. It is routing data, not authority (the server still decides if a join is allowed). A party has its own, separate **party code**. |
| 3 | Anonymous guest session id `gid` (128 random bits, memory only) used for rate limits | **IMPLEMENTED** | `GUEST_ID_RE`, `server/src/core/guard.ts` | Stays as the match server's anonymous abuse key. It is *not* the account id and is not replaced. Guests without a platform account keep playing exactly as today. |
| 4 | Nickname validation + anti-impersonation (NFKC, mixed-script, `nameSkeleton`, reserved / bot-like names, per-room de-dup " 2") | **IMPLEMENTED** | `checkPlayerName`, `nameSkeleton`, `looksReserved` in `src/net/protocol.ts`; `Lobby.uniqueName` | **Reused verbatim** by the platform (imported, not copied), so a platform name is always acceptable to the match server. The platform adds what a room cannot: global uniqueness by skeleton. |
| 5 | Player accounts / sign-in | **MOCKED** (client contract + in-memory mock) / **MISSING** (server) | `src/online/contracts.ts` `AccountService`, `src/online/mock/accounts.ts`, adapter skeleton `src/online/server/adapter.ts` | Real implementation built here (Checkpoint A). See section 2 for the path differences from the adapter skeleton. |
| 6 | Friends / friend requests / invitations | **MOCKED** | `SocialService`, `mock/` | Real implementation (Checkpoint B). Shapes (`Friend { accountId, displayName, presence }`) kept compatible. |
| 7 | Parties (create, join by code, invite, promote, kick, ready, leader rules) | **MOCKED** + pure rules | `PartyService`, `lifecycle.ts` `partyPermissions` | Real implementation (Checkpoint B) mirrors those permission rules; the leader opens the match, nobody else. |
| 8 | Platform-owned matchmaking queue, lobby, team service, match service (`MatchmakingService`, `LobbyService`, `TeamService`, `MatchService`) | **INCOMPATIBLE** with the real server | `contracts.ts` | These contracts describe a *second* matchmaking stack (queue tickets, rooms with `ready` / `character` / team switching, input over a platform socket). The real server already does all of it differently (Colyseus rooms, server-owned teams, a different wire format). **Not implemented, not to be implemented**: the old mock keeps serving the offline preview only. |
| 9 | Presence | **MISSING** (`Presence` type only) | `types.ts` | Built (Checkpoint B): heartbeat + TTL, privacy setting, block-aware. |
| 10 | Progression (XP, level, rank, history) and leaderboards | **IMPLEMENTED** as a pure client model; **MOCKED** as a service | `src/progression`, `mock/progress.ts` | Ranked and persistent competitive rewards are **deferred by founder decision** (PIS7, `ONLINE_REQUIREMENTS_MATRIX.md` row 6). The platform stores only *non-ranked match participation facts* and writes no XP, rank, rating or reward. |
| 11 | Match results from the server | **IMPLEMENTED** in memory | `RumbleMatch.results()`, `ResultsMsg` (placement, kills, deaths, assists, bot / absence split ON7) | The server holds results and persists nothing (decision PIS7). The platform exposes a **signed internal endpoint** for the server to post them; clients can never post a result. The server-side call is the one small change Architecture must make (handoff doc). |
| 12 | Cosmetics catalogue (24 fictional entries: `fighterSkin`, `vehicleCosmetic`, `finisher`, `emote`, `banner`; unlock rules; loadout sanitising) | **IMPLEMENTED** as data; renderer does not read it; nothing for sale | `src/cosmetics` | Preserved. Commerce products point at these ids. Gap: no **generator skin** kind exists (see section 3). |
| 13 | Entitlement hook for premium narration | **IMPLEMENTED** (free tier only) | `src/campaign/narration/entitlements.ts` (`fullNarration`, `extendedLore`, `altPerformance`) | Preserved: the platform's entitlement table can carry these keys, so a purchase can later feed the existing `EntitlementPort`. |
| 14 | Seasons / challenges | **IMPLEMENTED** as data | `src/seasons` | Out of scope. A season reward could later *grant* an entitlement through the same fulfilment path. |
| 15 | Ads | **IMPLEMENTED** as interface, default-deny, off | `src/ads` | Out of scope. Ad-free / COPPA-style age gating would use `age_group`. |
| 16 | Payments, receipts, store, currency | **MISSING** (grep across `src`, `docs`, `server`: no provider, no price) | – | Built as provider-independent foundations with a development-only mock (Checkpoint D). No real payment is possible. |
| 17 | Voice chat | **IMPLEMENTED** as interfaces + null / mock provider + design | `src/voice`, `docs/VOICE_CHAT_DESIGN.md` | Platform supplies the *server-side permission decision* the design requires (`permissionsFor`) and a technical design for WebRTC / SFU (Checkpoint C). No audio is moved. |
| 18 | Text chat, quick chat, pings, emotes, mute / block / report | **MISSING** (the Pidgin "reactions" are recorded audio lines, unrelated) | `src/audio/pidginReactions.ts` | Built (Checkpoint C): preset signals only; text chat designed, dev-only version behind a flag refused in production. |
| 19 | Match-server security | **IMPLEMENTED** | `docs/ONLINE_LIMITS_AND_SECURITY.md`, `guard.ts`, `clientIp.ts`, `logGuard.ts` | Patterns reused (trusted-proxy address rule, token buckets, uniform errors) in separate platform code. The server's behaviour is unchanged. |
| 20 | Docker / ops for the match server | **IMPLEMENTED** | `ops/docker`, `ops/compose/compose.{local,edge}.yml`, `ops/edge/nginx.conf`, `docs/ops/*` | Left alone. The platform adds its own Dockerfile and `compose.platform.yml`; the edge proxy config needs one more upstream when it is hosted (documented, not edited). |
| 21 | Persistence | **MISSING by decision** for the match server (no file, no DB) | PIS7 | Platform adds PostgreSQL with versioned migrations; the match server stays database-free. |
| 22 | Privacy / data-protection documentation | **MISSING** (security docs mention it only as "out of scope") | – | `docs/PLATFORM_PRIVACY.md` (data inventory, retention, deletion, minors, Nigeria Data Protection Act position and the open legal questions). |
| 23 | Static public build must contain no online code | **IMPLEMENTED** | `scripts/check-static-build.mjs`, `tests/online/public-bundle.test.ts` | The platform lives in its own package (`player-platform/`), is not imported by anything in `src/`, and cannot enter the Pages bundle. No change to `src/`. |

## 2. Where the new API differs from the client adapter skeleton (`src/online/server/adapter.ts`)

The skeleton has never talked to a real back end. The platform follows REST resource naming rather than the skeleton's verb paths; the adapter needs a mapping when it is connected (Architecture's job, listed in the handoff):

| Skeleton path | Platform path | Note |
| --- | --- | --- |
| `/v1/auth/guest` | `POST /v1/auth/guest` | same name; body gains `platform`, `deviceLabel`, `ageGroup`; response is `{ profile, tokens }` with access + **refresh** tokens (the skeleton has one token) |
| `/v1/auth/signin` (placeholder handle) | `POST /v1/auth/signin` | now a **server-verified provider id token** + single-use nonce; no handle sign-in exists |
| `/v1/auth/signout` | `POST /v1/auth/logout` | |
| `/v1/account/profile`, `/v1/account/name` | `GET` / `PATCH /v1/me` | |
| `/v1/social/*` | `/v1/friends/*` (Checkpoint B) | |
| `/v1/party/*` | `/v1/parties/*` (Checkpoint B) | create / join by code / leave / promote / kick / ready kept; **no** lobby, queue or team routes |
| `/v1/queue/*`, `/v1/lobby/*`, `/v1/team/*`, `/v1/match/*`, `/v1/progress/*`, `/v1/ranking/*` | **none** | owned by the match server or deferred (rows 8, 10) |

Every request in the skeleton carries `X-Wahala-Protocol: 1`; the platform ignores that header (it is versioned by the `/v1` path).

## 3. Gaps and conflicts found (nothing decided silently)

1. **No "generator skin" cosmetic kind.** The request lists generator skins; `CosmeticKind` has `fighterSkin`, `vehicleCosmetic`, `finisher`, `emote`, `banner`. The platform catalogue supports the category; mapping it to a real in-game asset needs a `src/cosmetics` change (not touched here). Until then generator-skin products are catalogue rows with no renderable item.
2. **Two different "guest" notions** (match server `gid`, platform guest account). Compatible by design: the ticket in the handoff carries the platform id; without one the server behaves as it does today.
3. **Party size.** The offline contract says `maxSize` per party; the match room holds 32 humans. Platform default is **8**, configurable up to the approved 32 (`PLATFORM_PARTY_MAX_SIZE`). Founder may want a different default.
4. **Name uniqueness.** The match server de-duplicates inside a room (`Ada 2`); the platform makes skeletons globally unique (a taken name is refused, a freed one returns on deletion). Founder decision, flagged in `PLATFORM_ARCHITECTURE.md` (PP4).
5. **The match server cannot yet verify a platform ticket** (it ignores `token`, `onAuth` validates only name and fighter). Until Architecture adds the 15-line verifier from the handoff doc, a party shares a *room code*, exactly as private rooms work today.
6. **Results ingestion needs a server-side call** that does not exist; without it the platform has no match history (it never guesses one).
7. **No privacy notice, age policy or Nigerian-law review exists.** Defaults are conservative (see `PLATFORM_PRIVACY.md`); legal sign-off is a precondition of any public launch.

## 4. What this branch does not touch

`src/`, `server/`, `tests/`, `e2e/`, `.github/`, `public/`, `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `CLAUDE.md`, root `package.json`. New: `player-platform/`, `ops/compose/compose.platform.yml`, `ops/env/platform.env.example`, and `docs/PLATFORM_*.md`.
