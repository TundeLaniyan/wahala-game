# Campaign expansion: status and playtest steps

Branch `claude/wahala-campaign-online-v1` (continues the experimental release `0c8490e`). **Not merged, not deployed.** Plan: `CAMPAIGN_EXPANSION_PLAN.md`. This is an experimental playtest build: the full release gate (CI with every browser shard) has not been run on it.

## Complete (tested)

| area | what exists | evidence |
| --- | --- | --- |
| Bomb geometry by ruleset | exhaustive `BLAST_RULE_BY_GAME`: Rumble, multiplayer and field missions radial; Classic Battle and raids cross; the menu toggle and `GameSettings.rumbleBlast` are gone (an old saved key is ignored) | `tests/blast-rules.test.ts`, `tests/ui/blast-controls.test.ts`, smoke spec |
| Multiplayer unchanged | seeded Survival, Deathmatch, Team and Classic state hashes (config excluded) identical on the combat-core tip and the merged tree | `tests/blast-rules.test.ts`, `tests/mission-regression.test.ts`, `tests/raid-core.test.ts` |
| Campaign health and damage | 4 segments; order: recovery frames, Okada, Armour (each consumed visibly), health, lives; knockback or daze alone costs no segment; zero health defeats | `tests/campaign-damage.test.ts`, HUD tests |
| Enemy durability | agbero 1, guard 2, thrower 2 (slower), heavy 3-4, lieutenant 8 and boss 14 with boss bars; small bars only when targeted, hurt or near | `tests/campaign-damage.test.ts`, `src/ui/CampaignHealth.tsx` |
| Enemy attacks | punches, bottle, brick, stone, tool; cue first (>= 0.5 s), visible path, slower strong objects, rate caps, no generators; surround / block / hold / reinforce directives | `tests/enemy-attacks.test.ts`, `tests/enemy-tactics.test.ts`, `docs/CAMPAIGN_ATTACKS.md` |
| Classic raids | runtime, 6 layouts (warehouse depot is the slice), marked cargo, barrels, conveyors and telegraphed shipments, locked areas, optional rooms, waves, extraction, 3 lives | `tests/raid-*.test.ts` |
| Field sections | 3 sections per district (11 field missions, standalone raids, the existing boss mission last), doors, return route, save v2 with v1 migration, resume on the next section | `tests/field-*.test.ts`, `tests/campaign-sections.test.ts` |
| Field to raid to field | the real Oshodi slice through the real controllers (field, door, raid completed with both optional rooms, return tile, section cleared, next unlocked, saved) | `tests/app/campaign-slice-real-raid.test.ts` |
| Short text and narration | every briefing and scene: <= 2 sentences, an objective card, Read more, Continue, Listen; narration provider fails safely; free entitlement hook, no payment code | `tests/campaign-cards.test.ts`, `tests/campaign-narration.test.ts`, `e2e/campaign-text.spec.ts` |
| Raid presentation | 3 raid looks, cargo / belt / door / exit markers, damage feedback, projectile views, mobile cross control, cardinal-only input | `tests/render/raid-views.test.ts`, `tests/input-raid-cross.test.ts` |
| Browser smoke (desktop and phone) | no blast toggle; field mission with radial bombs and the health meter; classic raid with cross bombs and cargo destroyed by a real cross bomb; an enemy projectile with a recorded hit; the mobile cross | `e2e/campaign-expansion-smoke.spec.ts` |

## Placeholder or not done

- **Only Oshodi section 1 has a scripted full playthrough.** The other ten field missions and five other raids have data checks and per-mechanic tests, and none is tuned against real play (clocks, par times, shipment cadence, wave sizes are first values).
- **Boss missions** keep their crews as generator bots and the boss on the one-hit rules (the human has health). Enemy kinds and boss bars are used by field-section enemies and raids only.
- **Raid enemies are idle in the scripted raid tests**; combat balance for a raid under real enemy pressure is only covered by the enemy-attack harness, not a full raid playthrough with active waves.
- **Narration:** no recordings exist; Listen is shown disabled ("Narration not recorded yet"). The premium gate is an interface only.
- **Art / animation / audio:** raid props are procedural shapes, no convoy or crate glTFs, boss and enemy models reuse the three fighter rigs, no new sounds (existing synthesised cues only). Portrait phone play still shows the rotate card.
- **Bots do not dodge Local Champion or projectile cues**; `block` threatens a tile rather than walling it (players do not collide).
- **Mid-mission state is not saved**; resume means the map opens on the next section.
- **Integration fixes made late:** the session host now forwards the raid methods (the browser smoke found them missing), the human has campaign health in every mission, field-section enemies use enemy kinds.

## Playtest steps

1. `npm install`, then `npm run dev` (http://localhost:5173/) or `npm run build && npm run preview` (http://localhost:4173/wahala-game/). No environment variables are needed; online and voice stay off.
2. Home, then **Campaign**, then **New campaign**. Read or Continue the prologue card (try **Read more**, and **Listen**, which is disabled by design).
3. On the map choose **Oshodi**. Its section list shows Terminal Approach, Rail Edge, then the boss. Start **Terminal Approach** (field mission): follow the objective card, walk the three checkpoints.
4. Hold the **warehouse door** (the "depot" marker): the classic raid starts on a small fixed screen.
5. In the raid: destroy the 3 marked crates with generators (cross bombs: the blast runs along the four lanes and stops at walls), dodge the telegraphed belt shipments and thrown bottles, beat the guards and throwers, open the locked bay when its condition is met, optionally enter the armour room and the heal room, then run to the **exit** once it opens.
6. You return to the field where you left it; walk the return route. The **section result** shows rewards and unlocks the next section; reload the page and **Continue** resumes on it.
7. Watch the **health meter** (4 segments) and the protection chips: Armour or Okada are shown consumed when they absorb a hit; "HIT BY BOTTLE" style causes appear in the rail.
8. Controls: arrows or WASD move (raids are cardinal only), Space or J = A (generator), K / E / F / L / Shift = B (context). On a phone use landscape: in a raid the left control is the four-arrow cross.
9. Debug helpers (only with `?debug`): `__WAHALA__.campaign().debugStartRaid('warehouseDispatchDepot')` starts a raid directly; `?campaign=0` hides the campaign; `?seed=N` fixes the seed.
10. Checks run for this build: `npx tsc --noEmit`, `npx eslint .`, `npm run check:static`, targeted vitest sets, and `npx playwright test e2e/campaign-expansion-smoke.spec.ts --project=desktop --project=mobile`.
