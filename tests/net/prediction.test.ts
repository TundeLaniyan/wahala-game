/**
 * Local movement prediction (decisions ON4-ON5, docs/ONLINE_PREDICTION.md): the pure parts (drawn position, encoding,
 * latch model, correction, overlay) and the driver's overlay protocol against the real server match core. The latency
 * measurements are in prediction-latency.test.ts.
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PRESS_KEEP_TICKS } from '../../server/src/core/RumbleMatch';
import type { RumbleMatch } from '../../server/src/core/RumbleMatch';
import { NetMatchDriver } from '../../src/net/client/driver';
import type { DriverOptions } from '../../src/net/client/driver';
import {
  DEFAULT_PREDICTION,
  SERVER_PRESS_KEEP_TICKS,
  TICK_MS,
  predictionFromSearch,
} from '../../src/net/client/prediction/config';
import { Corrector } from '../../src/net/client/prediction/corrector';
import { drawnPosition, encodeDrawn, pickStep } from '../../src/net/client/prediction/drawn';
import type { StepFields } from '../../src/net/client/prediction/drawn';
import { OverlayLeakError, PlayerOverlay } from '../../src/net/client/prediction/overlay';
import { LocalPredictor } from '../../src/net/client/prediction/predictor';
import { canonicalHash } from '../../src/net/hash';
import { canonicalClone, pack } from '../../src/net/pack';
import { MSG } from '../../src/net/protocol';
import type { InputMsg } from '../../src/net/protocol';
import { publicState } from '../../src/net/publicState';
import { playerGridPos } from '../../src/render/views/motion';
import type { Dir, GameState, Player } from '../../src/sim';
import { makeMatch, rng } from './helpers';

const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

function playing(m: RumbleMatch): void {
  while (m.state.match.phase !== 'playing') m.step();
}

describe('configuration', () => {
  it("mirrors the server's press latch and defaults to a bounded, blended prediction", () => {
    expect(SERVER_PRESS_KEEP_TICKS).toBe(PRESS_KEEP_TICKS);
    expect(DEFAULT_PREDICTION.maxHorizonTicks).toBeLessThanOrEqual(40);
    expect(DEFAULT_PREDICTION.snapTiles).toBeGreaterThan(0.5);
    expect(DEFAULT_PREDICTION.snapTiles).toBeLessThan(1);
  });

  it('?nopredict turns the browser default off', () => {
    expect(predictionFromSearch('')).toBe(true);
    expect(predictionFromSearch('?online')).toBe(true);
    expect(predictionFromSearch('?online&nopredict')).toBe(false);
    expect(predictionFromSearch('?nopredict=1')).toBe(false);
  });
});

describe('drawn position and its encoding', () => {
  const random = rng(99);
  const fields = (): StepFields => {
    const total = 4 + Math.floor(random() * 14);
    const moving = random() < 0.7;
    const x = 5 + Math.floor(random() * 10);
    const y = 5 + Math.floor(random() * 10);
    const d = DIRS[Math.floor(random() * 4)]!;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
    return {
      x,
      y,
      facing: d,
      stepFromX: moving ? x - v[0]! : x,
      stepFromY: moving ? y - v[1]! : y,
      stepRemaining: moving ? 1 + Math.floor(random() * total) : 0,
      stepTotal: total,
    };
  };

  it("is exactly the renderer's playerGridPos", () => {
    for (let i = 0; i < 500; i++) {
      const f = fields();
      const alpha = random();
      const p = { ...f } as unknown as Player;
      const a = drawnPosition(f, alpha);
      const b = playerGridPos(p, alpha);
      expect(a.x).toBe(b.x);
      expect(a.y).toBe(b.y);
    }
  });

  it('encodes any nearby point for this frame alpha, keeping the logical tile and facing', () => {
    for (let i = 0; i < 2000; i++) {
      const at = fields();
      const alpha = random();
      const target = { x: at.x + (random() * 2 - 1) * 1.2, y: at.y + (random() * 2 - 1) * 1.2 };
      const enc = encodeDrawn(target, at, alpha);
      const back = drawnPosition(enc, alpha);
      expect(back.x).toBeCloseTo(target.x, 9);
      expect(back.y).toBeCloseTo(target.y, 9);
      expect([enc.x, enc.y, enc.facing]).toEqual([at.x, at.y, at.facing]);
      expect(Number.isInteger(enc.stepRemaining) && Number.isInteger(enc.stepTotal)).toBe(true);
      expect(enc.stepRemaining).toBeLessThanOrEqual(enc.stepTotal);
      expect(Math.hypot(enc.stepFromX - enc.x, enc.stepFromY - enc.y)).toBeLessThan(6);
    }
  });

  it("keeps a predicted step's own counters, and a settled fighter stands (idle animation, no walk)", () => {
    const at: StepFields = {
      x: 4,
      y: 4,
      facing: 'left',
      stepFromX: 5,
      stepFromY: 4,
      stepRemaining: 8,
      stepTotal: 10,
    };
    const enc = encodeDrawn(drawnPosition(at, 0.25), at, 0.25);
    expect(enc.stepRemaining).toBe(8);
    expect(enc.stepTotal).toBe(10);
    expect(enc.stepFromX).toBeCloseTo(5, 12);
    const standing = encodeDrawn({ x: 4, y: 4 }, { ...at, stepRemaining: 0 }, 0.6);
    expect(standing.stepRemaining).toBe(0);
    expect([standing.stepFromX, standing.stepFromY]).toEqual([4, 4]);
  });
});

describe('correction', () => {
  it('blends a small error out within about blendMs and snaps a large one', () => {
    const c = new Corrector({ ...DEFAULT_PREDICTION });
    expect(c.add({ x: 0.3, y: 0 })).toBe('blend');
    const sizes: number[] = [];
    for (let t = 0; t < DEFAULT_PREDICTION.blendMs + 50; t += TICK_MS) {
      c.decay(TICK_MS);
      sizes.push(Math.abs(c.offset.x));
    }
    expect(sizes.every((s, i) => i === 0 || s <= sizes[i - 1]!)).toBe(true);
    expect(sizes.at(-1)).toBe(0);
    expect(sizes[2]).toBeGreaterThan(0); // not gone in one frame: no visible pop
    expect(c.add({ x: 0, y: 1 })).toBe('snap');
    expect(c.offset).toEqual({ x: 0, y: 0 });
    expect(c.add({ x: 0.001, y: 0 })).toBe('none');
  });
});

describe('overlay', () => {
  const player = (): Player => {
    const m = makeMatch({ humans: 1, bots: 1 });
    return canonicalClone(m.state.players[0]!);
  };

  it('revert restores the authoritative player bit for bit, and only the seven step fields are ever written', () => {
    const p = player();
    const before = canonicalHash(p);
    const o = new PlayerOverlay(true);
    o.apply(p, { x: 1, y: 2, facing: 'left', stepFromX: 1.5, stepFromY: 2, stepRemaining: 3, stepTotal: 9 });
    expect(p.x).toBe(1);
    o.revert();
    expect(canonicalHash(p)).toBe(before);
    o.revert(); // idempotent
    expect(o.reverts).toBe(1);
  });

  it('detects anything else written to the local player while the overlay was on (verify mode)', () => {
    const p = player();
    const o = new PlayerOverlay(true);
    o.apply(p, pickStep({ ...p, x: p.x + 1 }));
    p.stats.kills++; // an outside write: not the overlay's to undo
    expect(() => o.revert()).toThrow(OverlayLeakError);
    expect(o.leaks).toBe(1);
  });

  it('withAuthoritative shows the authoritative values and puts the same overlay back', () => {
    const p = player();
    const x = p.x;
    const o = new PlayerOverlay(true);
    o.apply(p, pickStep({ ...p, x: x + 1 }));
    expect(o.withAuthoritative(() => p.x)).toBe(x);
    expect(p.x).toBe(x + 1);
    o.revert();
    expect(p.x).toBe(x);
  });
});

describe('the predicted path is the server rule', () => {
  it("with an exact clock the replay reproduces the server's own steps, tick for tick (taps, holds, turns, presses mid-step)", () => {
    const m = makeMatch({ humans: 2, bots: 0, dropPolicy: 'idle', durationSec: 300 }); // seat 1 stands still
    playing(m);
    const LAG = 14; // the replica shows the server this many ticks late
    const pred = new LocalPredictor({ maxHorizonTicks: 40 });
    pred.onPong(0, -0.25); // arrival(t) = t / TICK_MS + 0.25: a message sent at tick r's time is received at r
    const history = new Map<number, GameState>();
    const r = rng(5);
    let seq = 0;
    let compared = 0;
    let stepsSeen = 0;
    const start = m.state.tick;
    for (let T = start; T < start + 2400 && !m.ended; T++) {
      history.set(T, structuredClone(m.state));
      const R = T - LAG;
      const replica = history.get(R);
      if (replica) {
        const fields = pred.update({ state: replica, seat: 0, alpha: 0, nowMs: T * TICK_MS, dtMs: TICK_MS });
        const path = pred.lastPath;
        if (fields && path && pred.stats.mode === 'predicting') {
          for (let k = 1; k < path.snaps.length && R + k <= T; k++) {
            const truth = history.get(R + k)!.players[0]!;
            if (!truth.alive || truth.slide || truth.teleportPending) break;
            expect(path.snaps[k], `tick ${R + k} predicted from ${R}`).toEqual(pickStep(truth));
            compared++;
          }
        }
        history.delete(R - 1);
      }
      // the human: taps, holds, turns, releases at random moments (including mid-step)
      if (r() < 0.07) {
        const roll = r();
        const held = roll < 0.35 ? null : DIRS[Math.floor(r() * 4)]!;
        const msg: InputMsg = { s: seq++, m: held, h: false, b: 0 };
        pred.onSent(msg, T * TICK_MS);
        m.input(0, msg, T * TICK_MS);
      }
      const before = { x: m.state.players[0]!.x, y: m.state.players[0]!.y };
      m.step();
      if (m.state.players[0]!.x !== before.x || m.state.players[0]!.y !== before.y) stepsSeen++;
    }
    expect(stepsSeen).toBeGreaterThan(40);
    expect(compared).toBeGreaterThan(5000);
  });

  it('never writes to the replica: the state hashes the same before and after every prediction', () => {
    const m = makeMatch({ humans: 1, bots: 7 });
    playing(m);
    m.state.players[0]!.contact = 'kick'; // walking into a generator kicks it (the contact path mutates generators)
    const pred = new LocalPredictor();
    pred.onPong(0, -0.25);
    const r = rng(8);
    let seq = 0;
    const lag: GameState[] = [];
    let checked = 0;
    const start = m.state.tick;
    for (let T = start; T < start + 900; T++) {
      lag.push(structuredClone(m.state));
      if (lag.length > 12) {
        const replica = lag.shift()!;
        const before = canonicalHash(replica);
        pred.update({ state: replica, seat: 0, alpha: 0.5, nowMs: T * TICK_MS, dtMs: TICK_MS });
        expect(canonicalHash(replica)).toBe(before);
        checked++;
      }
      if (r() < 0.08) {
        const msg: InputMsg = {
          s: seq++,
          m: r() < 0.3 ? null : DIRS[Math.floor(r() * 4)]!,
          h: false,
          b: r() < 0.3 ? 1 : 0,
        };
        pred.onSent(msg, T * TICK_MS);
        m.input(0, msg, T * TICK_MS);
      }
      m.step();
    }
    expect(checked).toBeGreaterThan(800);
    expect(pred.stats.predictedFrames).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- the driver

interface Rig {
  match: RumbleMatch;
  driver: NetMatchDriver;
  sent: { type: string; msg: unknown }[];
  clock: { ms: number };
  /** The server mirror's hash at every stepped tick. */
  mirror: Map<number, number>;
}

