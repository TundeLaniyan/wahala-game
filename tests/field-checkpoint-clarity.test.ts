/**
 * Checkpoint clarity (docs/CHECKPOINT_CLARITY.md, decisions CK1-CK8): the read-only view data a field mission adds for
 * its presentation (node kind, the current checkpoint, the door hold, the route), the HUD models built from it (goal tag
 * and target, hold readout, compass target, minimap current marker), the rail notices when a checkpoint is walked
 * through, and the plain wording of every field leg. None of it changes a rule: the same sim, the same ticks.
 */
import { describe, expect, it } from 'vitest';
import {
  DOOR_HOLD_TICKS,
  FIELD_MISSION_DEFS,
  FIELD_MISSION_IDS,
  getFieldMission,
  missionView,
} from '../src/sim';
import type { GameState, MissionView } from '../src/sim';
import { fieldNextText, fieldNotices, holdReadout } from '../src/app/fieldGoal';
import type { FieldNoticeMemory } from '../src/app/fieldGoal';
import { fieldGoalModel, missionPanelModel } from '../src/ui/missionPanelModel';
import { compassTarget } from '../src/ui/missionCompassModel';
import { minimapMission } from '../src/ui/minimapModel';
import { missionBossBar } from '../src/ui/campaignHealthModel';
import { advance, put } from './mission-helpers';
import { newField } from './field-helpers';

const APPROACH = 'oshodi.approach';
const MARKERS = [
  [9, 39],
  [19, 39],
  [26, 40],
] as const;
const view = (s: GameState): MissionView => missionView(s)!;

/** Walks the human onto checkpoint `i` (staged position, one tick). */
function reach(s: GameState, i: number): void {
  put(s, 0, MARKERS[i]![0], MARKERS[i]![1]);
  advance(s, 1);
}

describe('field view: walk-through checkpoints and hold doors are told apart', () => {
  it('checkpoints are kind "checkpoint", the depot door is kind "hold"; only the current checkpoint is live', () => {
    const s = newField(APPROACH);
    advance(s, 1);
    const v = view(s);
    const mk = v.nodes.filter((n) => n.kind === 'checkpoint');
    expect(mk.map((n) => n.label)).toEqual(['CHECKPOINT A', 'CHECKPOINT B', 'CHECKPOINT C']);
    expect(mk.map((n) => n.state)).toEqual(['live', 'locked', 'locked']);
    expect(v.route!.map((r) => r.state)).toEqual(['live', 'locked', 'locked']);
    reach(s, 0);
    reach(s, 1);
    reach(s, 2);
    const door = view(s).nodes.find((n) => n.id === 'depot')!;
    expect(door.kind).toBe('hold');
    expect(door.optional).toBe(false);
    // reached checkpoints of the finished leg stay in the route (done), for the beacons
    expect(view(s).route!.map((r) => r.state)).toEqual(['done', 'done', 'done']);
  });

  it('the goal names the CURRENT checkpoint with its step, and moves on the tick it is reached', () => {
    const s = newField(APPROACH);
    advance(s, 1);
    let g = view(s).fieldGoal!;
    expect(g).toMatchObject({ verb: 'goTo', nodeId: 'mk0', target: 'CHECKPOINT A', x: 9, y: 39 });
    expect(g.step).toEqual({ index: 0, count: 3 });
    expect(g.fightsOptional).toBe(true);
    reach(s, 0);
    g = view(s).fieldGoal!;
    expect(g).toMatchObject({ nodeId: 'mk1', target: 'CHECKPOINT B', step: { index: 1, count: 3 } });
    reach(s, 1);
    reach(s, 2);
    g = view(s).fieldGoal!;
    expect(g).toMatchObject({ verb: 'hold', nodeId: 'depot', target: 'DISPATCH DEPOT' });
  });

  it('a later checkpoint does nothing: only the current one counts (unchanged rule)', () => {
    const s = newField(APPROACH);
    put(s, 0, 19, 39); // checkpoint B before A
    advance(s, 5);
    expect(view(s).fieldGoal!.nodeId).toBe('mk0');
    expect(s.mission!.field!.markersDone).toBe(0);
  });

  it('the door hold fills while standing on it and drains when stepping off, in ticks of DOOR_HOLD_TICKS', () => {
    const s = newField(APPROACH);
    for (const i of [0, 1, 2]) reach(s, i);
    let h = view(s).fieldGoal!.hold!;
    expect(h).toMatchObject({ doorId: 'depot', ticks: 0, goalTicks: DOOR_HOLD_TICKS, standing: false });
    put(s, 0, 25, 44);
    advance(s, 24);
    h = view(s).fieldGoal!.hold!;
    expect(h.standing).toBe(true);
    expect(h.ticks).toBe(24);
    expect(h.fraction).toBeCloseTo(24 / DOOR_HOLD_TICKS);
    expect(holdReadout(h)).toMatchObject({ label: 'HOLD 0.4 / 1.0 s', state: 'filling', hint: 'STAY ON IT' });
    put(s, 0, 25, 43);
    advance(s, 4);
    h = view(s).fieldGoal!.hold!;
    expect(h.standing).toBe(false);
    expect(h.ticks).toBe(16); // drains 2 per tick (unchanged rule)
    expect(holdReadout(h)).toMatchObject({
      label: 'HOLD 0.3 / 1.0 s',
      state: 'draining',
      hint: 'STEP BACK ON',
    });
    put(s, 0, 25, 44);
    advance(s, DOOR_HOLD_TICKS);
    expect(s.mission!.pendingRaid?.doorId).toBe('depot');
    expect(holdReadout(view(s).fieldGoal!.hold!).state).toBe('full');
  });

  it('the view additions change nothing in the run: same ticks, same state hash with or without reading them', () => {
    const a = newField(APPROACH, { seed: 3 });
    const b = newField(APPROACH, { seed: 3 });
    for (let t = 0; t < 300; t++) {
      advance(a, 1);
      view(a); // read every tick
      advance(b, 1);
    }
    expect(JSON.stringify(a.players.map((p) => [p.x, p.y]))).toBe(
      JSON.stringify(b.players.map((p) => [p.x, p.y])),
    );
    expect(a.tick).toBe(b.tick);
  });
});

