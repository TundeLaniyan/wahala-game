/** Day / night looks of the researched communities: the same geometry, only light, sky, fog and lamps change. */
import type { ArenaLook } from '../../arenaLook';

/**
 * The night look of a day look: a cool moon / floodlight key, a bluer sky and fog, a lifted hemisphere so the floor
 * stays readable on a phone, the day's own tints kept (so a market is still that market) and warm lamps. Never so
 * dark that the hazard lanes are lost (tests/render/researched-looks.test.ts holds a floor of ground light).
 */
export function nightLookOf(
  day: ArenaLook,
  lamps: ArenaLook['lamps'],
  o: { sky?: number; fog?: number } = {},
): ArenaLook {
  return {
    ...day,
    sky: o.sky ?? 0x121a2a,
    fog: { color: o.fog ?? 0x1a2438, near: day.fog.near * 0.8, far: day.fog.far * 0.9 },
    sun: {
      color: 0xcdd8ff,
      intensity: 3.8,
      position: [-day.sun.position[0], day.sun.position[1], day.sun.position[2]],
    },
    hemi: { sky: 0x7280b0, ground: 0x40342a, intensity: 1.35 },
    envIntensity: Math.min(0.45, day.envIntensity),
    exposure: 1.14,
    floorTint: day.floorTint,
    lamps,
  };
}
