# WAHALA! campaign story, bosses and content (branch `claude/wahala-campaign-online-v1`)

Owner: the `campaign-content` worker. Code: `src/campaign/content/**` (data), `src/campaign/progress.ts` + `save.ts` (pure logic), exported through `src/campaign/index.ts`. Tests: `tests/campaign-content.test.ts`, `tests/campaign-progress.test.ts`. Contracts: `src/campaign/types.ts` (optional fields only were added: `BossDef.nickname`, `defeatSequenceOusted`, `consequenceFlags`, `CampaignContent.broker`).

## 1. Premise

A quiet network the street calls **the Ring** (the Oruka Ring) runs Lagos from behind the scenes: it sequences buses, rents back the spare-parts supply, sells passage at junctions, writes the railway yard's timetable, keeps the island's receipts, and finally sells standby power to the estates that never want a blackout. Each link has a "keeper" who thinks he (or she) is untouchable. The player, starting at the Ojuelegba underbridge with Mama Put's tip, takes the Ring apart one district at a time, using the ordinary WAHALA! toolset (generators first) under a different verb in every district.

Order (= `MISSION_IDS`): Ojuelegba (hub, prologue) -> Oshodi -> Mushin -> Fadeyi/Somolu -> Ebute-Metta -> Lagos Island -> Lekki -> finale.

Everything is fictional: names, factions, signs, buildings, biographies. The real places (Oshodi, Mushin, Lekki ...) lend their cultural texture only: the transport park, the parts market, a junction, a rail yard, a trade-record quarter, a gated estate. The ordinary workers, traders, drivers and rail staff of those places are never the enemy: two allied community factions (Ore Street Watch, Mama Put Mutual) exist precisely to say so.

## 2. The broker: "the Chairman" (Baba Alaga)

| | |
| --- | --- |
| Name / title | Baba Alaga, "the Chairman of the Oruka Ring" (invented: "alaga" is a Yoruba word for a ceremonial chairperson) |
| Role | The unseen central power broker. He never fights the player. |
| Biography (fiction) | Started as a motor-park treasurer who learned that whoever keeps the schedule keeps the street, then bought the schedule. He holds no office; he holds the numbers people call when something must be arranged. Soft-spoken, proverb-heavy, signs only "- C." |
| Public image | Inspired only by the general public image of a powerful behind-the-scenes "godfather" of a big city's infrastructure and street politics. No real person's name, face, voice, exact biography, family, party or branding is used. |
| Heard through | `UNKNOWN NUMBER` messages (each district briefing has one), calls inside the boss intros and defeat scenes (`THE CHAIRMAN`), stamped notes (a circuit ring with a lit window), ledger headings that say only "C.". |
| Seen as | A silhouette behind frosted glass or a car window and a pale boat leaving the lagoon-side jetty in the finale. Never a face, never a model, never a portrait. |
| End | The empire collapses; he escapes unseen; a season-two teaser ("Eko is bigger than six districts ...") closes the campaign. He is never caught in-game. |

**Never-shown rule (binding):** no art, animation, model, mural, portrait, voice clip or cameo may show or impersonate him. Only audio of a calm anonymous voice may be commissioned later, with fictional text, and only with a founder assignment (see CLAUDE.md audio rules). Tests (`campaign-content.test.ts`) enforce that his lines are flagged `fromBroker`, that no boss borrows his name and that the finale never has him captured.

## 3. Districts and bosses

