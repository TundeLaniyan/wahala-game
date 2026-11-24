# Human acceptance plan for the 21 campaign missions (task FU2-B4, decision FU2Q-5)

Branch `claude/wahala-fu2-qa` (from production `f7cf2ae`). For a phone tester (the founder or a helper). It lists what the repository
already proves by machine, what only a person can still judge, and an ordered, time-boxed plan. Nothing here is claimed "human-verified"
unless a person played it on a device; everything else is SIMULATED (scripted players with ordinary intents against the real enemy bots)
or BROWSER (Playwright on software GL, scripted, no person).

Reading the evidence columns: `SIM` = a Vitest scripted playthrough / harness against the real bots; `E2E` = a Playwright spec on a real
page; `Lab` = a Test Lab entry (`?testlab=1`, docs/TEST_LAB.md) the founder has played; `FU2` = the new checks of this task.

## 1. The 21 missions (from `allSections()`, `src/campaign/content/sections.ts`)

Limit / par are the mission's own clock in seconds (`fieldDefs.ts`, `mission/defs.ts`, `finaleDefs.ts`, `raid/defs`); all missions have 3 lives.

| # | id | kind (board) | limit / par | class | why |
| --- | --- | --- | --- | --- | --- |
| 1 | oshodi.approach | field (Orita Gate) + depot door raid | 360 / 120 | HIGH-A | first mission; Dispatch Depot raid (PI7); founder's Normal rear-approach complaint |
| 2 | oshodi.railEdge | field (Railside) | 600 / 270 | ROUTINE | field only |
| 3 | oshodi.boss | boss (Oshodi dispatch corridor) | 420 / 240 | HIGH-A | PI8 relay guards (Normal 1, Hard 2); the only boss with a balance |
| 4 | mushin.approach | field (Parts Row) + storeroom door raid | 480 / 175 | HIGH-A | Parts Storeroom raid (PI7) |
| 5 | mushin.market | field (Market Hall) + back-stall bonus raid | 600 / 255 | HIGH-A | Parts Storeroom raid (PI7); 40 s lorry-bay hold |
| 6 | mushin.boss | boss | 420 / 270 | HIGH-B | boss; unchanged by PI7 / PI8 (digest-identical, docs/BOSS_RELAY_SCOPE.md) |
| 7 | fadeyiSomolu.approach | field (Toll Corridor) + tool-shed door raid | 420 / 150 | HIGH-A | Junction Tool Shed raid (PI7) |
| 8 | fadeyiSomolu.junctions | field (Side Routes) | 600 / 255 | ROUTINE | field only |
| 9 | fadeyiSomolu.boss | boss | 420 / 270 | HIGH-B | boss |
| 10 | ebuteMetta.approach | field (Freight Yard) + signal-shed door raid | 540 / 300 | HIGH-A | Junction Tool Shed raid (PI7); 25 s cabin hold |
| 11 | ebuteMetta.railYard | standalone raid (Goods Yard) | 240 / 160 | HIGH-A | raid (PI7), belts and shipments |
| 12 | ebuteMetta.boss | boss | 480 / 330 | HIGH-B | boss |
| 13 | lagosIsland.approach | field (Ledger Lanes) + annexe door to the NIGHT Records Vault | 420 / 210 | HIGH-A | the one night raid (flashlight, torch detection, PI7 at night: docs/NIGHT_RAID_REAR_REVIEW.md) |
| 14 | lagosIsland.press | field (Press Yards) | 480 / 240 | ROUTINE | field only |
| 15 | lagosIsland.boss | boss | 480 / 320 | HIGH-B | boss |
| 16 | lekki.approach | field (Estate Gate) + standby-plant door raid | 480 / 240 | HIGH-A | Standby Plant raid (PI7) |
| 17 | lekki.estate | field (Inner Estate) | 420 / 180 | ROUTINE | field only |
| 18 | lekki.boss | boss | 420 / 260 | HIGH-B | boss |
| 19 | ojuelegba.return | field (South Streets), no door raid | 420 / 150 | HIGH-B | finale chapter, provisional content (FN8), trap-the-patrols verb |
| 20 | ojuelegba.junction | field (Bus Interchange): hold the stop against waves | 480 / 240 | HIGH-B | finale, provisional, wave-hold verb |
| 21 | ojuelegba.boss | boss (control points) | 480 / 300 | HIGH-B | finale boss, new `controlPoints` verb, provisional |

