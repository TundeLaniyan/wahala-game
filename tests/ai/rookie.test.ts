import { describe, expect, it } from 'vitest';
import { createBot } from '../../src/ai';
import { DIRS, DIR_VEC, Tile, createGame, observe, tick } from '../../src/sim';
import type { Dir, Difficulty, GameState, Generator, Intent, Intents } from '../../src/sim';

/**
 * Rookie must genuinely suit a first-time player (decision WB2). The stand-in for that player is a NOVICE
 * dummy: it never attacks, and it only reacts to a generator once it has been on the ground for half a
 * second, by walking to the nearest tile outside every visible blast cross. Otherwise it stands still.
 */
const NOVICE_REACTION = 30;
/** Once Wahala Crush is closing, the novice also keeps clear of the next this-many closing tiles. */
const CRUSH_LOOKAHEAD = 30;

/** Tiles a generator's plain cross would burn (range-limited, stopped by concrete, a crate burns and stops it). */
function cross(s: GameState, g: Readonly<Generator>): Set<number> {
  const out = new Set<number>([g.y * s.width + g.x]);
  for (const d of DIRS) {
    const v = DIR_VEC[d];
    for (let k = 1; k <= g.range; k++) {
      const x = g.x + v.dx * k;
      const y = g.y + v.dy * k;
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) break;
      const t = s.tiles[y * s.width + x];
      if (t === Tile.Hard) break;
      out.add(y * s.width + x);
      if (t === Tile.Soft) break;
    }
  }
  return out;
}

const walkable = (s: GameState, i: number): boolean =>
  s.tiles[i] === Tile.Empty && !s.generators.some((g) => g.carriedBy === null && g.y * s.width + g.x === i);

/** BFS from `from` over walkable tiles (start always allowed) to the nearest tile outside `danger`. */
function escapeSteps(s: GameState, from: number, danger: Set<number>, burning: Set<number>, max: number): Dir[] | null {
  const prev = new Map<number, [number, Dir]>();
  const seen = new Set([from]);
  let frontier = [from];
  for (let depth = 0; depth <= max && frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const u of frontier) {
      if (!danger.has(u)) {
        const path: Dir[] = [];
        for (let c = u; c !== from; c = prev.get(c)![0]) path.unshift(prev.get(c)![1]);
        return path;
      }
      const ux = u % s.width;
      const uy = Math.floor(u / s.width);
      for (const d of DIRS) {
        const x = ux + DIR_VEC[d].dx;
        const y = uy + DIR_VEC[d].dy;
        if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
        const v = y * s.width + x;
        if (seen.has(v) || !walkable(s, v) || burning.has(v)) continue;
        seen.add(v);
        prev.set(v, [u, d]);
        next.push(v);
      }
    }
    frontier = next;
  }
  return null;
}

function noviceIntent(s: GameState, id: number): Intent {
  const me = s.players[id]!;
  const danger = new Set<number>();
  for (const g of s.generators) {
    if (g.carriedBy !== null || g.flight !== null || s.tick - g.placedTick < NOVICE_REACTION) continue;
    for (const t of cross(s, g)) danger.add(t);
  }
  const burning = new Set(s.flames.map((f) => f.y * s.width + f.x));
  for (const t of burning) danger.add(t);
  // like anyone who has seen the walls close in once: keep off the next stretch of the closing ring
  const crush = s.crush;
  if (crush && crush.next > 0) for (let k = 0; k < crush.next + CRUSH_LOOKAHEAD && k < crush.order.length - 1; k++) danger.add(crush.order[k]!);
  const here = me.y * s.width + me.x;
  if (!danger.has(here)) return {};
  const path = escapeSteps(s, here, danger, burning, 30);
  return path && path.length > 0 ? { move: path[0]! } : {};
}

interface Duel {
  /** Seconds the novice survived (120 when alive at the end). */
  survived: number;
  /** The novice won or drew. */
  ok: boolean;
  /** The novice was eliminated by the bot's own generator or vehicle. */
  byBot: boolean;
  /** Bot placements that left an adjacent novice with no way out (see `trapped`). */
  violations: number;
  placements: number;
}

