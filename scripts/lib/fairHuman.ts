/**
 * The FAIR-FIGHT harness (docs/ENEMY_COMBAT_FAIRNESS.md, decisions EF1-EF8): a scripted human that plays a campaign
 * fight with ORDINARY intents only (walk, A = lay a generator, B = punch when adjacent) and only what a player sees on
 * the screen, against ACTIVE enemy bots, on a classic pillar grid or on a real raid. Real simulation, no rendering,
 * nothing here uses the clock or Math.random, so every number is reproducible.
 *
 * The human's habits (a competent, not a perfect, player):
 *   1. standing in a blast cross (any generator, his own included) or a burning tile: walk the quickest way out;
 *   2. a thrown object's line he has seen for `reactTicks`: step off it; a punch winding up on him with no jab ready:
 *      step out of reach in its last 12 ticks;
 *   3. an enemy next to him and his Punch ready: B;
 *   4. an enemy (or the crate he is working on) inside the cross of a generator laid where he stands, and a way out of
 *      that cross before the fuse: A, then rule 1 walks him round the corner;
 *   5. otherwise walk to the nearest tile from which the target is in his cross (and he could get out again).
 * He never walks into a cross or a flame on purpose and never stands on a seen projectile line.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import {
  DIRS,
  DIR_VEC,
  attackReady,
  buildRaidGame,
  createGame,
  enemyDef,
  observe,
  playerStepTicks,
  previewBlast,
  primaryOf,
  tick,
} from '../../src/sim';
import type {
  DeepPartial,
  Dir,
  Difficulty,
  EnemyKind,
  GameConfig,
  GameState,
  Intent,
  Intents,
  RaidId,
  SimEvent,
} from '../../src/sim';
import { attackable } from '../../src/sim/systems/skills';
import { Tile } from '../../src/sim/types';
import { vitalsOf } from './enemyScene';

export const HZ = 60;

interface Window {
  from: number;
  to: number;
}

export interface FairHumanOptions {
  /** Ticks before a thrown object's cue is acted on (a human's reaction). */
  reactTicks: number;
  /** Ticks of fuse the escape from a freshly laid generator must leave spare. */
  fuseMargin: number;
  /** Stay and fight inside a cross until its fuse leaves only the walk out plus `fuseMargin` (false: leave at once). */
  linger: boolean;
  /** Uses B (the Punch) at all (false: a pure bomber, who only dodges wind-ups). */
  punch: boolean;
}

export const FAIR_HUMAN: FairHumanOptions = { reactTicks: 18, fuseMargin: 45, linger: true, punch: true };
/** A slower player (half a second to read a cue, more fuse to spare): a guard's wind-up lands before his jab. */
export const SLOW_HUMAN: FairHumanOptions = { ...FAIR_HUMAN, reactTicks: 30, fuseMargin: 60 };
/** The pure bomber: never punches, so every kill is a generator's (does bomb placement alone work?). */
export const BOMBER_HUMAN: FairHumanOptions = { ...FAIR_HUMAN, punch: false };

export class FairHuman {
  /** Generators laid, and how many of them had an enemy in the cross when laid. */
  laid = 0;
  laidOnEnemy = 0;
  private readonly windups = new Map<number, { resolve: number; at: number }>();
  constructor(readonly opts: FairHumanOptions = FAIR_HUMAN) {}

  // ------------------------------------------------------------------ what is on the screen

