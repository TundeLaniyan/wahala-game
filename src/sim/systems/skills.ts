/**
 * Close-range, non-lethal attacks (decisions CB1-CB4, FC1-FC4). B next to a rival starts an attack; it takes effect
 * `startupTicks` later against whoever is in reach THEN (a rival who stepped away is a whiff). The catalogue
 * (`config.skills.attacks`, named in `data/attacks.ts`) has eight attacks with different trades; a fighter throws
 * the `attacks.primary` of their `FighterDef` and, when the loadout has one, a `secondary` (resolver: `actions.ts`).
 *
 * Rules shared by every attack:
 *  - nothing roots the attacker EXCEPT where the spec says so (`plantedStartup`, `whiffRootTicks`, `hitRootTicks`:
 *    the attacker cannot take a step; they can still place generators and press B);
 *  - a whiff costs `whiffRecoveryTicks`, a hit `hitRecoveryTicks` (the global recovery: after it any rival is
 *    hittable again) and an attack with a `cooldownTicks` cannot be thrown again for that long (per attack);
 *  - the same attacker cannot affect the same victim again for `targetLockoutTicks` (no chain, no stun-lock);
 *  - a hit that `interrupts` cuts a pending attack of the victim short (a fast jab beats a slow wind-up);
 *  - STEP GRACE (decision FC1): a rival who began stepping away during the startup but has not yet visually crossed
 *    half the step (`config.skills.stepGrace`) is still hit;
 *  - NOTHING here kills a multiplayer fighter: every effect is a daze, a slow or a displacement (`AttackSpec.damage` is
 *    always 0). Against a CAMPAIGN victim (one carrying `Vitals`, decision CC4) the same effects land through
 *    `applyCampaignHit`, which also takes the segments of `config.campaign.playerDamage` (a Punch 1, a Bottle Strike 2 ...).
 * Everything is ticks and the match RNG is never used, so replays are identical.
 */
import { DIRS, DIR_VEC, tileAt } from '../grid';
import type { GridView } from '../grid';
import type { AttackSpec } from '../config';
import type { AttackKind, AttackLoadout, Dir, GameState, Player, SimEvent, SkillKind } from '../types';
import { Tile } from '../types';
import { CHARACTERS } from '../data/characters';
import { defaultAttacks } from '../data/fighters';
import { campaignConfig } from '../config';
import type { CampaignHitResult } from '../campaign/types';
import { recordHit } from './attribution';
import { applyCampaignHit } from './campaignDamage';
import { pushLanding } from './pushLanding';
import { enemyAfterPunch, enemyMeleeHit } from './enemyActions';
import { ENEMY_KINDS } from '../data/enemies';
import { beginStep } from './stepping';
import { isActing, playersAt, teammates } from './queries';
import { resolvePilotPunch } from './pilotCombat';

/** The fighter's original skill (their character's); kept for the menu and the HUD label. */
export const skillOf = (p: Pick<Player, 'characterId'>): SkillKind => CHARACTERS[p.characterId].skill;

/** The attack B throws next to a rival: an override, else the fighter's definition (their character's skill). */
export const primaryOf = (p: Pick<Player, 'characterId' | 'attacks'>): AttackKind =>
  p.attacks?.primary ?? skillOf(p);

/**
 * The attacks `p` throws: the overrides of `PlayerSetup.attacks`, else their `FighterDef` (the secondary only when
 * `config.skills.secondaryAttacks` is on: off in the deployed game, decision FC5).
 */
export function loadoutOf(
  p: Pick<Player, 'characterId' | 'attacks'>,
  config: Pick<GameState['config'], 'skills'>,
): AttackLoadout {
  const base = defaultAttacks(p.characterId, config.skills.secondaryAttacks);
  return {
    primary: p.attacks?.primary ?? base.primary,
    secondary: p.attacks && 'secondary' in p.attacks ? (p.attacks.secondary ?? null) : base.secondary,
  };
}

