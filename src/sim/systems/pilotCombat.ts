/**
 * THE OSHODI MISSION 1 COMBAT PILOT rules (docs/OSHODI_COMBAT_PILOT.md, decisions CP1-CP12). Every function here is
 * inert unless the match carries `config.combatPilot`, which only the field missions of `mission/combatPilot.ts` set.
 * It concerns only the campaign HUMAN (vitals, no `enemyKind`) and the campaign ENEMY seats.
 *
 *   the pilot punch (CP2-CP4)  the human's B against an enemy is one quick punch whatever the fighter: every accepted
 *                              press swings (`punchSwing`); it reaches the human's own tile, the four neighbours and
 *                              (forgiving for the high camera) the diagonals; it resolves `startupTicks` later against
 *                              whoever is in reach then, or whiffs visibly. A hit takes `damage` segments and staggers
 *                              an ordinary enemy (cuts its wind-up short, it cannot act) unless it is still immune from
 *                              its last stagger: damage keeps landing, stagger does not (no stun-lock). A steadfast heavy
 *                              reels only on every `steadfastPoise`-th punch.
 *   the input buffer (CP5)     a press of A or B the human cannot act on yet (hit-stun, punch recovery) is kept for
 *                              `inputBufferTicks` and done on the first tick it can be; a generator that cannot be laid
 *                              for a lasting reason (all sockets in use, the tile taken) says so (`placeRefused`).
 *   enemy spacing (CP9)        an enemy never steps onto the human's tile; an enemy punch also reaches a human who
 *                              walked onto the enemy's own tile.
 *
 * Health, frames and blast damage for enemies are read where they apply (campaignDamage.ts, lethality.ts).
 */
import { DIRS, DIR_VEC } from '../grid';
import type { CombatPilotConfig } from '../config';
import type { Dir, GameState, PilotCombatState, Player, SimEvent } from '../types';
import { ENEMY_KINDS } from '../data/enemies';
import { applyCampaignHit } from './campaignDamage';
import { tryPlaceGenerator, canPlaceGeneratorAt } from './generators';
import { activeGeneratorCount, isActing } from './queries';
import { enemyFireOf, sameSide } from './projectiles';

export type PlaceRefusal = 'capacity' | 'occupied' | 'stunned' | 'busy';

/** The longest hold-up (ticks) a kept press waits through before its own buffer starts. */
const MAX_KEEP_TICKS = 45;

export const pilotOf = (state: { readonly config: GameState['config'] }): CombatPilotConfig | null =>
  state.config.combatPilot ?? null;

/** The campaign human of a pilot match (never an enemy seat, never a multiplayer bot). */
export const isPilotHuman = (state: { readonly config: GameState['config'] }, p: Readonly<Player>): boolean =>
  state.config.combatPilot !== undefined && p.enemyKind === undefined && p.vitals !== undefined && !p.isBot;

function pilotState(state: GameState): PilotCombatState {
  state.pilotCombat ??= { bufferedSpecial: {}, bufferedPlace: {}, placeAnnounced: {}, poise: {} };
  return state.pilotCombat;
}

// ------------------------------------------------------------------ reach

const DIAGONALS: readonly { dx: number; dy: number; dir: Dir }[] = [
  { dx: 1, dy: -1, dir: 'right' },
  { dx: 1, dy: 1, dir: 'right' },
  { dx: -1, dy: 1, dir: 'left' },
  { dx: -1, dy: -1, dir: 'left' },
];

type ReachView = {
  readonly players: readonly Readonly<Player>[];
  readonly config: GameState['config'];
};

/**
 * The enemy the human's pilot punch reaches from (x, y) facing `facing`: the own tile, the faced tile, the other three
 * neighbours (up, right, down, left), then the diagonals. Deterministic (players in id order). `at` lets a target that
 * began stepping away count on the tile it left (the step grace of every attack).
 */
export function pilotReach(
  view: ReachView,
  p: Readonly<Player>,
  ok: (o: Readonly<Player>) => boolean,
  at: (o: Readonly<Player>) => readonly { x: number; y: number }[] = (o) => [{ x: o.x, y: o.y }],
): { target: Readonly<Player>; dir: Dir } | null {
  const pilot = view.config.combatPilot;
  const spots: { dx: number; dy: number; dir: Dir }[] = [
    { dx: 0, dy: 0, dir: p.facing },
    ...[p.facing, ...DIRS.filter((d) => d !== p.facing)].map((d) => ({ ...DIR_VEC[d], dir: d })),
    ...(pilot?.punch.diagonal ? DIAGONALS : []),
  ];
  for (const s of spots) {
    const x = p.x + s.dx;
    const y = p.y + s.dy;
    const target = view.players.find(
      (o) => o.alive && o.id !== p.id && ok(o) && at(o).some((t) => t.x === x && t.y === y),
    );
    if (target) return { target, dir: s.dir };
  }
  return null;
}

const enemyOf =
  (p: Readonly<Player>) =>
  (o: Readonly<Player>): boolean =>
    o.enemyKind !== undefined && !sameSide(p, o);

