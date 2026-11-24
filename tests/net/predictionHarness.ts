/**
 * Deterministic in-process harness for the online input -> visible delay (docs/ONLINE_PREDICTION.md section 6).
 *
 * No sockets, no real time: the REAL server match core (`RumbleMatch` via `makeMatch`) runs at 60 ticks/s on a fake clock,
 * behind a link model applied to BOTH directions (one-way latency + jitter + loss + radio stalls, seeded PRNG, ordered
 * delivery as TCP: a lost segment is a retransmission stall that also holds back everything behind it). The client side is
 * the real `NetMatchDriver` (replica, jitter buffer, wire input, and optionally the prediction) fed the exact deflated bytes
 * the room would send. A scripted human (taps, held walks, turns, reversals, press bursts, the odd generator) produces the
 * intent each frame, as the controller would after the real input layer.
 *
 * Every driver in `drivers` receives the same downlink at the same times; only the FIRST is connected (its messages reach
 * the server). The others are shadows: their outgoing messages are compared with the first one's and dropped, so a
 * with-prediction and a without-prediction client can be measured on one identical match.
 *
 * What it cannot show: a real phone (frame pacing, touch latency, thermal throttling, a real radio's burst behaviour, the
 * browser's event loop under load). The link model is a statistical stand-in, not a recording.
 */
import { deflateRawSync } from 'node:zlib';
import { inflateRawSync } from 'node:zlib';
import type { RumbleMatch } from '../../server/src/core/RumbleMatch';
import { NetMatchDriver } from '../../src/net/client/driver';
import type { DriverOptions } from '../../src/net/client/driver';
import { drawnPosition } from '../../src/net/client/prediction/drawn';
import { canonicalHash } from '../../src/net/hash';
import { canonicalClone, pack } from '../../src/net/pack';
import { MSG, validateInput } from '../../src/net/protocol';
import type { InputMsg, PongMsg, ResultsMsg } from '../../src/net/protocol';
import { publicState } from '../../src/net/publicState';
import { DIR_VEC, movementLocked } from '../../src/sim';
import type { Dir, GameState, Intent } from '../../src/sim';
import { canPlayerEnter } from '../../src/sim/systems/stepping';
import { makeMatch, rng } from './helpers';

const FRAME_MS = 1000 / 60;
const TICK_MS = 1000 / 60;

// ---------------------------------------------------------------- link model

export interface LinkProfile {
  name: string;
  /** Mean one-way delay (ms), each direction. */
  oneWayMs: number;
  /** Jitter on each message's delay: within +/- this many ms (ms). */
  jitterMs: number;
  /**
   * How the jitter varies. > 0: a queueing-like delay that drifts smoothly between random levels re-drawn every this many
   * ms (messages sent close together see about the same delay, as on a real path), plus +/- 1 ms per message. 0: an
   * independent draw per message (a stress case: with ordered delivery, bursts then queue behind their slowest message).
   */
  jitterCorrMs: number;
  /** Probability a message is lost and retransmitted (adds a retransmission timeout, holds back what follows). */
  loss: number;
  /** Mean seconds between radio stalls (0 = none); a stall delays everything in both directions until it ends. */
  stallEverySec: number;
  stallMs: [number, number];
}

export const PROFILES: Record<'lan' | 'europe' | 'mobile' | 'badMobile', LinkProfile> = {
  lan: {
    name: 'clean LAN (~20 ms RTT)',
    oneWayMs: 10,
    jitterMs: 2,
    jitterCorrMs: 250,
    loss: 0,
    stallEverySec: 0,
    stallMs: [0, 0],
  },
  europe: {
    name: 'europe-like (~115 ms RTT)',
    oneWayMs: 57,
    jitterMs: 5,
    jitterCorrMs: 250,
    loss: 0,
    stallEverySec: 0,
    stallMs: [0, 0],
  },
  mobile: {
    name: 'mobile (~150 ms +/-30, 1 % loss)',
    oneWayMs: 75,
    jitterMs: 15,
    jitterCorrMs: 250,
    loss: 0.01,
    stallEverySec: 40,
    stallMs: [200, 500],
  },
  badMobile: {
    name: 'bad-mobile (~250 ms +/-60, 3 % loss)',
    oneWayMs: 125,
    jitterMs: 30,
    jitterCorrMs: 250,
    loss: 0.03,
    stallEverySec: 20,
    stallMs: [300, 900],
  },
};

