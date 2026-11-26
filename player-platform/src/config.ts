/**
 * Environment -> validated configuration. `validateConfig` returns every problem at once (so an operator fixes them in one
 * pass) and never echoes a secret value. Production (`PLATFORM_ENV=production`) refuses everything that exists only for
 * development: the mock identity provider, mock checkout, dev text chat, an in-memory database, short or missing secrets.
 */
import { readFileSync } from 'node:fs';

export type PlatformEnv = 'development' | 'test' | 'production';

export interface PlatformConfig {
  env: PlatformEnv;
  port: number;
  host: string;
  /** `memory` = throw-away PGlite (development only); otherwise a Postgres URL. */
  databaseUrl: string | 'memory';
  allowedOrigins: string[];
  trustedProxies: string[];
  /** OAuth client ids (the `aud` of the provider's id token). Empty = that provider is not configured and refuses. */
  googleClientIds: string[];
  appleClientIds: string[];
  /** Development identity provider (signed test tokens through the real verifier). Refused in production. */
  mockIdentityProvider: boolean;
  /** Shared secret of the match server (HMAC of internal calls). Empty = internal match endpoints are off. */
  matchServerSecret: string;
  /** Bearer token for the moderation/admin endpoints. Empty = they are off. */
  adminToken: string;
  /** Ed25519 private key (PEM) that signs match-handoff tickets. Empty in development = an ephemeral key per start. */
  handoffPrivateKeyPem: string;
  handoffAudience: string;
  /** Public web origin used to build invitation links (never hard-coded). */
  publicWebUrl: string;
  partyMaxSize: number;
  devTextChat: boolean;
  /** Operator deny-list for the dev text chat (lower-case words; compared on the look-alike-folded text). Empty by default. */
  chatDenylist: string[];
  /**
   * Automatic, reversible silencing of a player's presets after reports from several different players. DEFAULT: on in
   * development / test, **OFF in production** until moderators exist (it can be abused by colluding accounts: docs/PLATFORM_COLLUSION_ANALYSIS.md).
   */
  autoRestrict: boolean;
  /** Anonymous account creation per address: `burst/perMinute`. Default 5/6; a private beta with friends behind one NAT needs more. */
  guestCreateRate: { burst: number; perMin: number };
  /**
   * PRIVATE BETA MODE: no Google / Apple provider is configured and accounts are GUESTS ONLY (sign-in answers 501). Production
   * normally refuses to start without a real identity provider; this explicit switch is the visible acknowledgement that it is
   * intended. It never enables anything: it only waives that one requirement.
   */
  guestOnly: boolean;
  /** Bearer token for `GET /metrics`. Empty in production = the route does not exist. */
  metricsToken: string;
  /** Postgres pool ceiling: bounds the connections this process can hold open (the server's own limit is `max_connections`). */
  dbPoolMax: number;
  /** How long a stop waits for in-flight requests before closing the rest, ms. */
  shutdownGraceMs: number;
  /** Mock checkout (no payment provider): development only. */
  mockCheckout: boolean;
  /** Refresh-token lifetime (sliding) and hard cap, days. */
  refreshDays: number;
  sessionMaxDays: number;
  guestIdleDeleteDays: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const list = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const flag = (v: string | undefined): boolean => v === '1' || v?.toLowerCase() === 'true';

function num(v: string | undefined, fallback: number, min: number, max: number): number {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function parseRate(
  v: string | undefined,
  fallback: { burst: number; perMin: number },
): { burst: number; perMin: number } {
  const m = /^(\d{1,3})\/(\d{1,4})$/.exec((v ?? '').trim());
  if (!m) return fallback;
  const burst = Number(m[1]);
  const perMin = Number(m[2]);
  return burst >= 1 && perMin >= 1 ? { burst, perMin } : fallback;
}

export function loadConfig(e: Record<string, string | undefined> = process.env): PlatformConfig {
  const env: PlatformEnv =
    e.PLATFORM_ENV === 'production' ? 'production' : e.PLATFORM_ENV === 'test' ? 'test' : 'development';
  const level = e.PLATFORM_LOG_LEVEL;
  return {
    env,
    port: Math.round(num(e.PORT, 4567, 0, 65535)),
    host: e.PLATFORM_HOST ?? '127.0.0.1',
    databaseUrl: e.DATABASE_URL?.trim() ? e.DATABASE_URL.trim() : 'memory',
    allowedOrigins: list(e.PLATFORM_ALLOWED_ORIGINS),
    trustedProxies: list(e.PLATFORM_TRUSTED_PROXIES),
    googleClientIds: list(e.PLATFORM_GOOGLE_CLIENT_IDS),
    appleClientIds: list(e.PLATFORM_APPLE_CLIENT_IDS),
    mockIdentityProvider: flag(e.PLATFORM_MOCK_IDP),
    matchServerSecret: e.PLATFORM_MATCH_SERVER_SECRET ?? '',
    adminToken: e.PLATFORM_ADMIN_TOKEN ?? '',
    handoffPrivateKeyPem: (e.PLATFORM_HANDOFF_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    handoffAudience: e.PLATFORM_HANDOFF_AUDIENCE ?? 'wahala-rumble',
    publicWebUrl: (e.PLATFORM_PUBLIC_WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
    partyMaxSize: Math.round(num(e.PLATFORM_PARTY_MAX_SIZE, 8, 2, 32)),
    devTextChat: flag(e.PLATFORM_DEV_TEXT_CHAT),
    guestCreateRate: parseRate(e.PLATFORM_GUEST_CREATE_RATE, { burst: 5, perMin: 6 }),
    guestOnly: flag(e.PLATFORM_GUEST_ONLY),
    metricsToken: e.PLATFORM_METRICS_TOKEN ?? '',
    dbPoolMax: Math.round(num(e.PLATFORM_DB_POOL_MAX, 10, 1, 100)),
    shutdownGraceMs: Math.round(num(e.PLATFORM_SHUTDOWN_GRACE_SECONDS, 8, 0, 60) * 1000),
    autoRestrict:
      e.PLATFORM_AUTO_RESTRICT === undefined ? env !== 'production' : flag(e.PLATFORM_AUTO_RESTRICT),
    chatDenylist: list(e.PLATFORM_CHAT_DENYLIST).map((w) => w.toLowerCase()),
    mockCheckout: flag(e.PLATFORM_MOCK_CHECKOUT),
    refreshDays: num(e.PLATFORM_REFRESH_DAYS, 30, 1, 365),
    sessionMaxDays: num(e.PLATFORM_SESSION_MAX_DAYS, 365, 1, 730),
    guestIdleDeleteDays: num(e.PLATFORM_GUEST_IDLE_DELETE_DAYS, 180, 30, 3650),
    logLevel: level === 'debug' || level === 'warn' || level === 'error' ? level : 'info',
  };
}

const MIN_SECRET = 32;

/** Every problem with a configuration, as plain sentences (no secret values). Empty = valid. */
export function validateConfig(c: PlatformConfig): string[] {
  const problems: string[] = [];
  const prod = c.env === 'production';
  if (c.refreshDays > c.sessionMaxDays)
    problems.push('PLATFORM_REFRESH_DAYS must not exceed PLATFORM_SESSION_MAX_DAYS');
  if (c.databaseUrl !== 'memory' && !/^postgres(ql)?:\/\//.test(c.databaseUrl))
    problems.push('DATABASE_URL must be a postgres:// URL');
  for (const o of c.allowedOrigins) {
    if (o === '*' || !/^https?:\/\/[^/*]+$/.test(o))
      problems.push(`PLATFORM_ALLOWED_ORIGINS entry is not an exact origin: ${o}`);
  }
  if (c.matchServerSecret && c.matchServerSecret.length < MIN_SECRET)
    problems.push(`PLATFORM_MATCH_SERVER_SECRET must be at least ${MIN_SECRET} characters`);
  if (c.metricsToken && c.metricsToken.length < MIN_SECRET)
    problems.push(`PLATFORM_METRICS_TOKEN must be at least ${MIN_SECRET} characters`);
  if (c.adminToken && c.adminToken.length < MIN_SECRET)
    problems.push(`PLATFORM_ADMIN_TOKEN must be at least ${MIN_SECRET} characters`);
  if (prod) {
    if (c.databaseUrl === 'memory')
      problems.push('production needs DATABASE_URL (the in-memory database is development only)');
    if (c.mockIdentityProvider)
      problems.push('PLATFORM_MOCK_IDP is development only and is refused in production');
    if (c.mockCheckout)
      problems.push('PLATFORM_MOCK_CHECKOUT is development only and is refused in production');
    if (c.devTextChat)
      problems.push('PLATFORM_DEV_TEXT_CHAT is development only and is refused in production');
    if (!c.handoffPrivateKeyPem)
      problems.push(
        'production needs PLATFORM_HANDOFF_PRIVATE_KEY (an ephemeral key would invalidate tickets on restart)',
      );
    if (c.allowedOrigins.length === 0)
      problems.push('production needs PLATFORM_ALLOWED_ORIGINS (nothing is allowed by default)');
    if (c.allowedOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o)))
      problems.push('production origins must not include localhost');
    if (!c.publicWebUrl.startsWith('https://'))
      problems.push('PLATFORM_PUBLIC_WEB_URL must be https in production');
    if (c.googleClientIds.length === 0 && c.appleClientIds.length === 0 && !c.guestOnly)
      problems.push(
        'production needs at least one real identity provider (PLATFORM_GOOGLE_CLIENT_IDS or PLATFORM_APPLE_CLIENT_IDS), or set PLATFORM_GUEST_ONLY=1 to run a guests-only private beta on purpose',
      );
  }
  return problems;
}

/** Secrets that may come from a file (Docker / Compose secrets, systemd credentials) instead of an environment variable. */
export const FILE_SECRETS = [
  'DATABASE_URL',
  'PLATFORM_MATCH_SERVER_SECRET',
  'PLATFORM_ADMIN_TOKEN',
  'PLATFORM_METRICS_TOKEN',
  'PLATFORM_HANDOFF_PRIVATE_KEY',
] as const;

/**
 * `NAME_FILE=/run/secrets/x` supplies `NAME` from the file's contents (trailing whitespace trimmed). A secret in a file does not show in
 * `docker inspect`, `/proc/<pid>/environ` of other users, or a process listing. Setting both `NAME` and `NAME_FILE`, or pointing at a
 * missing / empty file, is an ERROR (it fails loudly instead of silently starting without the secret).
 */
export function withSecretFiles(
  env: Record<string, string | undefined> = process.env,
  read: (path: string) => string = (p) => readFileSync(p, 'utf8'),
): Record<string, string | undefined> {
  const out = { ...env };
  for (const name of FILE_SECRETS) {
    const file = env[`${name}_FILE`];
    if (file === undefined || file === '') continue;
    if (env[name] !== undefined && env[name] !== '')
      throw new Error(`set either ${name} or ${name}_FILE, not both`);
    let text: string;
    try {
      text = read(file).replace(/\s+$/, '');
    } catch {
      throw new Error(`${name}_FILE points at a file that cannot be read`);
    }
    if (text === '') throw new Error(`${name}_FILE points at an empty file`);
    out[name] = text;
  }
  return out;
}
