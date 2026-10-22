import { describe, expect, it } from 'vitest';
import { createGame, tick, tileAt, Tile } from '../src/sim';
import { addGenerator, eventsOf, put, run, sandbox } from './helpers';

const duo = [
  { name: 'a', characterId: 'streetBaller' as const, isBot: false },
  { name: 'b', characterId: 'lekkiBoy' as const, isBot: true },
];

describe('Wahala Crush', () => {
  it('closes the arena inward with telegraphed, permanent concrete', () => {
    const s = createGame({ seed: 1, players: duo, settings: { mode: 'crush' } });
    s.match.phase = 'playing';
    s.match.playTicks = s.crush!.warnAt[0]!;
    const ev = run(s, s.config.crush.warnTicks + 5);
    const warn = eventsOf(ev, 'crushWarning')[0]!;
    const land = eventsOf(ev, 'crushLanded')[0]!;
    expect([warn.x, warn.y]).toEqual([land.x, land.y]);
    expect(land.x === 0 || land.y === 0).toBe(true); // outer ring first
    expect(tileAt(s, land.x, land.y)).toBe(Tile.Hard);
  });

  it('eliminates a player caught under a landing block; simultaneous wipe is a draw', () => {
    const s = createGame({ seed: 1, players: duo, settings: { mode: 'crush' } });
    s.match.phase = 'playing';
    s.crush!.pending.push({ index: 0 * s.width + 0, landTick: s.tick + 2 });
    s.crush!.pending.push({ index: 0 * s.width + 14, landTick: s.tick + 2 });
    s.crush!.nextAtTick = 1e9;
    put(s, 0, 0, 0);
    put(s, 1, 14, 0);
    const ev = run(s, 3);
    expect(s.players.every((p) => !p.alive)).toBe(true);
    expect(eventsOf(ev, 'matchEnded')[0]!.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it('an Okada rider caught under a block is shoved to a free tile instead', () => {
    const s = createGame({ seed: 1, players: duo, settings: { mode: 'crush' } });
    s.match.phase = 'playing';
    s.crush!.nextAtTick = 1e9;
    s.crush!.pending.push({ index: 0, landTick: s.tick + 1 });
    put(s, 0, 0, 0);
    s.players[0]!.mounted = true;
    run(s, 2);
    expect(s.players[0]!.alive).toBe(true);
    expect(s.players[0]!.mounted).toBe(false);
    expect(tileAt(s, s.players[0]!.x, s.players[0]!.y)).toBe(Tile.Empty);
  });
});

describe('spectator throws', () => {
  it('telegraphs a throw first, then a bottle dazes without killing', () => {
    const s = createGame({ seed: 5, players: duo, settings: { crowdThrows: true } });
    s.match.phase = 'playing';
    s.match.playTicks = s.config.crowd.firstThrowTicks;
    s.config.crowd.firecrackerChance = 0;
    const ev = run(s, s.config.crowd.warnTicks + 2);
    const warn = eventsOf(ev, 'crowdWarning')[0]!;
    expect(warn.kind).toBe('bottle');
    expect(eventsOf(ev, 'crowdLanded')).toHaveLength(1);
    expect(s.players.every((p) => p.alive)).toBe(true);
  });

  it('a firecracker is lethal on its tile, can be dodged during the warning, and is absorbed by Okada', () => {
    const s = createGame({ seed: 5, players: duo, settings: { crowdThrows: true } });
    s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    s.match.phase = 'playing';
    s.match.playTicks = s.config.crowd.firstThrowTicks;
    s.config.crowd.firecrackerChance = 1;
    put(s, 0, 4, 4);
    put(s, 1, 4, 4);
    const warn = run(s, 1).flatMap((e) => (e.type === 'crowdWarning' ? [e] : []))[0]!;
    // the targeted player simply walks away before it lands
    const target = [0, 1].find((i) => s.players[i]!.x === warn.x && s.players[i]!.y === warn.y)!;
    put(s, target, 8, 8);
    s.players[1 - target]!.mounted = true;
    run(s, s.config.crowd.warnTicks + 1);
    expect(s.players[target]!.alive).toBe(true);
    expect(s.players[1 - target]!.alive).toBe(true);
    expect(s.players[1 - target]!.mounted).toBe(false);
  });
});

describe('floor hazards (trap arena)', () => {
  const trap = () => {
    const s = createGame({
      seed: 1,
      arenaId: 'lekkiRoadworks',
      players: duo,
      settings: { floorHazards: true },
    });
    s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    s.match.phase = 'playing';
    return s;
  };

  it('only exists when the option is on', () => {
    const on = createGame({
      seed: 1,
      arenaId: 'lekkiRoadworks',
      players: duo,
      settings: { floorHazards: true },
    });
    const off = createGame({ seed: 1, arenaId: 'lekkiRoadworks', players: duo });
    expect(Object.keys(on.floorHazards).length).toBeGreaterThan(0);
    expect(Object.keys(off.floorHazards)).toHaveLength(0);
    const plain = createGame({ seed: 1, players: duo, settings: { floorHazards: true } });
    expect(Object.keys(plain.floorHazards)).toHaveLength(0); // standard arena has no traps
  });

  it('a pothole makes a player stumble', () => {
    const s = trap();
    const pothole = Number(Object.keys(s.floorHazards).find((k) => s.floorHazards[Number(k)] === 'pothole'));
    const px = pothole % s.width;
    const py = Math.floor(pothole / s.width);
    put(s, 0, px - 1, py);
    const ev = run(s, 1, { 0: { move: 'right' } });
    expect(eventsOf(ev, 'hazardTriggered')[0]!.kind).toBe('pothole');
    expect(s.players[0]!.dazedUntil).toBeGreaterThan(s.tick + s.players[0]!.stepTotal);
  });

  it('oil slides a player a fixed number of extra tiles', () => {
    const s = trap();
    // (2,5) is oil: approach along the clear column x=2 from above
    expect(s.floorHazards[5 * s.width + 2]).toBe('oil');
    put(s, 0, 2, 4);
    run(s, 1, { 0: { move: 'down' } });
    expect(s.players[0]!.slide).not.toBeNull();
    run(s, 40);
    expect(s.players[0]!.y).toBe(5 + s.config.hazards.oilSlideTiles);
    expect(tick(s, {})).toBeDefined();
  });
});

describe('generators and hazards stay consistent', () => {
  it('a Crush landing removes a generator without exploding it', () => {
    const s = sandbox();
    s.crush = {
      order: [],
      next: 0,
      warnAt: [],
      nextAtTick: 1e9,
      pending: [{ index: 4 * s.width + 4, landTick: s.tick + 1 }],
    };
    put(s, 0, 14, 10);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, timer: 9999 });
    const ev = run(s, 2);
    expect(s.generators).toHaveLength(0);
    expect(eventsOf(ev, 'generatorExploded')).toHaveLength(0);
  });
});
