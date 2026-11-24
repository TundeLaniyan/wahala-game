# Records Vault night raid: is the PI7 reveal grace an exploit? (task FU2-B1, decision FU2Q-1)

Branch `claude/wahala-fu2-qa` (from production `f7cf2ae`). No `src/` change: the question is answered by measurement, and the answer
is **keep decision PI7 as shipped**. New: a night-aware probe, two exploit bots, a regression test.

Question (from docs/CLASSIC_RAID_REAR.md section 5): the PI7 grace also applies to the night Records Vault's contact rule
(probe: engaged within 0.75 s on Normal 54 % -> 30 %), and the "other" cause of the night detections was never traced. Can a player
walk up behind (or into the torch beam of) a turning guard, lay a generator and leave without being seen, repeatedly and for free,
and so trivialise the raid on Easy / Normal?

## What the grace does at night (read from the code)

`systems/territory.ts` `noticeOf` is the one place. The grace (`classicRaid.revealGraceTicks` Easy 66, Normal 54, Hard 0) is set when a
calm guard's own turn reveals a player who was out of its view the tick before. At night two things differ from the day:

- the SIGHT reaction is the night's own (`nightNotice.reactTicks`: Easy 20, Normal 15, Hard 12 ticks at 1-2 tiles, growing with
  distance); `held` is not applied to it (`needed = night ? night.reactTicks : max(noticeTicks, held)`);
- the instant contact notice (`near` = `night.close`, Chebyshev 1 inside the near ring) is what the grace switches off for its 54 / 66
  ticks.

