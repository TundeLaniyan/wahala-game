/**
 * EBUTE METTA's campaign kit data (docs/CAMPAIGN_WORLD.md "Ebute Metta", decisions WM1, WE4): the community-district kit
 * (`communityKit.ts`) filled with the pieces the City Rumble Ebute Metta already has (`ebuteMettaArt.ts`): its looks, its
 * cover theme, families and reach (the west palette for the objects of an area's west side, as on the Rumble map), its
 * dusty ground with rails on an area's track lanes (`trackFloor`), and its set pieces by landmark kind:
 *
 *   railViaduct   the commuter viaduct behind the warehouses with its green-and-white train and the EBUTE-METTA / IDDO plate
 *   trailerPark   articulated trailers and a tanker parked nose to tail beyond a side, a danfo squeezing past
 *   floodlight    tall yard masts beyond a side
 *   smoke         a works / foundry smoke column beyond a side
 *   signBoard     a fictional name board over the pavement (`name` is its text)
 *
 * The backdrop round every Ebute Metta area: two-storey shophouses and warehouses pressed in on three sides and the mainland
 * skyline north. Presentation only; everything stands off the board and the south (camera) side stays clear.
 */
import { box, mat } from '../../assets/helpers';
import { STREET } from '../common';
import type { Placement, SetContext } from '../common';
import {
  EBUTE_FAMILIES,
  EBUTE_GROUND,
  EBUTE_REACH,
  EBUTE_THEME,
  RUMBLE_EBUTE_METTA_LOOK,
  RUMBLE_EBUTE_METTA_NIGHT_LOOK,
} from '../ebuteMettaArt';
import { lampPost, lettered, plaque, railcars, skyline, viaduct } from '../community/setKit';
import { shophouseRows } from '../shared';
import { sign, signTexture } from '../oshodiKit';
import { tileWorld } from '../rumbleV2Kit';
import { T } from '../floorKit';
import type { CommunityDistrictArt } from './communityKit';
import { landmarkPlace } from './communityKit';

/** A parked articulated trailer (container on a chassis with its tractor) or a tanker, at (x, z) along `ry`. */
function trailer(ctx: SetContext, x: number, z: number, ry: number, k: number): void {
  const body = [0x7a3a2a, 0x2a5a7a, 0xb0a890, 0x3a6a4a][k % 4]!;
  const tanker = k % 3 === 2;
  const parts = [
    box(8.2, 0.35, 2.3, mat(0x2a2a2a, { roughness: 0.8 }), 0, 0.75, 0), // chassis
    tanker
      ? box(7.4, 1.9, 2.2, mat(0xc8ccd0, { roughness: 0.35, metalness: 0.5 }), -0.3, 1.95, 0)
      : box(7.6, 2.5, 2.4, mat(body, { roughness: 0.75 }), -0.3, 2.2, 0),
    box(2.2, 2.4, 2.4, mat(0xd8d0b8, { roughness: 0.6 }), 4.3, 1.75, 0), // the tractor cab
    box(0.08, 0.7, 2.1, mat(0x1c2a3a, { roughness: 0.2, metalness: 0.5 }), 5.42, 2.3, 0), // windscreen
  ];
  for (const p of parts) {
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    const px = p.position.x;
    const pz = p.position.z;
    p.position.set(x + px * c + pz * sn, STREET + p.position.y, z - px * sn + pz * c);
    p.rotation.y = ry;
    ctx.statics.add(p);
  }
}

/**
 * Rails on an area's track lanes: every '=' tile in a north-south run of at least 6 (a road is 2 rows deep) gets ballast,
 * sleepers and two shining rails, as on the Rumble map's lanes; where a road crosses it the rails run on through the
 * asphalt and the crossing is striped (the level crossing).
 */
function trackFloor(g: CanvasRenderingContext2D, layout: readonly string[]): void {
  const at = (x: number, y: number): string => layout[y]?.[x] ?? '#';
  const run = (x: number, y: number): number => {
    let a = y;
    let b = y;
    while (at(x, a - 1) === '=') a--;
    while (at(x, b + 1) === '=') b++;
    return b - a + 1;
  };
  layout.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== '=' || run(x, y) < 6) return;
      const road = at(x - 1, y) === '=' && at(x + 1, y) === '=' && at(x - 2, y) === '=';
      if (!road) {
        g.fillStyle = 'rgba(96,90,84,0.95)';
        g.fillRect(x * T, y * T, T, T);
        for (let k = 0; k < 4; k++) {
          g.fillStyle = 'rgba(54,40,30,0.9)';
          g.fillRect(x * T + 6, y * T + k * 32 + 4, T - 12, 12);
        }
      } else {
        g.fillStyle = 'rgba(232,206,60,0.55)';
        for (let k = 0; k < 4; k++) g.fillRect(x * T + k * 32, y * T + 6, 16, T - 12);
      }
      g.fillStyle = 'rgba(190,194,198,0.95)';
      for (const rx of [0.2, 0.8]) g.fillRect(x * T + rx * T - 3, y * T, 6, T);
    }),
  );
}

