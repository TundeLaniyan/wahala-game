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
import { Metrics } from './metrics';
import type { Logger } from './logger';
import { createHandoffSigner } from './handoff/signer';
import type { HandoffSigner } from './handoff/signer';
import { randomBytes } from 'node:crypto';
import { CatalogService } from './commerce/catalog';
import {
  AppleIapProvider,
  GooglePlayProvider,
  PaymentProviders,
  WebCheckoutProvider,
  createMockProvider as createMockPayments,
} from './commerce/providers';
import type { MockCheckoutProvider } from './commerce/providers';
import { CommerceService } from './commerce/service';
import { DevTextChat, createDevModerator } from './comms/chat';
import { ReportService } from './comms/reports';
import { CommsService } from './comms/service';
import { NullVoiceGateway, VoiceService } from './comms/voice';
import { MatchService } from './matches/service';
import { PartyService } from './parties/service';
import { commerceRoutes } from './routes/commerce';
import { commsRoutes } from './routes/comms';
import { identityRoutes } from './routes/identity';
import { createInviteGate } from './identity/invites';
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
  catalog: CatalogService;
  commerce: CommerceService;
  mockPayments: MockCheckoutProvider | null;
  /** Everything periodic that deletes data: sessions, idle guests, old audit rows, dev chat, resolved reports. */
  purge(): Promise<Record<string, unknown>>;
  presence: PresenceStore;
  signer: HandoffSigner;
  providers: ProviderRegistry;
  mockProvider: MockProvider | null;
  http: PlatformHttp;
  metrics: Metrics;
  /** The database's schema version against this build's migrations (production start refuses to run on a mismatch). */
  schema(): Promise<{ ok: boolean; current: number | null; expected: number }>;
  start(): Promise<number>;
  /** Stop taking traffic (`/ready` -> 503) without closing anything yet. */
  drain(): void;
  close(graceMs?: number): Promise<void>;
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
  const reports = new ReportService({ db, clock, comms, identity, autoRestrict: config.autoRestrict });
  const voice = new VoiceService({ db, comms, gateway: NullVoiceGateway });
  const chat =
    config.devTextChat && config.env !== 'production'
      ? new DevTextChat({ db, clock, comms, moderator: createDevModerator(config.chatDenylist) })
      : null;
  identity.registerErasure((q, id) => comms.erase(q, id));
  identity.registerErasure((q, id) => reports.erase(q, id));

  // commerce FOUNDATIONS: the mock exists only in development / test; the real providers are unconfigured skeletons
  const sandbox = config.mockCheckout && config.env !== 'production';
  const mockPayments = sandbox ? createMockPayments(clock, randomBytes(32).toString('hex')) : null;
  const paymentProviders = new PaymentProviders([
    ...(mockPayments ? [mockPayments] : []),
    WebCheckoutProvider,
    AppleIapProvider,
    GooglePlayProvider,
  ]);
  const schema = async (): Promise<{ ok: boolean; current: number | null; expected: number }> => {
    try {
      const r = await db.query<{ v: number | null }>('SELECT max(version) AS v FROM schema_migrations');
      const current = Number(r.rows[0]?.v ?? 0);
      return { ok: current === migrations.length, current, expected: migrations.length };
    } catch {
      return { ok: false, current: null, expected: migrations.length };
    }
  };

  const catalog = new CatalogService({ db, clock, sandboxVisible: sandbox });
  // on a database that is not at this build's schema (production never migrates itself) the sync would die on a missing table:
  // skip it, so the caller's schema check gives the operator the clear "run migrate" message instead of a stack trace
  if (!o.skipMigrations || (await schema()).ok) await catalog.syncFromGame();
  const commerce = new CommerceService({ db, clock, identity, catalog, providers: paymentProviders });
  identity.registerErasure((q, id) => commerce.erase(q, id));

  const router = new Router();
  router.addAll(identityRoutes(identity, providers, mockProvider, createInviteGate(config.inviteRequired, config.inviteCodes)));
  router.addAll(socialRoutes(social, parties, matches, presence, signer));
  router.addAll(internalRoutes(matches));
  router.addAll(commsRoutes(comms, reports, voice, chat));
  router.addAll(
    commerceRoutes({ catalog, commerce, providers: paymentProviders, mock: mockPayments, sandbox }),
  );

  const metrics = new Metrics();
  const http = createHttp({
    router,
    metrics,
    rates: { guestCreate: config.guestCreateRate },
    metricsToken: config.metricsToken,
    db,
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
      const r = await schema();
      return { ok: r.ok, detail: { schema: r.current, expected: r.expected } };
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
    catalog,
    commerce,
    mockPayments,
    async purge() {
      return {
        identity: await identity.purge(),
        comms: await comms.purge(),
        reports: await reports.purge(),
        orders: await commerce.expireStale(),
      };
    },
    presence,
    signer,
    providers,
    mockProvider,
    http,
    metrics,
    schema,
    start: () => http.listen(config.port, config.host),
    drain: () => http.drain(),
    close: async (graceMs = 0) => {
      await http.close(graceMs);
      metrics.stop();
      await db.close();
    },
  };
}

export { ApiError };
