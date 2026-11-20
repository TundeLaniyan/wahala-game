/**
 * The OJUELEGBA kit for the finale's campaign areas (presentation only; the boards are `src/sim/arenas/campaign/ojuelegba*.ts`,
 * the areas `src/sim/mission/areasOjuelegba.ts`; docs/CAMPAIGN_WORLD.md "The Ojuelegba finale", decision WL6). Ojuelegba has
 * its own cover builder (it is not a community-painted district), so this follows the Oshodi pattern: the reference arena's
 * pieces on the area's own letter map, and the area reads as the same junction the story opens on.
 *
 *   cover      the Underbridge cover builder (`ojuelegbaCover.ts`) on the area's letter map: hammerhead piers, packed danfos,
 *              shops with fascia boards, workshops, kiosks, stalls, tyre racks, the bus stop, low lock-ups; the flyover's
 *              outer girders and pier shafts overhead over the area's piers (the deck span is read from the pier letters),
 *              cut away round the fighter exactly as on the reference arena
 *   floor      the reference floor's materials by sub-area role (pavers in the lanes, slabs on the pavements, oily concrete
 *              in the motor park, stained slabs in the yards, a deep shadow band under the deck), the roads' asphalt,
 *              kerbs and centre lines, kept-clear hatching, every barrier crate framed, the sub-area names stencilled
 *   set        shophouses pressed in on three sides; from the landmark anchors (data): the flyover running on north over the
 *              deck columns, danfo ranks, traders' umbrellas, a vulcaniser's smoke, floodlights; lamp posts, street life
 *   look       the reference arena's late-afternoon look (it has no night look, so neither do these)
 *   env        the community environment (no road mouth traffic on the board's edges), crowds at the danfo ranks and
 *              traders, light pockets at the floodlights
 */
import { DoubleSide } from 'three';
import { getArena } from '../../../sim';
import type { CampaignAreaDef, CampaignLandmark, DistrictDef } from '../../../sim';
import { artRng } from '../../textures';
import { mat, uniqueMat } from '../../assets/helpers';
import type { CoverFactory } from '../boardCover';
import type { ArenaSet, Placement, SetContext } from '../common';
import { STREET } from '../common';
import { crack, noiseFill, stain, tyreTrack } from '../floorKit';
import type { FloorDrawer } from '../floorKit';
import { T } from '../floorKit';
import { buildOjuelegbaCover } from '../ojuelegbaCover';
import type { DeckSpan } from '../ojuelegbaDeck';
import { flyover } from '../ojuelegbaLandmarks';
import { RUMBLE_OJUELEGBA_LOOK, barrierFrame, hatch, pavers, slabs } from '../rumbleOjuelegbaArt';
import { drum, umbrella } from '../oshodiKit';
import { SiteLights } from '../roadworksKit';
import { shophouseRows } from '../shared';
import { floorWords, litter, paintKerbs, paintRoads, tileWorld } from '../rumbleV2Kit';
import { lampPost, streetLife } from '../community/setKit';
import { communityEnv } from '../community/env';
import type { ArenaArt } from '../newArenas';
import type { LightPocket, StageEnvironment } from '../../env/types';

/** The deck over an area: one column either side of its piers, cut off one row south of the southernmost bent. */
export function deckSpanOf(coverMap: readonly string[]): DeckSpan | null {
  let x0 = Infinity;
  let x1 = -Infinity;
  let end = -Infinity;
  coverMap.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== 'P') return;
      x0 = Math.min(x0, x - 1);
      x1 = Math.max(x1, x + 1);
      end = Math.max(end, y + 1);
    }),
  );
  return Number.isFinite(x0) ? { x0, x1, end } : null;
}

// ------------------------------------------------------------------------------------------- floor

