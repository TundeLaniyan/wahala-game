/** Tiny seeded PRNG (mulberry32) for audio jitter and caption variety. Never Math.random. */
export type Rand = () => number;

export function createRand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (Number.isFinite(v) ? clamp(v, 0, 1) : 0);
/** Semitone offset -> frequency ratio. */
export const semis = (n: number): number => Math.pow(2, n / 12);
