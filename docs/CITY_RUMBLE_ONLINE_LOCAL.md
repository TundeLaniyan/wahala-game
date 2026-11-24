# City Rumble online on your own laptop and phones (no cloud, no cost)

Decision ON9 (`docs/DECISIONS.md`, plan in `docs/ONLINE_INTEGRATION.md` section 7). Everything runs on one laptop; phones on the same Wi-Fi connect to it. Nothing is hosted, provisioned or paid for, and nothing leaves your network. The public GitHub Pages game is untouched and stays fully offline.

## 1. Run it

Prerequisites: Node 22, `npm install` in the repository root and once in `server/`.

```
npm run dev:online
```

That is the whole setup. It starts, with prefixed logs (`[server]`, `[web]`, `[dev]`):

| Part | Command it runs | Listens on |
| --- | --- | --- |
| City Rumble server | `server`: `npm start` | `0.0.0.0:2567` (WebSocket + `GET /health`, `GET /metrics`) |
| The game (Vite dev server) | `npm run dev -- --host 0.0.0.0 --port 5173 --strictPort` | `0.0.0.0:5173` |

The game is started with `WAHALA_ONLINE_ENABLED=true` and `WAHALA_ONLINE_URL=ws://{host}:2567`. `{host}` is a template: the page replaces it with the hostname it was opened from, so the same page works from `localhost` and from `192.168.1.23` and no address is written into code. A normal build (without both variables) contains no online code at all.

When both are up it prints the addresses:

```
[dev] READY. Open on a phone (same Wi-Fi) or this laptop:
[dev]   this laptop                http://localhost:5173/?online
[dev]   phones on the same Wi-Fi   http://192.168.1.23:5173/?online
[dev] Server check from a phone: http://192.168.1.23:2567/health   (shows {"ok":true})
```

`?online` shows the Online City Rumble entry on Home (without it the page looks like the public game). The Vite dev server serves the game at `/` (only `build` / `preview` use `/wahala-game/`), so the dev URL has no `/wahala-game/`. Stop everything with Ctrl-C (both processes and anything below them are stopped).

Options: `npm run dev:online -- --web-port 5174 --server-port 2568` (env `DEV_ONLINE_WEB_PORT`, `DEV_ONLINE_SERVER_PORT`), `--no-lan` (this machine only, nothing listens on the network), `--help`.

Only the server, without the game page: `cd server && npm start` (prints the same LAN URLs).

### Server settings

Set them in the shell before the command (they pass through to the server):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 2567 | Server port (`--server-port` sets it for you) |
| `RUMBLE_ALLOWED_ORIGINS` | computed by `dev:online` | Exact browser origins the server accepts, comma separated. `dev:online` fills in `http://localhost:5173`, `http://127.0.0.1:5173`, `http://<each-lan-ip>:5173`, `http://<machine-name>:5173`, `http://<machine-name>.local:5173`, plus anything you set yourself. Development mode also allows `http://localhost:*` and `http://127.0.0.1:*`. In production mode ONLY the explicit list is allowed (nothing by default, never implicit localhost or a LAN range) |
| `RUMBLE_GRACE_SECONDS` | 5 | A dropped player's fighter stands this long, then a bot plays it (0..60) |
| `RUMBLE_RECONNECT_SECONDS` | 30 | The player can take back the same fighter within this window |
| `RUMBLE_PING_INTERVAL_MS` | 3000 | How often the server pings each socket (500..30000); with `RUMBLE_PING_MAX_RETRIES` it decides how long a stalled page (first-frame compile, a busy CPU) is tolerated before the socket counts as dropped |
| `RUMBLE_PING_MAX_RETRIES` | 4 | Missed pongs before the socket is closed (1..20) |
| `RUMBLE_DROP_POLICY` | `bot` | `bot` or `idle` (see `docs/CITY_RUMBLE_ONLINE.md` section 8) |
| `RUMBLE_METRICS_TOKEN` | none | Bearer token required by `GET /metrics` |
| `NODE_ENV` | `development` (set by `dev:online`) | `production` turns the localhost development origins off |

macOS / Linux: `RUMBLE_GRACE_SECONDS=2 npm run dev:online`. Windows PowerShell: `$env:RUMBLE_GRACE_SECONDS=2; npm run dev:online`.

## 2. Connect a phone

1. Put the phone on the SAME Wi-Fi as the laptop (not mobile data, not a guest network).
2. On the phone's browser open the `phones on the same Wi-Fi` address printed above, for example `http://192.168.1.23:5173/?online`. Use the numeric address: names like `my-laptop.local` do not resolve on every phone.
3. First check the server alone: open `http://192.168.1.23:2567/health` on the phone. `{"ok":true}` means the network path and the firewall are fine.
4. Tap the Online City Rumble entry, create a room (private) and share the code, or join with the code from another phone / the laptop.

