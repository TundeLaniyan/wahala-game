/**
 * The re-authored field missions of Ebute Metta, Lagos Island and Lekki (docs/CAMPAIGN_SECTOR_AI.md, "Districts: Ebute
 * Metta, Lagos Island, Lekki Phase 1", decisions DB1-DB9):
 *
 *   - data: every piece of equipment, hold zone and patrol waypoint is real open floor inside the sector, reachable;
 *     the waves and crews name real groups; each district wrecks Ring equipment, a hold leg exists, no two missions share
 *     an objective list; the gates are closed at the start and open after their leg;
 *   - a scripted full playthrough per mission on Normal (scripts/lib/generatorPlaythrough.ts: the real mission and the
 *     real enemy bots, ordinary intents only, a generator-first strategy; the door raid answered with `resolveRaid` as
 *     the scripted Oshodi playthrough does) completes it within the clock in a majority of seeds;
 *   - Easy completes at least as often as Normal; Hard is measurably harder (more damage taken, slower);
 *   - ordinary enemies escape a badly placed generator they saw.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { FIELD_MISSION_DEFS, buildMissionGame, createGame, fieldArenaId, getArena } from '../src/sim';
import { Tile } from '../src/sim/types';
import type { CampaignLevel, FieldMissionDef, FieldLegDef } from '../src/sim';
import { getSector } from '../src/sim/mission/sectors';
import { rectsContain, sectorBlockedTiles } from '../src/sim/mission/sector';
import { fieldTiles } from '../src/sim/mission/fieldState';
import { fieldEnemiesOf } from '../src/sim/mission/combatPilot';
import { playFieldMission, seenInMission } from '../scripts/lib/generatorPlaythrough';
import type { PlaythroughResult } from '../scripts/lib/generatorPlaythrough';

const MISSIONS = [
  'ebuteMetta.approach',
  'lagosIsland.approach',
  'lagosIsland.press',
  'lekki.approach',
  'lekki.estate',
] as const;
const SEEDS = [1, 2, 3, 4, 5, 6];
const LEVELS: CampaignLevel[] = ['easy', 'normal', 'hard'];

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Tiles reachable from (sx, sy) over the layout: barricades are concrete; gates open (they open between legs) unless
 * `closed`. */
function reach(def: FieldMissionDef, sx: number, sy: number, closed = false): Set<string> {
  const layout = getArena(fieldArenaId(def)).layout;
  const sector = getSector(def.sectorId!);
  const gates = new Set(
    closed ? [] : (sector.gates ?? []).flatMap((g) => g.tiles.map(([x, y]) => `${x},${y}`)),
  );
  const walls = new Set(sectorBlockedTiles(sector).map(([x, y]) => `${x},${y}`));
  const seen = new Set([`${sx},${sy}`]);
  const queue: [number, number][] = [[sx, sy]];
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q]!;
    for (const [dx, dy] of N4) {
      const k = `${x + dx},${y + dy}`;
      const c = layout[y + dy]?.[x + dx];
      if (c === undefined || c === '#' || seen.has(k) || (walls.has(k) && !gates.has(k))) continue;
      seen.add(k);
      queue.push([x + dx, y + dy]);
    }
  }
  return seen;
}

