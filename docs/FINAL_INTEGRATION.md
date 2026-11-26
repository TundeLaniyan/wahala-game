# Final private-multiplayer consolidation (branch `claude/wahala-final-private-beta-v1`)

This is the one document that says what was combined, what was changed to make it fit, and what was run. Decisions FC-1 to FC-4 are in `docs/DECISIONS.md`. **Nothing here is merged into the publishing branch and nothing is deployed:** production (GitHub Pages) stays at `d164e45` (Okada hotfix) with `10d0b26` docs on top.

## 1. Source commits and the commit graph (verified, not assumed)

| Line | Branch | Head used | State |
| --- | --- | --- | --- |
| Production (publishes Pages) | `claude/wahala-stitch-uiux-v1` | `10d0b26` (docs) on `d164e45` (live build, Okada hotfix) | CI runs 349 (green after one re-run of two unrelated shards) and 350 (docs-only, green) |
| Private multiplayer | `claude/wahala-private-multiplayer-v1` | `60c1a46` | already contained the production hotfix; its last CI run (351) failed on two unit-side tests, see section 7 |
| Backend Ops | `claude/wahala-backend-ops-v1` | `16231ba` | based on `e77d864`, 16 commits ahead of that base, 28 production commits behind; its last CI run (348) failed only on the open audio E2E issue |

The final branch is built **from production `10d0b26`**, then `git merge --no-ff` of the multiplayer branch (no conflict: it already contained production), then `git merge --no-ff` of Backend Ops. No other branch was touched and no history was rewritten.

### Merge log and conflicts

| Merge | Textual conflicts | Files changed on both sides |
| --- | --- | --- |
| production + multiplayer | none | none (the multiplayer branch contained production) |
| + Backend Ops | none | none: the two lines changed disjoint files (`git diff --name-only` of each side from the merge base `e77d864` has an empty intersection) |

"No textual conflict" is not "no conflict". The combined code and docs disagreed in these places, found by building and running the stack, and resolved as follows:

| # | Disagreement | Resolution |
| --- | --- | --- |
| 1 | Backend Ops' compose passes `PLATFORM_MATCH_SERVER_SECRET_FILE`; the match server only reads `PLATFORM_MATCH_SERVER_SECRET`, and a first version that read the file itself failed the server's no-file-system guard (`server/test/requirements.test.ts`) | the `rumble` entrypoint turns the secret file into the variable inside the container only, as Ops already does for the metrics token (`ops/beta/compose.yml`); the server stays fs-free |
| 2 | The Ops hand-off said "no ticket = a guest as today"; that leaves the invite gate bypassable by talking to the match server directly (requirement 5) | `RUMBLE_REQUIRE_TICKET=1`, compose default: decision FC-1 |
| 3 | The Ops acceptance test I3 joined a *second* player to a party whose match was already open; the platform correctly refuses a late joiner (no late join) | I3 now has the party member type a different name and checks the seat carries the platform name and verified id |
| 4 | The Ops validator replayed `started` / `finished` with the results' match id; the real server records `<match id>:<room nonce>`, so the platform held two matches and every history check failed (16 failures in the first combined run) | the validator reads the id the platform recorded, after the server's own report (FC-3) |
| 5 | The Ops game client item (send the invite code) did not exist | `ensureGuest(nickname, inviteCode)`, the invite form, decision FC-2 |
| 6 | Docker sandbox only: containers here have no outbound route | a local `docker` shim (not in the repository) builds on the host network through the agent proxy; the Docker Hub anonymous pull limit was exhausted, so the base images were pulled from `mirror.gcr.io` and tagged with the names the compose file uses |

## 2. What the combined branch contains

Everything of production (offline game, all 21 campaign missions, City Rumble and Junction Blast, the approved soundtrack and audio engine, the Home and Quick Start menus, the mobile optimisations, the Okada renderer fix and its test) **plus**: the player platform (`player-platform/`), the platform-linked match server (`server/`), the private multiplayer client (`src/online/platform/`, `src/ui/online/platform/`), and the Ops package (`ops/beta/`, `docs/ops/`). The default (public) build contains none of the online code: `tests/online/build-guard.test.ts`, `tests/platform-static.test.ts`, `scripts/check-static-build.mjs`.


## 3. The two checks Backend Ops reported as blocked

Backend Ops reported `241 passed, 0 failed, 2 blocked by integration`. The two blocked checks were: **(1)** the match server verifies the signed ticket and binds the verified player id to the seat; **(2)** the match server itself sends the signed `started` and `finished` calls (the validator had been posting them in its place). Both now run in `ops/beta/validate.sh` and pass, on the real Docker images through the TLS edge:

| Required confirmation | Evidence (`docs/measurements/beta-backend/validation-report-final-integrated.txt`) |
| --- | --- |
| 1. The server verifies signed tickets and binds verified ids to the right seats | I1 (a host ticket cannot join an existing room), I2 (a tampered ticket is refused), I3 (a ticketed player sits under the platform name whatever name the client sends), I3b (the seat carries the verified platform id), I10 (a made-up ticket is refused); unit `server/test/platform.test.ts` (forged key, expired, wrong room, wrong audience, replayed, wrongly scoped, one seat per account) |
| 2. The server sends authenticated lifecycle events and trusted results | I4a (the match server itself reported the finished match: the validator posted nothing before the check), I4 (the recorded placement and eliminations equal the server's own final results), I4b (the leader has the same match); step 5: unsigned, forged and stale internal calls refused (401), a result naming a never-ticketed player refused (400), a replay changes nothing; I5 (platform stopped: the match still starts within 2 s of the baseline and keeps running) |
| 3. The client obtains and submits the correct platform-issued ticket | `tests/online/platform-controller.test.ts` (a fresh ticket right before each use, a leader's host ticket, a member's room ticket, one retry on a refusal) and the hosted-stack browser run (section 5) |
| 4. Guest-only compatibility where authorised | a server without `RUMBLE_REQUIRE_TICKET` is exactly the old guest server (`server/test/platform.test.ts`, `platform.noconfig.test.ts`, the whole existing server suite); the public Pages game never touches any of it |
| 5. Uninvited visitors cannot bypass admission through the match server or the matchmaking APIs | `RUMBLE_REQUIRE_TICKET=1` (decision FC-1): I7 (a guest cannot join by a known room code), I8 (cannot create a room), I9 (quick play closed), **I11** (raw HTTP create / join by code / quick play through the edge, no browser, no SDK: refused), unit `server/test/platform.strict.test.ts`, and in a real browser (section 5): a wrong invite code refused, no create / join / quick-play controls, raw matchmaking requests refused, nobody got a seat |

The exact `started` and `finished` contracts are `docs/PLATFORM_MATCH_HANDOFF.md` section 3, `docs/openapi/platform.yaml` and `player-platform/src/matches/service.ts` (`StartedInput`, `FinishedInput`). The server builds the bodies in `RumbleRoom.reportToPlatform` from its own state only (match id `<id>:<room nonce>`; the room code for private rooms; one participant per seat, with the verified `playerId` for human seats and `isBot` for the rest; results with placement and eliminations), signed `HMAC-SHA256(ts.POST.path.body)`, 2 s timeout, never awaited by the match.

## 4. Two-browser end-to-end on the combined stack

Two real runs of `e2e/private-multiplayer.spec.ts` (A desktop, B phone-sized touch, C an outsider), both **1 passed**:

| Run | Stack | Result |
| --- | --- | --- |
| `npm run test:private-e2e` | development stack: real PostgreSQL 16.15, platform, platform-linked match server, server build of the game | passed, 9.4 min (`docs/measurements/beta-backend/private-e2e-local-stack-run.txt`) |
| `npm run test:beta-e2e` | the **hosted** stack: the real Docker images behind the TLS edge, the match server **requiring tickets**, the platform **invite-only**, the **private-beta client** on another origin | passed, 9.5 min (`docs/measurements/beta-backend/beta-e2e-hosted-stack-run.txt`); the match-server and platform logs hold no invite code and no secret |

What both cover: guest onboarding (the hosted run through the invite form), nicknames, friends by code, party creation and joining, one private room, both players VERIFIED with platform names, preset quick signals in the lobby and in the match, mute and report performed (block reachable), a 3-minute private Free-for-All with 2 humans and 30 bots (32 fighters), a touch pad, a forced disconnect and reconnection to the SAME seat inside the 30 s window, identical results on both browsers, the platform history written by the server for both players, the room lobby again (rematch), Team Rumble, a second match with signals and results, recorded again. On the hosted stack the outsider C instead proves rejection: a wrong invite code is refused in the page, there are no create / join / quick-play controls, raw `matchmake` requests (create, join by code, quick play, a made-up ticket) are refused, and the room still has two members.

## 5. Open problems and risks

| # | Item | State |
| --- | --- | --- |
| 1 | `e2e/audio.spec.ts`: the second match never shows its HUD | **OPEN**, unexplained, intermittent, seen on production, Ops and platform code; narrowed and diagnostics extended (decision FC-6); never "fixed" by a longer wait |
| 2 | Real phones, real mobile networks, a real host, domain and certificate | **NOT DONE** (listed as pending, never claimed) |
| 3 | The match server is one process | a restart ends the running matches and their results are not recorded; the platform and the match server restart cleanly in between (validated) |
| 4 | Capacity | the evidence is Backend Ops' (`docs/ops/BETA_LOAD_RESULTS.md`, taken with ticketless guests: admission does not change a match's cost). **No new capacity measurements were taken**, so the limit stays at 2 simultaneous matches |
| 5 | Moderation | reports are stored and readable by command; no moderator screen, nobody is alerted |
| 6 | Privacy and age policy | counsel review, the Nigerian data-protection position and a guardian / age rule are founder decisions (the platform treats an unspecified age as a minor) |
| 7 | Sandbox-only workarounds | a local `docker` shim (the sandbox's containers have no outbound route) and base images pulled from a mirror (Docker Hub's anonymous pull limit); neither is in the repository. A real server pulls normally |

