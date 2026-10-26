/**
 * Bots and the City Rumble radial blast (decisions RE-AI1..): the bots' danger map and placement analysis use
 * the simulation's own `radialFootprint`, so they understand that a diagonal neighbour is hit, that concrete and
 * crates cast a shadow, that a crate broken by an earlier blast no longer shields, and that two generators can
 * chain. Classic keeps the cross (its bot decisions are checked unchanged separately, see docs/RUMBLE_EVOLUTION.md).
 */
import { describe, expect, it } from 'vitest';
import { getBoard } from '../../src/ai/board';
import { createCtx } from '../../src/ai/context';
import { placementGain } from '../../src/ai/goals';
import { PROFILES } from '../../src/ai/profiles';
import {
  createRng,
  nextInt,
  observe,
  previewBlast,
  radialFootprint,
  radialOffsets,
  tick,
} from '../../src/sim';
import type { Difficulty, GameState } from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { addGenerator, addSoft, put, sandbox } from '../helpers';
import { makeBots, runBots } from './helpers';

const RADIAL = { generator: { blastMode: 'radial' as const, maxRange: 5 } };
const ALL: Difficulty[] = ['beginner', 'standard', 'expert'];

/** Danfo sandbox (15 x 11) with radial blasts; the bot is player 0, an idle rival is parked at (14, 0). */
function radialBoard(open = true, players = 2, maxSquare?: number): GameState {
  const config =
    maxSquare === undefined
      ? RADIAL
      : { generator: { ...RADIAL.generator, radialMaxSquareRadius: maxSquare } };
  const s = sandbox({ players, config });
  if (open) s.tiles = s.tiles.map(() => Tile.Empty);
  put(s, 1, 14, 0);
  return s;
}

/** Every tile concrete except the listed "x,y" tiles. */
function pocket(s: GameState, openTiles: string[]): void {
  s.tiles = s.tiles.map((_, i) =>
    openTiles.includes(`${i % s.width},${Math.floor(i / s.width)}`) ? Tile.Empty : Tile.Hard,
  );
}

function ctxFor(s: GameState, id: number, difficulty: Difficulty = 'expert') {
  const profile = PROFILES[difficulty];
  const c = createCtx(profile, createRng(1), getBoard(s.width, s.height));
  c.world.refresh(observe(s, id), profile);
  return c;
}

/** Tiles the bot's danger map marks lethal at any tick from now on. */
function dangerTiles(s: GameState, id = 0): Set<number> {
  const c = ctxFor(s, id);
  c.builder.build(c.danger, c.world, c.profile);
  const out = new Set<number>();
  for (let t = 0; t < s.width * s.height; t++) if (!c.danger.safeFrom(t, s.tick)) out.add(t);
  return out;
}

const key = (s: GameState, t: number): string => `${t % s.width},${Math.floor(t / s.width)}`;

