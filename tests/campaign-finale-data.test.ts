/**
 * The Ojuelegba finale's simulation data (docs/CAMPAIGN_SECTOR_AI.md "Part: Ojuelegba finale", decisions FN1-FN10, WL6-WL9):
 * the field missions on their own campaign-only boards round the UNCHANGED reference arena (the boss in a sector stamped
 * over it), gates that open between legs, equipment that stands on open floor from the start, the boss in a sector with a
 * human start, and the `controlPoints` verb (blasts only).
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_MISSION_IDS,
  FIELD_MISSION_DEFS,
  FINALE_MISSION_ID,
  MISSION_DEFS,
  MISSION_IDS,
  buildMissionGame,
  createGame,
  fieldArenaId,
  getArena,
  missionView,
  tick,
} from '../src/sim';
import type { GameState, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { BOSS_SECTORS, MISSION_SECTORS, getSector, missionSectorOf } from '../src/sim/mission/sectors';
import { inSector, openSectorGates, rectsContain, sectorLeaks } from '../src/sim/mission/sector';
import { fieldTargetTiles } from '../src/sim/mission/fieldState';
import { isOpenFloor } from '../src/sim/mission/state';
import { allNodeTiles } from '../src/sim/mission/state';
import { OJUELEGBA_BOSS, RETURN_MISSION } from '../src/sim/mission/finaleDefs';
import { hashOf, jumpToPhase } from './mission-helpers';
import { sandbox } from './helpers';

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function flood(s: GameState, sx: number, sy: number, open: (i: number) => boolean): Set<number> {
  const seen = new Set<number>([sy * s.width + sx]);
  const queue = [sy * s.width + sx];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const [dx, dy] of N4) {
      const nx = (i % s.width) + dx;
      const ny = Math.floor(i / s.width) + dy;
      if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height) continue;
      const j = ny * s.width + nx;
      if (seen.has(j) || !open(j)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen;
}

const field = (id: string, seed = 3): GameState =>
  createGame(
    buildMissionGame({ spec: { id: 'ojuelegba', fieldId: id }, humanCharacter: 'streetBaller', seed }),
  );
const boss = (seed = 3): GameState =>
  createGame(buildMissionGame({ spec: { id: 'ojuelegba' }, humanCharacter: 'streetBaller', seed }));

const arena = getArena('rumbleOjuelegba');
/** The finale's three places: the two field missions' campaign areas (WL6) and the boss's sector of the reference arena. */
const FIELD_SECTOR_IDS = ['ojuelegba.southStreets', 'ojuelegba.busInterchange'];
const BOSS_SECTOR_ID = 'ojuelegba.danfoYard';
const tilesOf = (id: string): Set<string> => {
  const out = new Set<string>();
  arena.layout.forEach((row, y) =>
    [...row].forEach((c, x) => c !== '#' && rectsContain(getSector(id).rects, x, y) && out.add(`${x},${y}`)),
  );
  return out;
};

describe('the finale is wired as the seventh mission district (FN1)', () => {
  it('ojuelegba is a mission id after the six district bosses; MISSION_IDS keeps the six', () => {
    expect(MISSION_IDS).toHaveLength(6);
    expect(CAMPAIGN_MISSION_IDS).toEqual([...MISSION_IDS, 'ojuelegba']);
    expect(FINALE_MISSION_ID).toBe('ojuelegba');
    expect(MISSION_DEFS.ojuelegba).toBe(OJUELEGBA_BOSS);
    expect(OJUELEGBA_BOSS).toMatchObject({ arenaId: 'rumbleOjuelegba', objective: 'controlPoints' });
    expect(Object.values(FIELD_MISSION_DEFS).filter((d) => d.districtId === 'ojuelegba')).toHaveLength(2);
  });

  it('the reference arena is untouched: City Rumble on rumbleOjuelegba has no sector and the same board', () => {
    expect(hashOf(arena.layout)).toBe('20d1a66:1585'); // the reference layout as shipped (never edited)
    const rumble = sandbox({ players: 8, arenaId: 'rumbleOjuelegba' });
    expect('sector' in rumble).toBe(false);
    const plain = createGame(
      buildMissionGame({
        spec: { id: 'ojuelegba', noSector: true },
        humanCharacter: 'streetBaller',
        seed: 1,
      }),
    );
    expect('sector' in plain).toBe(false);
  });
});

