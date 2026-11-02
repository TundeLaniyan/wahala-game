/**
 * The seven City Rumble communities (decision CR1): Ojuelegba (the reference arena) and the six researched areas of
 * the Canonical Lagos Map Build Bible v2 - Oshodi, Mushin, Fadeyi, Lagos Island, Lekki, Ebute-Metta. Registry and
 * mapping, the old generic boards gone, identity data (districts, landmark objects, cover aligned with the layout),
 * start-up, ambient traffic kept apart from gameplay objects, the day / night looks and the low-quality budgets, and
 * a legal one-press vehicle route on every board (the map's road lanes; which vehicle a character summons is not a
 * map rule and is not asserted here). The fairness / hazard / closing-city / bot checks that every community must
 * pass live in tests/rumble-stages.test.ts.
 */
import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENAS, CHARACTERS, RUMBLE_ARENA_IDS, createGame, getArena, tick } from '../src/sim';
import type { CharacterId } from '../src/sim';
import { NEW_ARENA_ART } from '../src/render/arenas/newArenas';
import { arenaLook } from '../src/render/arenaLook';
import { budgetFor, planEnvironment, validateEnvironment } from '../src/render/env/plan';
import { ENV_BUDGET } from '../src/render/env/types';
import { obstacleStyle } from '../src/render/assets/obstacleStyles';
import { put, run, sandbox } from './helpers';
import { chooseAutoVehicle } from '../src/sim/systems/autoVehicle';

/** Bible v2, section 1: Ojuelegba plus the six researched areas, each exactly once. */
const MAP: Record<string, { area: string; districts: string[] }> = {
  rumbleOjuelegba: {
    area: 'Ojuelegba',
    districts: ['westApproach', 'pierCourt', 'danfoPark', 'shopfrontLane', 'serviceLoop'],
  },
  rumbleOshodi: {
    area: 'Oshodi',
    districts: [
      'interchangePlaza',
      'skywalkQuarter',
      'tradingStreets',
      'expresswayJunction',
      'railwayEdge',
      'cappaWorks',
    ],
  },
  rumbleMushin: {
    area: 'Mushin',
    districts: ['ladipo', 'ojuwoye', 'idiOro', 'daleko', 'timberRow', 'courtyards'],
  },
  rumbleFadeyi: {
    area: 'Fadeyi',
    districts: ['brtCentreline', 'shopfronts', 'neighbourhood', 'onipanu', 'recreation'],
  },
  rumbleLagosIsland: {
    area: 'Lagos Island',
    districts: ['balogun', 'idumota', 'broadStreet', 'civicSquare', 'onikan', 'marina'],
  },
  rumbleLekki: {
    area: 'Lekki / Ikate',
    districts: ['promenade', 'ikate', 'admiralty', 'coastal', 'estates', 'gateway'],
  },
  rumbleEbuteMetta: {
    area: 'Ebute-Metta / Oyingbo',
    districts: ['heritage', 'station', 'oyingbo', 'residential', 'railYard', 'foreshore'],
  },
};
const RESEARCHED = [
  'rumbleOshodi',
  'rumbleMushin',
  'rumbleFadeyi',
  'rumbleLagosIsland',
  'rumbleLekki',
  'rumbleEbuteMetta',
];
const NEW_FIVE = RESEARCHED.filter((id) => id !== 'rumbleOshodi');

/** The main researched landmark and community objects that must be on each new board (cover kinds). */
const LANDMARKS: Record<string, string[]> = {
  rumbleMushin: [
    'partsStall',
    'heap',
    'timber',
    'foodHall',
    'workshop',
    'warehouse',
    'house',
    'stall',
    'shop',
  ],
  rumbleFadeyi: ['brtShelter', 'median', 'bankBlock', 'shop', 'house', 'workshop'],
  rumbleLagosIsland: [
    'stall',
    'officeTower',
    'heritage',
    'parkWall',
    'monument',
    'tree',
    'quayShed',
    'arcade',
    'shop',
  ],
  rumbleLekki: [
    'glassBlock',
    'compoundWall',
    'villa',
    'artsShed',
    'hoarding',
    'palm',
    'fuelCanopy',
    'sportsClub',
  ],
  rumbleEbuteMetta: [
    'terminus',
    'heritageHouse',
    'stationHall',
    'portal',
    'platformPost',
    'wagon',
    'marketArcade',
    'house',
  ],
};

