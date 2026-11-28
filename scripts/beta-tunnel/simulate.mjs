/**
 * TEST ONLY: a local stand-in for Cloudflare's Quick Tunnel, used by scripts/beta-tunnel-e2e.mjs and `--simulate-tunnel`. It terminates TLS at
 * a made-up trycloudflare-style host name on port 443 (with a throw-away certificate), then forwards plain http and WebSocket upgrades to the
 * tunnel edge on 127.0.0.1:<port>, the way cloudflared does: the visitor's address in CF-Connecting-IP, https in X-Forwarded-Proto, the public
 * name kept in Host, client-supplied copies of those headers dropped. It is NOT Cloudflare: it proves everything about OUR side of the tunnel
 * (dynamic host name, origins, wss, cookies, gate, limits) and nothing about Cloudflare's network.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { join } from 'node:path';

const STRIP = new Set([
  'host',
  'cf-connecting-ip',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
  'forwarded',
]);

export async function startSimulatedTunnel({ host, port, stateDir, listenPort = 443 }) {
  const dir = join(stateDir, 'simulated-tunnel');
  mkdirSync(dir, { recursive: true });
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  const gen = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '2',
      '-subj',
      `/CN=${host}`,
      '-addext',
      `subjectAltName=DNS:${host}`,
      '-keyout',
      key,
      '-out',
      cert,
    ],
    { stdio: 'ignore' },
  );
  if (gen.status !== 0) throw new Error('openssl could not make the stand-in certificate');
  const visitor = (req) => String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  const server = https.createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const headers = {};
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      if (!STRIP.has(req.rawHeaders[i].toLowerCase())) headers[req.rawHeaders[i]] = req.rawHeaders[i + 1];
    Object.assign(headers, { host, 'CF-Connecting-IP': visitor(req), 'X-Forwarded-Proto': 'https' });
    const up = http.request({ host: '127.0.0.1', port, path: req.url, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('bad gateway');
    });
    req.pipe(up);
  });
  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(port, '127.0.0.1', () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\nHost: ${host}\r\nCF-Connecting-IP: ${visitor(req)}\r\nX-Forwarded-Proto: https\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        if (!STRIP.has(req.rawHeaders[i].toLowerCase()))
          raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      up.write(`${raw}\r\n`);
      if (head?.length) up.write(head);
      socket.pipe(up);
      up.pipe(socket);
    });
    const end = () => {
      socket.destroy();
      up.destroy();
    };
    up.on('error', end);
    socket.on('error', end);
    up.on('close', end);
    socket.on('close', end);
  });
  await new Promise((ok, bad) => server.once('error', bad).listen(listenPort, '127.0.0.1', ok));
  return { url: `https://${host}`, host, child: null, stop: () => server.close() };
}
