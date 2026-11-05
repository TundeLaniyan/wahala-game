/**
 * Campaign enemy attack harness shared by `scripts/enemy-balance.ts` and `tests/enemy-*.test.ts`: scenes with a human
 * and enemy seats, a scripted human who dodges what a player can see (cues, wind-ups), and the 60-second raid
 * measurement of decision EA5. Real simulation, no rendering; nothing here uses the clock or Math.random.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import { DIR_VEC, DIRS, createGame, observe, tick } from '../../src/sim';
import type {
  DeepPartial,
  Dir,
  Difficulty,
  EnemyKind,
  GameConfig,
  GameState,
  Intent,
  Intents,
  Projectile,
  SimEvent,
  Vitals,
} from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { applyCampaignHit } from '../../src/sim/systems/campaignDamage';

export const HZ = 60;

export const vitalsOf = (hp: number): Vitals => ({
  hp,
  maxHp: hp,
  invulnUntil: 0,
  lastHitTick: -1e9,
  lastHitBy: null,
  lastHitSource: null,
});

export interface EnemySpec {
  kind: EnemyKind;
  x: number;
  y: number;
  hp?: number;
}

export interface SceneOptions {
  human: { x: number; y: number; hp?: number };
  enemies: EnemySpec[];
  arenaId?: string;
  seed?: number;
  config?: DeepPartial<GameConfig>;
}

/** A playing match: seat 0 the human (team 0, campaign health), seats 1... enemies (team 1). Crates removed, stage off. */
export function enemyScene(o: SceneOptions): GameState {
  const arenaId = o.arenaId ?? (o.enemies.length > 3 ? 'rumbleOjuelegba' : 'danfoBusPark');
  const s = createGame({
    seed: o.seed ?? 1,
    arenaId,
    players: [
      { name: 'You', characterId: 'streetBaller', isBot: false, team: 0 },
      ...o.enemies.map((e, i) => ({
        name: `${e.kind}${i}`,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
        isBot: true,
        team: 1,
      })),
    ],
    settings: { stageHazards: false },
    config: o.config,
  });
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  const place = (id: number, x: number, y: number): void => {
    const p = s.players[id]!;
    p.x = p.stepFromX = x;
    p.y = p.stepFromY = y;
    p.stepRemaining = 0;
    p.protectedUntil = 0;
  };
  place(0, o.human.x, o.human.y);
  s.players[0]!.vitals = vitalsOf(o.human.hp ?? 3);
  o.enemies.forEach((e, i) => {
    place(i + 1, e.x, e.y);
    const p = s.players[i + 1]!;
    p.enemyKind = e.kind;
    p.capacity = 0;
    p.vitals = vitalsOf(e.hp ?? 2);
  });
  return s;
}

