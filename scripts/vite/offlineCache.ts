import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Emits `sw.js` (src/platform/sw/sw.template.js) with the build's own hashed asset list, so the worker can keep exactly
 * this build's files and drop the rest. Build only: the dev server and tests never see a worker.
 */
export function offlineCache(): Plugin {
  return {
    name: 'wahala-offline-cache',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/'))
        .sort();
      const template = readFileSync(resolve(process.cwd(), 'src/platform/sw/sw.template.js'), 'utf8');
      const marker = '/*ASSETS*/ []';
      if (template.split(marker).length !== 2)
        throw new Error('sw.template.js must contain the asset marker exactly once');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace(marker, JSON.stringify(assets)),
      });
    },
  };
}
