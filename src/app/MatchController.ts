import { CHARACTERS, createGame, entryKey, getArena, observe, readyToStep, tick } from '../sim';
import type { GameKind, GameState, Intent, Intents, SimEvent, VehicleEntry, VehicleIntent, VehicleTurn } from '../sim';
import type { NavCommand } from '../input';
import type { EntryOverlayModel, EntryPick } from '../render';
import { buildHud } from './hud';
import { buildPlayers, matchArenaId } from './names';
import { cycleSpectateTarget, eliminatorOf, pickSpectateTarget } from './spectate';
import { NULL_AUDIO } from './ports';
import type { AudioPort, Bot, BotFactory, InputPort, RendererPort } from './ports';
import type { GameSettings } from './settings';
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
export class MatchController {
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
  private settings: GameSettings | null = null;
  private endedAtMs: number | null = null;
  private toastId = 1;
  private excitement = 0.2;
  private eliminations: number[] = [];
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
  private director: ScenarioDirector | null = null;

  constructor(private readonly deps: ControllerDeps) {
    this.audio = deps.audio ?? NULL_AUDIO;
  }

  // ------------------------------------------------------------------ lifecycle

  start(settings: GameSettings, seed = Math.floor(Math.random() * 2 ** 31)): void {
    this.director = null;
    this.settings = settings;
    const players = buildPlayers(settings, seed);
    const arenaId = matchArenaId(settings);
    const rumble = getArena(arenaId).kind === 'rumble';
    const game: GameKind = rumble ? settings.rumbleMode : 'classic';
    const state = createGame({
      seed,
      arenaId,
      players,
      settings: {
        game,
        // Wahala Crush is mandatory in every standard match (no Classic Timer choice any more)
        mode: 'crush',
        friendlyFire: settings.friendlyFire,
        durationSec: game === 'deathmatch' || game === 'team' ? settings.rumbleMinutes * 60 : null,
        crowdThrows: settings.crowdThrows,
      },
    });
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
          this.deps.botFactory({ difficulty: players[i]?.difficulty ?? settings.difficulty, seed: seed + i * 7919, playerId: i }),
        );
    });
    this.accumulator = 0;
    this.lastMs = -1;
    this.paused = false;
    this.endedAtMs = null;
    this.excitement = 0.2;
    this.eliminations = state.players.map(() => 0);
    this.countdownShown = -1;
    this.forced = {};
    this.entry.sync(state);
    this.deps.input.clear();
    this.deps.renderer.loadGame(state);
    this.audio.startMusic(arenaId);
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
   * Tutorial: runs a prepared state (already in its playing phase) under a director. No bots, no
   * saved settings are touched and no results screen follows; `start` returns to normal play.
   */
  startScenario(state: GameState, director: ScenarioDirector): void {
    this.director = director;
    this.settings = null;
    this.state = state;
    this.bots = new Map();
    this.accumulator = 0;
    this.lastMs = -1;
    this.paused = false;
    this.frozen = false;
    this.endedAtMs = null;
    this.excitement = 0.2;
    this.eliminations = state.players.map(() => 0);
    this.countdownShown = -1;
    this.forced = {};
    this.entry.sync(state);
    this.deps.input.clear();
    this.deps.renderer.loadGame(state);
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

  rematch(): void {
    if (this.settings && !this.director) this.start(this.settings);
  }

  stop(): void {
    this.director = null;
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
    } else if (!this.paused && !this.frozen) {
      this.accumulator += dtMs;
      let steps = 0;
      while (this.accumulator >= STEP_MS && steps < 8) {
        this.accumulator -= STEP_MS;
        steps++;
        frameEvents.push(...this.stepOnce());
      }
      if (steps === 8) this.accumulator = 0;
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
    const events = tick(state, intents);
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
    } else if (me && !me.isBot && !me.alive && me.spectator !== null) {
      // V2 standard match: the eliminated local player walks the sideline lane and throws with A
      this.deps.input.navMode = false;
      intents[LOCAL_ID] = this.deps.input.buildIntent(state.tick, me.spectator.stepRemaining <= 1);
    } else if (me && !me.isBot && me.alive) {
      this.entry.sync(state);
      this.deps.input.navMode = this.entry.active;
      const intent = this.deps.input.buildIntent(state.tick, readyToStep(me));
      if (this.deps.input.takeVehiclePress()) {
        const v = this.entry.press(state);
        if (v) intent.vehicle = v;
      }
      intents[LOCAL_ID] = intent;
    } else {
      this.deps.input.navMode = false;
    }
    for (const [id, intent] of Object.entries(scene?.intents ?? {})) {
      if (Number(id) !== LOCAL_ID && state.players[Number(id)]?.alive) intents[Number(id)] = intent;
    }
    for (const [id, bot] of this.bots) {
      const p = state.players[id]!;
      // eliminated bots keep deciding while they are sideline spectators (standard matches)
      if (p.alive || p.spectator !== null) intents[id] = bot.decide(observe(state, id));
    }
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
      if (e.type === 'playerEliminated' && 'ownerId' in e.cause && e.cause.ownerId !== e.playerId) {
        this.eliminations[e.cause.ownerId] = (this.eliminations[e.cause.ownerId] ?? 0) + 1;
      }
    }
  }

  private afterFrame(events: SimEvent[], nowMs: number, dt: number): void {
    const state = this.state!;
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
    this.audio.setIntensity(
      state.match.phase === 'playing' && state.match.playTicks > state.config.match.durationTicks - 1800
        ? 1
        : this.excitement * 0.6,
    );
    this.toastsFrom(events, nowMs);
    this.countdownBeeps(state);

    // The renderer interpolates between ticks using the unspent accumulator.
    const alpha = this.paused ? 0 : Math.min(1, this.accumulator / STEP_MS);
    this.entry.sync(state);
    // fast-forwarding: draw only now and then, so the frame's time goes into simulating
    if (!this.skipping || this.skipFrames++ % SKIP_RENDER_EVERY === 0)
      this.deps.renderer.render(state, alpha, dt, {
        localPlayerId: LOCAL_ID,
        entryOverlay: this.entry.overlay(state),
        excitement: this.excitement,
        focusPlayerId: this.spectateId,
      });

    if (nowMs - this.hudClock > HUD_INTERVAL_MS || events.length > 0) {
      this.hudClock = nowMs;
      this.publishHud(nowMs);
    }
    if (state.match.phase === 'ended' && !this.director) this.handleEnded(nowMs);
  }

  private countdownBeeps(state: GameState): void {
    if (state.match.phase !== 'countdown') return;
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
      const toast = this.toastFor(e);
      if (toast) this.pushToast(toast, nowMs);
    }
  }

  private toastFor(e: SimEvent): Omit<Toast, 'id' | 'expires'> | null {
    const state = this.state!;
    switch (e.type) {
      case 'vehicleWarning': {
        const owner = state.players[e.ownerId]!;
        return {
          text: `${CHARACTERS[owner.characterId].vehicle.toUpperCase()} INCOMING!`,
          tone: e.ownerId === LOCAL_ID ? 'info' : 'bad',
        };
      }
      case 'trapsWarning':
        return { text: e.wave === 0 ? 'FINAL 30s: FLOOR TRAPS!' : 'MORE TRAPS!', tone: 'bad' };
      case 'okadaBroken': {
        const me = state.players[LOCAL_ID]!;
        return me.x === e.x && me.y === e.y ? { text: 'OKADA SAVED YOU!', tone: 'good' } : null;
      }
      case 'playerTeleported':
        return e.playerId === LOCAL_ID ? { text: 'THROUGH THE MANHOLE!', tone: 'info' } : null;
      case 'generatorDoused': {
        const g = state.generators.find((o) => o.id === e.generatorId);
        return g?.ownerId === LOCAL_ID ? { text: 'YOUR GENERATOR GOT SOAKED!', tone: 'bad' } : null;
      }
      case 'playerEliminated': {
        if (!this.rumble) return null;
        const victim = state.players[e.playerId]!;
        if (e.playerId !== LOCAL_ID && eliminatorOf(state, victim)?.id === LOCAL_ID)
          return { text: `YOU TOOK OUT ${victim.name.toUpperCase()}!`, tone: 'good' };
        const left = state.players.filter((p) => p.alive).length;
        if (state.players[LOCAL_ID]!.alive && (left === 10 || left === 5 || left === 3 || left === 2))
          return { text: left === 2 ? 'FINAL TWO!' : `${left} LEFT STANDING`, tone: 'info' };
        return null;
      }
      case 'crushWarning': {
        if (!this.rumble || this.closingAnnounced) return null;
        this.closingAnnounced = true;
        return { text: 'THE CITY IS CLOSING IN!', tone: 'bad' };
      }
      default:
        return null;
    }
  }

  private pushToast(t: Omit<Toast, 'id' | 'expires'>, nowMs: number): void {
    const toast: Toast = { ...t, id: this.toastId++, expires: nowMs + 2200 };
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
    patch({ hud: buildHud(state, LOCAL_ID, entry, this.spectateId) });
    const toasts = useGameStore.getState().toasts;
    if (toasts.some((t) => t.expires <= nowMs)) patch({ toasts: toasts.filter((t) => t.expires > nowMs) });
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
      const summary: MatchSummary = {
        eliminations: this.eliminations.slice(),
        survivedSeconds: Math.round(
          ((me.eliminatedTick ?? state.tick) - state.config.match.countdownTicks) / 60,
        ),
        localWon: result?.kind === 'win' && result.winnerId === LOCAL_ID,
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
    if (!state || this.director) return;
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
