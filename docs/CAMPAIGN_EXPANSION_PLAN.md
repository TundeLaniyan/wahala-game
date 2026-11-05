# Campaign expansion plan: field missions, classic raids, health and damage, short text and narration

Branch `claude/wahala-campaign-online-v1` (continuing after the experimental release `0c8490e`). **Nothing here is deployed or merged.** GitHub Pages stays a static front-end build; online, voice and real-backend flags stay off by default. Contracts: `src/sim/campaign/types.ts`. Existing campaign docs: `CAMPAIGN_ARCHITECTURE.md`, `MISSION_SIM.md`, `CAMPAIGN_STORY.md`, `CAMPAIGN_UI.md`.

## 1. Two mission formats

| | Field mission | Classic raid |
| --- | --- | --- |
| Screen | large scrolling district (the City Rumble arenas, follow camera) | one small fixed screen (the whole arena is always visible) |
| Movement | the existing grid movement | cardinal grid movement only; the mobile **cross control** (D-pad), keyboard, gamepad |
| Bombs | radial (the Rumble disc) | **cross** (the classic plus), stops at walls |
| Content | streets, pursuits, vehicles and traffic, enemy groups, destructible obstacles, objective markers, optional buildings and side routes, a return route | cargo, crates, barrels, enemy waves, conveyor belts and moving shipments, locked areas and opened routes, optional side rooms, extraction |
| Ends | objective done, then walk the return route | objective done, then extract |

A raid can sit inside a field mission: the player walks the district, steps on a **door** (warehouse, depot, station, under-bridge, yard, house), plays the raid, and returns to the field map where they left it. A district is split into several **sections**; each section holds field missions and raids and unlocks the next, so the player reclaims the district piece by piece.

## 2. Rules fixed by this plan

- **Bomb geometry is selected by the ruleset, never by a toggle.** `src/sim/modes.ts` gets an exhaustive `BLAST_RULE_BY_GAME: Record<GameKind, BombRule>` (classic, raid = cross; survival, deathmatch, team, mission(field) = radial). A new `GameKind` fails to compile until it names its rule. The menu control (Settings / Setup / Ready summary) and `GameSettings.rumbleBlast` are removed; Rumble and multiplayer keep the existing radial behaviour unchanged.
- **Campaign damage model** (separate from the multiplayer one-hit rules; only for players that carry `Vitals`): hits reduce health segments; a brief daze or knockback can happen without removing a segment; zero health = defeated. Order of protection, always visible: temporary invulnerability frames after a hit (shown as a flash), then Okada, then Armour (each absorbs one lethal event and is consumed in front of the player: the existing shield rules), then health, then campaign lives. Nothing is applied silently: every outcome has an event (`campaignHit` with a result) and a HUD cue.
- **Enemy durability by kind** (`src/sim/data/enemies.ts`): agbero (punch only) 1; guard 2; thrower 2 and slower; heavy 3 or 4; lieutenant and boss have a visible boss bar. Regular enemies show a small bar or damage pips only when targeted, damaged or close, never permanently over the screen.
- **Enemy attacks:** punches, bottles, bricks, stones, thrown tools, blocking and surrounding, reinforcement calls. Enemies do not use the generator economy. Projectiles: visible launch cue, readable path, clear collision result. Common projectiles = small damage, knockback or a short daze; strong projectiles = a segment, slower and clearly telegraphed. No instant unavoidable kills, a hard cap on projectile rate per enemy and per group, individually weaker than the player, dangerous as a group (surround, restrict routes).
- **Text:** every briefing and story scene shows a one or two sentence summary, a short objective card, an optional Read more, a Skip / Continue control and an optional Listen button. Narration is a data model plus an optional audio provider that fails safely (text stays). A future entitlement hook (no payment code) can gate full narration, extended lore or alternate performances; core mission meaning is always free.
- Multiplayer, Rumble, Classic Battle and the existing six boss missions are unchanged unless a test in this plan says otherwise.

## 3. Workstreams and file ownership

| worker | owns | delivers |
| --- | --- | --- |
| `combat-core` | `src/sim/systems/campaignDamage.ts`, `src/sim/data/enemies.ts`, `modes.ts` bomb rules, removal of the bomb toggle (`app/settings.ts`, `app/names.ts`, `ui/menu/SetupScreen.tsx`, `ReadyScreen.tsx`, `app/setupSummary.ts`) | bomb rule table, `Vitals`, `applyCampaignHit`, shield / lives interplay, enemy health, damage events, tests |
| `combat-attacks` | `src/sim/systems/projectiles.ts`, `src/sim/data/enemyAttacks.ts`, `src/ai/enemy*.ts` | projectiles with telegraph, path and collision; enemy attack behaviour and group tactics (surround, block, reinforce) with rate limits |
| `raid-sim` | `src/sim/raid/**`, `src/sim/arenas/raid*.ts` | the classic raid runtime and layouts: cargo, crates, barrels, conveyors and shipments, locked areas, optional rooms, waves, extraction, 4+ reusable layouts, the warehouse slice |
| `field-sections` | `src/campaign/**` (sections, save, progress), `src/sim/mission/**` field extensions, `src/app/campaign.ts` transitions | districts divided into sections, new field objective kinds, doors, the field to raid to field transition, per-section save and resume |
| `story-hud` | `src/ui/campaign/**` (cards, briefing, story), `src/campaign/narration/**`, campaign HUD (health meter, protection chips, enemy bars) | short text cards with Read more, narration model, provider and fallback, entitlement hook, the visible health meter |
| `raid-render` | `src/render/**` for raids, `src/input/dpad*`, `ui/TouchControls` cross mode | fixed-screen raid art, cargo / conveyor / door / projectile / damage-feedback views, the mobile cross control |

## 4. Tests to deliver (targeted, no full release gate)

Radial bombs in Rumble and multiplayer; cross bombs in raids; no bomb toggle in the UI; health reduction; death at zero; Armour and Okada interplay; enemy health thresholds; damage feedback events and views; projectile warning and collision; fixed-screen cardinal movement; mobile cross control; cargo destruction; optional rooms; field to raid transition; summary and Read more; narration fallback; save and resume after a completed section. Browser smoke: one field mission, one raid, cross control, cargo destruction, projectiles, health, bomb selection.

## 5. Status

Filled in at the end of the work in `docs/CAMPAIGN_EXPANSION_STATUS.md` (complete / placeholder / playtest steps).
