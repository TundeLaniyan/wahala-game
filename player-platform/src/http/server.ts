/**
 * The HTTP shell: parses and limits a request, authenticates it, rate-limits it, runs the route and renders the answer in
 * one envelope. Plain `node:http` (no framework): the surface is small and every behaviour here is covered by a test.
 *
 * Every response: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, an
 * `X-Request-Id`. Errors are `{ error: { code, message, requestId, retryAfterMs? } }`; unexpected exceptions are logged
 * (scrubbed) and answered as a bare `internal` so no stack trace or SQL reaches a client.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiError, badRequest } from '../errors';
import { requestContext } from '../context';
import type { IdentityService } from '../identity/service';
import type { Principal } from '../identity/types';
import type { Logger } from '../logger';
import type { Metrics } from '../metrics';
import type { Db } from '../db/types';
import type { Clock } from '../util/clock';
import { safeEqual } from '../util/secrets';
import { clientIp, ipKey, parseTrusted } from './clientIp';
import { RATES } from './rateLimit';
import type { Rate } from './rateLimit';
import type { RateLimiter } from './rateLimit';
import type { RouteContext, Router } from './router';
import { verifyServiceRequest } from './serviceAuth';

export const DEFAULT_MAX_BYTES = 16 * 1024;

export interface HttpOptions {
  router: Router;
  identity: IdentityService;
  limiter: RateLimiter;
  clock: Clock;
  logger: Logger;
  allowedOrigins: readonly string[];
  trustedProxies: readonly string[];
  matchServerSecret: string;
  adminToken: string;
  /** Operational metrics + the token that opens `GET /metrics` (empty token = no such route). */
  metrics: Metrics;
  metricsToken: string;
  db: Db;
  /** Per-class overrides of `RATES` (configuration, e.g. a more generous guest-creation limit for a private beta). */
  rates?: Partial<Record<keyof typeof RATES, Rate>>;
  /** Called after every successful player authentication (presence keeps-alive). */
  onAuthenticated?: (p: Principal) => void;
  /** Readiness probe: resolves when the database answers and the schema is current. */
  ready: () => Promise<{ ok: boolean; detail?: Record<string, unknown> }>;
}

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-site',
};

export interface PlatformHttp {
  server: Server;
  listen(port: number, host: string): Promise<number>;
  /** Stop taking work: `/ready` answers 503 so a proxy stops sending traffic; in-flight requests finish. */
  drain(): void;
  /** Close the listener, wait up to `graceMs` for in-flight requests, then cut what remains. */
  close(graceMs?: number): Promise<void>;
  /** For tests: handle without a socket is not provided; use `listen(0)`. */
}

