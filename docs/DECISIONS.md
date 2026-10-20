# WAHALA! decisions log

Gameplay and tuning decisions taken during implementation, with the reason. The Game Design Bible stays authoritative; entries here are either the founder's approved D1-D16 defaults or implementation choices where the Bible left a gap. Update this file whenever playtesting changes a number or a rule.

## Approved defaults (D1-D16, plus clarifications)

| # | Decision | Where |
| --- | --- | --- |
| D1 | Players pass through each other; generators, concrete and soft blocks block. Prevents corridor deadlocks and body-block griefing. | `systems/stepping.ts` |
| D2 | Remote Starter affects generators placed **after** pickup. Unused remote generators auto-detonate after 20 s (failsafe). One button detonates all of the owner's remote generators. | `systems/generators.ts`, `config.generator.remoteFailsafeTicks` |
| D3 | Vehicle damage = number of **unique flame tiles of one chain reaction that lie on the vehicle's route**, summed across separate chains in one journey (never per-bomb counting, no double counting inside a chain). Keke 4, taxi 6, Danfo 9. Every damaging encounter slows the vehicle (x1.8 for 1.5 s). | `systems/vehicles.ts` `applyBlastExposure`, `config.vehicles` |
| D4 | A Kill-Switched generator frees its owner's capacity slot. | `queries.activeGeneratorCount` |
| D5 | Disarmed generators can still be kicked / punched / carried and still explode from flame, chains and vehicles. Cleanup: a disabled dud disappears after 25 s without exploding. | `generators.updateGeneratorTimers` |
| D6 | Vehicle-entry selection is real-time: the world keeps running, the selector stands still, **8 s** window; cancelling or timing out keeps the voucher. | `systems/vehicles.ts`, `app/vehicleEntry.ts` |
| D7 | Keke stops at its 2nd player hit, taxi at its 1st, Danfo never (all stop at concrete). Taxi breaks at most 2 soft blocks, Keke 1, Danfo any number. | `config.vehicles.specs` |
| D8 | **Any** border tile with a legal route is selectable (28 entries on Danfo Bus Park, corners count once per side). 1.2 s warning (lane + gate lamps + horn) before the vehicle moves. Keke: choose entry, then the turn tile + side. | `systems/entries.ts` |
| D9 | Okada absorbs **all** lethal hits of the tick it breaks in, then ignores those same events (until their flames expire / for 0.75 s for vehicles). A separate later event kills the rider. | `systems/lethality.ts` |
| D10 | Flames destroy floor pickups, except the one uncovered by that same blast. | `systems/pickups.ts` |
| D11 | Contextual controls: kick is automatic on walking into a generator; one context button (carry/drop/punch/throw), skill, detonate (only with Remote), disarm (only with charges), vehicle (only with a voucher). | `ui/TouchControls.tsx` |
| D12 | Push and Shove both move a rival one tile (shove has a shorter cooldown 3 s vs 4 s); Daze freezes for 1 s then 2 s of immunity. | `systems/skills.ts` |
| D13 | "Skip to results" fast-forwards the real simulation (bots only) to its true outcome. | `MatchController.skipToResults` |
| D14 | Arena 15 x 11 tiles, pillars on odd/odd tiles, 4-fold mirrored soft blocks. | `arenas/danfoBusPark.ts` |
| D15 | Generic "Yellow Cab" branding for the taxi. | `data/vehicles.ts` |
| D16 | Wahala Crush, crowd throws and floor traps ship **off by default**. | `app/settings.ts` |

## Implementation choices (not in the Bible)

- **Movement model:** a step commits its destination tile immediately; the renderer interpolates. One step = 10 ticks (6 tiles/s). Roller Skates 9/8/7, Okada -2 ticks, slow curse +4.
- **Flame behaviour:** a neighbouring generator absorbs an arm (and chains); soft blocks are removed only after the whole chain resolves so simultaneous blasts never disagree about what blocks what. Flame lifetime 0.6 s.
- **Chain events:** one chain reaction = one `BlastEvent` / event id; separate triggers in one tick that do not chain are separate events.
- **Spawn safety:** each spawn clears an L of three tiles plus the two corner-turn tiles (`(2,1)` and `(1,2)` relative to the corner) so a player can always escape their own first blast. Added after the e2e suite showed a corner could be sealed by random soft blocks.
- **Carry rule:** +1 s only on the first pickup of a **timed** generator; picking up remote/disabled generators gives nothing. Carried generators tick, can explode in hand, and are thrown if the carrier owns Gloves.
- **Jump Sneakers** hop exactly one generator (2 s cooldown). **Hot Fuel** is a one-generator boost: its arms burn through the first soft block of each arm.
- **Curses:** slow, reversed controls, weak fire (range 1) for 8 s. Pickup weights are in `config.pickups.weights`.
- **Death loot:** up to 2 held upgrades dropped on the nearest empty tiles (BFS), never into fire.
- **Wahala Crush:** starts at 0:40, one outer-ring tile every 0.8 s clockwise, 1.2 s telegraph. An Okada rider under a landing block is shoved to the nearest free tile (Okada consumed). Crush kills inside one tick can draw.
- **Crowd throws:** first at 0:25, then every 9-16 s, 2 s telegraph at a fixed tile (dodgeable). Bottle dazes; rare firecracker is lethal on its tile and the four around it (and sets generators off). Okada absorbs it.
- **Floor traps** (Lekki Roadworks only): pothole = brief stumble; oil = slide 2 tiles. Never lethal.
- **Pause policy:** auto-pause when the tab is hidden; Esc/P toggles; pausing is blocked after the match ends.
- **Pidgin captions** are original lines written for this project; a native-speaker review is recommended before shipping.
