// /metrics JSON -> Prometheus text exposition. Pure. Room ids are the server's hashed ids (never a private code).
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

export function toPrometheus(snap) {
  const L = [];
  const g = (name, help, value, labels = {}, type = 'gauge') => {
    if (!L.some((l) => l.startsWith(`# TYPE ${name} `))) {
      L.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    }
    const ls = Object.entries(labels)
      .map(([k, v]) => `${k}="${esc(v)}"`)
      .join(',');
    L.push(`${name}${ls ? `{${ls}}` : ''} ${Number.isFinite(value) ? value : 0}`);
  };
  const p = snap.process;
  g('rumble_uptime_seconds', 'Process uptime', p.uptimeSec);
  g('rumble_cpu_percent', 'CPU of one core since the previous read', p.cpuPercentSinceLastRead);
  g('rumble_rss_bytes', 'Resident set size', p.memoryUsage.rss);
  g('rumble_heap_used_bytes', 'V8 heap in use', p.memoryUsage.heapUsed);
  for (const k of ['mean', 'p50', 'p99', 'max'])
    g(
      'rumble_event_loop_delay_ms',
      'Event-loop delay beyond the 10 ms sampling floor',
      p.eventLoopDelayMs[k],
      { quantile: k },
    );
  g('rumble_rooms', 'Rooms alive', snap.rooms.length);
  for (const phase of ['lobby', 'countdown', 'playing', 'results'])
    g(
      'rumble_rooms_by_phase',
      'Rooms by lifecycle phase',
      snap.rooms.filter((r) => r.phase === phase).length,
      { phase },
    );
  g(
    'rumble_humans',
    'Human players across rooms',
    snap.rooms.reduce((n, r) => n + r.humans, 0),
  );
  g(
    'rumble_humans_connected',
    'Connected human players',
    snap.rooms.reduce((n, r) => n + r.connectedHumans, 0),
  );
  for (const r of snap.rooms) {
    const l = { room: r.id, phase: r.phase };
    g('rumble_room_ticks_dropped_total', 'Simulation ticks dropped', r.ticks.dropped, l, 'counter');
    g('rumble_room_step_ms_p99', 'Sim step p99', r.ticks.stepMs.p99, l);
    g('rumble_room_timer_lateness_ms_p99', 'Tick timer lateness p99', r.ticks.timerLatenessMs.p99, l);
    g('rumble_room_bytes_sent_total', 'Bytes sent to clients', r.net.bytesSentTotal, l, 'counter');
    g('rumble_room_kicks_total', 'Clients kicked', r.net.kicks, l, 'counter');
    g('rumble_room_drops_total', 'Connection drops of playing humans', r.net.drops, l, 'counter');
    g('rumble_room_reconnections_total', 'Successful reconnections', r.net.reconnections, l, 'counter');
    g('rumble_room_bot_takeovers_total', 'Replacement-bot takeovers', r.net.botTakeovers, l, 'counter');
  }
  return L.join('\n') + '\n';
}
