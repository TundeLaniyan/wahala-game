/**
 * Fighter identities (decision FF1): the visible kit of each of the 32 competitor slots, so no two fighters in a
 * match share an outfit-and-colour combination even when they use the same character.
 *
 * The game has three selectable characters (sim/data/characters.ts) but City Rumble seats up to 32
 * competitors, so the same model appears many times. A slot's identity is a deterministic jersey hue rotation
 * (8 hues, 45 degrees apart) combined with a headwear style (none, cap, beanie, bucket hat) in a contrasting
 * colour: 8 x 4 = 32 distinct kits. Slot 0 is the unmodified character (the menu art and the player's own
 * fighter keep their canonical look); neighbouring slots always differ strongly in hue.
 *
 * Presentation only: stats, abilities, hitboxes and gameplay identity are untouched (nothing in `src/sim`
 * reads this). The renderer applies it in `render/assets/outfit.ts`.
 */
export type Headwear = 'none' | 'cap' | 'beanie' | 'bucket';

export interface FighterIdentity {
  slot: number;
  /** 0..7: which of the eight jersey hues. */
  hueIndex: number;
  /** Hue rotation of the character's cloth colours, in degrees (0 = the original kit). */
  hueShift: number;
  headwear: Headwear;
  /** Colour of the headwear (meaningless for `none`). */
  headwearColor: number;
  /** Unique per visible kit. */
  key: string;
}

export const IDENTITY_COUNT = 32;
const HUES = 8;
const HEADWEAR: readonly Headwear[] = ['none', 'cap', 'beanie', 'bucket'];

/** Eight strongly different accessory colours (white, black, red, yellow, cyan, orange, violet, lime). */
export const HEADWEAR_COLORS: readonly number[] = [
  0xf4f2ea, 0x141414, 0xe23228, 0xf6c218, 0x1d9bd8, 0xff7a1a, 0x8a3ffc, 0x7ad43a,
];

function build(slot: number): FighterIdentity {
  // 5 is coprime with 8: slots 0..7 walk all eight hues in an order where neighbours are far apart
  const hueIndex = (slot * 5) % HUES;
  const headwear = HEADWEAR[Math.floor(slot / HUES) % HEADWEAR.length]!;
  const headwearColor = HEADWEAR_COLORS[(hueIndex + 3) % HEADWEAR_COLORS.length]!;
  const key =
    headwear === 'none' ? `h${hueIndex}-none` : `h${hueIndex}-${headwear}-${headwearColor.toString(16)}`;
  return { slot, hueIndex, hueShift: hueIndex * (360 / HUES), headwear, headwearColor, key };
}

/** Every identity, index = competitor slot. */
export const FIGHTER_IDENTITIES: readonly FighterIdentity[] = Array.from({ length: IDENTITY_COUNT }, (_, i) =>
  build(i),
);

/** The identity of competitor `slot` (slots wrap, which only ever happens beyond the 32 supported). */
export function fighterIdentity(slot: number): FighterIdentity {
  return FIGHTER_IDENTITIES[((slot % IDENTITY_COUNT) + IDENTITY_COUNT) % IDENTITY_COUNT]!;
}

/**
 * Rotates the hue of an `r g b` triple (0..1, any gamma) by `degrees` around the grey axis: greys, whites and
 * blacks stay exactly as they are, colours keep their brightness. Pure; shared by the 3D recolour and the
 * procedural fallback.
 */
export function rotateHue(rgb: readonly [number, number, number], degrees: number): [number, number, number] {
  if (degrees % 360 === 0) return [rgb[0], rgb[1], rgb[2]];
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const k = (1 - c) / 3;
  const q = Math.sqrt(1 / 3) * s;
  const m = [
    [c + k, k - q, k + q],
    [k + q, c + k, k - q],
    [k - q, k + q, c + k],
  ] as const;
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  return [0, 1, 2].map((row) => clamp(m[row]![0] * rgb[0] + m[row]![1] * rgb[1] + m[row]![2] * rgb[2])) as [
    number,
    number,
    number,
  ];
}

/** `rotateHue` for a 0xRRGGBB colour. */
export function rotateHueHex(color: number, degrees: number): number {
  const [r, g, b] = rotateHue(
    [(color >> 16) & 255, (color >> 8) & 255, color & 255].map((v) => v / 255) as [number, number, number],
    degrees,
  );
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}
