/**
 * Combat test lab: hit confirmation and preset identity (decision CL-L9, docs/COMBAT_TEST_LAB.md). Pure presentation
 * data (swing / impact looks, audio cues, the menu's plain-words text) plus the guarantees that this change touched no
 * rule: the preset table and the attack numbers are as documented, and campaign missions, raids and enemy seats are
 * untouched while the lab is off.
 */
import { describe, expect, it } from 'vitest';
import {
  COMBAT_LAB_PRESETS,
  DEFAULT_CONFIG,
  buildMissionGame,
  createGame,
  setCombatLabLevel,
  tick,
} from '../src/sim';
import type { CombatLabLevel, GameState, Intents, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { LAB_COLORS, WHIFF_COLOR, impactLook, swingLook, whiffLook } from '../src/render/combatLabLook';
import { labHitCue, labMissCue } from '../src/audio/combatLabCue';
import { labChangeLines, labChangeText, labChipDetail, reachWords } from '../src/app/combatLabText';
import { enemyScene } from '../scripts/lib/enemyScene';
import { newRaid } from './raid-helpers';
import { hashOf } from './mission-helpers';

const LEVELS: CombatLabLevel[] = [1, 2, 3, 4];

describe('the preset data and the real attack numbers are unchanged', () => {
  it('Off / 1 / 2 / 3 / 4 keep the documented table (no preset was retuned, renamed or reordered)', () => {
    expect(Object.keys(COMBAT_LAB_PRESETS)).toEqual(['1', '2', '3', '4']);
    expect(LEVELS.map((l) => COMBAT_LAB_PRESETS[l].name)).toEqual([
      'Classic+',
      'Balanced',
      'Arcade',
      'Maximum Punch',
    ]);
    const flat = (l: CombatLabLevel) => {
      const p = COMBAT_LAB_PRESETS[l];
      return [
        p.startupScale,
        p.maxStartupTicks,
        p.recoveryScale,
        p.minRecoveryTicks,
        p.maxRecoveryTicks,
        p.lockoutScale,
        p.maxLockoutTicks,
        p.forwardDiagonals,
        p.reachTwo,
        p.reachTwoWide,
        p.autoTarget,
        p.bufferTicks,
        p.airSwing,
        p.feedback,
      ];
    };
    expect(flat(1)).toEqual([1, 18, 0.6, 8, 150, 0.8, 192, false, false, false, false, 10, true, 1]);
    expect(flat(2)).toEqual([0.8, 14, 0.4, 8, 90, 0.6, 144, true, false, false, true, 12, true, 1]);
    expect(flat(3)).toEqual([0.6, 8, 0.25, 8, 45, 0.4, 80, true, true, false, true, 15, true, 2]);
    expect(flat(4)).toEqual([0.5, 4, 0.1, 10, 14, 0.2, 40, true, true, true, true, 15, true, 2]);
  });

  it('each fighter attack has the documented startup / recovery / lockout at every level', () => {
    const s = createGame({
      seed: 1,
      arenaId: 'rumbleOshodi',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
      settings: { game: 'survival', stageHazards: false },
    });
    const row = (kind: 'push' | 'shove' | 'daze') => {
      const a = s.config.skills.attacks[kind];
      return [a.startupTicks, a.whiffRecoveryTicks, a.hitRecoveryTicks, a.targetLockoutTicks];
    };
    const table = (): Record<string, number[]> => ({
      push: row('push'),
      shove: row('shove'),
      daze: row('daze'),
    });
    expect(table()).toEqual({ push: [4, 12, 60, 180], shove: [12, 36, 120, 180], daze: [18, 30, 240, 240] });
    const expected: Record<number, Record<string, number[]>> = {
      1: { push: [4, 8, 36, 144], shove: [12, 22, 72, 144], daze: [18, 18, 144, 192] },
      2: { push: [3, 8, 24, 108], shove: [10, 14, 48, 108], daze: [14, 12, 90, 144] },
      3: { push: [2, 8, 15, 72], shove: [7, 9, 30, 72], daze: [8, 8, 45, 80] },
      4: { push: [2, 10, 10, 36], shove: [4, 10, 12, 36], daze: [4, 10, 14, 40] },
    };
    for (const l of LEVELS) {
      setCombatLabLevel(s, l);
      expect(table()).toEqual(expected[l]);
    }
    setCombatLabLevel(s, 0);
    expect(table()).toEqual({ push: [4, 12, 60, 180], shove: [12, 36, 120, 180], daze: [18, 30, 240, 240] });
  });
});

describe('campaign, raids and enemy seats are untouched while the lab is off', () => {
  const quiet = (s: GameState, n: number): string => {
    const events: SimEvent[] = [];
    for (let i = 0; i < n; i++) events.push(...tick(s, {} as Intents));
    return hashOf({ s: s.players, e: events });
  };

  it('a mission, a raid and an enemy scene refuse the lab and run exactly as if it had never been asked', () => {
    const makers: (() => GameState)[] = [
      () =>
        createGame(
          buildMissionGame({
            spec: { id: 'oshodi', fieldId: 'oshodi.approach' },
            humanCharacter: 'streetBaller',
            seed: 4,
          }),
        ),
      () => newRaid(),
      () => enemyScene({ human: { x: 1, y: 1, hp: 9 }, enemies: [{ kind: 'guard', x: 3, y: 1, hp: 2 }] }),
    ];
    for (const make of makers) {
      const a = make();
      const b = make();
      const before = structuredClone(a.config);
      expect(setCombatLabLevel(a, 2)).toBe(false);
      expect(setCombatLabLevel(a, 0)).toBe(false);
      expect(a.config).toEqual(before);
      expect(a.config.enemyAttacks).toEqual(b.config.enemyAttacks); // the mission's own fairness values
      expect('combatLab' in a.config).toBe(false);
      expect('combatLab' in a).toBe(false);
      for (const s of [a, b]) {
        s.match.phase = 'playing';
        s.match.countdownRemaining = 0;
      }
      expect(quiet(a, 300)).toBe(quiet(b, 300));
    }
  });

  it('a Rumble match never given a level keeps today’s attacks; picking and clearing a level restores them exactly', () => {
    const s = createGame({
      seed: 2,
      arenaId: 'rumbleOshodi',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
      settings: { game: 'survival', stageHazards: false },
    });
    expect(s.config.skills.attacks).toEqual(DEFAULT_CONFIG.skills.attacks);
    expect(s.config.campaign).toBeUndefined();
    setCombatLabLevel(s, 4);
    setCombatLabLevel(s, 0);
    expect(s.config.skills.attacks).toEqual(DEFAULT_CONFIG.skills.attacks);
    expect(s.config.campaign).toBeUndefined();
    expect('combatLab' in s.config).toBe(false);
  });
});

describe('each level has its own look (swing arc, impact, miss)', () => {
  const P = (l: CombatLabLevel) => COMBAT_LAB_PRESETS[l];

  it('every level has its own colour, and levels 1 and 2 are told apart by colour AND arc opening', () => {
    expect(new Set(LEVELS.map((l) => swingLook(P(l)).color)).size).toBe(4);
    expect(new Set(LEVELS.map((l) => impactLook(P(l)).color)).size).toBe(4);
    const a = swingLook(P(1));
    const b = swingLook(P(2));
    expect(b.color).not.toBe(a.color);
    expect(b.halfAngle).toBeGreaterThan(a.halfAngle); // the forward corners are in reach: the fan shows it
    expect(b.radius).toBe(a.radius); // same one-tile reach
    expect(b.life).toBeGreaterThan(a.life);
  });

  it('the arc grows with the reach and the impact grows with the level', () => {
    const swings = LEVELS.map((l) => swingLook(P(l)));
    for (let i = 1; i < 4; i++) {
      expect(swings[i]!.halfAngle).toBeGreaterThanOrEqual(swings[i - 1]!.halfAngle);
      expect(swings[i]!.radius).toBeGreaterThanOrEqual(swings[i - 1]!.radius);
    }
    expect(swings[2]!.radius).toBeGreaterThan(2); // two tiles ahead
    const hits = LEVELS.map((l) => impactLook(P(l)));
    for (let i = 1; i < 4; i++) {
      expect(hits[i]!.ringSize).toBeGreaterThan(hits[i - 1]!.ringSize);
      expect(hits[i]!.flashSize).toBeGreaterThanOrEqual(hits[i - 1]!.flashSize);
      expect(hits[i]!.shake).toBeGreaterThan(hits[i - 1]!.shake);
    }
    // the shake request stays inside the bounded budget's per-frame allowance (render/shake.ts)
    for (const h of hits) expect(h.shake).toBeLessThanOrEqual(0.3);
  });

  it('a miss is always the same thin grey arc, plainly not a hit', () => {
    for (const l of LEVELS) {
      const w = whiffLook(P(l));
      const s = swingLook(P(l));
      expect(w.color).toBe(WHIFF_COLOR);
      expect(Object.values(LAB_COLORS)).not.toContain(w.color);
      expect(w.halfAngle).toBeLessThan(s.halfAngle);
      expect(w.radius).toBeLessThan(s.radius);
      expect(w.rim).toBeLessThan(s.rim);
    }
  });

  it('the audio cues: a hit is louder and lower with the level; a miss is quiet and low', () => {
    const cues = LEVELS.map((l) => labHitCue(P(l)));
    for (let i = 1; i < 4; i++) {
      expect(cues[i]!.gain).toBeGreaterThan(cues[i - 1]!.gain);
      expect(cues[i]!.rate).toBeLessThan(cues[i - 1]!.rate);
    }
    for (const c of cues) expect(labMissCue().gain).toBeLessThan(c.gain);
  });
});

describe('the menu text comes from the preset data', () => {
  it('level 2 against level 1 names exactly what the numbers change', () => {
    const lines = labChangeLines(2);
    const text = lines.join(' ');
    expect(text).toContain('1 tick sooner (3 vs 4');
    expect(text).toContain('0.4 s after a hit (was 0.6 s)');
    expect(text).toContain('1.8 s (was 2.4 s)');
    expect(text).toContain('2 forward corners');
    expect(text).toContain('Turns to a rival');
    expect(text).toContain('12 ticks (was 10)');
    expect(text).not.toContain('after a miss'); // the Punch's miss recovery is 8 ticks at both levels
    expect(labChangeText(2).startsWith('2 Balanced vs 1 Classic+: ')).toBe(true);
  });

  it('every level has a non-empty change line, level 1 is described against Off, Off against nothing', () => {
    for (const l of LEVELS) expect(labChangeLines(l).length).toBeGreaterThan(0);
    expect(labChangeText(1)).toContain('vs Off');
    expect(labChangeText(1)).toContain('was ignored');
    expect(labChangeText(3)).toContain('two tiles straight ahead');
    expect(labChangeText(4)).toContain('one to the side');
    expect(labChangeText(0)).toContain('today');
  });

  it('the reach wording follows the flags, and the chip detail tells the levels apart', () => {
    expect(reachWords(null)).toBe('the 4 tiles around you');
    expect(reachWords(COMBAT_LAB_PRESETS[1])).toBe('the 4 tiles around you');
    expect(new Set(LEVELS.map((l) => labChipDetail(COMBAT_LAB_PRESETS[l]))).size).toBe(4);
    expect(labChipDetail(COMBAT_LAB_PRESETS[1])).not.toContain('aim');
    expect(labChipDetail(COMBAT_LAB_PRESETS[2])).toContain('aim help');
  });
});

describe('the events the feedback reads (existing, deterministic)', () => {
  function yard(level: CombatLabLevel): GameState {
    const s = createGame({
      seed: 11,
      arenaId: 'rumbleOshodi',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
      settings: { game: 'survival', stageHazards: false },
    });
    for (let y = 36; y <= 42; y++)
      for (let x = 4; x <= 18; x++) {
        const i = y * s.width + x;
        s.tiles[i] = Tile.Empty;
        delete s.hidden[i];
      }
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    s.generators = [];
    setCombatLabLevel(s, level);
    for (const p of s.players) p.protectedUntil = 0;
    const [a, b] = s.players as [GameState['players'][0], GameState['players'][0]];
    a.x = a.stepFromX = 10;
    a.y = a.stepFromY = 39;
    a.facing = 'right';
    b.x = b.stepFromX = 11;
    b.y = b.stepFromY = 39;
    return s;
  }
  const press = (s: GameState): SimEvent[] => {
    const out: SimEvent[] = [];
    for (let t = 0; t < 40; t++) out.push(...tick(s, t === 0 ? { 0: { special: true } } : {}));
    return out;
  };

  it('a hit is punchSwing (with a target) then attackResolved hit; a swing at the air has no target and misses', () => {
    for (const l of LEVELS) {
      const hit = press(yard(l));
      expect(hit.find((e) => e.type === 'punchSwing')).toMatchObject({
        playerId: 0,
        dir: 'right',
        targetId: 1,
      });
      expect(hit.find((e) => e.type === 'attackResolved')).toMatchObject({ hit: true, targetId: 1 });
      const air = yard(l);
      air.players[1]!.x = air.players[1]!.stepFromX = 16;
      const miss = press(air);
      expect(miss.find((e) => e.type === 'punchSwing')).toMatchObject({ targetId: null });
      expect(miss.find((e) => e.type === 'attackResolved')).toMatchObject({ hit: false, targetId: null });
    }
  });
});
