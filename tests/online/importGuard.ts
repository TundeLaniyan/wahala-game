/**
 * Source-level proof helpers for decision ON2 (docs/ONLINE_INTEGRATION.md section 3): which import edges exist in a file,
 * which of them are erased at build time (`import type`), and which dynamic `import()` calls are lexically guarded by the
 * build constant `__WAHALA_SERVER_ONLINE__` (so the bundler removes them in a public build).
 *
 * The guard analysis is deliberately lexical and strict. A dynamic import counts as guarded only when one of these holds:
 *  - early return:  `if (!__WAHALA_SERVER_ONLINE__) return ...;` (or `throw`, braced or not) earlier in the SAME function body;
 *  - block:         inside `if (__WAHALA_SERVER_ONLINE__ && ...) { ... }` (no `||`, no negation);
 *  - expression:    `__WAHALA_SERVER_ONLINE__ ? import(...) : ...`  or  `__WAHALA_SERVER_ONLINE__ && ... import(...)` in the same statement.
 * Anything else (a guard in another function, a guard after the import, `||`, a runtime flag such as `flags().rumbleOnline`)
 * is "unguarded": a runtime flag cannot keep code out of a public bundle.
 */
import { existsSync, readFileSync } from 'node:fs';
import { normalize, relative } from 'node:path';
import { resolveSpecifier, stripComments } from '../importGraph';

const CONST = '__WAHALA_SERVER_ONLINE__';

export type EdgeKind = 'static' | 'type' | 'dynamic';

export interface Edge {
  /** The specifier as written. */
  spec: string;
  /** Repo-relative resolved file, or null for packages and assets. */
  target: string | null;
  kind: EdgeKind;
  /** Dynamic edges only: lexically guarded by the build constant. */
  guarded: boolean;
}

