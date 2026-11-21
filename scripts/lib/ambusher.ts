/**
 * THE AMBUSHER (docs/CLASSIC_RAID_COMBAT.md, acceptance test F): a scripted player who plays a Classic raid the way
 * the founder wants to: watch a guard walk its route, learn where it will be, plant a generator out of its sight so
 * that it walks into the lane late in the fuse, retreat off its path and let the blast do the work. Deterministic, and
 * held to a player's limits:
 *
 * - it sees what the screen shows: the enemies' tiles and whether they are hunting him (the "!" / walk), its own
 *   generators; never the AI's memory, its generator awareness, the RNG or a simulation of the future;
 * - it LEARNS a route only by watching: a guard's tiles and how long it spent on each, until the same lap has been seen
 *   twice (a loop, a beat or a post); a chase wipes what it learned about that guard;
 * - it decides every `DECIDE_EVERY` ticks (about five times a second), walks at its own speed, and keeps `NOTICE`
 *   tiles from a calm guard's line of sight while it plants (a player learns roughly how far guards look);
 * - its timing rule of thumb is a player's: the guard should step into the lane in the last `LATE` ticks of the fuse
 *   (a generator lying in its way for longer would be seen).
 *
 * Hunted (an enemy in `alert` / `pursue` within 6 walking steps) or punched at, it defends itself like the fair-fight
 * scripted human (`FairHuman`); with nothing to ambush it works the raid's objective the same way.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import {
  DIRS,
  DIR_VEC,
  buildRaidGame,
  campaignEnemyLevel,
  canSeeTile,
  createGame,
  observe,
  playerStepTicks,
  tick,
} from '../../src/sim';
import type { CampaignLevel, Dir, GameState, Intent, Intents, RaidId, SimEvent } from '../../src/sim';
import { RAID_TUNING } from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { FAIR_HUMAN, FairHuman, HZ, nextCrate, walkSteps } from './fairHuman';

export const DECIDE_EVERY = 12;
/** Why plans were turned down (debugging the agent itself). */
/** The misses (where the guard was instead), for tuning the agent itself. */
export const misses: string[] = [];
export const reject = { unlearned: 0, hit: 0, late: 0, seen: 0, walk: 0, escape: 0 };
export const NOTICE = 4;
export const LATE = 75;
/** The longest it waits in all to learn routes before working the objective regardless (25 s). */
export const WATCH_TICKS = 1500;
/** A guard that has not left its tile for this long is at a post (2 s). */
export const POST_TICKS = 120;
/** How long it waits for an ambush window on a learned guard before working the objective for as long again (8 s). */
export const PATIENCE_TICKS = 480;
const CALM = new Set(['patrol', 'watch', 'return']);
const HUNTING = new Set(['alert', 'pursue']);
const ORDINARY = new Set(['agbero', 'guard', 'thrower', 'heavy']);

interface Visit {
  tile: number;
  arrive: number;
  leave: number;
}

/** What the player learned of each guard by watching it. */
export class RouteLearner {
  readonly visits = new Map<number, Visit[]>();

  observe(s: GameState): void {
    this.now = s.tick;
    const w = s.width;
    for (const [key, m] of Object.entries(s.territory?.minds ?? {})) {
      const p = s.players[Number(key)]!;
      if (!p.alive || !CALM.has(m.state)) {
        this.visits.delete(p.id);
        continue;
      }
      const tile = p.y * w + p.x;
      const v = this.visits.get(p.id) ?? [];
      const last = v[v.length - 1];
      if (!last || last.tile !== tile) {
        if (last) last.leave = s.tick;
        v.push({ tile, arrive: s.tick, leave: -1 });
        if (v.length > 200) v.splice(0, v.length - 200);
        this.visits.set(p.id, v);
      }
    }
  }

  /** The tick of the last observation (a guard standing on one tile this long is at a post). */
  now = 0;

