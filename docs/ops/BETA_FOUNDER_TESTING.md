# Founder testing: two separate procedures

Nothing here deploys anything or buys anything. **Procedure A** needs only your laptop and two phones on the same Wi-Fi, and it is the one to do first. **Procedure B** is for later, when you have decided to rent a small server and a domain.

| | A. Same Wi-Fi | B. Hosted private beta |
| --- | --- | --- |
| Where it runs | your laptop | a rented server with your domain |
| Cost | none | the server and the domain (you decide) |
| Invite code | not needed (a private test) | **required** (this is what keeps strangers out) |
| Certificate | none (plain http on your Wi-Fi) | real HTTPS/WSS |
| Status of the evidence | laptop and two real browsers: **passed**. Two real phones: **not yet done** | Docker stack validated on one Linux machine: see `docs/FINAL_INTEGRATION.md`. A real server, domain, certificate, phones and mobile data: **not yet done** |

---

## A. Same-Wi-Fi test: one laptop, two phones (about 25 minutes)

The full table with every tap is in **`docs/PLATFORM_LOCAL_TEST.md`** (section 4). This is the short version, with the commands.

### 1. On the laptop, once (Node 22)

```bash
git checkout claude/wahala-final-private-beta-v1
npm ci
cd server && npm ci && cd ..
cd player-platform && npm ci && cd ..
```

### 2. Start everything

```bash
npm run dev:private
```

Wait about a minute. It prints your laptop's numeric address, for example `192.168.1.23`, and the two health addresses. Leave the window open (Ctrl-C stops everything). Everything is in memory: if you restart it, everybody is a new player.

### 3. On both phones (same Wi-Fi, not mobile data)

1. Open `http://192.168.1.23:4567/health` and `http://192.168.1.23:2567/health` (use YOUR address). Both must show `{"ok":true...}`. If one does not, go to "If a connection fails" below.
2. Open `http://192.168.1.23:5173/?online` on each phone (landscape).

### 4. The test

| Step | Phone A | Phone B |
| --- | --- | --- |
| 1 | **PLAY ONLINE**. Under **YOU** tap **Change**, type `PhoneA`, **Save**. Note the 8-letter friend code. This is how Phone A "creates its account": the game makes a guest player for this phone automatically. | Same: `PhoneB`. |
| 2 | **FRIENDS** | **FRIENDS**, type A's friend code, **Add** |
| 3 | **Accept** the request | PhoneA shows in your friends |
| 4 | **PARTY**, keep **Free-for-All**, **Create party**, then **FRIENDS** → **Invite** PhoneB | **PARTY** → **Accept**, then **Ready** |
| 5 | **Start private match** | You are put in the same room automatically (else **Join match**) |
| 6 | Both phones show **PhoneA** and **PhoneB** with a green **VERIFIED** tag | |
| 7 | Choose **3 MIN**, **Ready**, **Start** (30 bots fill the rest: 32 fighters in all) | **Ready** |
| 8 | In the match tap **Signal** → **Nice one!** | "PhoneA: Nice one!" appears in the side rail |
| 9 | Keep playing | **Reconnect test:** Airplane mode ON for about 15 s, then OFF: you come back as the same fighter |
| 10 | Match ends: both phones show the **same results table** (2 HUMAN, 30 BOT) | |
| 11 | **Rematch**, choose **Team Deathmatch**, Ready, Start, play, finish | |

**How to confirm the results are trusted.** The numbers in the results table come from the match server's own simulation (a phone cannot invent them). To see that the platform recorded them: the laptop window prints `[platform]` lines when a match starts and finishes. For an exact check, run on the laptop after the match: `node scripts/mp/restart-check.mjs` is NOT needed; instead trust the automated version (`npm run test:private-e2e`), which compares the recorded history with the server's results row by row.

### If a connection fails

| What you see | Do this |
| --- | --- |
| The page will not open on a phone | Same Wi-Fi (not mobile data, not a guest network); use the numeric address, never `localhost`; allow Node through the laptop firewall (ports 5173, 2567, 4567) |
| "Friends and parties are unavailable" | The phone cannot reach port 4567: open the platform health address; fix Wi-Fi or firewall; **Retry** |
| "origin not allowed" | You used an address the launcher did not print. Use the printed one; if the laptop changed Wi-Fi, Ctrl-C and run `npm run dev:private` again |
| "Your sign-in for this match expired" | Tickets live 2 minutes: tap **Join match** again |
| "That nickname is taken" | Pick another (unique across the platform) |
| iPhone asks for local network access | Allow it |

