/**
 * V2 workstream C, AI side: bots see Square Blast footprints in their danger map (the simulation's own
 * squareFootprint), value square placements, discount protected rivals, and a 32-bot City Rumble
 * survival match reaches a result with the top eliminators clearly stronger than the low scorers.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { PROFILES } from '../src/ai/profiles';
import { createCtx } from '../src/ai/context';
import { getBoard } from '../src/ai/board';
import { placementGain, rewardDrive } from '../src/ai/goals';
import { createGame, createRng, observe, tick } from '../src/sim';
import type { GameState, Intents } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addGenerator, addSoft, put, sandbox } from './helpers';

function open(): GameState {
  const s = sandbox({ players: 2 });
  s.tiles = s.tiles.map(() => Tile.Empty);
  return s;
}

function ctxFor(s: GameState, id: number, difficulty: 'standard' | 'expert' = 'standard') {
  const profile = PROFILES[difficulty];
  const c = createCtx(profile, createRng(1), getBoard(s.width, s.height));
  c.world.refresh(observe(s, id), profile);
  return c;
}

describe('AI and Square Blast', () => {
  it('the danger map covers the square footprint, which a plus-only map would miss', () => {
    const s = open();
    put(s, 0, 9, 6);
    put(s, 1, 14, 0);
    const g = addGenerator(s, { ownerId: 1, x: 6, y: 5, timer: 40, square: 1 });
    const c = ctxFor(s, 0);
    c.builder.build(c.danger, c.world, c.profile);
    const diag = 6 * s.width + 7;
    expect(c.danger.hit(diag, s.tick, s.tick + 60)).toBe(true);
    g.square = 0;
    c.builder.build(c.danger, c.world, c.profile);
    expect(c.danger.hit(diag, s.tick, s.tick + 60)).toBe(false);
  });

  /**
   * A pocket of open tiles in concrete: the generator at (6,5), the bot in its down arm at (6,6). The
   * nearest refuges by the plus rule are the diagonals (5,6) / (7,6); with a Square Blast only the
   * corridor (6,8) and beyond is safe.
   */
  function pocket(square: number): GameState {
    const s = sandbox({ players: 2 });
    const openTiles = ['6,5', '6,6', '5,6', '7,6', '6,7', '6,8', '6,9', '5,9', '4,9', '14,0'];
    s.tiles = s.tiles.map((_, i) => (openTiles.includes(`${i % s.width},${Math.floor(i / s.width)}`) ? Tile.Empty : Tile.Hard));
    put(s, 0, 6, 6);
    put(s, 1, 14, 0);
    addGenerator(s, { ownerId: 1, x: 6, y: 5, timer: 45, square });
    return s;
  }

  function whereAtBlast(s: GameState): string {
    const bot = createBot({ difficulty: 'standard', seed: 3, playerId: 0 });
    let at = '';
    for (let i = 0; i < 120 && s.players[0]!.alive; i++) {
      const ev = tick(s, { 0: bot.decide(observe(s, 0)) });
      if (ev.some((e) => e.type === 'generatorExploded')) at = `${s.players[0]!.x},${s.players[0]!.y}`;
    }
    return at;
  }

  it('avoids a square blast it would have walked into with plus-only logic', () => {
    // plus rule: the bot's natural refuge is a diagonal tile next to the generator
    expect(['5,6', '7,6']).toContain(whereAtBlast(pocket(0)));
    // Square Blast: the same bot takes the corridor instead and survives
    const s = pocket(1);
    const at = whereAtBlast(s);
    expect(['5,6', '7,6', '6,6', '6,7']).not.toContain(at);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('a bot standing on a square diagonal gets out before the blast', () => {
    const s = open();
    put(s, 0, 7, 6);
    put(s, 1, 14, 0);
    addGenerator(s, { ownerId: 1, x: 6, y: 5, timer: 50, square: 1 });
    const bot = createBot({ difficulty: 'standard', seed: 5, playerId: 0 });
    for (let i = 0; i < 90; i++) tick(s, { 0: bot.decide(observe(s, 0)) });
    expect(s.players[0]!.alive).toBe(true);
  });

  it('values a Square Blast placement for the crates it reaches diagonally', () => {
    const s = sandbox({ players: 2 });
    put(s, 0, 4, 2);
    put(s, 1, 14, 10);
    // corridor tile (3,4) between the pillars (3,3) / (3,5): its 3 x 3 diagonals are open floor
    addSoft(s, 2, 3);
    addSoft(s, 4, 5);
    const tile = 4 * s.width + 3;
    const plain = placementGain(ctxFor(s, 0), tile);
    s.players[0]!.squareTier = 1;
    const withSquare = placementGain(ctxFor(s, 0), tile);
    expect(withSquare).toBeGreaterThan(plain);
  });
});

