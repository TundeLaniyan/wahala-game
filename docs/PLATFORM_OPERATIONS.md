# Player platform: running it locally, migrations, backups, deletion, tests

Local development only. **Nothing is deployed, no infrastructure is bought, no public service exists.** Hosting choices and costs: `docs/PLATFORM_INFRASTRUCTURE.md` (added with the final checkpoint).

## 1. Start it

**Without Docker** (in-memory PGlite database, everything lost on restart; good for client development):

```bash
cd player-platform && npm install
PLATFORM_MOCK_IDP=1 npm start          # http://127.0.0.1:4567, guests + mock sign-in
```

**With a real Postgres** (what the tests also exercise): any Postgres 14+ and

```bash
cd player-platform
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/wahala npm run migrate
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/wahala PLATFORM_MOCK_IDP=1 npm start
```

**Docker** (Postgres 16 + one-shot migration + API, ports bound to 127.0.0.1 only):

```bash
cp ops/env/platform.env.example ops/env/platform.local.env     # git-ignored; set PLATFORM_DB_PASSWORD
docker compose -f ops/compose/compose.platform.yml --env-file ops/env/platform.local.env up --build
```

The Docker stack **was validated with `docker compose config` only**: the build sandbox had no Docker daemon, so `up` has not been run. What was run: the bundle (`npm run bundle`) against a real PostgreSQL 16.15 server (migrate twice, start, `/ready`, create a guest). The image runs as `node`, read-only root filesystem, no capabilities, the SQL migrations copied beside the bundle.

Useful: `npm run check:config` (validates the environment, prints every problem, never a secret), `npm run seed` (three demo guests, refuses production), `npm run purge` (retention job).

## 2. Health and readiness

- `GET /health`: process is up (liveness).
- `GET /ready`: database answers **and** the schema version equals the code's migration count (`503` otherwise). Use it for the container health check and the load balancer.
- Structured logs: one JSON object per line, `t`, `level`, `msg`, plus fields; one `request` line per call (`route` pattern, status, ms, request id). Tokens, Authorization values, e-mail, addresses and invite / friend / room codes are redacted by field name **and** by value shape (tests: `test/http.test.ts`, `test/config.test.ts`).
- Metrics endpoint: not built (the request log carries status and latency; a Prometheus exporter is a small follow-up).

## 3. Migrations

- Files `player-platform/migrations/NNNN_name.sql`, numbered without gaps, **forward only**, each applied in one transaction under an advisory lock, recorded with a SHA-256 checksum.
- Editing an applied file is refused at start-up; a database newer than the code is refused (an old release cannot run on a new schema by mistake).
- Release procedure: (1) back up (section 4) -> (2) `npm run migrate` (or the compose `migrate` service) -> (3) start the new version. Write migrations **expand then contract** (add columns / tables first, remove old ones one release later) so the previous release still runs if a rollback is needed.
- Rollback = restore the pre-release backup and run the previous release. There are deliberately no "down" scripts: an untested down migration is worse than a rehearsed restore.

## 4. Backup and restore

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > wahala-$(date -u +%Y%m%dT%H%M%SZ).dump     # nightly + before every migration
pg_restore --no-owner --clean --if-exists -d "$RESTORE_DATABASE_URL" wahala-<stamp>.dump          # restore into a scratch database FIRST
```

Rehearse a restore into a scratch database monthly and run `npm run migrate` + `/ready` against it. Keep dumps encrypted, in a different location from the database, and **delete them on a fixed schedule (suggest 35 days)**: a deleted player persists in backups until then, and the privacy notice must say so. A managed Postgres with point-in-time recovery replaces the cron job; the schedule above still applies to its retention.

## 5. Account deletion and retention procedure

- Self-service: `POST /v1/me/delete {"confirm":"DELETE"}` (registered accounts must have re-authenticated in the last 10 minutes). Immediate and transactional; nothing to run by hand.
- Request handled by support (player cannot sign in): verify ownership out of band, then in a node shell / script call `identity.eraseAccount(playerId, null)` (same code path, audited with `actor` null). Never `DELETE` rows by hand: the hooks erase every module's tables.
- Idle guests (180 days) and old audit rows (400 days) go with `npm run purge` / the hourly timer.
- After a restore from backup, **re-apply deletions** that happened since the backup: list `audit_events` of type `account.deleted` from the live log, or keep the deletion ids in a small separate file and run `eraseAccount` for each before the restored database goes live.

## 6. Tests

```bash
cd player-platform && npm test                       # hermetic: PGlite (real Postgres engine in WASM), no Docker, no network
PLATFORM_TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/some_db npm test   # same suite on a real server, one throw-away schema per test file
npm run typecheck
```

Do **not** run these as part of the game's root CI: `player-platform/` is outside the root `tsconfig`, Vitest and Playwright globs by design.
