# Campaign combat core: bomb rules, health, damage, enemy durability

Worker `combat-core` of `docs/CAMPAIGN_EXPANSION_PLAN.md`. Decisions CC1-CC6 in `docs/DECISIONS.md`. Everything here is pure simulation (`src/sim`), deterministic, and applies only to players that carry `Vitals`; Rumble, multiplayer and Classic Battle are unchanged (their seeded state hashes equal the base commit's: `tests/blast-rules.test.ts`).

## 1. Bomb geometry is the ruleset's

`BLAST_RULE_BY_GAME` (`src/sim/modes.ts`) is an exhaustive `Record<GameKind, BombRule>`; `modeConfig` applies it through `blastConfig(game, arena)`:

| GameKind | Rule | Config |
| --- | --- | --- |
| classic | cross | `blastMode: 'plus'` (an arena that widens the cross itself, the Power Yard full line, keeps it) |
| survival, deathmatch, team | radial | the unchanged `RUMBLE_ECONOMY` (disc radius 5, two starting generators, rewards) |
| mission (field) | radial | `RUMBLE_ECONOMY` + `campaign` tuning |
| raid | cross | `plus` + `campaign` tuning |

There is no setting: `GameSettings.rumbleBlast` and `MatchSettings.rumbleBlast` no longer exist, Setup has no "Blast shape", and no campaign screen has a blast control. An old saved `rumbleBlast` key is dropped by `sanitizeSettings`. The Ready screen states the radial rule as text only.

## 2. Order of protection for a campaign player

`applyCampaignHit(state, hit, events, options?) -> CampaignHitResult` (`src/sim/systems/campaignDamage.ts`):

1. **Recovery frames** (`vitals.invulnUntil`, spawn protection): an ordinary hit is ignored, result `invulnerable`. A `strong` hit pierces recovery frames only when the hit that started them was not strong; it never pierces spawn protection.
2. **Okada, then Armour** for a lethal-class hit (source `blast` / `vehicle` / `hazard` / `trap`, or any `strong` hit with damage): one layer absorbs it and is consumed (`okadaBroken` + `protectionBroken`, `campaignHit` result `blockedOkada` / `blockedArmour`). Not damage, not a death; it starts the same 1 s of recovery.
3. **Health**: `hp -= damage` (result `damaged`); the daze (`dazedUntil`) and knockback (existing push helpers, never into a wall or a generator) are applied. `damage 0` = `dazed`: no segment lost.
4. **Defeat**: `hp <= 0` calls `eliminate()` (credit, stats, `playerEliminated`) and pushes `campaignDefeated`; result `defeated`.

Health is spent before campaign **lives** (`state.mission.livesUsed`, the mission runtime's): a defeat is an elimination like any other, the mission counts it and respawns the human with full health and the spawn protection (shown as recovery frames). `options.terminal` (closing crush with no tile left, Sudden Death blast) skips 1-3.

Lethal events reach it from `applyLethalHits` (lethality.ts): for a vitals player the live hits of the tick become ONE campaign hit (the largest wound), and every live event id is remembered for its grace window, so one explosion hurts once.

## 3. Damage table (`config.campaign`, `CAMPAIGN_CONFIG`)

| Source | Segments | Notes |
| --- | --- | --- |
| Generator flame (blast) | 2 | per blast event; two blasts kill a 4-segment player; a guard or thrower dies to one |
| Vehicle | 2 | |
| Stage hazard (traffic, crowd, ...) | 1 | |
| Floor trap (raid-sim) | 1 | `source: 'trap'` |
| Crush / Sudden Death | terminal | kills through everything |
| Punch | 1 | daze 0.5 s |
| Shove | 0 | pushes two tiles |
| Daze Punch | 0 | 1 s daze |
| Kick | 1 | pushes one tile |
| Bottle Strike | 2 | |
| Leg Sweep | 1 | slows |
| Headbutt, Elbow | 1 | |
| Enemy close attack on the human | min(attack, 1) | `enemyMeleeDamage` |

Human: 4 segments by default (`playerMaxHp`; the setup's `maxHp` decides, 3 or 4). Recovery frames: 1 s after a wound or an absorbed lethal event. Projectiles and other enemy attacks (combat-attacks) call `applyCampaignHit` with their own damage, `dazeTicks`, `knockback` and `strong`.

## 4. Enemy kinds (`src/sim/data/enemies.ts`)

| Kind | hp | Step penalty (ticks/tile) | Attacks | Bar |
| --- | --- | --- | --- | --- |
| agbero | 1 | 0 | punch | contextual |
| guard | 2 | 0 | punch, bottle | contextual |
| thrower | 2 | +3 | bottle, brick, stone, tool | contextual |
| heavy | 3 (setup may raise to 4) | +2 | punch, brick | contextual |
| lieutenant | 8 | +1 | punch, bottle, tool | boss bar |
| boss | 14 | 0 | punch, bottle, brick, tool | boss bar |

`PlayerSetup.enemyKind` gives the seat its kind's `Vitals` and `Player.enemyKind`; `PlayerSetup.maxHp` alone gives a human `Vitals`. `playerStepTicks` adds the kind's penalty.

## 5. Views for the HUD and renderer (`src/sim/systems/campaignView.ts`)

- `enemyHealthView(state, id) -> { hp, maxHp, kind, dazed, recentlyHurt, showBar } | null`. `showBar` is true only for a boss-bar kind, an enemy the human targets (adjacent, or faced within `bar.aimTiles` in a clear line), one that lost a segment in the last `bar.recentTicks` (3 s), or one within `bar.nearTiles` (3) of the human. Never permanent for everyone.
- `playerVitalsView(state, id) -> { hp, maxHp, armour, okada, invulnerable, lives } | null` (`lives` from the mission, else null).
- `humanPlayerId(state)`.

## 6. Feedback events and sound

`campaignHit { victimId, byId, source, result, damage, hpAfter, maxHp, dazeTicks, x, y }`, exactly one per `applyCampaignHit` (nothing for a victim without vitals); `campaignDefeated { victimId, byId, source, enemyKind, x, y }`. The player can always tell why: `source` names the cause, `result` says whether it hurt, dazed, was absorbed by which layer, was ignored (recovery) or finished the victim; a daze also pushes `playerDazed`, a shove `playerPushed`. `Vitals.lastHitBy` / `lastHitSource` keep the last cause for the HUD.

Audio reuses the synthesised bank (no new recording): `damaged` = a dull `push` (rate 0.7, ducks the bed for the human), `invulnerable` = a faint glancing `push`, `campaignDefeated` = `bottle_smash` under the elimination sound; the shield, daze and push events keep their own cues.

## 7. For the other workers

- Call `applyCampaignHit(state, hit)` for projectile and enemy attacks; do not touch `hp` directly. Set `strong: true` for the slow, telegraphed projectiles.
- `GameConfig.campaign` is optional: use `campaignConfig(state.config)`; to override in a test pass the whole object `{ ...CAMPAIGN_CONFIG, invulnTicks: 5 }` (the `DeepPartial` type does not partialise an optional object).
- Raid-sim: a hazard shipment is `source: 'hazard'` (1) or `'trap'` (1), lethal-class; a human with `maxHp` set in the setup carries health.
- Field/mission: set `maxHp` (3 or 4) on the human and `enemyKind` on crew seats. `respawn()` restores a human's (and a reinforced enemy's) health.
