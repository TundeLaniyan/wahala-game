#!/usr/bin/env node
// Functional smoke test of a running City Rumble server or edge. Safe against any target you own: a handful of requests.
//   node ops/scripts/smoke.mjs --url http://localhost:2567 --origin https://tundelaniyan.github.io
//   NODE_EXTRA_CA_CERTS=ops/edge/certs/fullchain.pem node ops/scripts/smoke.mjs --url https://localhost:8443 --metrics hidden
// --metrics open|protected|hidden  what /metrics must look like from OUTSIDE (default protected; behind ops/edge: hidden)
// --metrics-token T                a token to check the authenticated path (only meaningful when protected)
// Exit code 1 when any check FAILs. Evidence ladder: this proves the wiring, not capacity or phone behaviour.
import { Client, parseArgs, wsUrl, getJson, upgrade, report, sleep } from './lib.mjs';

const o = parseArgs(process.argv.slice(2), {
  url: 'http://localhost:2567',
  origin: 'https://tundelaniyan.github.io',
  metrics: 'protected',
  'metrics-token': '',
});
const rows = [];
const add = (s, n, d) => rows.push([s, n, d]);
const ws = wsUrl(o.url);

// 1 health
try {
  const h = await getJson(`${o.url}/health`);
  if (h.status === 200 && h.body?.ok === true) add('PASS', 'GET /health', 'ok:true');
  else add('FAIL', 'GET /health', `HTTP ${h.status}`);
} catch (e) {
  add('FAIL', 'GET /health', e.cause?.code || e.message);
}

// 2 /metrics exposure from outside
try {
  const m = await getJson(`${o.url}/metrics`);
  const seen =
    m.status === 200
      ? 'open'
      : m.status === 401
        ? 'protected'
        : [403, 404].includes(m.status)
          ? 'hidden'
          : `HTTP ${m.status}`;
  add(
    seen === o.metrics ? 'PASS' : 'FAIL',
    '/metrics exposure',
    `without a token: ${seen} (expected ${o.metrics})`,
  );
  if (o['metrics-token'] && o.metrics === 'protected') {
    const a = await getJson(`${o.url}/metrics`, { authorization: `Bearer ${o['metrics-token']}` });
    add(
      a.status === 200 && Array.isArray(a.body?.rooms) ? 'PASS' : 'FAIL',
      '/metrics with the token',
      `HTTP ${a.status}`,
    );
  }
} catch (e) {
  add('FAIL', '/metrics exposure', e.cause?.code || e.message);
}

// 3 origin policy on the WebSocket upgrade (a browser always sends Origin)
const bad = await upgrade(`${ws}/nopid/noroom`, { Origin: 'https://evil.example' });
add(
  bad.status === 403 ? 'PASS' : 'FAIL',
  'upgrade from a disallowed Origin',
  bad.status ? `HTTP ${bad.status}` : JSON.stringify(bad),
);
const good = await upgrade(`${ws}/nopid/noroom`, { Origin: o.origin });
add(
  good.status !== 403 ? 'PASS' : 'FAIL',
  'upgrade from the allowed Origin is not 403',
  good.status ? `HTTP ${good.status}` : JSON.stringify(good),
);
const none = await upgrade(`${ws}/nopid/noroom`, {});
add(
  'INFO',
  'upgrade with NO Origin header (scripts, curl)',
  `${none.status ?? JSON.stringify(none)}: the Origin check cannot stop non-browser abuse, only the edge limits can`,
);

// 4 full create / join / lobby / leave flow over the real protocol
const rooms = [];
try {
  const client = new Client(o.url);
  const a = await client.create('rumble', { private: true, name: 'SmokeA' });
  a.onMessage('*', () => {}); // the SDK warns about message types nobody registered (welcome, keyframes ...)
  rooms.push(a);
  const lobbies = [];
  a.onMessage('lobby', (m) => lobbies.push(m));
  const b = await new Client(o.url).joinById(a.roomId, { name: 'SmokeB' });
  b.onMessage('*', () => {});
  rooms.push(b);
  for (let i = 0; i < 30 && !(lobbies.at(-1)?.members?.length >= 2); i++) await sleep(100);
  const n = lobbies.at(-1)?.members?.length ?? 0;
  add(
    n === 2 ? 'PASS' : 'FAIL',
    'create private room, second guest joins by code',
    `${n} members in the lobby (room code length ${a.roomId.length})`,
  );

  // 5 name abuse is refused over the real transport
  const names = ['BOT Emeka', 'Ada‮gnp', '', 'x'.repeat(5000), 'Bоt'];
  let leaked = 0;
  for (const name of names) {
    try {
      rooms.push(await new Client(o.url).joinById(a.roomId, { name }));
      leaked++;
    } catch {
      /* refused: good */
    }
  }
  add(
    leaked === 0 ? 'PASS' : 'FAIL',
    'abusive guest names are refused',
    `${names.length - leaked}/${names.length} refused`,
  );

  // 6 reconnection tokens cannot be guessed or borrowed
  let accepted = 0;
  for (const t of ['x'.repeat(40), a.roomId, a.sessionId, `${a.roomId}:${a.sessionId}`, 'null']) {
    try {
      rooms.push(await new Client(o.url).reconnect(t));
      accepted++;
    } catch {
      /* refused: good */
    }
  }
  add(
    accepted === 0 ? 'PASS' : 'FAIL',
    'forged reconnection tokens are refused',
    `${5 - accepted}/5 refused`,
  );
} catch (e) {
  add('FAIL', 'create / join flow', e.message ?? String(e));
}
for (const r of rooms) {
  try {
    await r.leave();
  } catch {
    /* already gone */
  }
}
await sleep(300);

const failed = report(rows);
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
