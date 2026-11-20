/**
 * The COMMUNITY-DISTRICT campaign kit (docs/CAMPAIGN_WORLD.md "How to add a campaign area", step 2; decision WM1): one
 * generic presentation for the campaign areas of every researched community (Mushin, Fadeyi/Somolu, Ebute Metta, Lagos
 * Island, Lekki), so a new district is a `KITS` entry (`register.ts`) plus its own data, never new generic code.
 *
 * A district gives its `CommunityDistrictArt` (data and the pieces its Rumble art already has):
 *
 *   look / nightLook   the district's Rumble day and night looks (the same haze, the same lamps)
 *   theme / families / reach   its community cover pieces: the cover is drawn by the community cover factory on the area's
 *                      own board (`ArenaDef.cover`, painted by `Board.cover(legend)` from the district's `CoverLegend`)
 *   floor              its ground colours; each sub-area is tinted by its ROLE (`roleTint`), every barrier crate is framed,
 *                      the sub-area names are stencilled
 *   env                its ambient vehicle kinds and sound beds; crowds and light pockets come from the area's landmarks
 *                      (`crowdAt` / `lightAt`: which landmark kinds gather people, which are lit)
 *   set                a backdrop round every area (rooftops, skyline) and the district's set pieces BY LANDMARK KIND,
 *                      each placed from the area's landmark anchors (data, `areas<District>.ts`). Everything stands OFF
 *                      the board; the south (camera) side stays low and clear.
 *
 * `communityCampaignKit(art)` turns it into the `(area) => ArenaArt` a `KITS` entry is.
 */
import type { ArenaDef, CampaignAreaDef, CampaignLandmark, DistrictDef } from '../../../sim';
import { getArena } from '../../../sim';
import type { ArenaLook } from '../../arenaLook';
import { timeOfDay } from '../../timeOfDay';
import type { TimeOfDay } from '../../timeOfDay';
import type { ArenaSet, SetContext } from '../common';
import type { ArenaArt } from '../newArenas';
import { communityCover } from '../community/factory';
import type { Family, Theme } from '../community/kit';
import { communityFloor } from '../community/floor';
import type { FloorOpts } from '../community/floor';
import { communityEnv } from '../community/env';
import type { EnvSpec } from '../community/env';
import { lampPost, streetLife } from '../community/setKit';
import { barrierFrame } from '../oshodiMetroArt';
import { floorWords, tileWorld } from '../rumbleV2Kit';
import type { CrowdZoneDef, LightPocket } from '../../env/types';

/** Where a landmark stands in the world: beyond its side of the board, at its tile's row / column, facing the board. */
export interface LandmarkPlace {
  x: number;
  z: number;
  /** Rotation that faces the board. */
  ry: number;
  side: 'north' | 'east' | 'west';
}

/** World position of a landmark beyond its side of the board (`off` metres out). */
export function landmarkPlace(
  ctx: Pick<SetContext, 'W' | 'H'>,
  l: CampaignLandmark,
  off: number,
): LandmarkPlace {
  const { wx, wz } = tileWorld(ctx.W, ctx.H);
  const side = l.side ?? (l.at[0] < ctx.W / 2 ? 'west' : 'east');
  if (side === 'north') return { x: wx(l.at[0]), z: -ctx.H / 2 - off, ry: 0, side };
  if (side === 'west') return { x: -ctx.W / 2 - off, z: wz(l.at[1]), ry: Math.PI / 2, side };
  return { x: ctx.W / 2 + off, z: wz(l.at[1]), ry: -Math.PI / 2, side };
}

/** Draws one landmark kind of a district: `at` is the landmark's place 3 m beyond its side (re-place with `landmarkPlace`). */
export type LandmarkPiece = (
  ctx: SetContext,
  l: CampaignLandmark,
  at: LandmarkPlace,
  env: { tod: TimeOfDay; area: CampaignAreaDef },
) => void;

export interface CommunityDistrictArt {
  look: ArenaLook;
  nightLook: ArenaLook;
  /** The district's community cover pieces (its Rumble art's theme, families and occlusion reach). */
  theme: Theme;
  families: Readonly<Record<string, Family>>;
  reach: Readonly<Record<string, number>>;
  /** The district's ground (its Rumble floor's colours) and a tint per sub-area role. */
  floor: Pick<FloorOpts, 'seed' | 'base' | 'dust' | 'road' | 'kerb' | 'pavers' | 'lane'> & {
    roleTint: Partial<Record<DistrictDef['role'], string>>;
  };
  env: Pick<EnvSpec, 'kinds' | 'beds'> & {
    seed: number;
    /** Landmark kinds that gather a crowd beyond their side, and its mood. */
    crowdAt?: Readonly<Record<string, CrowdZoneDef['mood']>>;
    /** Landmark kinds that cast a light pocket (practical light) at their side. */
    lightAt?: Readonly<Record<string, { color: number; height: number }>>;
  };
  set: {
    /** Drawn round every area of the district before its landmarks (rooftops, a skyline layer). */
    backdrop?: (ctx: SetContext, env: { tod: TimeOfDay; area: CampaignAreaDef }) => void;
    /** The district's set pieces by landmark kind; a kind not listed is skipped. */
    landmarks: Readonly<Record<string, LandmarkPiece>>;
    /** People on the pavements north, east and west (default 12). */
    people?: number;
    /** Lamp colour on the side pavements (default sodium). */
    lamp?: number;
    crowd?: number;
  };
}

