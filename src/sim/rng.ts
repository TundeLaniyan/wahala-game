/**
 * Seeded pseudo-random numbers (mulberry32). The generator state is a single integer so it can
 * live inside any serialisable state object. The simulation must never call Math.random().
 */
export interface RngHolder {
  rngState: number;
}

export function seedToState(seed: number): number {
  return seed >>> 0 || 0x9e3779b9;
}

/** Advances the holder and returns a float in [0, 1). */
export function nextFloat(holder: RngHolder): number {
  holder.rngState = (holder.rngState + 0x6d2b79f5) >>> 0;
  let t = holder.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, maxExclusive). */
export function nextInt(holder: RngHolder, maxExclusive: number): number {
  return Math.floor(nextFloat(holder) * maxExclusive);
}

export function pick<T>(holder: RngHolder, items: readonly T[]): T {
  return items[nextInt(holder, items.length)]!;
}

export function shuffle<T>(holder: RngHolder, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(holder, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Picks a key with probability proportional to its weight. */
export function weightedPick<K extends string>(holder: RngHolder, weights: Readonly<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = nextFloat(holder) * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1]![0];
}

/** Standalone seeded generator for code outside the simulation (e.g. AI decision noise). */
export function createRng(seed: number): RngHolder {
  return { rngState: seedToState(seed) };
}
