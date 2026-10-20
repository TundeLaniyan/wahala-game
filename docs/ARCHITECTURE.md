# WAHALA! Architecture

Single-player browser game: one human against 1-3 bots, running entirely in the visitor's browser and hosted as static files (GitHub Pages). There is **no server**. The code is organised so that the rules can later run on an authoritative server unchanged.

## Layers and dependency direction

```
            +-------------------------- app/ ---------------------------+
            |  composition root: fixed-step loop, match controller,      |
            |  Zustand store, wires everything together                  |
            +---+-----------+----------+-----------+-----------+--------+
                |           |          |           |           |
              ui/ (React)  render/    input/      audio/       ai/
              HUD, menus   Three.js   keyboard    WebAudio     bots
                |           |         touch,pad       |          |
                +-----------+----------+--------------+----------+
                                       |  (all read the sim's public API)
                                       v
                                     sim/   pure TypeScript, deterministic, no DOM
```

Rules (enforced by ESLint `no-restricted-imports`):

- `sim/` imports nothing from the other layers, nor `three`, `react`, `zustand`, DOM globals, `Math.random` or `Date.now`.
- `ai/` may import only from `sim/` (via `src/sim/index.ts` and `observe`).
- `render/`, `ui/`, `audio/`, `input/` never contain game rules. They read `GameState` and consume `SimEvent`s.
- Only `app/` knows about all layers. Layers talk through small typed contracts (below), never through each other's internals.

## The simulation (`src/sim`)

| Module | Responsibility |
| --- | --- |
| `config.ts` | **Every** tunable number. Durations in ticks (`ticks(seconds)`, `TICK_RATE = 60`). Overridable per game via `GameOptions.config` (used by tests). |
| `types.ts` | Plain serialisable state (no classes/Maps/Sets): `GameState`, `Player`, `Generator`, `Flame`, `Vehicle`, `Pickup`, `Intent`, `SimEvent`. |
| `state.ts` | `createGame(options)`: builds a match from a seed. Same options + seed = same match. |
| `tick.ts` | `tick(state, intents) -> SimEvent[]`: advances exactly one fixed step (the pipeline order below is part of the rules). |
| `rng.ts` | Seeded mulberry32; state lives in `state.rngState`. |
| `grid.ts` | Pure geometry helpers. |
| `arenas/` | Data-driven arena definitions (`ArenaDef`). Danfo Bus Park is 15x11. |
| `data/` | Presentation metadata and catalogues: characters (fixed signature vehicle + skill), pickups, vehicles. |
| `observe.ts` | `observe(state, playerId)`: the restricted view bots receive. |
| `systems/movement.ts` | Cardinal grid movement; kick/jump on blocked generator tiles. |
| `systems/generators.ts` | Placement, fuses, kick, carry (+1 s once), punch/throw, Kill Switch, remote detonation, dud cleanup. |
| `systems/explosions.ts` | Chain-reaction resolution, plus-shaped flames, soft-block destruction (deferred so simultaneous blasts agree). |
| `systems/lethality.ts` | Collects all lethal hits of a tick, applies Okada protection, eliminates simultaneously. |
| `systems/pickups.ts` | Reveal, collect, burn, apply effects. |
| `systems/drops.ts` | Limited loot dropped by eliminated players. |
| `systems/skills.ts` | Push / Shove / Daze. |
| `systems/entries.ts` | Pure vehicle route geometry: legal border entries, Keke turns. Used by UI and AI. |
| `systems/vehicles.ts` | Entry mode, warning, driving, collisions, cumulative blast damage. |
| `systems/match.ts` | Countdown, two-minute timer, win/draw. |
| `systems/crush.ts`, `crowd.ts`, `hazards.ts` | Optional Wahala Crush, spectator throws, floor hazards. |

### Tick pipeline (order matters)

