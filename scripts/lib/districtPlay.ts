/**
 * Full field-mission playthroughs for the district encounter pass (docs/CAMPAIGN_SECTOR_AI.md, "Districts: Oshodi,
 * Mushin, Fadeyi/Somolu", decisions DA1-DA9). The REAL mission (`buildMissionGame` at the campaign level: the sector,
 * the crates, the territories, campaign health) against the REAL enemy bots (`createBot` at the level's enemy bot level,
 * seeded like `MatchController.startMission`), with a scripted human that sends ORDINARY intents only (walk, A = lay a
 * generator, B = the one-press special, i.e. a punch when an enemy is adjacent). Nothing is staged after the start: no
 * enemy is moved, no AI state is written, no blast is forced. Door raids are answered through `resolveRaid` with a
 * completed outcome exactly as the scripted Oshodi playthrough in `tests/field-missions.test.ts` does; their time is
 * estimated from the raid's par time (`raidParSec`).
 *
 * The human (a competent player who uses generators as the weapon):
 *   1. standing where a blast will burn (any generator's real footprint, chains included), a flame or a seen thrown
 *      line: walk out by the quickest safe way (lingering next to his own generator while its fuse is long);
 *   2. a punch winding up on him: jab it (cuts an ordinary wind-up short) or step out of its reach late;
 *   3. an enemy next to him and his punch ready: B (stagger, one tile of knockback, a slow);
 *   4. a TARGET inside the footprint of a generator laid where he stands and a safe way out before the fuse: A;
 *   5. otherwise walk toward the objective (or to a tile from which a target is in his footprint).
 * Targets by leg: the group's enemies (defeat), the standing equipment (destroy), enemies inside or next to the zone
 * (keep), and on the other legs any enemy that is hunting him (alert / pursue) within three tiles.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import {
  DIRS,
  DIR_VEC,
  attackReady,
  buildMissionGame,
  campaignEnemyLevel,
  createGame,
  enemyDef,
  getFieldMission,
  missionView,
  observe,
  playerStepTicks,
  previewBlast,
  primaryOf,
  resolveRaid,
  tick,
} from '../../src/sim';
import type {
  CampaignLevel,
  Dir,
  GameState,
  Generator,
  Intent,
  Intents,
  RaidId,
  RaidOutcome,
  SimEvent,
} from '../../src/sim';
import { attackable } from '../../src/sim/systems/skills';
import { RAID_DEFS } from '../../src/sim/raid/defs';
import { Tile } from '../../src/sim/types';

export const HZ = 60;
/** The campaign's lives per field mission (app/campaign.ts MISSION_LIVES). */
export const FIELD_LIVES = 3;

interface Window {
  from: number;
  to: number;
}

/** The raid's par time (seconds): the estimate of a door raid's play time. */
export function raidParSec(raidId: RaidId): number {
  return RAID_DEFS[raidId].parSec;
}

function completedRaid(raidId: RaidId): RaidOutcome {
  return {
    raidId,
    result: 'completed',
    seconds: raidParSec(raidId),
    optionalRoomsOpened: 0,
    optionalRoomsTotal: 1,
    cargoDestroyed: 3,
    cargoTotal: 3,
    hpLeft: 3,
    livesUsed: 0,
    stars: 2,
  };
}

export interface FieldPlayer {
  laid: number;
  punches: number;
  decide(s: GameState): Intent;
  /** The events of the tick just played (what he saw happen). */
  notice?(ev: readonly SimEvent[]): void;
}

/** The scripted human (see the file header). */
export class DistrictHuman implements FieldPlayer {
  laid = 0;
  punches = 0;
  private readonly windups = new Map<number, { resolve: number; at: number }>();
  /** His own blasts in a row that hurt no enemy: after two he closes in and uses his fists on a dodger. */
  private misses = 0;
  private lastX = -1;
  private lastY = -1;
  private movedAt = 0;
  constructor(
    readonly reactTicks = 18,
    readonly fuseMargin = 40,
  ) {}

