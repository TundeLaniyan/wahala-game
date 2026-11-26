/** `npm run purge`: expired sessions and nonces, idle guest accounts, audit rows past retention. Safe to run from cron. */
import { createPlatform } from '../app';
import { openDb } from '../bootstrap';
import { loadConfig } from '../config';
import { silentLogger } from '../logger';

const config = loadConfig();
const platform = await createPlatform(config, await openDb(config), { logger: silentLogger });
try {
  console.log(JSON.stringify(await platform.purge()));
} finally {
  await platform.close();
}
