/**
 * What the renderer builds of a mission sector (docs/CAMPAIGN_SECTOR_AI.md, "Boundary presentation", "Render cost"):
 * every barricade tile is drawn by a real object (the cover claims it, so no pillar and no crate is drawn there), the
 * barricades fade with the arena's own cover, a gate's object hides once its gate opens, the cover factories leave out
 * what lies outside the clip (and build exactly as before without one), and the living environment drops what never
 * comes near the sector. Built headless (no DOM: textures are skipped, the danfo falls back to the procedural bus).
 */
import { describe, expect, it } from 'vitest';
import { FIELD_MISSION_DEFS, FIELD_MISSION_IDS, buildMissionGame, createGame } from '../../src/sim';
import type { GameState } from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { getSector } from '../../src/sim/mission/sectors';
import { openSectorGates } from '../../src/sim/mission/sector';
import { buildSectorBarricades } from '../../src/render/views/SectorBarricades';
import { mergeCovers, rectInClip } from '../../src/render/arenas/boardCover';
import { NEW_ARENA_ART } from '../../src/render/arenas/newArenas';
import { clipEnvironment, renderClip } from '../../src/render/sectorClip';
import { resolveEnv } from '../../src/render/env/plan';

function field(id: string, noSector = false): GameState {
  const def = FIELD_MISSION_DEFS[id]!;
  return createGame(
    buildMissionGame({
      spec: { id: def.districtId, fieldId: id, ...(noSector ? { noSector: true } : {}) },
      humanCharacter: 'streetBaller',
      seed: 2,
    }),
  );
}

describe('sector barricades are drawn as objects', () => {
  it.each(FIELD_MISSION_IDS)('%s: every barricade tile is covered by its object, nothing else is', (id) => {
    const s = field(id);
    const b = buildSectorBarricades(s)!;
    expect(b).not.toBeNull();
    const blocked = new Set(s.sector!.blocked);
    for (const i of blocked) expect(b.cover.covers(i), `${id} tile ${i}`).toBe(true);
    for (let i = 0; i < s.tiles.length; i++) if (!blocked.has(i)) expect(b.cover.covers(i)).toBe(false);
    // one object per barricade and per gate (a gate that opens between legs is drawn closed until then)
    const sector = getSector(s.sector!.id);
    expect(b.cover.bounds.length).toBe(sector.barricades.length + (sector.gates?.length ?? 0));
    // tall objects (a bus, a gate, a kiosk) can hide the row behind them; every object has a bounding box above floor
    for (const box of b.cover.bounds) expect(box.maxY).toBeGreaterThan(0.5);
    b.cover.dispose();
  });

  it('a match without a sector builds none', () => {
    expect(buildSectorBarricades(field('oshodi.approach', true))).toBeNull();
  });

  it('a gate barricade hides when its gate opens', () => {
    // the depot's steel gate of the Orita Gate campaign area (decision WX6): a real gate of the mission data now
    const s = field('oshodi.approach');
    const def = getSector('oshodi.orita');
    expect(def.gates).toHaveLength(1);
    const [gx, gy] = def.gates![0]!.tiles[0]!;
    const b = buildSectorBarricades(s, def)!;
    // `barricades` counts every drawn object, the gate included
    expect(b.stats()).toEqual({ barricades: def.barricades.length + 1, gates: 1, open: 0 });
    b.sync(s);
    expect(b.gateObject('depotGate')!.visible).toBe(true);
    expect(b.cover.covers(gy * s.width + gx)).toBe(true);
    openSectorGates(s, 0, []);
    expect(s.tiles[gy * s.width + gx]).toBe(Tile.Empty);
    b.sync(s);
    expect(b.gateObject('depotGate')!.visible).toBe(false);
    expect(b.stats().open).toBe(1);
    b.cover.dispose();
  });

  it('merged covers: a tile is covered by any, its fade goes to the one that covers it', () => {
    const s = field('mushin.market');
    const arena = NEW_ARENA_ART()[s.arenaId]!.cover!({ width: s.width, height: s.height })!;
    const b = buildSectorBarricades(s)!;
    const merged = mergeCovers(arena, b.cover)!;
    const someBuilding = s.tiles.findIndex((t, i) => t === Tile.Hard && arena.covers(i));
    expect(merged.covers(someBuilding)).toBe(true);
    for (const i of s.sector!.blocked) expect(merged.covers(i)).toBe(true);
    expect(merged.bounds.length).toBe(arena.bounds.length + b.cover.bounds.length);
    expect(merged.maxReach).toBeGreaterThanOrEqual(Math.max(arena.maxReach, b.cover.maxReach));
    expect(mergeCovers(null, undefined)).toBeNull();
    expect(mergeCovers(arena)).toBe(arena);
    merged.dispose();
  });
});

describe('render cost: only what the sector can show is built', () => {
  it('the render clip is the sector clip grown most to the north, and absent without a sector', () => {
    const s = field('lekki.approach');
    const c = renderClip(s)!;
    const k = s.sector!.clip;
    expect(c.y0).toBeLessThan(k.y0);
    expect(k.y0 - c.y0).toBeGreaterThanOrEqual(c.y1 - k.y1);
    expect(renderClip(field('lekki.approach', true))).toBeNull();
    expect(rectInClip(undefined, 0, 0, 1, 1)).toBe(true);
    expect(rectInClip(c, c.x1 + 1, c.y0, 3, 3)).toBe(false);
    expect(rectInClip(c, c.x1, c.y0, 3, 3)).toBe(true);
  });

  it.each(['mushin.approach', 'lagosIsland.press', 'lekki.estate'])(
    '%s: the arena cover leaves out the objects outside the clip (and is unchanged without one)',
    (id) => {
      const s = field(id);
      const factory = NEW_ARENA_ART()[s.arenaId]!.cover!;
      const whole = factory({ width: s.width, height: s.height })!;
      const again = factory({ width: s.width, height: s.height })!;
      const clipped = factory({ width: s.width, height: s.height, clip: renderClip(s)! })!;
      expect(again.bounds.length).toBe(whole.bounds.length);
      expect(clipped.bounds.length).toBeLessThan(whole.bounds.length);
      expect(clipped.bounds.length).toBeGreaterThan(0);
      for (const c of [whole, again, clipped]) c.dispose();
    },
  );

  it('Oshodi cover takes the clip too', () => {
    const s = field('oshodi.railEdge');
    const factory = NEW_ARENA_ART()[s.arenaId]!.cover!;
    const whole = factory({ width: s.width, height: s.height })!;
    const clipped = factory({ width: s.width, height: s.height, clip: renderClip(s)! })!;
    expect(clipped.bounds.length).toBeLessThan(whole.bounds.length);
    whole.dispose();
    clipped.dispose();
  });

  it('the living environment keeps only traffic, crowds and lights near the sector', () => {
    for (const id of ['mushin.market', 'lekki.approach', 'oshodi.approach']) {
      const s = field(id);
      const src = NEW_ARENA_ART()[s.arenaId]!.env!;
      const env = resolveEnv(src, { cols: s.width, rows: s.height });
      const clipped = clipEnvironment(env, renderClip(s));
      const total = (e: typeof env): number =>
        (e.traffic?.length ?? 0) + (e.crowds?.length ?? 0) + (e.lights?.length ?? 0);
      expect(total(clipped), id).toBeLessThan(total(env));
      expect(clipEnvironment(env, null)).toBe(env);
    }
  });
});
