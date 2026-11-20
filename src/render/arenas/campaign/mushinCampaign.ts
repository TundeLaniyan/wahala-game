/**
 * MUSHIN's campaign kit data (docs/CAMPAIGN_WORLD.md "Mushin", decision WM1): the community-district kit
 * (`communityKit.ts`) filled with the pieces the City Rumble Mushin already has (`mushinArt.ts`): its looks, its cover
 * theme, families and reach, its laterite ground, and its set pieces by landmark kind:
 *
 *   redLine       the Red Line viaduct, a white-and-red train and the green-roofed MUSHIN station north of the board
 *   footbridge    the red-and-white steel access footbridge beyond a side
 *   partsSpill    the parts market spilling past the edge: umbrellas, tyre stacks and oil drums
 *   edgeStalls    lock-up stalls along that side's pavement (grain, provisions, basins, cloth)
 *   signBoard     a fictional name board over the pavement (`name` is its text)
 *   smoke         an engine-testing / cooking smoke column beyond the side
 *   danfoRank     yellow danfos queued nose to tail beyond a side, engines idling
 *   floodlight    tall yard lamps on a mast beyond a side
 *
 * The backdrop round every Mushin area: two-storey shophouses pressed in on three sides and the mainland skyline north.
 * Presentation only; everything stands off the board and the south (camera) side stays clear.
 */
import { mat } from '../../assets/helpers';
import { STREET } from '../common';
import type { Placement } from '../common';
import {
  MUSHIN_FAMILIES,
  MUSHIN_GROUND,
  MUSHIN_REACH,
  MUSHIN_THEME,
  RUMBLE_MUSHIN_LOOK,
  RUMBLE_MUSHIN_NIGHT_LOOK,
  redLineStation,
} from '../mushinArt';
import { edgeStalls, lampPost, skyline } from '../community/setKit';
import { shophouseRows } from '../shared';
import { footbridge } from '../footbridge';
import { sign, signTexture, umbrella } from '../oshodiKit';
import { tileWorld } from '../rumbleV2Kit';
import type { CommunityDistrictArt } from './communityKit';
import { landmarkPlace } from './communityKit';

const tarps = (): ReturnType<typeof mat>[] => MUSHIN_THEME.tarps.map((c) => mat(c, { roughness: 0.88 }));

