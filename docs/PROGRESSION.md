# Progression: data model, reducers and (placeholder) tables

`src/progression` is pure data and reducers: no clock, no network, no DOM. **The profile never affects the local game.** Nothing in `src/sim`, `src/ai`, `src/input`, `src/render`, `src/audio`, the match controller or the composition root imports it (`tests/platform-static.test.ts`); results are recorded only by the online preview / a future server, i.e. only when `flags().online` is true. The local menu match start path is untouched by this work (`session.ts`, `MatchController.ts`, `names.ts`, `settings.ts`, `store.ts` have no diff).

## Data model

`ProgressionProfile` (version 1): `xp`, `level`, `rankPoints`, `peakRankPoints` (so a rank drop never removes a cosmetic), `totals` (matches, wins, losses, draws, kills, deaths, assists, time played, streak rewards), `winStreak`, `bestWinStreak`, `season` (current season id, points, tier, challenges done), `seasonTiers` (highest tier per season, kept), `eventThemes`, `campaignRewards` (**read-only mirror** of the campaign save's reward ids via `linkCampaignRewards`; never written back), `unlocked` (cosmetic ids), `history` (last 20 matches, newest first).

`MatchResultInput` (one player's view): match id (idempotency key), game, arena, outcome (`win` / `loss` / `draw`), placement, competitors, kills, deaths, assists, duration, streak rewards held at the end (a lower bound: the sim keeps no per-match log), `vsBots`, `rated`, an optional mission outcome, `endedAt` (wall clock supplied by the caller).

- `matchResultFrom(state, playerId, meta?)`: pure, from a finished `GameState`; works for classic, City Rumble (placement by survival order, kills ranking or team standing) and campaign mission matches (the mission's own outcome and stars).
- `applyMatchResult(profile, input, season?)`: pure and idempotent per match id (a repeat returns the same profile and `duplicate: true`); clamps nonsense numbers; returns the new profile and a `ProgressionUpdate` (itemised XP, level and rank before / after, rank delta, win streak, season points, new unlocks).
- `completeChallenge`, `linkCampaignRewards`, `progressView` (what cosmetics evaluate).
- Persistence only through the `KeyValueStore` port (`loadProgression` / `saveProgression`): never throws; blocked storage keeps the profile in memory; a corrupt record is repaired field by field (the broken text is kept once under `.corrupt`).
- Leaderboards: `seedLeaderboard(seed)` makes fictional deterministic names and scores, `rankBoard` merges you in with tie-aware ranks. There is no real ranking service.

## Tables (PLACEHOLDER TUNING)

Every number below is a first guess that exercises the model; none has been balanced against real play, and there are no real players. They live in `src/progression/tables.ts` only.

| XP | value |
| --- | --- |
| played a match | 20 |
| win / draw | +50 / +20 |
| per elimination / assist | 8 / 4 (halved when every opponent is a bot) |
| per full minute (max 10) | 2 |
| per streak reward held | 10 |
| win streak bonus | 5 per win already in the streak, at most 5 steps |
| per mission star (won mission) | 15 |

Level n needs `100 (n-1) + 25 (n-1)(n-2)` cumulative XP (100, 250, 450 ...), max level 100.

Rank: tiers Bronze, Silver, Gold, Platinum, Diamond, Legend; three divisions per tier (III to I), 100 points per division, Legend has none. Rated matches only (`rated: true`, the online queue): placement-based delta `round(20 x spread) + 5 if won`, where spread runs from +1 (first) to -1 (last), clamped to -15..+25; a draw is 0; points never drop below 0. Season points per match: win 20, draw 10, loss 8 (only while a season is live).

## Where it is used

`src/online/mock/progress.ts` (the mock server settles a finished match: `ProgressionService.settle`, then the ranking service reads the profile), the preview results screen, and `src/cosmetics` (unlock rules). A real server must derive the result from the match it ran, never accept one from a client (`docs/ONLINE_ARCHITECTURE.md`). Streak rewards in `StreakRewards`, kill credit and the rest of the sim are unchanged.

## Tests

`tests/progression/progression.test.ts`: tables (monotone, invertible), rank info boundaries, rank delta bounds for every placement, XP itemisation, `applyMatchResult` (totals, streaks, idempotency, purity, bounded history, clamping, unrated), seasons and campaign link, cosmetic unlocks, `matchResultFrom` (win / loss / draw / team / mission / a real finished match), persistence (corrupt, blocked, tampered), leaderboards.
