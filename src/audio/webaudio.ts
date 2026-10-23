/**
 * The small structural subset of the Web Audio API that this module uses.
 *
 * Why not the DOM lib types? (1) tests run in Node and inject a fake context, (2) it documents
 * exactly which features we depend on, which keeps old iOS Safari (`webkitAudioContext`) in reach.
 * A real `AudioContext` satisfies these interfaces structurally.
 */

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface AudioNodeLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect(destination: any): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface AudioBufferLike {
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels?: number;
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  /** Loop region in seconds (optional: only the music player sets them). */
  loopStart?: number;
  loopEnd?: number;
  readonly playbackRate: AudioParamLike;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
  /** Fired by browsers when playback finishes; used to release nodes of stopped loops. */
  onended?: (() => void) | null;
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'notch' | 'highshelf';

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: FilterType;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
  readonly gain: AudioParamLike;
}

export interface StereoPannerNodeLike extends AudioNodeLike {
  readonly pan: AudioParamLike;
}

export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  readonly threshold: AudioParamLike;
  readonly knee: AudioParamLike;
  readonly ratio: AudioParamLike;
  readonly attack: AudioParamLike;
  readonly release: AudioParamLike;
}

/** Optional (missing in no browser we target, but tests and exotic hosts may lack it). */
export interface WaveShaperNodeLike extends AudioNodeLike {
  curve: Float32Array | null;
  oversample: 'none' | '2x' | '4x';
}

/**
 * The part of HTMLAudioElement the music player uses: it streams the long music tracks (so ten of them
 * never sit decoded in memory) and changes tempo with the pitch preserved.
 */
export interface MediaElementLike {
  src: string;
  loop: boolean;
  preload: string;
  playbackRate: number;
  /** Standard; `webkitPreservesPitch` / `mozPreservesPitch` on older engines. */
  preservesPitch?: boolean;
  readonly paused: boolean;
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
  load(): void;
  removeAttribute?(name: string): void;
  addEventListener(type: 'error' | 'playing' | 'ended', listener: () => void): void;
  removeEventListener(type: 'error' | 'playing' | 'ended', listener: () => void): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createBufferSource(): BufferSourceNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  /** Decodes an encoded file (ogg/mp3/wav). Used for optional recorded sample slots. */
  decodeAudioData?(data: ArrayBuffer): Promise<AudioBufferLike>;
  createDynamicsCompressor(): DynamicsCompressorNodeLike;
  /** Missing on very old Safari; panning is skipped when absent. */
  createStereoPanner?(): StereoPannerNodeLike;
  /** Used for the final soft clipper; skipped when absent. */
  createWaveShaper?(): WaveShaperNodeLike;
  /** Routes a streaming <audio> element into the graph (music). Music is silent when absent. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createMediaElementSource?(element: any): AudioNodeLike;
}

export type ContextFactory = () => AudioContextLike | null | undefined;
