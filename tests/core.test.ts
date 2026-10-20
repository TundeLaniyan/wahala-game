import { describe, expect, it } from 'vitest';
import { createGame, tick, tileAt, Tile } from '../src/sim';
import type { Intents } from '../src/sim';
import { addGenerator, addSoft, eventsOf, flameKeys, keys, put, run, runUntil, sandbox } from './helpers';

describe('grid movement', () => {
  it('moves exactly one cardinal tile per step', () => {
    const s = sandbox();
    put(s, 0, 0, 0);
    run(s, 1, { 0: { move: 'right' } });
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([1, 0]);
    run(s, 10, { 0: { move: 'right' } });
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([2, 0]);
    run(s, 10, { 0: { move: 'down' } });
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([2, 1]);
  });

  it('never moves diagonally even if intents change every tick', () => {
    const s = sandbox();
    put(s, 0, 2, 2);
    let moves = 0;
    let last = { x: 2, y: 2 };
    for (let i = 0; i < 200; i++) {
      tick(s, { 0: { move: i % 2 ? 'right' : 'down' } });
      const p = s.players[0]!;
      if (p.x !== last.x || p.y !== last.y) {
        expect(Math.abs(p.x - last.x) + Math.abs(p.y - last.y)).toBe(1);
        moves++;
        last = { x: p.x, y: p.y };
      }
    }
    expect(moves).toBeGreaterThan(5);
  });

  it('is blocked by concrete pillars, the arena edge and soft blocks', () => {
    const s = sandbox();
    put(s, 0, 0, 1);
    run(s, 12, { 0: { move: 'right' } }); // (1,1) is a pillar
    expect(s.players[0]!.x).toBe(0);
    run(s, 12, { 0: { move: 'left' } });
    expect(s.players[0]!.x).toBe(0);
    addSoft(s, 0, 2);
    run(s, 12, { 0: { move: 'down' } });
    expect(s.players[0]!.y).toBe(1);
  });

  it('lets the owner leave a fresh generator tile but never re-enter it', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    run(s, 1, { 0: { place: true } });
    expect(s.generators).toHaveLength(1);
    run(s, 10, { 0: { move: 'right' } });
    expect(s.players[0]!.x).toBe(5);
    run(s, 30, { 0: { move: 'left' } });
    expect(s.players[0]!.x).toBe(5); // blocked by own generator
  });

  it('blocks other players from the generator tile too, and lets a co-located rival walk out', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 4, 4);
    run(s, 1, { 0: { place: true } });
    run(s, 10, { 1: { move: 'down' } });
    expect(s.players[1]!.y).toBe(5);
    put(s, 0, 4, 5);
    run(s, 30, { 0: { move: 'up' } });
    expect(s.players[0]!.y).toBe(5);
  });

  it('respects generator capacity (starts at one)', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    run(s, 1, { 0: { place: true } });
    run(s, 10, { 0: { move: 'right' } });
    run(s, 1, { 0: { place: true } });
    expect(s.generators).toHaveLength(1);
  });

  it('ignores input during the countdown', () => {
    const s = createGame({
      seed: 3,
      players: [
        { name: 'a', characterId: 'streetBaller', isBot: false },
        { name: 'b', characterId: 'lekkiBoy', isBot: true },
      ],
    });
    const before = { x: s.players[0]!.x, y: s.players[0]!.y };
    run(s, 20, { 0: { move: 'up', place: true } });
    expect(s.players[0]!.x).toBe(before.x);
    expect(s.players[0]!.y).toBe(before.y);
    expect(s.generators).toHaveLength(0);
  });
});

