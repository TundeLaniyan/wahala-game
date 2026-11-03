/**
 * Anti-snowball patch (decisions AS1-AS3): kill-earned power is a temporary life perk inside five slots, with the
 * range / generator / placement limits, and a death clears it. Real grant path (`grantRewards`) and real ticks.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim';
import type { GameKind, GameState, PickupKind, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { respawn } from '../src/sim/systems/respawn';
import { grantRewards, previewRewards } from '../src/sim/systems/rewards';
import { RUMBLE_FIXTURE, put, run } from './helpers';

function rumble(game: GameKind = 'survival', players = 4): GameState {
  const s = createGame({
    seed: 3,
    arenaId: RUMBLE_FIXTURE,
    settings: { game, stageHazards: false },
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3],
      isBot: false,
    })),
  });
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

/** One credited elimination by player 0, paid through the real path at the current tick. */
function kill(s: GameState, victim = 1): SimEvent[] {
  const p = s.players[0]!;
  p.stats.kills++;
  p.stats.streak++;
  const events: SimEvent[] = [
    {
      type: 'playerEliminated',
      playerId: victim,
      cause: { kind: 'flame', ownerId: 0, eventId: p.stats.kills },
      x: 0,
      y: 0,
      creditId: 0,
      assistIds: [],
    },
  ];
  grantRewards(s, events);
  return events;
}

/** Three open tiles side by side, away from the other fighters: where a placement scenario can play out. */
function openRow(s: GameState): { x: number; y: number } {
  for (let y = 2; y < s.height - 2; y++)
    for (let x = 2; x < s.width - 8; x++)
      if ([0, 1, 2, 3, 4, 5, 6].every((d) => s.tiles[y * s.width + x + d] === Tile.Empty)) return { x, y };
  throw new Error('no open row');
}

/** Fighter 0 on an open row, the others far away. */
function stage(s: GameState): void {
  const { x, y } = openRow(s);
  put(s, 0, x, y);
  s.players.slice(1).forEach((_, i) => put(s, i + 1, 0, 0));
}

const slots = (s: GameState): number => s.players[0]!.lifePerks.reduce((n, p) => n + p.slots, 0);
const LARGE: PickupKind[] = ['armour', 'okada', 'remote', 'square'];

describe('the perk limits', () => {
  it('five slots, a major perk (Armour, Okada, Remote) takes two, one perk per category', () => {
    const s = rumble();
    expect(s.config.rewards.perks).toMatchObject({ maxSlots: 5, majorSlots: 2 });
    const p = s.players[0]!;
    for (let k = 0; k < 14; k++) {
      kill(s);
      expect(slots(s), `kill ${k + 1}`).toBeLessThanOrEqual(5);
      const cats = p.lifePerks.map((x) => x.category);
      expect(new Set(cats).size, 'one perk per category').toBe(cats.length);
      for (const perk of p.lifePerks)
        expect(perk.slots).toBe(['armour', 'okada', 'remote'].includes(perk.kind) ? 2 : 1);
    }
  });

  it('Armour and the Okada never stand together (one shield)', () => {
    const s = rumble();
    const p = s.players[0]!;
    for (let k = 0; k < 14; k++) {
      kill(s);
      expect(p.armour > 0 && p.mounted, `kill ${k + 1}`).toBe(false);
    }
  });

  it('bomb range rises at most two steps above the base, and at most three generators are active', () => {
    const s = rumble();
    const p = s.players[0]!;
    for (let k = 0; k < 14; k++) kill(s);
    expect(p.range).toBeLessThanOrEqual(s.config.generator.baseRange + 2);
    expect(p.capacity).toBeLessThanOrEqual(3);
    expect(s.config.generator.maxCapacity).toBe(3);
  });

  it('a kill reward holds at most one large upgrade, and never a Remote Detonator with a Vehicle Voucher', () => {
    const s = rumble();
    const p = s.players[0]!;
    // every rung of the ladder, for fighters in several states
    for (let streak = 1; streak <= s.config.rewards.ladder.length + 4; streak++) {
      for (const state of [{}, { mounted: true }, { remote: true }, { armour: 1 }, { hasVoucher: true }]) {
        Object.assign(
          p,
          { mounted: false, remote: false, armour: 0, hasVoucher: false, lifePerks: [] },
          state,
        );
        p.stats.streak = streak - 1;
        const rung = previewRewards(s, p);
        expect(rung.filter((k) => LARGE.includes(k)).length, `rung ${streak}`).toBeLessThanOrEqual(1);
        expect(rung.includes('remote') && rung.includes('voucher'), `rung ${streak}`).toBe(false);
      }
    }
  });

  it('the shipped ladder never pays two large upgrades, or a Remote with a Voucher, in one rung even unfiltered', () => {
    const ladder = rumble().config.rewards.ladder;
    for (const [i, rung] of ladder.entries()) {
      expect(rung.filter((k) => LARGE.includes(k as PickupKind)).length, `rung ${i + 1}`).toBeLessThanOrEqual(
        1,
      );
      expect(rung.includes('remote') && rung.includes('voucher'), `rung ${i + 1}`).toBe(false);
    }
  });
});

