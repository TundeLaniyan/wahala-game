import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePlatform, evaluateBackup, evaluateCert, evaluateDisk } from './platform-rules.mjs';

const snap = (over = {}) => ({
  uptimeSec: 100,
  process: { rssMb: 120, heapUsedMb: 60, externalMb: 5 },
  eventLoop: { p50Ms: 1, p99Ms: 10, maxMs: 30 },
  db: { total: 2, idle: 2, waiting: 0, max: 10 },
  requests: { total: 50, byStatusClass: { '2xx': 50 }, rateLimited: 0, unauthenticated: 0, errors5xx: 0, draining: false },
  latencyMs: { p50: 5, p95: 20, p99: 40, samples: 50 },
  ...over,
});
const rules = (a) => a.map((x) => `${x.level}:${x.rule}`);

test('a healthy platform raises nothing', () => assert.deepEqual(evaluatePlatform(snap(), snap({ uptimeSec: 130 })), []));
test('restart, draining, memory, loop and latency', () => {
  assert.deepEqual(rules(evaluatePlatform(snap({ uptimeSec: 500 }), snap({ uptimeSec: 3 }))), ['warn:platform-restart']);
  assert.ok(rules(evaluatePlatform(null, snap({ requests: { ...snap().requests, draining: true } }))).includes('crit:platform-draining'));
  assert.ok(rules(evaluatePlatform(null, snap({ process: { rssMb: 300, heapUsedMb: 1, externalMb: 1 } }))).includes('warn:platform-memory'));
  assert.ok(rules(evaluatePlatform(null, snap({ process: { rssMb: 350, heapUsedMb: 1, externalMb: 1 } }))).includes('crit:platform-memory'));
  assert.ok(rules(evaluatePlatform(null, snap({ eventLoop: { p50Ms: 1, p99Ms: 700, maxMs: 900 } }))).includes('crit:platform-event-loop'));
  assert.ok(rules(evaluatePlatform(null, snap({ latencyMs: { p50: 5, p95: 900, p99: 2000, samples: 50 } }))).includes('warn:platform-latency'));
  // too few samples to call a p99
  assert.ok(!rules(evaluatePlatform(null, snap({ latencyMs: { p50: 5, p95: 900, p99: 2000, samples: 3 } }))).includes('warn:platform-latency'));
});
test('database pool pressure', () => {
  const r = rules(evaluatePlatform(null, snap({ db: { total: 10, idle: 0, waiting: 4, max: 10 } })));
  assert.ok(r.includes('warn:db-pool-waiting') && r.includes('warn:db-pool-full'));
});
test('deltas: 5xx and 429 bursts between polls', () => {
  const prev = snap();
  const cur = snap({ uptimeSec: 130, requests: { ...prev.requests, errors5xx: 5, rateLimited: 300 } });
  assert.deepEqual(rules(evaluatePlatform(prev, cur)).sort(), ['warn:platform-5xx', 'warn:platform-rate-limited']);
});
test('backup, certificate and disk', () => {
  assert.deepEqual(evaluateBackup(2, 100), []);
  assert.equal(evaluateBackup(40, 100)[0].level, 'warn');
  assert.equal(evaluateBackup(60, 100)[0].level, 'crit');
  assert.equal(evaluateBackup(null, 3)[0].level, 'info');
  assert.equal(evaluateBackup(null, 30)[0].level, 'crit');
  assert.deepEqual(evaluateCert(60), []);
  assert.equal(evaluateCert(10)[0].level, 'warn');
  assert.equal(evaluateCert(3)[0].level, 'crit');
  assert.deepEqual(evaluateCert(null), []);
  assert.equal(evaluateDisk(0.15)[0].level, 'warn');
  assert.equal(evaluateDisk(0.05)[0].level, 'crit');
  assert.deepEqual(evaluateDisk(0.5), []);
});
