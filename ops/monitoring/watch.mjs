#!/usr/bin/env node
/**
 * Alert watcher for one game server: polls GET /health and GET /metrics and raises alerts from thresholds that come
 * from the MEASURED capacity of the server (docs/ops/06-CAPACITY.md, 07-MONITORING.md). No dependencies, no agents,
 * no cloud account: output is JSON lines on stdout, plus an optional webhook (Slack / Discord / Telegram bridge /
 * ntfy.sh ...) given by ALERT_WEBHOOK_URL. The webhook URL is a secret: environment only, never a file in git.
 *
 *   RUMBLE_METRICS_TOKEN=... node ops/monitoring/watch.mjs --base http://127.0.0.1:2567 [--every 15] [--once]
 *   Options: --public https://host/health   (also probe the public edge health: catches proxy / TLS / DNS failure)
 *            --webhook-format slack|discord|plain (default plain: {"text": "..."} works for Slack-compatible hooks)
 *            --max-rooms-per-process 3        (bot-heavy rooms a process may carry; see capacity doc)
 */
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : null)).filter(Boolean),
);
const base = String(args.base ?? 'http://127.0.0.1:2567').replace(/\/$/, '');
const publicHealth = typeof args.public === 'string' ? args.public : null;
const token = process.env.RUMBLE_METRICS_TOKEN ?? '';
const every = Number(args.every ?? 15) * 1000;
const webhook = process.env.ALERT_WEBHOOK_URL ?? '';
const maxRooms = Number(args['max-rooms-per-process'] ?? 3);

/** Thresholds. Sources are in docs/ops/07-MONITORING.md. All overridable by editing here: they are policy, not code. */
export const T = {
  cpuWarn: 70, // % of one core: measured edge of the safe range is ~73 % at 3 bot-heavy rooms
  cpuCrit: 90,
  loopP99Warn: 50, // ms event-loop delay beyond the 10 ms sampling floor; one tick is 16.7 ms
  loopP99Crit: 100,
  stepP99Warn: 8, // ms per simulation step (p99); budget is 16.7
  droppedTicksWarnPerPoll: 1,
  droppedTicksCritPerPoll: 60,
  rssWarnMB: 700,
  kicksWarnPerPoll: 3, // clients disconnected for flooding / junk since the previous poll
  invalidWarnPerPoll: 100,
  resyncsWarnPerPoll: 20, // keyframes asked for: a sign of bad networks or a replication bug
  stuckPlayingSec: 12 * 60, // a match is 3 or 5 min; 12 min of "playing" is a zombie
  emptyRoomSec: 30 * 60, // a room with nobody connected for 30 min should have been disposed
  downAfterFailures: 3,
};

const state = { failures: 0, publicFailures: 0, prev: null, active: new Map(), cpuHigh: 0 };

function emit(level, key, message, data = {}) {
  const line = { at: new Date().toISOString(), level, key, message, ...data };
  console.log(JSON.stringify(line));
  if (webhook && level !== 'info') void post(`[${level.toUpperCase()}] wahala-rumble: ${message}`);
}
async function post(text) {
  try {
    const body = args['webhook-format'] === 'discord' ? { content: text } : { text };
    await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  } catch (e) {
    console.error(`webhook failed: ${e.message}`);
  }
}
/** Raises `key` once while the condition holds, and a recovery notice when it clears. */
function condition(key, bad, level, message, data) {
  const was = state.active.get(key);
  if (bad && !was) {
    state.active.set(key, level);
    emit(level, key, message, data);
  } else if (!bad && was) {
    state.active.delete(key);
    emit('info', key, `recovered: ${message}`, data);
    if (webhook) void post(`[RECOVERED] wahala-rumble: ${key}`);
  }
}

