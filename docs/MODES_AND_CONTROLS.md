# Game modes, planned modes, controls and arena-size assessment

Branch `claude/wahala-modes-controls-movement-v1` (from `207ef8b`). Decisions: `DECISIONS.md` MD1-MD6, MV1, MC2.

## The three modes (City Rumble)

| Order | Name (sim ruleset) | Rule line shown to the player | Respawn | Clock | Winner |
| --- | --- | --- | --- | --- | --- |
| 1, default | **Free-for-All** (`deathmatch`) | Respawn enabled · highest kills wins | yes, 3 s, spawn protection | 3 or 5 min (default 5) | most credited kills; a tie among the leaders: sudden death between them only |
| 2 | **Team Deathmatch** (`team`) | Respawn enabled · team with most kills wins | yes | 3 or 5 min | the team with the highest total kills (Green v White); a level total: sudden death between the tied teams |
| 3 | **Last Player Standing** (`survival`) | No respawn · last survivor wins | no | the city closes in (about 3 min) | last survivor; time up or the last fighters falling together: highest kills, then sudden death |

Classic Battle (2-4 fighters, 15 x 11 arenas) is a separate game after these three; it is a no-respawn last-survivor
match with Wahala Crush. Sudden death is unchanged (decisions SD1-SD6).

Team colours: Team 1 green; Team 2 white / light grey with a dark outline (never purple), applied to the 3D kit,
ring, names, dots, scoreboard and results (decision MD5).

## Planned modes (documented only, not implemented)

- **Capture the Flag**: two teams, a flag per base, carry it home, respawns on. Needs a flag object and carrier
  rules in the sim, base tiles in the arena data, an objective HUD and bot objectives. Nothing exists yet.
- **Multi-team battles**: 3-4 teams on the same Team Deathmatch rules. The sim already splits any number of teams
  (`assignTeams`, `TEAM_NAMES`, `TEAM_COLORS` have spare entries); the menu, scoreboard layout and balance are not done.

## Controls: the A/B cluster and corner movement

- A is the lower-left button of the right-hand cluster and B sits diagonally above and to the right of it; round,
  domed buttons with a printed letter and label, no panel; pressed / holding / remote / disabled states; 12 px clear
  of the edge and the safe areas (decision MC2).
- Corner assistance (decision MV1): turns planned two tiles ahead on every assisted level, a tapped turn remembered
  for 24 ticks, a 14 tick press buffer, a bump guard (24 tick cooldown on a refused direction), and bend following in
  one-tile corridors on touch / "On". Grid movement, determinism and one-tile taps are unchanged.

## Arena-size assessment (report only: no arena or map was changed)

Method. Static geometry from the arena data: `npx tsx scripts/mode-arena-assessment.ts`. Behaviour from the existing
headless bot harness: `npx tsx scripts/rumble-metrics.ts --arenas rumbleOshodi,rumbleOjuelegba,rumbleApapa,rumbleLagosIsland,rumbleLekkiNight,cityRumble
--cases deathmatch:8:3,deathmatch:16:5,team:16:5,team:32:5,survival:16,survival:32 --variants evolution --matches 2 --max-seconds 180`
(standard-level bots, 2 seeds per cell, 180 play seconds; respawn cases are cut at 180 s). "In fire" is the share of
alive fighter-time spent inside the live blast footprint of a generator an opponent owns.

### Rumble stages (Free-for-All / Team Deathmatch respawn; Last Player Standing no respawn)

| stage | size | open tiles | open / fighter @8 | @16 | @24 | @32 | spawns | spawn gap min/median @16 | @32 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Oshodi Transport Metropolis | 45 x 33 | 965 | 121 | 60 | 40 | 30 | 32 | 8 / 9 | 4 / 5 |
| Lagos Island Markets | 41 x 31 | 877 | 110 | 55 | 37 | 27 | 32 | 12 / 12 | 5 / 7 |
| Ojuelegba Underbridge | 45 x 33 | 993 | 124 | 62 | 41 | 31 | 32 | 8 / 10 | 6 / 7 |
| Apapa Docks | 45 x 31 | 1075 | 134 | 67 | 45 | 34 | 32 | 8 / 9 | 7 / 7 |
| Lekki Nightworks | 41 x 31 | 1065 | 133 | 67 | 44 | 33 | 32 | 8 / 11 | 6 / 7 |
| City Rumble | 41 x 31 | 1037 | 130 | 65 | 43 | 32 | 32 | 8 / 10 | 4 / 6 |

### Standard 15 x 11 arenas (Classic Battle, 2-4 fighters, no respawn)