const STATIC =
  /\b(?:import\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?|export\s+(type\s+)?(?:[\w*{}\s,$]+?\s+)?from\s+)['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** `code` with the CONTENT of string and template literals replaced by spaces (same length), so braces inside them do not count. */
function blankStrings(code: string): string {
  return code.replace(
    /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g,
    (m) => m[0] + ' '.repeat(m.length - 2) + m[0],
  );
}

/** Index just past the `}` that closes the `{` at `open`, in blanked code; -1 when unbalanced. */
function closeBrace(blank: string, open: number): number {
  let depth = 0;
  for (let i = open; i < blank.length; i++) {
    if (blank[i] === '{') depth++;
    else if (blank[i] === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

/** True when the dynamic `import()` at index `at` of `code` (comments already stripped) is guarded by the build constant. */
export function isGuardedAt(code: string, at: number): boolean {
  const blank = blankStrings(code);
  const before = blank.slice(0, at);

  // expression guard: `CONST ? import(..)` / `CONST && ... import(..)` in the same statement
  const stmt = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}'));
  const pre = before.slice(stmt + 1);
  if (new RegExp(`(?<![!\\w])${CONST}\\s*(?:&&|\\?)`).test(pre) && !pre.includes('||')) return true;

  // block guard: inside `if (CONST && ...) { ... }`
  for (const m of before.matchAll(/\bif\s*\(/g)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    for (; i < blank.length; i++) {
      if (blank[i] === '(') depth++;
      else if (blank[i] === ')' && --depth === 0) break;
    }
    const cond = blank.slice(m.index! + m[0].length, i);
    if (
      !new RegExp(`(?<![!\\w])${CONST}\\b`).test(cond) ||
      cond.includes('||') ||
      new RegExp(`!\\s*${CONST}`).test(cond)
    )
      continue;
    const open = blank.indexOf('{', i);
    if (open < 0 || blank.slice(i + 1, open).trim() !== '') continue;
    const end = closeBrace(blank, open);
    if (end > at && open < at) return true;
  }

  // early return: `if (!CONST) return ...;` earlier in the same function body
  const early = new RegExp(`\\bif\\s*\\(\\s*!\\s*${CONST}\\s*\\)\\s*(\\{\\s*)?(?:return|throw)\\b`, 'g');
  for (const m of before.matchAll(early)) {
    let from: number;
    if (m[1]) {
      const open = m.index! + m[0].indexOf('{');
      from = closeBrace(blank, open);
      if (from < 0) continue;
    } else {
      from = blank.indexOf(';', m.index! + m[0].length);
      if (from < 0) continue;
    }
    if (from > at) continue;
    // the block that holds the `if` must still be open at the import
    let depth = 0;
    let open = true;
    for (let i = from; i < at; i++) {
      if (blank[i] === '{') depth++;
      else if (blank[i] === '}' && --depth < 0) {
        open = false;
        break;
      }
    }
    if (open) return true;
  }
  return false;
}

/** Every import edge of a source text (type-only, static and dynamic), with dynamic guards resolved. */
export function edgesOfSource(file: string, source: string): Edge[] {
  const code = stripComments(source);
  const edges: Edge[] = [];
  for (const m of code.matchAll(STATIC)) {
    const spec = m[3]!;
    edges.push({
      spec,
      target: toRepo(resolveSpecifier(file, spec)),
      kind: m[1] || m[2] ? 'type' : 'static',
      guarded: false,
    });
  }
  for (const m of code.matchAll(DYNAMIC)) {
    edges.push({
      spec: m[1]!,
      target: toRepo(resolveSpecifier(file, m[1]!)),
      kind: 'dynamic',
      guarded: isGuardedAt(code, m.index!),
    });
  }
  return edges;
}

const toRepo = (p: string | null): string | null => (p ? relative('.', p).split('\\').join('/') : null);

export function edgesOf(file: string): Edge[] {
  return existsSync(file) ? edgesOfSource(file, readFileSync(file, 'utf8')) : [];
}

/** The online zone: code that exists only in the online chunk of a server build (src/net/**, the controller, its screens, server/**). */
export const ZONE = [
  /^src\/net\//,
  /^src\/app\/rumbleOnline\.ts$/,
  // the controller's own modules (flow, session indirection, fake session, entry-form rules): imported only by the zone
  /^src\/app\/rumble(?:OnlineFlow|OnlineSession|OnlineFake|EntryInput)\.ts$/,
  /^src\/ui\/online\/rumble\//,
  // the player-platform client (docs/PLATFORM_CLIENT.md): API client, token store, controller, and its screens
  /^src\/online\/platform\//,
  /^src\/ui\/online\/platform\//,
  /^server\//,
];
export const inZone = (file: string): boolean => ZONE.some((re) => re.test(file));
/** Bare specifiers that belong to the online zone only. */
export const ZONE_PACKAGES = /^(?:@colyseus\/|colyseus(?:\.js)?$)/;

export interface Reach {
  /** Every repo file reachable at runtime (type edges ignored, guarded dynamic edges into the zone not followed). */
  files: Set<string>;
  /** file -> the file that first led to it (for readable failures). */
  via: Map<string, string>;
  /** Bare zone packages imported by reachable files. */
  packages: string[];
  /** Guarded dynamic edges into the zone that were (correctly) not followed. */
  guardedIntoZone: { from: string; to: string }[];
}

/**
 * Walks what a PUBLIC build bundles from `roots`: static value imports and dynamic imports are followed, `import type` edges are
 * not (erased), and a dynamic import into the zone is followed only when it is NOT lexically guarded (an unguarded one is then
 * reported through `files`).
 */
export function publicReach(roots: readonly string[]): Reach {
  const files = new Set<string>();
  const via = new Map<string, string>();
  const packages: string[] = [];
  const guardedIntoZone: { from: string; to: string }[] = [];
  const stack = roots.map((r) => normalize(r));
  while (stack.length) {
    const file = stack.pop()!;
    if (files.has(file) || !existsSync(file)) continue;
    files.add(file);
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const m of code.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*)['"](@?[a-z][^'"]*)['"]/gi)) {
      if (ZONE_PACKAGES.test(m[1]!)) packages.push(`${file}: ${m[1]}`);
    }
    for (const e of edgesOfSource(file, readFileSync(file, 'utf8'))) {
      if (e.kind === 'type' || !e.target) continue;
      if (e.kind === 'dynamic' && e.guarded && inZone(e.target)) {
        guardedIntoZone.push({ from: file, to: e.target });
        continue;
      }
      if (!files.has(e.target) && !via.has(e.target)) via.set(e.target, file);
      stack.push(e.target);
    }
  }
  return { files, via, packages, guardedIntoZone };
}
