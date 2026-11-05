/**
 * Raid layout parsing and data validation. Pure: turns a `RaidDef` layout (the glyph legend of `def.ts`) into positions
 * and checks the authored data for mistakes. `parseRaidLayout` throws when `raidProblems` finds any, so a broken raid
 * can never be built; `tests/raid-layouts.test.ts` runs `raidProblems` and the reachability analysis on every raid.
 */
import type { Dir, TilePos } from '../types';
import { RAID_MAX_HEIGHT, RAID_MAX_WIDTH } from './def';
import type { BonusKind, DoorDef, EnemyPlacement, RaidDef } from './def';
import { RAID_TUNING } from './tuning';
import type { CargoKind } from './types';

export const BELT_GLYPHS: Readonly<Record<string, Dir>> = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };
const BONUS_GLYPHS: Readonly<Record<string, BonusKind>> = { A: 'armour', H: 'heal', T: 'star' };
const CARGO_GLYPHS = 'MKSB';
/** Enemy spot letters: every lowercase letter except `v` (a belt) and `x` (a plain crate). */
const SPOT_RE = /^[a-uwyz]$/;

export interface ParsedCargo {
  id: string;
  glyph: string;
  kind: CargoKind;
  marked: boolean;
  x: number;
  y: number;
  hp: number;
}

export interface ParsedBelt {
  id: string;
  tiles: { x: number; y: number; dir: Dir }[];
}

export interface ParsedRaid {
  width: number;
  height: number;
  /** The layout the arena (and so `GameState.tiles`) is built from: '#' wall and doors, 'x' every destructible, '.' floor. */
  arenaLayout: string[];
  entrance: TilePos;
  extraction: TilePos;
  cargo: ParsedCargo[];
  doors: { def: DoorDef; x: number; y: number }[];
  belts: ParsedBelt[];
  switches: TilePos[];
  spots: Record<string, TilePos>;
  bonuses: { kind: BonusKind; x: number; y: number }[];
}

/** One enemy seat of a raid: seat order is wave 0's enemies, wave 1's ... then the rooms' groups. */
export interface SeatPlan extends EnemyPlacement {
  /** Index into `def.waves`, or -1 for a room group. */
  wave: number;
  room: string | null;
  at: TilePos;
}

const DIR_DELTA: Readonly<Record<Dir, readonly [number, number]>> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

const cache = new WeakMap<RaidDef, ParsedRaid>();

export function parseRaidLayout(def: RaidDef): ParsedRaid {
  const hit = cache.get(def);
  if (hit) return hit;
  const problems = raidProblems(def);
  if (problems.length > 0) throw new Error(`raid ${def.id}: ${problems.join('; ')}`);
  const parsed = parse(def);
  cache.set(def, parsed);
  return parsed;
}

/** The enemy seats in seat order (seat id = index + 1; seat 0 is the human). */
export function enemySeats(def: RaidDef): SeatPlan[] {
  const parsed = parseRaidLayout(def);
  const out: SeatPlan[] = [];
  def.waves.forEach((w, wave) => {
    for (const e of w.enemies) out.push({ ...e, wave, room: null, at: parsed.spots[e.spot]! });
  });
  for (const r of def.rooms) {
    for (const e of r.enemies ?? []) out.push({ ...e, wave: -1, room: r.id, at: parsed.spots[e.spot]! });
  }
  return out;
}

