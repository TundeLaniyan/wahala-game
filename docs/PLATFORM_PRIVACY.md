# Player platform: privacy, minors and data protection

**Not legal advice. Nothing here has been reviewed by counsel.** The Nigeria Data Protection Act 2023 (NDPA) and the Nigeria Data Protection Commission's regulations apply to processing personal data of people in Nigeria and to Nigerian controllers; the points below are the *engineering* choices made so that a legal review has a conservative starting point. Items marked **OPEN** need a founder / counsel decision before any public launch.

## 1. Data inventory (what the platform can hold)

| Data | Purpose | Kept | Notes |
| --- | --- | --- | --- |
| Player id (uuid), friend code, kind, status, created / last seen | operate the account | until deletion | pseudonymous |
| Nickname (+ comparison skeleton) | show to other players | until deletion / rename | chosen by the player; **never ask for a real name** |
| Provider subject (`sub`), provider name, masked e-mail hint (`t***@x.com`) | sign in again | until unlink / deletion | the e-mail address itself is **not stored** |
| Self-declared age band | restrict features | until deletion | no date of birth, no ID |
| Selected fighter, loadout, cross-device settings | profile | until deletion | non-identifying |
| Session rows: hashed tokens, platform, a short device label, created / last used | security, "your devices" | until expiry + 30 days | **no IP address, no user agent** stored |
| Audit events (type, actor id, subject id, small detail, request id) | security / abuse investigation | **400 days** | never tokens, credentials or free text |
| Friends, friend requests, blocks, parties and invitations (Checkpoint B) | social features | until deletion (own rows; requests lapse after 30 days, invitations after 10 minutes, parties close when empty or idle 6 h) | blocks are never shown to the blocked person |
| Presence (Checkpoint B) | show friends online | **memory only**, 90 s TTL, never in the database | a player can set it to `nobody` |
| Match participation (Checkpoint B) | non-ranked history of the player's own matches | until deletion; after deletion the row stays for the other players but names nobody (`Deleted player`) | facts only: no XP, rating, rank or reward; only the match server can write it |
| Reports and mutes (Checkpoint C) | safety | reports: **180 days after resolution** (**OPEN**); mutes until deletion | a report keeps a snapshot of the reported signal |
| Orders and entitlements (Checkpoint D) | ownership of cosmetics, refunds | entitlements until deletion; **financial records** as the tax / accounting rules require (**OPEN**) | no card data ever |

Not collected: precise location, contacts, device identifiers, advertising ids, voice recordings, unrestricted chat text (none exists).

IP addresses are used **in memory only** for rate limiting (an IPv6 address is truncated to its /64 for the bucket key) and never logged or stored.

## 2. Principles implemented in code

- **Data minimisation**: the list above is the whole schema; `tests` assert the e-mail never reaches a table or a log.
- **Guest first**: no account is needed to play; an account is needed only for features that require recoverability and accountability (text chat, voice, purchases).
- **Security**: tokens and nonces are hashed; secrets only from environment; production refuses a configuration with mock providers, dev chat, mock checkout, an in-memory database or a short secret; the log redacts token-shaped values and sensitive field names.
- **Access and portability**: `GET /v1/me` returns the account data the platform holds about the caller. A full export endpoint (all modules, machine-readable) is **planned** (a service method per module through the same hook registry as erasure), not built.
- **Erasure**: `POST /v1/me/delete` is immediate and transactional (every module registers an erasure hook); what remains is a tombstone row (id, kind, timestamps, no name, no code, no link) and audit rows that expire at 400 days. Backups are rotated on a fixed schedule (see `PLATFORM_OPERATIONS.md`): deleted data persists in backups until they expire - state this in the notice.
- **Retention jobs**: `npm run purge` (and an hourly timer in the server): expired sessions and nonces, guests idle for 180 days, audit rows over 400 days.

## 3. Younger users (**OPEN: counsel**)

The NDPA requires lawful basis for processing a child's data and, for children, the consent of a parent or guardian (the Act defers detail on age to the regulator; under Nigerian child-rights law a child is under 18). Engineering default until decided:

- Age is **self-declared** as a band (`under_13`, `13_17`, `adult`, or `unspecified`). `unspecified` and any minor band are **restricted**: no text chat, no voice, no purchases, friend requests by code only, presence visible to friends only. Moving *up* to `adult` after declaring a younger band needs a registered account that has just proved itself (a child cannot tap "I am an adult" on a guest).
- No behavioural advertising exists; the ad interface is default-deny and gated by `age_group` before any provider could be added.
- **Not built (needs a founder / legal decision)**: a verifiable guardian-consent flow, an age-assurance method, a parental dashboard, region-specific rules (UK, EU, US COPPA apply to those players if the game is distributed there; app stores add their own age-rating rules).

## 4. Controller duties that are not code (**OPEN**)

Registration with the Nigeria Data Protection Commission as a data controller / processor of major importance (threshold based), a published privacy notice (this inventory is its raw material), a designated data protection officer when required, a breach-notification procedure (the NDPA's 72-hour window to the regulator), data-processing agreements with the hosting provider and identity providers, a cross-border transfer basis if the server is hosted outside Nigeria (the latency analysis in `CITY_RUMBLE_ONLINE.md` favours London / Frankfurt over Lagos-area hosting), and a lawful retention schedule for moderation evidence.
