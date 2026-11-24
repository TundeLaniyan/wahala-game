# 08 — Security checklist, abuse protections and secret handling

Scope: guest play for private testing; **no accounts, no ranked progression, no persistent rewards** (deferred by the founder).
That removes most of the attack surface (no passwords, no payment, no stored player data on the server) and leaves **availability
and abuse** as the real risks. Items are tagged VALIDATED (probe or test here), DESIGN (written, not testable without a real
host), or OPEN (needs a code change by Architecture: handoff IDs SRV-n).

## 1. Threats, in order of how likely and how expensive

| Threat | Likelihood | Impact | Controls |
| --- | --- | --- | --- |
| Amplified DoS by room creation (one request = a 31-bot match) | high once public | high (all rooms lag) | nginx per-IP limits (VALIDATED); SRV-1..3 (OPEN) |
| Volumetric DDoS | medium once known | high | provider / CDN edge only (DESIGN; 04) |
| Slow-loris / connection exhaustion | medium | medium | nginx timeouts + `limit_conn` (VALIDATED config; not load-tested) |
| Room-code guessing (join private rooms) | low | low–medium | 31⁶ ≈ 887 M codes; join limit 60 / min / IP; reconnect needs a secret token (VALIDATED) |
| Name abuse / impersonation of bots or staff | high | low–medium (reputation) | SRV-4 (OPEN) |
| Cheating via forged inputs | low | medium | server authority: clients send only `{seq, move, hold, buttons}`; results come from the server's own state (VALIDATED by tests and probe) |
| Hijacking a dropped player's seat | low | medium | single-use rotating token (VALIDATED) |
| Cross-site abuse from other websites | medium | low | origin allow-list (VALIDATED) |
| Secret leakage (tokens, keys) | medium | high | rules below |
| Dependency / image CVEs | medium | low–medium | 8 low / moderate advisories, none in the shipped bundle (01 F12); image scan before public (OPEN) |

## 2. Guest-name abuse

**Today (VALIDATED, probe group `names`):** 2–24 characters of letters, marks, digits, space and `_ . ' -`; Unicode NFC; spaces
collapsed; at least one letter or digit; stacked combining marks rejected. Rejected: HTML, `<script>`, right-to-left override,
zero-width characters, newlines, emoji-only, punctuation-only, non-strings, `__proto__` objects. Accepted correctly: `Ọlá-Adé`,
`Chidi_99`, `D'Tunde`, `Ngozi O.`.

**Gaps (reported as GAP by the probe, not failures):** `BOT Chidi` (impersonates a labelled server bot: the room tells players that
`BOT …` seats are AI), `Admin`, `Moderator`, a Cyrillic look-alike `Аdmin`, two humans with the same name in one lobby; no
profanity or insult filter at all (character classes and length only). Names appear in lobbies, kill feeds and results shown to
other players, including children.

**Recommended policy (SRV-4, Architecture):**
1. *Public rooms:* the server assigns `Guest ####` (and a character); free-text names only in private rooms. This removes name
   abuse from matchmaking entirely at the cost of personality, and needs no moderation list. Recommended for the first release.
2. *Private rooms:* keep free text but add: a reserved list (`bot`, `admin`, `mod`, `moderator`, `host`, `system`, `wahala`,
   `server`, `support`, `staff`) checked on a **normalised skeleton** (case-folded, look-alike letters mapped, separators removed),
   reject mixed Latin + Cyrillic / Greek in one name, force-suffix duplicates in a room (`Ada`, `Ada 2`), and a small
   English / Pidgin / Yoruba / Igbo / Hausa blocklist with common letter-substitution normalisation. State the limits honestly:
   blocklists are imperfect; the host of a private room is the moderator, and there is no chat to abuse.
3. Whatever shows the name (HUD, results) must treat it as text, never HTML (the dev client uses `textContent`).
4. A **report / mute** path and a documented ban procedure (by IP at the proxy, by session) before public launch.

## 3. Room-creation flooding and denial of service

**Measured exposure (probe):** against the bare server, 40 of 40 private rooms created in 113 ms; and six public rooms with
`autoStartSec: 0` (a value the client may send) saturated one process (104 % CPU, 150 ms loop p99, 370 dropped ticks).

**Layer 1: proxy (VALIDATED locally, `ops/proxy/nginx.conf.template`):**

