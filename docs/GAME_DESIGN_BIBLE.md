# WAHALA! — Game Design Bible v1.0

**Project:** WAHALA! (working title; trademark/branding not yet cleared)  
**Last consolidated:** 20 October 2026  
**Authority:** Founder decisions in the discussion through 20 October 2026 supersede the October handover and the older, now-outdated online-first implementation plan.  
**Status:** Approved creative vision and Phase 1 build baseline; gameplay numbers are adjustable through playtesting.  
**Genre:** Nigerian-culture-inspired, strategic, comedic, 3D-presented grid-based arcade survival game for browser and mobile web. Inspired by the *feel and tactical structure* of classic Bomberman; make original artwork, characters, sounds, environment designs, names and code.

> **Reading this Bible:** **LOCKED** means explicitly chosen by the founder (or accepted as a recommendation). **PLAYTEST** means proposed parameters/recommendations to tune, not eternal rules. **LATER** means outside the first fully playable offline build. Preserve the LOCKED rules. Implement sensible PLAYTEST defaults without repeatedly asking permission; expose configurable values centrally. Do **not** silently reintroduce superseded concepts.

---

## 1. Vision and creative pillars — LOCKED

WAHALA! should be instantly readable, skill-based, tactical and playful: a modern, Nigerian-street-culture arcade game for late teenagers and adults without a babyish presentation.

1. **3D visuals; strictly 2D grid game rules.** Movement is on orthogonal square tiles: up, down, left, right; no diagonal shortcuts, jumping around like a platformer or unconstrained third-person movement. A fixed elevated/isometric-to-near-top-down camera preserves maze readability.
2. **Portable generators are the universal standard explosive weapon.** Placed generators trigger predictable plus-shaped flame lines along rows and columns; visible source and wall interactions are compulsory. Explosions, escaping and deliberate traps are the heart of every match.
3. **Players eliminate opponents strategically** while escaping their own blasts; a single lethal hit eliminates an on-foot character. No health bars, damage numbers, or general fighting-to-zero-health.
4. **Nigerian identity with polish:** Danfos, taxi, Keke, Okada, realistic local environments made stylised, Pidgin crowd chatter, celebratory banter, original Afrobeat/Afrobeats/Highlife-inspired instrumental rhythm, comical non-graphic eliminations.
5. **Readability, fairness and counterplay** beat chaos. Any dangerous incoming attack should give a short legible warning; gameplay never relies on inexplicable offscreen deaths. Traps are visible or foreshadowed.
6. **Desktop, mobile touch and controller accessibility:** control device must not determine the power of a move.

### Forbidden drift

- Do not substitute cars or animals for the main generator weapon.
- Do not add rideable animals, dinosaurs or Bomberman Louie lookalikes. **An Okada motorcycle replaces that role.**
- Do not make Okada the fourth vehicle attack. There are **exactly three signature vehicle attacks**: Danfo, LAGride-style taxi, Keke. A previous Cadillac/Caddo proposal was removed.
- No fighting-combo/health bar system, no diagonal explosions, no gameplay-driven cinematic camera, no untraceable fire, no mandatory server for Phase 1.
- Do not treat generated reference images/videos as exact gameplay logic. They are *visual inspiration*, not licensed game assets or evidence of correct mechanics.

---

## 2. Platforms, release order and modes

### Phase 1 — LOCAL SIMULATION IN BROWSER; publicly shareable URL — LOCKED

- **One human versus 1–3 AI players**, selectable **2, 3 or 4 total competitors** in free-for-all; AI Easy / Medium / Hard actually changes planning and skill.
- One complete **Danfo Bus Park** environment first. A polished, working game takes priority over several empty arenas.
- Game calculates movement, AI, physics/game rules and match outcomes **in the player's browser**. There is **no application/gameplay server, backend, database, authentication, WebSocket or real-time multiplayer**.
- Hosted as a static frontend site (GitHub Pages is a good initial host). A visitor opens a URL to run their own private human-versus-AI match. "Public URL" does **not** mean players share the same match.
- Landscape-first phone experience and fully usable keyboard/mouse; gamepad support is a design target, especially for vehicle lane choice. Responsive layout for typical devices.
- Users can replay, change bot difficulty, change character, and enter settings without reloading unnecessarily. No accounts needed.

