/**
 * CAMPAIGN AREAS (docs/CAMPAIGN_WORLD.md, decisions WX1-WX9): the campaign-only boards and their area data (the board kit
 * itself: tests/campaign-kit.test.ts).
 *
 *   isolation  every campaign arena is campaign-only: in no menu list (Classic, City Rumble, Team, experimental, raids)
 *   areas      every registered area against its board and its missions: the same arena and sector, the entry is the
 *              mission's start, the sub-areas cover the play area, the landmarks lie on or by the board, and the area is
 *              larger than the old district sector it replaces (the measured walkable tiles are printed)
 *   oshodi     the two Oshodi field maps are different boards; the City Rumble Oshodi map is unchanged
 *   saves      an old save with Oshodi progress loads and unlocks the same missions (mission ids unchanged)
 *
 * The play-area checks every sector gets (authored tiles inside, no leak, every target reachable with the gates opened in
 * leg order, the route needs no blasting) run for the areas' sectors in tests/mission-sectors.test.ts.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ARENAS,
  CAMPAIGN_AREA_DEFS,
  CAMPAIGN_ARENAS,
  CAMPAIGN_ARENA_IDS,
  EXPERIMENTAL_ARENA_IDS,
  FIELD_MISSION_DEFS,
  MISSION_DEFS,
  RAID_ARENA_IDS,
  RUMBLE_ARENA_IDS,
  STANDARD_ARENA_IDS,
  buildMissionGame,
  createGame,
  fieldArenaId,
  getArena,
  missionArenaId,
} from '../src/sim';
import { getSector } from '../src/sim/mission/sectors';
import { allNodeTiles } from '../src/sim/mission/state';
import { inSector, sectorLeaks } from '../src/sim/mission/sector';
import { Tile } from '../src/sim/types';
import { runBossFight } from '../scripts/lib/bossFight';
import { rectsContain } from '../src/sim/mission/sector';
import { createSave } from '../src/campaign/progress';
import { repairSave } from '../src/campaign/save';
import { missionStatus } from '../src/campaign/sectionState';

// ------------------------------------------------------------------------------------------- isolation

describe('campaign arenas never appear in a competitive list', () => {
  it('none is in ARENAS, the Classic / Rumble / experimental / raid lists; getArena finds each', () => {
    expect(CAMPAIGN_ARENA_IDS.length).toBeGreaterThan(0);
    const lists = [
      Object.keys(ARENAS),
      STANDARD_ARENA_IDS,
      RUMBLE_ARENA_IDS,
      EXPERIMENTAL_ARENA_IDS,
      RAID_ARENA_IDS,
    ];
    for (const id of CAMPAIGN_ARENA_IDS) {
      for (const list of lists) expect(list, id).not.toContain(id);
      expect(getArena(id)).toBe(CAMPAIGN_ARENAS[id]);
      expect(getArena(id).campaignOnly).toBe(true);
    }
    // and nothing in the menus' lists is campaign-only
    for (const id of Object.keys(ARENAS)) expect(ARENAS[id]!.campaignOnly, id).toBeUndefined();
  });
});

// ------------------------------------------------------------------------------------------- the areas

/** Walkable tiles of the old district sectors the Oshodi areas replace (docs/CAMPAIGN_SECTOR_AI.md, DS1). */
const OLD_SECTOR_TILES: Readonly<Record<string, number>> = {
  'oshodi.approach': 188,
  'oshodi.railEdge': 368,
  // Mushin (decisions WM2-WM5): the old district sectors of the Rumble map
  'mushin.approach': 349,
  'mushin.market': 369,
  // Fadeyi/Somolu (decisions WF1-WF4): the old toll-road and north-junction sectors of the Rumble map
  'fadeyiSomolu.approach': 309,
  'fadeyiSomolu.junctions': 302,
  // Lekki (`lekki.gateApproach`, `lekki.northEstate`) and the Ojuelegba finale (`ojuelegba.shopfrontReturn`,
  // `ojuelegba.pierJunction`), measured on 662f8e2 (decisions WL1, WL6)
  'lekki.approach': 225,
  'lekki.estate': 402,
  'ojuelegba.return': 218,
  'ojuelegba.junction': 190,
};

