import { describe, expect, it } from 'vitest';
import { moveWouldAct, tileAt } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addGenerator, addPickup, addSoft, eventsOf, put, run, sandbox } from './helpers';

/**
 * V2 contact abilities (founder A3): no buttons. Moving into a grounded generator uses the ONE equipped
 * ability: kick slides it until it collides, punch flies it 3 tiles over obstacles, disarm switches it off
 * with a charge, pass walks through it. Danfo Bus Park: pillars on (odd, odd), row 4 and column 4 open.
 */
function duelAt(x: number, y: number) {
  const s = sandbox();
  put(s, 0, x, y);
  put(s, 1, 14, 0);
  return s;
}

describe('kick (Football Boots)', () => {
  it('walking into a generator kicks it; it slides tile by tile until it meets a crate', () => {
    const s = duelAt(2, 4);
    s.players[0]!.contact = 'kick';
    addSoft(s, 9, 4);
    const g = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 9999 });
    const ev = run(s, 1, { 0: { move: 'right' } });
    expect(eventsOf(ev, 'contactUsed')).toEqual([
      { type: 'contactUsed', playerId: 0, ability: 'kick', generatorId: g.id },
    ]);
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([2, 4]); // the kicker stays put
    const xs = new Set<number>();
    for (let i = 0; i < 120; i++) {
      run(s, 1);
      xs.add(g.x);
    }
    expect([g.x, g.y]).toEqual([8, 4]); // stopped by the crate at (9,4)
    expect([...xs].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8]); // never skipped a tile
  });

  it('stops at a player in the way and cannot be kicked into concrete', () => {
    const s = duelAt(2, 4);
    s.players[0]!.contact = 'kick';
    put(s, 1, 6, 4);
    const g = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 9999 });
    run(s, 1, { 0: { move: 'right' } });
    run(s, 120);
    expect([g.x, g.y]).toEqual([5, 4]);

    // kicked up the open column x = 2, it stops at the arena edge: never into concrete, never off the board
    const t = duelAt(2, 3);
    t.players[0]!.contact = 'kick';
    const h = addGenerator(t, { ownerId: 1, x: 2, y: 2, timer: 9999 });
    run(t, 1, { 0: { move: 'up' } });
    run(t, 200);
    expect(h.x).toBe(2);
    expect(tileAt(t, h.x, h.y)).toBe(Tile.Empty); // slid to the top edge, never into concrete
    expect(h.y).toBe(0);
  });

  it('holding the direction does not double-fire: one kick, then the player walks after it', () => {
    const s = duelAt(2, 4);
    s.players[0]!.contact = 'kick';
    addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 9999 });
    const ev = run(s, 30, { 0: { move: 'right' } });
    expect(eventsOf(ev, 'contactUsed')).toHaveLength(1);
    expect(s.players[0]!.x).toBeGreaterThan(2);
  });
});

describe('punch (Mechanic Gloves)', () => {
  it('walking into a generator punches it 3 tiles OVER obstacles in an arc, without detonating it', () => {
    const s = duelAt(2, 4);
    s.players[0]!.contact = 'punch';
    addSoft(s, 4, 4); // in the way: a punch flies over it (a kick could not)
    const g = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 200 });
    const ev = run(s, 1, { 0: { move: 'right' } });
    expect(eventsOf(ev, 'contactUsed')[0]!.ability).toBe('punch');
    expect(eventsOf(ev, 'generatorThrown')).toHaveLength(1);
    expect([g.x, g.y]).toEqual([6, 4]);
    expect(g.flight).not.toBeNull(); // airborne: the renderer draws the arc
    run(s, 40);
    expect(g.flight).toBeNull();
    expect(s.flames).toHaveLength(0);
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([2, 4]);
  });

  it('lands on the first free tile beyond 3 when the landing tile is taken, and is distinct from a kick', () => {
    const s = duelAt(2, 4);
    s.players[0]!.contact = 'punch';
    addSoft(s, 6, 4);
    const g = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 200 });
    run(s, 1, { 0: { move: 'right' } });
    expect([g.x, g.y]).toEqual([7, 4]);
    expect(g.slide).toBeNull();
  });
});

