# Classic raid: the close rear approach on Normal (task PI-1C, decision PI7)

Branch `claude/wahala-pi-campaign` (from production `9491d92`). Scope: `src/sim/systems/territory.ts` (one rule), its
config (`classicRaid.revealGraceTicks`), the enemy bot's calm swing. No render, UI, audio, map or tuning of anything else.

Founder (physical phone, Normal, real raid): he can finish the raid, but a CLOSE REAR approach to lay a generator "appears to
trigger detection even when the guard is looking away".

## 1. What was measured (before any change)

Everything runs the REAL raid (`buildRaidGame` at a campaign level, the real enemy bots, all of wave 1 on its rounds, the real
territorial minds), never an isolated guard. Harness: `scripts/lib/rearStalk.ts`; CLIs `scripts/raid-dwell.ts` (the probe),
`scripts/raid-stalk.ts` (a scripted human who walks up behind a guard), `scripts/raid-rear-full.ts` (complete missions).
`PI_GRACE=0` replays production (no grace) in the same harness, so every "before" below is the same code with the one number
at 0.

**The probe.** At many moments of the real raid (every 30 ticks for 25 s, 6 raids, 2 seeds) the human appears on the tile
directly behind a first-wave guard that nobody could notice him on at that moment, lays a generator there and stands still
for 45 ticks (0.75 s: the laying and a moment's hesitation). Windows = such moments; engaged = some enemy alerts.

| level (6 raids, 2 seeds) | windows | engaged within 0.75 s, before | of which the guard's own ABOUT-FACE at arm's length (instant, notice counter 0) | engaged after PI7 |
| --- | --- | --- | --- | --- |
| Easy | 1054 | 214 (20 %) | 214 (all of them) | 28 (3 %) |
| Normal | 1062 | 254 (24 %) | 250 (98 %) | 38 (4 %) |
| Hard | 1070 | 1026 (96 %) | 245 turns + 524 already facing + 257 sight | 1026 (96 %), identical |

Reading. On Easy and Normal essentially every detection of a player standing behind an unseen guard was the same event: the
guard stood at the end of its run or beat looking away (a pause of 36 ticks on Normal), then reversed 180 degrees in one tick,
found him at arm's length in front, and noticed him **on that tick** (`awareness.closeTiles` 1, `classicRaid.closeRing`
'front'): the notice counter was 0, so there was nothing on screen to react to. That is exactly "detected although the guard
was looking away". CV8 (shoulder is seen, not felt) fixed only the quarter turn of a post guard; the about-face of a patrol
guard (and a corner that turns it onto him) was untouched. Hard is stricter by design: the click of a laid generator is heard
1 tile away (`placeHearingTiles` 1), so a guard 1 tile from it investigates at once.

What the measurements ruled out (so nothing else was tuned): the sight cone behind a guard (no detection by sight from behind
in any run: `forward < 0` appears only for investigating guards that look all round); the placement noise on Easy / Normal
(0 tiles, never heard); the facing the picture shows (`PlayerViews` turns the model to `Player.facing` at once, the same
value the rule reads); another guard seeing him (a few per cent, listed as "other" in the raw output); a hit that is not the player's (a belt shipment hurting a guard alerts it to the human whatever the distance, decision RC3: 15 of 708 Normal watchful windows in the depot and the rail yard, none in 108 complete missions; left as it is; the 10 "other" of the night vault were not traced, the harness's classifier does not know the torch reaction ticks). Ally calls are 0.58 of 8.75 alerts per Normal mission (Easy has none).

**A watchful player** (stands, then leaves once some guard could notice him where he stands for his reaction time, to the
nearest tile outside the cross that nobody sees; dwell 200 ticks, i.e. to the blast; `clean` = the guard died to the blast
and nobody alerted before it):

| level | reaction | engaged before the blast, before / after | clean kill, before / after |
| --- | --- | --- | --- |
| Easy | 0.3 s (18 ticks) | 44 % / 13 % | 14 % / 37 % |
| Easy | 0.4 s (24) | 50 % / 17 % | 9 % / 36 % |
| Normal | 0.3 s (18) | 52 % / 19 % | 17 % / 33 % |
| Normal | 0.4 s (24) | 53 % / 20 % | 16 % / 32 % |
| Hard | any | 98 % / 98 % | 0 % / 0 % |

