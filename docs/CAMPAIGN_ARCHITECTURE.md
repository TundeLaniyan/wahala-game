# Campaign, missions, online scaffolds: architecture and ownership

Branch `claude/wahala-campaign-online-v1`, started from the deployed release `70fd807` (gh-pages `build.json`). Nothing here is merged or published; the Pages workflow is untouched.

## Layers

```
src/platform/flags.ts      feature flags (build env + safe URL overrides)           integrator
src/sim/mission/**         PURE mission runtime: objectives, phases, boss, crews    worker mission-sim
src/ai/directive.ts        crew role directives read from Observation               worker mission-sim
src/campaign/**            PURE content (districts, bosses, factions, story),       worker campaign-content
                           progress reducers, save/load over a KeyValueStore port
src/app/campaign*.ts       campaign controller (start mission, apply result, save)  worker campaign-ui
src/ui/campaign/**         campaign screens (map, briefing, boss intro, result ...) worker campaign-ui
src/ui/HudRail*, app/hud   kill feed rail, shields, Quick Hands, mission panel      worker hud-combat
src/sim/data/fighters*,    fighter definitions, attack catalogue, Local Champion    worker fighters-combat
  systems/skills/knockdown
src/render/arenas/**       landmark anchors per district                            worker maps
src/online/**, src/voice/**, src/progression/**, src/ads/**   (Priority 3, later)  worker online-scaffold
```

A mission is an ordinary match with `GameOptions.mission`; it never needs a backend. `tick` calls the mission runtime only when `state.mission` exists, so normal matches are byte-for-byte unchanged.

## Contracts (binding)

- `src/sim/mission/types.ts`: `MissionId`, `ObjectiveKind`, `NpcRole`, `MissionSpec`, `MissionView`, `MissionOutcome`.
- `src/campaign/types.ts`: `DistrictContent`, `BossDef`, `FactionDef`, `CampaignSave`, `KeyValueStore`.
- `src/platform/flags.ts`: `flags()`.

## Feature flags

| flag | default | meaning |
| --- | --- | --- |
| `WAHALA_ONLINE_ENABLED` | false | build-time; with `WAHALA_ONLINE_URL` selects the server transport, alone selects mock |
| `WAHALA_VOICE_ENABLED` | false | shows the (disabled) voice UI state; no WebRTC in this branch |
| `WAHALA_CAMPAIGN_ENABLED` | true | the one-player campaign |
| `WAHALA_EXPERIMENTAL_CONTENT` | false | unfinished roster entries / content |

`?mockonline` (URL) enables the local mock adapters only; no URL switch can enable the server transport or voice.
