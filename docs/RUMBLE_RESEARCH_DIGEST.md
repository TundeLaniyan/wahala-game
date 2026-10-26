# WAHALA! City Rumble Evolution - research digest

The founder's late research pack (26 October 2026) arrived after Phase 0 and the assisted-movement workstream were
done. It holds four documents, all read by the lead:

| # | Document | Status given by the pack |
| --- | --- | --- |
| 01 | `01_START_HERE_DECISIONS.md` - reconciliation and prototype-decision memo | binding reconciliation; "not a coding instruction" |
| 02 | `02_PRIMARY_LEVEL_DESIGN_RESEARCH.md` - Environmental Research & Level-Design Bible (549 lines) | recommended primary level-design baseline |
| 03 | `03_LAGOS_ENVIRONMENT_RESEARCH.pdf` - Lagos Game Environment Research (24 pp.) | visual and cultural reference; UE5 references are aspirations only |
| 04 | `04_ALTERNATIVE_ARENA_BIBLE.pdf` - Alternative arena bible (26 pp.) | additional ideas; its numbers are design hypotheses, not rules |

The pack itself is not committed (it cites third-party media with mixed rights); this digest records what was taken
from it. Source-of-truth order (memo 01): existing engine source > explicit founder decisions > tested prototype
observations > reconciled design hypotheses > individual report prescriptions.

## 1. Gameplay: what the research changed, and what it did not

| Research point | Verdict | Where |
| --- | --- | --- |
| Classic keeps the cross; Rumble radial blast is a separate, measured mechanics change | **Adopted** (already Phase 0). The radial blast stays the Rumble default (founder brief) and is now also behind an explicit Rumble-only switch, `rumbleBlast: 'radial' \| 'cross'`, so the two can be compared in play (memo: "prototype behind an explicit Rumble-only feature toggle or experiment variant") | RE-L2, `modes.ts`, Setup screen "Blast shape" |
| Decide circle metric, LOS / supercover, destructible absorption, corner contact before coding | **Adopted / documented**: Euclidean tile-centre disc `dx^2+dy^2 <= R^2+R` (= within R + 1/2 of the centre, not a Chebyshev square); thin centre-to-centre line that crosses exact corners diagonally + the outward wave (no squeeze between two blocked corners); crates absorb and break; one playable layer, so no vertical layers | RE-B1, RE-B2, RE-L4, `blastShape.ts` |
| Permanent structural objects block blasts; destructible cover blocks its triggering pulse then stops blocking; decor never changes damage cells | **Already true** (tile kinds are the only blast input; decor is render-only) | `tests/radial-blast.test.ts` |
| Measure eliminations and escape fairness at 8 / 16 / 24 / 32 with several generators; bots must understand footprints | **Adopted** into the bots and economy briefs | sections AI and C of `RUMBLE_EVOLUTION.md` |
| Combat test metrics: first meaningful encounter (~5-10 s), no routine 15 s empty traversal, eliminations by cause, active generators, pickup use, spawn fairness | **Adopted** into `scripts/rumble-metrics.ts` brief | section C |
| Extra starting generators / new power-up sources are "optional balance experiments" | Founder has since decided **two starting generators** in Rumble (kept); measured legacy vs evolution | RE-C1 |
| Generator HP 120, falloff 40->10, blast radius 4 m, max 2 simultaneous, 20 s chain cooldown, hazard damage caps, HP penalties | **Rejected** (no health model, no cooldowns or caps) | - |
| Two-level / deck combat, ladders, launches, rooftop play | **Rejected for this milestone**; one playable elevation, flyovers are architecture | RE-D* |
| Falling containers / debris at Ojuelegba (real fatal incidents 2015-2023) | **Rejected**; a signalled bus pull-out instead; marked container lowering reserved for Apapa | RE-E* |
| Agbero shoves / chip damage, crowd surges as damage, NPC throws disguised as ambience | **Rejected**; NPCs are presentation only | RE-E* |
| Generator "state changes" (blackouts, ramps, slicks, smoke) per blast | **Deferred** (needs explicit approval and fairness work) | roadmap |
| Rain presets, traction loss, slow zones | **Deferred**; never as surprise control drift | roadmap |
| Navmesh, splines, diagonal movement, 2 m cells | **Rejected**; the square grid stays authoritative, curved roads are dressing | - |
| UE5 Nanite / Lumen / Niagara / HLOD / Mass, VAT crowds of 150 | **Rejected** as engine direction; translated to instancing, merged geometry, baked light, budgets | RE-E* |

