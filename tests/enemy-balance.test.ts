/**
 * Campaign enemy attack balance (decision EA5, docs/CAMPAIGN_ATTACKS.md): readable and survivable, dangerous only as a
 * group, individually weaker than the player. Measured on the real simulation with the harness of
 * scripts/lib/enemyScene.ts (`npm run enemy-balance` prints the same tables).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DIR_VEC, DIRS, tick } from '../src/sim';
import type { Dir, EnemyKind, GameState, Intents, SimEvent } from '../src/sim';
import {
  DODGER,
  STILL,
  enemyScene,
  humanIntent,
  playDuelAgainstEnemy,
  playRaid,
} from '../scripts/lib/enemyScene';
import { eventsOf } from './helpers';

const CFG = DEFAULT_CONFIG.enemyAttacks;
const WALK = DEFAULT_CONFIG.movement.stepTicksBySpeedLevel[0]!; // ticks per tile for the slowest human

describe('limits written in the data', () => {
  it('every object is slower than a walking human, cues for at least minWarnTicks and is never a stun-lock', () => {
    for (const [name, p] of Object.entries(CFG.projectiles)) {
      expect(p.stepTicks, name).toBeGreaterThan(WALK);
      expect(p.warnTicks, name).toBeGreaterThanOrEqual(CFG.minWarnTicks);
      expect(p.cooldownTicks, name).toBeGreaterThanOrEqual(p.warnTicks + p.stepTicks * p.range);
      expect(p.damage, name).toBeLessThanOrEqual(1);
      // a common object harms little; only a strong one takes a whole segment AND cues longest
      if (!p.strong) expect(p.warnTicks, name).toBeLessThan(CFG.projectiles.tool.warnTicks);
      // a 20 ft wall of daze would make movement impossible: daze + the free window is the minimum gap between harm
      expect(p.dazeTicks, name).toBeLessThanOrEqual(CFG.victimFreeTicks);
    }
    // the free window lets a human walk several tiles between two enemy hits
    expect(CFG.victimFreeTicks / WALK).toBeGreaterThanOrEqual(5);
    expect(CFG.minWarnTicks / WALK).toBeGreaterThanOrEqual(3);
  });

  it("an enemy punch winds up far slower than the player's Punch, and no kind has an instant one", () => {
    const player = DEFAULT_CONFIG.skills.attacks.push.startupTicks;
    for (const [kind, m] of Object.entries(CFG.melee)) {
      if (!m) continue;
      const total = DEFAULT_CONFIG.skills.attacks[m.attack].startupTicks + m.extraStartupTicks;
      expect(total, kind).toBeGreaterThanOrEqual(player * 4);
      expect(m.damage, kind).toBeLessThanOrEqual(1);
      expect(m.cooldownTicks, kind).toBeGreaterThan(total);
    }
    expect(CFG.maxGroupPunches).toBeLessThanOrEqual(2);
  });
});

describe('no instant unavoidable kill', () => {
  /** Every thrower kind, from many tiles, in all four directions, at several distances: a human who reacts to the cue escapes. */
  function sweep(policy: 'dodge' | 'run'): { arrangements: number; hits: SimEvent[] } {
    const hits: SimEvent[] = [];
    let arrangements = 0;
    const kinds: EnemyKind[] = ['thrower', 'lieutenant', 'heavy', 'boss'];
    for (const kind of kinds) {
      for (let ty = 0; ty < 11; ty++) {
        for (let tx = 0; tx < 15; tx++) {
          if ((tx + ty * 2) % 4 !== 0) continue; // a spread of starting tiles
          for (const dir of DIRS) {
            for (const d of [2, 3, 5]) {
              const hx = tx + DIR_VEC[dir].dx * d;
              const hy = ty + DIR_VEC[dir].dy * d;
              const s = enemyScene({
                human: { x: hx, y: hy, hp: 99 },
                enemies: [{ kind, x: tx, y: ty }],
              });
              const t = s.players[1]!;
              if (!open(s, tx, ty) || !open(s, hx, hy)) continue;
              t.facing = dir;
              const first = tick(s, { 1: { special: true } });
              const launch = eventsOf(first, 'projectileLaunched')[0];
              if (!launch) continue; // no clear line in this arrangement: nothing is thrown
              if (policy === 'run' && !roomToRun(s, launch.path, dir)) continue;
              arrangements++;
              const total = launch.warnTicks + launch.path.length * launch.stepTicks + 40;
              for (let k = 0; k < total; k++) {
                const intents: Intents = {
                  0:
                    policy === 'dodge'
                      ? humanIntent(s, { reactTicks: 18, kiteDistance: 0 })
                      : runner(s, dir, launch.launchTick),
                };
                for (const e of tick(s, intents))
                  if (e.type === 'projectileHit' && e.victimId === 0) hits.push(e);
              }
            }
          }
        }
      }
    }
    return { arrangements, hits };
  }

  it('a human who steps out of the line (or away along it) after the cue is never hit, in every arrangement', () => {
    const r = sweep('dodge');
    expect(r.arrangements).toBeGreaterThan(300);
    expect(r.hits).toEqual([]);
  });

  it('a human who simply walks away along the line stays ahead of every object while there is room', () => {
    const r = sweep('run');
    expect(r.arrangements).toBeGreaterThan(100);
    expect(r.hits).toEqual([]);
  });

  it('a human who never moves is not defeated in the first seconds, whatever the squad (3 segments)', () => {
    const mixes: EnemyKind[][] = [
      ['agbero', 'agbero', 'guard', 'guard'],
      ['guard', 'guard', 'heavy', 'heavy'],
      ['heavy', 'lieutenant', 'guard', 'thrower'],
    ];
    let earliest = Infinity;
    for (const mix of mixes)
      for (const seed of [1, 2, 3]) {
        const r = playRaid({ enemies: mix, seed, humanHp: 3, policy: STILL, seconds: 30 });
        if (r.defeatedAt !== null) earliest = Math.min(earliest, r.defeatedAt / 60);
      }
    expect(earliest).toBeGreaterThanOrEqual(3.5); // measured about 4.7 s
  });
});

