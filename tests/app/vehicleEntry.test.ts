import { describe, expect, it } from 'vitest';
import { VehicleEntryController } from '../../src/app/vehicleEntry';
import { sandbox } from '../helpers';

function open(character: 'streetBaller' | 'lekkiBoy' | 'campusQueen') {
  const s = sandbox({ characters: [character, 'streetBaller'] });
  s.players[0]!.hasVoucher = true;
  s.players[0]!.entryUntil = s.tick + s.config.vehicles.entryWindowTicks;
  const c = new VehicleEntryController(0);
  c.sync(s);
  return { s, c };
}

describe('VehicleEntryController', () => {
  it('opens when the simulation enters entry mode and closes when it ends', () => {
    const { s, c } = open('streetBaller');
    expect(c.active).toBe(true);
    expect(c.overlay(s)!.entries).toHaveLength(28);
    s.players[0]!.entryUntil = null;
    c.sync(s);
    expect(c.active).toBe(false);
    expect(c.overlay(s)).toBeNull();
  });

  it('arrow navigation moves focus to a different legal entry and confirm launches a straight vehicle', () => {
    const { s, c } = open('lekkiBoy');
    const first = c.overlay(s)!.focusKey;
    c.nav('right', s);
    c.nav('down', s);
    const moved = c.overlay(s)!.focusKey;
    expect(moved).not.toBe(first);
    const intent = c.nav('confirm', s);
    expect(intent).toMatchObject({ type: 'launch' });
    expect(intent && intent.type === 'launch' && intent.turn).toBeFalsy();
  });

  it('Keke needs a second step to choose its single turn', () => {
    const { s, c } = open('campusQueen');
    expect(c.nav('confirm', s)).toBeNull();
    expect(c.currentStage).toBe('turn');
    const model = c.overlay(s)!;
    expect(model.turns.length).toBeGreaterThan(0);
    expect(model.route!.length).toBeGreaterThan(5);
    c.nav('right', s);
    const intent = c.nav('confirm', s);
    expect(intent).toMatchObject({ type: 'launch', turn: expect.anything() });
    // Back steps from the turn stage to the entry stage before cancelling
    const again = open('campusQueen');
    again.c.nav('confirm', again.s);
    expect(again.c.nav('cancel', again.s)).toBeNull();
    expect(again.c.currentStage).toBe('entry');
    expect(again.c.nav('cancel', again.s)).toEqual({ type: 'cancel' });
  });

  it('a pick selects first and confirms on the second pick of the same marker', () => {
    const { s, c } = open('streetBaller');
    const target = c.overlay(s)!.entries[5]!;
    const key = `${target.x},${target.y},${target.dir}`;
    expect(c.pick({ kind: 'entry', key }, s)).toBeNull();
    expect(c.overlay(s)!.focusKey).toBe(key);
    expect(c.pick({ kind: 'entry', key }, s)).toMatchObject({ type: 'launch', entry: target });
  });

  it('suggests the lane closest to the nearest rival without taking over the choice', () => {
    const s = sandbox({ characters: ['streetBaller', 'streetBaller'] });
    s.players[0]!.hasVoucher = true;
    s.players[0]!.entryUntil = s.tick + 480;
    s.players[0]!.x = 0;
    s.players[0]!.y = 10;
    s.players[1]!.x = 8;
    s.players[1]!.y = 2;
    const c = new VehicleEntryController(0);
    c.sync(s);
    const focus = c.overlay(s)!;
    const entry = focus.entries.find((e) => `${e.x},${e.y},${e.dir}` === focus.focusKey)!;
    const lane = focus.route!;
    expect(lane.some((t) => Math.abs(t.x - 8) + Math.abs(t.y - 2) <= 1)).toBe(true);
    expect(entry).toBeDefined();
  });
});
