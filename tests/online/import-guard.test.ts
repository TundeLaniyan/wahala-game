/**
 * The lexical guard detector behind tests/platform-static.test.ts (decision ON2): which dynamic `import()` calls count as
 * guarded by `__WAHALA_SERVER_ONLINE__`, and which are rejected. A runtime flag (`flags().rumbleOnline`) is never a guard:
 * it cannot keep code out of a public bundle.
 */
import { describe, expect, it } from 'vitest';
import { edgesOfSource, isGuardedAt } from './importGuard';

const guardedIn = (code: string): boolean => {
  const at = code.indexOf('import(');
  expect(at, 'the snippet has a dynamic import').toBeGreaterThanOrEqual(0);
  return isGuardedAt(code, at);
};

describe('guarded dynamic imports (accepted)', () => {
  const ok: [string, string][] = [
    [
      'early return',
      `async function f() { if (!__WAHALA_SERVER_ONLINE__) return null; return import('./x'); }`,
    ],
    [
      'early return, braced',
      `async function f() { if (!__WAHALA_SERVER_ONLINE__) { return null; } const m = await import('./x'); return m; }`,
    ],
    [
      'early return, throw',
      `async function f() { if (!__WAHALA_SERVER_ONLINE__) throw new Error('no'); return import('./x'); }`,
    ],
    [
      'early return, then other work',
      `async function f(a: number) { if (!__WAHALA_SERVER_ONLINE__) return null; if (a) { log(); } const m = await import('./x'); return m; }`,
    ],
    [
      'early return in an outer block, import in a nested one',
      `async function f(a: number) { if (!__WAHALA_SERVER_ONLINE__) return null; if (a) { return import('./x'); } return null; }`,
    ],
    [
      'if block',
      `async function f() { if (__WAHALA_SERVER_ONLINE__) { return import('./x'); } return null; }`,
    ],
    [
      'if block with && condition',
      `async function f(u?: string) { if (__WAHALA_SERVER_ONLINE__ && u) { const { a } = await import('./x'); return a; } return null; }`,
    ],
    ['ternary', `const load = () => (__WAHALA_SERVER_ONLINE__ ? import('./x') : Promise.resolve(null));`],
    ['&& expression', `const p = __WAHALA_SERVER_ONLINE__ && import('./x');`],
    ['&& chain', `const p = __WAHALA_SERVER_ONLINE__ && ok() && import('./x');`],
  ];
  for (const [name, code] of ok) it(name, () => expect(guardedIn(code)).toBe(true));
});

describe('unguarded dynamic imports (rejected)', () => {
  const bad: [string, string][] = [
    ['no guard at all', `async function f() { return import('./x'); }`],
    [
      'a runtime flag only',
      `async function f() { if (!flags().rumbleOnline) return null; return import('./x'); }`,
    ],
    [
      'the constant, but the early return is in another function',
      `function g() { if (!__WAHALA_SERVER_ONLINE__) return null; return 1; }\nasync function f() { return import('./x'); }`,
    ],
    [
      'the guard comes after the import',
      `async function f() { const m = await import('./x'); if (!__WAHALA_SERVER_ONLINE__) return null; return m; }`,
    ],
    [
      'the guard does not leave the function',
      `async function f() { if (!__WAHALA_SERVER_ONLINE__) { log(); } return import('./x'); }`,
    ],
    [
      'the early return sits inside a block that has ended',
      `async function f(a: number) { if (a) { if (!__WAHALA_SERVER_ONLINE__) return null; } return import('./x'); }`,
    ],
    [
      'negated condition block',
      `async function f() { if (!__WAHALA_SERVER_ONLINE__) { return import('./x'); } return null; }`,
    ],
    [
      '|| condition',
      `async function f(a: boolean) { if (__WAHALA_SERVER_ONLINE__ || a) { return import('./x'); } return null; }`,
    ],
    [
      'the import is outside the guarded block',
      `async function f() { if (__WAHALA_SERVER_ONLINE__) { log(); } return import('./x'); }`,
    ],
    [
      'else branch of the constant',
      `async function f() { if (__WAHALA_SERVER_ONLINE__) { return null; } else { return import('./x'); } }`,
    ],
    [
      'the constant named in a string',
      `async function f() { log('__WAHALA_SERVER_ONLINE__ && '); return import('./x'); }`,
    ],
    ['a ternary on something else', `const load = () => (flags().rumbleOnline ? import('./x') : null);`],
  ];
  for (const [name, code] of bad) it(name, () => expect(guardedIn(code)).toBe(false));
});

describe('edges', () => {
  const edges = edgesOfSource(
    'src/online/rumbleEntry.ts',
    `import type { A } from '../app/rumbleOnline';
import { flags } from '../platform';
import { type B, c } from '../platform/flags';
export type { D } from '../app/rumbleOnline';
export async function f() { if (!__WAHALA_SERVER_ONLINE__) return null; return import('../app/rumbleOnline'); }`,
  );
  it('classifies type-only, value and dynamic edges', () => {
    expect(edges.map((e) => [e.spec, e.kind, e.guarded])).toEqual([
      ['../app/rumbleOnline', 'type', false],
      ['../platform', 'static', false],
      ['../platform/flags', 'static', false], // `import { type B, c }` keeps a runtime edge
      ['../app/rumbleOnline', 'type', false],
      ['../app/rumbleOnline', 'dynamic', true],
    ]);
    expect(edges[4]!.target).toBe('src/app/rumbleOnline.ts');
  });
});
