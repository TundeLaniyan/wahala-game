/**
 * The COMMUNITY-DISTRICT campaign kit (docs/CAMPAIGN_WORLD.md "How to add a campaign area", step 2; decision WM1) on a small
 * Mushin test board, sim and presentation (headless: no DOM, textures skipped):
 *
 *   sim      `campaignArena({ legend: communityLegend(L), cover: board.cover(L) })`: the layout and the cover come from the same
 *            painted Board, the cover letters match the legend (a cover that drifts from the letters is refused at import)
 *   render   `communityCampaignKit(art)(area)`: the district's looks, the community cover factory on the area's board (every
 *            solid tile an object, nothing else), the floor, the community env (valid on every budget), a set that keeps
 *            the camera side clear; the community districts are registered through `KITS`
 *   rumble   the community City Rumble boards are unchanged (layout and cover hashes as before the kit)
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getArena } from '../src/sim';
import type { CampaignAreaDef } from '../src/sim';
import { Board } from '../src/sim/arenas/community/painter';
import { campaignArena, checkCover, communityLegend } from '../src/sim/arenas/campaign/kit';
import { MUSHIN_LEGEND } from '../src/sim/arenas/rumbleMushin';
import { communityCampaignKit } from '../src/render/arenas/campaign/communityKit';
import { MUSHIN_CAMPAIGN_ART } from '../src/render/arenas/campaign/mushinCampaign';
import { KITS } from '../src/render/arenas/campaign/register';
import { RUMBLE_MUSHIN_LOOK, RUMBLE_MUSHIN_NIGHT_LOOK } from '../src/render/arenas/mushinArt';
import { budgetFor, planEnvironment, resolveEnv, validateEnvironment } from '../src/render/env/plan';

/** A small Mushin yard: buildings north, lock-ups south, parts stalls, a heap, a workshop, a kiosk, a supply and a barrier. */
function paint(): Board {
  const b = new Board(20, 12);
  b.fill(0, 0, 19, 1, 'B').fill(0, 10, 19, 11, 'L').fill(0, 2, 1, 9, 'B').fill(18, 2, 19, 9, 'B');
  b.fill(3, 3, 5, 4, 'P').fill(8, 3, 10, 4, 'P').fill(13, 3, 14, 3, 'H');
  b.fill(3, 7, 6, 8, 'W').fill(10, 7, 11, 7, 'K');
  b.fill(13, 6, 16, 8, '_');
  b.set(7, 5, '$').set(12, 5, 'x');
  return b;
}
const SUB_AREAS = [
  {
    id: 'yard',
    name: 'Test parts yard',
    role: 'works' as const,
    rects: [[2, 2, 10, 9]] as [number, number, number, number][],
  },
  {
    id: 'apron',
    name: 'Test apron',
    role: 'service' as const,
    rects: [[11, 2, 17, 9]] as [number, number, number, number][],
  },
];
const tiny = () => {
  const b = paint();
  return campaignArena({
    id: 'tinyMushinYard',
    name: 'Tiny Mushin yard',
    rows: b.rows(),
    legend: communityLegend(MUSHIN_LEGEND),
    cover: b.cover(MUSHIN_LEGEND),
    start: { x: 2, y: 9 },
    subAreas: SUB_AREAS,
    endgame: { rect: [2, 2, 17, 9] },
    spawns: 4,
    info: { tagline: 'test', lighting: 'test', hazards: [] },
  });
};