/** The first open interior tile whose four neighbours are all open (a spot a group can surround). */
export function openSpot(s: GameState, nearX: number, nearY: number): { x: number; y: number } {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  const open = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === Tile.Empty;
  for (let y = 1; y < s.height - 1; y++) {
    for (let x = 1; x < s.width - 1; x++) {
      if (
        ![
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ].every(([dx, dy]) => open(x + dx!, y + dy!))
      )
        continue;
      const d = Math.abs(x - nearX) + Math.abs(y - nearY);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  if (!best) throw new Error('no open spot');
  return best;
}

/** Puts the human on `spot` and spreads every enemy on a ring about 4-5 tiles away (nearest open floor on the way in). */
export function placeRing(s: GameState, spot: { x: number; y: number }): void {
  const me = s.players[0]!;
  me.x = me.stepFromX = spot.x;
  me.y = me.stepFromY = spot.y;
  const ring: [number, number][] = [
    [-5, 0],
    [5, 0],
    [0, -4],
    [0, 4],
    [-4, 3],
    [4, -3],
  ];
  s.players.slice(1).forEach((p, i) => {
    const [dx, dy] = ring[i % ring.length]!;
    let x = spot.x + dx;
    let y = spot.y + dy;
    for (let k = 0; k < 20 && !floor(s, x, y); k++) {
      x += Math.sign(spot.x - x);
      y += Math.sign(spot.y - y);
    }
    p.x = p.stepFromX = x;
    p.y = p.stepFromY = y;
  });
}

const floor = (s: GameState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === Tile.Empty;

/** Is the human on the unfinished part of this projectile's path? Returns the path index, else -1. */
function threatIndex(s: GameState, pr: Projectile, x: number, y: number): number {
  for (let i = pr.index; i < pr.path.length; i++) {
    if (pr.path[i] === y * s.width + x) return i;
  }
  return -1;
}

export interface HumanPolicy {
  /** Ticks between a cue becoming visible and the human reacting to it. */
  reactTicks: number;
  /** Keep this many tiles from the nearest enemy when nothing else is going on (0 = stand still). */
  kiteDistance: number;
}

export const DODGER: HumanPolicy = { reactTicks: 18, kiteDistance: 3 };
/** Stands still and never reacts (the worst case for the "no instant kill" bound). */
export const STILL: HumanPolicy = { reactTicks: Infinity, kiteDistance: -1 };

/** What a player who watches the screen does: leaves a projectile's line when its cue appears, steps back from a wind-up. */
export function humanIntent(s: GameState, policy: HumanPolicy = DODGER): Intent {
  const me = s.players[0]!;
  if (!me.alive || s.tick < me.dazedUntil || me.stepRemaining > 1 || policy.reactTicks === Infinity)
    return {};
  // 1. projectile lines
  const lines: Projectile[] = (s.projectiles ?? []).filter(
    (pr) => s.players[pr.ownerId]?.team !== me.team && threatIndex(s, pr, me.x, me.y) >= 0,
  );
  const seen = lines.filter((pr) => s.tick - pr.launchTick >= policy.reactTicks);
  const safeFromLines = (x: number, y: number): boolean =>
    floor(s, x, y) &&
    !(s.projectiles ?? []).some(
      (pr) => threatIndex(s, pr, x, y) >= 0 && s.players[pr.ownerId]?.team !== me.team,
    );
  if (seen.length > 0) {
    const pr = seen[0]!;
    const dir = pr.dir ?? 'right';
    const side: Dir[] = DIRS.filter((d) => d !== dir && d !== OPP[dir]);
    for (const d of side) if (safeFromLines(me.x + DIR_VEC[d].dx, me.y + DIR_VEC[d].dy)) return { move: d };
    if (floor(s, me.x + DIR_VEC[dir].dx, me.y + DIR_VEC[dir].dy)) return { move: dir };
    return {};
  }
  // 2. melee wind-ups and anyone adjacent: step away from the nearest enemy
  const foes = s.players.filter((p) => p.alive && p.id !== 0 && p.enemyKind !== undefined);
  const near = foes.reduce<GameState['players'][number] | null>(
    (best, p) => (best === null || dist(p, me) < dist(best, me) ? p : best),
    null,
  );
  if (!near) return {};
  if (dist(near, me) <= 1 || (policy.kiteDistance > 0 && dist(near, me) < policy.kiteDistance))
    return stepAway(s, me, foes, safeFromLines);
  return {};
}

const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** The neighbour tile that maximises the distance to the nearest enemy (ties: fixed direction order). */
function stepAway(
  s: GameState,
  me: GameState['players'][number],
  foes: GameState['players'],
  ok: (x: number, y: number) => boolean,
): Intent {
  let best: Dir | null = null;
  let bestScore = -Infinity;
  const nearest = (x: number, y: number): number => Math.min(...foes.map((f) => dist(f, { x, y })));
  const here = nearest(me.x, me.y);
  for (const d of DIRS) {
    const x = me.x + DIR_VEC[d].dx;
    const y = me.y + DIR_VEC[d].dy;
    if (!ok(x, y)) continue;
    // also prefer tiles with room to keep going (more open neighbours)
    const room = DIRS.filter((q) => floor(s, x + DIR_VEC[q].dx, y + DIR_VEC[q].dy)).length;
    const score = nearest(x, y) * 10 + room;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best !== null && nearest(me.x + DIR_VEC[best].dx, me.y + DIR_VEC[best].dy) >= here
    ? { move: best }
    : {};
}

// ---------------------------------------------------------------- the 60-second raid measurement (decision EA5)

export interface RaidResult {
  seconds: number;
  /** Health segments the human lost. */
  damage: number;
  /** Projectile launches / punches started, and how many reached a victim. */
  throws: number;
  punches: number;
  hits: number;
  /** Most projectiles launched in any one tick (must be <= 1) and the shortest gap between two launches of a group. */
  maxLaunchesPerTick: number;
  minLaunchGap: number;
  maxInFlight: number;
  /** The tick the human ran out of health (null: survived). */
  defeatedAt: number | null;
  events: SimEvent[];
}

export interface RaidOptions {
  enemies: EnemyKind[];
  seed?: number;
  seconds?: number;
  humanHp?: number;
  policy?: HumanPolicy;
  difficulty?: Difficulty;
  config?: DeepPartial<GameConfig>;
  /** Keep the events (tests); the measurement itself only counts. */
  keepEvents?: boolean;
}

/** 1 human (hp `humanHp`) against `enemies` played by the enemy bot; the human follows `humanIntent`. */
export function playRaid(o: RaidOptions): RaidResult {
  const s0 = enemyScene({
    human: { x: 7, y: 4, hp: o.humanHp ?? 99 },
    enemies: o.enemies.map((kind, i) => ({ kind, x: 0, y: 0, hp: 99 + i * 0 })),
    seed: o.seed,
    config: o.config,
    arenaId: o.enemies.length > 3 ? 'rumbleOjuelegba' : 'danfoBusPark',
  });
  const s = s0;
  placeRing(s, openSpot(s, Math.floor(s.width / 2), Math.floor(s.height / 2)));
  const bots: Record<number, Bot> = {};
  s.players.slice(1).forEach((p, i) => {
    bots[p.id] = createBot({
      difficulty: o.difficulty ?? 'standard',
      seed: (o.seed ?? 1) * 97 + i,
      playerId: p.id,
    });
  });
  const policy = o.policy ?? DODGER;
  const hp0 = s.players[0]!.vitals!.hp;
  const res: RaidResult = {
    seconds: o.seconds ?? 60,
    damage: 0,
    throws: 0,
    punches: 0,
    hits: 0,
    maxLaunchesPerTick: 0,
    minLaunchGap: Infinity,
    maxInFlight: 0,
    defeatedAt: null,
    events: [],
  };
  let lastLaunch = -Infinity;
  for (let t = 0; t < res.seconds * HZ; t++) {
    const intents: Intents = { 0: humanIntent(s, policy) };
    for (const [id, bot] of Object.entries(bots)) {
      const p = s.players[Number(id)]!;
      if (p.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
    }
    const ev = tick(s, intents);
    let launches = 0;
    for (const e of ev) {
      if (e.type === 'projectileLaunched') {
        launches++;
        res.throws++;
        res.minLaunchGap = Math.min(res.minLaunchGap, s.tick - lastLaunch);
        lastLaunch = s.tick;
      }
      if (e.type === 'attackStarted' && e.playerId !== 0) res.punches++;
      if (
        e.type === 'campaignHit' &&
        e.victimId === 0 &&
        (e.result === 'damaged' || e.result === 'dazed' || e.result === 'defeated')
      )
        res.hits++;
      if (e.type === 'campaignHit' && e.victimId === 0 && e.result === 'defeated' && res.defeatedAt === null)
        res.defeatedAt = s.tick;
    }
    res.maxLaunchesPerTick = Math.max(res.maxLaunchesPerTick, launches);
    res.maxInFlight = Math.max(res.maxInFlight, s.projectiles?.length ?? 0);
    if (o.keepEvents) res.events.push(...ev);
    if (res.defeatedAt !== null) {
      res.seconds = (s.tick - 0) / HZ;
      break;
    }
  }
  res.damage = hp0 - s.players[0]!.vitals!.hp;
  return res;
}

// ---------------------------------------------------------------- the duel (decision EA5): equal tools, player vs enemy

/** The first step of a shortest walk from (x, y) to a tile next to `goal` (null: already next to it or no way). */
export function stepTowards(
  s: GameState,
  from: { x: number; y: number },
  goal: { x: number; y: number },
): Dir | null {
  const w = s.width;
  const adjacent = (i: number): boolean => dist({ x: i % w, y: Math.floor(i / w) }, goal) === 1;
  const start = from.y * w + from.x;
  if (adjacent(start)) return null;
  const first = new Map<number, Dir>();
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    for (const d of DIRS) {
      const x = (u % w) + DIR_VEC[d].dx;
      const y = Math.floor(u / w) + DIR_VEC[d].dy;
      if (!floor(s, x, y)) continue;
      const v = y * w + x;
      if (seen.has(v)) continue;
      seen.add(v);
      first.set(v, u === start ? d : first.get(u)!);
      if (adjacent(v)) return first.get(v)!;
      queue.push(v);
    }
  }
  return null;
}

export interface DuelResult {
  winner: 'player' | 'enemy' | 'none';
  tick: number;
}

/**
 * The player (seat 0, walks up and presses B at every chance, the same tool: the Punch) against one enemy of `kind`, both
 * with `hp` segments. Each Punch that connects takes one segment from the other side (the player's hit is applied by
 * this harness through `applyCampaignHit`, one segment: combat-core defines it the same way). `gap` tiles apart.
 */
export function playDuelAgainstEnemy(
  kind: EnemyKind,
  seed: number,
  gap: number,
  hp = 3,
  seconds = 40,
): DuelResult {
  const s = enemyScene({
    human: { x: 3, y: 4, hp },
    enemies: [{ kind, x: 3 + gap, y: 4, hp }],
    seed,
    arenaId: 'danfoBusPark',
  });
  const me = s.players[0]!;
  me.attacks = { primary: 'push', secondary: null };
  me.facing = 'right';
  s.players[1]!.facing = 'left';
  const bot = createBot({ difficulty: 'standard', seed, playerId: 1 });
  for (let t = 0; t < seconds * HZ; t++) {
    const foe = s.players[1]!;
    const intents: Intents = {};
    const adj = dist(me, foe) === 1;
    if (adj) intents[0] = { special: true };
    else {
      const d = stepTowards(s, me, foe);
      if (d) intents[0] = { move: d };
    }
    if (foe.alive) intents[1] = bot.decide(observe(s, 1));
    const ev = tick(s, intents);
    for (const e of ev) {
      if (e.type === 'attackResolved' && e.playerId === 0 && e.hit && e.targetId === 1) {
        applyCampaignHit(
          s,
          { victimId: 1, byId: 0, source: 'player', damage: 1, dazeTicks: 0, knockback: null },
          [],
        );
      }
    }
    if (!me.alive || me.vitals!.hp <= 0) return { winner: 'enemy', tick: s.tick };
    if (!foe.alive || foe.vitals!.hp <= 0) return { winner: 'player', tick: s.tick };
  }
  return { winner: 'none', tick: s.tick };
}
