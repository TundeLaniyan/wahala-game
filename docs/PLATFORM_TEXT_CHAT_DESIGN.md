# Unrestricted text chat: requirements before anyone builds it

**Decision needed from the founder: do we ship free text at all?** Preset quick chat covers the coordination a bomb-and-blast match needs. Free text brings abuse, moderation cost, legal duties and app-store obligations. This document lists what must exist first. A **development-only** party chat is implemented (`comms/chat.ts`, flag-gated, refused in production) to exercise the seams; it is not a feature.

## 1. Scope ladder (each step adds risk; stop where the product need ends)

1. Preset signals only (**shipped in this branch**).
2. Party text between **adult registered friends** (small, known groups; mute / block / report; 24 h retention).
3. Team text during a match (strangers; needs live moderation and a stricter filter).
4. Match-wide / global text: **do not build.**

Minors, guests and accounts with no declared age get none of it at any step (`capabilitiesFor`).

## 2. Moderation requirements (all of them, before step 2 goes public)

| Requirement | Why | Today |
| --- | --- | --- |
| Pre-send filter: links, contact details, repeated characters, operator deny-list with look-alike and character-swap folding | stops the obvious and the contact-grooming vector | dev version |
| A classifier or vendor for abuse / sexual / self-harm content in English **and** Nigerian Pidgin, Yoruba, Igbo, Hausa and code-switching | a word list alone fails on spelling variants, tone and mixed languages; accuracy in these languages is unproven for most vendors | **none** (needs evaluation on real Lagos chat, with native-speaker review) |
| Reporting in one tap, block, mute | app-store and legal baseline | built |
| Human review queue with response targets (for example severe: 1 h, normal: 24 h), a second reviewer for suspensions, appeals | decisions affect real people | admin API only; no staff, no SLA |
| Escalation: child-safety content to the legal contact and the relevant authority; threat of harm | legal duty | **undefined** |
| Transparency: published rules, the action taken is told to the reporter in general terms | trust | `GET /v1/me/reports` shows status only |
| Audit trail of every moderator action | accountability | built (ids only) |

## 3. Retention (proposal; **counsel to confirm**)

| Data | Keep | Reason |
| --- | --- | --- |
| Message lines | 24 hours rolling, deleted with the party and with the account | enough for a report, no archive of private conversation |
| A reported snapshot (the lines the reporter saw) | 180 days after resolution, then deleted; held longer only while an investigation or a lawful request is open | evidence |
| Moderator decisions | audit trail 400 days | accountability |
| Who spoke to whom (metadata) | not stored beyond the line's life | minimisation |

Never log message text; never put it in the audit trail (tested). Backups hold deleted lines until they rotate: the privacy notice must say so.

## 4. Legal and store obligations to verify against the current texts

- **Nigeria Data Protection Act 2023**: lawful basis for processing chat content, children's data, breach notification, cross-border transfer if moderation is outsourced abroad (`PLATFORM_PRIVACY.md`).
- **Apple App Store Review Guidelines (user-generated content)** and **Google Play's user-generated content policy** require, in substance: filtering of objectionable content, a way to report content and block abusive users, timely action, and published contact information. Check the current wording before submission.
- A **cybercrimes / online-harms** review for Nigeria and for each country the game is distributed in.

## 5. Acceptance checklist to turn step 2 on

1. Founder decision recorded (DECISIONS.md) and counsel sign-off on retention, minors and notice.
2. A moderation vendor or in-house process evaluated on Pidgin / Yoruba / Igbo / Hausa samples, with measured false-positive and miss rates.
3. Named moderators, an on-call path, a written severe-incident procedure, an appeals route.
4. `TextModerator` implementation behind the existing interface (async, with a timeout that fails **closed**: a down classifier means no text, not unmoderated text).
5. Load test of the rate limits with abusive scripts; a kill switch per feature (config, no deploy) and per player (`comm_restrictions`).
6. The production config validator updated deliberately (it currently refuses the dev flag outright).