  private walkable(s: GameState, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) return false;
    if (s.tiles[y * s.width + x] !== Tile.Empty) return false;
    if (s.generators.some((g) => g.x === x && g.y === y && g.flight === null)) return false;
    return true;
  }

  /** Tile -> windows in which it burns (flames now, every generator's cross from its fuse on; chains included). */
  private danger(s: GameState): Map<number, Window[]> {
    const out = new Map<number, Window[]>();
    const add = (i: number, w: Window): void => {
      const l = out.get(i);
      if (l) l.push(w);
      else out.set(i, [w]);
    };
    for (const f of s.flames) add(f.y * s.width + f.x, { from: s.tick, to: f.endTick + 2 });
    const flame = s.config.generator.flameTicks;
    // a chain goes off with the earliest generator that reaches it
    const at = new Map<number, number>();
    for (const g of s.generators) at.set(g.id, s.tick + Math.max(1, g.timer));
    for (const g of s.generators) {
      const t0 = at.get(g.id)!;
      for (const i of previewBlast(s, g)) {
        const o = s.generators.find((q) => q.y * s.width + q.x === i && q.id !== g.id);
        if (o && at.get(o.id)! > t0) at.set(o.id, t0);
      }
    }
    for (const g of s.generators) {
      const t0 = at.get(g.id)!;
      for (const i of previewBlast(s, g)) add(i, { from: t0 - 4, to: t0 + flame + 4 });
    }
    for (const b of s.raid?.barrelBlasts ?? []) add(b.y * s.width + b.x, { from: s.tick, to: s.tick + 40 });
    for (const sh of s.raid?.shipments ?? []) {
      const belt = s.raid!.belts.find((b) => b.id === sh.beltId)!;
      for (let i = sh.index; i <= sh.index + 3; i++) {
        const t = belt.tiles[i];
        if (t) add(t.y * s.width + t.x, { from: s.tick, to: s.tick + 60 });
      }
    }
    return out;
  }

  /** Tiles on the unfinished line of a thrown object the human has had time to see. */
  private lines(s: GameState): Set<number> {
    const out = new Set<number>();
    for (const pr of s.projectiles ?? []) {
      if (s.tick - pr.launchTick < this.opts.reactTicks) continue;
      if (s.players[pr.ownerId]?.team === s.players[0]!.team) continue;
      for (let i = pr.index; i < pr.path.length; i++) out.add(pr.path[i]!);
    }
    return out;
  }

  /** The plus a generator laid on (px, py) by the human would cover (concrete and closed doors stop it, a crate takes it). */
  private cross(s: GameState, px: number, py: number): Set<number> {
    const me = s.players[0]!;
    const out = new Set<number>([py * s.width + px]);
    for (const d of DIRS) {
      for (let k = 1; k <= me.range; k++) {
        const x = px + DIR_VEC[d].dx * k;
        const y = py + DIR_VEC[d].dy * k;
        if (x < 0 || y < 0 || x >= s.width || y >= s.height) break;
        const t = s.tiles[y * s.width + x];
        if (t === Tile.Hard) break;
        out.add(y * s.width + x);
        if (t !== Tile.Empty) break;
      }
    }
    return out;
  }

  /**
   * The first step of the quickest walk from the human's tile to a tile `goal` accepts, through tiles that are not
   * burning while he crosses them (time-aware: arrival at step k is `k * step` ticks from now). Null: none within `max`.
   */
  private route(
    s: GameState,
    danger: Map<number, Window[]>,
    avoid: Set<number>,
    goal: (i: number, steps: number) => boolean,
    max = 24,
  ): { first: Dir | null; steps: number; tile: number } | null {
    const me = s.players[0]!;
    const step = playerStepTicks(s, me);
    const w = s.width;
    const start = me.y * w + me.x;
    if (goal(start, 0)) return { first: null, steps: 0, tile: start };
    const seen = new Map<number, Dir>();
    seen.set(start, 'up');
    let frontier: number[] = [start];
    for (let k = 1; k <= max && frontier.length > 0; k++) {
      const next: number[] = [];
      for (const u of frontier) {
        for (const d of DIRS) {
          const x = (u % w) + DIR_VEC[d].dx;
          const y = Math.floor(u / w) + DIR_VEC[d].dy;
          const v = y * w + x;
          if (seen.has(v) || !this.walkable(s, x, y) || avoid.has(v)) continue;
          const from = s.tick + (k - 1) * step;
          const to = s.tick + (k + 1) * step;
          if ((danger.get(v) ?? []).some((win) => win.from <= to && win.to >= from)) continue;
          seen.set(v, u === start ? d : seen.get(u)!);
          if (goal(v, k)) return { first: seen.get(v)!, steps: k, tile: v };
          next.push(v);
        }
      }
      frontier = next;
    }
    return null;
  }

  private safeTile(danger: Map<number, Window[]>, lines: Set<number>, i: number): boolean {
    return !danger.has(i) && !lines.has(i);
  }

  /** Can the human leave the cross of a generator laid where he stands (plus every known danger) before its fuse? */
  private canEscape(s: GameState, danger: Map<number, Window[]>, lines: Set<number>): boolean {
    const me = s.players[0]!;
    const blast = this.cross(s, me.x, me.y);
    const step = playerStepTicks(s, me);
    const budget = Math.floor((s.config.generator.fuseTicks - this.opts.fuseMargin) / step);
    return (
      this.route(s, danger, new Set(), (i) => !blast.has(i) && this.safeTile(danger, lines, i), budget) !==
      null
    );
  }

  // ------------------------------------------------------------------ the decision

  /**
   * One tick of play. `targets`: what to bomb, nearest first is chosen by walking distance (enemy tiles and, in a raid,
   * the crate being worked on). `goal`: where to walk when there is nothing to bomb (a raid exit), else null.
   */
  decide(s: GameState, targets: number[], goal: number | null): Intent {
    const me = s.players[0]!;
    if (!me.alive || s.tick < me.dazedUntil || me.stepRemaining > 1 || s.match.phase !== 'playing') return {};
    const w = s.width;
    const here = me.y * w + me.x;
    const danger = this.danger(s);
    const lines = this.lines(s);
    const foes = s.players.filter((p) => p.alive && p.enemyKind !== undefined);

    // 1. out of a cross, a flame, or a seen line - at once, or (`linger`) only when the fuse leaves just the time the
    //    walk out needs plus a margin: a fighter keeps brawling next to his own generator until then
    if (!this.safeTile(danger, lines, here)) {
      const r = this.route(s, danger, new Set(), (i) => this.safeTile(danger, lines, i));
      const soonest = Math.min(...(danger.get(here) ?? []).map((win) => win.from));
      const step = playerStepTicks(s, me);
      const urgent =
        !this.opts.linger ||
        lines.has(here) ||
        !r ||
        soonest - s.tick <= (r.steps + 1) * step + this.opts.fuseMargin;
      if (r?.first && urgent) return { move: r.first };
    }
    // a tile that is safe for the next moments (a lingering fighter may sidestep inside a cross with a long fuse)
    const calm = (i: number): boolean =>
      this.opts.linger
        ? !lines.has(i) && (danger.get(i) ?? []).every((win) => win.from > s.tick + 90)
        : this.safeTile(danger, lines, i);
    // 2. a punch winding up on me and no jab of mine ready: leave its reach late in the wind-up
    const kind = primaryOf(me);
    for (const f of foes) {
      const a = f.attack;
      if (!a || a.targetId !== 0 || Math.abs(f.x - me.x) + Math.abs(f.y - me.y) !== 1) continue;
      // the wind-up is acted on only once it has been on screen for the human's reaction time
      const seen = this.windups.get(f.id);
      if (!seen || seen.resolve !== a.resolveTick)
        this.windups.set(f.id, { resolve: a.resolveTick, at: s.tick });
      if (s.tick - (this.windups.get(f.id)?.at ?? s.tick) < this.opts.reactTicks) continue;
      // a jab cuts a slower wind-up short - except a steadfast kind's (a heavy): step out of that one
      const canJab =
        !enemyDef(f.enemyKind!).steadfast && attackReady(s, me, kind) && attackable(s, s.tick, me, f, kind);
      if (canJab && this.opts.punch) return { special: true }; // a jab cuts a slower wind-up short
      const remaining = a.resolveTick - s.tick;
      if (remaining > 12 || remaining < 4) continue;
      for (const d of DIRS) {
        const x = me.x + DIR_VEC[d].dx;
        const y = me.y + DIR_VEC[d].dy;
        const i = y * w + x;
        if (!this.walkable(s, x, y) || !calm(i)) continue;
        if (Math.abs(f.x - x) + Math.abs(f.y - y) <= 1) continue;
        return { move: d };
      }
    }
    // 3. punch an adjacent enemy
    for (const f of this.opts.punch ? foes : []) {
      if (Math.abs(f.x - me.x) + Math.abs(f.y - me.y) !== 1) continue;
      if (f.attack && f.attack.targetId === 0 && enemyDef(f.enemyKind!).steadfast) continue; // never trade with a heavy
      if (attackReady(s, me, kind) && attackable(s, s.tick, me, f, kind)) return { special: true };
    }
    // 4. lay a generator when a target is in the cross and a way out exists
    const own = s.generators.filter((g) => g.ownerId === 0 && !g.vehicleBorne).length;
    const onGen = s.generators.some((g) => g.x === me.x && g.y === me.y);
    if (own < me.capacity && !onGen) {
      const blast = this.cross(s, me.x, me.y);
      const hit = targets.some((t) => blast.has(t));
      if (hit && this.canEscape(s, danger, lines)) {
        this.laid++;
        if (foes.some((f) => blast.has(f.y * w + f.x))) this.laidOnEnemy++;
        return { place: true };
      }
    }
    // 5. walk to a firing tile (or the goal), through safe tiles only
    const avoid = new Set<number>([...lines, ...danger.keys()]);
    if (targets.length > 0) {
      const firing = (i: number): boolean => {
        const b = this.cross(s, i % w, Math.floor(i / w));
        return targets.some((t) => b.has(t));
      };
      const r = this.route(s, danger, avoid, firing, 40);
      if (r?.first) return { move: r.first };
      if (r && r.first === null) return {}; // already on a firing tile, waiting for a way out
    }
    if (goal !== null) {
      const r = this.route(s, danger, avoid, (i) => i === goal, 60);
      if (r?.first) return { move: r.first };
    }
    return {};
  }
}

