# What a secure invite-only HOSTED beta still needs

Today (branch `claude/wahala-private-multiplayer-v1`) everything runs on one laptop: the platform, the match server and the game are wired together and tested, but **nothing is deployed and nothing is public**. This list is what must exist before a small group of invited testers can use a hosted copy. None of it is built here; each item is a decision or work for the founder / Architecture. Order is a suggestion.

## 1. Must have before the first invited tester

| # | Requirement | Why / state today |
| --- | --- | --- |
| 1 | **A real PostgreSQL**, backups with a tested restore, and the migration step run on deploy | The platform stores identity, friends, parties, reports. Tested on PostgreSQL 16.15 (`player-platform` suite, the wired test, `scripts/mp/restart-check.mjs`). The in-memory database is for laptops only. Hosting not chosen. |
| 2 | **TLS everywhere** (https for the game and platform, wss for the match server) and a reverse proxy that sets `X-Forwarded-For` | Tickets and refresh tokens travel in clear on plain http. `ops/edge/nginx.conf` exists; `RUMBLE_TRUSTED_PROXIES` / `PLATFORM_TRUSTED_PROXIES` must name the proxy. |
| 3 | **Production secrets** from a secret store: `PLATFORM_MATCH_SERVER_SECRET`, `PLATFORM_HANDOFF_PRIVATE_KEY` (Ed25519), `PLATFORM_ADMIN_TOKEN`; rotation procedure; `PLATFORM_ENV=production` (the platform refuses weak or missing values and dev-only switches) | Development secrets are random per laptop in `.local/private-dev/`. The ticket key must stay stable across restarts (the match server caches the public key). |
| 4 | **An invite mechanism**, because guest sign-in is open to anyone who can reach the URL | Options: a shared invite code checked by the platform before `POST /v1/auth/guest`; an allow-listed origin plus an unguessable hostname; or provider sign-in with a tester allow-list. Not built. Without it the platform is open to the internet. |
| 5 | **Exact allowed origins** on both servers (`PLATFORM_ALLOWED_ORIGINS`, `RUMBLE_ALLOWED_ORIGINS`) and the game built with the hosted URLs (`WAHALA_ONLINE_URL`, `WAHALA_PLATFORM_URL`) in a **separate** hosted build, never the public Pages build | The public Pages bundle must stay free of online code (guarded by tests and `check-static-build`). |
| 6 | **Rate limits that survive more than one process**, or a deliberate single-process deployment | Both services rate-limit in memory (per process). One process each is fine for a small beta; two replicas would double every limit and split presence / the ticket replay set. |
| 7 | **Match-server redundancy decision**: one process, restart = every running room is lost (tested, by design) | Say so to testers. Results of matches in progress at a restart are not recorded. |
| 8 | **Monitoring and a person watching it**: `/health`, `/metrics` (token), the existing alert rules in `ops/monitoring`, logs from both services, a way to see platform failures of the results reports (`reportFailed` counter) | The match server logs report failures; nothing alerts on them yet. |
| 9 | **Moderation process**: who reads reports (`/admin/v1/reports`, admin token), how fast, what actions (restrictions, suspensions), and a decision on automatic restrictions (`PLATFORM_AUTO_RESTRICT`: off by default in production) | Reports are stored and readable; there is no moderator UI. A tester can report from the room; nobody is notified. |
| 10 | **Privacy basics for testers**: what is stored (nickname, device session, friends, party, match results, reports), the retention periods, how to delete an account (`POST /v1/me/delete` exists), contact for removal; guardian / age policy before any minor tests (the platform treats `unspecified` age as a minor) | `docs/PLATFORM_PRIVACY.md` describes the design; counsel review and the Nigeria Data Protection Act position are open founder decisions. |

## 2. Should have soon after

- **Real sign-in** (Google / Apple): unconfigured on purpose; needs client ids and live verification on real devices. Guests lose everything when the browser data is cleared.
- **A friends-from-the-room action**: today friends are added by code only (decision PP7), so a player met in a room cannot be added from there.
- **A push channel for mutes and blocks** into a running match (today a new mute applies within 30 s, by the filter refresh), and a stable key for local mutes of guests (today by name).
- **Stronger ticket replay protection across processes** (the single-use set is in memory; a restart empties it, bounded by the 120 s ticket life).
- **Server-side check that the party's room belongs to its leader** (today the platform trusts the room code the leader reports, but a wrong code only sends members to a room that refuses them).
- **Party-aware public matchmaking**: parties use private rooms by design; grouping a party inside Quick Play would be a server feature and a founder decision.
- **Per-account limits on rooms and parties**, and cleanup of abandoned parties / rooms under load (the 3 h party release and 10 min room linger exist).
- **Real-device performance** at 24 / 32 fighters on mid-range phones (never lowered by design; separate investigation).

## 3. Deliberately still off

Ranked play, XP / ratings / persistent rewards (the schema has no such column), payments and the shop (sandbox only), free text chat, voice chat, advertising, public online play, any hosting purchase.

## 4. Test evidence a hosted beta should repeat

`npm run test:private-e2e`, `node scripts/mp/restart-check.mjs`, the two-phone procedure in `docs/PLATFORM_LOCAL_TEST.md` (against the hosted URLs), the server and platform suites on the hosting provider's PostgreSQL version, and a load check with the beta's real number of simultaneous rooms (`server/bench`).
