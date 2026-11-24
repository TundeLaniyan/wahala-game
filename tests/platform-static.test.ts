/**
 * The feature-flag boundary of the static (GitHub Pages) build, proved at source level:
 *  - nothing reachable from src/main.tsx reaches the server adapter or any socket / WebRTC / microphone API
 *    (the single guarded dynamic import in src/online/index.ts is the only edge ignored);
 *  - the match, the simulation, the bots, rendering, audio and input never import the optional layers
 *    (online, voice, progression, ads, cosmetics, seasons), so the local game cannot depend on or be changed by them;
 *  - `createOnline` with default flags never touches a socket.
 * The built output is checked separately by `npm run check:static` (scripts/check-static-build.mjs).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createOnline } from '../src/online';
import { resolveFlags } from '../src/platform';
import { reachable, resolveSpecifier, specifiersOf, stripComments } from './importGraph';
import { edgesOf, inZone, publicReach, ZONE_PACKAGES } from './online/importGuard';

/** Every .ts/.tsx file under the given repo directories (repo-relative, forward slashes). */
function walkSources(dirs: string[]): string[] {
  return dirs.flatMap((d) =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory()
        ? walkSources([p])
        : /\.tsx?$/.test(p)
          ? [p.split('\\').join('/')]
          : [];
    }),
  );
}

const FORBIDDEN =
  /\b(WebSocket|RTCPeerConnection|getUserMedia|XMLHttpRequest|EventSource|RTCDataChannel|MediaRecorder)\b|wss?:\/\//;
const OPTIONAL = /^src\/(online|voice|progression|ads|cosmetics|seasons)\//;
const OPTIONAL_APP = /^src\/(app\/online\.ts|ui\/online\/)/;

// The two guarded edges. Their guard is proved (not assumed) by the "online zone" block below.
const guardedAdapterEdge = (from: string, spec: string): boolean =>
  (from.replace(/\\/g, '/').endsWith('src/online/index.ts') && spec === './server/adapter') ||
  (from.replace(/\\/g, '/').endsWith('src/online/rumbleEntry.ts') && spec === '../app/rumbleOnline');
// The Home entry's helper (src/online/rumbleEntry.ts) is governed by its own rule below: only src/ui may import it.
const RUMBLE_ENTRY = 'src/online/rumbleEntry.ts';

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
        const target = resolveSpecifier(f, spec)?.replace(/\\/g, '/');
        return !!target && target !== RUMBLE_ENTRY && (OPTIONAL.test(target) || OPTIONAL_APP.test(target));
      });
    });
    // App.tsx (lazy online overlay) and HomeScreen.tsx (the guarded entry src/online/rumbleEntry.ts) are the Online City
    // Rumble edges (decision ON10); both sit behind `__WAHALA_SERVER_ONLINE__` / `flags().rumbleOnline`
    expect(importers.sort()).toEqual([
      'src/ui/App.tsx',
      'src/ui/menu/HomeScreen.tsx',
      'src/ui/menu/MainMenu.tsx',
      'src/ui/menu/SettingsScreen.tsx',
    ]);
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

