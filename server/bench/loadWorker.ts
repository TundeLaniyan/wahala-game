/**
 * Child process of the load harness: hosts a share of the clients so their CPU stays away from the server process.
 * Controlled by the orchestrator (`load.ts`) over IPC; also reports its own event-loop delay (a saturated client
 * process would distort every latency number, so the orchestrator checks it).
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { LoadClient } from './loadClient';
import type { ClientRecord, ClientSpec } from './loadClient';

type Command =
  | { id: number; cmd: 'connect'; spec: ClientSpec; code?: string }
  | { id: number; cmd: 'start'; index: number }
  | { id: number; cmd: 'watch'; seat: number; fromTick: number }
  | { id: number; cmd: 'collect' }
  | { id: number; cmd: 'exit' };

const clients = new Map<number, LoadClient>();
const loopDelay = monitorEventLoopDelay({ resolution: 5 });
loopDelay.enable();
const cpu0 = process.cpuUsage();
const t0 = performance.now();

const reply = (id: number, body: Record<string, unknown>): void => {
  process.send?.({ id, ...body });
};

process.on('message', (raw: Command) => {
  void (async () => {
    try {
      if (raw.cmd === 'connect') {
        const c = new LoadClient(raw.spec);
        clients.set(raw.spec.index, c);
        c.started.then(() => process.send?.({ evt: 'started', index: raw.spec.index, seat: c.rec.seat }));
        c.finished.then(() => process.send?.({ evt: 'finished', index: raw.spec.index }));
        const code = await c.connect(raw.code);
        reply(raw.id, { ok: true, code });
      } else if (raw.cmd === 'start') {
        clients.get(raw.index)!.start();
        reply(raw.id, { ok: true });
      } else if (raw.cmd === 'watch') {
        for (const c of clients.values()) c.setWatch(raw.seat, raw.fromTick);
        reply(raw.id, { ok: true });
      } else if (raw.cmd === 'collect') {
        const records: ClientRecord[] = [];
        for (const c of clients.values()) records.push(await c.shutdown());
        const cpu = process.cpuUsage(cpu0);
        const wallMs = performance.now() - t0;
        const ms = (ns: number): number => Math.round((ns / 1e6 - 5) * 100) / 100;
        reply(raw.id, {
          ok: true,
          records,
          process: {
            clients: clients.size,
            cpuPercent: Math.round(((cpu.user + cpu.system) / 1000 / wallMs) * 1000) / 10,
            loopDelayMs: {
              mean: Math.max(0, ms(loopDelay.mean)),
              p99: Math.max(0, ms(loopDelay.percentile(99))),
              max: Math.max(0, ms(loopDelay.max)),
            },
          },
        });
      } else if (raw.cmd === 'exit') {
        reply(raw.id, { ok: true });
        setTimeout(() => process.exit(0), 50);
      }
    } catch (e) {
      reply(raw.id, { ok: false, error: String(e instanceof Error ? (e.stack ?? e.message) : e) });
    }
  })();
});
process.send?.({ evt: 'ready' });
