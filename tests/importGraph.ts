/**
 * A small static import-graph scanner for architecture tests: follows relative `import` / `export ... from` /
 * dynamic `import()` specifiers of TypeScript sources (comments stripped first), resolving to files under the repo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

export const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"`])\/\/.*$/gm, '$1');

const SPEC =
  /(?:\bimport\s+(?:type\s+)?(?:[\w*{}\s,]+?\s+from\s+)?|\bexport\s+(?:type\s+)?(?:[\w*{}\s,]+?\s+)?from\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;

export function specifiersOf(code: string): string[] {
  return [...stripComments(code).matchAll(SPEC)].map((m) => m[1]!);
}

const EXT = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/** Resolves a relative specifier to a source file, or null (packages, assets, css). */
export function resolveSpecifier(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(from), spec));
  for (const e of ['', ...EXT]) {
    const p = base + e;
    if (/\.(ts|tsx)$/.test(p) && existsSync(p)) return p;
  }
  return null;
}

export interface GraphOptions {
  /** Return true to ignore an edge (importer, specifier). */
  skipEdge?: (from: string, spec: string) => boolean;
}

/** Every source file reachable from `entries` (inclusive), as repo-relative paths with forward slashes. */
export function reachable(entries: readonly string[], opts: GraphOptions = {}): Set<string> {
  const seen = new Set<string>();
  const stack = entries.map((e) => normalize(e));
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
      if (opts.skipEdge?.(file, spec)) continue;
      const next = resolveSpecifier(file, spec);
      if (next) stack.push(next);
    }
  }
  return new Set([...seen].map((f) => relative('.', f).split('\\').join('/')));
}
