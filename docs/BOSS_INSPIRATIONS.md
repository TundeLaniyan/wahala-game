# District bosses: inspirations, current roster and comparison

Branch `claude/wahala-lagos-enhancement-v1`. Internal design document: real names appear **only here**, never in game content, code, art or audio (`tests/campaign-content.test.ts` and `tests/campaign-bosses-presentation.test.ts` deny them). Research was done by web search on 2026-11-06; **full pages could not be opened for several outlets, so every real-world statement below comes from search-result summaries and must be re-checked before it is relied on.** Nothing here repeats any allegation; only public roles and a neutral risk flag are recorded.

## 1. Existing roster (before this pass)
| District | Boss | Mechanic | Notes |
| --- | --- | --- | --- |
| Ojuelegba | none (hub, prologue, free-play stage) | none | Allies Mama Put, Ore Street Watch |
| Oshodi | Oga Sunmola, "Oga Dispatch", Controller of the Interchange | `dispatchRelays` | radio announcer persona |
| Mushin | Madam Ronke, "Iya Spare", Parts Broker | `supplyRoutes` | |
| Fadeyi/Somolu | Marshal Gbenga Kobo, "Oga Green Light", Warden of the Toll Junctions | `junctionAccess` | formal, bureaucratic persona |
| Ebute-Metta | Ikenna Wayside, Keeper of the Timetable | `dispatchWindows` | |
| Lagos Island | Barrister Tolani Quill, Registrar of Receipts | `evidenceRun` | |
| Lekki | Bamidele Halcyon, Steward of the Standby Grid | `contingencyGrid` | |

## 2. The three approved references and the implemented fictional counterparts
| | Ojuelegba | Fadeyi | Oshodi |
| --- | --- | --- | --- |
| Founder reference | "Igimu" | "Toba Ijaya" | "MC Oluomo" |
| What research could verify | **"Igimu" could not be verified** as a person or title; the nearest match is *Iganmu*, a neighbourhood in Surulere. Ojuelegba itself is a well-documented Surulere junction (its transport culture and its 2014 song are widely cited). | Toba Ajiboye, called Toba Ijaya, a Lagos transport-union organising secretary strongly associated with Fadeyi/Mushin. Search reports say he was **killed in July 2026** and the matter was open. | Musiliu Akinsanya, a Lagos transport-union figure born in Oshodi, later a national officer of that body; his current status is unverified. |
| Association strength | place: strong; person: unknown | strong | strong |
| Public-profile risk (portrayal) | low for the place; unknown for a person | **high** (recent death, open case, family and community) | **high** (living, politically connected, litigious public profile) |
| Fictional counterpart | **Baba Junction** (Oga Adekola), Stop Master of the Underbridge: a cheerful, non-combat local figure | **Marshal Gbenga Kobo, "Oga Footbridge"**, Garage Master of the Fadeyi Crossing | **Oga Sunmola, "Oga Mic"**, Park Master of the Interchange |
| Local connection used | the underbridge danfo stop: conductors calling stops, chalked route board, whistle, kiosk speakers, everyone greets the stop master first | footbridge landing as town square, ticket booklet and whistle, vest and flat cap, hawkers and conductors who greet him first, BRT lane and bank frontage | the microphone and loudspeaker as authority, ceremonial welcomes and a praise-singer, cap-and-vest wardens, a horn-blowing danfo convoy, the interchange and terminal |
| Look | tinted glasses, print shirt under a sleeveless vest, tipped flat cap, whistle, route board | green reflective vest over a print shirt, flat cap, whistle, ticket booklet, chalk route board, wand | park-yellow kaftan with black trim, flat cap with a fictional crest, tinted glasses, headset mic, handheld mic |
| Entourage / entrance | two conductors, water hawker, chalk boy; a whistle and the conductors shouting his name | two marshals, a chalk-board runner, a hawker; a long whistle from the stairs, walks down greeting people | umbrella aide, praise-singer with speaker trolley, two wardens, three danfo; speakers announce him first |
| Voice | teasing Pidgin/Yoruba, speaks in stops and favours, never says which side he is on | warm and loud-friendly, tickets and favours, quiet when offended | ceremony host ("mic check"), praise, "my friend", the speaker whines when angry |
| Combat | none (Ojuelegba stays a free-play stage) | unchanged `junctionAccess` | unchanged `dispatchRelays` |
| Deliberately avoided | any boss fight, any claim about a real person | any reference to the real person's death or any violence story; the name, nickname and any likeness cue | royal or chiefly regalia, slogans, real union naming, any biography |

