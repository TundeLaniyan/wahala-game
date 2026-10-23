/**
 * The bot's per-tick controller. It keeps a danger map of the visible world, re-plans on a
 * difficulty-dependent cadence (or after a reaction delay when something new appears), follows the
 * current plan step by step, vetoes any step that the freshest map says is lethal, and layers the
 * tactical one-shots (skills, remote, kill switch, vehicle) on top.
 */
import { createRng, nextInt } from '../sim';
import type { Dir, Intent, Observation, RngHolder } from '../sim';
import { checkPlacement, computeHuntField, extractPlan } from './analysis';
import { dirIndex, getBoard } from './board';
import { createCtx } from './context';
import type { Ctx } from './context';
import { canPlaceNow, chooseGamble, chooseGoal, lastResort, placementGain, robust } from './goals';
import type { Plan } from './goals';
import type { AiProfile } from './profiles';
import { Tactics } from './tactics';
import { searchSlots } from './analysis';
import {
  GEN_WATCH_RADIUS,
  LARGE_CAREFUL_RIVALS,
  LARGE_MIN_THINK,
  LARGE_THINKS_PER_TICK,
  WATCH_RADIUS,
} from './scale';
import { aiCounters } from './stats';
import { largeHuntPace, updateZone } from './zone';
import { readyTick, stepTicksOf } from './world';
import type { Bot } from './types';

function signature(obs: Observation): number {
  let h =
    obs.generators.length * 1009 +
    obs.flames.length * 131 +
    obs.vehicles.length * 977 +
    obs.pickups.length * 7;
  for (const g of obs.generators) {
    h = (h * 31 + g.x * 17 + g.y * 5 + g.id + (g.carriedBy ?? -1) * 3 + (g.triggered ? 1 : 0)) | 0;
    h = (h * 31 + (g.mode === 'timed' ? 1 : g.mode === 'remote' ? 2 : 3)) | 0;
  }
  for (const v of obs.vehicles)
    h = (h * 31 + v.id * 13 + (v.phase === 'warning' ? 1 : v.phase === 'driving' ? 2 : 3)) | 0;
  if (obs.crush) h = (h * 31 + obs.crush.pending.length * 7 + obs.crush.next) | 0;
  if (obs.crowd) h = (h * 31 + obs.crowd.throws.length) | 0;
  for (const e of obs.stage.events) h = (h * 31 + e.id * 7 + (e.index + 1)) | 0;
  return h;
}

/**
 * Large boards: the same idea restricted to what is near this bot (scale.ts). Far-away blasts, crates
 * and closing tiles do not make it rebuild its danger map or re-plan; it notices them once they come
 * within the watch window, which is wider than any blast that could reach it from outside.
 */
function localSignature(obs: Observation, me: Readonly<{ x: number; y: number }>): number {
  const inWin = (x: number, y: number, r: number): boolean =>
    Math.abs(x - me.x) <= r && Math.abs(y - me.y) <= r;
  let h = obs.vehicles.length * 977;
  let gens = 0;
  for (const g of obs.generators) {
    if (!inWin(g.x, g.y, GEN_WATCH_RADIUS)) continue;
    gens++;
    h = (h * 31 + g.x * 17 + g.y * 5 + g.id + (g.carriedBy ?? -1) * 3 + (g.triggered ? 1 : 0)) | 0;
    h = (h * 31 + (g.mode === 'timed' ? 1 : g.mode === 'remote' ? 2 : 3)) | 0;
  }
  let flames = 0;
  for (const f of obs.flames) if (inWin(f.x, f.y, WATCH_RADIUS)) flames++;
  let pickups = 0;
  for (const u of obs.pickups) if (inWin(u.x, u.y, WATCH_RADIUS)) pickups++;
  h = (h * 31 + gens * 1009 + flames * 131 + pickups * 7) | 0;
  for (const v of obs.vehicles)
    h = (h * 31 + v.id * 13 + (v.phase === 'warning' ? 1 : v.phase === 'driving' ? 2 : 3)) | 0;
  if (obs.crush) {
    const w = obs.width;
    let near = 0;
    for (const p of obs.crush.pending) if (inWin(p.index % w, Math.floor(p.index / w), WATCH_RADIUS)) near++;
    h = (h * 31 + near * 7) | 0;
  }
  if (obs.crowd) h = (h * 31 + obs.crowd.throws.length) | 0;
  for (const e of obs.stage.events) h = (h * 31 + e.id * 7 + (e.index + 1)) | 0;
  return h;
}

/**
 * Routine re-plans allowed per tick on a large board, shared by all bots observing the same match
 * (keyed by the match's live player array). Bots decide in player-id order, so which bot gets a slot
 * is deterministic.
 */
const thinkSlots = new WeakMap<object, { tick: number; used: number }>();

