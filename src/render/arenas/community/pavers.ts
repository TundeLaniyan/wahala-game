/**
 * Interlocking concrete road pavers (presentation only; Lekki's Admiralty Way, docs/LEKKI_ADMIRALTY_WAY.md).
 *
 * An ORIGINAL procedural material: zig-zag ("Z" / uni-pave) blocks, each a rectangle with two stepped notches so that
 * neighbours in a row lock into each other, laid in rows with every second row shifted by half a period (the pattern of
 * the founder's close-up reference, never its pixels). Painted into the arena's ONE floor canvas, so it adds no mesh,
 * no draw call and no texture: the cost is the same canvas upload as before.
 *
 * Scale is deliberately larger than life. A real block is about 20 x 10 cm (a 3 m tile = 0.07 x 0.03 tile) but the floor
 * canvas of a big board is about 45 px per tile, where that would be sub-pixel noise that shimmers. Here a block is
 * 0.36 x 0.18 tile (about 16 x 8 texels): readable at the gameplay camera, still clearly small against a 1-tile lane.
 * Joints are low-contrast and tone variation is a few percent, to keep the surface calm under mip-mapping.
 */
import type { Ctx } from '../floorKit';
import { T } from '../floorKit';

export interface PaverStyle {
  /** Block length along the row, in floor-canvas pixels at T = 128 per tile. */
  length: number;
  /** Row height (block width). */
  height: number;
  /** Mean block colour. */
  tone: [number, number, number];
  /** Block-to-block lightness variation (+/- levels). */
  variation: number;
  /** The joint (grout) colour. */
  joint: string;
  jointWidth: number;
}

/**
 * The Admiralty Way paving: pale to medium grey concrete (founder photographs). A touch darker than the first pass so
 * the carriageway reads as road against Lekki's pale pavements in daylight, still far from asphalt.
 */
export const ADMIRALTY_PAVERS: PaverStyle = {
  length: 0.36 * T,
  height: 0.18 * T,
  tone: [146, 147, 143],
  variation: 9,
  joint: 'rgba(84,86,84,0.88)',
  jointWidth: 2.4,
};

/** The notch geometry of one block, as fractions of its length and height (a stepped "Z"). */
const NOTCH_X = 0.3;
const MID_Y = 0.5;

/** Horizontal period of the block lattice: the notches interlock at this step. */
export const periodOf = (s: Pick<PaverStyle, 'length'>): number => s.length * (1 - NOTCH_X);

/** The outline of one block whose top-left of its bounding box is at (x, y): a stepped Z. */
export function blockOutline(
  x: number,
  y: number,
  s: Pick<PaverStyle, 'length' | 'height'>,
): [number, number][] {
  const L = s.length;
  const h = s.height;
  const a = L * (1 - NOTCH_X);
  const b = L * NOTCH_X;
  const m = h * MID_Y;
  return [
    [x, y],
    [x + a, y],
    [x + a, y + m],
    [x + L, y + m],
    [x + L, y + h],
    [x + b, y + h],
    [x + b, y + m],
    [x, y + m],
  ];
}

/** Row `row` of the lattice covering [x0, x1] (pixels): the blocks overlapping it, every second row shifted by half a period. */
export function rowBlocks(
  x0: number,
  x1: number,
  y: number,
  row: number,
  s: Pick<PaverStyle, 'length' | 'height'>,
): [number, number][][] {
  const p = periodOf(s);
  const shift = (row % 2) * p * 0.5;
  const first = Math.floor((x0 - s.length - shift) / p);
  const out: [number, number][][] = [];
  for (let i = first; ; i++) {
    const x = i * p + shift;
    if (x > x1) break;
    out.push(blockOutline(x, y, s));
  }
  return out;
}

/** A tile rectangle (inclusive tile coordinates). */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Paints the pavers over a tile rectangle: the joint colour first, then every block, clipped to the rectangle.
 * `r` is the floor's seeded random, so the result is identical on every load.
 */
export function paintPavers(
  g: Ctx,
  rg: Ctx,
  rect: TileRect,
  r: () => number,
  s: PaverStyle = ADMIRALTY_PAVERS,
): void {
  const px0 = rect.x0 * T;
  const py0 = rect.y0 * T;
  const px1 = (rect.x1 + 1) * T;
  const py1 = (rect.y1 + 1) * T;
  g.save();
  g.beginPath();
  g.rect(px0, py0, px1 - px0, py1 - py0);
  g.clip();
  g.fillStyle = s.joint;
  g.fillRect(px0, py0, px1 - px0, py1 - py0);
  g.lineJoin = 'miter';
  g.lineWidth = s.jointWidth;
  g.strokeStyle = s.joint;
  for (let row = 0, y = py0 - s.height; y < py1; row++, y += s.height) {
    for (const poly of rowBlocks(px0, px1, y, row, s)) {
      const v = (r() - 0.5) * 2 * s.variation;
      g.fillStyle = `rgb(${Math.round(s.tone[0] + v)},${Math.round(s.tone[1] + v)},${Math.round(s.tone[2] + v - 1)})`;
      g.beginPath();
      poly.forEach(([x, yy], i) => (i === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy)));
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  // a faint dusty wash so the grey is not flat, and rougher than asphalt (concrete grain)
  g.fillStyle = 'rgba(214,208,192,0.05)';
  g.fillRect(px0, py0, px1 - px0, py1 - py0);
  g.restore();
  rg.fillStyle = 'rgb(205,205,205)';
  rg.fillRect(px0, py0, px1 - px0, py1 - py0);
}
