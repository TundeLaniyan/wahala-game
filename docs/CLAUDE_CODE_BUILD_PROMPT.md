# CLAUDE CODE — MASTER BUILD PROMPT FOR WAHALA! PHASE 1

**Paste the text between BEGIN and END into a NEW Claude Code cloud task after selecting the new `wahala-game` GitHub repository.** Upload/commit `docs/GAME_DESIGN_BIBLE.md` before starting. If the reference image/video pack is present, inspect it. If not, continue with original stylised 3D placeholders and do not block.

---

## BEGIN COPY-PASTE PROMPT

You are the lead game engineer and technical artist for **WAHALA!**, a Nigerian-culture-inspired browser-based 3D-presented, STRICTLY 2D GRID arcade tactics game. This is a REAL implementation task: create working source code, tests and a playable deployed frontend, not a mock-up, boilerplate proposal or a plan-only response.

**Read `docs/GAME_DESIGN_BIBLE.md` fully first. It is authoritative and supersedes any older roadmap.** If present, inspect `reference/gameplay-still.jpg`, `reference/video-contact-sheet.jpg` and `reference/gameplay-video.mp4` for environmental and visual direction only; do not assume the samples show correct collisions or fire origin. Do not copy Bomberman artwork/music or others' brands/assets.

### NON-NEGOTIABLE SCOPE AND ARCHITECTURE

- This is **Phase 1 offline solo play**, not online multiplayer: **ONE HUMAN vs ONE, TWO or THREE AI BOTS** in the player's browser. The game should be playable from a publicly accessible static GitHub Pages URL but each browser visitor plays their own private match. **Do not create Node game servers, APIs, databases, authentication, multiplayer rooms or sockets.** A Node build toolchain is fine; no Node runtime service.
- Use **TypeScript + Vite + Three.js** (React is optional for menus/HUD). Implement game rules in a decoupled deterministic pure TypeScript grid/simulation module with no rendering or DOM dependencies; render state in Three.js. Architecture should be able to support eventual authoritative multiplayer but do not build that now.
- Browser/mobile (landscape touch) and laptop keyboard must work. Include Gamepad API support for core controls and vehicle-entry selection if practical in this phase; never force use of a mouse for vehicle launches.
- Strict UP/DOWN/LEFT/RIGHT tile movement; FIXED elevated near-top-down view. GENERATORS are everyone's primary weapons. No Bomberman copyright copies, rideable animals, Okada attack vehicle, health bars or platformer controls.
- All core assets/code must run under GitHub Pages subpath `/wahala-game/` (or configure `base` using the repository name). Use a GitHub Actions build/deploy workflow deploying `dist/`, GitHub Pages source **GitHub Actions**. Include instructions for setting `Settings > Pages > Build and deployment > GitHub Actions`. `npm ci`, `npm run build`, `npm run test`, `npm run lint` (if configured) should be reproducible. Do not claim deploy succeeded until GitHub reports success and a URL exists.
- Write `README.md` with local run + tester instructions, controls, hosting instructions and any known limitations. Record status honestly in `docs/IMPLEMENTATION_STATUS.md`.

### MAKE AN ACTUAL PLAYABLE GAME — DELIVERY ORDER

Work through A then B then C below, running available automated checks after each. Commit logically on your feature branch. If a single cloud task runs out of capacity, stop at a **working, buildable, playable** checkpoint, clearly list unmet acceptance criteria and a ready-to-run next-session prompt. Do not silently substitute fake UI for requested gameplay.

