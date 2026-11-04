# Fighters, the attack catalogue and Local Champion

Branch `worktree-agent-afdfec09845c32e2d` (worker `fighters-combat`), started from `claude/wahala-campaign-online-v1` at `321cc5a`. Decisions FC1-FC7 in `docs/DECISIONS.md`. The code is the authority; this page records the numbers, the measurements and what art is still missing. Earlier reference: `docs/STREAKS_AND_COMBAT.md` (the three original attacks, the kill-streak rewards).

Nothing here changes the deployed game by default: the three fighters keep their one attack with the numbers of decisions CB1-CB4, the kill ladder is still 3 Quick Hands / 5 Vehicle Generator / 7 Global Knockdown, and the new attacks, secondary attacks and the Local Champion are reached only through data, config switches or the mission API.

## 1. Fighter definitions (`src/sim/data/fighters.ts`, decision FC5)

One `FighterDef` per fighter: appearance and Nigerian cultural styling, movement profile, primary attack, secondary attack, special ability, passive trait, personality (short Pidgin lines as TEXT only - no audio, no TTS), themed introduction, themed stage (an existing arena id), soundtrack reference (`arena:<id>` = the signature track `public/audio/music/manifest.json` already assigns that arena; no music is added), costume variations (ids and descriptions, presentation data) and a finishing-sequence id. `CHARACTERS` still exists for colours and the legacy `skill`; `tests/fighters.test.ts` keeps the two consistent. Helpers: `getFighter(id)`, `fighterRoster(includeExperimental)`, `defaultAttacks(id, secondaryAttacks)`.

What is wired and what is not (nothing is an invented stat):

