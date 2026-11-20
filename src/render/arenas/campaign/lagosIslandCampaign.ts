/**
 * LAGOS ISLAND's campaign kit data (docs/CAMPAIGN_WORLD.md "Lagos Island", decisions WM1, WE8): the community-district kit
 * (`communityKit.ts`) filled with the pieces the City Rumble Lagos Island already has (`lagosIslandArt.ts`): its looks, its
 * cover theme, families and reach, its masonry ground, and its set pieces by landmark kind:
 *
 *   officeSkyline  a taller band of office towers beyond the north edge round the landmark (the business district)
 *   bridgeDeck     the elevated island bridge approach on its piers beyond the north edge, its gantry plate
 *   clothStalls    cloth traders' umbrellas and stalls spilling past a side
 *   signBoard      a fictional name board over the pavement (`name` is its text)
 *   waterTower     a pump station's raised water tank on its legs beyond a side
 *   gantry         a substation's steel gantry and its insulator posts beyond a side
 *
 * The backdrop round every Lagos Island area: shophouses pressed in on three sides and the island skyline north.
 * Presentation only; everything stands off the board and the south (camera) side stays clear.
 */
import { box, cyl, mat } from '../../assets/helpers';
import { STREET } from '../common';
import {
  LAGOS_ISLAND_FAMILIES,
  LAGOS_ISLAND_GROUND,
  LAGOS_ISLAND_REACH,
  LAGOS_ISLAND_THEME,
  RUMBLE_LAGOS_ISLAND_LOOK,
  RUMBLE_LAGOS_ISLAND_NIGHT_LOOK,
} from '../lagosIslandArt';
import { edgeStalls, lettered, plaque, skyline, viaduct } from '../community/setKit';
import { shophouseRows } from '../shared';
import { sign, signTexture, umbrella } from '../oshodiKit';
import { tileWorld } from '../rumbleV2Kit';
import type { CommunityDistrictArt } from './communityKit';
import { landmarkPlace } from './communityKit';

const tarps = (): ReturnType<typeof mat>[] =>
  LAGOS_ISLAND_THEME.tarps.map((c) => mat(c, { roughness: 0.88 }));

