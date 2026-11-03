/**
 * Kill-earned power is temporary and bounded (decisions AS1-AS2). Every upgrade the elimination ladder pays is a
 * "life perk":
 *
 *  - it lasts `rewards.perks.lifeTicks` from the kill that granted it; a newer grant of THAT perk moves its expiry,
 *    nothing else does (no blanket refresh of the inventory);
 *  - a fighter has `maxSlots` slots; a major perk (Armour, Okada, Remote Detonator) takes `majorSlots`, any other
 *    perk takes one. A new perk that does not fit pushes out the OLDEST perks until it does, so the newest kill
 *    always pays and the total never passes the cap;
 *  - one perk per category: range, capacity, speed, tool, blast, shield (Armour OR Okada) and detonation. A second
 *    grant in a category is another STEP of the same perk (range may rise two steps above the base) or nothing;
 *  - one "large" upgrade (Armour, Okada, Remote, Square Blast) per kill reward, and never a Remote Detonator with a
 *    Vehicle Voucher in the same reward;
 *  - a death clears them all (respawn.ts); expiry undoes exactly the steps the perk gave.
 *
 * The Vehicle Voucher is a one-use item, not a perk: no slot, no expiry. Pure and deterministic.
 */
import type { GameConfig } from '../config';
import type { GameState, LifePerk, PerkCategory, PickupKind, Player } from '../types';

interface PerkSpec {
  category: PerkCategory;
  /** Takes `majorSlots` instead of one. */
  major: boolean;
  /** Counts as a "large power upgrade": at most one per kill reward. */
  large: boolean;
}

const NONE: ReadonlySet<PerkCategory> = new Set();

const MINOR = (category: PerkCategory): PerkSpec => ({ category, major: false, large: false });

/** The pickups that are life perks. Anything absent (Vehicle Voucher ...) is not one. */
export const PERK_SPEC: Readonly<Partial<Record<PickupKind, PerkSpec>>> = {
  petrol: MINOR('range'),
  socket: MINOR('capacity'),
  skates: MINOR('speed'),
  boots: MINOR('tool'),
  gloves: MINOR('tool'),
  bombpass: MINOR('tool'),
  killswitch: MINOR('tool'),
  square: { category: 'blast', major: false, large: true },
  armour: { category: 'shield', major: true, large: true },
  okada: { category: 'shield', major: true, large: true },
  remote: { category: 'detonation', major: true, large: true },
};

export const perkSpec = (kind: PickupKind): PerkSpec | undefined => PERK_SPEC[kind];

export const slotsUsed = (perks: readonly LifePerk[]): number => perks.reduce((n, p) => n + p.slots, 0);

/** The most steps the rewards may give in this category (1 = a single step). */
function maxSteps(config: GameConfig, category: PerkCategory): number {
  const g = config.generator;
  const k = config.rewards.perks;
  switch (category) {
    case 'range':
      return Math.min(k.maxRangeSteps, g.maxRange - g.baseRange);
    case 'capacity':
      return g.maxCapacity - g.baseCapacity;
    case 'speed':
      return Math.min(k.maxSpeedSteps, config.pickups.maxSpeedLevel);
    case 'blast':
      return Math.min(k.maxSquareSteps, config.square.maxTier);
    default:
      return 1;
  }
}

/**
 * May this pickup be granted to a fighter who holds `perks`? Non-perks are always allowed (their own usefulness
 * rules apply). A perk is allowed when its category has a step left (a held perk gains a step, a new one needs a
 * slot made by `recordPerk`) and Armour and Okada do not meet (one shield).
 */
export function perkAllowed(config: GameConfig, perks: readonly LifePerk[], kind: PickupKind): boolean {
  const spec = perkSpec(kind);
  if (!spec) return true;
  const held = perks.find((p) => p.category === spec.category);
  if (held) {
    if (spec.category === 'shield') return false; // Armour OR Okada, one at a time
    return held.level < maxSteps(config, spec.category);
  }
  return maxSteps(config, spec.category) > 0;
}

