# WAHALA! Story Bible: BREAK THE RING

**Status: the authoritative narrative reference for the campaign (created 2026-11-15).** It supersedes the story parts of
`docs/CAMPAIGN_STORY.md` (see section 12, Reconciliation). Gameplay design is in `docs/CAMPAIGN_GAMEPLAY_BIBLE.md`;
rules canon stays in `docs/GAME_DESIGN_BIBLE.md`.

Every important narrative choice carries one tag:

| Tag | Meaning |
| --- | --- |
| **LOCKED** | Founder direction. Do not change without a founder decision. |
| **EXISTING** | Already in the shipped code or content (`src/campaign/**`, `src/sim/mission/**`). True today; may be revised by a founder decision, never silently. |
| **PROPOSED** | Suggested here. Not approved, not implemented. Needs founder review before it is built or treated as canon. |

This document changes no gameplay code, mission id, save key or content string. Where it describes something the code
does not do, it says so.

---

## 1. Legal and cultural rule (LOCKED)

- Every antagonist, faction, company, sign and organisation is **fictional**. No antagonist may be a recognisable
  accusation against a real individual: no real name, nickname, face, voice, clothing, regalia, slogan, biography,
  family, party, union, office or allegation.
- Real places (Ojuelegba, Oshodi, Mushin, Fadeyi/Somolu, Ebute Metta, Lagos Island, Lekki) lend cultural texture only.
  Ordinary drivers, conductors, traders, mechanics, rail staff, riders and estate workers are **never** the enemy; they are
  the people the Ring exploits and the people who win at the end.
- Pidgin is affectionate, never mocking. Native-speaker review before any voice recording.
- The ethics checklist in `docs/CAMPAIGN_STORY.md` section 5 stays in force and is enforced in part by
  `tests/campaign-content.test.ts` (denylists).

> **OPEN LEGAL FLAG (needs founder decision, see section 12.3).** `docs/BOSS_INSPIRATIONS.md` records named living or
> recently deceased real people as the "creative references" for the Oshodi and Fadeyi bosses, and their shipped
> nicknames ("Oga Mic", "Oga Footbridge") and presentation (microphone authority, praise-singer, park-master title;
> footbridge garage master) were designed from those references. Under this Bible the bosses run a criminal access
> racket. The combination of place + role + nickname + look risks reading as an accusation against those people. This
> Bible does **not** adopt either nickname as canon and recommends a legal/cultural review before they ship further.

---

## 2. Core premise

| Element | Content | Tag |
| --- | --- | --- |
| The Ring | A hidden network that controls **access**: who may move (transport), trade (parts, markets), cross (junctions), ship (freight), prove (commercial records) and see (electricity) in Lagos. Its leaders profit by deciding who can move, trade, repair, work and receive essential services. | LOCKED |
| Name in content | "the Ring"; existing content also calls it "the Oruka Ring" (*oruka*: Yoruba for ring). | EXISTING |
| Theme | **Control of access.** Every district is one gate the Ring keeps closed for money. Every victory visibly reopens a gate for ordinary people. | LOCKED |
| Inciting incident | Selective blackouts on Ojuelegba's lanes while richer areas never blink, and an **impounded danfo** around Ojuelegba. | LOCKED |
| Existing inciting text | Prologue: Mama Put notices only "our lane" lost light; a radio report of a bus held at the park gate for "dispatch fees" (`src/campaign/content/story.ts`, `PROLOGUE`). | EXISTING |
| Tone | Gritty, adult Lagos street life with warmth and humour; no gore; generators and blasts are the established register. | EXISTING |

---

## 3. Protagonists

All three play the same missions in the same order. They differ in voice, personal stake and (proposed) one hometown
side mission each. The campaign save stores one chosen fighter (`CampaignSave.character`).

