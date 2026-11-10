import {
  DIFFICULTIES,
  createGame,
  entryKey,
  getArena,
  isRespawnMode,
  isTeamMode,
  STREAK_REWARD_DEFS,
  VEHICLE_DEFS,
  movementLocked,
  missionView,
  quickHandsActive,
  moveWouldAct,
  observe,
  readyToStep,
  tick,
} from '../sim';
import { combatLabAllowed, setCombatLabLevel } from '../sim';
import type { CombatLabLevel } from '../sim';
import type {
  Difficulty,
  GameOptions,
  GameState,
  Intent,
  Intents,
  SimEvent,
  VehicleEntry,
  VehicleIntent,
  VehicleTurn,
} from '../sim';
import { buildMoveBoard, inputModeFor, inputTrace } from '../input';
import { hapticFor, vibrate } from '../platform/haptics';
import type { NavCommand } from '../input';
import type { EntryOverlayModel, EntryPick } from '../render';
import { campaignHitNotice } from './campaignHud';
import { protectionNotice, quickHandsResumedNotice, quickHandsStoredNotice } from './combatNotices';
import { fieldNotices } from './fieldGoal';
import type { FieldNoticeMemory } from './fieldGoal';
import { buildHud } from './hud';
import { raidNotice } from './raidNotices';
import { expireKillLines, isCrowded, newKillLines, pushKillLines } from './killFeed';
import { buildPlayers, matchArenaId, matchRules } from './names';
import { cycleSpectateTarget, pickSpectateTarget } from './spectate';
import { NULL_AUDIO } from './ports';
import type {
  AudioPort,
  Bot,
  BotFactory,
  InputPort,
  MissionHost,
  MissionMeta,
  RaidMeta,
  RendererPort,
} from './ports';
import { raidOutcomeFromMatch, raidOutcomeOf } from './raidOutcome';
import type { GameSettings } from './settings';
import { SectionTimers } from './sectionTimers';
import { patch, useGameStore } from './store';
import type { MatchSummary, Toast } from './store';
import { VehicleEntryController } from './vehicleEntry';

const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 100;
const RESULTS_DELAY_MS = 2200;
const HUD_INTERVAL_MS = 90;
const LOCAL_ID = 0;
/** City Rumble "skip to results": wall-clock ms of simulation per animation frame while fast-forwarding. */
const SKIP_BUDGET_MS = 40;
/** While fast-forwarding, the 3D view is redrawn on every n-th frame only. */
const SKIP_RENDER_EVERY = 10;
/** City Rumble: events further than this (tiles, either axis) from the camera's focus are not heard. */
const HEAR_TILES = 12;
/** City Rumble follow camera: events further than this from the focus get no particles / shake. */
const SEE_TILES = 16;
/** Campaign mission: pause between the sim's outcome and the result screen (the boss beat plays out). */
const MISSION_END_DELAY_MS = 1600;
/** Raid: pause between the raid's outcome and the return to the field map (or the result). */
const RAID_END_DELAY_MS = 1400;

/** The audio engine also takes the arena (its music playlist) and a pause hook; stub ports may not. */
type MatchAudio = AudioPort & { startMusic(arenaId?: string): void; setPaused?(paused: boolean): void };

/**
 * Tutorial hook: drives a prepared scenario instead of a normal match. It supplies the intents of
 * scripted actors (and, while a demo plays the local player, that player's intents and vehicle-
 * selector commands) and sees every tick. A scenario never shows results and never counts as a match.
 */
export interface ScenarioDirector {
  /** True in practice (the human plays player 0); false while a demo plays player 0 itself. */
  readonly humanInput: boolean;
  beforeTick(state: GameState): ScenarioStep;
  afterTick(state: GameState, events: readonly SimEvent[], intents: Intents): void;
  /** Training Academy: floor tiles to mark for the player (presentation only). */
  markers?(state: GameState): readonly { x: number; y: number }[];
}

/** Vehicle-selector operations, exactly as a player performs them. */
export type ScenarioUi =
  | { kind: 'vehiclePress' }
  | { kind: 'nav'; command: NavCommand }
  | { kind: 'pickEntry'; entry: VehicleEntry }
  | { kind: 'pickTurn'; turn: VehicleTurn };

export interface ScenarioStep {
  intents: Intents;
  ui: readonly ScenarioUi[];
}

export interface ControllerDeps {
  renderer: RendererPort;
  input: InputPort;
  botFactory: BotFactory;
  audio?: AudioPort;
}

/**
 * Owns one running match: the fixed-step loop, bot and human intents, event fan-out to the
 * renderer / audio / HUD, pause and results flow. It contains no DOM code so it can be tested
 * headlessly with fake ports.
 */