function parse(def: RaidDef): ParsedRaid {
  const height = def.layout.length;
  const width = def.layout[0]!.length;
  const doorByGlyph = new Map(def.doors.map((d) => [d.glyph, d]));
  const arenaLayout: string[] = [];
  const cargo: ParsedCargo[] = [];
  const doors: ParsedRaid['doors'] = [];
  const switches: TilePos[] = [];
  const spots: Record<string, TilePos> = {};
  const bonuses: ParsedRaid['bonuses'] = [];
  const beltTiles = new Map<string, { x: number; y: number; dir: Dir }>();
  const counts = { M: 0, K: 0, S: 0, B: 0 };
  let entrance: TilePos = { x: 0, y: 0 };
  let extraction: TilePos = { x: 0, y: 0 };
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const c = def.layout[y]![x]!;
      let out = '.';
      if (c === '#') out = '#';
      else if (c === 'x') out = 'x';
      else if (CARGO_GLYPHS.includes(c)) {
        out = 'x';
        const n = counts[c as 'M' | 'K' | 'S' | 'B']++;
        const l = def.legend;
        if (c === 'M')
          cargo.push({ id: `cargo-${n}`, glyph: c, kind: 'cargo', marked: true, x, y, hp: l.markedHp });
        else if (c === 'K')
          cargo.push({ id: `goods-${n}`, glyph: c, kind: 'cargo', marked: false, x, y, hp: l.cargoHp });
        else if (c === 'S')
          cargo.push({ id: `crate-${n}`, glyph: c, kind: 'crate', marked: false, x, y, hp: l.crateHp });
        else cargo.push({ id: `barrel-${n}`, glyph: c, kind: 'barrel', marked: false, x, y, hp: l.barrelHp });
      } else if (c === '@') entrance = { x, y };
      else if (c === 'E') extraction = { x, y };
      else if (c === '*') switches.push({ x, y });
      else if (c in BELT_GLYPHS) beltTiles.set(`${x},${y}`, { x, y, dir: BELT_GLYPHS[c]! });
      else if (c in BONUS_GLYPHS) bonuses.push({ kind: BONUS_GLYPHS[c]!, x, y });
      else if (c >= '1' && c <= '9') {
        out = '#';
        doors.push({ def: doorByGlyph.get(c)!, x, y });
      } else if (SPOT_RE.test(c)) spots[c] = { x, y };
      row += out;
    }
    arenaLayout.push(row);
  }
  return {
    width,
    height,
    arenaLayout,
    entrance,
    extraction,
    cargo,
    doors,
    belts: buildBelts(beltTiles),
    switches,
    spots,
    bonuses,
  };
}

/** Belt runs: follow each belt tile with no belt feeding it along its direction while the next tile is a belt. */
function buildBelts(tiles: Map<string, { x: number; y: number; dir: Dir }>): ParsedBelt[] {
  const fed = new Set<string>();
  for (const t of tiles.values()) {
    const [dx, dy] = DIR_DELTA[t.dir];
    fed.add(`${t.x + dx},${t.y + dy}`);
  }
  const starts = [...tiles.values()]
    .filter((t) => !fed.has(`${t.x},${t.y}`))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return starts.map((start, i) => {
    const path: ParsedBelt['tiles'] = [];
    const seen = new Set<string>();
    let cur: { x: number; y: number; dir: Dir } | undefined = start;
    while (cur && !seen.has(`${cur.x},${cur.y}`)) {
      seen.add(`${cur.x},${cur.y}`);
      path.push(cur);
      const [dx, dy] = DIR_DELTA[cur.dir];
      cur = tiles.get(`${cur.x + dx},${cur.y + dy}`);
    }
    return { id: `belt-${i}`, tiles: path };
  });
}

