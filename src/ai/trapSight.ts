/**
 * What a campaign enemy KNOWS about generators in a Tactical Trap pilot scenario (decisions TT1-TT3,
 * docs/TACTICAL_TRAP_PILOT.md) and, campaign-wide, under the campaign tactics layer (decision SA4,
 * docs/CAMPAIGN_SECTOR_AI.md; also the boss missions' generator bots). It replaces the EF1 tunnel-vision model of
 * `enemyBot.ts` only when `config.tacticalTrap` or `config.campaignTactics` is present; it reads the Observation alone
 * (never a hidden pickup, never an RNG) and uses no clock or randomness, so what an enemy knows is a pure function of
 * the match so far.
 *
 *   SEEING    a generator is seen when it is within the kind's vision radius and the grid line of sight is clear
 *             (`canSeeTile`: solid tiles and any other living body block it; a body standing on the generator's tile
 *             hides it too). A seen generator is taken seriously `reactTicks` after it was FIRST seen.
 *   MEMORY    once seen, its position and the (real) fuse are kept: stepping in front of it does not erase the
 *             awareness. Out of sight it is remembered `memoryTicks` after it was last seen, but a ticking generator
 *             with at most `memoryHoldFuseTicks` of fuse left is held until it blows. A generator that is no longer
 *             where it was seen (kicked, punched) is forgotten: it has to be seen again.
 *   HEARING   a generator laid within `hearingTiles` (Manhattan) is heard on the tick it appears: CAUTION for
 *             `caution.ticks` (no new wind-up or cue, a faster reaction to anything newly visible, one investigating step
 *             toward the dominant axis of the sound). The exact tile and the blast zone are NOT revealed.
 *   ALWAYS    a remote, triggered, disarmed, thrown or carried generator, or one of its own, is always known (as before).
 *
 * The planner then sees every unknown generator as an obstacle with an unreachable fuse (enemyBot.ts `UNHEEDED_FUSE`),
 * exactly as under EF1.
 */
import { bodyTiles, canSeeTile, inViewCone } from '../sim';
import type { Dir, EnemyKind, Generator, Observation, Player, TacticalTrapConfig } from '../sim';

/**
 * The perception rules a sight reads: the Academy pilot's `config.tacticalTrap` or the campaign tactics layer's
 * `config.campaignTactics` (decision SA4: the same model, campaign-wide).
 */
export type SightRules = Pick<TacticalTrapConfig, 'perception' | 'memoryHoldFuseTicks' | 'caution'>;

/** Per-seat adjustments of the campaign tactics layer (never information: they only change how fast and how far). */
export interface SightTuning {
  /** The perception row to use (a boss-mission generator bot has no `enemyKind`). Default: the seat's kind. */
  kind?: EnemyKind;
  /** Tiles added to the vision radius (a variant's field of attention). */
  visionDelta?: number;
  /** Scales the reaction time (trap sense, tunnel vision while brawling). */
  reactScale?: number;
  /** Caps the vision radius and limits sight to the cone ahead (a calm stroller's attention, decision SA5). */
  visionCap?: number;
  calmCone?: boolean;
  /** Generators of the seat's own team are known (boss-mission crews lay their own; enemies never hurt each other). */
  teamKnown?: boolean;
  /** It notices a generator being laid by a placer in its sight (trap sense; never through a wall or another body). */
  seesPlacement?: boolean;
}

/** A generator first observed this many ticks after it was laid still counts as heard being laid. */
const HEARD_WINDOW_TICKS = 2;

interface Memory {
  x: number;
  y: number;
  firstSeen: number;
  lastSeen: number;
}

/** Is this generator one the enemy cannot help knowing about (its danger is public, as before)? */
export function alwaysKnown(g: Readonly<Generator>, selfId: number): boolean {
  return (
    g.ownerId === selfId ||
    g.triggered ||
    g.mode !== 'timed' ||
    g.flight !== null ||
    g.carriedBy !== null ||
    g.mountedOn !== undefined
  );
}

/** Work counters (tests bound the cost: a decision does at most one sight check per generator and one body scan). */
export const trapSightStats = { updates: 0, sightChecks: 0, bodyScans: 0 };

export class TrapSight {
  private readonly memory = new Map<number, Memory>();
  private readonly heard = new Set<number>();
  private readonly known = new Set<number>();
  private readonly wasKnown = new Set<number>();
  /** The enemy is cautious (it heard a generator) until this tick. */
  cautionUntil = -1;
  /** The direction of the sound on the tick it was heard (null otherwise): one investigating step. */
  soundDir: Dir | null = null;
  /** True for the update in which a generator became known (the planner re-plans at once). */
  freshlyKnown = false;

  reset(): void {
    this.memory.clear();
    this.heard.clear();
    this.known.clear();
    this.wasKnown.clear();
    this.cautionUntil = -1;
    this.soundDir = null;
    this.freshlyKnown = false;
  }

  isKnown(id: number): boolean {
    return this.known.has(id);
  }

  cautious(tick: number): boolean {
    return tick < this.cautionUntil;
  }

  /** Is the generator remembered (seen once, still where it was, not forgotten)? Tests and the debug overlay. */
  remembers(id: number): boolean {
    return this.memory.has(id);
  }

  /** Does this seat know the generator EXISTS (known, or seen and remembered but not yet reacted to)? */
  aware(id: number): boolean {
    return this.known.has(id) || this.memory.has(id);
  }

