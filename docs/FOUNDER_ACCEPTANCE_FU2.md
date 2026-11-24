# Founder acceptance checklist FU2 (task FU2-B5, decision FU2Q-6)

Short, concrete phone steps for six items only. You do NOT need to replay the earlier Test Lab scenarios (19 of the Lab's 20 entries
already passed on your phone; the one that needed improvement is item 3 below). Each item says how long it takes, what to do, what
you should see, and what counts as a fail. Items 1-4 are built and testable on the current build. Items 5 and 6 are being built by
another worker: they are written from the spec and are marked **to be confirmed against the shipped build**; do not judge them until
that build is on your phone.

Open the Test Lab with `https://tundelaniyan.github.io/wahala-game/?testlab=1` (add `&fps` for the frame-rate line). In the Lab, "Completed
Tests" is the collapsed list under the five review entries: tap its header to open it. Landscape phone. Nothing in the Lab changes your
real save.

| # | item | where | time | automated cover (what a machine already checked) |
| --- | --- | --- | --- | --- |
| 1 | Sudden Death timer | Lab review entry 1; the normal game's Training Academy | 4 min | `e2e/sudden-death-test.spec.ts`, `sudden-death-banner.spec.ts`, `tests/ui/timer-ended.test.ts`, Lab spec |
| 2 | Crowd silhouette, 16 and 32 fighters | Lab "City Rumble parity" (completed list) | 6 min | `tests/render/crowd-silhouette.test.ts`, `e2e/crowd-silhouette.spec.ts`; FU2: `e2e/fu2-acceptance.spec.ts` (16 and 32) |
| 3 | Normal raid rear approach, the real about-face | Lab "Rear approach", then "Classic Campaign Raid" | 8 min | `tests/raid-rear-reveal.test.ts`, FU2: `tests/raid-night-rear-grace.test.ts`, `tests/fu2-raid-acceptance.test.ts` |
| 4 | Oshodi boss: relay protection, Normal and Hard | Lab "Boss encounter" (completed list) | 14 min | `tests/boss-relay-guard.test.ts`, FU2: `tests/boss-relay-scope.test.ts`, `e2e/fu2-acceptance.spec.ts` |
| 5 | City Rumble Quick Start and menu priority | Home | 5 min | to be confirmed against the shipped build |
| 6 | Music Data Saver shortcut, selected-arena loading | Home, match start | 5 min | to be confirmed against the shipped build |

## 1. Sudden Death timer (4 min)

A. In the Lab, tap review entry **1 "Sudden Death presentation and timer"**, then Start Test. It is a real City Rumble that starts in the
sudden-death round (you and two bots).
1. While input is held (the title card), look at the big timer. Expect: it counts down the FIRST blast's delay, red, tag SUDDEN
   DEATH, with BLAST 1/3 beside the digits.
2. A short card appears in the side rail and goes away by itself in a few seconds; nothing sits over the middle of the board.
3. Play or stay alive until a winner is known and stands in the victory pose. Expect: the main timer reads **0:00**.
4. Pause once (pause button): the pause menu's "Time left" is also 0:00 after the winner, never minutes (the old Lab showed about 9:2x).
Fail: the timer shows any minutes after the winner is known; the announcement stays over the board; the digits do not count.

