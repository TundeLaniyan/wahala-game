# Ads, seasons and cosmetics: interfaces and data models

**Interfaces and data only.** There is no advertising SDK, no network, no store, no currency and no season is live. All names, dates, tiers and cosmetics are fictional placeholders (no real brand, person or event calendar). Defaults: nothing is shown anywhere; the shipped game is unchanged.

## Ads (`src/ads/index.ts`)

`AdPlacement` (`{ slot, surface }`), `AdProvider` (`status`, `show`), `NullAdProvider` (disabled; `show` returns `{ shown: false, reason: 'noProvider' }`), `AD_PLACEMENT_RULES` (data) and the pure gate `canShowAd(context)`. The gate is **default-deny**: an ad is allowed only on a surface the slot's rule lists, after the global switch (`adsEnabled`, false in every build), the **ad-free premium flag** (`adFree`), the forbidden list, opt-in (rewarded) and a frequency cap (`minIntervalSec`: 180 s, rewarded 30 s).

| Slot | May appear on | Notes |
| --- | --- | --- |
| `postMatch` | the post-match results screen of a normal match | |
| `betweenMatchMenu` | main menu and lobby (between matches) | |
| `rewarded` | results screen, main menu | **opt-in only**: the player taps "watch to earn" |

**Must never appear** (`AD_FORBIDDEN_SURFACES`, wins over everything): during a live match, the countdown, the pause menu of a live match, the tutorial, the campaign briefing, boss intro and cutscenes. The remaining campaign surfaces (map, mission result) are not allowed either (default-deny). `tests/ads/ads.test.ts` checks every slot against every surface, that the rule table never lists a forbidden surface, opt-in, ad-free, the cap and unknown inputs.

A real provider would additionally need: consent handling and age gating, an SDK reviewed for privacy, a build flag like the online adapter (no ad code in the static build), and a decision on whether ads exist at all. None of that is decided.

## Seasons (`src/seasons`)

`SeasonDef` (id, name, `theme`, `startsAt` / `endsAt` UTC ms, tiers with cumulative points and an optional cosmetic reward, `leaderboardId`), `ChallengeDef` (daily / weekly, metric, target, points). Data: three placeholder seasons of 8, 6 and 8 weeks (Christmas Rush, Eid Lights, Harmattan Run); `theme` is `'default' | 'christmas' | 'eid' | 'independence' | 'harmattan' | 'carnival'`. Pure functions:

- `currentSeason(now)`, `nextSeason(now)` (start inclusive, end exclusive), `seasonWeeks`, `tierReached(season, points)`;
- `challengesFor(now, seed)`: three daily challenges (rotating 00:00 UTC) and three weekly ones (rotating Monday 00:00 UTC), chosen deterministically from `CHALLENGE_POOL` by a seeded shuffle; the same day / week and seed always give the same set (a server would use its own seed so everyone sees the same challenges).

Season points are granted by `src/progression` (a result and completed challenges); each season has its own leaderboard id served by the ranking service. Tests: `tests/ads/seasons-cosmetics.test.ts` (durations 6 to 8 weeks, no overlap, ordered tiers, rewards exist in the catalogue, boundaries, rotation).

## Cosmetics (`src/cosmetics`)

Catalogue entries: fighter skins, vehicle cosmetics, finishing sequences, emotes, banners, each with `rarity` (common / rare / epic / legendary), `source` (default / level / rank / wins / season / event / campaign), an `UnlockRule` (`default`, `level`, `rank` tier index, `wins`, `seasonTier`, `event` theme, `campaignReward`) and an optional theme. `ruleMet(rule, ProgressView)` and `unlockedCosmetics(view)` are pure; `sanitizeLoadout` keeps only owned items of the right kind. Cosmetics are purely visual: they never change a rule, a stat or a hitbox, and **the renderer does not read the catalogue yet** (a presentation pass would add that). There is no purchase flow: nothing is for sale.