  /** Takes in the observation: sees, remembers, hears. Call once per decision, before reading `isKnown`. */
  update(obs: Observation, me: Readonly<Player>, cfg: SightRules, tune: SightTuning = {}): void {
    const base = cfg.perception[tune.kind ?? me.enemyKind!];
    const per =
      tune.visionDelta || tune.reactScale !== undefined || tune.visionCap !== undefined
        ? {
            ...base,
            visionTiles: Math.min(
              tune.visionCap ?? Infinity,
              Math.max(2, base.visionTiles + (tune.visionDelta ?? 0)),
            ),
            reactTicks: Math.round(base.reactTicks * (tune.reactScale ?? 1)),
          }
        : base;
    const T = obs.tick;
    trapSightStats.updates++;
    this.freshlyKnown = false;
    this.soundDir = null;
    this.known.clear();
    let bodies: Set<number> | null = null;
    const live = new Set<number>();
    for (const g of obs.generators) {
      live.add(g.id);
      // hearing: the tick a fresh generator appears within earshot
      if (!this.heard.has(g.id)) {
        this.heard.add(g.id);
        if (
          g.ownerId !== me.id &&
          T - g.placedTick <= HEARD_WINDOW_TICKS &&
          Math.abs(g.x - me.x) + Math.abs(g.y - me.y) <= per.hearingTiles
        ) {
          this.hear(g, me, cfg, T);
        }
        // trap sense (decision SA5): it WATCHED the placer lay it (the placer in its sight that very moment), so it
        // knows the tile even though the placer's body still covers it
        if (
          tune.seesPlacement &&
          T - g.placedTick <= HEARD_WINDOW_TICKS &&
          this.sawPlacer(obs, me, g, per, tune)
        ) {
          this.memory.set(g.id, { x: g.x, y: g.y, firstSeen: T, lastSeen: T });
          trapSightStats.sightChecks++;
        }
      }
      if (alwaysKnown(g, me.id) || (tune.teamKnown && obs.players[g.ownerId]?.team === me.team)) {
        this.known.add(g.id);
        continue;
      }
      if (bodies === null) {
        bodies = bodyTiles(obs, me.id);
        trapSightStats.bodyScans++;
      }
      let m = this.memory.get(g.id);
      trapSightStats.sightChecks++;
      if (
        (!tune.calmCone || inViewCone(me, g.x, g.y)) &&
        canSeeTile(obs, me.x, me.y, g.x, g.y, per.visionTiles, bodies)
      ) {
        m = { x: g.x, y: g.y, firstSeen: m?.firstSeen ?? T, lastSeen: T };
        this.memory.set(g.id, m);
      } else if (m && !this.stillValid(m, g, per.memoryTicks, cfg.memoryHoldFuseTicks, T)) {
        this.memory.delete(g.id);
        m = undefined;
      }
      if (m && T - m.firstSeen >= this.reaction(per.reactTicks, cfg, T)) {
        this.known.add(g.id);
        if (!this.wasKnown.has(g.id)) this.freshlyKnown = true;
      }
    }
    for (const id of this.memory.keys()) if (!live.has(id)) this.memory.delete(id);
    for (const id of this.heard) if (!live.has(id)) this.heard.delete(id);
    this.wasKnown.clear();
    for (const id of this.known) this.wasKnown.add(id);
  }

  /** Was the placer of `g` in this seat's sight as it laid it (its own body excepted, other bodies conceal it)? */
  private sawPlacer(
    obs: Observation,
    me: Readonly<Player>,
    g: Readonly<Generator>,
    per: { visionTiles: number },
    tune: SightTuning,
  ): boolean {
    const placer = obs.players[g.ownerId];
    if (!placer || !placer.alive || placer.id === me.id) return false;
    if (tune.calmCone && !inViewCone(me, placer.x, placer.y)) return false;
    trapSightStats.bodyScans++;
    const bodies = new Set<number>();
    for (const p of obs.players)
      if (p.alive && p.id !== me.id && p.id !== placer.id) bodies.add(p.y * obs.width + p.x);
    return canSeeTile(obs, me.x, me.y, placer.x, placer.y, per.visionTiles, bodies);
  }

  private reaction(base: number, cfg: SightRules, T: number): number {
    return this.cautious(T) ? Math.round(base * cfg.caution.reactScale) : base;
  }

  /** The memory rule (see the file header): where it was, how long ago, and the fuse hold. */
  private stillValid(
    m: Memory,
    g: Readonly<Generator>,
    memoryTicks: number,
    holdFuse: number,
    T: number,
  ): boolean {
    if (m.x !== g.x || m.y !== g.y) return false;
    if (T - m.lastSeen <= memoryTicks) return true;
    return g.mode === 'timed' && g.timer <= holdFuse;
  }

  private hear(g: Readonly<Generator>, me: Readonly<Player>, cfg: SightRules, T: number): void {
    this.cautionUntil = Math.max(this.cautionUntil, T + cfg.caution.ticks);
    const dx = g.x - me.x;
    const dy = g.y - me.y;
    this.soundDir =
      dx === 0 && dy === 0
        ? null
        : Math.abs(dx) >= Math.abs(dy)
          ? dx > 0
            ? 'right'
            : 'left'
          : dy > 0
            ? 'down'
            : 'up';
  }
}
