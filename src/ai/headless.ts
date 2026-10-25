/**
 * Headless bot-vs-bot match runner used by the evaluation script and the statistical tests.
 * Deterministic: the same spec always produces the same outcome.
 */
import { DIFFICULTIES, createGame, observe, tick } from '../sim';
import type {
  CharacterId,
  DeepPartial,
  Difficulty,
  EliminationCause,
  GameConfig,
  Intents,
  MatchSettings,
} from '../sim';
import { createBot } from './index';
import type { Bot } from './types';

export interface MatchSpec {
  seed: number;
  /** One entry per seat (2-4 on standard arenas, up to 32 on City Rumble). */
  difficulties: Difficulty[];
  characters?: CharacterId[];
  arenaId?: string;
  settings?: Partial<MatchSettings>;
  config?: DeepPartial<GameConfig>;
  /** Optional clock (ms) to measure decide() cost and the whole tick (bots + simulation). */
  now?: () => number;
  /** Stop after this many playing ticks (default: the match runs to its end). */
  maxPlayTicks?: number;
}

export interface SeatResult {
  difficulty: Difficulty;
  alive: boolean;
  eliminatedTick: number | null;
  cause: EliminationCause | null;
  /** Eliminated by something the bot itself caused (own generator / own vehicle). */
  suicide: boolean;
  /** A suicide that a rival made possible: it placed a generator next to the victim shortly before. */
  assisted: boolean;
  /** Seconds of play survived (the match length if it never died). */
  survivedSeconds: number;
  /** Generators this seat placed. */
  placed: number;
  /** Distinct tiles this seat stood on. */
  tilesVisited: number;
  /** Rivals eliminated by this seat's generators / vehicle. */
  kills: number;
  /** Tile where the seat ended the match (or was eliminated). */
  x: number;
  y: number;
}

export interface MatchOutcome {
  seed: number;
  winner: number | null;
  draw: boolean;
  timeout: boolean;
  /** Playing ticks elapsed. */
  ticks: number;
  seats: SeatResult[];
  /** Total ms spent in decide() per difficulty when a clock was supplied. */
  decideMs: Record<Difficulty, number>;
  decideCalls: Record<Difficulty, number>;
  /** Wall-clock ms of every playing tick (bots + simulation), when a clock was supplied. */
  tickMs: number[];
  /** Playing ticks at which the number of survivors first dropped to each value (index = survivors). */
  survivorsAt: number[];
}

const CHARACTER_CYCLE: CharacterId[] = ['streetBaller', 'lekkiBoy', 'campusQueen'];

export function runMatch(spec: MatchSpec): MatchOutcome {
  const n = spec.difficulties.length;
  const characters =
    spec.characters ?? spec.difficulties.map((_, i) => CHARACTER_CYCLE[(i + spec.seed) % 3]!);
  const state = createGame({
    seed: spec.seed,
    arenaId: spec.arenaId,
    settings: spec.settings,
    config: spec.config,
    players: spec.difficulties.map((difficulty, i) => ({
      name: `${difficulty}${i}`,
      characterId: characters[i % characters.length]!,
      isBot: true,
      difficulty,
    })),
  });
  const bots: Bot[] = spec.difficulties.map((difficulty, i) =>
    createBot({ difficulty, seed: spec.seed * 7919 + i * 104729 + 17, playerId: i }),
  );
  const decideMs = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0])) as Record<Difficulty, number>;
  const decideCalls = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0])) as Record<Difficulty, number>;
  const cap = state.config.match.countdownTicks + state.config.match.durationTicks + 60;
  const intents: Intents = {};
  const placements: { owner: number; tick: number; x: number; y: number }[] = [];
  const visited = state.players.map((p) => new Set<number>([p.y * state.width + p.x]));
  const kills = state.players.map(() => 0);
  const tickMs: number[] = [];
  const survivorsAt: number[] = [];
  let alive = n;
  const stopAt = spec.maxPlayTicks ?? Infinity;
  while (state.match.phase !== 'ended' && state.tick < cap && state.match.playTicks < stopAt) {
    const tickStart = spec.now?.() ?? 0;
    for (let i = 0; i < n; i++) {
      if (!state.players[i]!.alive) {
        delete intents[i];
        continue;
      }
      const t0 = spec.now?.() ?? 0;
      intents[i] = bots[i]!.decide(observe(state, i));
      if (spec.now) {
        const d = spec.difficulties[i]!;
        decideMs[d] += spec.now() - t0;
        decideCalls[d]++;
      }
    }
    for (const e of tick(state, intents)) {
      if (e.type === 'generatorPlaced')
        placements.push({ owner: e.ownerId, tick: state.tick, x: e.x, y: e.y });
      if (e.type === 'playerEliminated' && 'ownerId' in e.cause && e.cause.ownerId !== e.playerId)
        kills[e.cause.ownerId]!++;
    }
    if (spec.now && state.match.phase !== 'countdown') tickMs.push(spec.now() - tickStart);
    let now = 0;
    for (const p of state.players) {
      if (!p.alive) continue;
      now++;
      visited[p.id]!.add(p.y * state.width + p.x);
    }
    for (let k = alive - 1; k >= now; k--) survivorsAt[k] = state.match.playTicks;
    alive = now;
  }
  const result = state.match.result;
  const playTicks = state.match.playTicks;
  const countdown = state.config.match.countdownTicks;
  return {
    seed: spec.seed,
    winner: result?.kind === 'win' ? result.winnerId : null,
    draw: result?.kind === 'draw',
    timeout: result?.kind === 'draw' && result.reason === 'timeout',
    ticks: playTicks,
    seats: state.players.map((p, i) => {
      const cause = p.elimination;
      const suicide =
        cause !== null && (cause.kind === 'flame' || cause.kind === 'vehicle') && cause.ownerId === p.id;
      const diedTick = p.eliminatedTick ?? 0;
      const assisted =
        suicide &&
        placements.some(
          (q) =>
            q.owner !== p.id &&
            q.tick >= diedTick - 240 &&
            q.tick <= diedTick &&
            Math.abs(q.x - p.x) + Math.abs(q.y - p.y) <= 4,
        );
      const survivedTicks = p.eliminatedTick === null ? playTicks : Math.max(0, p.eliminatedTick - countdown);
      return {
        difficulty: spec.difficulties[i]!,
        alive: p.alive,
        eliminatedTick: p.eliminatedTick,
        cause,
        suicide,
        assisted,
        survivedSeconds: survivedTicks / 60,
        placed: placements.filter((q) => q.owner === p.id).length,
        tilesVisited: visited[i]!.size,
        kills: kills[i]!,
        x: p.x,
        y: p.y,
      };
    }),
    decideMs,
    decideCalls,
    tickMs,
    survivorsAt,
  };
}
