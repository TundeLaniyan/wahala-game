# 09 — What is essential for the first public online release, and what can wait

Definitions. **Stage P**: private, same Wi-Fi, laptop (today). **Stage Q**: private internet test: invite-only, ≤ ~20 known testers, one
small VM. **Stage R**: first public online release (guest play, City Rumble FFA and Team Rumble, 32 fighters, bot filling, 30 s
reconnect). **Later**: scalability and progression. Ranked play and persistent rewards are deferred by decision and are not in R.

## Go / no-go

| Stage | Verdict | Conditions |
| --- | --- | --- |
| **P** same-Wi-Fi laptop test | **GO now** | `node ops/local/lan.mjs`; phones on the same Wi-Fi |
| **Q** private internet test | **GO after founder approval** of one VM (~$40–45 / month), a domain (~$10 / year) and a billing alert | the Q checklist in 08 §7; phone latency test done first (05); `probe.mjs` green on the real host; alert path tested; testers briefed that a restart ends matches |
| **R** public release | **NO-GO** | every R-must below is done; none is a matter of tuning |

### Stage R: must-haves (each is a blocker if missing)

| # | Requirement | Why it is essential | State |
| --- | --- | --- | --- |
| R1 | Server admission control: global / per-IP room and running-match caps, ignored client `autoStartSec`, bot-match CPU budget (SRV-1..3) | one client can currently saturate a process (MEASURED) | OPEN (Architecture) |
| R2 | Name policy (SRV-4), plus a report / mute / ban path | public rooms; young audience | OPEN |
| R3 | Real-phone validation: complete 32-fighter matches on ≥ 3 Nigerian networks and ≥ 2 device classes, incl. app-switch and reconnect (30 s) on Android and iOS; frame rate / heat; touch controls | nothing about phones is proven | WAITS for phones |
| R4 | Region chosen by measurement (05) and a latency-feel decision (client-side prediction or not) | input → visible ≈ RTT + 70–110 ms | WAITS for phones |
| R5 | HTTPS / WSS on a trusted certificate, proxy limits, masked logs, hardened container, host firewall | browsers block anything else; abuse | DESIGN + local validation done; needs a host |
| R6 | Capacity for the expected audience: multi-process wiring if bot-heavy rooms are expected beyond ~3 at once (06) | a single process caps out at ~12 humans in bot-heavy rooms | OPEN (Architecture) |
| R7 | Monitoring and an alert someone reads (07): uptime monitor, watcher, error reporter, certificate expiry | silent failure is the usual outage | built; needs a real channel + host |
| R8 | Deploy, drain and rollback routine rehearsed (03); image vulnerability scan; base image pinned | updates must not strand players or ship CVEs | built; scan not done |
| R9 | Frontend integration: shipped client takes the server URL from build config only; the Pages build / `check:static` decision (04) | links must not redirect players to hostile servers; one publisher | OPEN (Architecture + founder) |
| R10 | Privacy notice and log retention; cost guardrails (budget alert, 2FA) | personal data (IPs, names); runaway bills | OPEN (founder) |
| R11 | A 24-hour soak with a mix of real and bot players and the watcher on, no leaks (RSS flat), no stuck rooms | the model above is minutes-long | NOT DONE |

### Should-have (R if time allows, otherwise the first fast-follow)

Per-/64 IPv6 limiting; CDN / DDoS edge (evaluate Cloudflare, 04); generic reconnect error (SRV-6); metrics additions (SRV-5);
client-side error reporting; a status page; `sessionStorage` reconnect token (SRV-8) if iOS tests show reload loss; interest
management and 20 Hz send rate if phone data costs matter; replay of effects missed during a reconnect.

### Later (explicitly not now)

Accounts and sign-in; ranked progression and persistent rewards; a database; matchmaking by skill; spectators and late join;
multi-region deployment; Kubernetes or an orchestrator; autoscaling; a metrics database with dashboards; anti-cheat beyond server
authority; chat and its moderation; leaderboards; cross-play beyond browsers.

## Order of work (smallest steps that retire the most risk)

1. **Now, free:** phone test on Wi-Fi with `lan.mjs` (P). Run the latency page on mobile data for the region decision (05).
2. **Founder decisions** (00): approve Q hosting, name policy for public rooms, reconnect-token storage, who changes the Pages
   pipeline.
3. **Architecture:** R1 (SRV-1..3) and R2 (SRV-4) first: they gate everything public and are small; then R6 wiring.
4. **Stage Q:** one VM, compose stack, probe, watcher; ≤ 20 testers on real phones; collect R3 / R4 data; one week.
5. **Fix what Q finds**, rehearse the deploy / rollback, scan the image, 24 h soak (R11), then re-run the probe with `--strict`
   (no GAPs) and re-decide R.

## What this work does **not** claim

- It does not claim production readiness. Everything validated used simulated clients, a sandbox CPU, one container, a self-signed
  certificate and an emulated or local network. A simulated client load is not a launch rehearsal; only real phones on real
  networks on the real host are.
- It does not claim any region is best (05: wired, snippet-only evidence).
- It does not claim DDoS resistance, multi-process scaling or image CVE-freedom: all three are untested.
