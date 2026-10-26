# City Rumble Evolution - final legacy vs evolution measurement

Lead run on the fully merged branch (all workstreams), `npx tsx scripts/rumble-metrics.ts --arenas rumbleOjuelegba,rumbleOshodi,rumbleApapa,cityRumble --cases survival:8,survival:16,survival:24,survival:32,deathmatch:16:5 --variants legacy,evolution --matches 4 --seed 100`. `legacy` = Rumble with the plus blast, one starting generator, reach cap 10; `evolution` = the shipped defaults (radial, two generators, RE-C4 square cap). Standard bots, no human. ms/tick on the shared 4-core container.

| stage | ruleset | bots | variant | n | result | len s | elims | elims/min | 1st s | <=30 s | <=60 s | engaged | engaged 60s | in fire | in fire 60s | gens/fm | aimed | camp | near opp | self | top k | med k | top pw | med pw | ms/tick |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rumbleOjuelegba | survival | 8 | legacy | 4 | win 3, d:timeout 1 | 88.3 | 6.8 | 6.0 | 15.4 | 2.3 | 6.5 | 79% | 76% | 21% | 20% | 22.8 | 72% | 5% | 5.0 | 1.5 | 3.5 | 0.4 | 7.5 | 1.0 | 0.21 |
| rumbleOjuelegba | survival | 8 | evolution | 4 | win 4 | 85.9 | 7.0 | 5.2 | 11.2 | 3.3 | 5.8 | 60% | 57% | 38% | 34% | 35.9 | 70% | 0% | 8.0 | 1.5 | 3.3 | 0.5 | 7.8 | 1.5 | 0.21 |
| rumbleOjuelegba | survival | 16 | legacy | 4 | win 4 | 55.5 | 15.0 | 16.9 | 8.1 | 8.8 | 14.5 | 84% | 84% | 25% | 25% | 22.7 | 77% | 5% | 3.9 | 1.8 | 6.0 | 0.3 | 18.3 | 0.8 | 0.38 |
| rumbleOjuelegba | survival | 16 | evolution | 4 | win 4 | 68.9 | 15.0 | 13.3 | 5.7 | 8.8 | 13.3 | 77% | 76% | 46% | 45% | 35.7 | 84% | 0% | 4.4 | 4.0 | 4.3 | 0.5 | 11.3 | 1.3 | 0.43 |
| rumbleOjuelegba | survival | 24 | legacy | 4 | win 4 | 77.7 | 23.0 | 19.4 | 6.4 | 12.8 | 20.3 | 92% | 92% | 28% | 27% | 24.6 | 84% | 3% | 2.7 | 4.8 | 9.8 | 0.1 | 29.8 | 0.4 | 0.48 |
| rumbleOjuelegba | survival | 24 | evolution | 4 | win 4 | 72.0 | 23.0 | 21.6 | 5.2 | 16.0 | 22.0 | 81% | 81% | 47% | 46% | 34.0 | 87% | 1% | 4.0 | 4.8 | 6.5 | 0.1 | 19.5 | 0.4 | 0.57 |
| rumbleOjuelegba | survival | 32 | legacy | 4 | win 4 | 66.0 | 31.0 | 28.7 | 4.0 | 22.5 | 30.0 | 90% | 91% | 29% | 28% | 23.7 | 82% | 5% | 3.1 | 5.8 | 10.0 | 0.0 | 31.0 | 0.1 | 0.53 |
| rumbleOjuelegba | survival | 32 | evolution | 4 | win 4 | 59.2 | 31.0 | 32.5 | 3.5 | 23.8 | 30.5 | 83% | 83% | 48% | 49% | 33.1 | 89% | 1% | 3.8 | 5.3 | 7.5 | 0.4 | 23.5 | 0.6 | 0.72 |
| rumbleOjuelegba | deathmatch 5m | 16 | legacy | 4 | win 4 | 300.0 | 239.0 | 47.8 | 8.0 | 9.8 | 26.8 | 80% | 82% | 27% | 25% | 21.0 | 91% | 1% | 4.0 | 15.0 | 137.0 | 5.1 | 37.0 | 4.1 | 0.66 |
| rumbleOjuelegba | deathmatch 5m | 16 | evolution | 4 | win 4 | 300.0 | 313.8 | 62.8 | 5.6 | 14.0 | 37.3 | 75% | 76% | 42% | 43% | 29.5 | 94% | 1% | 4.7 | 31.5 | 146.5 | 7.1 | 29.0 | 4.3 | 0.85 |
| rumbleOshodi | survival | 8 | legacy | 4 | win 4 | 90.4 | 7.0 | 5.3 | 14.2 | 4.3 | 6.3 | 81% | 80% | 24% | 23% | 26.1 | 75% | 4% | 4.4 | 1.3 | 3.5 | 0.4 | 8.3 | 1.1 | 0.13 |
| rumbleOshodi | survival | 8 | evolution | 4 | win 4 | 62.6 | 7.0 | 7.3 | 9.3 | 5.0 | 6.5 | 63% | 61% | 35% | 34% | 33.4 | 73% | 0% | 7.3 | 0.8 | 2.5 | 0.6 | 6.0 | 1.5 | 0.17 |
| rumbleOshodi | survival | 16 | legacy | 4 | win 4 | 67.1 | 15.0 | 13.8 | 6.1 | 9.3 | 13.5 | 88% | 88% | 29% | 28% | 23.2 | 84% | 2% | 3.1 | 1.8 | 6.0 | 0.1 | 17.0 | 0.6 | 0.27 |
| rumbleOshodi | survival | 16 | evolution | 4 | win 4 | 47.7 | 15.0 | 21.2 | 6.0 | 12.8 | 14.8 | 80% | 80% | 45% | 45% | 32.0 | 87% | 0% | 4.1 | 4.8 | 4.0 | 0.8 | 8.0 | 1.0 | 0.36 |
| rumbleOshodi | survival | 24 | legacy | 4 | win 4 | 61.1 | 23.0 | 23.1 | 5.0 | 15.5 | 22.3 | 89% | 89% | 30% | 30% | 24.2 | 86% | 1% | 3.1 | 4.5 | 7.5 | 0.0 | 23.8 | 0.4 | 0.37 |
| rumbleOshodi | survival | 24 | evolution | 4 | win 4 | 60.2 | 23.0 | 24.9 | 6.2 | 17.0 | 22.5 | 86% | 86% | 47% | 47% | 32.9 | 90% | 1% | 3.5 | 4.5 | 5.3 | 0.4 | 12.3 | 0.9 | 0.53 |
| rumbleOshodi | survival | 32 | legacy | 4 | win 4 | 51.6 | 31.0 | 37.2 | 3.7 | 21.5 | 30.5 | 93% | 93% | 33% | 33% | 22.7 | 91% | 1% | 2.5 | 4.0 | 7.8 | 0.5 | 20.5 | 0.0 | 0.56 |
| rumbleOshodi | survival | 32 | evolution | 4 | win 4 | 47.9 | 31.0 | 41.7 | 4.6 | 28.0 | 30.8 | 85% | 85% | 46% | 46% | 30.4 | 88% | 1% | 3.7 | 7.3 | 9.3 | 0.3 | 22.0 | 0.0 | 0.82 |
| rumbleOshodi | deathmatch 5m | 16 | legacy | 4 | win 4 | 300.0 | 278.5 | 55.7 | 7.0 | 11.5 | 30.8 | 80% | 83% | 25% | 27% | 19.0 | 94% | 1% | 4.2 | 22.8 | 175.0 | 5.5 | 37.0 | 3.9 | 0.59 |
| rumbleOshodi | deathmatch 5m | 16 | evolution | 4 | win 4 | 300.0 | 333.0 | 66.6 | 6.0 | 16.8 | 45.3 | 76% | 77% | 37% | 41% | 27.6 | 95% | 1% | 4.8 | 33.0 | 138.8 | 8.1 | 29.0 | 4.3 | 0.79 |
| rumbleApapa | survival | 8 | legacy | 4 | win 4 | 88.5 | 7.0 | 4.8 | 15.7 | 3.0 | 5.3 | 74% | 73% | 21% | 18% | 25.3 | 69% | 5% | 4.9 | 1.3 | 3.8 | 0.3 | 10.3 | 1.1 | 0.16 |
| rumbleApapa | survival | 8 | evolution | 4 | win 4 | 63.7 | 7.0 | 6.6 | 10.1 | 4.0 | 6.3 | 53% | 52% | 33% | 32% | 34.1 | 61% | 0% | 8.3 | 1.0 | 3.5 | 0.5 | 8.8 | 1.9 | 0.22 |
| rumbleApapa | survival | 16 | legacy | 4 | win 4 | 73.6 | 15.0 | 12.6 | 9.0 | 8.0 | 13.3 | 83% | 83% | 25% | 24% | 23.8 | 79% | 2% | 3.5 | 3.3 | 5.8 | 0.3 | 15.8 | 0.5 | 0.27 |
| rumbleApapa | survival | 16 | evolution | 4 | win 4 | 90.3 | 15.0 | 10.5 | 4.7 | 9.0 | 13.3 | 71% | 69% | 42% | 40% | 34.5 | 81% | 3% | 4.9 | 2.3 | 5.0 | 0.3 | 12.5 | 0.8 | 0.37 |
| rumbleApapa | survival | 24 | legacy | 4 | win 4 | 84.1 | 23.0 | 16.9 | 5.8 | 14.0 | 21.3 | 89% | 89% | 30% | 28% | 24.7 | 82% | 4% | 3.0 | 3.5 | 5.8 | 0.3 | 17.3 | 0.9 | 0.35 |
| rumbleApapa | survival | 24 | evolution | 4 | win 4 | 66.8 | 23.0 | 21.8 | 5.7 | 17.8 | 22.3 | 79% | 78% | 45% | 44% | 33.4 | 83% | 3% | 4.3 | 5.8 | 5.5 | 0.3 | 15.3 | 0.8 | 0.54 |
| rumbleApapa | survival | 32 | legacy | 4 | win 4 | 68.6 | 31.0 | 27.3 | 6.1 | 18.5 | 29.5 | 90% | 90% | 29% | 29% | 23.4 | 85% | 4% | 2.9 | 4.0 | 10.8 | 0.1 | 34.0 | 0.1 | 0.58 |
| rumbleApapa | survival | 32 | evolution | 4 | win 4 | 67.9 | 31.0 | 28.5 | 4.3 | 24.5 | 30.0 | 82% | 82% | 46% | 45% | 31.5 | 85% | 3% | 4.1 | 5.3 | 5.5 | 0.5 | 14.5 | 0.3 | 0.72 |
| rumbleApapa | deathmatch 5m | 16 | legacy | 4 | win 4 | 300.0 | 286.0 | 57.2 | 5.1 | 10.8 | 28.5 | 78% | 81% | 25% | 27% | 20.2 | 92% | 1% | 4.2 | 16.0 | 163.8 | 4.8 | 37.0 | 3.5 | 0.64 |
| rumbleApapa | deathmatch 5m | 16 | evolution | 4 | win 4 | 300.0 | 348.3 | 69.7 | 4.7 | 12.5 | 42.3 | 73% | 71% | 39% | 37% | 27.2 | 94% | 1% | 4.9 | 33.3 | 201.8 | 7.3 | 29.0 | 4.0 | 0.82 |
| cityRumble | survival | 8 | legacy | 4 | win 4 | 54.4 | 7.0 | 8.1 | 8.4 | 4.3 | 6.3 | 87% | 87% | 26% | 26% | 22.9 | 83% | 3% | 3.3 | 2.0 | 3.5 | 0.5 | 7.8 | 0.8 | 0.13 |
| cityRumble | survival | 8 | evolution | 4 | win 4 | 48.0 | 7.0 | 9.3 | 5.7 | 5.3 | 6.8 | 76% | 76% | 45% | 45% | 35.2 | 83% | 0% | 5.3 | 1.3 | 3.8 | 0.5 | 8.8 | 0.5 | 0.17 |
| cityRumble | survival | 16 | legacy | 4 | win 4 | 43.3 | 15.0 | 21.0 | 6.3 | 11.0 | 15.0 | 88% | 88% | 30% | 30% | 21.7 | 87% | 2% | 3.1 | 2.8 | 4.8 | 0.3 | 12.5 | 0.5 | 0.24 |
| cityRumble | survival | 16 | evolution | 4 | win 4 | 45.7 | 15.0 | 23.0 | 8.8 | 13.0 | 14.8 | 79% | 79% | 47% | 46% | 31.3 | 86% | 1% | 4.3 | 1.8 | 6.3 | 0.1 | 17.5 | 0.0 | 0.37 |
| cityRumble | survival | 24 | legacy | 4 | win 4 | 54.2 | 23.0 | 28.1 | 5.2 | 17.5 | 22.8 | 90% | 91% | 31% | 31% | 22.3 | 88% | 0% | 2.9 | 3.3 | 7.8 | 0.3 | 24.8 | 0.0 | 0.32 |
| cityRumble | survival | 24 | evolution | 4 | win 4 | 39.3 | 23.0 | 36.7 | 4.3 | 19.5 | 23.0 | 87% | 87% | 49% | 49% | 30.7 | 92% | 0% | 3.5 | 5.3 | 8.5 | 0.1 | 25.3 | 0.0 | 0.62 |
| cityRumble | survival | 32 | legacy | 4 | win 4 | 44.6 | 31.0 | 43.2 | 3.7 | 24.8 | 31.0 | 93% | 93% | 36% | 36% | 22.4 | 93% | 1% | 2.4 | 5.5 | 9.8 | 0.0 | 30.0 | 0.0 | 0.49 |
| cityRumble | survival | 32 | evolution | 4 | win 4 | 39.9 | 31.0 | 51.5 | 3.5 | 28.5 | 31.0 | 90% | 90% | 51% | 51% | 29.9 | 93% | 0% | 2.9 | 4.8 | 8.5 | 0.3 | 22.5 | 0.3 | 0.74 |
| cityRumble | deathmatch 5m | 16 | legacy | 4 | win 4 | 300.0 | 283.3 | 56.7 | 8.1 | 14.5 | 35.3 | 78% | 83% | 26% | 28% | 19.2 | 94% | 1% | 4.3 | 17.0 | 191.3 | 5.6 | 37.0 | 3.5 | 0.49 |
| cityRumble | deathmatch 5m | 16 | evolution | 4 | win 4 | 300.0 | 373.5 | 74.7 | 7.1 | 17.8 | 41.5 | 72% | 78% | 37% | 43% | 26.3 | 96% | 0% | 5.1 | 26.5 | 201.0 | 6.8 | 29.0 | 4.0 | 0.67 |

