/**
 * The OSHODI kit for campaign areas (presentation only; the boards are `src/sim/arenas/campaign/`, the areas
 * `src/sim/mission/areasOshodi.ts`; docs/CAMPAIGN_WORLD.md, decision WX3). A campaign area of Oshodi reads as the same district
 * as the City Rumble map because it is built from the same pieces:
 *
 *   cover      the Transport Metropolis cover builder (`oshodiMetroCover.ts`) on the area's own letter map: terminal wings,
 *              danfo ranks with route cards, bay shelters, canopy columns, kiosks, stalls, container shops, workshops
 *   floor      the district's ground per sub-area role (pavers in the market streets, slabs on the forecourt, worn asphalt
 *              in the bus park, oil-stained hardstanding in the yards, ballast at the rail edge), the loading streets'
 *              road paint, the kept-clear aprons hatched, every barrier crate in its yellow-and-black frame, the
 *              sub-area names stencilled (fictional)
 *   set        the district's skyline and, from the area's landmark anchors (data), the expressway flyover, danfo ranks,
 *              market umbrellas, floodlight masts, a footbridge, a rail viaduct; street life and lamp posts on the sides.
 *              Everything stands OFF the board; the south (camera) side stays clear.
 *   look       the Transport Metropolis day / night looks (the same haze, the same lamps)
 *   env        the community environment (no road mouth: no ambient traffic on the board's edges), crowds and light
 *              pockets at the landmarks
 */
import { DoubleSide } from 'three';
import { getArena } from '../../../sim';
import type { CampaignAreaDef, CampaignLandmark, DistrictDef } from '../../../sim';
import { artRng } from '../../textures';
import { mat, uniqueMat } from '../../assets/helpers';
import { timeOfDay } from '../../timeOfDay';
import type { CoverFactory } from '../boardCover';
import type { ArenaSet, Placement, SetContext } from '../common';
import { STREET } from '../common';
import { crack, noiseFill, stain, tyreTrack } from '../floorKit';
import type { FloorDrawer } from '../floorKit';
import { T } from '../floorKit';
import { buildOshodiMetroCover } from '../oshodiMetroCover';
import { barrierFrame, hatch, pavers, slabs, trackTile } from '../oshodiMetroArt';
import { expressway, skyline } from '../oshodiMetroLandmarks';
import { drum, umbrella } from '../oshodiKit';
import { SiteLights } from '../roadworksKit';
import { floorWords, litter, paintKerbs, paintRoads, tileWorld } from '../rumbleV2Kit';
import { footbridge } from '../footbridge';
import { lampPost, streetLife, viaduct, railcars } from '../community/setKit';
import { communityEnv } from '../community/env';
import type { LightPocket, StageEnvironment } from '../../env/types';

// ------------------------------------------------------------------------------------------- floor