// ------------------------------------------------------------------ measurement

export interface FightStats {
  seconds: number;
  enemies: number;
  kills: number;
  killsByBlast: number;
  killsByPunch: number;
  /** Seconds from the start to each kill. */
  killTimes: number[];
  /** Health segments the human lost (enemies only / own blasts). */
  damageFromEnemies: number;
  damageFromSelf: number;
  /** Enemy hits that dazed, shoved or hurt the human. */
  interruptions: number;
  /** Interruptions that came less than 1 s after the previous one's daze ended (repeated interruption). */
  chained: number;
  /** Longest run of chained interruptions. */
  longestChain: number;
  deaths: number;
  laid: number;
  laidOnEnemy: number;
  /** Enemy seats that stood in a cross the tick a generator was laid but were not hurt by its blast. */
  escapes: number;
  /** Enemy seats standing in the cross of a generator the tick it was laid (the escapes' denominator). */
  inCross: number;
  won: boolean;
}

function emptyStats(enemies: number): FightStats {
  return {
    seconds: 0,
    enemies,
    kills: 0,
    killsByBlast: 0,
    killsByPunch: 0,
    killTimes: [],
    damageFromEnemies: 0,
    damageFromSelf: 0,
    interruptions: 0,
    chained: 0,
    longestChain: 0,
    deaths: 0,
    laid: 0,
    laidOnEnemy: 0,
    escapes: 0,
    inCross: 0,
    won: false,
  };
}

