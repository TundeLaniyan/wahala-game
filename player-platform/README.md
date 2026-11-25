# WAHALA! player platform (development only, not deployed)

Persistent identity, profile, friends, parties, safety and commerce foundations around the City Rumble match server.
**Guest first**; the match server is untouched and keeps working without it.

Read first: `docs/PLATFORM_AUDIT.md` (what already existed), `docs/PLATFORM_ARCHITECTURE.md` (design, data model, decisions),
`docs/PLATFORM_OPERATIONS.md` (run, migrate, back up, delete), `docs/PLATFORM_PRIVACY.md`, `docs/PLATFORM_MATCH_HANDOFF.md` (what the match server must add), `docs/PLATFORM_SAFETY.md`, `docs/PLATFORM_COMMERCE.md`, `docs/PLATFORM_PROVIDER_REQUIREMENTS.md`, `docs/PLATFORM_INFRASTRUCTURE.md`. API contract: `openapi.yaml`
(a test fails if it and the routes diverge).

```bash
npm install && PLATFORM_MOCK_IDP=1 npm start       # in-memory database, http://127.0.0.1:4567
npm test                                           # PGlite; set PLATFORM_TEST_DATABASE_URL to run on real Postgres
```

Layout: `src/identity` (accounts, sessions, providers), `src/http` (shell, limits), `src/db` (drivers, migrations), `src/routes`,
`migrations/*.sql`. The service shares three things with the game (`src/net/protocol.ts` name rules, `src/sim/data/characters.ts`
fighter ids, `src/cosmetics` the cosmetic catalogue) and nothing imports it back.
