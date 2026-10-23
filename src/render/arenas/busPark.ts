/**
 * Danfo Bus Park: a rough Lagos transport terminal. Danfos nose into worn bays under a rusted
 * shelter with faded route boards; conductors wave passengers in; a tyre seller works his stacks;
 * an argument flares between the parked buses; two men fight on the west street while a few
 * people watch; a burnt-out Danfo smoulders in the corner and tyres burn. Exhaust, dust and
 * black smoke hang in the air. Two-storey shophouses close the street on three sides.
 */
import { DoubleSide, Mesh, PlaneGeometry } from 'three';
import { labelTexture } from '../textures';
import { box, cyl, mat, uniqueMat } from '../assets/helpers';
import { assets } from '../assets/library';
import type { ArenaSet, Placement, SetContext } from './common';
import { STREET } from './common';
import { corrugatedRoof, shophouseRows, streetDressing } from './shared';

/** A faded painted route board (no glow: lit by the scene like the rest of the street). */
function routeBoard(ctx: SetContext, text: string, x: number, y: number, z: number, w = 1.5, ry = 0): void {
  const map = labelTexture(text, '#d8cfae', 'bold 34px system-ui, sans-serif', '#27382c');
  ctx.own(map);
  const m = uniqueMat(0xffffff, { map, roughness: 0.9, flat: false });
  m.side = DoubleSide;
  ctx.own(m);
  const board = new Mesh(new PlaneGeometry(w, w * 0.22), m);
  board.position.set(x, y, z);
  board.rotation.set(-0.12, ry, 0);
  board.castShadow = true;
  ctx.root.add(board);
}

