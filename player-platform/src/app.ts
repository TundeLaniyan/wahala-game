/**
 * Composition root: configuration -> database -> services -> routes -> HTTP server. Tests build the same thing with a
 * PGlite database, a fake clock and a silent logger. Nothing else in the codebase constructs a service.
 */
import { ApiError } from './errors';
import type { PlatformConfig } from './config';
import type { Db } from './db/types';
import { loadMigrations, migrate } from './db/migrate';
import { createHttp } from './http/server';
import type { PlatformHttp } from './http/server';
import { createRateLimiter } from './http/rateLimit';
import type { RateLimiter } from './http/rateLimit';
import { Router } from './http/router';
import { IdentityService } from './identity/service';
import { ProviderRegistry, appleProvider, createMockProvider, googleProvider } from './identity/providers';
import type { IdentityProvider, MockProvider } from './identity/providers';
import { createLogger } from './logger';
import type { Logger } from './logger';
import { createHandoffSigner } from './handoff/signer';
import type { HandoffSigner } from './handoff/signer';
import { DevTextChat, createDevModerator } from './comms/chat';
import { ReportService } from './comms/reports';
import { CommsService } from './comms/service';
import { NullVoiceGateway, VoiceService } from './comms/voice';
import { MatchService } from './matches/service';
import { PartyService } from './parties/service';
import { commsRoutes } from './routes/comms';
import { identityRoutes } from './routes/identity';
import { internalRoutes } from './routes/internal';
import { socialRoutes } from './routes/social';
import { createPresenceStore } from './social/presence';
import type { PresenceStore } from './social/presence';
import { SocialService } from './social/service';
import { systemClock } from './util/clock';
import type { Clock } from './util/clock';

export interface Platform {
  config: PlatformConfig;
  db: Db;
  clock: Clock;
  logger: Logger;
  limiter: RateLimiter;
  router: Router;
  identity: IdentityService;
  social: SocialService;
  parties: PartyService;
  matches: MatchService;
  comms: CommsService;
  reports: ReportService;
  /** Everything periodic that deletes data: sessions, idle guests, old audit rows, dev chat, resolved reports. */
  purge(): Promise<Record<string, unknown>>;
  presence: PresenceStore;
  signer: HandoffSigner;
  providers: ProviderRegistry;
  mockProvider: MockProvider | null;
  http: PlatformHttp;
  start(): Promise<number>;
  close(): Promise<void>;
}

export interface PlatformOverrides {
  clock?: Clock;
  logger?: Logger;
  limiter?: RateLimiter;
  /** Providers registered AFTER the configured ones, replacing same-id ones (tests inject a Google verifier with local keys). */
  providers?: IdentityProvider[];
  /** Skip running migrations (the caller already did). */
  skipMigrations?: boolean;
}

export async function createPlatform(
  config: PlatformConfig,
  db: Db,
  o: PlatformOverrides = {},
): Promise<Platform> {
  const clock = o.clock ?? systemClock;
  const logger = o.logger ?? createLogger(undefined, config.logLevel);
  const limiter = o.limiter ?? createRateLimiter(clock);
  const migrations = await loadMigrations();
  if (!o.skipMigrations) await migrate(db, migrations);

  const providers = new ProviderRegistry();
  providers.register(googleProvider(config.googleClientIds, clock));
  providers.register(appleProvider(config.appleClientIds, clock));
  let mockProvider: MockProvider | null = null;
  if (config.mockIdentityProvider && config.env !== 'production') {
    mockProvider = await createMockProvider(clock);
    providers.register(mockProvider);
  }

  for (const p of o.providers ?? []) providers.register(p);

  const identity = new IdentityService({
    db,
    clock,
    providers,
    policy: { refreshDays: config.refreshDays, sessionMaxDays: config.sessionMaxDays },
    logger,
    guestIdleDeleteDays: config.guestIdleDeleteDays,
  });

  const startedAt = clock();
  const presence = createPresenceStore(clock);
  const signer = await createHandoffSigner({
    privateKeyPem: config.handoffPrivateKeyPem || undefined,
    audience: config.handoffAudience,
    clock,
  });
  const social = new SocialService({ db, clock, presence });
  const parties = new PartyService({
    db,
    clock,
    identity,
    social,
    presence,
    signer,
    maxSize: config.partyMaxSize,
    publicWebUrl: config.publicWebUrl,
    startedAt,
  });
  const matches = new MatchService({ db, clock, presence, parties });
  // account deletion erases every module's rows in the same transaction
  identity.registerErasure((q, id, now) => parties.erase(q, id, now));
  identity.registerErasure((q, id) => social.erase(q, id));
  identity.registerErasure((q, id) => matches.erase(q, id));

  const comms = new CommsService({ db, clock });
  const reports = new ReportService({ db, clock, comms, identity });
  const voice = new VoiceService({ db, comms, gateway: NullVoiceGateway });
  const chat =
    config.devTextChat && config.env !== 'production'
      ? new DevTextChat({ db, clock, comms, moderator: createDevModerator(config.chatDenylist) })
      : null;
  identity.registerErasure((q, id) => comms.erase(q, id));
  identity.registerErasure((q, id) => reports.erase(q, id));

  const router = new Router();
  router.addAll(identityRoutes(identity, providers, mockProvider));
  router.addAll(socialRoutes(social, parties, matches, presence, signer));
  router.addAll(internalRoutes(matches));
  router.addAll(commsRoutes(comms, reports, voice, chat));

  const http = createHttp({
    router,
    identity,
    limiter,
    clock,
    logger,
    onAuthenticated: (p) => presence.touch(p.playerId),
    allowedOrigins: config.allowedOrigins,
    trustedProxies: config.trustedProxies,
    matchServerSecret: config.matchServerSecret,
    adminToken: config.adminToken,
    ready: async () => {
      try {
        const r = await db.query<{ v: number | null }>('SELECT max(version) AS v FROM schema_migrations');
        const current = Number(r.rows[0]?.v ?? 0);
        return {
          ok: current === migrations.length,
          detail: { schema: current, expected: migrations.length },
        };
      } catch {
        return { ok: false, detail: { schema: null } };
      }
    },
  });

  return {
    config,
    db,
    clock,
    logger,
    limiter,
    router,
    identity,
    social,
    parties,
    matches,
    comms,
    reports,
    async purge() {
      return { identity: await identity.purge(), comms: await comms.purge(), reports: await reports.purge() };
    },
    presence,
    signer,
    providers,
    mockProvider,
    http,
    start: () => http.listen(config.port, config.host),
    close: async () => {
      await http.close();
      await db.close();
    },
  };
}

export { ApiError };
