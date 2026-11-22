/**
 * THE BOSS HUMAN (docs/BOSS_BALANCE.md, decisions BB1-): a scripted player held to a person's limits who plays a REAL
 * campaign boss mission end to end (`buildMissionGame` exactly as `CampaignController.startMission` builds it, the real
 * boss and crew bots, stage hazards, convoys, lives). It is the measuring stick of the boss balance pass; unlike the
 * BX audit agent (`bossFight.ts`), which re-plans every tick with the whole state, it is NOT superhuman:
 *
 * - it SEES what the screen shows: generators, enemies, stage hazards and strike warnings within a view of
 *   `viewHalfW` x `viewHalfH` tiles round itself (the follow camera), and the HUD (relays on the minimap, the boss's
 *   shield / window / "RESTORING" line, the anchor ring). Never the RNG, a bot's plan or what it will do next;
 * - it REACTS late: a generator, warning or hazard counts only `reactTicks` after it first came on screen (its own
 *   generators at once); a fuse is read from the drawn fuse (the real timer) with `fuseMargin` ticks to spare;
 * - it DECIDES a few times a second (`decideEvery` ticks); in between it keeps walking the route it chose (a held
 *   direction), whatever happens;
 * - it cannot dodge a punch that winds up faster than its reaction: it keeps one tile clear of enemies when it can;
 * - it understands generator placement: it lays one only where the target is in its cross and it can walk out of the
 *   cross (and every known danger) before the fuse, and it waits for the HUD's "RESTORING" before going in on the boss.
 *
 * Honest limits: it never panics, misreads the board or fumbles a direction, it plans routes with a BFS a person does by
 * eye, and it reads fuses exactly (with the margin). It does not chase the boss while he walks to his anchor.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import {
  DIRS,
  DIR_VEC,
  buildMissionGame,
  createGame,
  isLethalStageEvent,
  missionView,
  observe,
  playerStepTicks,
  previewBlast,
  tick,
} from '../../src/sim';
import type {
  CampaignLevel,
  Difficulty,
  GameState,
  Generator,
  Intent,
  Intents,
  MissionId,
  MissionView,
  SimEvent,
} from '../../src/sim';
import { Tile } from '../../src/sim/types';

export interface BossHumanOptions {
  /** Ticks before a new generator / warning / hazard on screen is acted on (~0.3 s). */
  reactTicks: number;
  /** Ticks between decisions (a few a second). */
  decideEvery: number;
  /** What the camera shows round the player (tiles each side). */
  viewHalfW: number;
  viewHalfH: number;
  /** Ticks of fuse an escape from its own generator must leave spare. */
  fuseMargin: number;
}

/** A competent phone player: 0.3 s to read a cue, six decisions a second, half a second of fuse to spare. */
export const BOSS_HUMAN: BossHumanOptions = {
  reactTicks: 18,
  decideEvery: 10,
  viewHalfW: 11,
  viewHalfH: 7,
  fuseMargin: 30,
};

/** A slower, more careful player (0.4 s to read a cue, four decisions a second, more fuse to spare). */
export const SLOW_BOSS_HUMAN: BossHumanOptions = {
  ...BOSS_HUMAN,
  reactTicks: 24,
  decideEvery: 15,
  fuseMargin: 45,
};

interface Window {
  from: number;
  to: number;
}

