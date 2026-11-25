# Player platform: architecture, data model and decisions

`player-platform/` is a separate Node 22 service (own `package.json`, like `server/`). It is **development-only and dormant**: nothing is deployed, nothing in `src/` imports it, the Pages build cannot contain it. Audit of what existed first: `docs/PLATFORM_AUDIT.md`.

## 1. Shape

```
 web / Android / iOS client ──HTTPS+JSON, Bearer wa_...──▶  player-platform  ──SQL──▶  PostgreSQL 16
        │  (guest first; provider sign-in optional)            │   identity · profiles · sessions · audit      (migrations 000N)
        │                                                      │   friends · blocks · presence · parties       (Checkpoint B)
        │  WebSocket (existing)                                │   signals · mutes · reports                   (Checkpoint C)
        ▼                                                      │   catalogue · entitlements · orders           (Checkpoint D)
  City Rumble match server (Colyseus, UNCHANGED)  ◀── signed match ticket (platform → client → server)
        │                                          ──▶ signed results / presence webhooks (server → platform)
        └── no database, authoritative simulation, 32 seats, 30 s wait, reconnection
```

The platform never sits in the match's data path and cannot affect a tick. If the platform is down, guests still play: identity is an *optional* layer on top of the match server's existing anonymous join.

Code layout (`player-platform/src`): `config.ts` (env -> validated config) · `social/` (friends, blocks, presence) · `parties/` · `handoff/` (ticket signer + the verifier the match server imports) · `matches/` (trusted history) · `comms/` (signals, mutes, restrictions, reports, relay filter, dev chat, voice seam) · `db/` (driver-independent `Db`, `pg` and PGlite adapters, versioned migrations) · `http/` (router, rate limiter, trusted-proxy address rule, service HMAC, the server shell) · `identity/` (nickname, providers, sessions, service, capabilities) · `routes/` (thin handlers: parse -> service -> envelope) · `logger.ts` (redacting structured log) · `audit.ts` · `app.ts` (composition root).

Conventions: JSON; `/v1` path versioning; one error envelope `{ error: { code, message, requestId, retryAfterMs? } }`; strict bodies (unknown keys refused, so a client can never smuggle an id, kind, status, price or owner); identity always from the access token, never the body; time and randomness injectable; every service takes a `Db`, never a driver.

## 2. Identity (Checkpoint A, working)