async function get(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function evaluate(m, prev) {
  const out = [];
  const p = m.process;
  const sum = (f) => m.rooms.reduce((s, r) => s + f(r), 0);
  const rssMB = p.memoryUsage.rss / 1048576;
  out.push(['cpu-crit', p.cpuPercentSinceLastRead >= T.cpuCrit, 'critical', `server CPU ${p.cpuPercentSinceLastRead}% of one core (>= ${T.cpuCrit}); ticks will drop`]);
  out.push(['cpu-warn', p.cpuPercentSinceLastRead >= T.cpuWarn && p.cpuPercentSinceLastRead < T.cpuCrit, 'warning', `server CPU ${p.cpuPercentSinceLastRead}% of one core (>= ${T.cpuWarn})`]);
  out.push(['loop-crit', p.eventLoopDelayMs.p99 >= T.loopP99Crit, 'critical', `event-loop delay p99 ${p.eventLoopDelayMs.p99} ms: every room is lagging`]);
  out.push(['loop-warn', p.eventLoopDelayMs.p99 >= T.loopP99Warn && p.eventLoopDelayMs.p99 < T.loopP99Crit, 'warning', `event-loop delay p99 ${p.eventLoopDelayMs.p99} ms`]);
  out.push(['memory', rssMB >= T.rssWarnMB, 'warning', `process memory ${Math.round(rssMB)} MB (>= ${T.rssWarnMB}); possible leak or too many rooms`]);
  out.push(['rooms-capacity', m.rooms.filter((r) => r.phase === 'playing').length > maxRooms, 'warning', `${m.rooms.filter((r) => r.phase === 'playing').length} matches running on one process (planned max ${maxRooms} bot-heavy); start another instance`]);
  const worstStep = Math.max(0, ...m.rooms.map((r) => r.ticks.stepMs.p99));
  out.push(['step-slow', worstStep >= T.stepP99Warn, 'warning', `a room's simulation step p99 is ${worstStep} ms (>= ${T.stepP99Warn}; tick budget 16.7)`]);
  for (const r of m.rooms) {
    out.push([`stuck:${r.id}`, r.phase === 'playing' && r.uptimeSec > T.stuckPlayingSec, 'warning', `room ${r.id} has been in a match for over ${Math.round(T.stuckPlayingSec / 60)} min`]);
    out.push([`empty:${r.id}`, r.connectedHumans === 0 && r.uptimeSec > T.emptyRoomSec, 'warning', `room ${r.id} has had nobody connected and is still alive after ${Math.round(T.emptyRoomSec / 60)} min`]);
  }
  if (prev) {
    const delta = (f) => Math.max(0, sum(f) - prev.sum(f));
    const dropped = delta((r) => r.ticks.dropped);
    out.push(['ticks-dropped-crit', dropped >= T.droppedTicksCritPerPoll, 'critical', `${dropped} simulation ticks dropped since the last poll (slow motion for players)`]);
    out.push(['ticks-dropped', dropped >= T.droppedTicksWarnPerPoll && dropped < T.droppedTicksCritPerPoll, 'warning', `${dropped} simulation tick(s) dropped since the last poll`]);
    out.push(['abuse-kicks', delta((r) => r.net.kicks) >= T.kicksWarnPerPoll, 'warning', `${delta((r) => r.net.kicks)} clients disconnected for flooding / junk since the last poll`]);
    out.push(['abuse-invalid', delta((r) => r.net.invalidMessages) >= T.invalidWarnPerPoll, 'warning', `${delta((r) => r.net.invalidMessages)} invalid messages since the last poll`]);
    out.push(['resyncs', delta((r) => r.net.resyncsServed) >= T.resyncsWarnPerPoll, 'warning', `${delta((r) => r.net.resyncsServed)} resyncs served since the last poll (network trouble or a replication bug)`]);
  }
  return out;
}

async function poll() {
  let metrics = null;
  try {
    await get(`${base}/health`);
    state.failures = 0;
  } catch (e) {
    state.failures++;
    condition('down', state.failures >= T.downAfterFailures, 'critical', `game server /health failed ${state.failures} times in a row (${e.message}); players cannot connect`);
  }
  if (state.failures === 0) {
    condition('down', false, 'critical', 'game server /health is failing');
    try {
      metrics = await get(`${base}/metrics`, token ? { Authorization: `Bearer ${token}` } : {});
      condition('metrics-unreadable', false, 'warning', '/metrics unreadable');
    } catch (e) {
      condition('metrics-unreadable', true, 'warning', `/metrics unreadable (${e.message}): check RUMBLE_METRICS_TOKEN`);
    }
  }
  if (publicHealth) {
    try {
      await get(publicHealth);
      state.publicFailures = 0;
    } catch {
      state.publicFailures++;
    }
    condition('edge-down', state.publicFailures >= 2, 'critical', `public health URL ${publicHealth} failing (proxy, certificate or DNS?)`);
  }
  if (metrics) {
    const sumOf = (m) => (f) => m.rooms.reduce((s, r) => s + f(r), 0);
    for (const [key, bad, level, message] of evaluate(metrics, state.prev)) condition(key, bad, level, message);
    state.prev = { sum: sumOf(metrics) };
    const humans = metrics.rooms.reduce((s, r) => s + r.connectedHumans, 0);
    emit('info', 'sample', 'sample', { rooms: metrics.rooms.length, playing: metrics.rooms.filter((r) => r.phase === 'playing').length, humans, cpu: metrics.process.cpuPercentSinceLastRead, loopP99: metrics.process.eventLoopDelayMs.p99, rssMB: Math.round(metrics.process.memoryUsage.rss / 1048576) });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await poll();
  if (!args.once) for (;;) { await new Promise((r) => setTimeout(r, every)); await poll(); }
}
