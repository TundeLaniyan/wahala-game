// Alert rules over two consecutive /metrics snapshots (docs/ops/MONITORING.md). Pure: no I/O, so it is unit-tested.
// Thresholds come from measurements in docs/CITY_RUMBLE_ONLINE.md section 7 (tick budget 16.7 ms; soak: event-loop p99 25 ms
// median / 118 ms worst on a CPU-contended box; 3 bot-filled rooms ~73 % of a core, 4 rooms ~94 % with dropped ticks).
// They are STARTING values for the first supervised test, to be re-fit from real data; they are not proven production SLOs.

export const DEFAULTS = {
  cpuWarn: 70,
  cpuCrit: 90, // % of ONE core (one process = one core)
  loopP99Warn: 40,
  loopP99Crit: 100, // ms beyond the 10 ms sampling floor
  stepP99Warn: 12,
  stepP99Crit: 16, // ms per 60 Hz tick (budget 16.7)
  latenessP99Warn: 20, // ms timer lateness
  droppedWarn: 1,
  droppedCrit: 60, // dropped ticks since the previous poll (60 = ~1 s of slow motion)
  rssWarnMB: 800,
  rssCritMB: 1000, // set to ~80 % / ~100 % of the container's mem_limit
  playingRoomsWarn: 2, // per process, with margin (measured edge ~3-4 bot-heavy rooms per core)
  roomsJumpWarn: 100, // new rooms between two polls: create-flood signature
  lobbyRoomsWarn: 200,
  kicksWarn: 5,
  invalidWarn: 50, // per poll window, whole process
  stuckPlayingSec: 15 * 60, // a match is <= 5 min + Sudden Death
  idleLobbySec: 60 * 60,
};

const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
const mb = (b) => Math.round(b / 1e6);

/** @returns {{level:'warn'|'crit'|'info', rule:string, message:string}[]} */
export function evaluate(prev, cur, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  const out = [];
  const add = (level, rule, message) => out.push({ level, rule, message });
  const p = cur.process;
  const rooms = cur.rooms ?? [];

  if (prev && p.uptimeSec < prev.process.uptimeSec)
    add('warn', 'restart', `the server restarted (uptime ${p.uptimeSec}s, was ${prev.process.uptimeSec}s)`);

  const cpu = p.cpuPercentSinceLastRead;
  if (cpu >= c.cpuCrit) add('crit', 'cpu', `process CPU ${cpu}% of one core`);
  else if (cpu >= c.cpuWarn) add('warn', 'cpu', `process CPU ${cpu}% of one core`);

  const loop = p.eventLoopDelayMs?.p99 ?? 0;
  if (loop >= c.loopP99Crit) add('crit', 'event-loop', `event-loop delay p99 ${loop} ms`);
  else if (loop >= c.loopP99Warn) add('warn', 'event-loop', `event-loop delay p99 ${loop} ms`);

  const rss = mb(p.memoryUsage.rss);
  if (rss >= c.rssCritMB) add('crit', 'memory', `RSS ${rss} MB`);
  else if (rss >= c.rssWarnMB) add('warn', 'memory', `RSS ${rss} MB`);

  const playing = rooms.filter((r) => r.phase === 'playing');
  if (playing.length > c.playingRoomsWarn)
    add('warn', 'capacity', `${playing.length} rooms playing on one process (limit ${c.playingRoomsWarn})`);

  for (const r of playing) {
    if (r.ticks.stepMs.p99 >= c.stepP99Crit)
      add('crit', 'tick-step', `room ${r.id}: sim step p99 ${r.ticks.stepMs.p99} ms`);
    else if (r.ticks.stepMs.p99 >= c.stepP99Warn)
      add('warn', 'tick-step', `room ${r.id}: sim step p99 ${r.ticks.stepMs.p99} ms`);
    if (r.ticks.timerLatenessMs.p99 >= c.latenessP99Warn)
      add('warn', 'timer-lateness', `room ${r.id}: timer lateness p99 ${r.ticks.timerLatenessMs.p99} ms`);
    if (r.uptimeSec > c.stuckPlayingSec)
      add('warn', 'stuck-room', `room ${r.id} has been playing for ${Math.round(r.uptimeSec / 60)} min`);
  }
  for (const r of rooms)
    if (r.phase === 'lobby' && r.uptimeSec > c.idleLobbySec)
      add('info', 'idle-lobby', `room ${r.id} idle in the lobby for ${Math.round(r.uptimeSec / 60)} min`);
  if (rooms.filter((r) => r.phase === 'lobby').length >= c.lobbyRoomsWarn)
    add('warn', 'lobby-flood', `${rooms.length} rooms open`);

  if (prev) {
    const before = new Map(prev.rooms.map((r) => [r.id, r]));
    let dropped = 0;
    for (const r of rooms) {
      const b = before.get(r.id);
      dropped += r.ticks.dropped - (b ? b.ticks.dropped : 0);
    }
    if (dropped >= c.droppedCrit)
      add(
        'crit',
        'dropped-ticks',
        `${dropped} simulation ticks dropped since the last poll (players see slow motion)`,
      );
    else if (dropped >= c.droppedWarn)
      add('warn', 'dropped-ticks', `${dropped} simulation ticks dropped since the last poll`);

    const created = rooms.filter((r) => !before.has(r.id)).length;
    if (created >= c.roomsJumpWarn)
      add('warn', 'room-creation-burst', `${created} new rooms since the last poll (create flood?)`);

    // counters are per room and vanish with the room, so compare only rooms present in both polls
    const delta = (f) =>
      sum(rooms, (r) => {
        const b = before.get(r.id);
        return b ? Math.max(0, f(r) - f(b)) : 0;
      });
    const kicks = delta((r) => r.net.kicks);
    const invalid = delta((r) => r.net.invalidMessages);
    if (kicks >= c.kicksWarn)
      add('warn', 'kicks', `${kicks} clients kicked since the last poll (flooding or malformed traffic)`);
    if (invalid >= c.invalidWarn)
      add('warn', 'invalid-messages', `${invalid} invalid messages since the last poll`);
  }
  return out;
}

/** Health is evaluated across polls: `failures` consecutive failed /health or /metrics polls. */
export function healthAlert(failures, needed = 2, lastError = '') {
  return failures >= needed
    ? [
        {
          level: 'crit',
          rule: 'down',
          message: `${failures} polls failed in a row${lastError ? ` (last: ${lastError})` : ''}`,
        },
      ]
    : [];
}
