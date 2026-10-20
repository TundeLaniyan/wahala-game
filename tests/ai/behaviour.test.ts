import { describe, expect, it } from 'vitest';
import { runMatch } from '../../src/ai/headless';
import { Tile, observe } from '../../src/sim';
import type { Difficulty, GameState, Intents } from '../../src/sim';
import { createGame, tick } from '../../src/sim';
import { createBot } from '../../src/ai';
import { makeBots, realMatch, runBots } from './helpers';

const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

/** Plays a real match tick by tick, calling `onTick` with the state before and the intents about to be applied. */
function playReal(
  seats: Difficulty[],
  seed: number,
  onTick: (state: GameState, intents: Intents) => void,
  maxTicks = 2400,
): GameState {
  const { state, bots } = realMatch(seats, seed);
  for (let i = 0; i < maxTicks && state.match.phase === 'playing'; i++) {
    const intents: Intents = {};
    for (const [id, bot] of Object.entries(bots)) {
      if (state.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(state, Number(id)));
    }
    onTick(state, intents);
    tick(state, intents);
  }
  return state;
}

describe('determinism', () => {
  it('the same seed produces exactly the same match', () => {
    const a = runMatch({ seed: 7, difficulties: ['easy', 'medium', 'hard', 'hard'] });
    const b = runMatch({ seed: 7, difficulties: ['easy', 'medium', 'hard', 'hard'] });
    expect(b).toEqual(a);
  });

  it('different bot seeds can play differently', () => {
    const run = (seed: number): string => {
      const s = createGame({
        seed: 3,
        players: [
          { name: 'a', characterId: 'streetBaller', isBot: true },
          { name: 'b', characterId: 'streetBaller', isBot: false },
        ],
      });
      while (s.match.phase === 'countdown') tick(s, {});
      const bot = createBot({ difficulty: 'easy', seed, playerId: 0 });
      const trail: string[] = [];
      for (let i = 0; i < 400; i++) {
        tick(s, { 0: bot.decide(observe(s, 0)) });
        trail.push(`${s.players[0]!.x},${s.players[0]!.y}`);
      }
      return trail.join('|');
    };
    expect(run(1)).not.toEqual(run(2));
  });
});

describe('safety invariants over full matches', () => {
  const lineups: Difficulty[][] = [
    ['easy', 'medium', 'hard', 'medium'],
    ['hard', 'easy', 'hard', 'medium'],
  ];

  it('no bot ever steps onto a tile that is already burning', () => {
    let steps = 0;
    const violations: string[] = [];
    for (const [li, seats] of lineups.entries()) {
      for (let seed = 1; seed <= 3; seed++) {
        const before = new Map<number, string>();
        playReal(seats, seed + li * 10, (state, intents) => {
          // flames that are still lit when the next tick's movement happens
          const lit = new Set(
            state.flames
              .filter((f) => f.startTick <= state.tick + 1 && state.tick + 1 < f.endTick)
              .map((f) => `${f.x},${f.y}`),
          );
          for (const p of state.players) {
            if (!p.alive) continue;
            const key = `${p.x},${p.y}`;
            const prev = before.get(p.id);
            before.set(p.id, key);
            if (prev === undefined || prev === key) continue;
            steps++;
            if (lit.has(key) && !p.mounted)
              violations.push(`${seats[p.id]} seed ${seed + li * 10} tick ${state.tick} -> ${key}`);
          }
          void intents;
        });
      }
    }
    expect(steps).toBeGreaterThan(200);
    expect(violations).toEqual([]);
  });

  it('bots do not keep sending moves into walls, blocks or generators', () => {
    let ready = 0;
    let wasted = 0;
    let worstRun = 0;
    for (const seats of lineups) {
      const runs = new Map<number, number>();
      playReal(seats, 5, (state, intents) => {
        for (const p of state.players) {
          const move = intents[p.id]?.move;
          if (!p.alive) continue;
          const acting = state.tick >= p.dazedUntil && p.entryUntil === null && p.stepRemaining <= 1;
          if (!acting) continue;
          ready++;
          if (!move) {
            runs.set(p.id, 0);
            continue;
          }
          const dir =
            p.curse?.kind === 'inverted' && state.tick < p.curse.until
              ? ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[move]
              : move;
          const [dx, dy] = DIR[dir];
          const x = p.x + dx;
          const y = p.y + dy;
          const tile =
            x < 0 || y < 0 || x >= state.width || y >= state.height
              ? Tile.Hard
              : state.tiles[y * state.width + x];
          const gen = state.generators.some(
            (g) => g.carriedBy === null && g.flight === null && g.x === x && g.y === y,
          );
          const kicking = gen && p.kick;
          const turning = gen; // deliberately facing a generator to disarm / punch / carry it
          if ((tile !== Tile.Empty || gen) && !kicking && !turning) {
            wasted++;
            runs.set(p.id, (runs.get(p.id) ?? 0) + 1);
            worstRun = Math.max(worstRun, runs.get(p.id)!);
          } else runs.set(p.id, 0);
        }
      });
    }
    expect(ready).toBeGreaterThan(500);
    expect(worstRun).toBeLessThanOrEqual(2);
    expect(wasted / ready).toBeLessThan(0.01);
  });
});

