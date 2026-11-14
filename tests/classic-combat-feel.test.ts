/**
 * Classic Battle close-combat feel (decision CC-F1, docs/DECISIONS.md): the open-field Level 2 feel pinned on for a local
 * Classic Battle, cardinal reach only. Everything else (City Rumble with the lab off, missions, raids, online seats,
 * `createGame` itself) must be exactly as before.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_COMBAT_PRESET,
  COMBAT_LAB_PRESETS,
  DEFAULT_CONFIG,
  applyClassicCombat,
  buildMissionGame,
  combatLabAllowed,
  createGame,
  feelPresetFor,
  setCombatLabLevel,
  tick,
} from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import { chooseAttack } from '../src/sim/systems/skills';
import { Tile } from '../src/sim/types';
import { impactLook, swingLook } from '../src/render/combatLabLook';
import { newRaid } from './raid-helpers';
import { put } from './helpers';

function match(game: 'classic' | 'survival', classic: boolean, arenaId = 'danfoBusPark'): GameState {
  const s = createGame({
    seed: 3,
    arenaId,
    players: [
      { name: 'A', characterId: 'streetBaller', isBot: false },
      { name: 'B', characterId: 'streetBaller', isBot: false },
    ],
    settings: { game, stageHazards: false },
  });
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  if (classic) applyClassicCombat(s);
  put(s, 0, 1, 1);
  s.players[0]!.facing = 'right';
  put(s, 1, 2, 1);
  return s;
}

const press: Intents = { 0: { special: true } };
function run(s: GameState, ticks: number, at: number[] = [0]): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) out.push(...tick(s, at.includes(t) ? press : {}));
  return out;
}
const count = (ev: SimEvent[], type: SimEvent['type']): number => ev.filter((e) => e.type === type).length;

describe('Classic Battle gets the Level 2 timing, buffer and swing', () => {
  it('applies the Level 2 numbers to every attack, and says so only in the match state (no lab level)', () => {
    const off = match('classic', false);
    const on = match('classic', true);
    expect(off.config.skills.attacks.push).toMatchObject({
      startupTicks: 4,
      hitRecoveryTicks: 60,
      targetLockoutTicks: 180,
    });
    expect(on.config.skills.attacks.push).toMatchObject({
      startupTicks: 3,
      hitRecoveryTicks: 24,
      targetLockoutTicks: 108,
    });
    const rumble = match('survival', false, 'rumbleOjuelegba');
    expect(setCombatLabLevel(rumble, 2)).toBe(true);
    for (const k of ['push', 'shove', 'daze'] as const)
      expect(on.config.skills.attacks[k]).toEqual(rumble.config.skills.attacks[k]);
    expect(on.combatLab).toMatchObject({ classic: true, buffered: {} });
    expect(on.config.combatLab?.bufferTicks).toBe(12);
    expect(on.config.combatLab?.autoTarget).toBe(true);
  });

  it('is a pure derivation of Level 2 (no preset retuned) with only the corner reach removed', () => {
    expect({ ...CLASSIC_COMBAT_PRESET, name: '', summary: '', forwardDiagonals: true }).toEqual({
      ...COMBAT_LAB_PRESETS[2],
      name: '',
      summary: '',
    });
    expect(CLASSIC_COMBAT_PRESET.forwardDiagonals).toBe(false);
    expect(CLASSIC_COMBAT_PRESET.reachTwo || CLASSIC_COMBAT_PRESET.reachTwoWide).toBe(false);
    expect(COMBAT_LAB_PRESETS[2]).toMatchObject({
      forwardDiagonals: true,
      startupScale: 0.8,
      bufferTicks: 12,
    });
  });

  it('cardinal reach only: no corner, no two-tile reach', () => {
    const c = match('classic', true);
    put(c, 0, 5, 5);
    c.players[0]!.facing = 'right';
    put(c, 1, 6, 6); // the forward corner (Level 2 in City Rumble reaches it)
    expect(chooseAttack(c, c.players[0]!)).toBeNull();
    put(c, 1, 7, 5); // two ahead
    expect(chooseAttack(c, c.players[0]!)).toBeNull();
    put(c, 1, 6, 5); // adjacent
    expect(chooseAttack(c, c.players[0]!)).toMatchObject({ dir: 'right', ready: true });
    expect(DEFAULT_CONFIG.skills.attacks.push.reach).toBeLessThan(2);
  });

  it('aim help turns only between cardinal neighbours', () => {
    const c = match('classic', true);
    put(c, 0, 5, 5);
    c.players[0]!.facing = 'right';
    put(c, 1, 5, 6); // below
    expect(chooseAttack(c, c.players[0]!)).toMatchObject({ dir: 'down' });
    put(c, 1, 4, 4); // diagonal behind: nothing
    expect(chooseAttack(c, c.players[0]!)).toBeNull();
  });

  it('a press made while recovering is kept (12 ticks) and thrown once; Off ignores it', () => {
    const swings = (classic: boolean): number => {
      const s = match('classic', classic);
      put(s, 1, 12, 5); // nobody in reach
      s.players[1]!.stepFromX = 12;
      // press at 0 (a swing at the air in Classic), press again at 4 while it recovers
      return count(run(s, 40, [0, 4]), 'attackStarted');
    };
    expect(swings(false)).toBe(0); // today: B with nobody in reach does nothing at all
    expect(swings(true)).toBe(2); // the second press was kept and thrown, exactly once (no double punch)
  });

  it('a hit and a miss are both visible events (swing at the press, resolved hit true / false)', () => {
    const hit = run(match('classic', true), 12);
    expect(count(hit, 'punchSwing')).toBe(1);
    expect(hit.find((e) => e.type === 'attackResolved')).toMatchObject({ hit: true });
    const s = match('classic', true);
    put(s, 1, 12, 5);
    const miss = run(s, 12);
    expect(miss.find((e) => e.type === 'punchSwing')).toMatchObject({ targetId: null });
    expect(miss.find((e) => e.type === 'attackResolved')).toMatchObject({ hit: false });
  });

  it('Punch hits come faster than Off: gap between two hits on one rival 108+ vs 180+ ticks', () => {
    const gap = (classic: boolean): number => {
      const s = match('classic', classic);
      const hits: number[] = [];
      for (let t = 0; t < 900; t++) {
        for (const e of tick(s, t % 6 === 0 ? press : {}))
          if (e.type === 'attackResolved' && e.hit) hits.push(s.tick);
        put(s, 1, 2, 1);
      }
      return hits[1]! - hits[0]!;
    };
    expect(gap(true)).toBeLessThan(gap(false) - 50);
  });

  it('is not a lab: not switchable, no pause-menu level, no chip', () => {
    const c = match('classic', true);
    expect(combatLabAllowed(c)).toBe(false);
    expect(setCombatLabLevel(c, 3)).toBe(false);
    expect(applyClassicCombat(c)).toBe(false); // once only
  });
});

describe('everything else is as before', () => {
  it('createGame alone, Rumble with the lab off, missions and raids keep the catalogue numbers', () => {
    const base = DEFAULT_CONFIG.skills.attacks;
    for (const s of [
      createGame({
        seed: 1,
        players: [
          { name: 'a', characterId: 'streetBaller', isBot: false },
          { name: 'b', characterId: 'streetBaller', isBot: false },
        ],
      }),
      match('survival', false, 'rumbleOjuelegba'),
      createGame(
        buildMissionGame({
          spec: { id: 'oshodi', fieldId: 'oshodi.approach' },
          humanCharacter: 'streetBaller',
          seed: 4,
        }),
      ),
      newRaid(),
    ]) {
      expect(s.config.combatLab).toBeUndefined();
      expect(s.combatLab).toBeUndefined();
      expect(s.config.skills.attacks.push.hitRecoveryTicks).toBe(base.push.hitRecoveryTicks);
      expect(s.config.skills.attacks.push.startupTicks).toBe(base.push.startupTicks);
    }
  });

  it('applyClassicCombat refuses Rumble, missions and raids', () => {
    expect(applyClassicCombat(match('survival', false, 'rumbleOjuelegba'))).toBe(false);
    expect(applyClassicCombat(newRaid())).toBe(false);
    expect(
      applyClassicCombat(
        createGame(
          buildMissionGame({
            spec: { id: 'oshodi', fieldId: 'oshodi.approach' },
            humanCharacter: 'streetBaller',
            seed: 4,
          }),
        ),
      ),
    ).toBe(false);
  });

  it('raid and mission presentation only: the human gets the classic look, enemies and bystanders do not', () => {
    const raid = newRaid();
    const human = raid.players.find((p) => p.enemyKind === undefined)!;
    expect(feelPresetFor(raid, human)).toBe(CLASSIC_COMBAT_PRESET);
    const enemy = raid.players.find((p) => p.enemyKind !== undefined);
    if (enemy) expect(feelPresetFor(raid, enemy)).toBeNull();
    const rumble = match('survival', false, 'rumbleOjuelegba');
    expect(feelPresetFor(rumble, rumble.players[0])).toBeNull();
    expect(feelPresetFor(match('classic', false), undefined)).toBeNull();
    setCombatLabLevel(rumble, 3);
    expect(feelPresetFor(rumble, rumble.players[0])).toBe(rumble.config.combatLab);
  });

  it('the Rumble feedback model is unchanged and Classic reuses Level 2 (cyan, one-tile fan)', () => {
    expect(impactLook(COMBAT_LAB_PRESETS[2])).toMatchObject({
      color: 0x62e6ff,
      ringSize: 1.25,
      flashSize: 0.8,
      shake: 0.1,
      dust: 4,
    });
    expect(impactLook(CLASSIC_COMBAT_PRESET)).toEqual(impactLook(COMBAT_LAB_PRESETS[2]));
    expect(swingLook(COMBAT_LAB_PRESETS[2]).halfAngle).toBeGreaterThan(
      swingLook(CLASSIC_COMBAT_PRESET).halfAngle,
    );
    expect(swingLook(CLASSIC_COMBAT_PRESET).radius).toBe(1.15);
  });

  it('a classic match with the feel on is deterministic', () => {
    const a = match('classic', true);
    const b = match('classic', true);
    const ea = run(a, 300, [0, 40, 80, 120]);
    const eb = run(b, 300, [0, 40, 80, 120]);
    expect(JSON.stringify(ea)).toBe(JSON.stringify(eb));
    expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players));
  });
});
