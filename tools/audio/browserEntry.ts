/**
 * Browser-side half of tools/audio/browserSmoke.mjs. Bundled with esbuild and run in headless
 * Chromium with a REAL AudioContext: plays a bot-vs-bot match through the audio engine in real time,
 * records the engine's actual mixed output, and reports timing. Exposes `window.runSmoke`.
 */
import { createAudio } from '../../src/audio';
import { createBot } from '../../src/ai';
import { createGame, observe, tick } from '../../src/sim';
import type { Intents, SimEvent } from '../../src/sim';

interface SmokeOptions {
  seconds: number;
  seed: number;
  slotBase: string;
  /** Run the game loop without any audio, to measure the main-thread cost of sim + bots alone. */
  audioOff?: boolean;
  /** Only the looping ambience (no game events), to measure the bed level on its own. */
  ambienceOnly?: boolean;
  intensity?: number;
}

interface SmokeResult {
  sampleRate: number;
  pcm: string; // base64 Int16 interleaved stereo
  frames: number;
  loaded: string[];
  skipped: { slot: string; reason: string }[];
  played: Record<string, number>;
  eventsSeen: Record<string, number>;
  handleMs: { mean: number; max: number; p99: number; calls: number };
  longTasks: number[];
  errors: string[];
  firstAudibleMs: number | null;
  matchPhase: string;
  loops: string[];
  gainValues: number[];
}

function b64(i16: Int16Array): string {
  const u8 = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

async function runSmoke(o: SmokeOptions): Promise<SmokeResult> {
  const errors: string[] = [];
  const longTasks: number[] = [];
  try {
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => longTasks.push(Math.round(e.duration))),
    ).observe({
      type: 'longtask',
      buffered: true,
    });
  } catch {
    /* longtask unsupported */
  }

  // A real AudioContext whose destination is a recorder tap.
  const real = new AudioContext();
  const chunksL: Float32Array[] = [];
  const chunksR: Float32Array[] = [];
  const tap = real.createScriptProcessor(4096, 2, 2);
  let firstAudibleMs: number | null = null;
  const t0 = performance.now();
  tap.onaudioprocess = (e) => {
    const l = e.inputBuffer.getChannelData(0);
    const r = e.inputBuffer.getChannelData(1);
    chunksL.push(l.slice());
    chunksR.push(r.slice());
    if (firstAudibleMs === null && l.some((v) => Math.abs(v) > 0.003))
      firstAudibleMs = performance.now() - t0;
  };
  tap.connect(real.destination);
  const sources: AudioBufferSourceNode[] = [];
  const gains: GainNode[] = [];
  const proxy = new Proxy(real, {
    get(target, prop) {
      if (prop === 'destination') return tap;
      if (prop === 'createBufferSource') {
        return () => {
          const n = target.createBufferSource();
          sources.push(n);
          return n;
        };
      }
      if (prop === 'createGain') {
        return () => {
          const n = target.createGain();
          gains.push(n);
          return n;
        };
      }
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });

  const played: Record<string, number> = {};
  const audio = o.audioOff
    ? createAudio({ contextFactory: () => null })
    : createAudio({
        contextFactory: () => proxy as never,
        onError: (e) => errors.push(String(e)),
        sampleBaseUrl: o.slotBase,
        onPlay: (t) => (played[t.id] = (played[t.id] ?? 0) + 1),
      });

  // a real game: 4 bots, the first counts as the "human" for audio purposes
  const state = createGame({
    seed: o.seed,
    settings: { mode: 'classic', crowdThrows: true, floorHazards: true },
    players: [0, 1, 2, 3].map((i) => ({
      name: `P${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
      isBot: i !== 0,
      difficulty: 'medium' as const,
    })),
  });
  const bots = state.players.map((_, i) =>
    createBot({ difficulty: 'medium', seed: o.seed * 31 + i, playerId: i }),
  );

  await audio.unlock();
  audio.startMusic();
  audio.setVolumes({ master: 1, music: 0.8, sfx: 0.9 });
  const report = await audio.whenSamplesLoaded();

  const eventsSeen: Record<string, number> = {};
  const handleTimes: number[] = [];
  const intents: Intents = {};
  const step = 1000 / 60;
  let last = performance.now();
  let acc = 0;
  const end = performance.now() + o.seconds * 1000;
  await new Promise<void>((resolve) => {
    const frame = (): void => {
      const now = performance.now();
      acc += now - last;
      last = now;
      let events: SimEvent[] = [];
      while (acc >= step) {
        acc -= step;
        if (o.ambienceOnly) continue;
        for (let i = 0; i < state.players.length; i++) intents[i] = bots[i]!.decide(observe(state, i));
        events = events.concat(tick(state, intents));
      }
      for (const e of events) eventsSeen[e.type] = (eventsSeen[e.type] ?? 0) + 1;
      const h0 = performance.now();
      audio.handleEvents(events, state);
      audio.setIntensity(
        o.intensity ??
          (state.match.phase === 'playing' && state.match.playTicks > 120 * 60 - 1800 ? 1 : 0.15),
      );
      handleTimes.push(performance.now() - h0);
      if (now > end || state.match.phase === 'ended') {
        // let the end-of-match stinger and crowd roar ring out
        setTimeout(resolve, state.match.phase === 'ended' ? 6000 : 500);
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const live = sources
    .filter((x) => x.loop)
    .map((x) => `loop len=${x.buffer?.length} rate=${x.buffer?.sampleRate}`);
  const gainVals = gains.map((g) => Number(g.gain.value.toFixed(3))).filter((v) => v !== 1 && v !== 0);
  audio.stopMusic();
  await new Promise((r) => setTimeout(r, 1500));
  tap.disconnect();

  const n = chunksL.reduce((s, c) => s + c.length, 0);
  const pcm = new Int16Array(n * 2);
  let k = 0;
  for (let c = 0; c < chunksL.length; c++) {
    for (let i = 0; i < chunksL[c]!.length; i++) {
      pcm[k++] = Math.max(-32768, Math.min(32767, Math.round(chunksL[c]![i]! * 32767)));
      pcm[k++] = Math.max(-32768, Math.min(32767, Math.round(chunksR[c]![i]! * 32767)));
    }
  }
  handleTimes.sort((a, b) => a - b);
  const mean = handleTimes.reduce((s, v) => s + v, 0) / Math.max(1, handleTimes.length);
  audio.dispose();
  return {
    sampleRate: real.sampleRate,
    pcm: b64(pcm),
    frames: n,
    loaded: report.loaded,
    skipped: report.skipped,
    played,
    eventsSeen,
    handleMs: {
      mean,
      max: handleTimes[handleTimes.length - 1] ?? 0,
      p99: handleTimes[Math.floor(handleTimes.length * 0.99)] ?? 0,
      calls: handleTimes.length,
    },
    longTasks,
    errors,
    firstAudibleMs,
    matchPhase: state.match.phase,
    loops: live,
    gainValues: gainVals,
  };
}

(window as unknown as { runSmoke: typeof runSmoke }).runSmoke = runSmoke;
