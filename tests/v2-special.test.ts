import { describe, expect, it } from 'vitest';
import { previewSpecial } from '../src/sim';
import { addSoft, eventsOf, put, run, sandbox } from './helpers';

/**
 * V2 button B (founder A6 / A7): one deterministic resolver. 1 adjacent opponent -> melee with the
 * character's skill; 2 else a Vehicle Voucher -> one-press vehicle; 3 else nothing. Never two things.
 */
describe('B priority', () => {
  it('1. an adjacent opponent: B is the melee (Push moves them a tile) and the hit is recorded for credit', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.hasVoucher = true; // even with a voucher: the rival next to me wins
    expect(previewSpecial(s, s.players[0]!)).toBe('melee');
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'specialUsed')).toEqual([{ type: 'specialUsed', playerId: 0, action: 'melee' }]);
    expect(eventsOf(ev, 'playerPushed')).toHaveLength(1);
    expect(s.players[1]!.x).toBe(6);
    expect(s.vehicles).toHaveLength(0);
    expect(s.players[0]!.hasVoucher).toBe(true);
    expect(s.players[1]!.recentHits.map((h) => h.byId)).toEqual([0]);
  });

  it('melee reaches any adjacent tile (faced first) and turns to face the target; Daze and Shove too', () => {
    const s = sandbox({ characters: ['lekkiBoy', 'campusQueen', 'streetBaller'] });
    put(s, 0, 4, 4);
    put(s, 1, 4, 3); // above, while facing down
    put(s, 2, 14, 10);
    s.players[0]!.facing = 'down';
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'playerDazed')).toEqual([{ type: 'playerDazed', playerId: 1, byId: 0 }]);
    expect(s.players[0]!.facing).toBe('up');

    const t = sandbox({ characters: ['campusQueen', 'streetBaller'] });
    put(t, 0, 4, 4);
    put(t, 1, 3, 4);
    const ev2 = run(t, 1, { 0: { special: true } });
    expect(eventsOf(ev2, 'skillUsed')[0]!.skill).toBe('shove');
    expect(t.players[1]!.x).toBe(2);
  });

  it('a melee on cooldown with a voucher does NOTHING: never a surprise vehicle next to a rival', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.hasVoucher = true;
    s.players[0]!.skillReadyTick = s.tick + 100;
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'specialUsed')).toHaveLength(0);
    expect(s.vehicles).toHaveLength(0);
    expect(s.players[0]!.hasVoucher).toBe(true);
  });

  it('a push into a wall fails cleanly: no vehicle either', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    addSoft(s, 6, 4);
    s.players[0]!.facing = 'right';
    s.players[0]!.hasVoucher = true;
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'specialUsed')).toHaveLength(0);
    expect([s.players[1]!.x, s.vehicles.length]).toEqual([5, 0]);
  });

  it('a TEAMMATE next to me is never meleed: B goes on to the vehicle', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy', 'campusQueen'], players: 3 });
    s.players[0]!.team = 0;
    s.players[1]!.team = 0;
    s.players[2]!.team = 1;
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    put(s, 2, 10, 8);
    s.players[0]!.hasVoucher = true;
    expect(previewSpecial(s, s.players[0]!)).toBe('vehicle');
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'playerPushed')).toHaveLength(0);
    expect(eventsOf(ev, 'specialUsed')).toEqual([{ type: 'specialUsed', playerId: 0, action: 'vehicle' }]);
    expect(s.players[1]!.x).toBe(5);
  });

  it('2. no opponent adjacent + voucher: ONE press launches the vehicle at once (no entry mode)', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 0, 10);
    put(s, 1, 8, 4);
    s.players[0]!.hasVoucher = true;
    const ev = run(s, 1, { 0: { special: true } });
    expect(s.players[0]!.entryUntil).toBeNull();
    expect(eventsOf(ev, 'vehicleWarning')).toHaveLength(1);
    expect(eventsOf(ev, 'specialUsed')).toEqual([{ type: 'specialUsed', playerId: 0, action: 'vehicle' }]);
    expect(s.players[0]!.hasVoucher).toBe(false);
    // pressing again does nothing: one vehicle at a time, voucher spent
    const ev2 = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev2, 'specialUsed')).toHaveLength(0);
    expect(s.vehicles).toHaveLength(1);
  });

  it('3. nothing to do: B is a no-op', () => {
    const s = sandbox();
    put(s, 0, 4, 4);
    put(s, 1, 10, 8);
    expect(previewSpecial(s, s.players[0]!)).toBeNull();
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'specialUsed')).toHaveLength(0);
    expect(eventsOf(ev, 'skillUsed')).toHaveLength(0);
  });

  it('never fires two abilities: a melee press with a voucher and a remote generator down only melees', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    const p = s.players[0]!;
    p.hasVoucher = true;
    p.remote = true;
    run(s, 1, { 0: { place: true } });
    put(s, 0, 4, 4);
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'specialUsed').map((e) => e.action)).toEqual(['melee']);
    expect(s.vehicles).toHaveLength(0);
    expect(s.generators.every((g) => !g.triggered)).toBe(true);
  });

  it('a dazed player cannot use B', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.dazedUntil = s.tick + 30;
    expect(previewSpecial(s, s.players[0]!)).toBeNull();
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'specialUsed')).toHaveLength(0);
  });
});
