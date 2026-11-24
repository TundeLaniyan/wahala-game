# ops — operations tooling for the City Rumble server

Everything here is **additive and optional**: it does not change the game, the server, CI or the Pages workflow, and it needs no
cloud account. Documentation: [`docs/ops/00-README-AND-GO-NO-GO.md`](../docs/ops/00-README-AND-GO-NO-GO.md).

| Path | What | Doc |
| --- | --- | --- |
| `local/lan.mjs` | one-command same-Wi-Fi setup (bundle + client + origins + token); `--selftest` | 02 |
| `local/browser-check.mjs` | real Chromium, phone profile, creates a room from the LAN page | 02 |
| `probes/probe.mjs` | black-box security / ops probe (health, metrics auth, origin, names, abuse, room flood, reconnect window, bot storm) | 08 |
| `probes/latency/index.html` | single-file phone latency / jitter / loss page, no hosting needed | 05 |
| `proxy/nginx.conf.template`, `proxy/make-selfsigned.sh` | TLS edge: path allow-list, per-IP limits, masked logs | 04 |
| `docker/Dockerfile`, `docker/compose.yml` | hardened image + server-and-proxy stack | 03 |
| `env/` | configuration templates (placeholders only) and the throwaway local-rehearsal env | 08 |
| `monitoring/watch.mjs`, `monitoring/error-reporter.mjs` | threshold alerts + webhook; crash reporter | 07 |
| `deploy/wait-idle.mjs` | wait until no match is running before a restart | 03 |

```bash
node ops/local/lan.mjs                                   # phones on your Wi-Fi
node ops/probes/probe.mjs --http http://127.0.0.1:2567 --metrics-token T --only health,metrics,origin,names,abuse,roomflood
node ops/probes/probe.mjs --http … --only reconnect      # ~40 s: the real 30-second window
node ops/probes/probe.mjs --http … --only botstorm --storm 3   # LOADS the target; own server only
```

Probe exit codes: 1 on any FAIL; known, documented weaknesses print as `GAP` and fail only with `--strict`.
Run the probes only against a server you own.
