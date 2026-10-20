/**
 * Headless bot-vs-bot evaluation. Plays seeded matches with no rendering and reports, per
 * difficulty: win share, draws, self-inflicted deaths, average survival and decision cost.
 *
 *   npm run simulate -- --matches 200 --players 4
 *   npm run simulate -- --duel easy medium --matches 100 --players 2
 *   npm run simulate -- --matches 50 --seed 1000 --mode crush --hazards --crowd
 *
 * Options
 *   --matches N        number of matches (default 100)
 *   --players P        2-4 competitors per match (default 4)
 *   --seed S           first seed; match i uses seed S + i (default 1)
 *   --duel A B         only these two difficulties, alternating seats (A, B, A, B)
 *   --arena ID         arena id (default danfoBusPark)
 *   --mode classic|crush
 *   --crowd            enable spectator throws
 *   --hazards          enable floor hazards (trap arenas)
 *   --verbose          print one line per match
 */
import { performance } from 'node:perf_hooks';
import { ARENAS, MAX_PLAYERS, MIN_PLAYERS } from '../src/sim';
import type { Difficulty, MatchMode } from '../src/sim';
import { runMatch } from '../src/ai/headless';

interface Options {
  matches: number;
  players: number;
  seed: number;
  duel: [Difficulty, Difficulty] | null;
  arena: string | undefined;
  mode: MatchMode;
  crowd: boolean;
  hazards: boolean;
  verbose: boolean;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function parseArgs(argv: string[]): Options {
  const o: Options = {
    matches: 100,
    players: 4,
    seed: 1,
    duel: null,
    arena: undefined,
    mode: 'classic',
    crowd: false,
    hazards: false,
    verbose: false,
  };
  const diff = (v: string | undefined): Difficulty => {
    if (!DIFFICULTIES.includes(v as Difficulty))
      throw new Error(`difficulty must be one of ${DIFFICULTIES.join(', ')}`);
    return v as Difficulty;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '--matches':
        o.matches = Number(argv[++i]);
        break;
      case '--players':
        o.players = Number(argv[++i]);
        break;
      case '--seed':
        o.seed = Number(argv[++i]);
        break;
      case '--duel':
        o.duel = [diff(argv[++i]), diff(argv[++i])];
        break;
      case '--arena':
        o.arena = argv[++i];
        break;
      case '--mode':
        o.mode = argv[++i] === 'crush' ? 'crush' : 'classic';
        break;
      case '--crowd':
        o.crowd = true;
        break;
      case '--hazards':
        o.hazards = true;
        break;
      case '--verbose':
        o.verbose = true;
        break;
      default:
        throw new Error(`unknown option ${a}`);
    }
  }
  if (!Number.isInteger(o.matches) || o.matches < 1) throw new Error('--matches must be a positive integer');
  if (!Number.isInteger(o.players) || o.players < MIN_PLAYERS + 1 || o.players > MAX_PLAYERS) {
    throw new Error(`--players must be ${MIN_PLAYERS + 1}-${MAX_PLAYERS}`);
  }
  if (o.arena && !(o.arena in ARENAS))
    throw new Error(`unknown arena ${o.arena}; try ${Object.keys(ARENAS).join(', ')}`);
  return o;
}

/** Seat line-up for match `i`: balanced across difficulties, rotated so no seat favours anybody. */
function lineup(o: Options, i: number): Difficulty[] {
  let base: Difficulty[];
  if (o.duel) {
    base = Array.from({ length: o.players }, (_, k) => o.duel![k % 2]!);
  } else if (o.players === 2) {
    const pairs: Difficulty[][] = [
      ['easy', 'medium'],
      ['medium', 'hard'],
      ['easy', 'hard'],
    ];
    base = pairs[i % 3]!;
  } else {
    base = [...DIFFICULTIES, DIFFICULTIES[Math.floor(i / 3) % 3]!].slice(0, o.players);
  }
  const rot = i % o.players;
  return base.map((_, k) => base[(k + rot) % base.length]!);
}

interface Tally {
  seats: number;
  wins: number;
  draws: number;
  deaths: number;
  selfKills: number;
  unassisted: number;
  survival: number;
  decideMs: number;
  decideCalls: number;
}