function rig(options: DriverOptions, bots = 7): Rig {
  const match = makeMatch({ humans: 1, bots });
  const sent: Rig['sent'] = [];
  const clock = { ms: 0 };
  const driver = new NetMatchDriver(
    {
      send: (type, msg) => sent.push({ type, msg: canonicalClone(msg) }),
      inflate: async (b) => new Uint8Array(inflateRawSync(b)),
      now: () => clock.ms,
    },
    options,
  );
  driver.onWelcome({ descriptor: canonicalClone(match.descriptor), seat: 0, roomCode: 'ABCDEF' });
  driver.setConnection('connected', null);
  driver.onKeyframe(new Uint8Array(deflateRawSync(pack(match.keyframe()))));
  return { match, driver, sent, clock, mirror: new Map([[match.state.tick, match.mirrorHash()]]) };
}

/** One 60 Hz frame: the server steps once (inputs delivered `lagTicks` late), the client plays out and sends its intent. */
async function frame(
  r: Rig,
  move: Dir | null,
  inbox: { at: number; msg: InputMsg }[],
  lagTicks = 6,
): Promise<void> {
  const { match, driver } = r;
  while (inbox.length > 0 && inbox[0]!.at <= match.state.tick) match.input(0, inbox.shift()!.msg, r.clock.ms);
  match.step();
  r.mirror.set(match.state.tick, match.mirrorHash());
  const bytes = match.flush();
  if (bytes) driver.onFrames(new Uint8Array(deflateRawSync(bytes)));
  await driver.settled();
  r.clock.ms += TICK_MS;
  const before = r.sent.length;
  driver.advance(TICK_MS);
  const state = driver.state();
  if (state) driver.sendIntent({ move }, state, 1);
  for (const s of r.sent.slice(before)) {
    if (s.type === MSG.input) inbox.push({ at: match.state.tick + lagTicks, msg: s.msg as InputMsg });
    if (s.type === MSG.ping) driver.onPong({ c: (s.msg as { c: number }).c, t: match.state.tick + lagTicks });
  }
}

