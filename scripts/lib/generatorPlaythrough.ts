/**
 * A SCRIPTED FULL-MISSION PLAYTHROUGH of a campaign field mission (docs/CAMPAIGN_SECTOR_AI.md, "Districts: Ebute
 * Metta, Lagos Island, Lekki Phase 1"). The real mission (`buildMissionGame` at a campaign level, exactly as the campaign
 * starts it: the level's enemy bot level, 3 lives, the sector, the crates of the seed) against the REAL enemy bots
 * (`createBot`, seeded as `MatchController` seeds them). The human uses ORDINARY intents only - walk, A (lay a
 * generator), B (the context special: a punch on an adjacent enemy) - and a reasonable generator-first strategy:
 *
 *   - it reads the danger it can see (live generators' real radial footprints, flames, an enemy's wind-up reach, a
 *     thrown object's marked path) and never walks into it; standing in it, it leaves by the shortest safe way;
 *   - Ring equipment: it walks next to the piece, lays a generator and leaves the footprint (one blast per hit point);
 *   - a fight: an adjacent enemy winding up is jabbed (stagger) or stepped away from; a staggered, rooted or slowed
 *     enemy next to it gets a generator laid under the human's feet before he leaves; ordinary enemies are punched when
 *     nothing better is open; armoured enemies are only ever finished by a blast: at its punch floor one gets the bait
 *     (a generator under his own feet, hidden by his body, held until it commits to a wind-up: decision DT1);
 *   - a hold zone: it walks in and fights whoever contests it; an escape: it runs for the exit, jabbing a pursuer that
 *     catches up;
 *   - a door raises the raid: it is answered with `resolveRaid` (a completed raid, the human's health carried), the
 *     precedent of the scripted Oshodi playthrough in tests/field-missions.test.ts. Its time is NOT played here: the
 *     caller estimates it from the raid's par time (`RAID_DEFS[id].parSec`).
 *
 * Nothing touches the state but `tick` and `resolveRaid`: no teleport, no AI state written, no enemy put in a blast.
 * Deterministic for a seed (no Math.random). Used by tests/field-districts-ebute-lagos-lekki.test.ts and
 * `scripts/field-play.ts`.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import {
  DIRS,
  DIR_VEC,
  RAID_DEFS,
  buildMissionGame,
  campaignEnemyLevel,
  canSeeTile,
  createGame,
  enemyHealthView,
  getFieldMission,
  inViewCone,
  missionView,
  observe,
  radialFootprint,
  radialRadius,
  radialSquareRadius,
  resolveRaid,
  tick,
} from '../../src/sim';
import type {
  CampaignLevel,
  Dir,
  GameState,
  Intent,
  Intents,
  MissionView,
  Player,
  RaidId,
  SimEvent,
} from '../../src/sim';
import { Tile } from '../../src/sim/types';

export interface PlaythroughResult {
  fieldId: string;
  level: CampaignLevel;
  seed: number;
  result: 'won' | 'lost' | 'timeout' | 'stuck';
  /** Field play time (seconds of match play, the raid not included). */
  fieldSec: number;
  /** Raids answered, and their estimated time (each raid's par time). */
  raids: number;
  raidSec: number;
  livesUsed: number;
  legsCleared: number;
  generatorsLaid: number;
  punches: number;
  enemiesDefeated: number;
  /** Enemy defeats by a blast of the human. */
  blastDefeats: number;
  /** Health segments the human lost (every hit, lives included). */
  damageTaken: number;
  /** Seconds of field play each leg took (the return route last). */
  legSec: number[];
  /** Sector gates opened during the run (`sectorGateOpened`). */
  gatesOpened: number;
  stars: number;
}

const W = (s: GameState): number => s.width;
const idx = (s: GameState, x: number, y: number): number => y * s.width + x;
const manhattan = (ax: number, ay: number, bx: number, by: number): number =>
  Math.abs(ax - bx) + Math.abs(ay - by);

/** Ticks a generator's blast reaches each tile in (chains included): tile index -> ticks left. */
export function blastClock(s: GameState): Map<number, number> {
  const g = s.config.generator;
  const timers = new Map<number, number>();
  const gens = s.generators.filter((o) => o.carriedBy === null);
  const fp = gens.map((o) => {
    const radius = radialRadius(o.range, g.maxRange);
    const tiles = radialFootprint(s, o.x, o.y, radius, {
      pierce: o.pierce,
      squareRadius: radialSquareRadius(radius, o.square, g.radialMaxSquareRadius),
    }).map((t) => idx(s, t.x, t.y));
    tiles.push(idx(s, o.x, o.y));
    return tiles;
  });
  // effective fuse: a generator inside another's footprint goes off with it (chains)
  const eff = gens.map((o) => (o.mode === 'disabled' ? Infinity : o.timer));
  for (let pass = 0; pass < gens.length; pass++) {
    let changed = false;
    gens.forEach((o, i) => {
      const at = idx(s, o.x, o.y);
      gens.forEach((_, j) => {
        if (i !== j && eff[j]! < eff[i]! && fp[j]!.includes(at)) {
          eff[i] = eff[j]!;
          changed = true;
        }
      });
    });
    if (!changed) break;
  }
  gens.forEach((_, i) => {
    if (eff[i] === Infinity) return;
    for (const t of fp[i]!) timers.set(t, Math.min(timers.get(t) ?? Infinity, eff[i]!));
  });
  // a blast in progress (its flames spread and linger until `endTick`)
  for (const b of s.blasts) if (b.endTick >= s.tick) for (const t of b.tiles) timers.set(t, 0);
  for (const f of s.flames) timers.set(idx(s, f.x, f.y), 0);
  return timers;
}

