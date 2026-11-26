/**
 * Entry point: `npm start` (development: in-memory database, mock identity provider if PLATFORM_MOCK_IDP=1) or the Docker
 * image (Postgres). It validates the configuration FIRST and refuses to start on any problem, printing the problems but never
 * a secret. Nothing here is deployed anywhere: see docs/PLATFORM_OPERATIONS.md.
 */
import { createPlatform } from './app';
import { openDb } from './bootstrap';
import { loadConfig, validateConfig, withSecretFiles } from './config';
import { createLogger } from './logger';

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig(withSecretFiles());
} catch (e) {
  createLogger().error('configuration problem', {
    problem: e instanceof Error ? e.message : 'unreadable secret file',
  });
  process.exit(1);
}
const log = createLogger(undefined, config.logLevel);
const problems = validateConfig(config);
if (problems.length > 0) {
  for (const p of problems) log.error('configuration problem', { problem: p });
  process.exit(1);
}
// Production NEVER migrates by itself: the operator runs `migrate` first (so a release is a deliberate step and a rollback to an
// older build is refused by the schema check instead of silently running on a newer schema).
const platform = await createPlatform(config, await openDb(config), {
  logger: log,
  skipMigrations: config.env === 'production',
});
const schema = await platform.schema();
if (!schema.ok) {
  log.error('database schema is not current: run the migrate step first', {
    current: schema.current,
    expected: schema.expected,
  });
  await platform.close();
  process.exit(1);
}
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

let stopping = false;
const stop = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', { signal, graceMs: config.shutdownGraceMs });
  clearInterval(timer);
  clearInterval(partyTimer);
  platform.drain(); // /ready -> 503 first, so the proxy stops sending new requests
  platform
    .close(config.shutdownGraceMs)
    .then(() => {
      log.info('stopped');
      process.exit(0);
    })
    .catch((e: unknown) => {
      log.error('shutdown failed', { err: e instanceof Error ? e.message : 'unknown' });
      process.exit(1);
    });
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