## 6. Recommended server and limits (first hosted beta)

| Item | Value | Basis |
| --- | --- | --- |
| Server | **Ubuntu 24.04 LTS, 2 vCPU (dedicated if possible), 4 GB memory, 40 GB SSD**, one public IPv4 | Backend Ops' load evidence (`docs/ops/BETA_LOAD_RESULTS.md`); in this validation a real 32-fighter match peaked at about 50 % of one core and 173 MB for the match server; the rest of the stack is about 1 GB |
| Simultaneous matches | **2** (`RUMBLE_MAX_PLAYING_ROOMS`, the compose default); a third match queues up to 2 minutes | no new measurements were taken here, so the limit is not raised |
| Fighters per match | 32 in all (humans plus bots), existing bot-fill and 30 s reconnection rules unchanged | locked product rules; I5 and the browser runs show 2 humans + 30 bots |
| Testers | 4 to 8 invited people, in at most two parties playing at a time | follows from the match limit |
| Match server | **one process**; a restart ends the matches in progress | by design, validated (crash and restart) |
| Backups | nightly dump on the same disk, restore **tested** (disaster drill); copy off the server by hand | validation section 8 |

## 7. The private-beta client and its hosting

Strategy, build, origins and the table of what protects each entry point: **`docs/ops/BETA_FRONTEND.md`**. In one paragraph: the public Pages game is untouched and online-off; the private beta uses a separate build (`BETA_DOMAIN=play.yourname.com npm run build:beta` into `dist-beta/`, never published by CI) hosted as a static site on its own origin; that origin is the one exact origin both servers allow; PLAY ONLINE appears without `?online`, asks for the invite code, and offers only the party's private match; every entry point (account creation, the match server's matchmaking, raw HTTP, a leaked room code, another website) is refused without an invite-backed account and a platform ticket. Typing `?online` on the public site still does nothing (`tests/online/build-guard.test.ts`, `tests/platform-flags.test.ts`, `scripts/check-static-build.mjs`).

## 8. Founder testing

Two separate procedures, in **`docs/ops/BETA_FOUNDER_TESTING.md`**: **A.** one laptop and two phones on the same Wi-Fi (commands, addresses, invite, start, reconnect, confirming the trusted results on the phone under YOU > Recent matches, and what to do when a connection fails; the full tap table is `docs/PLATFORM_LOCAL_TEST.md`); **B.** the supervised hosted beta (what the founder must provide first, the exact steps, the acceptance run on two phones on mobile data, the limits and the stop conditions). Nothing was purchased or deployed.

## 9. Exact remaining hosting prerequisites

1. A rented Linux server (section 6) and the decision to pay for it.
2. A domain and its `A` record; the real certificate (`wahala-beta.sh cert`, practice mode first).
3. The address of the static page the beta client will live on, and a static host for it.
4. An email address for the certificate authority; optionally an alert webhook and an off-server place for backups.
5. A privacy notice for testers and a minimum-age policy (the platform treats an unspecified age as a minor); counsel's view of the Nigerian data-protection position.
6. A named person who watches the beta while testers play and reads reports (`wahala-beta.sh admin GET /admin/v1/reports`).
7. On the server: `ops/beta/wahala-beta.sh validate --quick` must say `NO FAILURES` before anyone is invited.
8. Real-phone and mobile-network acceptance (procedure B, step 5): **pending**.