1. expire vehicle-entry windows
2. apply player intents in player-id order (vehicle, detonate, disarm, action, skill, place)
3. movement, floor hazards
4. generator motion (slide, flight, carried)
5. pickup collection
6. generator timers (flag `triggered`)
7. vehicles advance; vehicle-generator contact flags generators; lethal hits collected
8. crush / crowd hazards
9. **explosions**: all triggered generators chain-resolve; flames created; soft blocks removed after
10. pickups burn
11. flame hits collected, then **all lethal hits applied together** (Okada, eliminations)
12. vehicle blast exposure, death loot, expiry
13. **match end check** (zero survivors = draw)

### Key rule decisions

- **Movement model:** a step commits the destination tile immediately (`x,y`); `stepFromX/Y` + `stepRemaining` let the renderer interpolate. Players pass through each other; generators, concrete and soft blocks block.
- **Owner exit rule:** no special set is needed. Leaving a tile is always allowed; entering a tile with a grounded generator never is. So an owner can exit but never re-enter.
- **Blast event:** one chain reaction = one `BlastEvent` (unique tile set). Used for vehicle exposure and for Okada's same-event grace.
- **Vehicle damage:** unique flame tiles of a blast event that lie on the vehicle's route, summed over *separate* events during one journey; thresholds Keke 4, taxi 6, Danfo 9 (config). Each survivor staggers (slowed).
- **Okada:** absorbs every lethal event of the tick it breaks in, and ignores those same events (until their flames expire) afterwards.
- **Remote Starter:** affects generators placed *after* pickup; a failsafe auto-detonates unused ones. **Kill Switch:** `disabled` generators ignore timers/remote but still explode from flame or vehicles, free the owner's capacity and are cleaned up after a delay.
- **Vehicle entry mode** is part of simulation state (`player.entryUntil`) so humans, bots and a future server share it. Selecting the entry is client-side focus; the sim validates the `launch` command.

## Contracts between layers

- **Input -> sim:** `Intents = Record<playerId, Intent>`. `move` is level-triggered; `place/action/disarm/skill/detonate/vehicle` are one-shot for exactly one tick. Humans and bots produce the same type.
- **Bot:** `src/ai` exports `createBot({ difficulty, seed, playerId }) -> Bot` where `Bot.decide(obs: Observation): Intent`. Bots are deterministic given their seed and observations.
- **Sim -> presentation:** `SimEvent[]` returned by every `tick` drive particles, sounds, captions and HUD toasts. State is read for positions.
- **Audio:** `src/audio/index.ts` exports `createAudio()` returning `AudioEngine` (unlock after a user gesture, volumes, mute, music intensity, `handleEvents(events, state)`), plus a pure `captionsFor(events, state, rng)` producing Pidgin crowd lines.

## Presentation and app

- `app/loop.ts`: fixed 60 Hz accumulator; renders every frame with interpolation `alpha`.
- `app/store.ts`: Zustand store for UI-facing state (screen, settings, HUD snapshot). The simulation state itself is *not* in React state.
- `render/`: scene, camera fit, asset registry (`render/assets`) with procedural low-poly models that can be swapped for loaded models, effects, entity views.
- `input/`: keyboard, touch controls, gamepad -> `Intent`; one `InputManager` merges them.
- `ui/`: React components: title/settings, HUD, touch controls, vehicle entry overlay, results.

## Testing

- `tests/*.test.ts` (Vitest): scenario tests build real games, force tiny situations (`tests/helpers.ts`), and assert on state and events.
- `scripts/simulate.ts`: headless bot-vs-bot batches measuring Easy/Medium/Hard.
- `e2e/*.spec.ts` (Playwright): plays the real built site on desktop and mobile viewports, with screenshots.
- Test builds expose `window.__WAHALA__` (state getter and helpers) so Playwright can read and set up game state without reaching into internals.

## Adding things

- **New pickup:** add the kind to `PickupKind`, weight in `config.ts`, metadata in `data/pickups.ts`, effect in `systems/pickups.ts`, icon in `render/`.
- **New character:** add to `data/characters.ts` (fixed vehicle + skill). **New vehicle:** add a `VehicleSpec` in `config.ts`.
- **New arena:** add an `ArenaDef` in `arenas/` and register it in `arenas/index.ts`.