/** Bookkeeping from the events of one tick. */
class Recorder {
  private lastFree = -Infinity;
  private chain = 0;
  /** generator id -> enemy ids in its cross when laid */
  private pending = new Map<number, Set<number>>();
  private hurtBy = new Map<number, Set<number>>();
  constructor(readonly st: FightStats) {}

  onTick(s: GameState, ev: SimEvent[]): void {
    const w = s.width;
    for (const e of ev) {
      if (e.type === 'generatorPlaced' && e.ownerId === 0) {
        const g = s.generators.find((q) => q.id === e.generatorId);
        if (g) {
          const tiles = previewBlast(s, g);
          const ids = new Set(
            s.players
              .filter((p) => p.alive && p.enemyKind !== undefined && tiles.has(p.y * w + p.x))
              .map((p) => p.id),
          );
          if (ids.size > 0) this.pending.set(g.id, ids);
          this.st.inCross += ids.size;
        }
      }
      if (e.type === 'campaignHit' && e.victimId === 0) {
        const hurt = e.result === 'damaged' || e.result === 'dazed' || e.result === 'defeated';
        if (!hurt) continue;
        const enemy = e.byId !== null && e.byId !== 0 && s.players[e.byId]?.enemyKind !== undefined;
        if (e.byId === 0 || (e.byId === null && e.source === 'blast')) this.st.damageFromSelf += e.damage;
        else if (enemy) {
          this.st.damageFromEnemies += e.damage;
          this.st.interruptions++;
          if (s.tick - this.lastFree < 60) {
            this.st.chained++;
            this.chain++;
            this.st.longestChain = Math.max(this.st.longestChain, this.chain);
          } else this.chain = 0;
          this.lastFree = s.tick + e.dazeTicks;
        }
      }
      if (e.type === 'campaignHit' && e.victimId !== 0 && e.byId === 0 && e.source === 'blast') {
        // which of my generators? any pending set that holds the victim counts it as caught
        for (const ids of this.pending.values()) if (ids.has(e.victimId)) ids.delete(e.victimId);
        const set = this.hurtBy.get(e.victimId) ?? new Set();
        this.hurtBy.set(e.victimId, set);
      }
      if (e.type === 'generatorExploded') {
        const ids = this.pending.get(e.generatorId);
        if (ids) {
          // still in the set = not hurt by this blast (ran out of it); hits are removed above in the same tick
          this.pendingCheck.push({ id: e.generatorId, ids });
        }
      }
      if (e.type === 'campaignDefeated') {
        if (e.victimId === 0) {
          this.st.deaths++;
          continue;
        }
        if (e.byId !== 0) continue;
        this.st.kills++;
        this.st.killTimes.push(s.tick / HZ);
        if (e.source === 'blast') this.st.killsByBlast++;
        else this.st.killsByPunch++;
      }
    }
    // escapes are settled at the end of the tick, after the blast's hits were seen
    for (const p of this.pendingCheck) {
      this.st.escapes += p.ids.size;
      this.pending.delete(p.id);
    }
    this.pendingCheck = [];
  }
  private pendingCheck: { id: number; ids: Set<number> }[] = [];
}