describe('HUD models from the view', () => {
  it('panel: GO TO + target + step, no boss row and no boss bar in a field mission', () => {
    const s = newField(APPROACH);
    advance(s, 1);
    const v = view(s);
    const g = fieldGoalModel(v)!;
    expect(g).toMatchObject({ tag: 'GO TO', target: 'CHECKPOINT A', step: '1 OF 3', hold: null });
    expect(g.notes).toContain('WALK THROUGH, NO WAITING');
    expect(g.notes).toContain('FIGHTS OPTIONAL');
    const panel = missionPanelModel(v);
    expect(panel.showBoss).toBe(false);
    expect(panel.field).not.toBeNull();
    expect(missionBossBar(v)).toBeNull();
  });

  it('panel: HOLD + door target + the hold readout on the door leg', () => {
    const s = newField(APPROACH);
    for (const i of [0, 1, 2]) reach(s, i);
    put(s, 0, 25, 44);
    advance(s, 30);
    const g = fieldGoalModel(view(s))!;
    expect(g).toMatchObject({ tag: 'HOLD', target: 'DISPATCH DEPOT DOOR', step: null });
    expect(g.hold).toMatchObject({ label: 'HOLD 0.5 / 1.0 s', state: 'filling' });
    expect(g.notes).toContain('STAND STILL ON IT');
  });

  it('defeat / escape / return tags on the other legs', () => {
    const rail = newField('oshodi.railEdge');
    advance(rail, 1);
    const d = fieldGoalModel(view(rail))!;
    expect(d.tag).toBe('DEFEAT');
    expect(d.target).toBe('2 ENEMIES LEFT');
    expect(d.notes).toContain('ALL MUST GO DOWN');
    expect(d.notes).not.toContain('FIGHTS OPTIONAL');
    for (const seat of rail.mission!.seats.filter((x) => x.group === 'hawkers'))
      rail.players[seat.playerId]!.alive = false;
    advance(rail, 2);
    const e = fieldGoalModel(view(rail))!;
    expect(e).toMatchObject({ tag: 'ESCAPE', target: 'FOOTBRIDGE' });
    put(rail, 0, 59, 28);
    advance(rail, 2);
    expect(fieldGoalModel(view(rail))).toMatchObject({ tag: 'RETURN', target: 'PARK GATE' });
    expect(view(rail).callout).toBe('Return to PARK GATE to finish.');
  });

  it('compass: always the CURRENT checkpoint, never a nearer later one or an optional door', () => {
    const s = newField(APPROACH);
    advance(s, 1);
    // stand right beside checkpoint B: the compass still points at A
    const t = compassTarget(view(s), { x: 19, y: 40 }, null)!;
    expect(t.id).toBe('mk0');
    expect([t.x, t.y]).toEqual([9, 39]);
    reach(s, 0);
    expect(compassTarget(view(s), { x: 9, y: 39 }, null)!.id).toBe('mk1');

    // Mushin market: an optional bonus door is open from the start; the compass prefers the route
    const mk = newField('mushin.market');
    advance(mk, 1);
    const v = view(mk);
    expect(v.nodes.find((n) => n.id === 'backStall')).toMatchObject({ kind: 'hold', optional: true });
    const door = v.nodes.find((n) => n.id === 'backStall')!;
    expect(compassTarget(v, { x: door.x, y: door.y + 1 }, null)!.id).toBe('group');
  });

  it('minimap: the current objective is marked, doors are hold nodes', () => {
    const s = newField(APPROACH);
    advance(s, 1);
    const mm = minimapMission(s)!;
    expect(mm.nodes.filter((n) => n.current).map((n) => n.id)).toEqual(['mk0']);
    expect(mm.nodes.every((n) => n.kind === 'checkpoint')).toBe(true);
    for (const i of [0, 1, 2]) reach(s, i);
    const after = minimapMission(s)!;
    expect(after.nodes.find((n) => n.id === 'depot')).toMatchObject({ kind: 'hold', current: true });
  });
});