**A. FIRST PLAYABLE CORE (must be working before expanding):**
1. Responsive title/settings screen: WAHALA! branding (working title), choose 2/3/4 total competitors, choose Easy/Medium/Hard bots, character, Classic Timer, start / rematch. Add clear controls help.
2. One designed Danfo Bus Park square-grid arena rendered in polished **stylised original low-poly 3D**: concrete indestructible pillars, obvious destructible rubbish/tyre stacks/market crates, visible floor tiles/corridors, NPC crowd silhouettes and bus-park visual identity. No generic floating squares as the entire final view. Make an approachable, attractive first pass with camera showing all important tiles.
3. Human directional grid movement using keyboard (arrows/WASD), touch controls; prevent diagonal, wall penetration and illegal overlaps.
4. Place a clearly visible Nigerian portable generator on own tile; it is solid to others; owner can EXIT then cannot RE-ENTER its tile. Default tunable ~3s fuse, base two tiles fire outward in each direction, starting capacity one. **Every fire line must originate visibly from that generator**, travel in a plus, stop at concrete, destroy first destructible block, reveal pickups, trigger other generators; own fire can kill owner.
5. AI players move and place generators, avoid hazard when possible, seek routes and attack; at minimum functional Easy AI in the very first stable checkpoint. Implement real Medium and Hard improvements before claiming full Phase 1 completion.
6. Exactly two-minute standard rounds, last-player-standing winner, death spectator camera/Skip to Results, restart/rematch. If remaining opponents die in SAME event/tick, DRAW, not arbitrary winner. If timer expires with multiple opponents, DRAW. Test simultaneous deaths.
7. Working GitHub Pages workflow and absolute URL instructions. Tests for simulation/collision/explosions/draws; builds cleanly.

**B. SIGNATURE COMBAT AND ITEMS (core WAHALA! identity):**
8. Working collectible power-ups from destroyed breakables: Petrol Top-Up, Extra Socket, Power Diesel, Roller Skates, Football Boots (kick generator), Mechanic Gloves (punch/throw), Generator Grip (carry), Remote Starter, Generator Kill Switch, Okada mount, Vehicle Voucher and a brief cursed item. Show inventory/abilities in HUD, round reset and limited dropped items on death. Other pickups from Bible can be staged if needed; document exact support.
9. **Carry** a live timed generator onto another tile. On its **FIRST successful pickup**, add exactly +1 second to its remaining fuse; never repeatedly extend on multiple pickups; it continues ticking and can kill carrier. For remote or disabled generators apply documented consistent behavior rather than inventing timers.
10. **Remote Starter** enables remote detonation instead of normal three-second automatic detonation for relevant generators. Remote generators remain susceptible to other flames and vehicle collision. **Generator Kill Switch** permanently disables a timer/manual triggering, but its inert-looking generator **still explodes on external flame/vehicle collision**. Make visual states distinct.
11. **Okada is a rideable motorcycle only**, NEVER one of the three attack vehicles. Rider goes faster; motorcycle absorbs ANY ONE lethal event (own/enemy blast, attack vehicle, environment, spectator blast), breaks apart in a short comic animation, leaves rider alive on foot with a very short no-double-hit grace for the SAME continuing hazard. Mounts never stack extra lives.
12. Three selectable character templates with **FIXED SIGNATURE VEHICLES** and close-range non-damaging push/daze abilities: Street Baller → Danfo + push; Lekki Boy → taxi + daze; Campus Queen → Keke + shove. No health-based punches.
13. Vehicle Voucher activates character's signature special ONCE. Enter **Vehicle Entry Mode**: display every eligible border tile, select with touch click, keyboard arrows, controller D-pad; preview proposed legal cardinal route, briefly telegraph a gate/opening/road and horn before moving. Danfo slower straight path through soft blocks and can hit multiple opponents; taxi quicker straight and stops at first hit; Keke one L-shaped 90-degree route. No driving through indestructible concrete, no random centre-only spawning; attacks can kill own player.
14. Vehicle meets a placed generator → immediately detonates it (even remotely managed/disabled) and normal flames/chains resolve. Vehicle destruction based on **cumulative effective blast exposure measured in grid tile coverage**, NOT fixed 1/2/3 separate bomb hits: lighter Keke lowest threshold, taxi middle, heavy Danfo highest. One strong blast may destroy; repeated separate later blasts build damage on same journey. A surviving blast collision briefly slows vehicle; record transparent/tunable rule and visible indication. Start illustrative thresholds Keke ~4, taxi ~6, Danfo ~9 units; tune from playtests. Prevent overlap double-counting of the same flame event.
15. Expose Classic Timer and optional Wahala Crush closing-arena rule as user-configurable once core stable. If Crush is implemented, give falling blocks clear warnings and logical simultaneous-elimination draws. Founder has not fixed the detailed collapse timing; keep configurable rather than pretending numbers are final.
16. Give AI usable movement safety, power-up pursuit, ability use and legal vehicle entry. Medium and Hard must use better planning, not secret stats/cheats.

