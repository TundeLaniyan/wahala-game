# Free remote test from your MacBook (Cloudflare Quick Tunnel)

You host the game on **your own laptop** and invited players anywhere in Nigeria open a **temporary https address**. No paid server, no domain, no router settings, no account. When you close the Terminal window the address stops working.

**Status of the evidence, read this first.** Everything on *our* side of the tunnel was tested on one machine, with two real browsers, through a local stand-in that behaves like Cloudflare (it terminates TLS at a made-up `*.trycloudflare.com` name and forwards to the laptop the way `cloudflared` does). **Not tested:** Cloudflare's real network (the build environment cannot reach it), a physical phone, mobile data in Nigeria, a Mac. Your first run is the real test; section 9 says what to look at.

---

## 1. What you need on the Mac (once, about 20 minutes)

| Install | How | Check it worked |
| --- | --- | --- |
| **Docker Desktop** (free for personal use and small teams) | download from docker.com, open it, wait until it says "running" | `docker --version` |
| **Node.js 22** | download from nodejs.org | `node --version` shows 22 |
| **cloudflared** (Cloudflare's free tunnel program) | Terminal: `brew install cloudflared` (install Homebrew first from brew.sh if you do not have it) | `cloudflared --version` |
| The project | Terminal: `git clone https://github.com/TundeLaniyan/wahala-game.git`, then `cd wahala-game`, then `git checkout claude/wahala-beta-tunnel-v1`, then `npm ci` | no errors |

Give Docker Desktop at least **4 GB of memory** (Settings, Resources). The first start builds the game services and takes **5 to 15 minutes**; every later start takes about a minute.

## 2. Choose who may test (the allowed list)

The allowed list is the email addresses of the people you invite. They are kept **only on your Mac** (in `ops/beta/tunnel-state/`, which Git ignores). Each person gets their own private link.

```bash
npm run beta:tunnel:testers -- add ada@example.com bayo@example.com chidi@example.com
```

See the list: `npm run beta:tunnel:testers -- list`. Remove someone: `npm run beta:tunnel:testers -- remove ada@example.com` (their link stops working).

## 3. Start

```bash
npm run beta:tunnel
```

Leave that Terminal window open. It prints, in order: your Mac is ready, the game is built, the tunnel is open, the services are healthy, **22 protection checks passed**, and then a box titled **THE TEST IS RUNNING** with:

* **the website address** (looks like `https://word-word-word.trycloudflare.com`; it is **new every time you start**);
* **one private link per tester** (the address plus `/__enter?k=...`);
* **the WAHALA! invite codes**;
* a health table and how to stop.

If any protection check fails, nothing is shared and the test shuts itself down with a message.

## 4. What to send each tester (two things, ideally in two messages)

1. **Their own private link** (from the box). It opens the door once on their phone and then leaves the game page. Do not post it anywhere; it is theirs.
2. **One invite code** and these instructions: "Open the link. Tap PLAY ONLINE. Type the invite code when asked, choose a nickname, tap Friends/Party to play with a friend. Use Wi-Fi if you can: the first load is large."

More invite codes: `npm run beta:tunnel:invite -- new` prints a fresh one (give each code to one person). Withdraw one: `npm run beta:tunnel:invite -- revoke CODE`.

Three locks protect the test, in this order: **(1)** the private link (a stranger gets a plain "private test" page and can reach nothing); **(2)** the invite code (no account without one); **(3)** the match server accepts only players who hold a ticket that the accounts service gave to an account. Cloudflare's own `--allowed-mail` email option is **not relied on**: see section 8.

## 5. Is everyone connected? What is happening?

In a **second Terminal window** (same folder):

```bash
npm run beta:tunnel:status
```

It shows: the services (all `running`/`healthy`), **rooms open, matches playing (limit 2), people connected**, per room how many people are connected and how many **reconnections and drops** happened, the number of **accounts and finished matches recorded**, and the entrance's recent traffic including how many strangers were **refused** (403 without a link, 421 wrong address, 429 too many requests). Run it as often as you like.

For detail: `npm run beta:tunnel:logs -- rumble` (also `edge`, `platform`, `db`). Logs never contain passwords, tokens, invite codes or room codes.

## 6. Stop

Press **Ctrl-C** in the window that is running it, **or** from any Terminal:

```bash
npm run beta:tunnel:stop
```

It closes the tunnel, removes the game services and empties the access list, then confirms `STOPPED`. Your data (accounts, results) is kept for the next start. If the confirmation is missing, open Docker Desktop and stop the project named `wahala-tunnel`.

## 7. Things that happen

| What happens | Effect |
| --- | --- |
| **The Mac sleeps or the lid closes** | the tunnel and the game stop for everyone. The launcher asks macOS to stay awake while it runs (`caffeinate`), but keep the Mac **plugged in** and the lid **open**. If it did sleep: stop and start again |
| **Your internet drops** | the tunnel closes (the launcher says so and shuts the test down). Matches in progress end. Start again when the internet is back |
| **You start again** | **new address**, so every tester needs a **new private link** and a fresh player (their old player lived at the old address; they type the invite code again and pick a nickname, an old nickname is already taken by the old player) |
| **A tester's phone loses signal for a few seconds** | the game reconnects to the same fighter inside 30 seconds; a computer fighter plays meanwhile |
| **More than 2 matches at once** | the third waits in a queue (the limit is deliberate: your laptop is the server) |

## 8. Honest limits

* **Cloudflare Quick Tunnels are for testing:** no guarantee of uptime, the address changes every run, and Cloudflare may change or stop the service. Do not use this for a launch.
* **`--allowed-mail`.** The brief for this test says Cloudflare offers an email-protected Quick Tunnel option. The build environment could not open Cloudflare's documentation or run a real tunnel, so **it could not be verified here**, and the test does not depend on it. The launcher only *looks* at `cloudflared tunnel --help` and tells you whether your installed version lists the option; if it does, you can try it yourself by adding it to the start command (`npm run beta:tunnel -- --cloudflared-arg=...`, exact form per `cloudflared tunnel --help`). Watch for a login page appearing for the game's own requests: the launcher's checks would then fail and it would shut down rather than share an address.
* **Latency and size.** Players in Nigeria reach a laptop through Cloudflare and your home connection. The game needs a steady connection and your **upload speed** matters: expect a good experience with 2 to 4 players on a typical fibre or 4G connection, not more. The first page load is large (the 3D models and audio): testers on mobile data should expect several tens of megabytes (measured numbers are in `docs/measurements/beta-tunnel/`).
* **Your laptop is the server:** heavy use (a video call, a big download) slows the game for everyone.
* **Your testers' emails never leave your Mac.** They are labels for the links; nothing is sent to them automatically. You send the links yourself.
* This is a **private test**: no ranked play, no payments, no free chat, no public matchmaking. The public GitHub Pages game is not involved and is unchanged.

## 9. Your first run: what to check (this is the part nobody could test for you)

1. `npm run beta:tunnel` ends with **THE TEST IS RUNNING** and `PASS the public address answers strangers with the access page (403)`. That line proves the real tunnel works and that a stranger meets the lock first.
2. Open **your own private link on your own phone, on mobile data** (Wi-Fi off). The game page must load and **PLAY ONLINE** must show an invite-code box.
3. Create two players (your phone and a laptop browser), make a party, start **Free-for-All**, then **Team Rumble**: both must reach the same room, show **VERIFIED**, play, and see the same results. Switch your phone to Airplane mode for 15 seconds and back: it must return to the same fighter.
4. `npm run beta:tunnel:status` shows both people connected and the match recorded.
5. Send one real tester their link and code. Watch the status and ask them how it felt (smooth, laggy, how long the first load took).

If step 1 or 2 fails, copy the last 30 lines of the Terminal window and the output of `npm run beta:tunnel:logs -- edge` to the developer.

## 10. If something goes wrong

| What you see | What to do |
| --- | --- |
| "MISSING Docker is installed and running" | open Docker Desktop, wait for "running", try again |
| "MISSING cloudflared" | `brew install cloudflared` |
| the tunnel gives no address within a minute | the launcher already retries with a different transport (`http2`); try another network (a phone hotspot works), or `npm run beta:tunnel -- --tunnel-protocol http2` |
| cloudflared complains about a configuration file | move `~/.cloudflared/config.yml` away for the test, then try again |
| "a protection check FAILED" | nothing is shared and the test stops. Send the printed `FAIL` lines to the developer; do not work around it |
| a tester sees "private test" | they did not open their private link on this device, or the link is from an earlier run: send the current link |
| a tester sees "That invite code was not accepted" | check the code with `npm run beta:tunnel:invite -- list` |
| the first build fails | check your internet connection and retry; it continues from where it stopped |
