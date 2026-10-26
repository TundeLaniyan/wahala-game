/**
 * Runs headless bot matches under a config variant and collects `MatchMetrics`; aggregates and prints
 * them. Used by scripts/rumble-metrics.ts and by tests (a short `maxPlayTicks` keeps tests fast).
 */
import { createBot } from '../../src/ai';
import { createGame, observe, tick } from '../../src/sim';
import type { CharacterId, DeepPartial, Difficulty, GameConfig, GameKind, Intents } from '../../src/sim';
import { MetricsCollector, mean, median } from './collector';
import type { MatchMetrics } from './collector';
import type { Variant } from './variants';

export interface MetricsSpec {
  seed: number;
  arenaId: string;
  game: GameKind;
  players: number;
  /** Bot level for every seat, or `mixed` = standard with every third seat beginner (as scripts/rumble-stages.ts). */
  difficulty: Difficulty | 'mixed';
  /** Respawn rulesets: match length in seconds (null = the ruleset default). */
  durationSec: number | null;
  variant: Variant;
  /** Extra override merged over the variant (ad hoc tuning). */
  config?: DeepPartial<GameConfig>;
  /** Stop after this many playing ticks (tests). */
  maxPlayTicks?: number;
  sampleTicks?: number;
  /** Wall clock in ms (default performance.now); tests may omit timing by passing a constant. */
  now?: () => number;
}

const CHARACTERS: CharacterId[] = ['streetBaller', 'lekkiBoy', 'campusQueen'];

export function runMetricsMatch(spec: MetricsSpec): MatchMetrics {
  const now = spec.now ?? ((): number => performance.now());
  const difficulties = Array.from({ length: spec.players }, (_, i): Difficulty =>
    spec.difficulty === 'mixed' ? (i % 3 === 2 ? 'beginner' : 'standard') : spec.difficulty,
  );
  const state = createGame({
    seed: spec.seed,
    arenaId: spec.arenaId,
    settings: { game: spec.game, durationSec: spec.durationSec },
    config: spec.config ? mergeOverrides(spec.variant.config, spec.config) : spec.variant.config,
    players: difficulties.map((difficulty, i) => ({
      name: `b${i}`,
      characterId: CHARACTERS[(i + spec.seed) % 3]!,
      isBot: true,
      difficulty,
    })),
  });
  const bots = difficulties.map((difficulty, i) =>
    createBot({ difficulty, seed: spec.seed * 7919 + i * 104729 + 17, playerId: i }),
  );
  const collector = new MetricsCollector(state, spec.sampleTicks);
  const cap = state.config.match.countdownTicks + state.config.match.durationTicks + 60;
  const stopAt = spec.maxPlayTicks ?? Infinity;
  const intents: Intents = {};
  let simMs = 0;
  let playTicks = 0;
  while (state.match.phase !== 'ended' && state.tick < cap && state.match.playTicks < stopAt) {
    const t0 = now();
    for (let i = 0; i < spec.players; i++) {
      if (!state.players[i]!.alive) {
        delete intents[i];
        continue;
      }
      intents[i] = bots[i]!.decide(observe(state, i));
    }
    const events = tick(state, intents);
    const dt = now() - t0;
    if (state.match.phase !== 'countdown') {
      simMs += dt;
      playTicks++;
    }
    collector.onTick(state, events);
  }
  return collector.finish(state, playTicks > 0 ? simMs / playTicks : 0);
}

/** Variant config with ad hoc overrides on top (shallow per section, deep merge not needed for the numbers tuned here). */
function mergeOverrides(a: DeepPartial<GameConfig>, b: DeepPartial<GameConfig>): DeepPartial<GameConfig> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] =
      cur && v && typeof cur === 'object' && typeof v === 'object' && !Array.isArray(v)
        ? mergeOverrides(cur as DeepPartial<GameConfig>, v as DeepPartial<GameConfig>)
        : v;
  }
  return out as DeepPartial<GameConfig>;
}

// ------------------------------------------------------------------------------------------ aggregation

