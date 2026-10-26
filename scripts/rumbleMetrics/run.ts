/**
 * Runs headless bot matches under a config variant and collects `MatchMetrics`; aggregates and prints
 * them. Used by scripts/rumble-metrics.ts and by tests (a short `maxPlayTicks` keeps tests fast).
 */
import { createBot } from '../../src/ai';
import { createGame, observe, tick } from '../../src/sim';
import type { CharacterId, DeepPartial, Difficulty, GameConfig, GameKind, Intents } from '../../src/sim';
import { CAUSE_KEYS, MetricsCollector, mean, median } from './collector';
import type { MatchMetrics } from './collector';
import { mergeConfigs } from './variants';
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
    config: mergeConfigs(spec.variant.config, spec.config),
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
  /** Mean eliminations per match by cause (`causeKey`). */
  causes: Record<string, number>;
  /** Per spawn slot over the matches: mean share of the match alive, mean credited eliminations, wins. */
  slotSurvival: number[];
  slotKills: number[];
  slotWins: number[];
  /** Spawn fairness: spread (max - min) and coefficient of variation of the per-slot mean survival. */
  slotSurvivalSpread: number;
  slotSurvivalCv: number;
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
  'openingEngagedShare',
  'openingExposedShare',
  'openingNearestOpponent',
  'topKills',
  'medianKills',
  'topPower',
  'medianPower',
  'rewardsGranted',
  'emptyRuns15',
  'longestEmptySec',
  'meanLiveGenerators',
  'peakLiveGenerators',
  'liveGeneratorsPerFighter',
  'suppliesStart',
  'suppliesOpened',
  'suppliesOpened60',
  'pickupsCollected',
  'pickupsWasted',
  'pickupsBurned',
  'msPerTick',
];

export function aggregate(rows: readonly MatchMetrics[]): Aggregate {
  const m: Record<string, number> = {};
  for (const key of NUMERIC) m[key] = mean(rows.map((r) => r[key] as number));
  const firsts = rows.filter((r) => r.firstElimSec !== null).map((r) => r.firstElimSec as number);
  // -1 = nobody fell in any match
  m.firstElimSec = firsts.length > 0 ? mean(firsts) : -1;
  m.medianFirstElimSec = firsts.length > 0 ? median(firsts) : -1;
  const encounters = rows
    .filter((r) => r.firstEncounterSec !== null)
    .map((r) => r.firstEncounterSec as number);
  m.firstEncounterSec = encounters.length > 0 ? mean(encounters) : -1;
  const supplies = rows
    .filter((r) => r.firstSupplyOpenedSec !== null)
    .map((r) => r.firstSupplyOpenedSec as number);
  m.firstSupplyOpenedSec = supplies.length > 0 ? mean(supplies) : -1;
  const causes = Object.fromEntries(CAUSE_KEYS.map((k) => [k, mean(rows.map((r) => r.causes[k]))]));
  const slots = Math.max(0, ...rows.map((r) => r.slotSurvival.length));
  const slotSurvival = Array.from({ length: slots }, (_, i) => mean(rows.map((r) => r.slotSurvival[i] ?? 0)));
  const slotKills = Array.from({ length: slots }, (_, i) => mean(rows.map((r) => r.slotKills[i] ?? 0)));
  const slotWins = Array.from({ length: slots }, (_, i) => rows.filter((r) => r.winnerSlot === i).length);
  const sMean = mean(slotSurvival);
  const sVar = mean(slotSurvival.map((x) => (x - sMean) ** 2));
  const results: Record<string, number> = {};
  for (const r of rows) {
    const key = r.result.startsWith('win') ? 'win' : r.result;
    results[key] = (results[key] ?? 0) + 1;
  }
  return {
    matches: rows.length,
    ended: rows.filter((r) => r.result !== 'none').length,
    mean: m,
    causes,
    slotSurvival,
    slotKills,
    slotWins,
    slotSurvivalSpread: slots > 0 ? Math.max(...slotSurvival) - Math.min(...slotSurvival) : 0,
    slotSurvivalCv: sMean > 0 ? Math.sqrt(sVar) / sMean : 0,
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
  'engaged 60s',
  'in fire',
  'in fire 60s',
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
    pct(x.openingEngagedShare!),
    pct(x.exposedShare!),
    pct(x.openingExposedShare!),
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

export const DETAIL_HEADER = [
  'stage',
  'ruleset',
  'bots',
  'variant',
  '1st encounter s',
  'empty runs >= 15 s',
  'longest empty s',
  'own / rival / team / veh / stage / crush / melee',
  'live gens (mean / peak / per fighter)',
  'supplies opened (of start, by 60 s, 1st s)',
  'pickups taken / wasted / burned',
  'slot survival spread / cv',
];

export function detailRow(c: Cell): string[] {
  const { agg: a } = c;
  const x = a.mean;
  const k = a.causes;
  return [
    c.stage,
    c.game + (c.minutes ? ` ${c.minutes}m` : ''),
    String(c.players),
    c.variant,
    x.firstEncounterSec! < 0 ? '-' : f1(x.firstEncounterSec!),
    f1(x.emptyRuns15!),
    f1(x.longestEmptySec!),
    [k.ownBlast, k.rivalBlast, k.teamBlast, k.vehicle, k.stageHazard, k.crush, k.melee]
      .map((v) => f1(v!))
      .join(' / '),
    `${f1(x.meanLiveGenerators!)} / ${f1(x.peakLiveGenerators!)} / ${x.liveGeneratorsPerFighter!.toFixed(2)}`,
    x.suppliesStart! > 0
      ? `${f1(x.suppliesOpened!)} of ${f1(x.suppliesStart!)}, ${f1(x.suppliesOpened60!)}, ${x.firstSupplyOpenedSec! < 0 ? '-' : f1(x.firstSupplyOpenedSec!)}`
      : '-',
    `${f1(x.pickupsCollected!)} / ${f1(x.pickupsWasted!)} / ${f1(x.pickupsBurned!)}`,
    `${a.slotSurvivalSpread.toFixed(2)} / ${a.slotSurvivalCv.toFixed(2)}`,
  ];
}

export function detailTable(cells: readonly Cell[]): string {
  const line = (r: string[]): string => `| ${r.join(' | ')} |`;
  return [
    line(DETAIL_HEADER),
    line(DETAIL_HEADER.map(() => '---')),
    ...cells.map((c) => line(detailRow(c))),
  ].join('\n');
}

/** Per-slot spawn fairness for one cell: survival share, credited kills and wins of every slot, as a markdown table. */
export function slotTable(c: Cell): string {
  const a = c.agg;
  const head = ['slot', 'mean alive share', 'mean kills', 'wins'];
  const line = (r: string[]): string => `| ${r.join(' | ')} |`;
  return [
    `${c.stage} ${c.game} ${c.players} bots, ${c.variant} (n = ${a.matches})`,
    '',
    line(head),
    line(head.map(() => '---')),
    ...a.slotSurvival.map((v, i) =>
      line([String(i), v.toFixed(2), a.slotKills[i]!.toFixed(2), String(a.slotWins[i]!)]),
    ),
  ].join('\n');
}
