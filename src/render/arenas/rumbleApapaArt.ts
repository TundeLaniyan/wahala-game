/**
 * City Rumble V2 - Apapa Docks (presentation only; the grid and hazards are
 * `src/sim/arenas/rumbleApapa.ts`). A container terminal on the Lagos harbour at humid noon.
 *
 * Floor: heavy concrete yard slabs with sealed joints, rust bleeding from the stacking pads; yellow
 * container-slot lines and painted bay codes along every aisle; the haul roads and the quay road are
 * oil-stained tarmac with white arrows and lane dashes; the loading apron in the middle is hatched;
 * a yellow-and-black safety edge runs along the quay (north) side.
 *
 * Surroundings: north of the yard, two ship-to-shore gantry cranes on their rails over the quay apron,
 * a container ship moored at the quay with its deck stacked high, the harbour water beyond; east and
 * west, more container stacks, a long transit shed and the terminal gate with its booth; articulated
 * container trucks and a fuel tanker queue at the quay road, high-mast lights, reefer stacks, port
 * workers in hi-vis. The camera side keeps a low jersey barrier, cones and parked okadas.
 */
import { MeshStandardMaterial, PlaneGeometry } from 'three';
import type { Material } from 'three';
import type { ArenaLook } from '../arenaLook';
import { artRng, corrugatedTexture } from '../textures';
import { box, cyl, mat, mesh } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain, tyreTrack } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { sign, signTexture } from './oshodiKit';
import { SiteLights, bar, lampMat, sitePalette, uvScale, v3 } from './roadworksKit';
import { cones, jerseyLine } from './roadworksProps';
import { corrugatedRoof } from './shared';
import { bridgePalette, sentryBooth, truck } from './thirdMainlandBridge';
import { dash, floorWords, layoutOf, litter, paintKerbs, paintRoads, tileWorld } from './rumbleV2Kit';

const ID = 'rumbleApapa';

export const RUMBLE_APAPA_LOOK: ArenaLook = {
  // humid harbour noon: a high white sun, salt haze greying everything blue-grey in the distance
  sky: 0xb4bcc0,
  fog: { color: 0xa4aeb2, near: 22, far: 78 },
  sun: { color: 0xfff2dc, intensity: 4.6, position: [6, 26, 10] },
  hemi: { sky: 0xdce4e8, ground: 0x6a645a, intensity: 1.2 },
  envIntensity: 0.55,
  exposure: 1.12,
  floorTint: 0xc0bcb4,
  pillarTint: 0xf2eee6,
  softTint: 0xccc4b8,
  slab: 0x76746e,
  street: 0x3e3e3c,
  grit: { tone: 0x8a8070, dirt: 0x5a5448, dust: 0xa69c88 },
  lamps: [],
};

// ------------------------------------------------------------------------------------------- floor