const AREA: CampaignAreaDef = {
  id: 'mushin.testYard',
  districtId: 'mushin',
  arenaId: 'tinyMushinYard',
  name: 'Test yard',
  summary: 'test',
  format: 'field',
  missions: [],
  place: { compass: 'N', from: 'test', neighbours: [] },
  subAreas: SUB_AREAS.map((d) => ({ ...d, purpose: 'test' })),
  sector: {
    id: 'mushin.testYard',
    districtId: 'mushin',
    name: 'test',
    area: 'test',
    rects: [[2, 2, 17, 9]],
    barricades: [],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [2, 9],
  exits: [],
  landmarks: [
    { id: 'line', name: 'Red Line', kind: 'redLine', at: [10, 0], side: 'north', story: 'test landmark' },
    {
      id: 'spill',
      name: 'Parts spill',
      kind: 'partsSpill',
      at: [0, 5],
      side: 'west',
      story: 'test landmark',
    },
    {
      id: 'board',
      name: 'Test traders',
      kind: 'signBoard',
      at: [8, 0],
      side: 'north',
      story: 'test landmark',
    },
    {
      id: 'lights',
      name: 'Yard lights',
      kind: 'floodlight',
      at: [19, 5],
      side: 'east',
      story: 'test landmark',
    },
    {
      id: 'odd',
      name: 'Unknown',
      kind: 'notAPiece',
      at: [19, 8],
      side: 'east',
      story: 'skipped, never an error',
    },
  ],
};

describe('the community campaign kit: the board (sim)', () => {
  it('maps the district CoverLegend to a campaign legend, letter for letter', () => {
    const l = communityLegend(MUSHIN_LEGEND);
    expect(Object.keys(l).sort()).toEqual(Object.keys(MUSHIN_LEGEND).sort());
    for (const [c, d] of Object.entries(MUSHIN_LEGEND)) expect(l[c]).toBe(d.kind);
  });

  it('the layout, the cover map and the cover come from the same painted board; cover letters match the legend', () => {
    const a = tiny();
    const rows = paint().rows();
    expect(a.layout).toEqual(paint().layout(MUSHIN_LEGEND));
    expect(a.campaignOnly).toBe(true);
    expect(a.cover).toEqual(paint().cover(MUSHIN_LEGEND));
    const W = rows[0]!.length;
    const count = new Map<number, string>();
    for (const c of a.cover!)
      for (let y = c.y; y < c.y + c.h; y++)
        for (let x = c.x; x < c.x + c.w; x++) {
          expect(count.has(y * W + x), `${x},${y} twice`).toBe(false);
          count.set(y * W + x, c.kind);
          expect(MUSHIN_LEGEND[rows[y]![x]!]?.kind, `${x},${y}`).toBe(c.kind);
        }
    a.layout.forEach((row, y) =>
      [...row].forEach((ch, x) => expect(count.has(y * W + x), `${x},${y}`).toBe(ch === '#')),
    );
    expect(a.layout[5]![7]).toBe('$');
    expect(a.layout[5]![12]).toBe('x');
  });

  it('refuses a cover that drifts from the letters (wrong kind, a gap, an overlap)', () => {
    const b = paint();
    const legend = communityLegend(MUSHIN_LEGEND);
    const cover = b.cover(MUSHIN_LEGEND);
    expect(() => checkCover('t', b.rows(), legend, cover)).not.toThrow();
    const wrongKind = cover.map((c, i) => (i === 3 ? { ...c, kind: 'timber' } : c));
    expect(() => checkCover('t', b.rows(), legend, wrongKind)).toThrow(/stands on/);
    expect(() => checkCover('t', b.rows(), legend, cover.slice(1))).toThrow(/no cover object/);
    expect(() => checkCover('t', b.rows(), legend, [...cover, cover[0]!])).toThrow(/two cover objects/);
  });
});

describe('the community campaign kit: the presentation (render)', () => {
  const arena = tiny();
  const art = communityCampaignKit(MUSHIN_CAMPAIGN_ART)(AREA, () => arena);
  const board = { cols: arena.layout[0]!.length, rows: arena.layout.length };

  it('registers the community districts through KITS (Mushin first)', () => {
    expect(KITS.mushin).toBeDefined();
    expect(KITS.oshodi).toBeDefined();
  });

  it("draws the district's looks, a set that keeps the camera side clear, a floor", () => {
    expect(art.look).toBe(RUMBLE_MUSHIN_LOOK);
    expect(art.nightLook).toBe(RUMBLE_MUSHIN_NIGHT_LOOK);
    expect(typeof art.set.build).toBe('function');
    expect(art.set.crowdEdges.south).toBe(false);
    expect(typeof art.floor).toBe('function');
  });

  it('the community cover factory draws every solid tile of the area board as an object and nothing else', () => {
    const W = board.cols;
    const cover = art.cover!({ width: W, height: board.rows })!;
    expect(cover).not.toBeNull();
    arena.layout.forEach((row, y) =>
      [...row].forEach((c, x) => expect(cover.covers(y * W + x), `${x},${y}`).toBe(c === '#')),
    );
    cover.dispose();
    expect(art.cover!({ width: W + 1, height: board.rows })).toBeNull();
  });

  it('the environment: crowds and light pockets from the landmarks, valid on every quality budget', () => {
    const env = resolveEnv(art.env!, board);
    expect(validateEnvironment(env, board)).toEqual([]);
    expect(env.crowds?.map((c) => c.id)).toEqual(['spillCrowd']);
    expect(env.lights?.length).toBe(2); // the sign board and the floodlights
    expect(env.traffic).toEqual([]); // a closed area: no road mouth, no ambient traffic on its edges
    for (const level of ['veryLow', 'low', 'medium', 'high'] as const)
      expect(planEnvironment(env, level, board).vehicles.length).toBeLessThanOrEqual(
        budgetFor(env, level).vehicles,
      );
  });
});

// ------------------------------------------------------------------------------------------- Rumble unchanged

const hash = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
/** sha256 (first 16 hex) of each community Rumble board's layout and cover on 77e128f (before the kit). */
const RUMBLE_COMMUNITY: Readonly<Record<string, readonly [string, string]>> = {
  rumbleMushin: ['f4a5b1aec9257cfb', '366d072bd1f0e448'],
  rumbleFadeyi: ['cbc989bc71726421', 'a827f314e22fb182'],
  rumbleEbuteMetta: ['59ac5f018337b330', 'ab7694abcd1e1ab4'],
  rumbleLagosIsland: ['95fb253ba0b58d54', 'f9963684664ccf4b'],
  rumbleLekki: ['a2e2cc51fe36b5f0', '3a4ff1222573e117'],
};

describe('the community City Rumble boards are unchanged', () => {
  it.each(Object.keys(RUMBLE_COMMUNITY).map((id) => [id] as const))('%s: layout and cover', (id) => {
    const a = getArena(id);
    expect(a.campaignOnly).toBeUndefined();
    expect([hash(a.layout.join('\n')), hash(JSON.stringify(a.cover))]).toEqual(RUMBLE_COMMUNITY[id]);
  });
});