  private walkable(s: GameState, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) return false;
    if (s.tiles[y * s.width + x] !== Tile.Empty) return false;
    return !s.generators.some((g) => g.x === x && g.y === y && g.flight === null);
  }

  /** Tile -> windows in which it burns (flames now, every generator's real footprint from its fuse on; chains). */
  private danger(s: GameState): Map<number, Window[]> {
    const out = new Map<number, Window[]>();
    const add = (i: number, w: Window): void => {
      const l = out.get(i);
      if (l) l.push(w);
      else out.set(i, [w]);
    };
    for (const f of s.flames) add(f.y * s.width + f.x, { from: s.tick, to: f.endTick + 2 });
    const flame = s.config.generator.flameTicks;
    const at = new Map<number, number>();
    for (const g of s.generators) at.set(g.id, s.tick + Math.max(1, g.timer));
    const prints = new Map<number, Set<number>>();
    for (const g of s.generators) prints.set(g.id, previewBlast(s, g));
    for (const g of s.generators) {
      const t0 = at.get(g.id)!;
      for (const i of prints.get(g.id)!) {
        const o = s.generators.find((q) => q.y * s.width + q.x === i && q.id !== g.id);
        if (o && at.get(o.id)! > t0) at.set(o.id, t0);
      }
    }
    for (const g of s.generators) {
      const t0 = at.get(g.id)!;
      for (const i of prints.get(g.id)!) add(i, { from: t0 - 6, to: t0 + flame + 4 });
    }
    return out;
  }

  /** Tiles on the unfinished path of a thrown object he has had time to see. */
  private lines(s: GameState): Set<number> {
    const out = new Set<number>();
    for (const pr of s.projectiles ?? []) {
      if (s.tick - pr.launchTick < this.reactTicks) continue;
      if (pr.ownerId === 0) continue;
      for (let i = pr.index; i < pr.path.length; i++) out.add(pr.path[i]!);
    }
    return out;
  }

  /** The real footprint of a generator he would lay on (px, py) now. */
  footprint(s: GameState, px: number, py: number): Set<number> {
    const me = s.players[0]!;
    const g: Generator = {
      id: -1,
      ownerId: 0,
      x: px,
      y: py,
      stepFromX: px,
      stepFromY: py,
      range: me.range,
      pierce: false,
      square: 0,
      fromSpectator: false,
      mode: 'timed',
      timer: s.config.generator.fuseTicks,
      carriedBy: null,
      carryBonusUsed: false,
      slide: null,
      flight: null,
      triggered: false,
      placedTick: s.tick,
    };
    return previewBlast(s, g);
  }

  private route(
    s: GameState,
    danger: Map<number, Window[]>,
    avoid: Set<number>,
    goal: (i: number, steps: number) => boolean,
    max = 30,
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

  private safe(danger: Map<number, Window[]>, lines: Set<number>, i: number): boolean {
    return !danger.has(i) && !lines.has(i);
  }

  private canEscape(s: GameState, danger: Map<number, Window[]>, lines: Set<number>): boolean {
    const me = s.players[0]!;
    const blast = this.footprint(s, me.x, me.y);
    const step = playerStepTicks(s, me);
    const budget = Math.floor((s.config.generator.fuseTicks - this.fuseMargin) / step);
    const keep = (i: number): boolean => !blast.has(i) && this.safe(danger, lines, i);
    return this.route(s, danger, new Set(), keep, budget) !== null;
  }

  notice(ev: readonly SimEvent[]): void {
    for (const e of ev) {
      if (e.type === 'generatorExploded' && e.ownerId === 0) this.misses++;
      if (e.type === 'campaignHit' && e.byId === 0 && e.victimId !== 0) this.misses = 0;
    }
  }

  /** The objective of the current leg: the tile to walk to and what to bomb. */
  objective(s: GameState): {
    goal: number | null;
    targets: number[];
    area: { x: number; y: number; r: number } | null;
  } {
    const v = missionView(s);
    const w = s.width;
    const me = s.players[0]!;
    if (!v || v.format !== 'field' || !v.fieldGoal) return { goal: null, targets: [], area: null };
    const g = v.fieldGoal;
    const m = s.mission!;
    const foes = s.players.filter((p) => p.alive && p.enemyKind !== undefined);
    const hunting = foes.filter((p) => {
      const st = s.territory?.minds[p.id]?.state;
      const near = Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 3;
      return near && (st === 'alert' || st === 'pursue' || st === undefined);
    });
    const tiles = (ps: typeof foes): number[] => ps.map((p) => p.y * w + p.x);
    switch (g.verb) {
      case 'defeat': {
        const leg = getFieldMission(m.field!.fieldId).legs[m.field!.leg];
        const group = leg && leg.kind === 'clearGroup' ? leg.group : '';
        const ids = new Set(m.seats.filter((st) => st.group === group).map((st) => st.playerId));
        const members = foes.filter((p) => ids.has(p.id));
        const near = [...members].sort(
          (a, b) =>
            Math.abs(a.x - me.x) + Math.abs(a.y - me.y) - (Math.abs(b.x - me.x) + Math.abs(b.y - me.y)),
        )[0];
        return {
          goal: near ? near.y * w + near.x : null,
          targets: tiles([...new Set([...members, ...hunting])]),
          area: null,
        };
      }
      case 'destroy': {
        const standing = (m.field!.targets ?? []).filter((t) => t.leg === m.field!.leg && !t.destroyed);
        return {
          goal: g.nodeId ? g.y * w + g.x : null,
          targets: [...standing.map((t) => t.y * w + t.x), ...tiles(hunting)],
          area: null,
        };
      }
      case 'secure': {
        const a = g.area!;
        const near = foes.filter((p) => Math.max(Math.abs(p.x - a.x), Math.abs(p.y - a.y)) <= a.radius + 2);
        return {
          goal: a.y * w + a.x,
          targets: tiles([...new Set([...near, ...hunting])]),
          area: { x: a.x, y: a.y, r: a.radius },
        };
      }
      case 'escape':
        return { goal: g.y * w + g.x, targets: [], area: null };
      default:
        return { goal: g.nodeId ? g.y * w + g.x : null, targets: tiles(hunting), area: null };
    }
  }

  /** The first crate on the fewest-crate way to the goal when no crate-free way exists (null: a free way, or none). */
  private crateOnWay(s: GameState, goal: number): number | null {
    const me = s.players[0]!;
    const w = s.width;
    const N = w * s.height;
    const start = me.y * w + me.x;
    const near = (i: number): boolean =>
      Math.abs((i % w) - (goal % w)) + Math.abs(Math.floor(i / w) - Math.floor(goal / w)) <= 1;
    const equipment = new Set((s.mission?.field?.targets ?? []).map((t) => t.y * w + t.x));
    const cost = new Int32Array(N).fill(1 << 30);
    const prev = new Int32Array(N).fill(-1);
    const deque: number[] = [start];
    cost[start] = 0;
    let end = -1;
    for (let h = 0; h < deque.length; h++) {
      const u = deque[h]!;
      if (near(u) && s.tiles[u] === Tile.Empty) {
        end = u;
        break;
      }
      for (const d of DIRS) {
        const x = (u % w) + DIR_VEC[d].dx;
        const y = Math.floor(u / w) + DIR_VEC[d].dy;
        if (x < 0 || y < 0 || x >= w || y >= s.height) continue;
        const v = y * w + x;
        const t = s.tiles[v];
        if (t === Tile.Hard || equipment.has(v) || (t !== Tile.Empty && t !== Tile.Soft)) continue;
        const c = cost[u]! + (t === Tile.Soft ? 1 : 0);
        if (c >= cost[v]!) continue;
        cost[v] = c;
        prev[v] = u;
        deque.push(v);
      }
      // keep the queue roughly ordered by cost (small boards: a stable sort of the tail is cheap enough)
      if (h % 64 === 63) {
        const tail = deque.splice(h + 1).sort((a2, b2) => cost[a2]! - cost[b2]!);
        deque.push(...tail);
      }
    }
    if (end < 0 || cost[end] === 0) return null;
    let first: number | null = null;
    for (let i = end; i !== -1 && i !== start; i = prev[i]!) if (s.tiles[i] === Tile.Soft) first = i;
    return first;
  }

  decide(s: GameState): Intent {
    const me = s.players[0]!;
    if (!me.alive || s.tick < me.dazedUntil || me.stepRemaining > 1 || s.match.phase !== 'playing') return {};
    const w = s.width;
    const here = me.y * w + me.x;
    const danger = this.danger(s);
    // a player pinned by a thrower's lines for a while stops treating every line as a wall (he takes the risk)
    if (me.x !== this.lastX || me.y !== this.lastY) {
      this.lastX = me.x;
      this.lastY = me.y;
      this.movedAt = s.tick;
    }
    const pinned = s.tick - this.movedAt > 90;
    const lines = pinned ? new Set<number>() : this.lines(s);
    const foes = s.players.filter((p) => p.alive && p.enemyKind !== undefined);
    const step = playerStepTicks(s, me);
    const { goal, area } = this.objective(s);
    let { targets } = this.objective(s);
    // the way to the goal is shut by crates (a drop, a crate the route never needed): the first crate becomes a target
    if (goal !== null) {
      const onGoal =
        s.tiles[goal] === Tile.Soft && !(s.mission?.field?.targets ?? []).some((t) => t.y * w + t.x === goal);
      const crate = onGoal ? goal : this.crateOnWay(s, goal);
      if (crate !== null) targets = [...targets, crate];
    }

    // 1. out of a footprint / flame / seen line (lingering by his own long fuse)
    if (!this.safe(danger, lines, here)) {
      const r = this.route(s, danger, new Set(), (i) => this.safe(danger, lines, i));
      const soonest = Math.min(...(danger.get(here) ?? [{ from: s.tick }]).map((win) => win.from));
      const urgent = lines.has(here) || !r || soonest - s.tick <= (r.steps + 1) * step + this.fuseMargin;
      if (r?.first && urgent) return { move: r.first };
      if (!r) {
        // no clean way out: the step that leads furthest from the soonest danger
        const r2 = this.route(s, new Map(), new Set(), (i) => !danger.has(i));
        if (r2?.first) return { move: r2.first };
      }
    }
    const calm = (i: number): boolean =>
      !lines.has(i) && (danger.get(i) ?? []).every((win) => win.from > s.tick + 90);
    const kind = primaryOf(me);
    // 2. a punch winding up on me
    for (const f of foes) {
      const a = f.attack;
      if (!a || a.targetId !== 0 || Math.abs(f.x - me.x) + Math.abs(f.y - me.y) > 1) continue;
      const seen = this.windups.get(f.id);
      if (!seen || seen.resolve !== a.resolveTick)
        this.windups.set(f.id, { resolve: a.resolveTick, at: s.tick });
      if (s.tick - (this.windups.get(f.id)?.at ?? s.tick) < this.reactTicks) continue;
      const canJab =
        !enemyDef(f.enemyKind!).steadfast && attackReady(s, me, kind) && attackable(s, s.tick, me, f, kind);
      if (canJab) {
        this.punches++;
        return { special: true };
      }
      const remaining = a.resolveTick - s.tick;
      if (remaining > 14 || remaining < 3) continue;
      for (const d of DIRS) {
        const x = me.x + DIR_VEC[d].dx;
        const y = me.y + DIR_VEC[d].dy;
        if (!this.walkable(s, x, y) || !calm(y * w + x)) continue;
        if (Math.abs(f.x - x) + Math.abs(f.y - y) <= 1) continue;
        return { move: d };
      }
    }
    // 3. punch an adjacent enemy (never trade with a winding-up heavy)
    for (const f of foes) {
      if (Math.abs(f.x - me.x) + Math.abs(f.y - me.y) !== 1) continue;
      if (f.attack && f.attack.targetId === 0 && enemyDef(f.enemyKind!).steadfast) continue;
      if (!targets.includes(f.y * w + f.x)) continue;
      if (attackReady(s, me, kind) && attackable(s, s.tick, me, f, kind)) {
        this.punches++;
        return { special: true };
      }
    }
    // 4. lay a generator when a target is in its footprint and a way out exists
    const own = s.generators.filter((g) => g.ownerId === 0 && !g.vehicleBorne).length;
    const onGen = s.generators.some((g) => g.x === me.x && g.y === me.y);
    if (own < me.capacity && !onGen && targets.length > 0) {
      const blast = this.footprint(s, me.x, me.y);
      // boxed in (crates dropped round him) for a while: he lays anyway and takes the knock
      const boxed = pinned && s.tick - this.movedAt > 240;
      if (targets.some((t) => blast.has(t)) && (boxed || this.canEscape(s, danger, lines))) {
        this.laid++;
        return { place: true };
      }
    }
    // 5. walk: to a firing tile when there are targets, else to the goal (inside the zone: stay)
    const avoid = new Set<number>([...lines, ...danger.keys()]);
    if (area && Math.max(Math.abs(me.x - area.x), Math.abs(me.y - area.y)) <= area.r && targets.length === 0)
      return {};
    // a dodger (two blasts in a row hurt nobody): walk up to the nearest target enemy and punch it
    if (this.misses >= 2 && attackReady(s, me, kind)) {
      const dodgers = foes.filter(
        (f) => targets.includes(f.y * w + f.x) && !enemyDef(f.enemyKind!).steadfast,
      );
      const near = (i: number): boolean =>
        dodgers.some((f) => Math.abs(f.x - (i % w)) + Math.abs(f.y - Math.floor(i / w)) === 1);
      const r = this.route(s, danger, avoid, near, 20);
      if (r?.first) return { move: r.first };
    }
    if (targets.length > 0 && own < me.capacity) {
      const firing = (i: number): boolean => {
        const b = this.footprint(s, i % w, Math.floor(i / w));
        return targets.some((t) => b.has(t));
      };
      const r = this.route(s, danger, avoid, firing, 60);
      if (r?.first) return { move: r.first };
      if (r && r.first === null) return {};
    }
    if (goal !== null) {
      const r = this.route(s, danger, avoid, (i) => i === goal, 400);
      if (r?.first) return { move: r.first };
      // the goal is a solid tile (equipment) or an enemy: get next to it
      const r2 = this.route(
        s,
        danger,
        avoid,
        (i) => Math.abs((i % w) - (goal % w)) + Math.abs(Math.floor(i / w) - Math.floor(goal / w)) <= 1,
        400,
      );
      if (r2?.first) return { move: r2.first };
    }
    return {};
  }
}

