# WAHALA! City Rumble — operations, infrastructure and deployment readiness

Written 2026-11-24 by the operations / infrastructure / security workstream, on branch `ccr-c13ce439-rvwlkb`, which is the
online-server branch `claude/wahala-city-rumble-online-30w0rm` (9fd7f5e) **plus operations files only**. Nothing under
`src/`, `server/`, `.github/` or the existing docs was changed. Nothing was bought, provisioned, merged or deployed.

**Read this first, then the numbered documents.**

| # | Document | Answers |
| --- | --- | --- |
| 01 | [Audit](01-AUDIT.md) | What the server bundle needs, what it does, what is missing |
| 02 | [Local same-Wi-Fi setup](02-LOCAL-LAN.md) | How to test with phones tonight, at no cost |
| 03 | [Docker](03-DOCKER.md) | Container build and hardened profile, validated |
| 04 | [HTTPS / WSS architecture](04-HTTPS-WSS-ARCHITECTURE.md) | How GitHub Pages talks to a server later |
| 05 | [Regions and costs](05-HOSTING-REGIONS-COSTS.md) | Latency and price evidence, with its limits |
| 06 | [Capacity](06-CAPACITY.md) | 32-human rooms vs bot-heavy rooms, how many rooms per core |
| 07 | [Monitoring](07-MONITORING.md) | Health, metrics, alerts, error reporting, room lifecycle |
| 08 | [Security](08-SECURITY.md) | Checklist, abuse protections, secret handling, handoff items |
| 09 | [Release scope](09-RELEASE-SCOPE.md) | First public release vs later |