/**
 * Records a grant in `perks` (a new perk, one more step of the held one, or just a newer expiry). A new perk that
 * does not fit pushes out the oldest perks (returned, already removed from `perks`; the caller undoes their effect).
 */
export function recordPerk(
  config: GameConfig,
  perks: LifePerk[],
  kind: PickupKind,
  now: number,
  stepped = true,
  protect: ReadonlySet<PerkCategory> = NONE,
): { perk: LifePerk | null; evicted: LifePerk[] } {
  const spec = perkSpec(kind);
  if (!spec) return { perk: null, evicted: [] };
  const expiresAt = now + config.rewards.perks.lifeTicks;
  const held = perks.find((p) => p.category === spec.category);
  if (held) {
    if (stepped) held.level++;
    held.expiresAt = expiresAt; // the reward just earned, and only it
    return { perk: held, evicted: [] };
  }
  const slots = spec.major ? config.rewards.perks.majorSlots : 1;
  const evicted: LifePerk[] = [];
  while (slotsUsed(perks) + slots > config.rewards.perks.maxSlots) {
    // the oldest perk goes first, but never one the same kill reward has just paid
    let oldest = -1;
    for (let i = 0; i < perks.length; i++) {
      if (protect.has(perks[i]!.category)) continue;
      if (oldest < 0 || perks[i]!.expiresAt < perks[oldest]!.expiresAt) oldest = i;
    }
    if (oldest < 0) break;
    evicted.push(...perks.splice(oldest, 1));
  }
  const perk: LifePerk = { category: spec.category, kind, level: 1, slots, since: now, expiresAt };
  perks.push(perk);
  return { perk, evicted };
}

/** Undoes the numbers a perk gave (the part a scratch copy of a fighter shares with the real one). */
export function undoPerk(config: GameConfig, p: Player, perk: LifePerk): void {
  const g = config.generator;
  switch (perk.category) {
    case 'range':
      p.range = Math.max(g.baseRange, p.range - perk.level);
      break;
    case 'capacity':
      p.capacity = Math.max(1, p.capacity - perk.level);
      break;
    case 'speed':
      p.speedLevel = Math.max(0, p.speedLevel - perk.level);
      break;
    case 'tool':
      p.contact = null;
      p.killSwitchCharges = 0;
      break;
    case 'blast':
      p.squareTier = Math.max(0, p.squareTier - perk.level);
      break;
    case 'shield':
      if (perk.kind === 'okada') p.mounted = false;
      else p.armour = Math.max(0, p.armour - perk.level);
      break;
    case 'detonation':
      p.remote = false;
      break;
  }
}

/** A perk ended (time, a spent shield, or pushed out by a newer one): undo it, and let waiting remote generators go off. */
export function endPerk(state: GameState, p: Player, perk: LifePerk): void {
  undoPerk(state.config, p, perk);
  if (perk.category !== 'detonation') return;
  // generators waiting for the trigger go off on an ordinary fuse instead of hanging on
  for (const gen of state.generators) {
    if (gen.ownerId === p.id && gen.mode === 'remote') {
      gen.mode = 'timed';
      gen.timer = Math.min(gen.timer, state.config.generator.fuseTicks);
    }
  }
}

/** Ends every perk whose time is up (alive fighters only; a death already cleared them). */
export function updateLifePerks(state: GameState): void {
  if (!state.config.rewards.enabled) return;
  for (const p of state.players) {
    if (!p.alive || p.lifePerks.length === 0) continue;
    // a shield that took its hit has nothing left to give: it frees its slots without waiting for the clock
    const spent = (perk: LifePerk): boolean =>
      perk.category === 'shield' && (perk.kind === 'okada' ? !p.mounted : p.armour <= 0);
    const ended = p.lifePerks.filter((perk) => state.tick >= perk.expiresAt || spent(perk));
    if (ended.length === 0) continue;
    p.lifePerks = p.lifePerks.filter((perk) => !ended.includes(perk));
    for (const perk of ended) endPerk(state, p, perk);
  }
}

/** A death (or a fresh life): no perk survives. The caller resets the numbers they gave. */
export function clearLifePerks(p: Player): void {
  p.lifePerks = [];
}
