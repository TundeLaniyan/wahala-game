import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, healthAlert, DEFAULTS } from './rules.mjs';
import { toPrometheus } from './prom.mjs';

const room = (o = {}) => ({
  id: 'r1',
  phase: 'playing',
  humans: 2,
  connectedHumans: 2,
  uptimeSec: 60,
  ticks: { run: 3600, dropped: 0, stepMs: { p99: 5 }, broadcastMs: { p99: 1 }, timerLatenessMs: { p99: 2 } },
  net: { kicks: 0, invalidMessages: 0, drops: 0, reconnections: 0, botTakeovers: 0, bytesSentTotal: 1 },
  ...o,
});
const snap = (rooms = [room()], p = {}) => ({
  process: {
    uptimeSec: 100,
    cpuPercentSinceLastRead: 30,
    memoryUsage: { rss: 300e6, heapUsed: 50e6 },
    eventLoopDelayMs: { mean: 1, p50: 1, p99: 5, max: 9 },
    ...p,
  },
  rooms,
});
const rules = (a) => a.map((x) => `${x.level}:${x.rule}`);

test('a healthy snapshot raises nothing', () => assert.deepEqual(evaluate(snap(), snap()), []));
test('cpu and event loop thresholds', () => {
  assert.deepEqual(rules(evaluate(null, snap([room()], { cpuPercentSinceLastRead: 75 }))), ['warn:cpu']);
  assert.deepEqual(
    rules(evaluate(null, snap([room()], { cpuPercentSinceLastRead: 95, eventLoopDelayMs: { p99: 120 } }))),
    ['crit:cpu', 'crit:event-loop'],
  );
});
test('dropped ticks are measured as a delta between polls, per room', () => {
  const a = snap([room({ ticks: { ...room().ticks, dropped: 100 } })]);
  const b = snap([room({ ticks: { ...room().ticks, dropped: 103 } })]);
  assert.deepEqual(rules(evaluate(a, b)), ['warn:dropped-ticks']);
  const c = snap([room({ ticks: { ...room().ticks, dropped: 400 } })]);
  assert.deepEqual(rules(evaluate(a, c)), ['crit:dropped-ticks']);
  assert.deepEqual(evaluate(b, b), []);
});
test('a room that disappears does not make the counters negative or alert', () => {
  assert.deepEqual(evaluate(snap([room()]), snap([])), []);
});
test('room creation burst and capacity', () => {
  const many = Array.from({ length: 150 }, (_, i) => room({ id: `n${i}`, phase: 'lobby' }));
  assert.ok(rules(evaluate(snap([]), snap(many))).includes('warn:room-creation-burst'));
  const three = [1, 2, 3].map((i) => room({ id: `p${i}` }));
  assert.ok(rules(evaluate(null, snap(three))).includes('warn:capacity'));
});
test('kicks and invalid messages: abuse signal, only for rooms present in both polls', () => {
  const a = snap([room()]);
  const b = snap([room({ net: { ...room().net, kicks: 6, invalidMessages: 60 } })]);
  assert.deepEqual(rules(evaluate(a, b)), ['warn:kicks', 'warn:invalid-messages']);
});
test('stuck match, restart, memory', () => {
  assert.ok(
    rules(evaluate(null, snap([room({ uptimeSec: DEFAULTS.stuckPlayingSec + 1 })]))).includes(
      'warn:stuck-room',
    ),
  );
  assert.ok(
    rules(evaluate(snap([], { uptimeSec: 500 }), snap([], { uptimeSec: 5 }))).includes('warn:restart'),
  );
  assert.deepEqual(rules(evaluate(null, snap([], { memoryUsage: { rss: 1100e6, heapUsed: 1 } }))), [
    'crit:memory',
  ]);
});
test('thresholds are overridable', () =>
  assert.deepEqual(evaluate(null, snap([room()], { cpuPercentSinceLastRead: 75 }), { cpuWarn: 80 }), []));
test('health needs consecutive failures', () => {
  assert.deepEqual(healthAlert(1), []);
  assert.equal(healthAlert(2)[0].level, 'crit');
});
test('prometheus text: types, labels, no private code', () => {
  const t = toPrometheus(snap([room({ code: null })]));
  assert.match(t, /# TYPE rumble_room_ticks_dropped_total counter/);
  assert.match(t, /rumble_rooms_by_phase\{phase="playing"\} 1/);
  assert.match(t, /rumble_event_loop_delay_ms\{quantile="p99"\} 5/);
  assert.equal(t.endsWith('\n'), true);
});
