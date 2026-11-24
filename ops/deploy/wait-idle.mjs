#!/usr/bin/env node
/**
 * Deploy helper: waits until no match is running on the server, so a restart does not cut players off mid-match.
 * The server keeps no state on disk by design, so a restart ends every running match (players return to the menu).
 *
 *   RUMBLE_METRICS_TOKEN=... node ops/deploy/wait-idle.mjs --base http://127.0.0.1:2567 [--timeout 900]
 * Exit 0 = idle (safe to restart), 1 = still busy at the timeout, 2 = server unreachable.
 */
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean));
const base = String(args.base ?? 'http://127.0.0.1:2567').replace(/\/$/, '');
const headers = process.env.RUMBLE_METRICS_TOKEN ? { Authorization: `Bearer ${process.env.RUMBLE_METRICS_TOKEN}` } : {};
const deadline = Date.now() + Number(args.timeout ?? 900) * 1000;
for (;;) {
  let rooms;
  try {
    rooms = (await (await fetch(`${base}/metrics`, { headers, signal: AbortSignal.timeout(4000) })).json()).rooms;
  } catch (e) {
    console.error(`server unreachable: ${e.message}`);
    process.exit(2);
  }
  const busy = rooms.filter((r) => r.phase === 'playing' || r.phase === 'countdown');
  console.log(`${new Date().toISOString()} ${rooms.length} room(s), ${busy.length} in a match`);
  if (busy.length === 0) process.exit(0);
  if (Date.now() > deadline) process.exit(1);
  await new Promise((r) => setTimeout(r, 10_000));
}
