/**
 * Enemy group tactics (decision EA4, docs/CAMPAIGN_ATTACKS.md): what each campaign enemy of a group is asked to do,
 * computed from the state and handed to the enemy bot as `Observation.directive` (observe.ts). The bot still plays the
 * ordinary movement rules and sees only the observation; these are movement preferences, never extra powers.
 *
 *   surround   every melee enemy that shares a target takes a DIFFERENT open tile next to it (then the next ring when
 *              the four neighbours are taken): the target is boxed in and every direction is threatened
 *   standoff   throwers (and lieutenants) take a tile in a clear cardinal line to the target, `minRange` or more tiles
 *              away (`standoffTiles` preferred), different for each; a target that closes in moves the slot back
 *   block      a melee enemy stands on a route chokepoint tile (`state.enemyFire.chokepoints`, set by the field / raid
 *              runtime, or found with `findChokepoint`); players do not collide here, so a blocker works by threatening
 *   hold       nobody within `aggroTiles`: stay where it stands
 *   reinforce  a call for help is open and this enemy is far from the fight: go to the caller
 *
 * Pure and deterministic (ties are broken by id and by a fixed tile order); no RNG, nothing is stored.
 */
import { DIRS, DIR_VEC, manhattan, tileAt, tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, Player, TilePos } from '../types';
import type { NpcDirective } from '../mission/types';
import { ENEMY_ATTACK_SETS } from '../data/enemyAttacks';
import { sameSide } from '../systems/projectiles';
import { throwReach } from '../systems/enemyActions';

const isFloor = (state: GameState, x: number, y: number): boolean => tileAt(state, x, y) === Tile.Empty;

/** The open tiles at Manhattan distance 1 (then 2) around `t`, in a fixed order. */
export function surroundSlots(state: GameState, t: TilePos, ring: 1 | 2): TilePos[] {
  const offsets: [number, number][] =
    ring === 1
      ? DIRS.map((d) => [DIR_VEC[d].dx, DIR_VEC[d].dy] as [number, number])
      : [
          [0, -2],
          [1, -1],
          [2, 0],
          [1, 1],
          [0, 2],
          [-1, 1],
          [-2, 0],
          [-1, -1],
        ];
  return offsets.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy })).filter((s) => isFloor(state, s.x, s.y));
}

/**
 * Tiles in a clear cardinal line to `t` that a thrower with `reach` can use: only floor between, at least `minRange`
 * and at most `reach` tiles away; the preferred distance first, then farther, then nearer.
 */
export function standoffSlots(
  state: GameState,
  t: TilePos,
  reach: number,
  preferred: number,
  minRange: number,
): TilePos[] {
  const byDistance = new Map<number, TilePos[]>();
  for (const d of DIRS) {
    const v = DIR_VEC[d];
    for (let k = 1; k <= reach; k++) {
      const x = t.x + v.dx * k;
      const y = t.y + v.dy * k;
      if (!isFloor(state, x, y)) break;
      if (k < minRange) continue;
      const list = byDistance.get(k) ?? [];
      list.push({ x, y });
      byDistance.set(k, list);
    }
  }
  const order: number[] = [];
  for (let k = preferred; k <= reach; k++) order.push(k);
  for (let k = preferred - 1; k >= minRange; k--) order.push(k);
  return order.flatMap((k) => byDistance.get(k) ?? []);
}

/**
 * A good tile to block the way from `from` to `to`: on the shortest walkable route, preferring a corridor tile (exactly
 * two open neighbours) nearest the middle of the route. Null when `to` cannot be reached or the route has no inner tile.
 */
export function findChokepoint(state: GameState, from: TilePos, to: TilePos): TilePos | null {
  const w = state.width;
  const start = tileIndex(state, from.x, from.y);
  const goal = tileIndex(state, to.x, to.y);
  const prev = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length && !prev.has(goal); head++) {
    const u = queue[head]!;
    const ux = u % w;
    const uy = Math.floor(u / w);
    for (const d of DIRS) {
      const nx = ux + DIR_VEC[d].dx;
      const ny = uy + DIR_VEC[d].dy;
      if (!isFloor(state, nx, ny)) continue;
      const v = ny * w + nx;
      if (prev.has(v)) continue;
      prev.set(v, u);
      queue.push(v);
    }
  }
  if (!prev.has(goal)) return null;
  const route: number[] = [];
  for (let u = goal; u !== -1; u = prev.get(u)!) route.push(u);
  route.reverse();
  const inner = route.slice(1, -1);
  if (inner.length === 0) return null;
  const open = (i: number): number =>
    DIRS.filter((d) => isFloor(state, (i % w) + DIR_VEC[d].dx, Math.floor(i / w) + DIR_VEC[d].dy)).length;
  const mid = (route.length - 1) / 2;
  let best = inner[0]!;
  let bestKey = Infinity;
  for (const i of inner) {
    const key = open(i) * 100 + Math.abs(route.indexOf(i) - mid);
    if (key < bestKey) {
      bestKey = key;
      best = i;
    }
  }
  return { x: best % w, y: Math.floor(best / w) };
}

