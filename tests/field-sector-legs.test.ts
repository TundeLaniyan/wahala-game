/**
 * The generator-sensitive field legs (docs/CAMPAIGN_SECTOR_AI.md, decision DS7): `destroyTargets` (Ring equipment only
 * the human's blasts wreck) and `holdArea` (keep a zone under control while enemy waves come in). No existing mission
 * uses them yet (the district worker assigns them), so the scenarios run on a test-only mission registered for this file
 * on the Oshodi terminal-approach sector.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIELD_MISSION_DEFS, directiveFor, missionView, tick } from '../src/sim';
import type { FieldMissionDef, GameState, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { fieldOnSoftHit } from '../src/sim/mission/equipment';
import { fieldCounter, fieldNextText, fieldNotes, fieldTargetText } from '../src/app/fieldGoal';
import { newMission, put } from './mission-helpers';
import { addGenerator } from './helpers';

const TEST_ID = 'test.sectorLegs';
const RELAY = { x: 10, y: 42 };
const TOLL = { x: 16, y: 42 };
const AREA = { x: 20, y: 39, radius: 1 };

const TEST_DEF: FieldMissionDef = {
  id: TEST_ID,
  districtId: 'oshodi',
  name: 'Sector legs (test)',
  sectorId: 'oshodi.terminalApproach',
  start: [3, 42],
  returnMarker: { x: 4, y: 38, label: 'ORITA GATE' },
  legs: [
    {
      kind: 'destroyTargets',
      text: 'Destroy the 2 Ring boxes with your generators.',
      targets: [
        { id: 'relay', kind: 'relayBox', ...RELAY, label: 'RELAY BOX' },
        { id: 'toll', kind: 'tollBox', ...TOLL, label: 'TOLL BOX', hp: 2 },
      ],
      crew: 'crew',
    },
    {
      kind: 'holdArea',
      text: 'Keep the junction clear for 5 seconds.',
      area: { ...AREA, label: 'JUNCTION' },
      holdSec: 5,
      waves: [{ group: 'wave', atSec: 2 }],
    },
  ],
  doors: [],
  enemies: [
    { role: 'meleeGuard', name: 'Box Minder', post: [12, 39], group: 'crew', radius: 3 },
    { role: 'meleeGuard', name: 'Wave Warden', post: [30, 42], group: 'wave', radius: 3 },
  ],
  timeLimitSec: 300,
  parSec: 200,
};

const defs = FIELD_MISSION_DEFS as Record<string, FieldMissionDef>;
beforeAll(() => {
  defs[TEST_ID] = TEST_DEF;
});
afterAll(() => {
  delete defs[TEST_ID];
});

/** The test mission, playing, crates cleared (the equipment stays), enemies parked out of the way unless asked. */
function scene(o: { enemies?: boolean } = {}): GameState {
  const s = newMission({ id: 'oshodi', fieldId: TEST_ID }, { keepSoft: true });
  const keep = new Set([RELAY.y * s.width + RELAY.x, TOLL.y * s.width + TOLL.x]);
  s.tiles = s.tiles.map((t, i) => (t === Tile.Soft && !keep.has(i) ? Tile.Empty : t));
  s.hidden = {};
  if (!o.enemies) for (const p of s.players.slice(1)) p.alive = false;
  return s;
}

/** Explodes a generator of `owner` at (x, y) right away; returns the tick's events. */
function blast(s: GameState, owner: number, x: number, y: number): SimEvent[] {
  addGenerator(s, { ownerId: owner, x, y, timer: 1, range: 2 });
  const out: SimEvent[] = [];
  for (let i = 0; i < 3; i++) out.push(...tick(s, {}));
  return out;
}

const tileAt = (s: GameState, p: { x: number; y: number }): number => s.tiles[p.y * s.width + p.x]!;
const hits = (events: SimEvent[]) =>
  events.filter((e): e is Extract<SimEvent, { type: 'fieldTargetHit' }> => e.type === 'fieldTargetHit');