  /** The guard's lap once seen twice: its tiles (the current one last) and the time spent on each. */
  cycle(id: number): { tiles: number[]; dwell: number[] } | null {
    const v = this.visits.get(id);
    if (!v || v.length === 0) return null;
    // a post: it has stood on its tile for 2 s; it will stand there
    const cur = v[v.length - 1]!;
    if (this.now - cur.arrive >= POST_TICKS) return { tiles: [cur.tile], dwell: [1e6] };
    if (v.length < 5) return null;
    const n = v.length;
    for (let P = 2; 2 * P + 1 <= n; P++) {
      let ok = true;
      for (let k = 0; k <= P && ok; k++) ok = v[n - 1 - k]!.tile === v[n - 1 - k - P]!.tile;
      if (!ok) continue;
      const tiles: number[] = [];
      const dwell: number[] = [];
      for (let j = 0; j < P; j++) {
        tiles.push(v[n - P + j]!.tile);
        const prev = v[n - 2 * P + j]!;
        dwell.push(prev.leave - prev.arrive);
      }
      return { tiles, dwell };
    }
    return null;
  }

  /** Where the guard will be: occupancy windows from now to `until`, from the learned lap. */
  predict(id: number, until: number): { tile: number; from: number; to: number }[] | null {
    const c = this.cycle(id);
    const v = this.visits.get(id);
    if (!c || !v) return null;
    const P = c.tiles.length;
    const out: { tile: number; from: number; to: number }[] = [];
    let t = v[v.length - 1]!.arrive;
    let j = P - 1;
    while (t < until && out.length < 400) {
      const d = Math.max(1, c.dwell[j]!);
      out.push({ tile: c.tiles[j]!, from: t, to: t + d });
      t += d;
      j = (j + 1) % P;
    }
    return out;
  }
}

export interface AmbushStats {
  won: boolean;
  outcome: string;
  seconds: number;
  /** Generators planted by the ambush plan, the ones whose blast hurt their guard, and the guards it killed. */
  ambushes: number;
  ambushHits: number;
  ambushKills: number;
  /** Enemies killed by any of the human's blasts / by his punches. */
  blastKills: number;
  punchKills: number;
  damageTaken: number;
  /** Damage from its own blasts (included in `damageTaken`). */
  selfDamage: number;
  deaths: number;
  /** Enemy punches started on the human, and the ones that landed. */
  punchesOnHim: number;
  punchesLanded: number;
  /** Most ordinary enemies hunting him at once; the share of time none was. */
  maxChasers: number;
  freeShare: number;
  /** Mean length (s) of the spells with no enemy hunting him: the time he has to set something up. */
  meanFreeSpell: number;
  /** Hunts that ended without the hunter being killed (it gave up / lost him). */
  disengagements: number;
}

interface Plan {
  enemy: number;
  place: number;
  safe: number;
  cross: Set<number>;
  phase: 'goto' | 'retreat' | 'wait';
  generator: number | null;
  hpBefore: number;
  until: number;
  /** Where the learned lap puts the guard when it blows (for the misses' report). */
  expected: number;
}

