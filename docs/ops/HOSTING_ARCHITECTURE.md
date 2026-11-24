# Future hosting model: HTTPS/WSS with GitHub Pages as the frontend

Design only. Nothing is provisioned. Principle: **the smallest thing that is safe for guests**: one VM, one container per vCPU, one reverse proxy. No Kubernetes, no microservices, no database.

```
 phone / desktop browser
   |  1. page      https://tundelaniyan.github.io/wahala-game/        (GitHub Pages, static; unchanged host)
   |  2. realtime  wss://play.<domain>/<pid>/<room>?sessionId=...     (WebSocket, TLS)
   |               https://play.<domain>/matchmake/...               (room create / join, HTTPS)
   v
 [ one VM, one region ]   firewall: 443 (+80 for cert issue), SSH from the operator only
   nginx edge (ops/edge)  TLS, per-address limits, /metrics hidden, optional allowlist
     -> rumble container(s)  one Node process per vCPU, plain ws on a private Docker network, hardened
   monitor (ops/monitoring)  polls /health + /metrics on the private network -> alert webhook
```

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Frontend | Stays static on GitHub Pages. The server never serves the game. | Free, already live, offline game unaffected. |
| Transport | Browser to `wss://` on 443. The Pages origin is `https`, so a plain `ws://` server is blocked as mixed content. | Browser rule, not a choice. |
| Server URL in the page | A **fixed** `WAHALA_ONLINE_URL=wss://play.<domain>`. The dev `{host}` template cannot be used (the page host is `github.io`). Public value, compiled in. | Template only works when page and server share a host. |
| Origin policy | `RUMBLE_ALLOWED_ORIGINS=https://tundelaniyan.github.io` (origin = scheme + host, **no path**). | Only that page's browsers can open sockets; scripts are not stopped by this (F4). |
| TLS | Let's Encrypt (`certbot`, HTTP-01) on a hostname we control; nginx terminates. Server stays plain `ws` on a private network. | Free, standard, auto-renewing. |
| Reverse proxy | **nginx**, because `limit_req`/`limit_conn` are built in and were validated. Caddy gives easier certificates but its rate limiting needs a third-party module. | Validated, no custom build. |
| Processes | One Node process (container) per vCPU; many rooms per process. | The tick loop is single-threaded (`CAPACITY.md`). |
| State | None. A restart ends matches; there is nothing to back up. | Guest play, no accounts, rewards deferred. |
| Region | One region, chosen after the phone latency test. Default candidate **London**. | `HOSTING_COSTS.md`. |
| Scaling later | More VMs behind separate hostnames/regions first; Redis presence/driver only when one machine is not enough. | Avoids building multi-node matchmaking early. |

## The frontend question (needs a founder decision)

The public Pages build is deliberately online-free (`tests/online/public-bundle.test.ts`, `check:static`) and `deploy.yml` is a single, gated publisher. An online-enabled page therefore needs its own delivery. Options, safest first:

1. **Private testing now:** LAN flow (`npm run dev:online`), which needs no hosting.
2. **Supervised remote test:** serve the online build (`npm run build:online` with `WAHALA_ONLINE_URL=wss://play.<domain>`) from the **same** VM and hostname as the server (same-origin, no CORS question). Needs a small nginx static block and a Vite `base` check; **designed, not built or validated here**.
3. **Public:** the online-enabled build is published through Pages by a change to the gated workflow (e.g. a repository variable that turns the flags on). That is Architecture's workflow and the founder's call; this pack does not touch it.

## Network and firewall

Inbound: 443/tcp (and 80/tcp for renewal/redirect); SSH 22 only from the operator's address (or none, using the provider console). The container port 2567 is **not published**. Outbound: only what Docker/certbot/provider need. Provider DDoS protection is the layer for volumetric attacks; nginx covers application-layer floods only.

## Optional: a CDN/proxy in front

A free CDN proxy (e.g. Cloudflare) can hide the origin address and absorb floods, and its free plan supports WebSockets and one rate-limiting rule (secondary sources; see HOSTING_COSTS.md). Unknowns: free-plan WebSocket volume tolerance for sustained game traffic, added latency from the Nigerian edge to the origin, and `set_real_ip_from` handling. Evaluate in the supervised test; do not assume.

## Temporary option for the first remote test with no domain

A quick tunnel gives a throwaway `https://*.trycloudflare.com` hostname (free; the server needs a second hostname or path; the address changes each run; exposes the laptop while it runs): only for a short supervised test, as already described in `CITY_RUMBLE_ONLINE_LOCAL.md` section 6. Wildcard-DNS names such as `<ip>.sslip.io` can obtain Let's Encrypt certificates but share a domain's issuance limits (unverified here: check before relying on it).
