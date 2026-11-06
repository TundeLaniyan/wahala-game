/**
 * Static solvability analysis of a raid layout (used by the layout tests, and available to tools): proves from the data
 * alone that a player with `bombs.range` bombs can reach everything that matters. It plays the raid "in the abstract":
 *
 *   1. the reachable region R is a flood fill from the entrance over open floor, destroyed crates and opened doors;
 *   2. a crate, cargo or barrel falls when some tile of R has a straight, clear line to it within the bomb range AND the
 *      bomb can be left (an escape tile outside the cross within 16 steps, so inside the fuse);
 *   3. a wave counts as cleared once it has started and every one of its spots is in R (the player can reach and bomb it);
 *      a door opens when its condition holds (a switch needs its tile in R);
 *
 * repeated to a fixed point. Problems: marked cargo never destroyed (an unreachable pocket), the extraction tile, a side
 * room, a switch or an enemy spot outside R, a destructible nobody can destroy.
 */
import type { TilePos } from '../types';
import type { DoorCondition, RaidDef } from './def';
import { parseRaidLayout } from './layout';

export interface RaidAnalysis {
  problems: string[];
  /** Tiles ('x,y') reachable at the end. */
  reachable: Set<string>;
  /** Destructible ids (cargo ids, or `crate@x,y` for plain crates) in the order they fell. */
  fellInOrder: string[];
  /** Door ids in the order they opened. */
  doorsInOrder: string[];
  /** For each wave (by index): the doors already open when it started (empty when it never starts). */
  doorsAtWaveStart: string[][];
}

const DIRS: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const key = (x: number, y: number): string => `${x},${y}`;
/** Steps the player can take before a 3-second fuse is out, minus a margin. */
const ESCAPE_STEPS = 14;

