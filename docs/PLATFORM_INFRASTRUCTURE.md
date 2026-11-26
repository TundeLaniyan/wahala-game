# Hosting shape and operating costs (nothing is bought or deployed)

No infrastructure was purchased and no public service exists. Prices change and none is quoted here as fact: the numbers below are **sizes and drivers**; obtain quotes from at least two providers (one with a London / Frankfurt region, the latency analysis in `CITY_RUMBLE_ONLINE.md` section 9 favours them for Lagos players) before deciding. The match server's own hosting, capacity and cost model is in that document and `docs/ops/HOSTING_COSTS.md`; this adds the platform.

## 1. Shape

| Component | Sizing today | Notes |
| --- | --- | --- |
| Platform API (`player-platform` container) | one small instance (1 vCPU, 512 MB) serves thousands of players: requests are small JSON, no simulation | stateless **except** two in-memory pieces (rate-limit buckets, presence): fine for one instance; with two or more, move them to Redis (`RateLimiter` / `PresenceStore` are the seams) or pin sessions |
| PostgreSQL 16 | a managed instance with automatic backups and point-in-time recovery; a few GB; row counts are small (accounts, friendships, matches) | the heaviest tables: `match_participants` (32 rows per match), `party_signals` (trimmed), `audit_events` (400-day retention) |
| TLS / edge | the existing nginx edge (`ops/edge`) needs one more upstream (`/v1`, `/.well-known`, `/admin` restricted by IP) | not edited here |
| Secrets | `PLATFORM_MATCH_SERVER_SECRET`, `PLATFORM_ADMIN_TOKEN`, `PLATFORM_HANDOFF_PRIVATE_KEY`, DB URL, provider ids / keys | environment / secret manager only; `npm run check:config` never prints them; rotate the handoff key by publishing both public keys in the JWKS during overlap (key id support is a small follow-up) |
| Housekeeping | the two timers in `main.ts` (party sweep 30 s, purge hourly) | single instance, or run behind an advisory lock |

## 2. Cost drivers (what to price)

1. **Compute** for the API: negligible next to the match servers (one small instance, plus a second for availability once players depend on it).
2. **Managed Postgres**: the main fixed cost; choose backups + PITR and a region near the API; high availability roughly doubles it.
3. **Egress**: JSON requests are tiny; polling clients (parties, friends, invitations every ~15 s) are the main traffic: estimate as `players online x requests per minute`. A push channel (SSE / WebSocket) is the efficiency upgrade, not built.
4. **Voice (if ever built)**: SFU + TURN egress, modelled in `PLATFORM_VOICE_DESIGN.md` (can double a match's egress for talkative matches).
5. **Moderation** (if text / voice ever ships): people and tools, likely the largest recurring cost of any social feature.
6. **Payment fees and store cuts**: set by each provider and store; not a hosting cost but a margin input.
7. **Observability**: logs are structured JSON on stdout; a log shipper and a metrics exporter (not built) cost per GB.
8. **Compliance**: legal review, data-protection registration, possibly a DPO (`PLATFORM_PRIVACY.md`).

## 3. Before any public step (checklist)

Counsel sign-off on privacy / minors / retention; real identity-provider accounts and a verified sign-in on real devices; the match-server change in `PLATFORM_MATCH_HANDOFF.md` with its tests; production secrets and key generation; a restore rehearsal; load and abuse tests against the real deployment (rate-limit numbers are first estimates); a metrics / alerting setup; a moderation staffing plan; and the founder's decisions listed in `PLATFORM_ARCHITECTURE.md` section 4 and `PLATFORM_COMMERCE.md` section 8.