describe('driver: the overlay protocol', () => {
  it('is off unless asked for, and reports itself in the status', () => {
    expect(rig({}).driver.status()).toMatchObject({ predictionEnabled: false, prediction: null });
    expect(rig({ prediction: true }).driver.status()).toMatchObject({ predictionEnabled: true });
  });

  it('every frame the authoritative replica equals the server mirror bit for bit, while the drawn fighter runs ahead', async () => {
    const r = rig({ prediction: true, verifyOverlay: true });
    await r.driver.settled();
    const inbox: { at: number; msg: InputMsg }[] = [];
    const walk = rng(3);
    let move: Dir | null = null;
    let ahead = 0;
    let checked = 0;
    for (let i = 0; i < 900; i++) {
      if (walk() < 0.05) move = walk() < 0.3 ? null : DIRS[Math.floor(walk() * 4)]!;
      await frame(r, move, inbox);
      const auth = r.driver.readAuthoritative((s) => {
        expect(canonicalHash(publicState(s!))).toBe(r.mirror.get(s!.tick));
        checked++;
        return pickStep(s!.players[0]!);
      });
      const drawn = pickStep(r.driver.state()!.players[0]!);
      if (drawn.x !== auth.x || drawn.y !== auth.y) ahead++;
      // the drawn state differs from the authority in the seven step fields only
      const other = r.driver.readAuthoritative((s) =>
        canonicalHash({ ...s!.players[0]!, ...pickStep(drawn) }),
      );
      expect(canonicalHash(r.driver.state()!.players[0]!)).toBe(other);
    }
    const st = r.driver.replica!.stats;
    expect(st.hashChecks).toBeGreaterThan(5);
    expect(st.hashMismatches).toBe(0);
    expect(r.driver.overlay.leaks).toBe(0);
    expect(checked).toBeGreaterThan(800);
    expect(ahead).toBeGreaterThan(20);
    expect(r.driver.status().prediction!.predictedFrames).toBeGreaterThan(300);
  });

  it('control: an overlay left in place while frames are applied IS caught by the hash check', async () => {
    const r = rig({}, 1);
    await r.driver.settled();
    const inbox: { at: number; msg: InputMsg }[] = [];
    for (let i = 0; i < 60; i++) await frame(r, null, inbox);
    const me = r.driver.state()!.players[0]!;
    const overlay = new PlayerOverlay();
    overlay.apply(me, pickStep({ ...me, x: me.x + 1 }));
    for (let i = 0; i < 300 && r.driver.replica!.stats.hashMismatches === 0; i++) {
      r.match.step();
      const bytes = r.match.flush();
      if (bytes) r.driver.onFrames(new Uint8Array(deflateRawSync(bytes)));
      await r.driver.settled();
      r.driver.replica!.advance(TICK_MS); // bypasses the driver's revert on purpose
    }
    expect(r.driver.replica!.stats.hashMismatches).toBeGreaterThan(0);
  });

  it('prediction never changes what is sent: the same intents give the same {s, m, h, b} messages with it on or off', async () => {
    const on = rig({ prediction: true });
    const off = rig({});
    await Promise.all([on.driver.settled(), off.driver.settled()]);
    const walk = rng(4);
    const inboxOn: { at: number; msg: InputMsg }[] = [];
    const inboxOff: { at: number; msg: InputMsg }[] = [];
    let move: Dir | null = null;
    for (let i = 0; i < 600; i++) {
      if (walk() < 0.08) move = walk() < 0.3 ? null : DIRS[Math.floor(walk() * 4)]!;
      await frame(on, move, inboxOn);
      await frame(off, move, inboxOff);
    }
    const inputs = (x: Rig): unknown[] => x.sent.filter((s) => s.type === MSG.input).map((s) => s.msg);
    expect(inputs(on).length).toBeGreaterThan(20);
    expect(inputs(on)).toEqual(inputs(off));
    for (const msg of inputs(on)) expect(Object.keys(msg as object).sort()).toEqual(['b', 'h', 'm', 's']);
    expect(new Set(on.sent.map((s) => s.type))).toEqual(new Set([MSG.input, MSG.ping]));
    expect(on.match.mirrorHash()).toBe(off.match.mirrorHash()); // the two servers ran the same match
  });

  it('a drop, reconnect and keyframe reset the prediction cleanly; dispose leaves the replica authoritative', async () => {
    const r = rig({ prediction: true, verifyOverlay: true });
    await r.driver.settled();
    const inbox: { at: number; msg: InputMsg }[] = [];
    for (let i = 0; i < 240; i++) await frame(r, i % 90 < 50 ? 'left' : 'up', inbox);
    // the connection drops: the server forgets the seat's input, the client keeps drawing what it has
    r.driver.setConnection('reconnecting', 'lost');
    r.match.disconnect(0);
    inbox.length = 0;
    for (let i = 0; i < 30; i++) r.match.step();
    r.match.flush(true);
    r.match.connect(0);
    r.driver.onWelcome({ descriptor: canonicalClone(r.match.descriptor), seat: 0, roomCode: 'ABCDEF' });
    r.driver.setConnection('connected', 'back');
    r.driver.onKeyframe(new Uint8Array(deflateRawSync(pack(r.match.keyframe()))));
    await r.driver.settled();
    r.mirror.set(r.match.state.tick, r.match.mirrorHash());
    const before = r.driver.status().prediction!.predictedFrames;
    for (let i = 0; i < 240; i++) await frame(r, i % 90 < 50 ? 'right' : 'down', inbox);
    expect(r.driver.replica!.stats.hashMismatches).toBe(0);
    expect(r.driver.overlay.leaks).toBe(0);
    expect(r.driver.status().prediction!.predictedFrames).toBeGreaterThan(before + 60);
    r.driver.dispose();
    const s = r.driver.state()!;
    expect(canonicalHash(publicState(s))).toBe(r.mirror.get(s.tick));
  });
});