function takeThinkSlot(obs: Observation): boolean {
  let slot = thinkSlots.get(obs.players);
  if (!slot) {
    slot = { tick: -1, used: 0 };
    thinkSlots.set(obs.players, slot);
  }
  if (slot.tick !== obs.tick) {
    slot.tick = obs.tick;
    slot.used = 0;
  }
  if (slot.used >= LARGE_THINKS_PER_TICK) return false;
  slot.used++;
  return true;
}

/** Does any rival currently own an armed Remote Starter generator? */
function enemyRemote(obs: Observation): boolean {
  return obs.generators.some((g) => g.mode === 'remote' && g.ownerId !== obs.selfId);
}

export class Brain implements Bot {
  private ctx: Ctx | null = null;
  private plan: Plan | null = null;
  private progress = 0;
  private nextThink = 0;
  private sig = Number.NaN;
  private reactAt = -1;
  private prevGoal = -1;
  /** Set by the tactics layer / guard to force an immediate re-plan. */
  private rethinkNow = false;
  private readonly rng: RngHolder;
  private readonly tactics = new Tactics();

  constructor(
    private readonly profile: AiProfile,
    seed: number,
    private readonly playerId: number,
  ) {
    this.rng = createRng(seed ^ 0x9e3779b1 ^ (playerId * 0x85ebca6b));
  }

  decide(obs: Observation): Intent {
    const me = obs.players[this.playerId];
    if (!me || !me.alive || obs.match.phase !== 'playing') {
      this.plan = null;
      // allocate the search buffers during the countdown, not on the first tick of play
      if (me?.alive && obs.match.phase === 'countdown') this.context(obs).world.refresh(obs, this.profile);
      return {};
    }
    const c = this.context(obs);
    const { world, profile } = c;
    world.refresh(obs, profile);
    const T = obs.tick;

    // ---- keep the danger map current; schedule a delayed reaction to anything new
    const sig = world.large ? localSignature(obs, world.me) : signature(obs);
    let rebuilt = false;
    if (sig !== this.sig) {
      if (!Number.isNaN(this.sig)) this.reactAt = T + profile.reaction;
      this.sig = sig;
      c.builder.build(c.danger, world, profile);
      rebuilt = true;
    }

    const urgent = this.plan === null || this.rethinkNow;
    let due = urgent || T >= this.nextThink || (this.reactAt >= 0 && T >= this.reactAt);
    // large boards: routine re-plans share a per-tick allowance across every bot of the match; a bot
    // over the allowance keeps following its (reflex-guarded) plan and re-plans on a later tick
    if (due && !urgent && world.large && !takeThinkSlot(obs)) {
      due = false;
      aiCounters.deferred++;
    }
    if (due) {
      if (!rebuilt) c.builder.build(c.danger, world, profile);
      this.think(c);
      aiCounters.thinks++;
      if (!urgent) aiCounters.routineThinks++;
      aiCounters.work += c.work;
      aiCounters.maxThinkWork = Math.max(aiCounters.maxThinkWork, c.work);
    }

    const intent = this.follow(c);
    this.tactics.apply(c, intent, {
      requestRethink: () => (this.rethinkNow = true),
      planKind: () => this.plan?.kind ?? null,
    });
    return intent;
  }

  private context(obs: Observation): Ctx {
    const board = getBoard(obs.width, obs.height);
    if (!this.ctx || this.ctx.world.board !== board) {
      this.ctx = createCtx(this.profile, this.rng, board);
      this.plan = null;
    }
    return this.ctx;
  }

  // ------------------------------------------------------------------ planning

  private think(c: Ctx): void {
    const { world, profile, bfs } = c;
    const { obs, me } = world;
    const T = obs.tick;
    this.rethinkNow = false;
    this.reactAt = -1;
    this.nextThink = T + profile.thinkMin + nextInt(this.rng, profile.thinkMax - profile.thinkMin + 1);
    if (world.large) this.nextThink = Math.max(this.nextThink, T + LARGE_MIN_THINK[profile.difficulty]);
    c.rivalSims = 0;
    c.work = 0;
    c.baseline.clear();
    computeHuntField(c);
    updateZone(c);
    c.huntWeight = world.large ? profile.huntWeight * largeHuntPace(obs) : profile.huntWeight;
    // large boards: in the final few even a careless bot checks its way out before placing, so a
    // 32-player match rarely ends with the last two blowing each other up on the same tick
    c.placeVerify = world.large && world.rivals.length <= LARGE_CAREFUL_RIVALS ? 1 : profile.placeVerify;

    const step = stepTicksOf(obs, me);
    bfs.run({
      start: world.myTile,
      a0: T,
      a1: readyTick(obs, me),
      step,
      slots: searchSlots(c, profile.horizonTicks, step),
      danger: c.danger,
      blocked: world.walk,
    });
    let plan = chooseGoal(c, this.prevGoal);
    let certain = false;
    if (!plan && enemyRemote(obs)) {
      // Every way out crosses a lane that an enemy remote generator could fire at any moment: walk the
      // quickest route out of all such lanes rather than freezing inside one.
      c.builder.build(c.certain, world, profile, { ignoreHold: true });
      bfs.run({
        start: world.myTile,
        a0: T,
        a1: readyTick(obs, me),
        step,
        slots: searchSlots(c, profile.horizonTicks, step),
        danger: c.certain,
        refugeDanger: c.danger,
        blocked: world.walk,
      });
      plan = chooseGamble(c, this.prevGoal);
      certain = true;
    }
    plan ??= lastResort(c, certain ? c.certain : c.danger);
    this.plan = plan;
    this.progress = 0;
    this.prevGoal = plan.kind === 'place' || plan.kind === 'pickup' ? plan.goalTile : -1;
  }