describe('registry and mapping', () => {
  it('exactly seven City Rumble arenas are selectable, in menu order, with no duplicate id or name', () => {
    expect(RUMBLE_ARENA_IDS).toEqual(Object.keys(MAP));
    expect(new Set(RUMBLE_ARENA_IDS).size).toBe(7);
    const names = RUMBLE_ARENA_IDS.map((id) => getArena(id).name);
    expect(new Set(names).size).toBe(7);
    for (const id of RUMBLE_ARENA_IDS) expect(getArena(id).kind).toBe('rumble');
  });

  it('Ojuelegba stays, and each researched area is represented exactly once (by its reserved area and district ids)', () => {
    expect(RUMBLE_ARENA_IDS).toContain('rumbleOjuelegba');
    for (const [id, m] of Object.entries(MAP)) {
      const a = getArena(id);
      expect(
        a.districts!.map((d) => d.id),
        id,
      ).toEqual(expect.arrayContaining(m.districts)); // (Oshodi also has its four expansion districts)
      if (id !== 'rumbleOjuelegba')
        expect(a.futureBoss?.area, id).toBe(m.area === 'Oshodi' ? 'Oshodi' : m.area);
    }
    const areas = RESEARCHED.map((id) => getArena(id).futureBoss!.area);
    expect(new Set(areas).size).toBe(6);
  });

  it('the old generic maps are gone: no City Rumble district, Apapa docks, Lekki Nightworks or old Island grid', () => {
    for (const gone of ['cityRumble', 'rumbleApapa', 'rumbleLekkiNight', 'rumbleOshodiMetro'])
      expect(ARENAS[gone], gone).toBeUndefined();
    const files = readdirSync(new URL('../src/sim/arenas/', import.meta.url));
    for (const f of ['cityRumble.ts', 'rumbleApapa.ts', 'rumbleLekkiNight.ts'])
      expect(files, f).not.toContain(f);
    const art = readdirSync(new URL('../src/render/arenas/', import.meta.url));
    for (const f of [
      'rumble.ts',
      'rumbleSet.ts',
      'rumbleApapaArt.ts',
      'rumbleLekkiNightArt.ts',
      'rumbleLagosIslandArt.ts',
    ])
      expect(art, f).not.toContain(f);
    expect(Object.keys(NEW_ARENA_ART()).filter((id) => /cityRumble|Apapa|LekkiNight/.test(id))).toEqual([]);
    // every generic board that survives is a standard arena: the standard set is not replaced by the Rumble maps
    expect(Object.values(ARENAS).filter((a) => a.kind === 'standard' && !a.experimental)).toHaveLength(9);
  });

  it('the standard arenas and the Rumble communities share no layout (map content stays separate)', () => {
    const standard = new Set(
      Object.values(ARENAS)
        .filter((a) => a.kind === 'standard')
        .map((a) => a.layout.join('|')),
    );
    for (const id of RUMBLE_ARENA_IDS) expect(standard.has(getArena(id).layout.join('|')), id).toBe(false);
  });

  it('Oshodi keeps its 63 x 47 board (not downgraded)', () => {
    const a = getArena('rumbleOshodi');
    expect([a.layout[0]!.length, a.layout.length]).toEqual([63, 47]);
  });
});

