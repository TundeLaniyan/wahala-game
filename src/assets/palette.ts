/** Slot colours shared by the 3D rings and the HUD portraits so a player is recognisable everywhere. */
const BASE_SLOTS = [0x22c55e, 0xff4d4d, 0x3b82f6, 0xfacc15];

/** HSL (0..1) -> 0xRRGGBB. */
function hsl(h: number, s: number, l: number): number {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/**
 * 32 slot colours: the four classic ones, then City Rumble colours spread around the hue wheel by
 * the golden angle in two lightness bands so neighbouring slots never look alike.
 */
export const SLOT_COLORS: readonly number[] = [
  ...BASE_SLOTS,
  ...Array.from({ length: 28 }, (_, i) => hsl((0.11 + i * 0.381966) % 1, 0.78, i % 2 === 0 ? 0.58 : 0.44)),
];
export const SLOT_CSS: readonly string[] = SLOT_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);