export interface Aggregate {
  matches: number;
  /** Matches that produced a result (win / teamWin / draw) before the cap. */
  ended: number;
  /** Mean of each numeric metric over the matches (`firstElimSec` ignores matches without an elimination). */
  mean: Record<string, number>;
  /** Matches in which nobody fell in the first 30 / 60 s. */
  noElim30: number;
  noElim60: number;
  /** Per-result counts (`win`, `draw:simultaneous`, `draw:timeout` ...). */
  results: Record<string, number>;
}

const NUMERIC: (keyof MatchMetrics)[] = [
  'playSeconds',
  'eliminations',
  'elimsPerMinute',
  'creditedEliminations',
  'selfEliminations',
  'elims30',
  'elims60',
  'engagedShare',
  'exposedShare',
  'placementsPerFighterMinute',
  'aimedPlacementShare',
  'nearPlacementShare',
  'campShare',
  'meanNearestOpponent',
  'topKills',
  'medianKills',
  'topPower',
  'medianPower',
  'rewardsGranted',
  'msPerTick',
];

export function aggregate(rows: readonly MatchMetrics[]): Aggregate {
  const m: Record<string, number> = {};
  for (const key of NUMERIC) m[key] = mean(rows.map((r) => r[key] as number));
  const firsts = rows.filter((r) => r.firstElimSec !== null).map((r) => r.firstElimSec as number);
  // -1 = nobody fell in any match
  m.firstElimSec = firsts.length > 0 ? mean(firsts) : -1;
  m.medianFirstElimSec = firsts.length > 0 ? median(firsts) : -1;
  const results: Record<string, number> = {};
  for (const r of rows) {
    const key = r.result.startsWith('win') ? 'win' : r.result;
    results[key] = (results[key] ?? 0) + 1;
  }
  return {
    matches: rows.length,
    ended: rows.filter((r) => r.result !== 'none').length,
    mean: m,
    noElim30: rows.filter((r) => r.elims30 === 0).length,
    noElim60: rows.filter((r) => r.elims60 === 0).length,
    results,
  };
}

// ------------------------------------------------------------------------------------------ report

export interface Cell {
  stage: string;
  game: GameKind;
  players: number;
  minutes: number | null;
  variant: string;
  agg: Aggregate;
}

const f1 = (x: number): string => x.toFixed(1);
const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

export const TABLE_HEADER = [
  'stage',
  'ruleset',
  'bots',
  'variant',
  'n',
  'result',
  'len s',
  'elims',
  'elims/min',
  '1st s',
  '<=30 s',
  '<=60 s',
  'engaged',
  'in fire',
  'gens/fm',
  'aimed',
  'camp',
  'near opp',
  'self',
  'top k',
  'med k',
  'top pw',
  'med pw',
  'ms/tick',
];

export function tableRow(c: Cell): string[] {
  const a = c.agg;
  const x = a.mean;
  const rs = a.results;
  const result = Object.entries(rs)
    .map(([k, v]) => `${k.replace('draw:', 'd:')} ${v}`)
    .join(', ');
  return [
    c.stage,
    c.game + (c.minutes ? ` ${c.minutes}m` : ''),
    String(c.players),
    c.variant,
    String(a.matches),
    result || '-',
    f1(x.playSeconds!),
    f1(x.eliminations!),
    f1(x.elimsPerMinute!),
    x.firstElimSec! < 0 ? '-' : f1(x.firstElimSec!),
    f1(x.elims30!),
    f1(x.elims60!),
    pct(x.engagedShare!),
    pct(x.exposedShare!),
    f1(x.placementsPerFighterMinute!),
    pct(x.aimedPlacementShare!),
    pct(x.campShare!),
    f1(x.meanNearestOpponent!),
    f1(x.selfEliminations!),
    f1(x.topKills!),
    f1(x.medianKills!),
    f1(x.topPower!),
    f1(x.medianPower!),
    x.msPerTick!.toFixed(2),
  ];
}

export function markdownTable(cells: readonly Cell[]): string {
  const rows = [TABLE_HEADER, ...cells.map(tableRow)];
  const line = (r: string[]): string => `| ${r.join(' | ')} |`;
  return [line(rows[0]!), line(TABLE_HEADER.map(() => '---')), ...rows.slice(1).map(line)].join('\n');
}