describe('arena', () => {
  it('has 4-fold symmetric soft blocks and clear spawn zones', () => {
    const s = createGame({
      seed: 99,
      players: [0, 1, 2, 3].map((i) => ({
        name: `p${i}`,
        characterId: 'streetBaller' as const,
        isBot: i > 0,
      })),
    });
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const v = tileAt(s, x, y);
        expect(tileAt(s, s.width - 1 - x, y)).toBe(v);
        expect(tileAt(s, x, s.height - 1 - y)).toBe(v);
      }
    }
    for (const p of s.players) {
      expect(tileAt(s, p.x, p.y)).toBe(Tile.Empty);
      const ix = p.x === 0 ? 1 : -1;
      const iy = p.y === 0 ? 1 : -1;
      expect(tileAt(s, p.x + ix, p.y)).toBe(Tile.Empty);
      expect(tileAt(s, p.x, p.y + iy)).toBe(Tile.Empty);
    }
  });

  it('is deterministic for a given seed', () => {
    const mk = (seed: number) =>
      createGame({
        seed,
        players: [
          { name: 'a', characterId: 'streetBaller', isBot: false },
          { name: 'b', characterId: 'lekkiBoy', isBot: true },
        ],
      });
    expect(JSON.stringify(mk(5))).toBe(JSON.stringify(mk(5)));
    expect(JSON.stringify(mk(5))).not.toBe(JSON.stringify(mk(6)));
  });

  it('replays identically from identical inputs', () => {
    const play = (): string => {
      const s = createGame({
        seed: 12,
        players: [
          { name: 'a', characterId: 'streetBaller', isBot: false },
          { name: 'b', characterId: 'campusQueen', isBot: true },
        ],
      });
      let seed = 7;
      const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      const dirs = ['up', 'right', 'down', 'left'] as const;
      for (let i = 0; i < 1500; i++) {
        const intents: Intents = {};
        for (const id of [0, 1]) intents[id] = { move: dirs[Math.floor(rnd() * 4)]!, place: rnd() < 0.05 };
        tick(s, intents);
      }
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });
});

describe('generators and explosions', () => {
  it('detonates after the fuse with a plus-shaped blast', () => {
    const s = sandbox();
    put(s, 0, 0, 10);
    const g = addGenerator(s, { ownerId: 0, x: 4, y: 4 });
    const ev = runUntil(s, (e) => e.some((x) => x.type === 'generatorExploded'));
    expect(eventsOf(ev, 'generatorExploded')[0]!.generatorId).toBe(g.id);
    expect(s.tick).toBe(s.config.generator.fuseTicks);
    expect(flameKeys(s)).toEqual(
      keys([4, 4], [2, 4], [3, 4], [5, 4], [6, 4], [4, 2], [4, 3], [4, 5], [4, 6]),
    );
    expect(s.generators).toHaveLength(0);
  });

  it('stops at concrete and never goes diagonal or past the arena edge', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    addGenerator(s, { ownerId: 0, x: 2, y: 1, triggered: true });
    run(s, 1);
    expect(flameKeys(s)).toEqual(keys([2, 1], [2, 0], [2, 2], [2, 3]));
  });

  it('destroys the first soft block, is absorbed by it, and reveals its pickup', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    addSoft(s, 4, 5, 'petrol');
    addSoft(s, 4, 6);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    const ev = run(s, 1);
    expect(flameKeys(s)).toContain('4,5');
    expect(flameKeys(s)).not.toContain('4,6');
    expect(tileAt(s, 4, 5)).toBe(Tile.Empty);
    expect(tileAt(s, 4, 6)).toBe(Tile.Soft);
    expect(eventsOf(ev, 'blockDestroyed')).toHaveLength(1);
    expect(s.pickups.map((p) => [p.x, p.y, p.kind])).toEqual([[4, 5, 'petrol']]);
  });

  it('does not burn the pickup its own blast revealed, but burns it in a later blast', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    addSoft(s, 4, 5, 'petrol');
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    run(s, 5);
    expect(s.pickups).toHaveLength(1);
    run(s, 60); // flames gone
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    run(s, 1);
    expect(s.pickups).toHaveLength(0);
  });

  it('chain reactions trigger each generator exactly once, in one event', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    addGenerator(s, { ownerId: 0, x: 6, y: 4, timer: 999 });
    addGenerator(s, { ownerId: 0, x: 6, y: 6, timer: 999 });
    const far = addGenerator(s, { ownerId: 0, x: 12, y: 8, timer: 999 });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'generatorExploded')).toHaveLength(3);
    expect(new Set(eventsOf(ev, 'generatorExploded').map((e) => e.eventId)).size).toBe(1);
    expect(s.generators.map((g) => g.id)).toEqual([far.id]);
    expect(s.blasts).toHaveLength(1);
  });

  it('a soft block hit by two simultaneous blasts blocks both (order independent)', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    addSoft(s, 4, 4);
    addGenerator(s, { ownerId: 0, x: 2, y: 4, range: 3, triggered: true });
    addGenerator(s, { ownerId: 0, x: 4, y: 6, range: 3, triggered: true });
    run(s, 1);
    const f = new Set(flameKeys(s));
    expect(f.has('4,4')).toBe(true);
    expect(f.has('4,3')).toBe(false); // the vertical blast did not leak through a block the horizontal one broke
    expect(f.has('5,4')).toBe(false);
    expect(tileAt(s, 4, 4)).toBe(Tile.Empty);
  });

  it('an owner can be eliminated by their own generator', () => {
    const s = sandbox();
    put(s, 1, 14, 0);
    put(s, 0, 4, 4);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    const ev = run(s, 1);
    expect(s.players[0]!.alive).toBe(false);
    expect(eventsOf(ev, 'playerEliminated')[0]!.cause).toMatchObject({ kind: 'flame', ownerId: 0 });
  });

  it('flames linger and still kill a player who walks into them', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 14, 0);
    addGenerator(s, { ownerId: 1, x: 4, y: 4, triggered: true });
    s.players[0]!.mounted = false;
    put(s, 0, 8, 4);
    run(s, 1);
    expect(s.players[0]!.alive).toBe(true);
    s.players[0]!.x = 6;
    run(s, 1);
    expect(s.players[0]!.alive).toBe(false);
  });
});