/** The footprint of a generator the human would lay on (x, y) now (his range), centre included. */
function wouldBlast(s: GameState, me: Player, x: number, y: number): Set<number> {
  const g = s.config.generator;
  const radius = radialRadius(me.range, g.maxRange);
  const out = new Set(
    radialFootprint(s, x, y, radius, {
      pierce: me.hotFuel,
      squareRadius: radialSquareRadius(radius, me.squareTier, g.radialMaxSquareRadius),
    }).map((t) => idx(s, t.x, t.y)),
  );
  out.add(idx(s, x, y));
  return out;
}

const STEP = 12; // a cautious estimate of the human's ticks per step (10 at speed 0, plus a turn)

/**
 * The scripted human. `decide` returns one ordinary intent per tick.
 */
export class GeneratorPlayer {
  generatorsLaid = 0;
  punches = 0;
  /** When each enemy wind-up / thrown object was first seen (a person needs a moment to react to it). */
  private readonly firstSeen = new Map<string, number>();
  /**
   * The bait against an armoured enemy at its punch floor (decision DT1): the generator he laid under his own feet and
   * now stands on (his body hides it from an enemy that did not watch the placement), waiting for the enemy to commit
   * to a wind-up next to him. Null when not baiting.
   */
  private cover: { gen: number; foe: number } | null = null;
  /** Since when he has been boxed in by crates with no way out of his own blast (see `walk`). */
  private boxedSince: number | null = null;

  /**
   * @param seed varies the reaction to each cue (deterministically: a person is not a metronome)
   * @param reaction the fastest and slowest reaction to a seen wind-up or throw cue, in ticks (0.3 - 0.6 s)
   */
  constructor(
    private readonly seed = 1,
    private readonly reaction: readonly [number, number] = [18, 36],
  ) {}

