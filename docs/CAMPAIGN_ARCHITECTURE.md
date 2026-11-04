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

## Status (integration branch)

| area | state |
| --- | --- |
| Campaign (map, prologue, briefing, boss intro, mission, result, finale, save/load, replay modifiers) | complete, browser-tested; works with every online flag off |
| Six district missions (`src/sim/mission`) | all six playable with distinct verbs; **Oshodi is the fully scripted, tested vertical slice**; the other five have unit tests per mechanic and an idle-human smoke run but no scripted playthrough and are untuned against real play |
| Boss art / animation | borrows the three existing fighter rigs in the boss palette; bespoke models, animation, defeat cutscenes need art (see `docs/CAMPAIGN_STORY.md`) |
| Fighters, 8 attacks, Local Champion | complete in the sim, balanced by measurement; secondary attacks are OFF by default (`skills.secondaryAttacks`); Local Champion is not on the default ladder |
| HUD (kill feed rail, shield, Quick Hands, Sudden Death, mission panel) | complete; mission world markers / minimap are in the presentation pass (`docs/MISSION_PRESENTATION.md`) |
| Map anchors | seven areas documented in `docs/MAP_IDENTITY.md`; two anchors (Lekki bridge, Mushin station) read fully only in the overview |
| Online / voice / progression / seasons / ads | interfaces, schemas, local mocks and a flag-gated preview UI; **no backend, no real voice, no ad provider** |

## How to

- **Campaign** is on by default (`WAHALA_CAMPAIGN_ENABLED=true`): Home -> Campaign. `?campaign=0` hides it. The save is `localStorage['wahala.campaign.v1']`.
- **Mock online** (no network at all): add `?mockonline` to the URL, or build with `WAHALA_ONLINE_ENABLED=true` and no `WAHALA_ONLINE_URL`. Home then shows "Online (preview)".
- **Voice UI state**: `WAHALA_VOICE_ENABLED=true` at build time shows the disabled "not available yet" state. There is no WebRTC code in the build.
- **Experimental roster**: `WAHALA_EXPERIMENTAL_CONTENT=true` or `?experimental`.
- **Connect a real backend later**: implement the endpoints in `docs/ONLINE_ARCHITECTURE.md`, build with `WAHALA_ONLINE_ENABLED=true WAHALA_ONLINE_URL=wss://...` (this includes the server adapter chunk and intentionally fails `npm run check:static`, so such a build must never go through the Pages publisher), and run `src/sim` on the server.
- **Static guarantee**: `npm run check:static` builds with no `WAHALA_*` variables and fails if the output contains WebSocket, EventSource, RTCPeerConnection, getUserMedia, XMLHttpRequest or a `wss://` endpoint; `tests/platform-static.test.ts` proves the same from the import graph.