describe('match rules', () => {
  it('declares a winner when one player remains', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    put(s, 1, 4, 4);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'matchEnded')[0]!.result).toEqual({ kind: 'win', winnerId: 0 });
  });

  it('ends in a DRAW when the final two are eliminated by the same blast', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    const ev = run(s, 1);
    expect(s.players.every((p) => !p.alive)).toBe(true);
    expect(eventsOf(ev, 'matchEnded')[0]!.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it('draws when separate generators kill the last two players on the same tick', () => {
    const s = sandbox();
    put(s, 0, 2, 8);
    put(s, 1, 10, 2);
    addGenerator(s, { ownerId: 0, x: 2, y: 8, triggered: true });
    addGenerator(s, { ownerId: 1, x: 10, y: 2, triggered: true });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'matchEnded')[0]!.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it('with three players, simultaneous deaths of two others leave the survivor the winner', () => {
    const s = sandbox({ players: 3 });
    put(s, 0, 14, 10);
    put(s, 1, 4, 4);
    put(s, 2, 5, 4);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    const ev = run(s, 1);
    expect(eventsOf(ev, 'matchEnded')[0]!.result).toEqual({ kind: 'win', winnerId: 0 });
  });

  it('draws on timeout when several competitors are still alive (exactly two minutes)', () => {
    const s = sandbox();
    expect(s.config.match.durationTicks).toBe(7200);
    s.match.playTicks = s.config.match.durationTicks - 1;
    const ev = run(s, 1);
    expect(eventsOf(ev, 'matchEnded')[0]!.result).toEqual({ kind: 'draw', reason: 'timeout' });
  });

  it('freezes the result once ended', () => {
    const s = sandbox();
    put(s, 0, 14, 10);
    put(s, 1, 4, 4);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, triggered: true });
    run(s, 1);
    const result = s.match.result;
    put(s, 0, 4, 4);
    run(s, 40);
    expect(s.match.result).toEqual(result);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('runs a 3 second countdown-style start before play', () => {
    const s = createGame({
      seed: 2,
      players: [
        { name: 'a', characterId: 'streetBaller', isBot: false },
        { name: 'b', characterId: 'streetBaller', isBot: true },
      ],
    });
    expect(s.match.phase).toBe('countdown');
    const ev = run(s, s.config.match.countdownTicks);
    expect(s.match.phase).toBe('playing');
    expect(eventsOf(ev, 'matchStarted')).toHaveLength(1);
  });
});
