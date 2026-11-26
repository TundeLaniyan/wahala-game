# Match server <-> player platform: what is wired (decision MP-PLAT, MP-SIG)

Branch `claude/wahala-private-multiplayer-v1`. This implements `PLATFORM_MATCH_HANDOFF.md` and `PLATFORM_INTEGRATION_PLAN.md` section 3 on the Colyseus server. **Everything is off unless `PLATFORM_*` is set**: a server without it behaves exactly as before for guests, and *refuses* a ticket instead of trusting it (it never silently downgrades a presented ticket to a trusted name).

## Configuration (all optional)

| Variable | Meaning |
| --- | --- |
| `PLATFORM_JWKS_URL` | the platform's public keys (`/.well-known/jwks.json`); set = tickets are verified |
| `PLATFORM_HANDOFF_AUDIENCE` | default `wahala-rumble` |
| `PLATFORM_INTERNAL_URL` + `PLATFORM_MATCH_SERVER_SECRET` | the platform origin and the shared HMAC secret: both set = results are reported and the signal filter is asked |

`npm run dev:private` (`scripts/dev-online.mjs --platform`) sets all of it up on a laptop (secrets in the git-ignored `.local/private-dev/`).

## Tickets (`server/src/core/platform.ts`, checked once in the matchmaking wrapper `guardedInvoke`)

- A ticket is the platform's Ed25519 JWT (120 s, `aud wahala-rumble`, bound to a room). The wrapper verifies signature, audience, expiry, **room binding** and **single use** (`jti` remembered until the ticket could no longer verify), after the per-address rate limits, so forged tickets are throttled.
- Scope: `create` needs a **host** ticket (`room: "*"`); `joinById` needs a ticket for **that exact room code**; `joinOrCreate` (quick play) accepts **no** ticket. A member ticket cannot create; a host ticket cannot join. A refusal answers `invalid ticket` / `ticket not valid for this room` / `ticket already used` / `tickets are not accepted by this server`.
- The raw ticket never reaches the room. The wrapper strips the `ticket` option and every option starting with `_` (a guest cannot send `_acct`), then stamps the verified result as `_acct` (`sub`, `name`, `restricted`, `party`).
- In the room: the seat belongs to the platform player (`accountId`), shows the **platform nickname** (not what the client typed: identity is separate from the editable display name), and is `verified`. One seat per platform player (a second ticket for the same account is refused). A guest typing a verified name is renamed ("Ada 2") and has no badge.
- Lobby view fields (protocol): `members[].verified`, `members[].playerId` (the opaque random UUID, only for verified seats: what a client needs to mute / block / report; **privacy note: any member of a private room can read the ids of the verified players in it**, they are not names and cannot be used to search or message anybody).
- **Reconnection is unchanged**: the server's own token, same seat, 30 s (`RUMBLE_RECONNECT_SECONDS`). A reconnect consumes no ticket and keeps the identity (test: `server/test/platform.test.ts`).
- Keys: jose's remote key set, cached 5 min, 2 s timeout, 10 s cool-down; an outage keeps the last good keys, so tickets still verify while the platform is down. A platform restart needs a **stable** signing key (`PLATFORM_HANDOFF_PRIVATE_KEY`; the launcher keeps one).

## Trusted results

- At match start and at its end the **server** (never a client) posts `/internal/v1/matches/started` and `/finished`, HMAC-signed (`ts.POST.path.body`, 5 min skew), built only from its own state: participants (`playerId` only for verified seats; bots and guests carry none), per-seat results from `ResultsMsg` with the human/bot split of rule ON7. A guest-only match is not reported at all.
- `matchId` = `<code>-<n>:<8 hex of a per-room nonce>`: unique per room instance (room codes are reused over time and the platform's first report wins).
- Fire and forget: 2 s timeout, retries 2 s / 5 s / 15 s / 45 s in memory for network errors and 5xx, none for 4xx; never awaited by a tick, a start or the results message. Test: a platform that is down or answers too slowly changes neither the time to start nor the result.
- The platform's own guarantees (tested again end to end in `player-platform/test/integration.wired.test.ts`): a client credential cannot reach the internal routes, a bad signature is refused, a result naming a player never ticketed for that room is refused, results are idempotent, and no XP / rating / reward exists in the schema. **Ranked and persistent rewards stay disabled.**

## Preset signals (`MSG.signal` / `MSG.signalIn`)

- The 21 preset ids are the platform catalogue copied as data (`SIGNAL_DEFS`; a test keeps the lists identical). The wire carries **only an id**: no free text, no voice. Anything else is an invalid message (counted; a flood is disconnected like any other).
- Lobby / results: to the room. During a match: team-only signals (pings, "I need help") to teammates, other presets to everybody; team signals are refused in Free-for-All; lobby-only presets are refused during a match. A ping carries the sender's tile, attached by the server.
- A per-seat token bucket (burst 4, one per second) drops the excess silently.
- Mute / block / restriction: for a **verified sender** the server asks the platform's filter (`/internal/v1/comms/filter`, cached 30 s per sender, fresh for each new match) which verified room mates may hear it; a restricted sender is told so. A guest has no platform id: guests use a **local mute** in the client. If the platform cannot answer, presets are delivered (harmless by construction); there is no text or voice to leak. Limit: a mute or block made while a match runs applies within 30 s (no push channel).

## What is not done here

Google / Apple sign-in (unconfigured on purpose), free text, voice, ranked, rewards, payments, party-aware public matchmaking, a push channel for mutes, rate limits shared across several match-server processes, hosting.

## Tests

`server/test/platform.test.ts` (15: guests unchanged, impersonation, tickets accepted / forged / expired / wrong room / wrong audience / replayed / mis-scoped, duplicate account, reconnect keeps identity, results signed and complete, guest-only not reported, outage and slow platform, signals lobby / filter / team / rate), `server/test/platform.noconfig.test.ts`, `player-platform/test/integration.wired.test.ts` (real platform + real match server over HTTP; also run on PostgreSQL 16.15).
