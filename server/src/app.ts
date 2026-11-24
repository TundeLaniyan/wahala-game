/**
 * Builds and starts the Colyseus server: WebSocket transport, the `rumble` room, `GET /health`, `GET /metrics`,
 * the origin policy, and graceful shutdown. `main.ts` calls it with the environment; tests call it with their own
 * config on a random port.
 */
import type { AddressInfo } from 'node:net';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MetricsRegistry } from './core/metrics';
import { createOriginPolicy } from './core/origins';
import type { OriginPolicy } from './core/origins';
import { DEFAULT_RUNTIME } from './core/options';
import type { RuntimeConfig } from './core/options';
import { createRumbleRoomClass } from './rooms/RumbleRoom';

/** The slice of the express app / request / response that the two operational routes use. */
interface HttpReq {
  headers: Record<string, string | string[] | undefined>;
}
interface HttpRes {
  json(body: unknown): void;
  status(code: number): HttpRes;
}
interface HttpApp {
  disable(setting: string): void;
  get(path: string, handler: (req: HttpReq, res: HttpRes) => void): void;
}

export interface RumbleServerOptions {
  /** 0 picks a free port (tests). Default 2567. */
  port?: number;
  host?: string;
  runtime?: RuntimeConfig;
  /** `RUMBLE_ALLOWED_ORIGINS` (comma list). */
  allowedOrigins?: string;
  /** Development defaults (localhost origins). Default: NODE_ENV is not `production`. */
  development?: boolean;
  /** Bearer token required by `GET /metrics` when set (`RUMBLE_METRICS_TOKEN`). */
  metricsToken?: string;
  /** Install SIGINT / SIGTERM handlers that shut down gracefully and exit. Default false (main.ts turns it on). */
  handleSignals?: boolean;
  log?: (message: string) => void;
}

export interface RumbleServer {
  server: Server;
  port: number;
  metrics: MetricsRegistry;
  origins: OriginPolicy;
  close(): Promise<void>;
}

export async function startRumbleServer(opts: RumbleServerOptions = {}): Promise<RumbleServer> {
  const runtime = opts.runtime ?? DEFAULT_RUNTIME;
  const development = opts.development ?? process.env.NODE_ENV !== 'production';
  const origins = createOriginPolicy(opts.allowedOrigins, development);
  const metrics = new MetricsRegistry();

  const transport = new WebSocketTransport({
    // liveness tolerance (RUMBLE_PING_INTERVAL_MS x RUMBLE_PING_MAX_RETRIES, default 3 s x 4): see RuntimeConfig
    pingInterval: runtime.pingIntervalMs,
    pingMaxRetries: runtime.pingMaxRetries,
    // Browsers always send Origin on a WebSocket upgrade; refuse the ones we do not allow.
    beforeUpgrade: (request) => {
      if (!origins.allows(request.headers.get('origin')))
        return new Response('origin not allowed', { status: 403 });
    },
  });

  // Matchmaking HTTP endpoints answer CORS only for allowed origins (the default would echo any origin).
  const controller = matchMaker.controller;
  delete (controller.DEFAULT_CORS_HEADERS as Record<string, string>)['Access-Control-Allow-Origin'];
  delete (controller.DEFAULT_CORS_HEADERS as Record<string, string>)['Access-Control-Allow-Credentials'];
  controller.getCorsHeaders = (headers: Headers): Record<string, string> => {
    const origin = headers.get('origin');
    return origin !== null && origins.allows(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {};
  };

  const server = new Server({
    transport,
    gracefullyShutdown: opts.handleSignals ?? false,
    greet: false,
    express: (app: HttpApp) => {
      app.disable('x-powered-by');
      app.get('/health', (_req, res) => {
        res.json({ ok: true });
      });
      app.get('/metrics', (req, res) => {
        if (opts.metricsToken && req.headers.authorization !== `Bearer ${opts.metricsToken}`) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        res.json(metrics.snapshot());
      });
    },
  });
  server.define('rumble', createRumbleRoomClass({ runtime, metrics, usedCodes: new Set(), log: opts.log }));

  await server.listen(opts.port ?? 2567, opts.host ?? '0.0.0.0');
  const address = transport.server?.address() as AddressInfo | null;
  const port = address?.port ?? opts.port ?? 2567;

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      try {
        await server.gracefullyShutdown(false);
      } finally {
        metrics.close();
      }
    })();
    return closing;
  };
  return { server, port, metrics, origins, close };
}