/** Radio stall windows shared by both directions. */
function stallWindows(p: LinkProfile, rand: () => number, durationMs: number): [number, number][] {
  const out: [number, number][] = [];
  if (p.stallEverySec <= 0) return out;
  let t = 0;
  for (;;) {
    t += -Math.log(1 - rand()) * p.stallEverySec * 1000;
    if (t > durationMs) return out;
    const len = p.stallMs[0] + rand() * (p.stallMs[1] - p.stallMs[0]);
    out.push([t, t + len]);
    t += len;
  }
}

class Link<T> {
  private q: { at: number; v: T }[] = [];
  private last = 0;
  private knots: number[] = [];
  sent = 0;
  lost = 0;

  constructor(
    private readonly p: LinkProfile,
    private readonly rand: () => number,
    private readonly stalls: [number, number][],
  ) {}

  /** The jitter of a message sent at `t` (ms). */
  private jitter(t: number): number {
    const j = this.p.jitterMs;
    if (this.p.jitterCorrMs <= 0) return (this.rand() * 2 - 1) * j;
    const k = t / this.p.jitterCorrMs;
    const i = Math.floor(k);
    while (this.knots.length <= i + 1) this.knots.push((this.rand() * 2 - 1) * (j - 1));
    const smooth = this.knots[i]! + (this.knots[i + 1]! - this.knots[i]!) * (k - i);
    return smooth + (this.rand() * 2 - 1) * Math.min(1, j);
  }

  send(t: number, v: T): void {
    this.sent++;
    let at = t + this.p.oneWayMs + this.jitter(t);
    if (this.rand() < this.p.loss) {
      this.lost++;
      at += Math.max(200, 3 * this.p.oneWayMs); // retransmission timeout
    }
    for (const [a, b] of this.stalls) if (at >= a && at < b) at = b + this.rand() * 5;
    at = Math.max(at, this.last); // ordered: head-of-line blocking
    this.last = at;
    this.q.push({ at, v });
  }

  take(t: number): T[] {
    let n = 0;
    while (n < this.q.length && this.q[n]!.at <= t) n++;
    return this.q.splice(0, n).map((e) => e.v);
  }
}

// ---------------------------------------------------------------- scripted human

const DIRS: Dir[] = ['up', 'right', 'down', 'left'];
const PERP: Record<Dir, Dir[]> = {
  up: ['left', 'right'],
  down: ['left', 'right'],
  left: ['up', 'down'],
  right: ['up', 'down'],
};
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** What a scripted press asks for; the direction itself is chosen when it fires (`ScriptedHuman.resolve`). */
export type DirSpec = 'new' | 'same' | 'perp' | 'opp' | 'alt';

export interface ScriptEvent {
  t: number;
  spec: DirSpec | null;
  place?: boolean;
}

/**
 * A human-like schedule: idle pauses (sometimes laying a generator), single taps, held walks, corner turns, reversals
 * and press bursts. The TIMING is fixed by the seed; each new direction is chosen when it fires, among the directions
 * open on the SERVER's board at that moment (a player does not keep walking into walls). The server's board is the same
 * with and without prediction (the server gets the same input), so both clients see exactly the same intent stream.
 */
export function humanScript(seed: number, startMs: number, endMs: number): ScriptEvent[] {
  const r = rng(seed);
  const between = (a: number, b: number): number => a + r() * (b - a);
  const ev: ScriptEvent[] = [];
  let t = startMs;
  const at = (spec: DirSpec | null, dur: number, place = false): void => {
    ev.push(place ? { t, spec, place } : { t, spec });
    t += dur;
  };
  while (t < endMs) {
    const k = r();
    if (k < 0.3) at(null, between(700, 1600), r() < 0.3);
    else if (k < 0.48) {
      at('new', between(50, 110));
      at(null, between(180, 400));
      for (let i = 0, n = Math.floor(r() * 3); i < n; i++) {
        at('same', between(50, 110));
        at(null, between(180, 400));
      }
    } else if (k < 0.7) {
      at('new', between(300, 1800));
      at(null, between(100, 400));
    } else if (k < 0.85) {
      at('new', between(300, 900));
      at('perp', between(250, 900));
      at(null, between(100, 400));
    } else if (k < 0.9) {
      at('new', between(300, 700));
      at('opp', between(300, 700));
      at(null, between(100, 400));
    } else {
      at('new', between(35, 70));
      at(null, between(25, 60));
      for (let i = 1, n = 4 + Math.floor(r() * 4); i < n; i++) {
        at(i % 2 ? 'alt' : 'same', between(35, 70));
        at(null, between(25, 60));
      }
      at(null, between(200, 500));
    }
  }
  return ev;
}