// ---------------------------------------------------------------------------------------------------------------------
// The online zone (decision ON2, docs/ONLINE_INTEGRATION.md section 3): src/net/**, src/app/rumbleOnline.ts,
// src/ui/online/rumble/** and server/** exist only in the online chunk of a server build. The ONE edge from the public graph
// into it is the dynamic import in src/online/rumbleEntry.ts, lexically guarded by `__WAHALA_SERVER_ONLINE__`.
// ---------------------------------------------------------------------------------------------------------------------
describe('the online zone is unreachable from the public bundle except through a guarded dynamic import', () => {
  // main, plus the guarded entry (it is wired into the Home screen by the online UI package; walking it here keeps the
  // proof meaningful before and after that wiring)
  const roots = ['src/main.tsx', RUMBLE_ENTRY];
  const reach = publicReach(roots);

  it('the walk covers the app and the guarded entry (sanity)', () => {
    expect(reach.files.size).toBeGreaterThan(150);
    expect(reach.files.has('src/sim/index.ts')).toBe(true);
    expect(reach.files.has(RUMBLE_ENTRY)).toBe(true);
    expect(existsSync('src/app/rumbleOnline.ts')).toBe(true);
  });

  it('src/net/**, rumbleOnline, src/ui/online/rumble/** and server/** are not reachable (type-only imports are erased)', () => {
    const leaked = [...reach.files].filter(inZone).map((f) => `${f} <- ${reach.via.get(f) ?? 'root'}`);
    expect(leaked).toEqual([]);
  });

  it('no reachable file imports the Colyseus SDK', () => {
    expect(reach.packages).toEqual([]);
  });

  it('the entry has exactly one dynamic import of the controller and it is guarded by the build constant', () => {
    const edges = edgesOf(RUMBLE_ENTRY);
    const dynamic = edges.filter((e) => e.kind === 'dynamic');
    expect(dynamic.map((e) => e.target)).toEqual(['src/app/rumbleOnline.ts']);
    expect(dynamic[0]!.guarded).toBe(true);
    // every other edge from the entry into the zone is type-only
    for (const e of edges)
      if (e.target && inZone(e.target) && e.kind !== 'dynamic') expect(e.kind).toBe('type');
    expect(reach.guardedIntoZone).toContainEqual({ from: RUMBLE_ENTRY, to: 'src/app/rumbleOnline.ts' });
  });

  it('every other file: an edge into the zone is erased (type-only) or a guarded dynamic import', () => {
    const offenders: string[] = [];
    for (const f of walkSources(['src'])) {
      if (inZone(f)) continue;
      for (const e of edgesOf(f)) {
        if (!e.target || !inZone(e.target)) continue;
        if (e.kind === 'type') continue;
        if (e.kind === 'dynamic' && e.guarded) continue;
        offenders.push(`${f} -> ${e.target} (${e.kind}${e.kind === 'dynamic' ? ', unguarded' : ''})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('only src/ui imports the entry helper; only the entry loads the controller; only src/net/client/connection.ts names the SDK', () => {
    const importersOf = (target: string) =>
      [...walkSources(['src'])].filter((f) =>
        edgesOf(f).some((e) => e.target === target && e.kind !== 'type'),
      );
    for (const f of importersOf(RUMBLE_ENTRY))
      expect(f, `${f} imports the entry`).toMatch(/^src\/(ui|online)\//);
    const controllerLoaders = importersOf('src/app/rumbleOnline.ts').filter(
      (f) => !f.startsWith('src/ui/online/rumble/'),
    );
    expect(controllerLoaders).toEqual([RUMBLE_ENTRY]);
    const sdk = [...walkSources(['src'])].filter((f) =>
      specifiersOf(readFileSync(f, 'utf8')).some((spec) => ZONE_PACKAGES.test(spec)),
    );
    expect(sdk.filter((f) => f !== 'src/net/client/connection.ts')).toEqual([]);
  });

  it('the match, the simulation, bots, input, rendering and the campaign never reach src/net, src/online, the controller or its screens', () => {
    const ONLINE_ZONE_AND_ENTRY =
      /^(?:src\/net\/|src\/online\/|src\/app\/rumbleOnline\.ts$|src\/ui\/online\/rumble\/|server\/)/;
    const entries: Record<string, string[]> = {
      'MatchController.ts': ['src/app/MatchController.ts'],
      'session.ts': ['src/app/session.ts'],
      'src/sim': ['src/sim/index.ts'],
      'src/ai': ['src/ai/index.ts'],
      'src/input': ['src/input/index.ts'],
      'src/render': ['src/render/index.ts'],
      campaign: ['src/campaign/index.ts', 'src/app/campaign.ts'],
    };
    for (const [name, files] of Object.entries(entries)) {
      // ALL edges (type-only included): these modules must not even name the online layers
      expect(
        [...reachable(files)].filter((f) => ONLINE_ZONE_AND_ENTRY.test(f)),
        name,
      ).toEqual([]);
    }
    // the one allowed link to online matches is the types-only port: it names neither src/net nor src/online
    const port = stripComments(readFileSync('src/app/remoteMatch.ts', 'utf8'));
    expect(edgesOf('src/app/remoteMatch.ts').every((e) => !e.target || !inZone(e.target))).toBe(true);
    expect(port).not.toMatch(/from\s+['"][^'"]*\b(net|online)\b/);
  });

  it('the guard check is not vacuous: a planted unguarded dynamic import of the zone IS reported', () => {
    // same detector on a one-line file in memory: see tests/online/import-guard.test.ts for the full guard matrix
    expect(
      publicReach(['tests/online/fixtures/unguarded-entry.ts']).files.has('src/app/rumbleOnline.ts'),
    ).toBe(true);
    expect(publicReach(['tests/online/fixtures/guarded-entry.ts']).files.has('src/app/rumbleOnline.ts')).toBe(
      false,
    );
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