const walkable = (
  layout: readonly string[],
  rects: readonly (readonly [number, number, number, number])[],
): number => {
  let n = 0;
  layout.forEach((row, y) => [...row].forEach((c, x) => c !== '#' && rectsContain(rects, x, y) && n++));
  return n;
};

describe.each(CAMPAIGN_AREA_DEFS.map((a) => [a.id, a] as const))('area %s', (_id, area) => {
  const arena = getArena(area.arenaId);

  it('is drawn on its own campaign-only board, with its sector on that board', () => {
    expect(arena.campaignOnly).toBe(true);
    expect(area.sector.arenaId).toBe(area.arenaId);
    expect(area.sector.districtId).toBe(area.districtId);
    expect(getSector(area.sector.id)).toBe(area.sector);
    expect(arena.coverMap).toBeDefined();
  });

  it('its missions point at it: the same arena and sector, the entry is the start, the exits are real markers', () => {
    expect(area.missions.length).toBeGreaterThan(0);
    for (const id of area.missions) {
      const def = FIELD_MISSION_DEFS[id]!;
      expect(def, id).toBeDefined();
      expect(def.arenaId).toBe(area.arenaId);
      expect(def.sectorId).toBe(area.sector.id);
      expect(def.districtId).toBe(area.districtId);
      expect(fieldArenaId(def)).toBe(area.arenaId);
      expect(missionArenaId({ id: def.districtId, fieldId: id })).toBe(area.arenaId);
      expect([...def.start]).toEqual([...area.entry]);
      // the return marker is one of the area's exits, and every exit is open floor of the board
      expect(area.exits.some((e) => e.x === def.returnMarker.x && e.y === def.returnMarker.y)).toBe(true);
      // a real match is built on the board
      const s = createGame(
        buildMissionGame({
          spec: { id: def.districtId, fieldId: id },
          humanCharacter: 'streetBaller',
          seed: 1,
        }),
      );
      expect(s.arenaId).toBe(area.arenaId);
      expect(s.sector?.id).toBe(area.sector.id);
    }
    for (const e of area.exits) expect('._', `${e.id}`).toContain(arena.layout[e.y]?.[e.x]);
  });

  it('its sub-areas are the board districts and together cover every walkable tile of the play area', () => {
    expect(arena.districts!.map((d) => d.id)).toEqual(area.subAreas.map((d) => d.id));
    expect(area.subAreas.length).toBeGreaterThanOrEqual(3);
    for (const d of area.subAreas) expect(d.purpose.length, d.id).toBeGreaterThan(10);
    arena.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === '#' || !rectsContain(area.sector.rects, x, y)) return;
        expect(
          area.subAreas.some((d) => rectsContain(d.rects, x, y)),
          `${x},${y} in no sub-area`,
        ).toBe(true);
      }),
    );
  });

  it('its landmarks are anchored on or beside the board, with a story', () => {
    const W = arena.layout[0]!.length;
    const H = arena.layout.length;
    for (const l of area.landmarks) {
      expect(l.at[0] >= 0 && l.at[0] < W && l.at[1] >= 0 && l.at[1] < H, l.id).toBe(true);
      expect(l.story.length).toBeGreaterThan(10);
    }
    expect(new Set(area.landmarks.map((l) => l.id)).size).toBe(area.landmarks.length);
  });

  it('is clearly larger than the old district sector it replaces (measured walkable tiles)', () => {
    const tiles = walkable(arena.layout, area.sector.rects);
    for (const id of area.missions) {
      const old = OLD_SECTOR_TILES[id];
      console.log(`[campaign-world] ${area.id} (${id}): ${tiles} walkable tiles, old sector ${old ?? '-'}`);
      if (old !== undefined) expect(tiles, id).toBeGreaterThan(old * 1.5);
    }
    expect(area.subAreas.length).toBeGreaterThanOrEqual(3);
  });
});