function main(): void {
  const o = parseArgs(process.argv.slice(2));
  const tally = new Map<Difficulty, Tally>();
  const get = (d: Difficulty): Tally => {
    let t = tally.get(d);
    if (!t) {
      t = {
        seats: 0,
        wins: 0,
        draws: 0,
        deaths: 0,
        selfKills: 0,
        unassisted: 0,
        survival: 0,
        decideMs: 0,
        decideCalls: 0,
      };
      tally.set(d, t);
    }
    return t;
  };
  let matchSeconds = 0;
  let timeouts = 0;
  let wins = 0;
  let draws = 0;
  const started = performance.now();

  for (let i = 0; i < o.matches; i++) {
    const difficulties = lineup(o, i);
    const out = runMatch({
      seed: o.seed + i,
      difficulties,
      arenaId: o.arena,
      settings: { mode: o.mode, crowdThrows: o.crowd, floorHazards: o.hazards },
      now: () => performance.now(),
    });
    matchSeconds += out.ticks / 60;
    if (out.timeout) timeouts++;
    if (out.winner !== null) wins++;
    if (out.draw) draws++;
    out.seats.forEach((seat, k) => {
      const t = get(seat.difficulty);
      t.seats++;
      t.survival += seat.survivedSeconds;
      if (out.winner === k) t.wins++;
      else if (out.draw && seat.alive) t.draws++;
      if (!seat.alive) t.deaths++;
      if (seat.suicide) t.selfKills++;
      if (seat.suicide && !seat.assisted) t.unassisted++;
    });
    for (const d of DIFFICULTIES) {
      get(d).decideMs += out.decideMs[d];
      get(d).decideCalls += out.decideCalls[d];
    }
    if (o.verbose) {
      const w = out.winner === null ? (out.draw ? 'draw' : '-') : `${difficulties[out.winner]}#${out.winner}`;
      console.log(
        `seed ${o.seed + i} [${difficulties.join(',')}] -> ${w} after ${(out.ticks / 60).toFixed(1)}s` +
          out.seats.map((s) => ` ${s.cause?.kind ?? 'alive'}${s.suicide ? '*' : ''}`).join(''),
      );
    }
  }

  const elapsed = (performance.now() - started) / 1000;
  const pct = (n: number, d: number): string =>
    d === 0 ? '   -' : `${((100 * n) / d).toFixed(1).padStart(5)}%`;
  console.log(
    `\n${o.matches} matches, ${o.players} players${o.duel ? `, duel ${o.duel[0]} vs ${o.duel[1]}` : ''}, ` +
      `mode ${o.mode}${o.crowd ? '+crowd' : ''}${o.hazards ? '+hazards' : ''}, seeds ${o.seed}..${o.seed + o.matches - 1}`,
  );
  console.log('difficulty  seats   wins  win%  draws  self-kill%  unassisted%  avg-survive  decide(us)');
  for (const d of DIFFICULTIES) {
    const t = tally.get(d);
    if (!t || t.seats === 0) continue;
    console.log(
      `${d.padEnd(10)} ${String(t.seats).padStart(6)} ${String(t.wins).padStart(6)} ${pct(t.wins, t.seats)} ` +
        `${String(t.draws).padStart(6)} ${pct(t.selfKills, t.seats).padStart(10)}  ${pct(t.unassisted, t.seats).padStart(11)} ` +
        `${(t.survival / t.seats).toFixed(1).padStart(10)}s  ${((1000 * t.decideMs) / Math.max(1, t.decideCalls)).toFixed(0).padStart(9)}`,
    );
  }
  console.log(
    `\nmatch length avg ${(matchSeconds / o.matches).toFixed(1)}s | decided ${wins} | draws ${draws} (timeouts ${timeouts}) | ` +
      `${(o.matches / elapsed).toFixed(1)} matches/s (${elapsed.toFixed(1)}s wall)`,
  );
  console.log(
    'self-kill% = eliminated by own generator/vehicle (a rival may have sealed the exit); unassisted% = nobody placed a generator nearby in the last 4s.',
  );
}

main();
