import { PGlite } from '@electric-sql/pglite';
import type { Db, Queryable, QueryResult } from './types';

/**
 * PGlite (real Postgres, in-process WASM) as a `Db`: used by the test suite and `PLATFORM_DB=memory` (a throw-away dev
 * database: nothing is persisted unless `dataDir` is given). Never a production choice.
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const db = new PGlite(dataDir);
  await db.waitReady;
  const wrap = (q: { query: PGlite['query']; exec: PGlite['exec'] }): Queryable => ({
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
      const r = await q.query<T>(sql, params as unknown[]);
      return {
        rows: r.rows, // PGlite reports affectedRows 0 for a SELECT: count returned rows first, as `pg` does
        rowCount: r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0),
      };
    },
    async exec(sql: string): Promise<void> {
      await q.exec(sql);
    },
  });
  return {
    ...wrap(db),
    tx: (fn) => db.transaction((t) => fn(wrap(t as unknown as PGlite))),
    close: () => db.close(),
  };
}
