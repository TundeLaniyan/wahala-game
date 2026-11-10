/**
 * The City Rumble COMBAT TEST LAB (docs/COMBAT_TEST_LAB.md, decisions CL-L1..CL-L8) through the real tick: gating
 * (local City Rumble only), live switching, the four levels' real numbers and reach shapes (never through walls), kept
 * presses and visible misses, no stun-lock at the extreme level, B-hold remote detonation intact, determinism, bots.
 */
import { describe, expect, it } from 'vitest';
import { COMBAT_LAB_PRESETS, buildMissionGame, createGame, setCombatLabLevel, tick } from '../src/sim';
import type { CombatLabLevel, GameState, Intent, Intents, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { createBot } from '../src/ai';
import { observe } from '../src/sim';
import { hashOf } from './mission-helpers';

/** A local Survival match on Oshodi with two (human) fighters on a cleared 15 x 7 yard (x 4..18, y 36..42). */
function rumble(game: 'survival' | 'deathmatch' | 'team' = 'survival'): GameState {
  const s = createGame({
    seed: 11,
    arenaId: 'rumbleOshodi',
    players: [
      { name: 'A', characterId: 'streetBaller', isBot: false },
      { name: 'B', characterId: 'lekkiBoy', isBot: false },
    ],
    settings: { game, stageHazards: false },
  });
  for (let y = 36; y <= 42; y++)
    for (let x = 4; x <= 18; x++) {
      const i = y * s.width + x;
      s.tiles[i] = Tile.Empty;
      delete s.hidden[i];
      delete s.floorHazards[i];
    }
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  s.generators = [];
  place(s, 0, 10, 39, 'right');
  place(s, 1, 14, 41, 'left');
  for (const p of s.players) p.protectedUntil = 0;
  return s;
}

function place(
  s: GameState,
  id: number,
  x: number,
  y: number,
  facing: 'up' | 'down' | 'left' | 'right' = 'right',
) {
  const p = s.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
  p.facing = facing;
}

const wall = (s: GameState, x: number, y: number) => (s.tiles[y * s.width + x] = Tile.Hard);

function run(
  s: GameState,
  n: number,
  intents: (t: number) => Partial<Record<number, Intent>> = () => ({}),
): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < n; t++) out.push(...tick(s, intents(t) as Intents));
  return out;
}

/** One B press by seat 0 and enough ticks for the attack to resolve: did it connect with seat 1? */
function punchLands(s: GameState): boolean {
  const ev = run(s, 30, (t) => (t === 0 ? { 0: { special: true } } : {}));
  return ev.some((e) => e.type === 'attackResolved' && e.playerId === 0 && e.hit && e.targetId === 1);
}

describe('gating: local City Rumble only (CL-L1)', () => {
  it('a Rumble match has no lab until a level is picked; Classic, missions and raids never take one', () => {
    const r = rumble();
    expect('combatLab' in r.config).toBe(false);
    expect('combatLab' in r).toBe(false);
    for (const game of ['survival', 'deathmatch', 'team'] as const)
      expect(setCombatLabLevel(rumble(game), 3)).toBe(true);
    const classic = createGame({
      seed: 1,
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
    });
    expect(setCombatLabLevel(classic, 4)).toBe(false);
    expect('combatLab' in classic.config).toBe(false);
    const field = createGame(
      buildMissionGame({
        spec: { id: 'oshodi', fieldId: 'oshodi.approach' },
        humanCharacter: 'streetBaller',
        seed: 1,
      }),
    );
    expect(setCombatLabLevel(field, 4)).toBe(false);
    expect(field.config.combatPilot).toBeDefined(); // the Oshodi pilot is still its own thing
  });
});

