// Alert rules for the PLAYER PLATFORM's GET /metrics (and for the backup / certificate / disk checks of the beta monitor). Pure, no I/O.
// Same shape as rules.mjs: evaluate(prev, cur) -> [{level, rule, message}]. Thresholds are STARTING values for the private beta, sized
// for the container limits in ops/beta/compose.yml (platform 384 MB), to be re-fit from real data; they are not proven SLOs.

export const PLATFORM_DEFAULTS = {
  rssWarnMB: 280,
  rssCritMB: 340,
  loopP99Warn: 100,
  loopP99Crit: 500,
  latencyP99Warn: 1000,
  errors5xxWarn: 3, // new 5xx responses since the previous poll
  rateLimitedWarn: 200, // new 429s since the previous poll: a flood or a NAT'd group in trouble
  dbWaitingWarn: 1, // requests queued for a database connection
};

export function evaluatePlatform(prev, cur, cfg = {}) {
  const c = { ...PLATFORM_DEFAULTS, ...cfg };
  const out = [];
  const add = (level, rule, message) => out.push({ level, rule, message });
  if (prev && cur.uptimeSec < prev.uptimeSec) add('warn', 'platform-restart', `the platform restarted (uptime ${cur.uptimeSec}s, was ${prev.uptimeSec}s)`);
  if (cur.requests.draining) add('crit', 'platform-draining', 'the platform is shutting down (/ready answers 503)');
  const rss = cur.process.rssMb;
  if (rss >= c.rssCritMB) add('crit', 'platform-memory', `platform RSS ${rss} MB`);
  else if (rss >= c.rssWarnMB) add('warn', 'platform-memory', `platform RSS ${rss} MB`);
  const loop = cur.eventLoop.p99Ms;
  if (loop >= c.loopP99Crit) add('crit', 'platform-event-loop', `event-loop p99 ${loop} ms`);
  else if (loop >= c.loopP99Warn) add('warn', 'platform-event-loop', `event-loop p99 ${loop} ms`);
  if (cur.latencyMs.samples >= 20 && cur.latencyMs.p99 >= c.latencyP99Warn) add('warn', 'platform-latency', `request p99 ${cur.latencyMs.p99} ms`);
  if (cur.db) {
    if (cur.db.waiting >= c.dbWaitingWarn) add('warn', 'db-pool-waiting', `${cur.db.waiting} request(s) waiting for a database connection (pool ${cur.db.total}/${cur.db.max})`);
    if (cur.db.total >= cur.db.max && cur.db.idle === 0) add('warn', 'db-pool-full', `all ${cur.db.max} database connections are busy`);
  }
  if (prev && cur.uptimeSec >= prev.uptimeSec) {
    const e5 = cur.requests.errors5xx - prev.requests.errors5xx;
    if (e5 >= c.errors5xxWarn) add('warn', 'platform-5xx', `${e5} server errors since the last poll`);
    const rl = cur.requests.rateLimited - prev.requests.rateLimited;
    if (rl >= c.rateLimitedWarn) add('warn', 'platform-rate-limited', `${rl} rate-limited responses since the last poll`);
  }
  return out;
}

/** Backup heartbeat: `lastOkAgeHours` is null when no backup has ever completed. `upHours` = how long the monitor has been running. */
export function evaluateBackup(lastOkAgeHours, upHours) {
  if (lastOkAgeHours === null) return upHours > 26 ? [{ level: 'crit', rule: 'backup', message: 'no database backup has ever completed' }] : [{ level: 'info', rule: 'backup', message: 'no backup yet (the first one runs at the scheduled hour)' }];
  if (lastOkAgeHours > 54) return [{ level: 'crit', rule: 'backup', message: `last good backup is ${Math.round(lastOkAgeHours)} hours old` }];
  if (lastOkAgeHours > 30) return [{ level: 'warn', rule: 'backup', message: `last good backup is ${Math.round(lastOkAgeHours)} hours old` }];
  return [];
}

export function evaluateCert(daysLeft) {
  if (daysLeft === null) return [];
  if (daysLeft < 7) return [{ level: 'crit', rule: 'certificate', message: `TLS certificate expires in ${Math.floor(daysLeft)} days` }];
  if (daysLeft < 21) return [{ level: 'warn', rule: 'certificate', message: `TLS certificate expires in ${Math.floor(daysLeft)} days` }];
  return [];
}

export function evaluateDisk(freeFraction) {
  if (freeFraction === null) return [];
  if (freeFraction < 0.1) return [{ level: 'crit', rule: 'disk', message: `only ${Math.round(freeFraction * 100)}% of the disk is free` }];
  if (freeFraction < 0.2) return [{ level: 'warn', rule: 'disk', message: `only ${Math.round(freeFraction * 100)}% of the disk is free` }];
  return [];
}