/** The read-only part of the state attack rules look at (an Observation qualifies, so bots use the same code). */
export type AttackView = GridView & {
  readonly tick: number;
  readonly players: readonly Readonly<Player>[];
  readonly config: GameState['config'];
};

type Attacker = Readonly<Pick<Player, 'characterId' | 'meleeLock' | 'id' | 'attacks' | 'enemyKind'>>;

/**
 * Decision EF3: the human's attack on a campaign ENEMY seat (never a multiplayer rival, never an enemy's attack) lands
 * through a fresh daze immunity when it takes a segment (without a new daze), and its per-target lockout is capped
 * by `config.campaign.vsEnemy`. False in every multiplayer match (no seat has an `enemyKind`).
 */
const humanOnEnemy = (
  attacker: Readonly<Pick<Player, 'enemyKind'>>,
  victim: Readonly<Pick<Player, 'enemyKind'>>,
): boolean => attacker.enemyKind === undefined && victim.enemyKind !== undefined;

/** Can `attacker` start `kind` (default: their primary) on `victim` right now? Lockout, immunities - not recovery. */
export function attackable(
  state: { readonly tick?: number; readonly config: GameState['config'] },
  tick: number,
  attacker: Attacker,
  victim: Readonly<Pick<Player, 'id' | 'dazeImmuneUntil' | 'slowImmuneUntil' | 'enemyKind'>>,
  kind: AttackKind = primaryOf(attacker),
): boolean {
  if (tick < (attacker.meleeLock[victim.id] ?? 0)) return false; // the per-target lockout
  const spec = state.config.skills.attacks[kind];
  // a pure daze has nothing to do to a victim who is still immune to one (a campaign enemy still takes the segment)
  const segment = humanOnEnemy(attacker, victim) && campaignConfig(state.config).playerDamage[kind] > 0;
  if (spec.dazeTicks > 0 && spec.displacementTiles === 0 && tick < victim.dazeImmuneUntil && !segment)
    return false;
  // ... and neither has a pure slow
  if (
    spec.slowTicks > 0 &&
    spec.dazeTicks === 0 &&
    spec.displacementTiles === 0 &&
    tick < (victim.slowImmuneUntil ?? 0)
  )
    return false;
  return true;
}

/**
 * May `kind` start now? Not while winding up, not before its own cooldown (`AttackSpec.cooldownTicks`) is over, and not
 * inside the global recovery of the last attack (`skillReadyTick`) - except a DIFFERENT attack of the loadout, which
 * waits only the short follow-up gap (`config.skills.followUpGapTicks`) and its own recovery. A fighter with one
 * attack behaves exactly as before.
 */
export const attackReady = (
  state: { readonly tick: number; readonly config: GameState['config'] },
  p: Readonly<
    Pick<Player, 'skillReadyTick' | 'attackCooldowns' | 'attackRecovery' | 'attack' | 'lastAttack'>
  >,
  kind: AttackKind,
): boolean => {
  if (p.attack !== null || state.tick < (p.attackCooldowns?.[kind] ?? 0)) return false;
  if (state.tick >= p.skillReadyTick) return true;
  const last = p.lastAttack;
  return (
    last !== null &&
    last.kind !== kind &&
    state.tick >= last.endTick + state.config.skills.followUpGapTicks &&
    state.tick >= (p.attackRecovery?.[kind] ?? 0)
  );
};

/**
 * V2 melee target: an attackable opponent (never a teammate) on the faced tile, else on another adjacent tile in
 * the fixed order up, right, down, left (when `special.meleeAnyAdjacent`). Deterministic. `ok` filters further.
 */
export function meleeTarget<P extends Readonly<Player>>(
  state: { readonly players: readonly P[]; readonly config: GameState['config'] },
  p: Readonly<Player>,
  ok: (o: P) => boolean = () => true,
): { target: P; dir: Dir } | null {
  const order: Dir[] = [
    p.facing,
    ...(state.config.special.meleeAnyAdjacent ? DIRS.filter((d) => d !== p.facing) : []),
  ];
  for (const dir of order) {
    const v = DIR_VEC[dir];
    const x = p.x + v.dx;
    const y = p.y + v.dy;
    // players in id order: the same pick every time (bots call this with their Observation)
    const target = state.players.find(
      (o) => o.alive && o.x === x && o.y === y && o.id !== p.id && !teammates(p, o) && ok(o),
    );
    if (target) return { target, dir };
  }
  return null;
}

