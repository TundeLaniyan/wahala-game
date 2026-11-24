/**
 * Stage 1 feasibility measurement (docs/CITY_RUMBLE_ONLINE.md section 2): runs real 32-fighter City Rumble matches
 * headlessly in Node with the real `src/sim` + `src/ai`, and reports
 *   - sim and bot CPU per tick (mean / p50 / p99 / max),
 *   - full and public state size (JSON, deflated),
 *   - determinism: the same seed + the same intent log gives the same state hash, twice.
 *
 * Usage: npx tsx server/bench/feasibility.ts [--arena rumbleOshodi] [--mode deathmatch] [--ticks 3600]
 */
import { deflateSync } from 'node:zlib';
import { createBot } from '../../src/ai';
import { RUMBLE_ARENA_IDS, createGame, observe, tick } from '../../src/sim';
import type { GameKind, GameState, Intents, PlayerSetup } from '../../src/sim';
import { CHARACTER_IDS } from '../../src/sim';
import { fnv1a } from '../../src/online/util';
import { publicState } from '../../src/net/publicState';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};

const MODE = arg('mode', 'deathmatch') as GameKind;
const TICKS = Number(arg('ticks', '3600'));
const ARENAS = arg('arena', 'all') === 'all' ? [...RUMBLE_ARENA_IDS] : [arg('arena', '')];

function setup(n: number): PlayerSetup[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `P${i}`,
    characterId: CHARACTER_IDS[i % CHARACTER_IDS.length]!,
    isBot: true,
    difficulty: 'standard' as const,
  }));
}

function pct(xs: number[], p: number): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

function run(arenaId: string, seed: number, replay?: Intents[]) {
  const state = createGame({
    seed,
    arenaId,
    players: setup(32),
    settings: { game: MODE, mode: 'crush', durationSec: MODE === 'survival' ? null : 300, teamCount: 2 },
  });
  const bots = state.players.map((_, i) =>
    createBot({ difficulty: 'standard', seed: seed + i * 7919, playerId: i }),
  );
  const simMs: number[] = [];
  const aiMs: number[] = [];
  const log: Intents[] = [];
  let events = 0;
  let maxPublic = 0;
  for (let t = 0; t < TICKS && state.match.phase !== 'ended'; t++) {
    let intents: Intents;
    if (replay) intents = replay[t] ?? {};
    else {
      const a0 = performance.now();
      intents = {};
      for (const p of state.players)
        if (p.alive || p.spectator !== null) intents[p.id] = bots[p.id]!.decide(observe(state, p.id));
      aiMs.push(performance.now() - a0);
      log.push(intents);
    }
    const s0 = performance.now();
    events += tick(state, intents).length;
    simMs.push(performance.now() - s0);
    if (t % 300 === 0) maxPublic = Math.max(maxPublic, JSON.stringify(publicState(state)).length);
  }
  return { state, simMs, aiMs, log, events, maxPublic };
}

function sizes(state: GameState) {
  const full = JSON.stringify(state);
  const pub = JSON.stringify(publicState(state));
  const cfg = JSON.stringify(state.config);
  return {
    fullJson: full.length,
    configJson: cfg.length,
    publicJson: pub.length,
    publicDeflate: deflateSync(pub).length,
  };
}

console.log(`mode=${MODE} ticks<=${TICKS} players=32 node=${process.version}`);
for (const arenaId of ARENAS) {
  const seed = 12345;
  const a = run(arenaId, seed);
  const b = run(arenaId, seed, a.log);
  const hashA = fnv1a(JSON.stringify(a.state));
  const hashB = fnv1a(JSON.stringify(b.state));
  const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
  const sz = sizes(a.state);
  const alive = a.state.players.filter((p) => p.alive).length;
  const kills = a.state.players.reduce((n, p) => n + p.stats.kills, 0);
  console.log(
    JSON.stringify({
      arenaId,
      board: `${a.state.width}x${a.state.height}`,
      ticksRun: a.simMs.length,
      phase: a.state.match.phase,
      alive,
      kills,
      events: a.events,
      simMsMean: +(sum(a.simMs) / a.simMs.length).toFixed(4),
      simMsP50: +pct(a.simMs, 50).toFixed(4),
      simMsP99: +pct(a.simMs, 99).toFixed(4),
      simMsMax: +Math.max(...a.simMs).toFixed(3),
      ai32MsMean: +(sum(a.aiMs) / a.aiMs.length).toFixed(4),
      ai32MsP99: +pct(a.aiMs, 99).toFixed(4),
      ai32MsMax: +Math.max(...a.aiMs).toFixed(3),
      ...sz,
      maxPublicJsonSampled: a.maxPublic,
      deterministicReplay: hashA === hashB,
      replaySimMsMean: +(sum(b.simMs) / b.simMs.length).toFixed(4),
    }),
  );
}