export interface PlayResult {
  id: string;
  level: CampaignLevel;
  seed: number;
  result: 'won' | 'lost' | 'timeout' | 'stuck';
  /** Field play seconds (the field clock; a raid pauses it). */
  fieldSec: number;
  /** Estimated raid seconds (the par time of every door raid played). */
  raidSec: number;
  livesUsed: number;
  /** Seconds at which each leg was cleared. */
  legSec: number[];
  laid: number;
  punches: number;
  kills: number;
  killsByBlast: number;
}

export interface PlayOptions {
  maxSec?: number;
  player?: FieldPlayer;
  trace?: boolean;
}

/** The mission's real match at a level, its enemy bots seeded like the app's (MatchController.startMission). */
export function missionMatch(
  id: string,
  level: CampaignLevel,
  seed: number,
): { s: GameState; bots: Record<number, Bot> } {
  const def = getFieldMission(id);
  const difficulty = campaignEnemyLevel(level);
  const options = buildMissionGame({
    spec: { id: def.districtId, fieldId: id, difficulty, lives: FIELD_LIVES },
    humanCharacter: 'streetBaller',
    seed,
    level,
  });
  const s = createGame(options);
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  const bots: Record<number, Bot> = {};
  s.players.forEach((p, i) => {
    if (p.isBot) bots[i] = createBot({ difficulty, seed: seed + i * 7919, playerId: i });
  });
  return { s, bots };
}