describe.each(MISSIONS)('%s: data', (id) => {
  const def = FIELD_MISSION_DEFS[id]!;
  const sector = getSector(def.sectorId!);
  const layout = getArena(fieldArenaId(def)).layout;
  const walls = new Set(sectorBlockedTiles(sector).map(([x, y]) => `${x},${y}`));
  const authored = new Set(fieldTiles(def).map(([x, y]) => `${x},${y}`));
  const fromStart = reach(def, def.start[0], def.start[1]);
  const floor = (x: number, y: number): boolean => layout[y]?.[x] !== undefined && layout[y]![x] !== '#';

  it('every piece of equipment stands on open floor inside the sector, off the route tiles, and can be reached', () => {
    for (const leg of def.legs) {
      if (leg.kind !== 'destroyTargets') continue;
      expect(leg.targets.length, id).toBeGreaterThanOrEqual(2);
      for (const t of leg.targets) {
        const k = `${t.x},${t.y}`;
        expect(floor(t.x, t.y), `${id} ${t.id} on concrete`).toBe(true);
        expect(rectsContain(sector.rects, t.x, t.y), `${id} ${t.id} outside the sector`).toBe(true);
        expect(walls.has(k), `${id} ${t.id} on a barricade`).toBe(false);
        expect(authored.has(k), `${id} ${t.id} on a route tile`).toBe(false);
        // a floor tile beside it is reachable (a blast laid there reaches it)
        expect(
          N4.some(([dx, dy]) => fromStart.has(`${t.x + dx},${t.y + dy}`)),
          `${id} ${t.id} cannot be reached`,
        ).toBe(true);
        expect(t.hp ?? 1).toBeLessThanOrEqual(2);
      }
      expect(leg.crew === undefined || def.enemies.some((e) => e.group === leg.crew), `${id} crew`).toBe(
        true,
      );
    }
  });

  it('regression (decision DB1): every piece of equipment still stands when the mission starts', () => {
    // the crate clearing round an enemy post or along a patrol route used to take a piece next to it away (an empty
    // tile with a target no blast could reach: the leg could never be completed)
    for (const seed of [1, 2, 3]) {
      const s = createGame(
        buildMissionGame({ spec: { id: def.districtId, fieldId: id }, humanCharacter: 'streetBaller', seed }),
      );
      for (const leg of def.legs)
        if (leg.kind === 'destroyTargets')
          for (const t of leg.targets)
            expect(s.tiles[t.y * s.width + t.x], `${id} ${t.id} seed ${seed}`).toBe(Tile.Soft);
      expect(s.mission!.field!.targets?.every((t) => !t.destroyed)).toBe(true);
    }
  });

  it('every hold zone lies inside the sector on reachable floor, and its waves are real groups', () => {
    for (const leg of def.legs) {
      if (leg.kind !== 'holdArea') continue;
      const { x, y, radius } = leg.area;
      expect(fromStart.has(`${x},${y}`), `${id} zone centre`).toBe(true);
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++)
          if (floor(x + dx, y + dy))
            expect(rectsContain(sector.rects, x + dx, y + dy), `${id} zone tile ${x + dx},${y + dy}`).toBe(
              true,
            );
      expect(leg.holdSec).toBeGreaterThanOrEqual(15);
      for (const w of leg.waves ?? [])
        expect(
          def.enemies.some((e) => e.group === w.group),
          `${id} wave ${w.group}`,
        ).toBe(true);
    }
  });

  it('every patrol waypoint is open floor inside the sector, reachable from its post', () => {
    for (const e of fieldEnemiesOf(def)) {
      const route = e.territory?.patrol ?? [];
      const fromPost = reach(def, e.post[0], e.post[1]);
      for (const [x, y] of route) {
        expect(floor(x, y), `${id} ${e.name} waypoint ${x},${y} on concrete`).toBe(true);
        expect(rectsContain(sector.rects, x, y), `${id} ${e.name} waypoint ${x},${y}`).toBe(true);
        expect(walls.has(`${x},${y}`), `${id} ${e.name} waypoint ${x},${y} on a barricade`).toBe(false);
        expect(fromPost.has(`${x},${y}`), `${id} ${e.name} waypoint ${x},${y} unreachable`).toBe(true);
      }
    }
  });

  it('every enemy has a role in the encounter: a territory, a crew, a wave or a pursuit', () => {
    const roles = new Set(
      def.legs.flatMap((l: FieldLegDef) =>
        l.kind === 'destroyTargets'
          ? [l.crew ?? '']
          : l.kind === 'holdArea'
            ? (l.waves ?? []).map((w) => w.group)
            : l.kind === 'clearGroup' || l.kind === 'escapeRoute'
              ? [l.group]
              : [],
      ),
    );
    for (const e of def.enemies)
      expect(e.territory !== undefined || roles.has(e.group), `${id} ${e.name}`).toBe(true);
    // patrols: at least two enemies walk a route the player can watch and predict
    expect(
      def.enemies.filter((e) => (e.territory?.patrol?.length ?? 0) >= 2).length,
      id,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('the five missions: generator-sensitive and varied', () => {
  const kinds = (id: string): string => FIELD_MISSION_DEFS[id]!.legs.map((l) => l.kind).join(',');

  it('each district wrecks Ring equipment, a hold leg exists, and no two missions share an objective list', () => {
    for (const district of ['ebuteMetta', 'lagosIsland', 'lekki'])
      expect(
        MISSIONS.filter((id) => id.startsWith(district)).some((id) => kinds(id).includes('destroyTargets')),
        district,
      ).toBe(true);
    expect(MISSIONS.some((id) => kinds(id).includes('holdArea'))).toBe(true);
    expect(new Set(MISSIONS.map(kinds)).size).toBe(MISSIONS.length);
  });

  it('the existing door raids and their return tiles are kept', () => {
    const doors = (id: string) =>
      FIELD_MISSION_DEFS[id]!.doors.map((d) => `${d.id}:${d.raidId}:${d.returnTile}`);
    expect(doors('ebuteMetta.approach')).toEqual(['shed:junctionToolShed:41,25']);
    expect(doors('lagosIsland.approach')).toEqual(['annexe:recordsVault:44,25']);
    expect(doors('lekki.approach')).toEqual(['plant:standbyPlant:39,7']);
    expect(doors('lagosIsland.press')).toEqual([]);
    expect(doors('lekki.estate')).toEqual([]);
  });

  it('the sidings gate (Ebute Metta) and the inner estate gate (Lekki) open after the first leg', () => {
    expect(getSector('ebuteMetta.freightYard').gates?.map((g) => [g.id, g.opensAfterLeg])).toEqual([
      ['sidingsGate', 0],
    ]);
    expect(getSector('lekki.innerEstate').gates?.map((g) => [g.id, g.opensAfterLeg])).toEqual([
      ['lawnGate', 0],
    ]);
  });
});

// ------------------------------------------------------------------ scripted playthroughs

const runs = new Map<string, PlaythroughResult[]>();
const key = (id: string, level: CampaignLevel): string => `${id}:${level}`;
const played = (id: string, level: CampaignLevel): PlaythroughResult[] => {
  let r = runs.get(key(id, level));
  if (!r) {
    r = SEEDS.map((seed) => playFieldMission(id, { level, seed }));
    runs.set(key(id, level), r);
  }
  return r;
};

describe.each(MISSIONS)('%s: scripted full playthrough (real bots, generators first)', (id) => {
  const def = FIELD_MISSION_DEFS[id]!;
  beforeAll(() => {
    for (const level of LEVELS) played(id, level);
  }, 300_000);

  it(`Normal: completes every leg within the clock in a majority of ${SEEDS.length} seeds`, () => {
    const r = played(id, 'normal');
    const won = r.filter((x) => x.result === 'won');
    expect(won.length, JSON.stringify(r.map((x) => x.result))).toBeGreaterThan(SEEDS.length / 2);
    for (const w of won) {
      expect(w.fieldSec).toBeLessThanOrEqual(def.timeLimitSec);
      expect(w.legsCleared).toBe(def.legs.length);
      expect(w.raids).toBe(def.doors.filter((d) => d.required).length);
      // the generator is the means: equipment and armoured enemies only fall to blasts
      expect(w.generatorsLaid).toBeGreaterThanOrEqual(3);
    }
    // a sector gate opened on the way (the missions with one)
    if (getSector(def.sectorId!).gates?.length) for (const w of won) expect(w.gatesOpened).toBe(1);
  });

  it('Easy completes at least as often as Normal', () => {
    const wins = (level: CampaignLevel): number => played(id, level).filter((x) => x.result === 'won').length;
    expect(wins('easy')).toBeGreaterThanOrEqual(wins('normal'));
  });
});

describe('Hard is measurably harder than Easy over the five missions', () => {
  it('more damage taken and more time needed (or fewer completions)', () => {
    const total = (level: CampaignLevel, f: (r: PlaythroughResult) => number): number =>
      MISSIONS.flatMap((id) => played(id, level)).reduce((a, r) => a + f(r), 0);
    const wins = (level: CampaignLevel): number => total(level, (r) => (r.result === 'won' ? 1 : 0));
    expect(wins('hard')).toBeLessThanOrEqual(wins('easy'));
    expect(total('hard', (r) => r.damageTaken)).toBeGreaterThan(total('easy', (r) => r.damageTaken));
    expect(total('hard', (r) => r.fieldSec)).toBeGreaterThan(total('easy', (r) => r.fieldSec));
  }, 600_000);
});

// ------------------------------------------------------------------ a badly placed generator, in plain view

describe.each(MISSIONS)('%s: ordinary enemies escape a badly placed generator they saw', (id) => {
  const def = FIELD_MISSION_DEFS[id]!;
  const pursuers = new Set(def.legs.flatMap((l) => (l.kind === 'escapeRoute' ? [l.group] : [])));
  // seats behind a closed gate at the start are out of the drill (the human cannot walk up to them)
  const open = reach(def, def.start[0], def.start[1], true);
  const gated = new Set(
    fieldEnemiesOf(def)
      .filter((e) => !open.has(e.post.join(',')))
      .map((e) => e.name),
  );
  // one seat per variant: the ordinary ones (no armour), not a pursuer, reachable from the start
  const seats: number[] = [];
  const variants = new Set<string>();
  fieldEnemiesOf(def).forEach((e, i) => {
    const v = e.variant ?? '';
    if (pursuers.has(e.group) || variants.has(v) || gated.has(e.name)) return;
    if (v === 'heavyEnforcer' || v === 'lieutenant') return;
    variants.add(v);
    seats.push(i + 1);
  });

  it.each(seats)(
    'seat %i escapes in a majority of the seeds it saw the generator',
    (seat) => {
      const r = SEEDS.map((seed) => seenInMission(id, seat, { seed }));
      const seen = r.filter((x) => x.laid && x.seen);
      const escaped = seen.filter((x) => !x.hit).length;
      expect(seen.length, JSON.stringify(r)).toBeGreaterThanOrEqual(2);
      expect(escaped, JSON.stringify(r)).toBeGreaterThan(seen.length / 2);
    },
    120_000,
  );
});