/** The ground of the area: the district's colours, each sub-area tinted by its role, barriers framed, names stencilled. */
function floorOf(art: CommunityDistrictArt, area: CampaignAreaDef, arena: () => ArenaDef): ArenaArt['floor'] {
  const tint: Record<string, string> = {};
  for (const d of area.subAreas) {
    const c = art.floor.roleTint[d.role];
    if (c) tint[d.id] = c;
  }
  return communityFloor(area.arenaId, {
    ...art.floor,
    tint,
    arena,
    extra: (g, _rg, layout) => {
      const at = (x: number, y: number): string => layout[y]?.[x] ?? '#';
      // every authored barrier in a painted frame (breakable, and it says so)
      layout.forEach((row, y) => [...row].forEach((c, x) => c === 'x' && barrierFrame(g, x, y)));
      // the sub-area names stencilled faintly where they read (fictional names)
      for (const d of area.subAreas) {
        const [x0, y0, x1, y1] = d.rects[0]!;
        const cx = (x0 + x1 + 1) / 2;
        let wy = y1;
        while (wy > y0 && at(Math.floor(cx), wy) !== '.' && at(Math.floor(cx), wy) !== '_') wy--;
        floorWords(g, d.name.toUpperCase(), cx, wy + 0.6, 0.2, 'rgba(238,230,210,0.4)');
      }
    },
  });
}

function setOf(art: CommunityDistrictArt, area: CampaignAreaDef): ArenaSet {
  return {
    build(ctx: SetContext): void {
      const tod = timeOfDay();
      art.set.backdrop?.(ctx, { tod, area });
      for (const l of area.landmarks)
        art.set.landmarks[l.kind]?.(ctx, l, landmarkPlace(ctx, l, 3), { tod, area });
      // lamp posts down both sides, people on the pavements north, east and west (never the camera side)
      const { wz } = tileWorld(ctx.W, ctx.H);
      for (const ty of [4, Math.round(ctx.H / 2), ctx.H - 6]) {
        lampPost(ctx, -ctx.W / 2 - 1.6, wz(ty), Math.PI / 2, art.set.lamp ?? 0xffb060);
        lampPost(ctx, ctx.W / 2 + 1.6, wz(ty), -Math.PI / 2, art.set.lamp ?? 0xffb060);
      }
      streetLife(ctx, { n: art.set.people ?? 12, seed: area.id.length });
    },
    crowd: art.set.crowd ?? 0.25,
    crowdEdges: { north: false, east: true, west: true, south: false },
  };
}

function envOf(art: CommunityDistrictArt, area: CampaignAreaDef, arena: () => ArenaDef): ArenaArt['env'] {
  return (board) => {
    const { cols } = board;
    const night = timeOfDay() === 'night';
    const sideOf = (l: CampaignLandmark): 'north' | 'east' | 'west' =>
      l.side ?? (l.at[0] < cols / 2 ? 'west' : 'east');
    const crowds: CrowdZoneDef[] = area.landmarks.flatMap((l) => {
      const mood = art.env.crowdAt?.[l.kind];
      const side = sideOf(l);
      if (!mood) return [];
      const y = l.at[1];
      const rect =
        side === 'north'
          ? { x0: Math.max(1, l.at[0] - 4), y0: -4.5, x1: Math.min(cols - 1, l.at[0] + 4), y1: -1.8 }
          : side === 'west'
            ? { x0: -5, y0: Math.max(1, y - 3), x1: -1.6, y1: y + 3 }
            : { x0: cols + 1.6, y0: Math.max(1, y - 3), x1: cols + 5, y1: y + 3 };
      return [{ id: `${l.id}Crowd`, rect, count: 6, mood, priority: 2 }];
    });
    const lights: LightPocket[] = area.landmarks.flatMap((l) => {
      const lit = art.env.lightAt?.[l.kind];
      if (!lit) return [];
      const side = sideOf(l);
      const at: readonly [number, number] =
        side === 'north' ? [l.at[0], -2.5] : [side === 'west' ? -2.5 : cols + 2.5, l.at[1]];
      return [
        {
          at,
          height: lit.height,
          color: lit.color,
          size: 1.1,
          strength: night ? 0.8 : 0.4,
          pool: 3,
          flicker: 'sodium' as const,
        },
      ];
    });
    return communityEnv(area.arenaId, board, {
      seed: art.env.seed + area.id.length,
      kinds: art.env.kinds,
      crowds,
      lights,
      beds: art.env.beds,
      layout: () => arena().layout,
    });
  };
}

/**
 * A community district's campaign kit: the `(area) => ArenaArt` of a `KITS` entry. `arena` resolves the area's board
 * (default `getArena(area.arenaId)`; a test passes its own board).
 */
export function communityCampaignKit(
  art: CommunityDistrictArt,
): (area: CampaignAreaDef, arena?: () => ArenaDef) => ArenaArt {
  return (area, arena = () => getArena(area.arenaId)) => ({
    look: art.look,
    nightLook: art.nightLook,
    set: setOf(art, area),
    floor: floorOf(art, area, arena),
    cover: communityCover({
      arenaId: area.arenaId,
      theme: art.theme,
      families: art.families,
      reach: art.reach,
      arena,
    }),
    env: envOf(art, area, arena),
  });
}
