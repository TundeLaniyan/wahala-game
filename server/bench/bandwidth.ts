/**
 * Replication bandwidth + codec CPU on real 32-fighter City Rumble matches (docs/CITY_RUMBLE_ONLINE.md section 5).
 * For every tick: patch = diff(mirror, publicState), frame = pack({t, p, e}), mirror <- applyPatch(mirror, patch).
 * Frames are grouped into send batches of B ticks (B=1: 60 Hz, B=3: 20 Hz) and deflated once per batch, as the server
 * does. At the end (and every second) the mirror's canonical hash must equal the authoritative public state's.
 *
 * Usage: npx tsx server/bench/bandwidth.ts [--arena rumbleOshodi] [--mode deathmatch] [--ticks 3600]
 */
import { deflateRawSync } from 'node:zlib';
import { createBot } from '../../src/ai';
import { CHARACTER_IDS, RUMBLE_ARENA_IDS, createGame, observe, tick } from '../../src/sim';
import type { GameKind, Intents } from '../../src/sim';
import { applyPatch, diff } from '../../src/net/delta';
import { canonicalHash } from '../../src/net/hash';
import { predict } from '../../src/net/predict';
import { canonicalClone, pack } from '../../src/net/pack';
import { publicState } from '../../src/net/publicState';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const MODE = arg('mode', 'deathmatch') as GameKind;
const TICKS = Number(arg('ticks', '3600'));
const ARENAS = arg('arena', 'all') === 'all' ? [...RUMBLE_ARENA_IDS] : [arg('arena', '')];
const BATCHES = [1, 2, 3, 4, 6];
const PREDICT = !process.argv.includes('--no-predict');

const pct = (xs: number[], p: number): number => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};

for (const arenaId of ARENAS) {
  const seed = 777;
  const state = createGame({
    seed,
    arenaId,
    players: Array.from({ length: 32 }, (_, i) => ({
      name: `P${i}`,
      characterId: CHARACTER_IDS[i % CHARACTER_IDS.length]!,
      isBot: true,
      difficulty: 'standard' as const,
    })),
    settings: { game: MODE, mode: 'crush', durationSec: MODE === 'survival' ? null : 300, teamCount: 2 },
  });
  const bots = state.players.map((_, i) =>
    createBot({ difficulty: 'standard', seed: seed + i * 7919, playerId: i }),
  );
  let mirror = canonicalClone(publicState(state));
  const keyframe = pack(mirror);
  const keyframeDeflated = deflateRawSync(keyframe).length;
  const frames: Uint8Array[] = [];
  const codecMs: number[] = [];
  let desyncs = 0;
  for (let t = 0; t < TICKS && state.match.phase !== 'ended'; t++) {
    const intents: Intents = {};
    for (const p of state.players)
      if (p.alive || p.spectator !== null) intents[p.id] = bots[p.id]!.decide(observe(state, p.id));
    const events = tick(state, intents);
    const c0 = performance.now();
    if (PREDICT) predict(mirror);
    const patch = diff(mirror, publicState(state));
    const frame = pack({ t: state.tick, p: patch ?? null, e: events.length ? events : null });
    if (patch !== undefined) mirror = applyPatch(mirror, patch) as typeof mirror;
    codecMs.push(performance.now() - c0);
    frames.push(frame);
    if (t % 60 === 59 && canonicalHash(mirror) !== canonicalHash(publicState(state))) desyncs++;
  }
  const finalEqual = canonicalHash(mirror) === canonicalHash(publicState(state));
  const seconds = frames.length / 60;
  const rows = BATCHES.map((b) => {
    let raw = 0;
    let deflated = 0;
    const sizes: number[] = [];
    for (let i = 0; i < frames.length; i += b) {
      const group = frames.slice(i, i + b);
      const len = group.reduce((n, f) => n + f.length, 0);
      const joined = new Uint8Array(len);
      let at = 0;
      for (const f of group) {
        joined.set(f, at);
        at += f.length;
      }
      raw += len;
      const z = deflateRawSync(joined).length;
      deflated += z;
      sizes.push(z);
    }
    // +6 bytes WebSocket frame header + ~2 bytes message type per batch; TCP/IP headers excluded
    const overhead = (frames.length / b) * 8;
    return {
      batchTicks: b,
      sendHz: 60 / b,
      rawKBps: +(raw / 1024 / seconds).toFixed(2),
      deflateKBps: +((deflated + overhead) / 1024 / seconds).toFixed(2),
      p99BatchBytes: pct(sizes, 99),
      maxBatchBytes: Math.max(...sizes),
    };
  });
  const sum = codecMs.reduce((a, b) => a + b, 0);
  console.log(
    JSON.stringify({
      arenaId,
      mode: MODE,
      predict: PREDICT,
      seconds: +seconds.toFixed(1),
      kills: state.players.reduce((n, p) => n + p.stats.kills, 0),
      keyframeBytes: keyframe.length,
      keyframeDeflated,
      codecMsMean: +(sum / codecMs.length).toFixed(4),
      codecMsP99: +pct(codecMs, 99).toFixed(4),
      periodicDesyncs: desyncs,
      finalHashEqual: finalEqual,
      perClient: rows,
    }),
  );
}
