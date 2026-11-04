// Static-hosting guard (docs/CAMPAIGN_ARCHITECTURE.md): a default production build (no WAHALA_* variables) must not
// contain any network transport for online play or voice. Run after `npm run build`:  node scripts/check-static-build.mjs
// Exits 1 when the built JavaScript mentions a socket, WebRTC or microphone API, or a backend URL variable value.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const FORBIDDEN = [
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['RTCPeerConnection', /\bRTCPeerConnection\b/],
  ['getUserMedia', /\bgetUserMedia\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['wss:// endpoint', /wss?:\/\/(?!localhost)[a-z0-9.-]+/i],
];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

const problems = [];
for (const file of walk(dist)) {
  const src = readFileSync(file, 'utf8');
  for (const [name, re] of FORBIDDEN) if (re.test(src)) problems.push(`${file}: contains ${name}`);
}
if (problems.length) {
  console.error('STATIC BUILD CHECK FAILED\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`static build check passed: no socket / WebRTC / microphone code in ${dist}`);