When you report a problem, send: the phone models and browsers, the step number that failed, what the screen said, and the last 30 lines of the laptop window. **Do not** send `.local/private-dev/secrets.json`.

---

## B. Hosted private-beta test (a supervised test with a small group)

Do this only when you have decided to host. **Before anything is deployed, you must provide the items in section "What you must provide first".**

### What you must provide first

| # | You provide | Why |
| --- | --- | --- |
| 1 | A rented Linux server: **Ubuntu 24.04 LTS, 2 vCPU (dedicated is better), 4 GB memory, 40 GB disk**, with a public IPv4 address and SSH access | the whole stack runs on it (about 1 GB at rest; the match server uses most of one core with two bot-filled matches) |
| 2 | A **domain** you control, and an `A` record pointing at that server (for example `play.yourname.com`) | the real HTTPS/WSS certificate |
| 3 | The **address of the page** testers will open (for example `https://beta-k3x9.yourname.com`) and a static host for it | the servers only accept browsers from this one origin |
| 4 | An **email address** for the certificate authority | certificate notices |
| 5 | Your decision on **privacy**: what testers are told (nickname, friends, party and match results are stored; how to ask for removal), and a **minimum age** policy (the platform treats an unspecified age as a minor) | before any invitation |
| 6 | Optional: an **alert webhook** address; somewhere to copy **backups** off the server | alerts to your phone; backups that survive the server |
| 7 | A named person who **watches** the beta while testers play and reads reports | there is no moderator tool yet; reports are read by command |

### Steps (about 1.5 hours, mostly waiting)

1. **Prepare the server** and **start** the backend: follow `docs/ops/BETA_HANDBOOK.md` sections 2 to 4 exactly (`init`, `up`, `status`, then `ops/beta/wahala-beta.sh validate --quick` and read its last line: it must say **NO FAILURES**).
2. **Real certificate:** handbook section 5 (the practice run first, then the real one). `https://play.yourname.com/health` must show a padlock.
3. **Build the beta page** on your laptop and put it on the static host from item 3 (see `docs/ops/BETA_FRONTEND.md`):

   ```bash
   BETA_DOMAIN=play.yourname.com npm run build:beta
   ```

   The build proves itself (it prints `dist-beta/ is ready`). Upload the **contents** of `dist-beta/`.
4. **Make invite codes**, one per tester: `ops/beta/wahala-beta.sh invite new` (handbook section 6). Send each tester their link and their code privately.
5. **Acceptance with two of your own phones on MOBILE DATA** (not your Wi-Fi), one invited tester each:

   | Step | Phone A | Phone B |
   | --- | --- | --- |
   | 1 | Open the beta link. **PLAY ONLINE** shows at once (no `?online`). Enter **A's invite code**, **Join the beta**. Choose a nickname. | Same with **B's code** |
   | 2 | Friends: exchange friend codes, **Accept** | |
   | 3 | **PARTY** → **Create party** → **Invite** PhoneB → B **Accept**, **Ready** | |
   | 4 | **Start private match**: both phones are in one room, both **VERIFIED** | |
   | 5 | Pick **Free-for-All**, play a full 3-minute match, send a **Signal** | Receives it |
   | 6 | **Reconnect test:** Airplane mode 15 s, then back | |
   | 7 | Compare the two results tables: identical, 32 rows | |
   | 8 | **Rematch** as **Team Deathmatch**, play it | |
   | 9 | **Refusal checks:** a third person with the link but **no code** cannot create an account; the same code is used by no one else | |

6. **On the server, confirm the trusted record and the health:** `ops/beta/wahala-beta.sh status` (everything healthy, no alerts), `ops/beta/wahala-beta.sh logs` (no passwords, tokens or room codes appear).
7. **Take a backup and prove you can restore it:** handbook section 8.

### Limits for the first beta

* **At most 2 matches playing at once** (the default; the 3rd is queued for up to 2 minutes). Do not raise it without new measurements.
* Invite only as many people as can play in 2 rooms: for example 4 to 8 testers, in two parties at a time.
* A match lives in the match server's memory: restarting it ends the matches in progress (testers are told; results of an interrupted match are not recorded).

### Stop conditions: end the test and tell the developer if

* any `FAIL` line in `validate --quick`;
* a tester sees someone else's nickname as theirs, or a player without a **VERIFIED** tag in a private party room;
* a person without an invite code gets an account or a seat;
* the match results differ between two phones;
* an alert of level `crit` that does not clear.
