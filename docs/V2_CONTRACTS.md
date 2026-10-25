# WAHALA! V2 (Gameplay Revolution + City Rumble V2): shared contracts and ownership

Branch `claude/wahala-gameplay-rumble-v2` (from `claude/wahala-voice-integration` @ `184837d`). This file is the
lead's contract for the six parallel workstreams. Founder requirements of 2026-10-25 take precedence over older
docs where they conflict (they are recorded as decisions in `DECISIONS.md`, section W).

## 1. Shared simulation contracts (already in the code, Phase 0 commit)

| Contract | Where | Notes |
| --- | --- | --- |
| Two buttons | `Intent.place` (A), `Intent.special` (B tap), `Intent.detonate` (B hold) | Legacy `action` / `disarm` / `skill` / `vehicle` intents still exist for tests and bots; the human UI no longer produces them. |
| B resolver | `sim/systems/actions.ts` `resolveSpecial`, `previewSpecial` | melee if an opponent is adjacent (facing first, then up/right/down/left; never a teammate) else voucher -> one-press vehicle else nothing. Adjacent opponent = melee context even on cooldown (never a surprise vehicle). Emits `specialUsed`. |
| Contact abilities | `Player.contact: 'kick'|'punch'|'disarm'|'pass'|null`, `sim/systems/contact.ts` `tryContact` | Triggered by MOVING into a grounded generator. Mutually exclusive; `pickups.ts equipContact` replaces and emits `contactEquipped`. Disarm uses `killSwitchCharges`, the ability ends with the last charge. `contactReadyTick` anti double-fire. Pickups: boots=kick, gloves=punch, killswitch=disarm, bombpass=pass. |
| Carry | `grip` weight 0 | Code kept (legacy `action` intent), never granted in normal play, not in tutorials. |
| One-press vehicle | `VehicleIntent { type: 'auto' }`, `vehicles.ts autoLaunch`, `systems/autoVehicle.ts chooseAutoVehicle/scoreRoute` | Pure, deterministic, works on an Observation. No entry mode needed. |
| Protection | `Player.armour` (max `protection.maxArmour`), `mounted` (Okada); `lethality.ts` | ONE layer absorbs all lethal events of a tick (Okada first, then Armour), then same-event grace. Emits `protectionBroken` (+ `okadaBroken`). `protectedUntil` = spawn protection (crush still kills). |
| Friendly fire | `queries.ts canHarm`, used for flames + vehicles | Self-damage always on; teammates spared unless `settings.friendlyFire`; spectator throws / environment hit everyone. |
| Square Blast | `Player.squareTier`, `Generator.square` (radius), `explosions.ts squareFootprint` | Union of the normal plus AND the square. Monotone wave rule (never through concrete, crate absorbs, generator chains but stops the wave). Exported for the AI. |
| Elimination credit | `systems/attribution.ts creditFor`; `Player.stats`, `eliminatedBy`, `recentHits`; `playerEliminated.creditId/assistIds`; `BlastEvent.seedOwnerId` | Flame owner; own blast -> chain starter; vehicle owner; else newest opponent melee within `credit.assistWindowTicks`; spectator throws never credited. Stats updated in `eliminate()`. |
| Rewards | `systems/rewards.ts`, `config.rewards` (ladder) | Enabled by the Rumble rulesets; granted immediately to the living credited eliminator; `rewardGranted`. |
| Rulesets | `sim/modes.ts`, `MatchSettings.game: 'classic'|'survival'|'deathmatch'|'team'`, `friendlyFire`, `teamCount`, `durationSec` | `modeConfig` overrides merged arena -> mode -> test. Respawn modes never shrink. Teams `Player.team` (NO_TEAM = -1). |
| Respawn | `systems/respawn.ts`, `config.respawn` | Safest spawn, spawn protection, life-based reset. |
| Match end | `match.ts` | classic/survival: last standing; respawn modes: at time, `timedResult` (kills, fewer deaths, assists, earlier last kill) / `teamStandings`; `MatchResult` adds `teamWin` and draw reason `tie`. |
| Spectators | `Player.spectator`, `systems/spectators.ts`, `config.spectator`, `spectatorThrow` event, `EliminationCause.kind 'spectator'` | Scaffold only (B implements). |
| Difficulty | `Difficulty` = 7 levels, `DIFFICULTIES`; `ai/profiles.ts` interim mapping (`AiProfile.tier`) | B replaces the interim mapping with seven real profiles. |
| Settings | `app/settings.ts` | `play: 'rumble'|'classic'`, `botDifficulties[3]`, `rumbleMixed`, `rumbleMode`, `rumbleMinutes`, `friendlyFire`, `rumbleArenaId`, `shake`, `narration`; `mode` removed (Crush mandatory). Legacy easy/medium/hard -> beginner/standard/expert. `names.ts matchArenaId/botDifficulty`. |
| HUD | `app/hud.ts HudMe` | `contact`, `armour`, `squareTier`, `special`, `kills/deaths/assists`. |