If the laptop has several addresses (Wi-Fi, Ethernet, VPN, Docker), the script lists all of them: use the one that starts like the phone's own address (a phone on `192.168.1.x` needs the laptop's `192.168.1.y`).

To see the disconnect policy: during a match turn the phone's Wi-Fi off for a few seconds (its fighter stands for the grace period, then a bot plays it), and turn it back on within the window (you take the same fighter back).

### Two phones on one Wi-Fi: a 15-minute test script (no purchase, nothing hosted)

Needs: the laptop and both phones on the same home Wi-Fi (or the laptop's hotspot), Node 22, nothing else.

1. **Laptop, once:** `npm install` in the repository root and in `server/`. Then `npm run dev:online` and leave it running. Note the `phones on the same Wi-Fi` address it prints. Nothing is built for production and the public game is not touched: the online switch exists only inside this dev process.
2. **Both phones:** open the printed `http://<laptop-lan-ip>:5173/?online` (landscape). First open `http://<laptop-lan-ip>:2567/health` once to see `{"ok":true}`.
3. **Phone A (host):** Home, **PLAY ONLINE**. Enter a guest nickname (1-24 characters; it is cleaned by the server, a duplicate in the room becomes "Name 2"; there are no accounts). Pick a fighter first on the Fighter screen if you want one. **Create a private room.** Note the six-character code (or use Copy link).
4. **Phone B (guest):** Home, **PLAY ONLINE**, a different nickname, type the code (or open the copied link), **Join**. Both phones list the two people as HUMAN and "30 bots will fill the remaining seats" as BOT.
5. **Host settings:** Free-for-All or Team Rumble (Team also offers Friendly fire Off / On), the stage and the bot level. Both phones tick **READY**; the host taps **START**. The match counts down 3 s and starts for both.
6. **Play:** touch controls are the offline ones (move pad, A generator, B special). Place generators, fight, watch the chip in the corner (ONLINE with the round-trip ms). Your own movement answers at once (it is predicted); if the server disagrees the fighter is corrected by a small slide.
7. **Drop test:** on phone B turn Wi-Fi off for about 10 seconds during the match. B shows "Connection lost ... a bot is playing your fighter" (the banner), the fighter stands for the 5 s grace and then a bot plays it (the match never pauses); turn Wi-Fi on within 30 s and B gets the SAME fighter back, no extra life.
8. **Results:** at the end both phones show the same table; humans carry HUMAN, bots BOT, and a fighter a bot played for a while shows "A bot played N s for this player" (bot kills are not credited to the absent person).
9. **Public matchmaking:** from a third device (or after leaving) choose **QUICK PLAY**: it waits up to 30 seconds for other people ("Starts by itself in N s"), then bots marked BOT fill the seats. QUICK PLAY always opens a Free-for-All room.
10. **Stop:** Ctrl-C in the laptop terminal (graceful shutdown: connected phones are told the connection closed and the server exits). Back on the phone, the normal game (offline City Rumble, Classic Blast, the campaign) works exactly as before: reload without `?online`.

What counts as evidence: steps 2-10 on two physical phones is a **real-device test** and is the founder's acceptance gate. The development container runs the same flow only with software-rendered desktop Chromium (an emulated 832 x 384 touch phone: `npm run test:online-e2e`), which proves the code path and the layout, not phone performance, radio behaviour or battery.

## 3. Firewall

The laptop must accept incoming connections on TCP 5173 (the game) and 2567 (the server).

- Windows (Defender Firewall): the first run asks to allow `Node.js JavaScript Runtime`. Tick **Private networks** and Allow. If you pressed Cancel, open Windows Security, Firewall & network protection, Allow an app through firewall, and tick Private for Node.js. If the Wi-Fi is classed as "Public network", change it to Private (Settings, Network, the Wi-Fi's properties) or the allow rule will not apply.
- macOS: a dialog asks "Do you want the application `node` to accept incoming network connections?" Choose Allow. If it never appeared, System Settings, Network, Firewall, Options, and allow `node`.
- Linux: `sudo ufw allow 5173/tcp` and `sudo ufw allow 2567/tcp` (or the equivalent for your firewall) while testing; remove the rules afterwards.

## 4. Browser limits to know

- **HTTP page to WS server, on purpose.** The dev page is `http://` and the server is `ws://`, which browsers allow. An HTTPS page (GitHub Pages, any `https://` host) cannot open an insecure `ws://` server: it is blocked as mixed content (some browsers, such as Chrome and Firefox, make an exception for `ws://localhost`; a LAN IP is never one). So you cannot point the public Pages build at your laptop, and you should not try: the public build contains no online code anyway.
- **Secure context.** `localhost` counts as a secure context, a LAN IP over plain `http://` does not. On a phone opened through `http://192.168.x.y` these differ from the public site: service workers cannot register, the async clipboard (copy room code buttons may need a manual copy), the Screen Wake Lock (the phone may dim and lock during a long match: keep touching or raise the auto-lock time), `crypto.subtle` and some permission prompts are unavailable. The game itself plays.
- **Service worker.** Production builds register an offline cache worker (`sw.js`); the Vite dev server never does. For LAN testing always use the dev server (this script). If a phone once opened a production build from the same address, open `/?nosw` once to clear its worker and cache.
- **iOS Safari.** A backgrounded tab or a locked screen suspends the page and closes its WebSocket after a short while: that is a normal "drop" (grace, bot, rejoin within the window). Fullscreen is limited on iPhone (use Add to Home Screen for a bar-less page, which is again a plain http page here). Safari may show "This website is not secure" for `http://`; that is expected for this setup. The first load can be slow while the dev server compiles modules on demand.
- **Android Chrome.** Works the same; the "Not secure" label is expected. Data Saver / "Lite mode" can interfere: turn it off.
- **Wi-Fi isolation.** Guest networks, hotel / cafe / campus Wi-Fi and some routers ("AP isolation", "client isolation") block phone-to-laptop traffic. Use a home router, or the laptop's own hotspot with the phone joined to it.

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Phone: page does not load at all | Not on the same Wi-Fi, or the firewall blocks 5173, or client isolation | Same network; allow Node in the firewall (section 3); try another network or the laptop's hotspot |
| Page loads, no Online entry on Home | The URL lacks `?online`, or you opened a build made without the online switch | Use the printed URL ending `/?online`; always start with `npm run dev:online` |
| Online entry opens, "cannot reach the server" | Server blocked (port 2567), server not running, or the page was opened by an address the server does not list | Open `http://<lan-ip>:2567/health` on the phone; look at the `[server]` log; the log line "origins:" lists what is accepted |
| `/health` works on the laptop, not on the phone | Firewall on 2567, or wrong address (VPN / Docker address) | Allow 2567; use the address in the phone's subnet |
| Browser console: "mixed content" / "insecure WebSocket" | The page is `https://` | Open the `http://` dev URL instead |
| Connect fails with HTTP 403 (browser network tab; the server does not log refusals) | The page's origin is not in `RUMBLE_ALLOWED_ORIGINS` (a second laptop address, a different port, `https`) | Restart `dev:online` (it re-reads the addresses), or add the origin: `RUMBLE_ALLOWED_ORIGINS=http://192.168.1.50:5173 npm run dev:online` |
| Laptop changed Wi-Fi, address changed | The old origin is gone | Stop and run `npm run dev:online` again; use the newly printed address |
| `Port 5173 is already in use` | Another dev server runs | Close it, or `npm run dev:online -- --web-port 5174` |
| Phone connects, then drops every few seconds | Weak Wi-Fi, power saving, or the tab went to the background | Stay on the page, screen on; a drop is recoverable (section 2) |
| The fighter freezes for a few seconds then moves by itself | That is the grace period then the replacement bot | Expected; reconnect to take the same fighter back |
| `EADDRINUSE :2567` | Another server instance | Stop it, or `--server-port 2568` |
| Page looks stale after a code change on a phone | An old service worker from a production build | Open `/?nosw` once |

## 6. FUTURE, NOT SET UP: a secure temporary option (no cost, nothing is running)

Not provisioned and not required for the above. Written down for when a phone test must run over HTTPS (for example to try the service worker, wake lock or the clipboard in a secure context). Each needs the founder's go-ahead because it changes the setup; none costs money.

- **mkcert (local TLS certificate).** `mkcert -install`, then `mkcert localhost 192.168.1.23` makes a certificate trusted by this laptop only; each phone must also install and trust mkcert's root certificate (iOS: install the profile, then Settings, General, About, Certificate Trust Settings). The Vite dev server then serves `https://`, and the multiplayer server must speak `wss://` too (it speaks plain `ws://` today; a small TLS reverse proxy such as Caddy in front of port 2567 would do it), with `WAHALA_ONLINE_URL=wss://{host}:<port>`. Requires config changes (Vite `server.https`, a proxy): not done.
- **A free tunnel (for example a Cloudflare quick tunnel).** `cloudflared tunnel --url http://localhost:5173` prints a temporary `https://<random>.trycloudflare.com` URL that reaches the laptop from anywhere; a second tunnel (or a proxy path) is needed for the server, and the endpoint becomes `wss://<tunnel-host>`, which the current `{host}` template (same hostname, a port) does not express. The tunnel host must be added to `RUMBLE_ALLOWED_ORIGINS`. It exposes the laptop's dev server to the internet while it runs and the address changes every time: fine for a short supervised test, never for a shared build.

Neither option changes the public build, adds a dependency or a publishing path.
