# Sound coverage matrix (decision AU2)

Source of truth: `src/audio/eventRouter.ts` (every `SimEvent` type has a handler), `src/audio/recipes/*`, `public/audio/**`, `tools/audio/voices/founder_manifest.json`. Verdicts are from the code and numeric analysis (`tools/audio/render.ts`), **not from listening**: nobody has heard any of these sounds. "Adequate" means present, triggered, and with a sensible level and spectrum, pending the founder's ears.

Legend: **OK** adequate · **NEW** added in this branch (synthesised at run time like every other effect; no download) · **REPLACED** the event used a sound borrowed from another event · **UNWIRED** the sound exists but the UI has to call it · **REC** needs recordings, not synthesis · **MISSING** nothing yet.

## Combat and movement

| Need | Before | Now | Verdict |
| --- | --- | --- | --- |
| Walking / running footsteps | nothing (no event, no sound) | `step_ground` for the human and up to 4 nearby fighters, `step_heavy` for a boss; derived from the state each tick (`src/audio/footsteps.ts`): running steps (under 0.2 s apart) are louder and brighter, none while mounted, sliding, dazed, eliminated or teleporting | NEW |
| Punch swing | `push` (the shove sound) | `punch_swing`; the empty swing is quieter and lower | REPLACED |
| Punch impact | only the combat lab / pilot played one (`gen_drop`); a normal hit was silent | `punch_hit` on every landed hit | NEW |
| Damage taken (campaign) | `push` | `hurt_hit` | REPLACED |
| Knockback | `gen_drop` | `knock_back` (scrape then thud) | REPLACED |
| Elimination | `elim_boing`, `elim_slide`, `elim_womp` + crowd | unchanged | OK |
| Daze, jump, teleport | `daze`, `hop` | unchanged | OK |
| Contact abilities (kick / punch / disarm / pass) equip and use | `contactUsed`, `contactEquipped`, `specialUsed` are silent handlers | unchanged (the kick itself plays `gen_kick`) | MISSING (equip feedback) |

## Generators

| Need | Current | Verdict |
| --- | --- | --- |
| Placement | `gen_place` | OK |
| Activation, fuse | `gen_run_loop` building into `gen_rattle_loop`, `fuse_tick` (warning bus), `gen_remote_blip` | OK |
| Warning | `fuse_tick` + the Pidgin danger line (priority 1) + HUD; warning bus is never ducked and music dips | OK |
| Explosion, chain reaction | `explosion_1-3` + `explosion_rumble`; at most 3 blasts per call, chain size layered | OK |
| Thrown / kicked / carried / dropped | `gen_throw`, `gen_kick`, `gen_carry`, `gen_drop` | OK |
| Debris | `block_crumble_1-2`, `bottle_smash` | OK |

## Interface

| Need | Current | Verdict |
| --- | --- | --- |
| Selection, cancel, start, countdown, go | `ui_click`, `ui_back`, `ui_start`, `ui_count`, `ui_go` (called from `src/app/session.ts`) | OK |
| Confirm | `click` reused | `ui_confirm` added; **UNWIRED** (`audio.playUi('confirm')`) |
| Error / refused | `placeRefused` plays `pickup_wasted`; menus reuse `back` | `ui_error` added; **UNWIRED** |
| Pause, resume | silent | `ui_pause`, `ui_resume` added; **UNWIRED**. The engine does not play them itself because `tests/audio/pause.test.ts` requires a silent pause; call `audio.playUi('pause' \| 'resume')` where the pause menu toggles |
| Match ready | `ui_start` | `ui_ready` added; **UNWIRED** |
| Victory, defeat, draw | synthesised stings `win_sting`, `lose_sting`, `draw_sting` | OK (candidate music stingers in `?audiodraft`) |

## Sudden Death and Wahala Crush