export const EBUTE_METTA_CAMPAIGN_ART: CommunityDistrictArt = {
  look: RUMBLE_EBUTE_METTA_LOOK,
  nightLook: RUMBLE_EBUTE_METTA_NIGHT_LOOK,
  theme: EBUTE_THEME,
  families: EBUTE_FAMILIES,
  reach: EBUTE_REACH,
  floor: {
    ...EBUTE_GROUND,
    roleTint: {
      street: 'rgba(120,98,74,0.12)', // the cargo streets
      rail: 'rgba(60,56,52,0.22)', // ballast round the freight line
      service: 'rgba(70,64,58,0.18)', // the sidings
      works: 'rgba(60,50,48,0.16)', // oil-dark works yards
      lane: 'rgba(130,110,84,0.12)',
      plaza: 'rgba(170,170,160,0.16)',
    },
    extra: (g, _rg, layout) => trackFloor(g, layout),
  },
  env: {
    seed: 0x0342,
    kinds: ['danfo', 'bus', 'keke', 'car', 'truck'],
    beds: ['crowd_loop', 'buspark_loop'],
    crowdAt: { trailerPark: 'waiting', signBoard: 'trading' },
    lightAt: { floodlight: { color: 0xe8f4ff, height: 8.2 }, signBoard: { color: 0xffb868, height: 2.4 } },
  },
  set: {
    backdrop(ctx, { tod }) {
      shophouseRows(ctx, { north: true, east: true, west: true, seed: 17, close: 0.5, scale: 1.25 });
      skyline(ctx, tod, {
        edge: 'north',
        off: 16,
        depth: 7,
        hMin: 7,
        hMax: 13,
        tints: ['#8a7a6a', '#7a8286', '#9a7a5a', '#8a8a78'],
        seed: 17,
      });
    },
    landmarks: {
      railViaduct(ctx, l) {
        const { wx } = tileWorld(ctx.W, ctx.H);
        const zv = -ctx.H / 2 - 10;
        viaduct(ctx, {
          z: zv,
          x0: -ctx.W / 2 - 24,
          x1: ctx.W / 2 + 24,
          deck: 6.2,
          width: 5.4,
          pier: 10,
          track: true,
        });
        railcars(ctx, { x: wx(l.at[0]) - 6, z: zv, y: 6.3, cars: 3, body: 0xe8ece6, stripe: 0x2a8a4a });
        plaque(
          ctx,
          `cr:ebute:campaign:${l.id}`,
          6.2,
          0.9,
          wx(l.at[0]) + 8,
          9.6,
          zv + 2.9,
          0,
          lettered('EBUTE-METTA  ←  IDDO', '#1d6a40', '#f6f2e4'),
        );
      },
      trailerPark(ctx, l, at) {
        const p = landmarkPlace(ctx, l, 3.4);
        for (let k = -1; k <= 1; k++) {
          if (at.side === 'north') trailer(ctx, p.x + k * 9, p.z, 0, k + 1);
          else trailer(ctx, p.x, p.z + k * 3.2, at.side === 'west' ? 0 : Math.PI, k + 1);
        }
        const side: Placement[] = [{ x: p.x + (at.side === 'west' ? -3 : 3), y: STREET, z: p.z + 6, ry: 0 }];
        ctx.vehicles('danfo', at.side === 'north' ? [] : side, { idle: true });
      },
      floodlight(ctx, l) {
        const p = landmarkPlace(ctx, l, 3.2);
        const off = p.side === 'north' ? ([3, 0] as const) : ([0, 3] as const);
        for (const s of [-1, 1]) lampPost(ctx, p.x + s * off[0], p.z + s * off[1], p.ry, 0xe8f4ff, 8.2);
      },
      smoke(ctx, l) {
        const p = landmarkPlace(ctx, l, 6);
        ctx.ambient.smokeColumn(p.x, 6, p.z, { shade: 0.55, size: 1.3, rate: 2.2 });
      },
      signBoard(ctx, l, at) {
        const p = landmarkPlace(ctx, l, 3.9);
        const map = signTexture(
          `ebute:campaign:${l.id}`,
          512,
          128,
          { bg: '#1d6a40', fg: '#f6f2e4', lines: [[l.name.toUpperCase(), 40]], border: '#f6f2e4', wear: 1.1 },
          73,
        );
        sign(ctx, map, p.x, 3.6, p.z, 4, 0.9, at.ry);
      },
    },
    people: 14,
    lamp: 0xffb868,
    crowd: 0.25,
  },
};