B. Ordinary game: Home -> Training Academy -> **Sudden Death Test** (the normal game's own test, three bots) and repeat steps 1-4. An
ordinary City Rumble reaches Sudden Death only when the clock runs out with the top kill count tied, which cannot be forced on a phone;
this test is the real match path. Pass = the same as A. (Unverified: a real tie at the end of a 3-minute match.)

## 2. Crowd silhouette in 16- and 32-fighter battles (6 min)

The mark: a lighter, see-through copy of YOUR fighter appears where OTHER FIGHTERS stand in front of you (never where a wall, building,
crate or prop hides you; those still show the older outline). It is off on the two Very Low quality rungs.
1. First check your quality: Settings -> Graphics should be Auto, Low, Medium or High (on Very Low or Very Low+ the silhouette is
   switched off by design; if Auto picked Very Low on your phone, choose Low for this test).
2. Lab -> Completed Tests -> **City Rumble parity**. On the card set Fighters to **16**, Free-for-All, any stage, Start Test.
3. Walk into the middle of the crowd until bots stand between the camera and you. Expect: your fighter's lighter silhouette shows
   through them, and the YOU plate and floor ring stay clear. Go behind a building: you see only the usual outline, not the crowd copy.
4. Repeat with **32** fighters.
Pass: silhouette visible through fighters in both, no flicker, nothing hides a blast lane, frame rate playable (`&fps`).
Fail: no silhouette at Low or above; it shows through walls as the crowd copy; the frame rate falls under about 20 fps (note the phone
and the quality rung). Screenshot a crowd moment at 16 and at 32.

## 3. Normal raid rear approach, including the guard's actual about-face (8 min)

This is the item that needed improvement. Decision PI7: when a patrolling guard turns round (the end of its run or a corner) and finds
you at arm's length behind it, it no longer notices you on that very tick; you see it turn and have about one second (Normal) to step
out of its view.
A. Lab -> Completed Tests -> **Rear approach** (Depot, one guard on its patrol, you start behind it), level **Normal**, Start Test.
1. Creep up behind the guard until you are one tile behind it. Do not step out yet. Wait for the guard to reach the end of its run and
   turn round (about-face).
2. Expect: at the turn it does NOT alert at once (no "!" on that instant). Within about one second a "!" mark would appear if you
   stay; step out of its view (sideways or back) within that time and it never alerts.
3. Try once more and stay put: it alerts after about a second. That is correct.
4. Come up behind it again, lay a generator (tap A) and walk out of the blast: Expect one blast defeats the guard.
B. Lab -> Classic Campaign Raid, **Normal**, play the whole raid (break the 3 marked crates, reach the exit). Expect: completed with
the same behaviour at the guards' turns; an alert you can see coming, not out of nowhere.
Optional: **Hard** should still notice you at once at the turn (it is stricter by design).
Pass: at least one about-face where you stood behind or beside it and were NOT alerted at the turn; the raid is completed on Normal.
Fail: alerted on the very tick it turns round while it was looking away from you; or you are never alerted even after standing in its
view for several seconds. Note which guard and whether it was the end of a run or a corner.

(Night raid, only if you want: Lab -> Completed -> Records Vault night raid, Normal. In a torch beam you are noticed in about a quarter
of a second after it turns; from behind or from the dark you are not. That is intended, docs/NIGHT_RAID_REAR_REVIEW.md.)

## 4. Oshodi boss relay protection, Normal then Hard (14 min)

Lab -> Completed Tests -> **Boss encounter**. The boss's backup fighters now defend the dispatch relays (the thing you jam with a blast)
while he is shielded: Easy none, Normal one, Hard two.
1. Start on **Normal**. While the boss is shielded, walk along the corridor towards the nearest relay (see the objective marker). Expect:
   a backup fighter (the Dispatch Marshal) leaves the booth and stands within a couple of tiles of that relay; it fights you if you
   come inside. Jam relays as the objective says; when the boss shows as exposed the fighter goes back to its own job.
2. Win or lose; note how it felt (3 lives).
3. Start on **Hard**. Expect two fighters, at two different relays (the marshal and the lane blocker), and a harder fight.
4. Optional: **Easy** should be as you approved it: nobody guards the relays.
Pass: Normal has one defender at the relay you approach, Hard two at two relays; both fights are winnable in 3 lives by an ordinary
player; the fighters hold their relay (they do not run back and forth between two).
Fail: no defender at any relay on Normal or Hard; a defender that keeps switching relays; Normal or Hard unwinnable for a reason you
cannot name. Screenshot: a relay with its defender; the exposed-boss window. Whether Hard "bites" is your judgement: measured, the change is small
(docs/BOSS_JAMMER_PROTECTION.md section 4); the levers are written there.

## 5. City Rumble Quick Start and menu priority (5 min) - to be confirmed against the shipped build

Spec: Home -> **Quick Start** launches an offline City Rumble Free-for-All with 16 fighters, Rookie bots and 3 minutes, your saved
settings respected; it never launches Classic. Do this only on the build that ships the button.
1. Home: Quick Start is the first and most prominent action; the portrait and landscape phone both show it without scrolling; the other
   entries (Campaign, Classic, the Academy ...) are still reachable.
2. Tap it once with your saved settings as they are. Expect: no further menu screens; a City Rumble loads; at the start the roster is 16
   fighters, Free-for-All, bots at Rookie, the timer starts at 3:00.
3. Change something you save (your fighter, control size, music off, graphics quality), go back Home and Quick Start again. Expect your
   change is used (your fighter, controls, audio and quality) and the match is still FFA, 16, Rookie, 3:00.
4. Make sure Classic is NOT what started: the board is a City Rumble stage with the follow camera and the Rumble HUD, not a four-player
   Classic board.
5. Name check: the Training Academy already has a section called "Quick Start" (the five beginner lessons). Expect the Home button to be
   the City Rumble one and the Academy's section unchanged, with no confusion in the words on screen.
Fail: Classic or the Academy launches; more than one tap needed; a saved setting ignored; 16 / Rookie / 3:00 / FFA wrong; the button
pushed off screen on a small phone. (Expectations for "saved settings respected" beyond fighter, controls, audio and quality, and
the exact menu priority, are as the other worker specifies: confirm against their note.)

## 6. Music Data Saver shortcut and selected-arena loading (5 min) - to be confirmed against the shipped build

What exists today: Settings -> Audio -> Data Saver (Auto / On / Off): On plays the smaller 96 kbps music files (about 60 % fewer
bytes per match; docs/MOBILE_PERFORMANCE.md). Spec for the new work: a Data Saver shortcut on the main menu and the selected arena
loading only what it needs.
1. Home: find the Data Saver shortcut. Expect: one tap turns it on or off, it shows its state, and it is the SAME setting as Settings ->
   Audio -> Data Saver (change one, see the other follow).
2. With it On, choose an arena and start a match. Expect: the match starts and music plays; on a mobile connection the start is not
   slower than before. (You cannot see the file size by eye: on a desktop, DevTools -> Network shows the music request is a `lite`
   file.)
3. Choose a different arena on the arena screen and start. Expect: the loading screen / first view is THAT arena (its board, look and
   music), never the previously selected or a default one.
4. Switch the shortcut Off and start again: music is the full-quality file.
Fail: the shortcut and Settings disagree; the wrong arena loads; music missing with Data Saver on; the shortcut covers another menu
action. Unverifiable by eye on a phone: that only the selected arena's assets are fetched (needs the Network panel or the worker's note).

## What was automated for this checklist, and what was not

- `tests/fu2-raid-acceptance.test.ts` (item 3): the real depot on Normal with the about-face scripted, all of the first wave on its rounds,
  and a complete raid after it.
- `e2e/fu2-acceptance.spec.ts` (items 2 and 4): the real game in a browser: 16- and 32-fighter City Rumble with the crowd silhouette
  present for the local fighter only; the Oshodi boss started from the Test Lab on Easy / Normal / Hard carries 0 / 1 / 2 relay guards and the
  guards stand at a relay after the sim runs. Software GL, no person.
- Item 1 already had browser and unit cover; nothing was added. Items 5 and 6 are not testable until their build lands.
- NOT automated, on purpose: whether a guard's turn is readable, whether Hard bites, whether the 16 / 32 crowd reads on a real phone
  screen. Those are yours.