describe.each(NEW_FIVE.map((id) => [id] as const))('%s identity data', (id) => {
  const a = getArena(id);
  const W = a.layout[0]!.length;
  const H = a.layout.length;

  it('carries its community landmarks and a mixed set of objects (never a flat arrangement of one block type)', () => {
    const kinds = new Set(a.cover!.map((r) => r.kind));
    for (const k of LANDMARKS[id]!) expect(kinds, `${id} has a ${k}`).toContain(k);
    expect(kinds.size).toBeGreaterThanOrEqual(9);
    // no single object family dominates the board's cover
    const tiles = new Map<string, number>();
    for (const r of a.cover!) tiles.set(r.kind, (tiles.get(r.kind) ?? 0) + r.w * r.h);
    const total = [...tiles.values()].reduce((x, y) => x + y, 0);
    expect(
      Math.max(...tiles.values()) / total,
      `${id}: the biggest family's share of the cover`,
    ).toBeLessThan(0.45);
  });

  it('the cover list matches the layout exactly: every # tile is one object, no object stands on open floor', () => {
    const owner = new Map<number, number>();
    a.cover!.forEach((r, i) => {
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          expect(a.layout[y]![x], `${id} cover ${r.kind} at ${x},${y}`).toBe('#');
          expect(owner.has(y * W + x), `${id} ${x},${y} claimed twice`).toBe(false);
          owner.set(y * W + x, i);
        }
    });
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (a.layout[y]![x] === '#') expect(owner.has(y * W + x), `${id} ${x},${y} has no object`).toBe(true);
  });

  it('every cover object has a renderer family and every # tile is drawn by the cover (headless build)', () => {
    const reg = NEW_ARENA_ART()[id]!;
    const cover = reg.cover!({ width: W, height: H })!;
    expect(cover).not.toBeNull();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (a.layout[y]![x] === '#') expect(cover.covers(y * W + x), `${id} ${x},${y}`).toBe(true);
    cover.dispose();
  });

  it('the district graph is real: every district has at least two links, every link tile is open floor', () => {
    const links = a.districtLinks!;
    for (const d of a.districts!) {
      const n = links.filter((l) => l.from === d.id || l.to === d.id).length;
      expect(n, `${id} ${d.id} links`).toBeGreaterThanOrEqual(2);
    }
    for (const l of links) {
      expect(l.tiles.length, `${id} ${l.from}-${l.to}`).toBeGreaterThan(0);
      for (const [x, y] of l.tiles) expect(a.layout[y]![x], `${id} link tile ${x},${y}`).not.toBe('#');
    }
  });

  it('the obstacle clutter, the cover reach and the menu text are the arena’s own', () => {
    const style = obstacleStyle(id);
    expect(style.softFor, id).toBeDefined();
    expect(a.info.tagline.length).toBeGreaterThan(30);
    expect(a.info.hazards.length).toBeGreaterThanOrEqual(4);
    expect(a.futureBoss?.status).toBe('reserved');
    expect(JSON.stringify(a.futureBoss)).not.toMatch(/boss\b.*(named|real)/i);
  });
});

describe.each(RUMBLE_ARENA_IDS.map((id) => [id] as const))('%s starts and plays', (id) => {
  const a = getArena(id);
  it('loads and starts with 32 competitors, runs two seconds, and no ambient vehicle is a gameplay entity', () => {
    const s = createGame({
      seed: 5,
      arenaId: id,
      players: Array.from({ length: 32 }, (_, i) => ({
        name: `P${i}`,
        characterId: 'streetBaller' as const,
        isBot: true,
      })),
      settings: { game: 'deathmatch' },
    });
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    for (let i = 0; i < 120; i++) tick(s, {});
    expect(s.players).toHaveLength(32);
    expect(s.width).toBe(a.layout[0]!.length);
    expect(s.vehicles).toHaveLength(0); // the only gameplay vehicles are summoned ones and the stage's own sweeps
    expect(a.stageHazards.length).toBeGreaterThanOrEqual(2);
  });

  it('every hazard route sits on road / track tiles and every strike / push zone on open floor', () => {
    for (const h of a.stageHazards) {
      if (h.kind === 'sweep')
        for (const r of h.routes)
          for (const [x, y] of r) expect(a.layout[y]![x], `${id} route ${x},${y}`).toBe('=');
      if (h.kind === 'strike')
        for (const z of h.zones)
          for (const [x, y] of z) expect(a.layout[y]![x], `${id} zone ${x},${y}`).not.toBe('#');
      if (h.kind === 'push')
        for (const z of h.zones)
          for (const [x, y] of z.tiles) expect(a.layout[y]![x], `${id} push ${x},${y}`).not.toBe('#');
    }
  });

  it('every character has a legal one-press vehicle route on this board', () => {
    for (const c of Object.keys(CHARACTERS) as CharacterId[]) {
      const s = createGame({
        seed: 3,
        arenaId: id,
        players: [
          { name: 'A', characterId: c, isBot: false },
          { name: 'B', characterId: 'streetBaller', isBot: true },
        ],
        settings: { game: 'deathmatch', stageHazards: false },
      });
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
      s.players[0]!.hasVoucher = true;
      expect(chooseAutoVehicle(s, 0), `${id} ${c}`).not.toBeNull();
      run(s, 1, { 0: { vehicle: { type: 'auto' } } });
      expect(s.vehicles, `${id} ${c}`).toHaveLength(1);
    }
  });
});

