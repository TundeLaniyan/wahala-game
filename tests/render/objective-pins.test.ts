/**
 * The objective pins (decision MG4): which live targets wear a pin in the world, on the real raid and field runtimes,
 * and the view that draws them (headless, a fake canvas): a pin per target, ordinary crates without one, the exit's pin
 * once it opens, and a gone target's pin popping away.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { objectivePins } from '../../src/render/views/objectivePins';
import { ObjectiveMarkers } from '../../src/render/views/ObjectiveMarkers';
import { createLayout } from '../../src/render/coords';
import type { FrameContext } from '../../src/render/views/types';
import type { GameState } from '../../src/sim';
import { newRaid } from '../raid-helpers';
import { advance, newMission } from '../mission-helpers';
import { sandbox } from '../helpers';

describe('objectivePins', () => {
  it('a raid: every marked cargo and switch, no ordinary crate; the exit once it opens', () => {
    const s = newRaid('warehouseDispatchDepot');
    const marked = s.raid!.cargo.filter((c) => c.marked);
    const unmarked = s.raid!.cargo.filter((c) => !c.marked);
    let pins = objectivePins(s);
    expect(pins.filter((p) => p.glyph === 'cargo')).toHaveLength(marked.length);
    expect(pins.filter((p) => p.glyph === 'switch')).toHaveLength(s.raid!.switches.length);
    expect(pins.some((p) => p.glyph === 'exit')).toBe(false);
    for (const c of unmarked) expect(pins.some((p) => p.x === c.x && p.y === c.y)).toBe(false);
    // the marked cargo goes, the exit opens: its pin takes over
    for (const c of marked) c.destroyed = true;
    s.raid!.stage = 'extract';
    s.raid!.extraction.open = true;
    pins = objectivePins(s);
    expect(pins.filter((p) => p.glyph === 'cargo')).toHaveLength(0);
    expect(pins.filter((p) => p.glyph === 'exit')).toEqual([
      expect.objectContaining({ x: s.raid!.extraction.x, y: s.raid!.extraction.y, tone: 'exit' }),
    ]);
  });

  it('a field mission: only the current destroy leg wears pins; a wrecked piece drops its pin', () => {
    const s = newMission({ id: 'oshodi', fieldId: 'oshodi.railEdge' }, { keepSoft: true });
    advance(s, 2);
    expect(objectivePins(s)).toEqual([]); // the hawkers first: no target pins yet
    for (const seat of s.mission!.seats.filter((x) => x.group === 'hawkers')) s.players[seat.playerId]!.alive = false;
    advance(s, 2);
    const leg = s.mission!.field!.leg;
    const pieces = s.mission!.field!.targets!.filter((t) => t.leg === leg);
    expect(objectivePins(s).map((p) => p.key)).toEqual(pieces.map((t) => `tg:${t.id}`));
    pieces[0]!.destroyed = true;
    expect(objectivePins(s)).toHaveLength(pieces.length - 1);
  });

  it('a normal match has none', () => {
    expect(objectivePins(sandbox())).toEqual([]);
  });
});

describe('ObjectiveMarkers view', () => {
  beforeAll(() => {
    vi.stubGlobal('document', {
      createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => null }),
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  const ctx = (state: GameState, time: number): FrameContext =>
    ({ state, time, alpha: 0, dt: 1 / 60, layout: createLayout(state.width, state.height) }) as unknown as FrameContext;

  it('one sprite per live target, over it and above the floor; a destroyed target pops away', () => {
    const s = newRaid('warehouseDispatchDepot');
    const view = new ObjectiveMarkers();
    view.update(ctx(s, 0));
    const marked = s.raid!.cargo.filter((c) => c.marked);
    expect(view.stats().byGlyph.cargo).toBe(marked.length);
    const sprite = view.group.getObjectByName(`pin:cargo:${marked[0]!.id}`)!;
    expect(sprite.position.y).toBeGreaterThan(1);
    const layout = createLayout(s.width, s.height);
    expect(sprite.position.x).toBeCloseTo(layout.wx(marked[0]!.x));
    marked[0]!.destroyed = true;
    view.update(ctx(s, 0.1));
    expect(view.stats().byGlyph.cargo).toBe(marked.length - 1);
    expect(view.group.getObjectByName(`pin:cargo:${marked[0]!.id}`)).toBeDefined(); // popping
    view.update(ctx(s, 1));
    expect(view.group.getObjectByName(`pin:cargo:${marked[0]!.id}`)).toBeUndefined(); // gone
    view.dispose();
  });
});
