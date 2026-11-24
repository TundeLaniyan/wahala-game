/** Real-process graceful shutdown check: SIGTERM the server with a connected client; report close code + exit code. */
import { spawn } from 'node:child_process';
import { Client } from '@colyseus/sdk';

const PORT = 2599;
const child = spawn('../node_modules/.bin/tsx', ['src/main.ts'], {
  env: { ...process.env, PORT: String(PORT), RUMBLE_ALLOWED_ORIGINS: 'http://127.0.0.1:1' },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));
const exited = new Promise<{ code: number | null; signal: string | null }>((r) =>
  child.on('exit', (code, signal) => r({ code, signal })),
);
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break;
  } catch {
    /* not up */
  }
  await new Promise((r) => setTimeout(r, 200));
}
const client = new Client(`http://127.0.0.1:${PORT}`);
const room = await client.create('rumble', { name: 'Shutdown Tester', private: true });
const closed = new Promise<number>((r) => room.onLeave((code) => r(code)));
const t0 = Date.now();
process.kill(child.pid!, 'SIGTERM');
const code = await Promise.race([closed, new Promise<number>((r) => setTimeout(() => r(-1), 15000))]);
const ex = await Promise.race([exited, new Promise<null>((r) => setTimeout(() => r(null), 15000))]);
console.log(JSON.stringify({ clientCloseCode: code, exit: ex, ms: Date.now() - t0 }));
if (ex === null) process.kill(-child.pid!, 'SIGKILL');
console.log(out.split('\n').slice(-6).join('\n'));
process.exit(0);
