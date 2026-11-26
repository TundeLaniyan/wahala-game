# Private beta: readiness matrix and verdict

Branch `claude/wahala-backend-ops-v1`. Companion documents: `BETA_HANDBOOK.md` (how to run it), `BETA_LOAD_RESULTS.md` (capacity evidence), `BETA_SECURITY_AND_RECOVERY.md` (abuse tests, backup and restore drill), `BETA_INTEGRATION_HANDOFF.md` (what Architecture connects).

Status words, used literally: **IMPLEMENTED** (the code or configuration exists, not exercised by a test of its own), **TESTED** (exercised by an automated test or by the real-Docker validation in this branch, evidence named), **MISSING** (not built), **BLOCKED BY EXTERNAL CREDENTIALS** (needs something only the founder can provide), **DEFERRED BY PRODUCT DECISION** (switched off on purpose), **BLOCKED BY INTEGRATION** (needs Architecture's files). A row is TESTED only when the evidence column names a check that ran and passed.

## 0. What was run, in one table

| Evidence | Result |
| --- | --- |
| `ops/beta/validate.sh` (full, real Docker: builds the two images, starts the whole stack, plays a real 3-minute 32-fighter match through the TLS edge) | **241 passed, 0 failed, 2 BLOCKED BY INTEGRATION** (both named in section 3), 602 s, final run on HEAD of this branch; the report is `docs/measurements/beta-backend/validation-report-full.txt`. It includes a real 186 s match with 32 fighters (2 humans, 30 bots) through the TLS edge, identical final state hash on both clients, peak match-server CPU 42 % and RSS 171 MB, 0 dropped ticks |
| Platform unit and integration suite (`player-platform/test`) | 196 / 196 pass on PGlite **and** on PostgreSQL 16 |
| Platform typecheck and root ESLint (`ops/`, `player-platform/`) | clean |
| Load and soak (`ops/beta/load.sh`, real matches, simulated clients) | `BETA_LOAD_RESULTS.md`; initial cap 2 simultaneous matches |
| Validation environment | Linux sandbox, Docker Engine 29.9.3 with the vfs storage driver, nested. **Not** a rented server, **not** a real domain or certificate authority, **not** phones |

## 1. The 14 hardening items of the assignment

| # | Item | Status | Evidence and notes |
| --- | --- | --- | --- |
| 1 | Startup refuses missing production secrets | **TESTED** | `validate.sh` section 2 runs the real images wrongly on purpose: no configuration, mock identity, mock checkout, dev text chat, short admin token, a secret given twice, a missing secret file, an empty database, a database from a newer release, the match server's test-only fast mode: each refuses with a named reason. Unit: `player-platform/test/config.test.ts`, `ops.test.ts`. The match server fails closed on origins and refuses `RUMBLE_TEST_FAST` in production (`server/src/core/options.ts`) |
| 2 | Token verification and secret rotation | **TESTED** on the platform side; **BLOCKED BY INTEGRATION** for the match server's verification | Session tokens are opaque, stored hashed, rotated at every refresh, reuse revokes the session (validate section 3 and platform tests). Match tickets are Ed25519 (EdDSA) JWTs with a public key set at `/.well-known/jwks.json`; the key id is the key thumbprint (found and fixed by validation: it was a fixed string). `wahala-beta.sh rotate` for every secret, **tested** (validate 7b: old admin token refused, new works; ticket key id changes; old database password refused over the network and the new one accepted; old metrics token refused; sessions survive). The match server does not verify tickets yet: see section 3 |
| 3 | API and room-creation rate limits | **TESTED** | Edge zones per address (`validate.sh`: 57 of 60 account creations refused, `Retry-After` present on edge and platform refusals); platform per-class limits (`test/abuse.test.ts`, configurable guest-creation rate); match server per-guest and per-address join / fail / create limits (`BETA_LOAD_RESULTS.md` rows 7-8: 166,497 of 166,985 hostile requests refused) |
| 4 | Room capacity protections | **TESTED** | Playing-room cap, CPU-budget guard with a start queue and a 120 s wait, connection and room caps (`RUMBLE_*` in the compose file). Observed refusing and queueing in `BETA_LOAD_RESULTS.md` rows 5-6 |
| 5 | Guest and registered accounts separated | **TESTED** | `test/identity.guest.test.ts`, `identity.providers.test.ts`; private beta is guests only on purpose (`PLATFORM_GUEST_ONLY`), registered sign-in needs provider credentials (section 4) |
| 6 | Match-result signing and replay protection | **TESTED** (platform side) | HMAC-SHA256 over timestamp, method, path and body, 5-minute skew, first call wins, results naming a player who was never ticketed for the room are refused (`test/handoff.test.ts`, `matches` tests; `validate.sh` section 5 posts the real results of the real match: accepted once, replay idempotent, forgery and unticketed player refused). The caller is **BLOCKED BY INTEGRATION**: the match server does not send the calls yet, so `validate.sh` posts them itself from inside the network and labels that as a simulation |
| 7 | Database transaction integrity | **TESTED** | Every multi-step change runs in one transaction (`db.tx`); suite passes on real PostgreSQL 16; PostgreSQL killed with SIGKILL mid-run recovered by itself and every account, session, friendship, block and party survived (validate section 7); advisory-locked forward-only migrations with checksums |
| 8 | Secure logging | **TESTED** | `validate.sh` section 9 scans every service's log for the real secrets, any token-shaped string, the real private room code and the real friend codes: none. Logs record route patterns, never paths with identifiers |
| 9 | Monitoring, alerts, health | **TESTED** | `ops/monitoring/*.test.mjs` (rules); a real disk alert was raised by the running monitor during validation; `/health`, `/platform-health`, `/ready` (503 while draining), token-gated `/metrics` on both services. **Delivery** of an alert to a phone needs your webhook address: IMPLEMENTED (`BETA_ALERT_WEBHOOK`), never sent to a real webhook (BLOCKED BY EXTERNAL: the address) |
| 10 | Safe handling of outages and restarts | **TESTED** | validate section 7 and `BETA_LOAD_RESULTS.md` rows 9-10b: platform restart, database restart, database SIGKILL, platform SIGKILL, match-server SIGKILL (each restarted by Docker), database outage (public endpoints still answer, database requests fail cleanly with no crash, recovery without a restart), full down and up. A match running during a backend outage finished normally. **Limit:** a match lives in the match server's memory, so killing that process ends the matches in progress |
| 11 | Backups and a TESTED restore | **TESTED** | validate section 8: backup (mode 0600), `restore-test` into a scratch database, then a **disaster drill**: sessions, friendships, match history and profiles deleted on purpose, `restore` brings them back, every check re-run. The nightly schedule itself (03:00 UTC) was not observed over a night; the same code path (`backup once`) is what ran. **Off-server copies** are manual (`scp`, handbook section 8): automation needs storage credentials (BLOCKED BY EXTERNAL) |
| 12 | Migrations and rollback | **TESTED** | One-shot migrate step builds the schema from empty; production never migrates by itself; an older build refuses a database a newer release changed; `rollback` restores the previous images and the stack is healthy with data intact; `update` takes a backup first and rolls back by itself when the new release is unhealthy. **Not tested:** `update` end to end against a deliberately broken release |
| 13 | Production refuses mock payments and dev auth | **TESTED** | validate sections 2-3: the real production image refuses each flag; the running stack offers no sign-in provider, no payment provider, no mock checkout, no development identity provider; Google sign-in answers 501 |
| 14 | Resource exhaustion and bot-heavy matches | **TESTED** | Container CPU, memory and process limits on every service; match-server caps; load evidence in `BETA_LOAD_RESULTS.md` (a bot-filled room costs about three times an all-human one; the guard refuses the third); hostile single-address flood absorbed with a 29 MB platform |

## 2. The deployment package

| Area | Status | Evidence |
| --- | --- | --- |
| One server: edge, match server, platform, PostgreSQL, migrate, backup, monitor from one compose file and one command | **TESTED** | `ops/beta/compose.yml`, `wahala-beta.sh`; validate section 1 (builds, starts, every service healthy) |
| Private networking; only the edge publishes ports | **TESTED** | validate section 1: published ports, network membership, both internal networks have no route to the internet, the database container cannot reach the internet |
| Secrets as files, none in the repository or in `docker inspect` | **TESTED** | validate section 3 searches every container's configuration for every secret value; `ops/scripts/check-secrets.sh` |
| HTTPS / WSS reverse proxy, HSTS, TLS 1.2+, HTTP redirect, WebSocket origin check, `/metrics` `/internal` `/admin` `/ready` `/debug` never public | **TESTED** with a temporary self-signed certificate | validate section 3 (TLS 1.0/1.1 refused, 308 redirect, CORS, oversized body 413, 404 for every private path, WSS upgrade refused from another origin) |
| A **real** certificate from a certificate authority | **BLOCKED BY EXTERNAL** | needs your domain and its DNS record. `wahala-beta.sh cert` (Let's Encrypt, with a `--staging` practice mode) has not been run against the real authority |
| Graceful shutdown | **TESTED** | validate section 10: every service stops with exit 0 within its grace period; platform drain test in `test/ops.test.ts`. (Found and fixed: PostgreSQL could not be stopped cleanly before this branch) |
| Persistent database volume | **TESTED** | data survives restart, `down` / `up`, crashes and restore |
| Invite-only access | **TESTED** | `PLATFORM_INVITE_REQUIRED` and `wahala-beta.sh invite`: creation without a code or with a wrong code refused (validate section 3, `test/invites.test.ts`); refuses to start with no codes. The **game** must send the code (`BETA_INTEGRATION_HANDOFF.md`) |
| Operator tooling and the founder handbook | **IMPLEMENTED**, commands **TESTED** | `BETA_HANDBOOK.md`. Not tested on a rented Ubuntu server (section 4) |
| One-command validation | **TESTED** | `ops/beta/wahala-beta.sh validate [--quick]` |
| Repeatable load and soak driver | **TESTED** | `ops/beta/load.sh` |

## 3. Needs Architecture (BLOCKED BY INTEGRATION)

Exact changes and the acceptance tests I1-I6 are in `BETA_INTEGRATION_HANDOFF.md`. Summary: the match server verifies the ticket at join and binds the platform id and name to the seat; it posts the signed `started` and `finished` calls without delaying a match; the game client asks for a ticket and sends the invite code. The three join-time checks are already written (`VALIDATE_INTEGRATION=1 ops/beta/validate.sh --quick`), and were checked to **fail** against today's server, so they cannot pass by accident. Not touched here: `src/`, `server/src/`, the online UI, the simulation.

## 4. What only the founder can supply or decide

| Needed | Why |
| --- | --- |
| A rented server (Ubuntu 24.04 LTS, 2 vCPU, 4 GB, 40 GB) and the decision to pay for it | no hosting was bought |
| A domain you control and an `A` record pointing at the server | the real certificate and players' addresses |
| The web address the game is played from (the `--origin`) | browsers are only allowed from that origin |
| Optional: an alert webhook address; off-server storage for backups | alerts to a phone; copies that survive losing the server |
| Later, not for this beta: Google / Apple sign-in credentials, payment-provider accounts, the product decisions behind text chat, voice and prices | all switched off and refused in production until then |

## 5. Verdict

**CONDITIONAL GO for a private hosted beta**, on these conditions, all of which are named above:

1. The backend stack itself: **ready**. Everything the validation can reach on one machine passes (section 0), and every defect it found is fixed and was re-tested.
2. **Before inviting anyone:** run `ops/beta/wahala-beta.sh validate --quick` once on the rented server, and get the real certificate (handbook section 5; use the practice mode first).
3. **Before the beta is useful:** Architecture completes the three integration items (section 3). Until then accounts, friends and parties work through the platform, but the match server still lets anyone join a room as a guest and records no history.
4. **Run it at the measured size:** at most **2 matches playing at once** (the configured default). Do not raise it without repeating the load tests on the real server and on phones.
5. **Know the limits:** a crashed match server loses the matches in progress; backups are on the same disk until you copy them off; nothing here was tested on phones or over mobile networks.

It is **not** "READY" without conditions, because the two things a real beta depends on (a real certificate on a real server, and the match server checking tickets) could not be done or proven in this environment. It is not a "NO-GO": no unfinished infrastructure remains that would be found later by surprise; what is left is listed above, with who owns it.