describe('the danger map is the simulation footprint', () => {
  it('random boards: crates, Petrol, Hot Fuel, Square Blast and chains give exactly previewBlast', () => {
    const rng = createRng(77);
    for (let trial = 0; trial < 40; trial++) {
      // the square cap comes from the config (Rumble economy: 6), never a constant in the bots
      const s = radialBoard(false, 2, trial % 2 === 0 ? 4 : 6);
      // random crates over the pillar grid, players parked off the board's centre
      for (let t = 0; t < s.tiles.length; t++)
        if (s.tiles[t] === Tile.Empty && nextInt(rng, 100) < 35) s.tiles[t] = Tile.Soft;
      put(s, 0, 0, 0);
      s.tiles[0] = Tile.Empty;
      s.tiles[14] = Tile.Empty;
      const gens = 1 + nextInt(rng, 3);
      for (let k = 0; k < gens; k++) {
        const x = nextInt(rng, 15);
        const y = nextInt(rng, 11);
        if (s.tiles[y * 15 + x] !== Tile.Empty || s.generators.some((g) => g.x === x && g.y === y)) continue;
        // one explosion group (same timer): no crate is cleared between them, as in a single tick
        addGenerator(s, {
          ownerId: 0,
          x,
          y,
          timer: 30,
          range: 1 + nextInt(rng, 5),
          pierce: nextInt(rng, 3) === 0,
          square: nextInt(rng, 3) === 0 ? 1 + nextInt(rng, 3) : 0,
        });
      }
      const want = new Set<number>();
      for (const g of s.generators) for (const t of previewBlast(s, g)) want.add(t);
      expect([...dangerTiles(s)].map((t) => key(s, t)).sort()).toEqual(
        [...want].map((t) => key(s, t)).sort(),
      );
    }
  });

  it('a diagonal neighbour is lethal (the cross model left it safe)', () => {
    const s = radialBoard();
    put(s, 0, 2, 2);
    addGenerator(s, { ownerId: 1, x: 7, y: 5, timer: 60, range: 2 });
    const d = dangerTiles(s);
    expect(d.has(6 * 15 + 8)).toBe(true); // (8, 6)
    expect(d.has(7 * 15 + 8)).toBe(true); // (8, 7): (1, 2) is inside the radius-2 disc
    expect(d.has(7 * 15 + 9)).toBe(false); // (9, 7): (2, 2) is outside it
  });

  it('concrete casts a shadow; a crate broken by an earlier blast no longer shields a later one', () => {
    const s = radialBoard();
    put(s, 0, 0, 0);
    s.tiles[5 * 15 + 8] = Tile.Hard; // wall east of the generator
    addGenerator(s, { ownerId: 1, x: 7, y: 5, timer: 60, range: 3 });
    let d = dangerTiles(s);
    expect(d.has(5 * 15 + 9)).toBe(false); // straight behind the wall
    expect(d.has(6 * 15 + 9)).toBe(false); // its diagonal shadow
    expect(d.has(6 * 15 + 8)).toBe(true); // round the wall's side

    const t = radialBoard();
    put(t, 0, 0, 0);
    addSoft(t, 5, 5);
    addGenerator(t, { ownerId: 1, x: 3, y: 5, timer: 100, range: 3 });
    // the first blast (radius 1) breaks the crate at (5, 5) before the second goes off
    addGenerator(t, { ownerId: 1, x: 5, y: 4, timer: 30, range: 1 });
    d = dangerTiles(t);
    expect(d.has(5 * 15 + 6)).toBe(true); // (6, 5): behind the crate, reached once it is gone
    expect(radialFootprint(t, 3, 5, 3).some((p) => p.x === 6 && p.y === 5)).toBe(false); // today it is shielded
  });

  it('a generator set off by a rival blast is expected at the rival blast time (chain)', () => {
    const s = radialBoard();
    put(s, 0, 0, 0);
    addGenerator(s, { ownerId: 0, x: 7, y: 5, timer: 170, range: 2 });
    addGenerator(s, { ownerId: 1, x: 8, y: 6, timer: 30, range: 1 }); // diagonal: inside the rival's 3 x 3
    const c = ctxFor(s, 0);
    c.builder.build(c.danger, c.world, c.profile);
    // (5, 5) is only in MY generator's disc, which goes off with the rival's at tick + 30
    expect(c.danger.hit(5 * 15 + 5, s.tick + 25, s.tick + 40)).toBe(true);
  });
});

describe('bots escape radial blasts', () => {
  it.each(ALL)(
    '%s on open floor next to a ticking generator and a rival: no diagonal waiting, no own-disc death',
    (d) => {
      // the bot stands diagonal to a rival generator, the rival two diagonals away. The cross model calls the
      // bot's tile safe and its own attack on the rival escapable; in the radial world both are lethal mistakes.
      const s = radialBoard();
      put(s, 0, 8, 6);
      put(s, 1, 9, 7);
      const g = addGenerator(s, { ownerId: 1, x: 7, y: 5, timer: 60, range: 2 });
      expect(previewBlast(s, g).has(6 * 15 + 8)).toBe(true);
      runBots(s, makeBots({ 0: d }), 120);
      expect(s.players[0]!.alive).toBe(true);
    },
  );

  it.each(['standard', 'expert'] as const)(
    '%s hides in a wall shadow inside the disc when nothing else is in reach',
    (d) => {
      // a pocket in concrete: the generator at (7, 5), the bot diagonal at (8, 6); (8, 5) is a wall, so (9, 6)
      // sits in its shadow although it is inside the radius-3 disc. The corridor south leads to the rival but
      // stays inside the disc for three steps (21 ticks), too far before the blast; the cross calls it all safe.
      const s = radialBoard();
      pocket(s, ['7,5', '7,6', '8,6', '9,6', '8,7', '8,8', '8,9', '8,10']);
      put(s, 0, 8, 6);
      put(s, 1, 8, 10);
      const g = addGenerator(s, { ownerId: 1, x: 7, y: 5, timer: 18, range: 3 });
      const preview = previewBlast(s, g);
      expect(preview.has(6 * 15 + 8)).toBe(true);
      expect(preview.has(8 * 15 + 8)).toBe(true);
      expect(preview.has(6 * 15 + 9)).toBe(false);
      const bots = makeBots({ 0: d });
      const run = runBots(s, bots, 30, { until: (ev) => ev.some((e) => e.type === 'generatorExploded') });
      expect(run.events.some((e) => e.type === 'generatorExploded')).toBe(true);
      expect([s.players[0]!.x, s.players[0]!.y]).toEqual([9, 6]);
      runBots(s, bots, 40);
      expect(s.players[0]!.alive).toBe(true);
    },
  );

  it.each(ALL.flatMap((d) => [60, 90, 120, 150].map((t) => [d, t] as const)))(
    '%s never walks into a visible radial footprint on its way to a rival (blast in %i ticks)',
    (d, timer) => {
      // the rival waits on the far side of a radius-4 disc that goes off while the bot is on its way
      const s = radialBoard(false);
      put(s, 0, 0, 4);
      put(s, 1, 14, 4);
      const g = addGenerator(s, { ownerId: 1, x: 7, y: 4, timer, range: 4 });
      const footprint = previewBlast(s, g);
      const explodeAt = s.tick + timer;
      const bots = makeBots({ 0: d });
      let inside = 0;
      for (let i = 0; i < 260 && s.players[0]!.alive; i++) {
        const p = s.players[0]!;
        if (
          s.tick >= explodeAt - 2 &&
          s.tick <= explodeAt + s.config.generator.flameTicks &&
          footprint.has(p.y * 15 + p.x)
        )
          inside++;
        tick(s, { 0: bots[0]!.decide(observe(s, 0)) });
      }
      expect(s.players[0]!.alive).toBe(true);
      expect(inside).toBe(0);
      // ... and it did go after the rival rather than wait in its corner
      expect(s.players[0]!.x).toBeGreaterThanOrEqual(4);
    },
  );
});