describe('destroyTargets: Ring equipment only the human blasts wreck', () => {
  it('stands as solid equipment from the start; the view says DESTROY with the count', () => {
    const s = scene();
    expect(tileAt(s, RELAY)).toBe(Tile.Soft);
    expect(tileAt(s, TOLL)).toBe(Tile.Soft);
    expect(s.hidden[RELAY.y * s.width + RELAY.x]).toBeUndefined();
    tick(s, {});
    const v = missionView(s)!;
    expect(v.legKind).toBe('destroyTargets');
    expect(v.fieldGoal!.verb).toBe('destroy');
    expect(v.fieldGoal!.targets).toEqual({ left: 2, total: 2 });
    expect(v.progress).toEqual({ done: 0, goal: 2, label: 'equipment wrecked' });
    expect(v.nodes.filter((n) => n.kind === 'target').map((n) => n.label)).toEqual(['RELAY BOX', 'TOLL BOX']);
    expect(fieldTargetText(v.fieldGoal!)).toBe('RELAY BOX'); // the nearest one first
    expect(fieldCounter(v.fieldGoal!)).toBe('0/2'); // decision MG5: a done/total counter beside the target
    expect(fieldNextText(v.fieldGoal!)).toBe('DESTROY RELAY BOX');
    expect(fieldNotes(v.fieldGoal!)).toContain('BLASTS ONLY');
  });

  it('melee, vehicles, the closing city and an enemy blast leave it standing', () => {
    const s = scene({ enemies: true });
    put(s, 0, RELAY.x - 1, RELAY.y);
    for (let i = 0; i < 120; i++) tick(s, { 0: { special: true } }); // punches into the box: tiles take no melee
    expect(tileAt(s, RELAY)).toBe(Tile.Soft);
    const idx = RELAY.y * s.width + RELAY.x;
    const events: SimEvent[] = [];
    expect(fieldOnSoftHit(s, idx, 'vehicle', 0, events)).toBe(true);
    expect(fieldOnSoftHit(s, idx, 'crush', 0, events)).toBe(true);
    expect(events).toEqual([]);
    put(s, 0, 3, 42);
    const enemy = blast(s, 1, RELAY.x, RELAY.y - 1);
    expect(enemy.some((e) => e.type === 'generatorExploded')).toBe(true);
    expect(hits(enemy)).toEqual([]);
    expect(tileAt(s, RELAY)).toBe(Tile.Soft);
    expect(s.mission!.field!.targets!.every((t) => t.hp === t.maxHp)).toBe(true);
  });

  it('each separate human blast takes one hit point; the last piece completes the leg', () => {
    const s = scene();
    put(s, 0, 3, 42);
    const first = blast(s, 0, RELAY.x, RELAY.y - 1);
    expect(hits(first)).toMatchObject([{ targetId: 'relay', hpAfter: 0, left: 1, byId: 0 }]);
    expect(tileAt(s, RELAY)).toBe(Tile.Empty);
    expect(missionView(s)!.fieldGoal!.targets).toEqual({ left: 1, total: 2 });
    const second = blast(s, 0, TOLL.x, TOLL.y - 1);
    expect(hits(second)).toMatchObject([{ targetId: 'toll', hpAfter: 1, maxHp: 2, left: 1 }]);
    expect(tileAt(s, TOLL)).toBe(Tile.Soft);
    expect(s.mission!.field!.leg).toBe(0);
    const third = blast(s, 0, TOLL.x, TOLL.y - 1);
    expect(hits(third)).toMatchObject([{ targetId: 'toll', hpAfter: 0, left: 0 }]);
    tick(s, {});
    expect(s.mission!.field!.leg).toBe(1);
    expect(missionView(s)!.legKind).toBe('holdArea');
  });

  it('the crew guards the nearest standing piece while the leg runs', () => {
    const s = scene({ enemies: true });
    const crew = s.mission!.seats.find((x) => x.group === 'crew')!;
    expect(directiveFor(s, crew.playerId)).toEqual({ kind: 'guard', x: RELAY.x, y: RELAY.y, radius: 2 });
  });
});

describe('holdArea: keep the zone under control', () => {
  /** A scene already on the hold leg (the equipment wrecked by the human). */
  function onHold(o: { enemies?: boolean } = {}): GameState {
    const s = scene(o);
    put(s, 0, 3, 42);
    blast(s, 0, RELAY.x, RELAY.y - 1);
    blast(s, 0, TOLL.x, TOLL.y - 1);
    blast(s, 0, TOLL.x, TOLL.y - 1);
    tick(s, {});
    expect(s.mission!.field!.leg).toBe(1);
    return s;
  }

  it('time accrues only while the human is inside; the view says SECURE with the progress', () => {
    const s = onHold();
    for (let i = 0; i < 60; i++) tick(s, {});
    expect(missionView(s)!.fieldGoal!.area).toMatchObject({ ticks: 0, inside: false, contested: false });
    put(s, 0, AREA.x + 1, AREA.y);
    for (let i = 0; i < 120; i++) tick(s, {});
    const v = missionView(s)!;
    expect(v.fieldGoal!.verb).toBe('secure');
    expect(v.fieldGoal!.area!.inside).toBe(true);
    expect(v.fieldGoal!.area!.ticks).toBeGreaterThanOrEqual(115);
    expect(v.progress.label).toBe('seconds held');
    expect(fieldTargetText(v.fieldGoal!)).toBe('JUNCTION');
    expect(fieldCounter(v.fieldGoal!)).toMatch(/^[12]\/5 s$/); // decision MG5: seconds held / needed
    expect(v.nodes.find((n) => n.kind === 'area')!.state).toBe('progress');
    for (let i = 0; i < 200; i++) tick(s, {});
    expect(s.mission!.field!.leg).toBe(2); // held 5 s: on to the return route
  });

  it('an enemy inside the zone contests it: the time freezes', () => {
    const s = onHold({ enemies: true });
    put(s, 0, AREA.x, AREA.y);
    const wave = s.players[2]!;
    wave.protectedUntil = s.tick + 10_000;
    put(s, 2, AREA.x - 1, AREA.y);
    const before = s.mission!.field!.hold!.ticks;
    tick(s, {});
    expect(s.mission!.field!.hold!.contested).toBe(true);
    expect(s.mission!.field!.hold!.ticks).toBe(before);
    const v = missionView(s)!;
    expect(fieldNotes(v.fieldGoal!)).toContain('CLEAR THEM OUT OF THE AREA');
  });

  it('a wave holds its post until its time, then moves into the zone', () => {
    const s = onHold({ enemies: true });
    const seat = s.mission!.seats.find((x) => x.group === 'wave')!;
    expect(directiveFor(s, seat.playerId)).toMatchObject({ kind: 'block', x: seat.post!.x, y: seat.post!.y });
    for (let i = 0; i < 2 * 60; i++) tick(s, {});
    expect(directiveFor(s, seat.playerId)).toEqual({
      kind: 'guard',
      x: AREA.x,
      y: AREA.y,
      radius: AREA.radius,
    });
  });
});