/** The rival a PRIMARY attack by `p` could start on now (adjacent, not locked out, not pointless), or null. */
export function attackTarget<P extends Readonly<Player>>(
  state: { readonly tick: number; readonly players: readonly P[]; readonly config: GameState['config'] },
  p: Readonly<Player>,
): { target: P; dir: Dir } | null {
  return meleeTarget(state, p, (o) => attackable(state, state.tick, p, o));
}

/** A rival exactly two tiles away in the faced line with open ground between (what a reach-2 attack aims at). */
export function lineTarget<P extends Readonly<Player>>(
  state: GridView & { readonly players: readonly P[] },
  p: Readonly<Player>,
  dir: Dir,
  ok: (o: P) => boolean = () => true,
): P | null {
  const v = DIR_VEC[dir];
  if (tileAt(state, p.x + v.dx, p.y + v.dy) !== Tile.Empty) return null;
  const x = p.x + v.dx * 2;
  const y = p.y + v.dy * 2;
  return (
    state.players.find(
      (o) => o.alive && o.x === x && o.y === y && o.id !== p.id && !teammates(p, o) && ok(o),
    ) ?? null
  );
}

/** What B would throw right now: which attack, at whom, and whether it can start this tick (else B is a no-op). */
export interface AttackChoice<P extends Readonly<Player> = Readonly<Player>> {
  kind: AttackKind;
  target: P;
  dir: Dir;
  ready: boolean;
}

/**
 * The attack B starts, in the fixed order (docs/FIGHTERS_AND_ATTACKS.md section 4):
 *  1. a rival on an ADJACENT tile (faced first): the PRIMARY if it is ready, else the SECONDARY if that is ready and
 *     can hit them; neither ready = B is spent on nothing (`ready: false`, never a vehicle or a reward);
 *  2. nobody adjacent: a ready attack of REACH 2 (primary first, then secondary) on a rival exactly two tiles away
 *     in the faced line with open ground between;
 *  3. otherwise null, and the rest of B's order (rewards, vehicle voucher) applies.
 */
export function chooseAttack<P extends Readonly<Player>>(
  state: AttackView & { readonly players: readonly P[] },
  p: Readonly<Player>,
): AttackChoice<P> | null {
  const loadout = loadoutOf(p, state.config);
  const kinds: AttackKind[] = loadout.secondary ? [loadout.primary, loadout.secondary] : [loadout.primary];
  let claimed: AttackChoice<P> | null = null;
  for (const kind of kinds) {
    const adj = meleeTarget(state, p, (o) => attackable(state, state.tick, p, o, kind));
    if (!adj) continue;
    const choice = { kind, target: adj.target, dir: adj.dir, ready: attackReady(state, p, kind) };
    if (choice.ready) return choice;
    claimed ??= choice; // an adjacent rival claims B even while everything recovers
  }
  if (claimed) return claimed;
  for (const kind of kinds) {
    if (state.config.skills.attacks[kind].reach < 2 || !attackReady(state, p, kind)) continue;
    const target = lineTarget(state, p, p.facing, (o) => attackable(state, state.tick, p, o, kind));
    if (target) return { kind, target, dir: p.facing, ready: true };
  }
  return null;
}

/** Legacy `skill` intent: the faced tile only. */
export function useSkill(state: GameState, p: Player, events: SimEvent[]): void {
  if (!isActing(state, p) || p.entryUntil !== null) return;
  const v = DIR_VEC[p.facing];
  const target = playersAt(state, p.x + v.dx, p.y + v.dy).find(
    (o) => o.id !== p.id && !teammates(p, o) && attackable(state, state.tick, p, o),
  );
  if (target) beginAttack(state, p, target, p.facing, events);
}