/** Turns direction specs into directions, preferring tiles the server says are open. */
export class DirChooser {
  private cur: Dir = 'up';
  private alt: Dir = 'left';
  private readonly r: () => number;

  constructor(seed: number) {
    this.r = rng(seed);
  }

  resolve(spec: DirSpec, open: (d: Dir) => boolean): Dir {
    const pick = (xs: readonly Dir[]): Dir => xs[Math.floor(this.r() * xs.length)]!;
    const prefer = (xs: readonly Dir[]): Dir => {
      const ok = xs.filter(open);
      return pick(ok.length > 0 ? ok : xs);
    };
    switch (spec) {
      case 'new':
        this.cur = this.r() < 0.5 && open(this.cur) ? this.cur : prefer(DIRS);
        this.alt = prefer(PERP[this.cur]);
        return this.cur;
      case 'same':
        return this.cur;
      case 'alt':
        return this.alt;
      case 'perp':
        this.cur = prefer(PERP[this.cur]);
        return this.cur;
      case 'opp':
        this.cur = OPP[this.cur];
        return this.cur;
    }
  }
}

// ---------------------------------------------------------------- run

export interface DriverSetup {
  label: string;
  options: DriverOptions;
}

export interface PressRecord {
  t: number;
  dir: Dir;
  /**
   * A press "from rest": nothing held for >= 700 ms before it, and the server's fighter could take that step when it was
   * pressed (alive, not dazed / rooted / sliding, the tile open). The headline input -> visible figure.
   */
  rest: boolean;
  /** Per driver: ms from the press frame to the first frame the drawn fighter moves that way (null = never, 1.5 s). */
  visible: (number | null)[];
}

export interface DriverReport {
  label: string;
  hashChecks: number;
  hashMismatches: number;
  resyncs: number;
  overlayLeaks: number;
  overlayReverts: number;
  /** Per-frame drawn displacement of the local fighter (tiles), excluding respawns / teleports. */
  frameJumps: number[];
  /** Corrections reported by the predictor (tiles), with snaps flagged. */
  corrections: { tiles: number; snap: boolean }[];
  predictedFrames: number;
  frames: number;
  probes: number;
  biasTicks: number;
  horizon: number[];
}

export interface RunReport {
  profile: LinkProfile;
  durationMs: number;
  presses: PressRecord[];
  drivers: DriverReport[];
  /** Estimated minus true server receipt tick of each input of the connected driver (null when it had no estimate). */
  arrivalError: number[];
  /** Every message the server received, as received. */
  serverReceived: { type: string; msg: unknown }[];
  /** Messages each shadow driver would have sent that differ from the connected driver's (must be 0). */
  shadowSendMismatches: number;
  results: ResultsMsg;
  finalHash: number;
  /** Each driver's authoritative replica hash at the server's final tick (null if it never got there). */
  replicaFinalHash: (number | null)[];
  matchTicks: number;
  linkLost: { up: number; down: number };
}

export interface RunOptions {
  profile: LinkProfile;
  seed: number;
  durationMs: number;
  drivers: DriverSetup[];
  bots?: number;
  /** Match length; default long enough to cover the run. */
  durationSec?: number;
  /** Diagnostics: every correction of the connected driver, with the client time (ms). */
  onCorrection?: (tMs: number, tiles: number, kind: string, driver: NetMatchDriver) => void;
  /** Diagnostics: every input of the connected driver as it is sent and, later, as the server receives it. */
  inputLog?: { s: number; m: Dir | null; sentMs: number; est: number | null; receivedTick?: number }[];
  /** Diagnostics: a drawn jump longer than 0.3 tile in one frame (driver index, tiles). */
  onJump?: (tMs: number, index: number, tiles: number, driver: NetMatchDriver) => void;
}

type Down = { kind: 'fr' | 'kf'; bytes: Uint8Array } | { kind: 'pong'; msg: PongMsg };
type Up = { type: string; msg: unknown };

const deflate = (b: Uint8Array): Uint8Array => new Uint8Array(deflateRawSync(b));

