# Campaign difficulty: Easy / Normal / Hard

Branch `claude/wahala-lagos-enhancement-v1` (decisions CL1-CL7). One-player campaign only.

## What the player sees
- **New campaign** (campaign map, before a save exists): an Easy / Normal / Hard selector with a one-line description of the chosen level. Normal is selected by default.
- **Campaign map** (any time no mission is running): the same selector shows the level of the current save; a pick is saved at once. The briefing's status line shows the level too.
- Not available in a live mission, a raid or on a result screen (the controller refuses the change with a notice), so a run is always played at the level it started at.

## What a level changes (only existing `CampaignConfig` numbers)
| | Easy | Normal (unchanged) | Hard |
| --- | --- | --- | --- |
| Human health segments (field/boss missions; a raid adds the same offset to its own) | 5 | 4 | 3 |
| Recovery frames after a hit | 1.5 s | 1.0 s | 0.75 s |
| Blast / vehicle / hazard / trap damage (segments) | 1 / 1 / 1 / 1 | 2 / 2 / 1 / 1 | 2 / 2 / 2 / 1 |
| Thrown bottle | 1 | 2 | 2 |
| Raid heal room gives | 2 | 1 | 1 |

Okada, Armour, lives, respawn, retry, enemy durability, bot crew level (a separate loadout choice, "Crew level"), mission content, stars, rewards, unlocks and flags are identical on every level. A lethal event never kills from full health on any level (tested).

## Implementation
- `src/sim/campaign/levels.ts`: the table and `levelMaxHp` / `levelConfigLayer`. Normal returns **no** override, so a Normal match's options and state are byte-for-byte the previous campaign (tested by hash).
- `buildMissionGame` / `buildRaidGame` take an optional `level`; the controller passes `save.campaignLevel` at every start path.
- `CampaignSave.campaignLevel` (save version stays 2): a save without it (or with a damaged value) loads as Normal.
- Multiplayer and Rumble never read it (`GameConfig.campaign` is absent there; tested).
- The death / respawn / retry rules are not touched by this branch; every level goes through the same code (tested: same defeat events, lives and respawn on all three).

## Tests
`tests/campaign-levels.test.ts` (table, Normal identity, real mission/raid effect, same death rules, multiplayer, save), `tests/app/campaign-level.test.ts` (controller: default, persistence, builder gets the level, change refused during a mission, old save).

## Balance status
The numbers are first values from the existing damage model, checked by unit scenarios only; they have not been playtested against a full district. Playtest Hard on Oshodi and Lekki raids first.
