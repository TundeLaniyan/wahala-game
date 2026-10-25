import { describe, expect, it } from 'vitest';
import {
  autoRouteOptions,
  buildRoute,
  chooseAutoVehicle,
  drivableStretch,
  observe,
  scoreRoute,
} from '../src/sim';
import type { CharacterId, GameState, TilePos } from '../src/sim';
import { addSoft, eventsOf, put, run, sandbox } from './helpers';

/**
 * V2 one-press vehicle (founder A8): the simulation picks a useful LEGAL route by itself. Danfo Bus Park
 * 15 x 11, soft blocks cleared; concrete pillars on (odd, odd), so even rows / columns are open lanes.
 * A rival at (9,6) between crates at (8,6) and (10,6) is boxed in (pillars above and below).
 */
const has = (route: readonly TilePos[], x: number, y: number): boolean =>
  route.some((t) => t.x === x && t.y === y);

function boxedRival(owner: CharacterId): GameState {
  const s = sandbox({ characters: [owner, 'streetBaller'] });
  put(s, 0, 0, 10);
  put(s, 1, 9, 6);
  addSoft(s, 8, 6);
  addSoft(s, 10, 6);
  s.players[0]!.hasVoucher = true;
  return s;
}

/** Number of 90-degree turns along a route. */
function turns(route: readonly TilePos[]): number {
  let n = 0;
  for (let i = 2; i < route.length; i++) {
    const a = { x: route[i - 1]!.x - route[i - 2]!.x, y: route[i - 1]!.y - route[i - 2]!.y };
    const b = { x: route[i]!.x - route[i - 1]!.x, y: route[i]!.y - route[i - 1]!.y };
    if (a.x !== b.x || a.y !== b.y) n++;
  }
  return n;
}