  // ------------------------------------------------------------------ plan following

  private follow(c: Ctx): Intent {
    const { world, danger, profile } = c;
    const { obs, me } = world;
    const T = obs.tick;
    const intent: Intent = {};
    const plan = this.plan;
    if (!plan) return intent;

    while (this.progress < plan.times.length && plan.times[this.progress]! <= T) this.progress++;
    if (world.myTile !== plan.tiles[this.progress]) {
      // the world pushed us off the plan (blocked step, shove, slide): plan again next tick
      this.rethinkNow = true;
      this.plan = null;
      return intent;
    }
    const ready = readyTick(obs, me);
    let move: Dir | null = null;
    if (this.progress < plan.actions.length) {
      const act = plan.actions[this.progress]!;
      if (act !== null && plan.times[this.progress]! <= ready) move = act;
    } else if (plan.placeOnArrival) {
      move = this.arrive(c, plan, intent, ready);
    }

    if (move !== null) {
      // reflex guard: re-check the step against the freshest map
      const v = world.board.neighbor[world.myTile * 4 + dirIndex(move)]!;
      const step = stepTicksOf(obs, me);
      const wouldBlock = v < 0 || world.blocked[v] === 1;
      if (plan.gamble && enemyRemote(obs)) c.builder.build(c.certain, world, profile, { ignoreHold: true });
      const lethal = v >= 0 && (plan.gamble ? c.certain : danger).hit(v, ready, ready + step - 1);
      if (wouldBlock || lethal) {
        this.rethinkNow = true;
        move = null;
      }
    }
    if (move !== null) intent.move = world.steer(move);
    void profile;
    return intent;
  }

  /** Standing on the chosen spot: place the generator (after a fresh escape check) and start the escape. */
  private arrive(c: Ctx, plan: Plan, intent: Intent, ready: number): Dir | null {
    const { world, profile } = c;
    const { obs, me } = world;
    const T = obs.tick;
    const tile = world.myTile;
    const allowed = plan.drop
      ? me.carrying !== null && world.genAt[tile]! < 0
      : canPlaceNow(c) && placementGain(c, tile) >= profile.placeMinGain;
    if (!allowed) {
      this.plan = null;
      return null;
    }
    let esc = plan.escape && plan.escapeTick === T ? plan.escape : null;
    if (!esc) {
      const step = stepTicksOf(obs, me);
      const verify = c.placeVerify >= 1 || nextInt(this.rng, 1000) < c.placeVerify * 1000;
      if (verify) {
        const carried = plan.drop ? obs.generators.find((o) => o.id === me.carrying) : undefined;
        esc = checkPlacement(
          c,
          tile,
          T,
          ready,
          step,
          carried
            ? { explodeAt: T + Math.max(1, carried.timer), range: carried.range, pierce: carried.pierce }
            : {},
        );
        if (!esc) {
          this.plan = null;
          return null;
        }
        if (profile.robustEscape && !plan.drop && !robust(c, tile, T, ready, step, esc)) {
          this.plan = null;
          return null;
        }
      }
    }
    if (plan.drop) intent.action = true;
    else intent.place = true;
    this.nextThink = T + (esc ? profile.thinkMax : 2 + nextInt(this.rng, profile.reaction));
    if (!esc) {
      // unverified placement (Easy): stand still until the next think, then flee from our own generator
      this.plan = { ...plan, kind: 'stay', placeOnArrival: false, escape: null };
      return null;
    }
    this.plan = {
      kind: 'refuge',
      actions: esc.actions,
      tiles: esc.tiles,
      times: esc.times,
      placeOnArrival: false,
      gamble: false,
      drop: false,
      escape: null,
      escapeTick: T,
      madeAt: T,
      goalTile: esc.tiles[esc.tiles.length - 1]!,
    };
    this.progress = 0;
    const first = esc.actions[0];
    return first !== undefined && first !== null && esc.times[0]! <= ready ? first : null;
  }
}

// keep extractPlan reachable for tactics that build ad-hoc plans
export { extractPlan };