/**
 * Independent check: after a placement next to the novice, can it walk out of that generator's cross before
 * the fuse runs out, starting `NOVICE_REACTION` ticks late? (Only walls, crates, generators and live flames
 * block; this is the most generous reading, so a failure is a real cut-off.)
 */
function trapped(s: GameState, novice: number, g: Readonly<Generator>): boolean {
  const p = s.players[novice]!;
  const step = s.config.movement.stepTicksBySpeedLevel[p.speedLevel]!;
  const steps = Math.floor((s.config.generator.fuseTicks - NOVICE_REACTION) / step);
  const burning = new Set(s.flames.map((f) => f.y * s.width + f.x));
  return escapeSteps(s, p.y * s.width + p.x, cross(s, g), burning, steps) === null;
}

function duel(bot: Difficulty, seed: number): Duel {
  const s = createGame({
    seed,
    settings: { mode: 'crush' },
    players: [
      { name: 'novice', characterId: 'streetBaller', isBot: false },
      { name: bot, characterId: 'lekkiBoy', isBot: true, difficulty: bot },
    ],
  });
  const b = createBot({ difficulty: bot, seed: seed * 13 + 1, playerId: 1 });
  let violations = 0;
  let placements = 0;
  while (s.match.phase !== 'ended') {
    const intents: Intents = s.match.phase === 'playing' ? { 0: noviceIntent(s, 0), 1: b.decide(observe(s, 1)) } : {};
    for (const e of tick(s, intents)) {
      if (e.type !== 'generatorPlaced' || e.ownerId !== 1) continue;
      placements++;
      const n = s.players[0]!;
      if (!n.alive || Math.abs(n.x - e.x) + Math.abs(n.y - e.y) > 1) continue;
      if (trapped(s, 0, s.generators.find((g) => g.id === e.generatorId)!)) violations++;
    }
  }
  const n = s.players[0]!;
  const r = s.match.result;
  const countdown = s.config.match.countdownTicks;
  return {
    survived: n.alive ? s.match.playTicks / 60 : (n.eliminatedTick! - countdown) / 60,
    ok: r?.kind === 'draw' || (r?.kind === 'win' && r.winnerId === 0),
    byBot: n.elimination !== null && 'ownerId' in n.elimination && n.elimination.ownerId === 1,
    violations,
    placements,
  };
}

interface Series {
  survived: number;
  ok: number;
  byBot: number;
  violations: number;
  placements: number;
}

function series(bot: Difficulty, seeds: number): Series {
  let survived = 0;
  let ok = 0;
  let byBot = 0;
  let violations = 0;
  let placements = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const d = duel(bot, seed);
    survived += d.survived;
    ok += d.ok ? 1 : 0;
    byBot += d.byBot ? 1 : 0;
    violations += d.violations;
    placements += d.placements;
  }
  return { survived: survived / seeds, ok, byBot, violations, placements };
}

describe('Rookie is for a first-time player', () => {
  it('a passive novice survives much longer against Rookie than against Standard', () => {
    const rookie = series('rookie', 16);
    const standard = series('standard', 16);
    console.log('novice vs rookie', rookie, 'novice vs standard', standard);
    // Rookie hardly ever takes the novice out itself; Standard usually does
    expect(rookie.byBot).toBeLessThanOrEqual(2);
    expect(standard.byBot).toBeGreaterThanOrEqual(10);
    // so the novice lives clearly longer and wins (or draws) at least half of the time
    expect(rookie.survived).toBeGreaterThan(1.25 * standard.survived);
    expect(rookie.ok).toBeGreaterThanOrEqual(8);
    expect(standard.ok).toBeLessThanOrEqual(2);
    expect(rookie.placements).toBeGreaterThan(16 * 5); // Rookie still plays: it is not a statue
  }, 120_000);

  it('Rookie never places a generator that leaves an adjacent player with no way out', () => {
    const rookie = series('rookie', 24);
    expect(rookie.violations).toBe(0);
  }, 120_000);
});