describe('three distinct Ojuelegba places (FN3, FN7, WL6)', () => {
  it('the boss sector of the reference arena is sized for play, closed (no leak) and barricaded on open ground', () => {
    let all = 0;
    arena.layout.forEach((row) => [...row].forEach((c) => c !== '#' && all++));
    const def = getSector(BOSS_SECTOR_ID);
    expect(def.districtId).toBe('ojuelegba');
    expect(def.arenaId).toBeUndefined(); // the reference arena itself
    const size = tilesOf(BOSS_SECTOR_ID).size;
    expect(size).toBeGreaterThanOrEqual(180);
    expect(size / all).toBeLessThan(0.5);
    expect(sectorLeaks(arena.layout, def)).toEqual([]);
    for (const b of [...def.barricades, ...(def.gates ?? [])])
      for (const [x, y] of b.tiles) expect(arena.layout[y]![x], `${b.id} ${x},${y}`).not.toBe('#');
  });

  it('the two field missions play on their own campaign-only boards: two different places, neither the reference arena', () => {
    const boards = FIELD_SECTOR_IDS.map((id) => getSector(id).arenaId!);
    expect(new Set(boards).size).toBe(2);
    for (const [i, id] of FIELD_SECTOR_IDS.entries()) {
      const def = getSector(id);
      expect(def.districtId).toBe('ojuelegba');
      const board = getArena(boards[i]!);
      expect(board.campaignOnly).toBe(true);
      expect(board.layout.join('\n')).not.toBe(arena.layout.join('\n'));
      expect(sectorLeaks(board.layout, def), id).toEqual([]);
      for (const g of def.gates ?? [])
        for (const [x, y] of g.tiles) expect(board.layout[y]![x], `${id} ${g.id} ${x},${y}`).not.toBe('#');
    }
    expect(getArena(boards[0]!).layout.join('\n')).not.toBe(getArena(boards[1]!).layout.join('\n'));
  });

  it('the field sectors are the field missions’ own, the boss sector is looked up by the boss mission', () => {
    expect(MISSION_SECTORS['ojuelegba.southStreets']).toBeDefined();
    expect(MISSION_SECTORS['ojuelegba.busInterchange']).toBeDefined();
    // the reference arena's old field sectors are retired (WL6)
    expect(MISSION_SECTORS['ojuelegba.shopfrontReturn']).toBeUndefined();
    expect(MISSION_SECTORS['ojuelegba.pierJunction']).toBeUndefined();
    expect(MISSION_SECTORS['ojuelegba.danfoYard']).toBeUndefined();
    expect(BOSS_SECTORS['ojuelegba.danfoYard']).toBeDefined();
    expect(missionSectorOf({ id: 'ojuelegba' })?.id).toBe('ojuelegba.danfoYard');
    expect(missionSectorOf({ id: 'ojuelegba', noSector: true })).toBeNull();
    // the district bosses keep their whole maps, except Oshodi's: its dispatch corridor (decision WX9)
    for (const id of MISSION_IDS)
      if (id === 'oshodi') expect(missionSectorOf({ id })?.id).toBe('oshodi.dispatchCorridor');
      else expect(missionSectorOf({ id }), id).toBeNull();
  });
});

