/**
 * Map identity (docs/MAP_IDENTITY.md): every City Rumble area has exactly three visual anchors, each anchor id is drawn by
 * the art module named for it, and the anchors built as set pieces are tagged on their meshes (`userData.anchor`), found
 * after building the arena surroundings headless (a stub canvas stands in for the DOM, as in rumble-stage-sets.test.ts).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, Mesh } from 'three';
import type { Object3D } from 'three';
import type { ArenaSet, SetContext } from '../../src/render/arenas/common';
import type { StreetLife, Vignette } from '../../src/render/life/StreetLife';
import type { AmbientFx } from '../../src/render/fx/Ambient';
import { QUALITY } from '../../src/render/quality';
import { artRng } from '../../src/render/textures';
import { ANCHOR_MODULES, MAP_ANCHORS } from '../../src/render/arenas/anchors';
import { RUMBLE_ARENA_IDS, getArena } from '../../src/sim';

const AREAS = [
  'rumbleOjuelegba',
  'rumbleOshodi',
  'rumbleMushin',
  'rumbleFadeyi',
  'rumbleLagosIsland',
  'rumbleLekki',
  'rumbleEbuteMetta',
];

/** Anchors drawn as off-board set pieces: they carry `userData.anchor` after the set is built. */
const SET_PIECES: Record<string, string[]> = {
  rumbleMushin: ['mushin-red-line-station', 'mushin-footbridge'],
  rumbleFadeyi: ['fadeyi-footbridge'],
  rumbleLagosIsland: ['lagos-cathedral'],
  rumbleLekki: ['lekki-link-bridge'],
};

function fakeContext(canvas: { width: number; height: number }): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string | symbol, unknown> = {
    canvas,
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => undefined),
    set: (t, p, v) => {
      t[p] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => {
      const c = { width: 1, height: 1, style: {} } as {
        width: number;
        height: number;
        getContext?: () => unknown;
      };
      c.getContext = () => fakeContext(c);
      return c;
    },
  });
});

function tagsOf(set: ArenaSet, W: number, H: number): Set<string> {
  const root = new Group();
  const statics = new Group();
  const noop = (): void => undefined;
  const ctx: SetContext = {
    W,
    H,
    root,
    statics,
    rng: artRng(404),
    quality: QUALITY.high,
    life: { add: (_v: Vignette) => true, group: new Group(), hasRoom: () => true } as unknown as StreetLife,
    ambient: { fire: noop, smokeColumn: noop, exhaust: noop, dust: noop } as unknown as AmbientFx,
    instance: noop,
    vehicles: noop,
    wreck: noop,
    own: noop,
  };
  set.build(ctx);
  const found = new Set<string>();
  const visit = (o: Object3D): void => {
    if (typeof o.userData.anchor === 'string') found.add(o.userData.anchor);
    o.children.forEach(visit);
  };
  visit(root);
  visit(statics);
  return found;
}

describe('map anchors registry', () => {
  it('has exactly the seven City Rumble areas, three anchors each', () => {
    expect(Object.keys(MAP_ANCHORS).sort()).toEqual([...AREAS].sort());
    for (const id of AREAS) {
      expect(RUMBLE_ARENA_IDS).toContain(id);
      expect(MAP_ANCHORS[id]).toHaveLength(3);
    }
  });

  it('has unique, well-formed ids and non-empty names and notes', () => {
    const ids = AREAS.flatMap((a) => MAP_ANCHORS[a]!.map((x) => x.id));
    expect(new Set(ids).size).toBe(21);
    for (const a of AREAS)
      for (const x of MAP_ANCHORS[a]!) {
        expect(x.id).toMatch(/^[a-z]+-[a-z0-9-]+$/);
        expect(x.name.length).toBeGreaterThan(3);
        expect(x.note.length).toBeGreaterThan(20);
      }
  });

  it('names no real brand, bank or operator', () => {
    const text = AREAS.flatMap((a) => MAP_ANCHORS[a]!.map((x) => `${x.name} ${x.note}`)).join(' ');
    for (const banned of [
      /\bfirst bank\b/i,
      /\bgtb\b/i,
      /\bmtn\b/i,
      /\bglo\b/i,
      /\bshell\b/i,
      /\bzenith\b/i,
      /\bunited bank\b/i,
    ])
      expect(text).not.toMatch(banned);
  });

  it('every anchor id is referenced by the art module that draws it', () => {
    for (const a of AREAS)
      for (const x of MAP_ANCHORS[a]!) {
        const file = ANCHOR_MODULES[x.id];
        expect(file, `${x.id}: no module registered`).toBeDefined();
        const src = readFileSync(resolve(__dirname, '../../src/render/arenas', file!), 'utf8');
        expect(src.includes(x.id), `${x.id} not referenced in ${file}`).toBe(true);
      }
    expect(Object.keys(ANCHOR_MODULES)).toHaveLength(21);
  });
});

describe('map anchors in the built scenes', () => {
  const sets: [string, string[]][] = Object.entries(SET_PIECES);
  it.each(sets)('%s: set-piece anchors are tagged on their meshes', async (id, expected) => {
    const { NEW_ARENA_ART } = await import('../../src/render/arenas/newArenas');
    const a = getArena(id);
    const found = tagsOf(NEW_ARENA_ART()[id]!.set, a.layout[0]!.length, a.layout.length);
    for (const anchor of expected)
      expect(found.has(anchor), `${id}: ${anchor} not found in the scene`).toBe(true);
    // every tag in the scene is a registered anchor of this area
    const own = new Set(MAP_ANCHORS[id]!.map((x) => x.id));
    for (const t of found) expect(own.has(t), `${id}: unregistered tag ${t}`).toBe(true);
  });

  it('tagged anchors are real Meshes (not empty groups that baking would drop)', async () => {
    const { NEW_ARENA_ART } = await import('../../src/render/arenas/newArenas');
    const a = getArena('rumbleLekki');
    const root = new Group();
    const statics = new Group();
    statics.add(new Mesh());
    const noop = (): void => undefined;
    NEW_ARENA_ART().rumbleLekki!.set.build({
      W: a.layout[0]!.length,
      H: a.layout.length,
      root,
      statics,
      rng: artRng(1),
      quality: QUALITY.high,
      life: { add: () => true, group: new Group(), hasRoom: () => true } as unknown as StreetLife,
      ambient: { fire: noop, smokeColumn: noop, exhaust: noop, dust: noop } as unknown as AmbientFx,
      instance: noop,
      vehicles: noop,
      wreck: noop,
      own: noop,
    });
    const tagged = statics.children.filter((c) => c.userData.anchor === 'lekki-link-bridge');
    expect(tagged.length).toBeGreaterThan(0);
    for (const t of tagged) expect(t).toBeInstanceOf(Mesh);
  });
});
