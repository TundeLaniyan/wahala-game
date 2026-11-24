/**
 * Entry point: `npm start` (PORT, default 2567; host 0.0.0.0).
 * Environment: RUMBLE_ALLOWED_ORIGINS, RUMBLE_RECONNECT_SECONDS, RUMBLE_METRICS_TOKEN, NODE_ENV (see README in docs).
 */
import { startRumbleServer } from './app';
import { loadRuntimeConfig } from './core/options';

const log = (message: string): void => console.log(`[rumble] ${message}`);

const port = Number(process.env.PORT ?? 2567);
const runtime = loadRuntimeConfig();
const running = await startRumbleServer({
  port: Number.isInteger(port) && port >= 0 && port < 65536 ? port : 2567,
  host: '0.0.0.0',
  runtime,
  allowedOrigins: process.env.RUMBLE_ALLOWED_ORIGINS,
  metricsToken: process.env.RUMBLE_METRICS_TOKEN,
  handleSignals: true,
  log,
});
running.server.onShutdown(() => log('shut down'));
log(
  `listening on :${running.port} (origins: ${running.origins.patterns.join(', ') || 'none'}; reconnect ${runtime.reconnectSeconds}s${runtime.fast ? '; TEST FAST MODE' : ''})`,
);