/** One tick: every living enemy bot decides from its own observation; the human sends `human`. */
export function stepMatch(s: GameState, bots: Record<number, Bot>, human: Intent): SimEvent[] {
  const intents: Intents = { 0: human };
  for (const [id, bot] of Object.entries(bots))
    if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
  return tick(s, intents);
}

/** Plays a whole field mission (see the file header). */
export function playMission(id: string, level: CampaignLevel, seed: number, o: PlayOptions = {}): PlayResult {
  const { s, bots } = missionMatch(id, level, seed);
  const player = o.player ?? new DistrictHuman();
  const out: PlayResult = {
    id,
    level,
    seed,
    result: 'stuck',
    fieldSec: 0,
    raidSec: 0,
    livesUsed: 0,
    legSec: [],
    laid: 0,
    punches: 0,
    kills: 0,
    killsByBlast: 0,
  };
  const max = (o.maxSec ?? 900) * HZ;
  for (let n = 0; n < max && s.match.phase !== 'ended'; n++) {
    const req = s.mission?.pendingRaid;
    if (req) {
      out.raidSec += raidParSec(req.raidId);
      const answer: SimEvent[] = [];
      resolveRaid(s, req.doorId, completedRaid(req.raidId), answer);
      for (const e of answer)
        if (e.type === 'missionPhase' && e.change === 'cleared')
          out.legSec.push(Math.round(s.match.playTicks / 6) / 10);
    }
    const ev = stepMatch(s, bots, player.decide(s));
    player.notice?.(ev);
    for (const e of ev) {
      if (e.type === 'missionPhase' && e.change === 'cleared')
        out.legSec.push(Math.round(s.match.playTicks / 6) / 10);
      if (e.type === 'campaignDefeated' && e.byId === 0 && e.victimId !== 0) {
        out.kills++;
        if (e.source === 'blast') out.killsByBlast++;
      }
    }
    if (o.trace && s.tick % 60 === 0) {
      const v = missionView(s);
      const me = s.players[0]!;
      const foes = s.players
        .slice(1)
        .map((p) => `${p.id}${p.alive ? '' : 'x'}@${p.x},${p.y}:${s.territory?.minds[p.id]?.state ?? '-'}`)
        .join(' ');
      console.log(
        `${(s.match.playTicks / 60).toFixed(0)}s leg${v?.legIndex} ${v?.legKind} H${me.x},${me.y} hp${me.vitals?.hp} lives${s.mission?.livesUsed} ${foes}`,
      );
    }
  }
  const m = s.mission!;
  out.fieldSec = Math.round(s.match.playTicks / 6) / 10;
  out.livesUsed = m.livesUsed;
  out.result = m.outcome?.result ?? 'stuck';
  out.laid = player.laid;
  out.punches = player.punches;
  return out;
}

