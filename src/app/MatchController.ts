import { CHARACTERS, createGame, observe, readyToStep, tick } from '../sim';
import type { GameState, Intent, Intents, SimEvent, VehicleIntent } from '../sim';
import type { NavCommand } from '../input';
import type { EntryPick } from '../render';
import { buildHud } from './hud';
import { buildPlayers } from './names';
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
        floorHazards: settings.floorHazards,
      },
    });
    this.state = state;
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
    if (!this.state || this.state.match.phase === 'ended') return;
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

    if (!this.paused && !this.frozen) {
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
    this.excitement = Math.max(
      state.match.phase === 'playing' && state.match.playTicks > state.config.match.durationTicks - 1800
        ? 0.55
        : 0.18,
      this.excitement - dt * 0.35,
    );
    this.deps.renderer.handleEvents(events, state);
    this.audio.handleEvents(events, state);
    this.audio.setIntensity(
      state.match.phase === 'playing' && state.match.playTicks > state.config.match.durationTicks - 1800
        ? 1
        : this.excitement * 0.6,
    );
    this.captionsFrom(events, nowMs);
    this.countdownBeeps(state);

    // The renderer interpolates between ticks using the unspent accumulator.
    const alpha = this.paused ? 0 : Math.min(1, this.accumulator / STEP_MS);
    this.entry.sync(state);
    this.deps.renderer.render(state, alpha, dt, {
      localPlayerId: LOCAL_ID,
      entryOverlay: this.entry.overlay(state),
      excitement: this.excitement,
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

  private captionsFrom(events: SimEvent[], nowMs: number): void {
    const state = this.state!;
    const lines = this.captions.captionsFor(events, state);
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
    patch({ hud: buildHud(state, LOCAL_ID, entry) });
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
      patch({ screen: 'results', summary });
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

  /** Human eliminated: run the rest of the match instantly with the bots and show results. */
  skipToResults(): void {
    const state = this.state;
    if (!state) return;
    for (let i = 0; i < 40000 && state.match.phase !== 'ended'; i++) this.stepOnce();
    this.endedAtMs = -1e9;
    this.publishHud(performance.now());
    this.handleEnded(performance.now());
  }
}