const nearestRival = (state: GameState, p: Player): Player | null => {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const o of state.players) {
    if (!o.alive || o.id === p.id || sameSide(p, o)) continue;
    const d = manhattan(p, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
};

/** Greedy assignment: members who already stand on a slot keep it, the rest take the nearest free one (ties: fixed order). */
function assign(members: Player[], slots: TilePos[], taken: Set<number>, w: number): Map<number, TilePos> {
  const out = new Map<number, TilePos>();
  const key = (t: TilePos): number => t.y * w + t.x;
  for (const m of members) {
    const own = slots.find((s) => s.x === m.x && s.y === m.y && !taken.has(key(s)));
    if (own) {
      out.set(m.id, own);
      taken.add(key(own));
    }
  }
  for (const m of members) {
    if (out.has(m.id)) continue;
    let best: TilePos | null = null;
    let bestD = Infinity;
    for (const s of slots) {
      if (taken.has(key(s))) continue;
      const d = manhattan(m, s);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best) {
      out.set(m.id, best);
      taken.add(key(best));
    }
  }
  return out;
}

/** The directive of enemy seat `id` (undefined: not an enemy, not alive, or no rival exists at all). */
export function enemyGroupDirective(state: GameState, id: number): NpcDirective | undefined {
  const me = state.players[id];
  if (!me || !me.alive || me.enemyKind === undefined) return undefined;
  const cfg = state.config.enemyAttacks;
  const here: NpcDirective = { kind: 'hold', x: me.x, y: me.y, radius: 0 };
  const target = nearestRival(state, me);
  if (!target) return here;

  if (manhattan(me, target) > cfg.aggroTiles) {
    const call = state.enemyFire?.calls.find((c) => c.team === me.team && c.callerId !== me.id);
    return call && manhattan(me, call) > 3 ? { kind: 'reinforce', x: call.x, y: call.y, radius: 1 } : here;
  }

  // the subgroup: enemies of my team that engage the same target
  const group = state.players.filter(
    (o) =>
      o.alive &&
      o.enemyKind !== undefined &&
      o.team === me.team &&
      nearestRival(state, o)?.id === target.id &&
      manhattan(o, target) <= cfg.aggroTiles,
  );
  const w = state.width;
  const taken = new Set<number>();

  // 1. blockers on the marked chokepoints (never the whole group, never a thrower or a leader)
  const blockers = new Map<number, TilePos>();
  const chokes = (state.enemyFire?.chokepoints ?? []).map((i) => ({ x: i % w, y: Math.floor(i / w) }));
  const canBlock = (o: Player): boolean =>
    !ENEMY_ATTACK_SETS[o.enemyKind!].keepsDistance && o.enemyKind !== 'boss';
  for (const c of chokes) {
    if (blockers.size >= group.length - 1) break;
    const pool = group.filter((o) => canBlock(o) && !blockers.has(o.id));
    let pick: Player | null = null;
    for (const o of pool) if (pick === null || manhattan(o, c) < manhattan(pick, c)) pick = o;
    if (pick) {
      blockers.set(pick.id, c);
      taken.add(c.y * w + c.x);
    }
  }
  const myBlock = blockers.get(me.id);
  if (myBlock) return { kind: 'block', x: myBlock.x, y: myBlock.y, radius: 0 };

  // 2. melee enemies surround the target
  const melee = group.filter((o) => !blockers.has(o.id) && !ENEMY_ATTACK_SETS[o.enemyKind!].keepsDistance);
  const ring = [...surroundSlots(state, target, 1), ...surroundSlots(state, target, 2)];
  const around = assign(melee, ring, taken, w);
  const mine = around.get(me.id);
  if (mine) return { kind: 'surround', x: mine.x, y: mine.y, radius: 0 };

  // 3. throwers line up
  const throwers = group.filter((o) => !blockers.has(o.id) && ENEMY_ATTACK_SETS[o.enemyKind!].keepsDistance);
  if (throwers.some((o) => o.id === me.id)) {
    const slots = standoffSlots(
      state,
      target,
      throwReach(state.config, me) || 5,
      cfg.standoffTiles,
      cfg.minRange,
    );
    const lined = assign(throwers, slots, taken, w);
    const slot = lined.get(me.id);
    if (slot) return { kind: 'standoff', x: slot.x, y: slot.y, radius: 0 };
  }
  return { kind: 'chase', x: target.x, y: target.y };
}
