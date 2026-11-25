/** `npm run migrate`: applies pending migrations to DATABASE_URL and exits. Run it BEFORE starting a new release. */
import { openDb } from '../bootstrap';
import { loadConfig, validateConfig } from '../config';
import { migrate } from '../db/migrate';

const config = loadConfig();
if (config.databaseUrl === 'memory') {
  console.error(
    'DATABASE_URL is not set: nothing to migrate (the in-memory database migrates itself on start).',
  );
  process.exit(1);
}
const problems = validateConfig(config);
if (problems.length > 0) {
  for (const p of problems) console.error(`configuration problem: ${p}`);
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
