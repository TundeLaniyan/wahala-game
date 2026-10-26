/**
 * City Rumble measurement harness (workstream C of the Rumble Evolution milestone).
 *
 * Runs headless bot matches for every stage x ruleset x player count x config variant, with the same
 * seeds for every variant, and prints one markdown table (means over the seeds) plus, with --json, the
 * per-match data. Metric definitions: scripts/rumbleMetrics/collector.ts. Everything except ms/tick is
 * deterministic per seed. Variants (scripts/rumbleMetrics/variants.ts): legacy (plus blast, 1 starting
 * generator, reach cap 10) and evolution (the current defaults); --config '<json>' adds an ad hoc one.
 *
 *   npx tsx scripts/rumble-metrics.ts --arenas rumbleOshodi,rumbleApapa,cityRumble \
 *       --cases survival:16,survival:32,deathmatch:16:5 --variants legacy,evolution --matches 4
 *
 * Options:
 *   --arenas a,b        stages (default rumbleOshodi,rumbleApapa,cityRumble)
 *   --cases g:n[:min]   ruleset:bots[:minutes for respawn rulesets] (default survival:16,survival:32,deathmatch:16:5)
 *   --variants v1,v2    named variants (default legacy,evolution)
 *   --config '{...}'    extra config override (DeepPartial<GameConfig> JSON) applied to every variant listed
 *                       as `<name>+` (e.g. --variants evolution+ runs the defaults plus this override)
 *   --matches N         seeds per cell (default 3); --seed S first seed (default 100)
 *   --difficulty d      bot level (standard by default; `mixed` = every third seat beginner)
 *   --sample T          spatial sample interval in ticks (default 6)
 *   --max-seconds S     stop each match after S play seconds (quick looks)
 *   --json [file]       also write per-match + aggregate JSON (stdout when no file is named)
 *   --quiet             no progress lines on stderr
 */
import { writeFileSync } from 'node:fs';
import type { DeepPartial, Difficulty, GameConfig, GameKind } from '../src/sim';
import { aggregate, markdownTable, runMetricsMatch } from './rumbleMetrics/run';
import type { Cell } from './rumbleMetrics/run';
import type { MatchMetrics } from './rumbleMetrics/collector';
import { DEFAULT_SAMPLE_TICKS } from './rumbleMetrics/collector';
import { variantByName } from './rumbleMetrics/variants';
import type { Variant } from './rumbleMetrics/variants';

const args = process.argv.slice(2);
const opt = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1]!.startsWith('--') ? args[i + 1]! : dflt;
};
const has = (name: string): boolean => args.includes(`--${name}`);

const arenas = opt('arenas', 'rumbleOshodi,rumbleApapa,cityRumble').split(',');
const cases = opt('cases', 'survival:16,survival:32,deathmatch:16:5')
  .split(',')
  .map((c) => {
    const [game, players, minutes] = c.split(':');
    return { game: game as GameKind, players: Number(players), minutes: minutes ? Number(minutes) : null };
  });
const matches = Number(opt('matches', '3'));
const seed0 = Number(opt('seed', '100'));
const difficulty = opt('difficulty', 'standard') as Difficulty | 'mixed';
const sample = Number(opt('sample', String(DEFAULT_SAMPLE_TICKS)));
const maxSeconds = has('max-seconds') ? Number(opt('max-seconds', '0')) : undefined;
const quiet = has('quiet');
const extra: DeepPartial<GameConfig> | undefined = has('config')
  ? JSON.parse(opt('config', '{}'))
  : undefined;

const variants: { label: string; variant: Variant; extra?: DeepPartial<GameConfig> }[] = opt(
  'variants',
  'legacy,evolution',
)
  .split(',')
  .map((raw) => {
    const plus = raw.endsWith('+');
    const variant = variantByName(plus ? raw.slice(0, -1) : raw);
    return plus ? { label: `${variant.name}+`, variant, extra } : { label: variant.name, variant };
  });

const cells: Cell[] = [];
const perMatch: {
  stage: string;
  game: GameKind;
  players: number;
  minutes: number | null;
  variant: string;
  metrics: MatchMetrics;
}[] = [];
const t0 = Date.now();
for (const stage of arenas) {
  for (const c of cases) {
    for (const v of variants) {
      const rows: MatchMetrics[] = [];
      for (let m = 0; m < matches; m++) {
        const row = runMetricsMatch({
          seed: seed0 + m,
          arenaId: stage,
          game: c.game,
          players: c.players,
          difficulty,
          durationSec: c.minutes ? c.minutes * 60 : null,
          variant: v.variant,
          config: v.extra,
          sampleTicks: sample,
          ...(maxSeconds !== undefined ? { maxPlayTicks: maxSeconds * 60 } : {}),
        });
        rows.push(row);
        perMatch.push({
          stage,
          game: c.game,
          players: c.players,
          minutes: c.minutes,
          variant: v.label,
          metrics: row,
        });
      }
      cells.push({
        stage,
        game: c.game,
        players: c.players,
        minutes: c.minutes,
        variant: v.label,
        agg: aggregate(rows),
      });
      if (!quiet)
        console.error(
          `${stage} ${c.game}:${c.players} ${v.label} done (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
        );
    }
  }
}

console.log(markdownTable(cells));
console.log(
  `\nmeans over ${matches} seeds from ${seed0}; bots: ${difficulty}; sample every ${sample} ticks. ` +
    'Columns: elims = eliminations per match; 1st s = mean time of the first elimination; <=30 / <=60 s = mean ' +
    'eliminations in the opening; engaged = share of fighter time with a living opponent within 6 tiles; in fire = ' +
    "share inside an opponent's live blast footprint; gens/fm = generator placements per fighter-minute; aimed = " +
    'placements whose footprint contained a living opponent; camp = share of fighter time in >= 5 s runs inside 3x3; ' +
    'near opp = mean distance to the nearest opponent; self = self-eliminations per match; top/med k and pw = kills ' +
    'and peak power of the top eliminator and the median fighter.',
);

if (has('json')) {
  const json = JSON.stringify({ args, cells, matches: perMatch }, null, 1);
  const file = opt('json', '');
  if (file) writeFileSync(file, json);
  else console.log(json);
}