function roleAt(subs: readonly DistrictDef[], x: number, y: number): DistrictDef['role'] | '' {
  const d = subs.find((z) => z.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
  return d?.role ?? '';
}

/** The floor drawer of an Ojuelegba campaign area (reads the area's board, its sub-areas and its deck). */
export function ojuelegbaCampaignFloor(arenaId: string): FloorDrawer {
  return (g, rg, cols, rows) => {
    const arena = getArena(arenaId);
    const L = arena.layout;
    const subs = arena.districts ?? [];
    const deck = deckSpanOf(arena.coverMap ?? []);
    const r = artRng(5301 + cols * 17 + rows);
    const at = (x: number, y: number): string => L[y]?.[x] ?? '#';
    noiseFill(g, g.canvas.width, g.canvas.height, [150, 140, 124], 22, 51);
    noiseFill(rg, rg.canvas.width, rg.canvas.height, [218, 218, 218], 20, 52);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const c = at(x, y);
        if (c === '=' || c === '#') continue;
        switch (roleAt(subs, x, y)) {
          case 'lane':
          case 'street':
            pavers(g, r, x, y);
            break;
          case 'park':
            // oily compacted concrete of a motor park
            g.fillStyle = `rgba(${96 + r() * 16},${90 + r() * 12},${80 + r() * 10},0.4)`;
            g.fillRect(x * T, y * T, T, T);
            if (r() < 0.35) stain(g, (x + r()) * T, (y + r()) * T, 20 + r() * 40, 'rgba(10,10,12,0.4)');
            break;
          case 'works':
          case 'service':
            slabs(g, r, x, y, 116, 'rgba(36,34,30,0.5)');
            if (r() < 0.25) stain(g, (x + r()) * T, (y + r()) * T, 24 + r() * 44, 'rgba(12,10,8,0.38)');
            break;
          default:
            slabs(g, r, x, y, 132, 'rgba(46,40,34,0.42)'); // pavements of the approaches and under the deck
        }
      }
    // the roads: asphalt, kerbs, the double yellow centre line along each band of road rows
    const isRoad = (x: number, y: number): boolean => at(x, y) === '=';
    paintRoads(g, rg, L, r, [60, 58, 55], isRoad);
    paintKerbs(g, L, 'rgba(206,200,184,0.85)', 'rgba(30,30,30,0.9)', isRoad);
    for (let y = 1; y < rows - 1; y++)
      for (let x = 0; x < cols; x++)
        if (isRoad(x, y) && isRoad(x, y - 1) && isRoad(x, y + 1) && !isRoad(x, y - 2)) {
          g.fillStyle = 'rgba(222,180,44,0.8)';
          g.fillRect(x * T, y * T + T / 2 - 9, T, 6);
          g.fillRect(x * T, y * T + T / 2 + 3, T, 6);
        }
    // the deck's shadow: a cool dark band under the flyover, hard sun walls at both deck edges
    if (deck) {
      g.fillStyle = 'rgba(18,20,26,0.26)';
      g.fillRect((deck.x0 - 0.3) * T, 0, (deck.x1 - deck.x0 + 1.6) * T, (deck.end + 1) * T);
      g.fillStyle = 'rgba(10,10,14,0.18)';
      for (const x of [deck.x0 - 0.3, deck.x1 + 0.9]) g.fillRect(x * T, 0, 0.4 * T, (deck.end + 1) * T);
    }
    // kept-clear floor hatched, every authored barrier in its frame
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (at(x, y) === '_') hatch(g, x, y, x, y, 'rgba(226,186,40,0.16)');
        if (at(x, y) === 'x') barrierFrame(g, x, y);
      }
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
    litter(g, r, cols, rows, 0.6);
  };
}

// ------------------------------------------------------------------------------------------- cover

/** The board cover of an Ojuelegba campaign area: the reference cover builder on the area's letter map, its deck overhead. */
export function ojuelegbaCampaignCover(arenaId: string): CoverFactory {
  return (board) => {
    const a = getArena(arenaId);
    const map = a.coverMap;
    if (!map || board.width !== a.layout[0]!.length || board.height !== a.layout.length) return null;
    return buildOjuelegbaCover(board, { map, deck: deckSpanOf(map) });
  };
}

// ------------------------------------------------------------------------------------------- the set

function beyond(ctx: SetContext, l: CampaignLandmark, off: number): { x: number; z: number; ry: number } {
  const { wx, wz } = tileWorld(ctx.W, ctx.H);
  const side = l.side ?? (l.at[0] < ctx.W / 2 ? 'west' : 'east');
  if (side === 'north') return { x: wx(l.at[0]), z: -ctx.H / 2 - off, ry: 0 };
  if (side === 'west') return { x: -ctx.W / 2 - off, z: wz(l.at[1]), ry: Math.PI / 2 };
  return { x: ctx.W / 2 + off, z: wz(l.at[1]), ry: -Math.PI / 2 };
}