describe('1 human against 4 enemies for 60 seconds (decision EA5)', () => {
  const MIXES: { name: string; enemies: EnemyKind[] }[] = [
    { name: 'brawlers', enemies: ['agbero', 'agbero', 'guard', 'guard'] },
    { name: 'bruisers', enemies: ['guard', 'guard', 'heavy', 'heavy'] },
    { name: 'mixed', enemies: ['guard', 'thrower', 'thrower', 'heavy'] },
    { name: 'leaders', enemies: ['heavy', 'lieutenant', 'guard', 'thrower'] },
  ];

  it('a dodging human loses between 0.3 and 6 health segments a minute, and the group limits hold throughout', () => {
    // (three squads, two seeds each: `npm run enemy-balance` prints all five squads over more seeds)
    for (const mix of [MIXES[0]!, MIXES[2]!, MIXES[3]!]) {
      let damage = 0;
      const seeds = [1, 2];
      for (const seed of seeds) {
        const r = playRaid({ enemies: mix.enemies, seed, humanHp: 99, policy: DODGER });
        damage += r.damage;
        expect(r.maxLaunchesPerTick, mix.name).toBeLessThanOrEqual(1);
        expect(r.minLaunchGap, mix.name).toBeGreaterThanOrEqual(CFG.groupGapTicks);
        expect(r.maxInFlight, mix.name).toBeLessThanOrEqual(CFG.maxInFlightPerGroup);
      }
      const perMinute = damage / seeds.length;
      expect(perMinute, mix.name).toBeGreaterThanOrEqual(0.3);
      expect(perMinute, mix.name).toBeLessThanOrEqual(6);
    }
  }, 120_000);

  it('throwers alone are a nuisance (daze, no segments) and throw about once a second as a group', () => {
    const r = playRaid({
      enemies: ['thrower', 'thrower', 'thrower', 'thrower'],
      seed: 2,
      humanHp: 99,
      policy: DODGER,
    });
    expect(r.damage).toBe(0);
    expect(r.throws).toBeGreaterThan(20);
    expect(r.throws).toBeLessThanOrEqual(60);
  });

  it('is deterministic: the same seed gives the same raid', () => {
    const a = playRaid({ enemies: MIXES[2]!.enemies, seed: 5, humanHp: 99, seconds: 10 });
    const b = playRaid({ enemies: MIXES[2]!.enemies, seed: 5, humanHp: 99, seconds: 10 });
    expect({ ...a, events: 0 }).toEqual({ ...b, events: 0 });
  });
});

describe('individually weaker than the player', () => {
  it("the player's Punch beats every enemy kind with equal health, on average", () => {
    for (const kind of Object.keys(CFG.melee) as EnemyKind[]) {
      let wins = 0;
      let losses = 0;
      const n = 12;
      for (let i = 0; i < n; i++) {
        const r = playDuelAgainstEnemy(kind, i + 1, [1, 3, 5][i % 3]!);
        if (r.winner === 'player') wins++;
        if (r.winner === 'enemy') losses++;
      }
      expect(wins, kind).toBeGreaterThan(losses);
      expect(wins / n, kind).toBeGreaterThanOrEqual(0.7);
    }
  });
});

// ---------------------------------------------------------------- helpers

const open = (s: GameState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === 0;

/** The runner has room when the tile just past the end of the path is open floor (the object expires before it). */
function roomToRun(s: GameState, path: number[], dir: Dir): boolean {
  const last = path[path.length - 1]!;
  const x = (last % s.width) + DIR_VEC[dir].dx;
  const y = Math.floor(last / s.width) + DIR_VEC[dir].dy;
  return open(s, x, y) && s.tiles[last] === 0;
}

/** After the reaction time, walk away along the line of flight, one tile after another. */
function runner(s: GameState, dir: Dir, launchTick: number): Intents[number] {
  const me = s.players[0]!;
  if (s.tick - launchTick < 18 || me.stepRemaining > 1) return {};
  return open(s, me.x + DIR_VEC[dir].dx, me.y + DIR_VEC[dir].dy) ? { move: dir } : {};
}
