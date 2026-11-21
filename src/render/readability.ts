/**
 * A cheap, code-side READABILITY index of an arena look (docs/CLASSIC_LIGHTING.md, decision NL2): roughly how bright
 * the playable floor reads on screen under the look's lights, on a given quality preset, through the fog at the fixed
 * camera's distance. It mirrors what `lighting.ts` does per preset (Low drops the point lamps and lifts the hemisphere
 * fill x1.3 for a look that has lamps) so a look tuned on High cannot quietly go muddy on Low. It is a guard rail for the
 * tests, calibrated against the rendered-pixel measurement of `scripts/classic-lighting-shots.mjs` (the real check).
 *
 * Pure: no DOM, no Three objects.
 */
import type { ArenaLook } from './arenaLook';

/** Relative luminance (Rec. 709) of a 0xRRGGBB colour, 0..1 (on the sRGB code values, as the eye compares). */
export function lum(c: number): number {
  return (0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff)) / 255;
}

/** The whole-arena camera's distance to the board centre (world units; `cameraRig.ts` frames a 15 x 11 board at ~20). */
export const BOARD_CAMERA_DISTANCE = 20;

/** Lamp contribution to the floor, averaged over a 15 x 11 board (three's point light: intensity / d^decay, cut at 14). */
function lampLight(look: ArenaLook): number {
  let sum = 0;
  let n = 0;
  for (let gy = 0; gy < 11; gy++)
    for (let gx = 0; gx < 15; gx++) {
      const x = gx - 7;
      const z = gy - 5;
      let e = 0;
      for (const [lx, ly, lz, color] of look.lamps) {
        const d = Math.hypot(x - lx, ly, z - lz);
        if (d >= 14) continue;
        const cut = Math.pow(Math.max(0, 1 - Math.pow(d / 14, 4)), 2);
        e += ((42 * lum(color)) / Math.pow(Math.max(d, 0.5), 1.5)) * cut * (ly / d);
      }
      sum += e;
      n++;
    }
  return sum / n;
}

/** How much of the board the fog has eaten at the camera's distance (linear `Fog`, 0 = clear). */
export function boardFog(look: ArenaLook, distance = BOARD_CAMERA_DISTANCE): number {
  const { near, far } = look.fog;
  return Math.min(1, Math.max(0, (distance - near) / Math.max(1e-6, far - near)));
}

/**
 * The index: light reaching the floor (hemisphere sky term, the sun's vertical share, the lamps on High) x the floor's
 * albedo tint x exposure, then mixed with the fog colour by `boardFog`. About 1 is the approved Danfo Bus Park; below
 * ~0.6 a board reads muddy on a phone.
 */
export function readabilityIndex(look: ArenaLook, quality: 'low' | 'high'): number {
  const lamps = look.lamps.length > 0;
  const hemiK = quality === 'low' && lamps ? 1.3 : 1;
  const [sx, sy, sz] = look.sun.position;
  const cos = sy / Math.hypot(sx, sy, sz);
  const hemi = look.hemi.intensity * hemiK * (0.75 * lum(look.hemi.sky) + 0.25 * lum(look.hemi.ground));
  const sun = look.sun.intensity * lum(look.sun.color) * cos * 0.32;
  const lamp = quality === 'high' ? lampLight(look) * 0.32 : 0;
  const floor = (hemi + sun + lamp) * lum(look.floorTint) * look.exposure;
  const f = boardFog(look);
  return floor * (1 - f) + lum(look.fog.color) * 2.2 * f;
}
