# Private beta: security and abuse-test report, backup and restoration verification

What was attacked or broken on purpose, what held, what did not and was fixed, and what is still open. Every "held" below names a check in `ops/beta/validate.sh` (V, real Docker, the real images), a unit test (T, `player-platform/test`), or a load run (L, `BETA_LOAD_RESULTS.md`). Nothing was loosened to make a test pass: where a check failed, the stack was changed, or the check was shown to be wrong (and then made stricter with a positive control), as listed in section 3.

## 1. Attack, control, evidence

| Attack or failure | Control | Result |
| --- | --- | --- |
| Reach the database, the match server or the platform from the internet | Only the edge publishes ports; the `app` and `data` networks are internal | **Held** (V: published ports; membership of each network; neither network can reach out; the database container has no route out) |
| Reach private paths through the edge: `/metrics`, `/ready`, `/internal/*`, `/admin/*`, `/debug` | The edge answers 404; the services also need tokens or HMAC | **Held** (V section 3: all six answer 404 from outside; `/metrics` of both services answers 401 without its token) |
| Start production with a missing or weak secret, a development switch, or a half-migrated database | Start-up refusals with named reasons | **Held** (V section 2, ten different wrong starts; T `config.test.ts`) |
| Secrets leaking: repository, container configuration, logs | Docker secret files, `*_FILE` loading, log scrubbing | **Held** (V: no secret value in any container's configuration; log scan of every service for the real secrets, token shapes, the real room code and friend codes) |
| Steal or replay a session token | Opaque random tokens stored only as hashes; refresh rotates both; reuse of an old refresh token revokes the whole session | **Held** (V section 3: rotation, old access token dead, replay refused, reuse kills the thief's and the owner's session, logout immediate) |
| Forge or tamper a match ticket; use a ticket for another room; use a host ticket to join | EdDSA signature, audience, room, 120 s expiry, public key only | **Held** at the platform and in the verifier (V section 4, T `handoff.test.ts`: wrong room, wrong audience, expired, other key, `alg:none`, HMAC-with-public-key confusion all refused). **Not yet enforced by the match server** (BLOCKED BY INTEGRATION, tests I1-I3) |
| Forge, replay or invent a match result | HMAC with a secret only the server holds, 5-minute skew, first call wins, results naming a never-ticketed player refused, no XP / rating / rank columns exist | **Held** (V section 5 and T) |
| Create accounts in bulk | Edge zone, platform per-address and per-class limits, **invite code** (beta) | **Held** (V: 57 of 60 refused; L row 8: 166,497 of 166,985 refused; invite refusals without and with a wrong code; T `invites.test.ts`) |
| Guess an invite code | 10-64 random characters, per-address limit, constant-time comparison | **Held** by construction (T); brute force is bounded by the limiter, not tested for volume |
| Slow-loris, oversized or malformed bodies, unknown fields (smuggle a role) | Body limits, strict schemas | **Held** (V: 413 for 200 kB; unknown fields refused) |
| WebSocket from another website | Origin check at the server | **Held** (V: upgrade from a disallowed origin refused 403; CORS refuses another origin) |
| Old TLS | TLS 1.2+ only, HSTS | **Held** (V: TLS 1.0 / 1.1 refused) |
| Flood the match server with rooms or joins | Per-guest and per-address limits, room and connection caps | **Held** (L rows 5-7) |
| Start many bot-filled matches to burn the CPU | CPU-budget guard, queue, 120 s wait, then a polite refusal | **Held** (L rows 5-6) |
| Database outage, database crash (SIGKILL), platform crash, match-server crash, full restart | Restart policy, health checks, clean failure | **Held** (V section 7; L rows 10-10b). A crash of the match server ends the matches in progress |
| Free-text abuse | Presets only; unrestricted chat refused in production; voice off | **Held** (V: free text refused, chat and voice absent) |
| Payments and development identity in production | Refused at start-up, and absent in the running stack | **Held** (V sections 2-3) |
| A moderator-less collusion attack: three accounts reporting one player to silence them | Automatic restriction off by default in production; a dismissal lifts it | Analysed and mitigated (`docs/PLATFORM_COLLUSION_ANALYSIS.md`) |

## 2. Residual risk (open on purpose, or not fixable here)

- **Invite codes are shared secrets, not per-person identities.** Anyone given a code can pass it on; revoking a code stops *new* accounts only (`wahala-beta.sh invite revoke`). A personal-allowlist model would need game UI.
- **Per-address limits and shared addresses.** Many phones behind one mobile-carrier address share an allowance (the guest-creation limit is generous on purpose, `PLATFORM_GUEST_CREATE_RATE=15/20`). Not tested with real carrier traffic.
- **Secrets on the server's disk.** Files are readable by the containers' users, inside a folder only the server's administrator can enter. Anyone who has root on the server has everything. Copy `state/secrets` to a password manager; rotate with `wahala-beta.sh rotate` after any staff change.
- **A real certificate** has not been obtained (needs your domain). Until then the temporary certificate is untrusted by browsers.
- **No web-application firewall, no DDoS service.** A flood larger than the server's network will take it down. Putting a CDN in front is a later decision (`docs/ops/HOSTING_ARCHITECTURE.md`).
- **The match server does not check tickets yet**, so today a platform account does not protect a room (section 1, third row).
- **One host**: if the machine is lost, so is the service until restored from a copy you took off it.

## 3. Defects found by this work (all fixed, each re-tested)

| Found by | Defect | Fix |
| --- | --- | --- |
| Building the real production image | The platform crashed at load: its development database library was bundled as a hard dependency | optional load; friendly error |
| First production start | A guests-only beta could not start (it demanded a real identity provider) | explicit `PLATFORM_GUEST_ONLY=1`, refused otherwise |
| First production start | The migrate step demanded unrelated production secrets | it checks only the database address |
| Validation: stop the database | The database container could not be stopped cleanly (init process had no right to signal PostgreSQL), so every stop was a crash | `init: false` for the database |
| Validation: replace a container | The edge kept the old address of a replaced service and answered 502 | the edge resolves names on every request |
| Validation: unmigrated database | The platform died with a stack trace instead of "run migrate" | catalogue sync skipped until the schema is current, clear message |
| Validation: edge limiter | Edge rate-limit refusals carried no `Retry-After` | added at the edge |
| Validation: rotate the ticket key | **Every ticket key was published under the same id `handoff-1`**, so a verifier that caches keys by id could not notice a rotation | the id is now the key's thumbprint; test added |
| Validation: rotate the database password | My check was wrong: inside the database container `127.0.0.1` is trusted, so "old password refused" could never be shown | check moved to another container over the network, with a positive control |
| Validation: crash tests | `docker kill` counts as a manual stop and is correctly never restarted; the test did not exercise the restart policy | crashes are simulated with SIGKILL from outside Docker |
| Load: reconnect | My reconnect called the SDK by hand without the guest id; the server rightly refused | the harness now behaves like the game (automatic reconnection) |

## 4. Backup and restoration verification

**What is backed up.** The whole PostgreSQL database (`pg_dump`, custom format, every table), nightly at 03:00 UTC by the `backup` service, files `state/backups/wahala-<UTC time>.dump`, mode 0600, kept 14 days, plus a heartbeat file that the monitor reads (alert at 30 hours, critical at 54).

**What was verified (V section 8, run on every validation):**

1. `wahala-beta.sh backup` writes a file (about 73 kB for 10 test accounts), mode 600.
2. `wahala-beta.sh restore-test` restores the newest backup into a scratch database, counts players, profiles, sessions, audit rows and the schema version, compares them with the live database, and drops the scratch database. The live database is never touched.
3. **The disaster drill.** The live database is damaged on purpose (all sessions, friendships, match participants, matches and profiles deleted). `wahala-beta.sh restore FILE --yes` takes a safety backup, stops the platform and edge, replaces the database, runs the migrations, restarts everything. Then the full persistence check runs: every test account, its session (the refresh token still works), nickname, profile settings, block, mute and party are back.
4. After a **database password rotation**, backups use the new password (the backup service is restarted by the rotation; the next backup succeeded in the same run).

**Not verified, so do not assume it:**

- That the nightly timer fires at 03:00 (the same code ran on demand; no night was waited out).
- A restore onto a brand-new server from a copied backup (the mechanism is the same `pg_restore`; the handbook says to copy `state/secrets` too, because the new server needs the platform's signing key and tokens).
- Point-in-time recovery: not offered. You can lose up to a day of accounts, friendships and match history (not the game itself).
- Corruption of the backup file in transit: `restore-test` is what detects an unusable file; run it weekly (handbook section 8).