export async function runLatency(opts: RunOptions): Promise<RunReport> {
  const { profile, seed, durationMs } = opts;
  const match: RumbleMatch = makeMatch({
    humans: 1,
    bots: opts.bots ?? 7,
    seed,
    durationSec: opts.durationSec ?? Math.ceil(durationMs / 1000) + 30,
  });
  const rand = rng(seed * 31 + 7);
  const stalls = stallWindows(profile, rand, durationMs + 10_000);
  const up = new Link<Up>(profile, rng(seed * 31 + 11), stalls);
  const down = new Link<Down>(profile, rng(seed * 31 + 13), stalls);
  const clock = { ms: 0 };
  const shadowOut: Up[][] = opts.drivers.map(() => []);
  const drivers = opts.drivers.map(
    (d, i) =>
      new NetMatchDriver(
        {
          send: (type, msg) => {
            if (i === 0) up.send(clock.ms, { type, msg: canonicalClone(msg) });
            shadowOut[i]!.push({ type, msg: canonicalClone(msg) });
          },
          inflate: async (b) => new Uint8Array(inflateRawSync(b)),
          now: () => clock.ms,
        },
        d.options,
      ),
  );
  const reports: DriverReport[] = opts.drivers.map((d) => ({
    label: d.label,
    hashChecks: 0,
    hashMismatches: 0,
    resyncs: 0,
    overlayLeaks: 0,
    overlayReverts: 0,
    frameJumps: [],
    corrections: [],
    predictedFrames: 0,
    frames: 0,
    probes: 0,
    biasTicks: 0,
    horizon: [],
  }));
  const descriptor = canonicalClone(match.descriptor);
  const kf0 = deflate(pack(match.keyframe()));
  for (const d of drivers) {
    d.onWelcome({ descriptor, seat: 0, roomCode: 'ABCDEF' });
    d.setConnection('connected', null);
    d.onKeyframe(kf0);
  }
  // after the welcome: a new match builds a new predictor
  drivers.forEach((d, i) => {
    if (d.predictor)
      d.predictor.onCorrection = (tiles, kind) => {
        reports[i]!.corrections.push({ tiles, snap: kind === 'snap' });
        if (i === 0) opts.onCorrection?.(clock.ms, tiles, kind, d);
      };
  });
  await Promise.all(drivers.map((d) => d.settled()));

  const script = humanScript(seed * 7 + 3, 3500, durationMs - 2000);
  const chooser = new DirChooser(seed * 7 + 5);
  const open = (d: Dir): boolean => {
    const me = match.state.players[0]!;
    const v = DIR_VEC[d];
    return canPlayerEnter(match.state, me.x + v.dx, me.y + v.dy, me);
  };
  const canAct = (d: Dir): boolean => {
    const me = match.state.players[0]!;
    return me.alive && me.stepRemaining === 0 && !movementLocked(match.state, me) && open(d);
  };
  let si = 0;
  let move: Dir | null = null;
  let lastMoveChange = -Infinity;
  const presses: PressRecord[] = [];
  const tracking: { rec: PressRecord; min: number[] }[] = [];
  const serverReceived: Up[] = [];
  const trueArrival = new Map<number, number>();
  const estArrival = new Map<number, number>();
  const prevDrawn: ({ x: number; y: number } | null)[] = drivers.map(() => null);
  let prevAuth: { x: number; y: number } | null = null;
  let shadowSendMismatches = 0;
  /** The server stopped stepping (the match ended, or the measured window is over). */
  let stopped = false;

  const project = (p: { x: number; y: number }, d: Dir): number =>
    d === 'up' ? -p.y : d === 'down' ? p.y : d === 'left' ? -p.x : p.x;

  let nextTick = TICK_MS;
  let nextFrame = 5.3;
  const hardEnd = durationMs + 8000;
  while (nextFrame < hardEnd) {
    if (nextTick <= nextFrame) {
      // ---- server tick
      const t = nextTick;
      nextTick += TICK_MS;
      for (const m of up.take(t)) {
        serverReceived.push(m);
        if (m.type === MSG.input) {
          const v = validateInput(m.msg);
          if (!v.ok) throw new Error(`server got an invalid input: ${JSON.stringify(m.msg)}`);
          trueArrival.set(v.value.s, match.state.tick);
          const logged = opts.inputLog?.find((e) => e.s === v.value.s);
          if (logged) logged.receivedTick = match.state.tick;
          match.input(0, v.value, t);
        } else if (m.type === MSG.ping) {
          down.send(t, { kind: 'pong', msg: { c: (m.msg as { c: number }).c, t: match.state.tick } });
        } else if (m.type === MSG.resync) {
          down.send(t, { kind: 'kf', bytes: deflate(pack(match.keyframe())) });
        } else throw new Error(`unexpected client message ${m.type}`);
      }
      if (!stopped) {
        match.step();
        stopped = match.ended || t >= durationMs;
        const bytes = match.flush(stopped);
        if (bytes) down.send(t, { kind: 'fr', bytes: deflate(bytes) });
      }
      continue;
    }
    // ---- client frame
    const t = nextFrame;
    nextFrame += FRAME_MS;
    const arrived = down.take(t);
    for (const m of arrived)
      for (const d of drivers) {
        if (m.kind === 'pong') {
          clock.ms = t;
          d.onPong(m.msg);
        } else if (m.kind === 'fr') d.onFrames(m.bytes);
        else d.onKeyframe(m.bytes);
      }
    if (arrived.length > 0) await Promise.all(drivers.map((d) => d.settled()));
    clock.ms = t;
    const alphas = drivers.map((d) => d.advance(FRAME_MS).alpha);

    // the scripted human's intent for this frame
    let place = false;
    while (si < script.length && script[si]!.t <= t) {
      const e = script[si++]!;
      const next = e.spec === null ? null : chooser.resolve(e.spec, open);
      if (next !== move) {
        if (next !== null) {
          const rec: PressRecord = {
            t,
            dir: next,
            rest: move === null && t - lastMoveChange >= 700 && canAct(next),
            visible: drivers.map(() => null),
          };
          presses.push(rec);
          tracking.push({ rec, min: drivers.map(() => Infinity) });
        }
        move = next;
        lastMoveChange = t;
      }
      if (e.place) place = true;
    }
    if (t >= durationMs - 2000) move = null;
    const intent: Intent = place ? { move, place: true } : { move };
    const sentBefore = shadowOut.map((o) => o.length);
    drivers.forEach((d) => {
      const s = d.state();
      if (s && !d.ended()) d.sendIntent(intent, s, 1);
    });
    const est = drivers[0]!.lastSentArrival;
    for (const o of shadowOut[0]!.slice(sentBefore[0]!))
      if (o.type === MSG.input) {
        const msg = o.msg as InputMsg;
        opts.inputLog?.push({ s: msg.s, m: msg.m, sentMs: t, est });
      }
    if (shadowOut[0]!.length > sentBefore[0]! && shadowOut[0]!.at(-1)!.type === MSG.input && est !== null)
      estArrival.set((shadowOut[0]!.at(-1)!.msg as InputMsg).s, est);

    // measurements: where each driver DRAWS the local fighter this frame
    const authP = drivers[drivers.length - 1]!.readAuthoritative((s) => s?.players[0] ?? null);
    const auth = authP ? drawnPosition(authP, alphas.at(-1)!) : null;
    const teleported = !!(auth && prevAuth && Math.hypot(auth.x - prevAuth.x, auth.y - prevAuth.y) > 1.5);
    prevAuth = auth;
    drivers.forEach((d, i) => {
      const p = d.state()?.players[0];
      const rep = reports[i]!;
      if (!p || !p.alive) {
        prevDrawn[i] = null;
        return;
      }
      const at = drawnPosition(p, alphas[i]!);
      const prev = prevDrawn[i];
      if (prev && !teleported) {
        const jump = Math.hypot(at.x - prev.x, at.y - prev.y);
        rep.frameJumps.push(jump);
        if (jump > 0.3) opts.onJump?.(t, i, jump, d);
      }
      prevDrawn[i] = at;
      for (const tr of tracking) {
        if (tr.rec.visible[i] !== null || t - tr.rec.t > 1500 || t <= tr.rec.t) continue;
        const v = project(at, tr.rec.dir);
        tr.min[i] = Math.min(tr.min[i]!, v);
        if (v - tr.min[i]! >= 0.05) tr.rec.visible[i] = t - tr.rec.t;
      }
      // the minimum starts at the press frame itself
      for (const tr of tracking) if (tr.rec.t === t) tr.min[i] = project(at, tr.rec.dir);
      if (d.predictor?.stats.mode === 'predicting') rep.horizon.push(d.predictor.stats.horizonTicks);
    });
    while (tracking.length > 0 && t - tracking[0]!.rec.t > 1600) tracking.shift();

    // shadows must send exactly what the connected driver sends
    for (let i = 1; i < drivers.length; i++) {
      const a = shadowOut[0]!.slice(sentBefore[0]!);
      const b = shadowOut[i]!.slice(sentBefore[i]!);
      if (JSON.stringify(a) !== JSON.stringify(b)) shadowSendMismatches++;
    }

    // after the server stopped, the replicas drain to its final tick
    if (stopped && drivers.every((d) => d.readAuthoritative((s) => s?.tick) === match.state.tick)) break;
  }

  const finalHash = match.mirrorHash();
  drivers.forEach((d, i) => {
    const rep = reports[i]!;
    const st = d.replica!.stats;
    rep.hashChecks = st.hashChecks;
    rep.hashMismatches = st.hashMismatches;
    rep.resyncs = st.resyncs;
    rep.overlayLeaks = d.overlay.leaks;
    rep.overlayReverts = d.overlay.reverts;
    const ps = d.predictor?.stats;
    rep.predictedFrames = ps?.predictedFrames ?? 0;
    rep.frames = ps?.frames ?? 0;
    rep.probes = ps?.probes ?? 0;
    rep.biasTicks = ps?.biasTicks ?? 0;
  });
  const arrivalError: number[] = [];
  for (const [s, est] of estArrival) {
    const tr = trueArrival.get(s);
    if (tr !== undefined) arrivalError.push(Math.floor(est) - tr);
  }
  return {
    profile,
    durationMs,
    presses,
    drivers: reports,
    arrivalError,
    serverReceived,
    shadowSendMismatches,
    results: match.results(),
    finalHash,
    replicaFinalHash: drivers.map((d) =>
      d.readAuthoritative((s) =>
        s && s.tick === match.state.tick ? canonicalHash(publicState(s as GameState)) : null,
      ),
    ),
    matchTicks: match.state.tick,
    linkLost: { up: up.lost, down: down.lost },
  };
}

