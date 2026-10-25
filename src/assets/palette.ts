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

/**
 * V2 Team Rumble team colours (index = team: 0 Green, 1 White, then spare colours for tests / future
 * menus). Used by the 3D team markings, the minimap and the HUD so a team reads the same everywhere.
 */
export const TEAM_COLORS: readonly number[] = [0x1fd46a, 0xf4f1e6, 0xffc61a, 0xff4a2e];
export const TEAM_CSS: readonly string[] = TEAM_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);

/** CSS colour of a competitor: the team colour in Team Rumble, else the slot colour. */
export function playerCss(slot: number, team: number): string {
  return team >= 0 ? TEAM_CSS[team % TEAM_CSS.length]! : SLOT_CSS[slot % SLOT_CSS.length]!;
}