const cheb = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export class BossHuman {
  placed = 0;
  placedOnBoss = 0;
  punches = 0;
  private readonly firstSeen = new Map<string, number>();
  private path: number[] = [];
  private nextDecide = 0;
  private current: string | null = null;
  private since = 0;
  private readonly skip = new Map<string, number>();

  constructor(readonly opts: BossHumanOptions = BOSS_HUMAN) {}

  // ------------------------------------------------------------------ what is on the screen

  private inView(s: GameState, x: number, y: number): boolean {
    const me = s.players[0]!;
    return Math.abs(x - me.x) <= this.opts.viewHalfW && Math.abs(y - me.y) <= this.opts.viewHalfH;
  }

  /** Has the thing `key` been on screen for the reaction time? (Records it the first tick it is seen.) */
  private noticed(key: string, now: number): boolean {
    let t = this.firstSeen.get(key);
    if (t === undefined) {
      t = now;
      this.firstSeen.set(key, t);
    }
    return now - t >= this.opts.reactTicks;
  }

  /** Called every tick (a person watches the screen all the time, even while walking a chosen route). */
  private watch(s: GameState, view: MissionView | null): void {
    for (const g of s.generators)
      if (g.ownerId !== 0 && this.inView(s, g.x, g.y)) this.noticed(`g${g.id}`, s.tick);
    for (const w of view?.warnings ?? [])
      if (w.kind !== 'reinforce' && w.tiles.some((i) => this.inView(s, i % s.width, Math.floor(i / s.width))))
        this.noticed(`w${w.tiles[0]}:${w.tiles.length}:${s.tick + w.remainingTicks}`, s.tick);
    for (const e of s.stage.events)
      if (isLethalStageEvent(e) && e.tiles.some((i) => this.inView(s, i % s.width, Math.floor(i / s.width))))
        this.noticed(`e${e.id}`, s.tick);
  }

  /** Tile -> windows in which it is lethal, from what the player has noticed (and fire already burning). */
  private danger(s: GameState, view: MissionView | null): Map<number, Window[]> {
    const out = new Map<number, Window[]>();
    const add = (i: number, w: Window): void => {
      const l = out.get(i);
      if (l) l.push(w);
      else out.set(i, [w]);
    };
    for (const f of s.flames)
      if (this.inView(s, f.x, f.y)) add(f.y * s.width + f.x, { from: s.tick, to: f.endTick + 2 });
    const known = s.generators.filter(
      (g) =>
        g.carriedBy === null &&
        g.flight === null &&
        (g.ownerId === 0 ||
          (this.firstSeen.has(`g${g.id}`) &&
            s.tick - this.firstSeen.get(`g${g.id}`)! >= this.opts.reactTicks)),
    );
    const flame = s.config.generator.flameTicks;
    const at = new Map<number, number>();
    for (const g of known) at.set(g.id, s.tick + Math.max(1, g.timer));
    for (const g of known) {
      const t0 = at.get(g.id)!;
      for (const i of previewBlast(s, g)) {
        const o = known.find((q) => q.y * s.width + q.x === i && q.id !== g.id);
        if (o && at.get(o.id)! > t0) at.set(o.id, t0);
      }
    }
    for (const g of known) {
      const t0 = at.get(g.id)!;
      for (const i of previewBlast(s, g)) add(i, { from: t0 - 6, to: t0 + flame + 4 });
    }
    for (const w of view?.warnings ?? []) {
      if (w.kind === 'reinforce') continue;
      const land = s.tick + w.remainingTicks;
      const key = `w${w.tiles[0]}:${w.tiles.length}:${land}`;
      const seen = this.firstSeen.get(key);
      if (seen === undefined || s.tick - seen < this.opts.reactTicks) continue;
      for (const i of w.tiles) add(i, { from: land - 6, to: land + 60 });
    }
    for (const e of s.stage.events) {
      if (!isLethalStageEvent(e) || e.endTick <= s.tick) continue;
      const seen = this.firstSeen.get(`e${e.id}`);
      if (seen === undefined || s.tick - seen < this.opts.reactTicks) continue;
      if (e.kind === 'sweep') {
        const step = Math.max(1, e.stepTicks);
        e.tiles.forEach((i, k) => {
          if (k < e.index - 3) return;
          const arrive = e.index < 0 ? e.startTick + k * step : s.tick + (k - e.index) * step;
          add(i, { from: arrive - 2 * step - 6, to: arrive + 3 * step + 6 });
        });
      } else for (const i of e.tiles) add(i, { from: e.startTick - 6, to: e.endTick + 6 });
    }
    return out;
  }

  private walkable(s: GameState, i: number): boolean {
    if (s.tiles[i] !== Tile.Empty) return false;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    return !s.generators.some((g) => g.x === x && g.y === y && g.flight === null && g.carriedBy === null);
  }

  /** The tiles a generator laid on tile `i` by the player would burn (the arena's own shape, chains included). */
  private cross(s: GameState, i: number): Set<number> {
    let hit = this.footprints.get(i);
    if (hit) return hit;
    const me = s.players[0]!;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    const probe: Generator = {
      id: -1,
      ownerId: 0,
      x,
      y,
      stepFromX: x,
      stepFromY: y,
      range: me.range,
      pierce: me.hotFuel,
      square: s.config.square.radiusByTier[Math.min(me.squareTier, s.config.square.maxTier)] ?? 0,
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
    hit = previewBlast(s, probe);
    this.footprints.set(i, hit);
    return hit;
  }

  /** Footprints computed for this decision (the board does not change within one). */
  private readonly footprints = new Map<number, Set<number>>();

  /** Enemies on screen. */
  private foes(s: GameState): GameState['players'] {
    return s.players.filter((p) => p.alive && p.id !== 0 && this.inView(s, p.x, p.y));
  }

  /**
   * The quickest walk (a list of tiles) from the player to a tile `goal` accepts, through tiles that are not lethal
   * while crossed (arrival at step k is k steps from now) and not in `avoid`. Null: none within `max` steps.
   */
  private route(
    s: GameState,
    danger: Map<number, Window[]>,
    avoid: ReadonlySet<number>,
    goal: (i: number, k: number) => boolean,
    max = 60,
    throughSoft = false,
    dwell = 90,
  ): number[] | null {
    const me = s.players[0]!;
    const step = playerStepTicks(s, me);
    const w = s.width;
    const start = me.y * w + me.x;
    if (goal(start, 0)) return [];
    const prev = new Map<number, number>([[start, -1]]);
    let frontier = [start];
    for (let k = 1; k <= max && frontier.length > 0; k++) {
      const next: number[] = [];
      for (const u of frontier) {
        for (const d of DIRS) {
          const x = (u % w) + DIR_VEC[d].dx;
          const y = Math.floor(u / w) + DIR_VEC[d].dy;
          if (x < 0 || y < 0 || x >= w || y >= s.height) continue;
          const v = y * w + x;
          if (prev.has(v) || avoid.has(v)) continue;
          if (!this.walkable(s, v) && !(throughSoft && s.tiles[v] === Tile.Soft)) continue;
          const from = s.tick + (k - 1) * step;
          const to = s.tick + (k + 1) * step;
          if ((danger.get(v) ?? []).some((win) => win.from <= to && win.to >= from)) continue;
          prev.set(v, u);
          // a goal is a tile to stay on: it must stay clear for `dwell` ticks after arriving
          const settled = (danger.get(v) ?? []).every((win) => win.to < from || win.from > to + dwell);
          if (settled && goal(v, k)) {
            const path = [v];
            for (let c = u; c !== start; c = prev.get(c)!) path.push(c);
            return path.reverse();
          }
          next.push(v);
        }
      }
      frontier = next;
    }
    return null;
  }

  private safeNow(danger: Map<number, Window[]>, i: number, now: number, horizon: number): boolean {
    return (danger.get(i) ?? []).every((w) => w.to < now || w.from > now + horizon);
  }

  /** Can the player walk out of a generator laid where it stands (and every known danger) before the fuse? */
  private escapeAfterPlacing(s: GameState, danger: Map<number, Window[]>): number[] | null {
    const me = s.players[0]!;
    const here = me.y * s.width + me.x;
    const blast = this.cross(s, here);
    const fuse = s.config.generator.fuseTicks;
    const step = playerStepTicks(s, me);
    const d2 = new Map(danger);
    for (const i of blast)
      d2.set(i, [...(d2.get(i) ?? []), { from: s.tick + fuse - 6, to: s.tick + fuse + 40 }]);
    d2.delete(here); // it stands on it now; the fuse window is checked by the step budget
    const budget = Math.floor((fuse - this.opts.fuseMargin) / step);
    const foes = this.foes(s);
    return this.route(
      s,
      d2,
      new Set<number>(),
      (i) =>
        !blast.has(i) &&
        this.safeNow(danger, i, s.tick, fuse + 60) &&
        !foes.some((f) => Math.abs(f.x - (i % s.width)) + Math.abs(f.y - Math.floor(i / s.width)) <= 1),
      budget,
    );
  }

  // ------------------------------------------------------------------ the decision

  decide(s: GameState): Intent {
    const me = s.players[0]!;
    const view = missionView(s);
    if (!view || view.outcome || s.match.phase !== 'playing') return {};
    this.watch(s, view);
    if (!me.alive) {
      this.path = [];
      return {};
    }
    const w = s.width;
    const here = me.y * w + me.x;
    if (this.path[0] === here) this.path.shift();
    if (s.tick < this.nextDecide) return this.follow(s);
    this.nextDecide = s.tick + this.opts.decideEvery;
    if (s.tick < me.dazedUntil) return {};
    this.footprints.clear();
    const intent = this.think(s, view);
    return intent ?? this.follow(s);
  }

  /** Keeps walking the chosen route (a held direction). */
  private follow(s: GameState): Intent {
    const me = s.players[0]!;
    const w = s.width;
    const next = this.path[0];
    if (next === undefined) return {};
    const dx = (next % w) - me.x;
    const dy = Math.floor(next / w) - me.y;
    const d = DIRS.find((q) => DIR_VEC[q].dx === dx && DIR_VEC[q].dy === dy);
    if (!d) {
      this.path = [];
      return {};
    }
    return { move: d };
  }

  private go(path: number[] | null): Intent | null {
    if (!path || path.length === 0) {
      this.path = [];
      return path ? {} : null;
    }
    this.path = path;
    return null; // `decide` follows it from this tick
  }

  private think(s: GameState, view: MissionView): Intent | null {
    const me = s.players[0]!;
    const w = s.width;
    const here = me.y * w + me.x;
    const danger = this.danger(s, view);
    const foes = this.foes(s);
    const near = new Set<number>();
    for (const f of foes)
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        near.add((f.y + dy) * w + f.x + dx);
    const hazards = new Set(Object.keys(s.floorHazards).map(Number));
    const avoid = new Set<number>([...near, ...hazards]);
    avoid.delete(here);

    // 1. standing somewhere about to burn: walk to the nearest safe tile
    if (!this.safeNow(danger, here, s.tick, 40)) {
      const out =
        this.route(s, danger, avoid, (i) => this.safeNow(danger, i, s.tick, 90), 20) ??
        this.route(s, danger, hazards, (i) => this.safeNow(danger, i, s.tick, 90), 20);
      if (out) return this.go(out);
    }
    // 2. an enemy at arm's length and the punch ready: B (a stagger buys a step); never the shielded boss
    const adjacent = foes.find(
      (f) =>
        Math.abs(f.x - me.x) + Math.abs(f.y - me.y) === 1 &&
        (f.id !== view.boss.playerId || view.boss.exposed),
    );
    // (a punch plants the puncher for its recovery: only from a tile that stays clear meanwhile)
    if (
      adjacent &&
      s.tick >= me.skillReadyTick &&
      me.attack === null &&
      this.safeNow(danger, here, s.tick, 120)
    ) {
      this.punches++;
      this.path = [];
      return { special: true };
    }
    const own = s.generators.filter((g) => g.ownerId === 0).length;
    const canPlace = own < me.capacity && !s.generators.some((g) => g.x === me.x && g.y === me.y);

    const targets = this.targets(s, view);
    // 3. a target in the cross of a generator laid here, and a way out: A, then walk out
    if (canPlace && targets.fire.some((t) => this.cross(s, here).has(t))) {
      const out = this.escapeAfterPlacing(s, danger);
      if (out && out.length > 0) {
        this.placed++;
        if (
          view.boss.exposed &&
          targets.fire.includes(s.players[view.boss.playerId]!.y * w + s.players[view.boss.playerId]!.x)
        )
          this.placedOnBoss++;
        this.path = out;
        return { place: true };
      }
    }
    // 4. walk to a firing tile (or the waiting spot)
    if (targets.fire.length > 0) {
      const firing = (i: number): boolean => targets.fire.some((t) => this.cross(s, i).has(t));
      const r = this.route(s, danger, avoid, firing) ?? this.route(s, danger, hazards, firing);
      if (r) return this.go(r);
      // boxed in by crates: blast the first crate on the way
      const rough = this.route(s, danger, hazards, firing, 60, true);
      if (rough && rough.length > 0 && s.tiles[rough[0]!] === Tile.Soft && canPlace) {
        const out = this.escapeAfterPlacing(s, danger);
        if (out && out.length > 0) {
          this.placed++;
          this.path = out;
          return { place: true };
        }
      }
      if (rough && rough.length > 0 && s.tiles[rough[0]!] !== Tile.Soft) return this.go([rough[0]!]);
    }
    if (targets.wait !== null) {
      const spot = targets.wait;
      const r = this.route(s, danger, avoid, spot) ?? this.route(s, danger, hazards, spot);
      if (r) return this.go(r);
    }
    // nothing to do: step off any tile next to an enemy
    if (near.has(here)) {
      const r = this.route(s, danger, avoid, (i) => !near.has(i), 6);
      if (r) return this.go(r);
    }
    return {};
  }

  /**
   * What to blast now (tiles) and, when there is nothing to blast yet, where to wait. Active phase: the nearest live
   * relay (a crew member standing on a broken one is re-arming it: blast it there). Exposed: the boss once the HUD says
   * he is restoring and he is on screen; before that, wait two to four tiles from the anchor.
   */
  private targets(
    s: GameState,
    view: MissionView,
  ): { fire: number[]; wait: ((i: number, k: number) => boolean) | null } {
    const me = s.players[0]!;
    const w = s.width;
    const boss = s.players[view.boss.playerId]!;
    if (view.phaseState === 'exposed') {
      const anchor = view.boss.anchor;
      if (view.boss.restoring && boss.alive && this.inView(s, boss.x, boss.y))
        return { fire: [boss.y * w + boss.x], wait: null };
      if (!anchor) return { fire: [], wait: null };
      return {
        fire: [],
        wait: (i) => {
          const d = cheb(i % w, Math.floor(i / w), anchor.x, anchor.y);
          return d >= 2 && d <= 4;
        },
      };
    }
    if (view.phaseState !== 'active') return { fire: [], wait: null };
    const foes = this.foes(s);
    const restocking = view.nodes.filter(
      (n) =>
        n.state === 'done' && foes.some((f) => f.id !== view.boss.playerId && f.x === n.x && f.y === n.y),
    );
    let nodes = view.nodes.filter((n) => n.state !== 'done' && n.state !== 'idle');
    if (nodes.length === 0) nodes = view.nodes.filter((n) => n.state !== 'done');
    const open = nodes.filter((n) => (this.skip.get(n.id) ?? -1) < s.tick);
    if (open.length > 0) nodes = open;
    let best: { x: number; y: number; id: string } | null = null;
    let bestD = Infinity;
    for (const n of [...restocking, ...nodes]) {
      const crowd = foes.filter((f) => cheb(f.x, f.y, n.x, n.y) <= 3).length;
      const d = Math.abs(n.x - me.x) + Math.abs(n.y - me.y) + 10 * crowd;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (!best) return { fire: [], wait: null };
    if (best.id !== this.current) {
      this.current = best.id;
      this.since = s.tick;
    } else if (s.tick - this.since > 900) {
      this.skip.set(best.id, s.tick + 900); // 15 s without breaking it: another one for a while
      this.current = null;
    }
    // crew camping at the relay (runners re-arm it) are one-blast generator bots: they are targets too
    const node = best;
    const campers = foes.filter((f) => f.id !== view.boss.playerId && cheb(f.x, f.y, node.x, node.y) <= 2);
    return { fire: [node.y * w + node.x, ...campers.map((f) => f.y * w + f.x)], wait: null };
  }
}

// ------------------------------------------------------------------ one whole mission

export interface BossMeasureOptions {
  id: MissionId;
  level: CampaignLevel;
  seed: number;
  /** The crew level the campaign save carries (default Rookie, a fresh save's). */
  difficulty?: Difficulty;
  human?: BossHumanOptions;
  /** Stop after this many seconds (default: the mission's own clock). */
  maxSec?: number;
  onTick?: (s: GameState, events: SimEvent[]) => void;
}

export interface BossMeasureResult {
  id: MissionId;
  level: CampaignLevel;
  seed: number;
  result: 'won' | 'lost' | 'timeout' | 'unfinished';
  seconds: number;
  deaths: number;
  /** Health segments the human lost, in all and by cause. */
  damage: number;
  damageBy: Record<'bossGenerator' | 'crewGenerator' | 'convoy' | 'stage' | 'melee' | 'own', number>;
  /** Blast hits that landed on the boss (bossHit events plus the finishing blast). */
  bossHits: number;
  exposures: number;
  /** Windows that ran out (the boss re-shielded and the phase was rebuilt). */
  windowsMissed: number;
  /** Seconds the boss was exposed, and of those on his anchor (restoring: a generator beside him lands). */
  exposedSec: number;
  restoringSec: number;
  phasesCleared: number;
  /** Seconds each objective phase took to break, in order (a rebuilt phase counts again). */
  phaseSec: number[];
  placed: number;
  placedOnBoss: number;
  /** Events the HUD saw (correctness checks). */
  /** Seconds the SHIELDED boss spent more than 5 tiles (Chebyshev) from his post, and generators he laid within 3 tiles
   * (Manhattan) of the living player, of all he laid. */
  bossAwaySec: number;
  bossGensNearPlayer: number;
  bossGens: number;
  /** Close attacks of the boss / crew that landed on the player, and the shortest wind-up of any started on him (ticks). */
  meleeOnPlayer: number;
  shortestWindup: number | null;
  /** Generators the player laid with the exposed boss in their footprint, and how many of them cost him a hit. */
  aimedAtBoss: number;
  aimedLanded: number;
  defeatedEvents: number;
  outcomeEvents: number;
}

/** Plays one boss mission as `CampaignController.startMission` builds it and reports what happened. */
export function runBossMeasure(o: BossMeasureOptions): BossMeasureResult {
  const options = buildMissionGame({
    spec: { id: o.id, modifiers: [], difficulty: o.difficulty ?? 'rookie', lives: 3 },
    humanCharacter: 'streetBaller',
    seed: o.seed,
    level: o.level,
  });
  const state = createGame(options);
  const bots: Record<number, Bot> = {};
  options.players.forEach((p, i) => {
    if (p.isBot)
      bots[i] = createBot({
        difficulty: p.difficulty ?? 'rookie',
        seed: o.seed * 7919 + i * 104729 + 17,
        playerId: i,
      });
  });
  const human = new BossHuman(o.human ?? BOSS_HUMAN);
  const bossId = state.mission!.bossId;
  const res: BossMeasureResult = {
    id: o.id,
    level: o.level,
    seed: o.seed,
    result: 'unfinished',
    seconds: 0,
    deaths: 0,
    damage: 0,
    damageBy: { bossGenerator: 0, crewGenerator: 0, convoy: 0, stage: 0, melee: 0, own: 0 },
    bossHits: 0,
    exposures: 0,
    windowsMissed: 0,
    exposedSec: 0,
    restoringSec: 0,
    phasesCleared: 0,
    phaseSec: [],
    placed: 0,
    placedOnBoss: 0,
    bossAwaySec: 0,
    bossGensNearPlayer: 0,
    bossGens: 0,
    meleeOnPlayer: 0,
    shortestWindup: null,
    aimedAtBoss: 0,
    aimedLanded: 0,
    defeatedEvents: 0,
    outcomeEvents: 0,
  };
  let exposedTicks = 0;
  let restoringTicks = 0;
  let phaseStart = -1;
  let awayTicks = 0;
  const aimed = new Set<number>();
  const maxTicks = (o.maxSec ?? 100000) * 60;
  for (let i = 0; i < maxTicks && state.match.phase !== 'ended'; i++) {
    const intents: Intents = {};
    for (const [id, bot] of Object.entries(bots)) {
      const n = Number(id);
      if (state.players[n]!.alive) intents[n] = bot.decide(observe(state, n));
    }
    intents[0] = human.decide(state);
    // the flames standing before this tick (who set them) for the damage attribution
    const events = tick(state, intents);
    for (const e of events) {
      if (e.type === 'bossExposed') res.exposures++;
      else if (e.type === 'bossHit') res.bossHits++;
      else if (e.type === 'bossShielded' && e.reason === 'expired') res.windowsMissed++;
      else if (e.type === 'bossDefeated') res.defeatedEvents++;
      else if (e.type === 'missionOutcome') res.outcomeEvents++;
      else if (e.type === 'missionPhase' && e.change === 'started') phaseStart = state.tick;
      else if (e.type === 'missionPhase' && e.change === 'cleared' && phaseStart >= 0)
        res.phaseSec.push(Math.round((state.tick - phaseStart) / 6) / 10);
      else if (e.type === 'generatorPlaced') {
        const me = state.players[0]!;
        const boss = state.players[bossId]!;
        if (e.ownerId === bossId) {
          res.bossGens++;
          if (me.alive && Math.abs(e.x - me.x) + Math.abs(e.y - me.y) <= 3) res.bossGensNearPlayer++;
        }
        const g = state.generators.find((q) => q.id === e.generatorId);
        if (e.ownerId === 0 && g && state.mission!.phaseState === 'exposed' && boss.alive) {
          if (previewBlast(state, g).has(boss.y * state.width + boss.x)) {
            res.aimedAtBoss++;
            aimed.add(g.id);
          }
        }
      } else if (e.type === 'generatorExploded' && aimed.delete(e.generatorId)) {
        if (events.some((q) => q.type === 'bossHit' || q.type === 'bossDefeated')) res.aimedLanded++;
      } else if (e.type === 'attackStarted' && e.targetId === 0)
        res.shortestWindup = Math.min(res.shortestWindup ?? Infinity, e.resolveTick - state.tick);
      else if (e.type === 'attackResolved' && e.targetId === 0 && e.hit) res.meleeOnPlayer++;
      else if (e.type === 'campaignHit' && e.victimId === 0 && e.damage > 0) {
        res.damage += e.damage;
        res.damageBy[causeOf(state, e, bossId)] += e.damage;
      }
    }
    const v = state.mission!;
    {
      const b = state.players[bossId]!;
      const post = v.seats[bossId]!.post!;
      if (v.boss.shielded && b.alive && cheb(b.x, b.y, post.x, post.y) > 5) awayTicks++;
    }
    if (v.phaseState === 'exposed') {
      exposedTicks++;
      const b = state.players[bossId]!;
      if (
        v.boss.anchor &&
        b.alive &&
        cheb(b.x, b.y, v.boss.anchor.x, v.boss.anchor.y) <= (v.tuning.boss?.restoreRadius ?? 0)
      )
        restoringTicks++;
    }
    o.onTick?.(state, events);
  }
  const m = state.mission!;
  if (m.boss.defeated) res.bossHits++;
  res.result = m.outcome?.result ?? 'unfinished';
  res.seconds = Math.round(state.match.playTicks / 60);
  res.deaths = m.livesUsed;
  res.exposedSec = Math.round(exposedTicks / 6) / 10;
  res.restoringSec = Math.round(restoringTicks / 6) / 10;
  res.bossAwaySec = Math.round(awayTicks / 6) / 10;
  res.phasesCleared = m.phasesCleared;
  res.placed = human.placed;
  res.placedOnBoss = human.placedOnBoss;
  return res;
}

/** Who hurt the human: a landed convoy strike, the boss's / a crew member's / its own generator, a stage hazard, melee. */
function causeOf(
  s: GameState,
  e: Extract<SimEvent, { type: 'campaignHit' }>,
  bossId: number,
): keyof BossMeasureResult['damageBy'] {
  if (e.source === 'vehicle' || e.source === 'hazard' || e.source === 'trap') return 'stage';
  if (e.source !== 'blast') return 'melee';
  const i = e.y * s.width + e.x;
  if (s.mission?.strikes.some((st) => st.landed && st.tiles.includes(i))) return 'convoy';
  const f = s.flames.find((q) => q.x === e.x && q.y === e.y);
  if (f && f.genId === -1) return f.ownerId === bossId ? 'convoy' : 'stage';
  if (e.byId === 0) return 'own';
  if (e.byId === bossId) return 'bossGenerator';
  return 'crewGenerator';
}
