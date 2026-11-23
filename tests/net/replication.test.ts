import { describe, expect, it } from 'vitest';
import type { RumbleMatch } from '../../server/src/core/RumbleMatch';
import { canonicalHash } from '../../src/net/hash';
import { pack, unpack } from '../../src/net/pack';
import { BUTTON, validateInput } from '../../src/net/protocol';
import type { InputMsg } from '../../src/net/protocol';
import { publicState } from '../../src/net/publicState';
import type { NetReplica } from '../../src/net/replica';
import { matchResultFrom } from '../../src/progression/matchResult';
import { rankPlayers } from '../../src/sim';
import { decodeFrames, driveHumans, makeMatch, makeReplica, runMatch, wireKeyframe } from './helpers';

const SECRET = ['seed', 'rngState', 'hidden', 'config'];

function drain(r: NetReplica): void {
  while (r.applyOne() !== null);
}

function feed(replicas: NetReplica[], bytes: Uint8Array): void {
  const payload = decodeFrames(bytes);
  for (const r of replicas) {
    r.receive(payload);
    drain(r);
  }
}

const replicaHash = (r: NetReplica): number => canonicalHash(publicState(r.state!));

/** Runs the match, feeding every flush to the replicas and checking they equal the server at every flush. */
function runAndCompare(m: RumbleMatch, replicas: NetReplica[], ticks: number, startTick = 0): void {
  runMatch(m, ticks, {
    startTick,
    onFlush: (bytes, t) => {
      feed(replicas, bytes);
      if (t % 10 === 0) {
        for (const r of replicas) {
          expect(r.tick).toBe(m.state.tick);
          expect(replicaHash(r), `tick ${t}`).toBe(m.mirrorHash());
        }
      }
    },
  });
  const last = m.flush(true);
  if (last) feed(replicas, last);
}

function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((e) => keysDeep(e, out));
  else if (typeof v === 'object' && v !== null)
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  return out;
}