export function analyseRaid(def: RaidDef): RaidAnalysis {
  const parsed = parseRaidLayout(def);
  const { width, height } = parsed;
  const range = def.bombs.range;
  const rows = def.layout;
  const problems: string[] = [];

  // destructibles by position
  const destructible = new Map<string, string>(); // pos -> id
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (rows[y]![x] === 'x') destructible.set(key(x, y), `crate@${x},${y}`);
  for (const c of parsed.cargo) destructible.set(key(c.x, c.y), c.id);
  const markedIds = new Set(parsed.cargo.filter((c) => c.marked).map((c) => c.id));
  const doorAt = new Map(parsed.doors.map((d) => [key(d.x, d.y), d.def.id]));

  const fell = new Set<string>();
  const fellInOrder: string[] = [];
  const openDoors = new Set<string>();
  const doorsInOrder: string[] = [];
  const doorsAtWaveStart: string[][] = def.waves.map(() => []);
  const started = new Set<number>();
  const cleared = new Set<number>();
  const wallAt = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= width || y >= height || rows[y]![x] === '#';

  const walkable = (x: number, y: number): boolean => {
    if (wallAt(x, y)) return false;
    const d = doorAt.get(key(x, y));
    if (d !== undefined) return openDoors.has(d);
    const id = destructible.get(key(x, y));
    return id === undefined || fell.has(id);
  };

  const flood = (): Set<string> => {
    const seen = new Set<string>([key(parsed.entrance.x, parsed.entrance.y)]);
    const queue: TilePos[] = [parsed.entrance];
    for (let head = 0; head < queue.length; head++) {
      const t = queue[head]!;
      for (const [dx, dy] of DIRS) {
        const x = t.x + dx;
        const y = t.y + dy;
        if (seen.has(key(x, y)) || !walkable(x, y)) continue;
        seen.add(key(x, y));
        queue.push({ x, y });
      }
    }
    return seen;
  };

  const blastTiles = (p: TilePos): Set<string> => {
    const out = new Set<string>([key(p.x, p.y)]);
    for (const [dx, dy] of DIRS) {
      for (let i = 1; i <= range; i++) {
        const x = p.x + dx * i;
        const y = p.y + dy * i;
        if (wallAt(x, y) || (doorAt.has(key(x, y)) && !openDoors.has(doorAt.get(key(x, y))!))) break;
        out.add(key(x, y));
        const id = destructible.get(key(x, y));
        if (id !== undefined && !fell.has(id)) break;
      }
    }
    return out;
  };

  const canLeave = (p: TilePos, reach: Set<string>): boolean => {
    const blast = blastTiles(p);
    const seen = new Set<string>([key(p.x, p.y)]);
    let frontier: TilePos[] = [p];
    for (let step = 1; step <= ESCAPE_STEPS; step++) {
      const next: TilePos[] = [];
      for (const t of frontier) {
        for (const [dx, dy] of DIRS) {
          const x = t.x + dx;
          const y = t.y + dy;
          const k = key(x, y);
          if (seen.has(k) || !reach.has(k)) continue;
          if (!blast.has(k)) return true;
          seen.add(k);
          next.push({ x, y });
        }
      }
      frontier = next;
    }
    return false;
  };

  /** A tile of R with a clear straight line to (tx, ty) within range, from which the bomb can be left. */
  const bombable = (tx: number, ty: number, reach: Set<string>): boolean => {
    for (const [dx, dy] of DIRS) {
      for (let i = 1; i <= range; i++) {
        const x = tx - dx * i;
        const y = ty - dy * i;
        if (!walkable(x, y)) break;
        if (reach.has(key(x, y)) && canLeave({ x, y }, reach)) return true;
      }
    }
    return false;
  };

  const conditionHolds = (c: DoorCondition, reach: Set<string>): boolean => {
    switch (c.kind) {
      case 'cargoDestroyed': {
        const n = [...markedIds].filter((id) => fell.has(id)).length;
        return n >= (c.count ?? markedIds.size);
      }
      case 'destroyed':
        return fell.has(c.id);
      case 'waveCleared':
        return cleared.has(c.wave);
      case 'switch': {
        const s = parsed.switches[c.index];
        return s !== undefined && reach.has(key(s.x, s.y));
      }
      case 'lieutenantDown': {
        const waves = def.waves.flatMap((w, i) =>
          w.enemies.some((e) => e.kind === 'lieutenant') ? [i] : [],
        );
        const rooms = def.rooms.filter((r) => (r.enemies ?? []).some((e) => e.kind === 'lieutenant'));
        return waves.every((i) => cleared.has(i)) && rooms.every((r) => openDoors.has(r.door));
      }
      case 'doorOpened':
        return openDoors.has(c.door);
    }
  };

  const waveStarted = (i: number): boolean => {
    const t = def.waves[i]!.trigger;
    switch (t.kind) {
      case 'start':
      case 'ticks':
        return true;
      case 'cargoDestroyed':
        return [...markedIds].filter((id) => fell.has(id)).length >= t.count;
      case 'waveCleared':
        return cleared.has(t.wave);
      case 'doorOpened':
        return openDoors.has(t.door);
    }
  };

  for (let round = 0; round < 200; round++) {
    const reach = flood();
    let changed = false;
    // waves: started, then cleared once every spot of the wave is reachable
    def.waves.forEach((w, i) => {
      if (!started.has(i) && waveStarted(i)) {
        started.add(i);
        doorsAtWaveStart[i] = [...doorsInOrder];
        changed = true;
      }
      if (
        started.has(i) &&
        !cleared.has(i) &&
        w.enemies.every((e) => {
          const s = parsed.spots[e.spot]!;
          return reach.has(key(s.x, s.y));
        })
      ) {
        cleared.add(i);
        changed = true;
      }
    });
    for (const d of parsed.doors) {
      if (!openDoors.has(d.def.id) && conditionHolds(d.def.opensWhen, reach)) {
        openDoors.add(d.def.id);
        doorsInOrder.push(d.def.id);
        changed = true;
      }
    }
    for (const [pos, id] of destructible) {
      if (fell.has(id)) continue;
      const [x, y] = pos.split(',').map(Number) as [number, number];
      if (bombable(x, y, reach)) {
        fell.add(id);
        fellInOrder.push(id);
        changed = true;
        break; // re-flood after every fall so the order is meaningful
      }
    }
    if (!changed) break;
  }

  const reach = flood();
  for (const id of markedIds) if (!fell.has(id)) problems.push(`marked cargo ${id} can never be destroyed`);
  for (const [, id] of destructible) if (!fell.has(id)) problems.push(`${id} can never be destroyed`);
  const ex = parsed.extraction;
  if (!reach.has(key(ex.x, ex.y))) problems.push('the extraction tile cannot be reached');
  for (const d of parsed.doors)
    if (!openDoors.has(d.def.id)) problems.push(`door ${d.def.id} can never open`);
  for (const b of parsed.bonuses)
    if (!reach.has(key(b.x, b.y))) problems.push(`bonus ${b.kind} at ${b.x},${b.y} is unreachable`);
  for (const s of parsed.switches)
    if (!reach.has(key(s.x, s.y))) problems.push(`switch at ${s.x},${s.y} is unreachable`);
  def.waves.forEach((w, i) => {
    if (!cleared.has(i)) problems.push(`wave ${i} (${w.name}) can never be cleared`);
  });
  for (const r of def.rooms) {
    for (const e of r.enemies ?? []) {
      const s = parsed.spots[e.spot]!;
      if (!reach.has(key(s.x, s.y))) problems.push(`room ${r.id}: spot ${e.spot} is unreachable`);
    }
  }
  return { problems, reachable: reach, fellInOrder, doorsInOrder, doorsAtWaveStart };
}
