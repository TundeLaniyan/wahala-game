# Boss acceptance table, all seven encounters at three levels (task FU2-B3, decision FU2Q-4)

Branch `claude/wahala-fu2-qa` (from production `f7cf2ae`). Measurement only: NOTHING was rebalanced here. Weak cells are flagged for a
separate balancing task (section 3).

## How it was measured

`npx tsx scripts/boss-acceptance.ts --seeds 16 --ids <boss>` (and `--players none --agent`), seeds 101 + 17 k for k = 0..15, the REAL
campaign boss mission as `buildMissionGame` starts it (Rookie crew, the level's health and tactics, three lives, stage hazards and
convoys on, the real boss and crew bots), played end to end by two scripted players:

- **fair / slow** = `scripts/lib/bossHuman.ts` (docs/BOSS_BALANCE.md): reacts after 0.3 / 0.4 s, six / four decisions a second, only what the
  screen shows. It was built and tuned for the Oshodi relays; it plays the other districts with the same generic rules.
- **agent** = `scripts/lib/bossFight.ts` generator strategy (the harness of `npm run boss-audit`, `tests/mission-bosses-fights.test.ts`):
  a different scripted player (breadth-first plan, no reaction delay model), per-boss verbs.

Wins = the mission's own outcome `won` before its clock and with lives left (3 lives). Mean / median seconds are of the wins. Each cell is
16 fights, so a win rate has a 95 % interval of about +/- 20-24 points at 50 %: the earlier note that 8 seeds are noise (docs/BOSS_JAMMER_
PROTECTION.md) still holds at 16 for small differences. Total about 1.5 h of simulation on the shared box; every number below is a fresh run
on this branch (Oshodi Normal / Hard include decision PI8's relay guards).

## 1. The table

| boss | level | fair player: wins, mean s, lives lost | slow player: wins, mean s, lives lost | agent (generator plan): wins, median s, lives used |
| --- | --- | --- | --- | --- |
| 3 Oshodi: Oga Sunmola | easy | 16/16, 86.6, 0.1 | 16/16, 85.3, 0.0 | 16/16, 100, 0.0 |
|  | normal | 16/16, 95.0, 0.5 | 16/16, 99.1, 0.6 | 16/16, 136, 0.4 |
|  | hard | 16/16, 153.2, 0.7 | 16/16, 138.4, 0.9 | 16/16, 172, 0.9 |
| 6 Mushin: Parts Broker | easy | 15/16, 239.4, 0.6 | 16/16, 229.6, 0.7 | 12/16, 295, 0.1 |
|  | normal | 9/16, 225.7, 2.1 | 11/16, 237.9, 1.6 | 14/16, 230, 1.1 |
|  | hard | 10/16, 216.7, 2.1 | 12/16, 223.2, 1.8 | 13/16, 252, 0.9 |
| 9 Fadeyi: Garage Master | easy | 16/16, 149.6, 0.6 | 16/16, 135.6, 0.2 | 16/16, 117, 0.0 |
|  | normal | 15/16, 118.7, 1.4 | 16/16, 147.3, 0.9 | 16/16, 143, 0.1 |
|  | hard | 12/16, 131.8, 1.4 | 15/16, 164.3, 0.9 | 16/16, 118, 0.0 |
| 12 Ebute Metta: Timetable | easy | 12/16, 196.1, 1.1 | 16/16, 188.1, 0.4 | 13/16, 224, 0.0 |
|  | normal | 9/16, 173.7, 2.1 | 12/16, 195.1, 1.5 | 13/16, 226, 0.4 |
|  | hard | 4/16, 171.0, 2.4 | 7/16, 214.0, 2.4 | 15/16, 184, 0.5 |
| 15 Lagos Island: Registrar | easy | 0/16, -, 2.9 | 0/16, -, 0.6 | 15/16, 214, 0.1 |
|  | normal | 0/16, -, 2.7 | 0/16, -, 1.6 | 16/16, 246, 0.6 |
|  | hard | 0/16, -, 3.0 | 0/16, -, 1.6 | 13/16, 255, 0.9 |
| 18 Lekki: Steward | easy | 16/16, 146.9, 0.5 | 16/16, 142.3, 0.4 | 16/16, 182, 0.0 |
|  | normal | 11/16, 139.0, 2.1 | 15/16, 159.8, 1.5 | 16/16, 167, 0.3 |
|  | hard | 6/16, 155.3, 2.6 | 12/16, 148.5, 1.9 | 16/16, 173, 0.5 |
| 21 Ojuelegba: Landlord (finale) | easy | 16/16, 91.1, 0.1 | 16/16, 92.8, 0.1 | 16/16, 238, 0.0 |
|  | normal | 16/16, 90.8, 0.7 | 16/16, 88.3, 0.4 | 15/16, 217, 0.6 |
|  | hard | 16/16, 94.0, 0.9 | 15/16, 88.1, 0.9 | 15/16, 243, 0.5 |

Time limits / par (s): Oshodi 420 / 240, Mushin 420 / 270, Fadeyi 420 / 270, Ebute Metta 480 / 330, Lagos Island 480 / 320, Lekki 420 / 260,
Ojuelegba 480 / 300. "Lives lost" of the fair / slow player counts deaths in the fight (0-3).

Other columns of the same runs (windows missed per fight, boss hits per fight): every boss is hit 3.0 times in a win (three phases);
windows missed stay at 0.0-0.5 a fight. Full output: `boss-acceptance.ts` prints them.

## 2. Reading it

- **Level ordering holds for the scripted players** (Easy kinder than Normal kinder than Hard) in lives lost and, apart from noise, win rate
  for Oshodi, Fadeyi / Somolu, Ebute Metta, Lekki. It does NOT hold for the generator agent on Mushin and Ebute Metta, where Easy wins
  fewer fights than Normal (12/16 vs 14/16; 13/16 vs 13/16 vs 15/16 on Hard): those Easy losses are CLOCK losses, not deaths (`boss-audit`
  on 16 seeds: Mushin Easy 4 of 16 end `t420` in phase 2-3, Ebute Metta Easy 3 of 16 end `t480`; lives used 0.1 / 0.0).
- **Fair vs slow** is not ordered (the slow player often wins more: Mushin, Ebute Metta, Lekki, Fadeyi): it plans more fuse margin, which
  costs fewer lives; at 16 seeds this is partly noise.
- **Oshodi** (PI8 on): 16/16 at every level for both scripted players and the agent. Lives lost 0.0-0.1 (Easy), 0.5-0.6 (Normal), 0.7-0.9
  (Hard); mean time 86 -> 95-99 -> 138-153 s. That is the measured size of the PI8 change (docs/BOSS_JAMMER_PROTECTION.md section 3): small.
- **Lagos Island: the fair / slow harness cannot play it.** 0 wins and 0.0 boss hits in all 96 fights: `BossHuman` has no ledger-carry
  (evidence-run) behaviour, so its "lives lost" are the crew killing an idle player. Use the agent column for Lagos Island: 15/16, 16/16,
  13/16, median 214-255 s of a 480 s clock, lives used 0.1 / 0.6 / 0.9.

## 3. FLAGS for a separate balancing pass (not changed here)

| # | encounter | flag | evidence | confidence |
| --- | --- | --- | --- | --- |
| F1 | Ojuelegba finale (21) | **possibly trivially easy and flat across levels** | the scripted players win 15-16 of 16 on all three levels in about 90 s (par 300, limit 480; Easy 0.1, Normal 0.4-0.7, Hard 0.9 lives lost); the agent's wins take 217-243 s. Level differences are small | medium: the two harnesses disagree on the time by 2.5x; provisional content |
| F2 | Ebute Metta (12) Hard | **possibly hard to win** | fair 4/16, slow 7/16, 2.4 lives lost of 3 in both (Normal 9/16 and 12/16) | low: the agent wins Hard 15/16 (median 184 s, 0.5 lives) |
| F3 | Lekki (18) Hard | **possibly hard to win for a plain scripted player** | fair 6/16 (2.6 lives lost), slow 12/16 | low: agent 16/16 |
| F4 | Mushin (6) Normal / Hard | demanding (the hardest of the six by lives lost: 1.6-2.1 of 3) but winnable | fair 9/16 and 10/16, slow 11/16 and 12/16, agent 14/16 and 13/16 | medium: consistent over all three players |
| F5 | Mushin (6) and Ebute Metta (12) Easy | **Easy is not clearly easier than Normal for the generator agent**: it loses on the clock | `boss-audit`: Mushin Easy 12/16 (4 timeouts of 420 s), Ebute Metta Easy 13/16 (3 timeouts of 480 s); no deaths | medium: only the agent; the fair / slow players win Easy 15-16/16 on Mushin and 12-16/16 on Ebute |
| F6 | Oshodi (3) Easy, and Hard | Easy: **trivially easy by design** (16/16, 0.0-0.1 lives, 86 s): founder-approved as the kinder level, not a defect. Hard: 16/16 for all three players with 0.7-0.9 lives lost, so Hard does not yet "bite" by the scripted measure | the PI8 note already says the measured change is small; the founder's stronger-Hard request stays open | high that it is as measured; whether it feels easy is a human question |
| F7 | Lagos Island (15) | not measurable with the fair / slow harness | see section 2 | harness gap, not a game finding |

Nothing is unwinnable: every encounter is won by at least one scripted player at every level except Lagos Island by the fair / slow
harness (F7) and Ebute Metta Hard by the fair player at 25 % (F2). Nothing is trivially easy except Oshodi Easy (by design) and, with
caution, the finale (F1). A flagged cell is a reason to look, not a reason to change a number: a scripted player is much better than a
person at surviving and worse at reading a new verb (docs/BOSS_BALANCE.md "Honest limits").

## 4. Related automated acceptance (re-run on this branch)

`tests/boss-balance.test.ts`, `boss-balance-fights.test.ts`, `boss-relay-guard.test.ts`, `boss-relay-scope.test.ts` (FU2),
`mission-bosses.test.ts`, `mission-bosses-fights.test.ts`, `mission-oshodi.test.ts`, `campaign-finale-playthrough.test.ts`,
`campaign-finale-data.test.ts`, `campaign-bosses-presentation.test.ts`, `raid-ai-isolation.test.ts`: results in the task report.

## 5. Not established

- Nobody played these on a phone except Oshodi Easy (founder PASS). Every number is a scripted player against the real bots.
- 16 seeds are a screen, not a measurement of small effects. The finale and Lagos Island cells depend on which harness is used.
- Time limits were not compared with pace for a human; the F5 clock losses of the agent may not occur for a person.