describe('AI and protection / rewards', () => {
  it('discounts a rival by its protection layers when valuing a hit', () => {
    const s = open();
    put(s, 0, 2, 2);
    put(s, 1, 6, 5);
    const tile = 5 * s.width + 4;
    const bare = placementGain(ctxFor(s, 0), tile);
    s.players[1]!.mounted = true;
    const okada = placementGain(ctxFor(s, 0), tile);
    s.players[1]!.armour = 2;
    const tank = placementGain(ctxFor(s, 0), tile);
    expect(bare).toBeGreaterThan(okada);
    expect(okada).toBeGreaterThan(tank);
  });

  it('hunts harder in City Rumble the richer the next reward, and not at all differently in Classic', () => {
    const s = open();
    put(s, 0, 2, 2);
    put(s, 1, 12, 8);
    expect(rewardDrive(ctxFor(s, 0))).toBe(1);
    s.config.rewards.enabled = true;
    const first = rewardDrive(ctxFor(s, 0));
    expect(first).toBeGreaterThan(1);
    s.players[0]!.armour = 2;
    expect(rewardDrive(ctxFor(s, 0))).toBeGreaterThan(first);
  });
});

describe('City Rumble survival, 32 bots', () => {
  it('reaches a result in bounded time and the top eliminators end clearly stronger', () => {
    const outcomes: { ended: boolean; topPower: number; lowPower: number }[] = [];
    for (const seed of [1, 2]) {
      const state = createGame({
        seed,
        arenaId: 'cityRumble',
        settings: { game: 'survival' },
        players: Array.from({ length: 32 }, (_, i) => ({
          name: `b${i}`,
          characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3],
          isBot: true,
          difficulty: 'standard' as const,
        })),
      });
      const bots = state.players.map((_, i) => createBot({ difficulty: 'standard', seed: seed * 7919 + i * 104729 + 17, playerId: i }));
      const cap = state.config.match.countdownTicks + state.config.match.durationTicks + 120;
      const intents: Intents = {};
      while (state.match.phase !== 'ended' && state.tick < cap) {
        for (let i = 0; i < 32; i++) {
          if (state.players[i]!.alive) intents[i] = bots[i]!.decide(observe(state, i));
          else delete intents[i];
        }
        tick(state, intents);
      }
      const power = (p: (typeof state.players)[number]): number =>
        p.capacity + p.range + p.squareTier * 2 + p.armour * 2 + (p.mounted ? 2 : 0) + p.speedLevel;
      const byKills = [...state.players].sort((a, b) => b.stats.kills - a.stats.kills || a.id - b.id);
      // the best eliminator versus the median fighter
      outcomes.push({
        ended: state.match.phase === 'ended' && state.match.result !== null,
        topPower: power(byKills[0]!),
        lowPower: power(byKills[16]!),
      });
      expect(byKills[0]!.stats.kills).toBeGreaterThanOrEqual(3);
      // every credited elimination is a real death: kills never exceed deaths
      const kills = state.players.reduce((n, p) => n + p.stats.kills, 0);
      const deaths = state.players.reduce((n, p) => n + p.stats.deaths, 0);
      expect(kills).toBeLessThanOrEqual(deaths);
    }
    for (const o of outcomes) {
      expect(o.ended).toBe(true);
      expect(o.topPower).toBeGreaterThan(o.lowPower + 5);
    }
  }, 120_000);
});
