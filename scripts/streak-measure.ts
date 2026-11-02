/**
 * Kill-streak reward measurements (decisions GK1, VG2): what a GLOBAL KNOCKDOWN is worth in kills, and how the
 * VEHICLE GENERATOR's timeline plays out, through the real simulation with the real bots.
 *
 *   npm run streak-measure                    (about a minute)
 *   npm run streak-measure -- --matches 40    (fewer seeds)
 *
 * GLOBAL KNOCKDOWN, per knockdown duration (1.5 / 2 / 2.5 / 3 s): four bots (Standard level, a Survival match on the
 * Danfo Bus Park). Seat 0 is handed the reward 3 s in and the bots' own rule decides when to throw it. For every
 * USE the kills seat 0 gets in the next 10 s are compared with the SAME match (same seed, same tick) played
 * without the reward: the difference is the kills the use is worth ("extra kills per use"). Also printed: how many
 * uses killed 0 / 1 / 2 / 3 rivals, and how often the user died.
 */
import { createBot } from '../src/ai';
import { DEFAULT_CONFIG, createGame, observe, tick } from '../src/sim';
import type { Bot } from '../src/ai';
import type { GameState, Intents, SimEvent, VehicleKind } from '../src/sim';

const argv = process.argv.slice(2);
const flag = (name: string, d: number): number => {
  const i = argv.indexOf(name);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const MATCHES = flag('--matches', 80);
const WINDOW = 600; // 10 s after the throw
const HAND_OUT = 180; // the reward is handed to seat 0 3 s in

function start(seed: number, knockdownTicks: number): { s: GameState; bots: Record<number, Bot> } {
  const s = createGame({
    seed,
    players: ['streetBaller', 'lekkiBoy', 'campusQueen', 'streetBaller'].map((characterId, i) => ({
      name: `P${i}`,
      characterId: characterId as 'streetBaller',
      isBot: true,
    })),
    settings: { game: 'survival', stageHazards: false },
    config: { streaks: { enabled: true, globalKnockdown: { knockdownTicks } } },
  });
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  for (const p of s.players) p.protectedUntil = 0;
  const bots: Record<number, Bot> = {};
  for (let i = 0; i < 4; i++)
    bots[i] = createBot({ difficulty: 'standard', seed: seed * 31 + i, playerId: i });
  return { s, bots };
}

function step(s: GameState, bots: Record<number, Bot>): SimEvent[] {
  const intents: Intents = {};
  for (const [id, bot] of Object.entries(bots))
    if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
  return tick(s, intents);
}

interface Use {
  tick: number;
  kills: number;
  died: boolean;
}

/** Plays a match; returns the knockdown use (if the bot threw it) with seat 0's kills in the following window. */
function treated(seed: number, knockdownTicks: number): Use | null {
  const { s, bots } = start(seed, knockdownTicks);
  let use: Use | null = null;
  let killsAtUse = 0;
  for (let t = 0; t < 4000 && s.match.phase !== 'ended'; t++) {
    if (t === HAND_OUT) s.players[0]!.streakRewards.knockdown = true;
    const ev = step(s, bots);
    if (!use && ev.some((e) => e.type === 'streakRewardUsed' && e.playerId === 0)) {
      use = { tick: s.tick, kills: 0, died: false };
      killsAtUse = s.players[0]!.stats.kills;
    }
    if (use && s.tick >= use.tick + WINDOW) break;
  }
  if (!use) return null;
  use.kills = s.players[0]!.stats.kills - killsAtUse;
  use.died = !s.players[0]!.alive;
  return use;
}

/** The same match without the reward: seat 0's kills in [tick, tick + WINDOW]. */
function baseline(seed: number, knockdownTicks: number, from: number): number {
  const { s, bots } = start(seed, knockdownTicks);
  let kills0 = -1;
  for (let t = 0; t < 4000 && s.match.phase !== 'ended'; t++) {
    step(s, bots);
    if (s.tick === from) kills0 = s.players[0]!.stats.kills;
    if (s.tick >= from + WINDOW) break;
  }
  return kills0 < 0 ? 0 : s.players[0]!.stats.kills - kills0;
}

console.log(
  `# Streak reward measurements (${MATCHES} seeds per row, Standard bots, Survival, Danfo Bus Park)\n`,
);
console.log('## GLOBAL KNOCKDOWN\n');
console.log(
  '| knockdown | uses | kills/use | same match without it | extra kills/use | uses with 0 / 1 / 2 / 3 kills | user died in window |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const ticks of [90, 120, 150, 180]) {
  const uses: Use[] = [];
  let base = 0;
  for (let seed = 1; seed <= MATCHES; seed++) {
    const u = treated(seed, ticks);
    if (!u) continue;
    uses.push(u);
    base += baseline(seed, ticks, u.tick);
  }
  const n = uses.length || 1;
  const kills = uses.reduce((a, u) => a + u.kills, 0);
  const hist = [0, 1, 2, 3].map((k) => uses.filter((u) => Math.min(3, u.kills) === k).length);
  console.log(
    `| ${ticks / 60} s${ticks === DEFAULT_CONFIG.streaks.globalKnockdown.knockdownTicks ? ' (default)' : ''} | ${uses.length} | ${(kills / n).toFixed(2)} | ${(base / n).toFixed(2)} | ${((kills - base) / n).toFixed(2)} | ${hist.join(' / ')} | ${uses.filter((u) => u.died).length} |`,
  );
}

console.log('\n## VEHICLE GENERATOR timeline (a still rival in the middle row, owner in the far corner)\n');
console.log(
  '| vehicle | launch to release (ticks) | launch to boom (ticks) | target killed if it stays | target killed if it runs at the release |',
);
console.log('| --- | --- | --- | --- | --- |');
for (const kind of ['danfo', 'taxi', 'keke', 'okada'] as VehicleKind[]) {
  const row = (flee: boolean) => {
    const s = createGame({
      seed: 5,
      players: ['streetBaller', 'lekkiBoy'].map((characterId, i) => ({
        name: `P${i}`,
        characterId: characterId as 'streetBaller',
        isBot: false,
      })),
      settings: { game: 'classic', stageHazards: false },
      config: { vehicles: { allowed: ['danfo', 'taxi', 'keke', 'okada'] } },
    });
    s.tiles = s.tiles.map((t) => (t === 2 ? 0 : t));
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    for (const p of s.players) p.protectedUntil = 0;
    const [o, r] = [s.players[0]!, s.players[1]!];
    o.x = o.stepFromX = 14;
    o.y = o.stepFromY = 10;
    r.x = r.stepFromX = 7;
    r.y = r.stepFromY = 4;
    o.streakRewards.vehicleGenerator = kind;
    let launch = -1,
      release = -1,
      boom = -1,
      running = false;
    for (let t = 0; t < 700; t++) {
      const intents: Intents = t === 0 ? { 0: { special: true } } : {};
      if (flee && running && r.stepRemaining <= 1) intents[1] = { move: 'left' };
      const ev = tick(s, intents);
      for (const e of ev) {
        if (e.type === 'vehicleGeneratorLaunched') launch = s.tick;
        if (e.type === 'vehicleGeneratorReleased') {
          release = s.tick;
          running = true;
        }
        if (e.type === 'generatorExploded' && boom < 0) boom = s.tick;
      }
      if (boom >= 0) break;
    }
    for (let t = 0; t < 30; t++) tick(s, {});
    return { launch, release, boom, killed: !r.alive };
  };
  const still = row(false);
  const flee = row(true);
  console.log(
    `| ${kind} | ${still.release - still.launch} | ${still.boom - still.launch} | ${still.killed ? 'yes' : 'no'} | ${flee.killed ? 'yes' : 'no'} |`,
  );
}
