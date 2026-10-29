import { describe, expect, it } from 'vitest';
import {
  deviceFingerprint,
  detectCapabilities,
  estimateRung,
  loadLearned,
  probeGl,
  rungForGpu,
  saveLearned,
} from '../../src/render/perf';
import type { CapabilityEnv, DeviceHints } from '../../src/render/perf';
import { LEARNED_KEY, LEARNED_MAX_AGE_MS } from '../../src/render/perf/learned';
import { MAX_RUNG } from '../../src/render/quality';

/** A fake canvas whose contexts answer like a browser would. */
function fakeCanvas(opts: {
  webgl2?: boolean;
  webgl1?: boolean;
  renderer?: string | null;
  throwOn?: string;
  maxTex?: number;
}) {
  const gl = (renderer: string | null) => ({
    MAX_TEXTURE_SIZE: 1,
    getExtension: (name: string) => {
      if (name === 'WEBGL_debug_renderer_info')
        return renderer === null ? null : { UNMASKED_RENDERER_WEBGL: 7 };
      if (name === 'WEBGL_lose_context') return { loseContext: () => undefined };
      return null;
    },
    getParameter: (p: number) => (p === 7 ? renderer : (opts.maxTex ?? 8192)),
  });
  return () => ({
    getContext: (type: string) => {
      if (opts.throwOn === type) throw new Error('blocked');
      if (type === 'webgl2') return opts.webgl2 ? gl(opts.renderer ?? null) : null;
      if (type === 'webgl') return opts.webgl1 ? gl(opts.renderer ?? null) : null;
      return null;
    },
  });
}

const hints = (over: Partial<DeviceHints> = {}): DeviceHints => ({
  gl: { api: 'webgl2', renderer: null, maxTextureSize: 8192 },
  memoryGb: null,
  cores: null,
  screenCssPx: { long: 844, short: 390 },
  dpr: 2,
  mobile: true,
  ...over,
});

describe('probeGl fallbacks', () => {
  it('reads the renderer string from WebGL2', () => {
    const p = probeGl(fakeCanvas({ webgl2: true, renderer: 'Mali-G52 MC2' }));
    expect(p).toEqual({ api: 'webgl2', renderer: 'Mali-G52 MC2', maxTextureSize: 8192 });
  });
  it('falls back to WebGL1 when WebGL2 is missing or throws', () => {
    expect(probeGl(fakeCanvas({ webgl1: true, renderer: 'Adreno (TM) 610' })).api).toBe('webgl1');
    expect(probeGl(fakeCanvas({ webgl2: true, webgl1: true, throwOn: 'webgl2' })).api).toBe('webgl1');
  });
  it('reports no WebGL, a missing canvas factory and a throwing factory without throwing', () => {
    expect(probeGl(fakeCanvas({})).api).toBe('none');
    expect(probeGl(undefined).api).toBe('none');
    expect(
      probeGl(() => {
        throw new Error('no document');
      }).api,
    ).toBe('none');
  });
  it('treats a masked or blank renderer as unknown', () => {
    expect(probeGl(fakeCanvas({ webgl2: true, renderer: null })).renderer).toBeNull();
    expect(probeGl(fakeCanvas({ webgl2: true, renderer: '   ' })).renderer).toBeNull();
  });
});