// ------------------------------------------------------------------------------------------- Oshodi

describe('Oshodi', () => {
  it('the City Rumble Oshodi map is unchanged (its layout hash is the one before the campaign areas)', () => {
    const h = createHash('sha256').update(getArena('rumbleOshodi').layout.join('\n')).digest('hex');
    expect(h.slice(0, 16)).toBe(RUMBLE_OSHODI_LAYOUT);
  });

  it('every Oshodi field mission plays on its own campaign area; two missions never share a board', () => {
    const ids = Object.values(FIELD_MISSION_DEFS)
      .filter((d) => d.districtId === 'oshodi')
      .map((d) => d.id);
    const boards = ids.map((id) => fieldArenaId(FIELD_MISSION_DEFS[id]!));
    for (const b of boards) expect(getArena(b).campaignOnly, b).toBe(true);
    expect(new Set(boards).size).toBe(boards.length);
    // and the boards themselves differ: different layouts, no sub-area of one is in the other
    for (let i = 0; i < boards.length; i++)
      for (let j = i + 1; j < boards.length; j++) {
        const a = getArena(boards[i]!);
        const b = getArena(boards[j]!);
        expect(a.layout.join('\n')).not.toBe(b.layout.join('\n'));
        const names = new Set(a.districts!.map((d) => d.name));
        for (const d of b.districts!) expect(names.has(d.name), d.name).toBe(false);
      }
  });
});

describe('the Oshodi boss in its dispatch corridor (decision WX9)', () => {
  const def = MISSION_DEFS.oshodi;
  const sector = getSector(def.sectorId!);
  const arena = getArena(def.arenaId);
  const open = (x: number, y: number): boolean => '._$x'.includes(arena.layout[y]?.[x] ?? '#');

  it('every relay node of every phase, the convoy lanes, the boss and crew posts and the start lie inside it', () => {
    expect(def.arenaId).toBe('rumbleOshodi');
    expect(sector.arenaId).toBeUndefined(); // the district map itself, bounded: no campaign board
    const tiles = [...allNodeTiles(def), def.start!, def.boss.post, ...def.crew.map((c) => c.post)];
    for (const [x, y] of tiles) {
      expect(rectsContain(sector.rects, x, y), `${x},${y}`).toBe(true);
      expect(open(x, y), `${x},${y} open`).toBe(true);
    }
    for (const lane of def.lanes ?? [])
      for (const [x, y] of lane) expect(rectsContain(sector.rects, x, y)).toBe(true);
    expect(sectorLeaks(arena.layout, sector)).toEqual([]);
  });

  it('a real match: the human starts on the start tile, everyone and everything is reachable inside, the stage stays on', () => {
    for (const seed of [1, 7]) {
      const s = createGame(
        buildMissionGame({ spec: { id: 'oshodi' }, humanCharacter: 'streetBaller', seed }),
      );
      expect(s.sector?.id).toBe(sector.id);
      const me = s.players[0]!;
      expect([me.x, me.y]).toEqual([...def.start!]);
      for (const p of s.players) expect(inSector(s, p.x, p.y), `seat ${p.id}`).toBe(true);
      // the flood from the start never leaves the corridor and reaches every node
      const seen = new Set([me.y * s.width + me.x]);
      const q = [...seen];
      for (let i = 0; i < q.length; i++) {
        const t = q[i]!;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const x = (t % s.width) + dx;
          const y = Math.floor(t / s.width) + dy;
          const j = y * s.width + x;
          if (x < 0 || y < 0 || x >= s.width || y >= s.height || seen.has(j) || s.tiles[j] === Tile.Hard)
            continue;
          seen.add(j);
          q.push(j);
        }
      }
      for (const i of seen) expect(inSector(s, i % s.width, Math.floor(i / s.width))).toBe(true);
      for (const [x, y] of allNodeTiles(def)) expect(seen.has(y * s.width + x), `${x},${y}`).toBe(true);
      // traffic, bus departures, the railcar and the drops run wholly inside: every scheduled hazard stays on
      expect(
        s.stage.nextAt.every((t, k) => arena.stageHazards[k]!.kind === 'teleport' || Number.isFinite(t)),
      ).toBe(true);
    }
  });

  it('the boss stays completable: the generator-first plan wins on Easy, Normal and Hard', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const r = runBossFight({ id: 'oshodi', level, strategy: 'generator', seed: 101 });
      expect(r.result, `${level} ${JSON.stringify(r)}`).toBe('won');
    }
  }, 300_000);
});