export function playRaidAmbush(o: {
  raidId: RaidId;
  seed: number;
  level: CampaignLevel;
  onTick?: (s: GameState, events: SimEvent[]) => void;
}): AmbushStats {
  const difficulty = campaignEnemyLevel(o.level);
  const s = createGame(
    buildRaidGame({
      raidId: o.raidId,
      humanCharacter: 'streetBaller',
      seed: o.seed,
      difficulty,
      level: o.level,
    }),
  );
  const bots: Record<number, Bot> = {};
  s.players.slice(1).forEach((p, i) => {
    bots[p.id] = createBot({ difficulty, seed: o.seed + (i + 1) * 7919, playerId: p.id });
  });
  const human = new FairHuman({ ...FAIR_HUMAN, approach: false });
  // with nothing left to ambush and a door that needs a wave cleared, it goes after the enemies like a fighter
  const hunter = new FairHuman({ ...FAIR_HUMAN, approach: true });
  const learner = new RouteLearner();
  const w = s.width;
  const st: AmbushStats = {
    won: false,
    outcome: 'timeout',
    seconds: 0,
    ambushes: 0,
    ambushHits: 0,
    ambushKills: 0,
    blastKills: 0,
    punchKills: 0,
    damageTaken: 0,
    selfDamage: 0,
    deaths: 0,
    punchesOnHim: 0,
    punchesLanded: 0,
    maxChasers: 0,
    freeShare: 0,
    meanFreeSpell: 0,
    disengagements: 0,
  };
  let plan: Plan | null = null;
  let watched = 0;
  let patience = 0;
  let freeTicks = 0;
  let ticks = 0;
  const spells: number[] = [];
  let spell = 0;
  const hunting = new Set<number>();
  const limit = (s.raid!.timeLimitTicks + 600) | 0;

  // ---------------------------------------------------------------- the board as the player reads it

  const open = (i: number): boolean =>
    s.tiles[i] === Tile.Empty && !s.generators.some((g) => g.y * w + g.x === i && g.flight === null);
  const neighbours = (i: number): number[] => {
    const out: number[] = [];
    for (const d of DIRS) {
      const x = (i % w) + DIR_VEC[d].dx;
      const y = Math.floor(i / w) + DIR_VEC[d].dy;
      if (x >= 0 && y >= 0 && x < s.width && y < s.height) out.push(y * w + x);
    }
    return out;
  };
  const crossOf = (i: number): Set<number> => {
    const me = s.players[0]!;
    const out = new Set<number>([i]);
    for (const d of DIRS) {
      for (let k = 1; k <= me.range; k++) {
        const x = (i % w) + DIR_VEC[d].dx * k;
        const y = Math.floor(i / w) + DIR_VEC[d].dy * k;
        if (x < 0 || y < 0 || x >= s.width || y >= s.height) break;
        const t = s.tiles[y * w + x];
        if (t === Tile.Hard) break;
        out.add(y * w + x);
        if (t !== Tile.Empty) break;
      }
    }
    return out;
  };
  /** Tiles burning now or under a live generator's cross (the danger the player sees). */
  const dangerTiles = (): Set<number> => {
    const out = new Set<number>();
    for (const f of s.flames) out.add(f.y * w + f.x);
    for (const g of s.generators) for (const i of crossOf(g.y * w + g.x)) out.add(i);
    return out;
  };
  /** Walking distances from `from` over open, non-dangerous tiles away from enemies (BFS), up to `max` steps. */
  const walk = (from: number, max: number, avoid: Set<number>): Map<number, { d: number; prev: number }> => {
    const out = new Map<number, { d: number; prev: number }>([[from, { d: 0, prev: -1 }]]);
    let frontier = [from];
    for (let d = 1; d <= max && frontier.length; d++) {
      const next: number[] = [];
      for (const u of frontier)
        for (const v of neighbours(u)) {
          if (out.has(v) || !open(v) || avoid.has(v)) continue;
          out.set(v, { d, prev: u });
          next.push(v);
        }
      frontier = next;
    }
    return out;
  };
  const firstStep = (
    paths: Map<number, { d: number; prev: number }>,
    from: number,
    to: number,
  ): Dir | null => {
    let u = to;
    while (paths.get(u) && paths.get(u)!.prev !== from && paths.get(u)!.prev !== -1) u = paths.get(u)!.prev;
    if (!paths.get(u) || paths.get(u)!.prev !== from) return null;
    for (const d of DIRS) if (from + DIR_VEC[d].dx + DIR_VEC[d].dy * w === u) return d;
    return null;
  };
  const enemiesNear = (radius: number): Set<number> => {
    const out = new Set<number>();
    for (const p of s.players)
      if (p.alive && p.enemyKind !== undefined)
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            const x = p.x + dx;
            const y = p.y + dy;
            if (x >= 0 && y >= 0 && x < s.width && y < s.height) out.add(y * w + x);
          }
    return out;
  };

  /** The first step towards the nearest tile at least 6 steps from every hunter and out of their sight, or null. */
  const evade = (hunters: typeof s.players): Intent | null => {
    const me = s.players[0]!;
    const here = me.y * w + me.x;
    const danger = dangerTiles();
    const paths = walk(here, 14, new Set([...danger, ...enemiesNear(1)]));
    const dist = hunters.map((h) => walk(h.y * w + h.x, 30, new Set()));
    let best = -1;
    let bd = Infinity;
    for (const [i, r] of paths) {
      if (i === here || danger.has(i)) continue;
      const far = dist.every((d) => (d.get(i)?.d ?? 99) >= 6);
      const hidden = hunters.every((h) => !canSeeTile(s, h.x, h.y, i % w, Math.floor(i / w), 8, new Set()));
      if (far && hidden && r.d < bd) {
        best = i;
        bd = r.d;
      }
    }
    if (best < 0) return null;
    const d = firstStep(paths, here, best);
    return d ? { move: d } : null;
  };

  // ---------------------------------------------------------------- the plan

  const findPlan = (): Plan | null => {
    const me = s.players[0]!;
    if (s.generators.some((g) => g.ownerId === 0)) return null;
    const here = me.y * w + me.x;
    const step = playerStepTicks(s, me);
    const fuse = s.config.generator.fuseTicks;
    const flame = s.config.generator.flameTicks;
    // the guards whose rounds it has learned are judged by where they WILL be along its walk; the others by where
    // they are (it keeps two tiles from them)
    const horizon = s.tick + 20 * step + fuse + flame + 120;
    const known = new Map<number, { tile: number; from: number; to: number }[]>();
    for (const p of s.players)
      if (p.alive && p.enemyKind !== undefined) {
        const occ = learner.predict(p.id, horizon);
        if (occ) known.set(p.id, occ);
      }
    const avoid = new Set(dangerTiles());
    for (const p of s.players)
      if (p.alive && p.enemyKind !== undefined && !known.has(p.id))
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) avoid.add((p.y + dy) * w + p.x + dx);
    avoid.delete(here);
    const reach = walk(here, 20, avoid);
    /** Its walk to `P` keeps 3 tiles (Manhattan) from every learned guard at the moment it passes. */
    const walkClear = (P: number): boolean => {
      const path: number[] = [];
      for (let u = P; u !== here && u >= 0; u = reach.get(u)!.prev) path.push(u);
      path.reverse();
      return path.every((tile, k) => {
        const t = s.tick + (k + 1) * step;
        for (const occ of known.values()) {
          const q = occ.find((o) => o.from <= t && o.to > t);
          if (
            q &&
            Math.abs((q.tile % w) - (tile % w)) + Math.abs(Math.floor(q.tile / w) - Math.floor(tile / w)) < 3
          )
            return false;
        }
        return true;
      });
    };
    let best: (Plan & { at: number }) | null = null;
    for (const p of s.players) {
      if (!p.alive || p.enemyKind === undefined) continue;
      const occ = known.get(p.id);
      if (!occ) {
        reject.unlearned++;
        continue;
      }
      for (const [P, r] of reach) {
        if (P === here && r.d === 0 && me.stepRemaining > 0) continue;
        const ta = s.tick + r.d * step + 8;
        const tb = ta + fuse;
        const te = tb + flame;
        const cross = crossOf(P);
        if (!occ.some((q) => cross.has(q.tile) && q.from <= tb - 3 && q.to > tb + 2)) {
          reject.hit++;
          continue;
        }
        // it walks into the lane late in the fuse (a generator in its way for longer would be seen)
        const firstIn = occ.filter((q) => cross.has(q.tile) && q.to > ta).map((q) => q.from);
        if (firstIn.length === 0 || Math.min(...firstIn) < tb - LATE) {
          reject.late++;
          continue;
        }
        // planted out of its sight
        const at = occ.find((q) => q.from <= ta && q.to > ta);
        if (at) {
          const ex = at.tile % w;
          const ey = Math.floor(at.tile / w);
          const px = P % w;
          const py = Math.floor(P / w);
          if (
            Math.abs(ex - px) + Math.abs(ey - py) <= NOTICE &&
            canSeeTile(s, ex, ey, px, py, NOTICE, new Set())
          ) {
            reject.seen++;
            continue;
          }
        }
        if (!walkClear(P)) {
          reject.walk++;
          continue;
        }
        // a way out of the cross, to a tile off its path
        const near = new Set<number>();
        for (const q of occ)
          if (q.to > ta && q.from < te + 60) for (const n of [q.tile, ...neighbours(q.tile)]) near.add(n);
        const out = walk(P, Math.floor((fuse - 60) / step), new Set(dangerTiles()));
        let safe = -1;
        let sd = Infinity;
        for (const [S, q] of out)
          if (!cross.has(S) && !near.has(S) && q.d < sd) {
            safe = S;
            sd = q.d;
          }
        if (safe < 0) {
          reject.escape++;
          continue;
        }
        if (!best || tb < best.at)
          best = {
            enemy: p.id,
            place: P,
            safe,
            cross,
            phase: 'goto',
            generator: null,
            hpBefore: p.vitals?.hp ?? 0,
            until: tb + flame + 30,
            expected: occ.find((q) => cross.has(q.tile) && q.from <= tb - 3 && q.to > tb + 2)!.tile,
            at: tb,
          };
      }
    }
    if (!best) return null;
    const { at: _at, ...plan } = best;
    void _at;
    return plan;
  };

  const followPlan = (): Intent | null => {
    const me = s.players[0]!;
    const here = me.y * w + me.x;
    if (!plan) return null;
    if (me.stepRemaining > 1) return {};
    if (plan.phase === 'goto') {
      if (here === plan.place) {
        // the drop is timed from here, with what it sees now: it waits for the moment the lap brings the guard into
        // the lane as the fuse ends, or gives the plan up when that moment has passed
        const fuse = s.config.generator.fuseTicks;
        const flame = s.config.generator.flameTicks;
        const tb = s.tick + fuse;
        const occ = learner.predict(plan.enemy, tb + flame + 60) ?? [];
        const lands = occ.some((q) => plan!.cross.has(q.tile) && q.from <= tb - 3 && q.to > tb + 2);
        const firstIn = occ.filter((q) => plan!.cross.has(q.tile) && q.to > s.tick).map((q) => q.from);
        const lateEnough = firstIn.length > 0 && Math.min(...firstIn) >= tb - LATE;
        if (!(lands && lateEnough)) {
          if (s.tick < plan.until - flame - 30 - fuse) return {}; // early: wait for the moment
          plan = null;
          return null;
        }
        plan.phase = 'retreat';
        st.ambushes++;
        return { place: true };
      }
      const avoid = new Set([...dangerTiles(), ...enemiesNear(1)]);
      const paths = walk(here, 20, avoid);
      const d = paths.has(plan.place) ? firstStep(paths, here, plan.place) : null;
      if (!d) {
        plan = null;
        return null;
      }
      return { move: d };
    }
    if (plan.phase === 'retreat') {
      if (plan.generator === null) {
        const g = s.generators.find((q) => q.ownerId === 0);
        if (g) plan.generator = g.id;
      }
      if (here === plan.safe) {
        plan.phase = 'wait';
        return {};
      }
      const avoid = new Set(s.flames.map((f) => f.y * w + f.x));
      const paths = walk(here, 20, avoid);
      const d = paths.has(plan.safe) ? firstStep(paths, here, plan.safe) : null;
      return d ? { move: d } : {};
    }
    return {};
  };

  // ---------------------------------------------------------------- the match

  for (let t = 0; t < limit && !s.raid!.outcome && s.match.phase !== 'ended'; t++) {
    const me = s.players[0]!;
    learner.observe(s);
    const steps = walk(me.y * w + me.x, 6, new Set());
    const threats = s.players.filter(
      (p) =>
        p.alive &&
        p.enemyKind !== undefined &&
        steps.has(p.y * w + p.x) &&
        (HUNTING.has(s.territory?.minds[p.id]?.state ?? '') ||
          (p.attack !== null && p.attack.targetId === 0)),
    );
    let intent: Intent;
    if (!me.alive || s.match.phase !== 'playing') intent = {};
    else if (plan && plan.phase !== 'goto') intent = followPlan() ?? {};
    else if (threats.length > 0) {
      plan = null;
      // hunted: break contact. At arm's length it defends itself (sidesteps a wind-up, lays a generator with a way
      // out, punches back) like the fair-fight player; otherwise it walks away to a tile out of the hunters' sight
      const close = threats.some((p) => Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 2);
      const away = close ? null : evade(threats);
      intent =
        away ??
        human.decide(
          s,
          threats.map((p) => p.y * w + p.x),
          null,
        );
    } else {
      if (!plan && t % DECIDE_EVERY === 0) plan = findPlan();
      const f = plan ? followPlan() : null;
      // still learning a calm guard's route: wait and watch (out of danger), at most `WATCH_TICKS` in all
      // (the first waves are still arriving during the opening seconds: nothing to learn yet, it waits for them)
      const learning =
        watched < WATCH_TICKS &&
        (s.tick < RAID_TUNING.spawnWarnTicks + 120 ||
          s.players.some(
            (p) =>
              p.alive &&
              ORDINARY.has(p.enemyKind ?? '') &&
              CALM.has(s.territory?.minds[p.id]?.state ?? '') &&
              learner.cycle(p.id) === null,
          ));
      // a learned guard on its rounds: a patient player waits (out of danger) for the next ambush window, at most a lap
      const target = s.players.some((p) => {
        const c =
          p.alive && ORDINARY.has(p.enemyKind ?? '') && CALM.has(s.territory?.minds[p.id]?.state ?? '')
            ? learner.cycle(p.id)
            : null;
        return c !== null && c.tiles.length > 1;
      });
      if (f) {
        intent = f;
        patience = 0;
      } else if (learning && !dangerTiles().has(me.y * w + me.x)) {
        watched++;
        intent = {};
      } else if (
        target &&
        patience >= 0 &&
        patience < PATIENCE_TICKS &&
        !dangerTiles().has(me.y * w + me.x)
      ) {
        patience++;
        intent = {};
      } else {
        // after waiting a lap in vain it works the objective for as long, then looks again
        if (patience >= PATIENCE_TICKS) patience = -PATIENCE_TICKS;
        else if (patience < 0) patience++;
        // nothing to ambush now: work the raid as the fair-fight player does (the crate in the way of the nearest
        // marked cargo, then the exit; with a door still closed and nothing to blast, it goes after an enemy)
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
        const crate = marked.map((m) => nextCrate(s, m)).find((c) => c !== null);
        const exit = r.extraction.y * w + r.extraction.x;
        if (crate !== undefined && crate !== null) intent = human.decide(s, [crate], null);
        else if (r.extraction.open && walkSteps(s, me.x, me.y, 99).has(exit))
          intent = human.decide(s, [], exit);
        else
          intent = hunter.decide(
            s,
            s.players.filter((p) => p.alive && p.enemyKind !== undefined).map((p) => p.y * w + p.x),
            null,
          );
      }
    }
    const intents: Intents = { 0: intent };
    for (const [id, bot] of Object.entries(bots))
      if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
    const hpBefore = new Map(s.players.map((p) => [p.id, p.vitals?.hp ?? 0]));
    const aliveBefore = new Map(s.players.map((p) => [p.id, p.alive]));
    const events = tick(s, intents);

    // ---------------------------------------------------------------- measurement
    for (const e of events) {
      if (e.type === 'attackStarted' && e.targetId === 0 && s.players[e.playerId]?.enemyKind !== undefined)
        st.punchesOnHim++;
      if (
        e.type === 'attackResolved' &&
        e.targetId === 0 &&
        e.hit &&
        s.players[e.playerId]?.enemyKind !== undefined
      )
        st.punchesLanded++;
      if (
        e.type === 'campaignHit' &&
        e.victimId === 0 &&
        (e.result === 'damaged' || e.result === 'defeated')
      ) {
        st.damageTaken += e.damage;
        if (e.byId === 0) st.selfDamage += e.damage;
      }
      if (e.type === 'campaignHit' && e.victimId !== 0 && e.byId === 0 && e.result === 'defeated') {
        if (e.source === 'blast') st.blastKills++;
        else st.punchKills++;
      }
    }
    if (aliveBefore.get(0) && !s.players[0]!.alive) st.deaths++;
    if (plan && plan.generator !== null && !s.generators.some((g) => g.id === plan!.generator)) {
      // the planted generator went off: did its guard take it?
      const target = s.players[plan.enemy]!;
      if ((target.vitals?.hp ?? 0) < plan.hpBefore || (aliveBefore.get(target.id) && !target.alive))
        st.ambushHits++;
      if (!target.alive) st.ambushKills++;
      else
        misses.push(
          `${o.raidId}/${o.level} t${s.tick} expected ${plan.expected % w},${Math.floor(plan.expected / w)} actual ${target.x},${target.y} ${s.territory?.minds[target.id]?.state}`,
        );
      plan = null;
    } else if (plan && s.tick > plan.until) plan = null;
    void hpBefore;

    let chasers = 0;
    let any = false;
    for (const [key, m] of Object.entries(s.territory?.minds ?? {})) {
      const p = s.players[Number(key)]!;
      const hunt = p.alive && HUNTING.has(m.state);
      if (hunt) any = true;
      if (hunt && ORDINARY.has(p.enemyKind ?? '')) chasers++;
      if (hunt) hunting.add(p.id);
      else if (hunting.has(p.id)) {
        hunting.delete(p.id);
        if (p.alive) st.disengagements++;
      }
    }
    st.maxChasers = Math.max(st.maxChasers, chasers);
    ticks++;
    if (!any) {
      freeTicks++;
      spell++;
    } else if (spell > 0) {
      spells.push(spell);
      spell = 0;
    }
    o.onTick?.(s, events);
  }
  if (spell > 0) spells.push(spell);
  st.seconds = s.tick / HZ;
  st.won = s.raid!.outcome?.result === 'completed';
  st.outcome = s.raid!.outcome?.result ?? 'timeout';
  st.freeShare = ticks ? freeTicks / ticks : 0;
  st.meanFreeSpell = spells.length ? spells.reduce((a, b) => a + b, 0) / spells.length / HZ : 0;
  return st;
}