describe('the 12 second life', () => {
  it('a kill-earned upgrade ends 12 s after the kill that granted it, undoing exactly what it gave', () => {
    const s = rumble();
    const p = s.players[0]!;
    const base = { range: p.range, capacity: p.capacity };
    expect(s.config.rewards.perks.lifeTicks).toBe(12 * 60);
    kill(s); // socket + petrol
    expect(p.capacity).toBe(base.capacity + 1);
    expect(p.range).toBe(base.range + 1);
    run(s, 12 * 60 - 2);
    expect(p.capacity).toBe(base.capacity + 1); // still there just before
    run(s, 4);
    expect(p.capacity).toBe(base.capacity);
    expect(p.range).toBe(base.range);
    expect(p.lifePerks).toHaveLength(0);
  });

  it('a new kill gives its own perks a fresh 12 s and leaves the rest of the inventory on its own clock', () => {
    const s = rumble();
    const p = s.players[0]!;
    kill(s); // rung 1: socket + petrol at t0
    const t0 = s.tick;
    const expiry = (kind: PickupKind): number => p.lifePerks.find((x) => x.kind === kind)!.expiresAt;
    expect(expiry('socket')).toBe(t0 + 12 * 60);
    run(s, 8 * 60);
    const t1 = s.tick;
    kill(s); // rung 2: a tool + speed
    expect(p.lifePerks.find((x) => x.category === 'tool')!.expiresAt).toBe(t1 + 12 * 60);
    expect(p.lifePerks.find((x) => x.category === 'speed')!.expiresAt).toBe(t1 + 12 * 60);
    expect(expiry('socket')).toBe(t0 + 12 * 60); // not refreshed by a kill that paid something else
    expect(expiry('petrol')).toBe(t0 + 12 * 60);
    // four seconds later the first pair is over, the second still has its eight
    run(s, 4 * 60 + 2);
    expect(p.capacity).toBe(s.config.generator.baseCapacity);
    expect(p.contact).not.toBeNull();
    expect(p.speedLevel).toBe(1);
  });

  it("a second step of the same perk moves that perk's expiry (both steps end together) and nothing else", () => {
    const s = rumble();
    const p = s.players[0]!;
    kill(s); // rung 1: socket + petrol at t0
    const t0 = s.tick;
    run(s, 5 * 60);
    const t1 = s.tick;
    p.stats.streak = 3; // rung 4: square + petrol
    kill(s);
    const range = p.lifePerks.find((x) => x.category === 'range')!;
    expect(range.level).toBe(2);
    expect(p.range).toBe(s.config.generator.baseRange + 2);
    expect(range.expiresAt).toBe(t1 + 12 * 60);
    expect(p.lifePerks.find((x) => x.category === 'capacity')!.expiresAt).toBe(t0 + 12 * 60);
    // the range perk (both steps) ends together, 12 s after the second kill
    run(s, 12 * 60 + 2);
    expect(p.range).toBe(s.config.generator.baseRange);
  });

  it('after the first perks end, the kills, deaths and assists on the scoreboard are untouched', () => {
    const s = rumble();
    const p = s.players[0]!;
    p.stats.deaths = 2;
    p.stats.assists = 3;
    kill(s);
    run(s, 13 * 60);
    expect(p.lifePerks).toHaveLength(0);
    expect(p.stats).toMatchObject({ kills: 1, deaths: 2, assists: 3 });
  });

  it('a death clears every life perk (respawn modes reset the numbers too)', () => {
    const s = rumble('deathmatch');
    const p = s.players[0]!;
    for (let k = 0; k < 4; k++) kill(s);
    expect(p.lifePerks.length).toBeGreaterThan(0);
    respawn(s, p, p.x, p.y);
    expect(p.lifePerks).toHaveLength(0);
    expect(p.capacity).toBe(s.config.generator.baseCapacity);
    expect(p.range).toBe(s.config.generator.baseRange);
    expect(p.armour).toBe(0);
    expect(p.mounted).toBe(false);
    expect(p.remote).toBe(false);
  });

  it('a spent Okada gives its slots back at once', () => {
    const s = rumble();
    const p = s.players[0]!;
    while (!p.mounted && p.stats.kills < 12) kill(s);
    expect(p.mounted).toBe(true);
    p.mounted = false; // the hit took it
    run(s, 1);
    expect(p.lifePerks.some((x) => x.kind === 'okada')).toBe(false);
  });

  it('when the Remote Detonator ends, generators still waiting for the trigger go off on an ordinary fuse', () => {
    const s = rumble();
    const p = s.players[0]!;
    stage(s);
    while (!p.remote && p.stats.kills < 12) kill(s);
    expect(p.remote).toBe(true);
    run(s, 1, { 0: { place: true } });
    const g = s.generators.find((o) => o.ownerId === 0)!;
    expect(g.mode).toBe('remote');
    run(s, 12 * 60 + 2);
    expect(p.remote).toBe(false);
    const left = s.generators.find((o) => o.id === g.id);
    if (left) expect(left.mode).toBe('timed'); // or it has already gone off
  });
});

