/**
 * LEKKI PHASE 1's campaign kit data (docs/CAMPAIGN_WORLD.md "Lekki Phase 1", decision WL1): the community-district kit
 * (`communityKit.ts`) filled with the pieces the City Rumble Lekki already has (`lekkiArt.ts`): its clear coastal looks, its
 * cover theme and pieces (glass-and-plaster blocks, high compound walls with steel gates and hedges, white villas, palms,
 * kiosks, lock-ups, the hoarding), its sand-and-concrete ground with asphalt roads, plus the one campaign-only piece, the
 * estate's SUBSTATION (a fenced transformer pad: plinth, transformers with cooling fins, porcelain bushings, a danger plate).
 *
 * The Rumble board's positional touches (the seawall, the plaza fountain, the Admiralty Way plates and its interlocking
 * paving) are not used: these boards are the estates' gates, service roads and utility compounds, all asphalt (LI7).
 *
 * Set pieces by landmark kind:
 *
 *   glassTowers     the Phase One glass towers along the boulevard, standing over the estate wall north
 *   danfoRank       the staff danfos and a taxi at the service-road stop beyond a side
 *   gatehouseSign   the estate's name board over the pavement beyond a side (`name` is its text)
 *   floodlight      tall yard lamps on a mast beyond a side
 *   powerLine       the 33 kV line on its steel masts beyond a side, feeding the substation
 *   waterTower      the estate's water tower on its legs beyond a side
 *
 * The backdrop round every Lekki area: low villa rooftops east and west, the coastal haze. Presentation only; everything
 * stands off the board and the south (camera) side stays clear.
 */
import { box, cyl, mat } from '../../assets/helpers';
import { STREET } from '../common';
import type { Placement } from '../common';
import type { Family } from '../community/kit';
import { board, box as cbox, cyl as ccyl } from '../community/kit';
import { lampPost, skyline } from '../community/setKit';
import {
  LEKKI_GROUND,
  LEKKI_PIECES,
  LEKKI_REACH,
  LEKKI_THEME,
  RUMBLE_LEKKI_LOOK,
  RUMBLE_LEKKI_NIGHT_LOOK,
} from '../lekkiArt';
import { sign, signTexture } from '../oshodiKit';
import { tileWorld } from '../rumbleV2Kit';
import type { CommunityDistrictArt } from './communityKit';
import { landmarkPlace } from './communityKit';

/**
 * The estate substation: a raised plinth, transformer tanks with cooling fins and porcelain bushings, a chain-link fence on
 * posts round the pad and the yellow danger plate on its south face (campaign-only letter 'T').
 */
const substation: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  cbox(k, g, k.concrete, r.w - 0.06, 0.22, r.h - 0.06, r.cx, 0, r.cz, 0x9a968a);
  const tanks = Math.max(1, Math.floor(r.w / 1.5));
  for (let i = 0; i < tanks; i++) {
    const x = r.cx - r.w / 2 + (i + 0.5) * (r.w / tanks);
    cbox(k, g, k.metal, 0.95, 1.3, Math.min(1.2, r.h - 0.6), x, 0.22, r.cz, 0x5e6e62);
    for (const s of [-1, 1])
      for (let f = 0; f < 4; f++)
        cbox(k, g, k.metal, 0.05, 1.0, 0.5, x + s * 0.52, 0.32, r.cz - 0.36 + f * 0.24, 0x4e5c52); // cooling fins
    for (let b = -1; b <= 1; b++) {
      ccyl(k, g, k.paint, 0.06, 0.08, 0.55, x + b * 0.28, 1.52, r.cz - 0.1, 0xd8d0c0, 6); // porcelain bushings
      ccyl(k, g, k.metal, 0.02, 0.02, 0.5, x + b * 0.28, 2.07, r.cz - 0.1, 0x8a6a3a, 4);
    }
  }
  // the fence: posts and a mesh panel on every side
  const fence = 0x8a8e90;
  for (const [w, d, x, z] of [
    [r.w - 0.1, 0.03, r.cx, r.cz - r.h / 2 + 0.06],
    [r.w - 0.1, 0.03, r.cx, r.cz + r.h / 2 - 0.06],
    [0.03, r.h - 0.1, r.cx - r.w / 2 + 0.06, r.cz],
    [0.03, r.h - 0.1, r.cx + r.w / 2 - 0.06, r.cz],
  ] as const)
    cbox(k, g, k.metal, w, 2.1, d, x, 0.2, z, fence);
  for (let x = r.x; x <= r.x + r.w; x++)
    for (const z of [r.cz - r.h / 2 + 0.06, r.cz + r.h / 2 - 0.06])
      ccyl(k, g, k.metal, 0.04, 0.04, 2.3, k.wx(x) - 0.5, 0, z, 0x5a5e60, 5);
  board(
    k,
    g,
    k.atlas.board('danger', 256, 64, {
      bg: '#e0b020',
      fg: '#16140f',
      lines: [['DANGER  •  11 KV', 26]],
      border: '#16140f',
    }),
    Math.min(1.4, r.w - 0.4),
    0.36,
    r.cx,
    1.2,
    zf + 0.02,
  );
  void n;
};

