# 04 — HTTPS / WSS deployment model (GitHub Pages stays the frontend)

Status: **design, with the proxy half validated locally.** The TLS, path allow-list, per-IP limits, masked logs and the 30 s
reconnect through the edge were run against a self-signed certificate (03). A real certificate, DNS and host are not done.

## Shape

```
 phone / desktop browser
   │ loads the game (static files)                       ┌──────────────────────────────┐
   ├────────────────────────────────────────────────────▶│ GitHub Pages  (unchanged)     │
   │ https://tundelaniyan.github.io/wahala-game/         │ Origin: https://tundelaniyan.github.io
   │                                                     └──────────────────────────────┘
   │ POST https://play.<domain>/matchmake/…   (TLS 1.2/1.3)
   │ wss://play.<domain>/<proc>/<room>?sessionId=…
   ▼
 ┌─ one small VM (dedicated vCPU, region chosen by measurement) ───────────────────────────────┐
 │  nginx :80 :443   TLS, path allow-list, per-IP limits, masked logs, no /metrics, no banner      │
 │      │ plain ws / http on a PRIVATE docker network (no internet route)                         │
 │      ▼                                                                                          │
 │  rumble container (the single-file bundle)  read-only, no caps, 1 core, 1 GB, healthcheck      │
 │  watch.mjs  (alerts)  ·  certbot (renewals)  ·  host firewall: 80/443 + SSH from your IP only    │
 └─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Why this and not more: the server holds no data, so there is no database, queue, or cache to run. One proxy and one process is
the smallest thing that gives TLS, limits and logs. Kubernetes, a service mesh, microservices and a managed database would add
cost and failure modes without removing any of the real risks (the risks are in 08: amplification and abuse).

## Why TLS is mandatory

The game page is `https://` (GitHub Pages). Browsers block a page served over HTTPS from opening `ws://` or calling `http://`
APIs (mixed content). So the server **must** be `https://` + `wss://`, with a certificate a browser trusts. A self-signed
certificate is not acceptable for players. Plain `ws://` works only for the LAN dev client (02).

## Domain and certificate

- A hostname you control is needed for a trusted certificate (about USD 10 / year for a domain; the hostname can be a subdomain
  such as `play.<domain>`). A provider's free hostname or a shared dynamic-DNS name may work but shares certificate-authority
  rate limits with strangers; I would not build on one.
- Certificates: Let's Encrypt, free, via `certbot` (webroot) while nginx serves
  `/.well-known/acme-challenge/` (the template already routes it). NOT VALIDATED here (needs a real domain):
  ```bash
  certbot certonly --webroot -w /var/www/acme -d play.<domain> --agree-tos -m <ops-email> --no-eff-email
  # then: TLS_CERT_DIR=/etc/letsencrypt/live/play.<domain>   PUBLIC_HOST=play.<domain>
  # renewals: certbot renew --deploy-hook "docker compose exec proxy nginx -s reload"   (certbot's timer runs twice a day)
  ```
- Add a **CAA** DNS record limiting issuance to Let's Encrypt, and set a calendar alert for certificate expiry (the watcher can
  probe the public health URL: an expired certificate fails it).
- HSTS is on (`max-age` one year, no `includeSubDomains`, no preload) so a mistake stays recoverable.

## Origin, CORS and what the game page needs

- `RUMBLE_ALLOWED_ORIGINS=https://tundelaniyan.github.io` (an *origin* has no path; `/wahala-game/` is not part of it).
  If Pages later moves to a custom domain, the origin changes: update this list **before** the DNS switch, or players get 403.
  Never list `*` and never leave `NODE_ENV` unset (that re-enables `localhost` origins).
- Origin is a browser-side control only: a script that sends no `Origin` header is allowed by design. It stops other *websites*
  from using your server from their visitors' browsers; it does not stop a determined abuser. Limits and server-side caps do (08).
- **Pages cannot set response headers**, so a CSP can only be a `<meta http-equiv>` tag; if one is used, `connect-src` must
  include `https://play.<domain> wss://play.<domain>`.

## Frontend integration contract (for Architecture: I changed none of this)

1. The project already has the build-time switch: `WAHALA_ONLINE_ENABLED=true` + `WAHALA_ONLINE_URL=https://play.<domain>`
   (public values, never secrets). The socket URL must be **derived from that one value** (`https` → `wss`), never from a query
   string. The dev client's `?server=ws://…` parameter must not exist in the shipped client: a link
   `…/?server=wss://attacker` would make a player connect to a hostile server (F11 in 01).
2. **Pipeline decision needed (not mine, not changed):** `docs/ONLINE_ARCHITECTURE.md` says a build with online enabled "is a
   different product" that `scripts/check-static-build.mjs` rejects on purpose and that must not go through the static Pages
   workflow. Keeping GitHub Pages as the frontend therefore requires Architecture + founder to decide how the online build is
   produced and published (one publisher, `docs/CI.md`) and to teach the guard to allow exactly one configured host. I did not
   touch `.github/`, `deploy.yml` or `check-static-build.mjs`.
3. Two online designs exist in the repo: the older scaffold in `src/online/server` (REST `/v1/*` + `/v1/stream`, mock-only) and
   the Colyseus server in `server/` (`/matchmake/*` + WebSocket). The proxy here serves the Colyseus one. Which client adapter
   ships must be settled so that the contract above points at the right paths.
4. Browsers: the client already sets `credentials: 'omit'` for matchmaking (the server's CORS answer has no credentials).

## Optional edge in front: Cloudflare (evaluate, do not assume)

A CDN proxy hides the origin IP, absorbs volumetric attacks (what no VM can) and has a Lagos presence (EVIDENCE: a 2018 post;
check current coverage). Trade-offs: WebSockets are supported but idle connections are cut at about 100 s on proxied traffic
(EVIDENCE: community / third-party; our sockets ping every 3 s, so fine); per-IP limits then see Cloudflare's addresses unless
`CF-Connecting-IP` is trusted (needs the real-IP module, not in this template); a second hop might add or remove latency for
Nigerian phones: **measure it** with the phone test (05), do not guess. Decision: not in the first private test; evaluate before
public launch because it is the only practical DDoS answer at this budget.

## Scaling (NOT VALIDATED: needs server wiring by Architecture)

One process serves ~3 bot-heavy or ~6 all-human rooms (06). Beyond that you need several processes (one per vCPU), and the
current server cannot share rooms or matchmaking between them. Colyseus' supported path is a Redis presence + driver
(`@colyseus/redis-presence`, `@colyseus/redis-driver`) with a process-aware proxy (the socket path carries the process id so the
front proxy can route it; with nginx that needs a stable process-id → port map). Not configured in `server/src`, not exercised
here. Plan: first private tests on **one process**; do the Redis rehearsal as its own task before a public launch.

## Network and host hardening for the VM (checklist; NOT VALIDATED: needs a real host)

- Provider firewall: inbound 80 and 443 from anywhere; SSH from your own IP(s) only; nothing else. Host firewall the same.
- SSH keys only, root login off, `unattended-upgrades` for security updates; a non-root deploy user in the `docker` group
  (membership is root-equivalent: keep that user to the operator only).
- Do not publish port 2567: only the proxy reaches the server (compose network). Do not publish Docker's API.
- A billing alert / hard budget at the provider **before** anything else is created. A provider account is a credential: 2FA on.