/**
 * Starts `kind` (default: the primary) on `target` (already in reach in `dir`): the startup runs, the effect follows.
 * Returns whether it began (not while recovering from the last attack, on cooldown or already winding up).
 */
export function beginAttack(
  state: GameState,
  p: Player,
  target: Player,
  dir: Dir,
  events: SimEvent[],
  kind: AttackKind = primaryOf(p),
): boolean {
  if (!attackReady(state, p, kind)) return false;
  const spec = state.config.skills.attacks[kind];
  p.facing = dir;
  const pending = { skill: kind, targetId: target.id, resolveTick: state.tick + spec.startupTicks, dir };
  p.attack = pending;
  if (spec.cooldownTicks > 0) p.attackCooldowns[kind] = state.tick + spec.cooldownTicks; // spent even if it whiffs
  if (spec.plantedStartup) p.rootedUntil = Math.max(p.rootedUntil, pending.resolveTick); // VULNERABILITY: planted
  events.push({
    type: 'attackStarted',
    playerId: p.id,
    skill: kind,
    targetId: target.id,
    resolveTick: pending.resolveTick,
  });
  return true;
}

/** Resolves every attack whose startup is over. Runs each tick after movement (a rival who stepped away is missed). */
export function updateAttacks(state: GameState, events: SimEvent[]): void {
  for (const p of state.players) {
    if (!p.attack || state.tick < p.attack.resolveTick) continue;
    if (p.attack.pilot)
      resolvePilotPunch(state, p, events); // the combat pilot's punch (decision CP2)
    else resolveAttack(state, p, events);
  }
}