New `SimEvent`s: `contactUsed`, `contactEquipped`, `specialUsed`, `protectionBroken`, `rewardGranted`,
`playerRespawned`, `spectatorThrow`. Tick order additions: respawns (start of play tick), spectators (after
movement), rewards + respawn scheduling (right after lethal hits).

## 2. File ownership

Edit files you own freely. Files owned by another stream: only small, clearly necessary edits, and say so in your
report. Shared files (`types.ts`, `config.ts`, `tick.ts`, `sim/index.ts`, `settings.ts`, `hud.ts`) belong to the lead:
add fields you need (append, do not reorder), keep edits minimal and mention them.

| Stream | Owns |
| --- | --- |
| A Controls & combat | `input/*`, `ui/TouchControls.tsx`, touch CSS, `sim/systems/{contact,actions,autoVehicle,skills,vehicles,generators}.ts`, `app/vehicleEntry.ts` (retire from normal play), `MatchController` input wiring, `render/cameraRig.ts` + shake in `GameRenderer.ts`/`fx/Effects.ts`, `ai/{vehicleAI,emergency,skills,tactics}.ts`, contact/melee animations in `render/views/PlayerViews.ts`, `ui/Hud.tsx` contact indicator, `ui/howToPlayControls.ts`, `e2e/mobile.spec.ts`, `e2e/game.spec.ts` |
| B AI & Classic | `ai/{profiles,brain,index,headless,scale}.ts`, `tests/ai/*`, `scripts/simulate.ts`, `sim/systems/{spectators,crush,match(classic part)}.ts`, `sim/arenas/mobileTest*.ts` + its render module, `ui/DifficultyPicker.tsx` (new), spectator UI `ui/SpectatorControls.tsx` (new) |
| C Economy & blast | `sim/systems/{explosions,attribution,rewards,lethality,pickups,drops}.ts`, `ai/{danger,analysis,goals,remote}.ts`, square-blast/armour visuals (`render/views/FlameViews.ts`, `GeneratorViews.ts`, `fx/Effects.ts` blast parts, `render/views/okadaShield.ts`), `ui/ProgressionBadge.tsx` (new) |
| D Modes & menu | `sim/modes.ts`, `sim/systems/respawn.ts`, `match.ts` (timed part), `ai/{world,context}.ts` team awareness, `ui/TitleScreen.tsx`, `ui/ArenaPicker.tsx`, `ui/RumbleHud.tsx`, `ui/Overlays.tsx` (results), team markings in `render/views/PlayerViews.ts`/`render/assets/characters.ts`, `app/spectate.ts`, `e2e/rumble.spec.ts` |
| E Training Academy | `src/tutorial/**`, `app/TutorialController.ts`, `ui/HowToPlay.tsx/.css`, `tests/tutorial/*`, `e2e/tutorial.spec.ts` |
| F Rumble stages | `sim/arenas/<five new>.ts` + registration in `arenas/index.ts`, `render/arenas/<five new>*.ts` + `newArenas.ts`/`arenaLook.ts` entries, `public/audio/music/manifest.json` arena entries, `ui/RumbleStagePicker.tsx` (new), `tests/rumble-stages.test.ts` |
| Lead | contracts above, voices + music import, docs, integration, CI, deploy |

## 3. Rules for every stream

- Read `CLAUDE.md` first. `src/sim` stays pure/deterministic; balance numbers in `config.ts`; arenas are data.
- Work in your worktree on your own branch, based on the V2 branch HEAD. Commit meaningful checkpoints.
- Run `npx tsc --noEmit`, `npx eslint <your files>`, and the vitest files you touched plus the ones that cover
  your area. The full suite takes ~1 min on an idle machine; the machine is shared by six streams, so prefer
  targeted runs and run Playwright only for your own spec (`WAHALA_CHROMIUM=/opt/pw-browsers/chromium`).
- Every bug fix / mechanic gets a scenario test (`tests/helpers.ts`). Log gameplay/tuning decisions in
  `docs/DECISIONS.md` section "W" with a short id prefix of your stream (WA1, WB1 ...).
- Never claim something works without a test or a real browser check. Report exactly what is done and not done.
- Known red test at the Phase 0 commit: `tests/ai/ordering-hard-medium.test.ts` (expert vs standard margin) - B owns it.