### Later offline expansion — LATER

- Expand the character roster, 5–10+ distinctive arenas, alternative match rules, best-of-three/five, five-arena points tournament, special **Power Yard** arena, additional sound/visual polish, perhaps offline big-map tests with many AI opponents.

### Public online launch — LATER, but firmly in product vision

- **Real human online multiplayer AND bot play** at the eventual public online launch.
- Free-for-all and **2v2**, with room **friendly-fire On/Off** setting. Self-harm from the player's own attacks still applies in both settings; friendly-fire Off only protects allies from ally-owned weapons.
- Best-of-3, best-of-5 and five-arena leaderboard tournaments supported.
- Real-person spectators can watch, type/chat and cheer; spectators **may be biased**, including supporting or targeting friends. **Randomly selected eligible spectators** receive opportunities to throw dazing or explosive objects at an aimed square. Selection is random; aim may deliberately target particular competitors. Separate spectator-presence and spectator-attack controls. Enforce modest cooldowns, visible landing warnings, anti-spam and basic moderation. Human and bot participants equally vulnerable to these neutral-in-simulation arena hazards.
- Needs a game server, anti-cheat, matchmaking, reconnection and moderation **later**, not in Phase 1.

### Large survival mode — LATER

**Working name: WAHALA! City Rumble.** Large scrolling/follow-camera arena, potentially 8, 16, 24 and eventually 32 competitors as devices/performance allow. Longer rounds ~6–10 minutes are a **PLAYTEST** recommendation, with map/minimap and predictable endgame pressure. This is a distinct mode, not the same two-minute board forced to fit 30 players. May be prototyped with offline bots before online infrastructure.

---

## 3. Standard match rules

- **LOCKED**: Standard match lasts **two minutes**; last remaining competitor wins. All opposing parties eliminated simultaneously (including final two by the same blast) **is a draw**; simultaneous final-team elimination likewise a draw.
- **LOCKED**: If no player has won at timeout and multiple opponents/teams are still active, a timer-only match ends in a draw.
- **PLAYTEST**: **Classic Timer** (no collapsing walls) and **Wahala Crush** (sudden-death permanent concrete blocks advance inward, with warnings, potentially until final tile closes) as selectable match types. Founder expressed openness to both; final defaults/precise collapse sequence not explicitly locked. If all survivors die together from wall closing, draw.
- **PLAYTEST**: Increase crowd/music intensity in final 30 seconds. Endgame cues must not drown out critical audible danger warnings.
- **LOCKED**: Elimination is non-graphic and humorous (launched into a dumpster, swept off stage, shoes from comic dust cloud, Keke collision tumble). Animation never determines the actual logical winner.
- **ACCEPTED**: Eliminated players drop **a limited number** of their held upgrades onto valid empty tiles (no massive clutter); surviving players may collect them. Full upgrade reset on new round except arena-specific preloads. Local human elimination may switch to a spectator camera with Skip to Results.
- **PLAYTEST**: Every full round begins with symmetrical basic resources unless a special arena declares otherwise.

---

## 4. Map topology and obstacles

- Square grid with readable corridors, balanced spawn zones and uninterrupted logical tile positions even though graphics are 3D.
- **Indestructible (hard):** concrete pillars, structural masonry, reinforced arena borders. Block movement, explosion propagation and vehicle travel. Cannot be removed by Power Diesel.
- **Destructible (soft):** rubbish piles, wood market crates, dumpsters, tyre stacks, small stalls, suitable arena props. Block movement and stop the first incoming flame as they are destroyed, possibly exposing a collectible. Visual materials make breakability obvious.
- **Special obstacles — PLAYTEST:** heavy gate or two-hit crate only for arenas designed around it; avoid adding confusing blockers to the first arena.
- Some arena spawn zones begin separated by breakable barriers, compelling route-clearing and item hunting before open combat.
- Safe spawning: do not place a player where they can be eliminated on the first tick without a fair chance to move.
- **Trap arenas only — LOCKED:** potholes that momentarily slow/stumble, gutters that restrict crossing, slippery oil that causes a predictable tile slide, telegraphed trapped crates and similar hazards. **Not** indiscriminate hazards in every arena. Independent ambient road traffic can cross designated arena routes on particular maps and lethally collide with players or consume Okada protection, with warnings.

