/** `npm run migrate`: applies pending migrations to DATABASE_URL and exits. Run it BEFORE starting a new release. */
import { openDb } from '../bootstrap';
import { loadConfig, withSecretFiles } from '../config';
import { migrate } from '../db/migrate';

const config = loadConfig(withSecretFiles());
if (config.databaseUrl === 'memory') {
  console.error(
    'DATABASE_URL is not set: nothing to migrate (the in-memory database migrates itself on start).',
  );
  process.exit(1);
}
// Migrating needs the database address and nothing else: the full production rules (signing key, origins, tokens) belong to the
// service itself, and demanding them here would only force secrets into a container that does not use them.
if (!/^postgres(ql)?:\/\//.test(config.databaseUrl)) {
  console.error('configuration problem: DATABASE_URL (or DATABASE_URL_FILE) must be a postgres:// URL');
  process.exit(1);
}
const db = await openDb(config);
try {
  const r = await migrate(db);
  console.log(
    r.applied.length === 0
      ? `schema is current (version ${r.current})`
      : `applied ${r.applied.join(', ')}; schema is now version ${r.current}`,
  );
} finally {
  await db.close();
}
