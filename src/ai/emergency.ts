/**
 * Generator tools used to get out of a hopeless spot: Kill Switch, kick, punch and carry. Each
 * option is evaluated by actually rebuilding the danger map with the generator disabled / moved /
 * lifted and asking whether a safe refuge then exists; only a working fix is executed.
 */
import { DIRS, DIR_VEC, Tile } from '../sim';
import type { Dir, Generator, Intent } from '../sim';
import { searchRefuge } from './analysis';
import { dirIndex } from './board';
import type { Ctx } from './context';
import type { DangerQuery } from './danger';
import { readyTick, stepTicksOf } from './world';

interface Fix {
  kind: 'disarm' | 'kick' | 'punch' | 'carry';
  /** Direction of the target generator from the bot (null = underfoot). */
  dir: Dir | null;
  gen: Readonly<Generator>;
  query: DangerQuery;
  /** Tile that stops being blocked / starts being blocked in the what-if. */
  freed: number;
  taken: number;
}

function generatorAt(c: Ctx, tile: number): Readonly<Generator> | null {
  const i = c.world.genAt[tile]!;
  return i >= 0 ? c.world.obs.generators[i]! : null;
}

function occupied(c: Ctx, x: number, y: number): boolean {
  return c.world.obs.players.some((p) => p.alive && p.x === x && p.y === y);
}

function freeForGenerator(c: Ctx, x: number, y: number): boolean {
  const { world } = c;
  const { board, obs } = world;
  if (x < 0 || y < 0 || x >= board.width || y >= board.height) return false;
  const t = y * board.width + x;
  return obs.tiles[t] === Tile.Empty && world.genAt[t]! < 0;
}

/** Where a kicked generator ends up (null when the kick would fail). */
function kickEnd(c: Ctx, g: Readonly<Generator>, dir: Dir): { x: number; y: number } | null {
  const v = DIR_VEC[dir];
  let x = g.x;
  let y = g.y;
  let moved = false;
  for (let i = 0; i < 20; i++) {
    const nx = x + v.dx;
    const ny = y + v.dy;
    if (!freeForGenerator(c, nx, ny) || occupied(c, nx, ny)) break;
    x = nx;
    y = ny;
    moved = true;
  }
  return moved ? { x, y } : null;
}

/** Where a punched generator lands (mirrors the simulation's rule). */
function throwEnd(
  c: Ctx,
  fromX: number,
  fromY: number,
  dir: Dir,
  selfId: number,
): { x: number; y: number } | null {
  const { world } = c;
  const v = DIR_VEC[dir];
  const want = world.obs.config.generator.punchDistance;
  const maxD = Math.max(world.board.width, world.board.height);
  const ok = (d: number): boolean => {
    const x = fromX + v.dx * d;
    const y = fromY + v.dy * d;
    if (x < 0 || y < 0 || x >= world.board.width || y >= world.board.height) return false;
    const t = y * world.board.width + x;
    if (world.obs.tiles[t] !== Tile.Empty) return false;
    const gi = world.genAt[t]!;
    return gi < 0 || world.obs.generators[gi]!.id === selfId;
  };
  for (let d = want; d <= maxD; d++) if (ok(d)) return { x: fromX + v.dx * d, y: fromY + v.dy * d };
  for (let d = want - 1; d >= 1; d--) if (ok(d)) return { x: fromX + v.dx * d, y: fromY + v.dy * d };
  return null;
}

function collectFixes(c: Ctx): Fix[] {
  const { world } = c;
  const { me } = world;
  const w = world.board.width;
  const fixes: Fix[] = [];
  const spots: { dir: Dir | null; tile: number }[] = [{ dir: null, tile: world.myTile }];
  for (const d of DIRS) {
    const n = world.board.neighbor[world.myTile * 4 + dirIndex(d)]!;
    if (n >= 0) spots.push({ dir: d, tile: n });
  }
  const front = world.board.neighbor[world.myTile * 4 + dirIndex(me.facing)]!;
  for (const s of spots) {
    const g = generatorAt(c, s.tile);
    if (!g || g.slide) continue;
    if (me.killSwitchCharges > 0 && g.mode !== 'disabled') {
      // the sim targets the generator in front first, so an underfoot target needs an empty front tile
      if (s.dir !== null || front < 0 || world.genAt[front]! < 0) {
        fixes.push({
          kind: 'disarm',
          dir: s.dir,
          gen: g,
          query: { disabledIds: [g.id] },
          freed: -1,
          taken: -1,
        });
      }
    }
    if (s.dir !== null && me.kick) {
      const end = kickEnd(c, g, s.dir);
      if (end) {
        fixes.push({
          kind: 'kick',
          dir: s.dir,
          gen: g,
          query: { moved: new Map([[g.id, end]]) },
          freed: s.tile,
          taken: end.y * w + end.x,
        });
      }
    }
    if (me.punch && (s.dir === me.facing || (s.dir === null && (front < 0 || world.genAt[front]! < 0)))) {
      const end = throwEnd(c, g.x, g.y, me.facing, g.id);
      if (end) {
        fixes.push({
          kind: 'punch',
          dir: s.dir,
          gen: g,
          query: { moved: new Map([[g.id, end]]) },
          freed: s.tile,
          taken: end.y * w + end.x,
        });
      }
    }
    if (me.grip && (s.dir === null ? front < 0 || world.genAt[front]! < 0 : true) && g.timer > 80) {
      fixes.push({
        kind: 'carry',
        dir: s.dir,
        gen: g,
        query: { disabledIds: [g.id] },
        freed: s.tile,
        taken: -1,
      });
    }
  }
  return fixes;
}

/** Tries the available fixes; on success writes the intent and returns true. */
export function tryEmergencyFix(c: Ctx, intent: Intent): boolean {
  const { world, profile } = c;
  const { obs, me } = world;
  const T = obs.tick;
  if (!profile.useGeneratorTools || me.entryUntil !== null || T < me.dazedUntil || me.carrying !== null)
    return false;
  const fixes = collectFixes(c);
  if (fixes.length === 0) return false;
  const step = stepTicksOf(obs, me);
  const ready = readyTick(obs, me);
  for (const fix of fixes) {
    c.builder.build(c.tmp, world, profile, fix.query);
    c.scratch.set(world.walk);
    if (fix.freed >= 0) c.scratch[fix.freed] = 0;
    if (fix.taken >= 0) c.scratch[fix.taken] = 1;
    if (!searchRefuge(c, c.tmp, world.myTile, T, ready, step, undefined, c.scratch)) continue;
    execute(c, fix, intent);
    return true;
  }
  return false;
}

function execute(c: Ctx, fix: Fix, intent: Intent): void {
  const { me } = c.world;
  const face = (d: Dir): void => {
    intent.move = c.world.steer(d);
  };
  switch (fix.kind) {
    case 'kick':
      face(fix.dir!);
      return;
    case 'disarm':
      if (fix.dir === null || me.facing === fix.dir) intent.disarm = true;
      else face(fix.dir);
      return;
    case 'punch':
      if (fix.dir === null || me.facing === fix.dir) intent.action = true;
      else face(fix.dir);
      return;
    case 'carry':
      if (fix.dir === null || me.facing === fix.dir) intent.action = true;
      else face(fix.dir);
      return;
  }
}
