# Private beta: the match-server integration (DONE on `claude/wahala-final-private-beta-v1`, decision FC-1)

**Status: INTEGRATED.** This file was the hand-off written by Backend Ops while the match server, the game client and the online UI were Architecture's. Those parts now exist in this branch and the two checks Backend Ops reported as `BLOCKED BY INTEGRATION` run, and pass, in `ops/beta/validate.sh` (see `docs/FINAL_INTEGRATION.md` for the run). The sections below are kept as the specification and now read as "what was connected and where":

| Hand-off item | Where it lives now |
| --- | --- |
| 1. Verify tickets at join / create | `server/src/app.ts` (`guardedInvoke`) + `server/src/core/platform.ts` (`PlatformLink.verifyTicket`: EdDSA signature against the JWKS with re-fetch on an unknown `kid`, issuer, audience, expiry, the room bound in the ticket, single use) |
| "No ticket = a guest as today" | still true for a server **without** `RUMBLE_REQUIRE_TICKET` (offline-style dev, `npm run dev:private`). **The hosted beta sets `RUMBLE_REQUIRE_TICKET=1`** (the compose default): every matchmaking request from the network needs a valid ticket, so nobody can go around the invite gate by talking to the match server directly. See `docs/ops/BETA_FRONTEND.md` section 3 |
| 2. Bind identity to the seat | `server/src/rooms/RumbleRoom.ts`, `server/src/core/Lobby.ts`: the platform id and name come from the verified ticket only (server-stamped `_acct`; client options starting with `_` are stripped); the typed name is ignored; one seat per account |
| 3. Signed `started` / `finished` calls | `server/src/core/platform.ts` (`report`) from `RumbleRoom.reportToPlatform`: HMAC over `ts.POST.path.body`, 2 s timeout, retries in memory, never delays a tick or a start. The match id is `<match id>:<room nonce>` (a rematch in the same room is a different match) |
| 4. Client asks for the ticket and sends the invite code | `src/online/platform/*` (`ensureGuest(nickname, inviteCode)`, ticket fetched right before each use), `src/ui/online/platform/PlatformPanel.tsx` (invite form), `EntryScreen` (private-beta mode) |
| Shared secret as a file | `PLATFORM_MATCH_SERVER_SECRET_FILE` read by `loadPlatformConfig` (both set, unreadable or empty: the server refuses to start) |

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