export class MatchController implements MissionHost {
  state: GameState | null = null;
  private bots = new Map<number, Bot>();
  private readonly entry = new VehicleEntryController(LOCAL_ID);
  private readonly audio: MatchAudio;
  private accumulator = 0;
  private lastMs = -1;
  private hudClock = 0;
  private paused = false;
  /** Debug/test: stop real-time stepping (frames still render) without showing the pause screen. */
  frozen = false;
  /**
   * The match loading screen is up (app/matchLoader.ts): the scene renders but no simulation time passes, so the
   * countdown is not spent behind the loading screen. Released by `setLoadHold(false)`.
   */
  private loadHold = false;
  private settings: GameSettings | null = null;
  private endedAtMs: number | null = null;
  private toastId = 1;
  /** Kill feed bookkeeping: the game the feed belongs to and the eliminations / assists already listed. */
  private feedState: GameState | null = null;
  private readonly feedSeen = new Set<string>();
  private excitement = 0.2;
  private forced: Record<number, Intent> = {};
  private countdownShown = -1;
  /** City Rumble: the large-match presentation (spectator camera, roster HUD, sliced skip). */
  private rumble = false;
  /** City Rumble: whom the camera follows once the local player is out (presentation only). */
  private spectateId: number | null = null;
  /** City Rumble: fast-forwarding to the result in slices (the page stays responsive). */
  private skipping = false;
  private skipFrames = 0;
  private closingAnnounced = false;
  /** The last field-mission picture seen (checkpoint / leg notices, docs/CHECKPOINT_CLARITY.md). */
  private fieldMemory: FieldNoticeMemory | null = null;
  private director: ScenarioDirector | null = null;
  /** Campaign mission presentation (docs/CAMPAIGN_UI.md): own end flow, no MatchSummary, no saved settings. */
  private mission: MissionMeta | null = null;
  /** A raid in play (a door of a field mission, or a standalone section raid). */
  private raid: RaidMeta | null = null;
  private raidReported = false;
  /** The door's request was already handed to the campaign (cleared when the field has no request pending). */
  private raidAsked = false;
  /** A field mission kept alive and PAUSED underneath while one of its raids is played. */
  private fieldStash: {
    state: GameState;
    bots: Map<number, Bot>;
    mission: MissionMeta;
    rumble: boolean;
  } | null = null;
  /** Events produced outside a tick (a raid answered at the door) shown with the next frame's. */
  private pendingEvents: SimEvent[] = [];
  /** Smoothed ms per frame spent in sim ticks, bot decisions and the renderer (`?fps`, debug handle). */
  readonly timers = new SectionTimers();

  constructor(private readonly deps: ControllerDeps) {
    this.audio = deps.audio ?? NULL_AUDIO;
  }

  // ------------------------------------------------------------------ lifecycle

  start(settings: GameSettings, seed = Math.floor(Math.random() * 2 ** 31)): void {
    this.director = null;
    this.mission = null;
    this.clearRaid();
    this.settings = settings;
    const players = buildPlayers(settings, seed);
    const arenaId = matchArenaId(settings);
    const state = createGame({ seed, arenaId, players, settings: matchRules(settings) });
    this.state = state;
    this.rumble = getArena(state.arenaId).kind === 'rumble';
    if (!this.rumble) this.audio.setListener?.(null); // standard arenas pan across the whole board
    this.spectateId = null;
    this.skipping = false;
    this.closingAnnounced = false;
    this.bots = new Map();
    state.players.forEach((p, i) => {
      if (p.isBot)
        this.bots.set(
          i,
          this.deps.botFactory({
            difficulty: players[i]?.difficulty ?? settings.difficulty,
            seed: seed + i * 7919,
            playerId: i,
          }),
        );
    });
    this.accumulator = 0;
    this.lastMs = -1;
    this.paused = false;
    this.endedAtMs = null;
    this.excitement = 0.2;
    this.countdownShown = -1;
    this.forced = {};
    this.entry.sync(state);
    // the combat test lab level picked in an earlier local Rumble carries over to the next one (docs/COMBAT_TEST_LAB.md)
    if (this.labLevel !== 0 && !setCombatLabLevel(state, this.labLevel)) this.labLevel = 0;
    this.deps.input.clear();
    this.deps.renderer.loadGame(state);
    this.deps.input.setCardinalOnly?.(inputModeFor(state).cardinalOnly); // raids: cardinal-only input, reset for every other match
    this.audio.startMusic(arenaId);
    this.audio.setIntensity(0);
    patch({ combatLab: state.config.combatLab?.level ?? 0 });
    patch({
      screen: 'playing',
      paused: false,
      toasts: [],
      subtitle: null,
      summary: null,
      skipping: false,
      hud: buildHud(state, LOCAL_ID, null),
    });
  }

  /**
   * Campaign: starts a mission match from ready-made options (app/campaign.ts builds them with the sim's
   * `buildMissionGame`). A sibling of `start`: same loop, HUD and audio path, bots from each seat's level (the
   * boss, seat 1, at least Standard), but the saved menu settings are never read or written and the end of the
   * match goes to `meta.onEnd` instead of the normal results screen.
   */
  startMission(options: GameOptions, meta: MissionMeta): void {
    this.director = null;
    this.settings = null;
    this.clearRaid();
    this.mission = meta;
    const state = createGame(options);
    this.state = state;
    this.rumble = getArena(state.arenaId).kind === 'rumble';
    if (!this.rumble) this.audio.setListener?.(null);
    this.spectateId = null;
    this.skipping = false;
    this.closingAnnounced = false;
    this.bots = new Map();
    const floor = DIFFICULTIES.indexOf('standard');
    state.players.forEach((p, i) => {
      if (!p.isBot) return;
      const level: Difficulty = options.players[i]?.difficulty ?? meta.difficulty;
      const at = DIFFICULTIES.indexOf(level);
      // the boss floor is for a boss mission's seat 1; in a field mission seat 1 is an ordinary enemy (decision EF7)
      const boss = i === 1 && options.players[i]?.enemyKind === undefined;
      this.bots.set(
        i,
        this.deps.botFactory({
          difficulty: boss ? (DIFFICULTIES[Math.max(at, floor)] ?? level) : level,
          seed: options.seed + i * 7919,
          playerId: i,
        }),
      );
    });
    this.accumulator = 0;
    this.lastMs = -1;
    this.paused = false;
    this.frozen = false;
    this.endedAtMs = null;
    this.excitement = 0.2;
    this.countdownShown = -1;
    this.forced = {};
    this.entry.sync(state);
    this.deps.input.clear();
    this.deps.renderer.loadGame(state);
    this.deps.input.setCardinalOnly?.(inputModeFor(state).cardinalOnly); // raids: cardinal-only input, reset for every other match
    this.audio.startMusic(state.arenaId);
    this.audio.setIntensity(0);
    patch({
      screen: 'playing',
      paused: false,
      toasts: [],
      subtitle: null,
      summary: null,
      skipping: false,
      hud: buildHud(state, LOCAL_ID, null),
    });
  }

