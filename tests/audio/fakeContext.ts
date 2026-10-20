/**
 * A strict fake AudioContext for Node. "Strict" = it throws where a real browser would (negative or
 * non-finite times, exponential ramps to <= 0, starting a source twice, stopping before start), so
 * the tests catch invalid scheduling that a lenient mock would hide.
 */
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  BufferSourceNodeLike,
  DynamicsCompressorNodeLike,
  FilterType,
  GainNodeLike,
  OscType,
  OscillatorNodeLike,
  StereoPannerNodeLike,
} from '../../src/audio/webaudio';

export class FakeParam implements AudioParamLike {
  value: number;
  readonly targets: number[] = [];
  constructor(
    private readonly ctx: FakeContext,
    initial = 0,
  ) {
    this.value = initial;
  }
  private check(v: number, t: number): void {
    if (!Number.isFinite(v)) throw new RangeError(`non-finite param value ${v}`);
    if (!Number.isFinite(t) || t < 0) throw new RangeError(`bad time ${t}`);
  }
  setValueAtTime(v: number, t: number): this {
    this.check(v, t);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.check(v, t);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.check(v, t);
    if (v <= 0) throw new RangeError('exponential ramp to <= 0');
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number): this {
    this.check(v, t);
    if (!(tc > 0)) throw new RangeError('time constant must be > 0');
    this.targets.push(v);
    this.value = v;
    return this;
  }
  cancelScheduledValues(t: number): this {
    this.check(0, t);
    return this;
  }
  get now(): number {
    return this.ctx.currentTime;
  }
}

export class FakeNode implements AudioNodeLike {
  connections: unknown[] = [];
  disconnected = false;
  constructor(readonly ctx: FakeContext) {}
  connect(dest: unknown): unknown {
    this.connections.push(dest);
    return dest;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam(this.ctx, 1);
}

export class FakeOsc extends FakeNode implements OscillatorNodeLike {
  type: OscType = 'sine';
  readonly frequency = new FakeParam(this.ctx, 440);
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  readonly createdAt = this.ctx.currentTime;
  /** First frequency set via setValueAtTime. */
  f0 = 0;
  constructor(ctx: FakeContext) {
    super(ctx);
    const orig = this.frequency.setValueAtTime.bind(this.frequency);
    this.frequency.setValueAtTime = (v: number, t: number) => {
      if (this.f0 === 0) this.f0 = v;
      return orig(v, t);
    };
  }
  start(when = 0): void {
    if (this.startedAt !== null) throw new Error('InvalidStateError: start called twice');
    if (!Number.isFinite(when) || when < 0) throw new RangeError('bad start');
    this.startedAt = when;
  }
  stop(when = 0): void {
    if (this.startedAt === null) throw new Error('InvalidStateError: stop before start');
    if (!Number.isFinite(when) || when < 0) throw new RangeError('bad stop');
    this.stoppedAt = when;
  }
}

export class FakeBuffer implements AudioBufferLike {
  private readonly data: Float32Array;
  constructor(
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

export class FakeSource extends FakeNode implements BufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  readonly playbackRate = new FakeParam(this.ctx, 1);
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  start(when = 0, offset = 0): void {
    if (this.startedAt !== null) throw new Error('InvalidStateError: start called twice');
    if (!Number.isFinite(when) || when < 0 || !Number.isFinite(offset) || offset < 0) {
      throw new RangeError('bad start');
    }
    this.startedAt = when;
  }
  stop(when = 0): void {
    if (this.startedAt === null) throw new Error('InvalidStateError: stop before start');
    if (!Number.isFinite(when) || when < 0) throw new RangeError('bad stop');
    this.stoppedAt = when;
  }
}

export class FakeFilter extends FakeNode implements BiquadFilterNodeLike {
  type: FilterType = 'lowpass';
  readonly frequency = new FakeParam(this.ctx, 350);
  readonly Q = new FakeParam(this.ctx, 1);
  readonly gain = new FakeParam(this.ctx, 0);
}

export class FakePanner extends FakeNode implements StereoPannerNodeLike {
  readonly pan = new FakeParam(this.ctx, 0);
}

export class FakeCompressor extends FakeNode implements DynamicsCompressorNodeLike {
  readonly threshold = new FakeParam(this.ctx, -24);
  readonly knee = new FakeParam(this.ctx, 30);
  readonly ratio = new FakeParam(this.ctx, 12);
  readonly attack = new FakeParam(this.ctx, 0.003);
  readonly release = new FakeParam(this.ctx, 0.25);
}

export interface FakeContextOptions {
  /** Omit createStereoPanner (old Safari). */
  noPanner?: boolean;
}

export class FakeContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate = 8000;
  state = 'suspended';
  closed = false;
  resumeCalls = 0;
  readonly destination = new FakeNode(this);
  readonly gains: FakeGain[] = [];
  readonly oscs: FakeOsc[] = [];
  readonly sources: FakeSource[] = [];
  readonly filters: FakeFilter[] = [];
  readonly compressors: FakeCompressor[] = [];
  createStereoPanner?: () => StereoPannerNodeLike;

  constructor(opts: FakeContextOptions = {}) {
    if (!opts.noPanner) this.createStereoPanner = () => new FakePanner(this);
  }
  resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
  createGain(): FakeGain {
    const g = new FakeGain(this);
    this.gains.push(g);
    return g;
  }
  createOscillator(): FakeOsc {
    const o = new FakeOsc(this);
    this.oscs.push(o);
    return o;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource(this);
    this.sources.push(s);
    return s;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter(this);
    this.filters.push(f);
    return f;
  }
  createBuffer(_channels: number, length: number, sampleRate: number): AudioBufferLike {
    return new FakeBuffer(length, sampleRate);
  }
  createDynamicsCompressor(): FakeCompressor {
    const c = new FakeCompressor(this);
    this.compressors.push(c);
    return c;
  }

  // ---- inspection helpers used by tests
  /** The master gain: the gain feeding the compressor. */
  master(): FakeGain {
    const comp = this.compressors[0];
    const g = this.gains.find((x) => x.connections.includes(comp));
    if (!g) throw new Error('master gain not found');
    return g;
  }
  /** Gains still connected somewhere (voice outputs are disconnected when released). */
  liveGainsInto(target: FakeNode): FakeGain[] {
    return this.gains.filter((g) => !g.disconnected && g.connections.includes(target));
  }
  /** Any gain param that was ever driven towards `value`. */
  anyGainTargeted(value: number): boolean {
    return this.gains.some((g) => g.gain.targets.some((t) => Math.abs(t - value) < 1e-9));
  }
  nodeCount(): number {
    return this.gains.length + this.oscs.length + this.sources.length + this.filters.length;
  }
  /** Advance the audio clock only (timers are driven separately with vi fake timers). */
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}
