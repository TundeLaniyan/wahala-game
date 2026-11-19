/**
 * The in-game objective guidance (docs/MISSION_GUIDANCE.md, decisions MG5-MG7) on the real raid and field runtimes:
 * the counter moves the tick a target is really wrecked by a blast, the success notice names the count and the next
 * step, the exit guidance takes over when the last marked cargo goes, and the route cue walks the corridors (every step
 * an open floor tile), never through a pillar.
 */
import { describe, expect, it } from 'vitest';
import { buildHud } from '../../src/app/hud';
import { raidNotice } from '../../src/app/raidNotices';
import { fieldNotices } from '../../src/app/fieldGoal';
import { fieldGoalModel } from '../../src/ui/missionPanelModel';
import { missionView, raidView } from '../../src/sim';
import type { GameState, SimEvent } from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { explodeAt, newRaid } from '../raid-helpers';
import { advance, newMission } from '../mission-helpers';

/** An open floor tile next to (x, y), for a generator laid beside a target. */
function besides(s: GameState, x: number, y: number): { x: number; y: number } {
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (
      s.tiles[ny * s.width + nx] === Tile.Empty &&
      !s.players.some((p) => p.alive && p.x === nx && p.y === ny)
    )
      return { x: nx, y: ny };
  }
  throw new Error(`no floor beside ${x},${y}`);
}

/** Separate blasts beside the piece until it goes (the real blast rules decide). */
function blastUntil(s: GameState, x: number, y: number, gone: () => boolean, sink: SimEvent[]): void {
  for (let i = 0; i < 6 && !gone(); i++) {
    const at = besides(s, x, y);
    sink.push(...explodeAt(s, at.x, at.y, 0, 1));
    sink.push(...advance(s, 40)); // the flames burn out before the next blast
  }
  expect(gone(), `the piece at ${x},${y} went down`).toBe(true);
}

const shield = (s: GameState): void => {
  const me = s.players[0]!;
  me.protectedUntil = s.tick + 100000; // staging only: nothing may end the run while the blasts are laid by hand
};

describe('raid guidance', () => {
  it('the counter goes down with each marked cargo really destroyed, then the exit takes over', () => {
    const s = newRaid('warehouseDispatchDepot');
    shield(s);
    const marked = s.raid!.cargo.filter((c) => c.marked);
    let hud = buildHud(s, 0, null);
    expect(hud.raid).toMatchObject({
      verb: 'destroy',
      tag: 'DESTROY',
      target: 'MARKED CARGO',
      step: `0/${marked.length}`,
    });
    // the route cue walks open floor, one tile at a time from the human
    const cue = hud.raid!.cue!;
    expect(cue.via).toBe('walk');
    for (const [i, step] of (cue as unknown as { steps: { x: number; y: number }[] }).steps.entries()) {
      expect(s.tiles[step.y * s.width + step.x], `step ${i}`).toBe(Tile.Empty);
    }

    const events: SimEvent[] = [];
    marked.forEach((c, i) => {
      shield(s);
      const sink: SimEvent[] = [];
      blastUntil(s, c.x, c.y, () => c.destroyed, sink);
      events.push(...sink);
      hud = buildHud(s, 0, null);
      const down = sink.find((e) => e.type === 'cargoDestroyed' && e.marked)!;
      expect(down, 'a cargoDestroyed event').toBeDefined();
      const notice = raidNotice(down, raidView(s))!;
      if (i < marked.length - 1) {
        expect(hud.raid!.step).toBe(`${i + 1}/${marked.length}`);
        expect(notice.text).toBe(`MARKED CARGO DOWN ${i + 1}/${marked.length} ✓ · NEXT: MARKED CARGO`);
      } else {
        // the last one: the exit is open and the guidance points at it
        expect(notice.text).toBe(
          `MARKED CARGO DOWN ${marked.length}/${marked.length} ✓ · NEXT: REACH THE EXIT`,
        );
        expect(raidView(s)!.extraction.open).toBe(true);
        expect(hud.raid).toMatchObject({ verb: 'exit', tag: 'EXIT', target: 'REACH THE EXIT', step: null });
        expect(hud.raid!.cue).not.toBeNull();
      }
    });
    expect(events.some((e) => e.type === 'raidExtractionOpened')).toBe(true);
  });
});

describe('field guidance', () => {
  it('a destroy leg counts each piece wrecked by a real blast and says so in the rail', () => {
    // keepSoft: the equipment (and the crates) stand on the board as in play
    const s = newMission({ id: 'oshodi', fieldId: 'oshodi.railEdge' }, { keepSoft: true });
    advance(s, 2);
    // the hawkers are a clearGroup leg: put them down to reach the relay boxes (the leg order is the data's)
    for (const seat of s.mission!.seats.filter((x) => x.group === 'hawkers'))
      s.players[seat.playerId]!.alive = false;
    advance(s, 2);
    shield(s);
    let view = missionView(s)!;
    expect(view.legKind).toBe('destroyTargets');
    const pieces = s.mission!.field!.targets!.filter((t) => t.leg === s.mission!.field!.leg);
    let model = fieldGoalModel(view)!;
    expect(model.step).toBe(`0/${pieces.length}`);
    expect(model.target).toBe(pieces[0]!.label);
    // the way there: a route cue in the HUD snapshot
    const hud = buildHud(s, 0, null);
    expect(hud.fieldCue).not.toBeNull();
    expect(['walk', 'blast']).toContain(hud.fieldCue!.via);

    let memory = fieldNotices(null, view).memory;
    const first = pieces[0]!;
    const sink: SimEvent[] = [];
    blastUntil(s, first.x, first.y, () => first.destroyed, sink);
    view = missionView(s)!;
    model = fieldGoalModel(view)!;
    expect(model.step).toBe(`1/${pieces.length}`);
    const out = fieldNotices(memory, view);
    memory = out.memory;
    expect(out.notices.map((n) => n.text)).toEqual([
      `${first.label} WRECKED 1/${pieces.length} ✓ · NEXT: DESTROY ${view.fieldGoal!.target}`,
    ]);
    // nothing new: no second notice
    expect(fieldNotices(memory, missionView(s)!).notices).toEqual([]);
    expect(sink.some((e) => e.type === 'fieldTargetHit')).toBe(true);
  });
});