| # | District (id) | Boss (fictional) | Faction (crew) | Mechanic (`objectiveKind`) | Cultural inspiration | Reward | Consequence | Replay modifier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Ojuelegba (`ojuelegba`) | none (hub, prologue) | Ore Street Watch, Mama Put Mutual (allied) | none | The underbridge, Stadium Road junction, danfo stop | none | Mama Put's tip: "go where the schedule starts" | none |
| 1 | Oshodi (`oshodi`) | Oga Sunmola, Controller of the Interchange (vertical slice) | Orita Park Wardens (+ Blue Trailer convoys) | `dispatchRelays`: jam relays; live relays call convoy strikes | Motor-park dispatch and the great bus interchange | Interchange Hi-Vis (costume, Street Baller) | The radio net goes quiet; buses run on honest timetables; Mushin opens | Rush Hour Dispatch (`rushHourDispatch`) |
| 2 | Mushin (`mushin`) | Madam Ronke, the Parts Broker | Sparehand Runners | `supplyRoutes`: blast parts stacks; runners restock | Spare-parts markets, umbrellas, haggling | Route Memory (perk, informational) | The hoard opens to every mechanic; fares fall; Fadeyi/Somolu opens | Market Day (`marketDay`) |
| 3 | Fadeyi / Somolu (`fadeyiSomolu`) | Marshal Gbenga Kobo, Warden of the Toll Junctions | Kobo Route Marshals | `junctionAccess`: hold junction zones against marshals | Junction and route control, the footbridge, BRT lane, bank frontage | Free Crossing (title) | Junctions open to everyone; Ebute-Metta opens | Toll Season (`tollSeason`) |
| 4 | Ebute-Metta (`ebuteMetta`) | Ikenna Wayside, Keeper of the Timetable | Iron Lane Switchmen | `dispatchWindows`: hit switches only inside timed rail windows | Railway heritage station, working yard, waterfront terminal | Signalman's Lamp (costume, Campus Queen) | The yard bells stop; night deliveries end; Lagos Island opens | Express Timetable (`expressTimetable`) |
| 5 | Lagos Island (`lagosIsland`) | Barrister Tolani Quill, Registrar of Receipts | Receipts and Reconciliation Bureau | `evidenceRun`: collect ledgers, deliver to the press while auditors chase | Trade houses, civic dome, bridge approach, market lanes | Open Record (perk, informational) | Ledgers reach the press; the bureau is dissolved; Lekki opens | Audit Week (`auditWeek`) |
| 6 | Lekki (`lekki`) | Bamidele Halcyon, Steward of the Standby Grid | Gatehouse Private Guard (+ Office of Network Continuity) | `contingencyGrid`: switch systems off in order; a wrong switch calls a strike | Gated estates, private standby power, illuminated plaza, lagoon promenade | Ring Breaker (unlock: finale, title, Standby Black costume for Lekki Boy) | The grid goes dark; the finale opens; the Chairman leaves by the jetty | Long Blackout (`longBlackout`) |

Personalities (each has a distinct voice): Sunmola, silky radio announcer ("unit", "mind the closing doors"); Ronke, warm haggler ("my dear", "customer"); Kobo, formal procedure and receipts ("kindly state your business at the crossing"); Wayside, soft-spoken, exact to the minute; Quill, polished legal contempt ("noted and dismissed"); Halcyon, serene hospitality with a chill ("we regret the inconvenience"). The allies speak in light Nigerian Pidgin (Mama Put); the bosses' registers differ on purpose.

Campaign map (`mapPos`, 0..100, x right, y down; mainland north-west, island south-east): Oshodi (20,30), Mushin (36,38), Fadeyi/Somolu (50,30), Ojuelegba hub (34,52), Ebute-Metta (52,60), Lagos Island (68,74), Lekki (88,82).

Arena ids used (`DistrictContent.arenaId`, the City Rumble community stages): `rumbleOjuelegba`, `rumbleOshodi`, `rumbleMushin`, `rumbleFadeyi`, `rumbleEbuteMetta`, `rumbleLagosIsland`, `rumbleLekki`. If the mission-sim worker defines dedicated mission arenas, change `arenaId` in the district file only.

## 4. Rewards, unlocks and flags

Rewards never change the match rules or balance. Perks are informational conveniences (campaign map intel, a record of stars/times) and say "no effect on missions"; costumes and titles are cosmetic. Unlock ids: `costume.<characterId>.<name>`, `title.<name>`, `perk.<name>`, `modifier.<modifierId>`, `district.<districtId>`, `finale.unlocked`.

Paid once: only the first clear of a district pays its reward, sets its consequence flags (`<district>.cleared` plus `oshodi.dispatchBroken`, `mushin.supplyBroken`, `fadeyiSomolu.passageFreed`, `ebuteMetta.timetableBroken`, `lagosIsland.recordsExposed`, `lekki.gridDark`) and opens the next district. Rewards, unlocks and flags are rebuilt from the cleared districts when a save is repaired, so a damaged save can neither lose nor invent a reward. The replay modifier unlocks after the first clear (`availableModifiers`). `applyMissionResult(...).campaignComplete` is true only for the result that clears the sixth district; `completeCampaign` records that the finale was watched.

