/**
 * Application-level network impairment proxy for the City Rumble load harness.
 *
 * A TCP proxy (node:net) between the clients and the server. It carries both the SDK's HTTP matchmaking requests and
 * the WebSocket, byte for byte, and only decides WHEN each chunk is delivered:
 *
 *   delivery = max(previous delivery of this direction, now + oneWayDelay + jitter)      jitter ~ U(-J, +J)
 *   loss     = with probability p per chunk, that chunk is held an extra retransmission stall
 *              RTO = 200 ms + U(0,1) x RTT; order preservation (the max above) makes every later chunk of that
 *              direction wait behind it: head-of-line blocking, which is how a lost TCP segment looks to a WebSocket.
 *
 * Each direction of each connection is independent. A new connection also pays one RTT before its first uplink chunk
 * is delivered (the TCP handshake). Randomness is a seeded mulberry32 (no Math.random): the same seed and the same
 * chunk sequence give the same impairment, so runs are repeatable (the chunk sequence itself depends on timing).
 *
 * What this is NOT: there is no `tc netem` in this container (not installed, no kernel shaping), so this is an
 * emulation in user space on loopback. It models: fixed one-way latency, jitter, loss as retransmission stall with
 * HoL blocking, abrupt connection kill. It does not model: bandwidth limits or queueing delay, TCP congestion window
 * collapse / slow start after a loss, TLS handshakes, packet reordering below TCP, mobile radio state changes, NAT
 * rebinding, or loss inside the loopback stack (none). The chunks are what node reads from loopback (usually one
 * WebSocket message each), not MTU-sized packets, so "1 % loss" means 1 % of the application's socket reads.
 */
import net from 'node:net';
import type { AddressInfo } from 'node:net';

export interface ImpairProfile {
  name: string;
  /** One-way delay in ms (RTT = 2 x). */
  oneWayMs: number;
  /** Jitter amplitude in ms (uniform +-). */
  jitterMs: number;
  /** Probability per chunk that the chunk suffers a retransmission stall. */
  loss: number;
}

export const PROFILES: Record<string, ImpairProfile> = {
  clean: { name: 'clean', oneWayMs: 0, jitterMs: 0, loss: 0 },
  // Lagos -> London, ~114 ms RTT
  europe: { name: 'europe', oneWayMs: 57, jitterMs: 10, loss: 0 },
  mobile: { name: 'mobile', oneWayMs: 75, jitterMs: 30, loss: 0.01 },
  'bad-mobile': { name: 'bad-mobile', oneWayMs: 125, jitterMs: 60, loss: 0.03 },
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ProxyStats {
  connections: number;
  /** TCP payload bytes client -> server / server -> client (WebSocket framing included, TCP/IP headers not). */
  bytesUp: number;
  bytesDown: number;
  chunksUp: number;
  chunksDown: number;
  /** Chunks that suffered a retransmission stall. */
  stalls: number;
  /** Total extra delay (ms) the stalls added to their own chunk (not counting the knock-on delay of later ones). */
  stallMs: number;
  /** Extra wait (ms) over `now + oneWay` forced on chunks by ordering behind an earlier delayed chunk. */
  holMs: number;
  killed: number;
}

export interface ImpairProxy {
  port: number;
  profile: ImpairProfile;
  stats: ProxyStats;
  /** Abruptly destroys every open connection (both sides), like a radio drop: no FIN handshake, queued data lost. */
  killAll(): void;
  close(): Promise<void>;
}

interface Item {
  due: number;
  data: Buffer | null; // null = end of stream
}

/** One direction: an ordered queue drained by a single timer. */
class Lane {
  private readonly queue: Item[] = [];
  private last = 0;
  private timer: NodeJS.Timeout | null = null;
  private dead = false;

  constructor(
    private readonly to: net.Socket,
    private readonly profile: ImpairProfile,
    private readonly rand: () => number,
    private readonly stats: ProxyStats,
    private readonly dir: 'up' | 'down',
    /** Earliest delivery time of the first chunk (connection setup). */
    startAt: number,
  ) {
    this.last = startAt;
  }

  push(data: Buffer | null): void {
    if (this.dead) return;
    const p = this.profile;
    if (data !== null) {
      if (this.dir === 'up') {
        this.stats.bytesUp += data.length;
        this.stats.chunksUp++;
      } else {
        this.stats.bytesDown += data.length;
        this.stats.chunksDown++;
      }
    }
    const now = performance.now();
    if (p.oneWayMs === 0 && p.jitterMs === 0 && p.loss === 0 && this.queue.length === 0 && now >= this.last) {
      this.deliver(data);
      return;
    }
    const jitter = p.jitterMs > 0 ? (this.rand() * 2 - 1) * p.jitterMs : 0;
    let own = now + Math.max(0, p.oneWayMs + jitter);
    if (data !== null && p.loss > 0 && this.rand() < p.loss) {
      const stall = 200 + this.rand() * 2 * p.oneWayMs;
      own += stall;
      this.stats.stalls++;
      this.stats.stallMs += stall;
    }
    const due = Math.max(this.last, own);
    if (due > own) this.stats.holMs += due - own;
    this.last = due;
    this.queue.push({ due, data });
    this.arm();
  }

  private arm(): void {
    if (this.timer || this.queue.length === 0 || this.dead) return;
    const wait = Math.max(0, this.queue[0]!.due - performance.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      const now = performance.now();
      while (this.queue.length > 0 && this.queue[0]!.due <= now + 0.5) this.deliver(this.queue.shift()!.data);
      this.arm();
    }, wait);
  }

  private deliver(data: Buffer | null): void {
    if (this.dead || this.to.destroyed) return;
    if (data === null) this.to.end();
    else this.to.write(data);
  }

  kill(): void {
    this.dead = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue.length = 0;
  }
}

