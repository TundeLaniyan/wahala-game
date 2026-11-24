/**
 * Shared helpers of the ops probes: result recording, argument parsing and access to the server package's
 * dependencies (`ws`, `@colyseus/sdk`) without adding anything to the game's own dependencies.
 *
 * The probes are BLACK-BOX: they talk to a running server over HTTP / WebSocket only and import nothing from
 * `server/src`, so they keep working whatever Architecture changes inside the server.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serverRequire = createRequire(path.join(repoRoot, 'server/package.json'));

/** `ws` (raw WebSocket client that can set an Origin header) and the Colyseus SDK, both from `server/node_modules`. */
export const WebSocket = serverRequire('ws');
export const { Client } = serverRequire('@colyseus/sdk');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `--key value` and `--flag` pairs. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/**
 * Statuses: PASS (as required), FAIL (a requirement is not met: exit code 1), GAP (a KNOWN, documented weakness that a
 * later mitigation must close: reported loudly, not a failure unless --strict), INFO (a measurement), SKIP.
 */
export class Results {
  rows = [];
  add(group, name, status, detail = '') {
    this.rows.push({ group, name, status, detail });
    const tag = status.padEnd(4);
    console.log(`${tag}  [${group}] ${name}${detail ? ` -- ${detail}` : ''}`);
  }
  pass = (group, name, detail) => this.add(group, name, 'PASS', detail);
  fail = (group, name, detail) => this.add(group, name, 'FAIL', detail);
  gap = (group, name, detail) => this.add(group, name, 'GAP', detail);
  info = (group, name, detail) => this.add(group, name, 'INFO', detail);
  skip = (group, name, detail) => this.add(group, name, 'SKIP', detail);
  /** `ok` true -> PASS, false -> FAIL. */
  check(group, name, ok, detail) {
    this.add(group, name, ok ? 'PASS' : 'FAIL', detail);
    return ok;
  }
  count(status) {
    return this.rows.filter((r) => r.status === status).length;
  }
  summary() {
    const c = (s) => this.count(s);
    return `${c('PASS')} pass, ${c('FAIL')} fail, ${c('GAP')} known gap(s), ${c('INFO')} info, ${c('SKIP')} skipped`;
  }
}

/** Opens a raw WebSocket upgrade and reports what the server answered (status code, or 'open'). */
export function upgradeStatus(wsUrl, origin) {
  return new Promise((resolve) => {
    const headers = origin === null ? {} : { Origin: origin };
    const ws = new WebSocket(wsUrl, { headers, handshakeTimeout: 5000 });
    ws.on('unexpected-response', (_req, res) => {
      resolve(res.statusCode);
      ws.terminate();
    });
    ws.on('open', () => {
      resolve('open');
      ws.terminate();
    });
    ws.on('error', (e) => resolve(`error:${e.message}`));
  });
}

export const toWs = (httpUrl) => httpUrl.replace(/^http/i, 'ws');

/** Unique-ish guest name for probe players. */
export const guest = (prefix = 'Probe') => `${prefix} ${Math.random().toString(36).slice(2, 7)}`;

/** Resolves when `room` is left (consented or not), with the close code. */
export function leftPromise(room) {
  return new Promise((resolve) => room.onLeave((code, reason) => resolve({ code, reason })));
}

/**
 * A plain TCP pass-through whose connections can all be destroyed at once: what a phone losing signal looks like to the
 * server (no close frame, close code 1006). Probe clients connect to `proxy.url`; `killAll()` cuts them.
 */
export async function killableProxy(targetHost, targetPort, { scheme = 'http', publicHost = '127.0.0.1' } = {}) {
  const { createServer, connect } = await import('node:net');
  const live = new Set();
  const server = createServer((client) => {
    const upstream = connect(targetPort, targetHost);
    live.add(client).add(upstream);
    const cut = () => {
      client.destroy();
      upstream.destroy();
      live.delete(client);
      live.delete(upstream);
    };
    client.on('error', cut).on('close', cut);
    upstream.on('error', cut).on('close', cut);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `${scheme}://${publicHost}:${server.address().port}`,
    killAll() {
      for (const s of [...live]) s.destroy();
    },
    close() {
      this.killAll();
      server.close();
    },
  };
}