describe('self-inflicted deaths', () => {
  /** One bot alone against an idle dummy for a minute: nobody else can trap it. */
  function soloDeaths(d: Difficulty, seeds: number): number {
    let deaths = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const s = createGame({
        seed,
        players: [
          { name: 'bot', characterId: 'streetBaller', isBot: true, difficulty: d },
          { name: 'dummy', characterId: 'streetBaller', isBot: false },
        ],
      });
      while (s.match.phase === 'countdown') tick(s, {});
      runBots(s, makeBots({ 0: d }, seed), 3600, { until: () => !s.players[0]!.alive });
      if (!s.players[0]!.alive) deaths++;
    }
    return deaths;
  }

  it('medium essentially never blows itself up when nobody can trap it', () => {
    expect(soloDeaths('medium', 12)).toBeLessThanOrEqual(1);
  }, 30000);

  it('hard essentially never blows itself up when nobody can trap it', () => {
    expect(soloDeaths('hard', 12)).toBeLessThanOrEqual(1);
  }, 30000);

  it('easy is careless but not suicidal', () => {
    expect(soloDeaths('easy', 12)).toBeLessThanOrEqual(6); // at most half
  }, 30000);
});

describe('matches finish', () => {
  it('most matches end with a winner well before the two-minute timeout', () => {
    let finished = 0;
    let total = 0;
    let ticks = 0;
    const lineups: Difficulty[][] = [
      ['medium', 'hard', 'medium', 'hard'],
      ['easy', 'easy', 'easy', 'easy'],
      ['hard', 'hard'],
      ['easy', 'medium', 'hard'],
    ];
    for (const seats of lineups) {
      for (let seed = 1; seed <= 4; seed++) {
        const out = runMatch({ seed, difficulties: seats });
        total++;
        if (!out.timeout) finished++;
        ticks += out.ticks;
      }
    }
    expect(finished / total).toBeGreaterThanOrEqual(0.9);
    expect(ticks / total / 60).toBeLessThan(75);
  });
});

describe('decision cost', () => {
  it('stays inside the per-tick budget (0.5 ms easy/medium, 2 ms hard on average)', () => {
    const budget = { easy: 0.5, medium: 0.5, hard: 2 };
    const out = runMatch({
      seed: 11,
      difficulties: ['easy', 'medium', 'hard', 'hard'],
      now: () => performance.now(),
    });
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const avg = out.decideMs[d] / Math.max(1, out.decideCalls[d]);
      expect(avg).toBeLessThan(budget[d]);
    }
  });
});
