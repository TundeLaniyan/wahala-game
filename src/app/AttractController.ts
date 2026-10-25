import { createGame, observe, tick } from '../sim';
import type { GameState, Intents } from '../sim';
import { CHARACTER_IDS } from '../sim';
import type { BotFactory, RendererPort } from './ports';

const STEP_MS = 1000 / 60;

/**
 * Title-screen "attract mode": a bots-only match played live behind the menu so the first thing
 * a visitor sees is a living arena. Uses the same simulation, bots and renderer as a real match,
 * restarts when a round ends, and produces no audio or HUD.
 */
export class AttractController {
  private state: GameState | null = null;
  private bots: ReturnType<BotFactory>[] = [];
  private accumulator = 0;
  private lastMs = -1;
  private endedAt = -1;
  private round = 0;
  private active = false;

  constructor(
    private readonly renderer: RendererPort,
    private readonly botFactory: BotFactory,
  ) {}

  get running(): boolean {
    return this.active;
  }

  start(arenaId = 'danfoBusPark'): void {
    this.round++;
    const seed = 7001 + this.round * 131;
    const state = createGame({
      seed,
      arenaId,
      players: [0, 1, 2, 3].map((i) => ({
        name: ['Ola_99', 'Chi_Boy', 'T_Blaze', 'Yaba_King'][i]!,
        characterId: CHARACTER_IDS[i % CHARACTER_IDS.length]!,
        isBot: true,
        difficulty: 'standard' as const,
      })),
    });
    // skip the countdown: the demo should already be in motion
    state.match.phase = 'playing';
    state.match.countdownRemaining = 0;
    this.state = state;
    this.bots = state.players.map((_, i) =>
      this.botFactory({ difficulty: 'standard', seed: seed + i * 31, playerId: i }),
    );
    this.accumulator = 0;
    this.lastMs = -1;
    this.endedAt = -1;
    this.active = true;
    this.renderer.loadGame(state);
  }

  stop(): void {
    this.active = false;
    this.state = null;
  }

  frame(nowMs: number): void {
    const state = this.state;
    if (!this.active || !state) return;
    const dt = this.lastMs < 0 ? STEP_MS : Math.min(nowMs - this.lastMs, 100);
    this.lastMs = nowMs;
    this.accumulator += dt;
    const events = [];
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < 4) {
      this.accumulator -= STEP_MS;
      steps++;
      const intents: Intents = {};
      state.players.forEach((p, i) => {
        if (p.alive) intents[i] = this.bots[i]!.decide(observe(state, i));
      });
      events.push(...tick(state, intents));
    }
    if (steps === 4) this.accumulator = 0;
    this.renderer.handleEvents(events, state);
    this.renderer.render(state, Math.min(1, this.accumulator / STEP_MS), dt / 1000, {
      localPlayerId: -1,
      entryOverlay: null,
      excitement: 0.4,
      attract: true,
    });
    if (state.match.phase === 'ended') {
      if (this.endedAt < 0) this.endedAt = nowMs;
      else if (nowMs - this.endedAt > 2500) this.start(state.arenaId);
    }
  }
}
