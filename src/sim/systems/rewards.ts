/**
 * V2 City Rumble elimination economy (decisions WC1-WC3). Crates only open routes in Rumble; power comes
 * from eliminations and is granted IMMEDIATELY to the living credited eliminator (nothing is dropped for
 * a camper to steal).
 *
 * - The n-th credited elimination of the current life (`stats.streak`) pays rung n of `rewards.ladder`;
 *   past its end the rungs from `repeatFrom` cycle, so a top fighter keeps growing all match.
 * - A rung entry that would do nothing (capped, already owned, Okada already ridden, a contact ability
 *   already equipped) is replaced by the first `rewards.fallback` kind that still helps: every credited
 *   elimination pays.
 * - `contact` = the character's signature contact tool (`rewards.contactByCharacter`) for a fighter with
 *   none; a Disarm holder gets its charges topped up instead. A different equipped tool is never replaced.
 * - Survival keeps everything (snowballing is intended); respawn modes reset upgrades on death (respawn.ts)
 *   and the streak restarts, so the ladder is per life there.
 * - Several eliminations by one fighter in the same tick pay consecutive rungs, in event order.
 *
 * Pure and deterministic: no RNG. `previewRewards` is the HUD's "next reward" (same resolution, no effect).
 */
import type { GameConfig, RewardKind } from '../config';
import type { GameState, PickupKind, Player, SimEvent } from '../types';
import { radialRadius, radialSquareRadius } from './blastShape';
import { applyPickup } from './pickups';

/** The ladder rung for the `streak`-th elimination of a life (1-based). Empty for 0 / no ladder. */
export function rewardsFor(state: { config: GameConfig }, streak: number): RewardKind[] {
  const { ladder, repeatFrom } = state.config.rewards;
  if (streak <= 0 || ladder.length === 0) return [];
  if (streak <= ladder.length) return ladder[streak - 1]!;
  const from = Math.min(Math.max(0, repeatFrom), ladder.length - 1);
  const cycle = ladder.length - from;
  return ladder[from + ((streak - 1 - ladder.length) % cycle)]!;
}

/** Would granting `kind` to `p` change anything? Mirrors applyPickup's caps without touching the player. */
export function rewardUseful(config: GameConfig, p: Readonly<Player>, kind: PickupKind): boolean {
  const g = config.generator;
  switch (kind) {
    case 'petrol':
      return p.range < g.maxRange;
    case 'diesel':
      return p.range < g.dieselRange;
    case 'socket':
      return p.capacity < g.maxCapacity;
    case 'skates':
      return p.speedLevel < config.pickups.maxSpeedLevel;
    case 'boots':
      return p.contact === null;
    case 'gloves':
      return p.contact === null;
    case 'bombpass':
      return p.contact === null;
    case 'killswitch':
      return (
        p.contact === null ||
        (p.contact === 'disarm' && p.killSwitchCharges < config.pickups.maxKillSwitchCharges)
      );
    case 'armour':
      return p.armour < config.protection.maxArmour;
    case 'square':
      if (p.squareTier >= config.square.maxTier) return false;
      // radial blasts (decision RE-C4): a tier that would not change the footprint (the square is already as
      // wide as the cap allows) is a wasted reward, so it falls back to something that does help
      if (g.blastMode === 'radial' && p.squareTier > 0) {
        const r = radialRadius(p.range, g.maxRange);
        return (
          radialSquareRadius(r, p.squareTier + 1, g.radialMaxSquareRadius) >
          radialSquareRadius(r, p.squareTier, g.radialMaxSquareRadius)
        );
      }
      return true;
    case 'remote':
      return !p.remote;
    case 'sneakers':
      return !p.sneakers;
    case 'hotfuel':
      return !p.hotFuel;
    case 'okada':
      return !p.mounted;
    case 'voucher':
      return !p.hasVoucher;
    case 'grip':
    case 'curse':
      return false; // never a reward (Carry is out of normal play; curses are not prizes)
  }
}

