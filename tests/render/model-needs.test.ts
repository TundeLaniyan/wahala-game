/** On-demand model loading (src/render/assets/modelNeeds.ts, library.ts): the manifest's invariants and the loader's behaviour. */
import { describe, expect, it, vi } from 'vitest';
import { AssetLibrary } from '../../src/render/assets/library';
import {
  BOOT_MODELS,
  FULL_GROUP_PREFIXES,
  MODEL_ARENA_IDS,
  arenaModels,
} from '../../src/render/assets/modelNeeds';
import { RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS } from '../../src/sim/arenas';

const ALL = AssetLibrary.allIds();

describe('arena model manifest', () => {
  it('has an entry for every standard arena and every City Rumble stage (an unknown arena would load everything)', () => {
    for (const id of [...STANDARD_ARENA_IDS, ...RUMBLE_ARENA_IDS]) expect(MODEL_ARENA_IDS, id).toContain(id);
  });

  it('lists only models that are bundled, none twice, and never the boot (hero) models', () => {
    for (const arena of MODEL_ARENA_IDS) {
      const ids = arenaModels(arena)!;
      expect(new Set(ids).size, arena).toBe(ids.length);
      for (const id of ids) {
        expect(ALL, `${arena}: ${id}`).toContain(id);
        expect(BOOT_MODELS, `${arena}: ${id}`).not.toContain(id);
      }
    }
  });

  it('gives every match the generator and all four vehicles (they can appear at any time in play)', () => {
    for (const arena of MODEL_ARENA_IDS)
      expect(arenaModels(arena), arena).toEqual(
        expect.arrayContaining(['gen_generator', 'veh_danfo', 'veh_taxi', 'veh_keke', 'veh_okada']),
      );
  });

  it('loads a whole group when its consumers index into the loaded list (layouts must not change)', () => {
    for (const arena of MODEL_ARENA_IDS) {
      const ids = arenaModels(arena)!;
      for (const prefix of FULL_GROUP_PREFIXES) {
        const group = ALL.filter((id) => id.startsWith(prefix));
        if (ids.some((id) => id.startsWith(prefix)))
          expect(ids, `${arena} ${prefix}`).toEqual(expect.arrayContaining(group));
      }
    }
  });

  it('every boot model is bundled; an unknown arena has no entry (the caller loads everything)', () => {
    for (const id of BOOT_MODELS) expect(ALL).toContain(id);
    expect(arenaModels('noSuchArena')).toBeNull();
    expect(arenaModels(null)).toBeNull();
    expect(arenaModels(undefined)).toBeNull();
  });
});

/** A library whose glTF loader is replaced by a stub that records every URL it is asked for. */
function libraryWith(fail: ReadonlySet<string> = new Set()) {
  const lib = new AssetLibrary();
  const urls: string[] = [];
  const release: (() => void)[] = [];
  (lib as unknown as { loader: unknown }).loader = {
    loadAsync: (url: string) =>
      new Promise((resolve, reject) => {
        urls.push(url);
        release.push(() =>
          [...fail].some((f) => url.includes(f))
            ? reject(new Error('404'))
            : resolve({ scene: { traverse: () => undefined }, animations: [] }),
        );
      }),
  };
  const settle = async (): Promise<void> => {
    while (release.length) release.shift()!();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { lib, urls, settle };
}

describe('AssetLibrary.load', () => {
  it('fetches each model once even when two callers ask at the same time (a prefetch and the start)', async () => {
    const { lib, urls, settle } = libraryWith();
    const a = lib.load(['env_kiosk', 'env_lamp']);
    const b = lib.load(['env_lamp', 'env_poles']);
    expect(a).not.toBeNull();
    await settle();
    await Promise.all([a, b]);
    expect(urls).toHaveLength(3);
    expect(lib.has('env_kiosk') && lib.has('env_lamp') && lib.has('env_poles')).toBe(true);
  });

  it('returns null (nothing to wait for) once everything asked for is loaded', async () => {
    const { lib, settle } = libraryWith();
    const job = lib.load(['env_kiosk']);
    await settle();
    await job;
    expect(lib.load(['env_kiosk'])).toBeNull();
    expect(lib.load([])).toBeNull();
  });

  it('reports real progress and counts only what it waited on', async () => {
    const { lib, settle } = libraryWith();
    const loaded = lib.load(['env_kiosk']);
    await settle();
    await loaded;
    const progress: [number, number][] = [];
    const job = lib.load(['env_kiosk', 'env_lamp', 'env_poles'], (d, t) => progress.push([d, t]));
    await settle();
    await job;
    expect(progress[0]).toEqual([0, 2]);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('a model that fails to download resolves the load, is never retried, and is simply not there', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { lib, urls, settle } = libraryWith(new Set(['env_lamp']));
    const job = lib.load(['env_kiosk', 'env_lamp']);
    await settle();
    await job; // never rejects
    expect(lib.has('env_kiosk')).toBe(true);
    expect(lib.has('env_lamp')).toBe(false);
    expect(lib.load(['env_lamp'])).toBeNull();
    expect(urls.filter((u) => u.includes('env_lamp'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('only character models announce themselves to the views (they re-dress their seats)', async () => {
    const { lib, settle } = libraryWith();
    const seen = vi.fn();
    lib.onLazyLoaded = seen;
    const job = lib.load(['env_kiosk', 'char_agbero']);
    await settle();
    await job;
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('with the safety net on, asking for a bundled model that is not loaded starts loading it (never throws)', async () => {
    const { lib, urls, settle } = libraryWith();
    lib.onDemand = true;
    expect(lib.has('env_kiosk')).toBe(false); // the caller falls back this once
    await settle();
    expect(urls).toHaveLength(1);
    expect(lib.has('env_kiosk')).toBe(true);
  });

  it('the recorder lists a miss only for what is bundled and not loaded', async () => {
    const { lib } = libraryWith();
    lib.recorder = { touched: new Set(), missed: new Set() };
    lib.has('env_kiosk');
    lib.has('not_a_model');
    expect([...lib.recorder.missed]).toEqual(['env_kiosk']);
    expect([...lib.recorder.touched].sort()).toEqual(['env_kiosk', 'not_a_model']);
  });
});
