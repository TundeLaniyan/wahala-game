/**
 * A pedestrian footbridge over a road that leaves the board (presentation only; map-identity anchors `mushin-footbridge`
 * and `fadeyi-footbridge`, docs/MAP_IDENTITY.md). The bridge crosses along z at a fixed world x just beyond the board's
 * side wall, a deck on stair towers with a stair run at both ends, side rails and a name board; two styles share it:
 *
 * - `concrete`: a solid concrete deck and stair towers with steel handrails (Fadeyi);
 * - `steel`: a steel deck with a red-and-white painted fascia and plates (the Mushin Red Line access bridge).
 *
 * The deck is kept low (about 4 m, a game-scale bridge) so the follow camera, which cannot see a point 6 m up beyond the
 * focus, still shows the stairs and the deck from the road mouth. Everything stands off the board.
 */
import type { Mesh } from 'three';
import { box, mat } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import { tagAnchor } from './anchors';
import { plaque, lettered } from './community/setKit';

export interface FootbridgeOpts {
  /** anchor id tagged on the first mesh */
  anchor: string;
  /** world x of the bridge's centre line */
  x: number;
  /** world z of the north and south ends of the level deck */
  z0: number;
  z1: number;
  /** deck top height (m) */
  deck: number;
  style: 'concrete' | 'steel';
  /** name board text on the deck sides (fictional / generic wording) */
  sign: string;
  /** board colours */
  signBg: string;
  signFg: string;
}

export function footbridge(ctx: SetContext, o: FootbridgeOpts): void {
  const s = ctx.statics;
  const steel = o.style === 'steel';
  const body = mat(steel ? 0xe8e8e2 : 0xb6b2a8, { roughness: steel ? 0.5 : 1, flat: false });
  const accent = mat(steel ? 0xb8322a : 0x8a867c, { roughness: 0.6 });
  const rail = mat(steel ? 0xf4f4ee : 0x4a5258, { roughness: 0.5, metalness: steel ? 0.2 : 0.6 });
  const W = 2.6;
  const zMid = (o.z0 + o.z1) / 2;
  let first = true;
  const add = (m: Mesh): void => {
    if (first) tagAnchor(m, o.anchor);
    first = false;
    s.add(m);
  };

  // the level deck, with a fascia on both sides (red over white on the steel bridge)
  add(box(W, 0.4, o.z1 - o.z0, body, o.x, o.deck - 0.2, zMid));
  for (const dx of [-1, 1]) {
    add(box(0.12, 0.9, o.z1 - o.z0, accent, o.x + (dx * (W - 0.12)) / 2, o.deck + 0.45, zMid));
    if (steel) add(box(0.14, 0.18, o.z1 - o.z0, body, o.x + (dx * (W - 0.12)) / 2, o.deck + 0.55, zMid));
    add(box(0.07, 0.07, o.z1 - o.z0, rail, o.x + (dx * (W - 0.12)) / 2, o.deck + 1.15, zMid));
  }
  // a pier of the deck at both ends: a solid tower on the pavement
  const run = 5.2; // the stair run beyond each end
  const steps = 9;
  for (const [end, dir] of [
    [o.z0, -1],
    [o.z1, 1],
  ] as const) {
    add(box(W, o.deck - STREET, 1.5, body, o.x, STREET + (o.deck - STREET) / 2, end + dir * 0.7));
    add(box(W + 0.2, 0.25, 1.7, accent, o.x, o.deck - 0.1, end + dir * 0.7));
    for (let i = 0; i < steps; i++) {
      const h = (o.deck / steps) * (steps - i); // tread height from the tower down to the street
      const zc = end + dir * (1.45 + (i + 0.5) * (run / steps));
      add(box(W, 0.14, run / steps + 0.02, body, o.x, h - 0.07, zc));
      add(box(W, h - STREET, 0.08, steel ? accent : body, o.x, STREET + (h - STREET) / 2, zc));
    }
    for (const dx of [-1, 1]) {
      const stairRail = box(
        0.07,
        0.07,
        Math.hypot(run, o.deck),
        rail,
        o.x + (dx * (W - 0.12)) / 2,
        o.deck / 2 + 1.05,
        end + dir * (1.45 + run / 2),
      );
      stairRail.rotation.x = dir * Math.atan2(o.deck, run);
      add(stairRail);
    }
  }
  // a gate frame at the south end carries the name board, facing the camera (south)
  for (const dx of [-1, 1])
    add(box(0.14, 2.3, 0.14, rail, o.x + (dx * (W - 0.14)) / 2, o.deck + 1.15, o.z1 + 0.1));
  add(box(W + 0.3, 0.16, 0.2, accent, o.x, o.deck + 2.3, o.z1 + 0.1));
  plaque(
    ctx,
    `${o.anchor}:sign`,
    3.4,
    0.62,
    o.x,
    o.deck + 1.95,
    o.z1 + 0.24,
    0,
    lettered(o.sign, o.signBg, o.signFg),
  );
}