HIGH-A = touched by this release's rules (PI7 raid reveal grace, PI8 relay guards) or the night raid: play first and carefully.
HIGH-B = bosses and finale not changed by PI7 / PI8 but with new or boss mechanics and no human balance record in the repository: play
second. ROUTINE = a plain field mission with no raid and no boss: a quick smoke pass.

## 2. What the machine already proves, and the gap per mission

Shared evidence for every field mission: `tests/field-districts-{oshodi,mushin,fadeyi,ebute-lagos-lekki}.test.ts` (data: posts / waypoints /
equipment on open floor and reachable; a scripted generator-first playthrough with the real bots at Easy / Normal / Hard, Easy >= Normal >=
Hard, the seen-generator escapes), `tests/field-missions.test.ts` + `field-nodes` + `field-sector-legs` (every leg kind, the door raising a
raid, lives, clock), `tests/campaign-world.test.ts` + `campaign-kit` (each campaign board), `tests/mission-regression.test.ts` +
`raid-ai-isolation.test.ts` (pinned digests), `e2e/campaign-areas.spec.ts` (the Oshodi, Mushin, Fadeyi / Somolu, Lekki and Ojuelegba field areas load through the real
campaign, are drawn, their gates open on their legs; desktop and phone project; Ebute Metta and Lagos Island are not in it), `e2e/campaign-sectors.spec.ts` + `campaign-camera.spec.ts` (the follow camera on a
740 x 360 phone), `e2e/mission-guidance.spec.ts` + `mission-presentation.spec.ts` (briefing, markers, the door hands over to the raid
with the raid held until START). Shared evidence for every raid: `raid-*.test.ts` (flow, cargo, belts, layouts, AI, combat acceptance,
the PI7 rear reveal on the depot), `e2e/raid-render.spec.ts`, `e2e/campaign-expansion-smoke.spec.ts` (one real raid in a browser).
Shared evidence for every boss: `tests/mission-bosses.test.ts` + `mission-bosses-fights.test.ts` (a generator-first player wins every boss
on Normal; punching alone never exposes one), `campaign-bosses-presentation.test.ts`, `scripts/boss-audit.ts`; the FU2 table
(docs/BOSS_ACCEPTANCE_FU2.md) adds win rate and time at all three levels with 16 seeds.