**C. FINISH AND VERIFY THE SOLO PLAY EXPERIENCE:**
17. Make player silhouettes, generators, paths, destructible vs permanent obstacles, pickups, attack entry markers and UI readable on phones. Four-character portraits should indicate Alive/Eliminated, **not health bars**.
18. Add comedic non-graphic elimination effects, Nigerian Pidgin reactive audience caption/audio hooks, horn/explosion/engine sounds and original or clearly licensed instrumental Afrobeat/Afrobeats-inspired rhythm. If audio assets unavailable, use WebAudio-generated simple original rhythms and note that they are temporary; don't download copyrighted songs.
19. Add basic quality settings, mute buttons, game pause policy, touch ergonomics and Gamepad API mapping. Focus on acceptable framerate on common mobile hardware (adjust particles/shadows/resolution).
20. Write deterministic simulation tests for generator owner exit/re-entry, plus flames/hard + soft walls, chain reactions, remote vs disabled, carry +1s once, Okada one shield, own vehicle harm, collision-triggered detonation, accumulating vehicle damage, simultaneous death draw, time expiry draw and AI legal movement. Use realistic reproducible events, not screenshot-only tests.
21. Test with browser-based automation if available (Playwright or equivalent) and confirm menus, controls, actual round playback, and deployed asset paths. If browser automation is unavailable, state it; **do not fabricate testing**.

### IMPLEMENTATION EXPECTATIONS

- Define pure simulation interfaces (`GameState`, arena/map/players, `applyInput`, `tick`, projectile/hazard events, seeded RNG). Separate entity logic from scene mesh spawning; use fixed timestep/deterministic ordering so user and AI observe identical rules.
- Keep all game-balance parameters in one documented config module. Prefer clear testable mechanics over complex shaders and giant downloads. Use low-poly original models, procedural geometry and original icons until high-fidelity assets are available. The reference image's obvious generator-origin problem must be corrected.
- Avoid unfinished feature buttons. If something is not working, hide or clearly label it as a future mode; do not show a fake Start button that displays a static demo. Focus on fully functional combat.
- Do not implement online spectator chat, accounts, matchmaking, 2v2 networking, or City Rumble in this Phase 1 task.
- Include a clearly documented **remaining backlog** for the full Bible (online spectators, larger map, more arenas, actual multiplayer, tournament modes, advanced effects) without attempting them now.
- In every completion report list: what is implemented, what is NOT implemented, tests/build commands run and results, branch/PR status, exact Pages URL **only if actually deployed**, and specific next improvement priorities.

### IMPORTANT GUIDANCE ON TASK SIZE

Make substantial, working progress **within this task**, but do not attempt all 10 arenas, online multiplayer and 30-player city mode in one fragile generation. Prefer a genuinely enjoyable, working **first game** over a half-complete pretend full game. Begin by executing stage A, then stage B, then stage C as time/capacity permits. You may organise internal work into components and commits. If you need another session, supply a precise handoff and maintain working code. Don't ask me to make arbitrary architectural decisions covered by the Bible; use strong defaults and document them.

Now read the Bible and repository files, set up the project, and begin implementing stage A immediately. Do not merely restate this prompt.

## END COPY-PASTE PROMPT

---

### Short continuation prompt for the NEXT Claude Code session (if the first session stops)

> Continue WAHALA! Phase 1 from `docs/GAME_DESIGN_BIBLE.md`, `docs/IMPLEMENTATION_STATUS.md` and the existing code on this branch. Inspect actual tests/build and the previous handoff. Prioritise the top UNIMPLEMENTED gameplay mechanics from section B of the master build prompt. Preserve the offline-only static deployment and the finished core. Implement and test real behavior, commit changes, update status, and report exact remaining work. Do not create multiplayer servers or mark incomplete features as implemented.

### QA and polish prompt for a LATER Claude Code session

> Audit WAHALA! against `docs/GAME_DESIGN_BIBLE.md` and `docs/IMPLEMENTATION_STATUS.md`. Playtest as much as your environment allows. Prioritise logic correctness, actual fun, AI quality, touchscreen/gamepad usability and beautiful readable 3D presentation over adding features. Fix generator origin visuals, collisions, Okada shielding, signature vehicle cumulative blast behavior, carry +1s, disarmed generator external detonation, simultaneous draws, Github Pages deployment and mobile responsive controls. Add regression tests and report remaining limitations honestly.
