# Abuse analysis: three colluding accounts silencing a player

**Finding (reproduced by a test, `comms.test.ts` "collusion"):** with automatic restriction on, three different accounts that share a party with a target can each file one report and the platform silences the target's **preset signals** for one hour. Nothing else about the target changes.

## What an attacker needs and gets

| | |
| --- | --- |
| Needs | three accounts (guests are free and unlimited per address up to the creation limit) **and** the target in the same party (or, once public matches carry tickets, the same match), because a report must name a real interaction (`verifyContact`). The target must therefore have joined a party the attackers lead or belong to |
| Gets | the target cannot send preset quick-chat / emotes for 1 hour (`comm_restrictions`, kind `signals`, source `auto`). No effect on: the account, sessions, friends, parties, matchmaking, the match itself, results, purchases |
| Repeatable? | yes, while the target keeps entering contexts the attackers share, within the 24 h window of distinct reporters; each reporter is capped at 20 reports a day |
| Cost to the victim | low (presets are not needed to play); but it is an unjustified penalty and a harassment tool |
| Detectability | high: three reports from accounts created minutes ago, all in one party, same category, are visible in the moderator list (`distinctReportersLast30d`, reporter dismissal history) |

## Mitigations now in the code

1. **The automatic action is OFF by default in production** (`PLATFORM_AUTO_RESTRICT`, default `true` only in development / test). Reports still reach the moderator queue.
2. **A moderator dismissal undoes an automatic restriction** when the remaining distinct, non-dismissed reporters fall below three (it previously stayed until expiry).
3. Unchanged: real-contact requirement, one open report per reporter / target / place, 20 reports a day, 1 hour duration, audit rows, one-click lift (`/admin/v1/players/:id/restrictions/lift`), the victim is told how long.

## Options if the founder wants the automatic action in production

| Option | Effect | Cost |
| --- | --- | --- |
| Keep it off; human review only | removes the attack | needs moderators and a response target |
| Count only reporters with some standing (registered, or account older than N days, not in each other's friend list, not created from the same address window) | colluders must invest more | guests are the main player base; needs data to choose N |
| Weight by reporter history (a reporter whose reports are mostly dismissed counts for less) | self-correcting | needs history; the moderator list already shows it |
| Make the action a flag for review, not a silence | nothing is taken before a person looks | slower relief for real harassment |

**Recommendation:** ship production with the automatic action off until at least one moderator process exists; revisit with real report data.

## Related unresolved items
Mass-report campaigns against a *name* are already blocked (a stranger cannot be reported). A colluding group can also block / mute a victim out of their parties: that is the legitimate right of each member and not an abuse of the system.