| Need | Before | Now | Verdict |
| --- | --- | --- | --- |
| Initial warning | `crush_warning` + gasp | unchanged, and `sd_rise` plays first | OK |
| Rising pressure | nothing | `sd_rise` (2.6 s riser with a speeding pulse, warning bus) | NEW |
| Each descending block | `crush_slam`, `block_crumble_1` | unchanged | OK |
| Heavy ground impact | `crush_slam` | unchanged | OK |
| Debris | none after the slam | `crush_debris` layered 70 ms after each landing | NEW |
| Arena contraction, final blast | `suddenDeathFront/Blast`: `crush_slam` + `explosion_rumble`, `suddenDeathCountdown` silent by design | unchanged | OK |
| Music | arena track with tempo escalation | candidate Sudden Death variant, same beat (`?audiodraft`) | NEW (candidate) |

## Boss encounters

| Need | Before | Now | Verdict |
| --- | --- | --- | --- |
| Entrance | `missionStarted` silent | `boss_entrance` (horn swell, stomp) on a boss mission | NEW |
| Movement | nothing | `step_heavy` | NEW |
| Special attack warning | `enemy_windup` (generic) | `boss_windup` (rising growl, warning bus, never ducked) | REPLACED |
| Attack impact | none | `boss_impact`, music ducks | NEW |
| Jammer defence | nothing | `jammer_loop` while the boss is protected, stops when he is exposed or falls | NEW |
| Vulnerability window | `ui_go` (a UI blip) | `boss_exposed` (bright rising arpeggio) | REPLACED |
| Protection returns | `ui_back` | `boss_shield` | REPLACED |
| Successful interruption | `ui_count` | `boss_interrupt` | REPLACED |
| Boss hit | `pickup_rare` | `boss_hit_big` | REPLACED |
| Defeat | `win_sting` | `boss_down` | REPLACED |
| Boss music | none | candidate three-level theme following the encounter | NEW (candidate) |

## Lagos ambience and street life

| Need | Current | Verdict |
| --- | --- | --- |
| Danfo / taxi / Keke / Okada horns and engines, railcar bell and horn | synthesised, wired to stage and vehicle events | OK (synthetic) |
| Crowd beds, reactions | `crowd_loop`, `crowd_loop_hype`, `buspark_loop`, reaction one-shots | OK (synthetic) |
| Background Pidgin talk | 47 of 47 Gemini TTS clips, bus-park and market zones | OK (synthetic voices) |
| Street activity, market objects, trolleys, metal clatter, footsteps of crowds, Lagos traffic | none | **REC**. The founder manifest lists ten `PENDING_SFX_SOURCE` files: `danfo_horn_01`, `danfo_idle_01`, `danfo_accel_01`, `keke_engine_01`, `okada_accel_01`, `street_footsteps_01`, `market_objects_01`, `metal_clatter_01`, `market_trolley_01`, `lagos_traffic_amb_01` |
| Stage-specific atmosphere beyond the bus park | none | REC. I did not synthesise new ambience beds: the founder rejected generated ambience before, and ambience is where recordings add the most |

## Silent by design or not triggered

`suddenDeathCountdown`, `vehicleExited`, `stageEnded`, `stageSweepStep`, `missionOutcome`, `missionCallout` (the match-end sting carries the outcome), `contactUsed`, `contactEquipped`, `specialUsed`. Only the contact-ability family looks like a real gap.

## Voice limits for 32-fighter City Rumble

Already in the engine and covered by tests: 24 simultaneous voices with priority stealing, at most 3 blasts and 2 eliminations started per call, a per-key minimum gap for every rate-limited cue, chain explosions layered by size, one foreground voice line at a time, danger cues on a bus that is never ducked. Added here: footsteps of other fighters are limited to the 4 nearest within 9 tiles and fade with distance; a new test throws 40 blasts, 12 eliminations, 20 punches and 20 pushes at the engine in one call and checks the voices started stay inside the budget. A real 32-fighter match has not been listened to.

## Mix and phone speakers

New impacts keep their body above 150 Hz on purpose (a step is 80 % in the 150-500 Hz band, a punch hit 92 %); the music mixes carry bass harmonics and a 3 kHz pocket. Measured with the repository's analyser, not by ear. New one-shots are peak-normalised like the rest and trimmed by recipe gain; a test iterates every registered sound for peak, duration, DC offset and seams.