/** A classic pillar grid on the arena's board: concrete border, a pillar on every even (x, y), the rest open floor. */
export function classicGrid(s: GameState): void {
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) {
      const border = x === 0 || y === 0 || x === s.width - 1 || y === s.height - 1;
      s.tiles[y * s.width + x] = border || (x % 2 === 0 && y % 2 === 0) ? Tile.Hard : Tile.Empty;
    }
  s.floorHazards = {};
  s.hidden = {};
}

export interface GridFightOptions {
  enemies: EnemyKind[];
  seed: number;
  difficulty: Difficulty;
  seconds?: number;
  humanHp?: number;
  config?: DeepPartial<GameConfig>;
  human?: FairHumanOptions;
}

/** Enemy start tiles on a 15 x 11 grid, far from the human at (1, 1). */
const GRID_SPOTS: [number, number][] = [
  [13, 9],
  [13, 1],
  [1, 9],
  [7, 5],
  [11, 5],
  [7, 9],
];

/**
 * The human (seat 0, 4 health, two generators of range 2: the raid bombs) against `enemies` (their kind's own health)
 * on an empty classic grid; the enemies are the real enemy bots at `difficulty`, holding the group tactic
 * (surround / standoff). Stops at the human's first defeat or when every enemy is down.
 */
export function playGridFight(o: GridFightOptions): FightStats {
  const s = createGame({
    seed: o.seed,
    arenaId: 'danfoBusPark',
    players: [
      { name: 'You', characterId: 'streetBaller', isBot: false, team: 0 },
      ...o.enemies.map((kind, i) => ({
        name: `${kind}${i}`,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
        isBot: true,
        team: 1,
      })),
    ],
    settings: { stageHazards: false },
    config: { match: { durationTicks: 60 * 60 * 30 }, ...(o.config ?? {}) } as DeepPartial<GameConfig>,
  });
  classicGrid(s);
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  const put = (id: number, x: number, y: number): void => {
    const p = s.players[id]!;
    p.x = p.stepFromX = x;
    p.y = p.stepFromY = y;
    p.stepRemaining = 0;
    p.protectedUntil = 0;
  };
  put(0, 1, 1);
  const me = s.players[0]!;
  me.vitals = vitalsOf(o.humanHp ?? 4);
  me.capacity = 2;
  me.range = 2;
  o.enemies.forEach((kind, i) => {
    const p = s.players[i + 1]!;
    const [x, y] = GRID_SPOTS[i % GRID_SPOTS.length]!;
    put(i + 1, x, y);
    p.enemyKind = kind;
    p.capacity = 0;
    p.vitals = vitalsOf(enemyDef(kind).hp);
  });
  const bots: Record<number, Bot> = {};
  s.players.slice(1).forEach((p, i) => {
    bots[p.id] = createBot({ difficulty: o.difficulty, seed: o.seed * 97 + i, playerId: p.id });
  });
  const human = new FairHuman(o.human ?? FAIR_HUMAN);
  const st = emptyStats(o.enemies.length);
  const rec = new Recorder(st);
  const limit = (o.seconds ?? 90) * HZ;
  for (let t = 0; t < limit; t++) {
    const targets = s.players
      .filter((p) => p.alive && p.enemyKind !== undefined)
      .map((p) => p.y * s.width + p.x);
    const intents: Intents = { 0: human.decide(s, targets, null) };
    for (const [id, bot] of Object.entries(bots)) {
      if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
    }
    const ev = tick(s, intents);
    rec.onTick(s, ev);
    if (st.deaths > 0) break;
    if (s.players.every((p) => p.id === 0 || !p.alive)) {
      st.won = true;
      break;
    }
  }
  st.seconds = s.tick / HZ;
  st.laid = human.laid;
  st.laidOnEnemy = human.laidOnEnemy;
  return st;
}

// ------------------------------------------------------------------ a real raid with its waves