describe('one-press vehicle: auto route choice', () => {
  it('Danfo: picks the lane through a walled-in rival, and running it eliminates them', () => {
    const s = boxedRival('streetBaller');
    const choice = chooseAutoVehicle(observe(s, 0), 0)!;
    expect(choice).not.toBeNull();
    expect(has(choice.route, 9, 6)).toBe(true);
    expect(choice.turn).toBeUndefined();
    expect(buildRoute(s, 'danfo', choice.entry)).toEqual(choice.route); // legal
    run(s, 1, { 0: { special: true } });
    expect(s.vehicles[0]!.route).toEqual(choice.route);
    run(s, 400);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('taxi: respects its soft-block limit (a lane where it would crash first is not chosen)', () => {
    const s = boxedRival('lekkiBoy');
    addSoft(s, 2, 6);
    addSoft(s, 4, 6); // from the left the taxi would break (2,6), (4,6), then crash into (8,6)
    const choice = chooseAutoVehicle(observe(s, 0), 0)!;
    expect(choice.entry).toEqual({ x: 14, y: 6, dir: 'left' });
    expect(drivableStretch(s, 'taxi', choice.route).some((t) => t.x === 9 && t.y === 6)).toBe(true);
    run(s, 1, { 0: { special: true } });
    run(s, 300);
    expect(s.players[1]!.alive).toBe(false);
  });

  it('Keke: a legal route with exactly ONE 90-degree turn that reaches the boxed rival', () => {
    const s = boxedRival('campusQueen');
    const choice = chooseAutoVehicle(observe(s, 0), 0)!;
    expect(choice.turn).toBeDefined();
    expect(buildRoute(s, 'keke', choice.entry, choice.turn)).toEqual(choice.route);
    expect(turns(choice.route)).toBe(1);
    expect(has(drivableStretch(s, 'keke', choice.route), 9, 6)).toBe(true);
    run(s, 1, { 0: { special: true } });
    run(s, 300);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('prefers a rival with no way out over one who can simply step aside', () => {
    const s = sandbox({ characters: ['streetBaller', 'streetBaller', 'lekkiBoy'] });
    put(s, 0, 0, 10);
    put(s, 1, 6, 2); // in the open: one step and they are off any lane
    put(s, 2, 9, 6);
    addSoft(s, 8, 6);
    addSoft(s, 10, 6);
    s.players[0]!.hasVoucher = true;
    const choice = chooseAutoVehicle(observe(s, 0), 0)!;
    expect(has(choice.route, 9, 6)).toBe(true);
  });

  it('with nobody trapped it still threatens: the route runs over a rival, not down an empty lane', () => {
    for (const owner of ['streetBaller', 'lekkiBoy', 'campusQueen'] as const) {
      const s = sandbox({ characters: [owner, 'streetBaller'] });
      put(s, 0, 0, 10);
      put(s, 1, 6, 4);
      const choice = chooseAutoVehicle(observe(s, 0), 0)!;
      expect(has(choice.route, 6, 4)).toBe(true);
      expect(choice.score).toBeGreaterThan(0);
    }
  });

  it('never drives over its owner, and avoids a teammate', () => {
    const s = boxedRival('streetBaller');
    put(s, 0, 2, 6); // the owner stands in the only lane through the boxed rival
    const choice = chooseAutoVehicle(observe(s, 0), 0)!;
    expect(choice).not.toBeNull();
    expect(has(choice.route, 2, 6)).toBe(false);
    for (const o of autoRouteOptions(s, 'danfo'))
      if (has(o.route, 2, 6)) expect(scoreRoute(s, 0, o.route)).toBeLessThan(0);

    const t = sandbox({ characters: ['streetBaller', 'lekkiBoy', 'campusQueen'] });
    t.players[0]!.team = 0;
    t.players[1]!.team = 0;
    t.players[2]!.team = 1;
    put(t, 0, 0, 10);
    put(t, 1, 6, 4); // teammate in the open on row 4 / column 6
    put(t, 2, 12, 4); // opponent on the same row
    const c = chooseAutoVehicle(observe(t, 0), 0)!;
    expect(has(c.route, 6, 4)).toBe(false);
    expect(has(c.route, 12, 4)).toBe(true);
  });

  it('blocked lanes: routes stop at concrete, short or illegal lanes are never offered', () => {
    const s = boxedRival('streetBaller');
    for (const kind of ['danfo', 'taxi', 'keke'] as const) {
      const opts = autoRouteOptions(s, kind);
      expect(opts.length).toBeGreaterThan(0);
      for (const o of opts) {
        expect(buildRoute(s, kind, o.entry, o.turn)).toEqual(o.route);
        expect(o.route.every((t) => s.tiles[t.y * s.width + t.x] !== 1)).toBe(true);
      }
    }
    // column 9 meets a pillar at (9,1) at once: never a lane
    expect(autoRouteOptions(s, 'danfo').some((o) => o.entry.x === 9 && o.entry.dir === 'down')).toBe(false);
  });

  it('is deterministic: the same board always gives the same route; the sim launches exactly that route', () => {
    const a = boxedRival('campusQueen');
    const b = boxedRival('campusQueen');
    expect(chooseAutoVehicle(observe(a, 0), 0)).toEqual(chooseAutoVehicle(observe(b, 0), 0));
    const ev = run(a, 1, { 0: { vehicle: { type: 'auto' } } });
    expect(eventsOf(ev, 'vehicleWarning')).toHaveLength(1);
    expect(a.vehicles[0]!.route).toEqual(chooseAutoVehicle(observe(b, 0), 0)!.route);
  });

  it('fair warning: the route is telegraphed for the full warning time before the vehicle drives', () => {
    const s = boxedRival('lekkiBoy');
    run(s, 1, { 0: { special: true } });
    const v = s.vehicles[0]!;
    expect(v.phase).toBe('warning');
    expect(v.warnRemaining).toBeGreaterThan(s.config.vehicles.entryWarnTicks - 3);
  });

  it('keeps the voucher when there is no legal route at all (the press does nothing)', () => {
    const s = sandbox({
      characters: ['streetBaller', 'lekkiBoy'],
      config: { vehicles: { minRouteTiles: 99 } },
    });
    put(s, 0, 4, 4);
    put(s, 1, 10, 4);
    s.players[0]!.hasVoucher = true;
    expect(chooseAutoVehicle(observe(s, 0), 0)).toBeNull();
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'specialUsed')).toHaveLength(0);
    expect(s.players[0]!.hasVoucher).toBe(true);
  });
});
