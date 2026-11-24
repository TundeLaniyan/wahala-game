/**
 * Entry point: `npm start` (PORT, default 2567; host 0.0.0.0, so phones on the same Wi-Fi can reach it).
 * Environment (docs/CITY_RUMBLE_ONLINE.md section 8, docs/CITY_RUMBLE_ONLINE_LOCAL.md):
 *   PORT                      listen port (default 2567)
 *   RUMBLE_ALLOWED_ORIGINS    comma list of browser origins; production: nothing is allowed unless listed
 *   RUMBLE_GRACE_SECONDS      0..60, default 5: a dropped fighter stands this long before a bot plays it
 *   RUMBLE_RECONNECT_SECONDS  default 30: the human may take back the same fighter within this window
 *   RUMBLE_DROP_POLICY        `bot` (default) | `idle`
 *   RUMBLE_METRICS_TOKEN      bearer token for GET /metrics (in production /metrics does not exist without it)
 *   RUMBLE_TRUSTED_PROXIES    IPs / CIDRs of reverse proxies whose X-Forwarded-For is believed (default none)
 *   RUMBLE_MAX_ROOMS, RUMBLE_MAX_PLAYING_ROOMS, RUMBLE_CPU_BUDGET, RUMBLE_MAX_CONNECTIONS, ...  capacity and abuse limits
 *                             (server/src/core/limits.ts, docs/ONLINE_OPS_LIMITS.md)
 *   NODE_ENV                  `production` turns the localhost development origins off, refuses RUMBLE_TEST_FAST
 */
import { networkInterfaces } from 'node:os';
import { startRumbleServer } from './app';
import { lanAddresses, lanUrls } from './core/lan';
import { installConsoleLimiter } from './core/logGuard';
import { loadRuntimeConfig } from './core/options';

// per-client errors the transport prints (an oversized frame, a refused reconnect) are rate-limited per distinct message
installConsoleLimiter();
const log = (message: string): void => console.log(`[rumble] ${message}`);

const port = Number(process.env.PORT ?? 2567);
const runtime = loadRuntimeConfig();
const running = await startRumbleServer({
  port: Number.isInteger(port) && port >= 0 && port < 65536 ? port : 2567,
  host: '0.0.0.0',
  runtime,
  allowedOrigins: process.env.RUMBLE_ALLOWED_ORIGINS,
  metricsToken: process.env.RUMBLE_METRICS_TOKEN,
  trustedProxies: process.env.RUMBLE_TRUSTED_PROXIES,
  handleSignals: true,
  log,
});
running.server.onShutdown(() => log('shut down'));
log(
  `listening on :${running.port} (origins: ${running.origins.patterns.join(', ') || 'none'}; grace ${runtime.graceSeconds}s, reconnect ${runtime.reconnectSeconds}s, drop policy ${runtime.dropPolicy}${runtime.fast ? '; TEST FAST MODE' : ''})`,
);
log(`this machine:  ws://localhost:${running.port}   health http://localhost:${running.port}/health`);
const lan = lanUrls(lanAddresses(networkInterfaces()), running.port);
if (lan.length === 0) log('no LAN address found (not on a network?): only this machine can connect');
for (const u of lan) log(`on your network: ${u.ws}   health ${u.health}`);