## 2. Ojuelegba (the first prototype) - research the stage is built against

From 02 section 5 and memo 01 (J-A..J-E), with the PDFs as visual/cultural colour:

- **Districts and screen bands:** far / north = Rear Service Loop; centre = Western Approach | Pier Court | Eastern
  Danfo (bus) pocket; near / south = Shopfront Lane and the bus pocket's crossing refuge.
- **Always-open links:** Approach-Pier Court, Pier Court-Danfo Park, Approach-Shopfront, Shopfront-Danfo Park,
  Approach-Rear Loop, Rear Loop-Danfo Park. **Destruction-added:** Pier Court-Rear Loop through a marked empty
  workshop-yard partition. Three Approach-to-Danfo-Park paths: pier court, shopfront flank, rear loop.
- **Pier court:** few large piers, unequal bays, offset sightlines; never evenly spaced columns.
- **Vehicles:** summoned attacks Approach -> pier-court road strip -> Danfo Park, between the big supports, never
  through walking gaps; ambient flyover traffic is visual and non-colliding.
- **Hazard:** signalled bus pull-out (horn, lit road markers, safe pavement recesses); warnings long enough from every
  affected cell; suppressed when another system would remove every escape.
- **Look:** heavy concrete piers and beams with tonal variation, asphalt patches, raised kerbs, shutters, modest
  frontages, repairs; reflected light under the deck so the floor stays readable (shade with a hard sun wall at the
  deck edges); fictional posters and murals; VW-Transporter-style yellow Danfos with black stripes and invented plates
  packed nose-to-tail. Palette hints: soot concrete #5E5A55, danfo yellow #F2C200, LED white #E8F4FF, sodium #FF9F3A.
- **Camera:** cut the central deck away consistently, keep beams and outer edges; never hide fighters, generators or
  warnings; tall massing on the far side.
- **People:** commuters and food sellers at the bus stop, conductors and (fictional) park touts at the bus pocket edge,
  traders and window spectators beyond the shopfront barrier, roadside mechanics at the rear loop; never obstacles,
  loot or targets.
- **Respect and rights:** fictional businesses, signage, plates and union; no real logos, operators or union names
  (NURTW / RTEAN, LAMATA / BRT colours); no Wizkid / Fela names, likeness, lyrics or audio; recognition from
  architecture, not a place-name billboard; commercial okadas are banned in Surulere / Lagos Mainland since 2022, so
  Ojuelegba shows no okada traffic or clusters (the Okada mount itself is unchanged); no real tragedy restaged.
- **Gates still to pass with people:** recognition from unlabelled stills by Lagos-familiar reviewers, and real-phone
  performance; neither can be done in the build container.

What the Ojuelegba and living-environment workstreams adopted, adapted or deferred is listed in their sections of
`RUMBLE_EVOLUTION.md` (D and E).

## 3. Deferred to future arenas (carried into `RUMBLE_ROADMAP.md`)

- **Oshodi** (02 s.3): terminal forecourt, bus loading apron, concourse spine, transfer street, service court; open
  A-C, A-D, C-B, B-D, C-E, E-A, breach E-B (pallet barrier); a bus departure lane that never moves while its warning
  is hidden behind a parked bus; the skywalk as a cutaway landmark, not a second layer.
- **Lagos Island Markets** (02 s.4, second systems test): textile street, junction, loading court, covered passage,
  neighbourhood edge; outer loop survives every break state; breach through a shuttered stock passage; no route
  through palace grounds or a mosque; Eyo never an enemy, costume or destructible; cultural review before art lock;
  no fire hazard modelled on the December 2025 market fire.
- **Apapa** (02 s.6): gate apron, container canyon, warehouse apron, crane transfer court, quay walk; containers are
  permanent; a fictional marked container lowering into an empty slot (delayed while occupied); public minibuses
  only as explicitly fictional incursions on the wide loop.
- **Lekki** (02 s.7): contraflow carriageway, work strip with plate crossings, materials yard, frontage lane,
  junction crossover; a slow roller sweep; trenches as permanent visible no-go footprints.
- **Surulere** (02 s.8, memo 01, founder lock): separate arena with an enterable stadium and playable pitch (2+
  exits), stands, tunnels, concourse and neighbourhood streets; the research's "bowl backdrop" option is overruled
  by the founder; working title for any stadium name pending legal review; no stadium collapse; crowd surges never
  damage.
- **Campaign:** fictional park-tout antagonists only; no real unions, no glorified extortion.