describe('stage hazards and authored cover under radial blasts', () => {
  it.each(ALL)('%s leaves a row a telegraphed sweep will drive along, away from the radial disc', (d) => {
    // the bot at (7, 5) is just outside the radius-2 disc of (7, 2); a bus pull-out sweep is about to drive
    // along row 5. Most of row 4 near the generator is inside the disc (the cross calls (6, 4) / (8, 4) safe).
    const s = radialBoard();
    put(s, 0, 7, 5);
    put(s, 1, 14, 0);
    addGenerator(s, { ownerId: 1, x: 7, y: 2, timer: 75, range: 2 });
    s.stage.enabled = true;
    s.stage.events.push({
      id: 900,
      hazard: 0,
      kind: 'sweep',
      style: 'traffic',
      tiles: Array.from({ length: 15 }, (_, x) => 5 * 15 + x),
      dir: 'right',
      warnTick: s.tick,
      startTick: s.tick + 30,
      endTick: s.tick + 30 + 15 * 4,
      eventId: s.nextEventId++,
      index: -1,
      stepRemaining: 0,
      stepTicks: 4,
    });
    runBots(s, makeBots({ 0: d }), 140);
    expect(s.players[0]!.alive).toBe(true);
  });

  it.each(['standard', 'expert'] as const)(
    '%s blasts an authored barrier crate open to reach a rival behind it',
    (d) => {
      // two concrete rooms joined only through a barrier crate (layout 'x'): the rival waits in the far room
      const s = radialBoard();
      const room = (x0: number, x1: number): string[] =>
        Array.from(
          { length: (x1 - x0 + 1) * 3 },
          (_, i) => `${x0 + (i % (x1 - x0 + 1))},${4 + Math.floor(i / (x1 - x0 + 1))}`,
        );
      pocket(s, [...room(1, 5), '6,5', ...room(7, 13)]);
      addSoft(s, 6, 5);
      put(s, 0, 1, 5);
      put(s, 1, 13, 5);
      const run = runBots(s, makeBots({ 0: d }), 1200, { until: () => s.players[0]!.x >= 7 });
      expect(run.events.some((e) => e.type === 'blockDestroyed' && e.x === 6 && e.y === 5)).toBe(true);
      expect(s.players[0]!.alive).toBe(true);
      expect(s.players[0]!.x).toBeGreaterThanOrEqual(7);
    },
  );
});

