import { CHARACTERS, createGame, getArena, observe, readyToStep, tick } from '../sim';
import type { GameState, Intent, Intents, SimEvent, VehicleIntent } from '../sim';
import type { NavCommand } from '../input';
import type { EntryPick } from '../render';
import { buildHud } from './hud';
import { buildPlayers } from './names';
import { cycleSpectateTarget, eliminatorOf, pickSpectateTarget } from './spectate';
import { NULL_AUDIO, NULL_CAPTIONS } from './ports';
import type { AudioPort, Bot, BotFactory, CaptionPort, InputPort, RendererPort } from './ports';
import type { GameSettings } from './settings';
import { patch, useGameStore } from './store';
import type { Caption, MatchSummary, Toast } from './store';
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

export interface ControllerDeps {
  renderer: RendererPort;
  input: InputPort;
  botFactory: BotFactory;
  audio?: AudioPort;
  captions?: CaptionPort;
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
  private readonly captions: CaptionPort;
  private accumulator = 0;
  private lastMs = -1;
  private hudClock = 0;
  private paused = false;
  /** Debug/test: stop real-time stepping (frames still render) without showing the pause screen. */
  frozen = false;
  private settings: GameSettings | null = null;
  private endedAtMs: number | null = null;
  private toastId = 1;
  private captionId = 1;
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

  constructor(private readonly deps: ControllerDeps) {
    this.audio = deps.audio ?? NULL_AUDIO;
    this.captions = deps.captions ?? NULL_CAPTIONS;
  }

  // ------------------------------------------------------------------ lifecycle

  start(settings: GameSettings, seed = Math.floor(Math.random() * 2 ** 31)): void {
    this.settings = settings;
    const players = buildPlayers(settings, seed);
    const state = createGame({
      seed,
      arenaId: settings.arenaId,
      players,
      settings: {
        mode: settings.mode,
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
          this.deps.botFactory({ difficulty: settings.difficulty, seed: seed + i * 7919, playerId: i }),
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
    this.audio.startMusic(settings.arenaId);
    this.audio.setIntensity(0);
    patch({
      screen: 'playing',
      paused: false,
      toasts: [],
      captions: [],
      summary: null,
      skipping: false,
      hud: buildHud(state, LOCAL_ID, null),
    });
  }

  rematch(): void {
    if (this.settings) this.start(this.settings);
  }

  stop(): void {
    this.state = null;
    this.audio.stopMusic();
    patch({ screen: 'title', hud: null, paused: false, summary: null, toasts: [], captions: [] });
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
   * (renderer effects, audio, captions, toasts), unlike `stepOnce`, which only runs the simulation.
   */
  debugAdvance(n: number): void {
    for (let i = 0; i < n && this.state && this.state.match.phase !== 'ended'; i++) {
      this.afterFrame(this.stepOnce(), performance.now(), 1 / 60);
    }
  }

  /** Advances exactly one simulation tick, with human and bot intents. */
  stepOnce(): SimEvent[] {
    const state = this.state!;
    const intents = this.collectIntents(state);
    const events = tick(state, intents);
    this.recordStats(events);
    return events;
  }

  private collectIntents(state: GameState): Intents {
    const intents: Intents = {};
    const me = state.players[LOCAL_ID];
    if (me && !me.isBot && me.alive) {
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
    for (const [id, bot] of this.bots) {
      if (state.players[id]!.alive) intents[id] = bot.decide(observe(state, id));
    }
    for (const [id, forced] of Object.entries(this.forced))
      intents[Number(id)] = { ...intents[Number(id)], ...forced };
    this.forced = {};
    return intents;
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
    this.captionsFrom(heard, events, nowMs);
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
    if (state.match.phase === 'ended') this.handleEnded(nowMs);
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

  private captionsFrom(heard: SimEvent[], events: SimEvent[], nowMs: number): void {
    const state = this.state!;
    const lines = this.captions.captionsFor(heard, state);
    const current = useGameStore.getState().captions.filter((c) => c.expires > nowMs);
    const added: Caption[] = lines.map((l) => ({ ...l, id: this.captionId++, expires: nowMs + l.ttlMs }));
    if (added.length > 0 || current.length !== useGameStore.getState().captions.length) {
      patch({ captions: [...current, ...added].slice(-2) });
    }
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
    const sent = this.entry.active ? this.entry.nav(command === 'back' ? 'cancel' : command, state) : null;
    if (command === 'cancel' && !this.entry.active && !sent) {
      if (state.match.phase === 'playing' || this.paused) this.togglePause();
      return;
    }
    if (sent) this.sendVehicle(sent);
  }

  pickEntry(clientX: number, clientY: number): void {
    const state = this.state;
    if (!state || !this.entry.active) return;
    const pick: EntryPick | null = this.deps.renderer.pickEntry(clientX, clientY);
    if (!pick) return;
    const sent = this.entry.pick(pick, state);
    if (sent) this.sendVehicle(sent);
  }

  confirmEntry(): void {
    const state = this.state;
    if (!state) return;
    const sent = this.entry.confirm(state);
    if (sent) this.sendVehicle(sent);
  }

  cancelEntry(): void {
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
    if (!state) return;
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