| field | wired to the simulation? |
| --- | --- |
| movement `baseStepTicks` | read from `config.movement.stepTicksBySpeedLevel[0]`, identical for every fighter (there is no per-fighter step stat); `presentation.stride/idle` are look only |
| `primaryAttack` | yes: the fighter's loadout (`loadoutOf`; `Player.attacks` holds only overrides from `PlayerSetup.attacks`) |
| `secondaryAttack` | yes, but only when `config.skills.secondaryAttacks` is on (off by default, FC5), or a mission / test / balance run sets `PlayerSetup.attacks` |
| `passiveTrait` (the three playable fighters) | yes: the signature contact tool `config.rewards.contactByCharacter` (boots / gloves / kill switch); tested against the config |
| `specialAbility` | yes where `wired: 'sim'` (the secondary attack's trigger rule, section 4); a trait marked `wired: 'proposal'` is designed only |
| everything else (text, costumes, finisher, soundtrack) | presentation data |

| fighter | status | rig | primary | secondary | stage | soundtrack |
| --- | --- | --- | --- | --- | --- | --- |
| Street Baller | playable | streetBaller | Punch (`push`) | Kick | `surulerePowerYard` | `arena:surulerePowerYard` |
| Lekki Boy | playable | lekkiBoy | Daze Punch (`daze`) | Bottle Strike | `lekkiRoadworks` | `arena:lekkiRoadworks` |
| Campus Queen | playable | campusQueen | Shove (`shove`) | Leg Sweep | `yabaAfterDark` | `arena:yabaAfterDark` |
| Danfo Conductor | experimental | streetBaller | Headbutt | Elbow Check | `oshodiInterchange` | `arena:oshodiInterchange` |
| Market Mama | experimental | campusQueen | Punch | Bottle Strike | `balogunMarket` | `arena:balogunMarket` |
| Jetty Boatman | experimental | lekkiBoy | Shove | Kick | `lagoonJetty` | `arena:lagoonJetty` |

The three experimental fighters are DATA ONLY: they are not `CharacterId`s (`CHARACTERS` and the menu never list them, the game refuses their ids), they reuse an existing rig and `fighterRoster(true)` returns them only when the `experimentalContent` flag (`src/platform/flags.ts`, `WAHALA_EXPERIMENTAL_CONTENT` / `?experimental`) is on. Names are fictional archetypes of Lagos street life; no real person, brand or likeness.

## 2. The attack catalogue (`src/sim/data/attacks.ts`, `config.skills.attacks`, decisions FC2-FC3)

Every attack records, as `AttackSpec` fields: range (`reach`), speed (`startupTicks`), damage (always `0`: no attack is lethal; the "damage" is CONTROL, summarised by `controlValueSeconds`), displacement, daze, recovery (`whiffRecoveryTicks`, `hitRecoveryTicks`), cooldown (`cooldownTicks`, per attack) and vulnerability (`plantedStartup`: the attacker cannot step while winding up; `whiffRootTicks`: stuck after a miss; `hitRootTicks`: recoil after a hit), plus `slowTicks` / `slowExtraStepTicks` / `slowImmunityTicks`, `counterDazeTicks`, `interrupts` and the per-victim `targetLockoutTicks`.

| attack | reach | startup | whiff rec. | hit rec. | cooldown | lockout | daze | displace | slow | counter | planted | whiff root | hit root | control value (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| push | 1 | 4 | 12 | 60 | 0 | 180 | 30 | 0 | 0 | 0 | no | 0 | 0 | 0.5 |
| shove | 1 | 12 | 36 | 120 | 0 | 180 | 0 | 2 | 0 | 0 | no | 0 | 0 | 0.6 |
| daze | 1 | 18 | 30 | 240 | 0 | 240 | 60 | 0 | 0 | 0 | no | 0 | 0 | 1.0 |
| kick | 2 | 14 | 54 | 150 | 0 | 180 | 24 | 1 | 0 | 0 | yes | 30 | 0 | 0.7 |
| bottle | 1 | 9 | 90 | 150 | 600 | 600 | 128 | 0 | 0 | 0 | yes | 60 | 0 | 2.1 |
| sweep | 1 | 15 | 24 | 100 | 0 | 240 | 0 | 0 | 180 (+6/tile) | 0 | no | 0 | 0 | 1.1 |
| headbutt | 1 | 8 | 30 | 110 | 0 | 300 | 55 | 0 | 0 | 0 | no | 0 | 30 | 0.9 |
| elbow | 1 | 11 | 30 | 110 | 0 | 190 | 16 | 1 | 0 | 60 | no | 0 | 0 | 0.6 |

Reading it:

- **Punch, Shove, Daze Punch** are unchanged (decisions CB1-CB4).
- **Kick**: the only reach-2 attack (a rival exactly two tiles away in the faced line with open ground between, or adjacent), shoves one tile and staggers briefly; slow, planted wind-up, the longest whiff recovery.
- **Bottle Strike**: the longest daze (2.1 s), once per 10 s whether it hits or not (the cooldown starts at the press and is its own: the fighter's other attack is not blocked by it), planted wind-up, a miss leaves the attacker stuck for a second.
- **Leg Sweep**: no daze at all; the rival walks at 16 instead of 10 ticks per tile for 3 s (60 % slower) and can still fight back; a slow never extends or stacks (2 s slow immunity).
- **Headbutt**: fast, a medium daze, and the attacker reels (cannot step) for half a second after a hit.
- **Elbow Check**: a short bump and a short daze; a 1 s extra daze when the rival is PLANTED or REELING (a Kick or Bottle Strike wind-up, a committed miss, a Headbutt recoil: `rootedUntil`), and it cuts a pending wind-up short like every attack.

Shared rules (`systems/skills.ts`): every hit that `interrupts` cuts a rival's pending startup short; the same attacker cannot affect the same victim again for `targetLockoutTicks` (no chain); pure dazes cannot start on a rival still immune to a daze and pure slows not on a slow-immune one; the effect is resolved when the startup ends against whoever is in reach THEN (a rival who stepped away is a whiff, subject to the step grace of FC1); recoveries are per attack and global (`skillReadyTick`), and a DIFFERENT attack of the same loadout waits only `followUpGapTicks` (30) after the last one.

## 3. Balance: the measured matrices (`npm run combat-balance`)

### Alone: one attacker against a rival who stands still / keeps running (60 s)

| attack | still: hits/min | still: victim control s/min | running: hits/min | running: whiffs/min |
| --- | --- | --- | --- | --- |
| push | 20 | 10.0 | 20 | 0 |
| shove | 5 | 3.0 | 18 | 1 |
| daze | 14 | 14.0 | 14 | 1 |
| kick | 19 | 10.6 | 19 | 0 |
| bottle | 6 | 12.8 | 6 | 0 |
| sweep | 12 | 13.1 | 2 | 74 |
| headbutt | 12 | 11.0 | 12 | 0 |
| elbow | 18 | 7.8 | 9 | 44 |


### Engagement matrix (the first 5 s of a fight): share of all control the ROW attack inflicted (50 % = even; both fighters use that one attack)

| row \ column | push | shove | daze | kick | bottle | sweep | headbutt | elbow | wins | losses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| push | 50 | 49 | 50 | 42 | 100 | 47 | 52 | 47 | 2 | 4 |
| shove | 51 | 50 | 51 | 46 | 22 | 48 | 53 | 51 | 4 | 3 |
| daze | 50 | 49 | 50 | 42 | 32 | 50 | 52 | 47 | 1 | 4 |
| kick | 58 | 54 | 58 | 50 | 50 | 55 | 60 | 43 | 5 | 1 |
| bottle | 0 | 78 | 68 | 50 | 50 | 70 | 0 | 79 | 4 | 2 |
| sweep | 53 | 52 | 50 | 45 | 30 | 50 | 55 | 50 | 3 | 2 |
| headbutt | 48 | 47 | 48 | 40 | 100 | 45 | 50 | 45 | 1 | 6 |
| elbow | 53 | 49 | 53 | 57 | 21 | 50 | 55 | 50 | 4 | 2 |


### Sustained matrix (60 s): share of all control the ROW attack inflicted (50 % = even; both fighters use that one attack)

| row \ column | push | shove | daze | kick | bottle | sweep | headbutt | elbow | wins | losses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| push | 50 | 84 | 43 | 51 | 47 | 44 | 46 | 58 | 3 | 4 |
| shove | 16 | 50 | 12 | 36 | 13 | 16 | 15 | 42 | 0 | 7 |
| daze | 57 | 88 | 50 | 64 | 48 | 53 | 52 | 70 | 6 | 1 |
| kick | 49 | 64 | 36 | 50 | 44 | 44 | 46 | 55 | 2 | 5 |
| bottle | 53 | 87 | 52 | 56 | 50 | 51 | 49 | 66 | 6 | 1 |
| sweep | 56 | 84 | 47 | 56 | 49 | 50 | 54 | 66 | 5 | 2 |
| headbutt | 54 | 85 | 48 | 54 | 51 | 46 | 50 | 62 | 5 | 2 |
| elbow | 42 | 58 | 30 | 45 | 34 | 34 | 38 | 50 | 1 | 6 |


### Positional use: a flame lane the rival cannot leave in time (1 = the hit kills)

| attack | flame under the rival at tick 45 | flame two tiles beyond at tick 25 |
| --- | --- | --- |
| push | 0 | 0 |
| shove | 0 | 1 |
| daze | 1 | 0 |
| kick | 0 | 0 |
| bottle | 1 | 0 |
| sweep | 0 | 0 |
| headbutt | 1 | 0 |
| elbow | 0 | 0 |

How to read the matrices: both fighters use the row / column attack only, walk up to each other and press B whenever B would throw an attack; each pairing is played from an adjacent start and from four tiles apart (so the reach-2 Kick can open), seated on both sides; nobody can die. The cell is the share of all control seconds in the fight that the ROW attack inflicted (a displacement counts the push and the walk back, a slow the walking time it costs). More than 50 % = the row attack wins. Two horizons are measured because they answer different questions: the 5 s ENGAGEMENT is who wins the first exchanges (startup order, reach, interrupts, counters: what repeats every time two fighters meet in a real match), the 60 s SUSTAINED duel is the control rate once the lockouts and recoveries cycle. `tests/attack-catalogue.test.ts` asserts, on the same harness (`scripts/lib/duel.ts`):

- no attack is better than another on every axis of the spec (`dominates`), checked for all 56 ordered pairs;
- in the 5 s engagement every attack beats at least one other attack and loses to at least one (strictly more than 50.5 % / less than 49.5 %);
- no attack wins every engagement or every sustained duel, and none loses every engagement;
- every attack except the Shove wins at least one sustained duel, and the Shove wins none (below).

Reading the numbers: in the engagement matrix the Bottle Strike (9-tick wind-up) beats every slower attack (Shove, Daze Punch, Leg Sweep, Elbow Check) but is cancelled by the two faster ones (Punch, Headbutt: 0 %), and its cooldown is spent at the press either way. The Kick opens from two tiles and wins five of seven engagements, losing only to the Elbow Check, which catches its planted wind-up. The Leg Sweep beats the Punch, the Shove and the Headbutt but loses to the Kick and the Bottle Strike. The Headbutt wins only against the Bottle Strike in the first seconds yet is one of the best sustained attackers (fast, a medium daze: 5 of 7). The Daze Punch is the sustained king of the original three (6 of 7, losing only to the Bottle Strike at 48 %) and wins a single engagement. The Elbow Check is the weakest sustained attacker after the Shove (1 of 7): its value is the counter.

Honest limits of the metric: it measures control seconds, so attacks whose value is the map look weak in a plain duel. The Shove (unchanged, decision CB2) wins no sustained duel (it is dangerous only where a push puts a rival in a flame lane: the positional table) and the Kick's reach shows only in the engagement matrix. The original three keep their deployed numbers, so the matrices are the evidence that the new attacks fit around them, not a re-tune of them.

## 4. How B resolves (`systems/actions.ts`, decision FC4)

Still exactly two action buttons. One deterministic resolver; the FIRST step that applies is the only one that happens (`tests/attack-catalogue.test.ts` plays 1500 ticks of mixed input and asserts a press never produces two effects):

0. A fighter who cannot act (dazed, down, eliminated, choosing a vehicle entrance): nothing.
1. A rival on an ADJACENT tile (faced tile first, then up, right, down, left): the PRIMARY attack if it is ready; else the SECONDARY if the loadout has one, it can hit that rival and it is ready (a different attack waits only the 30-tick follow-up gap); neither ready: B is spent on nothing (never a vehicle or a reward: no surprise).
2. Nobody adjacent: a ready REACH-2 attack (primary first, then secondary) and a rival exactly two tiles away in the faced line with open ground between: that attack.
3. A Vehicle Generator: launched.
4. A Global Knockdown: thrown.
5. A Local Champion: the crowd starts.
6. A Vehicle Voucher: the one-press signature vehicle.
7. Otherwise nothing.

Holding B (or A) is still the Remote Detonator. Secondary attacks are active only when the fighter's loadout has one (`config.skills.secondaryAttacks` for the roster defaults, or `PlayerSetup.attacks`). Bots use the same press: `chooseAttack` is the resolver's own choice and `ai/tactics.ts` presses B for a ready secondary from a tile that is safe for its startup; Local Champion is pressed when a rival is within its radius and nobody is adjacent. `previewSpecial` (HUD label, tutorial) reports `melee` for a secondary press too.

## 5. LOCAL CHAMPION (`systems/localChampion.ts`, decision FC6)

A reward SEPARATE from the Global Knockdown. B starts a window (8 s); the first volley is thrown at once and a new one every 1.5 s: the nearest rivals within 5 tiles (Manhattan) of the OWNER, at most 2 per volley, ties by player id. Each throw is a visible projectile from the building side (`localChampionThrow`, rendered by the knockdown projectile view with an orange landing marker) aimed at the tile the rival stands on NOW and landing 48 ticks later (the Global Knockdown's warning is 36): stepping off the tile dodges it (`localChampionMissed`). A hit is a 36-tick (0.6 s) daze (`localChampionHit`, `playerDazed`): no kill, no knockdown, no push, no elimination credit. One hit per rival per use; after any hit nobody's crowd can hit that rival for 5 s (no stun-lock across uses or owners). The owner may move, place generators and attack throughout. A death ends the window (`localChampionEnded`, reason `died`); an unused reward survives a death like every earned reward (AS7).

| | GLOBAL KNOCKDOWN | LOCAL CHAMPION |
| --- | --- | --- |
| who | every rival, anywhere | rivals within 5 tiles of the owner, nearest first, 2 per volley |
| warning | 36 ticks, the object tracks the rival's head | 48 ticks, the object lands on a fixed tile |
| dodge | impossible | step off the tile |
| effect | 2 s flat on the ground | 0.6 s daze |
| repeat | 4 s immunity after getting up | one hit per rival per use, 5 s immunity after any hit |
| duration | one volley | an 8 s window |

Granted only by `grantStreakReward(state, playerId, 'localChampion')` (campaign missions, tutorials, tests; also works for the other reward kinds) or, with `config.streaks.localChampion.ladder` on, as the 7-kill reward INSTEAD OF the Global Knockdown (default off: the fixed ladder 3 / 5 / 7 is unchanged and `tests/local-champion.test.ts` asserts it).

### Measured: LOCAL CHAMPION vs GLOBAL KNOCKDOWN (same seeds, same bots, the next 10 s)

| reward | uses | kills/use | same match without it | extra kills/use | uses with 0 / 1 / 2 / 3 kills | landed / dodged per use | user died in window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GLOBAL KNOCKDOWN | 62 | 0.56 | 0.40 | 0.16 | 32 / 26 / 3 / 1 | n/a (cannot be dodged) | 9 |
| LOCAL CHAMPION | 89 | 0.37 | 0.31 | 0.06 | 59 / 28 / 1 / 1 | 0.71 / 2.47 | 26 |

Reading it: against the same bots in the same matches, a Local Champion is worth clearly fewer extra kills than a Global Knockdown (it reaches fewer rivals, can be dodged and only dazes briefly), so it can be offered as a campaign reward or a ladder alternative without outclassing the existing 7-kill reward. The owner died in 26 of 89 uses against 9 of 62 for the knockdown: the crowd only helps a fighter who is close to rivals (the radius is the point), and the bot uses it with a rival within 5 tiles. The two baselines differ because only matches in which the bot actually used the reward count. The Standard bots do not dodge the objects; the 2.5 dodged throws per use are bots that kept walking.

## 6. Art, animation and audio still missing

| attack / feature | animation | effects | audio |
| --- | --- | --- | --- |
| Kick | a planted high-kick clip (14-tick wind-up, extension, recover); today the Kick clip plays | a short dust line along the two tiles; the push dust is reused for the hit | a whoosh at the start and a thud on contact (synthesised from the existing bank) |
| Bottle Strike | a bottle-grab and overhead-swing clip; a held-prop socket on the hand | glass shards on contact (the crowd bottle mesh is reused as the prop) | reuse bottle_smash; a scuff cue for a miss would help |
| Leg Sweep | a low spinning leg sweep; a limp walk cycle for the slowed victim | a dust ring at the feet; a small limp icon over the victim | a scuff and a grunt (synthesised) |
| Headbutt | a lunge-and-recoil clip (the attacker staggers 30 ticks after a hit) | reuse the stars on the victim; small stars on the attacker | a dull knock (synthesised) |
| Elbow Check | a short elbow clip; a "reeling" pose is reused from the Headbutt recoil | reuse the push dust | reuse the Punch cue |
| Punch / Shove / Daze Punch | exist (Push and Kick clips) | exist | exist (synthesised) |

Local Champion: the thrown objects reuse the knockdown projectile view (a bottle thrown from the building-side figure) with an orange marker. Still missing: a distinct object per throw (a shoe, a plastic chair, a bucket), a "step off" ground decal, the HUD card and the B-button label (below), and a crowd cheer variant. Fighter data still needs: the experimental fighters' models (they use a re-coloured existing rig), the costume meshes, the finishing sequences (`finisher.*` ids point at nothing yet) and the Pidgin lines are text only (no voice recording exists or may be generated).

## 7. Audit of the pending combat items (decision FC1)

| item | finding | action |
| --- | --- | --- |
| Punch / Shove forgiveness | A rival who stepped away during the startup was a whiff even while the board still showed them on the tile (a step commits its destination at once). The pick-another-adjacent-rival rule already existed but cannot help a single rival (one orthogonal step never keeps adjacency). | STEP GRACE: a rival who began stepping away and has not visually crossed half the step (`skills.stepGrace.maxShare` 0.5) is still hit; a rival past half the step is missed, so dodging still works (the Daze Punch's 18-tick startup is long enough to dodge). Diagonal-adjacent forgiveness was NOT added: the step grace covers the same case without a new rule. Tests in `tests/attack-catalogue.test.ts`. |
| Rapid retry after a miss | The Punch's whiff recovery is 12 ticks (0.2 s), 3x its 4-tick startup. | Already satisfied; not shortened (a test pins that it is not shorter than the telegraph). |
| `targetLockoutTicks` chain audit | The lockout is per (attacker, victim) for every attack and at least the attacker's own hit recovery, so one attacker cannot chain a victim. Dazes are separately capped by the 1-2 s daze immunity, slows by the slow immunity. Different attackers CAN each hit the same victim (by design: the lockout is per attacker). | Tested for every attack: an unbroken 30 s B stream lands at most `ceil(30 s / lockout) + 1` hits and the victim loses at most 20 s of 60 s alone. Nothing changed. |

## 8. Items for the HUD worker

- `StreakStatus` / `buildStreakHud` (`app/hud.ts`): there is no card for a held or running LOCAL CHAMPION (`StreakRewards.localChampion`, `Player.localChampion` with `endTick`); `STREAK_REWARD_DEFS.localChampion` exists.
- `streakIcons.tsx`: no `localChampion` icon (the SVG is empty); `specialLabel.ts`: `me.special === 'localChampion'` falls through to the fighter's attack label.
- B label for a secondary attack (`SKILL_DEFS` only knows the original three; `ATTACK_DEFS[kind].label` has the word for all eight).
- Toasts added in `MatchController`: `LOCAL CHAMPION! STEP OFF THE TILE!` for the target; the Global Knockdown toast now says `GLOBAL KNOCKDOWN! DUCK!` (it used to say LOCAL CHAMPION, which is now a separate reward).