A scripted careful stalker over the whole approach (`raid-stalk.ts`, 117 attempts a level, steps only onto tiles nobody can
notice him on, reacts after 0.3 s): detected before laying, Easy 19 -> 4, Normal 36 -> 21 (instant notices at arm's length
27 -> 0; what remains is sight by another guard or by the target over 30+ ticks); generators laid 91 -> 106 / 69 -> 84;
guards killed 28 -> 40 / 21 -> 35; Hard 51 / 12 / 60 detected before, unchanged.

## 2. The rule (decision PI7)

`classicRaid.revealGraceTicks`: **Easy 66, Normal 54, Hard 0 ticks**. When a CALM guard's own TURN (an about-face at the end
of its run, a corner, a post's sweep) reveals a player who was out of its view the tick before (`m.lastSeenTick < T - 1`):

- it does not feel him at arm's length at once (`close` is off), and
- the sight reaction it needs is the grace (never shorter than `awareness.noticeTicks`: Easy 45, Normal 30), so he is noticed
  after 66 / 54 ticks of being in view (1.1 s / 0.9 s), and not at all if he steps out of its view first (the usual notice
  decay);
- the bot's calm swing is held back for the same time (`EnemyBot`, no punch at someone it has just turned to).

Not changed: a player already in view when it turns, a player who walks into view, a guard that has been facing him (all
instant at arm's length as before); Hard; the night raid's contact rule beyond the same grace; every field mission and every
other match (nothing is stored where the grace is 0, so their state is bit-identical: `raid-ai-isolation`, the Hard digests
of `raid-night-detection`).

The numbers were chosen by the measured step: with a 0.4 s reaction Normal needs more than 45 ticks (45: clean kills 17 %,
54: 32 %, 60: 33 %), Easy gains nothing beyond 66 (clean 36 % at 66, 37 % at 75). The ordering of the levels holds in every
column: Easy grace > Normal grace > Hard none; Easy range 3 / front ring, Normal range 4 / frontSides ring, Hard hears the click.

## 3. Whole missions (nothing trivialised)

`scripts/raid-rear-full.ts --seeds 6`: every raid, every level, the fair-fight scripted human and the ambusher
(`PI_GRACE=0` = before):

| level | completed (fair / ambusher) | alerts per fair run, before / after | health lost per run | lives lost per run | ambushes that killed their guard |
| --- | --- | --- | --- | --- | --- |
| Easy | 36/36, 36/36 both | 5.44 / 4.28 | 0.17 / 0.22 | 0.00 / 0.00 | 36 of 49 / 36 of 47 |
| Normal | 36/36, 36/36 both | 8.89 / 8.75 | 0.33 / 0.28 | 0.00 / 0.06 | 25 of 25 / 25 of 25 |
| Hard | 36/36, 36/36 both | 7.33 / 7.33 | 0.06 / 0.06 | 0.06 / 0.06 | 18 of 18 / 18 of 18 |

Those players barely walk up behind guards, so the whole-mission effect on Normal is small (8.89 -> 8.75 alerts a run); the
rear approach itself, which they do not play, is what the probe measures. Hard's complete-mission digests equal the production recording (`raid-night-detection`).

## 4. Tests

`tests/raid-rear-reveal.test.ts` (10 tests): the numbers; production (grace 0) notices on the very tick; Easy / Normal after
exactly the grace; Hard instant; stepping out in 24 / 36 ticks is never noticed, staying past it is; a quarter turn; no grace
for a player already in view or who walks into its face; the real bot swings straight away without the grace and not with it
(mutation-checked); the real depot, every window of two guards over 20 s: instant about-face notices > 0 before and 0 after on Easy and Normal, Hard
equal. Changed on purpose: `tests/raid-ai.test.ts` CV8 (the guard has looked that way a moment before he arrives),
`tests/raid-core.test.ts` RA1 (same), `tests/raid-night-detection.test.ts` (five Easy / Normal digests re-recorded; the four
Hard ones and every non-raid match are the production recording).

## 5. Not established

- No physical phone test: the founder's own play is the acceptance gate. Reaction times of 0.3-0.4 s are assumed; a slower
  player is helped less on Normal (45 ticks was not enough at 0.4 s, 54 was).
- The harness's "human" retreats to the nearest unseen tile out of the cross; real routes (a side exit) may do better or worse.
- Presentation: a guard's turn is still unannounced. A visible "head turn" or a suspicion mark while the notice counter runs
  would make the window readable; not done (no render change was in scope).
- Night raid (Records Vault): the same grace applies to its contact rule (probe: engaged within 0.75 s 54 % -> 30 % on Normal);
  its torch reaction ticks are unchanged.