/** The tiles a rival counts as standing on for a resolving punch: its tile, and the one it is leaving early in a step. */
function graceSpots(state: GameState, o: Readonly<Player>): { x: number; y: number }[] {
  const spots = [{ x: o.x, y: o.y }];
  const g = state.config.skills.stepGrace;
  if (g.enabled && o.stepRemaining > 0 && o.stepTotal > 0 && o.stepRemaining / o.stepTotal > 1 - g.maxShare)
    spots.push({ x: o.stepFromX, y: o.stepFromY });
  return spots;
}

/** What a B press would do next to an enemy in a pilot match (HUD / bots): a punch target, or null. Read-only. */
export function pilotPunchTarget(view: ReachView, p: Readonly<Player>): Readonly<Player> | null {
  return pilotReach(view, p, enemyOf(p))?.target ?? null;
}

// ------------------------------------------------------------------ the punch

const punchReady = (state: GameState, p: Player): boolean =>
  isActing(state, p) && p.entryUntil === null && p.attack === null && state.tick >= p.skillReadyTick;

/**
 * The pilot B for the human. 'busy' = not now (hit-stun, a punch still running or recovering): keep the press.
 * 'punch' = a punch began on an enemy in reach. 'other' = nobody in reach: the caller tries the rest of B's order
 * (rewards, vehicle) and, if that does nothing, `airSwing`.
 */
export function pilotSpecial(state: GameState, p: Player, events: SimEvent[]): 'busy' | 'punch' | 'other' {
  if (!punchReady(state, p)) return 'busy';
  const found = pilotReach(state, p, enemyOf(p));
  if (!found) return 'other';
  startPunch(state, p, found.target.id, found.dir, events);
  return 'punch';
}

/** Nobody in reach and B did nothing else: a clear swing at the faced tile (it can still catch an enemy stepping in). */
export function airSwing(state: GameState, p: Player, events: SimEvent[]): void {
  if (punchReady(state, p)) startPunch(state, p, -1, p.facing, events);
}

function startPunch(state: GameState, p: Player, targetId: number, dir: Dir, events: SimEvent[]): void {
  const cfg = pilotOf(state)!.punch;
  p.facing = dir;
  p.attack = { skill: 'push', targetId, resolveTick: state.tick + cfg.startupTicks, dir, pilot: true };
  events.push({
    type: 'attackStarted',
    playerId: p.id,
    skill: 'push',
    targetId,
    resolveTick: p.attack.resolveTick,
  });
  events.push({ type: 'punchSwing', playerId: p.id, dir, targetId: targetId >= 0 ? targetId : null });
  events.push({ type: 'specialUsed', playerId: p.id, action: 'melee' });
}

/** A pilot punch's startup is over (called by `updateAttacks`): hit whoever is in reach now, or whiff. */
export function resolvePilotPunch(state: GameState, p: Player, events: SimEvent[]): void {
  const pending = p.attack!;
  p.attack = null;
  const cfg = pilotOf(state)!.punch;
  const ok = enemyOf(p);
  const spots = (o: Readonly<Player>): { x: number; y: number }[] => graceSpots(state, o);
  const aimed = state.players[pending.targetId];
  const found =
    !p.alive || !isActing(state, p)
      ? null
      : aimed && aimed.alive && ok(aimed) && pilotReach(state, p, (o) => o === aimed, spots)
        ? { target: aimed, dir: pilotReach(state, p, (o) => o === aimed, spots)!.dir }
        : pilotReach(state, p, ok, spots);
  if (!found) {
    p.skillReadyTick = state.tick + cfg.whiffRecoveryTicks;
    events.push({ type: 'attackResolved', playerId: p.id, skill: 'push', targetId: null, hit: false });
    return;
  }
  const target = state.players[found.target.id]!;
  p.facing = found.dir;
  const def = target.enemyKind ? ENEMY_KINDS[target.enemyKind] : null;
  const ps = pilotState(state);
  let stagger: boolean;
  if (def?.steadfast) {
    ps.poise[target.id] = (ps.poise[target.id] ?? 0) + 1;
    stagger = cfg.steadfastPoise > 0 && ps.poise[target.id]! % cfg.steadfastPoise === 0;
  } else stagger = state.tick >= target.dazeImmuneUntil;
  const result = applyCampaignHit(
    state,
    {
      victimId: target.id,
      byId: p.id,
      source: 'player',
      damage: cfg.damage,
      dazeTicks: stagger ? cfg.staggerTicks : 0,
      knockback: null,
    },
    events,
    { pilotPunch: true },
  );
  if (stagger && (result === 'damaged' || result === 'dazed')) {
    target.dazeImmuneUntil = state.tick + cfg.staggerTicks + cfg.staggerImmunityTicks;
    if (target.attack) {
      target.attack = null; // the stagger cuts the enemy's wind-up short ...
      events.push({ type: 'attackInterrupted', playerId: target.id, byId: p.id });
      // ... but does not waste its cooldown: it may swing back soon after it recovers
      const fire = enemyFireOf(state);
      const back = state.tick + cfg.staggerTicks + pilotOf(state)!.counterSwingTicks;
      fire.nextPunchTick[target.id] = Math.min(fire.nextPunchTick[target.id] ?? back, back);
      // (the group's gap between two wind-ups was spent on the interrupted one: it is given back unless another
      // member of the group is winding up right now)
      const busy = state.players.some((o) => o.alive && o.team === target.team && o.attack !== null);
      if (!busy)
        fire.groupNextPunchTick[target.team] = Math.min(fire.groupNextPunchTick[target.team] ?? back, back);
    }
  }
  p.skillReadyTick = state.tick + cfg.hitRecoveryTicks;
  events.push({ type: 'attackResolved', playerId: p.id, skill: 'push', targetId: target.id, hit: true });
}