export async function startImpairProxy(opts: {
  targetPort: number;
  targetHost?: string;
  profile: ImpairProfile;
  seed: number;
  listenPort?: number;
}): Promise<ImpairProxy> {
  const { profile } = opts;
  const rand = mulberry32(opts.seed);
  const stats: ProxyStats = {
    connections: 0,
    bytesUp: 0,
    bytesDown: 0,
    chunksUp: 0,
    chunksDown: 0,
    stalls: 0,
    stallMs: 0,
    holMs: 0,
    killed: 0,
  };
  const open = new Set<{ a: net.Socket; b: net.Socket; lanes: Lane[] }>();

  const server = net.createServer((client) => {
    stats.connections++;
    client.setNoDelay(true);
    const upstream = net.connect(opts.targetPort, opts.targetHost ?? '127.0.0.1');
    upstream.setNoDelay(true);
    const handshake = performance.now() + 2 * profile.oneWayMs;
    const up = new Lane(upstream, profile, rand, stats, 'up', handshake);
    const down = new Lane(client, profile, rand, stats, 'down', 0);
    const conn = { a: client, b: upstream, lanes: [up, down] };
    open.add(conn);
    const teardown = (): void => {
      open.delete(conn);
      for (const l of conn.lanes) l.kill();
      client.destroy();
      upstream.destroy();
    };
    client.on('data', (d: Buffer) => up.push(d));
    upstream.on('data', (d: Buffer) => down.push(d));
    // a clean end is forwarded in order, after the data already queued; errors / hard closes tear both sides down
    client.on('end', () => up.push(null));
    upstream.on('end', () => down.push(null));
    client.on('error', teardown);
    upstream.on('error', teardown);
    client.on('close', () => {
      // let the queued tail reach the server (a polite close), then drop whatever is left
      setTimeout(teardown, 2000 + 4 * profile.oneWayMs);
    });
    upstream.on('close', () => {
      setTimeout(teardown, 2000 + 4 * profile.oneWayMs);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.listenPort ?? 0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    profile,
    stats,
    killAll() {
      for (const c of [...open]) {
        stats.killed++;
        open.delete(c);
        for (const l of c.lanes) l.kill();
        c.a.destroy();
        c.b.destroy();
      }
    },
    async close() {
      for (const c of [...open]) {
        open.delete(c);
        for (const l of c.lanes) l.kill();
        c.a.destroy();
        c.b.destroy();
      }
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