---

## 5. Generator rules — LOCKED except specified balance values

### Placement and collision

- Everyone starts able to place a timed **portable generator** onto a legal unoccupied tile. Never render an explosion that has no identifiable generator origin.
- **Bomberman placement grace — LOCKED**: after placing a generator on the player's current tile, the placing player can move off it, but cannot re-enter that tile while the generator remains. Other players cannot traverse its tile. Moving off does **not** leave an extended pass-through permission.
- A player can be eliminated by their own generator. Placed generator ownership does not confer explosion immunity.
- **PLAYTEST baseline:** fuse about **3 seconds**; one simultaneously active generator; base blast length **2 tiles in each cardinal direction** (a maximum of five cells along an open row including centre). Configure these constants centrally, do not hardcode across rendering/AI.

### Explosion propagation

- Explosion starts from the generator's tile then extends in a **plus (+)** shape, never diagonally. Stops at solid concrete. Hits/destroys the first encountered destructible block and **does not pass through that block on that same blast** unless a specifically designed penetration upgrade says otherwise. Chain reactions trigger generators hit by fire immediately (including disabled and remote generators).
- Resolve chain reactions deterministically, without double-triggering a single generator or processing variable updates in character-render order. All eliminations caused in the same event/tick are evaluated simultaneously to allow real draws.
- Show visible generator casing, flash/spark/rattle/timer and brief fire; show which generator caused each line of fire. Colours, smoke and 3D particles must not obscure threatened tiles.

### Manipulating generators

- **Kick (Football Boots):** run/push a generator in a line along a valid grid corridor until collision.
- **Punch (Mechanic Gloves):** throw/knock a generator several grid tiles on a cardinal trajectory. Landing and edge rules configurable. This should not add unjustified instant explosions.
- **Carry (Generator Grip/Harness):** pick up a live generator, walk with it (tile movement still obeys grid), and drop it onto a legal tile. **LOCKED: adds exactly +1 second to that generator's currently remaining fuse on the first successful pickup.** Countdown otherwise continues while carried. Never re-grant bonus by dropping/picking repeatedly; carrying grants no blast immunity; it may detonate in player's possession.
- **Remote Starter:** collectible replacing the automatic timer for the user's relevant active/new generators with on-demand trigger until ability expiry/round end. Remote generators can still trigger by chain reactions or vehicle collisions. Capacity, UI and anti-stalling cleanup limits are **PLAYTEST**. Remote detonation MUST be a genuine mechanic, not a decorative button.
- **Generator Kill Switch:** at adjacent distance, deactivate the generator's automatic countdown and its ordinary manual restart/detonation ability permanently; **LOCKED: it remains physically present and STILL EXPLOSIVE when struck by another generator's flame or vehicle collision**. Cannot be switched on again. UI and cleanup behavior **PLAYTEST** to avoid permanently barricading all lanes. Can act on own or enemy generator (accepted recommendation).
- Treat carry/remote/kill-switch interactions carefully: a remote generator has no normal ticking fuse, so +1-second carry benefit only applies to timed generators unless a clearly documented rule is chosen; a disabled generator cannot be restarted remotely.

---

## 6. Collectible upgrades, cursed pickups, loot

**LOCKED/ACCEPTED feature catalogue** (names are proposed theming and can be polished; counts/rarity PLAYTEST):

| Pickup | Role | Persistence suggestion |
|---|---|---|
| Petrol Top-Up | +1 flame reach in each of four directions | Round-long stackable |
| Power Diesel | Maximum blast range to hard wall/arena edge | Round-long special; no fire through concrete |
| Extra Socket | +1 simultaneous active generator capacity | Round-long stackable with cap |
| Roller Skates | Faster tile movement; no illegal diagonal skips | Round-long or tuned duration |
| Football Boots | Kick generators | Round-long |
| Mechanic Gloves | Punch/throw generators | Round-long |
| Generator Grip | Carry a generator; once-only +1s when first picked up | Round-long ability |
| Remote Starter | Remote-controlled explosive generator ability | Round-long/tuned |
| Generator Kill Switch | Touch/adjacency disarming; externally triggered afterward | Cooldown/charges tuned |
| Jump Sneakers | Leap a single generator/low soft obstacle to valid tile | Round-long with cooldown |
| Hot Fuel | Penetrate limited soft obstacles | Rare/temporary; carefully signalled |
| Okada Ride | Rideable motorbike, speed/mobility and one protective lethal hit | One mount, no stacking |
| Vehicle Voucher | Charge one activation of character's fixed signature vehicle | Consumable; do not stockpile indefinitely |
| Bad Fuel / Mystery Package | Temporary random debuff: slow, inverted control, reduced fire etc. | Brief, announced; never unplayably long |