| stage | ruleset | bots | variant | 1st encounter s | empty runs >= 15 s | longest empty s | own / rival / team / veh / stage / crush / melee | live gens (mean / peak / per fighter) | supplies opened (of start, by 60 s, 1st s) | pickups taken / wasted / burned | slot survival spread / cv |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rumbleOjuelegba | survival | 8 | legacy | 3.2 | 0.8 | 21.0 | 1.5 / 4.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.5 | 5.1 / 8.8 / 1.08 | 5.0 of 8.0, 3.8, 8.7 | 2.8 / 0.0 / 0.5 | 0.58 / 0.30 |
| rumbleOjuelegba | survival | 8 | evolution | 2.3 | 2.0 | 25.4 | 1.5 / 5.5 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 5.9 / 15.5 / 1.49 | 7.3 of 8.0, 6.8, 4.4 | 5.3 / 0.3 / 1.0 | 0.71 / 0.42 |
| rumbleOjuelegba | survival | 16 | legacy | 1.1 | 0.3 | 12.8 | 1.8 / 12.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.5 | 8.7 / 16.5 / 1.02 | 4.5 of 8.0, 4.5, 5.6 | 3.8 / 0.0 / 0.5 | 0.44 / 0.22 |
| rumbleOjuelegba | survival | 16 | evolution | 0.8 | 0.0 | 12.2 | 4.0 / 10.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.3 | 10.0 / 28.0 / 1.46 | 6.8 of 8.0, 6.8, 3.8 | 5.0 / 0.0 / 1.3 | 0.56 / 0.28 |
| rumbleOjuelegba | survival | 24 | legacy | 0.5 | 0.5 | 10.7 | 4.8 / 18.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 11.0 / 23.8 / 1.12 | 6.3 of 8.0, 4.8, 7.2 | 3.8 / 0.0 / 1.3 | 0.82 / 0.42 |
| rumbleOjuelegba | survival | 24 | evolution | 0.5 | 0.0 | 10.4 | 4.8 / 18.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 11.4 / 41.5 / 1.34 | 7.5 of 8.0, 7.3, 4.3 | 5.3 / 0.0 / 1.5 | 0.55 / 0.44 |
| rumbleOjuelegba | survival | 32 | legacy | 0.5 | 0.3 | 11.1 | 5.8 / 24.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.5 | 12.2 / 31.5 / 1.10 | 7.3 of 8.0, 7.0, 5.5 | 5.8 / 0.0 / 1.0 | 0.56 / 0.30 |
| rumbleOjuelegba | survival | 32 | evolution | 0.5 | 0.0 | 9.9 | 5.3 / 25.5 / 0.0 / 0.0 / 0.0 / 0.0 / 0.3 | 14.0 / 56.8 / 1.29 | 7.8 of 8.0, 7.8, 3.5 | 5.3 / 0.0 / 2.0 | 0.61 / 0.43 |
| rumbleOjuelegba | deathmatch 5m | 16 | legacy | 1.1 | 0.5 | 13.6 | 15.0 / 218.8 / 0.0 / 3.3 / 0.0 / 0.0 / 2.0 | 10.4 / 22.8 / 0.76 | 8.0 of 8.0, 7.0, 5.6 | 7.5 / 0.0 / 0.5 | 0.07 / 0.02 |
| rumbleOjuelegba | deathmatch 5m | 16 | evolution | 0.8 | 0.0 | 11.4 | 31.5 / 280.0 / 0.0 / 1.3 / 0.3 / 0.0 / 0.8 | 12.5 / 29.5 / 0.95 | 8.0 of 8.0, 8.0, 3.8 | 6.5 / 0.0 / 1.5 | 0.09 / 0.04 |
| rumbleOshodi | survival | 8 | legacy | 4.0 | 0.3 | 12.9 | 1.3 / 5.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.5 | 4.5 / 9.0 / 1.25 | 6.3 of 8.0, 4.3, 16.2 | 3.3 / 0.0 / 0.3 | 0.59 / 0.39 |
| rumbleOshodi | survival | 8 | evolution | 3.1 | 1.0 | 14.5 | 0.8 / 6.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 4.9 / 15.5 / 1.33 | 8.0 of 8.0, 8.0, 4.2 | 4.5 / 0.0 / 1.5 | 0.66 / 0.40 |
| rumbleOshodi | survival | 16 | legacy | 1.1 | 0.0 | 9.3 | 1.8 / 13.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 7.1 / 15.8 / 1.12 | 5.3 of 8.0, 5.3, 7.4 | 4.5 / 0.0 / 0.8 | 0.66 / 0.38 |
| rumbleOshodi | survival | 16 | evolution | 1.1 | 0.0 | 8.7 | 4.8 / 10.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 9.0 / 28.0 / 1.26 | 7.3 of 8.0, 7.3, 4.3 | 6.0 / 0.0 / 0.8 | 0.45 / 0.24 |
| rumbleOshodi | survival | 24 | legacy | 0.8 | 0.3 | 12.0 | 4.5 / 18.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.3 | 9.9 / 23.8 / 1.12 | 5.8 of 8.0, 5.8, 10.1 | 4.5 / 0.0 / 1.0 | 0.66 / 0.34 |
| rumbleOshodi | survival | 24 | evolution | 0.8 | 0.3 | 10.7 | 4.5 / 18.5 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 10.6 / 41.0 / 1.27 | 7.8 of 8.0, 7.8, 6.8 | 6.8 / 0.0 / 0.0 | 0.54 / 0.40 |
| rumbleOshodi | survival | 32 | legacy | 0.7 | 0.0 | 7.3 | 4.0 / 26.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.3 | 12.0 / 30.0 / 1.02 | 6.0 of 8.0, 6.0, 10.3 | 4.5 / 0.0 / 0.8 | 0.67 / 0.34 |
| rumbleOshodi | survival | 32 | evolution | 0.8 | 0.3 | 10.5 | 7.3 / 23.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 12.6 / 49.0 / 1.17 | 7.3 of 8.0, 7.3, 4.3 | 6.0 / 0.0 / 1.0 | 0.55 / 0.34 |
| rumbleOshodi | deathmatch 5m | 16 | legacy | 1.1 | 0.0 | 8.1 | 22.8 / 252.0 / 0.0 / 2.0 / 0.0 / 0.0 / 1.8 | 8.7 / 20.0 / 0.65 | 8.0 of 8.0, 7.3, 7.8 | 7.0 / 0.0 / 1.0 | 0.04 / 0.02 |
| rumbleOshodi | deathmatch 5m | 16 | evolution | 1.1 | 0.0 | 7.4 | 33.0 / 293.0 / 0.0 / 4.3 / 0.3 / 0.0 / 2.5 | 10.7 / 29.5 / 0.83 | 8.0 of 8.0, 8.0, 4.3 | 7.5 / 0.0 / 0.5 | 0.13 / 0.04 |
| rumbleApapa | survival | 8 | legacy | 4.3 | 1.0 | 15.4 | 1.3 / 5.0 / 0.0 / 0.0 / 0.0 / 0.3 / 0.5 | 4.9 / 8.5 / 1.27 | 3.8 of 8.0, 3.8, 21.9 | 3.8 / 0.0 / 0.0 | 0.58 / 0.33 |
| rumbleApapa | survival | 8 | evolution | 4.0 | 0.8 | 22.8 | 1.0 / 5.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.3 | 6.0 / 14.8 / 1.35 | 8.0 of 8.0, 8.0, 5.0 | 6.8 / 0.0 / 1.0 | 0.52 / 0.28 |
| rumbleApapa | survival | 16 | legacy | 1.1 | 0.0 | 9.1 | 3.3 / 11.3 / 0.0 / 0.0 / 0.0 / 0.3 / 0.3 | 7.4 / 16.5 / 1.12 | 5.8 of 8.0, 5.0, 11.8 | 4.8 / 0.0 / 0.5 | 0.45 / 0.29 |
| rumbleApapa | survival | 16 | evolution | 1.1 | 0.3 | 12.1 | 2.3 / 12.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.8 | 8.2 / 28.3 / 1.45 | 8.0 of 8.0, 8.0, 4.6 | 5.3 / 0.0 / 2.5 | 0.45 / 0.34 |
| rumbleApapa | survival | 24 | legacy | 0.6 | 0.0 | 7.5 | 3.5 / 19.5 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 8.9 / 23.5 / 1.22 | 6.5 of 8.0, 5.8, 14.4 | 4.8 / 0.0 / 0.8 | 0.46 / 0.36 |
| rumbleApapa | survival | 24 | evolution | 0.6 | 0.0 | 8.7 | 5.8 / 17.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 11.3 / 40.5 / 1.38 | 7.8 of 8.0, 7.8, 3.6 | 6.3 / 0.0 / 1.3 | 0.53 / 0.36 |
| rumbleApapa | survival | 32 | legacy | 0.4 | 0.0 | 7.0 | 4.0 / 27.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 12.4 / 31.8 / 1.06 | 7.5 of 8.0, 7.5, 8.1 | 6.3 / 0.0 / 1.0 | 0.69 / 0.34 |
| rumbleApapa | survival | 32 | evolution | 0.5 | 0.3 | 13.9 | 5.3 / 25.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 12.2 / 52.0 / 1.31 | 8.0 of 8.0, 8.0, 4.7 | 6.8 / 0.0 / 1.3 | 0.55 / 0.41 |
| rumbleApapa | deathmatch 5m | 16 | legacy | 1.1 | 0.3 | 11.4 | 16.0 / 263.5 / 0.0 / 4.8 / 0.0 / 0.0 / 1.8 | 9.0 / 21.3 / 0.67 | 8.0 of 8.0, 6.8, 13.9 | 7.0 / 0.0 / 1.0 | 0.13 / 0.04 |
| rumbleApapa | deathmatch 5m | 16 | evolution | 1.1 | 0.3 | 14.1 | 33.3 / 310.3 / 0.0 / 3.5 / 0.0 / 0.0 / 1.3 | 11.1 / 29.8 / 0.87 | 8.0 of 8.0, 8.0, 4.6 | 6.0 / 0.0 / 2.0 | 0.14 / 0.05 |
| cityRumble | survival | 8 | legacy | 2.2 | 0.0 | 8.4 | 2.0 / 5.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 4.8 / 8.0 / 1.07 | - | 0.0 / 0.0 / 0.0 | 0.59 / 0.33 |
| cityRumble | survival | 8 | evolution | 2.2 | 0.3 | 13.5 | 1.3 / 5.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 5.6 / 14.5 / 1.40 | - | 0.0 / 0.0 / 0.0 | 0.37 / 0.21 |
| cityRumble | survival | 16 | legacy | 0.9 | 0.0 | 8.7 | 2.8 / 12.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 7.5 / 15.8 / 0.94 | - | 0.0 / 0.0 / 0.0 | 0.44 / 0.20 |
| cityRumble | survival | 16 | evolution | 1.1 | 0.3 | 12.8 | 1.8 / 13.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 9.1 / 27.5 / 1.26 | - | 0.0 / 0.0 / 0.0 | 0.33 / 0.19 |
| cityRumble | survival | 24 | legacy | 0.6 | 0.3 | 11.8 | 3.3 / 19.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 9.5 / 22.5 / 1.08 | - | 0.0 / 0.0 / 0.0 | 0.53 / 0.34 |
| cityRumble | survival | 24 | evolution | 0.5 | 0.0 | 12.3 | 5.3 / 17.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 12.5 / 38.3 / 1.13 | - | 0.0 / 0.0 / 0.0 | 0.71 / 0.34 |
| cityRumble | survival | 32 | legacy | 0.3 | 0.0 | 10.1 | 5.5 / 25.5 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 11.8 / 28.8 / 0.96 | - | 0.0 / 0.0 / 0.0 | 0.53 / 0.33 |
| cityRumble | survival | 32 | evolution | 0.3 | 0.3 | 12.1 | 4.8 / 26.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 13.8 / 49.8 / 1.07 | - | 0.0 / 0.0 / 0.0 | 0.76 / 0.34 |
| cityRumble | deathmatch 5m | 16 | legacy | 0.9 | 0.0 | 9.4 | 17.0 / 261.8 / 0.0 / 4.0 / 0.3 / 0.0 / 0.3 | 8.6 / 20.5 / 0.65 | - | 0.0 / 0.0 / 0.0 | 0.08 / 0.03 |
| cityRumble | deathmatch 5m | 16 | evolution | 1.1 | 0.0 | 9.8 | 26.5 / 339.3 / 0.0 / 6.5 / 0.0 / 0.0 / 1.3 | 9.7 / 30.0 / 0.77 | - | 0.0 / 0.0 / 0.0 | 0.15 / 0.06 |

means over 4 seeds from 100; bots: standard; sample every 6 ticks. Columns: elims = eliminations per match; 1st s = mean time of the first elimination; <=30 / <=60 s = mean eliminations in the opening; engaged = share of fighter time with a living opponent within 6 tiles; in fire = share inside an opponent's live blast footprint; gens/fm = generator placements per fighter-minute; aimed = placements whose footprint contained a living opponent; camp = share of fighter time in >= 5 s runs inside 3x3; near opp = mean distance to the nearest opponent; self = self-eliminations per match; top/med k and pw = kills and peak power of the top eliminator and the median fighter.