function roleAt(subs: readonly DistrictDef[], x: number, y: number): DistrictDef['role'] | '' {
  const d = subs.find((z) => z.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
  return d?.role ?? '';
}

/** The ground of one tile by its sub-area's role (the district's materials). */
function ground(g: CanvasRenderingContext2D, r: () => number, role: string, x: number, y: number): void {
  switch (role) {
    case 'street':
    case 'lane':
      pavers(g, r, x, y);
      if (r() < 0.16) stain(g, (x + r()) * T, (y + r()) * T, 16 + r() * 34, 'rgba(36,30,22,0.38)');
      return;
    case 'park':
      g.fillStyle = `rgba(${62 + r() * 12},${60 + r() * 10},${58 + r() * 10},0.8)`;
      g.fillRect(x * T, y * T, T, T);
      if (r() < 0.14) stain(g, (x + r()) * T, (y + r()) * T, 20 + r() * 36, 'rgba(10,10,12,0.42)');
      return;
    case 'works':
    case 'service':
      g.fillStyle = `rgba(${92 + r() * 16},${88 + r() * 12},${80 + r() * 10},0.42)`;
      g.fillRect(x * T, y * T, T, T);
      if (r() < 0.3) stain(g, (x + r()) * T, (y + r()) * T, 20 + r() * 40, 'rgba(10,10,12,0.4)');
      return;
    case 'rail':
      g.fillStyle = `rgba(${84 + r() * 18},${80 + r() * 16},${74 + r() * 14},0.7)`;
      g.fillRect(x * T, y * T, T, T);
      for (let i = 0; i < 26; i++) {
        const c = 60 + r() * 90;
        g.fillStyle = `rgba(${c},${c - 2},${c - 8},0.6)`;
        g.fillRect(x * T + r() * T, y * T + r() * T, 2 + r() * 4, 2 + r() * 3);
      }
      return;
    case 'concourse':
    case 'plaza':
      slabs(g, r, x, y, 126, 'rgba(40,38,34,0.45)');
      return;
    default:
      slabs(g, r, x, y, 130, 'rgba(46,40,34,0.42)');
  }
}

/** The floor drawer of an Oshodi campaign area (reads the area's board and its sub-areas). */
export function oshodiCampaignFloor(arenaId: string): FloorDrawer {
  return (g, rg, cols, rows) => {
    const arena = getArena(arenaId);
    const L = arena.layout;
    const subs = arena.districts ?? [];
    const r = artRng(7411 + cols * 31 + rows);
    const at = (x: number, y: number): string => L[y]?.[x] ?? '#';
    noiseFill(g, g.canvas.width, g.canvas.height, [150, 142, 128], 22, 71);
    noiseFill(rg, rg.canvas.width, rg.canvas.height, [218, 218, 218], 20, 72);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const c = at(x, y);
        if (c === '#' || c === '=') continue;
        ground(g, r, roleAt(subs, x, y), x, y);
      }
    // the loading streets: asphalt, kerbs, a dashed centre line along each run of road rows
    const isRoad = (x: number, y: number): boolean => at(x, y) === '=';
    paintRoads(g, rg, L, r, [60, 58, 55], isRoad);
    paintKerbs(g, L, 'rgba(206,200,184,0.85)', 'rgba(30,30,30,0.9)', isRoad);
    for (let y = 0; y < rows - 1; y++)
      for (let x = 0; x < cols; x++)
        if (isRoad(x, y) && isRoad(x, y + 1) && !isRoad(x, y - 1) && x % 2 === 0) {
          g.fillStyle = 'rgba(232,228,214,0.6)';
          g.fillRect(x * T + 14, (y + 1) * T - 4, T - 28, 8);
        }
    // a kept-clear apron reads as one: a faint yellow hatch over every '_' run, edged by the board
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) if (at(x, y) === '_') hatch(g, x, y, x, y, 'rgba(226,186,40,0.16)');
    // in a rail sub-area the '=' rows are track (ballast, sleepers, rails), not road
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if (roleAt(subs, x, y) === 'rail' && at(x, y) === '=') trackTile(g, r, x, y);
    // every authored barrier in a painted frame (breakable, and it says so)
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (at(x, y) === 'x') barrierFrame(g, x, y);
    // the sub-area names stencilled faintly where they read (fictional names)
    for (const d of subs) {
      const [x0, y0, x1, y1] = d.rects[0]!;
      const cx = (x0 + x1 + 1) / 2;
      let wy = y1;
      while (wy > y0 && at(Math.floor(cx), wy) !== '.' && at(Math.floor(cx), wy) !== '_') wy--;
      floorWords(g, d.name.toUpperCase(), cx, wy + 0.6, 0.2, 'rgba(238,234,220,0.42)');
    }
    for (let i = 0; i < 10; i++) tyreTrack(g, r, cols * T, rows * T, 'rgba(20,18,16,0.1)');
    for (let i = 0; i < cols * rows * 0.2; i++)
      crack(g, r, r() * cols * T, r() * rows * T, 3 + Math.floor(r() * 7), 'rgba(18,16,14,0.5)', 2);
    litter(g, r, cols, rows, 0.5);
  };
}

// ------------------------------------------------------------------------------------------- cover

/** The board cover of an Oshodi campaign area: the district's cover builder on the area's own letter map. */
export function oshodiCampaignCover(arenaId: string): CoverFactory {
  return (board) => {
    const a = getArena(arenaId);
    const map = a.coverMap;
    if (!map || board.width !== a.layout[0]!.length || board.height !== a.layout.length) return null;
    return buildOshodiMetroCover(board, map);
  };
}

// ------------------------------------------------------------------------------------------- the set

/** World position of a landmark beyond its side of the board (`off` metres out), at its tile's row / column. */
function beyond(ctx: SetContext, l: CampaignLandmark, off: number): { x: number; z: number; ry: number } {
  const { wx, wz } = tileWorld(ctx.W, ctx.H);
  const side = l.side ?? (l.at[0] < ctx.W / 2 ? 'west' : 'east');
  if (side === 'north') return { x: wx(l.at[0]), z: -ctx.H / 2 - off, ry: 0 };
  if (side === 'west') return { x: -ctx.W / 2 - off, z: wz(l.at[1]), ry: Math.PI / 2 };
  return { x: ctx.W / 2 + off, z: wz(l.at[1]), ry: -Math.PI / 2 };
}

