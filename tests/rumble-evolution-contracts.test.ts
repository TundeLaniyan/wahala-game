/**
 * City Rumble Evolution shared arena contracts (docs/RUMBLE_EVOLUTION.md section 2): authored barriers `x`,
 * marked supply crates `$`, kept-clear floor `_`, whole-board crates for non-mirrored stages and summoned
 * attack lanes (`config.vehicles.lanes`).
 */
import { describe, expect, it } from 'vitest';
import { ARENAS } from '../src/sim/arenas';
import type { ArenaDef } from '../src/sim/arenas';
import { createGame, observe } from '../src/sim';
import type { GameState } from '../src/sim';
import { listEntries } from '../src/sim/systems/entries';
import { Tile } from '../src/sim/types';
import { addGenerator, eventsOf, put, run } from './helpers';

const LAYOUT = [
  '...............',
  '.x$_____.......',
  '.#.#.#.#.#.#.#.',
  '...............',
  '.#.#.#.#.#.#.#.',
  '...............',
  '.#.#.#.#.#.#.#.',
  '...............',
  '.#.#.#.#.#.#.#.',
  '..............$',
  '...............',
];

const TEST_ARENA: ArenaDef = {
  id: 'contractTest',
  name: 'Contract Test',
  kind: 'standard',
  layout: LAYOUT,
  spawns: [
    { x: 0, y: 10 },
    { x: 14, y: 0 },
  ],
  spawnClearance: [{ x: 0, y: 0 }],
  mirrorSoftBlocks: false,
  maxPlayers: 2,
  endgameTraps: [],
  stageHazards: [],
  config: { arena: { softDensity: 1 }, pickups: { hiddenChance: 0 } },
  experimental: true,
  info: { tagline: '', lighting: '', hazards: [] },
};
(ARENAS as Record<string, ArenaDef>)[TEST_ARENA.id] = TEST_ARENA;

function game(config = {}): GameState {
  const s = createGame({
    seed: 5,
    arenaId: TEST_ARENA.id,
    players: [
      { name: 'A', characterId: 'streetBaller', isBot: false },
      { name: 'B', characterId: 'lekkiBoy', isBot: true },
    ],
    config,
    settings: { stageHazards: false },
  });
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

const at = (s: GameState, x: number, y: number): number => s.tiles[y * s.width + x]!;

describe('authored cover', () => {
  it('barriers and supply crates are always crates, kept-clear floor never is', () => {
    const s = game();
    expect(at(s, 1, 1)).toBe(Tile.Soft);
    expect(at(s, 2, 1)).toBe(Tile.Soft);
    for (let x = 3; x <= 7; x++) expect(at(s, x, 1)).toBe(Tile.Empty);
    // a non-mirrored arena gets random crates on the whole board (density 1: every free tile)
    expect(at(s, 12, 9)).toBe(Tile.Soft);
    expect(at(s, 12, 1)).toBe(Tile.Soft);
  });

  it('a supply crate holds one basic upgrade although crates hide nothing; the marking is public', () => {
    const s = game();
    const i = 1 * s.width + 2;
    expect(s.supplies).toEqual([i, 9 * s.width + 14]);
    expect(['socket', 'petrol']).toContain(s.hidden[i]);
    expect(observe(s, 1).supplies).toEqual(s.supplies);
    // nothing else hides anything (hiddenChance 0)
    expect(Object.keys(s.hidden).map(Number).sort((a, b) => a - b)).toEqual([...s.supplies].sort((a, b) => a - b));
  });

  it('blasting a supply crate reveals its upgrade and removes the marking (never refills)', () => {
    const s = game();
    const i = 1 * s.width + 2;
    const kind = s.hidden[i]!;
    put(s, 0, 0, 10);
    put(s, 1, 14, 0);
    s.tiles[1 * s.width + 3] = Tile.Empty;
    addGenerator(s, { ownerId: 0, x: 3, y: 1, timer: 1, range: 1 });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'blockDestroyed').some((e) => e.x === 2 && e.y === 1)).toBe(true);
    expect(s.supplies).not.toContain(i);
    run(s, s.config.generator.flameTicks + 2);
    expect(s.pickups.some((p) => p.x === 2 && p.y === 1 && p.kind === kind)).toBe(true);
  });
});

describe('summoned attack lanes', () => {
  it('without lanes every border tile can be an entrance; with lanes only the named road mouths', () => {
    const open = game();
    open.tiles = open.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    expect(listEntries(open, 'taxi').length).toBeGreaterThan(10);

    const laned = game({ vehicles: { lanes: [[0, 3, 'right'], [14, 5, 'left'], [7, 7, 'up']] } });
    laned.tiles = laned.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    // (7, 7) is not on the border: ignored
    expect(listEntries(laned, 'taxi')).toEqual([
      { x: 0, y: 3, dir: 'right' },
      { x: 14, y: 5, dir: 'left' },
    ]);
  });
});
