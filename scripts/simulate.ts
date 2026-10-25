/**
 * Headless bot-vs-bot evaluation. Plays seeded matches with no rendering and reports, per
 * difficulty: win share, draws, self-inflicted deaths, average survival and decision cost.
 *
 *   npm run simulate -- --matches 200 --players 4
 *   npm run simulate -- --duel expert standard --matches 100 --players 2 --seed 1000
 *   npm run simulate -- --matches 50 --seed 1000 --mode classic --crowd
 *   npm run simulate -- --arena cityRumble --players 32 --matches 10 --difficulty standard
 *   npm run simulate -- --arena mobileTest13x9 --players 4 --matches 50
 *
 * Options
 *   --matches N        number of matches (default 100)
 *   --players P        competitors per match (default 4; standard arenas 2-4, City Rumble up to 32)
 *   --seed S           first seed; match i uses seed S + i (default 1)
 *   --duel A B         only these two difficulties, alternating seats (A, B, A, B)
 *   --difficulty D     every seat plays D (like the app, where all bots share one difficulty)
 *   --arena ID         arena id (default danfoBusPark)
 *   --mode crush|classic  Wahala Crush (default: every real standard match has it) or no closing
 *   --crowd            enable spectator throws
 *   --no-hazards       switch the arena's stage hazards off (they are on in real matches)
 *   --verbose          print one line per match
 *   --wall             time ticks with the wall clock (default: this process's CPU time, which is
 *                      not inflated when other programs share the machine)
 */
import { performance } from 'node:perf_hooks';
import { ARENAS, DEFAULT_ARENA_ID, MAX_PLAYERS, MIN_PLAYERS } from '../src/sim';
import type { Difficulty, MatchMode } from '../src/sim';
import { runMatch } from '../src/ai/headless';

interface Options {
  matches: number;
  players: number;
  seed: number;
  duel: [Difficulty, Difficulty] | null;
  difficulty: Difficulty | null;
  arena: string | undefined;
  mode: MatchMode;
  crowd: boolean;
  hazards: boolean;
  verbose: boolean;
  wall: boolean;
}

const DIFFICULTIES: Difficulty[] = ['rookie', 'beginner', 'casual', 'standard', 'skilled', 'expert', 'nightmare'];

function parseArgs(argv: string[]): Options {
  const o: Options = {
    matches: 100,
    players: 4,
    seed: 1,
    duel: null,
    difficulty: null,
    arena: undefined,
    mode: 'crush',
    crowd: false,
    hazards: true,
    verbose: false,
    wall: false,
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
      case '--difficulty':
        o.difficulty = diff(argv[++i]);
        break;
      case '--arena':
        o.arena = argv[++i];
        break;
      case '--mode':
        o.mode = argv[++i] === 'classic' ? 'classic' : 'crush';
        break;
      case '--crowd':
        o.crowd = true;
        break;
      case '--no-hazards':
        o.hazards = false;
        break;
      case '--verbose':
        o.verbose = true;
        break;
      case '--wall':
        o.wall = true;
        break;
      default:
        throw new Error(`unknown option ${a}`);
    }
  }
  if (!Number.isInteger(o.matches) || o.matches < 1) throw new Error('--matches must be a positive integer');
  if (o.arena && !(o.arena in ARENAS))
    throw new Error(`unknown arena ${o.arena}; try ${Object.keys(ARENAS).join(', ')}`);
  const max = Math.min(MAX_PLAYERS, ARENAS[o.arena ?? DEFAULT_ARENA_ID]!.maxPlayers);
  if (!Number.isInteger(o.players) || o.players < MIN_PLAYERS + 1 || o.players > max) {
    throw new Error(`--players must be ${MIN_PLAYERS + 1}-${max} on this arena`);
  }
  return o;
}

/** Seat line-up for match `i`: balanced across difficulties, rotated so no seat favours anybody. */
function lineup(o: Options, i: number): Difficulty[] {
  let base: Difficulty[];
  if (o.difficulty) return Array.from({ length: o.players }, () => o.difficulty!);
  if (o.duel) {
    base = Array.from({ length: o.players }, (_, k) => o.duel![k % 2]!);
  } else if (o.players === 2) {
    const pairs: Difficulty[][] = [
      ['beginner', 'standard'],
      ['standard', 'expert'],
      ['beginner', 'expert'],
    ];
    base = pairs[i % 3]!;
  } else {
    // every level shows up: seats step two levels apart and the window slides one level per match
    base = Array.from({ length: o.players }, (_, k) => DIFFICULTIES[(2 * k + i) % DIFFICULTIES.length]!);
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

/** CPU time of this process in ms (user + system). */
function cpuMs(): number {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
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
  const tickMs: number[] = [];
  const halfAt: number[] = [];
  const twoAt: number[] = [];
  const causes: Record<string, number> = {};
  let seatsTotal = 0;
  let seatsPlaced = 0;
  let seatsMoved = 0;
  let seatsKilled = 0;

  for (let i = 0; i < o.matches; i++) {
    const difficulties = lineup(o, i);
    const out = runMatch({
      seed: o.seed + i,
      difficulties,
      arenaId: o.arena,
      settings: { mode: o.mode, crowdThrows: o.crowd, stageHazards: o.hazards },
      now: o.wall ? () => performance.now() : cpuMs,
    });
    for (const t of out.tickMs) tickMs.push(t);
    const half = Math.floor(o.players / 2);
    if (out.survivorsAt[half] !== undefined) halfAt.push(out.survivorsAt[half] / 60);
    if (out.survivorsAt[2] !== undefined) twoAt.push(out.survivorsAt[2] / 60);
    for (const seat of out.seats) {
      seatsTotal++;
      if (seat.placed > 0) seatsPlaced++;
      if (seat.tilesVisited >= 3) seatsMoved++;
      if (seat.kills > 0) seatsKilled++;
      if (seat.cause) causes[seat.cause.kind] = (causes[seat.cause.kind] ?? 0) + 1;
    }
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
      `${o.arena ?? DEFAULT_ARENA_ID}, mode ${ARENAS[o.arena ?? DEFAULT_ARENA_ID]!.forcedMode ?? o.mode}${o.crowd ? '+crowd' : ''}${o.hazards ? '' : ' (no stage hazards)'}, seeds ${o.seed}..${o.seed + o.matches - 1}`,
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
  const sorted = [...tickMs].sort((a, b) => a - b);
  const q = (arr: number[], f: number): number =>
    arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * f))]! : NaN;
  const avg = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  console.log(
    `tick cost (all bots + sim, ${o.wall ? 'wall clock' : 'CPU time'}, this machine): avg ${avg(sorted).toFixed(2)} ms | p50 ${q(sorted, 0.5).toFixed(2)} | p99 ${q(sorted, 0.99).toFixed(2)} | max ${q(sorted, 1).toFixed(2)} ms over ${sorted.length} ticks`,
  );
  const med = (arr: number[]): string =>
    arr.length
      ? `${q(
          [...arr].sort((a, b) => a - b),
          0.5,
        ).toFixed(0)}s`
      : '-';
  console.log(
    `survivors: half left at median ${med(halfAt)}, two left at median ${med(twoAt)} | ` +
      `seats that placed a generator ${((100 * seatsPlaced) / seatsTotal).toFixed(0)}%, moved ${((100 * seatsMoved) / seatsTotal).toFixed(0)}%, scored a kill ${((100 * seatsKilled) / seatsTotal).toFixed(0)}%`,
  );
  console.log(
    `eliminations by cause: ${Object.entries(causes)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
  );
}

main();