/** The concrete pickup a ladder entry stands for, for this fighter (null = none of its own applies). */
function concrete(config: GameConfig, p: Readonly<Player>, kind: RewardKind): PickupKind {
  if (kind !== 'contact') return kind;
  return p.contact === 'disarm' ? 'killswitch' : config.rewards.contactByCharacter[p.characterId];
}

/**
 * Resolves one rung for a fighter: each entry becomes itself when useful, else the first useful fallback.
 * `simulate` applies each grant to a scratch copy so a rung never counts the same cap twice.
 */
function resolveRung(config: GameConfig, p: Readonly<Player>, rung: readonly RewardKind[]): PickupKind[] {
  const scratch: Player = { ...p };
  const out: PickupKind[] = [];
  for (const entry of rung) {
    const want = concrete(config, scratch, entry);
    const kind = rewardUseful(config, scratch, want)
      ? want
      : config.rewards.fallback.find((k) => rewardUseful(config, scratch, k));
    if (kind === undefined) continue;
    out.push(kind);
    simulateGrant(config, scratch, kind);
  }
  return out;
}

/** Scratch-only effect of a grant (enough for `rewardUseful` on the next entry). */
function simulateGrant(config: GameConfig, p: Player, kind: PickupKind): void {
  switch (kind) {
    case 'petrol':
      p.range = Math.min(config.generator.maxRange, p.range + 1);
      break;
    case 'diesel':
      p.range = config.generator.dieselRange;
      break;
    case 'socket':
      p.capacity++;
      break;
    case 'skates':
      p.speedLevel++;
      break;
    case 'boots':
      p.contact = 'kick';
      break;
    case 'gloves':
      p.contact = 'punch';
      break;
    case 'bombpass':
      p.contact = 'pass';
      break;
    case 'killswitch':
      p.contact = 'disarm';
      p.killSwitchCharges = Math.min(
        config.pickups.maxKillSwitchCharges,
        p.killSwitchCharges + config.pickups.killSwitchCharges,
      );
      break;
    case 'armour':
      p.armour++;
      break;
    case 'square':
      p.squareTier++;
      break;
    case 'remote':
      p.remote = true;
      break;
    case 'sneakers':
      p.sneakers = true;
      break;
    case 'hotfuel':
      p.hotFuel = true;
      break;
    case 'okada':
      p.mounted = true;
      break;
    case 'voucher':
      p.hasVoucher = true;
      break;
    case 'grip':
    case 'curse':
      break;
  }
}

/** What this fighter's NEXT credited elimination would pay right now (HUD preview; [] when rewards are off). */
export function previewRewards(state: { config: GameConfig }, p: Readonly<Player>): PickupKind[] {
  if (!state.config.rewards.enabled) return [];
  return resolveRung(state.config, p, rewardsFor(state, p.stats.streak + 1));
}

/** Grants the rewards of every credited elimination in this tick's events (eliminator must be alive). */
export function grantRewards(state: GameState, events: SimEvent[]): void {
  if (!state.config.rewards.enabled) return;
  const credited = events.filter(
    (e): e is Extract<SimEvent, { type: 'playerEliminated' }> =>
      e.type === 'playerEliminated' && e.creditId !== null,
  );
  // a fighter with k eliminations this tick has streak s..s+k-1 -> s+k already counted: pay rungs in order
  const total = new Map<number, number>();
  for (const e of credited) total.set(e.creditId!, (total.get(e.creditId!) ?? 0) + 1);
  const paid = new Map<number, number>();
  for (const e of credited) {
    const killer = state.players[e.creditId!];
    if (!killer || !killer.alive) continue; // fell in the same tick (or before): nothing to hand over
    const n = paid.get(killer.id) ?? 0;
    paid.set(killer.id, n + 1);
    const streak = killer.stats.streak - total.get(killer.id)! + n + 1;
    for (const kind of resolveRung(state.config, killer, rewardsFor(state, streak))) {
      if (applyPickup(state, killer, kind, events))
        events.push({ type: 'rewardGranted', playerId: killer.id, kind, kills: killer.stats.kills });
    }
  }
}
