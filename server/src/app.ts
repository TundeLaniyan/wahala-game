/**
 * Builds and starts the Colyseus server: WebSocket transport, the `rumble` room, `GET /health`, `GET /metrics`,
 * the origin policy, the admission guard (capacity and abuse limits) and graceful shutdown. `main.ts` calls it with the
 * environment; tests call it with their own config on a random port.
 *
 * Every matchmaking request passes `guardedInvoke` first (decision FU2S-C3): the client address is the TCP peer unless it
 * is a configured proxy (`clientIp.ts`), per-guest and per-address limits apply, a join by code answers with ONE error
 * whatever is wrong with the code, and the options the room sees carry only values the server stamped. Nothing a client
 * sends in a WebSocket message can open a room, so no message bypasses these limits.
 */
import { timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Server, matchMaker } from '@colyseus/core';
import { ServerError } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MetricsRegistry } from './core/metrics';
import { createOriginPolicy } from './core/origins';
import type { OriginPolicy } from './core/origins';
import { DEFAULT_RUNTIME, assertProductionSafe, parseGuestId } from './core/options';
import type { RuntimeConfig } from './core/options';
import { BusyError, Guard } from './core/guard';
import type { Matchmake } from './core/guard';
import { LoopLagSensor } from './core/loopLag';
import { ipKey, normaliseForwardedHeaders, parseTrustedProxies } from './core/clientIp';
import { PlatformLink, loadPlatformConfig } from './core/platform';
import type { PlatformConfig } from './core/platform';
import { createRumbleRoomClass, toServerError } from './rooms/RumbleRoom';
import { DEFAULT_QUICK_MODE, encodeBusy, normalizeRoomCode, parseQuickMode } from '../../src/net/protocol';

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
  /**
   * Bearer token required by `GET /metrics` (`RUMBLE_METRICS_TOKEN`). In production (`development` false) `/metrics` does
   * not exist without a token (404): there is no unauthenticated metrics endpoint to expose by accident.
   */
  metricsToken?: string;
  /** Proxies whose `X-Forwarded-For` is believed (`RUMBLE_TRUSTED_PROXIES`: IPs / CIDRs, comma separated). Default none. */
  trustedProxies?: string;
  /** Install SIGINT / SIGTERM handlers that shut down gracefully and exit. Default false (main.ts turns it on). */
  handleSignals?: boolean;
  /**
   * The optional link to the player platform (signed tickets, trusted result reporting, signal filter): `PLATFORM_*` environment
   * (`loadPlatformConfig`). Unset = guest-only, exactly as before. A ready-made `PlatformLink` may be passed (tests).
   */
  platform?: PlatformConfig | PlatformLink;
  log?: (message: string) => void;
}

export interface RumbleServer {
  server: Server;
  port: number;
  metrics: MetricsRegistry;
  origins: OriginPolicy;
  guard: Guard;
  platform: PlatformLink;
  close(): Promise<void>;
}