async function readBody(req: IncomingMessage, max: number): Promise<string> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > max) throw new ApiError('payload_too_large', 'request body too large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new ApiError('payload_too_large', 'request body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createHttp(o: HttpOptions): PlatformHttp {
  const trusted = parseTrusted(o.trustedProxies);
  const allowed = new Set(o.allowedOrigins);

  const send = (
    res: ServerResponse,
    status: number,
    body: unknown,
    extra: Record<string, string>,
    origin: string | null,
  ): void => {
    const headers: Record<string, string> = { ...SECURITY_HEADERS, ...extra };
    if (origin !== null && allowed.has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers.Vary = 'Origin';
    }
    const text = body === undefined ? '' : JSON.stringify(body);
    if (text) headers['Content-Type'] = 'application/json; charset=utf-8';
    res.writeHead(status, headers);
    res.end(text);
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomUUID();
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    const base = { 'X-Request-Id': requestId };
    const url = new URL(req.url ?? '/', 'http://platform.local');
    const path = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();
    const ip = ipKey(clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], trusted));
    const started = performance.now();
    let status = 500;
    let routeName = 'unmatched';
    try {
      // CORS preflight: only for allowed origins, only the headers the API uses
      if (method === 'OPTIONS') {
        status = origin !== null && allowed.has(origin) ? 204 : 403;
        send(
          res,
          status,
          undefined,
          status === 204
            ? {
                ...base,
                'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
                'Access-Control-Allow-Headers': 'authorization, content-type, idempotency-key',
                'Access-Control-Max-Age': '600',
              }
            : base,
          origin,
        );
        return;
      }
      if (path === '/health') {
        routeName = 'GET /health';
        status = 200;
        send(res, 200, { ok: true }, base, null);
        return;
      }
      if (path === '/ready') {
        routeName = 'GET /ready';
        const r = o.metrics.draining ? { ok: false, detail: { draining: true } } : await o.ready();
        status = r.ok ? 200 : 503;
        send(res, status, { ok: r.ok, ...r.detail }, base, null);
        return;
      }
      if (path === '/metrics' && o.metricsToken) {
        routeName = 'GET /metrics';
        const h = req.headers.authorization;
        if (typeof h !== 'string' || !safeEqual(h, `Bearer ${o.metricsToken}`))
          throw new ApiError('unauthenticated', 'metrics token required');
        status = 200;
        send(res, 200, o.metrics.snapshot(o.db), base, null);
        return;
      }
      const ipRate = o.limiter.take(`ip:${ip}`, RATES.ip);
      if (!ipRate.ok)
        throw new ApiError('rate_limited', 'too many requests', { retryAfterMs: ipRate.retryAfterMs });

      const found = o.router.find(method, path);
      if (!found) throw new ApiError('not_found', 'no such endpoint');
      if ('methodNotAllowed' in found) {
        status = 405;
        send(
          res,
          405,
          { error: { code: 'method_not_allowed', message: 'method not allowed', requestId } },
          { ...base, Allow: found.methodNotAllowed.join(', ') },
          origin,
        );
        return;
      }
      const { def, params } = found;
      routeName = `${def.method} ${def.path}`;

      let raw = '';
      if (method !== 'GET' && method !== 'DELETE') {
        const ct = String(req.headers['content-type'] ?? '');
        if (!/^application\/json\b/i.test(ct) && Number(req.headers['content-length'] ?? 0) > 0)
          throw new ApiError('bad_request', 'content-type must be application/json');
      }
      raw = await readBody(req, def.maxBytes ?? DEFAULT_MAX_BYTES);

      const now = o.clock();
      let principal: Principal | undefined;
      if (def.auth === 'player') {
        const h = req.headers.authorization;
        if (typeof h !== 'string' || !h.startsWith('Bearer '))
          throw new ApiError('unauthenticated', 'sign in required');
        principal = await o.identity.authenticate(h.slice(7).trim());
        o.onAuthenticated?.(principal);
      } else if (def.auth === 'service') {
        verifyServiceRequest(o.matchServerSecret, now, {
          method,
          path,
          body: raw,
          timestamp: header(req, 'x-wahala-timestamp'),
          signature: header(req, 'x-wahala-signature'),
        });
      } else if (def.auth === 'admin') {
        const h = req.headers.authorization;
        if (!o.adminToken || typeof h !== 'string' || !safeEqual(h, `Bearer ${o.adminToken}`))
          throw new ApiError('unauthenticated', 'admin token required');
      }
      if (def.rate) {
        const key = `${def.rate}:${principal?.playerId ?? ip}`;
        const r = o.limiter.take(key, o.rates?.[def.rate] ?? RATES[def.rate]);
        if (!r.ok) throw new ApiError('rate_limited', 'slow down', { retryAfterMs: r.retryAfterMs });
      }

      const ctx: RouteContext = {
        req,
        params,
        query: url.searchParams,
        raw,
        json: () => {
          if (raw.trim() === '') return {};
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            throw badRequest('body is not valid JSON');
          }
        },
        ip,
        requestId,
        now,
        principal: principal as Principal,
        header: (n) => header(req, n),
      };
      const result = await requestContext.run({ requestId }, () => def.handler(ctx));
      status = result?.status ?? (result?.body === undefined ? 204 : 200);
      send(res, status, result?.body, { ...base, ...result?.headers }, origin);
    } catch (e) {
      const api = e instanceof ApiError ? e : null;
      if (!api)
        o.logger.error('unhandled error', {
          requestId,
          route: routeName,
          err: e instanceof Error ? e.message : 'unknown',
        });
      status = api?.status ?? 500;
      const extra: Record<string, string> = { ...base };
      if (api?.extra.retryAfterMs !== undefined)
        extra['Retry-After'] = String(Math.max(1, Math.ceil(api.extra.retryAfterMs / 1000)));
      send(
        res,
        status,
        {
          error: {
            code: api?.code ?? 'internal',
            message: api?.message ?? 'something went wrong',
            requestId,
            ...(api?.extra.retryAfterMs !== undefined ? { retryAfterMs: api.extra.retryAfterMs } : {}),
            ...(api?.extra.details !== undefined ? { details: api.extra.details } : {}),
          },
        },
        extra,
        origin,
      );
    } finally {
      // one line per request: route pattern (never the raw path: it can hold a code), status, duration, request id. No address, no body.
      const took = performance.now() - started;
      o.metrics.record(status, took);
      o.logger.info('request', { requestId, route: routeName, status, ms: Math.round(took) });
    }
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      try {
        res.destroy();
      } catch {
        /* already gone */
      }
    });
  });
  // slowloris and idle-connection hygiene
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;

  return {
    server,
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => resolve((server.address() as AddressInfo).port));
      }),
    drain: () => {
      o.metrics.draining = true;
    },
    close: (graceMs = 0) =>
      new Promise((resolve) => {
        o.metrics.draining = true;
        server.close(() => resolve()); // stops accepting; resolves when the last connection is gone
        server.closeIdleConnections();
        // in-flight requests get `graceMs` to finish, then whatever is left is cut
        const t = setTimeout(() => server.closeAllConnections(), graceMs);
        t.unref();
      }),
  };
}

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
