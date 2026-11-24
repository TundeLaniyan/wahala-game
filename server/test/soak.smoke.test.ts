/**
 * A short (about 45 s) run of the real memory soak (`npm run soak`, bench/soak.ts): the real server process with
 * `--expose-gc`, light WebSocket clients creating, playing, dropping, reconnecting, ending, rematching and tearing down
 * rooms full of bots. It does not try to prove "no slow leak" (that needs the 5-minute soak, docs/CITY_RUMBLE_ONLINE.md);
 * it catches the regressions that show at once: a room object that survives its disposal, a timer or socket that
 * outlives its room, rooms or clients still registered after everybody left, client errors, failed cycles.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVER_DIR = path.resolve(__dirname, '..');
const TSX = path.resolve(SERVER_DIR, '..', 'node_modules', '.bin', 'tsx');

describe('soak smoke (real server process, short run)', () => {
  it('rooms are created and fully torn down: none retained after GC, no leftover timers / sockets / clients, no failed cycle', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'soak-smoke-'));
    const out = path.join(dir, 'summary.json');
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          TSX,
          [
            'bench/soak.ts',
            '--duration',
            '22',
            '--rooms',
            '2',
            '--long',
            '0',
            '--warmup-sec',
            '6',
            '--sample-sec',
            '3',
            '--gc-sec',
            '6',
            '--cycle-sec',
            '5',
            '--label',
            'smoke',
            '--out',
            out,
          ],
          { cwd: SERVER_DIR, timeout: 110_000, maxBuffer: 16 * 1024 * 1024 },
          (error, stdout, stderr) =>
            error ? reject(new Error(`${error.message}\n${stdout}\n${stderr}`)) : resolve(),
        );
      });
      const s = JSON.parse(readFileSync(out, 'utf8'));
      expect(s.counters.cycleFailures).toBe(0);
      expect(s.counters.clientErrors).toBe(0);
      expect(s.counters.cyclesFinished).toBeGreaterThanOrEqual(4);
      expect(s.counters.forcedEnds).toBeGreaterThanOrEqual(1); // the results / finish path ran
      expect(s.counters.drops).toBeGreaterThanOrEqual(1); // and a drop + takeover / reconnection
      // every room that was created is gone, and no object of a disposed room survives a full GC
      expect(s.rooms.created).toBeGreaterThanOrEqual(4);
      expect(s.rooms.disposed).toBe(s.rooms.created);
      expect(s.rooms.liveAtEnd).toBe(0);
      expect(s.rooms.registeredInMetricsAtEnd).toBe(0);
      expect(s.rooms.clientsAtEnd).toBe(0);
      expect(s.rooms.retainedAfterGc).toBe(0);
      // nothing the rooms started is still running: the same handles as the empty server had
      const base = s.activeResourcesBaseline as Record<string, number>;
      const end = s.activeResourcesEnd as Record<string, number>;
      for (const kind of new Set([...Object.keys(base), ...Object.keys(end)])) {
        expect(end[kind] ?? 0, `active ${kind}`).toBeLessThanOrEqual(
          (base[kind] ?? 0) + (kind === 'Timeout' ? 2 : 0),
        );
      }
      // a gross heap check only (the trend belongs to the long soak): after teardown the heap is near the empty server's
      expect(s.postGcHeapMB.afterTeardown).toBeLessThan(s.postGcHeapMB.baselineEmpty + 40);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