export interface Tally {
  runs: number;
  won: number;
  meanFieldSec: number;
  meanRaidSec: number;
  meanLives: number;
  results: PlayResult[];
}

export function tallyMission(
  id: string,
  level: CampaignLevel,
  seeds: readonly number[],
  o: PlayOptions = {},
): Tally {
  const results = seeds.map((seed) => playMission(id, level, seed, o));
  const won = results.filter((r) => r.result === 'won');
  const mean = (xs: number[]): number =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
  return {
    runs: results.length,
    won: won.length,
    meanFieldSec: mean(won.map((r) => r.fieldSec)),
    meanRaidSec: mean(won.map((r) => r.raidSec)),
    meanLives: mean(results.map((r) => r.livesUsed)),
    results,
  };
}

// ------------------------------------------------------------------ the "seen" drill on the mission board

/**
 * A BADLY placed generator on the real mission board: the human is staged two tiles in front of an enemy at its post
 * (in its view cone, clear line of sight), lays a generator at once in plain view and walks away. The enemy (real bot,
 * real perception) should escape it. Returns whether the enemy was hurt by that blast, or null when no staging tile
 * exists for that enemy.
 */
export function seenOnMission(
  id: string,
  level: CampaignLevel,
  seed: number,
  enemyId: number,
): { hit: boolean } | null {
  const { s, bots } = missionMatch(id, level, seed);
  // let the patrols settle into their routes for a moment
  for (let i = 0; i < 30 + (seed % 7) * 11; i++) stepMatch(s, bots, {});
  const e = s.players[enemyId]!;
  if (!e.alive) return null;
  const w = s.width;
  const open = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < s.height && s.tiles[y * w + x] === Tile.Empty;
  // two tiles straight ahead of its facing (inside its view cone), the tile between open
  const order: Dir[] = [e.facing, ...DIRS.filter((d) => d !== e.facing)];
  let spot: [number, number] | null = null;
  for (const d of order) {
    const v = DIR_VEC[d];
    const x = e.x + v.dx * 2;
    const y = e.y + v.dy * 2;
    if (
      open(e.x + v.dx, e.y + v.dy) &&
      open(x, y) &&
      !s.players.some((p) => p.alive && p.x === x && p.y === y)
    ) {
      spot = [x, y];
      break;
    }
  }
  if (!spot) return null;
  const me = s.players[0]!;
  me.x = me.stepFromX = spot[0];
  me.y = me.stepFromY = spot[1];
  me.stepRemaining = 0;
  let laidAt = -1;
  let hit = false;
  // the way out: the open tile farthest from the enemy within 8 steps
  for (let i = 0; i < 600; i++) {
    let intent: Intent = {};
    const g = s.generators.find((o) => o.ownerId === 0);
    if (laidAt < 0) {
      intent = { place: true };
      if (g) laidAt = s.tick;
    }
    if (laidAt >= 0) {
      const gen = s.generators.find((o) => o.ownerId === 0);
      const print = gen ? previewBlast(s, gen) : new Set<number>();
      const d = gen ? awayStep(s, print, gen.x, gen.y) : null;
      intent = d ? { move: d } : {};
    }
    if (laidAt < 0 && i > 2) return null;
    const ev = stepMatch(s, bots, intent);
    for (const x of ev)
      if (x.type === 'campaignHit' && x.source === 'blast' && x.victimId === enemyId && x.byId === 0) {
        if (x.result === 'damaged' || x.result === 'defeated') hit = true;
      }
    if (laidAt >= 0 && s.tick > laidAt + s.config.generator.fuseTicks + 30) break;
  }
  return laidAt >= 0 ? { hit } : null;
}