describe('replication: authority and replicas', () => {
  it('two replicas stay hash-identical to the server (2 humans + 30 bots)', () => {
    const m = makeMatch();
    expect(m.seatCount).toBe(32);
    const a = makeReplica(m);
    const b = makeReplica(m);
    runAndCompare(m, [a, b], 900);
    const server = canonicalHash(publicState(m.state));
    for (const r of [a, b]) {
      expect(replicaHash(r)).toBe(m.mirrorHash());
      expect(replicaHash(r)).toBe(server);
      expect(r.stats.hashMismatches).toBe(0);
      expect(r.stats.resyncs).toBe(0);
      expect(r.resyncReason).toBeNull();
      expect(r.stats.hashChecks).toBeGreaterThan(3);
      expect(r.stats.framesApplied).toBe(m.state.tick);
    }
    expect(m.counters.patchedTicks).toBeGreaterThan(100);
  });

  it('REGRESSION: frames are packed at their own tick (sendEvery 3 never diverges: a live-generator $r alias)', () => {
    const m = makeMatch({ sendEvery: 3, hashEvery: 60 });
    const r = makeReplica(m);
    runAndCompare(m, [r], 900);
    expect(r.stats.hashMismatches).toBe(0);
    expect(r.stats.resyncs).toBe(0);
    expect(r.stats.hashChecks).toBeGreaterThan(5);
    expect(replicaHash(r)).toBe(m.mirrorHash());
    expect(m.state.generators.length + m.counters.patchedTicks).toBeGreaterThan(0);
  });

  it('a late joiner (keyframe packed + unpacked mid-match) converges, and duplicate frames are ignored', () => {
    const m = makeMatch({ bots: 14, sendEvery: 3 });
    const early = makeReplica(m);
    const dup = makeReplica(m);
    let late: NetReplica | null = null;
    const seqs = [0, 0];
    for (let t = 0; t < 700; t++) {
      driveHumans(m, [0, 1], seqs, t);
      m.step();
      // not on a flush boundary: the pending frames overlap the keyframe's tick and must be skipped
      if (t === 301) late = makeReplica(m);
      const bytes = m.flush();
      if (!bytes) continue;
      feed([early], bytes);
      feed([dup], bytes);
      feed([dup], bytes); // the same message again
      if (late) feed([late], bytes);
    }
    const last = m.flush(true)!;
    feed([early, dup], last);
    feed([dup], last);
    feed([late!], last);
    expect(late).not.toBeNull();
    const h = m.mirrorHash();
    expect(replicaHash(early)).toBe(h);
    expect(replicaHash(dup)).toBe(h);
    expect(replicaHash(late!)).toBe(h);
    expect(late!.stats.hashMismatches).toBe(0);
    expect(late!.stats.resyncs).toBe(0);
    expect(dup.stats.framesApplied).toBe(early.stats.framesApplied);
    expect(dup.stats.resyncs).toBe(0);
    expect(late!.stats.framesApplied).toBeLessThan(early.stats.framesApplied);
  });

  it('the replica rebuilds the same config as the server, locally', () => {
    const m = makeMatch({ bots: 6 });
    const r = makeReplica(m);
    expect(canonicalHash(r.state!.config)).toBe(canonicalHash(m.state.config));
    expect(r.state!.seed).not.toBe(m.state.seed);
    expect(r.state!.rngState).not.toBe(m.state.rngState);
    runAndCompare(m, [r], 120);
    expect(canonicalHash(r.state!.config)).toBe(canonicalHash(m.state.config));
  });

  it('never leaks seed, rngState, hidden or config', () => {
    const m = makeMatch({ bots: 6 });
    const kf = unpack(pack(m.keyframe())) as { t: number; s: Record<string, unknown> };
    for (const k of SECRET) expect(k in kf.s, k).toBe(false);
    expect(Object.keys(kf).sort()).toEqual(['s', 't']);
    const dk = keysDeep(m.descriptor);
    for (const k of dk) expect(k.toLowerCase()).not.toContain('seed');
    for (const k of SECRET) expect(dk.has(k)).toBe(false);
    // and no frame ever carries one at the top level of a patch
    runMatch(m, 300, {
      onFlush: (bytes) => {
        for (const [, patch] of decodeFrames(bytes).f) {
          if (patch && typeof patch === 'object') for (const k of SECRET) expect(k in patch).toBe(false);
        }
      },
    });
    // a late keyframe, after the rng advanced, is still clean
    const kf2 = wireKeyframe(m);
    for (const k of SECRET) expect(k in kf2.s).toBe(false);
  });

  it('is deterministic: same seed + same inputs gives the same final hash; another seed differs', () => {
    const run = (seed: number): number => {
      const m = makeMatch({ bots: 10, seed });
      runMatch(m, 500);
      return m.mirrorHash();
    };
    const a = run(99);
    expect(run(99)).toBe(a);
    expect(run(100)).not.toBe(a);
  });

  it('results() match the state; replicas agree on the ranking', () => {
    const m = makeMatch({ bots: 6, durationSec: 30 });
    const a = makeReplica(m);
    const b = makeReplica(m);
    runAndCompare(m, [a, b], 7000);
    expect(m.ended).toBe(true);
    const res = m.results();
    const r = m.state.match.result;
    expect(r).not.toBeNull();
    expect(res.winnerSeat).toBe(r?.kind === 'win' ? r.winnerId : null);
    expect(res.draw).toBe(r?.kind === 'draw');
    expect(res.tick).toBe(m.state.tick);
    expect(res.stateHash).toBe(m.mirrorHash());
    expect(res.players.length).toBe(8);
    for (const p of res.players) {
      const sp = m.state.players[p.seat]!;
      expect(p.kills).toBe(sp.stats.kills);
      expect(p.deaths).toBe(sp.stats.deaths);
      expect(p.assists).toBe(sp.stats.assists);
      expect(p.isBot).toBe(p.seat >= 2);
      expect(p.name).toBe(sp.name);
    }
    expect(res.players.map((p) => p.placement).sort((x, y) => x - y)[0]).toBe(1);
    if (res.winnerSeat !== null) expect(res.players[res.winnerSeat]!.placement).toBe(1);
    const serverRank = rankPlayers(m.state).map((p) => p.id);
    for (const rep of [a, b]) {
      expect(replicaHash(rep)).toBe(m.mirrorHash());
      expect(rankPlayers(rep.state!).map((p) => p.id)).toEqual(serverRank);
      expect(rep.state!.match.result).toEqual(r);
      for (const p of res.players) {
        const x = matchResultFrom(rep.state!, p.seat, { matchId: m.descriptor.matchId });
        expect(x.placement).toBe(p.placement);
        expect(x.kills).toBe(p.kills);
        expect(x.deaths).toBe(p.deaths);
      }
    }
  });
});

