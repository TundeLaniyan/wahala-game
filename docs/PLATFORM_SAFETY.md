# Player platform: communication, safety and moderation (Checkpoint C)

Principle: **in production a player can only send things the game already contains.** There is no free text and no audio path. Everything below makes the preset vocabulary hard to abuse and gives players and moderators the tools a social game needs. Designs for unrestricted text and for voice are separate documents (`PLATFORM_TEXT_CHAT_DESIGN.md`, `PLATFORM_VOICE_DESIGN.md`); neither is deployed.

## 1. What exists and works

| Feature | Behaviour | Test |
| --- | --- | --- |
| Preset vocabulary (`GET /v1/comms/signals`) | 21 fixed ids: `chat.*` quick messages, `ping.*` team pings, `emote.*` free emotes. Ids are stable; labels are English placeholders the client localises (Nigerian Pidgin copy is the founder's to write: nothing here imitates it). | `test/comms.test.ts` |
| Party signals | members send / read; unknown ids, free text, match-only pings, non-members refused; the same signal twice within 2 s is a flood (429 + retry time); history capped at 200; names are read when displayed so one player always shows one name | same |
| Match relay filter (`POST /internal/v1/comms/filter`, signed) | the match server asks "which of these may receive this sender's ping / emote / quick message" before relaying; removes anyone who blocked or muted the sender, inactive accounts, the sender; refuses a restricted sender; `text` and `voice` need **adult registered** accounts on both ends | same |
| Mute | you stop receiving that player's signals / text / voice; they are not told; friendship and party membership unchanged | same |
| Block (Checkpoint B) | everything a mute does plus: unfriend, no requests, no invitations, no shared party, invisible to each other's search by code | `social`, `parties` |
| Report | only about someone you really met (same party, same match, a friend request, a friend); idempotent per reporter / target / place; 20 a day; a bounded snapshot of what the reporter saw (signal ids, dev chat lines) and the name at that time; 200-character note, sanitised | `comms` |
| Restrictions | time-limited bans on `signals`, `text` or `voice`; **automatic** (3 different reporters in 24 h silence signals for 1 h: placeholder, reversible, off by default in production) or by a moderator (24 h) | `comms` |
| Moderator API (`/admin/v1/*`, bearer `PLATFORM_ADMIN_TOKEN`, off unless set) | list reports with the target's distinct-reporter count and each reporter's dismissal history (to spot false-report abuse); dismiss / warn / restrict 24 h / suspend (revokes every session); lift restrictions; every action audited | `comms` |
| Capabilities | text and voice only for **adult registered** accounts; minors, guests and undeclared ages never send or receive them (tested both directions) | `comms`, `comms.chat` |
| Dev text chat | `PLATFORM_DEV_TEXT_CHAT=1`, refused by config validation in production, routes absent otherwise; link / e-mail / phone / repetition / deny-list (with look-alike and "l33t" folding) moderation; 24 h retention | `comms.chat` |
| Voice authorisation | the platform's eligibility layer (`VoiceService`) and a `VoiceGateway` seam; the only gateway answers "not available yet" (503); no microphone, socket or peer connection exists | `comms` |

## 2. Rate limits and abuse safeguards

| Surface | Limit | Notes |
| --- | --- | --- |
| Preset signal sends | 8 burst, 40 / min per player, plus 2 s per identical signal | the match server relays pings itself: it should apply its own per-seat limit as well |
| Reports | 5 burst, 5 / min, 20 / day per player | a report needs a real interaction with the target |
| Friend requests / party invitations | 10 burst, 10 / min; 20 pending requests; 16 pending invitations per party | |
| Party code guesses | 6 burst, 6 / min per player; one answer for every failure | 31^8 codes |
| Everything anonymous | 200 burst, 600 / min per address (IPv6 /64); guest creation 5 burst, 6 / min | tested with and without a trusted proxy |

## 3. Known gaps and risks (nothing is hidden)

- **Collusive reporting**: three accounts that really shared a party can silence a player's presets for an hour. Mitigations: real-contact requirement, short duration, audited, one-click moderator lift, reporter dismissal history. A reputation-weighted threshold needs data.
- **Name abuse is not a preset**: a nickname is free text (2-24 chars). The shared rule blocks look-alikes, markup, bot / staff impersonation; offensive-word filtering needs an operator deny-list (`PLATFORM_CHAT_DENYLIST` applies to dev chat; a nickname deny-list hook exists in `checkNickname`, empty by default) maintained by native speakers (English, Pidgin, Yoruba, Igbo, Hausa).
- **No human moderation exists**: the admin API is the tool; staffing, SLAs, an appeals path and a transparency policy are founder / legal decisions.
- **Match-time evidence**: a report about a match keeps only the match id. The match server owns what happened in the match; it would need to retain a short action log to back reports.
- **Presets can still annoy** (spam, "targeting" a player with pings): per-player rate limits, mutes and blocks are the controls. In-match pings are relayed by the match server: its call to the filter is part of the handoff (`PLATFORM_MATCH_HANDOFF.md`) and is **not wired yet**.
- **In-memory rate limiting** (one instance); a shared store is needed with more than one instance.

## 4. Update: automatic restriction (see `PLATFORM_COLLUSION_ANALYSIS.md`)
The automatic one-hour silence after three different reporters is **off by default in production** (`PLATFORM_AUTO_RESTRICT`), and a moderator's dismissal lifts it. The "collusive reporting" risk above is therefore a moderator-queue risk in production, not an automatic penalty.