/** A bearer token comparison that does not leak how many leading characters matched. */
export function tokenMatches(header: string | string[] | undefined, token: string): boolean {
  if (typeof header !== 'string') return false;
  const want = Buffer.from(`Bearer ${token}`);
  const got = Buffer.from(header);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Colyseus matchmaking error codes that mean "no such room / not joinable": MATCHMAKE_INVALID_ROOM_ID, _UNHANDLED (full), _EXPIRED. */
const ROOM_SIDE_CODES: ReadonlySet<number> = new Set([522, 523, 524]);

/** What the player is told about a refused ticket (the client turns any message containing "ticket" into "your sign-in for this match expired"). */
function ticketRefusal(reason: 'invalid' | 'wrong_room' | 'replayed' | 'unavailable'): string {
  switch (reason) {
    case 'wrong_room':
      return 'ticket not valid for this room';
    case 'replayed':
      return 'ticket already used';
    case 'unavailable':
      return 'tickets are not accepted by this server: join as a guest';
    default:
      return 'invalid ticket';
  }
}

const OPEN_METHODS = ['joinOrCreate', 'create', 'joinById'] as const;

/** The one answer to every join by code that cannot be served: wrong, locked, full, started, or not a joinable room. */
const unavailable = (): ServerError =>
  new ServerError(
    404,
    encodeBusy('room_unavailable', 0, 'That room is not open. Check the code, or ask for a new one.'),
  );

export async function startRumbleServer(opts: RumbleServerOptions = {}): Promise<RumbleServer> {
  const runtime = opts.runtime ?? DEFAULT_RUNTIME;
  const development = opts.development ?? process.env.NODE_ENV !== 'production';
  assertProductionSafe(runtime, development);
  const origins = createOriginPolicy(opts.allowedOrigins, development);
  const trusted = parseTrustedProxies(opts.trustedProxies);
  const metrics = new MetricsRegistry();
  const lag = new LoopLagSensor();
  const guard = new Guard(
    runtime.limits,
    () => performance.now(),
    () => lag.read(),
  );
  const log = opts.log;
  const platform =
    opts.platform instanceof PlatformLink
      ? opts.platform
      : new PlatformLink(opts.platform ?? loadPlatformConfig(), { log });

  const transport = new WebSocketTransport({
    // liveness tolerance (RUMBLE_PING_INTERVAL_MS x RUMBLE_PING_MAX_RETRIES, default 3 s x 4): see RuntimeConfig
    pingInterval: runtime.pingIntervalMs,
    pingMaxRetries: runtime.pingMaxRetries,
    // Browsers always send Origin on a WebSocket upgrade; refuse the ones we do not allow. Upgrades are also counted per
    // address (a generous ceiling: the real limits are on rooms, joins and connections).
    beforeUpgrade: (request, context) => {
      if (!origins.allows(request.headers.get('origin')))
        return new Response('origin not allowed', { status: 403 });
      try {
        guard.checkUpgrade(ipKey(context.ip ?? 'unknown'));
      } catch (e) {
        if (e instanceof BusyError)
          return new Response('too many connections', {
            status: 429,
            headers: { 'retry-after': String(e.retryAfterSec) },
          });
        throw e;
      }
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
  // Only what the game uses is reachable: no `join` (join an existing room without creating). The browser reconnects over
  // its WebSocket (room id + session id + reconnection token: two 54-bit secrets), which is the only reconnection door in
  // production; the HTTP `reconnect` (a single 54-bit token) exists only in development for the SDK's manual reconnect and
  // the load harness, and even there it answers one way whatever is wrong and its failures are throttled.
  controller.exposedMethods = development ? [...OPEN_METHODS, 'reconnect'] : [...OPEN_METHODS];
  const original = originalInvoke(controller);
  controller.invokeMethod = async (method, roomName, clientOptions, authOptions) =>
    guardedInvoke(original, method, roomName, clientOptions, authOptions);

  async function guardedInvoke(
    invoke: typeof original,
    method: string,
    roomName: string,
    clientOptions: unknown,
    auth: { ip?: string } | undefined,
  ): Promise<unknown> {
    const raw =
      typeof clientOptions === 'object' && clientOptions !== null && !Array.isArray(clientOptions)
        ? (clientOptions as Record<string, unknown>)
        : {};
    // server-internal call (no HTTP request): exempt from the per-client limits, not from the global caps
    const internal = auth === undefined;
    const ip = ipKey(auth?.ip ?? 'unknown');
    const who = { ip, gid: parseGuestId(raw.gid), internal };
    const kind = method as Matchmake;
    // what the room sees: the client's own fields, minus anything reserved (`_...`), plus what the server stamps
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) if (!k.startsWith('_')) clean[k] = v;
    clean._who = { ip, gid: who.gid };
    // a platform ticket is checked HERE, once, and only the verified result (`_acct`, server-stamped) reaches the room; the raw
    // ticket never does
    const ticket = clean.ticket;
    delete clean.ticket;
    const mode = parseQuickMode(raw.mode);
    if (raw.mode !== undefined && raw.mode !== null && mode === null)
      throw new ServerError(400, 'unknown mode');
    clean.mode = mode ?? DEFAULT_QUICK_MODE; // no mode (an older client) means Free-for-All, never a guess
    if (method === 'joinOrCreate') clean.private = false; // quick play is public matchmaking; private rooms use `create`
    try {
      guard.checkMatchmake(kind, who);
      // hosted private beta: nothing from the network gets a seat without a platform ticket (the platform only issues them to
      // invited accounts). A reconnection is not matchmaking: it presents a seat this server itself reserved.
      if (
        platform.cfg.requireTicket &&
        !internal &&
        method !== 'reconnect' &&
        (ticket === undefined || ticket === null)
      ) {
        guard.joinFailed(who);
        throw new ServerError(
          403,
          method === 'joinOrCreate'
            ? 'quick play is closed in the private beta: use your party to start a private match'
            : 'this server admits invited players only: sign in through the beta page',
        );
      }
      if (ticket !== undefined && ticket !== null) {
        // tickets are for private rooms: a creation (host ticket) or a join by code (a ticket for THAT room); never quick play
        if (method === 'joinOrCreate')
          throw new ServerError(403, 'tickets are not used for quick play: join without one');
        const code = method === 'joinById' ? normalizeRoomCode(roomName) : null;
        if (method === 'joinById' && !code) {
          guard.joinFailed(who);
          throw unavailable();
        }
        const t = await platform.verifyTicket(ticket, code);
        if (!t.ok) {
          if (method === 'joinById') guard.joinFailed(who);
          throw new ServerError(403, ticketRefusal(t.reason));
        }
        clean._acct = t.who;
      }
      let target = roomName;
      if (method === 'joinById') {
        const code = normalizeRoomCode(roomName);
        const room = code ? await matchMaker.getRoomById(code) : undefined;
        // a public room is only reachable through quick play (by mode); a private one only by its code, while open
        if (!code || !room || room.locked || room.private !== true) {
          guard.joinFailed(who);
          throw unavailable();
        }
        target = code;
      } else if (method === 'joinOrCreate') {
        const hit = await matchMaker.findOneRoomAvailable(roomName, clean);
        if (!hit) guard.checkCreate(who); // quick play found no room: it is about to open one
      }
      return await invoke(method, target, clean, auth as never);
    } catch (e) {
      if (e instanceof BusyError) throw toServerError(e);
      if (method === 'reconnect' && !(e instanceof ServerError && (e.code === 429 || e.code === 503))) {
        guard.joinFailed(who);
        throw new ServerError(
          404,
          encodeBusy(
            'room_unavailable',
            0,
            'That seat is not held any more: the time to come back has ended.',
          ),
        );
      }
      // a join by code that fails because of the ROOM (gone, locked, full: Colyseus codes 522-524) answers like any other
      // bad code; a failure about the JOINER (a bad name: code 526) is theirs to be told
      if (method === 'joinById' && e instanceof ServerError && ROOM_SIDE_CODES.has(e.code)) {
        guard.joinFailed(who);
        throw unavailable();
      }
      throw e;
    }
  }

  const server = new Server({
    transport,
    gracefullyShutdown: opts.handleSignals ?? false,
    greet: false,
    express: (app: HttpApp) => {
      app.disable('x-powered-by');
      app.get('/health', (_req, res) => {
        res.json({ ok: true });
      });
      // `/metrics` lists room load and process internals: it needs the bearer token. In production without a token it
      // is not served at all (404), so forgetting the token can never publish it.
      if (opts.metricsToken || development) {
        app.get('/metrics', (req, res) => {
          if (opts.metricsToken && !tokenMatches(req.headers.authorization, opts.metricsToken)) {
            res.status(401).json({ error: 'unauthorized' });
            return;
          }
          res.json({ ...metrics.snapshot(), limits: guard.snapshot() });
        });
      }
    },
  });
  server
    .define('rumble', createRumbleRoomClass({ runtime, metrics, guard, platform, usedCodes: new Set(), log }))
    .filterBy(['mode']);

  await server.listen(opts.port ?? 2567, opts.host ?? '0.0.0.0');
  const address = transport.server?.address() as AddressInfo | null;
  const port = address?.port ?? opts.port ?? 2567;

  // The address a request comes from: the TCP peer, or X-Forwarded-For when (and only when) the peer is a trusted proxy.
  // Colyseus reads these headers itself for `AuthContext.ip`, so they are rewritten to the one trusted answer first.
  const httpServer = transport.server;
  if (httpServer) {
    httpServer.prependListener('request', (req) => void normaliseForwardedHeaders(req, trusted));
    httpServer.prependListener('upgrade', (req) => void normaliseForwardedHeaders(req, trusted));
  }

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      try {
        await server.gracefullyShutdown(false);
      } finally {
        lag.stop();
        metrics.close();
      }
    })();
    return closing;
  };
  return { server, port, metrics, origins, guard, platform, close };
}

type Invoke = (
  method: string,
  roomName: string,
  clientOptions: Record<string, unknown>,
  authOptions?: never,
) => Promise<unknown>;

let capturedInvoke: Invoke | null = null;
/** Colyseus' own `invokeMethod`, captured once (a second server in the same process must not wrap the first one's wrapper). */
function originalInvoke(controller: typeof matchMaker.controller): Invoke {
  capturedInvoke ??= controller.invokeMethod.bind(controller) as unknown as Invoke;
  return capturedInvoke;
}