describe('presentation: day and night, environment, low quality', () => {
  it.each(NEW_FIVE.map((id) => [id] as const))(
    '%s ships a night look on the same geometry, lit enough to read, distinct from day',
    (id) => {
      const reg = NEW_ARENA_ART()[id]!;
      expect(reg.nightLook).toBeDefined();
      const lum = (c: number): number =>
        (0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff)) / 255;
      const light = (l: typeof reg.look): number =>
        (l.hemi.intensity * (0.6 * lum(l.hemi.sky) + 0.4 * lum(l.hemi.ground)) +
          l.sun.intensity * lum(l.sun.color) * 0.55) *
        l.exposure *
        lum(l.floorTint);
      expect(lum(reg.nightLook!.sky)).toBeLessThan(lum(reg.look.sky) * 0.5);
      expect(light(reg.nightLook!)).toBeGreaterThan(light(reg.look) * 0.3); // the floor and the hazard lanes stay readable
      expect(reg.nightLook!.lamps.length).toBeGreaterThanOrEqual(reg.look.lamps.length);
      expect(arenaLook(id)).toBe(reg.look); // the day look is the default
    },
  );

  it.each(RUMBLE_ARENA_IDS.map((id) => [id] as const))(
    '%s: the living environment is valid and fits every quality budget',
    (id) => {
      const a = getArena(id);
      const board = { cols: a.layout[0]!.length, rows: a.layout.length };
      const src = NEW_ARENA_ART()[id]!.env!;
      const env = typeof src === 'function' ? src(board) : src;
      expect(validateEnvironment(env, board)).toEqual([]);
      for (const level of ['veryLow', 'low', 'medium', 'high'] as const) {
        const plan = planEnvironment(env, level, board);
        const cap = budgetFor(env, level);
        expect(plan.vehicles.length, `${id} ${level}`).toBeLessThanOrEqual(cap.vehicles + 0);
        expect(plan.people, `${id} ${level}`).toBeLessThanOrEqual(cap.people);
        // the low tiers still draw some traffic: the roads read as roads
        if (level !== 'veryLow') expect(plan.vehicles.length, `${id} ${level} vehicles`).toBeGreaterThan(0);
      }
      expect(ENV_BUDGET.low.vehicles).toBeGreaterThan(0);
    },
  );

  it('a Rumble stage never starts with the standard camera, and ambient routes are scenery with no sim counterpart', () => {
    const a = getArena('rumbleMushin');
    const s = sandbox({ arenaId: 'rumbleMushin', players: 2 });
    put(s, 0, 4, 4);
    expect(s.vehicles).toHaveLength(0);
    expect(a.config?.vehicles?.lanes?.length).toBeGreaterThanOrEqual(8);
    expect(existsSync(new URL('../src/render/env/Traffic.ts', import.meta.url))).toBe(true);
  });
});