function landmark(ctx: SetContext, L: SiteLights, l: CampaignLandmark): void {
  const tod = timeOfDay();
  const S = STREET;
  switch (l.kind) {
    case 'flyover':
      expressway(ctx, L);
      return;
    case 'danfoRank': {
      // a queue of yellow danfos along the pavement beyond the side, nose to tail, engines idling
      const p = beyond(ctx, l, 4.6);
      const along: Placement[] = [-1, 0, 1].map((k) => ({
        x: p.x,
        y: S,
        z: p.z + k * 3.4,
        ry: p.x < 0 ? 0 : Math.PI,
      }));
      ctx.vehicles('danfo', along, { idle: true });
      return;
    }
    case 'marketUmbrellas': {
      const cloth = [0xa8442e, 0xc8a844, 0x2e5a86, 0x3a744a, 0xd2ccb8].map((c) => {
        const m = uniqueMat(c, { roughness: 0.88 });
        m.side = DoubleSide;
        ctx.own(m);
        return m;
      });
      for (const side of [-1, 1])
        for (let k = 0; k < 3; k++) {
          const z = tileWorld(ctx.W, ctx.H).wz(Math.max(2, l.at[1] - 2 - k * 3));
          umbrella(
            ctx,
            side * (ctx.W / 2 + 2.2 + (k % 2) * 0.4),
            z,
            0.9,
            cloth[(k + side + 2) % 5]!,
            cloth[(k + 3) % 5]!,
            {
              h: 2.0,
            },
          );
        }
      return;
    }
    case 'floodlight': {
      const p = beyond(ctx, l, 3.2);
      for (const dz of [-3, 3]) {
        lampPost(ctx, p.x, p.z + dz, p.ry, 0xe8f4ff, 8.2);
        L.glow(p.x, 8.4, p.z + dz, tod === 'night' ? 2.2 : 1.1, 0xe8f4ff, tod === 'night' ? 0.9 : 0.3);
      }
      drum(ctx, mat(0x8a2e22, { roughness: 0.75, metalness: 0.3 }), p.x, p.z + 1.2);
      return;
    }
    case 'footbridge': {
      // the footbridge over the street beyond the east / west side: deck along z across the landmark's row
      const p = beyond(ctx, l, 3.4);
      footbridge(ctx, {
        anchor: `campaign-${l.id}`,
        x: p.x,
        z0: p.z - 4,
        z1: p.z + 4,
        deck: 4.2,
        style: 'steel',
        sign: l.name.toUpperCase(),
        signBg: '#1f5a8a',
        signFg: '#f4f0e0',
      });
      return;
    }
    case 'railViaduct': {
      // the commuter line on its viaduct north of the board, a train standing on it
      const z = -ctx.H / 2 - 11;
      viaduct(ctx, { z, x0: -ctx.W / 2 - 30, x1: ctx.W / 2 + 30, deck: 6.2, width: 4.4, track: true });
      railcars(ctx, {
        x: tileWorld(ctx.W, ctx.H).wx(l.at[0]) - 8,
        z,
        y: 6.2,
        cars: 3,
        body: 0xd8d4c8,
        stripe: 0x1f5a8a,
      });
      return;
    }
  }
}

/** The set of an Oshodi campaign area: the district's skyline, the area's landmarks, street life on the sides. */
export function oshodiCampaignSet(area: CampaignAreaDef): ArenaSet {
  return {
    build(ctx: SetContext): void {
      const L = new SiteLights();
      skyline(ctx, L, timeOfDay());
      for (const l of area.landmarks) landmark(ctx, L, l);
      // lamp posts down both sides, people on the pavements north, east and west (never the camera side)
      const { wz } = tileWorld(ctx.W, ctx.H);
      for (const ty of [4, Math.round(ctx.H / 2), ctx.H - 6]) {
        lampPost(ctx, -ctx.W / 2 - 1.6, wz(ty), Math.PI / 2);
        lampPost(ctx, ctx.W / 2 + 1.6, wz(ty), -Math.PI / 2);
      }
      streetLife(ctx, { n: 12, seed: area.id.length });
      L.build(ctx);
    },
    crowd: 0.25,
    crowdEdges: { north: false, east: true, west: true, south: false },
  };
}

// ------------------------------------------------------------------------------------------- env

/** The living environment: crowds by the danfo ranks and market umbrellas, light pockets at the floodlights. */
export function oshodiCampaignEnv(
  area: CampaignAreaDef,
): (board: { cols: number; rows: number }) => StageEnvironment {
  return (board) => {
    const { cols } = board;
    const night = timeOfDay() === 'night';
    const crowds = area.landmarks.flatMap((l) => {
      const west = (l.side ?? (l.at[0] < cols / 2 ? 'west' : 'east')) === 'west';
      const y = l.at[1];
      if (l.kind !== 'danfoRank' && l.kind !== 'marketUmbrellas') return [];
      return [
        {
          id: `${l.id}Crowd`,
          rect: west
            ? { x0: -5, y0: Math.max(1, y - 3), x1: -1.6, y1: y + 3 }
            : { x0: cols + 1.6, y0: Math.max(1, y - 3), x1: cols + 5, y1: y + 3 },
          count: 6,
          mood: l.kind === 'danfoRank' ? ('waiting' as const) : ('trading' as const),
          priority: 2,
        },
      ];
    });
    const lights: LightPocket[] = area.landmarks
      .filter((l) => l.kind === 'floodlight')
      .map((l) => ({
        at: [l.side === 'west' ? -2.5 : cols + 2.5, l.at[1]] as const,
        height: 8.2,
        color: 0xe8f4ff,
        size: 1.2,
        strength: night ? 0.8 : 0.4,
        pool: 3.2,
      }));
    return communityEnv(area.arenaId, board, {
      seed: 0x0e11 + area.id.length,
      kinds: ['danfo', 'bus', 'keke', 'car'],
      crowds,
      lights,
      beds: ['buspark_loop', 'crowd_loop'],
    });
  };
}
