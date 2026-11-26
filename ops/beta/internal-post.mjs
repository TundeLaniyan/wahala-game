// Plays the MATCH SERVER's side of the signed internal call, from INSIDE the private network (the edge never routes /internal).
//   docker compose exec -T platform node - <path> <body-base64> [ok|badsig|stale|nosig] < ops/beta/internal-post.mjs
// It reads the shared secret from the container's own /run/secrets, signs exactly as docs/PLATFORM_MATCH_HANDOFF.md section 3 specifies,
// and prints "<status> <body>". Used by the validator because the real match server does not make this call yet (Architecture).
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [, , path, bodyB64, mode = 'ok'] = process.argv;
const body = Buffer.from(bodyB64, 'base64').toString('utf8');
const secret = readFileSync('/run/secrets/match_server_secret', 'utf8').trim();
const ts = mode === 'stale' ? Date.now() - 10 * 60_000 : Date.now();
const sig = createHmac('sha256', mode === 'badsig' ? 'x'.repeat(64) : secret).update(`${ts}.POST.${path}.${body}`).digest('hex');
const headers = { 'content-type': 'application/json' };
if (mode !== 'nosig') {
  headers['x-wahala-timestamp'] = String(ts);
  headers['x-wahala-signature'] = sig;
}
const r = await fetch(`http://127.0.0.1:4567${path}`, { method: 'POST', headers, body });
console.log(r.status, await r.text());
