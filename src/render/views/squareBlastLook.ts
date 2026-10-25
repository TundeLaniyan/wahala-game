/**
 * V2 Square Blast presentation (workstream C): one colour language shared by the warning footprint under
 * a Square Blast generator, its burning square tiles and its detonation flash, so a square blast reads
 * differently from the ordinary orange plus at a glance - an electric "power surge" blue-white edged in
 * hot orange. Purely visual: the footprint itself comes from the simulation (explosions.ts).
 */
import { CanvasTexture, SRGBColorSpace } from 'three';

/** sRGB hex of the surge colour (warning frame, square flame floor glow, detonation ring). */
export const SQUARE_SURGE = 0x6fd8ff;
/** Linear-space multipliers of the surge colour for instanced colour channels. */
export const SQUARE_SURGE_LINEAR: readonly [number, number, number] = [0.16, 0.69, 1];

let frameTex: CanvasTexture | null = null;

/**
 * A square frame with corner brackets and hazard ticks: stretched over the (2r+1) x (2r+1) tiles a
 * Square Blast will cover, it marks the footprint from the moment the generator is placed.
 */
export function squareFrameTexture(): CanvasTexture {
  if (frameTex) return frameTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const inset = 10;
  const size = 256 - inset * 2;
  // soft inner wash so the area reads even where the frame is hidden behind props
  const wash = g.createLinearGradient(0, 0, 0, 256);
  wash.addColorStop(0, 'rgba(110, 216, 255, 0.10)');
  wash.addColorStop(1, 'rgba(110, 216, 255, 0.16)');
  g.fillStyle = wash;
  g.fillRect(inset, inset, size, size);
  // the frame
  g.strokeStyle = 'rgba(150, 230, 255, 0.95)';
  g.lineWidth = 6;
  g.strokeRect(inset, inset, size, size);
  // corner brackets
  g.strokeStyle = '#ffffff';
  g.lineWidth = 12;
  const arm = 46;
  for (const [x, y, dx, dy] of [
    [inset, inset, 1, 1],
    [256 - inset, inset, -1, 1],
    [inset, 256 - inset, 1, -1],
    [256 - inset, 256 - inset, -1, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(x + dx * arm, y);
    g.lineTo(x, y);
    g.lineTo(x, y + dy * arm);
    g.stroke();
  }
  // hazard ticks along each side
  g.strokeStyle = 'rgba(255, 150, 40, 0.9)';
  g.lineWidth = 5;
  for (let i = 1; i < 6; i++) {
    const p = inset + (size * i) / 6;
    for (const [x0, y0, x1, y1] of [
      [p, inset, p, inset + 14],
      [p, 256 - inset, p, 256 - inset - 14],
      [inset, p, inset + 14, p],
      [256 - inset, p, 256 - inset - 14, p],
    ] as const) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  }
  frameTex = new CanvasTexture(c);
  frameTex.colorSpace = SRGBColorSpace;
  return frameTex;
}