- **Player id**: random UUID, immutable, never reused. **Friend code**: 8 chars of the match server's room-code alphabet, rotatable; friends are added by code only (names are not a search surface).
- **Guest first**: `POST /v1/auth/guest` needs nothing, returns a profile + session. Private multiplayer tests do not need an account at all (the match server's own anonymous join still works).
- **Sessions**: opaque 256-bit access (15 min) and refresh (30 days sliding, 365 days absolute) tokens, stored as SHA-256 only. Access is looked up per request, so revocation is immediate. **Refresh rotates both tokens**; the previous refresh token is remembered, and presenting it again revokes the whole session (stolen-copy detection, audited). List devices, revoke one, revoke all others, log out.
- **Guest -> registered** (`/v1/auth/upgrade`): attaches a verified provider identity to the *same* player (id, nickname, fighter, settings, friend code, history are kept). Other sessions are revoked at that moment. An identity that already owns another account is refused (409): **no silent merge**.
- **Providers**: `IdentityProvider` abstraction. Google and Apple use the real verifier (`OidcVerifier`: signature against the provider's published keys, issuer, audience = our client ids, expiry, `iat`, algorithm allow-list, and a **server-issued single-use nonce**). They are `provider_not_configured` (501) until client ids are set. A development **mock IdP** mints test tokens signed with a local key and verifies them through the *same* verifier; it is refused by config validation in production and is not OAuth. **Live Google / Apple sign-in has not been exercised**: no accounts or credentials exist.
- **Safeguards**: re-authentication (proof within 10 min) for linking, unlinking, deleting a registered account and for moving an age band *up* to adult; the last sign-in cannot be unlinked; no password anywhere; no recovery by e-mail (the address is never stored, only a masked hint). **Recovery** = sign in again with the linked provider on a new device. A guest has no recovery: lose the device, lose the guest (upgrade is the fix; the client should say so).
- **Profile**: nickname (the match server's rule + global skeleton uniqueness; first change free, then 24 h cooldown), selected fighter (validated against the real roster), presence visibility, a whitelist of cross-device settings (locale, subtitles, reduced motion, colour-blind mode, voice on/off), loadout (refused until entitlements exist).
- **Capabilities** are computed from kind + age band: unrestricted text / voice / purchases need an **adult registered** account; everyone else gets the restricted set. `unspecified` is treated as a minor.
- **Deletion** (`POST /v1/me/delete`): erases sign-ins, sessions, name, settings, loadout and every module's rows (hooks), leaves a non-identifying tombstone row so history keeps integrity; the name is freed; the audit trail keeps the id for 400 days then is purged. Idle guests are deleted after 180 days. See `PLATFORM_PRIVACY.md`.

## 3. Database model (migration `0001`; later checkpoints append)

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `players` | identity | `kind` guest / registered; `status` active / suspended / deleted; `friend_code` unique; `age_group`; guest cannot carry `upgraded_at` (CHECK) |
| `profiles` | mutable profile | `name_skeleton` unique (NULL when deleted); `settings` <= 4 KiB (CHECK) |
| `identity_links` | linked providers | unique `(provider, subject)` and `(player_id, provider)`; stores only a masked e-mail hint |
| `sessions` | devices | hashed access / refresh / previous refresh; absolute expiry; `reauth_at`; revocation reason |
| `auth_nonces` | single-use provider nonces | consumed with `DELETE ... RETURNING` semantics |
| `audit_events` | security trail | no foreign keys (survives deletion); ids and codes only, never tokens or free text |
| `schema_migrations` | versions + checksums | an applied file that was edited is refused |

**Checkpoint B (migrations 0002-0004):**

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `friend_requests` | pending / answered requests | one pending request per PAIR (unique index on `LEAST/GREATEST`), no self request |
| `friendships` | one row per friendship | ids stored ordered (`player_a < player_b`): symmetric and unique |
| `blocks` | who blocked whom | no self block; checked both ways by every feature that connects two players |
| `parties`, `party_members`, `party_invites` | private parties | one live code per party (partial unique index); a player is in **one** party (unique on `player_id`); `in_match` iff a room code is set (CHECK); one pending invite per (party, player) |
| `handoff_tickets` | log of signed match tickets (no token stored) | what lets the platform refuse a result that names someone never admitted to the room |
| `matches`, `match_participants` | **non-ranked** facts written only by the signed server calls | `id` = the server's match id (idempotency); no XP / rating / rank / reward column exists (tested); a bot can never carry a player id (CHECK) |

Presence is **not** in the database: an in-memory store with a 90 s TTL (`PresenceStore` is the seam for Redis). `in_match` can only be set by the server's signed `started` call.

**Checkpoint C (migration 0005):** `mutes`; `comm_restrictions` (`signals` / `text` / `voice`, `auto` or `moderator`, time-limited, liftable); `reports` (reporter, target, category, context + ref, <= 200-char note, name at report time, <= 8 KiB evidence snapshot, `open` / `actioned` / `dismissed`, one OPEN report per reporter / target / place by a partial unique index); `party_signals` (preset ids only, latest 200 per party); `dev_chat_messages` (development flag only, purged at 24 h).

Checkpoint D adds the catalogue, prices, entitlements, orders and provider events.

## 4. Decisions (PP = player platform; nothing here changes gameplay)

| ID | Decision | Why / alternative |
| --- | --- | --- |
| PP1 | Platform is a separate service; match server stays database-free and unmodified | Founder rule + PIS7. Alternative (accounts inside the Colyseus server) would couple persistence to the simulation host. |
| PP2 | Opaque, hashed, rotating tokens with reuse detection instead of JWT access tokens | Immediate revocation and no key-distribution problem; cost is one indexed lookup per request. JWTs are used only where another service must verify offline (match tickets, Checkpoint B). |
| PP3 | Provider verification server-side with a server-issued single-use nonce | Replays and cross-flow token reuse are impossible; also the replay defence. |
| PP4 | Nicknames are globally unique by skeleton | Stops impersonation in friends lists and reports. Alternative: discriminators (`Ada#4821`) - friendlier at scale, not decided. **Founder choice.** |
| PP5 | `unspecified` age band = minor | A guest-first game cannot assume an adult; no date of birth is collected. Needs legal confirmation. |
| PP6 | No password sign-in, ever | Founder rule; providers only. |
| PP7 | Friend code only, no name search | No enumeration surface for harassment. |
| PP8 | PGlite (real Postgres engine, WASM) for hermetic tests; the same suite also runs on a real server via `PLATFORM_TEST_DATABASE_URL` | Proven: 157 tests pass on both (PostgreSQL 16.15). |
| PP9 | Forward-only migrations with checksums; rollback = restore the pre-deploy backup | Expand-then-contract keeps the previous release runnable on the new schema. |
| PP10 | Party default size 8, ceiling 32 | Approved match capacity is 32 humans; a social party that large is unusual. **Founder choice.** |
| PP11 | Parties use PRIVATE rooms of the existing match server; the platform never owns a room, seat or team | No second matchmaking system. Public Quick Play cannot group a party (server feature, founder decision). |
| PP12 | Match tickets are Ed25519 JWTs the server verifies with the public key; results are HMAC-signed server calls | A compromised match server cannot mint identities; a client has no route that records anything. |
| PP14 | Production communication is PRESET ONLY; free text and voice are designs, not features | Nothing to moderate in content; abuse is handled by limits, mutes, blocks, reports and restrictions. **Founder decision** whether free text ever ships. |
| PP13 | A leader's **host ticket** (`room: "*"`) exists because the room code does not exist when the room is created | Found by the handshake test: the leader could not otherwise be tied to a seat. |

## 5. Checkpoint status

| Checkpoint | State |
| --- | --- |
| A Identity, profiles, database, ops | **done**, 72 tests (PGlite and PostgreSQL 16) |
| B Friends, blocks, presence, parties, signed match tickets, trusted results | **done**, 116 tests incl. a handshake against the real match server (`PLATFORM_MATCH_HANDOFF.md`) |
| C Preset signals, mute / block / report, restrictions, moderator API, relay filter, dev-only text chat, voice seam and designs | **done**, 157 tests (`PLATFORM_SAFETY.md`, `PLATFORM_TEXT_CHAT_DESIGN.md`, `PLATFORM_VOICE_DESIGN.md`) |
| D Catalogue, entitlements, sandbox commerce | planned |