Tooling lives in [`/ops`](../../ops/README.md) (launcher, probes, proxy, compose, monitoring). Every claim below is tagged
**VALIDATED** (I ran it, here), **MEASURED** (a number I produced here), **EVIDENCE** (from a source I could only read as a
search snippet, so treat it as unverified until checked on the provider's page), or **NOT VALIDATED**.

## Bottom line

1. **Same-Wi-Fi phone testing: GO.** One command, `node ops/local/lan.mjs`, builds the single-file server bundle, runs it
   with plain `node` under the production origin policy, serves the client to the network and prints the phone URL.
   VALIDATED here with a real Chromium on a phone profile reaching the server over a non-loopback `http://` address.
   It cannot show phone GPU speed, touch feel or real radio latency: only a real phone can.
2. **The Docker image builds and runs; the 30-second reconnection requirement holds** on the shipped bundle: reconnect at
   26.0 s succeeds with the same seat, reconnect at 33.0 s is refused. VALIDATED in real time, directly and through TLS +
   nginx with rate limits on.
3. **Private internet testing (invite-only, a few testers): GO once the founder approves one small VM, a domain and the
   spend.** The design, proxy, compose file, monitoring and probes are ready and rehearsed locally with a self-signed
   certificate. A real certificate, a real host and real phones are still to do.
4. **Public hosting: NO-GO today.** Four blockers, all measured here, not theoretical (section "Public-release blockers").
   The worst: one anonymous client can saturate a server process with six WebSocket connections.
5. **Region is not decided and cannot be decided from a desk.** Wired evidence favours London / Paris / Amsterdam
   (about 104–114 ms from Lagos); Johannesburg shows a surprisingly low ~73 ms that contradicts Cape Town (~240 ms) and must be
   confirmed; all of it is wired, from search snippets, and excludes the phone's radio leg. A 10-minute phone test
   ([`ops/probes/latency`](../../ops/probes/latency/index.html)) settles it for free.

## What was validated locally, and what has to wait

| Item | Status | How |
| --- | --- | --- |
| Server typecheck, 67 server tests | VALIDATED | `npm run typecheck`, `npm test` in `server/`: 67/67 pass in 62 s |
| Bundle builds (4.06 MB) and runs under plain `node` | VALIDATED | `npm run bundle`, then `node dist/rumble-server.mjs` |
| Existing `server/Dockerfile` | VALIDATED | built unchanged (331 MB), runs as `node`, `docker stop` exits 0 in 0.2 s with a clean "shut down" |
| LAN launcher + insecure-context browser reaching it | VALIDATED | `lan.mjs --selftest` and `browser-check.mjs` (Pixel 7 profile) |
| Origin policy, CORS, metrics token, name validation, junk/flood kicks, 4 KB frame cap | VALIDATED | `ops/probes/probe.mjs`: 43 pass, 0 fail |
| Reconnect window, token single-use, hijack refusal, kicked/consented leave | VALIDATED | probe group `reconnect`, real 30 s timing |
| TLS (wss/https), path allow-list, per-IP limits, masked logs | VALIDATED locally | nginx container, self-signed cert; 35 of 40 room creations refused; reconnect unaffected |
| Hardened container profile (read-only, no capabilities, healthcheck) | VALIDATED | `compose.yml` up, server `healthy` |
| Alerts for overload and outage + recovery + webhook | VALIDATED | `watch.mjs` against a real 4-room overload and a real kill |
| Error reporter exits and scrubs codes / tokens | VALIDATED | `error-reporter.mjs` |
| 32 humans in one room, clean network | VALIDATED (replicated) | 10.6 % of one core, 10.3 KB/s per client, 0 dropped ticks, 32 replicas identical |
| Capacity of bot-heavy rooms | MEASURED | 1 room ≈ 24 %, 3 ≈ 70 %, 4 ≈ 94 % (28 ticks dropped), 6 saturated (370 dropped) |
| A real certificate (Let's Encrypt), DNS, a real VM, provider firewall | **WAITS** for approved hosting | |
| Real latency / jitter / loss from Nigerian phones | **WAITS** for real phones | |
| Phone GPU performance, touch controls, thermal throttling, app switching on iOS | **WAITS** for real phones | |
| Multi-process / multi-room-host scaling (Redis presence) | NOT VALIDATED | needs server wiring (Architecture) |
| DDoS absorption at the network edge | NOT VALIDATED | only a provider or CDN can show it |
| Any claim about production readiness | **NOT MADE** | simulated clients and one container are not a launch rehearsal |

## Public-release blockers (measured, each has an owner)

| # | Blocker | Evidence | Fix | Owner |
| --- | --- | --- | --- | --- |
| B1 | **One client can start bot-filled matches at will.** `create` with `private:false, autoStartSec:0` starts a 32-fighter match with 31 server bots immediately. Six such rooms from one client: 104 % CPU, event-loop p99 150 ms, 370 dropped ticks, every honest player in slow motion. | `probe.mjs --only botstorm --storm 6` | Server: global and per-IP room caps, ignore client `autoStartSec` in production, refuse new bot matches above a CPU / room budget (handoff SRV-1..3) | Architecture |
| B2 | No limit on room creation | 40 of 40 created in 113 ms against the bare server | nginx limit validated (5 of 40 accepted); server cap still needed because the limit is per IP and IPs are cheap | Ops now, Architecture later |
| B3 | Names: a human can be called `BOT Chidi`, `Admin`, or a Cyrillic look-alike, and two humans can share a name | probe group `names` | Reserved-name and look-alike rules, or server-assigned `Guest ####` in public rooms (SRV-4) | Architecture |
| B4 | No real phone has ever played it; region undecided | | Phone test, see 05 | Founder + testers |

Also required before public, but not blockers for a private test: a domain and real TLS; `RUMBLE_METRICS_TOKEN` and
`RUMBLE_ALLOWED_ORIGINS` set; a billing alert at the provider; an alert channel someone reads; a rollback and drain routine;
a privacy notice (IP addresses reach the logs). Full lists: [08](08-SECURITY.md), [09](09-RELEASE-SCOPE.md).

## Decisions I need from the founder (none block local work)

1. **Approve a hosting experiment?** One small dedicated-vCPU VM, about USD 40 / month (see 05), a domain (about USD 10 / year),
   cancel any time. Until approved, nothing is bought.
2. **Public-room names:** keep free-text names (needs the SRV-4 rules), or use server-assigned `Guest ####` in public rooms and
   free-text only in private rooms (recommended: removes the whole class of name abuse for the first release).
3. **Mobile reload and the reconnect token:** the client keeps the reconnection token in memory only, so a phone browser that
   reloads the page (common on iOS after a background) loses its seat after 30 s. Storing it in `sessionStorage` for 30 s
   would survive a reload at a small theft risk. This is a client decision for Architecture; flagged in 08.

## How to use this branch

```
node ops/local/lan.mjs                     # phone test on your Wi-Fi (docs/ops/02)
node ops/probes/probe.mjs --http http://127.0.0.1:2567 --metrics-token T      # security / ops probe
node ops/monitoring/watch.mjs --base http://127.0.0.1:2567                     # alert watcher
```

This branch should **not** be merged as-is into the game's publishing branch: it is based on the online-server branch, and
`.github/workflows/deploy.yml` there publishes only from `claude/wahala-stitch-uiux-v1`, so pushing this branch runs CI as a
dry run and publishes nothing. (`scripts/ci/plan.ts` only skips the browser suite for `docs/` and `reference/`; `ops/` counts as code,
so that CI run will be the full one.) The `ops/` and `docs/ops/` files can be cherry-picked onto whichever branch Architecture ships.