| Control | Setting | Result |
| --- | --- | --- |
| Create / joinOrCreate | 12 per minute per IP, burst 6 | 35 of 40 refused with 429; 5 accepted |
| Join / joinById (code guessing) | 60 per minute, burst 20 | 887 M codes ÷ 60 per min per IP: not practical |
| **Reconnect** | 180 per minute, burst 60: its own budget | the 30 s reconnect probe passes with every limit active (26 s ok, 33 s refused) |
| WebSocket upgrades | 120 per minute, burst 40; 64 concurrent connections per IP | config validated; not load-tested |
| Request hygiene | body ≤ 2 KB; header / body timeouts 10 s; keep-alive 30 s | config validated |
| Path allow-list | only `/health`, `/matchmake/*`, and the `/<id>/<id>` socket with an Upgrade header; `/`, `/metrics`, everything else 404 | VALIDATED |

**Caveat that matters in Nigeria:** mobile carriers commonly put many phones behind one public address (carrier-grade NAT), so a
per-IP limit can block honest players who share an address. The numbers above are generous for honest use (one create per match,
at most a handful of joins) and are tight only on volume. Watch the 429 rate in the first tests and loosen if honest players are
hit; do not tighten without data. IPv6 clients arrive as /128 addresses that cost an attacker nothing: per-/64 limiting is a later
refinement.

