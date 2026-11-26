/**
 * The only database surface the services use. Two implementations: `pg` (a real server: local Docker, hosted Postgres)
 * and PGlite (the real Postgres engine compiled to WASM: hermetic tests, no Docker needed). Services never import a
 * driver, so the SQL, migrations and constraints are tested against the same engine that runs in production.
 */
export type Row = Record<string, unknown>;

export interface QueryResult<T = Row> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Row>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  /** Runs a script of several statements (migrations only; no parameters). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  /** Runs `fn` in one transaction: commit when it resolves, roll back when it throws. Not re-entrant. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Postgres SQLSTATE of a driver error (both drivers expose it as `code`). */
export function sqlState(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

export const UNIQUE_VIOLATION = '23505';
export const FOREIGN_KEY_VIOLATION = '23503';
export const CHECK_VIOLATION = '23514';

export const isUniqueViolation = (e: unknown): boolean => sqlState(e) === UNIQUE_VIOLATION;
