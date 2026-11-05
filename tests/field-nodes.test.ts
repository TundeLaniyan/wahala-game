/**
 * Section field mission data validity (src/sim/mission/fieldDefs.ts): every marker, door, exit and post is a real,
 * reachable floor tile of the district's City Rumble arena; doors have a return tile beside them; an escape is fair
 * (the exit is clearly nearer to the player than to the pursuer); a fresh mission has open floor on every tile it uses.
 */
import { describe, expect, it } from 'vitest';
import {
  FIELD_MISSION_DEFS,
  FIELD_MISSION_IDS,
  MISSION_DEFS,
  buildMissionGame,
  createGame,
  getArena,
} from '../src/sim';
import type { FieldMissionDef } from '../src/sim';
import { Tile } from '../src/sim/types';
import { isOpenFloor } from '../src/sim/mission/state';
import { fieldTiles } from '../src/sim/mission/fieldState';

/** Walking distance over every non-concrete tile from (sx, sy); crates can be blasted open, roads can be crossed. */
function distances(layout: readonly string[], sx: number, sy: number): Map<string, number> {
  const dist = new Map<string, number>([[`${sx},${sy}`, 0]]);
  const queue: [number, number][] = [[sx, sy]];
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q]!;
    const d = dist.get(`${x},${y}`)!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const c = layout[ny]?.[nx];
      if (c === undefined || c === '#' || dist.has(`${nx},${ny}`)) continue;
      dist.set(`${nx},${ny}`, d + 1);
      queue.push([nx, ny]);
    }
  }
  return dist;
}

describe('every district has an entry and a middle field mission (except the standalone-raid section)', () => {
  it('lists eleven field missions over six districts', () => {
    expect(FIELD_MISSION_IDS).toHaveLength(11);
    const byDistrict = new Map<string, number>();
    for (const id of FIELD_MISSION_IDS) {
      const d = FIELD_MISSION_DEFS[id]!.districtId;
      byDistrict.set(d, (byDistrict.get(d) ?? 0) + 1);
    }
    expect([...byDistrict.keys()].sort()).toEqual(Object.keys(MISSION_DEFS).sort());
    for (const [district, n] of byDistrict) expect(n, district).toBeGreaterThanOrEqual(1);
  });
});

describe.each(FIELD_MISSION_IDS)('field mission %s data', (id) => {
  const def: FieldMissionDef = FIELD_MISSION_DEFS[id]!;
  const arena = getArena(MISSION_DEFS[def.districtId].arenaId);
  const dist = distances(arena.layout, def.start[0], def.start[1]);

  it('is a City Rumble district mission with 2-9 competitors and at least one required leg', () => {
    expect(arena.kind).toBe('rumble');
    const opts = buildMissionGame({
      spec: { id: def.districtId, fieldId: id },
      humanCharacter: 'streetBaller',
      seed: 1,
    });
    expect(opts.players.length).toBe(1 + def.enemies.length);
    expect(opts.players.length).toBeLessThanOrEqual(9);
    expect(opts.players[0]!.isBot).toBe(false);
    expect(opts.players.slice(1).every((p) => p.isBot && p.team === 1)).toBe(true);
    expect(opts.arenaId).toBe(arena.id);
    expect(def.legs.length).toBeGreaterThan(0);
    expect(def.parSec).toBeLessThan(def.timeLimitSec);
  });

  it('every tile it uses is open, reachable floor', () => {
    for (const [x, y] of fieldTiles(def)) {
      expect(isOpenFloor(arena, x, y), `${id} tile ${x},${y} is "${arena.layout[y]?.[x]}"`).toBe(true);
      expect(dist.has(`${x},${y}`), `${id} tile ${x},${y} unreachable from the start`).toBe(true);
    }
    for (const e of def.enemies) {
      expect(isOpenFloor(arena, e.post[0], e.post[1]), `${id} post ${e.post}`).toBe(true);
      expect(dist.has(`${e.post[0]},${e.post[1]}`), `${id} post ${e.post} unreachable`).toBe(true);
    }
  });

  it('doors have a return tile beside them, are referenced by a leg when required, and use unique ids', () => {
    const ids = new Set<string>();
    for (const d of def.doors) {
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
      expect(Math.abs(d.x - d.returnTile[0]) + Math.abs(d.y - d.returnTile[1]), `${id} ${d.id}`).toBe(1);
      const leg = def.legs.find((l) => l.kind === 'door' && l.doorId === d.id);
      expect(leg !== undefined, `${id} door ${d.id} required=${d.required}`).toBe(d.required);
    }
    for (const leg of def.legs) if (leg.kind === 'door') expect(ids.has(leg.doorId)).toBe(true);
  });

  it('an escape is fair: the exit is much nearer to the player than to the pursuers', () => {
    let from: [number, number] = [def.start[0], def.start[1]];
    for (const leg of def.legs) {
      if (leg.kind === 'reachMarkers') {
        const last = leg.markers[leg.markers.length - 1]!;
        from = [last.x, last.y];
      }
      if (leg.kind === 'door')
        from = [
          def.doors.find((d) => d.id === leg.doorId)!.returnTile[0],
          def.doors.find((d) => d.id === leg.doorId)!.returnTile[1],
        ];
      if (leg.kind === 'clearGroup') {
        const g = def.enemies.filter((e) => e.group === leg.group);
        from = [g[0]!.post[0], g[0]!.post[1]];
      }
      if (leg.kind !== 'escapeRoute') continue;
      const fromPlayer = distances(arena.layout, from[0], from[1]);
      const own = fromPlayer.get(`${leg.exit.x},${leg.exit.y}`)!;
      expect(own, `${id} exit unreachable from ${from}`).toBeDefined();
      for (const e of def.enemies.filter((o) => o.group === leg.group)) {
        const theirs = distances(arena.layout, e.post[0], e.post[1]).get(`${leg.exit.x},${leg.exit.y}`)!;
        const toPlayer = fromPlayer.get(`${e.post[0]},${e.post[1]}`)!;
        expect(toPlayer, `${id} pursuer starts ${toPlayer} tiles from the player`).toBeGreaterThanOrEqual(8);
        expect(theirs - own, `${id} pursuer ${theirs} vs player ${own} to the exit`).toBeGreaterThanOrEqual(
          4,
        );
      }
    }
  });

  it('a fresh mission has open floor on every tile and a valid, unique tile for every seat', () => {
    const s = createGame(
      buildMissionGame({
        spec: { id: def.districtId, fieldId: id },
        humanCharacter: 'streetBaller',
        seed: 5,
      }),
    );
    for (const [x, y] of fieldTiles(def)) expect(s.tiles[y * s.width + x]).toBe(Tile.Empty);
    const seen = new Set<string>();
    for (const p of s.players) {
      expect(isOpenFloor(arena, p.x, p.y)).toBe(true);
      expect(seen.has(`${p.x},${p.y}`)).toBe(false);
      seen.add(`${p.x},${p.y}`);
    }
    expect(s.players[0]!.x).toBe(def.start[0]);
    expect(s.players[0]!.y).toBe(def.start[1]);
    expect(s.mission!.field).toBeDefined();
    expect(s.mission!.bossId).toBe(-1);
    expect(s.mission!.seats).toHaveLength(1 + def.enemies.length);
  });
});