describe('mission 19: the Ring gates open between legs (FN3, on the south streets: WL7)', () => {
  it('the lane barrier and the corner gate are concrete at the start, and the yard and the corner are shut', () => {
    const s = field('ojuelegba.return');
    const [sx, sy] = RETURN_MISSION.start;
    const reach = flood(s, sx, sy, (i) => s.tiles[i] !== Tile.Hard);
    const at = (x: number, y: number): number => y * s.width + x;
    const [rx, ry] = [RETURN_MISSION.returnMarker.x, RETURN_MISSION.returnMarker.y];
    expect(reach.has(at(rx, ry))).toBe(false); // the return marker, beyond both gates
    expect(reach.has(at(6, 22))).toBe(false); // the vulcanisers' yard, beyond the barrier
    expect(reach.has(at(20, 22))).toBe(true); // the shop street
    const events: SimEvent[] = [];
    openSectorGates(s, 1, events); // the barrier locks are blasted
    const mid = flood(s, sx, sy, (i) => s.tiles[i] !== Tile.Hard);
    expect([mid.has(at(6, 22)), mid.has(at(rx, ry))]).toEqual([true, false]);
    openSectorGates(s, 2, events); // the gate locks are blasted
    const open = flood(s, sx, sy, (i) => s.tiles[i] !== Tile.Hard);
    expect(open.has(at(rx, ry))).toBe(true);
    for (const i of open) expect(inSector(s, i % s.width, Math.floor(i / s.width))).toBe(true);
    expect(events.map((e) => (e.type === 'sectorGateOpened' ? e.gateId : ''))).toEqual([
      'laneBarrier',
      'cornerGate',
    ]);
  });
});

describe('equipment stands on open floor from the start (DS7 fix, FN3)', () => {
  it.each(['ojuelegba.return', 'ojuelegba.junction'])('%s', (id) => {
    const def = FIELD_MISSION_DEFS[id]!;
    const board = getArena(fieldArenaId(def));
    for (const [x, y] of fieldTargetTiles(def)) expect(isOpenFloor(board, x, y), `${x},${y}`).toBe(true);
    for (const seed of [1, 2, 3, 4]) {
      const s = field(id, seed);
      for (const [x, y] of fieldTargetTiles(def)) {
        expect(s.tiles[y * s.width + x], `${id} seed ${seed} ${x},${y}`).toBe(Tile.Soft);
        // nobody stands on a piece of equipment
        expect(s.players.some((p) => p.x === x && p.y === y)).toBe(false);
      }
    }
  });

  it('a post beside a piece no longer clears it (the junction lieutenant stands next to a control box)', () => {
    const s = field('ojuelegba.junction', 1);
    const box = s.mission!.field!.targets!.find((t) => t.id === 'boxPier')!;
    const lieutenant = s.players.find((p) => p.name === 'Ring Lieutenant')!;
    expect(Math.max(Math.abs(lieutenant.x - box.x), Math.abs(lieutenant.y - box.y))).toBe(1);
    expect(s.tiles[box.y * s.width + box.x]).toBe(Tile.Soft);
  });
});

describe('the boss mission in its sector (FN5, FN7, FN8)', () => {
  it('every node, post and the start lie on open floor inside the sector, reachable from the start', () => {
    const def = OJUELEGBA_BOSS;
    const sector = getSector(def.sectorId!);
    const tiles = [...allNodeTiles(def), def.start!, def.boss.post, ...def.crew.map((c) => c.post)];
    for (const [x, y] of tiles) {
      expect(isOpenFloor(arena, x, y), `${x},${y}`).toBe(true);
      expect(rectsContain(sector.rects, x, y), `${x},${y}`).toBe(true);
    }
    for (const seed of [1, 7]) {
      const s = boss(seed);
      expect(s.sector?.id).toBe(sector.id);
      const me = s.players[0]!;
      expect([me.x, me.y]).toEqual([...def.start!]);
      const reach = flood(s, me.x, me.y, (i) => s.tiles[i] !== Tile.Hard);
      for (const i of reach) expect(inSector(s, i % s.width, Math.floor(i / s.width))).toBe(true);
      for (const [x, y] of tiles) expect(reach.has(y * s.width + x), `${x},${y}`).toBe(true);
      for (const p of s.players) expect(inSector(s, p.x, p.y), `seat ${p.id}`).toBe(true);
    }
  });

  it('the Landlord is a generator bot drawn in the existing Boss variant look (no rule reads it)', () => {
    const s = boss();
    const b = s.players[1]!;
    expect(b.name).toBe('The Landlord');
    expect(b.enemyVariant).toBe('boss');
    expect(b.enemyKind).toBeUndefined();
    expect(b.vitals).toBeUndefined();
    // the six district bosses carry no look
    for (const id of MISSION_IDS) {
      const o = createGame(buildMissionGame({ spec: { id }, humanCharacter: 'streetBaller', seed: 1 }));
      expect(o.players[1]!.enemyVariant, id).toBeUndefined();
    }
  });

  it('the boss sector keeps only the hazards it can hold: the departure strip, not the through-road traffic', () => {
    const s = boss();
    arena.stageHazards.forEach((h, i) => {
      if (h.kind !== 'sweep') return;
      const fits = h.routes.flat().every(([x, y]) => inSector(s, x, y));
      expect(s.stage.nextAt[i] === Infinity, `hazard ${i} ${h.style}`).toBe(!fits);
    });
    expect(
      arena.stageHazards.some(
        (h, i) => h.kind === 'sweep' && h.style === 'danfo' && s.stage.nextAt[i] !== Infinity,
      ),
    ).toBe(true);
  });
});