export const RUMBLE_APAPA_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const layout = layoutOf(ID);
  const r = artRng(5401);
  const w = cols * T;
  const h = rows * T;
  const at = (x: number, y: number): string => layout[y]?.[x] ?? '#';
  noiseFill(g, g.canvas.width, g.canvas.height, [160, 156, 148], 18, 71);
  noiseFill(rg, rg.canvas.width, rg.canvas.height, [214, 214, 214], 18, 72);
  // heavy yard slabs (3 x 3 tiles) with sealed joints, a few cracked and patched
  g.strokeStyle = 'rgba(40,38,34,0.55)';
  g.lineWidth = 5;
  for (let x = 0; x <= cols; x += 3) {
    g.beginPath();
    g.moveTo(x * T, 0);
    g.lineTo(x * T, h);
    g.stroke();
  }
  for (let y = 0; y <= rows; y += 3) {
    g.beginPath();
    g.moveTo(0, y * T);
    g.lineTo(w, y * T);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * (cols / 3)) * 3;
    const y = Math.floor(r() * (rows / 3)) * 3;
    g.fillStyle = `rgba(${120 + r() * 30},${118 + r() * 26},${110 + r() * 24},0.35)`;
    g.fillRect(x * T + 3, y * T + 3, 3 * T - 6, 3 * T - 6);
  }
  // rust bleeding from the stacking pads, salt bloom and oil
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '#') continue;
      if (at(x, y + 1) !== '#') stain(g, (x + 0.5) * T, (y + 1.15) * T, T * 0.55, 'rgba(120,58,26,0.3)');
    }
  for (let i = 0; i < cols * rows * 0.12; i++)
    stain(g, r() * w, r() * h, 30 + r() * 80, 'rgba(230,226,214,0.08)');
  for (let i = 0; i < cols * rows * 0.1; i++)
    stain(g, r() * w, r() * h, 16 + r() * 40, 'rgba(10,10,12,0.32)');
  // roads: tarmac on the haul roads and the quay road, dashes and arrows
  paintRoads(g, rg, layout, r, [62, 62, 60]);
  paintKerbs(g, layout, 'rgba(226,190,40,0.9)', 'rgba(26,26,26,0.9)');
  for (const x of [12, 33]) dash(g, x, 0, x, rows, 'rgba(226,222,208,0.7)', 6, 0.6, 0.4);
  for (const y of [1, rows - 2]) dash(g, 0, y + 0.5, cols, y + 0.5, 'rgba(226,222,208,0.6)', 6, 0.6, 0.4);
  const arrow = (cx: number, cy: number, rot: number): void => {
    g.save();
    g.translate(cx * T, cy * T);
    g.rotate(rot);
    g.fillStyle = 'rgba(232,228,214,0.7)';
    g.fillRect(-6, -30, 12, 44);
    g.beginPath();
    g.moveTo(-20, 14);
    g.lineTo(20, 14);
    g.lineTo(0, 40);
    g.closePath();
    g.fill();
    g.restore();
  };
  for (let y = 4; y < rows - 2; y += 8) {
    arrow(11.5, y, 0);
    arrow(12.5, y + 4, Math.PI);
    arrow(32.5, y, 0);
    arrow(33.5, y + 4, Math.PI);
  }
  // container slot lines and bay codes along the aisles
  g.fillStyle = 'rgba(226,190,40,0.6)';
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '.') continue;
      if (at(x, y - 1) === '#') g.fillRect(x * T, y * T + 6, T, 6);
      if (at(x, y + 1) === '#') g.fillRect(x * T, (y + 1) * T - 12, T, 6);
    }
  const bays = 'ABCDEFGH';
  let n = 0;
  for (let y = 0; y < rows; y++)
    for (let x = 1; x < cols; x += 5) {
      if (at(x, y) !== '.' || at(x, y - 1) !== '#') continue;
      floorWords(g, `${bays[n % 8]}${10 + ((n * 7) % 40)}`, x + 0.5, y + 0.45, 0.26, 'rgba(226,190,40,0.65)');
      n++;
    }
  // the loading apron in the middle: hatched
  g.save();
  g.beginPath();
  g.rect(16 * T, 13 * T, 13 * T, 5 * T);
  g.clip();
  g.strokeStyle = 'rgba(226,190,40,0.28)';
  g.lineWidth = 10;
  for (let k = -5 * T; k < 18 * T; k += 60) {
    g.beginPath();
    g.moveTo(16 * T + k, 13 * T);
    g.lineTo(16 * T + k + 5 * T, 18 * T);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(226,190,40,0.7)';
  g.lineWidth = 8;
  g.strokeRect(16 * T + 6, 13 * T + 6, 13 * T - 12, 5 * T - 12);
  floorWords(g, 'LOADING APRON', 22.5, 15.5, 0.42, 'rgba(232,228,214,0.5)');
  // the quay's safety edge along the north side
  for (let x = 0; x < w; x += 40) {
    g.fillStyle = (x / 40) % 2 ? 'rgba(226,190,40,0.85)' : 'rgba(26,26,26,0.85)';
    g.fillRect(x, 0, 40, 14);
  }
  for (let i = 0; i < 12; i++) tyreTrack(g, r, w, h, 'rgba(20,18,16,0.14)');
  for (let i = 0; i < cols * rows * 0.2; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 6), 'rgba(18,16,14,0.45)', 2);
  litter(g, r, cols, rows, 0.35);
};

