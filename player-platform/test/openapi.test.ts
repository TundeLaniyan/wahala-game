import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { startHarness } from './helpers';
import type { Harness } from './helpers';

/** The spec is a contract: every route the server serves is documented, and nothing is documented that does not exist. */
describe('OpenAPI contract', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  const spec = async () =>
    parse(await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8')) as {
      openapi: string;
      paths: Record<string, Record<string, { summary?: string; security?: unknown[] }>>;
    };
  const toOpenApi = (p: string) => p.replace(/:([A-Za-z]+)/g, '{$1}');

  it('lists exactly the routes the server registers (method + path)', async () => {
    const doc = await spec();
    const documented = new Set<string>();
    for (const [path, ops] of Object.entries(doc.paths))
      for (const m of Object.keys(ops))
        if (['get', 'post', 'put', 'patch', 'delete'].includes(m))
          documented.add(`${m.toUpperCase()} ${path}`);
    const served = new Set(h.platform.router.list().map((r) => `${r.method} ${toOpenApi(r.path)}`));
    expect([...served].filter((r) => !documented.has(r)).sort(), 'served but not documented').toEqual([]);
    expect([...documented].filter((r) => !served.has(r)).sort(), 'documented but not served').toEqual([]);
  });

  it('marks every player route as requiring the bearer token and every anonymous route as not', async () => {
    const doc = await spec();
    for (const r of h.platform.router.list()) {
      const op = doc.paths[toOpenApi(r.path)]?.[r.method.toLowerCase()];
      expect(op, `${r.method} ${r.path}`).toBeDefined();
      const secured = Array.isArray(op!.security) && op!.security.length > 0;
      expect(secured, `${r.method} ${r.path} security`).toBe(r.auth !== 'none');
    }
  });

  it('is a valid OpenAPI 3 document header', async () => {
    expect((await spec()).openapi).toMatch(/^3\./);
  });
});
