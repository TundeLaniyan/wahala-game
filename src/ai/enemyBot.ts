/**
 * The campaign enemy controller (decisions EA2, EA4, EF1, EF2). An enemy seat (`Player.enemyKind`) plays through the
 * same `Intent` and sees only the `Observation` like every bot; what differs is the repertoire and the perception:
 *
 *   - movement is the ordinary planner (danger map, escapes) steered by the group tactic in `Observation.directive`
 *     (surround / standoff / block / hold / reinforce, see sim/campaign/tactics.ts and ai/directive.ts);
 *   - PERCEPTION (decision EF1): the planner is handed the observation with every generator that this enemy has not
 *     yet taken seriously shown as a harmless obstacle. A generator becomes a threat once its fuse is down to the
 *     kind's `config.enemyAttacks.awareness.alertTicks` (sometimes a little later: `slipChance` / `slipTicks`, drawn
 *     once per generator from this bot's own seeded RNG), and that moment forces an immediate re-plan. So a fresh
 *     generator is walked past while the enemy chases you, and a generator it has had time to see is still dodged
 *     with the full escape search. Remote, triggered and burning danger is always seen. Nothing is added to what the
 *     observation shows - only taken away for a while;
 *   - COMMITMENT (decision EF2): it never starts a punch or a throw while standing in the cross of a generator it
 *     takes seriously (never suicidal); once committed, the sim plants it for the wind-up / cue and the recovery
 *     after it (`recoveryRootTicks`, `throwRecoveryTicks`): the window in which a player can punish it;
 *   - it NEVER places a generator, detonates, disarms, drives or uses a reward: the profile has no placement and the
 *     intent is scrubbed (the sim ignores `place` for an enemy seat anyway);
 *   - its only action is the one B press: an adjacent rival is punched, else a thrower with a rival in a clear
 *     cardinal line throws (sim/systems/enemyActions.ts decides if it may: cooldowns, group gap, caps).
 */
import {
  DIFFICULTIES,
  DIRS,
  DIR_VEC,
  Tile,
  attackReady,
  createRng,
  enemyMeleeTarget,
  chooseThrow,
  inViewCone,
  nextFloat,
  variantOf,
} from '../sim';
import type {
  CampaignTacticsConfig,
  Difficulty,
  Dir,
  EnemyAwareness,
  Generator,
  Intent,
  Observation,
  Player,
  RngHolder,
} from '../sim';
import { Brain } from './brain';
import { TrapSight } from './trapSight';
import { PROFILES } from './profiles';
import type { AiProfile } from './profiles';
import type { Bot, BotOptions } from './types';
import { isRadial, radialTiles } from './blast';

/** After a B press the bot waits this long before pressing again (the sim enforces the real cooldowns). */
const PRESS_GAP = 12;
/** The fuse an unheeded generator is shown with: far beyond every planning horizon (an obstacle, not a threat). */
export const UNHEEDED_FUSE = 1_000_000;
/** Classic raid (decision RA4): a known generator is avoided whatever its fuse (below `UNHEEDED_FUSE`, which stays inert). */
const RAID_KNOWN_LOOKAHEAD = 100_000;

/** The ordinary profile of a level with everything that needs a generator or a reward switched off. */
export function enemyProfile(difficulty: Difficulty): AiProfile {
  return {
    ...PROFILES[difficulty],
    placeMinGain: Number.POSITIVE_INFINITY,
    pickupInterest: 0,
    trap: 'none',
    vehicleUse: 0,
    useSkill: false,
    meleeUse: 0,
    useGeneratorTools: false,
    smartRemote: false,
    sideline: false,
  };
}

/**
 * Does the plus of `g` (its range, stopped by any non-floor tile) cover (x, y)? In the combat pilot's radial field
 * mission and under the campaign tactics layer the real disc is used instead (decisions CP10, SA7: an enemy never
 * starts a wind-up diagonal to a generator it heeds); every other match keeps the plus test exactly as before.
 */
