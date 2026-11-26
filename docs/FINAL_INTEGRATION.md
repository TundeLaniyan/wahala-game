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
| 1 | Backend Ops' compose passes `PLATFORM_MATCH_SERVER_SECRET_FILE`; the match server only read `PLATFORM_MATCH_SERVER_SECRET` | the server reads the file (both set, unreadable or empty = refuse to start): `server/src/core/platform.ts` |
| 2 | The Ops hand-off said "no ticket = a guest as today"; that leaves the invite gate bypassable by talking to the match server directly (requirement 5) | `RUMBLE_REQUIRE_TICKET=1`, compose default: decision FC-1 |
| 3 | The Ops acceptance test I3 joined a *second* player to a party whose match was already open; the platform correctly refuses a late joiner (no late join) | I3 now has the party member type a different name and checks the seat carries the platform name and verified id |
| 4 | The Ops validator replayed `started` / `finished` with the results' match id; the real server records `<match id>:<room nonce>`, so the platform held two matches and every history check failed (16 failures in the first combined run) | the validator reads the id the platform recorded, after the server's own report (FC-3) |
| 5 | The Ops game client item (send the invite code) did not exist | `ensureGuest(nickname, inviteCode)`, the invite form, decision FC-2 |
| 6 | Docker sandbox only: containers here have no outbound route | a local `docker` shim (not in the repository) builds on the host network through the agent proxy; the Docker Hub anonymous pull limit was exhausted, so the base images were pulled from `mirror.gcr.io` and tagged with the names the compose file uses |

## 2. What the combined branch contains

Everything of production (offline game, all 21 campaign missions, City Rumble and Junction Blast, the approved soundtrack and audio engine, the Home and Quick Start menus, the mobile optimisations, the Okada renderer fix and its test) **plus**: the player platform (`player-platform/`), the platform-linked match server (`server/`), the private multiplayer client (`src/online/platform/`, `src/ui/online/platform/`), and the Ops package (`ops/beta/`, `docs/ops/`). The default (public) build contains none of the online code: `tests/online/build-guard.test.ts`, `tests/platform-static.test.ts`, `scripts/check-static-build.mjs`.

## 3. Results

Filled in from the actual runs; see sections 4 to 7.
