/**
 * Device capability hints for the FIRST guess of Auto graphics. Hints are only a starting point: the
 * adaptive controller (adaptive.ts) measures real frame times and moves from here. Everything is optional
 * and wrapped so that a browser that hides or lacks a value (Safari has no `deviceMemory`; Firefox may mask
 * the GPU string; privacy modes blank them) falls back to a SAFE starting rung instead of failing.
 *
 * Pure: the browser objects arrive through `CapabilityEnv` so every fallback is unit-tested.
 */
import { MAX_RUNG } from '../quality';

export interface GlProbe {
  /** The context type that could be created, best first. */
  api: 'webgl2' | 'webgl1' | 'none';
  /** Unmasked renderer string ("Mali-G52", "Apple GPU", "ANGLE (...)"); null when the browser hides it. */
  renderer: string | null;
  maxTextureSize: number | null;
}

export interface DeviceHints {
  gl: GlProbe;
  /** navigator.deviceMemory in GB (rounded down to a power of two by browsers); null when absent. */
  memoryGb: number | null;
  /** navigator.hardwareConcurrency; null when absent. */
  cores: number | null;
  /** Screen size in CSS px (the larger side first) and the device pixel ratio. */
  screenCssPx: { long: number; short: number } | null;
  dpr: number;
  /** A phone or tablet (coarse pointer / touch), as far as the browser says. */
  mobile: boolean;
}

/** What the page offers; every member may be missing or throw. */
export interface CapabilityEnv {
  navigator?: {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    maxTouchPoints?: number;
    userAgent?: string;
  };
  screen?: { width?: number; height?: number };
  devicePixelRatio?: number;
  matchMedia?: (query: string) => { matches: boolean };
  /** Makes a throwaway canvas for the GL probe. */
  createCanvas?: () => {
    getContext(type: string): unknown;
  };
}

interface GlLike {
  getExtension(name: string): unknown;
  getParameter(name: number): unknown;
  MAX_TEXTURE_SIZE?: number;
}

const safely = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/** Creates a throwaway context and reads what the browser exposes; always returns (never throws). */
export function probeGl(createCanvas: CapabilityEnv['createCanvas']): GlProbe {
  const none: GlProbe = { api: 'none', renderer: null, maxTextureSize: null };
  if (!createCanvas) return none;
  const canvas = safely(createCanvas, null);
  if (!canvas) return none;
  let api: GlProbe['api'] = 'webgl2';
  let gl = safely(() => canvas.getContext('webgl2') as GlLike | null, null);
  if (!gl) {
    api = 'webgl1';
    gl = safely(() => canvas.getContext('webgl') as GlLike | null, null);
  }
  if (!gl) return none;
  const ctx = gl;
  const dbg = safely(
    () => ctx.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null,
    null,
  );
  const raw = dbg ? safely(() => ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL), null) : null;
  const renderer = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  const maxTextureSize = finite(safely(() => ctx.getParameter(ctx.MAX_TEXTURE_SIZE ?? 0x0d33), null));
  // release the probe context at once: browsers cap live contexts
  safely(
    () => (ctx.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext(),
    undefined,
  );
  return { api, renderer, maxTextureSize };
}

/** Reads every hint, falling back per field. */
export function detectCapabilities(env: CapabilityEnv): DeviceHints {
  const nav = env.navigator;
  const coarse = safely(() => env.matchMedia?.('(pointer: coarse)').matches === true, false);
  const touch = (finite(nav?.maxTouchPoints) ?? 0) > 0;
  const ua = nav?.userAgent ?? '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const w = finite(env.screen?.width);
  const h = finite(env.screen?.height);
  return {
    gl: probeGl(env.createCanvas),
    memoryGb: finite(nav?.deviceMemory),
    cores: finite(nav?.hardwareConcurrency),
    screenCssPx: w && h ? { long: Math.max(w, h), short: Math.min(w, h) } : null,
    dpr: finite(env.devicePixelRatio) ?? 1,
    mobile: coarse || mobileUa || (touch && !!w && Math.min(w, h ?? w) < 900),
  };
}

export interface Estimate {
  /** Where Auto starts on the ladder. */
  rung: number;
  /** The highest rung Auto may climb to on this device (a memory / software-renderer guard). */
  ceiling: number;
  /** Why: shown in debug output and docs, never to the player. */
  reasons: string[];
}

