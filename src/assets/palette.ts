/** Slot colours shared by the 3D rings and the HUD portraits so a player is recognisable everywhere. */
export const SLOT_COLORS: readonly number[] = [0x22c55e, 0xff4d4d, 0x3b82f6, 0xfacc15];
export const SLOT_CSS: readonly string[] = SLOT_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);