describe('input authority', () => {
  const ok: InputMsg = { s: 1, m: 'up', h: false, b: 0 };

  it('validateInput accepts the exact shape', () => {
    expect(validateInput(ok)).toEqual({ ok: true, value: ok });
    expect(validateInput({ s: 0, m: null, h: true, b: 7 }).ok).toBe(true);
    for (const d of ['up', 'down', 'left', 'right']) expect(validateInput({ ...ok, m: d }).ok).toBe(true);
  });

  it('validateInput rejects extra fields (x, y, kills, team, result, seed)', () => {
    for (const extra of ['x', 'y', 'kills', 'team', 'result', 'seed']) {
      expect(validateInput({ ...ok, [extra]: 1 }).ok, extra).toBe(false);
    }
    expect(validateInput({ s: 1, m: 'up', h: false }).ok).toBe(false);
    expect(validateInput({ s: 1, m: 'up', h: false, z: 0 }).ok).toBe(false);
  });

  it('validateInput rejects wrong types and out-of-range values', () => {
    const bad: unknown[] = [
      null,
      undefined,
      5,
      'str',
      [],
      [1, 2, 3, 4],
      { ...ok, s: '1' },
      { ...ok, s: -1 },
      { ...ok, s: 1.5 },
      { ...ok, s: NaN },
      { ...ok, s: Infinity },
      { ...ok, s: 2 ** 31 },
      { ...ok, m: 'north' },
      { ...ok, m: 'UP' },
      { ...ok, m: 1 },
      { ...ok, m: undefined },
      { ...ok, h: 1 },
      { ...ok, h: 'true' },
      { ...ok, b: 8 },
      { ...ok, b: 16 },
      { ...ok, b: -1 },
      { ...ok, b: 1.5 },
      { ...ok, b: '1' },
      { ...ok, b: BUTTON.place | 8 },
    ];
    for (const x of bad) expect(validateInput(x).ok, JSON.stringify(x)).toBe(false);
  });

  it("match.input answers 'stale' for a non-increasing seq", () => {
    const m = makeMatch({ bots: 2 });
    expect(m.input(0, { ...ok, s: 5 }, 0)).toBe('ok');
    expect(m.input(0, { ...ok, s: 5 }, 100)).toBe('stale');
    expect(m.input(0, { ...ok, s: 3 }, 200)).toBe('stale');
    expect(m.input(0, { ...ok, s: 6 }, 300)).toBe('ok');
    expect(m.counters.inputsStale).toBe(2);
    expect(m.counters.inputsAccepted).toBe(2);
  });

  it("match.input answers 'rateLimited' past the allowed rate (nowMs is the only clock)", () => {
    const m = makeMatch({ bots: 2, inputsPerSecond: 10 });
    const verdicts: string[] = [];
    for (let i = 1; i <= 15; i++) verdicts.push(m.input(0, { ...ok, s: i }, 1000));
    expect(verdicts.filter((v) => v === 'ok').length).toBe(10);
    expect(verdicts.slice(10).every((v) => v === 'rateLimited')).toBe(true);
    expect(m.counters.inputsRateLimited).toBe(5);
    // seat 1 has its own bucket
    expect(m.input(1, { ...ok, s: 1 }, 1000)).toBe('ok');
    // a second later the bucket has refilled
    expect(m.input(0, { ...ok, s: 100 }, 2000)).toBe('ok');
    // the simulation clock plays no part: stepping does not refill
    for (let i = 0; i < 120; i++) m.step();
    const burst = Array.from({ length: 15 }, (_, i) => m.input(0, { ...ok, s: 200 + i }, 2000));
    expect(burst.filter((v) => v === 'rateLimited').length).toBeGreaterThan(0);
  });

  it("match.input answers 'notYours' for bot seats, disconnected seats and unknown seats", () => {
    const m = makeMatch({ bots: 3 });
    expect(m.input(2, ok, 0)).toBe('notYours');
    expect(m.input(4, ok, 0)).toBe('notYours');
    expect(m.input(99, ok, 0)).toBe('notYours');
    expect(m.input(-1, ok, 0)).toBe('notYours');
    m.disconnect(1);
    expect(m.input(1, ok, 0)).toBe('notYours');
    expect(m.input(0, ok, 0)).toBe('ok');
  });
});

