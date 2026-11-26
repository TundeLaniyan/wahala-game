# WAHALA! private beta: the handbook

For the founder. You do not need to know Docker, Linux, networking, proxies or TLS: every step below is a command to copy, with what you should see and what to do if you do not. Nothing here buys or starts anything by itself: **you** rent the server, **you** point the domain, **you** run the commands.

> **What was and was not tested.** All of this was run for real on a Linux machine with Docker (`ops/beta/validate.sh`, results in `BETA_READINESS.md`). It has **not** been run on a rented server with a real domain and a real certificate, because none was bought. The one step that can only be proven on the real thing is getting the certificate (section 5); it has a practice mode that costs nothing. Phones were not part of any test.

## 0. The picture

```
players' phones ──https/wss (443)──▶  EDGE (nginx: encryption, rate limits)
                                         ├──▶ MATCH SERVER   (the game: rooms, bots, results)
                                         └──▶ PLAYER PLATFORM (accounts, friends, parties)
                                                   └──▶ DATABASE (PostgreSQL, saved on the server's disk)
              + BACKUP (every night)  + MONITOR (watches everything, writes alerts)
```

One server, six small programs started together by one command. **Only the edge is reachable from the internet** (ports 80 and 443). The database, the game server and the platform have no public address at all (checked automatically by the validation script).

## 1. What to rent

| | Minimum for the beta | Why |
| --- | --- | --- |
| Server | **2 vCPU, 4 GB memory, 40 GB SSD** (dedicated CPU is better than shared) | the game server uses most of one core when 2 matches with computer-controlled fighters run; the rest of the stack needs about 1 GB |
| System | **Ubuntu 24.04 LTS** | the instructions below are for it |
| Place | **London** first (about 104 ms from Lagos, `HOSTING_COSTS.md`); measure from a phone before deciding | |
| Domain | any name you control, for example `play.yourname.com` | players connect to `https://play.yourname.com`; the certificate needs a real name |
| Cost | see `HOSTING_COSTS.md` (about $20-45 a month for a server of this size; billed by the hour at most providers, so a test weekend costs very little) | not a quote |

How many players: **at most 2 matches at once** (that is what the server allows and what was measured, `BETA_LOAD_RESULTS.md`), which is a handful of friends per match plus computer-controlled fighters filling every match to 32. This is an **invite-only** beta: do not announce the address publicly.

## 2. One-time server preparation

1. In the provider's panel create the server (Ubuntu 24.04, your SSH key). Note its **IP address**.
2. At your domain registrar add a DNS record: type **A**, name `play` (or whatever you chose), value = the server's IP, TTL 300. Wait a few minutes. Check from your own computer: `ping play.yourname.com` should show the server's IP.
3. Connect: `ssh root@SERVER_IP` (or the user the provider gave you).
4. Install what is needed:

```bash
apt-get update && apt-get install -y docker.io docker-compose-v2 git openssl curl ufw
```

```bash
systemctl enable --now docker
```

5. Close every door except SSH and the web (the stack publishes only 80 and 443 anyway, this is a second lock):

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

6. Get the code (until it is merged, use the branch name):

```bash
git clone https://github.com/TundeLaniyan/wahala-game.git && cd wahala-game && git checkout claude/wahala-final-private-beta-v1
```

## 3. First start

Replace `https://YOUR-GAME-PAGE-ORIGIN` with the web address players load the game from, **without a path and without a slash at the end** (for example `https://yourname.github.io`). Replace the domain with yours.

```bash
ops/beta/wahala-beta.sh init --origin https://YOUR-GAME-PAGE-ORIGIN --domain play.yourname.com
```