function build(ctx: SetContext): void {
  const { W, H, statics } = ctx;
  const north = -H / 2;
  const rust = mat(0x6e4a32, { roughness: 0.85, metalness: 0.35 });
  const steel = mat(0x4e4c48, { roughness: 0.6, metalness: 0.55 });

  // --- the terminal: rusted corrugated shelter on steel posts between the north bays
  const shelterZ = north - 2.2;
  for (const sx of [-1.9, 1.9]) {
    for (const sz of [-0.5, 0.5]) statics.add(box(0.09, 2.3, 0.09, steel, sx, 1.12, shelterZ + sz));
  }
  corrugatedRoof(statics, 0, 2.3, shelterZ, 4.4, 1.6, 0x6a4c36, 0.08);
  statics.add(box(3.6, 0.07, 0.38, rust, 0, 0.5, shelterZ - 0.2)); // the bench
  routeBoard(ctx, 'OSHODI  •  OJOTA', -1.0, 2.55, shelterZ + 0.82, 1.7);
  routeBoard(ctx, 'CMS  •  OBALENDE', 1.0, 2.55, shelterZ + 0.82, 1.7);
  routeBoard(ctx, 'YABA', -W / 2 - 1.1, 2.0, north - 0.9, 0.9, 0.4);

  // --- buses: side-on in the north bays, an echelon on the east street, two on the west
  const buses: Placement[] = [
    { x: -4.3, z: north - 2.0, ry: Math.PI / 2 + 0.03 },
    { x: 4.3, z: north - 2.0, ry: -Math.PI / 2 - 0.03 },
    { x: W / 2 + 2.65, z: north + 1.8, ry: -Math.PI * 0.16 },
    { x: W / 2 + 2.75, z: north + 5.3, ry: -Math.PI * 0.18 },
    { x: W / 2 + 2.85, z: north + 8.8, ry: -Math.PI * 0.14 },
    { x: -W / 2 - 2.5, z: north + 6.0, ry: Math.PI * 0.16 },
  ];
  ctx.vehicles('danfo', buses, { idle: true });
  // a keke and an okada waiting for fares
  ctx.vehicles('keke', [{ x: -W / 2 - 2.3, z: north + 9.0, ry: Math.PI * 0.55 }]);
  ctx.vehicles('okada', [
    { x: W / 2 + 1.55, z: north - 1.25, ry: -0.5 },
    { x: -W / 2 - 1.5, z: north + 3.4, ry: 2.6 },
  ]);
  // the burnt-out Danfo in the north-west corner, still smouldering
  ctx.wreck('danfo', { x: -W / 2 - 2.9, z: north - 1.55, ry: Math.PI * 0.62, rz: 0.06 });

  // --- burning tyres and the tyre seller's stacks
  const tyres: Placement[] = [
    { x: W / 2 + 1.9, z: north - 2.0, ry: 0.4, sx: 1.1, sy: 1.1, sz: 1.1 },
    { x: W / 2 + 2.6, z: north - 2.5, ry: 1.4 },
    { x: W / 2 + 3.2, z: north - 1.9, ry: 2.2, sx: 0.9, sy: 1.25, sz: 0.9 },
    { x: -W / 2 - 1.35, z: H / 2 + 1.15, ry: 0.5, sx: 0.8, sy: 0.6, sz: 0.8 },
    { x: W / 2 + 1.4, z: H / 2 + 1.15, ry: -0.4, sx: 0.8, sy: 0.6, sz: 0.8 },
  ];
  ctx.instance('env_tyrestack', tyres);
  ctx.instance('env_tyrestack', [{ x: -W / 2 - 1.9, z: 1.6, ry: 0.3, sx: 0.9, sy: 0.45, sz: 0.9 }]);
  ctx.ambient.fire(-W / 2 - 1.9, STREET + 0.45, 1.6, 0.8); // tyres burning on the west street
  ctx.ambient.fire(W / 2 + 4.3, STREET + 0.3, north + 2.9, 0.65);

  // --- oil drums, sacks and crates by the bays
  ctx.instance('env_barrel', [
    { x: -2.2, z: north - 1.15, ry: 0.4 },
    { x: -1.75, z: north - 1.0, ry: 1.9 },
    { x: 6.1, z: north - 1.2, ry: 0.8 },
    { x: -W / 2 - 1.2, z: north + 0.6, ry: 2.2 },
  ]);
  ctx.instance('prop_soft_crates', [{ x: 2.4, z: north - 1.15, ry: 0.15, sx: 0.8, sy: 0.8, sz: 0.8 }]);

  streetDressing(ctx);
  shophouseRows(ctx, { north: true, east: true, west: true, seed: 0, close: -0.4 });

  // --- street life
  const L = ctx.life;
  L.add({ kind: 'conductor', x: -3.0, z: north - 1.0, yaw: 0.2, toX: -5.6, toZ: north - 1.0 });
  L.add({ kind: 'conductor', x: 5.6, z: north - 1.0, yaw: -0.2, toX: 3.0, toZ: north - 1.0 });
  // the west street is narrow: the fight happens right behind the spectator rail
  L.add({ kind: 'fight', x: -W / 2 - 1.75, z: 2.4, yaw: 0.1 });
  L.add({ kind: 'onlooker', x: -W / 2 - 1.55, z: 0.9, yaw: 0.2 });
  L.add({ kind: 'onlooker', x: -W / 2 - 2.0, z: 3.9, yaw: Math.PI - 0.2 });
  L.add({ kind: 'argue', x: W / 2 + 1.75, z: north + 3.55, yaw: 0.1 });
  L.add({ kind: 'seller', x: W / 2 + 2.4, z: north - 1.3, yaw: Math.PI * 0.75 });
  L.add({ kind: 'walker', x: -W / 2 - 1.6, z: north - 0.3, yaw: 0, toX: -W / 2 - 1.6, toZ: -0.4 });
  L.add({ kind: 'walker', x: -6.5, z: north - 3.35, yaw: 0, toX: 6.5, toZ: north - 3.35 });
  L.add({ kind: 'onlooker', x: 1.4, z: north - 1.0, yaw: 0.1 });

  // --- atmosphere: dust over the bays and the east street
  ctx.ambient.dust(0, north - 1.6, 12, 1.6);
  ctx.ambient.dust(W / 2 + 2.6, 0, 2.5, 9);
  if (assets.has('env_kiosk')) {
    ctx.instance('env_kiosk', [
      { x: -W / 2 - 3.3, z: H / 2 + 2.6, ry: Math.PI / 2, sx: 0.85, sy: 0.85, sz: 0.85 },
    ]);
  }
  // low kerb along the camera side (never taller than the south wall)
  const a = mat(0x8a7a4a, { roughness: 0.9 });
  const b = mat(0x2c2924, { roughness: 0.9 });
  let k = 0;
  for (let x = -W / 2 - 0.6; x < W / 2 + 0.7; x += 0.6)
    statics.add(box(0.58, 0.1, 0.22, k++ % 2 ? a : b, x, 0.05, H / 2 + 0.62));
  statics.add(cyl(0.04, 0.05, 2.6, steel, W / 2 + 1.2, STREET + 1.3, north - 1.0, 6));
}

export const BUS_PARK_SET: ArenaSet = {
  build,
  // fewer static spectators: the street is busy with its own business (StreetLife)
  crowd: 0.5,
  crowdEdges: { north: true, east: true, west: true, south: true },
};
