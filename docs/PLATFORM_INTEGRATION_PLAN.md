# Integrating the player platform with the released game and the Colyseus match server

Review of `claude/wahala-player-platform-v1` (HEAD recorded in the final report) against the latest production code `20cc59a` (`claude/wahala-stitch-uiux-v1`). **Nothing here rebases, merges or changes the released game.** Architecture decides when and how.

## 1. Divergence review

| Item | Result |
| --- | --- |
| Platform branch base | `0507d47`; production is 26 commits ahead (`tools/audio`, `public/audio`, `src/ui`, `src/audio`, `src/app`, CI sharding, docs) |
| Files the platform changes | only `player-platform/**`, `docs/PLATFORM_*.md`, `ops/compose/compose.platform.yml`, `ops/env/platform.env.example` |
| Path overlap with production's 26 commits | **none** |
| Game files the platform reads | `src/net/protocol.ts`, `src/sim/data/characters.ts`, `src/cosmetics/*`: **unchanged upstream** (also `server/src`, `src/seasons`) |
| Trial merge (`git merge-tree`, no change made) | **clean**, no conflicts |
| CI files changed upstream | `.github/workflows/ci.yml`, `deploy.yml`, `scripts/ci/shards.ts`, `unit-shards.ts` (+ timings seed). The platform branch carries the OLD workflow copies: **do not rebase or merge it as a publisher**; its CI run is the old pipeline. After integration the production pipeline applies |
| Root `package.json` | changed upstream (audio scripts); the platform does not touch it. The platform is its own package and is **outside** the root `tsconfig`, Vitest and Playwright globs (root ESLint does lint it and passes) |
| Static public build | unaffected: nothing in `src/` imports the platform (`check:static`, `public-bundle`, `platform-static` tests are about `src/`) |

**Safe plan:** (1) Architecture reviews the branch as documentation + a dormant package. (2) Integrate by a normal **merge** of the branch into a branch cut from the latest production head (never a rebase of the released game); expected result: only added paths. (3) Re-run the production pipeline on the merge; the new unit sharding must still list/run every root test (the platform adds none). (4) Decide separately, later, whether CI should also run `player-platform` tests (a new job: `cd player-platform && npm ci && npm test`, hermetic PGlite, plus optionally a Postgres service container); this branch adds none. (5) Match-server changes (section 3) are a separate, later branch.

## 2. Principle: guest-only matches must keep working with no platform

Every integration point below is **optional and fail-open for guests, fail-closed for claims of identity**: no `PLATFORM_*` environment on the match server = today's behaviour exactly. A request that presents a ticket must verify or be refused (never silently downgraded to a trusted name); a request without a ticket is a guest. If the platform is down the match server keeps running: tickets verify offline against a cached public key, results and filters are best-effort with timeouts.

## 3. Wiring the Colyseus server (`server/src`, not changed by this branch)

| Need | Mechanism (built on the platform side) | Match-server change |
| --- | --- | --- |
| **Optional identity tickets** | `GET /.well-known/jwks.json`; EdDSA JWT, 120 s, `aud: wahala-rumble`, `room` bound; host ticket (`room: "*"`) lets the party leader create the room; verifier `verifyHandoffTicket` (depends only on `jose`) | in `RumbleRoom` verify `options.ticket` when present (signature / audience / expiry in `onAuth`, room binding in `onCreate` / `onJoin`); cache the JWKS (5 min, keep last good key on fetch failure) |
| **Trusted player IDs** | the ticket `sub` is the immutable player id; `name` is the platform nickname | store `accountId` on the lobby member; use the ticket `name` instead of the client's; add a `verified` flag to the lobby member view (protocol change, Architecture's call) so clients can show a badge; guests keep client-typed names as today |
| **Server-signed match results** | `POST /internal/v1/matches/started` and `/finished`, HMAC-SHA256 over `ts.METHOD.path.body`, 5-minute skew, first call wins, unticketed players refused, bots never carry ids | after `RumbleMatch.results()` post once (fire-and-forget, 2 s timeout, bounded retry); field mapping in `PLATFORM_MATCH_HANDOFF.md` section 3. The server must never wait for the platform |
| **Friends and party invitations** | entirely platform-side: clients call `/v1/friends/*`, `/v1/parties/*`, `/v1/invites`; a party carries the **private-room code** the leader reports (`POST /v1/parties/:id/match`) and each member gets a ticket | **none** beyond ticket verification: members join with the existing `joinById(code)`. Presence `in_match` comes from the `started` call. Client work: create room with the host ticket, report the code, members fetch tickets (UI in `src/ui/online`, behind the existing build flag) |
| **Quick-chat signals** | catalogue `GET /v1/comms/signals`; party signals are platform-relayed (poll); in-match team pings / emotes are relayed by the match server | the match server relays ids it validates against the catalogue (copy the 21 ids as data), per-seat rate limit of its own, and asks `POST /internal/v1/comms/filter {senderId, recipientIds, kind:'signal'}` **once per match start (and every 30 s)** for the roster, caching the allowed-recipient set per sender, rather than per ping. Seats without a platform id are unaffected (guests cannot mute or be muted across the platform) |
| **Mute / block / report events** | players mute / block / report through the platform API (their own client calls it); the filter is the read path | there is **no push** from platform to server: the 30 s refresh bounds how long a new mute / block takes to apply in a running match (documented limit; a `social.changed` webhook is an optional upgrade). Reports with `context: "match"` need both players to have been ticketed in that match (`match_participants`), so the server's `started` call must list real player ids |

Tests the server change must add: unticketed join unchanged; expired / wrong-room / wrong-audience / forged ticket refused; host ticket creates a room, a member ticket cannot; platform down (timeouts, 5xx) never delays `beginMatch` or a tick; a result for a never-ticketed player is not sent; the filter outage means "deliver presets" (fail open for harmless presets), never "deliver text or voice".

## 4. Configuration and boundaries that stay

- Google and Apple sign-in stay **unconfigured** (`501 provider_not_configured`) until client ids exist and live verification has been done on real devices; production config validation requires a real provider before accounts can register, so a production start without one is refused.
- Free text and voice stay disabled: the dev chat flag is refused in production; voice answers 503.
- Payment providers are unconfigured skeletons; mock checkout and the mock IdP are refused in production config and not even constructed in production; no public shop endpoint can charge.
- The platform is not part of the Pages build and has no deploy workflow.

## 5. Rollout order (each step reversible)

1. Merge the branch (dormant). 2. Run the platform locally against the real server (`test/handshake.test.ts`; `PLATFORM_MATCH_HANDOFF.md`). 3. Server branch: ticket verification + result posting behind env flags, default off. 4. Client branch: party / friends UI behind the existing online build flag. 5. Private closed test with real Google / Apple credentials. 6. Counsel review, moderation process, then any public step.

## 6. Founder decisions required before any public step

Global unique nicknames vs discriminators; party default size; whether free text ever ships; voice and recording policy; which cosmetics are sold, every price and currency, refund policy; guardian consent and the age policy under the Nigeria Data Protection Act; retention periods (reports, audit, financial records); whether to run the automatic restriction in production (`PLATFORM_COLLUSION_ANALYSIS.md`); who moderates and with what response target; hosting region and provider.