So at night the grace buys: (a) a player who is now IN the guard's one-tile-wide torch (right in front of it after an about-face):
the torch reaction, 15 / 20 ticks (0.25 / 0.33 s), instead of instant; (b) a player at its shoulder, at contact but OUTSIDE the torch
(Normal only: Easy's near ring is `front`): the full 54 ticks (0.9 s). Nothing else moves; Hard is untouched.

## The probe (reproducible)

`scripts/night-window.ts` on `scripts/lib/nightProbe.ts`: the REAL Records Vault night mission (`buildRaidGame`, the real enemy bots, the
real territorial minds), every 45 ticks over the first 40 s, 6 seeds, both hall wardens. At each moment the human appears on the tile
directly behind a calm warden that nobody could notice him on, lays a generator and stands still for 90 ticks; one run gives the tick
of the first engagement, so "within 0.5 / 0.75 / 1 / 1.5 s" is read off the same windows. Every engagement is traced to its rule by
replaying `noticeOf` on that tick's state with the mind as it was (torch sight, contact, close, hit, ally, noise) - this is the
classifier the old harness lacked. `PI_GRACE=0` is production before PI7 (`--grace 0`); `--day` is the control (the same board with the
night detection removed, i.e. the day rules with the full grace).

Engaged by 0.5 / 0.75 / 1.0 / 1.5 s, standing still behind the warden (a window is "revealed" when its turn put him in its notice):

| level | grace | windows (revealed) | all windows 0.5 / 0.75 / 1 / 1.5 s | revealed windows only |
| --- | --- | --- | --- | --- |
| Easy | off (before) | 258 (246) | 35 / 49 / 67 / 95 % | 37 / 51 / 71 / 100 % |
| Easy | PI7 | 258 (246) | 14 / 30 / 44 / 81 % | 15 / 32 / 46 / 85 % |
| Normal | off (before) | 282 (240) | 36 / 53 / 74 / 85 % | 43 / 60 / 85 / 98 % |
| Normal | PI7 | 282 (222) | 17 / 34 / 48 / 78 % | 21 / 41 / 59 / 97 % |
| Hard | off | 305 (277) | 84 / 88 / 90 / 91 % | 92 / 97 / 99 / 100 % |
| Hard | PI7 (none) | 305 (277) | identical | identical |
| Normal, day-rule control | off | 305 (263) | 33 / 49 / 69 / 82 % | 38 / 57 / 78 / 93 % |
| Normal, day-rule control | PI7 | 305 (263) | 0 / 4 / 13 / 46 % | 0 / 5 / 15 / 52 % |
| Easy, day-rule control | PI7 | 276 (252) | 0 / 0 / 0 / 33 % | 0 / 0 / 0 / 33 % |

Reading:

- **The night grace is a delay of the torch reaction, not a way out.** Normal revealed windows: 98 % before and 97 % after are engaged
  by 1.5 s. The 0.5 s figure halves (36 -> 17 %), the 1.5 s figure moves by 7 points. A player who stands still is caught.
- **It is far weaker than the day grace.** The same board with the day rules would give Normal 0 / 4 / 13 / 46 %; the night gives
  17 / 34 / 48 / 78 %. The "54 % -> 30 %" of the earlier report was this torch reaction (15 ticks) added to the instant notice.
- **The untraced "other" is torch sight.** After PI7, 221 of 221 Normal engagements are `sight`, "torch react 15" at Manhattan 1; before it,
  223 `contact` and 16 `sight`. The old classifier compared the notice counter with the day's `noticeTicks` (30), so a torch
  reaction of 15 fell through to "other" (the 10 of the earlier note).
- Hard: the numbers are the same with and without the grace.

## Can the window be used? (the careful, watchful player)

Same real mission, but the human leaves on a reaction (`raid-dwell.ts --react 18 / 24`: he steps out of the cross after being watched
for 0.3 / 0.4 s; 200-tick dwell, 4 seeds, every 60 ticks): CLEAN KILLS (the guard dies to the blast and nobody was alerted before
it) are **0 % before and after PI7 at every level**; the engaged share before the blast Easy 97 -> 88 %, Normal 92 -> 84 %, Hard 93 %
(unchanged). With a 0.3 s reaction on Normal the torch reaction (15 ticks) is faster than he is, and Easy's (20) is on the edge: he
cannot use a window he cannot see coming.

The scripted careful stalker over the whole approach (`raid-stalk.ts --raids recordsVault`, 36 attempts a level, steps only onto
tiles nobody can notice him on) is identical with and without the grace: Easy planted 19, detected before 2; Normal planted 12,
detected 0; Hard planted 6, detected before the plant 18. Neither build produces a clean kill from it (1 guard in 108 attempts).

## Whole mission, repeated (`scripts/night-exploit.ts`, 24 seeds a cell, grace off -> PI7)

The fair-fight scripted human plays everything; two exploit bots (`scripts/lib/nightExploit.ts`) take over when a calm guard is within 16
tiles: `careful` walks only on tiles nobody can notice him on, `greedy` (the grace farmer) takes the shortest way whether he is watched or
not; both lay behind the guard, step out after 18 ticks of being watched (30 in a second run: no difference) and leave the cross.

| level | policy | completed | alerts per run, off -> PI7 | health lost / lives lost per run | blast kills |
| --- | --- | --- | --- | --- | --- |
| Easy | fair-fight | 24/24 both | 6.75 -> 6.75 | 0.00 / 0.00 | 1.8 |
| Easy | careful = greedy | 24/24 both | 7.54 -> 5.75 | 0.00 / 0.00 | 2.0 |
| Normal | fair-fight | 24/24 both | 8.08 -> 8.08 | 0.00 / 0.00 | 3.5 |
| Normal | careful = greedy | 24/24 both | 7.08 -> 6.08 | 0.00 / 0.00 | 3.5 |
| Hard | fair-fight | 24/24 both | 10.08 -> 10.08 | 0.13 / 0.00 | 1.2 |
| Hard | careful = greedy | 24/24 both | 11.63 -> 11.63 | 0.00 / 0.04 | 1.9 |

The exploit bots gain about one to two alerts a run on Easy and Normal and nothing else: the fair-fight bot already completes every
run with no health lost (the scripted fair player is far better than a person; the raid is not trivialised BY the grace, the scripted
player does not lose health to it at all), and `careful` and `greedy` are identical because the vault's single-file halls leave one way
to the guard's back. The exploit bots make exactly one attempt a run on all three levels (24 of 24 seeds, planted once each); why no second window opened
was not traced (a blast in these halls is heard by the neighbour, and the fair-fight human takes over whenever anyone hunts him), so
"cannot be farmed in sequence" is what the harness saw, not a proven property.

## Decision (FU2Q-1)

Keep PI7 as shipped. No night exemption and no per-raid flag: the night effect is already bounded by the night's own torch reaction
(Normal 15, Easy 20 ticks, Hard none), nobody who stays behind a turning guard stays hidden (97-100 % engaged by 1.5 s), clean kills do
not rise, and the exploit bots gain nothing that changes completion, health or lives. The one full-length window at night is the
Normal shoulder case (54 ticks, 0.9 s): it is the intended "see it turn, step away" window of PI7, and a player who stays is noticed
the first tick after it ends. If the founder finds the night too lenient on his phone, the levers are `NIGHT_SIGHT_LEVELS[level]
.reactNearTicks` (the torch reaction) or a night override of `revealGraceTicks` in `raidTacticsFor` - neither is built.

`tests/raid-night-rear-grace.test.ts` (7 tests) pins it on the real vault board: production (grace 0) notices the about-face on the very
tick; PI7 adds exactly the torch reaction in the torch (15 / 20) and exactly the grace plus one tick at the shoulder (Normal); a 0.3 s
step-out does not beat the Normal torch; a revealed player who stays is engaged by 66 ticks at every level; Hard is the same with and
without the grace.

## Not established

- Scripted reactions (0.3 / 0.4 s) stand in for a person; a founder phone run of the night raid on Normal is the acceptance gate.
- The probe stands the human still behind a warden; it does not model a player who times the approach to a guard's turn by eye. The
  mission-level exploit bots do approach by shortest path, and the careful stalker by safe tiles, but neither is a human.
- Only the two hall wardens are probed (the later waves open after doors); the archive guards carry the same torch rule.
- The harness cannot measure what the picture tells a person: a guard's turn is still unannounced (docs/CLASSIC_RAID_REAR.md section 5).

Commands: `npx tsx scripts/night-window.ts [--grace 0] [--day] --seeds 6`, `npx tsx scripts/night-exploit.ts --seeds 24 [--grace 0]`,
`PI_GRACE=0 npx tsx scripts/raid-stalk.ts --raids recordsVault`, `npx tsx scripts/raid-dwell.ts --raids recordsVault --dwell 200 --react 18`.