describe('placement analysis', () => {
  it('Team Rumble with friendly fire: a teammate diagonal to the spot makes it a bad placement', () => {
    const s = sandbox({ players: 3, config: RADIAL });
    s.tiles = s.tiles.map(() => Tile.Empty);
    s.settings.friendlyFire = true;
    s.players[0]!.team = 0;
    s.players[1]!.team = 0;
    s.players[2]!.team = 1;
    put(s, 0, 3, 3);
    put(s, 1, 6, 6); // teammate diagonal to (5, 5)
    put(s, 2, 5, 7); // opponent two below (5, 5)
    const c = ctxFor(s, 0, 'standard');
    expect(placementGain(c, 5 * 15 + 5)).toBeLessThan(0);
    // without the teammate there the same spot is worth taking
    put(s, 1, 0, 10);
    const d = ctxFor(s, 0, 'standard');
    expect(placementGain(d, 5 * 15 + 5)).toBeGreaterThan(c.profile.placeMinGain);
  });

  it('a marked supply crate is worth more than a plain crate, and a bot breaks one open and takes the upgrade', () => {
    const s = radialBoard();
    put(s, 0, 2, 5);
    addSoft(s, 6, 5, 'socket');
    s.supplies.push(5 * 15 + 6);
    addSoft(s, 6, 1);
    const c = ctxFor(s, 0, 'standard');
    // (5, 5): the supply crate next door; (5, 1): the plain crate next door
    expect(placementGain(c, 5 * 15 + 5)).toBeGreaterThan(placementGain(c, 1 * 15 + 5));
    const before = s.players[0]!.capacity;
    runBots(s, makeBots({ 0: 'standard' }), 900, { until: () => s.players[0]!.capacity > before });
    expect(s.supplies).toHaveLength(0);
    expect(s.players[0]!.capacity).toBe(before + 1);
  });

  it('a bot with two generators can put both down (the second cuts a way out) and still gets clear', () => {
    const s = radialBoard(false);
    s.players[0]!.capacity = 2;
    put(s, 0, 0, 0);
    put(s, 1, 4, 0);
    const bots = makeBots({ 0: 'expert' });
    let maxOwn = 0;
    for (let i = 0; i < 400 && s.players[0]!.alive; i++) {
      tick(s, { 0: bots[0]!.decide(observe(s, 0)) });
      maxOwn = Math.max(maxOwn, s.generators.filter((g) => g.ownerId === 0).length);
    }
    expect(s.players[0]!.alive).toBe(true);
    expect(maxOwn).toBe(2);
  });
});

describe('radial footprint internals', () => {
  /** The Phase 0 implementation of radialFootprint, kept as the reference for the optimised one. */
  function reference(
    grid: GameState,
    cx: number,
    cy: number,
    radius: number,
    pierce: boolean,
    squareR: number,
    blocks: (x: number, y: number) => boolean,
  ) {
    const r = squareR > 0 ? squareR : radius;
    const size = 2 * r + 1;
    const pass = new Uint8Array(size * size);
    const at = (dx: number, dy: number): number => (dy + r) * size + (dx + r);
    pass[at(0, 0)] = 1;
    const tileAt = (x: number, y: number): number =>
      x < 0 || y < 0 || x >= grid.width || y >= grid.height ? Tile.Hard : grid.tiles[y * grid.width + x]!;
    const lineCost = (x: number, y: number): number => {
      const k = tileAt(x, y);
      if (k === Tile.Hard) return 99;
      if (k === Tile.Soft) return 1;
      return blocks(x, y) ? 99 : 0;
    };
    const out: { x: number; y: number }[] = [];
    for (const o of radialOffsets(r, squareR > 0)) {
      const x = cx + o.dx;
      const y = cy + o.dy;
      const kind = tileAt(x, y);
      if (kind === Tile.Hard) continue;
      const px = o.dx !== 0 ? pass[at(o.dx - Math.sign(o.dx), o.dy)]! : 0;
      const py = o.dy !== 0 ? pass[at(o.dx, o.dy - Math.sign(o.dy))]! : 0;
      const best = px === 1 || py === 1 ? 1 : px === 2 || py === 2 ? 2 : 0;
      if (best === 0) continue;
      let crates = 0;
      for (const [bx, by] of o.between) {
        crates += lineCost(cx + bx, cy + by);
        if (crates > (pierce ? 1 : 0)) break;
      }
      if (crates > (pierce ? 1 : 0)) continue;
      out.push({ x, y });
      if (kind === Tile.Empty && !blocks(x, y)) pass[at(o.dx, o.dy)] = best;
      else if (kind === Tile.Soft && pierce && best === 1 && !blocks(x, y)) pass[at(o.dx, o.dy)] = 2;
    }
    return out;
  }

  it('the compiled-table radialFootprint returns exactly the reference output (order included)', () => {
    const rng = createRng(5);
    for (let trial = 0; trial < 300; trial++) {
      const s = radialBoard(false);
      for (let t = 0; t < s.tiles.length; t++) {
        const roll = nextInt(rng, 100);
        if (s.tiles[t] === Tile.Empty && roll < 30) s.tiles[t] = Tile.Soft;
        else if (roll < 5) s.tiles[t] = Tile.Hard;
      }
      const gens = new Set<number>();
      for (let k = 0; k < 4; k++) gens.add(nextInt(rng, s.tiles.length));
      const blocks = (x: number, y: number): boolean => gens.has(y * s.width + x);
      const cx = nextInt(rng, 17) - 1; // edges and just off the board too
      const cy = nextInt(rng, 13) - 1;
      const radius = 1 + nextInt(rng, 5);
      const pierce = nextInt(rng, 2) === 0;
      const squareR = nextInt(rng, 3) === 0 ? radius + nextInt(rng, 2) : 0;
      expect(
        radialFootprint(s, cx, cy, radius, { pierce, squareRadius: squareR, blocksWave: blocks }),
      ).toEqual(reference(s, cx, cy, radius, pierce, squareR, blocks));
    }
  });
});
