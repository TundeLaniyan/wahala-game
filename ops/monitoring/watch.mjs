#!/usr/bin/env node
// Polls a server's /health and /metrics, applies rules.mjs, prints one JSON line per alert, optionally POSTs alerts to a webhook
// YOU choose (nothing is sent anywhere by default). Also serves Prometheus text with --prom-port.
//   node ops/monitoring/watch.mjs --url http://localhost:2567 --token $RUMBLE_METRICS_TOKEN --interval 15
//   node ops/monitoring/watch.mjs --once ...      exit 1 on any crit (cron / smoke), 0 otherwise
//   --webhook URL   POST {text, alerts} (Slack/Discord-compatible `text`) on a NEW alert; de-duplicated for 5 minutes
//   --prom-port N   serve the latest snapshot as Prometheus text on 127.0.0.1:N/metrics
import { createServer } from 'node:http';
import { evaluate, healthAlert } from './rules.mjs';
import { toPrometheus } from './prom.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const flag = (k) => process.argv.includes(`--${k}`);
const url = arg('url', 'http://localhost:2567'),
  token = arg('token', process.env.RUMBLE_METRICS_TOKEN ?? '');
const interval = Number(arg('interval', 15)) * 1000,
  webhook = arg('webhook', ''),
  promPort = Number(arg('prom-port', 0));
const cfg = JSON.parse(arg('rules', '{}'));
let prev = null,
  latest = null,
  failures = 0,
  lastError = '';
const sent = new Map();

async function poll(quiet = false) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  let cur = null,
    alerts = [];
  try {
    const h = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    if (!h.ok) throw new Error(`health ${h.status}`);
    const m = await fetch(`${url}/metrics`, { headers, signal: AbortSignal.timeout(5000) });
    if (!m.ok) throw new Error(`metrics ${m.status}`);
    cur = await m.json();
    failures = 0;
  } catch (e) {
    failures++;
    lastError = String(e.message ?? e);
    alerts = [
      ...healthAlert(failures, 2, lastError),
      ...(failures === 1 ? [{ level: 'warn', rule: 'poll-failed', message: String(e.message ?? e) }] : []),
    ];
  }
  if (cur) {
    alerts = evaluate(prev, cur, cfg);
    prev = cur;
    latest = cur;
  }
  const at = new Date().toISOString();
  if (!quiet) for (const a of alerts) console.log(JSON.stringify({ at, ...a }));
  if (!quiet && !alerts.length)
    console.log(
      JSON.stringify({
        at,
        level: 'ok',
        rooms: cur?.rooms.length ?? null,
        cpu: cur?.process.cpuPercentSinceLastRead ?? null,
      }),
    );
  if (webhook) {
    const fresh = alerts.filter((a) => a.level !== 'info' && !(sent.get(a.rule) > Date.now() - 300_000));
    if (fresh.length) {
      fresh.forEach((a) => sent.set(a.rule, Date.now()));
      await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          text: fresh.map((a) => `[${a.level}] ${a.rule}: ${a.message}`).join('\n'),
          alerts: fresh,
        }),
      }).catch(() => {});
    }
  }
  return alerts;
}

if (promPort) {
  createServer((req, res) => {
    if (req.url !== '/metrics' || !latest) {
      res.writeHead(latest ? 404 : 503).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }).end(toPrometheus(latest));
  }).listen(promPort, '127.0.0.1');
}
if (flag('once')) {
  await poll(true);
  const a = await poll(); // two polls: CPU / delta rules need a previous snapshot
  process.exit(a.some((x) => x.level === 'crit') ? 1 : 0);
}
await poll();
setInterval(poll, interval);
