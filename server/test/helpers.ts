/** Shared helpers of the integration tests: an in-process server and a real-socket player that keeps a NetReplica. */
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { matchMaker } from '@colyseus/core';
import { Client as SdkClient } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { Room as SdkRoom } from '@colyseus/sdk';
import { canonicalHash } from '../../src/net/hash';
import { unpack } from '../../src/net/pack';
import { BUTTON, MSG } from '../../src/net/protocol';
import type {
  FramesPayload,
  KeyframePayload,
  LobbyMsg,
  NoticeMsg,
  PongMsg,
  ResultsMsg,
  WelcomeMsg,
} from '../../src/net/protocol';
import { publicState } from '../../src/net/publicState';
import { NetReplica } from '../../src/net/replica';
import type { Dir } from '../../src/sim';
import { startRumbleServer } from '../src/app';
import type { RumbleServer, RumbleServerOptions } from '../src/app';
import { DEFAULT_RUNTIME } from '../src/core/options';
import { UNLIMITED_LIMITS } from '../src/core/limits';
import type { RuntimeConfig } from '../src/core/options';
import type { RoomMetricsSnapshot } from '../src/core/metrics';
import type { RumbleMatch } from '../src/core/RumbleMatch';

/**
 * Limits for tests that are not about limits: everything in one process comes from 127.0.0.1 without a guest id, so the
 * per-player and per-address buckets and room caps are opened wide. `limits.test.ts` / `guard.test.ts` use the real defaults.
 */
export const OPEN_LIMITS = UNLIMITED_LIMITS;

export interface TestServer extends RumbleServer {
  url: string;
  http: string;
  client(): SdkClient;
}

export async function startTestServer(
  runtime: Partial<RuntimeConfig> = {},
  options: Partial<RumbleServerOptions> = {},
): Promise<TestServer> {
  const server = await startRumbleServer({
    port: 0,
    host: '127.0.0.1',
    development: true,
    log: process.env.RUMBLE_TEST_LOG ? (m) => console.log('[server]', m) : undefined,
    runtime: {
      ...DEFAULT_RUNTIME,
      fast: true,
      countdownMs: 150,
      reconnectSeconds: 5,
      limits: OPEN_LIMITS,
      ...runtime,
    },
    ...options,
  });
  const http = `http://127.0.0.1:${server.port}`;
  return { ...server, url: `ws://127.0.0.1:${server.port}`, http, client: () => new SdkClient(http) };
}

