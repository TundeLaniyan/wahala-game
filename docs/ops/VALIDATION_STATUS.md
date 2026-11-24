# What was validated, and what must wait

Date 2026-11-24. Machine: 4 vCPU / 16 GB Linux VM, Node 22.23.5, Docker 29.9 (daemon started in the sandbox; base images pulled from a registry mirror because Docker Hub rate-limited). Everything below is reproducible with `ops/scripts/validate-local.sh` unless marked.

## Validated here (evidence level: automated, simulated clients, one machine)

| # | Claim | Result |
| --- | --- | --- |
| 1 | Server typecheck and suite | clean; **18 files / 193 tests passed** (117 s) |
| 2 | Single-file bundle runs with plain `node` outside the repo | yes (production mode; `/health` ok; `/metrics` open without token: F1) |
| 3 | **Container build** (`ops/docker/Dockerfile`, built for the first time) | builds; 331 MB; non-root uid 1000; `HEALTHCHECK` reports healthy |
| 4 | **Reproducible build** | in-container bundle sha256 = host bundle sha256 (`6846af19e324b5e2...`) |
| 5 | Hardened run (`--read-only --cap-drop ALL --no-new-privileges --cpus 1 --memory 512m`) | healthy; SIGTERM → exit 0 in **164-242 ms** |
| 6 | TLS edge (nginx, self-signed) + server in compose, server not published | HTTP/2 over TLS; `wss://` create/join/lobby/leave works through it; `/metrics` → 404; non-upgrade → 426; `http://` → 308 |
| 7 | Edge limits | 500 rapid room creations → **5 allowed**; 300 simultaneous upgrades → 255 refused; allowlist `deny all` → 403, allowed → 200; a legitimate host succeeds after cool-down |
| 8 | Laptop flow `npm run dev:online` via a non-loopback LAN address | page 200, `/health` ok, listed page origin accepted, unlisted origin **403**, full protocol smoke passes |
| 9 | Black-box abuse behaviour of the server | name abuse 5/5 refused; forged tokens 5/5 refused; 4 KB frame cap; no room-listing endpoint; room-creation flood **unlimited without the edge** (F2); **started-room CPU** measured (F3) |
| 10 | Monitor | 10 unit tests pass; on a live 3-room overload it raised crit/warn alerts and exit 1; Prometheus text produced |
| 11 | Phone latency page logic | in an emulated phone: a 40 ms stand-in measured 44 ms, a dead endpoint 12/12 lost, JSON report produced. **The sandbox-network numbers it printed for AWS regions are not Nigerian evidence and are not used.** |
| 12 | Secrets tripwire | passes the tree; trips on a planted token and a filled env file |

## Found but not resolved (handed to Architecture, not fixed here)

- **Repo browser e2e (`npm run test:online-e2e`) did not pass here.** Two runs, same single test (`two real browsers ... reconnect`), **different failures:** run 1: `stick-zone` bounding box null (the guest's touch pad was not found); run 2: after the guest's network came back, `net-banner` still present after the 120 s timeout. The other 3 tests did not run (serial). The software-WebGL VM renders 1-2 fps, which the repo's own docs say stalls timings, so an environment cause is plausible; but a reconnect problem is **not ruled out**, and reconnection is a locked requirement. Needs a re-run on a real machine / CI and a look by the owner. I did not investigate or modify anything.
- F3 (no cap on playing rooms), F1/F8 hardening in the server, name deny-list: `AUDIT.md`.

## Not validated: needs approved hosting

Real certificate and DNS; behaviour behind a real internet path; provider firewall; certificate renewal; the real cost; CPU performance on the chosen VM class (shared vCPU jitter, burstable credits); provider-side DoS protection; external uptime checks; log retention; a rollback drill; the Cloudflare/CDN option; same-origin static serving of the online build (designed, not built).

## Not validated: needs real phones on real networks

Input latency and jitter on MTN/Airtel/Glo/T2 and Wi-Fi; radio handover and Wi-Fi ↔ data switches; the **30 s reconnection on a genuine app switch / lock screen** (iOS suspends sockets); battery, heat, frame rate, touch controls online; carrier NAT behaviour against the per-address limits; the region decision. Emulated impairment (150 ms ±30, 1-3 % loss) and desktop Chromium are not substitutes.

## Not claimed

No claim of production readiness. Simulated-client load (up to 256 clients, 8 rooms) shows the server is consistent and where its CPU edge is; it does not show the system is safe to open to the public.
