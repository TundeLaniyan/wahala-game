# Player platform <-> City Rumble match server: the handoff contract

**Status:** the platform side is built and tested (`player-platform/`, Checkpoint B). The match server side is **NOT changed by this branch** (`server/` is untouched, hard boundary). This document is the exact, minimal change Architecture needs to make, and what already works without it.

Tested end to end against the real, unmodified server: `player-platform/test/handshake.test.ts` (needs `cd server && npm ci`).

## 1. What already works with zero server changes

1. Two platform accounts form a **party** (`POST /v1/parties`, join by code or friend invitation).
2. The leader asks for a **host ticket**, creates a private room on the match server **exactly as a guest does today**, and tells the platform the 6-character room code (`POST /v1/parties/:id/match {roomCode}`).
3. Every member sees the code, asks for a ticket, and `joinById`s the same room with the existing client. The unmodified server ignores the extra `ticket` join option; the join is the server's own (capacity 32, FFA / Team, 30 s public wait only for public rooms, 5 s grace + 30 s reconnection, lock at start: all the server's).
4. When the match server reports the match (section 4), the platform records non-ranked history and returns the party to the lobby.

What does **not** work until the server change: the server cannot tell a ticketed player from a guest, so a platform nickname is not *guaranteed* in the room (a guest can still type any valid name, as today), and nothing writes match history.

## 2. Contract summary

| Direction | Mechanism | Authority |
| --- | --- | --- |
| platform -> client -> server | **Ticket**: EdDSA (Ed25519) JWT, 120 s, `iss: wahala-platform`, `aud: wahala-rumble`, claims `sub` (player id), `name`, `char`, `room` (6-char code, or `*` for a host ticket), `party`, `restricted`, `jti` | the server verifies with the platform's PUBLIC key (`GET /.well-known/jwks.json`); it cannot mint tickets |
| server -> platform | **Signed calls** `POST /internal/v1/matches/started` and `/finished`: header `X-Wahala-Timestamp` (ms) + `X-Wahala-Signature` = hex HMAC-SHA256(`PLATFORM_MATCH_SERVER_SECRET`, `${ts}.POST.${path}.${rawBody}`), 5 minute skew | shared secret, server side only; clients have no route that records anything |

Ticket verifier (pure, depends only on `jose`): `player-platform/src/handoff/verify.ts` -> `verifyHandoffTicket(token, { keys, audience, roomCode, now? })`. `roomCode: null` checks a **room creation** (only a host ticket passes); a code checks a **join** (only a ticket for that exact room passes). Wrong room, wrong audience, expired, wrong key, `alg: none`, HS256 with the public key as secret: all refused (`test/handoff.test.ts`).

## 3. The server change (Architecture applies it; about 40 lines, no simulation, no matchmaking rule)

Environment (all optional: **unset = today's behaviour, nothing changes**): `PLATFORM_JWKS_URL`, `PLATFORM_HANDOFF_AUDIENCE` (default `wahala-rumble`), `PLATFORM_INTERNAL_URL`, `PLATFORM_MATCH_SERVER_SECRET`.

1. **Verify a ticket when one is present** (`server/src/rooms/RumbleRoom.ts`):
   - `static onAuth(token, options)`: if `options.ticket` is a string, verify signature, audience and expiry with a cached `createRemoteJWKSet(PLATFORM_JWKS_URL)` (`roomCode` not known yet: do the room check in step below) and reject with `ServerError(APPLICATION_ERROR, 'invalid ticket')` when it fails. **No ticket = unchanged guest join.**
   - in `onCreate` / `onJoin` (they run in the room instance, where `this.code` exists): `claims.room === this.code` for a join, `claims.room === '*'` for the creator of a new private room. Store `claims.sub` on the lobby member (`accountId`), use `claims.name` instead of the client's `name`, keep `claims.restricted` for later voice / text decisions. A ticket for another room is refused like a bad code (`room_unavailable`, the uniform answer).
2. **Remember the platform id per seat** (humans only; bots and guests stay `null`).
3. **Report the match** (fire and forget, 2 s timeout, never awaited by the tick loop, bounded in-memory retry with backoff; the platform being down must never delay or fail a match):
   - at match start -> `POST /internal/v1/matches/started`
   - when `RumbleMatch.results()` is produced -> `POST /internal/v1/matches/finished`

   | `started` / `finished` field | source in the server |
   | --- | --- |
   | `matchId` | `ResultsMsg.matchId` (6-64 chars `[A-Za-z0-9_.:-]`; also the idempotency key) |
   | `game` | lobby `settings.game` (`survival` / `deathmatch` / `team`) |
   | `arenaId` | lobby `settings.arenaId` |
   | `roomCode` | `this.code` (private rooms; omit for public rooms) |
   | `seats` | `MATCH_SEATS` (32) |
   | `startedAt`, `endedAt` | ISO times; `durationSec` = `ResultsMsg.tick / 60` |
   | `participants[]` | per seat `{ seat, playerId (the ticket `sub`, else omit), name, isBot, team }` |
   | `results[]` | per seat `{ seat, placement, kills, deaths, assists, botKills, botDeaths, botAssists, controlledByBotAtEnd }` straight from `ResultsMsg.players` (the human-only vs bot split of rule ON7 is preserved; absent fields are `null`) |

   Signing, in full: `sig = hex(HMAC_SHA256(secret, ts + "." + "POST" + "." + path + "." + rawBody))`, headers `X-Wahala-Timestamp: ts`, `X-Wahala-Signature: sig`, `Content-Type: application/json`. Reference implementation: `signServiceRequest` in `player-platform/src/http/serviceAuth.ts` (7 lines; copy it, do not import the platform package into the server).
4. Tests to add on the server side: unticketed join unchanged; ticket for another room refused; host ticket creates; expired ticket refused; the platform returning 5xx or timing out never delays `beginMatch`.

What the platform guarantees in return: a result naming a player who was never ticketed for that room is **refused** (HTTP 400, nothing stored); results are idempotent (the first call wins); the call never carries or stores XP, rating, rank or reward (those columns do not exist); a player can only read their own history.

## 4. Policies that stay the server's (and are not changed by any of this)

32 fighters; Free-for-All and Team (server-assigned teams); the 30 s public wait then labelled bots; 5 s grace, then a bot, and the same fighter may return within 30 s; no new humans after the start; friendly fire rules; Quick Play by mode; all capacity, abuse and CPU limits. A party never reserves seats and never bypasses a limit.

## 5. Known limits and open questions

- **Public Quick Play cannot honour a party** (the matchmaker groups by mode only). Parties use **private rooms**. Party-aware public matchmaking would be a server feature and a founder decision (it changes who meets whom).
- A leader who reports the wrong room code only sends members to a room that refuses them; the code alone is the server's capability and the platform adds no power to it.
- Ticket lifetime is 120 s: it is for **joining**. Reconnecting uses the server's own reconnection token, not a ticket.
- Anonymous guests are `playerId: null` in results and never appear in anybody's history. A guest who also has a platform account but joined without a ticket is likewise anonymous (the platform will not take the client's word for who it is).
- The ranked / reward policy stays open (`docs/CITY_RUMBLE_ONLINE.md` section 8): the platform stores **facts**, never a ranking.