// ------------------------------------------------------------------------------------------- Mushin

describe('Mushin', () => {
  it('the City Rumble Mushin map is unchanged (its layout hash is the one before the campaign areas)', () => {
    const h = createHash('sha256').update(getArena('rumbleMushin').layout.join('\n')).digest('hex');
    expect(h.slice(0, 16)).toBe(RUMBLE_MUSHIN_LAYOUT);
  });

  it('every Mushin field mission plays on its own campaign area; two missions never share a board', () => {
    const ids = Object.values(FIELD_MISSION_DEFS)
      .filter((d) => d.districtId === 'mushin')
      .map((d) => d.id);
    const boards = ids.map((id) => fieldArenaId(FIELD_MISSION_DEFS[id]!));
    for (const b of boards) expect(getArena(b).campaignOnly, b).toBe(true);
    expect(new Set(boards).size).toBe(boards.length);
    for (let i = 0; i < boards.length; i++)
      for (let j = i + 1; j < boards.length; j++) {
        const a = getArena(boards[i]!);
        const b = getArena(boards[j]!);
        expect(a.layout.join('\n')).not.toBe(b.layout.join('\n'));
        const names = new Set(a.districts!.map((d) => d.name));
        for (const d of b.districts!) expect(names.has(d.name), d.name).toBe(false);
      }
  });
});

/** sha256 (first 16 hex) of the rumbleMushin layout on 77e128f (before the Mushin campaign areas). */
const RUMBLE_MUSHIN_LAYOUT = 'f4a5b1aec9257cfb';

/** sha256 (first 16 hex) of the rumbleOshodi layout on 0b89d09. */
const RUMBLE_OSHODI_LAYOUT = '4a76c2f857d6e2bd';

// ------------------------------------------------------------------------------------------- Fadeyi/Somolu

describe('Fadeyi/Somolu (decisions WF1-WF4)', () => {
  const ids = Object.values(FIELD_MISSION_DEFS)
    .filter((d) => d.districtId === 'fadeyiSomolu')
    .map((d) => d.id);

  it('the City Rumble Fadeyi map is unchanged (its layout hash is the one before the campaign areas)', () => {
    const h = createHash('sha256').update(getArena('rumbleFadeyi').layout.join('\n')).digest('hex');
    expect(h.slice(0, 16)).toBe(RUMBLE_FADEYI_LAYOUT);
  });

  it('both field missions play on their own campaign areas; the two boards and their parts differ', () => {
    expect(ids).toEqual(['fadeyiSomolu.approach', 'fadeyiSomolu.junctions']);
    const boards = ids.map((id) => fieldArenaId(FIELD_MISSION_DEFS[id]!));
    for (const b of boards) expect(getArena(b).campaignOnly, b).toBe(true);
    expect(new Set(boards).size).toBe(2);
    const [a, b] = boards.map((id) => getArena(id));
    expect(a!.layout.join('\n')).not.toBe(b!.layout.join('\n'));
    const names = new Set(a!.districts!.map((d) => d.name));
    for (const d of b!.districts!) expect(names.has(d.name), d.name).toBe(false);
    // the boss mission keeps the district's Rumble map (decision WF5)
    expect(MISSION_DEFS.fadeyiSomolu.arenaId).toBe('rumbleFadeyi');
  });

  it('every gate opens on a leg of its mission and stands on open floor between two sub-areas', () => {
    for (const id of ids) {
      const def = FIELD_MISSION_DEFS[id]!;
      const sector = getSector(def.sectorId!);
      const arena = getArena(fieldArenaId(def));
      expect(sector.gates?.length, id).toBe(1);
      for (const g of sector.gates!) {
        expect(g.opensAfterLeg).toBeLessThan(def.legs.length);
        for (const [x, y] of g.tiles) expect('._', `${id} ${g.id} ${x},${y}`).toContain(arena.layout[y]![x]);
      }
    }
  });
});