/** Rung the GPU string suggests, or null when it says nothing useful. */
export function rungForGpu(renderer: string | null, mobile: boolean): { rung: number; why: string } | null {
  if (!renderer) return null;
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(r))
    return { rung: 0, why: 'software renderer' };
  if (/apple (m\d|gpu)/.test(r)) return { rung: mobile ? 5 : 7, why: 'Apple GPU' };
  const adreno = /adreno[^\d]*(\d)(\d{2})/.exec(r);
  if (adreno) {
    const series = Number(adreno[1]);
    const table: Record<number, number> = { 2: 0, 3: 0, 4: 1, 5: 1, 6: 3, 7: 6, 8: 7 };
    // Adreno 6xx spans entry (610) to flagship (690): split on the model digits
    const model = Number(adreno[1] + adreno[2]);
    const rung =
      series === 6 ? (model < 620 ? 2 : model < 650 ? 3 : model < 670 ? 4 : 5) : (table[series] ?? 3);
    return { rung, why: `Adreno ${model}` };
  }
  const mali = /mali-(g|t)?-?(\d+)/.exec(r);
  if (mali) {
    const g = mali[1] === 'g';
    const n = Number(mali[2]);
    if (!g) return { rung: n >= 800 ? 1 : 0, why: `Mali-${mali[1] ?? ''}${n}` };
    return { rung: n < 52 ? 1 : n < 68 ? 2 : n < 76 ? 3 : n < 710 ? 4 : 5, why: `Mali-G${n}` };
  }
  if (/powervr|videocore|vivante/.test(r)) return { rung: 1, why: 'entry-level mobile GPU' };
  if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|arc\b|iris xe/.test(r))
    return { rung: 7, why: 'discrete / modern integrated GPU' };
  if (/intel/.test(r)) return { rung: 4, why: 'Intel integrated GPU' };
  if (/radeon|amd/.test(r)) return { rung: 5, why: 'AMD GPU' };
  return null;
}

/** The first guess: GPU class, capped by memory, cores, screen load and WebGL level. Always a valid rung. */
export function estimateRung(h: DeviceHints): Estimate {
  const reasons: string[] = [];
  let ceiling = MAX_RUNG;
  const gpu = rungForGpu(h.gl.renderer, h.mobile);
  let rung: number;
  if (gpu) {
    rung = gpu.rung;
    reasons.push(`gpu: ${gpu.why} -> ${rung}`);
  } else {
    // unknown GPU (hidden or unrecognised): a safe, middling start; measurement takes over
    rung = h.mobile ? 3 : 5;
    reasons.push(`gpu unknown -> ${rung} (${h.mobile ? 'mobile' : 'desktop'} default)`);
  }
  if (rung <= 0 && gpu?.why === 'software renderer') ceiling = 2;
  const cap = (limit: number, why: string, hardCeiling = false): void => {
    if (rung > limit) {
      rung = limit;
      reasons.push(`${why} -> capped at ${limit}`);
    }
    if (hardCeiling) ceiling = Math.min(ceiling, limit + 1);
  };
  if (h.memoryGb !== null) {
    if (h.memoryGb <= 1) cap(0, `${h.memoryGb} GB memory`, true);
    else if (h.memoryGb <= 2) cap(1, `${h.memoryGb} GB memory`, true);
    else if (h.memoryGb <= 3) cap(3, `${h.memoryGb} GB memory`);
    else if (h.memoryGb <= 4 && h.mobile) cap(4, `${h.memoryGb} GB memory`);
  }
  if (h.cores !== null) {
    if (h.cores <= 2) cap(2, `${h.cores} cores`);
    else if (h.cores <= 4 && h.mobile) cap(4, `${h.cores} cores`);
  }
  if (h.gl.api === 'webgl1') {
    cap(3, 'WebGL 1 only', true);
  }
  if (h.gl.api === 'none') {
    // the game cannot draw at all; the renderer reports that itself. Stay on the lowest rung.
    rung = 0;
    ceiling = 0;
    reasons.push('no WebGL -> 0');
  }
  if (h.gl.maxTextureSize !== null && h.gl.maxTextureSize < 4096)
    cap(2, `max texture ${h.gl.maxTextureSize}`);
  if (h.screenCssPx) {
    // very large canvases cost fill rate even at dpr 1; one rung down per ~2.5 MPx of physical screen
    const mpx = (h.screenCssPx.long * h.screenCssPx.short * h.dpr * h.dpr) / 1e6;
    if (mpx > 5 && rung > 0) {
      rung -= 1;
      reasons.push(`large screen (${mpx.toFixed(1)} MPx) -> ${rung}`);
    }
  }
  rung = Math.max(0, Math.min(rung, ceiling));
  return { rung, ceiling, reasons };
}

/** A short stable key for "this device and screen" (learned-rung storage). */
export function deviceFingerprint(h: DeviceHints): string {
  const s = h.screenCssPx ? `${h.screenCssPx.long}x${h.screenCssPx.short}` : '?';
  return [h.gl.api, h.gl.renderer ?? '?', h.memoryGb ?? '?', h.cores ?? '?', s, h.dpr].join('|');
}