export const LEKKI_CAMPAIGN_ART: CommunityDistrictArt = {
  look: RUMBLE_LEKKI_LOOK,
  nightLook: RUMBLE_LEKKI_NIGHT_LOOK,
  theme: LEKKI_THEME,
  families: { ...LEKKI_PIECES, substation },
  reach: { ...LEKKI_REACH, substation: 2 },
  floor: {
    ...LEKKI_GROUND,
    roleTint: {
      plaza: 'rgba(90,130,90,0.14)', // the garden walks: grass verges and hedges
      approach: 'rgba(120,130,130,0.10)', // the gate road and its checkpoint apron
      street: 'rgba(222,200,150,0.16)', // the sandy service roads
      lane: 'rgba(210,190,140,0.14)',
      works: 'rgba(60,56,50,0.16)', // the plant yard and the substation: oil-dark hardstanding
      service: 'rgba(150,150,140,0.12)', // the utility compounds
    },
  },
  env: {
    seed: 0x0331,
    kinds: ['car', 'bus', 'car', 'danfo', 'keke'],
    beds: ['crowd_loop', 'buspark_loop'],
    crowdAt: { danfoRank: 'waiting', gatehouseSign: 'watching', waterTower: 'waiting' },
    lightAt: {
      floodlight: { color: 0xe8f4ff, height: 8.2 },
      gatehouseSign: { color: 0xffe0b0, height: 2.4 },
    },
  },
  set: {
    backdrop(ctx, { tod }) {
      // low villa rooftops beyond the east and west walls (the coastal haze behind them)
      for (const [edge, seed] of [
        ['east', 7],
        ['west', 11],
      ] as const)
        skyline(ctx, tod, {
          edge,
          off: 6,
          depth: 6,
          hMin: 4,
          hMax: 7,
          tints: ['#e4e0d4', '#d8d0bc', '#c8d0c8', '#b0a890'],
          seed,
          step: 6,
        });
    },
    landmarks: {
      glassTowers(ctx, l, _at, { tod }) {
        const { wx } = tileWorld(ctx.W, ctx.H);
        const x0 = wx(l.at[0]);
        skyline(ctx, tod, {
          edge: 'north',
          off: 9,
          depth: 8,
          hMin: 9,
          hMax: 18,
          tints: ['#7ab0c8', '#8ab8c8', '#d8d4c4', '#6a9ab4', '#cfd4d0'],
          gap: (c) => Math.abs(c - x0) > 30,
          seed: 5,
          step: 7,
        });
      },
      danfoRank(ctx, l) {
        const p = landmarkPlace(ctx, l, 4.6);
        const along = (k: number): Placement => ({
          x: p.side === 'north' ? p.x + k * 3.6 : p.x,
          y: STREET,
          z: p.side === 'north' ? p.z : p.z + k * 3.6,
          ry: p.side === 'north' ? Math.PI / 2 : p.x < 0 ? 0 : Math.PI,
        });
        ctx.vehicles('taxi', [along(-1)], { idle: true });
        ctx.vehicles('danfo', [along(0), along(1)], { idle: true });
      },
      gatehouseSign(ctx, l, at) {
        const p = landmarkPlace(ctx, l, 3.9);
        const map = signTexture(
          `lekki:campaign:${l.id}`,
          512,
          128,
          {
            bg: '#16304e',
            fg: '#e8e0c8',
            lines: [[l.name.toUpperCase(), 40]],
            border: '#e8e0c8',
            wear: 0.6,
          },
          73,
        );
        sign(ctx, map, p.x, 3.4, p.z, 4.2, 0.95, at.ry);
      },
      floodlight(ctx, l) {
        const p = landmarkPlace(ctx, l, 3.2);
        const off = p.side === 'north' ? ([3, 0] as const) : ([0, 3] as const);
        for (const s of [-1, 1]) lampPost(ctx, p.x + s * off[0], p.z + s * off[1], p.ry, 0xe8f4ff, 8.2);
      },
      powerLine(ctx, l) {
        // two steel masts with cross-arms and the three conductors sagging between them, beyond the side
        const p = landmarkPlace(ctx, l, 5.5);
        const steel = mat(0x7a7e80, { roughness: 0.6, metalness: 0.5 });
        const wire = mat(0x2a2a2c, { roughness: 0.8 });
        const along = p.side === 'north' ? ([1, 0] as const) : ([0, 1] as const);
        for (const s of [-1, 1]) {
          const x = p.x + along[0] * s * 7;
          const z = p.z + along[1] * s * 7;
          ctx.statics.add(cyl(0.16, 0.32, 13, steel, x, 6.5, z, 6));
          for (const y of [10.6, 12.2]) {
            const arm = box(along[0] ? 0.12 : 3.6, 0.14, along[0] ? 3.6 : 0.12, steel, x, y, z);
            ctx.statics.add(arm);
          }
        }
        for (const [dy, d] of [
          [10.5, -1.6],
          [10.5, 1.6],
          [12.1, 0],
        ] as const)
          ctx.statics.add(
            box(
              along[0] ? 14 : 0.04,
              0.04,
              along[0] ? 0.04 : 14,
              wire,
              p.x + (along[0] ? 0 : d),
              dy - 0.6,
              p.z + (along[0] ? d : 0),
            ),
          );
      },
      waterTower(ctx, l) {
        const p = landmarkPlace(ctx, l, 5);
        const legs = mat(0x8a8e90, { roughness: 0.6, metalness: 0.4 });
        const tank = mat(0xd8d4c8, { roughness: 0.7 });
        for (const dx of [-1.2, 1.2])
          for (const dz of [-1.2, 1.2]) ctx.statics.add(cyl(0.1, 0.12, 7, legs, p.x + dx, 3.5, p.z + dz, 6));
        ctx.statics.add(cyl(2.0, 2.0, 2.6, tank, p.x, 8.3, p.z, 14));
        ctx.statics.add(cyl(2.1, 0.4, 0.6, tank, p.x, 9.9, p.z, 14));
      },
    },
    people: 12,
    lamp: 0xffe0b0,
    crowd: 0.25,
  },
};