export async function until(
  what: string,
  cond: () => boolean,
  timeoutMs = 20_000,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One real WebSocket client of the room, decoding the binary protocol into a NetReplica like the game client will. */
export class TestPlayer {
  room!: SdkRoom;
  replica: NetReplica | null = null;
  welcomes: WelcomeMsg[] = [];
  lobbies: LobbyMsg[] = [];
  results: ResultsMsg[] = [];
  notices: NoticeMsg[] = [];
  pongs: PongMsg[] = [];
  keyframes = 0;
  frameMessages = 0;
  frameBytes = 0;
  /** Close code the server ended our connection with (consented / kicked / dropped for good). */
  leftWith: number | null = null;
  private seq = 0;

  constructor(readonly name: string) {}

  get lobby(): LobbyMsg | null {
    return this.lobbies.at(-1) ?? null;
  }

  get seat(): number | null {
    return this.welcomes.at(-1)?.seat ?? null;
  }

  attach(room: SdkRoom): this {
    this.room = room;
    room.onLeave((code) => {
      this.leftWith = code;
    });
    room.onMessage(MSG.welcome, (m: WelcomeMsg) => {
      this.welcomes.push(m);
      if (m.descriptor && this.replica?.descriptor.matchId !== m.descriptor.matchId) {
        this.replica = new NetReplica(m.descriptor);
      }
    });
    room.onMessage(MSG.lobby, (m: LobbyMsg) => this.lobbies.push(m));
    room.onMessage(MSG.results, (m: ResultsMsg) => {
      this.results.push(m);
      this.drain();
    });
    room.onMessage(MSG.notice, (m: NoticeMsg) => this.notices.push(m));
    room.onMessage(MSG.pong, (m: PongMsg) => this.pongs.push(m));
    room.onMessage(MSG.keyframe, (bytes: Uint8Array) => {
      this.keyframes++;
      this.replica?.loadKeyframe(unpack(inflateRawSync(bytes)) as KeyframePayload);
      this.drain();
    });
    room.onMessage(MSG.frames, (bytes: Uint8Array) => {
      this.frameMessages++;
      this.frameBytes += bytes.length;
      this.replica?.receive(unpack(inflateRawSync(bytes)) as FramesPayload);
      this.drain();
    });
    return this;
  }

  /** Applies every queued tick right away (tests do not need the 60 Hz play-out). */
  private drain(): void {
    const r = this.replica;
    if (!r) return;
    while (r.resyncReason === null && r.applyOne() !== null);
  }

  input(m: Dir | null, h = false, b = 0): void {
    this.room.send(MSG.input, { s: ++this.seq, m, h, b });
  }

  /** Hash of what this client sees now: must equal the server's `stateHash` once the final frame is applied. */
  hash(): number {
    if (!this.replica?.state) throw new Error('no replica state yet');
    return canonicalHash(publicState(this.replica.state));
  }

  async leave(): Promise<void> {
    try {
      await this.room.leave();
    } catch {
      /* already closed */
    }
  }
}

export async function create(
  server: TestServer,
  name: string,
  options: Record<string, unknown> = {},
): Promise<TestPlayer> {
  const room = await server.client().create('rumble', { name, ...options });
  return new TestPlayer(name).attach(room);
}

export async function joinById(
  server: TestServer,
  code: string,
  name: string,
  options: Record<string, unknown> = {},
): Promise<TestPlayer> {
  const room = await server.client().joinById(code, { name, ...options });
  return new TestPlayer(name).attach(room);
}

export async function joinOrCreate(
  server: TestServer,
  name: string,
  options: Record<string, unknown> = {},
): Promise<TestPlayer> {
  const room = await server.client().joinOrCreate('rumble', { name, ...options });
  return new TestPlayer(name).attach(room);
}

const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

/**
 * A match whose result depends on the seed: a tie for most eliminations at time-up goes to SUDDEN DEATH (first blast
 * after 64 s), so a match ends between ~8 s and ~80 s after it starts. Tests wait for results with this budget.
 */
export const MATCH_END_BUDGET_MS = 110_000;

/** One server per test file, every player disconnected and every room gone after each test. */
export class TestContext {
  server!: TestServer;
  private readonly players: TestPlayer[] = [];

  constructor(runtime: Partial<RuntimeConfig> = {}) {
    beforeAll(async () => {
      this.server = await startTestServer(runtime);
    });
    afterEach(async () => {
      await Promise.all(this.players.splice(0).map((p) => p.leave()));
      await until('every room disposed', () => this.server.metrics.roomCount === 0, 15_000);
    });
    afterAll(async () => {
      await this.server.close();
    });
  }

  track(p: TestPlayer): TestPlayer {
    this.players.push(p);
    return p;
  }

  /** Creates a private room, joins the others by code, starts the match and waits until everybody has a seat. */
  async privateMatch(
    names: string[],
    options: Record<string, unknown> = {},
  ): Promise<{ all: TestPlayer[]; code: string }> {
    const host = this.track(
      await create(this.server, names[0]!, {
        private: true,
        game: 'deathmatch',
        durationSec: 10,
        ...options,
      }),
    );
    const code = host.room.roomId;
    const all = [host];
    for (const name of names.slice(1)) all.push(this.track(await joinById(this.server, code, name)));
    await until('everyone sees the full lobby', () =>
      all.every((p) => p.lobby?.members.length === names.length),
    );
    host.room.send(MSG.start);
    await until('everyone has a seat and a keyframe', () =>
      all.every((p) => p.seat !== null && p.keyframes >= 1),
    );
    return { all, code };
  }

  /** The room's metrics, found by its (hashed) id: private rooms are not listed by code. */
  metricsOf(code: string): RoomMetricsSnapshot {
    const id = createHash('sha256').update(code).digest('hex').slice(0, 8);
    const hit = this.server.metrics.roomSnapshots().find((r) => r.id === id);
    if (!hit) throw new Error(`no metrics for room ${code}`);
    return hit;
  }
}

/** The live (server-side) match of a room, for assertions only. */
export function matchOf(code: string): RumbleMatch {
  const room = matchMaker.getLocalRoomById(code) as unknown as { match: RumbleMatch | null } | undefined;
  if (!room?.match) throw new Error(`room ${code} has no match`);
  return room.match;
}

/** Cuts a player's socket on the server side: the client sees an abnormal close (1006), no consented leave. */
export function dropSocket(code: string, sessionId: string): void {
  const room = matchMaker.getLocalRoomById(code)!;
  const client = room.clients.find((c) => c.sessionId === sessionId);
  (client!.ref as unknown as { terminate(): void }).terminate();
}

/** A player pressing things: moves, QUICK HANDS, generators. Seq numbers only ever increase. */
export function playRandomly(p: TestPlayer, everyMs = 90): () => void {
  let i = p.seat ?? 0;
  const timer = setInterval(() => {
    i++;
    p.input(DIRS[i % 4]!, i % 5 === 0, i % 7 === 0 ? BUTTON.place : 0);
  }, everyMs);
  return () => clearInterval(timer);
}