| # | mission-specific automated evidence | mission-specific GAP (not proven by any listed check) |
| --- | --- | --- |
| 1 | the only mission with a full-flow browser test (checkpoints -> depot door -> raid -> back -> Orita gate -> result: `campaign-areas`), a human-model scripted flow with input latency (`campaign-reliability-oshodi`), `scripts/oshodi-flow.ts`, the Lab entries Campaign field mission, Classic Campaign Raid, Classic rear ambush, One-hit lethality (founder phone result: 19 of the Lab's 20 entries PASS) | the PI7 about-face in this raid on Normal on a real phone is the one open item (founder item 3 in docs/FOUNDER_ACCEPTANCE_FU2.md); the field-to-raid hand-off on a phone |
| 2 | `field-districts-oshodi` both missions on three levels; `campaign-areas` loads Railside | no human run recorded; the rail-lane warnings are judged by eye only |
| 3 | `boss-balance*`, `boss-relay-guard`, `boss-relay-scope` (FU2), `mission-oshodi`, `campaign-reliability-oshodi`; Lab "Boss encounter": Easy founder-approved on phone; BB1-BB7 balance measured | Normal and Hard on a phone (founder item 4); whether the relay guards read as "protection" |
| 4 | `field-districts-mushin`; `campaign-areas` loads Parts Row; Parts Storeroom raid tests (layout, cargo, AI) | the storeroom door raid played on a phone; no human play of Mushin recorded |
| 5 | `field-districts-mushin`; `campaign-areas` loads Market Hall | the 40 s lorry-bay hold and the back-stall bonus door on a phone |
| 6 | `mission-bosses-fights` (generator player wins Normal), digests identical to production; FU2 acceptance table | Mushin's boss has never had a human balance pass; the scripted "fair" player is a poor stand-in here (docs/BOSS_ACCEPTANCE_FU2.md) |
| 7 | `field-districts-fadeyi`; `campaign-areas` loads Toll Corridor; Junction Tool Shed raid tests | the tool-shed raid on a phone |
| 8 | `field-districts-fadeyi`; `campaign-areas` loads Side Routes | no human run recorded |
| 9 | as 6 | as 6 |
| 10 | `field-districts-ebute-lagos-lekki` (scripted full playthrough with the door answered by `resolveRaid`); `campaign-world` + `ebute-west.test.ts` (the board in sim); NOT in `campaign-areas` | the 25 s signal-cabin hold and the shed raid on a phone |
| 11 | raid layout / belts / cargo tests; `e2e/raid-render`; belts and shipments are the only moving hazards of this raid | the belts and shipment warnings on a phone; not launchable from the Test Lab (campaign only) |
| 12 | as 6 | as 6 |
| 13 | `raid-light`, `raid-night-detection`, `raid-night-rear-grace` (FU2), `e2e/night-raid.spec.ts` (loads dark, flashlight follows, the dark hides an enemy, Low = High lit tiles), Lab "Records Vault, night raid" and "Flashlight and detection" (founder PASS) | the mission's own door hand-off into the dark raid; readability of the dark on a phone after PI7 (the Lab entry is the raid alone, not entered from this mission) |
| 14 | `field-districts-ebute-lagos-lekki`; Lagos Island's boards are built and tested in sim and `campaign-world`, but NOT opened in `campaign-areas` | the Lagos Island boards in a real browser |
| 15 | as 6 | as 6 |
| 16 | `field-districts-ebute-lagos-lekki`; `campaign-areas` loads Estate Gate; Standby Plant raid tests | the plant raid on a phone |
| 17 | `field-districts-ebute-lagos-lekki`; `campaign-areas` loads Inner Estate | no human run recorded |
| 18 | as 6 | as 6 |
| 19 | `campaign-finale-playthrough` (majority of 6 seeds on Normal), `campaign-finale`, `finale-audit.ts`; `e2e/campaign-finale.spec.ts` (mission 19 starts on its own area, desktop and phone) | provisional content (the Landlord's name is a working title); no human play |
| 20 | `campaign-finale-playthrough` (junction held, waves contest the stop; seed 2 times out on Normal: 9 of 10) | the wave pressure on a phone; the known seed-2 timeout |
| 21 | `campaign-finale-playthrough` (the generator plan wins on all levels), `campaign-finale-data`, `boss-acceptance` (FU2); a new boss verb | no human play; no balance record comparable to BB1-BB7 |

Gaps common to all: nothing in the list is a person on a phone except the Lab entries the founder has played (19 PASS, 1 NEEDS
IMPROVEMENT: the Normal raid rear approach, addressed by PI7 and still unconfirmed by hand), and the whole-campaign save path across 21
missions is exercised in `campaign-progression-wide` and `e2e/campaign-progression.spec.ts` by staged saves, never by one continuous play.

## 3. Phone plan (one tester, about 3 h 30 min of play, in 3 sessions plus a 10-minute save check)

Practical constraint: the campaign unlocks in order (Oshodi, Mushin, Fadeyi / Somolu, Ebute Metta, Lagos Island, Lekki, Ojuelegba), and
only the Oshodi missions and the depot / vault raids have a Test Lab shortcut. A fresh save plays in order; a tester with an existing
mid-campaign save skips what is cleared. Use Normal unless noted (the default). Between missions, do not read the briefing twice; the
time boxes below include a retry.

General pass / fail for EVERY mission (all must hold; otherwise log it):
1. it starts from the briefing with the right board, the objective card names what to do, the minimap and objective marker work;
2. the HUD rail beside the board never covers the board; nothing text-like floats over the arena;
3. every enemy attack is readable before it lands (a wind-up cue), and the "!" appears when a guard notices you;
4. it can be won, or lost for a reason you can name (a mistake), within the limit; the result screen and Parts / Ring-weakened line show;
5. no freeze, no stuck "DOWN - Back in 1", the frame rate is playable (the Lab fps line `?fps` if it stutters).
Screenshot for every mission: the briefing, one mid-play shot with the HUD, the result screen. Note device, orientation, quality.

### Session A (about 100 min): the release's own changes, HIGH-A first

| order | mission | box | look for | pass | fail | screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | 3 oshodi.boss, Normal then Hard | 12 min each, 2 tries | one backup fighter (Normal) / two (Hard) standing at the relay you walk to while the boss is shielded; they return to the booth when he is exposed | defenders are there and the fight is winnable by an ordinary player in 3 lives; Hard visibly busier than Normal; Easy unchanged (a guard-free approach) | no defender seen at a relay on Normal / Hard; or Normal unwinnable (lost 3 lives twice, an unreadable cause) | the relay with a guard beside it; the exposed-boss window |
| A2 | 1 oshodi.approach (Lab "Terminal Approach" or the campaign) | 8 min | the depot raid: walk up behind a patrolling guard, lay a generator, step away | the guard's about-face does not catch you at once: you see it turn and have about 1 s to step out of its view (Normal); a quarter turn the same | you are alerted on the very tick it turns while it faced away | the moment after a guard turns |
| A3 | 13 lagosIsland.approach with its annexe door: the night Records Vault | 12 min | flashlight beam, guard torch cones, the dark room hiding enemies, contact in the dark | you are noticed in a torch within about a quarter of a second, never from behind and never from the dark; one blast defeats a warden; the dark is readable | noticed from behind or outside every torch; or the dark hides the maze and cabinets | a torch swing; the vault corridor |
| A4 | 11 ebuteMetta.railYard | 6 min | belt shipments' warnings, guards at the cargo, extraction | warnings precede every shipment; raid winnable | a belt hit with no warning | the belt lane with a warning |
| A5 | 4, 5, 7, 10, 16 (their door raids; play the field mission up to the door, raid, then leave the rest for Session C style smoke) | about 10 min each: the field part to the door, then the raid | each raid's rear approach and one-blast kill | as A2; each raid ends in a result | a raid that cannot be entered or left | one shot per raid |

### Session B (about 80 min): bosses and finale, HIGH-B

| order | mission | box | look for | pass / fail |
| --- | --- | --- | --- | --- |
| B1 | 6 mushin.boss | 10 min | the restocking runners and the stack objective; the exposed window | winnable in 3 lives; the objective is clear; FAIL if the flagged cells of docs/BOSS_ACCEPTANCE_FU2.md reproduce (unwinnable, or won with no risk) |
| B2 | 9 fadeyiSomolu.boss | 10 min | the three route marshals at the toll boxes | as B1 |
| B3 | 12 ebuteMetta.boss | 10 min | the timed windows and the yard crew | as B1 |
| B4 | 15 lagosIsland.boss | 10 min | carrying a ledger to the drop while auditors hunt the carrier | as B1 |
| B5 | 18 lekki.boss | 10 min | the signalled order and the panel defenders | as B1 |
| B6 | 19, 20, 21 ojuelegba | 10 min each | the trap-the-patrols leg, the held junction, the control points | winnable; the objective of each leg is clear; note any wording that reads as final canon (it is provisional) |

### Session C (about 25 min): ROUTINE smoke pass

Missions 2, 8, 14, 17: 6 min each. Only the general pass / fail list above; two minutes of free play, then the objective. Pass = starts,
plays, ends; fail = freeze / wrong board / unreadable HUD.

### Save check (about 10 min, once, at the end of the sessions)

On the same save: the unlock order held (nothing opened early), Parts and upgrades accumulated and the Workshop shows them, the district
map shows each liberated district, the finale chapter opened only after the sixth boss, and a reload keeps all of it. Fail = a locked
mission that should be open, a lost reward, a save that resets. (A full 1-to-21 run at par is about 82 minutes of play before story
cards, briefings and retries; the sessions above cover the same missions in priority order.)

## 4. What to send back

For each mission: pass / fail per the general list, level and device, the 3 screenshots, and for any fail the one-line reason in the
tester's own words. A failed HIGH-A mission blocks the release; a failed HIGH-B one is logged for the balance pass; a failed ROUTINE one
is logged as a defect. Do not tune anything from one person's loss: `docs/BOSS_ACCEPTANCE_FU2.md` and the scripted harness are for
checking whether a cell is genuinely out of line.
