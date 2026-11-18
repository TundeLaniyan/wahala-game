/**
 * District sectors (docs/CAMPAIGN_SECTOR_AI.md, "District-sector architecture", decisions DS1-DS8): every field mission
 * is played in a closed part of its district map. The data is sound (every authored tile inside, every opening of the
 * rects barricaded), the stamp is contained (a flood from the start never leaves the rects; every target is reachable,
 * the route without blasting a crate), the rest of the game is untouched without a sector, and the core systems keep
 * to the sector: hazards, drops, manholes, respawns and vehicle entries.
 */
import { describe, expect, it } from 'vitest';
import {
  FIELD_MISSION_DEFS,
  FIELD_MISSION_IDS,
  MISSION_DEFS,
  allBorderEntries,
  buildMissionGame,
  createGame,
  getArena,
  observe,
  tick,
} from '../src/sim';
import type { GameState, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { MISSION_SECTORS, MISSION_SECTOR_IDS, getSector } from '../src/sim/mission/sectors';
import type { MissionSectorDef } from '../src/sim/mission/sectors';
import {
  applySector,
  inSector,
  openSectorGates,
  rectsContain,
  sectorBlockedTiles,
  sectorLeaks,
} from '../src/sim/mission/sector';
import { fieldRouteStops, fieldTargetTiles, fieldTiles } from '../src/sim/mission/fieldState';
import { fieldEnemiesOf } from '../src/sim/mission/combatPilot';
import { hashOf } from './mission-helpers';
import { put, sandbox } from './helpers';

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Tiles reachable from (sx, sy) over `open` tiles. */
function flood(s: GameState, sx: number, sy: number, open: (i: number) => boolean): Set<number> {
  const seen = new Set<number>([sy * s.width + sx]);
  const queue = [sy * s.width + sx];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height) continue;
      const j = ny * s.width + nx;
      if (seen.has(j) || !open(j)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen;
}

const fieldGame = (id: string, seed = 5, extra: { noSector?: boolean } = {}): GameState => {
  const def = FIELD_MISSION_DEFS[id]!;
  return createGame(
    buildMissionGame({
      spec: { id: def.districtId, fieldId: id, ...extra },
      humanCharacter: 'streetBaller',
      seed,
    }),
  );
};

describe('sector data', () => {
  it('every field mission has its own sector of its own district', () => {
    expect(MISSION_SECTOR_IDS).toHaveLength(FIELD_MISSION_IDS.length);
    const used = new Set<string>();
    for (const id of FIELD_MISSION_IDS) {
      const def = FIELD_MISSION_DEFS[id]!;
      expect(def.sectorId, id).toBeDefined();
      const sector = getSector(def.sectorId!);
      expect(sector.districtId).toBe(def.districtId);
      expect(used.has(sector.id), `${sector.id} used twice`).toBe(false);
      used.add(sector.id);
    }
  });

  it('two missions of one district use different, recognisable parts of the map (they never share most tiles)', () => {
    const byDistrict = new Map<string, MissionSectorDef[]>();
    for (const s of Object.values(MISSION_SECTORS))
      byDistrict.set(s.districtId, [...(byDistrict.get(s.districtId) ?? []), s]);
    for (const [district, list] of byDistrict) {
      if (list.length < 2) continue;
      const layout = getArena(MISSION_DEFS[list[0]!.districtId].arenaId).layout;
      const tilesOf = (d: MissionSectorDef): Set<string> => {
        const out = new Set<string>();
        layout.forEach((row, y) =>
          [...row].forEach((c, x) => c !== '#' && rectsContain(d.rects, x, y) && out.add(`${x},${y}`)),
        );
        return out;
      };
      const [a, b] = list.map(tilesOf) as [Set<string>, Set<string>];
      const shared = [...a].filter((k) => b.has(k)).length;
      expect(shared / Math.min(a.size, b.size), district).toBeLessThan(0.15);
    }
  });

  describe.each(MISSION_SECTOR_IDS)('%s', (sid) => {
    const sector = getSector(sid);
    const def = Object.values(FIELD_MISSION_DEFS).find((d) => d.sectorId === sid)!;
    const arena = getArena(MISSION_DEFS[sector.districtId].arenaId);
    const W = arena.layout[0]!.length;
    const H = arena.layout.length;

    it('is sized for play: room to patrol and flank, never a corridor, never the whole map', () => {
      let open = 0;
      let all = 0;
      arena.layout.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c === '#') return;
          all++;
          if (rectsContain(sector.rects, x, y)) open++;
        }),
      );
      expect(open, sid).toBeGreaterThanOrEqual(180);
      expect(open / all, sid).toBeLessThan(0.5);
      for (const r of sector.rects) {
        expect(r[0]).toBeLessThanOrEqual(r[2]);
        expect(r[1]).toBeLessThanOrEqual(r[3]);
        expect(r[0] >= 0 && r[1] >= 0 && r[2] < W && r[3] < H, `${sid} rect inside the board`).toBe(true);
      }
      expect(sector.viewMargin).toBeGreaterThanOrEqual(2);
    });

    it('every authored tile (start, markers, exits, doors, return tiles, posts, equipment) lies inside the rects', () => {
      const tiles = [
        ...fieldTiles(def),
        ...fieldTargetTiles(def),
        ...fieldEnemiesOf(def).map((e) => [e.post[0], e.post[1]] as [number, number]),
      ];
      for (const [x, y] of tiles)
        expect(rectsContain(sector.rects, x, y), `${sid} tile ${x},${y}`).toBe(true);
    });

    it('barricades stand on open ground at the rect edge, never on an authored tile, never twice', () => {
      const authored = new Set(
        [...fieldTiles(def), ...fieldEnemiesOf(def).map((e) => e.post)].map(([x, y]) => `${x},${y}`),
      );
      const seen = new Set<string>();
      for (const [x, y] of sectorBlockedTiles(sector)) {
        const k = `${x},${y}`;
        expect(arena.layout[y]?.[x], `${sid} barricade ${k} on concrete`).not.toBe('#');
        expect(authored.has(k), `${sid} barricade on authored tile ${k}`).toBe(false);
        expect(seen.has(k), `${sid} barricade tile ${k} twice`).toBe(false);
        seen.add(k);
        const touches =
          rectsContain(sector.rects, x, y) ||
          N4.some(([dx, dy]) => rectsContain(sector.rects, x + dx, y + dy));
        expect(touches, `${sid} barricade ${k} away from the rects`).toBe(true);
      }
      expect(new Set(sector.barricades.map((b) => b.id)).size).toBe(sector.barricades.length);
    });

    it('closes every opening of the rects (no leak in the layout data)', () => {
      expect(sectorLeaks(arena.layout, sector)).toEqual([]);
    });

    it('stamped: a flood from the start never leaves the rects (crates walkable); every target is reachable', () => {
      for (const seed of [1, 7]) {
        const s = fieldGame(def.id, seed);
        expect(s.sector?.id).toBe(sid);
        const reach = flood(s, def.start[0], def.start[1], (i) => s.tiles[i] !== Tile.Hard);
        for (const i of reach)
          expect(
            inSector(s, i % s.width, Math.floor(i / s.width)),
            `${sid} leaks at ${i % s.width},${Math.floor(i / s.width)}`,
          ).toBe(true);
        for (const [x, y] of [...fieldTiles(def), ...fieldEnemiesOf(def).map((e) => e.post)])
          expect(reach.has(y * s.width + x), `${sid} ${x},${y} unreachable`).toBe(true);
        // every player stands inside the sector
        for (const p of s.players) expect(inSector(s, p.x, p.y), `${sid} seat ${p.id}`).toBe(true);
      }
    });

    it('the route needs no blasting: every stop is reachable over open floor from the one before', () => {
      const s = fieldGame(def.id, 3);
      const stops = fieldRouteStops(def);
      const targets = new Set(fieldTargetTiles(def).map(([x, y]) => y * s.width + x));
      for (let k = 1; k < stops.length; k++) {
        const [ax, ay] = stops[k - 1]!;
        const [bx, by] = stops[k]!;
        const reach = flood(s, ax, ay, (i) => s.tiles[i] === Tile.Empty || targets.has(i));
        expect(reach.has(by * s.width + bx), `${sid}: ${ax},${ay} -> ${bx},${by}`).toBe(true);
      }
    });
  });
});

