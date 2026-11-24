# Relay guards: which boss has them, and proof that no other fight changed (task FU2-B2, decision FU2Q-3)

Branch `claude/wahala-fu2-qa` (from production `f7cf2ae`). No `src/` change. Context: decision PI8 (docs/BOSS_JAMMER_PROTECTION.md)
read the founder's "the boss and backup fighters should protect the jammer" as the Oshodi dispatch relays. This note checks that
reading against every boss and proves the code is inert outside it.

## 1. Which boss has a relay / jam mechanic

There is no object called a jammer in the code. The word "jam" is the Oshodi relay verb (`src/campaign/content/oshodi.ts`: "Jam two
relays ...", `mission/objectives/relays.ts`: one blast that reaches a relay tile jams it; the crew's runners re-arm jammed relays) and
the Test Lab's own wording (`src/testlab/registry.ts`: "Normal and Hard jammer-defence tuning"). The Records Vault's "jammed shelf" is a
raid obstacle, not a boss. The seven campaign boss encounters (`CAMPAIGN_MISSION_IDS`, missions 3, 6, 9, 12, 15, 18, 21):

| mission | boss | objective verb (`MissionDef.objective`) | dispatch relays? | boss balance (`recipe.balance`) | relay guards |
| --- | --- | --- | --- | --- | --- |
| 3 | Oga Sunmola (Oshodi) | `dispatchRelays`: jam 2 of 3, 3 of 4, then 4 relays on the dispatch corridor | YES | `BOSS_BALANCE` | Easy 0, Normal 1, Hard 2 |
| 6 | The Parts Broker (Mushin) | `supplyRoutes`: destroy parts stacks; runners restock | no | none | none |
| 9 | The Garage Master (Fadeyi / Somolu) | `junctionAccess`: break toll boxes; 3 route marshals (`objectiveDefender`) stand at them | no | none | none |
| 12 | The Timetable (Ebute Metta) | `dispatchWindows`: switches inside timed windows; 2 `objectiveDefender`s, runners | no ("dispatch" here is a timetable, not relays) | none | none |
| 15 | The Registrar (Lagos Island) | `evidenceRun`: carry ledgers to the press drop; 2 `objectiveDefender`s hunt the carrier | no | none | none |
| 18 | The Steward (Lekki Phase 1) | `contingencyGrid`: switch systems off in the signalled order; 2 `objectiveDefender`s "defend the panels" | no | none | none |
| 21 | The Landlord (Ojuelegba finale, provisional) | `controlPoints`: shut the enforcer's control points down; 2 lockers (runners) re-lock | no | none | none |

## 2. Does any other boss have a comparable "protected objective" mechanic?

Report only, nothing applied. Three kinds exist, none of them a relay:

- **Fixed defenders on the objective nodes** (`objectiveDefender` role, `mission/directives.ts`): Fadeyi (3 marshals, one per toll box,
  already "guard the node it is assigned to"), Ebute Metta (2), Lekki (2, "guards defend the panels"), Lagos Island (2; they chase the
  ledger carrier). These already stand at the nodes by design, on every level.
- **Runners that undo the player's work** (`runner` role): Oshodi (re-arm jammed relays), Mushin (restock destroyed stacks), the finale
  (lockers re-lock a control point). The objective is "protected" by repair, not by bodies.
- **Pressure on the objective** from the boss balance (BB6: pulse / rearm / crew multipliers) is Oshodi only.

If the founder meant "the Mushin stacks" or "the Lekki panels" when he said jammer, the lever is the same one change: a per-boss
`BossBalance`-style field read by `directiveFor`; it would have to be measured per boss. Nothing in the current code does that for them,
and applying PI8 "indiscriminately" would also change fights whose defenders are already at their nodes. The wording to confirm with the
founder: which boss, which objective. The Test Lab entry still says Oshodi.

## 3. Proof that relay guards are inert everywhere else (`tests/boss-relay-scope.test.ts`, 8 tests, 53 s)

1. **Data.** Of the seven encounters only `oshodi` has `objective === 'dispatchRelays'` and only its recipe names a balance. Its
   tuning carries `relayGuards` exactly as `BOSS_BALANCE.relayGuards[level]` (Easy: no key at all); the other six encounters carry neither
   `relayGuards` nor `relayGuardRadius` at any level.
2. **Directive.** On each of the six other bosses at Hard, with the human at his start and at three node tiles, the directive of every seat
   is read; then `relayGuards: 2` is FORCED onto that boss's tuning and every directive is read again: identical, and
   `relayGuardDirective` is undefined for every seat (the objective check and the missing relay nodes both stop it). The positive
   control: on Oshodi the same forcing drafts two seats, and deleting the field drafts none. It is also off when the boss is exposed.
3. **Real fights, bit for bit.** `scripts/lib/bossScope.ts` folds every tick of 45 s of the real mission (real boss and crew bots, the
   scripted player of docs/BOSS_BALANCE.md, seed 101: every seat's tile, health and step, the objective's progress, the phase, the
   generators) into one hash. It was run on production `9491d92` (before PI8, same harness copied in) and on this branch:

| boss | Normal before | Normal now | Hard before | Hard now |
| --- | --- | --- | --- | --- |
| Oshodi | 7ad9437c | **bd554bd0** | 726a0a6d | **4d5ab2ea** |
| Mushin | b689e73 | b689e73 | e08a411 | e08a411 |
| Fadeyi / Somolu | a45c1fa3 | a45c1fa3 | e1d3b015 | e1d3b015 |
| Ebute Metta | 295819c8 | 295819c8 | a6e26b1e | a6e26b1e |
| Lagos Island | d1e9b676 | d1e9b676 | 574bea45 | 574bea45 |
| Lekki | 955edbcc | 955edbcc | 1a4d8d28 | 1a4d8d28 |
| Ojuelegba finale | 891198cc | 891198cc | 6e58f919 | 6e58f919 |

   The six other fights are identical; only Oshodi differs, and only on Normal and Hard (Easy is pinned by `tests/boss-relay-guard.test.ts`).
   The test pins the "before" column.
4. **Presence in the real Oshodi fight.** With the player waiting at relay 1 for 40 s of the real bots: backup fighters (marshal / blocker
   / escort) standing within 3 tiles of a live relay that is at least 10 tiles from their own post: Easy 0, Normal 1, Hard 2.

Also unchanged and covered elsewhere: field missions and raids carry no `mission.tuning.boss` (`relayGuardDirective` returns undefined with
no boss tuning), `tests/raid-ai-isolation.test.ts` pins their digests, and Classic / City Rumble never read it.

## 4. Not established

- The presence test parks the player; it proves who goes to the relay, not that it is fun. Whether Normal / Hard now feel protected is the
  founder's phone test (docs/FOUNDER_ACCEPTANCE_FU2.md item 4); docs/BOSS_JAMMER_PROTECTION.md section 4 already says the measured
  difficulty change is small.
- Only the first 45 s of each fight are digested (the phase-1 relays, the part PI8 touches); a later phase of another boss cannot differ
  because the directive is inert by the data check, which is independent of time.