**Layer 2: the server (OPEN, Architecture): the limits above are per IP, and IPs are cheap. The amplification must be fixed where it
lives:**
- **SRV-1** admission control: a global cap on rooms and on *running matches* per process; a per-IP cap on rooms created and open
  (`AuthContext.ip` is available to the room's static `onAuth`: checked in the Colyseus type definitions. It is resolved from proxy headers, which is safe only because `ops/proxy` **overwrites** `X-Forwarded-For` with the real peer address instead of appending to a client-supplied one); refuse with a friendly error and a `Retry-After`.
- **SRV-2** in production ignore the client's `autoStartSec` and `private` knobs for public rooms (fixed 20 s, server-chosen), keep
  them for the test harness behind `RUMBLE_TEST_FAST`.
- **SRV-3** bot budget: do not begin a bot-heavy match when the process is above a CPU / event-loop threshold (queue or place the
  player in an existing room); cap bot-heavy rooms per process (06: 3).
- Acceptance test already exists: `probe.mjs --only botstorm --storm 6` must stop reporting a GAP, with an honest client still able
  to join and play during the storm.

**Layer 3: network edge (DESIGN):** a provider firewall limited to 80 / 443 / SSH; for volumetric attacks only a provider or CDN
edge helps (04). At the chosen budget, accept the residual risk for private testing and decide on a CDN before public launch.

**Process safety (VALIDATED):** frames over 4 KB close the socket; >20 invalid messages / 10 s or >600 messages / 5 s disconnect
with 4400 and block reconnecting; malformed options (strings, unknown arena, absurd durations, `private:"yes"`) are rejected
before a room is created.

## 4. Unauthorised reconnection

| Property | Evidence |
| --- | --- |
| Token = room id + a secret, issued per session, **single use and rotated** on every reconnect | VALIDATED: reuse of the old token refused |
| A wrong secret for a dropped seat's room is refused | VALIDATED: three guessed tokens refused while the seat was open |
| The window is 30 s from the drop and then the seat belongs to a bot | VALIDATED in real time: ok at 26.0 s, refused at 33.0 s, directly and through TLS + nginx |
| A player who left on purpose cannot return with the old token | VALIDATED |
| A client kicked for abuse (4400) cannot reconnect | VALIDATED |
| Brute force | secret is ~9 base-62 characters (≈ 53 bits) behind a 180 / min / IP limit: infeasible |
| Information leak | a wrong code answers "room … has been disposed" while a right code with a wrong token answers "token invalid": an attacker can tell which codes exist. Rate limits make enumeration impractical; SRV-6 (low): return one generic error |

**Mobile caveat (decision, 00):** the token lives in page memory only, so a reload loses it (F10). A short-lived `sessionStorage`
copy would make iOS background-kills survivable; the cost is that script injection on the page could read it. With no user-supplied
HTML on the page that risk is small. Founder / Architecture decision; I did not change it.

## 5. Secret-handling rules

**Inventory of secrets:** `RUMBLE_METRICS_TOKEN`; `ALERT_WEBHOOK_URL` and `ERROR_WEBHOOK_URL`; the TLS **private key**; SSH keys; cloud
provider API tokens and account logins; domain registrar login; (later) Sentry DSN, Redis password.
Not secrets: `RUMBLE_ALLOWED_ORIGINS`, the public game URL, the certificate, room codes of public rooms.

1. **Never in git, never in chat.** Templates hold placeholders only (`ops/env/server.env.example`); real values go in the host's
   secret store or an `--env-file` outside the repository. `ops/.gitignore` ignores `env/*.env`, `proxy/certs/`, `local/.run/`
   (VALIDATED with `git check-ignore`: `server.env` and `privkey.pem` ignored; the example and the throwaway local-rehearsal env
   file tracked). `ops/env/compose.local.env` contains only a throwaway token for localhost: do not copy it to a real host.
2. **Generate, do not invent:** `openssl rand -hex 24`. Different token per environment (laptop / staging / production). The LAN
   launcher makes a fresh token per run.
3. **Browser builds contain no secrets.** `WAHALA_*` build variables are public by design (the repo says so). The metrics token,
   webhooks and keys must never be given a `WAHALA_` or `VITE_` prefix.
4. **Logs and reports:** the proxy log excludes query strings and masks codes; the error reporter scrubs codes and token-like
   strings; do not paste `docker inspect`, env dumps or `/metrics` output with the token into issues.
5. **Rotate on suspicion and on people changing:** metrics token, webhooks, SSH keys; revoke provider tokens; the certificate key if
   the host was shared. Keep a one-page rotation list with the owner of each secret.
6. **Least privilege:** the provider token used for deploys can create / destroy only the one project; 2FA on the provider, the
   registrar and GitHub; billing alert before the first resource.
7. **Scan before pushing:** GitHub secret scanning (the repository is public, so it is on); run it on the branch before merge. A
   public repository means an accidental commit is public within seconds: rotate first, rewrite history second.
8. **No secrets for guests:** guest play stores nothing about a person on the server; there is nothing to leak beyond logs.

## 6. Privacy (flag, not legal advice)

Guest play still processes personal data: IP addresses reach the nginx log and the provider; names are shown to other players. The
Nigeria Data Protection Act 2023 applies to data of people in Nigeria, and young players are likely (school-age audience): get a
short privacy notice reviewed by someone qualified before a public launch, and keep log retention short (suggest 14 days).

## 7. Pre-launch security checklist

Private internet test (needs only the first block):
- [ ] `NODE_ENV=production`, `RUMBLE_ALLOWED_ORIGINS` exactly the page origin, `RUMBLE_METRICS_TOKEN` set (compose enforces)
- [ ] TLS with a trusted certificate; `https://` health reachable; HSTS on; port 2567 not published
- [ ] Host firewall + provider firewall: 80 / 443 / SSH-from-my-IP; SSH keys only; automatic security updates
- [ ] Billing alert set; alert webhook tested by killing the server; `watch.mjs` running
- [ ] `probe.mjs` all PASS (expected GAPs only: names, and the server-side amplification) against the real host
- [ ] The tester group is small and known; the URL is not posted publicly

Public release adds:
- [ ] SRV-1..3 done and `probe.mjs --only botstorm` shows no GAP; SRV-4 (names) done; SRV-5 metrics gaps accepted or closed
- [ ] CDN / DDoS decision made and tested; per-IP limits tuned from real 429 data
- [ ] Real-phone soak: a full match with 32 fighters on at least three networks with app-switch and reconnect tests
- [ ] Image vulnerability scan clean; base image pinned by digest; deploy / rollback / drain routine rehearsed
- [ ] Abuse report channel, ban procedure, privacy notice, log retention set
- [ ] Shipped client takes the server URL from build config only (no `?server=`); the Pages pipeline decision (04) is made

## 8. Handoff to Architecture (I did not change these files)

| ID | Change | Files likely involved |
| --- | --- | --- |
| SRV-1 | global / per-IP room and running-match caps, friendly refusal | `server/src/rooms/RumbleRoom.ts` (`onAuth` / `onCreate`), `app.ts` |
| SRV-2 | production ignores client `autoStartSec` / `private` for public rooms | `server/src/core/options.ts` |
| SRV-3 | bot-match admission budget (CPU / loop threshold, max bot rooms per process) | `RumbleRoom.ts`, `metrics.ts` |
| SRV-4 | name policy (server-assigned public names; reserved / look-alike / duplicate rules) | `src/net/protocol.ts` `validatePlayerName`, `Lobby.ts` |
| SRV-5 | metrics additions (process totals, socket count, bots, reconnect failures; optional Prometheus text) | `metrics.ts` |
| SRV-6 | one generic reconnect error | Colyseus error text; low priority |
| SRV-7 | `server/Dockerfile`: add HEALTHCHECK, update the stale "NOT BUILT" comment (or adopt `ops/docker/Dockerfile`) | `server/Dockerfile` |
| SRV-8 | decide the reconnect-token storage (memory vs `sessionStorage`) | `server/client/connection.ts` and the shipped client |