function landmark(ctx: SetContext, L: SiteLights, l: CampaignLandmark, deck: DeckSpan | null): void {
  switch (l.kind) {
    case 'flyover':
      // the deck runs on north of the board over the area's own deck columns
      if (deck) flyover(ctx, L, deck);
      return;
    case 'danfoRank': {
      const p = beyond(ctx, l, 4.6);
      const north = l.side === 'north';
      const along: Placement[] = [-1, 0, 1].map((k) => ({
        x: north ? p.x + k * 3.4 : p.x,
        y: STREET,
        z: north ? p.z : p.z + k * 3.4,
        ry: north ? Math.PI / 2 : p.x < 0 ? 0 : Math.PI,
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
      const p = beyond(ctx, l, 2.3);
      const north = l.side === 'north';
      for (let k = -2; k <= 2; k++)
        umbrella(
          ctx,
          north ? p.x + k * 2.8 : p.x + (k % 2) * 0.4,
          north ? p.z - (k % 2) * 0.5 : p.z + k * 2.8,
          0.9,
          cloth[(k + 5) % 5]!,
          cloth[(k + 7) % 5]!,
          { h: 2.0 },
        );
      return;
    }
    case 'smoke': {
      const p = beyond(ctx, l, 5);
      ctx.ambient.smokeColumn(p.x, STREET + 0.5, p.z, { shade: 0.6, size: 1.0, rate: 3 });
      ctx.instance('env_tyrestack', [{ x: p.x + 1.4, y: STREET, z: p.z + 1.2, ry: 0.4 }]);
      return;
    }
    case 'floodlight': {
      const p = beyond(ctx, l, 3.2);
      for (const dz of [-3, 3]) {
        lampPost(ctx, p.x, p.z + dz, p.ry, 0xe8f4ff, 8.2);
        L.glow(p.x, 8.4, p.z + dz, 1.1, 0xe8f4ff, 0.3);
      }
      drum(ctx, mat(0x8a2e22, { roughness: 0.75, metalness: 0.3 }), p.x, p.z + 1.2);
      return;
    }
  }
}

/** The set of an Ojuelegba campaign area: shophouses round it, the area's landmarks, street life on the sides. */
export function ojuelegbaCampaignSet(area: CampaignAreaDef): ArenaSet {
  return {
    build(ctx: SetContext): void {
      const L = new SiteLights();
      const deck = deckSpanOf(getArena(area.arenaId).coverMap ?? []);
      shophouseRows(ctx, { north: !deck, east: true, west: true, seed: 2 + area.id.length, close: 0.3 });
      for (const l of area.landmarks) landmark(ctx, L, l, deck);
      const { wz } = tileWorld(ctx.W, ctx.H);
      for (const ty of [4, Math.round(ctx.H / 2), ctx.H - 6]) {
        lampPost(ctx, -ctx.W / 2 - 1.6, wz(ty), Math.PI / 2, 0xffb060);
        lampPost(ctx, ctx.W / 2 + 1.6, wz(ty), -Math.PI / 2, 0xffb060);
      }
      streetLife(ctx, { n: 12, seed: area.id.length });
      ctx.ambient.dust(0, -ctx.H / 2 - 2.5, 8, 1.6);
      L.build(ctx);
    },
    crowd: 0.3,
    crowdEdges: { north: false, east: true, west: true, south: false },
  };
}

// ------------------------------------------------------------------------------------------- env

/** The living environment: crowds by the danfo ranks and the traders, light pockets at the floodlights. */
export function ojuelegbaCampaignEnv(
  area: CampaignAreaDef,
): (board: { cols: number; rows: number }) => StageEnvironment {
  return (board) => {
    const { cols } = board;
    const crowds = area.landmarks.flatMap((l) => {
      if (l.kind !== 'danfoRank' && l.kind !== 'marketUmbrellas') return [];
      const side = l.side ?? (l.at[0] < cols / 2 ? 'west' : 'east');
      const y = l.at[1];
      const rect =
        side === 'north'
          ? { x0: Math.max(1, l.at[0] - 4), y0: -4.5, x1: Math.min(cols - 1, l.at[0] + 4), y1: -1.8 }
          : side === 'west'
            ? { x0: -5, y0: Math.max(1, y - 3), x1: -1.6, y1: y + 3 }
            : { x0: cols + 1.6, y0: Math.max(1, y - 3), x1: cols + 5, y1: y + 3 };
      return [
        {
          id: `${l.id}Crowd`,
          rect,
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
        strength: 0.4,
        pool: 3.2,
      }));
    return communityEnv(area.arenaId, board, {
      seed: 0x0c1e + area.id.length,
      kinds: ['danfo', 'bus', 'keke', 'car'],
      crowds,
      lights,
      beds: ['buspark_loop', 'crowd_loop'],
    });
  };
}

/** The presentation of an Ojuelegba campaign area (the `KITS` entry, register.ts). */
export function ojuelegbaCampaignArt(area: CampaignAreaDef): ArenaArt {
  return {
    look: RUMBLE_OJUELEGBA_LOOK,
    set: ojuelegbaCampaignSet(area),
    floor: ojuelegbaCampaignFloor(area.arenaId),
    cover: ojuelegbaCampaignCover(area.arenaId),
    env: ojuelegbaCampaignEnv(area),
  };
}