describe('the controlPoints verb: blasts only, routes reopen, lockers re-lock (FN5)', () => {
  const blastAt = (s: GameState, x: number, y: number): void => {
    s.flames.push({
      genId: 999,
      ownerId: 0,
      eventId: s.nextEventId++,
      startTick: s.tick,
      endTick: s.tick + 30,
      x,
      y,
      dir: null,
      tip: false,
    });
  };
  const playing = (): GameState => {
    const s = boss(5);
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    s.settings.stageHazards = false;
    return s;
  };

  it('one blast of the human shuts a phase-1 point and clears its route crate; standing on it does nothing', () => {
    const s = playing();
    const c1 = s.mission!.nodes.find((n) => n.id === 'c1')!;
    const crate = 26 * s.width + 34; // the authored crate the point opens
    s.tiles[crate] = Tile.Soft;
    const me = s.players[0]!;
    me.x = me.stepFromX = c1.x;
    me.y = me.stepFromY = c1.y;
    for (let i = 0; i < 120; i++) tick(s, {});
    expect(c1.done).toBe(false);
    blastAt(s, c1.x, c1.y);
    tick(s, {});
    expect(c1.done).toBe(true);
    expect(s.tiles[crate]).toBe(Tile.Empty);
    expect(missionView(s)!.progress.label).toBe('control points shut down');
  });

  it('an enemy blast never counts; tougher phase-3 points take two separate blasts', () => {
    const s = playing();
    jumpToPhase(s, 2);
    const c2 = s.mission!.nodes.find((n) => n.id === 'c2')!;
    s.flames.push({
      genId: 998,
      ownerId: 1,
      eventId: s.nextEventId++,
      startTick: s.tick,
      endTick: s.tick + 30,
      x: c2.x,
      y: c2.y,
      dir: null,
      tip: false,
    });
    tick(s, {});
    expect(c2.hp).toBe(2);
    blastAt(s, c2.x, c2.y);
    tick(s, {});
    expect([c2.hp, c2.done]).toEqual([1, false]);
    blastAt(s, c2.x, c2.y);
    tick(s, {});
    expect(c2.done).toBe(true);
  });

  it('a locker standing on a shut point re-locks it after the phase’s crew time', () => {
    const s = playing();
    jumpToPhase(s, 1);
    const c1 = s.mission!.nodes.find((n) => n.id === 'c1')!;
    blastAt(s, c1.x, c1.y);
    tick(s, {});
    expect(c1.done).toBe(true);
    for (let i = 0; i < 40; i++) tick(s, {}); // the flames go out first
    const locker = s.players.find((p) => s.mission!.seats[p.id]?.role === 'runner')!;
    const hold = (): void => {
      locker.x = locker.stepFromX = c1.x;
      locker.y = locker.stepFromY = c1.y;
      locker.stepRemaining = 0;
    };
    for (let i = 0; i < 60 * 6 + 5 && c1.done; i++) {
      hold();
      tick(s, { [locker.id]: {} });
    }
    expect(c1.done).toBe(false);
  });
});