- Pickups arise from destroying soft obstacles, with legible icons/3D objects rather than visually confusing props.
- Permanent upgrades normally reset each round. Rare curses expire. A player shouldn't stack Okadas for multiple extra lives.
- **PLAYTEST** drop probabilities and maximum pickup inventory/slot count; prioritise meaningful choices and clear HUD over 20 inaccessible buttons.

---

## 7. Okada — rider's one-hit protection, NOT an attacking vehicle

- **LOCKED**: a collected **Okada motorcycle** replaces Bomberman's mount idea. Characters ride it visibly, move faster and receive one protective hit against **any otherwise lethal hazard**: own/enemy generator, special vehicle, ambient traffic, lethal crowd item or deadly stage event.
- On first lethal collision, the Okada is comically destroyed, rider survives on foot. Apply a **short anti-double-hit invulnerability window** against the continuing same blast/collision so a single event does not eliminate rider in the next update.
- A second, separate lethal attack after protection ends eliminates the unmounted player. One active Okada only; no stackable lives.
- **PLAYTEST** whether Okada may jump a gutter and its exact speed increase. All movement remains cardinal/tile-aligned; don't turn it into an unrestricted driving game.

---

## 8. Signature vehicle attacks — exactly THREE

Every selectable character has a **fixed assigned signature vehicle**. Everyone still uses generators as their primary weapon; destroying breakable blocks can reveal a **Vehicle Voucher** that unlocks one launch, rather than randomly changing the player's vehicle type. Signature vehicles are secondary, special attacks.

| Attack vehicle | Locked/proposed movement and combat identity | Obstacle role |
|---|---|---|
| **Yellow Danfo bus** | Heavier/slower, straight cardinal road; can eliminate several players sequentially without stopping at first target | Rips through normal soft blocks across its selected path; hard walls stop it |
| **LAGride-style taxi** | Faster straight cardinal route; **stops on hitting first player** | Breaks a limited number of soft obstacles; hard walls stop it |
| **Keke Napep** | Faster agile attack with **one 90-degree turn** in a legal L-shaped cardinal path (**PLAYTEST** target count) | Limited break-through strength, hard walls stop it |

**LOCKED:** No fourth Okada special; no Cadillac. Character may be hurt by their own special vehicle. In team games, teammates can be harmed when friendly fire On; team-owned damage is ignored by teammates when friendly fire Off; **owner remains vulnerable in either setting**.

### Entry and controls — locked design direction, exact UI tuned

- Activate special to expose legal **perimeter entry tiles along every border**, not merely centre or four corners, plus a preview of valid lane, road, shutter/gate/ramp opening and warned incoming direction.
- **Touch:** tap the desired eligible entry; confirm. **Mouse:** click. **Keyboard/gamepad:** use arrows/D-pad to move focus among valid perimeter entries, confirm with action. A smart suggested entry is optional assistance, never required aiming automation.
- Roads/gates opening should fit arena design; prevent arbitrary vehicle appearances and unwarned instant elimination.
- Vehicles remain orthogonal. Keke's turn is selected through an intuitive on-grid route/turn control consistent with all input devices; no diagonal driving, phasing through concrete or teleporting.
- If a player is near a border they should feel threatened, but warnings must provide reaction opportunity.

### Generator interaction and cumulative strength — NEW LOCKED DIRECTION