// ------------------------------------------------------------------------------------------ the set

const BOX_COLORS = [0x8a3a26, 0x2e5a7a, 0x3e6a48, 0x9a8a5e, 0x6a6e72, 0xa8642e, 0xb8b09a, 0x5a3a5e];

/** Ribbed, faded container paint (one material per colour, shared by the whole set). */
function boxMats(ctx: SetContext): Material[] {
  return BOX_COLORS.map((c) => {
    const map = corrugatedTexture().clone();
    map.needsUpdate = true;
    map.repeat.set(4, 1);
    const m = new MeshStandardMaterial({ color: c, map, roughness: 0.7, metalness: 0.35 });
    ctx.own(m);
    ctx.own(map);
    return m;
  });
}

/** A block of stacked 40 ft boxes (len along x or z), `tiers` high, colours mixed. */
function stack(
  ctx: SetContext,
  mats: Material[],
  x: number,
  z: number,
  rowsN: number,
  tiers: number,
  alongX: boolean,
  seed: number,
): void {
  const L = 6.1 * 1.0;
  const Wd = 1.25;
  const Hh = 1.3;
  let n = seed;
  for (let i = 0; i < rowsN; i++)
    for (let t = 0; t < tiers - ((i + seed) % 3 === 0 ? 1 : 0); t++) {
      const m = mats[(n++ * 5) % mats.length]!;
      const ox = alongX ? 0 : (i - (rowsN - 1) / 2) * (Wd + 0.06);
      const oz = alongX ? (i - (rowsN - 1) / 2) * (Wd + 0.06) : 0;
      ctx.statics.add(box(alongX ? L : Wd, Hh, alongX ? Wd : L, m, x + ox, STREET + Hh / 2 + t * Hh, z + oz));
    }
}