describe('no sector, no change', () => {
  it('City Rumble, Classic and the boss missions carry no sector key; neither does a ?nosector field mission', () => {
    const rumble = sandbox({ players: 8, arenaId: 'rumbleOshodi' });
    const classic = sandbox({ players: 2 });
    const boss = createGame(
      buildMissionGame({ spec: { id: 'oshodi' }, humanCharacter: 'streetBaller', seed: 1 }),
    );
    const plain = fieldGame('oshodi.approach', 5, { noSector: true });
    for (const s of [rumble, classic, boss, plain]) {
      expect('sector' in s).toBe(false);
      expect('sector' in observe(s, 0)).toBe(false);
    }
  });

  it('the stamp draws no random number: the RNG and every crate outside the barricades match the unstamped board', () => {
    for (const id of FIELD_MISSION_IDS) {
      const def = FIELD_MISSION_DEFS[id]!;
      const spec = { id: def.districtId, fieldId: id };
      const a = createGame(buildMissionGame({ spec, humanCharacter: 'streetBaller', seed: 9 }));
      const b = createGame(
        buildMissionGame({ spec: { ...spec, noSector: true }, humanCharacter: 'streetBaller', seed: 9 }),
      );
      expect(a.rngState, id).toBe(b.rngState);
      const blocked = new Set(a.sector!.blocked);
      // outside the barricades a tile differs only where the route was cleared of crates
      for (let i = 0; i < a.tiles.length; i++) {
        if (blocked.has(i) || a.tiles[i] === b.tiles[i]) continue;
        expect([a.tiles[i], b.tiles[i]], `${id} tile ${i}`).toEqual([Tile.Empty, Tile.Soft]);
      }
    }
  });

  it('is deterministic: the same seed builds and plays the same sector match', () => {
    const run = (): string => {
      const s = fieldGame('mushin.market', 11);
      s.settings.stageHazards = true;
      for (let i = 0; i < 1200; i++) tick(s, {});
      return hashOf(s);
    };
    expect(run()).toBe(run());
  });
});