- An attacking vehicle that collides with a placed generator **immediately triggers that generator**, even if its timer has been disabled or it was remote-controlled. Plus-shaped flames and chain reactions then occur per normal generator rules.
- **Vehicle resistance depends on accumulated exposure to generator blast coverage/strength in grid tile units**, NOT a simplistic three-separate-bombs-to-kill counter.
- A single upgraded generator with enough effective flame coverage may destroy a vehicle; alternatively multiple standard generators along its route/chain reactions can combine to achieve the same total.
- **Critically, damage accumulates across separate detonations during a single vehicle's journey**. Surviving one collision briefly slows/staggers the vehicle and leaves it closer to destruction by the next generator encountered.
- Use unique intersecting fire tile coverage within the same explosion event/chain to avoid counting overlapping flames on the same tile multiple times; separate later explosion events can add damage. Damage does not persist after a vehicle disappears/next special activation.
- **PLAYTEST illustrative resistances only:** Keke ~3–4 effective fire tiles, taxi ~5–6, Danfo ~9. Tune with vehicle speed, arena dimensions, maximum range and obstacle breaking. The exact contribution model must be explicitly documented/testable and visually understandable, not opaque arbitrary HP.
- Temporary slowdown upon blast contact should be visible but not introduce misleading permanent slowing; resistance remains depleted for that vehicle's lifetime.
- When multiple simultaneous hazards occur, resolve damage, triggered blast and player hits in deterministic order. Destroying a vehicle should never retract a generator explosion that it already triggered.

---

## 9. Characters and close-combat skills

- **LOCKED** close-combat design: some characters have a **Push** that shifts an adjacent rival one tile, others have a brief **Daze Punch** that freezes an adjacent rival temporarily. The push/punch cannot directly eliminate; however, it may place an opponent in a flame line or vehicle path. No health, multi-hit melee KO or damage numbers.
- **ACCEPTED starting character concepts** (working names/looks, not branding commitments):

| Character | Fixed special | Secondary |
|---|---|---|
| Street Baller | Danfo | Push adjacent player one tile |
| Lekki Boy | LAGride-style taxi | Daze punch |
| Campus Queen | Keke Napep | Quick shove/push |

- Future roster may feature six to ten characters; vehicles can be shared across different characters while secondary abilities/animations change. AI has access to equivalent abilities and respects cooldowns and danger rules.
- **PLAYTEST** push direction rules, collision with occupied tiles, daze duration and cooldown/anti-stunlock. Neither a punch nor push should overpower core generator gameplay.

---

## 10. AI — Easy, Medium, Hard

- **LOCKED**: AI setting must visibly change tactics, not only bot speed/health or superhuman reaction. All bots obey the same grid, pickups, attack legality and danger windows as humans. No cheating by knowing random future events.
- **Easy:** moves, drops generators, sometimes chooses poor positions, basic attempt to escape, slow and imperfect hazard evaluation.
- **Medium:** pathfinding through corridors, blast-timing awareness, sensible escapes, collects upgrades, basic traps, purposeful special route choice.
- **Hard:** plans several steps ahead, predicts likely escape routes, coordinates strategic generator placement and chain reactions, considers pickup/risk trades, uses vehicle entries intelligently, but remains beatable.
- Use tick-based hazard awareness; test AI doesn't continuously suicide and can navigate temporary bottlenecks. AI skill levels should perform measurably differently over repeated seeded simulated matches.

---

## 11. Arenas and live Nigerian atmosphere

**Initial playable:** Danfo Bus Park (fixed camera, Lagos-styled booths/road paint, concrete pillars, tyres, crates, vans and crowd beyond play area). Use original models/textures/sound; keep HUD, players, generator origins, fire lanes readable.

**Future potential arenas (many are creative proposals rather than founder-locked launch map list):**
1. Campus Courtyard/Stadium — early blocked spawn routes, enthusiastic students.
2. Balogun Market — dense stalls, colourful obstacles, merchant reactions.
3. Lekki Rooftop — speakers, neon, skyline, narrow lanes.
4. Port Harcourt Waterfront — bridges/wharf bottlenecks.
5. **Power Yard** — start everybody with full fire power, extra generators and kick/punch, like classic Power Zone concept (without copying art/layout).
6. Third Mainland Junction — signalled ambient traffic crossings.
7. NEPA Blackout — lighting changes but full hazard visibility.
8. Abuja Transit Terminal — opening gates and moving routes.
9. Carnival Plaza — energetic audience and booby traps where designated.
10. Additional Nigerian neighbourhoods based on regional authenticity and balanced maps.

**LOCKED**: More than five arenas are possible; 5 was never a hard cap. Stage hazards like potholes/gutters/booby traps **only exist in specially designed arenas**. One fully polished arena before mass-creating similar maps.

