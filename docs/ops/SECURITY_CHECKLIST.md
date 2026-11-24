# Security checklist: guest names, room flooding, DoS, reconnection

Status: **DONE** = implemented and verified here · **PARTIAL** = reduced, residual risk stated · **OPEN-ARCH** = needs a change in files Architecture owns (not made) · **OPEN-OPS** = ops task for the hosting step · **LATER**.

## 1. Guest-name abuse

| Control | Status | Evidence / note |
| --- | --- | --- |
| Length 2-24, allowed characters, control/zero-width/bidi/emoji/markup rejected; NFKC; mixed-script look-alikes; invisible code points | DONE | `server/test/identity.test.ts`; `smoke.mjs`: 5/5 abusive names refused over real sockets (also through the TLS edge) |
| Names cannot imitate bots (`BOT ...`, `Bоt` with a Cyrillic о) | DONE | same |
| Duplicate names in a room renamed (`Ada 2`) | DONE | collision handled by skeleton comparison |
| Spoof joins (claiming host, seat, team, bot flag) gain nothing | DONE | `identity.test.ts` |
| Offensive-word and reserved-name filter ("Admin", "WAHALA Team", slurs) | **OPEN-ARCH** | None exists. Names are the only player-written text (no chat), shown in lobbies and results. A small deny-list + a reserved list before public play. |
| Report / mute / ban | LATER | No accounts: bans can only be per-address at the edge (`allow.conf` / `deny`). A kick tool is not needed while there is no chat. |
| Name persistence | DONE | only the display name is kept in `localStorage`; no identity server-side |

## 2. Room-creation flooding

| Control | Status | Evidence / note |
| --- | --- | --- |
| Per-address limit on `/matchmake/create/` (6/min, burst 4) | DONE (edge) | 500 rapid creates → 5 allowed, 495 × 429; host recovers after ~10 s. **Unprotected without the edge: 2 000 rooms in 1.9 s (F2).** |
| Joins/quick play limited separately (60/min, burst 30) so a NAT'd group is not locked out | DONE (edge), not stressed | CGNAT caveat (F5): tune from real logs |
| Idle created-but-unused rooms expire | DONE (server) | rooms from a flood were disposed after ~15-20 s |
| Cap on live rooms per address / total, enforced in the server | **OPEN-ARCH** | multi-address attackers pass the edge |
| `room-creation-burst` alert | DONE | `rules.mjs`, unit-tested |

## 3. Denial of service

| Vector | Status | Control |
| --- | --- | --- |
| **Started bot-filled rooms exhaust the core (F3)** | **OPEN-ARCH (High)** | Needs a cap on concurrently playing rooms (`server_busy`) and a per-address live-room cap. Interim: IP allowlist (`allow.conf`), supervised sessions, container CPU limit, alerts `capacity` / `dropped-ticks` / `cpu`. This is the item that blocks public hosting. |
| Connection exhaustion | DONE (edge) | 64 concurrent sockets + 10 req/s per address (300 upgrades: 255 refused); `worker_connections` 4 096 |
| Message flood in a room | DONE (server) | > 600 msgs / 5 s or > 20 invalid / 10 s → kick (tested; stall bursts not punished) |
| Oversized frames | DONE (server) | 4 KB WebSocket cap, closed 1009 (checked) |
| Slow-client / slowloris | DONE (edge) | header/body timeouts 10 s, 4 KB body cap, send timeout 30 s |
| Metrics scraping | DONE | `/metrics` 404 at the edge + token (F1) |
| Volumetric (L3/L4) | OPEN-OPS | provider network protection; optional CDN proxy; cannot be tested here |
| Resource ceilings | DONE | container `cpus`, `mem_limit`, `pids_limit`, log rotation |
| Direct-to-origin bypass of the edge | OPEN-OPS | firewall must expose only 443/80; port 2567 is not published (compose) |

## 4. Unauthorised reconnection

| Control | Status | Evidence |
| --- | --- | --- |
| Single-use random token (~54 bits), rotated at every connection, never visible to other members | DONE | `identity.test.ts`; owner's token works once, the old one is dead |
| Forged, guessed, borrowed (room code, session id) tokens refused | DONE | `smoke.mjs` 5/5 refused, over TLS too |
| Window ends after 30 s; afterwards the seat belongs to a bot and the token is dead | DONE | `room.expiry.test.ts` (shortened window); `requirements.test.ts` asserts the 30 s argument. **The real 30 s wall-clock expiry was never waited out in a test.** |
| Token binding to an IP | NOT DONE, correct | phones change address mid-match; binding would break legitimate reconnects |
| Guess throttling | DONE (edge) | reconnect goes through `/matchmake/`: 60/min per address vs a 2^54 space |
| Token exposure in logs | DONE | nginx logs route class only; server log has room codes (F11), not tokens |

## 5. Transport, secrets, supply chain

| Control | Status |
| --- | --- |
| TLS 1.2/1.3 only, HSTS, `server_tokens off`, `nosniff` | DONE (edge, self-signed locally); real certificate OPEN-OPS |
| Origin allowlist (browsers) | DONE, with the limits in F4 |
| Secrets rules + tripwire (`check-secrets.sh`) | DONE; CI wiring and GitHub secret scanning/push protection OPEN-OPS |
| Container hardening (non-root, read-only, no caps, no-new-privileges) | DONE, verified |
| Image scanning / `npm audit` / pinned base digest | OPEN-OPS (not run here) |
| Personal data: IP addresses in nginx logs, guest names in memory | OPEN-OPS: short retention and a privacy notice before public play (Nigeria's data protection law is likely to apply to IP addresses; get proper advice; not assessed here) |
