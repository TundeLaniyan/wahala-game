# 02 — Local laptop deployment for same-Wi-Fi phone testing

**Cost: none. Exposure: your own network only. Validated: yes (see "What was verified"). Real phones: still to do.**

## One command

```bash
# once, from the repo root
npm ci
cd server && npm install && cd ..

# every time
node ops/local/lan.mjs
```

(or `node ops/local/lan.mjs --install` to let it run the two installs.) It:

1. checks Node ≥ 22 and that dependencies exist;
2. builds `server/dist/rumble-server.mjs` (`npm run bundle`): **the same single file the Docker image runs**;
3. finds your Wi-Fi address (private ranges only, skipping Docker / VPN adapters; `--ip` overrides);
4. starts the bundle with plain `node` and `NODE_ENV=production`, so the origin policy is *only* your LAN page, not the
   development wildcard, and a random per-run `RUMBLE_METRICS_TOKEN`;
5. starts the dev client (`server/client`, Vite) bound to all interfaces on :5180;
6. prints the phone URL, the metrics command and a probe command.

Open the printed `http://192.168.x.x:5180/` on each phone (**on the same Wi-Fi, mobile data off**). Create a private room on
one, join by code on the others. The page picks the server from its own address (`ws://<same-ip>:2567`).

## Prerequisites on the laptop

- **Firewall.** macOS asks "allow incoming connections for node?": Allow. On Windows allow Node on *Private* networks. Linux
  `ufw allow from 192.168.0.0/16 to any port 2567,5180 proto tcp`.
- **Router.** Some guest / café / office Wi-Fi isolates clients from each other ("AP isolation" / "client isolation"): phones
  cannot reach the laptop. Use a home router or the laptop's own hotspot (then the laptop's hotspot address is the LAN address).
- **Sleep.** Keep the laptop awake and plugged in; the server is a 60 Hz loop and 32-fighter matches use ~25 % of a core.
- **HTTP, not HTTPS.** This is deliberate and fine on a private network. Browsers treat `http://<ip>` as an insecure context:
  the game works there (VALIDATED), but features that need HTTPS (clipboard API on some browsers, fullscreen lock on some,
  service workers, installing as an app) may be unavailable. That is also what you will hit if you test the real
  HTTPS GitHub Pages game against a plain `ws://` server: browsers **block** that (mixed content). The LAN test is for the
  dev client; the Pages game needs the TLS setup in 04.

## Checks

```bash
# the whole thing starts, passes the probe over your LAN address, and stops (exit code = result)
node ops/local/lan.mjs --selftest

# a real Chromium, phone profile, insecure http://<ip> context, creates a room through the origin check
WAHALA_CHROMIUM=/path/to/chromium node ops/local/browser-check.mjs --page http://192.168.1.23:5180/

# the security probe against the running server (the launcher prints this line with your token)
node ops/probes/probe.mjs --http http://192.168.1.23:2567 --origin http://192.168.1.23:5180 --metrics-token <token>
```

## What was verified here, and how

Sandbox address 192.0.2.2 stands in for a Wi-Fi address (the launcher correctly refuses it unless `--ip` is given, because it is
not a private range).

- VALIDATED `lan.mjs --selftest --ip 192.0.2.2`: bundle served on the non-loopback address, probe groups health / metrics /
  origin / names / abuse: 43 pass, 0 fail, 6 known gaps (names), client page served.
- VALIDATED `browser-check.mjs`: real Chromium, Pixel 7 profile, `window.isSecureContext === false`, created a private room;
  lobby rendered (host badge, "1 of 32 fighters are people", settings). 7 s, no console errors.
- Observed and **not** an issue with our server: in this sandbox Chromium sent `ws://` upgrades through the sandbox's HTTP
  proxy and got 403s; `--no-proxy-server` (in `browser-check.mjs`) fixes it. Phones on Wi-Fi do not use that proxy. If a real
  phone ever gets 403 on the socket, suspect an Origin mismatch first (the page's origin must be in `RUMBLE_ALLOWED_ORIGINS`).
- UI note for Architecture (cosmetic): in portrait the Mode and Bot level selects overflow the right edge of the room card.
  The match itself needs landscape.

## What it cannot tell you

Phone GPU speed (the renderer ran on software WebGL here at 1–2 fps), touch feel, battery and heat, iOS background behaviour,
mobile-network latency or loss (Wi-Fi to a laptop is ~2–10 ms), and anything about a real host. Those need real phones
(05 has the plan) and an approved host.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Phone cannot open the page | firewall; AP isolation; phone on mobile data; wrong adapter (`--ip`) |
| Page opens, "Could not connect to the server" | port 2567 blocked; or the page origin is not in the allowed list (use the printed URL exactly; another hostname or port is a different origin) |
| Works on laptop, not on phone | you opened `localhost` on the phone (that is the phone itself) |
| Two adapters, wrong address picked | `--ip 192.168.x.x` |
| `EADDRINUSE` | another run is still up: `--port`, `--client-port`, or stop it |