### Crowd interaction and audio

- Reactive spectators around the edge cheer, laugh, tease, argue and shout in varied, natural Nigerian Pidgin, not repetitive canned lines. Allow moments of near-silence so effects read.
- Random crowd throws in offline play may be AI-controlled **arena events**, if enabled. Nonlethal bottles briefly daze; a rare explosive object can eliminate humans and bots; clearly telegraph landing area.
- Online later: actual spectators can chat and receive random turns to throw at deliberately aimed players; bias/partisanship permitted, option to turn presence/attacks on/off independently, moderation to prevent abusive chat and spam.
- Score original instrumental loops drawing on Afrobeat / Afrobeats / Highlife / street percussion. Sound events: generator rattle, warning, blast, tyres, horns, Keke, Pidgin shouts, comic elimination sting. Preserve clear hazard warnings and user volume/mute control.

---

## 12. Interface and accessibility

- Landscape-first responsive canvas; fixed elevated camera showing entire standard grid and relevant danger lanes. No dramatic camera pan that causes player confusion.
- On-screen movement D-pad or well-designed touch control; generator placement, ability, kick/punch/carry interaction, remote detonation, disarm and vehicle special need usable buttons with contextual modes rather than a permanent jungle of tiny icons.
- Keyboard arrows/WASD for movement; a consistent clearly labelled action mapping; gamepad D-pad/analogue axes with discrete directional action, face buttons, vibration optional. Vehicle entry works without mouse/touch.
- Settings: player count, AI difficulty, character, music/FX volume, environment hazard toggle where applicable, Classic Timer vs (later/optional) Wahala Crush; game mode options progressively exposed based on release version.
- HUD: timer, alive/eliminated competitor portraits, active power-ups/counts, generator capacity, blast length, remote mode, vehicle readiness and selected entry. **No health bars.** Distinguish Okada protection separately.
- Ensure playable minimum target on mid-range phones; cap/scale particles/shadows, use instancing/mesh reuse and avoid memory leaks. Pausing/background tab should not corrupt local solo-round outcome; choose a consistent pause policy.

---

## 13. Phase 1 scope and milestone boundaries — primary source of truth for Claude Code

**End goal:** a beautiful-enough, genuinely playable, frontend-only single-player browser game with one human vs 1–3 AI in Danfo Bus Park, not just a 3D demo or screenshot.

### Phase 1A: Foundation + first true round

- Vite + TypeScript + Three.js (React for shell/settings is fine), clean separation of pure grid simulation and renderer/controls; static-host-compatible asset paths.
- Arena grid, solid vs destructible props, 2–4 slots, selectable bot difficulty, human touch/keyboard movement, generator placement, legal exit/blocked re-entry, timed plus blasts, wall blocking, obstacle destruction, chains, simultaneous death/draw and two-minute timer.
- AI must play, place generators and try to survive. Win/lose/draw overlay and instant rematch.
- Build/test and GitHub Pages deploy workflow. Public link works, without any server-side runtime.

### Phase 1B: Signature WAHALA! mechanics

- Pickups (at minimum Petrol, Extra Socket, Power Diesel, Kick, Punch, Carry +1s, Remote Starter, Kill Switch, Okada, Vehicle Voucher, Speed and one temporary curse).
- Three distinct characters and associated Danfo/taxi/Keke special attacks with select-any-valid-border input, damage/slow/cumulative blast interactions and warnings.
- Generator disarm still externally explosive; Okada one-hit shield against any lethal attack; push/daze, limited death drops.
- Make medium/hard AI meaningfully stronger than easy.

### Phase 1C: Presentation + tuning

- Polished stylised Nigerian scene referencing founder's own Gemini still/video without copying Bomberman/licensed assets, clear fire sources, comical eliminations, layered original/suitably licensed instrumental music, basic Pidgin crowd reactions, accessible HUD and settings.
- Tune timers, movement, blast strength, route warnings, item spawns and performance based on real play. Add **Wahala Crush** only when Classic Timer is stable; both remain envisaged as selectable modes.
- Broad testing on phones/desktops and reproducible simulation unit/integration tests.