describe('connection policy', () => {
  /** Distinct positions the seat's player occupied while alive. */
  function trace(m: RumbleMatch, seat: number, ticks: number): Set<string> {
    const seen = new Set<string>();
    for (let i = 0; i < ticks; i++) {
      m.step();
      const p = m.state.players[seat]!;
      if (!p.alive) break;
      seen.add(`${p.x},${p.y}`);
    }
    return seen;
  }

  it('autopilot: a dropped seat keeps acting', () => {
    const m = makeMatch({ humans: 1, bots: 7, dropPolicy: 'autopilot' });
    m.disconnect(0);
    expect(trace(m, 0, 900).size).toBeGreaterThan(1);
  });

  it('idle: a dropped seat does not move', () => {
    const m = makeMatch({ humans: 1, bots: 7, dropPolicy: 'idle' });
    m.disconnect(0);
    const seen = trace(m, 0, 900);
    expect(seen.size).toBe(1);
    expect(m.state.match.phase).toBe('playing');
  });

  it('replaceWithBot: input is refused forever and the seat is played by a bot', () => {
    const m = makeMatch({ humans: 1, bots: 7, dropPolicy: 'idle' });
    m.replaceWithBot(0);
    expect(m.input(0, { s: 1, m: 'up', h: false, b: 0 }, 0)).toBe('notYours');
    m.connect(0);
    expect(m.input(0, { s: 2, m: 'up', h: false, b: 0 }, 1000)).toBe('notYours');
    expect(m.humanSeatsConnected()).toEqual([]);
    expect(trace(m, 0, 900).size).toBeGreaterThan(1);
    expect(m.input(0, { s: 3, m: 'up', h: false, b: 0 }, 5000)).toBe('notYours');
  });

  it('connect after disconnect restores human control', () => {
    const m = makeMatch({ humans: 1, bots: 7, dropPolicy: 'idle' });
    m.disconnect(0);
    expect(m.input(0, { s: 1, m: 'up', h: false, b: 0 }, 0)).toBe('notYours');
    m.connect(0);
    expect(m.humanSeatsConnected()).toEqual([0]);
    // seq is per connection in the validator but lastSeq persists in the match: use a fresh higher one
    expect(m.input(0, { s: 2, m: 'left', h: false, b: 0 }, 1000)).toBe('ok');
    for (let i = 0; i < 400 && m.state.match.phase !== 'playing'; i++) m.step();
    expect(m.state.match.phase).toBe('playing');
    const start = { x: m.state.players[0]!.x, y: m.state.players[0]!.y };
    // keep pressing every direction: whatever is free, the seat must move under human control
    const dirs = ['left', 'up', 'right', 'down'] as const;
    let seq = 10;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      if (i % 15 === 0) m.input(0, { s: seq++, m: dirs[(i / 15) % 4]!, h: false, b: 0 }, 2000 + i * 17);
      m.step();
      const p = m.state.players[0]!;
      seen.add(`${p.x},${p.y}`);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(start).toBeDefined();
  });
});

describe('replica gap handling and playout', () => {
  it("a dropped frames message sets resyncReason 'gap'; a fresh keyframe recovers", () => {
    const m = makeMatch({ bots: 6 });
    const r = makeReplica(m);
    let n = 0;
    let recovered = false;
    runMatch(m, 500, {
      onFlush: (bytes) => {
        n++;
        if (n === 20) return; // lost on the wire
        r.receive(decodeFrames(bytes));
        drain(r);
        if (r.resyncReason && !recovered) {
          expect(r.resyncReason).toBe('gap');
          expect(r.stats.resyncs).toBe(1);
          r.loadKeyframe(wireKeyframe(m));
          expect(r.resyncReason).toBeNull();
          recovered = true;
        }
      },
    });
    const last = m.flush(true);
    if (last) feed([r], last);
    expect(recovered).toBe(true);
    expect(r.stats.resyncs).toBe(1);
    expect(r.stats.hashMismatches).toBe(0);
    expect(replicaHash(r)).toBe(m.mirrorHash());
  });

  it('advance(): ~60 ticks per second of wall time, alpha within [0,1]', () => {
    const m = makeMatch({ bots: 6 });
    const r = makeReplica(m);
    // pre-buffer a few ticks (what the jitter buffer holds in steady state)
    const pump = (): void => {
      m.step();
      const b = m.flush();
      if (b) r.receive(decodeFrames(b));
    };
    for (let i = 0; i < 6; i++) pump();
    const start = r.tick;
    let steps = 0;
    for (let i = 0; i < 60; i++) {
      pump();
      const res = r.advance(16.67);
      steps += res.steps;
      expect(res.alpha).toBeGreaterThanOrEqual(0);
      expect(res.alpha).toBeLessThanOrEqual(1);
    }
    expect(steps).toBeGreaterThanOrEqual(54);
    expect(steps).toBeLessThanOrEqual(66);
    expect(r.tick - start).toBe(steps);
    expect(r.stats.resyncs).toBe(0);
  });

  it('advance(): a buffer far above maxLagTicks is caught up to the target', () => {
    const m = makeMatch({ bots: 6 });
    const r = makeReplica(m);
    runMatch(m, 200, { onFlush: (b) => r.receive(decodeFrames(b)) });
    const buffered = r.bufferedTicks;
    expect(buffered).toBeGreaterThan(150);
    const res = r.advance(16.67);
    expect(res.steps).toBeLessThanOrEqual(8);
    expect(r.stats.skippedAhead).toBeGreaterThan(100);
    expect(r.bufferedTicks).toBeLessThanOrEqual(m.descriptor.sendEvery + 3 + 1);
    expect(r.tick).toBeGreaterThan(buffered - 10);
    const last = m.flush(true);
    if (last) r.receive(decodeFrames(last));
    drain(r);
    expect(replicaHash(r)).toBe(m.mirrorHash());
    expect(r.stats.hashMismatches).toBe(0);
  });
});