  /** A campaign mission (not a normal match) is running. */
  get isMission(): boolean {
    return this.mission !== null;
  }

  /** A raid is being played (a door of a field mission, or a standalone section raid). */
  get isRaid(): boolean {
    return this.raid !== null;
  }

  /** The game in play (the raid's state during a raid). */
  current(): GameState | null {
    return this.state;
  }

  private clearRaid(): void {
    this.raid = null;
    this.raidReported = false;
    this.raidAsked = false;
    this.fieldStash = null;
    this.pendingEvents = [];
  }

  /**
   * Campaign raid. A running field mission is kept alive and paused underneath (its door raised the request) and comes
   * back with `resumeField`; with none running the raid is standalone. Calling it during a raid restarts the raid (the
   * stashed field mission stays where it is). Same loop, HUD and audio path as `startMission`.
   */
  playRaid(options: GameOptions, meta: RaidMeta): void {
    if (!this.raid && this.mission && this.state) {
      this.fieldStash = { state: this.state, bots: this.bots, mission: this.mission, rumble: this.rumble };
    }
    this.director = null;
    this.settings = null;
    this.mission = null;
    this.raid = meta;
    this.raidReported = false;
    this.raidAsked = false;
    const state = createGame(options);
    this.state = state;
    this.rumble = false;
    this.audio.setListener?.(null);
    this.spectateId = null;
    this.skipping = false;
    this.closingAnnounced = false;
    this.bots = new Map();
    state.players.forEach((p, i) => {
      if (p.isBot)
        this.bots.set(
          i,
          this.deps.botFactory({
            difficulty: options.players[i]?.difficulty ?? meta.difficulty,
            seed: options.seed + i * 7919,
            playerId: i,
          }),
        );
    });
    this.resetLoop(state);
    this.deps.renderer.loadGame(state);
    this.deps.input.setCardinalOnly?.(inputModeFor(state).cardinalOnly); // raids: cardinal-only input, reset for every other match
    this.audio.startMusic(state.arenaId);
    this.audio.setIntensity(0);
    patch({
      screen: 'playing',
      paused: false,
      toasts: [],
      subtitle: null,
      summary: null,
      skipping: false,
      hud: buildHud(state, LOCAL_ID, null),
    });
  }

  /**
   * The raid is over: puts the stashed field mission back as the game in play, after `resolve` answered its door (the
   * events it returns are shown with the next frame). False (and the raid is left) when no field mission is stashed.
   */
  resumeField(resolve: (field: GameState) => SimEvent[]): boolean {
    const stash = this.fieldStash;
    this.raid = null;
    this.raidReported = false;
    this.fieldStash = null;
    if (!stash) return false;
    this.state = stash.state;
    this.bots = stash.bots;
    this.mission = stash.mission;
    this.rumble = stash.rumble;
    this.director = null;
    this.spectateId = null;
    this.skipping = false;
    this.raidAsked = false;
    this.resetLoop(stash.state);
    this.deps.renderer.loadGame(stash.state);
    this.deps.input.setCardinalOnly?.(inputModeFor(stash.state).cardinalOnly); // raids: cardinal-only input, reset for every other match
    this.audio.startMusic(stash.state.arenaId);
    this.audio.setIntensity(0);
    this.pendingEvents.push(...resolve(stash.state));
    patch({
      screen: 'playing',
      paused: false,
      toasts: [],
      subtitle: null,
      summary: null,
      skipping: false,
      hud: buildHud(stash.state, LOCAL_ID, null),
    });
    return true;
  }

  /** The loop bookkeeping every swap of the game in play resets. */
  private resetLoop(state: GameState): void {
    this.accumulator = 0;
    this.lastMs = -1;
    this.paused = false;
    this.frozen = false;
    this.endedAtMs = null;
    this.excitement = 0.2;
    this.countdownShown = -1;
    this.forced = {};
    this.entry.sync(state);
    this.deps.input.clear();
  }

  /**
   * Tutorial: runs a prepared state (already in its playing phase) under a director. No bots, no
   * saved settings are touched and no results screen follows; `start` returns to normal play.
   */
  startScenario(state: GameState, director: ScenarioDirector): void {
    this.director = director;
    this.mission = null;
    this.clearRaid();
    this.settings = null;
    this.state = state;
    this.bots = new Map();
    this.accumulator = 0;
    this.lastMs = -1;
    this.paused = false;
    this.frozen = false;
    this.endedAtMs = null;
    this.excitement = 0.2;
    this.countdownShown = -1;
    this.forced = {};
    this.entry.sync(state);
    this.deps.input.clear();
    this.deps.renderer.loadGame(state);
    this.deps.input.setCardinalOnly?.(inputModeFor(state).cardinalOnly); // raids: cardinal-only input, reset for every other match
    this.audio.startMusic(state.arenaId);
    this.audio.setIntensity(0);
    patch({
      screen: 'playing',
      paused: false,
      toasts: [],
      subtitle: null,
      summary: null,
      hud: buildHud(state, LOCAL_ID, null),
    });
  }

  /** Read-only view of the local vehicle selector (tests / debug). */
  entryOverlay(): EntryOverlayModel | null {
    return this.state ? this.entry.overlay(this.state) : null;
  }

  /** True while a tutorial scenario (not a match) is running. */
  get scenario(): boolean {
    return this.director !== null;
  }

  /** A demo is playing the local player: human gameplay input is ignored (pause still works). */
  private get scripted(): boolean {
    return this.director !== null && !this.director.humanInput;
  }

  /** Hold (true) or release the simulation while the match loading screen is up; the clock restarts on release. */
  setLoadHold(held: boolean): void {
    if (this.loadHold === held) return;
    this.loadHold = held;
    if (!held) {
      this.lastMs = -1;
      this.accumulator = 0;
    }
  }