function inCross(obs: Observation, g: Readonly<Generator>, x: number, y: number): boolean {
  if (g.x === x && g.y === y) return true;
  if ((obs.config.combatPilot || obs.config.campaignTactics) && isRadial(obs)) {
    const tiles: number[] = [];
    radialTiles(obs, obs, g.x, g.y, g.range, g.pierce, g.square, () => false, tiles);
    return tiles.includes(y * obs.width + x);
  }
  if (g.x !== x && g.y !== y) return false;
  const d = Math.abs(g.x - x) + Math.abs(g.y - y);
  if (d > g.range) return false;
  const sx = Math.sign(x - g.x);
  const sy = Math.sign(y - g.y);
  for (let k = 1; k < d; k++) {
    if (obs.tiles[(g.y + sy * k) * obs.width + g.x + sx * k] !== Tile.Empty) return false;
  }
  return true;
}

export class EnemyBot implements Bot {
  private readonly brain: Brain;
  private readonly rng: RngHolder;
  private nextPress = 0;
  /** Per generator: the extra ticks this enemy is late to take it seriously (0 or the kind's `slipTicks`). */
  private readonly slip = new Map<number, number>();
  /** Per generator: the tick this enemy first saw it. */
  private readonly seen = new Map<number, number>();
  /** Generators already taken seriously (the moment one joins, the planner re-plans at once). */
  private readonly heeded = new Set<number>();
  /** Tactical Trap pilot / campaign tactics: sight, memory and hearing instead of the EF1 model above. */
  private readonly sight = new TrapSight();
  /** Campaign tactics: the planner at this seat's trap-sense level (created on the first decision that needs it). */
  private tacticsBrain: Brain | null = null;
  /** Campaign tactics: the tick this enemy last moved (a thrower throws only after standing still a while). */
  private lastMoveTick = -1e9;
  private lastTile = -1;
  /** Classic raid (decision RA5): the directive last followed (kind, and the tile for every kind but a chase). */
  private lastDirective = '';

  constructor(private readonly opts: BotOptions) {
    this.brain = new Brain(enemyProfile(opts.difficulty), opts.seed, opts.playerId);
    this.rng = createRng((opts.seed ^ 0x5bd1e995 ^ (opts.playerId * 0x27d4eb2d)) >>> 0);
  }

