/**
 * What a combat-lab punch LOOKS like at each level (docs/COMBAT_TEST_LAB.md, decision CL-L9). Pure presentation data and
 * functions: they read a `CombatLabPreset` (the reach flags) and decide nothing about the fight. Each level has its own
 * identity so the founder can tell them apart without the pause menu:
 *
 *   colour   1 white, 2 cyan, 3 amber, 4 red-orange (the swing arc, the impact ring and the chip's accent);
 *   arc      a fan from the fighter: reaches 1 tile (levels 1-2) or 2 tiles (3-4), half-angle 25 degrees (the faced
 *            side only), 55 (the forward corners are in reach) or 70 (two tiles ahead and one aside);
 *   impact   ring, flash and shake grow with the level; a hit also flinches the rival.
 * A swing at the air (a whiff) is always a thin grey short arc with a puff of dust and no flash: plainly a miss.
 */
import type { CombatLabPreset } from '../sim';

/** Level accent colours (also used by the HUD chip through the same table in `ui/combatLabText.ts`). */
export const LAB_COLORS: Readonly<Record<number, number>> = {
  1: 0xffffff,
  2: 0x62e6ff,
  3: 0xffd23f,
  4: 0xff5a3c,
};
export const WHIFF_COLOR = 0x9fb0c0;

export interface SwingLook {
  color: number;
  /** Fan radius, in tiles (1.15 = just past the next tile, 2.2 = two tiles ahead). */
  radius: number;
  /** Half the fan's opening, in radians. */
  halfAngle: number;
  /** Seconds the arc stays visible. */
  life: number;
  /** Opacity of the fill and of the bright rim at the start. */
  fill: number;
  rim: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** The arc drawn at the press of an aimed punch (a rival in reach). */
export function swingLook(preset: CombatLabPreset): SwingLook {
  const halfAngle = preset.reachTwoWide ? rad(70) : preset.forwardDiagonals ? rad(55) : rad(25);
  return {
    color: LAB_COLORS[preset.level] ?? 0xffffff,
    radius: preset.reachTwo || preset.reachTwoWide ? 2.2 : 1.15,
    halfAngle,
    life: 0.14 + 0.03 * preset.level,
    fill: 0.32,
    rim: 0.95,
  };
}

/** The arc of a swing at the air: thin, short, grey, quick; the same at every level so a miss reads the same. */
export function whiffLook(preset: CombatLabPreset): SwingLook {
  return {
    color: WHIFF_COLOR,
    radius: preset.reachTwo || preset.reachTwoWide ? 1.6 : 0.95,
    halfAngle: rad(14),
    life: 0.13,
    fill: 0.14,
    rim: 0.55,
  };
}

export interface ImpactLook {
  color: number;
  /** `Effects.shockwave` max size. */
  ringSize: number;
  /** `Effects.flash` size and life; 0 = no flash. */
  flashSize: number;
  flashLife: number;
  /** Camera trauma added when the local fighter threw or took the hit (bounded again by `render/shake.ts`). */
  shake: number;
  /** Dust puffs at the rival's feet. */
  dust: number;
  /** Seconds of the rival's stumble clip (a flinch; 0 = none). */
  flinchSeconds: number;
}

/** The confirmation of a punch that connected, scaled by the level's `feedback` tier and level. */
export function impactLook(preset: CombatLabPreset): ImpactLook {
  const big = preset.feedback === 2;
  return {
    color: LAB_COLORS[preset.level] ?? 0xffffff,
    ringSize: (big ? 1.6 : 1.05) + 0.1 * preset.level,
    flashSize: big ? 1.4 + 0.2 * preset.level : 0.8,
    flashLife: big ? 0.2 : 0.14,
    shake: 0.04 + 0.03 * preset.level,
    dust: 2 + preset.level,
    flinchSeconds: 0.28,
  };
}