describe('rail notices on reach', () => {
  it('"CHECKPOINT A ✓ · NEXT: CHECKPOINT B" the moment A is walked through, nothing before', () => {
    const s = newField(APPROACH);
    advance(s, 1);
    let mem: FieldNoticeMemory | null = null;
    let r = fieldNotices(mem, view(s));
    expect(r.notices).toEqual([]); // the first view of a mission announces nothing
    mem = r.memory;
    advance(s, 10);
    r = fieldNotices(mem, view(s));
    expect(r.notices).toEqual([]);
    mem = r.memory;
    reach(s, 0);
    r = fieldNotices(mem, view(s));
    expect(r.notices.map((n) => n.text)).toEqual(['CHECKPOINT A ✓ · NEXT: CHECKPOINT B']);
    mem = r.memory;
    reach(s, 1);
    reach(s, 2);
    r = fieldNotices(mem, view(s));
    // two reached between two HUD frames: each names what follows it
    expect(r.notices.map((n) => n.text)).toEqual([
      'CHECKPOINT B ✓ · NEXT: CHECKPOINT C',
      'CHECKPOINT C ✓ · NEXT: HOLD THE DISPATCH DEPOT DOOR',
    ]);
  });

  it('a leg that is not a checkpoint announces itself; a raid in between (no view) keeps the memory', () => {
    const rail = newField('oshodi.railEdge');
    advance(rail, 1);
    let mem = fieldNotices(null, view(rail)).memory;
    for (const seat of rail.mission!.seats.filter((x) => x.group === 'hawkers'))
      rail.players[seat.playerId]!.alive = false;
    advance(rail, 2);
    mem = fieldNotices(mem, null).memory; // e.g. a raid was playing
    const r = fieldNotices(mem, view(rail));
    expect(r.notices.map((n) => n.text)).toEqual(['ENEMIES DOWN ✓ · NEXT: ESCAPE TO FOOTBRIDGE']);
  });

  it('next-objective wording', () => {
    const s = newField(APPROACH);
    advance(s, 1);
    expect(fieldNextText(view(s).fieldGoal!)).toBe('CHECKPOINT A');
  });
});

describe('plain objective wording for every field leg (all eleven missions)', () => {
  const LEAD = {
    reachMarkers: /^Walk through /,
    clearGroup: /^Defeat the \d /,
    escapeRoute: /^Escape to the .+ before .+ catches you\.$/,
    door: /^Stand on the .+ door for 1 second/,
  } as const;

  it('there are eleven field missions', () => {
    expect(FIELD_MISSION_IDS).toHaveLength(11);
  });

  it.each(FIELD_MISSION_IDS)(
    '%s: each line says exactly what to do, with the right counts, briefly',
    (id) => {
      const def = getFieldMission(id);
      for (const leg of def.legs) {
        expect(leg.text, `${id} ${leg.kind}`).toMatch(LEAD[leg.kind]);
        expect(leg.text.length, leg.text).toBeLessThanOrEqual(64);
        expect(leg.text).not.toMatch(/\bhold\b/i); // "hold" is the door's tag word only; legs say "stand on ... for 1 second"
        if (leg.kind === 'clearGroup') {
          const n = def.enemies.filter((e) => e.group === leg.group).length;
          expect(leg.text, id).toContain(`Defeat the ${n} `);
        }
        if (leg.kind === 'reachMarkers' && leg.markers.length > 2)
          expect(leg.text, id).toContain(`${leg.markers.length} `);
        if (leg.kind === 'door') expect(DOOR_HOLD_TICKS).toBe(60); // "1 second" is the real hold
      }
      expect(FIELD_MISSION_DEFS[id]).toBe(def);
    },
  );
});
