/**
 * The feature-flag boundary of the static (GitHub Pages) build, proved at source level:
 *  - nothing reachable from src/main.tsx reaches the server adapter or any socket / WebRTC / microphone API
 *    (the single guarded dynamic import in src/online/index.ts is the only edge ignored);
 *  - the match, the simulation, the bots, rendering, audio and input never import the optional layers
 *    (online, voice, progression, ads, cosmetics, seasons), so the local game cannot depend on or be changed by them;
 *  - `createOnline` with default flags never touches a socket.
 * The built output is checked separately by `npm run check:static` (scripts/check-static-build.mjs).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOnline } from '../src/online';
import { resolveFlags } from '../src/platform';
import { reachable, resolveSpecifier, specifiersOf, stripComments } from './importGraph';

const FORBIDDEN =
  /\b(WebSocket|RTCPeerConnection|getUserMedia|XMLHttpRequest|EventSource|RTCDataChannel|MediaRecorder)\b|wss?:\/\//;
const OPTIONAL = /^src\/(online|voice|progression|ads|cosmetics|seasons)\//;
const OPTIONAL_APP = /^src\/(app\/online\.ts|ui\/online\/)/;

const guardedAdapterEdge = (from: string, spec: string): boolean =>
  from.replace(/\\/g, '/').endsWith('src/online/index.ts') && spec === './server/adapter';

describe('static build boundary (source level)', () => {
  const graph = reachable(['src/main.tsx'], { skipEdge: guardedAdapterEdge });

  it('the scan really covers the app (sanity)', () => {
    expect(graph.size).toBeGreaterThan(150);
    expect(graph.has('src/sim/index.ts')).toBe(true);
    expect(graph.has('src/online/mock/index.ts')).toBe(true); // the mock is reachable (lazy chunk): by design
    // the detector can see an optional layer when one is imported (so the "never reaches" checks are not vacuous)
    expect(reachable(['src/ui/menu/MainMenu.tsx']).has('src/app/online.ts')).toBe(true);
    expect(reachable(['src/app/online.ts']).has('src/progression/index.ts')).toBe(true);
  });

  it('never reaches the server adapter (src/online/server/**)', () => {
    expect([...graph].filter((f) => f.startsWith('src/online/server/'))).toEqual([]);
  });

  it('no reachable file names a socket, WebRTC or microphone API', () => {
    const offenders = [...graph].filter((f) => FORBIDDEN.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('the only code that names a socket lives in src/online/server/', () => {
    // the adapter does mention it (so the scan above is meaningful) ...
    expect(FORBIDDEN.test(stripComments(readFileSync('src/online/server/socket.ts', 'utf8')))).toBe(true);
    // ... and the one edge that could pull it in is the guarded dynamic import, behind the build-time constant
    const index = readFileSync('src/online/index.ts', 'utf8');
    expect(index).toMatch(/__WAHALA_SERVER_ONLINE__\s*&&\s*env\.serverUrl/);
    const imports = stripComments(index).match(/import\(\s*['"]\.\/server\/adapter['"]\s*\)/g);
    expect(imports).toHaveLength(1);
  });

  it('the server transport has no other static importer', () => {
    // nothing but tests and the guarded dynamic import refers to the adapter
    const all = reachable(['src/main.tsx', 'src/app/online.ts', 'src/ui/online/OnlineScreen.tsx'], {
      skipEdge: guardedAdapterEdge,
    });
    expect([...all].some((f) => f.includes('/server/'))).toBe(false);
  });
});

describe('the local game does not depend on the optional layers', () => {
  const entries = {
    'the simulation': ['src/sim/index.ts'],
    'the bots': ['src/ai/index.ts'],
    rendering: ['src/render/index.ts'],
    audio: ['src/audio/index.ts'],
    input: ['src/input/index.ts'],
    'the match controller': ['src/app/MatchController.ts'],
    'the composition root (session.ts: start, settings, results)': ['src/app/session.ts'],
    'the campaign': ['src/campaign/index.ts', 'src/app/campaign.ts'],
  };
  for (const [name, files] of Object.entries(entries)) {
    it(`${name} never reaches online / voice / progression / ads / cosmetics / seasons`, () => {
      const g = reachable(files);
      expect([...g].filter((f) => OPTIONAL.test(f) || OPTIONAL_APP.test(f))).toEqual([]);
    });
  }

  it('outside the optional layers themselves, only the menu shell (lazy Online screen, read-only Settings row) imports them', () => {
    const importers = [...reachable(['src/main.tsx'])].filter((f) => {
      if (OPTIONAL.test(f) || OPTIONAL_APP.test(f)) return false;
      return specifiersOf(readFileSync(f, 'utf8')).some((spec) => {
        const target = resolveSpecifier(f, spec);
        return (
          !!target &&
          (OPTIONAL.test(target.replace(/\\/g, '/')) || OPTIONAL_APP.test(target.replace(/\\/g, '/')))
        );
      });
    });
    expect(importers.sort()).toEqual(['src/ui/menu/MainMenu.tsx', 'src/ui/menu/SettingsScreen.tsx']);
  });

  it('the layers are one-directional: progression imports no online / voice; voice and ads import nothing optional', () => {
    for (const f of reachable(['src/progression/index.ts']))
      expect(f).not.toMatch(/^src\/(online|voice|ads)\//);
    for (const f of reachable(['src/voice/index.ts']))
      expect(f).not.toMatch(/^src\/(online|progression|ads|cosmetics|seasons)\//);
    for (const f of reachable(['src/ads/index.ts']))
      expect(f).not.toMatch(/^src\/(online|voice|progression|cosmetics|seasons)\//);
    for (const f of reachable(['src/online/index.ts'], { skipEdge: guardedAdapterEdge })) {
      expect(f).not.toMatch(/^src\/(render|ui|audio|input|app)\//);
    }
  });
});

describe('createOnline never opens a connection by default', () => {
  const throwing = () => {
    throw new Error('a connection was attempted');
  };

  async function withTrippedGlobals<T>(fn: () => Promise<T>): Promise<T> {
    const g = globalThis as Record<string, unknown>;
    const saved = ['WebSocket', 'RTCPeerConnection', 'fetch', 'XMLHttpRequest', 'EventSource'].map(
      (k) => [k, g[k]] as const,
    );
    for (const [k] of saved)
      Object.defineProperty(g, k, { value: throwing, configurable: true, writable: true });
    try {
      return await fn();
    } finally {
      for (const [k, v] of saved)
        Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
    }
  }

  it('default flags: no client at all', async () => {
    const flags = resolveFlags({}, '');
    expect(await withTrippedGlobals(() => createOnline(flags))).toBeNull();
  });

  it('?mockonline: the local mock, usable end to end without any network global', async () => {
    const flags = resolveFlags({}, '?mockonline');
    await withTrippedGlobals(async () => {
      const c = await createOnline(flags);
      expect(c?.kind).toBe('mock');
      expect(await c!.accounts.signInGuest()).toMatchObject({ ok: true });
      expect(await c!.social.friends()).toMatchObject({ ok: true });
    });
  });

  it('server mode without a build that includes the transport: null, never a silent mock', async () => {
    const flags = resolveFlags(
      { WAHALA_ONLINE_ENABLED: 'true', WAHALA_ONLINE_URL: 'https://api.example.invalid' },
      '',
    );
    expect(flags.onlineMode).toBe('server');
    expect(typeof __WAHALA_SERVER_ONLINE__).toBe('boolean');
    expect(__WAHALA_SERVER_ONLINE__).toBe(false); // tests are never built with the transport
    expect(
      await withTrippedGlobals(() => createOnline(flags, { serverUrl: 'https://api.example.invalid' })),
    ).toBeNull();
  });

  it('the URL can never request the server transport', async () => {
    const flags = resolveFlags({}, '?online=server&server=1&WAHALA_ONLINE_URL=https://evil.invalid');
    expect(flags.onlineMode).toBe('off');
    expect(await createOnline(flags, { serverUrl: 'https://evil.invalid' })).toBeNull();
  });
});