  /** Has this cue been visible long enough to react to? (The reaction to each cue is a hash of the seed and the cue.) */
  private noticed(s: GameState, key: string): boolean {
    let at = this.firstSeen.get(key);
    if (at === undefined) {
      at = s.tick;
      this.firstSeen.set(key, at);
    }
    let h = Math.imul(this.seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
    const [lo, hi] = this.reaction;
    return s.tick - at >= lo + (h % (hi - lo + 1));
  }

  decide(s: GameState): Intent {
    const me = s.players[0]!;
    if (!me.alive || s.match.phase !== 'playing') return {};
    const view = missionView(s);
    if (!view || view.pendingRaid || view.outcome) return {};
    const clock = blastClock(s);
    const enemies = s.players.filter((p) => p.id !== 0 && p.alive);
    const threat = this.threatTiles(s, enemies);
    const here = idx(s, me.x, me.y);
    const leg = view.legKind;

    // 0. the bait (decision DT1): keep standing on the generator while the armoured enemy has not committed
    const bait = this.holdBait(s, me, enemies, clock, threat);
    if (bait) return bait;

    // 1. standing in danger: leave by the shortest safe way
    if (clock.has(here) || threat.has(here) || s.flames.some((f) => f.x === me.x && f.y === me.y)) {
      // leaving the bait as the enemy winds up: out of its reach first (a first step still in its reach is a hit)
      if (threat.has(here) && s.generators.some((g) => g.ownerId === 0 && g.x === me.x && g.y === me.y)) {
        const out = this.route(s, me, (i) => !clock.has(i) && !threat.has(i), clock, threat);
        if (out) return { move: out };
      }
      const d = this.route(s, me, (i) => !clock.has(i) && !threat.has(i), clock, threat, true);
      if (d) return { move: d };
    }
    const mine = s.generators.some((g) => g.ownerId === 0 && g.mode !== 'disabled');

    // 2. a fight at hand (every enemy, whatever the leg)
    const adjacent = enemies.filter((e) => manhattan(e.x, e.y, me.x, me.y) === 1).sort((a, b) => a.id - b.id);
    // holding a zone: stay in it; an enemy outside it is only answered when it winds up (no chasing it out of the zone)
    const zone = leg === 'holdArea' ? view.fieldGoal?.area : undefined;
    const inZone = (x: number, y: number): boolean =>
      !!zone && Math.max(Math.abs(x - zone.x), Math.abs(y - zone.y)) <= zone.radius;
    for (const e of adjacent) {
      const defendOnly = !!zone && !inZone(e.x, e.y);
      const fight = this.fight(s, me, e, mine, clock, threat, leg === 'escapeRoute' || defendOnly);
      if (fight) return fight;
    }

    // 3. the leg
    const goal = this.goal(s, me, view, enemies, mine, clock, threat);
    if (goal) return goal;
    return {};
  }

  /** Tiles an enemy attack can reach soon: a winding-up enemy's neighbours (and its reach-2 line), thrown paths. */
  private threatTiles(s: GameState, enemies: Player[]): Set<number> {
    const out = new Set<number>();
    for (const e of enemies) {
      if (!e.attack || !this.noticed(s, `a${e.id}:${e.attack.resolveTick}`)) continue;
      for (const d of DIRS) {
        const x = e.x + DIR_VEC[d].dx;
        const y = e.y + DIR_VEC[d].dy;
        out.add(idx(s, x, y));
      }
      const v = DIR_VEC[e.attack.dir];
      out.add(idx(s, e.x + 2 * v.dx, e.y + 2 * v.dy));
    }
    for (const p of s.projectiles ?? []) {
      if (p.ownerId === 0 || !this.noticed(s, `p${p.id}`)) continue;
      for (const t of p.path.slice(p.index)) out.add(t);
    }
    return out;
  }

  /** Can the human walk onto tile i, arriving after `steps` steps? */
  private passable(
    s: GameState,
    i: number,
    steps: number,
    clock: Map<number, number>,
    threat: Set<number>,
    bodies: Set<number>,
    fleeing: boolean,
  ): boolean {
    if (s.tiles[i] !== Tile.Empty || bodies.has(i)) return false;
    // a pothole stumbles you: a person walks round it (an oil slick is modelled as a slide by `landing`)
    if (s.floorHazards[i] === 'pothole' && !fleeing) return false;
    if (s.generators.some((g) => idx(s, g.x, g.y) === i)) return false;
    if (s.flames.some((f) => idx(s, f.x, f.y) === i)) return false;
    const t = clock.get(i);
    // a footprint tile is crossed only when the blast is still well away
    if (t !== undefined && t < (steps + 2) * STEP + 20) return false;
    if (!fleeing && threat.has(i) && steps <= 3) return false;
    return true;
  }

  /** First step of the shortest safe walk to a tile `goal` accepts (BFS; bodies block). Null = none / there. */
  route(
    s: GameState,
    me: Player,
    goal: (i: number) => boolean,
    clock: Map<number, number>,
    threat: Set<number>,
    fleeing = false,
    throughBodies = false,
  ): Dir | null {
    const w = W(s);
    const start = idx(s, me.x, me.y);
    const bodies = new Set(
      throughBodies ? [] : s.players.filter((p) => p.id !== 0 && p.alive).map((p) => idx(s, p.x, p.y)),
    );
    const first = new Map<number, Dir>();
    const dist = new Map<number, number>([[start, 0]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]!;
      if (u !== start && goal(u)) return first.get(u)!;
      const du = dist.get(u)!;
      for (const d of DIRS) {
        const x = (u % w) + DIR_VEC[d].dx;
        const y = Math.floor(u / w) + DIR_VEC[d].dy;
        if (x < 0 || y < 0 || x >= w || y >= s.height) continue;
        const step = idx(s, x, y);
        if (!this.passable(s, step, du + 1, clock, threat, bodies, fleeing)) continue;
        // an oil slick carries you on in the same direction (`hazards.oilSlideTiles`)
        const v = this.landing(s, step, d, (i) =>
          this.passable(s, i, du + 2, clock, threat, bodies, fleeing),
        );
        if (dist.has(v)) continue;
        dist.set(v, du + 1);
        first.set(v, u === start ? d : first.get(u)!);
        queue.push(v);
      }
    }
    return null;
  }

  /** Where a step onto tile `i` heading `d` ends: an oil slick slides you on while the way is open. */
  private landing(s: GameState, i: number, d: Dir, open: (i: number) => boolean): number {
    if (s.floorHazards[i] !== 'oil') return i;
    let at = i;
    for (let k = 0; k < s.config.hazards.oilSlideTiles; k++) {
      const x = (at % W(s)) + DIR_VEC[d].dx;
      const y = Math.floor(at / W(s)) + DIR_VEC[d].dy;
      if (x < 0 || y < 0 || x >= W(s) || y >= s.height) break;
      const n = idx(s, x, y);
      if (!open(n)) break;
      at = n;
    }
    return at;
  }

  /** Steps from the human to the nearest tile `goal` accepts (BFS over safe floor), or Infinity. */
  private stepsTo(s: GameState, me: Player, goal: (i: number) => boolean, avoid: Set<number>): number {
    const w = W(s);
    const start = idx(s, me.x, me.y);
    const dist = new Map<number, number>([[start, 0]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]!;
      if (goal(u)) return dist.get(u)!;
      for (const d of DIRS) {
        const x = (u % w) + DIR_VEC[d].dx;
        const y = Math.floor(u / w) + DIR_VEC[d].dy;
        if (x < 0 || y < 0 || x >= w || y >= s.height) continue;
        const v = idx(s, x, y);
        if (dist.has(v) || s.tiles[v] !== Tile.Empty || avoid.has(v)) continue;
        if (s.generators.some((g) => idx(s, g.x, g.y) === v)) continue;
        dist.set(v, dist.get(u)! + 1);
        queue.push(v);
      }
    }
    return Infinity;
  }

  /** Is laying a generator here now survivable (a safe tile outside its footprint within a fuse's walk)? */
  private canLayHere(s: GameState, me: Player, clock: Map<number, number>): boolean {
    const mine = s.generators.filter((g) => g.ownerId === 0 && g.mode !== 'disabled').length;
    if (mine >= me.capacity) return false;
    if (s.generators.some((g) => g.x === me.x && g.y === me.y)) return false;
    const fp = wouldBlast(s, me, me.x, me.y);
    const bodies = new Set(s.players.filter((p) => p.id !== 0 && p.alive).map((p) => idx(s, p.x, p.y)));
    const steps = this.stepsTo(
      s,
      me,
      (i) => !fp.has(i) && !clock.has(i) && !bodies.has(i),
      new Set([...bodies, ...[...clock.keys()].filter((k) => (clock.get(k) ?? 0) < 90)]),
    );
    return steps <= 5;
  }

  private fight(
    s: GameState,
    me: Player,
    e: Player,
    mine: boolean,
    clock: Map<number, number>,
    threat: Set<number>,
    running: boolean,
  ): Intent | null {
    const ready = s.tick >= me.skillReadyTick && me.attack === null;
    const locked = s.tick < (me.meleeLock[e.id] ?? 0);
    const armoured = e.enemyKind === 'heavy' || e.enemyKind === 'lieutenant' || e.enemyKind === 'boss';
    const staggered = s.tick < e.dazedUntil || s.tick < e.rootedUntil || (e.slow?.until ?? 0) > s.tick;
    // its wind-up: jab it if we can, else step out of reach
    if (e.attack && this.noticed(s, `a${e.id}:${e.attack.resolveTick}`)) {
      if (ready && !locked && !armoured && s.tick >= e.dazeImmuneUntil) {
        this.punches++;
        return { special: true };
      }
      const away = this.route(
        s,
        me,
        (i) => manhattan(i % W(s), Math.floor(i / W(s)), e.x, e.y) >= 2 && !clock.has(i) && !threat.has(i),
        clock,
        threat,
        true,
      );
      if (away) return { move: away };
    }
    if (running) {
      // an escape (or an enemy outside the zone we hold): knock it back and carry on
      if (ready && !locked && !armoured) {
        this.punches++;
        return { special: true };
      }
      return null;
    }
    // an armoured enemy at its punch floor, free to move: the bait (it must not be planted already: then it would
    // only see the generator later, and walk out after its recovery)
    if (
      !mine &&
      this.blastOnly(s, e) &&
      !e.attack &&
      s.tick >= e.rootedUntil &&
      this.canLayHere(s, me, clock)
    )
      return this.layBait(e);
    // staggered / planted / slowed next to us: the generator goes down under our feet, then we leave
    if (!mine && (staggered || armoured) && this.canLayHere(s, me, clock)) {
      this.generatorsLaid++;
      return { place: true };
    }
    if (ready && !locked && !(armoured && this.punchFloorReached(s, e))) {
      this.punches++;
      return { special: true };
    }
    if (armoured && !mine && this.canLayHere(s, me, clock)) {
      this.generatorsLaid++;
      return { place: true };
    }
    return null;
  }

  /**
   * The bait (decision DT1). An armoured enemy at its punch floor sees every generator once it is engaged and walks out
   * of a 3 s fuse with time to spare (it plans round the human since SA13). What it cannot see is a generator under the
   * human's own body (Part 2, sight rule 1) when it did not watch the placement (Easy and Normal). So he lays under his
   * feet and STAYS on it until the enemy commits to a wind-up next to him (it is rooted for the wind-up and its
   * recovery), then steps out of its reach and out of the footprint. If it never commits he leaves while the way out is
   * still long enough. Ordinary intents only: he stands still, then walks.
   */
  private holdBait(
    s: GameState,
    me: Player,
    enemies: Player[],
    clock: Map<number, number>,
    threat: Set<number>,
  ): Intent | null {
    const c = this.cover;
    if (!c) return null;
    const here = idx(s, me.x, me.y);
    const g =
      c.gen < 0
        ? s.generators.find((o) => o.ownerId === 0 && o.x === me.x && o.y === me.y)
        : s.generators.find((o) => o.id === c.gen);
    const foe = enemies.find((e) => e.id === c.foe);
    if (!g || g.x !== me.x || g.y !== me.y || !foe || threat.has(here)) {
      this.cover = null;
      return null;
    }
    c.gen = g.id;
    const bodies = new Set(enemies.map((e) => idx(s, e.x, e.y)));
    const out = this.stepsTo(s, me, (i) => !clock.has(i) && !threat.has(i) && !bodies.has(i), bodies);
    if (g.timer <= (out + 1) * STEP + 24) {
      this.cover = null;
      return null;
    }
    return {};
  }

  /** No open tile outside the footprint of a generator laid here can be walked to at all (crates, walls, bodies). */
  private boxedIn(s: GameState, me: Player): boolean {
    const fp = wouldBlast(s, me, me.x, me.y);
    const bodies = new Set(s.players.filter((p) => p.id !== 0 && p.alive).map((p) => idx(s, p.x, p.y)));
    return this.stepsTo(s, me, (i) => !fp.has(i) && !bodies.has(i), bodies) === Infinity;
  }

  /** Lays the bait under his feet against an armoured enemy at its punch floor (see `holdBait`). */
  private layBait(e: Player): Intent {
    this.generatorsLaid++;
    this.cover = { gen: -1, foe: e.id };
    return { place: true };
  }

  /** An armoured enemy that punches can no longer finish (only a blast can). */
  private blastOnly(s: GameState, e: Player): boolean {
    const armoured = e.enemyKind === 'heavy' || e.enemyKind === 'lieutenant' || e.enemyKind === 'boss';
    return armoured && this.punchFloorReached(s, e);
  }

  /** The tiles of every living body but the human and `but` (they hide what lies behind them). */
  private bodiesBut(s: GameState, but: number): Set<number> {
    return new Set(
      s.players.filter((p) => p.alive && p.id !== 0 && p.id !== but).map((p) => idx(s, p.x, p.y)),
    );
  }

  private punchFloorReached(s: GameState, e: Player): boolean {
    const floor = enemyHealthView(s, e.id)?.punchFloor ?? 0;
    return !!e.vitals && e.vitals.hp <= floor;
  }

  private goal(
    s: GameState,
    me: Player,
    view: MissionView,
    enemies: Player[],
    mine: boolean,
    clock: Map<number, number>,
    threat: Set<number>,
  ): Intent | null {
    const goal = view.fieldGoal;
    const seats = s.mission!.seats;
    const groupOf = (id: number): string | undefined => seats[id]?.group;
    const nodeTile = goal?.nodeId ? idx(s, goal.x, goal.y) : -1;
    const here = idx(s, me.x, me.y);

    if (mine) {
      // our generator is ticking: wait outside its footprint (stay put when already safe)
      if (!clock.has(here)) return {};
    }

    switch (view.legKind) {
      case 'destroyTargets': {
        const target = goal?.nodeId ? { x: goal.x, y: goal.y } : null;
        if (!target) return null;
        // stand next to the piece (a tile from which our blast reaches it) and lay
        const ok = (i: number): boolean =>
          manhattan(i % W(s), Math.floor(i / W(s)), target.x, target.y) === 1 && !clock.has(i);
        if (ok(here)) {
          if (!mine && this.canLayHere(s, me, clock)) {
            this.generatorsLaid++;
            return { place: true };
          }
          return {};
        }
        return this.walk(s, me, ok, clock, threat);
      }
      case 'clearGroup':
      case 'holdArea': {
        const area = view.fieldGoal?.area;
        const inArea = (x: number, y: number): boolean =>
          !!area && Math.max(Math.abs(x - area.x), Math.abs(y - area.y)) <= area.radius;
        const leg = getFieldMission(view.fieldId!).legs[view.legIndex!];
        const group = leg && leg.kind === 'clearGroup' ? leg.group : null;
        const targets = enemies.filter((e) =>
          group ? groupOf(e.id) === group : area ? inArea(e.x, e.y) : false,
        );
        if (area && targets.length === 0) {
          // the zone is clear: stand in it (its centre, or the nearest tile of it)
          if (inArea(me.x, me.y) && !clock.has(here)) return {};
          return this.walk(
            s,
            me,
            (i) => inArea(i % W(s), Math.floor(i / W(s))) && !clock.has(i),
            clock,
            threat,
          );
        }
        if (targets.length === 0) return null;
        // hunt the nearest: walk next to it (the fight above takes over there)
        const near = [...targets].sort(
          (a, b) => manhattan(a.x, a.y, me.x, me.y) - manhattan(b.x, b.y, me.x, me.y) || a.id - b.id,
        )[0]!;
        // the bait laid round a corner (decision DT1): an armoured enemy at its punch floor coming for him (its "!" is
        // up) and a few steps away with no clear line to him cannot watch the placement; it walks up to the generator
        // hidden under his body and commits to a wind-up there
        const mind = s.territory?.minds[near.id]?.state;
        const dist = manhattan(near.x, near.y, me.x, me.y);
        if (
          !mine &&
          !area &&
          (mind === 'pursue' || mind === 'alert') &&
          dist >= 2 &&
          dist <= 5 &&
          this.blastOnly(s, near) &&
          !canSeeTile(s, near.x, near.y, me.x, me.y, 12, this.bodiesBut(s, near.id)) &&
          this.canLayHere(s, me, clock)
        )
          return this.layBait(near);
        return this.walk(
          s,
          me,
          (i) => manhattan(i % W(s), Math.floor(i / W(s)), near.x, near.y) === 1 && !clock.has(i),
          clock,
          threat,
        );
      }
      default: {
        if (nodeTile < 0) return null;
        if (here === nodeTile) return {};
        return this.walk(s, me, (i) => i === nodeTile, clock, threat);
      }
    }
  }

  /** Walks toward a goal; when only a way through crates exists, blasts the first crate on it. */
  private walk(
    s: GameState,
    me: Player,
    ok: (i: number) => boolean,
    clock: Map<number, number>,
    threat: Set<number>,
  ): Intent | null {
    const d = this.route(s, me, ok, clock, threat) ?? this.route(s, me, ok, clock, threat, false, true);
    if (d) return { move: d };
    // no open way: the cheapest way through crates (a crate costs 6 steps); walk up to its first crate and blast it
    const first = this.crateStep(s, me, ok);
    if (!first) return null;
    if (first.crate) {
      const ticking = s.generators.some((g) => g.ownerId === 0 && g.mode !== 'disabled');
      if (!ticking && this.canLayHere(s, me, clock)) {
        this.generatorsLaid++;
        return { place: true };
      }
      // boxed in by crates with no tile out of the blast to step to (a respawn between stage crates): after a moment
      // he blasts his way out and takes the knock, as a person would, instead of standing there to the end of the clock
      if (!ticking && this.boxedIn(s, me)) {
        this.boxedSince ??= s.tick;
        if (s.tick - this.boxedSince >= 120) {
          this.boxedSince = null;
          this.generatorsLaid++;
          return { place: true };
        }
      } else this.boxedSince = null;
      return null;
    }
    const i = idx(s, me.x + DIR_VEC[first.dir].dx, me.y + DIR_VEC[first.dir].dy);
    return clock.has(i) || threat.has(i) ? null : { move: first.dir };
  }

  /** The first step of the cheapest walk to the goal when crates may be blasted (Dijkstra by buckets). */
  private crateStep(
    s: GameState,
    me: Player,
    ok: (i: number) => boolean,
  ): { dir: Dir; crate: boolean } | null {
    const w = W(s);
    const start = idx(s, me.x, me.y);
    const cost = new Map<number, number>([[start, 0]]);
    const first = new Map<number, { dir: Dir; crate: boolean }>();
    const buckets: number[][] = [[start]];
    for (let c = 0; c < buckets.length; c++) {
      for (const u of buckets[c] ?? []) {
        if (cost.get(u) !== c) continue;
        if (u !== start && ok(u)) return first.get(u)!;
        for (const d of DIRS) {
          const x = (u % w) + DIR_VEC[d].dx;
          const y = Math.floor(u / w) + DIR_VEC[d].dy;
          if (x < 0 || y < 0 || x >= w || y >= s.height) continue;
          const step = idx(s, x, y);
          const t = s.tiles[step];
          if (t === Tile.Hard) continue;
          if (
            t === Tile.Soft &&
            s.mission?.field?.targets?.some((o) => !o.destroyed && idx(s, o.x, o.y) === step)
          )
            continue;
          const v = t === Tile.Empty ? this.landing(s, step, d, (i) => s.tiles[i] === Tile.Empty) : step;
          const nc = c + 1 + (t === Tile.Soft ? 6 : 0);
          if (nc >= (cost.get(v) ?? Infinity)) continue;
          cost.set(v, nc);
          first.set(v, u === start ? { dir: d, crate: t === Tile.Soft } : first.get(u)!);
          (buckets[nc] ??= []).push(v);
        }
      }
    }
    return null;
  }
}

export interface PlayOptions {
  level?: CampaignLevel;
  seed?: number;
  /** Stop after this many ticks of play (default: the mission's own clock + 10 s). */
  maxTicks?: number;
  /** Debug: print a line every this many ticks (and on every leg change). */
  trace?: number;
}

/** Plays one field mission start to end (see the file header). */
export function playFieldMission(fieldId: string, o: PlayOptions = {}): PlaythroughResult {
  const def = getFieldMission(fieldId);
  const level = o.level ?? 'normal';
  const seed = o.seed ?? 1;
  const enemyLevel = campaignEnemyLevel(level);
  const options = buildMissionGame({
    spec: { id: def.districtId, fieldId, difficulty: enemyLevel, lives: 3 },
    humanCharacter: 'streetBaller',
    seed,
    level,
  });
  const s = createGame(options);
  const bots: Record<number, Bot> = {};
  s.players.forEach((p, i) => {
    if (p.isBot)
      bots[i] = createBot({
        difficulty: options.players[i]?.difficulty ?? enemyLevel,
        seed: seed + i * 7919,
        playerId: i,
      });
  });
  const human = new GeneratorPlayer(seed);
  const res: PlaythroughResult = {
    fieldId,
    level,
    seed,
    result: 'stuck',
    fieldSec: 0,
    raids: 0,
    raidSec: 0,
    livesUsed: 0,
    legsCleared: 0,
    generatorsLaid: 0,
    punches: 0,
    enemiesDefeated: 0,
    blastDefeats: 0,
    damageTaken: 0,
    legSec: [],
    gatesOpened: 0,
    stars: 0,
  };
  let legStart = 0;
  const max = o.maxTicks ?? (def.timeLimitSec + 10) * 60 + 600;
  for (let n = 0; n < max && s.match.phase !== 'ended'; n++) {
    const request = s.mission?.pendingRaid;
    if (request) {
      // the precedent of the scripted Oshodi playthrough: a completed raid, the human's health carried
      const raid = RAID_DEFS[request.raidId as RaidId];
      res.raids++;
      res.raidSec += raid.parSec;
      const hp = s.players[0]!.vitals?.hp ?? 3;
      const raidEvents: SimEvent[] = [];
      resolveRaid(
        s,
        request.doorId,
        {
          raidId: request.raidId,
          result: 'completed',
          seconds: raid.parSec,
          optionalRoomsOpened: 0,
          optionalRoomsTotal: 1,
          cargoDestroyed: 3,
          cargoTotal: 3,
          hpLeft: hp,
          livesUsed: 0,
          stars: 2,
        },
        raidEvents,
      );
      for (const e of raidEvents)
        if (e.type === 'sectorGateOpened') res.gatesOpened++;
        else if (e.type === 'missionPhase' && e.change === 'cleared') {
          res.legsCleared++;
          res.legSec.push(Math.round((s.match.playTicks - legStart) / 60));
          legStart = s.match.playTicks;
        }
    }
    const intents: Intents = { 0: human.decide(s) };
    for (const [id, bot] of Object.entries(bots))
      if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
    const ev: SimEvent[] = tick(s, intents);
    if (o.trace)
      for (const e of ev)
        if (
          (e.type === 'campaignHit' && e.victimId === 0) ||
          e.type === 'generatorDisarmed' ||
          e.type === 'generatorDoused'
        )
          console.log(
            `  t${s.tick} ${JSON.stringify(e).slice(0, 220)} me ${s.players[0]!.x},${s.players[0]!.y}`,
          );
    if (o.trace && (s.tick % o.trace === 0 || ev.some((e) => e.type === 'missionPhase'))) {
      const v = missionView(s);
      const me = s.players[0]!;
      console.log(
        `t${s.tick} leg${v?.legIndex}:${v?.legKind} me ${me.x},${me.y} hp${me.vitals?.hp} goal ${v?.fieldGoal?.target}@${v?.fieldGoal?.x},${v?.fieldGoal?.y} in ${JSON.stringify(intents[0])} gens ${s.generators.map((g) => `${g.ownerId}:${g.x},${g.y}/${g.timer}`).join(' ')} foes ${s.players
          .filter((p) => p.id > 0 && p.alive)
          .map((p) => `${p.id}@${p.x},${p.y}${s.territory?.minds[p.id]?.state?.[0] ?? ''}${p.vitals?.hp}`)
          .join(' ')}`,
      );
    }
    for (const e of ev) {
      if (e.type === 'campaignHit' && e.victimId === 0) res.damageTaken += e.damage;
      if (e.type === 'sectorGateOpened') res.gatesOpened++;
      if (e.type === 'campaignHit' && e.victimId !== 0 && e.result === 'defeated') {
        res.enemiesDefeated++;
        if (e.source === 'blast' && e.byId === 0) res.blastDefeats++;
      }
      if (e.type === 'missionPhase' && e.change === 'cleared') {
        res.legsCleared++;
        res.legSec.push(Math.round((s.match.playTicks - legStart) / 60));
        legStart = s.match.playTicks;
      }
    }
  }
  const out = s.mission?.outcome;
  res.result = out ? (out.result as PlaythroughResult['result']) : 'stuck';
  res.fieldSec = Math.round(s.match.playTicks / 60);
  if (out?.result === 'won') res.legSec.push(Math.round((s.match.playTicks - legStart) / 60));
  res.livesUsed = s.mission?.livesUsed ?? 0;
  res.generatorsLaid = human.generatorsLaid;
  res.punches = human.punches;
  res.stars = out?.stars ?? 0;
  return res;
}

// ------------------------------------------------------------------ a badly placed generator, in plain view

export interface SeenResult {
  /** The human got within two tiles of the enemy in its sight and laid the generator. */
  laid: boolean;
  /** The enemy had the generator in its sight (open line, in its view cone or while engaged) before the blast. */
  seen: boolean;
  /** The enemy took the blast (lost health to it, or was defeated). */
  hit: boolean;
}

/**
 * The "seen" drill on the real mission board (docs/CAMPAIGN_SECTOR_AI.md, "Measurements"): the human walks up to the
 * enemy seat `enemyId` (whatever it is doing: patrolling, watching, coming at him), and when he is at most two tiles
 * from it with an open line between them, while it is free to move (not winding up, planted, reeling or slowed: that
 * would be a trap, not a bad placement), he lays a generator on his own tile in plain view, then walks straight out of
 * its footprint. The other enemies play too. Ordinary intents only; nothing is moved by hand.
 */
export function seenInMission(fieldId: string, enemyId: number, o: PlayOptions = {}): SeenResult {
  const def = getFieldMission(fieldId);
  const level = o.level ?? 'normal';
  const seed = o.seed ?? 1;
  const enemyLevel = campaignEnemyLevel(level);
  const options = buildMissionGame({
    spec: { id: def.districtId, fieldId, difficulty: enemyLevel, lives: 3 },
    humanCharacter: 'streetBaller',
    seed,
    level,
  });
  const s = createGame(options);
  const bots: Record<number, Bot> = {};
  s.players.forEach((p, i) => {
    if (p.isBot)
      bots[i] = createBot({
        difficulty: options.players[i]?.difficulty ?? enemyLevel,
        seed: seed + i * 7919,
        playerId: i,
      });
  });
  const human = new GeneratorPlayer(seed);
  const res: SeenResult = { laid: false, seen: false, hit: false };
  const e = s.players[enemyId]!;
  let gen = -1;
  let blastAt = -1;
  for (let n = 0; n < 60 * 90 && s.match.phase !== 'ended'; n++) {
    const me = s.players[0]!;
    let intent: Intent = {};
    if (s.match.phase === 'playing' && me.alive && e.alive) {
      const clock = blastClock(s);
      const g = s.generators.find((q) => q.id === gen);
      if (gen < 0) {
        const near = manhattan(me.x, me.y, e.x, e.y) <= 2;
        const bodies = new Set(
          s.players.filter((p) => p.alive && p.id !== e.id && p.id !== 0).map((p) => idx(s, p.x, p.y)),
        );
        // badly placed: the enemy is free to move (not winding up, not planted, not reeling, not slowed)
        const free =
          e.attack === null &&
          s.tick >= e.rootedUntil &&
          s.tick >= e.dazedUntil &&
          (e.slow?.until ?? 0) <= s.tick;
        if (near && free && me.stepRemaining === 0 && canSeeTile(s, e.x, e.y, me.x, me.y, 9, bodies)) {
          intent = { place: true };
        } else {
          const d = human.route(
            s,
            me,
            (i) => manhattan(i % W(s), Math.floor(i / W(s)), e.x, e.y) === 2,
            clock,
            new Set(),
          );
          intent = d ? { move: d } : {};
        }
      } else if (g) {
        // away from the enemy (never past it, never next to it: that would corner it, a trap, not a bad placement) and
        // out of the footprint, then wait
        const here = idx(s, me.x, me.y);
        const nearEnemy = new Set<number>();
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) nearEnemy.add(idx(s, e.x + dx, e.y + dy));
        const away = (i: number): boolean =>
          !clock.has(i) && manhattan(i % W(s), Math.floor(i / W(s)), e.x, e.y) >= 3;
        if (!away(here)) {
          const d =
            human.route(s, me, away, clock, nearEnemy) ?? human.route(s, me, away, clock, new Set(), true);
          intent = d ? { move: d } : {};
        }
        if (!res.seen && !(me.x === g.x && me.y === g.y)) {
          const bodies = new Set(
            s.players.filter((p) => p.alive && p.id !== e.id).map((p) => idx(s, p.x, p.y)),
          );
          const mind = s.territory?.minds[e.id]?.state;
          const looking = inViewCone(e, g.x, g.y) || mind === 'alert' || mind === 'pursue';
          if (looking && canSeeTile(s, e.x, e.y, g.x, g.y, 9, bodies)) res.seen = true;
        }
      }
    }
    const intents: Intents = { 0: intent };
    for (const [id, bot] of Object.entries(bots))
      if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
    const ev = tick(s, intents);
    if (o.trace && gen >= 0) {
      const g = s.generators.find((q) => q.id === gen);
      console.log(
        `t${s.tick} me ${me.x},${me.y} e ${e.x},${e.y} ${s.territory?.minds[e.id]?.state} atk ${e.attack ? 1 : 0} root ${Math.max(0, e.rootedUntil - s.tick)} daze ${Math.max(0, e.dazedUntil - s.tick)} gen ${g ? `${g.x},${g.y}/${g.timer}` : '-'} seen ${res.seen} hp ${e.vitals?.hp}`,
      );
    }
    if (gen < 0) {
      const mine = s.generators.find((q) => q.ownerId === 0);
      if (mine) {
        gen = mine.id;
        res.laid = true;
      }
    }
    for (const x of ev)
      if (x.type === 'campaignHit' && x.victimId === enemyId && x.source === 'blast' && x.byId === 0) {
        if (x.result === 'damaged' || x.result === 'defeated') res.hit = true;
      }
    if (gen >= 0 && blastAt < 0 && !s.generators.some((q) => q.id === gen)) blastAt = s.tick;
    if (blastAt >= 0 && s.tick > blastAt + 30) break;
    if (!e.alive && gen < 0) break;
  }
  return res;
}