describe('placement', () => {
  it('the remote detonator does not lift the generator cap: three remote generators are the most', () => {
    const s = rumble();
    const p = s.players[0]!;
    stage(s);
    p.remote = true;
    p.capacity = 3;
    const gap = s.config.generator.placeIntervalTicks;
    const mine = (): number => s.generators.filter((g) => g.ownerId === 0 && g.mode === 'remote').length;
    const { x, y } = p;
    for (let i = 0; i < 6; i++) {
      p.x = p.stepFromX = x + (i % 5);
      p.y = p.stepFromY = y;
      run(s, 1, { 0: { place: true } });
      run(s, gap, {});
    }
    expect(mine()).toBe(3);
  });

  it('a second generator inside the placement interval is refused; after it, accepted', () => {
    const s = rumble();
    const p = s.players[0]!;
    stage(s);
    const mine = (): number => s.generators.filter((g) => g.ownerId === 0).length;
    run(s, 1, { 0: { place: true } });
    expect(mine()).toBe(1);
    p.x = p.stepFromX = p.x + 1; // a different tile, straight away: the interval still holds
    run(s, 4, { 0: { place: true } });
    expect(mine()).toBe(1);
    run(s, s.config.generator.placeIntervalTicks);
    run(s, 1, { 0: { place: true } });
    expect(mine()).toBe(2);
  });

  it('Classic has no placement interval and keeps its caps', () => {
    const s = createGame({
      seed: 1,
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: true },
      ],
    });
    expect(s.config.generator.placeIntervalTicks).toBe(0);
    expect(s.config.generator.maxCapacity).toBe(6);
    expect(s.config.rewards.enabled).toBe(false);
  });
});