## 5. Ethics and legal-cultural review checklist

Run before any text, art or audio for this campaign ships. Tests cover items marked (T).

- [ ] (T) No real person's name appears anywhere in code or content (denylist test in `tests/campaign-content.test.ts`: public figures, nicknames and titles of real politicians).
- [ ] (T) No real union, agency, party, utility or company is named; factions are invented (denylist test: real unions, traffic and anti-graft bodies, state government, oil and utility companies). "BRT", "Red Line" and "Link Bridge" appear only as generic words and never with operator branding or logos.
- [ ] The Chairman has no real person's face, voice, biography, family or branding; he is never rendered; his invented name does not match a real person (check with a search before shipping a voice).
- [ ] No depiction of real agencies, unions, drivers, traders, riders or railway staff as criminal: crews are fictional factions; honest workers appear as bystanders and allies (Ore Street Watch, Mama Put Mutual).
- [ ] (T) No demeaning language about communities, regions, occupations or social groups; Pidgin is affectionate and never mocking.
- [ ] Signage on landmarks is invented or generic ("TO THE ISLAND", "Pillar & Co Bank", "Halcyon Court"); murals are symbols only (no portrait of a real person, including musicians).
- [ ] Costumes avoid real uniforms, vests, party colours and logos; palettes are the fictional faction palettes in `factions.ts`.
- [ ] Violence stays in the game's established register: generators, blasts, no gore, no real-event references.
- [ ] Defeat scenes end in the empire collapsing and the community regaining something (honest timetables, open junctions, fair prices), never in humiliating a real group.
- [ ] A native-speaker review of the Pidgin and Yoruba/Igbo-origin names before any voice recording.
- [ ] Season-two teaser stays vague and fictional.

## 6. Art, animation and audio still required (per boss)

Nothing here blocks the code; the maps and render workers use `visualDirection`, `landmarks` and `artNeeds`.

| Boss | Model / costume | Animation | FX / props | Audio |
| --- | --- | --- | --- | --- |
| Oga Sunmola | Boss variant of the street rig: yellow dispatch coat, headset, whistle lanyard | Conducting idle, hand-to-ear call-out, defeat (headset drops) | Relay-jam FX, convoy lane decals, relay masts on canopies | Synthesised loudspeaker crackle; voice only with founder assignment |
| Madam Ronke | Campus rig variant: red wrapper, apron, key ring | Counting-notes idle, restock gesture, defeat (canopy collapse) | Tyre towers, engine blocks, brake-pad crates, red umbrellas, restock FX | Synthesised market ambience cues (no recordings) |
| Marshal Kobo | Lekki rig variant: green vest, cap, wand, ledger | Waving a car through then stopping it, defeat (box repainted) | Green hold ring and orange toll bar decals, route-open FX | Whistle and wand-beep cues (synth) |
| Ikenna Wayside | Street rig variant: pale suit, pocket watch, signal lamp | Watch-check idle, lever pull, defeat (clocks stop) | Window countdown ring, switch props, signal lamps | Bell and clock-tick cues (synth) |
| Barrister Quill | Campus rig variant: burgundy coat, portfolio, pen | Spectacles-adjust idle, stamp, defeat (ledgers fly) | Ledger stacks and pages, press-drop prop, carrier-chase marker | Rubber-stamp and paper cues (synth) |
| Bamidele Halcyon | Lekki rig variant: cream linen, tablet, glass | Sip-and-check idle, switch-panel gesture, defeat (lights go out in rings) | Lettered switch panels, contingency-strike ring FX | Generator hum and breaker-click cues (synth) |
| The Chairman | No model. Silhouette sprite only (behind glass / on the jetty) | none | Stamped-note UI asset (circuit ring with a lit window) | A single calm anonymous voice may be commissioned later (founder assignment) |

Maps worker: landmark anchors per district are in `DistrictContent.landmarks` (3 each: Ojuelegba overpass mural / Stadium Road junction / danfo stop; Oshodi interchange flyover / terminal canopies / rail and market edge; Mushin Red Line footbridge / Idi-Oro food hub / parts umbrellas; Fadeyi footbridge / BRT lane / bank frontage; Ebute-Metta station sign / yard and signal gantry / Iddo-style terminal; Lagos Island civic dome / bridge approach / Marina and market; Lekki Link Bridge / Admiralty plaza signage / promenade palms).
