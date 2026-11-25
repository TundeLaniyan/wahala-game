/**
 * `npm run seed` (development only): creates a few demo accounts so the local stack is not empty. Refuses production.
 * Demo accounts are GUESTS (no credentials): the printed tokens are the only way in, and they are printed once.
 */
import { createPlatform } from '../app';
import { openDb } from '../bootstrap';
import { loadConfig } from '../config';
import { silentLogger } from '../logger';

const config = loadConfig();
if (config.env === 'production') {
  console.error('seed refuses to run in production');
  process.exit(1);
}
const platform = await createPlatform(config, await openDb(config), { logger: silentLogger });
try {
  for (const name of ['Demo Ada', 'Demo Bola', 'Demo Chidi']) {
    try {
      const r = await platform.identity.createGuest({ nickname: name, platform: 'dev', ageGroup: 'adult' });
      console.log(`${name}: id ${r.profile.id} friend code ${r.profile.friendCode}`);
    } catch (e) {
      console.log(`${name}: skipped (${e instanceof Error ? e.message : 'error'})`);
    }
  }
} finally {
  await platform.close();
}