describe('the core systems keep to the sector', () => {
  it('scheduled hazards that leave the sector are off; drops land inside it only', () => {
    for (const id of FIELD_MISSION_IDS) {
      const s = fieldGame(id, 4);
      const arena = getArena(s.arenaId);
      arena.stageHazards.forEach((h, i) => {
        if (h.kind === 'teleport') return;
        const tiles =
          h.kind === 'sweep'
            ? h.routes.flat()
            : h.kind === 'strike'
              ? h.targetPlayers
                ? []
                : h.zones.flat()
              : h.kind === 'push'
                ? h.zones.flatMap((z) => z.tiles)
                : [];
        const fits = tiles.every(([x, y]) => inSector(s, x, y));
        if (!fits) expect(s.stage.nextAt[i], `${id} hazard ${i} (${h.kind})`).toBe(Infinity);
      });
    }
    // a long run with goods falling: every dropped block inside the sector
    const s = fieldGame('mushin.market', 2);
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 * 120; i++) events.push(...tick(s, {}));
    const drops = events.filter((e) => e.type === 'stageBlockDropped');
    expect(drops.length).toBeGreaterThan(0);
    for (const e of drops) if (e.type === 'stageBlockDropped') expect(inSector(s, e.x, e.y)).toBe(true);
  });

  it('a manhole whose far end lies outside the sector carries nobody (and the shared partner map is untouched)', () => {
    const s = sandbox({ players: 2, arenaId: 'ajegunleBackstreets', stage: true });
    s.sector = {
      id: 'test',
      rects: [[0, 0, 7, 10]],
      blocked: [],
      gates: [],
      clip: { x0: 0, y0: 0, x1: 7, y1: 10 },
      viewMargin: 2,
      hazards: 'inside',
    };
    put(s, 0, 3, 4);
    put(s, 1, 10, 9);
    const stepOn = (): SimEvent[] => {
      const out: SimEvent[] = [];
      const me = s.players[0]!;
      for (let i = 0; i < 40 && me.x > 2; i++) out.push(...tick(s, { 0: { move: 'left' } }));
      for (let i = 0; i < 30; i++) out.push(...tick(s, {}));
      return out;
    };
    expect(stepOn().some((e) => e.type === 'playerTeleported')).toBe(false);
    expect([s.players[0]!.x, s.players[0]!.y]).toEqual([2, 4]); // on the manhole; its partner (12, 6) is outside
    delete s.sector;
    put(s, 0, 3, 4);
    s.players[0]!.teleportReadyTick = 0;
    expect(stepOn().some((e) => e.type === 'playerTeleported')).toBe(true);
  });

  it('a respawn is always inside the sector', () => {
    const s = sandbox({ players: 4, arenaId: 'rumbleMushin' });
    s.config = { ...s.config, respawn: { ...s.config.respawn, enabled: true } };
    s.sector = {
      id: 'test',
      rects: [[2, 28, 50, 36]],
      blocked: [],
      gates: [],
      clip: { x0: 0, y0: 25, x1: 52, y1: 38 },
      viewMargin: 3,
      hazards: 'inside',
    };
    for (const p of s.players) {
      put(s, p.id, 4 + p.id * 3, 30);
    }
    const victim = s.players[2]!;
    victim.alive = false;
    victim.respawnAt = s.tick + 1;
    for (let i = 0; i < 10 && !victim.alive; i++) tick(s, {});
    expect(victim.alive).toBe(true);
    expect(inSector(s, victim.x, victim.y)).toBe(true);
  });

  it('vehicles enter only through a border entry inside the sector', () => {
    const s = sandbox({ players: 2, arenaId: 'rumbleLekki' });
    const all = allBorderEntries(s);
    expect(all.length).toBeGreaterThan(0);
    s.sector = {
      id: 'test',
      rects: [[0, 21, 33, 32]],
      blocked: [],
      gates: [],
      clip: { x0: 0, y0: 18, x1: 36, y1: 35 },
      viewMargin: 3,
      hazards: 'inside',
    };
    const inside = allBorderEntries(s);
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.length).toBeLessThan(all.length);
    for (const e of inside) expect(inSector(s, e.x, e.y)).toBe(true);
    // a bot sees the same (the sector is public in its observation)
    expect(allBorderEntries(observe(s, 1))).toEqual(inside);
  });

  it('a gate opens (concrete to floor) when its leg is done, once', () => {
    const s = fieldGame('oshodi.approach', 6);
    const gateDef: MissionSectorDef = {
      ...getSector('oshodi.terminalApproach'),
      barricades: getSector('oshodi.terminalApproach').barricades.filter((b) => b.id !== 'depotGate'),
      gates: [
        {
          id: 'depotGate',
          kind: 'gate',
          tiles: [
            [36, 37],
            [36, 38],
            [36, 39],
          ],
          opensAfterLeg: 0,
        },
      ],
    };
    applySector(s, gateDef);
    const idx = 37 * s.width + 36;
    expect(s.tiles[idx]).toBe(Tile.Hard);
    expect(s.sector!.blocked).toContain(idx);
    const events: SimEvent[] = [];
    openSectorGates(s, 1, events);
    expect(s.tiles[idx]).toBe(Tile.Hard);
    openSectorGates(s, 0, events);
    expect(s.tiles[idx]).toBe(Tile.Empty);
    expect(s.sector!.blocked).not.toContain(idx);
    expect(events).toEqual([
      { type: 'sectorGateOpened', gateId: 'depotGate', tiles: [idx, idx + s.width, idx + 2 * s.width] },
    ]);
    openSectorGates(s, 0, events);
    expect(events).toHaveLength(1);
  });
});