You will see `created secret: ...` lines. Secrets are random passwords the computer makes for itself; **you never type them**. They live in `ops/beta/state/secrets` (readable only by the server's administrator). Then:

```bash
ops/beta/wahala-beta.sh up
```

The first time it builds the two programs (about 5-10 minutes). It ends with `the beta backend is running`. If it prints an error instead, copy the whole message to the developer; nothing was changed on your domain or accounts.

## 4. Confirm it works

```bash
ops/beta/wahala-beta.sh status
```

Read it like a car dashboard: every service `running` / `healthy`, memory far below its limit, disk not full, `last good backup` (after the first night), no alerts.

From any computer: open `https://play.yourname.com/health` in a browser. It shows `{"ok":true,...}`. Until section 5 is done the browser warns that the certificate is not trusted; that is expected.

**The full automatic check** (about 5 minutes, uses a separate throw-away copy, never touches your real data; run it before inviting anyone and after every update):

```bash
ops/beta/wahala-beta.sh validate --quick
```

It ends with `BACKEND VALIDATION: NO FAILURES` and a report file. Any `FAIL` line means: do not invite anyone, send the report to the developer. The final line also shows `0 blocked`: the match server is connected to the platform (`BETA_INTEGRATION_HANDOFF.md`), so nothing is waiting on anybody. A full run (no `--quick`) takes about 11 minutes and plays a real 3-minute match.

## 5. The certificate (HTTPS)

Browsers and phones refuse to talk to a server without a trusted certificate. It is free (Let's Encrypt) and automatic, but needs your DNS record from section 2 to be working and port 80 reachable.

1. **Practice run** (Let's Encrypt allows many of these, it issues a test certificate that browsers do not trust but proves everything else works):

```bash
ops/beta/wahala-beta.sh cert --domain play.yourname.com --email you@yourname.com --staging
```

2. Real one:

```bash
ops/beta/wahala-beta.sh cert --domain play.yourname.com --email you@yourname.com
```

It ends with `certificate installed and the edge reloaded`. Open `https://play.yourname.com/health`: the padlock appears.

3. Certificates last 90 days. Ask the server to renew weekly: run `crontab -e`, add this single line (replace the folder if you cloned elsewhere), save:

```
17 4 * * 1 cd /root/wahala-game && ops/beta/wahala-beta.sh cert-renew >> /root/cert-renew.log 2>&1
```

`status` shows the certificate's end date, and the monitor raises an alert two weeks before it. **If the practice or the real request fails**: most often the DNS record has not spread yet (wait 10 minutes) or port 80 is blocked by the provider's own firewall panel (open 80 and 443 there too).

## 6. Inviting testers

The beta only creates an account for someone who holds an **invite code**.

```bash
ops/beta/wahala-beta.sh invite new        # prints one new code: give it to ONE tester
ops/beta/wahala-beta.sh invite list       # everybody's valid codes
ops/beta/wahala-beta.sh invite revoke wb-xxxxxxxxxxxxxxxx   # stop one code (existing accounts keep working)
```

The beta page asks the tester for the code when it creates their player (a private-beta build of the game, `docs/ops/BETA_FRONTEND.md`); the code is sent once and never kept. A wrong code is refused with a plain message. The invite code is also what protects the match server: it only seats players who hold a ticket from the platform, and the platform only issues tickets to accounts.

## 7. Every day

| I want to... | Command |
| --- | --- |
| see if everything is fine | `ops/beta/wahala-beta.sh status` |
| read what happened | `ops/beta/wahala-beta.sh logs` (one service: `logs rumble`, `logs platform`, `logs edge`; the last hour: `logs --since 1h`). Logs never contain passwords, tokens or room codes |
| stop everything (players' data stays) | `ops/beta/wahala-beta.sh down` |
| start it again | `ops/beta/wahala-beta.sh up` |
| restart after the server itself rebooted | nothing: every service starts by itself (`restart: unless-stopped`) |
| get alerts on your phone | put a Slack/Discord-style webhook address into `ops/beta/state/beta.env` as `BETA_ALERT_WEBHOOK=...`, then `ops/beta/wahala-beta.sh up` |

**What an alert means** (they appear in `status` and in `logs monitor` as lines with `"level":"warn"` or `"crit"`; `info` lines need no action): `down` a service stopped answering (it is restarted automatically; if it keeps coming back, `logs <service>`); `restart` the game server restarted; `disk` under 20 % free (warn) or 10 % (critical): copy backups away, `docker system prune -f`, or enlarge the disk; `memory` the game server is near its limit; `backup` no good backup for 30 hours (warn) or 54 hours (critical); `certificate` expires within 21 days (warn) or 7 days (critical): see section 5; `capacity` more matches in play than the comfortable number (informational: at the maximum of 2 the server queues new matches); `cpu`, `tick-step`, `timer-lateness`, `event-loop` the game server is overloaded and a game may feel slow: reduce the number of simultaneous matches; `stuck-room` a match has run suspiciously long; `platform-restart`, `platform-memory`, `platform-latency`, `platform-5xx` the platform restarted, is using too much memory, is slow or is answering with errors (`logs platform`); `db-pool-waiting` / `db-pool-full` the platform is waiting for database connections; `platform-rate-limited` somebody is being refused for asking too often (normal in small numbers).

## 8. Backups and restoring

Backups run **every night at 03:00 UTC**, are kept for 14 days and live in `ops/beta/state/backups` (readable only by the administrator).

```bash
ops/beta/wahala-beta.sh backup            # take one right now
ops/beta/wahala-beta.sh backups           # list them
ops/beta/wahala-beta.sh restore-test      # PROVE the newest one works: restores it into a scratch database, counts the rows, throws it away. Touches nothing live. Do this weekly.
```

**Copy backups off the server** (a backup on the same disk does not survive losing the server). From your own computer, weekly:

```bash
scp -r root@SERVER_IP:/root/wahala-game/ops/beta/state/backups ./wahala-backups
```

Also copy `ops/beta/state/secrets` once, to a safe place (a password manager): without it a restored database cannot be used by a new server.

**Disaster: the data is damaged or lost.** Pick the backup file (`backups`), then:

```bash
ops/beta/wahala-beta.sh restore ops/beta/state/backups/wahala-XXXX.dump --yes
```

It takes a safety backup of the damaged state first, replaces the database, applies migrations and restarts. The automatic check does exactly this drill (deletes accounts, friendships and match history on purpose, restores, and compares) every time it runs.

## 9. Updating, and a release that goes wrong

```bash
git pull
```

```bash
ops/beta/wahala-beta.sh update
```

It takes a backup, builds, applies database changes, starts the new version and checks it. **If the new version is not healthy it puts the old one back by itself** and tells you. To go back by hand: `ops/beta/wahala-beta.sh rollback`.

One case needs care: if the failed release **changed the database** (a new migration), the old version refuses to start on it (on purpose: it must not guess). Then restore the backup that `update` took first (`backups` shows it, the newest before the update) with the `restore ... --yes` command above. You lose only what happened since the update started.

## 10. Passwords and keys: how to change them

If you think a secret leaked, or when a tester with access leaves, replace it. Each takes seconds, restarts only what uses it, keeps the old value in `ops/beta/state/secrets-old` in case you need to go back, and is checked by the automatic validation.

```bash
ops/beta/wahala-beta.sh rotate admin-token           # the operator key
ops/beta/wahala-beta.sh rotate db-password           # the database password (changed inside the database and in the files)
ops/beta/wahala-beta.sh rotate ticket-key            # the key that signs match tickets (tickets last 2 minutes, so nobody notices)
ops/beta/wahala-beta.sh rotate match-server-secret   # the key the game server uses to report results
ops/beta/wahala-beta.sh rotate platform-metrics-token
ops/beta/wahala-beta.sh rotate rumble-metrics-token
```

Players' login sessions are separate: they use random tokens stored only as hashes, replaced at every refresh; stealing and replaying one revokes the whole session (tested). There is no "log everybody out" button. If you ever need it: `ops/beta/wahala-beta.sh psql`, then type `update sessions set revoked_at = now() where revoked_at is null;` and press Enter, then `\\q`.

## 11. What it costs to keep running, and how to watch it

- The provider's bill: the monthly server price. Players' traffic is small (about 36 MB per player-hour); check the provider's traffic graph weekly.
- Resource use, any time: `ops/beta/wahala-beta.sh status` (memory and CPU per service). The game server's memory is about 170 MB with no match and about 150 MB more per running match.
- **Capacity.** The server allows 2 matches in play at once and queues a 3rd: its players see "the servers are busy, your match starts as soon as a slot is free", and if no slot frees up within 2 minutes the room is closed with a polite "try again in a little while" ("server busy, try again in a moment") instead of slowing everyone down. The numbers behind it are in `BETA_LOAD_RESULTS.md`. Do not raise the limits without re-measuring.

## 12. Turning the beta off completely

1. `ops/beta/wahala-beta.sh down` pauses it (everything stays).
2. To delete the programs, the database and the data on the server: `ops/beta/wahala-beta.sh destroy --yes`. (Your secrets, certificates and backups stay in `ops/beta/state` until you delete that folder.)
3. In the provider's panel delete the server (this is what stops the bill) and any snapshots or backups it offers.
4. At the registrar delete the `play` DNS record.
5. If you kept a copy of the backups and secrets and no longer need them, delete them: they contain every tester's nickname and friend list.

## 13. When something is wrong

| Symptom | Do |
| --- | --- |
| `https://play.../health` does not answer | `ops/beta/wahala-beta.sh status`. If a service is not `healthy`: `logs <service>`. If the server itself does not answer, check the provider's panel and `ufw status` |
| Browser says the certificate is untrusted | section 5 (the temporary certificate is still in use) |
| Players get "server busy" | normal when 2 matches are already being played; the match starts when one ends, or the players are told to try again after 2 minutes. If it persists with nobody playing: `status`, then `logs rumble` |
| Players cannot create accounts | they need an invite code (section 6), or the platform is down (`logs platform`) |
| `status` shows `no backup yet` after a day | `logs backup`; run `backup` by hand; send the output to the developer |
| The disk is almost full | `docker system prune -f` (removes only unused images), delete old files in `state/backups` after copying them away |
| Anything else | `ops/beta/wahala-beta.sh logs --since 1h > report.txt` and send `report.txt` (it contains no secrets) |

## 14. What this does not do (so nobody is surprised)

No real payments, no text or voice chat, no ranked play, no automatic scaling or second server. Google and Apple sign-in are switched off (they need accounts only you can create); every player is a guest with an invite code. The match server is connected to the accounts and tickets, and requires a ticket for every join (`BETA_INTEGRATION_HANDOFF.md`).