**Not Phase 1 requirements:** real humans in same match, chat, random live spectator selection, private rooms, real-world accounts, database, WebSocket game backend, full 10 stages, City Rumble with 20–30 competitors. Keep architecture extendable but do not implement those systems prematurely.

---

## 14. Core test/acceptance cases

1. All characters move exactly one cardinal grid direction at a time; solid walls and generators cannot be passed illegally; placing owner can EXIT but not RE-ENTER own generator tile.
2. Visible generator causes plus-shaped flames. A concrete block stops flame. A breakable block is destroyed and absorbs that line on the same explosion; pickup may appear. Chains trigger once and only once per generator.
3. Own generator and vehicle can eliminate owner. Friendly fire setting later does not excuse self-harm.
4. Two final players eliminated in one event/tick -> draw. Two-minute expiry with rivals still alive in Classic Timer -> draw.
5. One rider on Okada survives **any one lethal event** and is then on foot, with brief same-event double-hit protection.
6. First carry grants exactly +1.0s to timed generator's remaining fuse; second carry no extra extension; generator can explode while held.
7. Kill-switch-disabled generator never resumes timer/manual remote trigger, but an external blast or vehicle collision still detonates it.
8. Remote generator detonates by action and by external collision/chain. Counteraction is possible; no unfair permanent traps.
9. Vehicle hits generator -> generator immediately explodes, normal chain proceeds, effective blast exposure increases vehicle's cumulative journey damage and briefly slows survivor. Heavier vehicle requires more exposure than light vehicle. Repeated separate attacks accumulate.
10. Vehicle entry can be selected by touch, mouse, keyboard and controller from all legal perimeter cells; illegal routes unavailable; incoming route warned.
11. Danfo continues after player collision, taxi stops at first player, Keke turns exactly once on a legal cardinal route.
12. Easy/Medium/Hard differ in planning and behavior, not superhuman stats; all AI obey danger and blocked tiles.
13. HUD has no health bars; eliminated players become spectator view or results; limited loot drops, pickups reset per match.
14. GitHub Pages opens under its repository subpath on both mobile and desktop, with no blank screen/missing files and **no backend requests for game state**.
15. Source, unit tests, build and deploy workflow are included; no claim that features work without testing.

---

## 15. Provisional decisions and deliberate unknowns

These can be selected with sensible defaults during Phase 1 and adjusted via feedback, rather than blocking all work:

- Exact grid sizes, spawn layouts, flame duration, fuse, movement/vehicle speed, blast exposure formulas, Keke hit count, cooldowns, pick-up weights and visual warning length.
- Special vehicle route entry constraints under soft rubble, corner turns and particularly dense map geometry.
- Remote generator timeout/cleanup and whether holding a remote generator needs a different carry mechanic.
- Dead-player drops quantity; generator-disarm charge/cooldown; anti-camping behavior.
- Whether Classic Timer or Wahala Crush should be the default and exact crush scheduling. Keep both as envisaged game settings but postpone final tuning to testing.
- Copyright/trademark review, original audio licensing, performance targets measured on actual devices.

## 16. Visual reference pack and IP guidance

The founder has a Gemini-generated still and short video demonstrating the elevated, polished Lagos bus-park feel. They are *reference assets only*. They do not show correct generator origin consistently and may depict misleading health bars or implausible explosion geometry. Reproduce the **intent**, not image artifacts.

Useful repository paths if supplied: `reference/gameplay-still.jpg`, `reference/gameplay-video.mp4`, `reference/video-contact-sheet.jpg`.

**Use wholly original code, artwork, models and sound (or appropriately licensed materials).** Do not scrape or copy Bomberman characters, Louie creatures, copyrighted sprites, music or stages. LAGride is discussed as a style/reference; use generic licensed/original taxi livery and avoid implying a commercial partnership without clearance.

---

## 17. Change control

This Bible reflects all currently agreed mechanics as of 20 October 2026. During implementation record each gameplay change or tuning decision under `docs/PLAYTEST_NOTES.md` or `docs/DECISIONS.md`, indicating **why** it was changed after actual playtesting. Don't silently drop difficult mechanics and call the game complete.

**Build authorisation:** Founder has now asked for the Game Design Bible and a Claude Code execution prompt. Claude Code should use the separate build prompt to implement only the specified Phase 1, with checkpoints and real test results. **This Bible itself is specification, not executed code.**