describe('detectCapabilities fallbacks', () => {
  it('survives an empty environment', () => {
    const h = detectCapabilities({});
    expect(h).toMatchObject({ memoryGb: null, cores: null, screenCssPx: null, dpr: 1, mobile: false });
    expect(h.gl.api).toBe('none');
  });
  it('ignores junk values and a throwing matchMedia', () => {
    const env: CapabilityEnv = {
      navigator: { deviceMemory: Number.NaN, hardwareConcurrency: -3 },
      screen: { width: 0, height: 700 },
      devicePixelRatio: Number.NaN,
      matchMedia: () => {
        throw new Error('nope');
      },
    };
    const h = detectCapabilities(env);
    expect(h.memoryGb).toBeNull();
    expect(h.cores).toBeNull();
    expect(h.screenCssPx).toBeNull();
    expect(h.dpr).toBe(1);
  });
  it('detects phones by coarse pointer, user agent or small touch screens', () => {
    expect(detectCapabilities({ matchMedia: () => ({ matches: true }) }).mobile).toBe(true);
    expect(detectCapabilities({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 13)' } }).mobile).toBe(
      true,
    );
    expect(
      detectCapabilities({ navigator: { maxTouchPoints: 5 }, screen: { width: 390, height: 844 } }).mobile,
    ).toBe(true);
    expect(
      detectCapabilities({
        navigator: { userAgent: 'X11; Linux x86_64' },
        screen: { width: 1920, height: 1080 },
      }).mobile,
    ).toBe(false);
  });
  it('reads memory, cores and screen when present (long side first)', () => {
    const h = detectCapabilities({
      navigator: { deviceMemory: 4, hardwareConcurrency: 8 },
      screen: { width: 390, height: 844 },
      devicePixelRatio: 3,
    });
    expect(h).toMatchObject({ memoryGb: 4, cores: 8, dpr: 3, screenCssPx: { long: 844, short: 390 } });
  });
});

describe('GPU classes', () => {
  it.each([
    ['Mali-T720', 0],
    ['Mali-G31', 1],
    ['Mali-G52 MC2', 2],
    ['Mali-G76', 4],
    ['Adreno (TM) 506', 1],
    ['Adreno (TM) 610', 2],
    ['Adreno (TM) 640', 3],
    ['Adreno (TM) 730', 6],
    ['PowerVR Rogue GE8320', 1],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', 0],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 0],
  ])('%s starts on rung %i', (renderer, rung) => {
    expect(rungForGpu(renderer, true)?.rung).toBe(rung);
  });
  it('rates Apple, NVIDIA and Intel by class, and says nothing about unknown strings', () => {
    expect(rungForGpu('Apple GPU', true)!.rung).toBeGreaterThanOrEqual(5);
    expect(rungForGpu('Apple GPU', false)!.rung).toBeGreaterThan(rungForGpu('Apple GPU', true)!.rung);
    expect(rungForGpu('ANGLE (NVIDIA GeForce RTX 3060)', false)!.rung).toBeGreaterThanOrEqual(6);
    expect(rungForGpu('Intel(R) UHD Graphics 620', false)!.rung).toBeLessThan(6);
    expect(rungForGpu('SomeFutureGPU 9000', true)).toBeNull();
    expect(rungForGpu(null, true)).toBeNull();
  });
});

describe('estimateRung', () => {
  it('always returns a valid rung, whatever the hints say', () => {
    const cases: DeviceHints[] = [
      hints(),
      hints({ mobile: false }),
      hints({ gl: { api: 'none', renderer: null, maxTextureSize: null } }),
      hints({ gl: { api: 'webgl1', renderer: 'Mali-400', maxTextureSize: 2048 }, memoryGb: 1, cores: 2 }),
      hints({
        gl: { api: 'webgl2', renderer: 'NVIDIA GeForce RTX 4090', maxTextureSize: 32768 },
        mobile: false,
        memoryGb: 8,
        cores: 32,
      }),
    ];
    for (const c of cases) {
      const e = estimateRung(c);
      expect(Number.isInteger(e.rung)).toBe(true);
      expect(e.rung).toBeGreaterThanOrEqual(0);
      expect(e.rung).toBeLessThanOrEqual(MAX_RUNG);
      expect(e.ceiling).toBeGreaterThanOrEqual(e.rung);
      expect(e.reasons.length).toBeGreaterThan(0);
    }
  });
  it('starts a safe middling profile when nothing is known (mobile lower than desktop)', () => {
    const phone = estimateRung(hints({ screenCssPx: null }));
    const desktop = estimateRung(hints({ mobile: false, screenCssPx: null }));
    expect(phone.rung).toBeLessThan(desktop.rung);
    expect(phone.rung).toBeLessThanOrEqual(3);
    expect(phone.reasons.join(' ')).toContain('unknown');
  });
  it('caps by memory and cores and limits how high Auto may climb on tiny devices', () => {
    const strong = { api: 'webgl2' as const, renderer: 'Mali-G78', maxTextureSize: 8192 };
    expect(estimateRung(hints({ gl: strong })).rung).toBe(4);
    expect(estimateRung(hints({ gl: strong, memoryGb: 2 })).rung).toBeLessThanOrEqual(1);
    expect(estimateRung(hints({ gl: strong, memoryGb: 2 })).ceiling).toBeLessThan(MAX_RUNG);
    expect(estimateRung(hints({ gl: strong, cores: 2 })).rung).toBeLessThanOrEqual(2);
  });
  it('puts software rendering and missing WebGL on the lowest rung', () => {
    const soft = estimateRung(
      hints({ gl: { api: 'webgl2', renderer: 'SwiftShader', maxTextureSize: 8192 } }),
    );
    expect(soft.rung).toBe(0);
    expect(soft.ceiling).toBeLessThanOrEqual(2);
    expect(estimateRung(hints({ gl: { api: 'none', renderer: null, maxTextureSize: null } }))).toMatchObject({
      rung: 0,
      ceiling: 0,
    });
  });
  it('takes a rung off very large screens and caps WebGL1', () => {
    const base = { api: 'webgl2' as const, renderer: 'NVIDIA GeForce GTX 1660', maxTextureSize: 16384 };
    const normal = estimateRung(
      hints({ gl: base, mobile: false, screenCssPx: { long: 1920, short: 1080 }, dpr: 1 }),
    );
    const huge = estimateRung(
      hints({ gl: base, mobile: false, screenCssPx: { long: 3840, short: 2160 }, dpr: 2 }),
    );
    expect(huge.rung).toBe(normal.rung - 1);
    expect(estimateRung(hints({ gl: { ...base, api: 'webgl1' }, mobile: false })).rung).toBeLessThanOrEqual(
      3,
    );
  });
});

describe('learned rung persistence', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      raw: m,
    };
  };
  const device = deviceFingerprint(hints());
  it('round-trips for the same device', () => {
    const s = memory();
    saveLearned(s, device, 3, 1000);
    expect(loadLearned(s, device, 2000)).toBe(3);
  });
  it('ignores another device, stale, future-dated, corrupt and out-of-range values', () => {
    const s = memory();
    saveLearned(s, device, 3, 1000);
    expect(loadLearned(s, 'other', 2000)).toBeNull();
    expect(loadLearned(s, device, 1000 + LEARNED_MAX_AGE_MS + 1)).toBeNull();
    expect(loadLearned(s, device, 1000 - 10 * 60_000)).toBeNull();
    s.raw.set(LEARNED_KEY, '{nope');
    expect(loadLearned(s, device, 2000)).toBeNull();
    s.raw.set(LEARNED_KEY, JSON.stringify({ rung: 99, device, savedAt: 1500 }));
    expect(loadLearned(s, device, 2000)).toBeNull();
    s.raw.set(LEARNED_KEY, JSON.stringify({ rung: 1.5, device, savedAt: 1500 }));
    expect(loadLearned(s, device, 2000)).toBeNull();
  });
  it('tolerates missing or throwing storage', () => {
    expect(loadLearned(undefined, device, 1)).toBeNull();
    const boom = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadLearned(boom, device, 1)).toBeNull();
    expect(() => saveLearned(boom, device, 2, 1)).not.toThrow();
    expect(() => saveLearned(undefined, device, 2, 1)).not.toThrow();
  });
});
