// Private-beta monitor: runs INSIDE the compose network, polls the services that are not reachable from outside, writes one JSON line
// per poll (alerts or an ok summary) and, if BETA_ALERT_WEBHOOK is set, POSTs NEW alerts (Slack/Discord-compatible `text`).
// It reuses the proven match-server rules (ops/monitoring/rules.mjs) and adds the platform, backup, certificate and disk rules.
// Nothing here changes anything: it only reads. Secrets are read from /run/secrets files, never printed.
import { readFileSync, statSync, statfsSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { evaluate as evaluateRumble, healthAlert } from '/opt/monitoring/rules.mjs';
import { evaluatePlatform, evaluateBackup, evaluateCert, evaluateDisk } from '/opt/monitoring/platform-rules.mjs';

const env = (k, d = '') => process.env[k] ?? d;
const secret = (name) => {
  try {
    return readFileSync(`/run/secrets/${name}`, 'utf8').trim();
  } catch {
    return '';
  }
};
const RUMBLE = env('RUMBLE_URL', 'http://rumble:2567');
const PLATFORM = env('PLATFORM_URL', 'http://platform:4567');
const BACKUP_DIR = env('BACKUP_DIR', '/backups');
const CERT_FILE = env('CERT_FILE', '');
const POLL = Number(env('POLL_SECONDS', '30')) * 1000;
const WEBHOOK = env('BETA_ALERT_WEBHOOK');
const rumbleToken = secret('rumble_metrics_token');
const platformToken = secret('platform_metrics_token');
const started = Date.now();
const sent = new Map();
let prevRumble = null;
let prevPlatform = null;
let rumbleFails = 0;
let platformFails = 0;

const get = async (url, token) => {
  const r = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`${url.replace(/^https?:\/\/[^/]+/, '')} answered ${r.status}`);
  return r.json();
};

async function poll() {
  const alerts = [];
  let rumbleRooms = null;
  try {
    await get(`${RUMBLE}/health`);
    const m = await get(`${RUMBLE}/metrics`, rumbleToken);
    rumbleFails = 0;
    alerts.push(...evaluateRumble(prevRumble, m));
    prevRumble = m;
    rumbleRooms = m.rooms.length;
  } catch (e) {
    rumbleFails++;
    alerts.push(...healthAlert(rumbleFails, 2, `match server: ${e.message}`));
  }
  let platformReqs = null;
  try {
    await get(`${PLATFORM}/ready`);
    const m = await get(`${PLATFORM}/metrics`, platformToken);
    platformFails = 0;
    alerts.push(...evaluatePlatform(prevPlatform, m));
    prevPlatform = m;
    platformReqs = m.requests.total;
  } catch (e) {
    platformFails++;
    alerts.push(...healthAlert(platformFails, 2, `platform: ${e.message}`).map((a) => ({ ...a, rule: 'platform-down' })));
  }
  try {
    const age = (Date.now() - statSync(`${BACKUP_DIR}/.last-ok`).mtimeMs) / 3_600_000;
    alerts.push(...evaluateBackup(age, (Date.now() - started) / 3_600_000));
  } catch {
    alerts.push(...evaluateBackup(null, (Date.now() - started) / 3_600_000));
  }
  try {
    if (CERT_FILE) alerts.push(...evaluateCert((new Date(new X509Certificate(readFileSync(CERT_FILE)).validTo).getTime() - Date.now()) / 86_400_000));
  } catch {
    alerts.push({ level: 'warn', rule: 'certificate', message: 'the TLS certificate file cannot be read' });
  }
  try {
    const s = statfsSync(BACKUP_DIR);
    alerts.push(...evaluateDisk(s.bavail / s.blocks));
  } catch {
    /* no disk information is not an alert */
  }
  const at = new Date().toISOString();
  for (const a of alerts) console.log(JSON.stringify({ at, ...a }));
  if (!alerts.length) console.log(JSON.stringify({ at, level: 'ok', rooms: rumbleRooms, platformRequests: platformReqs }));
  const fresh = alerts.filter((a) => a.level !== 'info' && !(sent.get(a.rule) > Date.now() - 300_000));
  if (WEBHOOK && fresh.length) {
    fresh.forEach((a) => sent.set(a.rule, Date.now()));
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ text: fresh.map((a) => `[${a.level}] ${a.rule}: ${a.message}`).join('\n'), alerts: fresh }),
    }).catch(() => {});
  }
}

process.on('SIGTERM', () => process.exit(0));
await poll();
setInterval(() => void poll(), POLL);
