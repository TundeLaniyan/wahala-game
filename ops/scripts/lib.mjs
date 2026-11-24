// Shared helpers for the ops probes. Black-box only: speaks the public protocol, imports nothing from server/src or src/.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const serverPkg = fileURLToPath(new URL('../../server/package.json', import.meta.url));
const req = createRequire(serverPkg); // resolves @colyseus/sdk and ws from server/ (run `npm ci` in server/ once)
export const { Client } = req('@colyseus/sdk');
export const WebSocket = req('ws');

export function parseArgs(argv, defs) {
  const out = { ...defs };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const isBool = typeof defs[k] === 'boolean';
    out[k] = isBool ? true : argv[++i];
    if (typeof defs[k] === 'number') out[k] = Number(out[k]);
  }
  return out;
}

export const wsUrl = (httpUrl) => httpUrl.replace(/^http/, 'ws');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const isLocalTarget = (u) =>
  /^(https?:\/\/)(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(u);

export async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  let body = null;
  try {
    body = await r.json();
  } catch {
    /* not json */
  }
  return { status: r.status, body };
}

/** Raw WebSocket upgrade; resolves with how the server answered: {open}|{status}|{error}. */
export function upgrade(url, headers = {}, holdMs = 0) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers, handshakeTimeout: 8000 });
    let done = false;
    const end = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    ws.on('unexpected-response', (_q, res) => {
      end({ status: res.statusCode });
      ws.terminate();
    });
    ws.on('open', () => {
      end({ open: true });
      if (holdMs) setTimeout(() => ws.terminate(), holdMs);
      else ws.terminate();
    });
    ws.on('error', (e) => end({ error: e.code || e.message }));
    ws.on('close', (code) => end({ closed: code }));
  });
}

export function report(rows) {
  let failed = 0;
  for (const [status, name, detail] of rows) {
    if (status === 'FAIL') failed++;
    console.log(`${status.padEnd(5)} ${name}${detail ? ' - ' + detail : ''}`);
  }
  return failed;
}