  /** The combat test lab level of local City Rumble matches (0 = off); kept across rematches in this session. */
  private labLevel: CombatLabLevel | 0 = 0;

  /** Combat test lab: may the running match use it (a local City Rumble, not a mission or raid)? */
  combatLabAvailable(): boolean {
    return !!this.state && !this.mission && !this.raid && combatLabAllowed(this.state);
  }

  /** Combat test lab: switch the running local Rumble to `level` (0 = off) between ticks, no restart. */
  setCombatLab(level: CombatLabLevel | 0): boolean {
    if (!this.state || !this.combatLabAvailable()) return false;
    if (!setCombatLabLevel(this.state, level)) return false;
    this.labLevel = level;
    return true;
  }

  rematch(): void {
    if (this.settings && !this.director) this.start(this.settings);
  }

  stop(): void {
    this.director = null;
    this.mission = null;
    this.clearRaid();
    this.state = null;
    this.audio.stopMusic();
    patch({ screen: 'title', hud: null, paused: false, summary: null, toasts: [], subtitle: null });
  }

  setPaused(paused: boolean): void {
    if (!this.state || this.state.match.phase === 'ended' || this.skipping) return;
    this.paused = paused;
    this.audio.setPaused?.(paused);
    this.deps.input.clear(); // a press made while paused must not become a move on resume
    this.lastMs = -1;
    patch({ paused });
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Test / debug hook: force an intent for one player on the next tick. */
  forceIntent(playerId: number, intent: Intent): void {
    this.forced[playerId] = intent;
  }

  // ------------------------------------------------------------------ frame loop

  /** Called once per animation frame with a monotonic millisecond clock. */
  frame(nowMs: number): void {
    const state = this.state;
    if (!state) return;
    this.deps.input.pollDevices();
    const dtMs = this.lastMs < 0 ? STEP_MS : Math.min(nowMs - this.lastMs, MAX_FRAME_MS);
    this.lastMs = nowMs;
    const frameEvents: SimEvent[] = [];

    if (this.skipping) {
      this.fastForward(frameEvents);
    } else if (!this.paused && !this.frozen && !this.loadHold) {
      this.accumulator += dtMs;
      let steps = 0;
      const t0 = performance.now();
      while (this.accumulator >= STEP_MS && steps < 8) {
        this.accumulator -= STEP_MS;
        steps++;
        frameEvents.push(...this.stepOnce());
      }
      if (steps === 8) this.accumulator = 0;
      if (steps > 0) this.timers.add('sim', performance.now() - t0);
    }

    this.afterFrame(frameEvents, nowMs, this.paused ? 0 : dtMs / 1000);
  }

  /**
   * Debug / art review: advances `n` ticks and routes each tick's events exactly like real play
   * (renderer effects, audio, toasts), unlike `stepOnce`, which only runs the simulation.
   */
  debugAdvance(n: number): void {
    for (let i = 0; i < n && this.state && this.state.match.phase !== 'ended'; i++) {
      this.afterFrame(this.stepOnce(), performance.now(), 1 / 60);
    }
  }

  /** Advances exactly one simulation tick, with human and bot intents. */
  stepOnce(): SimEvent[] {
    const state = this.state!;
    const director = this.director;
    const intents = this.collectIntents(state);
    const me = state.players[LOCAL_ID];
    const before =
      inputTrace.enabled && me && intents[LOCAL_ID]?.move
        ? { x: me.x, y: me.y, wait: me.stepRemaining, locked: movementLocked(state, me) }
        : null;
    const events = tick(state, intents);
    if (before && me) {
      // what the simulation did with the move the gate handed over (input trace, decision MI5)
      const stepped = me.x !== before.x || me.y !== before.y;
      const result = stepped
        ? 'stepped'
        : before.locked
          ? 'ignored-cannot-act'
          : before.wait > 1
            ? 'ignored-mid-step'
            : 'blocked';
      inputTrace.record({ k: 'sim', tick: state.tick, result, x: me.x, y: me.y });
    }
    this.recordStats(events);
    director?.afterTick(state, events, intents);
    return events;
  }

  private collectIntents(state: GameState): Intents {
    const intents: Intents = {};
    const me = state.players[LOCAL_ID];
    const scene = this.director?.beforeTick(state) ?? null;
    if (me && !me.isBot && me.alive && this.scripted) {
      // a demo plays the local player: same selector, same intents, but from the script
      this.entry.sync(state);
      this.deps.input.navMode = false;
      this.deps.input.clear();
      const intent: Intent = { ...scene?.intents[LOCAL_ID] };
      for (const cmd of scene?.ui ?? []) {
        const v = this.applyUi(cmd, state);
        if (v) intent.vehicle = v;
      }
      intents[LOCAL_ID] = intent;
    } else if (me && !me.isBot && !me.alive && me.spectator !== null && !this.director) {
      // V2 standard match (not tutorials): the eliminated local player walks the sideline lane and throws with A
      this.deps.input.navMode = false;
      intents[LOCAL_ID] = this.deps.input.buildIntent(state.tick, {
        canMove: me.spectator.stepRemaining <= 1,
      });
    } else if (me && !me.isBot && me.alive) {
      // V2 two buttons: B launches the vehicle in one press (the sim picks the route), so normal play never
      // opens the old entry selector; it only exists for scripted tutorial demos (navMode stays false here
      // unless a script opened entry mode)
      this.entry.sync(state);
      this.deps.input.navMode = this.entry.active;
      intents[LOCAL_ID] = this.deps.input.buildIntent(state.tick, {
        canMove: readyToStep(me),
        remoteReady: me.remote && state.generators.some((g) => g.ownerId === me.id && g.mode === 'remote'),
        legal: (d) => moveWouldAct(state, me, d),
        board: () => buildMoveBoard(state, me),
        locked: movementLocked(state, me),
        quickHands: quickHandsActive(state, me),
      });
    } else {
      this.deps.input.navMode = false;
    }
    for (const [id, intent] of Object.entries(scene?.intents ?? {})) {
      if (Number(id) !== LOCAL_ID && state.players[Number(id)]?.alive) intents[Number(id)] = intent;
    }
    const botsAt = performance.now();
    for (const [id, bot] of this.bots) {
      const p = state.players[id]!;
      // eliminated bots keep deciding while they are sideline spectators (standard matches)
      if (p.alive || p.spectator !== null) intents[id] = bot.decide(observe(state, id));
    }
    this.timers.add('ai', performance.now() - botsAt);
    for (const [id, forced] of Object.entries(this.forced))
      intents[Number(id)] = { ...intents[Number(id)], ...forced };
    this.forced = {};
    return intents;
  }

  /** One vehicle-selector operation from a demo script (the same calls the input layer makes). */
  private applyUi(cmd: ScenarioUi, state: GameState): VehicleIntent | null {
    switch (cmd.kind) {
      case 'vehiclePress':
        return this.entry.press(state);
      case 'nav':
        return this.entry.active ? this.entry.nav(cmd.command, state) : null;
      case 'pickEntry':
        return this.entry.pick({ kind: 'entry', key: entryKey(cmd.entry) }, state);
      case 'pickTurn':
        return this.entry.pick({ kind: 'turn', key: `${cmd.turn.atIndex}:${cmd.turn.dir}` }, state);
    }
  }

  private recordStats(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'generatorExploded') this.excitement = Math.min(1, this.excitement + 0.35);
    }
  }

  /** Deathmatch / Team Rumble: a fallen local player comes back (no skip, no results until the clock). */
  get respawnMode(): boolean {
    return this.state !== null && isRespawnMode(this.state.settings.game);
  }

  private afterFrame(frameEvents: SimEvent[], nowMs: number, dt: number): void {
    const state = this.state!;
    let events = frameEvents;
    if (this.pendingEvents.length > 0) {
      events = [...this.pendingEvents, ...frameEvents];
      this.pendingEvents = [];
    }
    if (this.rumble) this.updateSpectate(state);
    this.excitement = Math.max(
      state.match.phase === 'playing' && state.match.playTicks > state.config.match.durationTicks - 1800
        ? 0.55
        : 0.18,
      this.excitement - dt * 0.35,
    );
    // City Rumble: effects, sounds and crowd lines come from around whoever the camera follows (the
    // follow camera shows ~12 x 8 tiles of a 41 x 31 city); the whole-city view keeps every effect
    const seen =
      this.rumble && useGameStore.getState().settings.cameraView !== 'overview'
        ? this.nearFocus(events, state, SEE_TILES)
        : events;
    this.deps.renderer.handleEvents(seen, state);
    const heard = this.rumble ? this.heardEvents(events, state) : events;
    this.audio.handleEvents(heard, state);
    // optional vibration when the local player is hurt (decision NV4): touch play only, Settings > Vibration
    if (this.deps.input.activeDevice === 'touch')
      vibrate(hapticFor(events, LOCAL_ID), useGameStore.getState().settings.vibration === 'on');
    this.audio.setIntensity(
      state.match.phase === 'playing' && state.match.playTicks > state.config.match.durationTicks - 1800
        ? 1
        : this.excitement * 0.6,
    );
    this.toastsFrom(events, nowMs);
    this.killFeedFrom(state, events, nowMs);
    this.countdownBeeps(state);

    // The renderer interpolates between ticks using the unspent accumulator.
    const alpha = this.paused ? 0 : Math.min(1, this.accumulator / STEP_MS);
    this.entry.sync(state);
    // fast-forwarding: draw only now and then, so the frame's time goes into simulating
    if (!this.skipping || this.skipFrames++ % SKIP_RENDER_EVERY === 0)
      this.timers.time('render', () =>
        this.deps.renderer.render(state, alpha, dt, {
          localPlayerId: LOCAL_ID,
          entryOverlay: this.entry.overlay(state),
          excitement: this.excitement,
          focusPlayerId: this.spectateId,
          markers: this.director?.markers?.(state),
          paused: this.paused,
          skipping: this.skipping,
        }),
      );

    if (nowMs - this.hudClock > HUD_INTERVAL_MS || events.length > 0) {
      this.hudClock = nowMs;
      this.publishHud(nowMs);
    }
    if (this.raid) this.watchRaid(state, nowMs);
    else if (this.mission) {
      this.watchMission(state, nowMs);
      this.watchDoor(state);
    } else if (state.match.phase === 'ended' && !this.director) this.handleEnded(nowMs);
  }

  /** A door of the field mission raised a raid request: handed to the campaign once; the campaign starts the raid. */
  private watchDoor(state: GameState): void {
    const request = state.mission?.pendingRaid ?? null;
    if (!request) {
      this.raidAsked = false;
      return;
    }
    if (this.raidAsked || !this.mission?.onRaid) return;
    this.raidAsked = true;
    this.mission.onRaid(request, state);
  }

  /** Raid end: the runtime's outcome (or the match ending without one) is reported once, after a short beat. */
  private watchRaid(state: GameState, nowMs: number): void {
    const meta = this.raid;
    if (!meta || this.raidReported) return;
    const outcome = raidOutcomeOf(state);
    if (outcome === null && state.match.phase !== 'ended') return;
    if (this.endedAtMs === null) {
      this.endedAtMs = nowMs;
      this.publishHud(nowMs);
    }
    if (nowMs - this.endedAtMs < RAID_END_DELAY_MS) return;
    this.raidReported = true; // exactly once
    meta.onEnd(outcome ?? raidOutcomeFromMatch(state, meta.raidId));
  }

  /**
   * Mission end: the sim's outcome (or the match ending without one) is reported once to the campaign after a
   * short beat. The normal results screen and MatchSummary are never used for missions.
   */
  private watchMission(state: GameState, nowMs: number): void {
    const meta = this.mission;
    if (!meta) return;
    const outcome = missionView(state)?.outcome ?? null;
    if (outcome === null && state.match.phase !== 'ended') return;
    if (this.endedAtMs === null) {
      this.endedAtMs = nowMs;
      this.publishHud(nowMs);
    }
    if (nowMs - this.endedAtMs < MISSION_END_DELAY_MS) return;
    this.mission = null; // exactly once
    this.audio.stopMusic();
    meta.onEnd(outcome, state);
  }

  private countdownBeeps(state: GameState): void {
    if (state.match.phase !== 'countdown' || this.paused) return; // a paused countdown stays silent
    const n = Math.ceil(state.match.countdownRemaining / 60);
    if (n !== this.countdownShown) {
      this.countdownShown = n;
      this.audio.playUi(n <= 0 ? 'go' : 'countdown');
    }
    if (state.match.countdownRemaining <= 1) this.audio.playUi('go');
  }

  /**
   * Compact status notices (essential information only: incoming danger, the floor-trap waves, the Okada
   * shield breaking...). The crowd's spoken reactions are voice clips, never on-screen text.
   */
  private toastsFrom(events: SimEvent[], nowMs: number): void {
    for (const e of events) {
      const made = this.toastFor(e, events);
      if (!made) continue;
      const { ttlMs, ...toast } = made;
      this.pushToast(toast, nowMs, ttlMs);
    }
  }

  private toastFor(
    e: SimEvent,
    batch: readonly SimEvent[] = [],
  ): (Omit<Toast, 'id' | 'expires'> & { ttlMs?: number }) | null {
    const state = this.state!;
    const raid = raidNotice(e);
    if (raid) return raid;
    switch (e.type) {
      case 'vehicleWarning': {
        return {
          text: `${VEHICLE_DEFS[e.kind].name.toUpperCase()} INCOMING!`,
          tone: e.ownerId === LOCAL_ID ? 'info' : 'bad',
        };
      }
      // ---- kill-streak rewards (decision SK4): earned, active, consumed, lost - all in the HUD rail
      case 'streakRewardEarned': {
        if (e.playerId !== LOCAL_ID) return null;
        const name = STREAK_REWARD_DEFS[e.reward].name;
        return {
          text:
            e.reward === 'vehicleGenerator' && e.vehicle
              ? `${name}: ${VEHICLE_DEFS[e.vehicle].name.toUpperCase()}`
              : `${name} EARNED`,
          tone: 'good',
          icon: e.reward,
          ttlMs: 3400,
        };
      }
      case 'streakRewardUsed':
        return e.playerId === LOCAL_ID
          ? { text: `${STREAK_REWARD_DEFS[e.reward].name} USED`, tone: 'info', icon: e.reward }
          : null;
      case 'streakRewardEnded':
        return e.playerId === LOCAL_ID ? { text: 'QUICK HANDS OVER', tone: 'info', icon: e.reward } : null;
      case 'streakRewardResumed':
        return e.playerId === LOCAL_ID
          ? { ...quickHandsResumedNotice(e.ticksLeft), icon: e.reward, ttlMs: 3400 }
          : null;
      // what the others see coming
      case 'vehicleGeneratorLaunched':
        return e.ownerId === LOCAL_ID
          ? null
          : {
              text: `${VEHICLE_DEFS[e.kind].name.toUpperCase()} WITH A GENERATOR!`,
              tone: 'bad',
              icon: 'vehicleGenerator',
            };
      case 'knockdownThrown':
        return e.targetId === LOCAL_ID
          ? { text: 'GLOBAL KNOCKDOWN! DUCK!', tone: 'bad', icon: 'globalKnockdown' }
          : null;
      case 'localChampionThrow':
        return e.targetId === LOCAL_ID
          ? { text: 'LOCAL CHAMPION! STEP OFF THE TILE!', tone: 'bad', icon: 'localChampion' }
          : null;
      case 'knockdownEnded':
        return e.playerId === LOCAL_ID ? { text: 'GET UP AND RUN!', tone: 'info' } : null;
      case 'trapsWarning':
        return { text: e.wave === 0 ? 'FINAL 30s: FLOOR TRAPS!' : 'MORE TRAPS!', tone: 'bad' };
      // a protection layer absorbed a lethal hit: not a death, so no elimination text (decision HC2)
      case 'protectionBroken':
        return e.playerId === LOCAL_ID
          ? { ...protectionNotice(e.layer, state.players[LOCAL_ID]!.armour), ttlMs: 3000 }
          : null;
      // campaign health: what hurt the player, or which layer took the hit (docs/CAMPAIGN_TEXT_NARRATION.md)
      case 'campaignHit':
        return campaignHitNotice(e, batch, LOCAL_ID, state.players[LOCAL_ID]?.armour ?? 0);
      case 'playerTeleported':
        return e.playerId === LOCAL_ID ? { text: 'THROUGH THE MANHOLE!', tone: 'info' } : null;
      case 'generatorDoused': {
        const g = state.generators.find((o) => o.id === e.generatorId);
        return g?.ownerId === LOCAL_ID ? { text: 'YOUR GENERATOR GOT SOAKED!', tone: 'bad' } : null;
      }
      // kills, deaths and assists are the kill feed's job (killFeedFrom); the rail toasts keep the rest
      case 'playerEliminated': {
        if (e.playerId === LOCAL_ID) {
          // QUICK HANDS paused by the death: its unspent time is stored for the respawn (decision AS7)
          const bank = state.players[LOCAL_ID]!.streakRewards.quickHandsBank;
          return bank > 0 && this.respawnMode ? { ...quickHandsStoredNotice(bank), ttlMs: 3400 } : null;
        }
        if (!this.rumble || this.respawnMode) return null;
        const left = state.players.filter((p) => p.alive).length;
        if (state.players[LOCAL_ID]!.alive && (left === 10 || left === 5 || left === 3 || left === 2))
          return { text: left === 2 ? 'FINAL TWO!' : `${left} LEFT STANDING`, tone: 'info' };
        return null;
      }
      case 'playerRespawned':
        return e.playerId === LOCAL_ID && this.rumble
          ? { text: 'BACK IN! SPAWN PROTECTION', tone: 'info' }
          : null;
      case 'crushWarning': {
        if (!this.rumble || this.closingAnnounced) return null;
        this.closingAnnounced = true;
        return { text: 'THE CITY IS CLOSING IN!', tone: 'bad' };
      }
      default:
        return null;
    }
  }

  /** A status notice from outside the sim (e.g. Auto graphics changed quality): same rail, slightly longer. */
  notice(text: string, tone: Toast['tone'] = 'info'): void {
    if (!this.state) return;
    this.pushToast({ text, tone }, performance.now(), 3600);
  }

  /** The kill feed: this frame's eliminations (from the state) and the local player's assists (from the events). */
  private killFeedFrom(state: GameState, events: SimEvent[], nowMs: number): void {
    if (this.feedState !== state) {
      this.feedState = state; // a new match: start with an empty feed
      this.feedSeen.clear();
      patch({ killFeed: [] });
    }
    const assistsOn = events.flatMap((e) =>
      e.type === 'playerEliminated' && e.playerId !== LOCAL_ID && e.assistIds.includes(LOCAL_ID)
        ? [e.playerId]
        : [],
    );
    const lines = newKillLines(state, LOCAL_ID, this.feedSeen, assistsOn);
    if (lines.length === 0) return;
    for (const l of lines) this.feedSeen.add(l.key);
    patch({ killFeed: pushKillLines(useGameStore.getState().killFeed, lines, nowMs, isCrowded(state)) });
  }

  private pushToast(t: Omit<Toast, 'id' | 'expires'>, nowMs: number, ttlMs = 2200): void {
    const toast: Toast = { ...t, id: this.toastId++, expires: nowMs + ttlMs };
    patch({ toasts: [...useGameStore.getState().toasts.filter((x) => x.expires > nowMs), toast].slice(-3) });
  }

  private publishHud(nowMs: number): void {
    const state = this.state!;
    const entry = this.entry.currentStage
      ? {
          stage: this.entry.currentStage,
          fraction: this.entry.fraction(state),
          vehicle: this.entry.vehicleKind,
        }
      : null;
    const hud = buildHud(state, LOCAL_ID, entry, this.spectateId);
    patch({ hud });
    // field missions: "CHECKPOINT A ✓ · NEXT: ..." the moment a checkpoint is walked through (a view diff, not a rule)
    const field = fieldNotices(this.fieldMemory, hud.mission);
    this.fieldMemory = field.memory;
    for (const n of field.notices) this.pushToast(n, nowMs, 3400);
    const toasts = useGameStore.getState().toasts;
    if (toasts.some((t) => t.expires <= nowMs)) patch({ toasts: toasts.filter((t) => t.expires > nowMs) });
    const feed = useGameStore.getState().killFeed;
    const live = expireKillLines(feed, nowMs);
    if (live !== feed) patch({ killFeed: live });
  }

  private handleEnded(nowMs: number): void {
    const state = this.state!;
    if (this.endedAtMs === null) {
      this.endedAtMs = nowMs;
      this.publishHud(nowMs);
    }
    if (nowMs - this.endedAtMs > RESULTS_DELAY_MS && useGameStore.getState().screen === 'playing') {
      const result = state.match.result;
      const me = state.players[LOCAL_ID]!;
      // credited eliminations from the simulation (attribution.ts), never a separate count
      const summary: MatchSummary = {
        eliminations: state.players.map((p) => p.stats.kills),
        deaths: me.stats.deaths,
        assists: me.stats.assists,
        survivedSeconds: Math.round(
          (isRespawnMode(state.settings.game)
            ? state.match.playTicks
            : (me.eliminatedTick ?? state.tick) - state.config.match.countdownTicks) / 60,
        ),
        localWon:
          (result?.kind === 'win' && result.winnerId === LOCAL_ID) ||
          (result?.kind === 'teamWin' && isTeamMode(state.settings.game) && me.team === result.team),
      };
      this.audio.stopMusic();
      this.skipping = false;
      patch({ screen: 'results', summary, skipping: false });
    }
  }

  // ------------------------------------------------------------------ commands from input / UI

  handleNav(command: NavCommand): void {
    const state = this.state;
    if (!state) return;
    if (command === 'pause') {
      this.togglePause();
      return;
    }
    if (this.scripted) {
      // during a demo the selector belongs to the script; Esc still pauses
      if (command === 'cancel') this.togglePause();
      return;
    }
    const sent = this.entry.active ? this.entry.nav(command === 'back' ? 'cancel' : command, state) : null;
    if (command === 'cancel' && !this.entry.active && !sent) {
      if (state.match.phase === 'playing' || this.paused) this.togglePause();
      return;
    }
    if (sent) this.sendVehicle(sent);
  }

  pickEntry(clientX: number, clientY: number): void {
    const state = this.state;
    if (!state || !this.entry.active || this.scripted) return;
    const pick: EntryPick | null = this.deps.renderer.pickEntry(clientX, clientY);
    if (!pick) return;
    const sent = this.entry.pick(pick, state);
    if (sent) this.sendVehicle(sent);
  }

  confirmEntry(): void {
    const state = this.state;
    if (!state || this.scripted) return;
    const sent = this.entry.confirm(state);
    if (sent) this.sendVehicle(sent);
  }

  cancelEntry(): void {
    if (this.scripted) return;
    const sent = this.entry.cancel();
    if (sent) this.sendVehicle(sent);
  }

  private sendVehicle(v: VehicleIntent): void {
    this.forced[LOCAL_ID] = { ...this.forced[LOCAL_ID], vehicle: v };
  }

  /**
   * Human eliminated: run the rest of the match with the bots and show results. Standard matches
   * finish instantly; City Rumble (up to 31 bots) fast-forwards in slices over the next frames so the
   * page never freezes (`finishSkip` completes it at once for tests).
   */
  skipToResults(): void {
    const state = this.state;
    // respawn modes: being down is temporary and the clock decides; there is nothing to skip to
    if (!state || this.director || this.mission || this.respawnMode) return;
    if (this.rumble && state.match.phase !== 'ended') {
      this.skipping = true;
      this.paused = false;
      patch({ skipping: true, paused: false });
      return;
    }
    this.finishSkip();
  }

  /** Runs the match to its end right now and shows the results. */
  finishSkip(): void {
    const state = this.state;
    if (!state) return;
    for (let i = 0; i < 40000 && state.match.phase !== 'ended'; i++) this.stepOnce();
    this.endedAtMs = -1e9;
    this.publishHud(performance.now());
    this.handleEnded(performance.now());
  }

  get isSkipping(): boolean {
    return this.skipping;
  }

  /** One slice of the City Rumble fast-forward (wall-clock budget per frame: presentation pacing only). */
  private fastForward(events: SimEvent[]): void {
    const state = this.state!;
    const t0 = performance.now();
    let n = 0;
    while (state.match.phase !== 'ended' && (n < 60 || performance.now() - t0 < SKIP_BUDGET_MS) && n < 4000) {
      const evs = this.stepOnce();
      n++;
      // keep only what the HUD / camera need: no blast effects or sounds for skipped play
      for (const e of evs) if (e.type === 'matchEnded') events.push(e);
    }
    this.accumulator = 0;
    if (state.match.phase === 'ended') {
      this.endedAtMs = -1e9;
      this.skipping = false;
    }
  }

  // ------------------------------------------------------------------ City Rumble audio focus

  /** Tile the camera follows: the local player, or the survivor being watched. */
  private focusTile(state: GameState): { x: number; y: number } {
    const p = state.players[this.spectateId ?? LOCAL_ID] ?? state.players[LOCAL_ID]!;
    return { x: p.x, y: p.y };
  }

  /**
   * The events worth hearing: anything within HEAR_TILES of the camera's focus, everything that
   * involves the local player, and the match-wide moments (start, end, final traps). A 32-player city
   * would otherwise be one long wall of explosions.
   */
  private heardEvents(events: SimEvent[], state: GameState): SimEvent[] {
    this.audio.setListener?.(this.focusTile(state).x);
    return this.nearFocus(events, state, HEAR_TILES);
  }

  /** Events within `range` tiles (either axis) of the camera focus, the local player's, and match-wide ones. */
  private nearFocus(events: SimEvent[], state: GameState, range: number): SimEvent[] {
    if (events.length === 0) return events;
    const f = this.focusTile(state);
    const near = (x: number, y: number): boolean => Math.abs(x - f.x) <= range && Math.abs(y - f.y) <= range;
    const playerNear = (id: number): boolean => {
      const p = state.players[id];
      return id === LOCAL_ID || (p !== undefined && near(p.x, p.y));
    };
    return events.filter((e) => {
      if ('x' in e && typeof e.x === 'number' && 'y' in e && typeof e.y === 'number')
        return (
          near(e.x, e.y) ||
          ('playerId' in e && e.playerId === LOCAL_ID) ||
          ('ownerId' in e && e.ownerId === LOCAL_ID)
        );
      if ('playerId' in e) return playerNear(e.playerId);
      if ('ownerId' in e) return playerNear(e.ownerId);
      if (e.type === 'stageWarning' || e.type === 'stageStarted') {
        const w = state.width;
        return e.event.tiles.some((t) => near(t % w, Math.floor(t / w)));
      }
      if (e.type === 'stageSweepStep') return near(e.x, e.y);
      return true;
    });
  }

  // ------------------------------------------------------------------ spectating (City Rumble)

  /** Keeps the spectator camera on a survivor once the local player is out. */
  private updateSpectate(state: GameState): void {
    // a one-player campaign run (field / boss mission, raid) never spectates: a downed human respawns under the mission's
    // lives and checkpoint rules, or the mission ends and the campaign result screen shows (hotfix: this used to pick
    // another competitor to watch, with the Skip button, on every City Rumble stage)
    if (state.mission || state.raid) {
      this.spectateId = null;
      return;
    }
    const me = state.players[LOCAL_ID];
    if (!me || me.alive || state.match.phase === 'countdown') {
      this.spectateId = null;
      return;
    }
    if (state.match.phase === 'ended') {
      const r = state.match.result;
      this.spectateId = r?.kind === 'win' ? r.winnerId : this.spectateId;
      return;
    }
    const next = pickSpectateTarget(state, LOCAL_ID, this.spectateId);
    if (next !== this.spectateId) this.hudClock = -Infinity; // show the new name right away
    this.spectateId = next;
  }

  /** Spectator: watch the next (1) or previous (-1) survivor. */
  cycleSpectate(dir: 1 | -1): void {
    const state = this.state;
    if (!state || !this.rumble || state.players[LOCAL_ID]?.alive) return;
    this.spectateId = cycleSpectateTarget(state, this.spectateId, dir);
    this.publishHud(performance.now());
  }

  /** The competitor the camera follows while spectating (null while the local player is alive). */
  get spectating(): number | null {
    return this.spectateId;
  }
}