  /**
   * Campaign tactics (decision SA5): the movement / escape planner runs at the campaign level's enemy bot level plus
   * the seat's trap-sense bump (a lieutenant plans its escapes like a sharper bot; a plain agbero like the level's),
   * without the bot levels' random hesitation and wandering: its territory decides where it goes.
   */
  private planner(obs: Observation): Brain {
    const t = obs.config.campaignTactics;
    const me = obs.players[obs.selfId];
    if (!t || !me?.enemyKind) return this.brain;
    if (!this.tacticsBrain) {
      const bump = t.trapSense[variantOf(me)!.personality.trapSense].plannerBump;
      const base = DIFFICULTIES.indexOf(this.opts.difficulty);
      const level = DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, Math.max(0, base + bump))]!;
      // the territory drives where it goes: no random hesitation or wandering on top (Easy patrols are clockwork).
      // Classic raid (decision RA4): a generator it KNOWS is respected for its whole fuse (no bot-level lookahead): it
      // never waits beside one it has seen to step out at the last moment; what it has not seen it cannot dodge
      const raid = t.classicRaid ? { lookahead: RAID_KNOWN_LOOKAHEAD } : {};
      this.tacticsBrain = new Brain(
        { ...enemyProfile(level), hesitate: 0, wander: 0, ...raid },
        this.opts.seed,
        this.opts.playerId,
      );
    }
    return this.tacticsBrain;
  }

  /** Is generator `g` a threat to this enemy yet (decision EF1)? Once it is, it stays one. */
  private heeds(obs: Observation, g: Readonly<Generator>, aw: EnemyAwareness, brawling: boolean): boolean {
    if (this.heeded.has(g.id) || g.ownerId === obs.selfId || g.triggered || g.mode !== 'timed') return true;
    if (!brawling && obs.tick - (this.seen.get(g.id) ?? obs.tick) >= aw.reactTicks) return true;
    return g.timer <= aw.alertTicks - (this.slip.get(g.id) ?? 0);
  }

  /** Tunnel vision: a rival within `focusTiles`, or its own wind-up / cue / recovery running. */
  private brawling(obs: Observation, aw: EnemyAwareness): boolean {
    const me = obs.players[obs.selfId]!;
    if (me.attack !== null || obs.tick < me.rootedUntil) return true;
    return obs.players.some(
      (o) =>
        o.alive &&
        o.enemyKind === undefined &&
        o.team !== me.team &&
        Math.abs(o.x - me.x) + Math.abs(o.y - me.y) <= aw.focusTiles,
    );
  }

  /**
   * The observation as this enemy takes it in: generators it does not heed yet carry an unreachable fuse. Returns the
   * live observation itself when nothing is hidden (and always for a seat without awareness: never a multiplayer bot).
   */
  perceive(obs: Observation): Observation {
    const me = obs.players[obs.selfId];
    if (obs.config.tacticalTrap && me?.enemyKind) return this.perceiveTrap(obs, me);
    if (obs.config.campaignTactics && me?.enemyKind)
      return this.perceiveTactics(obs, me, obs.config.campaignTactics);
    const aw = me?.enemyKind ? obs.config.enemyAttacks.awareness[me.enemyKind] : undefined;
    if (!aw || obs.generators.length === 0) {
      this.sight.reset();
      this.slip.clear();
      this.seen.clear();
      this.heeded.clear();
      return obs;
    }
    let hidden = false;
    let fresh = false;
    const live = new Set<number>();
    const brawling = this.brawling(obs, aw);
    const generators = obs.generators.map((g) => {
      live.add(g.id);
      if (!this.slip.has(g.id)) {
        this.slip.set(g.id, nextFloat(this.rng) < aw.slipChance ? aw.slipTicks : 0);
        this.seen.set(g.id, obs.tick);
      }
      if (this.heeds(obs, g, aw, brawling)) {
        if (!this.heeded.has(g.id)) {
          this.heeded.add(g.id);
          fresh = true;
        }
        return g;
      }
      hidden = true;
      return { ...g, timer: UNHEEDED_FUSE };
    });
    for (const id of this.slip.keys()) if (!live.has(id)) this.slip.delete(id);
    for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id);
    for (const id of this.heeded) if (!live.has(id)) this.heeded.delete(id);
    if (fresh) this.brain.alert();
    return hidden ? { ...obs, generators } : obs;
  }

  /**
   * The Tactical Trap pilot's perception (decisions TT1-TT3, ai/trapSight.ts): a generator is known when it was seen
   * (line of sight, vision range, no body or wall in the way), remembered, or always-public; the rest are obstacles with
   * an unreachable fuse, as under EF1. Hearing only makes the enemy cautious (see `decide`).
   */
  private perceiveTrap(obs: Observation, me: Readonly<Player>): Observation {
    this.sight.update(obs, me, obs.config.tacticalTrap!);
    if (this.sight.freshlyKnown || this.sight.soundDir !== null) this.brain.alert();
    let hidden = false;
    const generators = obs.generators.map((g) => {
      if (this.sight.isKnown(g.id)) return g;
      hidden = true;
      return { ...g, timer: UNHEEDED_FUSE };
    });
    return hidden ? { ...obs, generators } : obs;
  }

  /**
   * The campaign tactics layer's perception (decisions SA4-SA5): the pilot's sight, memory and hearing on the layer's
   * per-kind table, the variant's field of attention, and its trap sense: the reaction time scaled by its tier, and
   * again while brawling (pursuing, winding up, recovering) for the tiers with tunnel vision; while calm it notices a
   * generator only within its tier's `calmVisionTiles`. Never more than it saw.
   */
  private perceiveTactics(obs: Observation, me: Readonly<Player>, t: CampaignTacticsConfig): Observation {
    const pers = variantOf(me)!.personality;
    const sense = t.trapSense[pers.trapSense];
    const d = obs.directive?.kind;
    const brawling =
      me.attack !== null ||
      obs.tick < me.rootedUntil ||
      d === 'chase' ||
      d === 'surround' ||
      d === 'standoff' ||
      d === 'block';
    // calm (patrolling, holding its post, walking back; not engaged, not cautious): it looks where it walks, near
    const calm = !brawling && !this.sight.cautious(obs.tick) && d !== 'investigate';
    this.sight.update(obs, me, t, {
      visionDelta: pers.visionDelta,
      reactScale: sense.reactScale * (brawling ? sense.enemyBrawlReactScale : 1),
      ...(calm ? { visionCap: sense.calmVisionTiles, calmCone: true } : {}),
      // decisions CV1-CV2 (Classic raids): blind right behind it when calm; a laid generator is a quiet click
      ...(calm && t.classicRaid ? { coneRing: t.classicRaid.trapRing } : {}),
      ...(t.classicRaid ? { placeHearingTiles: t.classicRaid.placeHearingTiles } : {}),
      seesPlacement:
        sense.seesPlacement &&
        (!(me.attack !== null || obs.tick < me.rootedUntil) || sense.watchesWhileBrawling !== false) &&
        obs.tick >= me.dazedUntil,
    });
    if (this.sight.freshlyKnown) this.planner(obs).alert();
    return perceivedObservation(obs, this.sight);
  }

  /**
   * Campaign tactics (decision SA7): may this enemy start a throw now? Never from a calm state (it has not engaged),
   * never while dodging (a known generator's reach touches its tile or a neighbour) and only after standing still for
   * `attack.throwSettleTicks` (no throwing on the run).
   */
  private mayThrow(obs: Observation, me: Readonly<Player>, t: CampaignTacticsConfig): boolean {
    const d = obs.directive?.kind;
    if (d === 'patrol' || d === 'investigate' || d === 'return') return false;
    if (obs.tick - this.lastMoveTick < t.attack.throwSettleTicks) return false;
    for (const g of obs.generators) {
      if (g.timer >= UNHEEDED_FUSE || g.mode === 'disabled') continue;
      if (inCross(obs, g, me.x, me.y)) return false;
      for (const v of Object.values(DIR_VEC)) if (inCross(obs, g, me.x + v.dx, me.y + v.dy)) return false;
    }
    return true;
  }

  /** The one investigating step toward a sound just heard (pilot only; never a path to the generator). */
  private investigate(obs: Observation, me: Readonly<Player>, intent: Intent): void {
    const dir = this.sight.soundDir;
    const cfg = obs.config.tacticalTrap;
    if (!dir || !cfg?.caution.investigate) return;
    if (me.stepRemaining > 1 || me.attack !== null || obs.tick < me.rootedUntil) return;
    if (obs.generators.some((g) => g.timer < UNHEEDED_FUSE && g.mode !== 'disabled')) return; // it knows one: it flees, not looks
    const x = me.x + DIR_VEC[dir].dx;
    const y = me.y + DIR_VEC[dir].dy;
    if (x < 0 || y < 0 || x >= obs.width || y >= obs.height) return;
    if (obs.tiles[y * obs.width + x] !== Tile.Empty) return;
    if (obs.players.some((o) => o.alive && o.id !== me.id && o.x === x && o.y === y)) return;
    if (obs.flames.some((f) => f.x === x && f.y === y)) return;
    intent.move = dir;
  }

  decide(raw: Observation): Intent {
    const obs = this.perceive(raw);
    const self = raw.players[raw.selfId];
    if (self && raw.config.campaignTactics) {
      const tile = self.y * raw.width + self.x;
      if (tile !== this.lastTile || self.stepRemaining > 0) this.lastMoveTick = raw.tick;
      this.lastTile = tile;
    }
    // Classic raid (decision RA5): a new order from its territory (the next waypoint, a pause over, a chase begun or
    // given up) is acted on at once, not at the next routine re-plan: patrols keep their exact clockwork timing
    const d = raw.config.campaignTactics?.classicRaid ? raw.directive : undefined;
    if (d) {
      const key = d.kind === 'chase' ? d.kind : `${d.kind}:${d.x},${d.y}`;
      if (key !== this.lastDirective) this.planner(obs).alert();
      this.lastDirective = key;
    }
    const intent = this.planner(obs).decide(obs);
    // decision AM1 (Classic raids): a calm patrol walks its route like clockwork. The planner re-thinks on its own
    // cadence and could stand a beat on a corridor tile between two waypoints, so the next step towards the waypoint is
    // taken the moment the seat is free to move, unless a generator it knows of (or a flame) is about: then the
    // planner's own danger handling decides
    if (d?.kind === 'patrol') {
      const step = patrolStep(obs, d.x, d.y);
      if (step) intent.move = step;
    }
    // decision CV5 (Classic raids): a generator it KNOWS is acted on at once. Standing in its cross it walks out by the
    // shortest way (the planner could wait beside it to step out at the last moment, and a raid enemy still on the tile
    // it is leaving is caught: decision CV3); outside every known cross it never steps into one
    if (d) {
      const me = obs.players[obs.selfId];
      if (me && heededCross(obs, me.x, me.y)) {
        const out = clearStep(obs);
        if (out) intent.move = out;
      } else if (me && intent.move) {
        const v = DIR_VEC[intent.move];
        if (heededCross(obs, me.x + v.dx, me.y + v.dy)) delete intent.move;
      }
    }
    // an enemy is not a generator player: scrub everything but movement
    delete intent.place;
    delete intent.placeHeld;
    delete intent.detonate;
    delete intent.disarm;
    delete intent.skill;
    delete intent.action;
    delete intent.vehicle;
    delete intent.special;
    const me = obs.players[obs.selfId];
    if (
      !me ||
      !me.alive ||
      obs.match.phase !== 'playing' ||
      obs.tick < me.dazedUntil ||
      me.entryUntil !== null
    )
      return intent;
    if (obs.tick < this.nextPress) return intent;
    if (obs.config.tacticalTrap) {
      // a heard generator: one investigating step, and no new wind-up or cue while the caution lasts (decision TT3)
      if (this.sight.cautious(obs.tick)) {
        this.investigate(obs, me, intent);
        return intent;
      }
    }
    // campaign tactics: the same caution (the investigation itself is the territory's: sim/systems/territory.ts)
    if (obs.config.campaignTactics && this.sight.cautious(obs.tick)) return intent;
    // never commit to a wind-up / cue (and the recovery after it) inside a cross it takes seriously
    if (
      obs.generators.some(
        (g) => g.timer < UNHEEDED_FUSE && g.mode !== 'disabled' && inCross(obs, g, me.x, me.y),
      )
    )
      return intent;

    // 1. a rival next to me: punch (when the catalogue attack is ready; the sim applies the enemy's own cooldown)
    const melee = enemyMeleeTarget(obs, me);
    // decision CV1 (Classic raids): a calm guard (on its rounds, at its post, walking back) only swings at someone it
    // can see: a player who crept up right behind it is not felt (the territory's own notice uses the same ring)
    const ring = obs.config.campaignTactics?.classicRaid?.nearRing;
    if (melee && ring && obs.directive?.calm && !inViewCone(me, melee.target.x, melee.target.y, ring))
      return intent;
    if (melee) {
      const kind = me.enemyKind ? obs.config.enemyAttacks.melee[me.enemyKind] : null;
      if (kind && attackReady(obs, me, kind.attack)) {
        intent.special = true;
        delete intent.move;
        this.nextPress = obs.tick + PRESS_GAP;
      }
      return intent;
    }
    // 2. a rival in a clear cardinal line: throw (stand still for the cue)
    const t = obs.config.campaignTactics;
    if (t && !this.mayThrow(obs, me, t)) return intent;
    if (chooseThrow(obs, me)) {
      intent.special = true;
      delete intent.move;
      this.nextPress = obs.tick + PRESS_GAP;
    }
    return intent;
  }
}

