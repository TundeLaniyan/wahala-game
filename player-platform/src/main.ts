/**
 * Entry point: `npm start` (development: in-memory database, mock identity provider if PLATFORM_MOCK_IDP=1) or the Docker
 * image (Postgres). It validates the configuration FIRST and refuses to start on any problem, printing the problems but never
 * a secret. Nothing here is deployed anywhere: see docs/PLATFORM_OPERATIONS.md.
 */
import { createPlatform } from './app';
import { openDb } from './bootstrap';
import { loadConfig, validateConfig } from './config';
import { createLogger } from './logger';

const config = loadConfig();
const log = createLogger(undefined, config.logLevel);
const problems = validateConfig(config);
if (problems.length > 0) {
  for (const p of problems) log.error('configuration problem', { problem: p });
  process.exit(1);
}
const platform = await createPlatform(config, await openDb(config), { logger: log });
const port = await platform.start();
log.info('player platform listening', {
  port,
  env: config.env,
  database: config.databaseUrl === 'memory' ? 'memory (throw-away)' : 'postgres',
  providers: platform.providers.available(),
});
if (config.env !== 'production' && config.databaseUrl === 'memory')
  log.warn('in-memory database: everything is lost on restart');

// housekeeping: expired sessions, nonces, idle guests, old audit rows (hourly; also `npm run purge`)
const timer = setInterval(
  () =>
    void platform
      .purge()
      .then((r) => log.info('purge', r))
      .catch((e: unknown) => log.error('purge failed', { err: e instanceof Error ? e.message : 'unknown' })),
  60 * 60_000,
);
timer.unref();

// parties: expire invitations, close idle ones, drop silent members (every 30 s)
const partyTimer = setInterval(
  () =>
    void platform.parties
      .sweep()
      .catch((e: unknown) =>
        log.error('party sweep failed', { err: e instanceof Error ? e.message : 'unknown' }),
      ),
  30_000,
);
partyTimer.unref();

const stop = (): void => {
  clearInterval(timer);
  clearInterval(partyTimer);
  void platform.close().finally(() => process.exit(0));
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
