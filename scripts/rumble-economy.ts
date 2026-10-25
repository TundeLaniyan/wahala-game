/**
 * City Rumble economy check (workstream C): headless bot batches in a Rumble ruleset, reporting how the
 * elimination economy spreads power. For every match: the outcome, how long it took, and for the top
 * eliminators versus the low scorers still standing late, their power at the end (capacity, range,
 * Square tier, Armour, Okada, kills).
 *
 *   npx tsx scripts/rumble-economy.ts --matches 4 --players 32 --game survival --difficulty standard
 */
import { createGame, observe, tick } from '../src/sim';
import type { Difficulty, GameKind, Intents, Player } from '../src/sim';
import { createBot } from '../src/ai';

interface Opts {
  matches: number;
  players: number;
  game: GameKind;
  difficulty: Difficulty;
  seed: number;
}

function parse(argv: string[]): Opts {
  const o: Opts = { matches: 4, players: 32, game: 'survival', difficulty: 'standard', seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--matches') o.matches = Number(argv[++i]);
    else if (a === '--players') o.players = Number(argv[++i]);
    else if (a === '--game') o.game = argv[++i] as GameKind;
    else if (a === '--difficulty') o.difficulty = argv[++i] as Difficulty;
    else if (a === '--seed') o.seed = Number(argv[++i]);
  }
  return o;
}

/** A single number for "how strong is this fighter": the reward items it holds above the start. */
export function power(p: Readonly<Player>, base: { range: number; capacity: number }): number {
  return (
    p.capacity -
    base.capacity +
    (p.range - base.range) +
    p.speedLevel +
    p.squareTier * 2 +
    p.armour * 2 +
    (p.mounted ? 2 : 0) +
    (p.contact ? 1 : 0) +
    (p.remote ? 1 : 0) +
    (p.hasVoucher ? 1 : 0)
  );
}

const fmt = (p: Readonly<Player>): string =>
  `k${p.stats.kills} cap${p.capacity} rng${p.range} sq${p.squareTier} arm${p.armour}${p.mounted ? ' okada' : ''}${p.contact ? ` ${p.contact}` : ''}${p.remote ? ' remote' : ''}`;

function main(): void {
  const o = parse(process.argv.slice(2));
  const rows: string[] = [];
  let ended = 0;
  let wins = 0;
  const topPower: number[] = [];
  const hiderPower: number[] = [];
  const t0 = Date.now();
  for (let m = 0; m < o.matches; m++) {
    const seed = o.seed + m;
    const state = createGame({
      seed,
      arenaId: 'cityRumble',
      settings: { game: o.game },
      players: Array.from({ length: o.players }, (_, i) => ({
        name: `b${i}`,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3],
        isBot: true,
        difficulty: o.difficulty,
      })),
    });
    const bots = state.players.map((_, i) => createBot({ difficulty: o.difficulty, seed: seed * 7919 + i * 104729 + 17, playerId: i }));
    const base = { range: state.config.generator.baseRange, capacity: state.config.generator.baseCapacity };
    const intents: Intents = {};
    const cap = state.config.match.countdownTicks + state.config.match.durationTicks + 120;
    // snapshot of the field when only 4 are left (the showdown)
    let showdown: Player[] | null = null;
    while (state.match.phase !== 'ended' && state.tick < cap) {
      for (let i = 0; i < state.players.length; i++) {
        if (!state.players[i]!.alive) {
          delete intents[i];
          continue;
        }
        intents[i] = bots[i]!.decide(observe(state, i));
      }
      tick(state, intents);
      if (!showdown && state.players.filter((p) => p.alive).length <= 4)
        showdown = state.players.filter((p) => p.alive).map((p) => structuredClone(p));
    }
    if (state.match.phase === 'ended') ended++;
    const res = state.match.result;
    if (res?.kind === 'win') wins++;
    const finalists = showdown ?? state.players.filter((p) => p.alive);
    const byKills = [...finalists].sort((a, b) => b.stats.kills - a.stats.kills || a.id - b.id);
    const top = byKills[0];
    const low = byKills[byKills.length - 1];
    if (top && low && top !== low) {
      topPower.push(power(top, base));
      hiderPower.push(power(low, base));
    }
    const leader = [...state.players].sort((a, b) => b.stats.kills - a.stats.kills || a.id - b.id)[0]!;
    rows.push(
      `seed ${seed}: ${res ? (res.kind === 'win' ? `win b${res.winnerId}` : `draw (${'reason' in res ? res.reason : ''})`) : 'NO RESULT'} ` +
        `after ${(state.match.playTicks / 60).toFixed(0)}s | leader ${fmt(leader)} | showdown: ${byKills.map(fmt).join(' / ')}`,
    );
  }
  for (const r of rows) console.log(r);
  const avg = (a: number[]): string => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
  console.log(
    `\n${o.matches} x ${o.players} ${o.difficulty} bots, ${o.game}: ${ended}/${o.matches} ended (${wins} wins), ` +
      `showdown power: top eliminator ${avg(topPower)} vs fewest kills ${avg(hiderPower)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
}

main();
