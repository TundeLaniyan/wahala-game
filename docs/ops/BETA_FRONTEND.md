# The private-beta client: how it is built, where it lives, who can reach it

Decision FC-1. The public GitHub Pages game stays exactly what it is: offline, no backend, no online code in its bundle (guarded by `tests/online/build-guard.test.ts`, `tests/platform-static.test.ts` and `scripts/check-static-build.mjs`). Typing `?online` on it does nothing. The private beta uses a **different build of the same game**, hosted somewhere else, switched on at build time.

## 1. What the beta build is

`npm run build:beta` (script `scripts/build-beta.mjs`) builds `dist-beta/` with:

| Build setting | Value | Effect |
| --- | --- | --- |
| `WAHALA_ONLINE_ENABLED` | `true` | the online chunk (Colyseus client) is compiled in |
| `WAHALA_ONLINE_URL` | `wss://<beta domain>` | the match server, through the HTTPS/WSS edge |
| `WAHALA_PLATFORM_URL` | `https://<beta domain>` | the player platform API, through the same edge |
| `WAHALA_PRIVATE_BETA` | `1` | PLAY ONLINE is offered without `?online`; the player screen asks for the **invite code**; quick play, "create room" and "join with code" are hidden (the beta match server refuses everyone without a platform ticket, so they could only fail); `WAHALA_BASE` may move the site's base path |

Only this build has those constants. `WAHALA_PRIVATE_BETA` on its own, or with half the online switch, or without a platform address, switches **nothing** on (`tests/platform-flags.test.ts`, `tests/online/build-guard.test.ts`). The script refuses to build without a real domain, refuses anything but `https`/`wss` (a phone on mobile data will not talk to anything else; `--allow-local` is for a rehearsal on a LAN only) and afterwards **proves** the bundle: the beta's addresses are in it, the invite form is in it, no `localhost` or `{host}` address is in it.

```bash
BETA_DOMAIN=play.yourname.com npm run build:beta
```

## 2. Where to host it (recommended) and why

The beta client contains **no secret**: it is a static site. What keeps strangers out is not the page but the servers behind it (section 3). So hosting is a convenience decision:

| Option | Verdict |
| --- | --- |
| **A separate static site you control**, on its own address (for example `https://beta-<random>.yourname.com`), serving the contents of `dist-beta/` | **Recommended.** Nothing about the public site changes; you can take the beta page down without touching the servers; the origin is one fixed string. Give the testers the link privately. |
| The same domain as the servers (the edge serving `dist-beta/` at `/`) | Possible later (one more `location` in `ops/edge/nginx.beta.conf`, and the validation re-run). **Not built here**, because it changes the edge that was validated. |
| The public GitHub Pages site | **No.** The public site is built by CI from `claude/wahala-stitch-uiux-v1` and must stay online-off. `.github/workflows/deploy.yml` is the only publisher; do not add another. |

Never put `dist-beta/` in the repository, in a CI artifact that is published, or on the public Pages branch.

## 3. What actually protects the beta (every entry point)

| Entry point | Protection | Proven by |
| --- | --- | --- |
| Creating an account (`POST /v1/auth/guest`) | **Invite code** (`PLATFORM_INVITE_REQUIRED`): no code or a wrong code is refused; creation is rate-limited per address at the edge and by the platform | `player-platform/test/invites.test.ts`, `validate.sh` section 3 (57 of 60 creations refused in a burst) |
| Match server HTTP matchmaking (`/matchmake/*`), the SDK, a script | **A platform ticket is mandatory** (`RUMBLE_REQUIRE_TICKET=1`, the compose default): create, join by code and quick play are refused without a valid ticket, with the same answer whether the room exists or not. The platform issues tickets only to accounts (so only to invited people) | `server/test/platform.strict.test.ts`, `validate.sh` checks I1, I2, I7-I10 |
| A leaked room code | Useless without a ticket **for that room**; a ticket for another room, a host ticket, an expired, tampered, forged (another key) or replayed ticket is refused | `server/test/platform.test.ts`, `platform.strict.test.ts`, `validate.sh` I1/I2/I10 |
| Reconnecting after a drop | Needs the server's own seat reservation (not matchmaking); expires after 30 s | `server/test/platform.strict.test.ts`, `private-multiplayer.spec.ts` |
| A browser page on some other website talking to the servers | **Exact allowed origins** on both servers (`GAME_ORIGINS`, passed to `init --origin`); WebSocket upgrades from another origin are refused at the edge; CORS answers only the allowed origin | `validate.sh` section 3 |
| The internal and operator endpoints (`/internal/*`, `/admin/*`, `/metrics`, `/ready`, `/debug`) | Not routed by the edge at all (404); `/admin` needs the admin token and is only reachable from inside the server | `validate.sh` section 3, section 6 |
| Plain `http://` | Redirected to `https://`; HSTS; TLS 1.2+ | `validate.sh` section 3 |

So: someone who finds the beta page can open it and see the invite form, and that is all they can do. Someone who skips the page and talks to the match server directly is refused at matchmaking. Someone who skips both and talks to the platform needs an invite code.

## 4. Origins, CORS and the build

* Decide the page's address **first** (for example `https://beta-k3x9.yourname.com`), then run `wahala-beta.sh init --origin https://beta-k3x9.yourname.com --domain play.yourname.com`. The origin is the page; the domain is the servers. They may be different sites.
* The origin is written to **both** servers' allow-lists. A page served from any other address (including the public Pages site) cannot reach either server from a browser.
* Without the right origin the symptom is "the player service is not answering" on the beta page. Fix the origin; do not widen it to a pattern. (The platform refuses any origin that is not exact in production; the match server also understands `*` patterns, which `init` never writes, so keep it to the one exact origin.)
* WSS needs the real certificate (`wahala-beta.sh cert`); phones will not connect to a self-signed one.

## 5. Not done, on purpose

No tester accounts beyond guests with an invite code, no social login, no payments, no text or voice chat, no public matchmaking, and no automatic publication of the beta page by CI. The beta client has not been put on any host: **nothing is deployed**.