/** A ship-to-shore gantry crane straddling the quay rails, its boom out over the water. */
function gantryCrane(
  ctx: SetContext,
  P: ReturnType<typeof bridgePalette>,
  L: SiteLights,
  x: number,
  zQuay: number,
): void {
  const s = ctx.statics;
  const red = mat(0x9a3a24, { roughness: 0.6, metalness: 0.4 });
  const white = mat(0xc8c4b8, { roughness: 0.6, metalness: 0.3 });
  const legH = 13;
  const span = 6;
  for (const dz of [0, -span])
    for (const dx of [-2.2, 2.2]) {
      s.add(box(0.5, legH, 0.5, red, x + dx, STREET + legH / 2, zQuay + dz));
      s.add(box(0.9, 0.5, 1.4, P.steel, x + dx, STREET + 0.25, zQuay + dz)); // bogie on the rail
    }
  for (const dx of [-2.2, 2.2]) {
    s.add(box(0.5, 0.6, span + 0.5, red, x + dx, STREET + legH, zQuay - span / 2));
    s.add(bar(v3(x + dx, STREET + 1.5, zQuay), v3(x + dx, STREET + legH - 1, zQuay - span), 0.12, red, 6));
  }
  s.add(box(5.0, 0.6, 0.6, red, x, STREET + legH, zQuay));
  s.add(box(5.0, 0.6, 0.6, red, x, STREET + legH, zQuay - span));
  // the boom out over the water, the back reach over the yard (kept north of the board), the A-frame
  s.add(box(1.4, 1.0, 30, white, x, STREET + legH + 1.6, zQuay - 13));
  s.add(box(2.6, 2.4, 2.6, white, x, STREET + legH + 1.2, zQuay - span / 2)); // machinery house
  s.add(box(1.2, 1.2, 1.4, P.glass, x, STREET + legH - 0.4, zQuay - span - 2)); // the driver's cab
  for (const dx of [-1.2, 1.2])
    s.add(
      bar(
        v3(x + dx, STREET + legH + 0.5, zQuay - span / 2),
        v3(x, STREET + legH + 7, zQuay - span / 2 - 1),
        0.12,
        white,
        6,
      ),
    );
  s.add(
    bar(
      v3(x, STREET + legH + 7, zQuay - span / 2 - 1),
      v3(x, STREET + legH + 2, zQuay - 27),
      0.06,
      P.steel,
      4,
    ),
  );
  // the spreader hanging over the ship with a box on it
  s.add(
    bar(v3(x, STREET + legH + 1.1, zQuay - 16), v3(x, STREET + legH - 3.5, zQuay - 16), 0.04, P.black, 4),
  );
  s.add(box(1.4, 0.2, 6.2, P.steel, x, STREET + legH - 3.6, zQuay - 16));
  L.beacon(x, STREET + legH + 2.2, zQuay - span / 2, 0xff3a2a, 0.6);
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const { wx, wz } = tileWorld(W, H);
  const north = -H / 2;
  const south = H / 2;
  const P = bridgePalette();
  const site = sitePalette();
  const L = new SiteLights();
  const mats = boxMats(ctx);

  // ---------------------------------------------------------------- the quay apron, the harbour, the ship
  const apron = mesh(
    uvScale(new PlaneGeometry(W + 60, 12), (W + 60) / 4, 3),
    mat(0x8e8a82, { roughness: 0.95 }),
    0,
    STREET + 0.003,
    north - 6,
  );
  apron.rotation.x = -Math.PI / 2;
  ctx.statics.add(apron);
  const quayEdge = north - 12;
  ctx.statics.add(box(W + 60, 2.4, 0.6, mat(0x5a5650, { roughness: 1 }), 0, STREET - 1.2, quayEdge - 0.3)); // quay wall
  for (let x = -W / 2 - 20; x < W / 2 + 20; x += 6) {
    ctx.statics.add(
      cyl(
        0.22,
        0.28,
        0.45,
        mat(0x2a2826, { roughness: 0.6, metalness: 0.5 }),
        x,
        STREET + 0.22,
        quayEdge + 0.4,
        8,
      ),
    ); // bollards
    ctx.statics.add(
      box(0.5, 0.6, 0.25, mat(0x1a1a1a, { roughness: 0.9 }), x + 3, STREET - 0.4, quayEdge - 0.65),
    ); // fenders
  }
  for (const zr of [north - 3.2, north - 9.2])
    ctx.statics.add(box(W + 60, 0.06, 0.18, P.steel, 0, STREET + 0.03, zr)); // crane rails
  const waterMat = new MeshStandardMaterial({ color: 0x3e5258, roughness: 0.15, metalness: 0.5 });
  ctx.own(waterMat);
  const water = mesh(new PlaneGeometry(260, 140), waterMat, 0, STREET - 2.2, quayEdge - 70);
  water.rotation.x = -Math.PI / 2;
  water.castShadow = false;
  water.userData.grit = 'none';
  ctx.root.add(water);
  // the container ship along the quay: hull, white accommodation block aft, deck stacked with boxes
  const hullZ = quayEdge - 7;
  ctx.statics.add(
    box(58, 6.5, 9, mat(0x2a2a2e, { roughness: 0.7, metalness: 0.3 }), -2, STREET - 2.2 + 1.5, hullZ),
  );
  ctx.statics.add(
    box(58.2, 1.4, 9.1, mat(0x7a2a20, { roughness: 0.8, metalness: 0.2 }), -2, STREET - 2.2, hullZ),
  ); // boot-top
  ctx.statics.add(box(7, 8, 8, mat(0xd2ccc0, { roughness: 0.7 }), 22, STREET + 8.5, hullZ));
  ctx.statics.add(box(7.2, 0.4, 8.2, P.black, 22, STREET + 12.6, hullZ));
  for (let k = 0; k < 7; k++) stack(ctx, mats, -26 + k * 6.6, hullZ, 6, 2 + (k % 3), false, k * 3);
  const shipName = signTexture(
    'rapa:ship',
    512,
    96,
    { bg: '#2a2a2e', fg: '#e8e2d2', lines: [['ATLANTIC PROSPER  •  LAGOS', 52]], wear: 0.8 },
    91,
  );
  sign(ctx, shipName, 8, 3.0, hullZ + 4.52, 9, 1.4, 0);
  gantryCrane(ctx, P, L, -12, north - 3.2);
  gantryCrane(ctx, P, L, 10, north - 3.2);

  // ---------------------------------------------------------------- east and west: stacks, shed, gate
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++)
      stack(
        ctx,
        mats,
        side * (W / 2 + 4.6 + (k % 2) * 7),
        wz(6 + k * 6.5),
        2,
        3,
        true,
        k * 5 + (side > 0 ? 2 : 0),
      );
  }
  // the long transit shed on the west side: block walls, a rusty sawtooth roof
  const shedX = -W / 2 - 13;
  ctx.statics.add(box(8, 4.2, 24, mat(0xb4ac9c, { roughness: 0.95 }), shedX, STREET + 2.1, wz(16)));
  for (let k = 0; k < 4; k++)
    corrugatedRoof(ctx.statics, shedX, STREET + 4.6, wz(6 + k * 6.6), 8.6, 6.4, 0x7a5a44, 0.18);
  const shedSign = signTexture(
    'rapa:shed',
    512,
    128,
    { bg: '#e2dccc', fg: '#2a3a5a', lines: [['TRANSIT SHED 4', 62]], border: '#2a3a5a' },
    92,
  );
  sign(ctx, shedSign, shedX + 4.02, 3.4, wz(16), 4.5, 1.1, Math.PI / 2);
  // the terminal gate on the east quay road: booth, barrier arm, a queue of container trucks
  const gateSign = signTexture(
    'rapa:gate',
    512,
    128,
    {
      bg: '#1e4a3a',
      fg: '#f0ece0',
      lines: [
        ['TERMINAL GATE 2', 46],
        ['ALL TRUCKS STOP', 30],
      ],
      border: '#f0ece0',
    },
    93,
  );
  sentryBooth(ctx, P, L, W / 2 + 2.4, wz(27.2), -Math.PI / 2, gateSign);
  const cab = [
    mat(0xc8c4b8, { roughness: 0.6 }),
    mat(0x2e5a7a, { roughness: 0.6 }),
    mat(0x8a2a20, { roughness: 0.6 }),
  ];
  const band = mat(0x1a1a1a, { roughness: 0.7 });
  truck(ctx, P, 'container', W / 2 + 7.5, wz(29), -Math.PI / 2, cab[0]!, band, mats[1]);
  truck(ctx, P, 'container', W / 2 + 19, wz(29), -Math.PI / 2, cab[1]!, band, mats[0]);
  truck(ctx, P, 'tanker', -W / 2 - 7.5, wz(1), Math.PI / 2, cab[2]!, band);
  truck(ctx, P, 'container', -W / 2 - 19, wz(1), Math.PI / 2, cab[0]!, band, mats[2]);
  truck(ctx, P, 'container', W / 2 + 7.5, wz(1), -Math.PI / 2, cab[1]!, band, mats[4]);
  // high-mast lights round the yard (the quay cranes light the north)
  for (const [x, z] of [
    [-W / 2 - 2.6, wz(3)],
    [W / 2 + 2.6, wz(15)],
    [-W / 2 - 2.6, wz(26)],
  ] as const) {
    ctx.statics.add(cyl(0.16, 0.24, 14, site.steel, x, STREET + 7, z, 8));
    ctx.statics.add(box(1.8, 0.5, 1.8, site.black, x, STREET + 14.2, z));
    ctx.statics.add(box(1.5, 0.08, 1.5, lampMat(0xf4f0e0, 1.4), x, STREET + 13.92, z));
  }
  // reefer plugs and cable along the east stacks, a straddle carrier parked by the haul road mouth
  const yellow = mat(0xc8a030, { roughness: 0.55, metalness: 0.3 });
  const sx = wx(32.5);
  const sz = north - 3.4;
  for (const dx of [-1.6, 1.6])
    for (const dz of [-1.8, 1.8]) ctx.statics.add(box(0.3, 5.2, 0.3, yellow, sx + dx, STREET + 2.6, sz + dz));
  for (const dx of [-1.6, 1.6]) ctx.statics.add(box(0.4, 0.5, 4.0, yellow, sx + dx, STREET + 5.2, sz));
  ctx.statics.add(box(3.6, 0.6, 0.6, yellow, sx, STREET + 5.4, sz - 1.8));
  ctx.statics.add(box(1.0, 1.0, 1.0, P.glass, sx + 1.1, STREET + 5.9, sz - 1.8));

  // ---------------------------------------------------------------- camera side: low only
  jerseyLine(ctx, site, wx(2), south + 1.3, wx(9), south + 1.3);
  jerseyLine(ctx, site, wx(36), south + 1.3, wx(43), south + 1.3);
  cones(
    ctx,
    site,
    [
      [wx(11), south + 1.2],
      [wx(13), south + 1.3],
      [wx(32), south + 1.2],
      [wx(34), south + 1.25],
    ],
    1,
  );
  ctx.vehicles('okada', [
    { x: wx(20), y: STREET, z: south + 1.3, ry: 1.5 },
    { x: wx(21), y: STREET, z: south + 1.35, ry: 1.6 },
    { x: wx(24), y: STREET, z: south + 1.3, ry: -1.5 },
  ]);
  ctx.vehicles('danfo', [{ x: -W / 2 - 4, y: STREET, z: wz(20), ry: 0.05 }], { idle: true }); // the staff bus
  ctx.vehicles('keke', [{ x: W / 2 + 3.4, y: STREET, z: wz(21.5), ry: 3.0 }]);

  // ---------------------------------------------------------------- haze and exhaust
  ctx.ambient.dust(0, north - 5, 22, 3);
  ctx.ambient.dust(W / 2 + 10, wz(29), 6, 1.4);
  ctx.ambient.dust(-W / 2 - 10, wz(1), 6, 1.4);
  ctx.ambient.smokeColumn(22, STREET + 13, north - 19, { shade: 0.45, size: 1.2, rate: 2 }); // the ship's funnel
  L.build(ctx);

  // ---------------------------------------------------------------- dockers and drivers
  const life = ctx.life;
  const S = STREET;
  life.add({ y: S, kind: 'worker', x: -6, z: north - 2, yaw: 0, toX: 4, toZ: north - 2 }); // lashers on the apron
  life.add({ y: S, kind: 'worker', x: 12, z: north - 6, yaw: 1.2 });
  life.add({ y: S, kind: 'argue', x: W / 2 + 3.6, z: wz(25.6), yaw: 1.4 }); // a driver and the gate clerk over papers
  life.add({ y: S, kind: 'walker', x: -W / 2 - 1.2, z: wz(4), yaw: 0, toX: -W / 2 - 1.2, toZ: wz(24) });
  life.add({ y: S, kind: 'worker', x: -W / 2 - 2.0, z: wz(12), yaw: 1.6 }); // tallying boxes
  life.add({ y: S, kind: 'seller', x: W / 2 + 1.5, z: wz(10), yaw: -Math.PI / 2 }); // the mama-put by the stacks
  life.add({ y: S, kind: 'onlooker', x: -W / 2 - 3.2, z: wz(19.3), yaw: 1.2 });
  life.add({ y: S, kind: 'worker', x: -16, z: north - 5.5, yaw: -0.5, toX: -8, toZ: north - 5.5 });
  life.add({ y: S, kind: 'walker', x: W / 2 + 1.2, z: wz(30), yaw: 0, toX: W / 2 + 1.2, toZ: wz(17) });
}

export const RUMBLE_APAPA_SET: ArenaSet = {
  build,
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
