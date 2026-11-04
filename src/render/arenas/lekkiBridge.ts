/**
 * Lekki - the lagoon link bridge (anchor `lekki-link-bridge`, docs/MAP_IDENTITY.md). A FICTIONAL, generic cable-stayed
 * bridge: a white pylon with two fans of stay cables over a lamp-lit deck. Presentation only; everything stands beyond
 * the promenade seawall (north of the board).
 *
 * The follow camera (41 degrees, ~7 m up) cannot see a tall far structure: a point at height h is only in frame when it is
 * within (6.8 - h) / 0.4 m of the camera. So the deck sits low and close behind the seawall (top 1.5 m, 2 tiles off the
 * edge): from the promenade the player sees the deck, its parapet and lamps, the pylon's base and the lower stays climbing
 * out of the top of the frame; the whole-board overview shows the full pylon and both fans.
 */
import { BoxGeometry, Vector3 } from 'three';
import type { Material, Mesh } from 'three';
import { box, cyl, mat, mesh } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import { tagAnchor } from './anchors';

const ID = 'lekki-link-bridge';

/** A bar of square section `t` from `a` to `b`. */
function strut(a: Vector3, b: Vector3, t: number, m: Material): Mesh {
  const len = a.distanceTo(b);
  const bar = mesh(new BoxGeometry(t, t, len), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  bar.lookAt(b);
  return bar;
}

export interface LinkBridgeOpts {
  /** world x of the pylon */
  px: number;
  /** world z of the deck's centre line (north of the board) */
  z: number;
  /** half length of the deck along x */
  half: number;
}

export function linkBridge(ctx: SetContext, o: LinkBridgeOpts): void {
  const s = ctx.statics;
  const add = (m: Mesh): Mesh => {
    s.add(m);
    return m;
  };
  const white = mat(0xf4f4ee, { roughness: 0.55 });
  const stay = mat(0xf0f0e8, { roughness: 0.5 });
  const conc = mat(0xc4c2b8, { roughness: 1, flat: false });
  const dark = mat(0x34363a, { roughness: 0.9 });
  const len = o.half * 2;
  const DECK = 1.5;
  const WIDTH = 3.0;
  const z0 = o.z;
  let first = true;
  const keep = (m: Mesh): Mesh => {
    if (first) tagAnchor(m, ID);
    first = false;
    return add(m);
  };

  // deck slab, road surface, lane line, parapets, piers
  keep(box(len, 0.5, WIDTH, conc, 0, DECK - 0.25, z0));
  add(box(len, 0.05, WIDTH - 0.7, dark, 0, DECK + 0.02, z0));
  add(
    box(
      len,
      0.02,
      0.08,
      mat(0xf2d24a, { roughness: 0.6, emissive: 0x8a7010, emissiveIntensity: 0.5 }),
      0,
      DECK + 0.06,
      z0,
    ),
  );
  for (const sd of [-1, 1]) {
    add(box(len, 0.42, 0.3, white, 0, DECK + 0.2, z0 + (sd * (WIDTH - 0.3)) / 2));
    add(box(len, 0.06, 0.1, white, 0, DECK + 0.68, z0 + (sd * (WIDTH - 0.3)) / 2));
  }
  for (let x = -o.half + 3; x < o.half; x += 11)
    add(box(1.0, DECK - STREET - 0.4, 2.2, conc, x, STREET + (DECK - STREET - 0.4) / 2, z0));

  // the pylon: two slim legs (depth-wise), cross struts, a cap and a red aviation light
  const H = 27;
  for (const sd of [-1, 1]) {
    add(box(0.9, H, 0.7, white, o.px, DECK + H / 2 - 0.2, z0 + sd * 1.55));
    add(box(0.5, 0.5, 0.5, white, o.px, DECK + H + 0.1, z0 + sd * 1.55));
  }
  for (const y of [4.2, 11, 19]) add(box(1.0, 0.7, 3.6, white, o.px, DECK + y, z0));
  add(
    box(
      0.5,
      0.5,
      0.5,
      mat(0xff3020, { emissive: 0xff3020, emissiveIntensity: 1.6, roughness: 0.4 }),
      o.px,
      DECK + H + 0.6,
      z0,
    ),
  );

  // two fans of stay cables from the pylon head to the deck, on both sides and both legs
  const FAN = 9;
  for (let i = 0; i < FAN; i++) {
    const top = DECK + 12 + i * 1.55;
    const run = 5 + i * 5.6;
    for (const dx of [-1, 1])
      for (const sd of [-1, 1]) {
        const a = new Vector3(o.px + dx * 0.5, top, z0 + sd * 1.55);
        const b = new Vector3(o.px + dx * run, DECK + 0.4, z0 + sd * 1.35);
        add(strut(a, b, 0.11, stay));
      }
  }

  // deck lamps
  const glow = mat(0xffe2a8, { emissive: 0xffd488, emissiveIntensity: 1.2, roughness: 0.4 });
  for (let x = -o.half + 6; x < o.half; x += 9) {
    for (const sd of [-1, 1]) {
      add(cyl(0.05, 0.07, 2.6, dark, x, DECK + 1.3, z0 + sd * 1.35, 5));
      add(box(0.32, 0.1, 0.18, glow, x, DECK + 2.6, z0 + sd * 1.35));
    }
  }
  // a few buses crossing: the deck is a working road
  ctx.vehicles('danfo', [
    { x: o.px - 22, y: DECK, z: z0 + 0.7, ry: Math.PI / 2 },
    { x: o.px + 15, y: DECK, z: z0 - 0.7, ry: -Math.PI / 2 },
    { x: o.px + 38, y: DECK, z: z0 + 0.7, ry: Math.PI / 2 },
  ]);
}
