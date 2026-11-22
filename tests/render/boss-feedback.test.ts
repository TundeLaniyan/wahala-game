/**
 * The boss fight's board feedback (decisions BH1-BH5, docs/DECISIONS.md): which sim event draws which effect, the one
 * effect that has no event (a blast bouncing off the SHIELDED boss: recognised from the flames, the lethality tile
 * test), and the boss's defeat pose. Pure; the real mission sim drives it.
 */
import { describe, expect, it } from 'vitest';
import { tick } from '../../src/sim';
import type { Flame, GameState } from '../../src/sim';
import {
  BOSS_COLORS,
  BOSS_FX,
  bossDefeatPose,
  bossFxFor,
  shieldBlockingFlame,
} from '../../src/render/views/bossFeedback';
import { addGenerator } from '../helpers';
import { advance, hitBoss, newMission, of, put } from '../mission-helpers';

const AWAY = { x: 30, y: 30 };

function flameOn(state: GameState, x: number, y: number, eventId = 9001): Flame {
  const f: Flame = {
    x,
    y,
    eventId,
    genId: -1,
    ownerId: 0,
    dir: null,
    tip: false,
    startTick: state.tick,
    endTick: state.tick + 30,
  };
  state.flames.push(f);
  return f;
}

describe('which event draws which effect', () => {
  it('a hit, the shield dropping, the shield closing and the defeat each have their own; the opening shield has none', () => {
    expect(bossFxFor({ type: 'bossHit' })).toBe('hit');
    expect(bossFxFor({ type: 'bossExposed' })).toBe('shieldDown');
    expect(bossFxFor({ type: 'bossShielded', reason: 'phase' })).toBe('shieldUp');
    expect(bossFxFor({ type: 'bossShielded', reason: 'expired' })).toBe('shieldUp');
    expect(bossFxFor({ type: 'bossShielded', reason: 'start' })).toBeNull();
    expect(bossFxFor({ type: 'bossDefeated' })).toBe('defeated');
  });

  it('the hit is hot and shakes the board; the shield cues are cold and quiet; the defeat is the biggest', () => {
    expect(BOSS_FX.hit.shake).toBeGreaterThan(0);
    expect(BOSS_FX.hit.flashColor).toBe(BOSS_COLORS.hit);
    for (const k of ['shieldUp', 'blocked'] as const) {
      expect(BOSS_FX[k].shake, k).toBe(0);
      expect(BOSS_FX[k].flashColor, k).toBe(k === 'blocked' ? BOSS_COLORS.shieldSpark : BOSS_COLORS.shield);
    }
    for (const k of ['hit', 'shieldUp', 'shieldDown', 'blocked'] as const) {
      expect(BOSS_FX.defeated.flashSize).toBeGreaterThan(BOSS_FX[k].flashSize);
      expect(BOSS_FX.defeated.ring).toBeGreaterThan(BOSS_FX[k].ring);
    }
    expect(BOSS_FX.defeated.smoke).toBe(true);
  });
});

describe('a blast on the shielded boss is recognised from the flames (BH2)', () => {
  it('names the flame on his tile while he is shielded, once per blast, and only then', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const boss = state.players[1]!;
    expect(shieldBlockingFlame(state)).toBeNull();
    flameOn(state, boss.x + 1, boss.y); // beside him: not on his tile
    expect(shieldBlockingFlame(state)).toBeNull();
    flameOn(state, boss.x, boss.y, 7);
    expect(shieldBlockingFlame(state)).toBe(7);
  });

  it('is the real thing: the sim ignores that blast (no hit event, same health), and the same blast on an EXPOSED boss is a hit', () => {
    const shielded = newMission({ id: 'oshodi' });
    tick(shielded, {});
    const boss = shielded.players[1]!;
    put(shielded, 0, AWAY.x, AWAY.y);
    addGenerator(shielded, { ownerId: 0, x: boss.x, y: boss.y, timer: 1 });
    let blocked = false;
    let hits = 0;
    for (let i = 0; i < 45; i++) {
      hits += of(tick(shielded, {}), 'bossHit').length;
      blocked ||= shieldBlockingFlame(shielded) !== null;
    }
    expect(blocked).toBe(true);
    expect(hits).toBe(0);
    expect(shielded.mission!.boss.hp).toBe(3);

    // exposed: no "blocking" flame is ever reported, and the blast costs a hit
    const exposed = newMission({ id: 'oshodi' });
    const m = exposed.mission!;
    for (const n of m.nodes) {
      put(exposed, 0, AWAY.x, AWAY.y);
      addGenerator(exposed, { ownerId: 0, x: n.x, y: n.y, timer: 1 });
      advance(exposed, 45);
    }
    expect(m.boss.shielded).toBe(false);
    let reported = false;
    const b2 = exposed.players[1]!;
    put(exposed, 0, AWAY.x, AWAY.y);
    addGenerator(exposed, { ownerId: 0, x: b2.x, y: b2.y, timer: 1 });
    let hit = 0;
    for (let i = 0; i < 45; i++) {
      const ev = tick(exposed, {});
      hit += of(ev, 'bossHit').length;
      reported ||= shieldBlockingFlame(exposed) !== null;
    }
    expect(hit).toBe(1);
    expect(reported).toBe(false);
  });

  it('is silent for an expired flame, a dead boss, and a match without a boss mission', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const boss = state.players[1]!;
    const f = flameOn(state, boss.x, boss.y, 5);
    f.endTick = state.tick; // already burnt out
    expect(shieldBlockingFlame(state)).toBeNull();
    flameOn(state, boss.x, boss.y, 6);
    boss.alive = false;
    expect(shieldBlockingFlame(state)).toBeNull();
    const field = newMission({ id: 'oshodi' });
    field.mission = undefined;
    expect(shieldBlockingFlame(field)).toBeNull();
  });
});

describe('the boss falls slowly (BH5)', () => {
  it('is flung higher than a rival, lands, stays full size and only then shrinks away', () => {
    const total = 1.7;
    const peak = Math.max(...Array.from({ length: 80 }, (_, i) => bossDefeatPose(i / 100, total).lift));
    expect(peak).toBeGreaterThan(1.6); // a rival's hop peaks at 3.4 * 0.62 / 2 * 2 = 1.05
    expect(bossDefeatPose(1.0, total)).toEqual({ lift: 0, scale: 1 });
    expect(bossDefeatPose(0.0, total).lift).toBe(0);
    expect(bossDefeatPose(total, total).scale).toBe(0);
    let last = 1;
    for (let t = 1.2; t <= total; t += 0.05) {
      const s = bossDefeatPose(t, total).scale;
      expect(s).toBeLessThanOrEqual(last);
      last = s;
    }
    // the real fight: the last hit really eliminates him, which is what poses him as down
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const m = state.mission!;
    for (let phase = 0; phase < 3; phase++) {
      for (const n of m.nodes) {
        if (m.phaseState !== 'active' || n.done) continue;
        put(state, 0, AWAY.x, AWAY.y);
        addGenerator(state, { ownerId: 0, x: n.x, y: n.y, timer: 1 });
        advance(state, 45);
      }
      hitBoss(state, AWAY);
    }
    expect(state.players[1]!.alive).toBe(false);
    expect(m.boss.defeated).toBe(true);
  });
});
