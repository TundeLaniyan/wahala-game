/**
 * Public-bundle assertions (docs/ONLINE_INTEGRATION.md section 2, decisions ON1 / ON11): the two switches are proved on REAL
 * production builds, not only on source.
 *
 *  1. The DEFAULT build (what GitHub Pages publishes) contains no online chunk, no `@colyseus` / room-code / session marker,
 *     no socket API, no ws:// or wss:// literal, no loopback / private-network / tunnel address, and its boot files
 *     (index.html, the entry chunk, every chunk, the service worker) name no absolute URL except the vendored libraries'
 *     namespace and documentation strings listed in `ALLOWED_ABSOLUTE_HOSTS` (scripts/lib/staticBuildScan.mjs).
 *  2. A SERVER build (`WAHALA_ONLINE_ENABLED=true WAHALA_ONLINE_URL=ws://{host}:2567`) keeps every online module in
 *     separate dynamic chunks: the entry chunk and everything it imports statically carry no online marker and no socket API,
 *     so an ordinary visitor of that build still downloads none of it. The endpoint is the template `{host}`, never a host.
 *
 * "Which module is in which chunk" comes from the build's own source maps and manifest (`--sourcemap --manifest`), the string
 * scans are a second, independent layer. Both builds go to a temp directory (models left unoptimised: only the JavaScript
 * matters here). The same scans run on `dist` in CI through `npm run check:static`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ALLOWED_ABSOLUTE_HOSTS,
  API_RULES,
  ONLINE_CHUNK_MARKERS,
  ONLINE_ENTRY_MARKERS,
  SERVER_TEMPLATE,
  absoluteUrls,
  filesUnder,
  scanBuild,
} from '../../scripts/lib/staticBuildScan.mjs';

const VITE = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const CAN_BUILD = existsSync(VITE) && existsSync(join(process.cwd(), 'index.html'));
const CONFIG = join(process.cwd(), 'tests', 'online', 'vite.bundle.config.ts');
const BUILD_TIMEOUT = 300_000;

/** Source files that exist only in the online chunk of a server build (paths relative to the repo root). */
const ONLINE_SOURCES = [
  /^src\/net\//,
  /^src\/app\/rumbleOnline\.ts$/,
  /^src\/ui\/online\/rumble\//,
  /^src\/online\/server\//,
  /(?:^|\/)node_modules\/@colyseus\//,
  /^server\//,
];
/** Dynamic-chunk entry modules of the online layer, as the manifest names them (`src` field). */
const ONLINE_ENTRIES = [
  /^src\/app\/rumbleOnline\.ts$/,
  /^src\/ui\/online\/rumble\//,
  /^src\/online\/server\/adapter\.ts$/,
];

interface ManifestEntry {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
}
type Manifest = Record<string, ManifestEntry>;

interface Built {
  dir: string;
  manifest: Manifest;
  /** Chunk file (relative, e.g. assets/index-x.js) -> the repo-relative source files bundled into it. */
  sources: Map<string, string[]>;
}

/** Runs `vite build` for the app into a temp directory with the given WAHALA_* environment. Throws on a failed build. */
function build(label: string, extraEnv: Record<string, string>): Built {
  const dir = mkdtempSync(join(tmpdir(), `wahala-bundle-${label}-`));
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(WAHALA_|VITE_|NODE_ENV$|VITEST|MODE$|BASE_URL$)/.test(k)) continue;
    env[k] = v;
  }
  Object.assign(env, { WAHALA_NO_GLB_OPT: '1', ...extraEnv });
  const run = spawnSync(
    process.execPath,
    [
      VITE,
      'build',
      '--config',
      CONFIG,
      '--outDir',
      dir,
      '--emptyOutDir',
      '--sourcemap',
      '--manifest',
      '--logLevel',
      'error',
    ],
    { cwd: process.cwd(), env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`vite build (${label}) failed:\n${run.stdout}\n${run.stderr}`);
  }
  // models, fonts and images are not read by any assertion: free the disk right away
  for (const f of filesUnder(dir, /\.(?:glb|mp3|webp|jpg|jpeg|png|woff2?|ogg|wav)$/i))
    rmSync(f, { force: true });
  const manifest = JSON.parse(readFileSync(join(dir, '.vite', 'manifest.json'), 'utf8')) as Manifest;
  const sources = new Map<string, string[]>();
  for (const file of filesUnder(dir, /\.js$/)) {
    const rel = file
      .slice(dir.length + 1)
      .split('\\')
      .join('/');
    // sw.js and the tiny runtime chunk carry no map: no sources to attribute
    const mapFile = `${file}.map`;
    const map = existsSync(mapFile)
      ? (JSON.parse(readFileSync(mapFile, 'utf8')) as { sources: string[] })
      : { sources: [] };
    sources.set(
      rel,
      map.sources.map((s) =>
        relative(process.cwd(), resolve(dirname(file), s))
          .split('\\')
          .join('/'),
      ),
    );
  }
  return { dir, manifest, sources };
}

