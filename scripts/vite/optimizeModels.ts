import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { ExternalImage } from './glbOptimize.ts';
import { GLB_OPTIMIZER_VERSION, MIN_SHARED_BYTES, embeddedImages, optimizeGlb } from './glbOptimize.ts';

/**
 * Production builds ship each `?url` model through the verified meshopt optimiser (scripts/vite/glbOptimize.ts). The source
 * `.glb` files in `src/assets/models` are not changed; because the OPTIMISED bytes are what gets emitted, the asset's
 * content hash (its URL, and so its cache entry) always matches what is served. Results are cached on disk by content, so a
 * rebuild only re-encodes models that changed. `WAHALA_NO_GLB_OPT=1` ships the original files (A/B measurements).
 */
export function optimizeModels(): Plugin {
  const cacheDir = resolve(process.cwd(), 'node_modules/.cache/wahala-glb');
  const modelDir = resolve(process.cwd(), 'src/assets/models');
  /** md5 -> `vtex-<md5>.<ext>` for textures embedded by two or more models (the four vehicles share three). */
  let shared = new Map<string, string>();
  let sharedKey = '';
  const emitted = new Set<string>();
  return {
    name: 'wahala-optimize-models',
    apply: 'build',
    enforce: 'pre',
    async buildStart() {
      if (process.env.WAHALA_NO_GLB_OPT === '1') return;
      const files = [modelDir, resolve(modelDir, 'lazy')].flatMap((d) =>
        readdirSync(d)
          .filter((f) => f.endsWith('.glb'))
          .map((f) => resolve(d, f)),
      );
      const owners = new Map<string, { size: number; mimeType: string; files: Set<string> }>();
      for (const file of files)
        for (const img of await embeddedImages(readFileSync(file))) {
          const e = owners.get(img.hash) ?? { size: img.size, mimeType: img.mimeType, files: new Set() };
          e.files.add(file);
          owners.set(img.hash, e);
        }
      shared = new Map(
        [...owners]
          .filter(([, e]) => e.files.size > 1 && e.size >= MIN_SHARED_BYTES)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([hash, e]) => [
            hash,
            `vtex-${hash.slice(0, 8)}.${e.mimeType === 'image/png' ? 'png' : 'jpg'}`,
          ]),
      );
      sharedKey = [...shared.keys()].join(',');
      emitted.clear();
    },
    async load(id) {
      if (process.env.WAHALA_NO_GLB_OPT === '1') return null;
      const [file, query = ''] = id.split('?');
      if (!file!.endsWith('.glb') || !/(^|&)url(&|$)/.test(query)) return null;
      const source = readFileSync(file!);
      const key = createHash('sha1')
        .update(source)
        .update(`v${GLB_OPTIMIZER_VERSION}|${sharedKey}`)
        .digest('hex');
      const cached = resolve(cacheDir, `${key}.glb`);
      const cachedMeta = resolve(cacheDir, `${key}.json`);
      let bytes: Uint8Array;
      let externals: ExternalImage[];
      if (existsSync(cached) && existsSync(cachedMeta)) {
        bytes = readFileSync(cached);
        externals = (
          JSON.parse(readFileSync(cachedMeta, 'utf8')) as { name: string; mimeType: string; file: string }[]
        ).map((e) => ({
          name: e.name,
          mimeType: e.mimeType,
          bytes: readFileSync(resolve(cacheDir, e.file)),
        }));
      } else {
        const result = await optimizeGlb(source, shared);
        bytes = result.bytes;
        externals = result.externals;
        if (!result.report.used) this.warn(`${basename(file!)} kept as authored: ${result.report.reason}`);
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cached, bytes);
        const meta = externals.map((e) => ({ name: e.name, mimeType: e.mimeType, file: `ext-${e.name}` }));
        for (const e of externals) writeFileSync(resolve(cacheDir, `ext-${e.name}`), e.bytes);
        writeFileSync(cachedMeta, JSON.stringify(meta));
      }
      for (const e of externals)
        if (!emitted.has(e.name)) {
          emitted.add(e.name);
          // fixed, content-hashed name: the model refers to it by this relative uri (same folder), so Vite must not rename it
          this.emitFile({ type: 'asset', fileName: `assets/${e.name}`, source: e.bytes });
        }
      const ref = this.emitFile({ type: 'asset', name: basename(file!), source: bytes });
      return `export default "__VITE_ASSET__${ref}__";`;
    },
  };
}