export const LAGOS_ISLAND_CAMPAIGN_ART: CommunityDistrictArt = {
  look: RUMBLE_LAGOS_ISLAND_LOOK,
  nightLook: RUMBLE_LAGOS_ISLAND_NIGHT_LOOK,
  theme: LAGOS_ISLAND_THEME,
  families: LAGOS_ISLAND_FAMILIES,
  reach: LAGOS_ISLAND_REACH,
  floor: {
    ...LAGOS_ISLAND_GROUND,
    roleTint: {
      street: 'rgba(150,80,50,0.10)', // the trading lanes
      lane: 'rgba(110,100,90,0.10)', // the back streets, the market road
      plaza: 'rgba(210,200,170,0.18)', // the counter hall court
      service: 'rgba(100,110,120,0.12)', // the records yard, the pump yard
      works: 'rgba(70,72,76,0.16)', // the substation's hardstanding
    },
  },
  env: {
    seed: 0x0322,
    kinds: ['danfo', 'bus', 'keke', 'car', 'bus'],
    beds: ['crowd_loop', 'buspark_loop'],
    crowdAt: { clothStalls: 'trading', signBoard: 'waiting', waterTower: 'watching' },
    lightAt: { signBoard: { color: 0xffd9a0, height: 2.4 }, gantry: { color: 0xe8f4ff, height: 7.4 } },
  },
  set: {
    backdrop(ctx, { tod }) {
      shophouseRows(ctx, { north: true, east: true, west: true, seed: 5, close: 0.4, scale: 1.3 });
      skyline(ctx, tod, {
        edge: 'north',
        off: 14,
        depth: 7,
        hMin: 8,
        hMax: 16,
        tints: ['#8a96a0', '#a08a70', '#6a7a86', '#9a9a90'],
        seed: 5,
      });
    },
    landmarks: {
      officeSkyline(ctx, l, _at, { tod }) {
        const { wx } = tileWorld(ctx.W, ctx.H);
        const cx = wx(l.at[0]);
        skyline(ctx, tod, {
          edge: 'north',
          off: 9,
          depth: 6,
          hMin: 14,
          hMax: 24,
          tints: ['#6a7a86', '#8a96a0', '#5a6a76'],
          gap: (c) => Math.abs(c - cx) > 12,
          seed: 7 + l.id.length,
        });
      },
      bridgeDeck(ctx, l) {
        const { wx } = tileWorld(ctx.W, ctx.H);
        const z = -ctx.H / 2 - 8;
        viaduct(ctx, {
          z,
          x0: wx(l.at[0]) - 22,
          x1: ctx.W / 2 + 40,
          deck: 7.4,
          width: 7.4,
          pier: 10,
          color: 0xaaa69c,
        });
        plaque(
          ctx,
          `cr:lagos:campaign:${l.id}`,
          6.4,
          1.0,
          wx(l.at[0]),
          8.8,
          z + 3.7,
          0,
          lettered('IDUMOTA  ←  →  MARINA', '#17674a', '#f4f2ea'),
        );
      },
      clothStalls(ctx, l, at) {
        const t = tarps();
        const p = landmarkPlace(ctx, l, 2.4);
        const along = at.side === 'north' ? ([1, 0] as const) : ([0, 1] as const);
        for (let k = -2; k <= 2; k++)
          umbrella(
            ctx,
            p.x + along[0] * k * 2.6,
            p.z + along[1] * k * 2.6,
            0.95,
            t[(k + 7) % 7]!,
            t[(k + 9) % 7]!,
            {
              h: 1.95,
            },
          );
        const { wz, wx } = tileWorld(ctx.W, ctx.H);
        edgeStalls(ctx, {
          north: at.side === 'north',
          east: at.side === 'east',
          west: at.side === 'west',
          goods: ['cloth', 'cloth', 'basins', 'provisions'],
          gap: (z: number) => Math.abs(z - wz(l.at[1])) > 8,
          gapNorth: (x: number) => Math.abs(x - wx(l.at[0])) > 9,
          seed: l.id.length,
        });
      },
      signBoard(ctx, l, at) {
        const p = landmarkPlace(ctx, l, 3.9);
        const map = signTexture(
          `lagos:campaign:${l.id}`,
          512,
          128,
          { bg: '#17674a', fg: '#f4f2ea', lines: [[l.name.toUpperCase(), 42]], border: '#f4f2ea', wear: 1.0 },
          79,
        );
        sign(ctx, map, p.x, 3.6, p.z, 4, 0.9, at.ry);
      },
      waterTower(ctx, l) {
        const p = landmarkPlace(ctx, l, 5);
        const steel = mat(0x7a7e82, { roughness: 0.6, metalness: 0.5 });
        for (const [dx, dz] of [
          [-1.4, -1.4],
          [1.4, -1.4],
          [-1.4, 1.4],
          [1.4, 1.4],
        ] as const)
          ctx.statics.add(box(0.25, 7, 0.25, steel, p.x + dx, STREET + 3.5, p.z + dz));
        ctx.statics.add(
          cyl(2.2, 2.2, 2.8, mat(0x9aa4a8, { roughness: 0.5, metalness: 0.4 }), p.x, STREET + 8.4, p.z, 16),
        );
        ctx.statics.add(cyl(2.3, 0.4, 0.8, mat(0x6a7276, { roughness: 0.6 }), p.x, STREET + 10.2, p.z, 16));
      },
      gantry(ctx, l) {
        const p = landmarkPlace(ctx, l, 4);
        const steel = mat(0x8a8e92, { roughness: 0.55, metalness: 0.5 });
        const along = p.side === 'north' ? ([1, 0] as const) : ([0, 1] as const);
        for (const s of [-1, 1])
          ctx.statics.add(
            box(0.3, 6.5, 0.3, steel, p.x + along[0] * s * 3, STREET + 3.25, p.z + along[1] * s * 3),
          );
        ctx.statics.add(box(along[0] ? 6.6 : 0.3, 0.3, along[1] ? 6.6 : 0.3, steel, p.x, STREET + 6.4, p.z));
        for (let k = -1; k <= 1; k++)
          ctx.statics.add(
            cyl(
              0.12,
              0.16,
              1.1,
              mat(0xc8b090, { roughness: 0.4 }),
              p.x + along[0] * k * 2,
              STREET + 5.7,
              p.z + along[1] * k * 2,
              8,
            ),
          );
      },
    },
    people: 14,
    lamp: 0xffd9a0,
    crowd: 0.3,
  },
};
