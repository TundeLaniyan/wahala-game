import type { PlatformConfig } from './config';
import { createPgDb } from './db/pg';
import type { Db } from './db/types';

/** Opens the configured database: Postgres in any real deployment, throw-away PGlite only for `memory` (development). */
export async function openDb(config: PlatformConfig): Promise<Db> {
  if (config.databaseUrl === 'memory') {
    if (config.env === 'production') throw new Error('the in-memory database is not allowed in production');
    // loaded only here: the production image does not even contain PGlite
    const { createPgliteDb } = await import('./db/pglite');
    return createPgliteDb();
  }
  return createPgDb(config.databaseUrl);
}