### Decisions needing the founder
1. **Ojuelegba has no boss in the campaign** (hub and prologue; progression depends on that). The counterpart was therefore added as a non-combat local figure; turning it into a boss needs a story and progression decision.
2. **"Igimu" is unverified.** Please confirm who or what it refers to; the figure is currently an archetype (a junction stop master), not a likeness.
3. **Fadeyi reference carries the highest sensitivity** because the reported death is recent. Implemented as a generic bridge "garage master" with no cue to the person. Recommended: confirm you still want this reference before release, or swap it for a place-based reference (the footbridge itself).
4. The characters keep their ids, mechanic names and rewards, so saves and progression are unaffected; names such as "Oga Sunmola" and "Marshal Kobo" were kept (only nicknames, titles, looks, entourage and voice changed). A rename is a content-only follow-up.

## 3. The four provisional candidates (research only; **not implemented**)
| Candidate | Verification | Geographic association | Recognition | Mechanic fit (existing) | Portrayal risk | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Mushin: "Baba Alado" | one outlet reports the holder died in Sept 2026; single source | medium-strong (Mushin, Papa Ajao) | local elder-statesman | supply routes / parts market | **high**: recent death, party link, family | do not use the person; use a "spare-parts market elder" archetype |
| Lagos Island: "Kunle Poly" | several outlets report him as a Lagos Island transport-union branch chairman and report a 2022 arrest and remand (outcome unverified) | strong (Idumota / Lagos Island) | local to transport circles | evidence run / ledgers (loose) | **high**: publicly reported criminal-justice contact | avoid; use a "Balogun/Idumota ledger-keeper trader" archetype |
| Lekki/Ikate: "Oba Saheed Elegushi" | strongly verified: reigning traditional ruler of Ikate-Elegushi since 2010 | strong | high | standby grid (weak: a monarch is not a utility boss) | **high**: reigning monarch, long-running land and chieftaincy litigation, regulated titles, cultural disrespect risk | avoid; use an "estate facility/generator-fleet manager" archetype |
| Ebute Metta/Oyingbo: "Oloyingbo" | the title is real (Baale/High Chief of Oyingbo; holder named by one outlet, page not opened) | strong | local community figure | timetable windows (moderate) | **medium-high**: living titleholder in a regulated traditional order | archetype only; better fits: a retired railway stationmaster (lowest risk, strongest fit) or an Oyingbo market-association leader |

Alternative archetypes suggested by the research are generic roles with no named person: retired stationmaster (Ebute-Metta), market-association leader (Oyingbo), estate facilities manager (Lekki), parts-market oga (Mushin), trade-ledger alhaji (Lagos Island). **Recommendation: use none of the four named individuals; if replacements are approved, build them as the archetypes above.**

## 4. Comparison across all seven
| District | Before | Now | Proposed next (not approved) |
| --- | --- | --- | --- |
| Ojuelegba | no boss | non-combat Baba Junction | none needed |
| Oshodi | Oga Dispatch (announcer) | Oga Mic, Park Master | - |
| Mushin | Madam Ronke | unchanged | parts-market elder archetype (not the named person) |
| Fadeyi | Oga Green Light (bureaucrat) | Oga Footbridge, Garage Master | - |
| Ebute-Metta | Ikenna Wayside | unchanged | retired stationmaster archetype |
| Lagos Island | Barrister Quill | unchanged | ledger-keeper trader archetype |
| Lekki | Bamidele Halcyon | unchanged | estate facilities manager archetype |

## 5. Sources (search-result level; verify before relying)
Ojuelegba (Wikipedia, OkayAfrica); Fadeyi bus stop (TheCable); Nigerian news outlets on the July 2026 NURTW reports (Gazette, Legit, allAfrica); Oshodi (Wikipedia, ThisDay 2021 and 2024, Nairametrics 2022, BusinessDay); Mushin (Legit); Lagos Island (Guardian Nigeria, Ripples, Gazette); Ikate-Elegushi (ThisDay, Guardian, Leadership, Nairametrics 2026 on chieftaincy titles); Oyingbo (Vanguard 2024, Wikipedia).
