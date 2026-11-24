# Local laptop deployment for same-Wi-Fi phone testing

The authoritative guide already exists and is correct: **`docs/CITY_RUMBLE_ONLINE_LOCAL.md`** (`npm run dev:online`, firewall, phone steps, 15-minute two-phone script, troubleshooting). This page records what was **validated** on 2026-11-24 and what the container option adds. Nothing here is hosted or paid.

## Path A: `npm run dev:online` (recommended for phones)

Starts the game (Vite, `0.0.0.0:5173`) and the server (`0.0.0.0:2567`) together and prints phone URLs.

Validated in this container (a Linux VM with a real non-loopback address, standing in for a laptop):

| Check | Result |
| --- | --- |
| Starts cleanly, prints `READY` with the phone URLs | pass |
| Game page via the LAN address (`http://<lan-ip>:5173/`) | HTTP 200 |
| Server `/health` via the LAN address | `{"ok":true}` |
| Page origin on the LAN address accepted, an unlisted subnet origin refused | 200-open / **403** |
| `smoke.mjs` over the LAN address (create room, second guest joins by code, 5/5 abusive names refused, 5/5 forged tokens refused) | all pass |

**Gotcha found:** the script lists every interface address. On a laptop running Docker, VPN or virtual switches it also lists bridge addresses (here `172.18.0.1`, `172.19.0.1`). Phones need the address in **their own** subnet (the Wi-Fi one, e.g. `192.168.x.y`). The doc already says so; the point is that the list is longer than expected.

Not validated here: a phone on a real Wi-Fi, firewall prompts on Windows/macOS, iOS/Android browser behaviour, battery, thermal state. Those are the founder's acceptance gate (two physical phones).

## Path B: backend in a container (laptop stays the web host)

Use when the laptop should run the *production-shaped* server (non-root, read-only, resource limits) while the page still comes from `npm run dev` / a static build.

```bash
cp ops/env/server.env.example ops/env/server.local.env
# edit: set RUMBLE_ALLOWED_ORIGINS to the page origin(s), e.g. http://192.168.1.23:5173
sed -i "s/^RUMBLE_METRICS_TOKEN=.*/RUMBLE_METRICS_TOKEN=$(openssl rand -hex 32)/" ops/env/server.local.env
docker compose -f ops/compose/compose.local.yml --env-file ops/env/server.local.env up --build
# phone check:  http://<laptop-lan-ip>:2567/health  ->  {"ok":true}
```

In production mode the server allows **only** the listed origins (no implicit localhost or LAN range), so a wrong `RUMBLE_ALLOWED_ORIGINS` shows up as HTTP 403 in the phone's network tab. `/metrics` here is protected by the token (open if you leave it empty: F1).

## Path C: the full edge on the laptop (rehearsal of the hosting shape)

```bash
ops/scripts/gen-dev-cert.sh 192.168.1.23          # self-signed, 14 days, git-ignored
docker compose -f ops/compose/compose.edge.yml --env-file ops/env/server.local.env up --build
NODE_EXTRA_CA_CERTS=ops/edge/certs/fullchain.pem node ops/scripts/smoke.mjs --url https://localhost:8443 --metrics hidden
```

Phones will **not** trust the self-signed certificate, so this path rehearses the shape (TLS, `wss://`, limits) rather than serving phones. For a phone over HTTPS use `mkcert` with the root installed on the phone, or a temporary tunnel: see section 6 of `CITY_RUMBLE_ONLINE_LOCAL.md` (both need the founder's go-ahead).

## One command to re-prove all of it

```bash
ops/scripts/validate-local.sh      # needs Docker + Node 22; behind a TLS-inspecting proxy set EXTRA_CA_DIR, BUILD_NETWORK=host
```

Last run: **all checks passed** (see VALIDATION_STATUS.md for the list).