/** Every authoring mistake in a raid definition (empty = valid). */
export function raidProblems(def: RaidDef): string[] {
  const out: string[] = [];
  const rows = def.layout;
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (height === 0 || width === 0) return ['empty layout'];
  if (width > RAID_MAX_WIDTH || height > RAID_MAX_HEIGHT)
    out.push(`board ${width}x${height} exceeds ${RAID_MAX_WIDTH}x${RAID_MAX_HEIGHT}`);
  rows.forEach((r, y) => {
    if (r.length !== width) out.push(`row ${y} is ${r.length} wide, expected ${width}`);
  });
  if (out.length > 0) return out;

  const count = (pred: (c: string) => boolean): number => rows.join('').split('').filter(pred).length;
  if (count((c) => c === '@') !== 1) out.push('exactly one entrance @');
  if (count((c) => c === 'E') !== 1) out.push('exactly one extraction E');
  const known = (c: string): boolean =>
    '#.xMKSB@E*^>v<AHT'.includes(c) || (c >= '1' && c <= '9') || SPOT_RE.test(c);
  rows.forEach((r, y) =>
    [...r].forEach((c, x) => {
      if (!known(c)) out.push(`unknown glyph "${c}" at ${x},${y}`);
    }),
  );
  rows.forEach((r, y) => {
    if (y === 0 || y === height - 1) {
      if ([...r].some((c) => c !== '#')) out.push(`row ${y} (board edge) must be all walls`);
    } else if (r[0] !== '#' || r[width - 1] !== '#') out.push(`row ${y} must start and end with a wall`);
  });
  if (count((c) => c === 'M') < 1) out.push('at least one marked cargo M');

  // doors
  const doorGlyphs = new Set(def.doors.map((d) => d.glyph));
  if (doorGlyphs.size !== def.doors.length) out.push('duplicate door glyph');
  if (new Set(def.doors.map((d) => d.id)).size !== def.doors.length) out.push('duplicate door id');
  for (const g of '123456789') {
    const n = count((c) => c === g);
    if (doorGlyphs.has(g) && n !== 1) out.push(`door ${g} appears ${n} times in the layout`);
    if (!doorGlyphs.has(g) && n > 0) out.push(`door glyph ${g} has no DoorDef`);
  }
  const doorIds = new Set(def.doors.map((d) => d.id));
  const switchCount = count((c) => c === '*');
  const cargoIds = new Set<string>();
  const counts = { M: 0, K: 0, S: 0, B: 0 };
  rows
    .join('')
    .split('')
    .forEach((c) => {
      if (c in counts) {
        const n = counts[c as keyof typeof counts]++;
        cargoIds.add(`${{ M: 'cargo', K: 'goods', S: 'crate', B: 'barrel' }[c as keyof typeof counts]}-${n}`);
      }
    });
  const cond = (door: DoorDef): void => {
    const c = door.opensWhen;
    if (c.kind === 'waveCleared' && !def.waves[c.wave]) out.push(`door ${door.id}: no wave ${c.wave}`);
    if (c.kind === 'switch' && c.index >= switchCount) out.push(`door ${door.id}: no switch ${c.index}`);
    if (c.kind === 'destroyed' && !cargoIds.has(c.id)) out.push(`door ${door.id}: no cargo ${c.id}`);
    if (c.kind === 'doorOpened' && (!doorIds.has(c.door) || c.door === door.id))
      out.push(`door ${door.id}: bad door reference ${c.door}`);
    if (c.kind === 'lieutenantDown') {
      const has = [...def.waves.flatMap((w) => w.enemies), ...def.rooms.flatMap((r) => r.enemies ?? [])].some(
        (e) => e.kind === 'lieutenant',
      );
      if (!has) out.push(`door ${door.id}: no lieutenant in the raid`);
    }
    if (c.kind === 'cargoDestroyed' && c.count !== undefined && c.count > count((g) => g === 'M'))
      out.push(`door ${door.id}: more cargo than exists`);
  };
  def.doors.forEach(cond);

  // spots and enemies
  const spotCount = new Map<string, number>();
  for (const r of rows) for (const c of r) if (SPOT_RE.test(c)) spotCount.set(c, (spotCount.get(c) ?? 0) + 1);
  const used = new Map<string, number>();
  const place = (list: EnemyPlacement[] | undefined, where: string): void => {
    for (const e of list ?? []) {
      used.set(e.spot, (used.get(e.spot) ?? 0) + 1);
      if (!spotCount.has(e.spot)) out.push(`${where}: spot ${e.spot} is not in the layout`);
    }
  };
  def.waves.forEach((w, i) => {
    place(w.enemies, `wave ${i}`);
    if (w.enemies.length === 0) out.push(`wave ${i} has no enemies`);
    const t = w.trigger;
    if (t.kind === 'waveCleared' && (t.wave < 0 || t.wave >= i))
      out.push(`wave ${i}: trigger must name an earlier wave`);
    if (t.kind === 'doorOpened' && !doorIds.has(t.door)) out.push(`wave ${i}: no door ${t.door}`);
    if (t.kind === 'cargoDestroyed' && t.count > count((c) => c === 'M'))
      out.push(`wave ${i}: more cargo than exists`);
  });
  def.rooms.forEach((r) => place(r.enemies, `room ${r.id}`));
  for (const [spot, n] of spotCount) {
    if (n !== 1) out.push(`spot ${spot} appears ${n} times`);
    if (used.get(spot) !== 1) out.push(`spot ${spot} is used by ${used.get(spot) ?? 0} enemies, expected 1`);
  }
  for (const [spot, n] of used) if (n > 1) out.push(`spot ${spot} is used ${n} times`);

  // rooms
  def.rooms.forEach((r) => {
    if (!doorIds.has(r.door)) out.push(`room ${r.id}: no door ${r.door}`);
    const [x0, y0, x1, y1] = r.rect;
    if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height || x1 < x0 || y1 < y0)
      out.push(`room ${r.id}: bad rect`);
    let bonus = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (rows[y]?.[x] && rows[y]![x]! in BONUS_GLYPHS) bonus++;
    if (bonus !== 1) out.push(`room ${r.id}: ${bonus} bonus tiles in its rect, expected 1`);
    for (const e of r.enemies ?? []) {
      let inside = false;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) if (rows[y]?.[x] === e.spot) inside = true;
      if (!inside) out.push(`room ${r.id}: spot ${e.spot} is outside its rect`);
    }
  });
  // every bonus glyph belongs to exactly one room
  const roomOf = (x: number, y: number): number =>
    def.rooms.filter((r) => x >= r.rect[0] && x <= r.rect[2] && y >= r.rect[1] && y <= r.rect[3]).length;
  rows.forEach((r, y) =>
    [...r].forEach((c, x) => {
      if (c in BONUS_GLYPHS && roomOf(x, y) !== 1)
        out.push(`bonus ${c} at ${x},${y} is in ${roomOf(x, y)} rooms`);
    }),
  );

  // belts
  const tiles = new Map<string, { x: number; y: number; dir: Dir }>();
  rows.forEach((r, y) =>
    [...r].forEach((c, x) => {
      if (c in BELT_GLYPHS) tiles.set(`${x},${y}`, { x, y, dir: BELT_GLYPHS[c]! });
    }),
  );
  const feeders = new Map<string, number>();
  for (const t of tiles.values()) {
    const [dx, dy] = DIR_DELTA[t.dir];
    const k = `${t.x + dx},${t.y + dy}`;
    if (tiles.has(k)) feeders.set(k, (feeders.get(k) ?? 0) + 1);
  }
  for (const [k, n] of feeders) if (n > 1) out.push(`belt tile ${k} is fed by ${n} belts`);
  const runs = buildBelts(tiles);
  if (runs.reduce((n, b) => n + b.tiles.length, 0) !== tiles.size)
    out.push('belt tiles form a loop or a merge');
  if (runs.length !== def.conveyors.length)
    out.push(`${runs.length} belt runs in the layout, ${def.conveyors.length} conveyor definitions`);
  def.conveyors.forEach((c, i) => {
    if (c.stepTicks < 6) out.push(`conveyor ${i}: stepTicks ${c.stepTicks} is too fast`);
    const s = c.shipments;
    if (!s) return;
    if (s.warnTicks < RAID_TUNING.minShipmentWarnTicks)
      out.push(`conveyor ${i}: telegraph ${s.warnTicks} ticks is too short`);
    if (s.warnTicks >= s.everyTicks)
      out.push(`conveyor ${i}: telegraph must be shorter than the launch interval`);
    if (s.maxLive < 1 || s.damage < 0) out.push(`conveyor ${i}: bad shipment numbers`);
  });

  // waves must exist for the numbers the view promises
  if (def.lives < 1) out.push('at least one life');
  if (def.parSec >= def.timeLimitSec) out.push('par must be inside the time limit');
  if (def.bombs.range < 1 || def.bombs.capacity < 1) out.push('bad bomb numbers');
  return out;
}