const read = (b: Built, rel: string): string => readFileSync(join(b.dir, rel), 'utf8');

/** The entry chunk and every chunk the entry imports STATICALLY: what an ordinary visitor downloads at start-up. */
function bootChunks(b: Built): string[] {
  const entryKey = Object.keys(b.manifest).find((k) => b.manifest[k]!.isEntry)!;
  const seen = new Set<string>();
  const walk = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const next of b.manifest[key]!.imports ?? []) walk(next);
  };
  walk(entryKey);
  return [...seen].map((k) => b.manifest[k]!.file).filter((f) => f.endsWith('.js'));
}

/** Chunks that are dynamic entries of the online layer. */
const onlineChunks = (b: Built): ManifestEntry[] =>
  Object.values(b.manifest).filter(
    (e) => e.isDynamicEntry && ONLINE_ENTRIES.some((re) => re.test(e.src ?? '')),
  );

const onlineSourcesIn = (b: Built, chunk: string): string[] =>
  (b.sources.get(chunk) ?? []).filter((s) => ONLINE_SOURCES.some((re) => re.test(s)));

const hostOf = (u: { host: string }): string => u.host.toLowerCase();

/** True when a source file under src/ui or src/app imports the guarded entry (agent U wires the Home button to it). */
function rumbleEntryIsWired(): boolean {
  return filesUnder(join(process.cwd(), 'src'), /\.tsx?$/).some(
    (f) =>
      !f.replace(/\\/g, '/').endsWith('src/online/rumbleEntry.ts') &&
      /from\s+['"][^'"]*online\/rumbleEntry['"]|import\(\s*['"][^'"]*online\/rumbleEntry['"]\s*\)/.test(
        readFileSync(f, 'utf8'),
      ),
  );
}

const cleanup: string[] = [];
afterAll(() => {
  for (const d of cleanup) rmSync(d, { recursive: true, force: true });
});

