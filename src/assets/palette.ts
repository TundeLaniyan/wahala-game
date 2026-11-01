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
 * Team Deathmatch team colours (index = team: 0 Green, 1 White, then spare colours for tests / future
 * multi-team modes, decision MD5). Team 2 is white / light grey, never purple: because it is light it is always
 * drawn with a dark outline (`TEAM_OUTLINE`) wherever it appears (3D kit, names, dots, scoreboard, results), so
 * it reads on a pale floor and as text. Used by the 3D team markings, the minimap and the HUD.
 */
export const TEAM_COLORS: readonly number[] = [0x1fd46a, 0xe8ecef, 0xffc61a, 0xff4a2e];
export const TEAM_CSS: readonly string[] = TEAM_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);
/** The dark outline colour of every team (hex number and CSS). */
export const TEAM_OUTLINE = 0x101418;
export const TEAM_OUTLINE_CSS = '#101418';

/** Is this team colour light enough to need its outline to read (the white team)? */
export function isLightTeam(team: number): boolean {
  if (team < 0) return false;
  const c = TEAM_COLORS[team % TEAM_COLORS.length]!;
  const lum = 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
  return lum > 170;
}

/** Text colour of a competitor, with the dark outline a light team needs to stay readable. */
export function playerTextStyle(slot: number, team: number): { color: string; textShadow?: string } {
  const color = playerCss(slot, team);
  return isLightTeam(team)
    ? {
        color,
        textShadow: `-1px -1px 0 ${TEAM_OUTLINE_CSS}, 1px -1px 0 ${TEAM_OUTLINE_CSS}, -1px 1px 0 ${TEAM_OUTLINE_CSS}, 1px 1px 0 ${TEAM_OUTLINE_CSS}, 0 0 4px ${TEAM_OUTLINE_CSS}`,
      }
    : { color };
}

/** A colour dot / chip of a competitor: the team colour with a dark ring (every team, so they match). */
export function playerDotStyle(slot: number, team: number): { background: string; boxShadow?: string } {
  const background = playerCss(slot, team);
  return team >= 0 ? { background, boxShadow: `0 0 0 1.5px ${TEAM_OUTLINE_CSS}` } : { background };
}

/** CSS colour of a competitor: the team colour in Team Rumble, else the slot colour. */
export function playerCss(slot: number, team: number): string {
  return team >= 0 ? TEAM_CSS[team % TEAM_CSS.length]! : SLOT_CSS[slot % SLOT_CSS.length]!;
}