describe('live switching and the four levels (CL-L2)', () => {
  it('each level changes the real attack numbers; off restores the match’s own exactly', () => {
    const s = rumble();
    const base = structuredClone(s.config.skills.attacks);
    const push: Record<number, [number, number, number]> = {};
    for (const level of [1, 2, 3, 4] as CombatLabLevel[]) {
      expect(setCombatLabLevel(s, level)).toBe(true);
      expect(s.config.combatLab?.level).toBe(level);
      const a = s.config.skills.attacks.push;
      push[level] = [a.startupTicks, a.hitRecoveryTicks, a.targetLockoutTicks];
      // never slower than the match's own; daze, displacement and immunity untouched (fighter identity, no stun-lock)
      for (const kind of ['push', 'shove', 'daze'] as const) {
        const now = s.config.skills.attacks[kind];
        expect(now.startupTicks).toBeLessThanOrEqual(base[kind].startupTicks);
        expect(now.hitRecoveryTicks).toBeLessThanOrEqual(base[kind].hitRecoveryTicks);
        expect(now.dazeTicks).toBe(base[kind].dazeTicks);
        expect(now.dazeImmunityTicks).toBe(base[kind].dazeImmunityTicks);
        expect(now.displacementTiles).toBe(base[kind].displacementTiles);
      }
    }
    // the push's startup / hit recovery / lockout at levels 1-4 (the founder-visible differences)
    expect(push).toEqual({ 1: [4, 36, 144], 2: [3, 24, 108], 3: [2, 15, 72], 4: [2, 10, 36] });
    expect(setCombatLabLevel(s, 0)).toBe(true);
    expect(s.config.skills.attacks).toEqual(base);
    expect('combatLab' in s.config).toBe(false);
  });

  it('switching mid-match takes effect on the next press, with no restart', () => {
    const s = rumble();
    place(s, 1, 11, 38); // the forward-right corner of a fighter at (10, 39) facing right
    setCombatLabLevel(s, 1);
    expect(punchLands(s)).toBe(false); // level 1: the four neighbours only
    run(s, 120);
    setCombatLabLevel(s, 2);
    expect(punchLands(s)).toBe(true); // level 2 reaches the forward corners
    expect(s.match.phase).toBe('playing');
  });
});

describe('reach shapes, never through walls (CL-L3)', () => {
  const at = (level: CombatLabLevel, x: number, y: number, walls: [number, number][] = []): boolean => {
    const s = rumble();
    setCombatLabLevel(s, level);
    for (const [wx, wy] of walls) wall(s, wx, wy);
    place(s, 1, x, y);
    return punchLands(s);
  };
  it('level 1: neighbours only; level 2: + forward corners; level 3: + two ahead; level 4: + two ahead, one aside', () => {
    expect([1, 2, 3, 4].map((l) => at(l as CombatLabLevel, 11, 39))).toEqual([true, true, true, true]);
    expect([1, 2, 3, 4].map((l) => at(l as CombatLabLevel, 11, 40))).toEqual([false, true, true, true]);
    expect([1, 2, 3, 4].map((l) => at(l as CombatLabLevel, 12, 39))).toEqual([false, false, true, true]);
    expect([1, 2, 3, 4].map((l) => at(l as CombatLabLevel, 12, 40))).toEqual([false, false, false, true]);
    expect([1, 2, 3, 4].map((l) => at(l as CombatLabLevel, 13, 39))).toEqual([false, false, false, false]);
  });
  it('a wall between blocks the two-tile reach; a corner squeezed between two walls is out of reach', () => {
    expect(at(3, 12, 39, [[11, 39]])).toBe(false);
    expect(at(4, 12, 40, [[11, 39]])).toBe(true); // round the wall through (11, 40)
    expect(
      at(4, 12, 40, [
        [11, 39],
        [11, 40],
      ]),
    ).toBe(false);
    expect(
      at(2, 11, 40, [
        [11, 39],
        [10, 40],
      ]),
    ).toBe(false);
    expect(at(2, 11, 40, [[11, 39]])).toBe(true); // one open side tile is enough
  });
  it('aim help turns the fighter to a rival on another side (levels 2-4), level 1 only to a neighbour', () => {
    expect(at(1, 9, 38)).toBe(false); // behind-left corner
    expect(at(2, 9, 38)).toBe(true);
    const s = rumble();
    setCombatLabLevel(s, 3);
    place(s, 1, 10, 37); // two above: reached by turning up
    expect(punchLands(s)).toBe(true);
    expect(s.players[0]!.facing).toBe('up');
  });
});

