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

Code layout (`player-platform/src`): `config.ts` (env -> validated config) · `db/` (driver-independent `Db`, `pg` and PGlite adapters, versioned migrations) · `http/` (router, rate limiter, trusted-proxy address rule, service HMAC, the server shell) · `identity/` (nickname, providers, sessions, service, capabilities) · `routes/` (thin handlers: parse -> service -> envelope) · `logger.ts` (redacting structured log) · `audit.ts` · `app.ts` (composition root).

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

Checkpoint B adds friendships, requests, blocks, parties, members, invitations, handoff tickets, matches, participants; C adds mutes, reports, signals; D adds the catalogue, prices, entitlements, orders and provider events (each section is added here when the checkpoint lands).

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
| PP8 | PGlite (real Postgres engine, WASM) for hermetic tests; the same suite also runs on a real server via `PLATFORM_TEST_DATABASE_URL` | Proven: 72 tests pass on both (PostgreSQL 16.15). |
| PP9 | Forward-only migrations with checksums; rollback = restore the pre-deploy backup | Expand-then-contract keeps the previous release runnable on the new schema. |
| PP10 | Party default size 8, ceiling 32 | Approved match capacity is 32 humans; a social party that large is unusual. **Founder choice.** |

## 5. Checkpoint status

| Checkpoint | State |
| --- | --- |
| A Identity, profiles, database, ops | **done**, 72 tests (PGlite and PostgreSQL 16) |
| B Friends, presence, parties, match handoff | next |
| C Quick chat, safety, reports, comms design | planned |
| D Catalogue, entitlements, sandbox commerce | planned |