function resolveAttack(state: GameState, p: Player, events: SimEvent[]): void {
  const pending = p.attack!;
  p.attack = null;
  const spec = state.config.skills.attacks[pending.skill];
  const found = p.alive && isActing(state, p) ? pickTarget(state, p, pending, spec) : null;
  if (!found) return whiff(state, p, spec, pending.skill, events);
  const { target, dir } = found;

  // a campaign enemy's punch on a player with campaign health: the harm is campaign damage (enemyActions.ts)
  if (p.enemyKind !== undefined && target.vitals !== undefined) {
    p.facing = dir;
    enemyMeleeHit(state, p, target, dir, events);
    recover(state, p, pending.skill, spec.hitRecoveryTicks);
    p.meleeLock[target.id] = state.tick + spec.targetLockoutTicks;
    enemyAfterPunch(state, p); // the punishable window (decision EF2)
    recordHit(state, target, p.id);
    events.push({ type: 'skillUsed', playerId: p.id, skill: pending.skill, targetId: target.id });
    events.push({
      type: 'attackResolved',
      playerId: p.id,
      skill: pending.skill,
      targetId: target.id,
      hit: true,
    });
    return;
  }

  // displacement: a rival who cannot be moved at all makes a push-only attack a whiff (a blocked Shove / Kick)
  const pushOnly = spec.dazeTicks === 0 && spec.slowTicks === 0;
  let landing: { x: number; y: number; tiles: number } | null = null;
  if (spec.displacementTiles > 0) {
    landing = pushLanding(state, target, DIR_VEC[dir], spec.displacementTiles);
    if (!landing && pushOnly) return whiff(state, p, spec, pending.skill, events);
  }

  p.facing = dir;
  // a counter: the victim is planted or reeling (rooted by their own Kick / Bottle Strike wind-up, a miss or a Headbutt recoil)
  const countering = spec.counterDazeTicks > 0 && target.rootedUntil > state.tick;
  const daze = spec.dazeTicks + (countering ? spec.counterDazeTicks : 0);
  // an attack that is ONLY a daze never reaches an immune rival (pickTarget); a daze that rides on a bump is skipped
  const dazes =
    daze > 0 &&
    (state.tick >= target.dazeImmuneUntil || spec.displacementTiles === 0) &&
    !(humanOnEnemy(p, target) && state.tick < target.dazeImmuneUntil) && // EF3: the segment lands, no new daze
    !(humanOnEnemy(p, target) && ENEMY_KINDS[target.enemyKind!].steadfast); // EF4: a heavy is never dazed by it
  let landed: CampaignHitResult | null = null; // set only for a campaign victim
  if (target.vitals) {
    landed = campaignMelee(
      state,
      p,
      target,
      pending.skill,
      { dir, dazeTicks: dazes ? daze : 0, landing },
      events,
    );
    if (dazes && landed !== 'invulnerable' && landed !== 'blockedArmour' && landed !== 'blockedOkada')
      target.dazeImmuneUntil = Math.max(target.dazeImmuneUntil, target.dazedUntil + spec.dazeImmunityTicks);
  } else {
    if (landing) {
      const fromX = target.x;
      const fromY = target.y;
      beginStep(target, landing.x, landing.y, state.config.movement.pushStepTicks * landing.tiles);
      events.push({ type: 'playerPushed', playerId: target.id, byId: p.id, fromX, fromY });
    }
    if (dazes) {
      target.dazedUntil = Math.max(target.dazedUntil, state.tick + daze);
      target.dazeImmuneUntil = Math.max(target.dazeImmuneUntil, target.dazedUntil + spec.dazeImmunityTicks);
      target.entryUntil = null; // a dazed player drops out of vehicle-entry mode
      events.push({ type: 'playerDazed', playerId: target.id, byId: p.id });
    }
  }
  const reached =
    landed === null || (landed !== 'invulnerable' && landed !== 'blockedArmour' && landed !== 'blockedOkada');
  if (reached && target.alive && spec.slowTicks > 0 && state.tick >= target.slowImmuneUntil) {
    const until = Math.max(target.slow?.until ?? 0, state.tick + spec.slowTicks);
    target.slow = { until, extraStepTicks: spec.slowExtraStepTicks };
    target.slowImmuneUntil = until + spec.slowImmunityTicks;
  }
  const steadfast = humanOnEnemy(p, target) && ENEMY_KINDS[target.enemyKind!].steadfast; // EF4
  if (reached && spec.interrupts && target.attack && !steadfast) {
    target.attack = null; // a hit cuts the victim's wind-up short
    events.push({ type: 'attackInterrupted', playerId: target.id, byId: p.id });
  }
  recover(state, p, pending.skill, spec.hitRecoveryTicks);
  p.meleeLock[target.id] =
    state.tick +
    (humanOnEnemy(p, target)
      ? Math.min(spec.targetLockoutTicks, campaignConfig(state.config).vsEnemy.targetLockoutTicks)
      : spec.targetLockoutTicks);
  enemyAfterPunch(state, p);
  if (spec.hitRootTicks > 0) p.rootedUntil = Math.max(p.rootedUntil, state.tick + spec.hitRootTicks); // recoil
  if (!target.vitals) recordHit(state, target, p.id); // a campaign victim was recorded by campaignMelee, before the hit
  events.push({ type: 'skillUsed', playerId: p.id, skill: pending.skill, targetId: target.id });
  events.push({
    type: 'attackResolved',
    playerId: p.id,
    skill: pending.skill,
    targetId: target.id,
    hit: true,
  });
}

/**
 * A close attack against a campaign victim (decision CC4): the attack's segments (`config.campaign.playerDamage`; an
 * enemy never takes more than `enemyMeleeDamage` from the human), its daze and its knockback all go through the one
 * `applyCampaignHit`, so the player gets one `campaignHit` event saying what the hit did and why.
 */
function campaignMelee(
  state: GameState,
  p: Player,
  target: Player,
  kind: AttackKind,
  effects: { dir: Dir; dazeTicks: number; landing: { tiles: number } | null },
  events: SimEvent[],
): CampaignHitResult {
  const cfg = campaignConfig(state.config);
  const table = cfg.playerDamage[kind];
  const damage = p.enemyKind && !target.enemyKind ? Math.min(table, cfg.enemyMeleeDamage) : table;
  recordHit(state, target, p.id); // before the hit: a defeating blow still credits (and assists) correctly
  return applyCampaignHit(
    state,
    {
      victimId: target.id,
      byId: p.id,
      source: p.enemyKind ? 'punch' : 'player',
      damage,
      dazeTicks: effects.dazeTicks,
      knockback: effects.landing ? { dir: effects.dir, tiles: effects.landing.tiles } : null,
    },
    events,
  );
}