describe('presses are kept, misses are shown (CL-L4, CL-L5)', () => {
  it('nobody in reach: a swing at the air that takes nothing (every level)', () => {
    for (const level of [1, 2, 3, 4] as CombatLabLevel[]) {
      const s = rumble();
      setCombatLabLevel(s, level);
      const ev = run(s, 40, (t) => (t === 0 ? { 0: { special: true } } : {}));
      expect(ev.filter((e) => e.type === 'punchSwing' && e.playerId === 0)).toHaveLength(1);
      expect(ev.find((e) => e.type === 'attackResolved' && e.playerId === 0)).toMatchObject({ hit: false });
      expect(s.combatLab!.stats[0]).toMatchObject({ presses: 1, airSwings: 1, whiffs: 1, hits: 0 });
    }
  });
  it('a press during recovery is kept and lands; one far too early is counted as dropped', () => {
    const s = rumble();
    setCombatLabLevel(s, 4);
    place(s, 1, 11, 39);
    // press, then press again 4 ticks later (inside the recovery): the second runs as soon as recovery ends
    const ev = run(s, 60, (t) => (t === 0 || t === 4 ? { 0: { special: true } } : {}));
    expect(ev.filter((e) => e.type === 'punchSwing' && e.playerId === 0).length).toBe(2);
    expect(s.combatLab!.stats[0]!.kept).toBe(1);
    // level 1: a press right after a hit waits up to 10 ticks; the push's 36-tick recovery outlasts it
    const t = rumble();
    setCombatLabLevel(t, 1);
    place(t, 1, 11, 39);
    run(t, 80, (k) => (k === 0 || k === 6 ? { 0: { special: true } } : {}));
    expect(t.combatLab!.stats[0]).toMatchObject({ presses: 2, dropped: 1 });
  });
});

describe('no stun-lock, no infinite loops (CL-L6)', () => {
  it('level 4, B mashed every tick for 10 s: the victim is free most of the time, every hit has a cause', () => {
    const s = rumble();
    setCombatLabLevel(s, 4);
    place(s, 1, 11, 39);
    let dazed = 0;
    const ev = run(s, 600, () => {
      if (s.tick < s.players[1]!.dazedUntil) dazed++;
      return { 0: { special: true } };
    });
    const hits = ev.filter((e) => e.type === 'attackResolved' && e.playerId === 0 && e.hit).length;
    expect(hits).toBeGreaterThan(3);
    expect(hits).toBeLessThan(60); // bounded by the lockout and the victim's daze immunity, not the press rate
    expect(dazed / 600).toBeLessThan(0.5);
  });
});

describe('B hold is still the Remote Detonator (CL-L7)', () => {
  it('with the lab on, a detonate intent sets off the remote generator', () => {
    const s = rumble();
    setCombatLabLevel(s, 4);
    const me = s.players[0]!;
    me.remote = true;
    run(s, 2, (t) => (t === 0 ? { 0: { place: true } } : {}));
    expect(s.generators.some((g) => g.ownerId === 0 && g.mode === 'remote')).toBe(true);
    place(s, 0, 15, 37);
    const ev = run(s, 3, (t) => (t === 0 ? { 0: { detonate: true } } : {}));
    expect(ev.some((e) => e.type === 'generatorExploded')).toBe(true);
  });
});

describe('determinism and bots (CL-L8)', () => {
  it('the same presses and switches give the same state', () => {
    const play = (): string => {
      const s = rumble();
      setCombatLabLevel(s, 2);
      place(s, 1, 11, 39);
      run(s, 200, (t) => ({
        0: t % 7 === 0 ? { special: true } : {},
        1: t % 11 === 0 ? { special: true } : {},
      }));
      setCombatLabLevel(s, 4);
      run(s, 200, (t) => ({
        0: t % 5 === 0 ? { special: true } : {},
        1: { move: t % 40 < 20 ? 'left' : 'right' },
      }));
      return hashOf(s);
    };
    expect(play()).toBe(play());
  });
  it('a bot-only Survival match runs at every level, and bots throw the lab punch too', () => {
    for (const level of [1, 2, 3, 4] as CombatLabLevel[]) {
      const s = createGame({
        seed: 5,
        arenaId: 'rumbleOshodi',
        players: Array.from({ length: 6 }, (_, i) => ({
          name: `R${i}`,
          characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
          isBot: true,
        })),
        settings: { game: 'survival', durationSec: 300 },
      });
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
      setCombatLabLevel(s, level);
      const bots = s.players.map((p) =>
        createBot({ difficulty: 'standard', seed: 9 + p.id, playerId: p.id }),
      );
      for (let t = 0; t < 1200 && s.match.phase === 'playing'; t++) {
        const intents: Intents = {};
        for (const p of s.players) if (p.alive) intents[p.id] = bots[p.id]!.decide(observe(s, p.id));
        tick(s, intents);
      }
      expect(s.config.combatLab?.level).toBe(level);
      expect(COMBAT_LAB_PRESETS[level].name.length).toBeGreaterThan(0);
    }
  });
});
