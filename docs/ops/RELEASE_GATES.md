# Go / no-go for public backend hosting, and what is essential first

Guest play is approved for initial **private** testing. Ranked progression and persistent rewards are deferred. Locked requirements stay: City Rumble FFA and Team Rumble, 32 fighters, bot filling, 30 s reconnection.

## 1. Verdict today (2026-11-24)

| Question | Answer |
| --- | --- |
| Run on a laptop for same-Wi-Fi phones | **GO.** Validated: `docs/CITY_RUMBLE_ONLINE_LOCAL.md`, `VALIDATION_STATUS.md`. Real phones still to be run by the founder. |
| One small VM for a **supervised private remote test** (a few hours, known testers) | **CONDITIONAL GO** once the founder approves provider, region and a budget cap, and the "before the supervised test" items below are met. Cost: under $1 of compute plus a hostname; teardown after. |
| **Public** backend hosting (open to anyone, always on) | **NO-GO.** Blockers: B1 no cap on playing rooms (F3); B2 no real-phone / Nigerian-network evidence; B3 browser e2e for reconnection not green here (see VALIDATION_STATUS); B4 name deny-list; B5 monitoring/alert destination not chosen; B6 privacy basics. |

## 2. Gates

### Before the supervised private test (G1) - all required
1. Founder approves provider, region, budget cap and who holds the account. *(decision)*
2. Real hostname and certificate; `wss://` works from a phone browser (`smoke.mjs` from outside).
3. `NODE_ENV=production`, exact `RUMBLE_ALLOWED_ORIGINS`, `RUMBLE_METRICS_TOKEN` set, `RUMBLE_TEST_FAST` unset, verified by `smoke.mjs --metrics hidden`.
4. Edge in front (limits on, `/metrics` hidden), optional IP allowlist for testers on known Wi-Fi; port 2567 not reachable from outside.
5. Monitor running with a chosen alert channel and one external uptime check.
6. Phone latency page results collected from at least MTN, Airtel, Glo and one Wi-Fi in Lagos; region confirmed against them.
7. Two physical phones pass the 15-minute script in `CITY_RUMBLE_ONLINE_LOCAL.md` on the LAN first (founder acceptance gate).
8. Tester group small and named (the F3 risk is accepted because everyone is trusted); teardown owner and time set.

### Essential for the first **public** online release (G2)
| # | Item | Owner |
| --- | --- | --- |
| E1 | Server cap on concurrently playing rooms + per-address live-room cap (`server_busy`) | Arch |
| E2 | Real-phone sessions on ≥ 3 Nigerian carriers: input → visible latency, drops, reconnection within 30 s on app switch / Wi-Fi ↔ data; battery/thermal noted; decision on client-side prediction | Founder + Arch |
| E3 | Browser e2e for the online flow green on CI (two runs here failed at different steps; the reconnect banner never cleared in one) | Arch |
| E4 | Long soak (`npm run soak -- --duration 1800`) stable on the actual image | Arch/Ops |
| E5 | `/metrics` token mandatory in production (refuse to start without), `RUMBLE_TEST_FAST` ignored in production | Arch (small) |
| E6 | Name deny-list + reserved names | Arch |
| E7 | Monitoring with alerts to a person who will see them; documented restart/rollback; "restart ends matches" accepted and announced | Ops |
| E8 | Region and instance chosen from measured p95/jitter; sized to ≤ 70 % CPU at the expected rooms; Quick Play bot-room economics understood (CAPACITY) | Ops |
| E9 | Frontend delivery decided: how the online-enabled page reaches Pages without breaking the offline public build (HOSTING_ARCHITECTURE) | Founder + Arch |
| E10 | Certificates auto-renew; firewall verified; SSH hardened; image scan and `npm audit` clean or accepted; secrets rules in force | Ops |
| E11 | Privacy basics: log retention, IP handling, notice; advice on Nigerian data-protection duties | Founder |
| E12 | Rollback proven once (deploy previous image, players reconnect to the lobby) | Ops |

### Later (explicitly not needed for the first release)
Redis presence/driver and multi-process or multi-region matchmaking · autoscaling · Kubernetes · accounts, ranked play, persistence, rewards (deferred by the founder) · interest management, 20 Hz sends, key dictionary · a cheaper filler-bot level beyond E1's economics · spectators / late join · moderation tooling and reporting · a Lagos-local host · a CDN proxy · hosted error tracking and dashboards · CI image pipeline with signed images.

## 3. What would change the verdict
- **Public → conditional GO** when E1, E2, E3, E5, E6, E7 are done and E8-E12 are in place.
- A real-phone result worse than ~300 ms p95 input → visible on the main carriers moves **client prediction** (gameplay work) ahead of hosting.
- If `dropped-ticks` fires during a supervised test with ≤ 2 rooms, the machine or the bot cost is wrong: stop and re-size before inviting more people.