| | Street Baller | Campus Queen | Lekki Boy |
| --- | --- | --- | --- |
| Character id | `streetBaller` (EXISTING) | `campusQueen` (EXISTING) | `lekkiBoy` (EXISTING) |
| Home | Ojuelegba (LOCKED) | Mushin (LOCKED) | Lekki Phase 1 (LOCKED) |
| Temperament | Athletic, impulsive, loyal to his neighbourhood (LOCKED) | Observant, resourceful, community-minded (LOCKED) | Confident and privileged; gradually confronts the unequal systems around him (LOCKED) |
| Personal stake | His street's lights, his friends' jobs, and Tayo's danfo (PROPOSED) | Her mother's/aunt's stall and the parts prices that strangle Mushin's mechanics (PROPOSED) | He discovers his own estate's "never a blackout" is paid for by other people's darkness (PROPOSED) |
| Arc | Learns that a punch starts a fight but a plan ends one (PROPOSED) | Learns to trust others with the plan instead of carrying it alone (PROPOSED) | Moves from tourist to ally: gives up a comfort to open a gate for others (PROPOSED) |
| Combat identity | Punch/kick, Street Kick, future Football Volley (see Gameplay Bible) | Shove/control | Daze/control |

**Current implementation (EXISTING):** story lines are shared and address the player generically ("small one"); there is
no per-fighter dialogue. Distinct dialogue is PROPOSED (section 9).

---

## 4. Supporting cast

| Character | Role | Tag |
| --- | --- | --- |
| **Mama Put** | Food-stall owner at Ojuelegba; a genuine ally from first scene to last; the street's memory and conscience. Speaks light Pidgin. Never a secret villain. | LOCKED (ally); EXISTING (present in prologue and every district) |
| **Mama Put Mutual** | Her cooks' and traders' network; allied faction (`factions.ts`). | EXISTING |
| **Ore Street Watch** | Allied neighbourhood watch at Ojuelegba (`factions.ts`). | EXISTING |
| **Bayo** | Knowingly helped the Ring (PROPOSED detail: kept a Ring ledger of who paid "dispatch fees" at Ojuelegba). Later helps the heroes, but **faces accountability**: he does not escape consequences because he switched sides. | LOCKED (arc); not in code |
| **Bayo's broken promise to Mama Put** | **Provisional, undecided.** Working option: he promised to keep her stall's power line off the Ring's blackout list and sold the list instead. | PROPOSED (provisional) |
| **Tayo** | Danfo driver whose bus is impounded at the start; the human face of the Ring's control of transport. | PROPOSED |
| **The Chairman** ("Baba Alaga" in existing content) | Unseen mastermind. Never fought, never shown, never a playable boss; heard through UNKNOWN NUMBER messages and calls, read as "- C." | LOCKED (unseen, not a boss, escapes); EXISTING (`BROKER`, `neverShown: true`) |
| **The final territorial enforcer** (working title **"The Landlord"**) | Original fictional enforcer who "owns" Ojuelegba's blocked routes and control equipment. Introduced in the prologue; final boss of mission 21. "The Landlord" is a working title, not a confirmed name. | LOCKED (role, prologue introduction, final boss); name PROPOSED (working title); not in code |

### Mama Put and Bayo (PROPOSED beats, arc LOCKED)

