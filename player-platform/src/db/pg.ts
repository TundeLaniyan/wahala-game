import pg from 'pg';
import type { Db, Queryable, QueryResult } from './types';

/** A `pg` connection pool as a `Db`. Returns int8 as a string (never silently loses precision) and timestamptz as Date. */
export function createPgDb(connectionString: string, opts: { max?: number } = {}): Db {
  const pool = new pg.Pool({
    connectionString,
    max: opts.max ?? 10,
    idleTimeoutMillis: 30_000,
    // bounds: a stuck query or a client that never answers cannot hold a connection (or the process) forever
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  // an idle client erroring must not crash the process
  pool.on('error', () => undefined);
  const wrap = (q: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
      const r = await q.query(sql, params as unknown[]);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    },
    async exec(sql: string): Promise<void> {
      await q.query(sql); // no parameters: the simple protocol, which accepts several statements
    },
  });
  return {
    ...wrap(pool),
    async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
    stats: () => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max: opts.max ?? 10,
    }),
  };
}
