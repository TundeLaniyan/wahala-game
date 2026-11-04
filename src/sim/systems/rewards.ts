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
 * - Anti-snowball (decisions AS1-AS2, `lifePerks.ts`): every upgrade paid here is a temporary life perk (12 s from
 *   the kill that granted it; a newer grant of that perk, and only it, moves its expiry), bounded by five slots
 *   (Armour, Okada and Remote Detonator take two), one perk per category, range at most two steps above the base,
 *   at most three active generators, one large upgrade (Armour, Okada, Remote, Square Blast) per kill reward and
 *   never a Remote Detonator together with a Vehicle Voucher. A death clears them (respawn.ts) and the streak
 *   restarts, so the ladder is per life.
 * - Several eliminations by one fighter in the same tick pay consecutive rungs, in event order.
 *
 * Pure and deterministic: no RNG. `previewRewards` is the HUD's "next reward" (same resolution, no effect).
 */
import type { GameConfig, RewardKind } from '../config';
import type { GameState, LifePerk, PerkCategory, PickupKind, Player, SimEvent } from '../types';
import { endPerk, perkAllowed, perkSpec, recordPerk, undoPerk } from './lifePerks';
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
  if (!perkAllowed(config, p.lifePerks, kind)) return false;
  switch (kind) {
    case 'petrol':
      return p.range < Math.min(g.maxRange, g.baseRange + config.rewards.perks.maxRangeSteps);
    case 'diesel':
      return p.range < g.dieselRange;
    case 'socket':
      return p.capacity < g.maxCapacity;
    case 'skates':
      return p.speedLevel < Math.min(config.pickups.maxSpeedLevel, config.rewards.perks.maxSpeedSteps);
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
      if (p.squareTier >= Math.min(config.square.maxTier, config.rewards.perks.maxSquareSteps)) return false;
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

/** One paid entry: the pickup, and whether it only refreshes a perk the fighter already holds at its ceiling. */
interface Paid {
  kind: PickupKind;
  refresh: boolean;
}

/**
 * Resolves one rung for a fighter: each entry becomes itself when useful and allowed, else the first useful, allowed
 * fallback. Within one rung: at most one large upgrade, never a Remote Detonator with a Vehicle Voucher. An entry that
 * nothing can replace but that the fighter already holds at its ceiling only refreshes that perk's timer (the reward
 * just earned, never the rest). `simulate` applies each grant to a scratch copy so a rung never counts the same cap
 * twice.
 */
function resolveRung(config: GameConfig, p: Readonly<Player>, rung: readonly RewardKind[]): Paid[] {
  const scratch: Player = { ...p, lifePerks: p.lifePerks.map((perk) => ({ ...perk })) };
  const out: Paid[] = [];
  const paidCategories = new Set<PerkCategory>();
  const pushedOut = new Set<PerkCategory>(); // a perk this reward made room by pushing out is not paid again in it
  let large = false;
  const fits = (kind: PickupKind): boolean => {
    if (!rewardUseful(config, scratch, kind)) return false;
    const category = perkSpec(kind)?.category;
    if (category && pushedOut.has(category)) return false;
    if (large && perkSpec(kind)?.large) return false;
    const has = (k: PickupKind): boolean => out.some((o) => o.kind === k);
    if (kind === 'voucher' && has('remote')) return false;
    if (kind === 'remote' && has('voucher')) return false;
    return true;
  };
  for (const entry of rung) {
    const want = concrete(config, scratch, entry);
    const kind = fits(want) ? want : config.rewards.fallback.find(fits);
    if (kind !== undefined) {
      out.push({ kind, refresh: false });
      if (perkSpec(kind)?.large) large = true;
      for (const gone of simulateGrant(config, scratch, kind, paidCategories)) pushedOut.add(gone.category);
      const cat = perkSpec(kind)?.category;
      if (cat) paidCategories.add(cat);
      continue;
    }
    const spec = perkSpec(want);
    if (
      spec &&
      !paidCategories.has(spec.category) &&
      scratch.lifePerks.some((perk) => perk.category === spec.category && perk.kind === want)
    )
      out.push({ kind: want, refresh: true });
  }
  return out;
}

/** Scratch-only effect of a grant (enough for `rewardUseful` on the next entry). */
function simulateGrant(
  config: GameConfig,
  p: Player,
  kind: PickupKind,
  rung: ReadonlySet<PerkCategory>,
): LifePerk[] {
  const { evicted } = recordPerk(config, p.lifePerks, kind, 0, true, rung);
  for (const gone of evicted) undoPerk(config, p, gone);
  applyScratch(config, p, kind);
  return evicted;
}

function applyScratch(config: GameConfig, p: Player, kind: PickupKind): void {
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
  return resolveRung(state.config, p, rewardsFor(state, p.stats.streak + 1)).map((o) => o.kind);
}

/** Grants the rewards of every credited elimination in this tick's events (eliminator must be alive). */
export function grantRewards(state: GameState, events: SimEvent[]): void {
  if (!state.config.rewards.enabled) return;
  if (state.match.suddenDeath?.finalPhase) return; // the final lethal phase pays nothing (decision AS6)
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
    const paidCategories = new Set<PerkCategory>(); // perks this reward paid: the next entry may not push them out
    for (const { kind, refresh } of resolveRung(state.config, killer, rewardsFor(state, streak))) {
      const cat = perkSpec(kind)?.category;
      if (refresh) {
        recordPerk(state.config, killer.lifePerks, kind, state.tick, false);
        if (cat) paidCategories.add(cat);
        events.push({ type: 'rewardGranted', playerId: killer.id, kind, kills: killer.stats.kills });
      } else if (applyPickup(state, killer, kind, events)) {
        for (const gone of recordPerk(state.config, killer.lifePerks, kind, state.tick, true, paidCategories)
          .evicted)
          endPerk(state, killer, gone);
        if (cat) paidCategories.add(cat);
        events.push({ type: 'rewardGranted', playerId: killer.id, kind, kills: killer.stats.kills });
      }
    }
  }
}
