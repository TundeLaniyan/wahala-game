import type { PlatformConfig } from './config';
import { createPgDb } from './db/pg';
import type * as Pglite from './db/pglite';
import type { Db } from './db/types';

/** Opens the configured database: Postgres in any real deployment, throw-away PGlite only for `memory` (development). */
export async function openDb(config: PlatformConfig): Promise<Db> {
  if (config.databaseUrl === 'memory') {
    if (config.env === 'production') throw new Error('the in-memory database is not allowed in production');
    // Loaded only here, through a VARIABLE specifier so the bundler leaves it alone: the production image contains neither the
    // PGlite package nor this module, and a production start can never reach this line (refused above and by validateConfig).
    const dev = './db/pglite';
    try {
      const { createPgliteDb } = (await import(dev)) as typeof Pglite;
      return await createPgliteDb();
    } catch {
      throw new Error(
        'the in-memory database is a development tool and is not part of the packaged service: set DATABASE_URL',
      );
    }
  }
  return createPgDb(config.databaseUrl, { max: config.dbPoolMax });
}