/**
 * Decision AM1: the first step of the shortest walk from this seat to its patrol waypoint (x, y) over open floor (no
 * generator it is aware of, no other body), ties broken in the fixed `DIRS` order; null when it cannot step now (in a
 * step, planted, dazed), is there already, a known generator or a flame is within reach of its tile or the next one,
 * or no walk exists. Pure: the same observation gives the same step.
 */
export function patrolStep(obs: Observation, x: number, y: number): Dir | null {
  const me = obs.players[obs.selfId];
  if (!me || !me.alive || me.stepRemaining > 1 || obs.tick < me.rootedUntil || obs.tick < me.dazedUntil)
    return null;
  if (me.x === x && me.y === y) return null;
  const w = obs.width;
  const blocked = new Set<number>();
  for (const g of obs.generators) blocked.add(g.y * w + g.x);
  for (const p of obs.players) if (p.alive && p.id !== me.id) blocked.add(p.y * w + p.x);
  const near = (tx: number, ty: number): boolean =>
    obs.generators.some((g) => inCross(obs, g, tx, ty)) ||
    obs.flames.some((f) => Math.abs(f.x - tx) + Math.abs(f.y - ty) <= 1);
  if (near(me.x, me.y)) return null;
  const goal = y * w + x;
  const start = me.y * w + me.x;
  const first = new Map<number, Dir>();
  let frontier = [start];
  const seen = new Set([start]);
  while (frontier.length > 0 && !first.has(goal)) {
    const next: number[] = [];
    for (const u of frontier)
      for (const dir of DIRS) {
        const nx = (u % w) + DIR_VEC[dir].dx;
        const ny = Math.floor(u / w) + DIR_VEC[dir].dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= obs.height) continue;
        const v = ny * w + nx;
        if (seen.has(v) || obs.tiles[v] !== Tile.Empty || blocked.has(v)) continue;
        seen.add(v);
        first.set(v, u === start ? dir : first.get(u)!);
        next.push(v);
      }
    frontier = next;
  }
  const dir = first.get(goal);
  if (!dir) return null;
  return near(me.x + DIR_VEC[dir].dx, me.y + DIR_VEC[dir].dy) ? null : dir;
}