/** sha256 (first 16 hex) of the rumbleFadeyi layout on 0b89d09 (the same pin as tests/campaign-community-kit.test.ts). */
const RUMBLE_FADEYI_LAYOUT = 'cbc989bc71726421';

// ------------------------------------------------------------------------------------------- Lekki and the Ojuelegba finale

/** sha256 (first 16 hex) of the City Rumble layouts the Lekki and finale areas sit beside (662f8e2: unchanged, WL1, WL6). */
const RUMBLE_LAYOUTS: Readonly<Record<string, string>> = {
  rumbleLekki: 'a2e2cc51fe36b5f0',
  rumbleOjuelegba: 'cfba1de3c4012c43',
};

describe.each([
  ['lekki', 'rumbleLekki'],
  ['ojuelegba', 'rumbleOjuelegba'],
] as const)('%s (decisions WL1-WL9)', (district, rumble) => {
  it('the City Rumble map is unchanged (its layout hash is the one before the campaign areas)', () => {
    const h = createHash('sha256').update(getArena(rumble).layout.join('\n')).digest('hex');
    expect(h.slice(0, 16)).toBe(RUMBLE_LAYOUTS[rumble]);
  });

  it('every field mission plays on its own campaign area; two missions never share a board or a sub-area', () => {
    const ids = Object.values(FIELD_MISSION_DEFS)
      .filter((d) => d.districtId === district)
      .map((d) => d.id);
    expect(ids).toHaveLength(2);
    const boards = ids.map((id) => fieldArenaId(FIELD_MISSION_DEFS[id]!));
    for (const b of boards) expect(getArena(b).campaignOnly, b).toBe(true);
    expect(new Set(boards).size).toBe(boards.length);
    const [a, b] = boards.map((id) => getArena(id)) as [
      ReturnType<typeof getArena>,
      ReturnType<typeof getArena>,
    ];
    expect(a.layout.join('\n')).not.toBe(b.layout.join('\n'));
    const names = new Set(a.districts!.map((d) => d.name));
    for (const d of b.districts!) expect(names.has(d.name), d.name).toBe(false);
    // and neither is the district's City Rumble map
    for (const x of [a, b]) expect(x.layout.join('\n')).not.toBe(getArena(rumble).layout.join('\n'));
  });
});

// ------------------------------------------------------------------------------------------- saves

describe('saves keep working (mission ids unchanged)', () => {
  it('an old save with Oshodi progress loads and unlocks the same missions', () => {
    // a version-2 save as the last release wrote it: Terminal Approach and its raid cleared, Rail Edge not yet
    const old = createSave(1000);
    old.missions['oshodi.approach'] = {
      ...old.missions['oshodi.approach']!,
      status: 'cleared',
      clears: 1,
      attempts: 1,
      bestStars: 2,
    };
    const loaded = repairSave(JSON.parse(JSON.stringify(old)))!;
    expect(loaded).not.toBeNull();
    expect(missionStatus(loaded, 'oshodi.approach')).toBe('cleared');
    expect(missionStatus(loaded, 'oshodi.railEdge')).toBe('available');
    expect(missionStatus(loaded, 'oshodi.boss')).toBe('locked');
    // and with Rail Edge cleared too, the boss is next
    loaded.missions['oshodi.railEdge'] = {
      ...loaded.missions['oshodi.railEdge']!,
      status: 'cleared',
      clears: 1,
      attempts: 1,
    };
    const again = repairSave(JSON.parse(JSON.stringify(loaded)))!;
    expect(missionStatus(again, 'oshodi.railEdge')).toBe('cleared');
    expect(missionStatus(again, 'oshodi.boss')).not.toBe('locked');
  });
});