describe('disarm (Kill Switch charges)', () => {
  it('walking into a generator switches it off and uses a charge; the ability ends with the last charge', () => {
    const s = duelAt(2, 4);
    addPickup(s, 2, 4, 'killswitch');
    run(s, 1);
    const p = s.players[0]!;
    expect(p.contact).toBe('disarm');
    expect(p.killSwitchCharges).toBe(s.config.pickups.killSwitchCharges);
    const a = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 50 });
    const ev = run(s, 1, { 0: { move: 'right' } });
    expect(eventsOf(ev, 'generatorDisarmed')).toHaveLength(1);
    expect(a.mode).toBe('disabled');
    // walking into the already disarmed one again wastes nothing
    run(s, 20, { 0: { move: 'right' } });
    expect(p.killSwitchCharges).toBe(s.config.pickups.killSwitchCharges - 1);
    // a second generator above uses the last charge, and Disarm is gone
    const b = addGenerator(s, { ownerId: 1, x: 2, y: 3, timer: 50 });
    run(s, 12);
    run(s, 1, { 0: { move: 'up' } });
    expect(b.mode).toBe('disabled');
    expect(p.killSwitchCharges).toBe(0);
    expect(p.contact).toBeNull();
  });

  it('LOCKED: a Kill-Switched generator still explodes from flame', () => {
    const s = duelAt(2, 4);
    const p = s.players[0]!;
    p.contact = 'disarm';
    p.killSwitchCharges = 2;
    const a = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 9999 });
    run(s, 1, { 0: { move: 'right' } });
    expect(a.mode).toBe('disabled');
    addGenerator(s, { ownerId: 1, x: 6, y: 4, timer: 2, range: 3 });
    put(s, 0, 0, 0);
    const ev = run(s, 5);
    expect(eventsOf(ev, 'generatorExploded').map((e) => e.generatorId)).toContain(a.id);
  });
});

describe('pass (Generator Pass)', () => {
  it('walks through a generator tile, and it gives NO protection when it goes off', () => {
    const s = duelAt(2, 4);
    const p = s.players[0]!;
    p.contact = 'pass';
    const g = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 9999 });
    run(s, 1, { 0: { move: 'right' } });
    expect([p.x, p.y]).toEqual([3, 4]);
    run(s, 12);
    g.timer = 1;
    run(s, 3);
    expect(p.alive).toBe(false);
  });
});

describe('one ability at a time', () => {
  it('the last contact pickup replaces the previous one (a replaced Disarm loses its charges)', () => {
    const s = duelAt(2, 4);
    const p = s.players[0]!;
    addPickup(s, 3, 4, 'killswitch');
    addPickup(s, 4, 4, 'boots');
    addPickup(s, 5, 4, 'gloves');
    addPickup(s, 6, 4, 'bombpass');
    const seen: (string | null)[] = [];
    let equipped = 0;
    for (let i = 0; i < 4; i++) {
      const ev = run(s, 1, { 0: { move: 'right' } });
      ev.push(...run(s, 12));
      equipped += eventsOf(ev, 'contactEquipped').length;
      seen.push(p.contact);
      if (i === 1) expect(p.killSwitchCharges).toBe(0);
    }
    expect(seen).toEqual(['disarm', 'kick', 'punch', 'pass']);
    expect(equipped).toBe(4);
  });

  it('with nothing equipped a generator simply blocks the way (collision guarantee)', () => {
    const s = duelAt(2, 4);
    const g = addGenerator(s, { ownerId: 1, x: 3, y: 4, timer: 9999 });
    const ev = run(s, 30, { 0: { move: 'right' } });
    expect(eventsOf(ev, 'contactUsed')).toHaveLength(0);
    expect([s.players[0]!.x, g.x, g.slide, g.flight]).toEqual([2, 3, null, null]);
    expect(moveWouldAct(s, s.players[0]!, 'right')).toBe(false);
    s.players[0]!.contact = 'kick';
    expect(moveWouldAct(s, s.players[0]!, 'right')).toBe(true);
    expect(moveWouldAct(s, s.players[0]!, 'down')).toBe(true); // open floor
    put(s, 0, 1, 4);
    expect(moveWouldAct(s, s.players[0]!, 'down')).toBe(false); // (1,5) is concrete
  });
});