// ------------------------------------------------------------------ the generator press

/** Why the human's generator press cannot be done now, or null when it can. */
export function placeRefusal(state: GameState, p: Player): PlaceRefusal | null {
  if (!isActing(state, p)) return 'stunned';
  if (p.entryUntil !== null || p.carrying !== null) return 'busy';
  if (activeGeneratorCount(state, p.id) >= p.capacity) return 'capacity';
  if (!canPlaceGeneratorAt(state, p.x, p.y)) return 'occupied';
  return null;
}

// ------------------------------------------------------------------ the intents of the pilot human

/**
 * Replaces the B (`special`) and A (`place`) handling of `applyIntents` for the pilot human. `resolveOther` is the rest
 * of B's ordinary order (rewards, vehicle voucher) for a press with no enemy in reach; it returns whether it did
 * anything. Every press is kept for `inputBufferTicks` and retried each tick until it is done.
 */
export function pilotIntents(
  state: GameState,
  p: Player,
  intent: { special?: boolean; place?: boolean },
  events: SimEvent[],
  resolveOther: () => boolean,
): void {
  const pilot = pilotOf(state)!;
  const ps = pilotState(state);
  // a press is kept through a SHORT hold-up it is waiting on (hit-stun, the punch's own swing and recovery) plus the
  // buffer; a long stun does not stretch it (the press is then dropped with a notice instead of firing much later)
  const wait = (ready: number): number => {
    const left = ready - state.tick;
    return state.tick + (left > 0 && left <= MAX_KEEP_TICKS ? left : 0) + pilot.inputBufferTicks;
  };
  const punchFree = Math.max(
    p.skillReadyTick,
    p.attack ? p.attack.resolveTick + pilot.punch.hitRecoveryTicks : 0,
  );
  if (intent.special) ps.bufferedSpecial[p.id] = wait(Math.max(p.dazedUntil, punchFree));
  if (intent.place) {
    ps.bufferedPlace[p.id] = wait(p.dazedUntil);
    ps.placeAnnounced[p.id] = false;
  }

  if ((ps.bufferedSpecial[p.id] ?? -1) >= state.tick) {
    const r = pilotSpecial(state, p, events);
    if (r !== 'busy') {
      ps.bufferedSpecial[p.id] = -1;
      if (r === 'other' && !resolveOther()) airSwing(state, p, events);
    }
  }

  const keep = ps.bufferedPlace[p.id] ?? -1;
  if (keep >= state.tick) {
    if (tryPlaceGenerator(state, p, events)) {
      ps.bufferedPlace[p.id] = -1;
      return;
    }
    const why = placeRefusal(state, p) ?? 'busy';
    // a lasting reason is said at once; hit-stun only if the buffer runs out before it ends
    const lasting = why === 'capacity' || why === 'occupied';
    if (!ps.placeAnnounced[p.id] && (lasting || keep === state.tick)) {
      ps.placeAnnounced[p.id] = true;
      events.push({ type: 'placeRefused', playerId: p.id, reason: why, x: p.x, y: p.y });
    }
    if (lasting) ps.bufferedPlace[p.id] = -1; // all sockets busy / the tile taken: refused, not kept
  }
}

/** Does a buffered press wait for this seat (so `applyIntents` runs `pilotIntents` without a fresh intent)? */
export function pilotPending(state: GameState, id: number): boolean {
  const ps = state.pilotCombat;
  return !!ps && ((ps.bufferedSpecial[id] ?? -1) >= state.tick || (ps.bufferedPlace[id] ?? -1) >= state.tick);
}

// ------------------------------------------------------------------ enemy spacing

/** In a pilot match an enemy never steps onto the tile of the campaign human (CP9). */
export function pilotBlocksStep(state: GameState, p: Readonly<Player>, x: number, y: number): boolean {
  const pilot = state.config.combatPilot;
  if (!pilot?.enemiesKeepOffHuman || p.enemyKind === undefined) return false;
  return state.players.some((o) => o.alive && o.x === x && o.y === y && isPilotHuman(state, o));
}

/** An enemy punch in a pilot match also reaches a rival standing on the enemy's own tile (CP9). */
export function pilotSameTileRival<P extends Readonly<Player>>(
  view: { readonly players: readonly P[]; readonly config: GameState['config'] },
  p: Readonly<Player>,
  ok: (o: P) => boolean,
): P | null {
  if (!view.config.combatPilot || p.enemyKind === undefined) return null;
  return view.players.find((o) => o.alive && o.id !== p.id && o.x === p.x && o.y === p.y && ok(o)) ?? null;
}