| arena | size | open tiles (crates incl.) | open / fighter @2 | @3 | @4 |
| --- | --- | --- | --- | --- | --- |
| Danfo Bus Park | 15 x 11 | 130 | 65 | 43 | 33 |
| Balogun Market | 15 x 11 | 122 | 61 | 41 | 31 |
| Lekki Roadworks | 15 x 11 | 130 | 65 | 43 | 33 |
| Oshodi Interchange | 15 x 11 | 131 | 66 | 44 | 33 |
| Ajegunle Backstreets | 15 x 11 | 122 | 61 | 41 | 31 |
| Lagos Lagoon Jetty | 15 x 11 | 130 | 65 | 43 | 33 |
| Surulere Power Yard | 15 x 11 | 130 | 65 | 43 | 33 |
| Yaba After Dark | 15 x 11 | 132 | 66 | 44 | 33 |
| Third Mainland Checkpoint | 15 x 11 | 137 | 69 | 46 | 34 |

### Blast footprint (tiles) against space

Classic plus blast, range 2 to 8: 9 to 33 tiles. Rumble radial blast (RUMBLE_ECONOMY): radius 2 = about 21 tiles, max range 5 = about 97 tiles, Square Blast tier 3 = 49 tiles.


Behaviour (means over the six stages):

| mode, fighters | eliminations / min | in a live blast footprint | with an opponent within 6 tiles | nearest opponent (tiles) | match length |
| --- | --- | --- | --- | --- | --- |
| Free-for-All, 8 | 26 | 33 % | 63 % | 7.3 | clock (3 min) |
| Free-for-All, 16 | 61 | 38 % | 72 % | 5.0 | clock (cut at 3 of 5 min) |
| Team Deathmatch, 16 (8 v 8) | 59 | 30 % | 59 % | 7.6 | clock |
| Team Deathmatch, 32 (16 v 16) | 143 | 33 % | 67 % | 5.9 | clock |
| Last Player Standing, 16 | 14 | 40 % | 71 % | 5.4 | 75 s |
| Last Player Standing, 32 | 38 | 45 % | 82 % | 4.0 | 56 s |

What the numbers say.

- **Space per fighter** on the six Rumble stages is 877 to 1075 open tiles: 110-134 tiles at 8 fighters, 55-67 at 16,
  37-45 at 24 and 27-34 at 32. One Rumble blast covers about 21 tiles at the start (radius 2) and about 97 at the
  maximum reach (5): at 32 fighters a single late blast covers three fighters' share of the floor.
- **Spawn spacing** at 32 fighters is 4-7 tiles to the nearest other spawn (stage dependent), inside a late blast's
  reach; at 16 it is 8-12.
- **Team Deathmatch** is comfortable at 8 and 16 fighters (about 30 % of alive time under an enemy blast, about 60
  eliminations a minute) but at 32 (16 v 16) it is 2.4 times as busy (143 eliminations a minute, a fighter falls about
  every 13 seconds) with only 27-34 open tiles each. Respawn churn plus spawn protection plus blast overlap is where it
  gets crowded; the clock still decides it.
- **Last Player Standing** has no respawn, so crowding shows as speed: at 32 fighters the whole match is over in 56
  seconds on average with 45 % of alive time under a live blast and 82 % of fighters with a rival within 6 tiles; at 16 it
  lasts 75 seconds. The city closing in never matters before the end.
- **Free-for-All** at 8 is relaxed (121 tiles each, nearest rival 7 tiles); at 16 it is already as busy as Team
  Deathmatch at 16. Free-for-All at 32 was not measured here.
- **Classic Battle** (15 x 11, 2-4 fighters, no respawn) has 31-69 open tiles per fighter, the same density as the
  Rumble stages at 16-32; it is the established size for that mode and needs no change.

Recommendations (nothing is changed until you decide).

1. Keep every current stage; do not resize for 8-16 fighters in any mode.
2. For **Team Deathmatch**, offer 8-16 fighters as the normal sizes and treat 24 and 32 as "crowded" unless a larger
   Team variant is made (roughly 1.5-1.8 x the open area, about 1600-1800 open tiles, spawns 8+ tiles apart so a late
   blast cannot reach a neighbour's spawn). Measure Free-for-All 32 in the same harness first.
3. For **Last Player Standing**, 32 fighters on the current stages is a short brawl (under a minute). If 32 is meant to
   feel like a battle royale, it needs either a larger variant of the same size as above or a slower start (fewer
   starting generators); 16-24 fits the current stages. Decide the intent before changing geometry.
4. If a larger variant is made, add it as an `ArenaDef` config / layout of its own (never `if (arenaId === ...)` in rules
   code) and re-run the two commands above for the new stage against these baselines.