describe.skipIf(!CAN_BUILD)('public production build (default environment)', () => {
  let b: Built;
  beforeAll(() => {
    b = build('public', {});
    cleanup.push(b.dir);
  }, BUILD_TIMEOUT);

  it('the build really is the default one (sanity: the scan below sees the app)', () => {
    const entry = Object.values(b.manifest).find((e) => e.isEntry)!;
    expect(entry.file).toMatch(/^assets\/index-.*\.js$/);
    expect(read(b, entry.file).length).toBeGreaterThan(100_000);
    // the old, mock-only preview still ships as its own lazy chunk: the scan is not trivially empty of online code
    expect(
      Object.values(b.manifest).some((e) => /^src\/ui\/online\/OnlineScreen\.tsx$/.test(e.src ?? '')),
    ).toBe(true);
  });

  it('no module of the online layer is in any chunk (source maps) and no online chunk is emitted (manifest)', () => {
    const offenders = [...b.sources.keys()].flatMap((chunk) =>
      onlineSourcesIn(b, chunk).map((s) => `${chunk}: ${s}`),
    );
    expect(offenders).toEqual([]);
    expect(onlineChunks(b).map((e) => e.file)).toEqual([]);
    expect(
      Object.values(b.manifest).filter((e) => /rumbleOnline|\/net\/|colyseus/i.test(e.src ?? '')),
    ).toEqual([]);
  });

  it('no file names a socket / WebRTC / microphone API, an online marker, a ws:// literal or a private / tunnel address', () => {
    const problems = scanBuild(b.dir, {
      api: true,
      markers: [ONLINE_CHUNK_MARKERS, ONLINE_ENTRY_MARKERS],
      addresses: true,
    });
    expect(problems).toEqual([]);
  });

  it('the scan is not vacuous: each rule table fires on a planted string', () => {
    for (const [name, re] of [...API_RULES, ...ONLINE_CHUNK_MARKERS, ...ONLINE_ENTRY_MARKERS]) {
      expect(re.test('x'), name).toBe(false);
    }
    const hit = (s: string): boolean => [...API_RULES, ...ONLINE_CHUNK_MARKERS].some(([, re]) => re.test(s));
    expect(hit('new WebSocket(u)')).toBe(true);
    expect(hit('import "@colyseus/sdk"')).toBe(true);
    expect(hit('new EventSource(u)')).toBe(true);
    expect(hit('createRumbleSession()')).toBe(true);
    expect(hit('ABCDEFGHJKMNPQRSTUVWXYZ23456789')).toBe(true);
  });

  it('boot makes no request but same-origin assets: index.html, every chunk and the service worker name only allow-listed absolute URLs', () => {
    const html = read(b, 'index.html');
    expect(absoluteUrls(html)).toEqual([]);
    // every script / stylesheet / preload reference is relative to the app base (same origin), never a scheme or `//host` (`./x` or `/wahala-game/x`)
    const refs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ref, ref).toMatch(/^(?:\.\/|\/wahala-game\/)/);
    const rows: string[] = [];
    for (const file of [...filesUnder(b.dir, /\.(?:js|html|css|webmanifest)$/)]) {
      const rel = file
        .slice(b.dir.length + 1)
        .split('\\')
        .join('/');
      for (const u of absoluteUrls(readFileSync(file, 'utf8'))) {
        if (!(hostOf(u) in ALLOWED_ABSOLUTE_HOSTS)) rows.push(`${rel}: ${u.url}`);
      }
    }
    expect(rows).toEqual([]);
    expect(existsSync(join(b.dir, 'sw.js'))).toBe(true);
    expect(absoluteUrls(read(b, 'sw.js'))).toEqual([]);
  });

  it('the endpoint template and any host never reach the public build', () => {
    for (const file of filesUnder(b.dir, /\.(?:js|html|css|json|webmanifest)$/)) {
      const src = readFileSync(file, 'utf8');
      expect(src.includes('{host}:'), file).toBe(false);
      expect(/WAHALA_ONLINE_URL\s*:\s*["'`][^"'`]/.test(src), file).toBe(false);
    }
  });
});

describe.skipIf(!CAN_BUILD)(
  'server-enabled build (WAHALA_ONLINE_ENABLED=true, WAHALA_ONLINE_URL=ws://{host}:2567)',
  () => {
    let b: Built;
    beforeAll(() => {
      b = build('server', { WAHALA_ONLINE_ENABLED: 'true', WAHALA_ONLINE_URL: SERVER_TEMPLATE });
      cleanup.push(b.dir);
    }, BUILD_TIMEOUT);

    it('emits online code as separate dynamic chunks (never entry chunks), imported by nothing at start-up', () => {
      const online = onlineChunks(b);
      expect(online.length).toBeGreaterThan(0);
      // the guarded entry makes the lazy chunk of the real controller exist as soon as the Home button imports the entry
      if (rumbleEntryIsWired()) {
        expect(online.some((e) => e.src === 'src/app/rumbleOnline.ts')).toBe(true);
      }
      const boot = new Set(bootChunks(b));
      for (const e of online) {
        expect(e.isEntry).toBeFalsy();
        expect(boot.has(e.file), `${e.file} is loaded at start-up`).toBe(false);
      }
      const html = read(b, 'index.html');
      for (const e of online) expect(html.includes(e.file), e.file).toBe(false);
    });

    it('the entry chunk and everything it imports statically contain no online module, marker or socket API', () => {
      const boot = bootChunks(b);
      expect(boot.length).toBeGreaterThan(1);
      for (const chunk of boot) {
        expect(onlineSourcesIn(b, chunk), `${chunk} bundles online modules`).toEqual([]);
        const src = read(b, chunk);
        for (const [name, re] of [...ONLINE_CHUNK_MARKERS, ...API_RULES]) {
          expect(re.test(src), `${chunk} contains ${name}`).toBe(false);
        }
      }
    });

    it('the online markers exist only inside the online chunks', () => {
      const online = new Set(onlineChunks(b).map((e) => e.file));
      const inOnline = new Set<string>();
      for (const file of filesUnder(b.dir, /\.js$/)) {
        const rel = file
          .slice(b.dir.length + 1)
          .split('\\')
          .join('/');
        const src = readFileSync(file, 'utf8');
        const marked = ONLINE_CHUNK_MARKERS.some(([, re]) => re.test(src)) || /new\s+WebSocket\b/.test(src);
        if (marked) inOnline.add(rel);
      }
      // a marker found in a chunk that is not an online dynamic entry is a leak into shared code
      const leaked = [...inOnline].filter((f) => !online.has(f));
      expect(leaked).toEqual([]);
    });

    it('the endpoint is the {host} template: present, filled in at run time, never a concrete host', () => {
      const joined = filesUnder(b.dir, /\.js$/)
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
      expect(joined.includes(SERVER_TEMPLATE)).toBe(true);
      expect(joined.includes('{host}')).toBe(true);
      // with the one allowed template blanked out, no address rule fires anywhere in the build
      const problems = scanBuild(b.dir, {
        api: false,
        markers: [],
        addresses: true,
        transform: (src) => src.split(SERVER_TEMPLATE).join(''),
      });
      expect(problems).toEqual([]);
      // every absolute URL in any chunk is an allow-listed library string or the template itself
      const rows: string[] = [];
      for (const file of filesUnder(b.dir, /\.(?:js|html|css|webmanifest)$/)) {
        const rel = file
          .slice(b.dir.length + 1)
          .split('\\')
          .join('/');
        for (const u of absoluteUrls(readFileSync(file, 'utf8'))) {
          if (!(hostOf(u) in ALLOWED_ABSOLUTE_HOSTS) && !u.url.startsWith(SERVER_TEMPLATE.slice(0, -5)))
            rows.push(`${rel}: ${u.url}`);
        }
      }
      expect(rows).toEqual([]);
      expect(absoluteUrls(read(b, 'index.html'))).toEqual([]);
    });
  },
);