export const MUSHIN_CAMPAIGN_ART: CommunityDistrictArt = {
  look: RUMBLE_MUSHIN_LOOK,
  nightLook: RUMBLE_MUSHIN_NIGHT_LOOK,
  theme: MUSHIN_THEME,
  families: MUSHIN_FAMILIES,
  reach: MUSHIN_REACH,
  floor: {
    ...MUSHIN_GROUND,
    roleTint: {
      works: 'rgba(60,50,48,0.16)', // oil-dark parts yards and workshops
      street: 'rgba(120,70,40,0.10)', // the trading streets
      lane: 'rgba(110,100,80,0.10)',
      service: 'rgba(170,150,90,0.12)', // warehouse and loading yards
      plaza: 'rgba(80,120,70,0.07)',
      park: 'rgba(40,36,34,0.14)',
    },
  },
  env: {
    seed: 0x0301,
    kinds: ['danfo', 'bus', 'keke', 'car', 'truck'],
    beds: ['crowd_loop', 'buspark_loop'],
    crowdAt: { partsSpill: 'trading', edgeStalls: 'trading', danfoRank: 'waiting', footbridge: 'waiting' },
    lightAt: { floodlight: { color: 0xe8f4ff, height: 8.2 }, signBoard: { color: 0xffb060, height: 2.4 } },
  },
  set: {
    backdrop(ctx, { tod }) {
      shophouseRows(ctx, { north: true, east: true, west: true, seed: 3, close: 0.45, scale: 1.25 });
      skyline(ctx, tod, {
        edge: 'north',
        off: 17,
        depth: 7,
        hMin: 7,
        hMax: 14,
        tints: ['#8a6a50', '#6a7a82', '#9a7a58', '#7a6a6a', '#8a8a74'],
        seed: 3,
      });
    },
    landmarks: {
      redLine(ctx, l) {
        redLineStation(ctx, -ctx.H / 2 - 11.5, tileWorld(ctx.W, ctx.H).wx(l.at[0]), -ctx.W / 4);
      },
      footbridge(ctx, l) {
        const p = landmarkPlace(ctx, l, 2.9);
        footbridge(ctx, {
          anchor: `campaign-${l.id}`,
          x: p.x,
          z0: p.z - 3,
          z1: p.z + 3,
          deck: 4.0,
          style: 'steel',
          sign: l.name.toUpperCase(),
          signBg: '#b8322a',
          signFg: '#ffffff',
        });
      },
      partsSpill(ctx, l, at) {
        const t = tarps();
        const p = landmarkPlace(ctx, l, 2.4);
        const along = at.side === 'north' ? ([1, 0] as const) : ([0, 1] as const);
        const spots: Placement[] = [];
        for (let k = -2; k <= 2; k++) {
          const x = p.x + along[0] * k * 2.6;
          const z = p.z + along[1] * k * 2.6;
          if (k % 2 === 0) umbrella(ctx, x, z, 0.95, t[(k + 7) % 7]!, t[(k + 10) % 7]!, { h: 1.95 });
          spots.push({ x: x + along[1] * 0.6, y: STREET, z: z + along[0] * 0.6, ry: k * 0.7 });
        }
        ctx.instance('env_tyrestack', spots.slice(0, 3));
        ctx.instance('env_barrel', spots.slice(3));
      },
      edgeStalls(ctx, l, at) {
        const { wz } = tileWorld(ctx.W, ctx.H);
        const near = (z: number): boolean => Math.abs(z - wz(l.at[1])) > 7;
        edgeStalls(ctx, {
          north: at.side === 'north',
          east: at.side === 'east',
          west: at.side === 'west',
          goods: ['grain', 'provisions', 'basins', 'cloth'],
          gap: near,
          gapNorth: (x: number) => Math.abs(x - tileWorld(ctx.W, ctx.H).wx(l.at[0])) > 9,
          seed: l.id.length,
        });
      },
      signBoard(ctx, l, at) {
        const p = landmarkPlace(ctx, l, 3.9);
        const map = signTexture(
          `mus:campaign:${l.id}`,
          512,
          128,
          { bg: '#2a5a8a', fg: '#f2e6c8', lines: [[l.name.toUpperCase(), 42]], border: '#f2e6c8', wear: 1.1 },
          71,
        );
        sign(ctx, map, p.x, 3.6, p.z, 4, 0.9, at.ry);
      },
      smoke(ctx, l) {
        const p = landmarkPlace(ctx, l, 6);
        ctx.ambient.smokeColumn(p.x, 6, p.z, { shade: 0.55, size: 1.4, rate: 2.5 });
      },
      danfoRank(ctx, l) {
        const p = landmarkPlace(ctx, l, 4.6);
        const along: Placement[] = [-1, 0, 1].map((k) => ({
          x: p.side === 'north' ? p.x + k * 3.4 : p.x,
          y: STREET,
          z: p.side === 'north' ? p.z : p.z + k * 3.4,
          ry: p.side === 'north' ? Math.PI / 2 : p.x < 0 ? 0 : Math.PI,
        }));
        ctx.vehicles('danfo', along, { idle: true });
      },
      floodlight(ctx, l) {
        const p = landmarkPlace(ctx, l, 3.2);
        const off = p.side === 'north' ? ([3, 0] as const) : ([0, 3] as const);
        for (const s of [-1, 1]) lampPost(ctx, p.x + s * off[0], p.z + s * off[1], p.ry, 0xe8f4ff, 8.2);
      },
    },
    people: 14,
    lamp: 0xffb060,
    crowd: 0.3,
  },
};