/**
 * The first step of the shortest walk for the human to a tile clear of `print` and at least 5 tiles (Manhattan) from
 * the generator at (gx, gy), like the drill's walk away (over open floor, around generators). Null: already there.
 */
function awayStep(s: GameState, print: Set<number>, gx: number, gy: number): Dir | null {
  const me = s.players[0]!;
  const w = s.width;
  const start = me.y * w + me.x;
  const far = (i: number): boolean =>
    !print.has(i) && Math.abs((i % w) - gx) + Math.abs(Math.floor(i / w) - gy) >= 5;
  if (far(start)) return null;
  const first = new Map<number, Dir>();
  const queue = [start];
  const seen = new Set([start]);
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    for (const d of DIRS) {
      const x = (u % w) + DIR_VEC[d].dx;
      const y = Math.floor(u / w) + DIR_VEC[d].dy;
      const v = y * w + x;
      if (seen.has(v) || x < 0 || y < 0 || x >= w || y >= s.height) continue;
      if (s.tiles[v] !== Tile.Empty || s.generators.some((g) => g.x === x && g.y === y)) continue;
      seen.add(v);
      first.set(v, u === start ? d : first.get(u)!);
      if (far(v)) return first.get(v)!;
      queue.push(v);
    }
  }
  return null;
}
