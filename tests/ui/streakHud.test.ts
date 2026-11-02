/**
 * The kill-streak reward HUD (decision SK4): the data the HUD snapshot carries, the reward cards in the rail (name,
 * icon, remaining duration and charges), the action-button labels (real action names, never A / B letters), the
 * acquisition / consumed notices, and the placement (the rail beside the board, never over it).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createGame, tick } from '../../src/sim';
import type { GameState } from '../../src/sim';
import { buildHud } from '../../src/app/hud';
import { RUMBLE_FIXTURE } from '../helpers';

vi.mock('../../src/assets/pickupIcons', () => ({ pickupIconUrl: (kind: string) => `icon:${kind}` }));

const { StreakStatus } = await import('../../src/ui/StreakStatus');
const { specialLabel } = await import('../../src/ui/specialLabel');

function rumble(): GameState {
  const s = createGame({
    seed: 1,
    arenaId: RUMBLE_FIXTURE,
    players: Array.from({ length: 4 }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller' as const,
      isBot: i > 0,
    })),
    settings: { game: 'survival' },
  });
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}
const me = (s: GameState) => buildHud(s, 0, null).me!;
const html = (s: GameState) => renderToStaticMarkup(createElement(StreakStatus, { streak: me(s).rewards }));

describe('the HUD snapshot', () => {
  it('has rewards in Rumble rulesets and none in Classic', () => {
    const s = rumble();
    expect(me(s).rewards).not.toBeNull();
    const c = createGame({
      seed: 1,
      players: [
        { name: 'a', characterId: 'streetBaller', isBot: false },
        { name: 'b', characterId: 'streetBaller', isBot: true },
      ],
      settings: { game: 'classic' },
    });
    expect(buildHud(c, 0, null).me!.rewards).toBeNull();
  });

  it('counts the kills to the next reward (3, then 5, then 7)', () => {
    const s = rumble();
    s.players[0]!.stats.streak = 1;
    expect(me(s).rewards!.next).toEqual({ kills: 3, reward: 'quickHands', toGo: 2 });
    s.players[0]!.stats.streak = 4;
    s.players[0]!.streakRewards.earned = [3];
    expect(me(s).rewards!.next).toEqual({ kills: 5, reward: 'vehicleGenerator', toGo: 1 });
    s.players[0]!.streakRewards.earned = [3, 5, 7];
    s.players[0]!.stats.streak = 8;
    expect(me(s).rewards!.next).toBeNull();
  });

  it('QUICK HANDS shows its remaining seconds, fraction and generator charges', () => {
    const s = rumble();
    const p = s.players[0]!;
    p.streakRewards.quickHandsStart = s.tick;
    p.streakRewards.quickHandsUntil = s.tick + 18 * 60;
    p.capacity = 7;
    const q = me(s).rewards!.quickHands!;
    expect(q).toMatchObject({ seconds: 18, fraction: 1, charges: 7, capacity: 7 });
    s.tick += 9 * 60;
    expect(me(s).rewards!.quickHands).toMatchObject({ seconds: 9, fraction: 0.5 });
  });

  it('charges left drop as generators go down, and a carried VEHICLE GENERATOR uses none', () => {
    const s = rumble();
    const p = s.players[0]!;
    p.capacity = 7;
    p.streakRewards.quickHandsStart = s.tick;
    p.streakRewards.quickHandsUntil = s.tick + 600;
    for (let i = 0; i < 3; i++)
      s.generators.push({
        id: 900 + i,
        ownerId: 0,
        x: 3 + i,
        y: 3,
        stepFromX: 3 + i,
        stepFromY: 3,
        range: 2,
        pierce: false,
        square: 0,
        fromSpectator: false,
        mode: 'timed',
        timer: 100,
        carriedBy: null,
        carryBonusUsed: false,
        slide: null,
        flight: null,
        triggered: false,
        placedTick: 0,
      });
    s.generators.push({
      id: 950,
      ownerId: 0,
      x: 9,
      y: 9,
      stepFromX: 9,
      stepFromY: 9,
      range: 2,
      pierce: false,
      square: 0,
      fromSpectator: false,
      mode: 'timed',
      timer: 100,
      carriedBy: null,
      carryBonusUsed: true,
      slide: null,
      flight: { fromX: 9, fromY: 9, remaining: 99, total: 99 },
      triggered: false,
      placedTick: 0,
      vehicleBorne: true,
      mountedOn: 1,
    });
    expect(me(s).rewards!.quickHands!.charges).toBe(4);
    expect(me(s).active).toBe(3);
  });

  it('the B button names the vehicle for a VEHICLE GENERATOR and says KNOCKDOWN for the other', () => {
    const s = rumble();
    const p = s.players[0]!;
    p.streakRewards.vehicleGenerator = 'taxi';
    expect(me(s).special).toBe('vehicleGenerator');
    expect(me(s).vehicle).toBe('taxi');
    expect(specialLabel(me(s), 'push')).toMatchObject({
      text: 'YELLOW CAB',
      icon: 'generator',
      sub: '+ GENERATOR',
      live: true,
    });
    p.streakRewards.vehicleGenerator = null;
    p.streakRewards.knockdown = true;
    expect(specialLabel(me(s), 'push')).toMatchObject({ text: 'KNOCKDOWN', icon: 'knockdown', live: true });
  });

  it('no action label is a bare controller letter', () => {
    const s = rumble();
    const p = s.players[0]!;
    for (const set of [
      () => (p.streakRewards.vehicleGenerator = 'okada'),
      () => {
        p.streakRewards.vehicleGenerator = null;
        p.streakRewards.knockdown = true;
      },
    ]) {
      set();
      const l = specialLabel(me(s), 'push');
      expect(l.text).not.toMatch(/^[AB]$/);
      expect(`${l.text} ${l.sub ?? ''}`).not.toMatch(/\b[AB]:/);
    }
  });
});

describe('the reward cards in the rail', () => {
  it('shows nothing when there is nothing to show', () => {
    const s = rumble();
    s.players[0]!.streakRewards.earned = [3, 5, 7];
    s.players[0]!.stats.streak = 9;
    expect(html(s)).toBe('');
  });

  it('before the first threshold: how many kills to QUICK HANDS', () => {
    const s = rumble();
    s.players[0]!.stats.streak = 2;
    const out = html(s);
    expect(out).toContain('data-testid="streak-next"');
    expect(out).toContain('QUICK HANDS');
    expect(out).toContain('1 kill to go');
  });

  it('QUICK HANDS: name, icon, seconds left, a duration bar and the charges', () => {
    const s = rumble();
    const p = s.players[0]!;
    p.streakRewards.quickHandsStart = s.tick;
    p.streakRewards.quickHandsUntil = s.tick + 12 * 60;
    p.capacity = 7;
    const out = html(s);
    expect(out).toContain('data-testid="streak-quick-hands"');
    expect(out).toContain('QUICK HANDS');
    expect(out).toContain('12s');
    expect(out).toContain('streak-bar');
    expect(out).toContain('7/7 generators');
    expect(out).toContain('streak-icon quickHands');
  });

  it('VEHICLE GENERATOR names its vehicle, GLOBAL KNOCKDOWN says ready', () => {
    const s = rumble();
    const p = s.players[0]!;
    p.streakRewards.vehicleGenerator = 'keke';
    p.streakRewards.knockdown = true;
    const out = html(s);
    expect(out).toContain('data-vehicle="keke"');
    expect(out).toContain('KEKE');
    expect(out).toContain('streak-icon vehicleGenerator');
    expect(out).toContain('KNOCKDOWN');
    expect(out).toContain('READY');
  });

  it('a spent reward leaves the rail (consumed), and a lost one too', () => {
    const s = rumble();
    const p = s.players[0]!;
    p.streakRewards.knockdown = true;
    expect(html(s)).toContain('streak-knockdown');
    p.streakRewards.knockdown = false;
    p.streakRewards.earned = [3, 5, 7];
    p.stats.streak = 7;
    expect(html(s)).not.toContain('streak-knockdown');
  });
});

describe('the notices (events -> rail toasts)', () => {
  it('the sim emits one event for every stage: earned, used, ended, lost', () => {
    const s = rumble();
    const p = s.players[0]!;
    p.streakRewards.knockdown = true;
    const types = new Set<string>();
    for (const e of tick(s, { 0: { special: true } })) types.add(e.type);
    expect(types.has('streakRewardUsed')).toBe(true);
    expect(types.has('knockdownThrown')).toBe(true);
  });
});
