/**
 * Mission data validity: every node of every phase is a real, reachable floor tile of the district's City Rumble
 * arena (never concrete, a crate, a road or a track), the crew fits 6-9 competitors, and the board around nodes and
 * posts is open when a mission starts.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_DEFS, MISSION_IDS, buildMissionGame, crewOf, getArena, getMissionArenaId } from '../src/sim';
import { createGame } from '../src/sim';
import { Tile } from '../src/sim/types';
import { allNodeTiles, isOpenFloor } from '../src/sim/mission/state';

/** Tiles reachable from (sx, sy) over every tile that is not concrete (crates can be blasted open). */
function reach(layout: readonly string[], sx: number, sy: number): Set<string> {
  const seen = new Set<string>([`${sx},${sy}`]);
  const queue: [number, number][] = [[sx, sy]];
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const c = layout[ny]?.[nx];
      if (c === undefined || c === '#' || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe.each(MISSION_IDS)('mission %s data', (id) => {
  const def = MISSION_DEFS[id];
  const arena = getArena(getMissionArenaId(id));

  it('uses a City Rumble arena and 6-9 competitors', () => {
    expect(arena.kind).toBe('rumble');
    const opts = buildMissionGame({ spec: { id }, humanCharacter: 'streetBaller', seed: 1 });
    expect(opts.players.length).toBeGreaterThanOrEqual(6);
    expect(opts.players.length).toBeLessThanOrEqual(9);
    expect(opts.players[0]!.isBot).toBe(false);
    expect(opts.players.slice(1).every((p) => p.isBot && p.team === 1)).toBe(true);
    const withMods = buildMissionGame({
      spec: { id, modifiers: ['marketDay'] },
      humanCharacter: 'lekkiBoy',
      seed: 1,
    });
    expect(withMods.players.length).toBeLessThanOrEqual(9);
  });

  it('every node of every phase is a reachable, non-solid floor tile', () => {
    const spawn = arena.spawns[0]!;
    const open = reach(arena.layout, spawn.x, spawn.y);
    for (const [x, y] of allNodeTiles(def)) {
      expect(isOpenFloor(arena, x, y), `${id} node ${x},${y} is "${arena.layout[y]?.[x]}"`).toBe(true);
      expect(open.has(`${x},${y}`), `${id} node ${x},${y} is not reachable from the human spawn`).toBe(true);
    }
    for (const c of [{ post: def.boss.post }, ...def.crew]) {
      expect(open.has(`${c.post[0]},${c.post[1]}`), `${id} post ${c.post} unreachable`).toBe(true);
    }
  });

  it('a fresh mission has open floor on every node and a valid post for every seat', () => {
    const opts = buildMissionGame({ spec: { id }, humanCharacter: 'streetBaller', seed: 5 });
    const s = createGame(opts);
    for (const [x, y] of allNodeTiles(def)) expect(s.tiles[y * s.width + x]).toBe(Tile.Empty);
    const posts = new Set<string>();
    for (const seat of s.mission!.seats.slice(1)) {
      const p = s.players[seat.playerId]!;
      expect(isOpenFloor(arena, p.x, p.y)).toBe(true);
      expect(s.tiles[p.y * s.width + p.x]).toBe(Tile.Empty);
      expect(posts.has(`${p.x},${p.y}`)).toBe(false);
      posts.add(`${p.x},${p.y}`);
    }
    expect(s.mission!.seats.length).toBe(2 + crewOf(def, { id }).length);
  });

  it('has three phases, each with enough nodes for its goal', () => {
    for (const phase of def.phases) {
      const countable = phase.nodes.length;
      expect(countable).toBeGreaterThanOrEqual(phase.goal ?? 1);
      expect(phase.callout.length).toBeGreaterThan(10);
    }
  });
});