export interface RaidFightOptions {
  raidId?: RaidId;
  seed: number;
  difficulty: Difficulty;
  config?: DeepPartial<GameConfig>;
  human?: FairHumanOptions;
}

/** The first soft tile on the quickest walk (crates count as passable, at a cost) from the human to next to `goal`. */
function nextCrate(s: GameState, goal: number): number | null {
  const w = s.width;
  const me = s.players[0]!;
  const start = me.y * w + me.x;
  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const queue: number[] = [start];
  // a small Dijkstra with costs 1 (floor) / 6 (crate): a bucket queue would be overkill on a raid board
  while (queue.length > 0) {
    queue.sort((a, b) => dist.get(a)! - dist.get(b)!);
    const u = queue.shift()!;
    if (u === goal) break;
    for (const d of DIRS) {
      const x = (u % w) + DIR_VEC[d].dx;
      const y = Math.floor(u / w) + DIR_VEC[d].dy;
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
      const v = y * w + x;
      const t = s.tiles[v];
      if (t === Tile.Hard) continue;
      const c = dist.get(u)! + (t === Tile.Empty ? 1 : 6);
      if (c < (dist.get(v) ?? Infinity)) {
        dist.set(v, c);
        prev.set(v, u);
        if (!queue.includes(v)) queue.push(v);
      }
    }
  }
  if (!dist.has(goal)) return null;
  const path: number[] = [];
  for (let u = goal; u !== start; u = prev.get(u)!) path.push(u);
  path.reverse();
  return path.find((i) => s.tiles[i] !== Tile.Empty) ?? goal;
}

/**
 * The real raid (its waves, doors, belts and clock): the human fights the active enemies that come within 6 tiles,
 * otherwise works on the nearest marked crate (blasting the crates in the way), then walks to the open exit.
 * Lives and respawns are the raid's own; `won` is the raid's outcome.
 */
export function playRaidFight(o: RaidFightOptions): FightStats & { outcome: string } {
  const s = createGame(
    buildRaidGame({
      raidId: o.raidId ?? 'warehouseDispatchDepot',
      humanCharacter: 'streetBaller',
      seed: o.seed,
      difficulty: o.difficulty,
    }),
  );
  if (o.config) Object.assign(s.config, o.config); // shallow: only used for whole-section overrides
  const bots: Record<number, Bot> = {};
  s.players.slice(1).forEach((p, i) => {
    bots[p.id] = createBot({ difficulty: o.difficulty, seed: o.seed + (i + 1) * 7919, playerId: p.id });
  });
  const human = new FairHuman(o.human ?? FAIR_HUMAN);
  const st = emptyStats(s.raid!.seats.length);
  const rec = new Recorder(st);
  const w = s.width;
  const limit = (s.raid!.timeLimitTicks + 600) | 0;
  for (let t = 0; t < limit && !s.raid!.outcome && s.match.phase !== 'ended'; t++) {
    const me = s.players[0]!;
    const foes = s.players.filter(
      (p) => p.alive && p.enemyKind !== undefined && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 6,
    );
    let targets = foes.map((p) => p.y * w + p.x);
    let goal: number | null = null;
    if (targets.length === 0 && me.alive) {
      const r = s.raid!;
      const marked = r.cargo
        .filter((c) => c.marked && !c.destroyed)
        .map((c) => c.y * w + c.x)
        .sort(
          (a, b) =>
            Math.abs((a % w) - me.x) +
            Math.abs(Math.floor(a / w) - me.y) -
            (Math.abs((b % w) - me.x) + Math.abs(Math.floor(b / w) - me.y)),
        );
      const reachable = marked.map((m) => nextCrate(s, m)).find((c) => c !== null);
      if (reachable !== undefined && reachable !== null) targets = [reachable];
      else if (r.extraction.open) goal = r.extraction.y * w + r.extraction.x;
      else {
        // nothing to blast yet (a door is closed): hunt the nearest active enemy
        targets = s.players.filter((p) => p.alive && p.enemyKind !== undefined).map((p) => p.y * w + p.x);
      }
    }
    const intents: Intents = { 0: human.decide(s, targets, goal) };
    for (const [id, bot] of Object.entries(bots)) {
      if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
    }
    rec.onTick(s, tick(s, intents));
  }
  st.seconds = s.tick / HZ;
  st.laid = human.laid;
  st.laidOnEnemy = human.laidOnEnemy;
  st.won = s.raid!.outcome?.result === 'completed';
  return { ...st, outcome: s.raid!.outcome?.result ?? 'timeout' };
}
