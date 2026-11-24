// A static server that behaves like GitHub Pages for measurement purposes (docs/MOBILE_PERFORMANCE.md):
//   - serves <dir> under /wahala-game/ (or --base)
//   - Cache-Control: max-age=600 on EVERYTHING (GitHub Pages' fixed value; hashed files are not "immutable" there)
//   - weak ETag + 304 on If-None-Match
//   - gzip only (no Brotli) for the same text-like types GitHub compresses: html, js, css, json, svg, webmanifest,
//     and model/gltf-binary (verified against the live site); NOT mp3 / woff / woff2 / webp / jpg / png
//   - --headers=custom emulates a host we control (immutable for hashed /assets, br+gzip) for the "hosting migration" comparison
// Usage: node scripts/perf/pages-server.mjs <dir> [--port 4180] [--mode pages|custom] [--base /wahala-game/]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const dir = path.resolve(args[0] ?? 'dist');
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const port = Number(opt('port', 4180));
const mode = opt('mode', 'pages');
const base = opt('base', '/wahala-game/');
// --max-age 0 emulates a visit AFTER GitHub's 10-minute window (every cached file must be revalidated with a 304)
const maxAge = Number(opt('max-age', '600'));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mp3',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.glb', '.ktx2']);
const cache = new Map(); // path+enc -> { body, etag }

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    // PAGES_LOG=<file>: one JSON line per response with the bytes this server actually wrote (also for aborted media streams)
    if (process.env.PAGES_LOG) {
      const w0 = req.socket.bytesWritten;
      const t0 = Date.now();
      res.on('close', () =>
        fs.appendFileSync(
          process.env.PAGES_LOG,
          JSON.stringify({
            t: t0,
            path: url.pathname,
            status: res.statusCode,
            method: req.method,
            range: req.headers.range ?? null,
            bytes: req.socket.bytesWritten - w0,
          }) + '\n',
        ),
      );
    }
    let rel = decodeURIComponent(url.pathname);
    if (!rel.startsWith(base)) {
      res.writeHead(404).end('not found');
      return;
    }
    rel = rel.slice(base.length) || 'index.html';
    let file = path.join(dir, rel);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, '404.html');
      if (!fs.existsSync(file)) {
        res.writeHead(404).end('not found');
        return;
      }
      res.statusCode = 404;
    }
    const ext = path.extname(file);
    const accept = String(req.headers['accept-encoding'] ?? '');
    let enc = 'identity';
    if (COMPRESS.has(ext)) {
      if (mode === 'custom' && /\bbr\b/.test(accept)) enc = 'br';
      else if (/\bgzip\b/.test(accept)) enc = 'gzip';
    }
    const key = `${file}|${enc}`;
    let ent = cache.get(key);
    if (!ent) {
      const raw = fs.readFileSync(file);
      const body =
        enc === 'gzip'
          ? // GNU gzip -6 reproduces GitHub's transfer sizes to within 0.7% (Node's bundled zlib is up to 4% larger on GLB)
            spawnSync('gzip', ['-6', '-c', '-n'], { input: raw, maxBuffer: 1 << 28 }).stdout
          : enc === 'br'
            ? zlib.brotliCompressSync(raw, {
                params: {
                  [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
                  [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
                },
              })
            : raw;
      const etag =
        (COMPRESS.has(ext) ? 'W/' : '') +
        `"${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12)}-${raw.length.toString(16)}"`;
      ent = { body, etag };
      cache.set(key, ent);
    }
    const hashed = /\/assets\/.*-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(url.pathname);
    const headers = {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      ETag: ent.etag,
      'Cache-Control':
        mode === 'custom'
          ? hashed || url.pathname.includes('/audio/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=0, must-revalidate'
          : `max-age=${maxAge}`,
      'Accept-Ranges': 'bytes',
      Vary: 'Accept-Encoding',
      'Access-Control-Allow-Origin': '*',
    };
    if (enc !== 'identity') headers['Content-Encoding'] = enc;
    if (req.headers['if-none-match'] === ent.etag) {
      res.writeHead(304, { ETag: ent.etag, 'Cache-Control': headers['Cache-Control'] });
      res.end();
      return;
    }
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (range && enc === 'identity') {
      const total = ent.body.length;
      const s = range[1] === '' ? Math.max(0, total - Number(range[2])) : Number(range[1]);
      const e = range[1] !== '' && range[2] !== '' ? Math.min(total - 1, Number(range[2])) : total - 1;
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${s}-${e}/${total}`,
        'Content-Length': e - s + 1,
      });
      res.end(ent.body.subarray(s, e + 1));
      return;
    }
    res.writeHead(res.statusCode === 404 ? 404 : 200, { ...headers, 'Content-Length': ent.body.length });
    res.end(req.method === 'HEAD' ? undefined : ent.body);
  })
  .listen(port, () => console.log(`pages-server ${mode} ${dir} -> http://localhost:${port}${base}`));
