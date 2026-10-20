import { createBot } from '../../src/ai';
import { runMatch } from '../../src/ai/headless';
import type { Bot } from '../../src/ai';
import { createGame, observe, tick } from '../../src/sim';
import type { Difficulty, GameState, Intent, Intents, SimEvent } from '../../src/sim';

/** Creates bots for the given seats (seat id -> difficulty). Deterministic. */
export function makeBots(seats: Record<number, Difficulty>, seed = 1): Record<number, Bot> {
  const bots: Record<number, Bot> = {};
  for (const [id, difficulty] of Object.entries(seats)) {
    bots[Number(id)] = createBot({ difficulty, seed: seed * 31 + Number(id), playerId: Number(id) });
  }
  return bots;
}

export interface BotRun {
  events: SimEvent[];
  /** Every intent the bots produced, per seat, per tick. */
  intents: Record<number, Intent[]>;
}

/**
 * Advances the game `n` ticks with bots controlling their seats. Other seats get `others(tick)` intents
 * (default: idle). Stops early if `until` returns true.
 */
export function runBots(
  state: GameState,
  bots: Record<number, Bot>,
  n: number,
  opts: { others?: (tickIndex: number) => Intents; until?: (events: SimEvent[]) => boolean } = {},
): BotRun {
  const out: BotRun = { events: [], intents: {} };
  for (const id of Object.keys(bots)) out.intents[Number(id)] = [];
  for (let i = 0; i < n; i++) {
    const intents: Intents = { ...(opts.others?.(i) ?? {}) };
    for (const [id, bot] of Object.entries(bots)) {
      const seat = Number(id);
      if (!state.players[seat]!.alive) continue;
      const intent = bot.decide(observe(state, seat));
      intents[seat] = intent;
      out.intents[seat]!.push(intent);
    }
    const ev = tick(state, intents);
    out.events.push(...ev);
    if (opts.until?.(ev)) break;
  }
  return out;
}

/** A real match (random soft blocks and hidden pickups) with the given seats filled by bots. */
export function realMatch(
  seats: Difficulty[],
  seed: number,
): { state: GameState; bots: Record<number, Bot> } {
  const characters = ['streetBaller', 'lekkiBoy', 'campusQueen'] as const;
  const state = createGame({
    seed,
    players: seats.map((d, i) => ({
      name: `${d}${i}`,
      characterId: characters[(i + seed) % 3]!,
      isBot: true,
      difficulty: d,
    })),
  });
  const bots = makeBots(Object.fromEntries(seats.map((d, i) => [i, d])), seed);
  // skip the countdown
  while (state.match.phase === 'countdown') tick(state, {});
  return { state, bots };
}

/** Share of duels (draws count half) won by difficulty `a` against `b`; seats alternate with the seed. */
export function duelShare(
  a: Difficulty,
  b: Difficulty,
  matches: number,
  firstSeed: number,
): { share: number; aWins: number; bWins: number; draws: number } {
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  for (let i = 0; i < matches; i++) {
    const seed = firstSeed + i;
    const aSeat = seed % 2;
    const seats: Difficulty[] = aSeat === 0 ? [a, b] : [b, a];
    const out = runMatch({ seed, difficulties: seats });
    if (out.winner === aSeat) aWins++;
    else if (out.winner !== null) bWins++;
    else draws++;
  }
  return { share: (aWins + draws / 2) / matches, aWins, bWins, draws };
}