/** The attacker's recovery: global (`skillReadyTick`) and for this attack on its own (`attackRecovery`). */
function recover(state: GameState, p: Player, kind: AttackKind, ticks: number): void {
  p.skillReadyTick = Math.max(p.skillReadyTick, state.tick + ticks);
  p.attackRecovery[kind] = Math.max(p.attackRecovery[kind] ?? 0, state.tick + ticks);
  p.lastAttack = { kind, endTick: state.tick };
}

function whiff(state: GameState, p: Player, spec: AttackSpec, skill: AttackKind, events: SimEvent[]): void {
  recover(state, p, skill, spec.whiffRecoveryTicks);
  if (spec.whiffRootTicks > 0) p.rootedUntil = Math.max(p.rootedUntil, state.tick + spec.whiffRootTicks); // a committed miss
  enemyAfterPunch(state, p);
  events.push({ type: 'attackResolved', playerId: p.id, skill, targetId: null, hit: false });
}

/**
 * The direction from the attacker to `o` if `o` is in reach: on an adjacent tile, or (reach 2) two tiles away along
 * `lineDir` with open ground between. With step grace a rival who started stepping away and has not yet visually
 * crossed `maxShare` of the step still counts as standing on the tile they left (decision FC1).
 */
function reachDir(
  state: GameState,
  p: Readonly<Player>,
  o: Readonly<Player>,
  reach: number,
  lineDir: Dir,
): Dir | null {
  const spots: { x: number; y: number }[] = [{ x: o.x, y: o.y }];
  const g = state.config.skills.stepGrace;
  if (g.enabled && o.stepRemaining > 0 && o.stepTotal > 0 && o.stepRemaining / o.stepTotal > 1 - g.maxShare)
    spots.push({ x: o.stepFromX, y: o.stepFromY });
  // combat pilot (decision CP9): an enemy's punch also reaches a rival on the enemy's own tile
  const sameTile = state.config.combatPilot !== undefined && p.enemyKind !== undefined;
  for (const s of spots) {
    if (sameTile && s.x === p.x && s.y === p.y) return p.facing;
    for (const d of DIRS) if (p.x + DIR_VEC[d].dx === s.x && p.y + DIR_VEC[d].dy === s.y) return d;
    if (reach >= 2) {
      const v = DIR_VEC[lineDir];
      if (
        s.x === p.x + v.dx * 2 &&
        s.y === p.y + v.dy * 2 &&
        tileAt(state, p.x + v.dx, p.y + v.dy) === Tile.Empty
      )
        return lineDir;
    }
  }
  return null;
}

/** The victim when the startup ends: the one aimed at if still in reach and hittable, else any other that is. */
function pickTarget(
  state: GameState,
  p: Player,
  pending: NonNullable<Player['attack']>,
  spec: AttackSpec,
): { target: Player; dir: Dir } | null {
  const ok = (o: Player): boolean =>
    o.alive && o.id !== p.id && !teammates(p, o) && attackable(state, state.tick, p, o, pending.skill);
  const first = state.players[pending.targetId];
  if (first && ok(first)) {
    const dir = reachDir(state, p, first, spec.reach, pending.dir);
    if (dir) return { target: first, dir };
  }
  // another rival on an adjacent tile (faced tile first, as at the press), then any in reach or still on a tile they left
  const adj = meleeTarget(state, p, (o) => o !== first && ok(o));
  if (adj) return adj;
  for (const o of state.players) {
    if (o === first || !ok(o)) continue;
    const dir = reachDir(state, p, o, spec.reach, pending.dir);
    if (dir) return { target: o, dir };
  }
  return null;
}

export { recordHit };
