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

export type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface OscillatorNodeLike extends AudioNodeLike {
  type: OscType;
  readonly frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioBufferLike {
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  readonly playbackRate: AudioParamLike;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'notch';

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

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBufferSource(): BufferSourceNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createDynamicsCompressor(): DynamicsCompressorNodeLike;
  /** Missing on very old Safari; panning is skipped when absent. */
  createStereoPanner?(): StereoPannerNodeLike;
}

export type ContextFactory = () => AudioContextLike | null | undefined;