/** Decision CV5: is (x, y) in the cross of a generator this seat takes seriously (known: its real fuse is shown)? */
function heededCross(obs: Observation, x: number, y: number): boolean {
  return obs.generators.some(
    (g) => g.timer < UNHEEDED_FUSE && g.mode !== 'disabled' && inCross(obs, g, x, y),
  );
}

/**
 * Decision CV5: the first step of the shortest walk (at most 6 steps, open floor, no generator, body or flame on the
 * way, ties in the fixed `DIRS` order) to a tile outside every known generator's cross; null when it cannot step now
 * or no such walk exists (then the planner decides). Pure.
 */
export function clearStep(obs: Observation): Dir | null {
  const me = obs.players[obs.selfId];
  if (!me || !me.alive || me.stepRemaining > 1 || obs.tick < me.rootedUntil || obs.tick < me.dazedUntil)
    return null;
  if (me.attack !== null) return null;
  const w = obs.width;
  const blocked = new Set<number>();
  for (const g of obs.generators) blocked.add(g.y * w + g.x);
  for (const p of obs.players) if (p.alive && p.id !== me.id) blocked.add(p.y * w + p.x);
  for (const f of obs.flames) blocked.add(f.y * w + f.x);
  const start = me.y * w + me.x;
  const first = new Map<number, Dir>();
  let frontier = [start];
  const seen = new Set([start]);
  for (let depth = 0; depth < 6 && frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const u of frontier)
      for (const dir of DIRS) {
        const nx = (u % w) + DIR_VEC[dir].dx;
        const ny = Math.floor(u / w) + DIR_VEC[dir].dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= obs.height) continue;
        const v = ny * w + nx;
        if (seen.has(v) || obs.tiles[v] !== Tile.Empty || blocked.has(v)) continue;
        seen.add(v);
        const f = u === start ? dir : first.get(u)!;
        if (!heededCross(obs, nx, ny)) return f;
        first.set(v, f);
        next.push(v);
      }
    frontier = next;
  }
  return null;
}

/**
 * The campaign tactics layer's view of the generators (decision SA4): a generator this seat has NEVER SEEN (nor heard
 * as its own team's) is not in its observation at all - not even as an obstacle on its route; one it has seen but not
 * yet reacted to is an obstacle with an unreachable fuse; one it knows is shown as it is. An unseen generator next to
 * it is always seen (the eight tiles around a seat are in view), so it never walks into one blindly.
 */
export function perceivedObservation(obs: Observation, sight: TrapSight): Observation {
  let changed = false;
  const generators: Generator[] = [];
  for (const g of obs.generators) {
    if (sight.isKnown(g.id)) generators.push(g);
    else {
      changed = true;
      if (sight.aware(g.id)) generators.push({ ...g, timer: UNHEEDED_FUSE });
    }
  }
  return changed ? { ...obs, generators } : obs;
}

export function createEnemyBot(opts: BotOptions): Bot {
  return new EnemyBot(opts);
}