1. Prologue: Bayo is Mama Put's regular customer and fixer; she trusts him.
2. Oshodi to Fadeyi: clues show someone at Ojuelegba is feeding the Ring its list. Mama Put defends Bayo.
3. Ebute Metta: the freight manifests carry Bayo's mark. Mama Put confronts him; the broken promise is revealed.
4. Lagos Island: Bayo hands over what he knows (where the Landlord's control equipment is) to reduce the harm he did.
5. Finale: Bayo helps hold the junction (mission 20) and then **turns himself in to the community** (and, off-screen,
   to fictional authorities). Mama Put does not forgive him on screen; she lets him eat at her stall again, last.

---

## 5. Campaign structure

### 5.1 Existing missions (EXISTING; identifiers LOCKED)

The 18 mission identifiers below are save keys and code ids. They must not be renamed to match documentation.

| # | Mission id | District | Current name | Format |
| --- | --- | --- | --- | --- |
| 1 | `oshodi.approach` | Oshodi | Terminal Approach | field (+ depot raid door) |
| 2 | `oshodi.railEdge` | Oshodi | Rail Edge | field |
| 3 | `oshodi.boss` | Oshodi | Oga Sunmola | boss |
| 4 | `mushin.approach` | Mushin | Spare-Parts Row | field |
| 5 | `mushin.market` | Mushin | Aisle Sweep | field |
| 6 | `mushin.boss` | Mushin | Madam Ronke | boss |
| 7 | `fadeyiSomolu.approach` | Fadeyi/Somolu | Toll Approach | field |
| 8 | `fadeyiSomolu.junctions` | Fadeyi/Somolu | Junction Run | field |
| 9 | `fadeyiSomolu.boss` | Fadeyi/Somolu | Marshal Gbenga Kobo | boss |
| 10 | `ebuteMetta.approach` | Ebute Metta | Yard Approach | field |
| 11 | `ebuteMetta.railYard` | Ebute Metta | Rail Yard Goods | field |
| 12 | `ebuteMetta.boss` | Ebute Metta | Ikenna Wayside | boss |
| 13 | `lagosIsland.approach` | Lagos Island | Ledger Row | field |
| 14 | `lagosIsland.press` | Lagos Island | Press Run | field |
| 15 | `lagosIsland.boss` | Lagos Island | Barrister Tolani Quill | boss |
| 16 | `lekki.approach` | Lekki | Gate Approach | field |
| 17 | `lekki.estate` | Lekki | Estate Sweep | field |
| 18 | `lekki.boss` | Lekki | Bamidele Halcyon | boss |

Ojuelegba (`ojuelegba`) is the hub and prologue with no missions (EXISTING). Sections, unlocks and save shape:
`docs/CAMPAIGN_SECTIONS.md`.

### 5.2 Planned Ojuelegba finale (PLANNED: NOT IMPLEMENTED)

| # | Working name | Intent | Tag |
| --- | --- | --- | --- |
| 19 | Return to Ojuelegba | Reclaim the blocked routes into the junction. | LOCKED (intent); PLANNED |
| 20 | Hold the Junction | Protect neighbourhood access while disabling Ring control equipment. | LOCKED (intent); PLANNED |
| 21 | Break the Ring | Defeat the territorial enforcer through generator-based combat and **physical shutdown of control points**. | LOCKED (intent); PLANNED |

No mission ids, save fields, arenas or content exist for 19–21. Proposed ids follow the existing pattern
(`ojuelegba.return`, `ojuelegba.junction`, `ojuelegba.boss`) but **must not be added** until the finale is built and a
save migration is designed (`ojuelegba` is currently a hub that is always "cleared" in the save).

---

## 6. District stakes and consequences

Bosses: current code/story labels are **EXISTING**. Concept-art aliases ("Oga Mic", "Oga Footbridge" and other Gemini
alternatives) are **not approved canon** (section 12.3).

| District | Boss (EXISTING label) | Gate the Ring keeps (stake) | Existing consequence (EXISTING, `consequence` + flag) | Visible community consequence (PROPOSED) |
| --- | --- | --- | --- | --- |
| Oshodi | Oga Sunmola, Controller of the Interchange | **Movement**: dispatch "fees" decide which buses leave; Tayo's danfo was impounded on this system's order. | Radio net quiet, honest timetables (`oshodi.dispatchBroken`) | Buses leave on time; the impound gate stands open; Tayo's danfo is released (PROPOSED). |
| Mushin | Madam Ronke, the Parts Broker | **Repair**: parts are hoarded and rented back; mechanics cannot fix what the city runs on. | Hoard open, fares fall (`mushin.supplyBroken`) | Mechanics' row busy again; Campus Queen's family stall restocked (PROPOSED). |
| Fadeyi/Somolu | Marshal Gbenga Kobo, Warden of the Toll Junctions | **Crossing**: junctions sold by the hour; footbridge and lanes closed to non-payers. | Junctions open (`fadeyiSomolu.passageFreed`) | Toll bars down; hawkers and pedestrians cross freely (PROPOSED). |
| Ebute Metta | Ikenna Wayside, Keeper of the Timetable | **Freight**: the yard ships Ring cargo at night and holds honest freight. | Yard bells stop, night deliveries end (`ebuteMetta.timetableBroken`) | Day freight trains run; traders' goods arrive (PROPOSED). |
| Lagos Island | Barrister Tolani Quill, Registrar of Receipts | **Proof**: commercial records forged so only Ring-approved traders exist on paper. | Ledgers reach the press (`lagosIsland.recordsExposed`) | Market licences re-issued in the open (PROPOSED). |
| Lekki | Bamidele Halcyon, Steward of the Standby Grid | **Power**: estates bought uninterrupted standby power by selling blackouts to the mainland. | Grid dark (`lekki.gridDark`) | Power rebalanced; Ojuelegba's lanes stay lit (PROPOSED). |
| Ojuelegba (finale) | The territorial enforcer (working title "The Landlord") | **Home**: the Ring's last physical control equipment and blocked routes. | None (not built) | Danfo stop, Mama Put's stall and the junction lit and open; the community, not the heroes, reopens the routes (PROPOSED). |

### 6.1 The Fadeyi → Ebute Metta clue (PROPOSED)

The Fadeyi junction toll boxes are not just cash points: each has a **route switch** wired to a timetable code. Smashing
the last box (Fadeyi boss) exposes a printed switching schedule whose codes match **Ebute Metta freight wagon numbers**.
The Ring opens and closes roads to let its own night freight through. This turns "next district unlocks" into a
discovered link and is a physical object (a broken box, a schedule card), not paperwork collection.

---

## 7. Mission philosophy (LOCKED)

- Missions are **physical and action-driven**: destroy relays, break hoards, hold junctions, hit switches, carry or
  protect people and vehicles, shut down control equipment. Generators are the means (see the Gameplay Bible).
- Avoid repetitive "collect the papers" objectives. Existing `evidenceRun` (Lagos Island: collect ledgers, deliver to the
  press under chase) is EXISTING; future revisions should make it a chase/escort of a physical press drop rather than
  more collection (PROPOSED).
- Every victory gives: a clear result, a progression step or unlock, and a meaningful narrative consequence (section 6).

---

## 8. Optional hometown side missions (PROPOSED, not implemented)

One per protagonist, unlocked after that hometown's related district is cleared, playable by any fighter but written for
its owner (other fighters get neutral lines).

| Fighter | Working title | Location | Hook |
| --- | --- | --- | --- |
| Street Baller | Free Tayo's Danfo | Ojuelegba | Escort Tayo's released danfo past the last Ring wardens to the stop. |
| Campus Queen | Restock the Row | Mushin | Protect the mechanics' row while the opened hoard is shared out. |
| Lekki Boy | Lights for the Other Side | Lekki Phase 1 | Shut down the private feeder his own estate uses to drain the mainland line. |

These would be section-style field missions and need new mission ids, save entries and a migration; none exist.

---

## 9. Dialogue direction (PROPOSED)

Short, distinctive lines: one or two sentences, Pidgin where natural, never mocking. Proposed examples (to be reviewed;
none shipped):

| Moment | Street Baller | Campus Queen | Lekki Boy |
| --- | --- | --- | --- |
| Prologue, blackout | "Na only our side dey dark again. I no like am." | "Every street lamp dey on, except ours. That is a list, not a fault." | "We never lose power at home. I never asked why." |
| Oshodi clear | "Tayo's bus go move today." | "One gate open. Five to go." | "So this is what 'traffic' costs people." |
| Bayo revealed | "Bayo? You chop with us!" | "You sold her line. Say it to her face." | "He did what my estate does. Just smaller." |
| Chairman escapes | "Make him run. We dey here." | "He kept the shape. We kept the street." | "He'll find another estate. We'll be there too." |

Implementing per-fighter lines needs a small content hook (a `byFighter` map on `StoryLine` or parallel line sets) and
tests; it is a future content task, not part of this Bible.

---

## 10. The ending (LOCKED shape)

- The heroes defeat the Ring's **operational network**: all district keepers and the territorial enforcer fall.
- Ordinary residents **visibly regain** access to transport, markets and electricity.
- **The Chairman escapes.** The ending must still feel like a victory: the gates are open, the community holds them, and
  the Chairman has lost every lever he used. His escape is a loss *for him* (nothing left to sell), not a defeat for
  the street.
- EXISTING: the finale scene (`FINALE`, `ENDING` in `story.ts`) plays after Lekki: estates go dark, the Chairman speaks
  his last lines and leaves by a pale boat from the lagoon-side jetty, with a vague season-two teaser.
- PROPOSED reconciliation: when missions 19–21 exist, the jetty escape moves to **after Break the Ring**; the Lekki
  ending becomes an interim beat ("the estates go dark, but Ojuelegba is still locked") that leads home. Until then, the
  existing Lekki finale stays as shipped.

---

## 11. Locked/Existing/Proposed summary

| Topic | Tag |
| --- | --- |
| The Ring, control-of-access theme, blackout + impounded danfo opening | LOCKED |
| Three protagonists, homes, temperaments, shared mission structure | LOCKED |
| Mama Put genuine ally | LOCKED |
| Bayo helped the Ring knowingly, later helps, faces accountability | LOCKED |
| Bayo's exact broken promise | PROPOSED (provisional) |
| Chairman unseen, never a boss, escapes | LOCKED |
| Final Ojuelegba enforcer, introduced in prologue, fought in mission 21 | LOCKED (role); name PROPOSED |
| 18 mission ids and six boss labels | EXISTING |
| Missions 19–21 | LOCKED intent, PLANNED (not built) |
| Tayo, personal stakes, arcs, side missions, dialogue samples, Fadeyi→Ebute clue | PROPOSED |
| Boss nicknames "Oga Mic", "Oga Footbridge" and other concept-art aliases | EXISTING in code, **not canon**, legal review pending |

---

## 12. Reconciliation with existing documentation and code

### 12.1 What stays authoritative where

| Source | Status after this Bible |
| --- | --- |
| `docs/CAMPAIGN_STORY.md` sections 1–3 (premise, broker, districts) | **Superseded for narrative** by this Bible; kept as the historical record of the shipped content. Its table of mechanics, rewards, flags and replay modifiers remains accurate for the code. |
| `docs/CAMPAIGN_STORY.md` section 4 (rewards, unlocks, flags) | Still accurate (code reference). |
| `docs/CAMPAIGN_STORY.md` section 5 (ethics checklist) | Still in force. |
| `docs/CAMPAIGN_STORY.md` section 6 (art/audio needs) | Still accurate as a production list; aliases there are presentation only. |
| `docs/BOSS_INSPIRATIONS.md` | Internal research record; **not canon**. Its real-person references are flagged in 12.3. |
| `docs/CAMPAIGN_SECTIONS.md` | Authoritative for section structure and mission ids. |
| `src/campaign/content/**` | The shipped text. Not changed by this Bible. |

### 12.2 Differences between the shipped content and this Bible

| Topic | Shipped (EXISTING) | This Bible | Action |
| --- | --- | --- | --- |
| Opening | Blackout on Ojuelegba's lane; a bus held at the park gate | Same, plus Tayo's impounded danfo | PROPOSED content addition; no conflict. |
| Protagonist | One generic player ("small one") | Three protagonists with distinct voices | PROPOSED content hook (section 9). |
| Bayo, Tayo, the Landlord | Absent | Present | Not in code; future content. |
| Final enforcer | None; Ojuelegba is a no-fight hub (decision CL8 reserved it for a future boss) | Ojuelegba enforcer, missions 19–21 | Consistent with CL8; not built. |
| Where the Chairman escapes | After Lekki (jetty) | After mission 21 once built | Keep shipped finale until 19–21 exist (section 10). |
| "Season two beyond the lagoon" teaser | Shipped | Not required by the Bible | Keep as EXISTING; founder may revise. |
| Boss nicknames | "Oga Mic", "Oga Footbridge" shipped (decision CL7: provisional) | Not canon | Legal review (12.3). |

### 12.3 Founder decisions needed

1. **Legal review of the Oshodi and Fadeyi presentations** (nicknames, titles, looks) against their recorded real-world
   references. Recommendation: replace both nicknames and any reference-derived regalia with neutral fictional ones
   before further art or voice work; remove the real names from `docs/BOSS_INSPIRATIONS.md` or restrict that file.
2. Final name for the territorial enforcer ("The Landlord" is a working title).
3. Bayo's broken promise (working option in section 4).
4. Whether Tayo is adopted, and whether the Lekki finale scene moves after mission 21 when the finale is built.