// ---------------------------------------------------------------- statistics

export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!;
}

export interface ProfileSummary {
  profile: string;
  presses: number;
  restPresses: number;
  /** [driver][p50, p95] of input -> visible ms, presses from rest. */
  rest: [number, number][];
  /** Same over every press that became visible for that driver. */
  all: [number, number][];
  neverVisible: number[];
  mispredictionPctFrames: number;
  correctionsPerMin: number;
  snapsPerMin: number;
  correctionP95: number;
  correctionMax: number;
  frameJumpMax: number[];
  arrivalErrP50: number;
  arrivalErrP95: number;
  horizonP50: number;
  probes: number;
  hashMismatches: number[];
  hashChecks: number[];
  overlayLeaks: number;
  shadowSendMismatches: number;
  finalHashMatch: boolean[];
}

export function summarize(r: RunReport): ProfileSummary {
  const n = r.drivers.length;
  const lat = (rest: boolean, i: number): number[] =>
    r.presses.filter((p) => (!rest || p.rest) && p.visible[i] !== null).map((p) => p.visible[i]!);
  const pred = r.drivers[0]!;
  const minutes = r.durationMs / 60_000;
  const big = pred.corrections.filter((c) => c.tiles >= 0.05);
  return {
    profile: r.profile.name,
    presses: r.presses.length,
    restPresses: r.presses.filter((p) => p.rest).length,
    rest: Array.from({ length: n }, (_, i) => [quantile(lat(true, i), 0.5), quantile(lat(true, i), 0.95)]),
    all: Array.from({ length: n }, (_, i) => [quantile(lat(false, i), 0.5), quantile(lat(false, i), 0.95)]),
    neverVisible: Array.from({ length: n }, (_, i) => r.presses.filter((p) => p.visible[i] === null).length),
    mispredictionPctFrames: pred.predictedFrames > 0 ? (100 * big.length) / pred.predictedFrames : 0,
    correctionsPerMin: big.length / minutes,
    snapsPerMin: pred.corrections.filter((c) => c.snap).length / minutes,
    correctionP95: quantile(
      pred.corrections.map((c) => c.tiles),
      0.95,
    ),
    correctionMax: pred.corrections.reduce((m, c) => Math.max(m, c.tiles), 0),
    frameJumpMax: r.drivers.map((d) => d.frameJumps.reduce((m, x) => Math.max(m, x), 0)),
    arrivalErrP50: quantile(r.arrivalError.map(Math.abs), 0.5),
    arrivalErrP95: quantile(r.arrivalError.map(Math.abs), 0.95),
    horizonP50: quantile(pred.horizon, 0.5),
    probes: pred.probes,
    hashMismatches: r.drivers.map((d) => d.hashMismatches),
    hashChecks: r.drivers.map((d) => d.hashChecks),
    overlayLeaks: r.drivers.reduce((s, d) => s + d.overlayLeaks, 0),
    shadowSendMismatches: r.shadowSendMismatches,
    finalHashMatch: r.replicaFinalHash.map((h) => h === r.finalHash),
  };
}
