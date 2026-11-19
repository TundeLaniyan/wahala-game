/**
 * The CAMPAIGN BOARD KIT (docs/CAMPAIGN_WORLD.md "How to add a campaign area", decisions WX1-WX3) on a tiny painted test
 * board through `campaignArena`: the layout and the cover map from the same rows, the starts, the endgame waves, no raw
 * concrete, deterministic. The registered areas are checked in tests/campaign-world.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { campaignArena, coverMapOf, layoutOf } from '../src/sim/arenas/campaign/kit';
import { OSHODI_KIT } from '../src/sim/arenas/campaign/oshodiKit';

/** A tiny painted board: a danfo rank north, a kiosk, a stall block, lock-ups south, a supply crate and a barrier. */
const TINY = [
  'QQQQQQQQQQQQQQ',
  'Q....BBBB....Q',
  'Q............Q',
  'Q..K.....MM..Q',
  'Q..K..$..MM..Q',
  'Q............Q',
  'Q.==========.Q',
  'Q.....x......Q',
  'Q____........Q',
  'EEEEEEEEEEEEEE',
];
const tiny = () =>
  campaignArena({
    id: 'tinyTestYard',
    name: 'Tiny test yard',
    rows: TINY,
    legend: OSHODI_KIT,
    start: { x: 2, y: 7 },
    subAreas: [{ id: 'yard', name: 'Test yard', role: 'works', rects: [[1, 1, 12, 8]] }],
    endgame: { rect: [1, 1, 12, 8] },
    spawns: 4,
    info: { tagline: 'test', lighting: 'test', hazards: [] },
  });

describe('the campaign board kit (a tiny test board)', () => {
  it('paints the sim layout and the cover map from the same rows', () => {
    const a = tiny();
    expect(a.layout).toEqual(layoutOf(TINY, OSHODI_KIT));
    expect(a.coverMap).toEqual(coverMapOf(TINY, OSHODI_KIT));
    a.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        // every solid tile has its object letter and every letter stands on a solid tile
        expect(c === '#', `${x},${y}`).toBe(a.coverMap![y]![x] !== '.');
        if (c !== '#') expect(c).toBe(TINY[y]![x]);
      }),
    );
    expect(a.layout[4]![6]).toBe('$');
    expect(a.layout[7]![6]).toBe('x');
  });

  it('is campaign-only, a follow-camera board, with no summoned-vehicle lane and no forced crush', () => {
    const a = tiny();
    expect(a.campaignOnly).toBe(true);
    expect(a.kind).toBe('rumble');
    expect(a.forcedMode).toBeUndefined();
    expect(a.config?.vehicles?.lanes).toEqual([]);
    expect(a.districts).toEqual([{ id: 'yard', name: 'Test yard', role: 'works', rects: [[1, 1, 12, 8]] }]);
  });

  it('starts on open floor, the human first; two endgame waves of six on open floor (a rule of every match)', () => {
    const a = tiny();
    expect(a.spawns).toHaveLength(4);
    expect(a.maxPlayers).toBe(4);
    for (const s of a.spawns) expect(a.layout[s.y]![s.x]).toBe('.');
    expect(a.endgameTraps).toHaveLength(2);
    for (const wave of a.endgameTraps) {
      let marks = 0;
      wave.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c === '.') return;
          marks++;
          expect('._').toContain(a.layout[y]![x]);
        }),
      );
      expect(marks).toBe(6);
    }
  });

  it('refuses raw concrete and ragged rows (every edge is a real object)', () => {
    const bad = (rows: string[]) => () =>
      campaignArena({
        id: 'bad',
        name: 'bad',
        rows,
        legend: OSHODI_KIT,
        start: { x: 1, y: 1 },
        subAreas: [],
        endgame: { rect: [0, 0, 1, 1] },
        info: { tagline: '', lighting: '', hazards: [] },
      });
    expect(bad(['####', '#..#', '####'])).toThrow(/raw '#'/);
    expect(bad(['QQQQ', 'Q..', 'QQQQ'])).toThrow(/ragged/);
  });

  it('is pure data: building it twice gives the same arena', () => {
    expect(JSON.stringify(tiny())).toBe(JSON.stringify(tiny()));
  });
});
