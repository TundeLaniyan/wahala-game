// Static-hosting guard (docs/CAMPAIGN_ARCHITECTURE.md, docs/ONLINE_INTEGRATION.md): a default production build (no WAHALA_*
// variables) must not contain any network transport for online play or voice, any trace of the online City Rumble chunk, or
// any address that points at a developer machine, a private network or a tunnel. Run after `npm run build`:
//   node scripts/check-static-build.mjs [dist]
// Exits 1 when the built output mentions a socket, WebRTC or microphone API, an online-chunk marker, a ws:// / wss:// literal,
// or a loopback / private-network / tunnel URL. The rules and their false-positive handling are in scripts/lib/staticBuildScan.mjs.
import { ONLINE_CHUNK_MARKERS, ONLINE_ENTRY_MARKERS, scanBuild } from './lib/staticBuildScan.mjs';

const dist = process.argv[2] ?? 'dist';
const problems = scanBuild(dist, {
  api: true,
  markers: [ONLINE_CHUNK_MARKERS, ONLINE_ENTRY_MARKERS],
  addresses: true,
});
if (problems.length) {
  console.error(
    'STATIC BUILD CHECK FAILED\n' +
      problems.map((p) => `${dist}/${p.file}: contains ${p.rule} ${p.sample}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  `static build check passed: no socket / WebRTC / microphone code, no online chunk markers and no endpoint or private address in ${dist}`,
);
