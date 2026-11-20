/**
 * FADEYI/SOMOLU's campaign kit data (docs/CAMPAIGN_WORLD.md "Fadeyi/Somolu", decision WF1): the community-district kit
 * (`communityKit.ts`) filled with the pieces the City Rumble Fadeyi already has (`fadeyiArt.ts`): its looks, its cover
 * theme, families and reach (plus the community warehouse for the Ring's sheds and stores, letter `H`), its grey highway
 * ground, and its set pieces by landmark kind:
 *
 *   ikoroduRoad   the divided highway beyond the north barrier: asphalt, lane dashes, the blue BRT lanes between the
 *                 concrete medians, danfos on the carriageways, lamps
 *   footbridge    the concrete footbridge beyond a side (BRT blue name board)
 *   signBoard     a fictional name board over the pavement (`name` is its text), in the Fadeyi billboard's yellow
 *   edgeStalls    stalls along that side's pavement (provisions, basins, cloth)
 *   danfoRank     yellow danfos queued nose to tail beyond a side, engines idling
 *   floodlight    tall yard lamps on a mast beyond a side
 *
 * The backdrop round every Fadeyi/Somolu area: plastered shophouses on three sides and the mainland skyline north.
 * Presentation only; everything stands off the board and the south (camera) side stays clear.
 */
import { STREET } from '../common';
import type { Placement } from '../common';
import { warehouse } from '../community/families';
import { edgeStalls, lampPost, skyline } from '../community/setKit';
import {
  FADEYI_FAMILIES,
  FADEYI_GROUND,
  FADEYI_REACH,
  FADEYI_THEME,
  RUMBLE_FADEYI_LOOK,
  RUMBLE_FADEYI_NIGHT_LOOK,
} from '../fadeyiArt';
import { footbridge } from '../footbridge';
import { sign, signTexture, streetPlane } from '../oshodiKit';
import { shophouseRows } from '../shared';
import { tileWorld } from '../rumbleV2Kit';
import type { CommunityDistrictArt } from './communityKit';
import { landmarkPlace } from './communityKit';

export const FADEYI_CAMPAIGN_ART: CommunityDistrictArt = {
  look: RUMBLE_FADEYI_LOOK,
  nightLook: RUMBLE_FADEYI_NIGHT_LOOK,
  theme: FADEYI_THEME,
  families: { ...FADEYI_FAMILIES, warehouse },
  reach: { ...FADEYI_REACH, warehouse: 3 },
  floor: {
    ...FADEYI_GROUND,
    roleTint: {
      approach: 'rgba(70,70,74,0.10)', // the slips: highway grey
      street: 'rgba(110,100,86,0.10)', // the checkpoint street (the Rumble shopfronts' tint)
      concourse: 'rgba(90,96,110,0.10)', // the toll plaza corridor
      lane: 'rgba(120,130,110,0.10)', // the back lanes (the Rumble inner grid's tint)
      works: 'rgba(60,56,50,0.15)', // the yard and the vehicle pound: oil-dark hardstanding
      service: 'rgba(150,140,110,0.10)', // the route office compound
    },
  },
  env: {
    seed: 0x0311,
    kinds: ['danfo', 'bus', 'danfo', 'car', 'keke'],
    beds: ['buspark_loop', 'crowd_loop'],
    crowdAt: { edgeStalls: 'trading', danfoRank: 'waiting', footbridge: 'waiting', ikoroduRoad: 'waiting' },
    lightAt: { floodlight: { color: 0xe8f4ff, height: 8.2 }, signBoard: { color: 0xffd9a0, height: 2.4 } },
  },
  set: {
    backdrop(ctx, { tod }) {
      shophouseRows(ctx, { north: true, east: true, west: true, seed: 11, close: 0.5, scale: 1.2 });
      skyline(ctx, tod, {
        edge: 'north',
        off: 19,
        depth: 7,
        hMin: 6,
        hMax: 12,
        tints: ['#8a8a82', '#6a7a82', '#9a8a70', '#7a7a7a'],
        seed: 11,
      });
    },
    landmarks: {
      ikoroduRoad(ctx, l) {
        // anchor: fadeyi-campaign-highway. The highway beyond the north shophouses: carriageways, BRT lanes, medians
        const zc = -ctx.H / 2 - 11;
        streetPlane(
          ctx,
          `cr:fadeyi:campaign:hw:${l.id}`,
          { x: 0, z: zc, w: ctx.W + 60, d: 9.4, ppm: 12 },
          (g, px, s) => {
            g.fillStyle = '#3c3e40';
            g.fillRect(0, 0, 99999, 99999);
            const [, z0] = px(0, zc - 4.7);
            const row = (k: number): number => z0 + k * s;
            g.fillStyle = 'rgba(42,127,184,0.7)';
            g.fillRect(0, row(3.7), 99999, 2 * s);
            g.fillStyle = 'rgba(232,224,196,0.7)';
            for (const k of [1, 2, 4, 7, 8])
              for (let x = 0; x < 99999; x += s * 2) g.fillRect(x, row(k) - 1, s * 0.9, 3);
            g.fillStyle = '#b6b2a8';
            for (const k of [3, 6]) g.fillRect(0, row(k) + s * 0.15, 99999, s * 0.7);
          },
        );
        const { wx } = tileWorld(ctx.W, ctx.H);
        // danfos stopped on the carriageways either side of the BRT lanes
        const stopped: Placement[] = [-1, 1].map((k) => ({
          x: wx(l.at[0]) + k * 6,
          y: STREET,
          z: zc + k * 2.8,
          ry: k * (Math.PI / 2),
        }));
        ctx.vehicles('danfo', stopped, { idle: true });
        for (const dx of [-14, 0, 14]) lampPost(ctx, wx(l.at[0]) + dx, zc + 1.4, 0, 0xffd9a0);
      },
      footbridge(ctx, l) {
        const p = landmarkPlace(ctx, l, 2.9);
        footbridge(ctx, {
          anchor: `campaign-${l.id}`,
          x: p.x,
          z0: p.z - 3,
          z1: p.z + 3,
          deck: 4.0,
          style: 'concrete',
          sign: l.name.toUpperCase(),
          signBg: '#2a7fb8',
          signFg: '#ffffff',
        });
      },
      signBoard(ctx, l, at) {
        const p = landmarkPlace(ctx, l, 3.9);
        const map = signTexture(
          `fad:campaign:${l.id}`,
          512,
          128,
          { bg: '#e0b020', fg: '#1c1608', lines: [[l.name.toUpperCase(), 42]], border: '#1c1608', wear: 1.1 },
          83,
        );
        sign(ctx, map, p.x, 3.6, p.z, 4, 0.9, at.ry);
      },
      edgeStalls(ctx, l, at) {
        const { wx, wz } = tileWorld(ctx.W, ctx.H);
        edgeStalls(ctx, {
          north: at.side === 'north',
          east: at.side === 'east',
          west: at.side === 'west',
          goods: ['provisions', 'basins', 'cloth'],
          gap: (z: number) => Math.abs(z - wz(l.at[1])) > 7,
          gapNorth: (x: number) => Math.abs(x - wx(l.at[0])) > 9,
          seed: l.id.length,
        });
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
    lamp: 0xffd9a0,
    crowd: 0.25,
  },
};
