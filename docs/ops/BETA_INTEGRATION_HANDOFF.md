# Private beta: what Architecture still has to connect, and the exact tests that prove it

**Status: BLOCKED BY INTEGRATION.** Everything on the deployment and platform side is built and verified (`BETA_READINESS.md`). The items below need changes in files that Architecture owns (the match server `server/src/**`, the game client `src/**`, the online UI). This branch did not touch them. No second identity, party or matchmaking system exists or is proposed: the platform issues tickets, the match server (the authority for rooms) checks them.

The contract itself is already written and unit-tested: `docs/PLATFORM_MATCH_HANDOFF.md` (sections 2-3), `player-platform/src/handoff/verify.ts` (reference verifier), `player-platform/src/http/serviceAuth.ts` (reference signer, 7 lines), `docs/openapi/platform.yaml`. This file adds only: the deployment wiring that is already in place, the precise list of changes, and the acceptance tests.

## 1. Wiring that is already in place (no deployment change needed when you integrate)

`ops/beta/compose.yml`, service `rumble`, already carries:

| What | Value | Note |
| --- | --- | --- |
| `PLATFORM_JWKS_URL` | `http://platform:4567/.well-known/jwks.json` | private network; the platform's public key set (Ed25519, `kid`) |
| `PLATFORM_INTERNAL_URL` | `http://platform:4567` | base for the signed calls (`/internal/v1/matches/started`, `/finished`) |
| `PLATFORM_MATCH_SERVER_SECRET_FILE` | `/run/secrets/match_server_secret` | the HMAC key, a file, never an env var. The match server must read the file (the platform reads the same file) |

The edge does **not** route `/internal/*` publicly (checked by `validate.sh`), so these calls only ever travel on the private `app` network. If you prefer other variable names, change the three lines in the compose file in the same commit.

## 2. Changes needed (all in Architecture-owned files)

1. **Verify tickets at join / create** (`server/src/**`, the room's `onAuth` / `onJoin`). `options.ticket` present: verify EdDSA signature against the JWKS (cache it; **re-fetch once on an unknown `kid`**, because `wahala-beta.sh rotate ticket-key` changes the key), `iss = wahala-platform`, `aud = wahala-rumble`, `exp` (tickets live 120 s), and `room` equal to this room's code (`*` only for creating a private room). Failure: refuse with the same uniform answer as a bad room code. **No ticket = the guest join exactly as today** (offline play, public rooms, the current client keep working).
2. **Bind identity to the seat.** Store `claims.sub` on the lobby member, use `claims.name` as the display name (ignore the client's `name`), keep `claims.restricted`.
3. **Post two signed calls** from the match server to `PLATFORM_INTERNAL_URL`: `POST /internal/v1/matches/started` when a match begins, `POST /internal/v1/matches/finished` with the real `results()`. Fire-and-forget with a short timeout: **a slow or dead platform must never delay `beginMatch` or the end of a match** (the platform is idempotent; a lost call only loses that history entry).
4. **Client** (`src/**`, online UI): ask `POST /v1/parties/:id/match/ticket` before `create` / `joinById` and pass it as the `ticket` join option; refresh it when the join is retried after 120 s. Out of scope here: all of the social UI.
5. **Later, not required for the beta:** relay-filter calls for in-match signals and a mute/block refresh push (`docs/PLATFORM_MATCH_HANDOFF.md` section 5).

## 3. Acceptance tests

`ops/beta/validate.sh` already contains the checks for items 1-3. Today they are reported as **BLOCKED BY INTEGRATION**, and the same checks, run with the flag, **fail against the current server** (so they are sensitive: they would not pass by accident). When the integration is done:

```bash
VALIDATE_INTEGRATION=1 ops/beta/validate.sh --quick     # join-time tests I1-I3, about 4 minutes
VALIDATE_INTEGRATION=1 ops/beta/validate.sh             # plus a real 3-minute match and the history tests I4-I5, about 8 minutes
```

| # | Test | Expected today | Expected when integrated |
| --- | --- | --- | --- |
| I1 | A **host** ticket (`room: "*"`) cannot be used to join an existing room | FAIL (ticket ignored, join succeeds) | PASS |
| I2 | A tampered ticket is refused by the match server | FAIL | PASS |
| I3 | A ticketed player appears under the **platform** name even if the client sends `name: "Impostor"` | FAIL | PASS |
| I4 | After a real match, **without** `validate.sh` posting anything, the signed `started` / `finished` calls arrive: each participant's `GET /v1/me/matches` lists the match, and a stranger's does not | not run today (the validator posts the bodies itself, labelled as a simulation) | PASS. **Required change in `validate.sh` when this lands:** when `VALIDATE_INTEGRATION=1`, skip step 5's simulated posting and keep only its replay / forgery / unticketed-player checks, which post their own bodies on purpose |
| I5 | Platform outage does not delay a match: `docker compose stop platform`, create a room, start: the match begins within 2 s and finishes; `docker compose start platform`; the platform logs no `finished` for it (the call was lost) and everything is healthy | manual today | PASS (add to `validate.sh` step 7) |
| I6 | No ticket, no problem: a plain guest join and a public quick-play still work against the integrated server (regression for offline play) | PASS | PASS |

Server-side unit tests to add next to the change (listed in `docs/PLATFORM_MATCH_HANDOFF.md` section 3): unticketed join unchanged; ticket for another room refused; host ticket creates; expired ticket refused; a platform 5xx or timeout never delays `beginMatch`.

## 4. Not in scope of the private beta (do not build for it)

Text chat, voice, ranked rewards, real payments: disabled by configuration and refused by the production start-up checks. The platform stores no XP, rating or rank; the finished call never carries one.

## 5. Who owns what

| File area | Owner | This branch |
| --- | --- | --- |
| `server/src/**`, `src/**`, online UI, match tickets in the client | Architecture | not touched |
| `player-platform/**`, `ops/**`, `docs/ops/**`, `docs/PLATFORM_*.md` | Backend | owns |
| `ops/beta/compose.yml` rumble block (variables in section 1) | Backend sets, Architecture may rename | already wired |
