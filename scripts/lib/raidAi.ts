/**
 * Classic raid enemy AI measurements (decisions RA1-RA9, docs/CLASSIC_RAID_AI.md). Everything here drives a REAL raid
 * (`buildRaidGame` at a campaign level, the real enemy bots) and only reads the state, except the drills' one generator
 * laid by hand. Works on any commit (the "before" numbers were taken with the same code on production 514be88).
 *
 *   - movement: direction REVERSALS (a completed step straight back the way the previous one came) per minute of CALM
 *     time (not chasing: before RA, the raid directive is `guard`; after, the mind is patrolling / watching / walking
 *     back), with the human standing still at the entrance (`idlePatrol`) and in a full scripted play (`fullRaid`);
 *   - route predictability: a calm step that goes the same way as the last time from the same approach (previous tile,
 *     tile) counts as predictable;
 *   - AMBUSH (`ambushDrill`): with the human far away, a generator appears on the tile a calm enemy would stand on when
 *     it blows, OUT OF ITS SIGHT when laid (walls and bodies, `canSeeTile`); trapped = hurt by that blast;
 *   - SEEN (`seenDrill`): a generator laid on the tile next to an enemy, in plain view: escaped = not hurt;
 *   - full play: the fair-fight scripted human (`playRaidFight`) completes the raid or not, health and lives lost.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import { buildRaidGame, campaignEnemyLevel, createGame, observe, tick } from '../../src/sim';
import type { CampaignLevel, GameState, Generator, Intents, RaidId } from '../../src/sim';
import { raidDirectiveFor } from '../../src/sim/raid/directives';
import { RAID_TUNING } from '../../src/sim/raid/tuning';
import { isCalmMind } from '../../src/sim/systems/enemyPace';
import { bodyTiles, canSeeTile } from '../../src/sim/systems/sight';
import { previewBlast } from '../../src/sim/systems/explosions';
import { Tile } from '../../src/sim/types';
import { playRaidFight } from './fairHuman';

export const RAIDS: readonly RaidId[] = [
  'warehouseDispatchDepot',
  'partsStoreroom',
  'railYardGoods',
  'recordsVault',
  'junctionToolShed',
  'standbyPlant',
];
export const LEVELS: readonly CampaignLevel[] = ['easy', 'normal', 'hard'];

/** Is enemy `id` calm (not engaged with the human) right now? Works with and without the raid territories. */
export function calmOf(s: GameState, id: number): boolean {
  const m = s.territory?.minds[id];
  if (m) return isCalmMind(m, s.tick);
  return raidDirectiveFor(s, id)?.kind !== 'chase';
}

/** Counts reversals per enemy while calm. Call `onTick` after every tick. */
export class MovementTracker {
  private readonly last = new Map<number, { x: number; y: number; dx: number; dy: number }>();
  calmTicks = 0;
  calmReversals = 0;
  calmSteps = 0;
  allTicks = 0;
  allReversals = 0;
  /** Tiles visited per enemy, in order. */
  readonly visits = new Map<number, number[]>();
  /** Calm steps whose (previous tile, tile) pair had been walked before, and those that then went the same way again. */
  repeatSeen = 0;
  repeatSame = 0;
  private readonly nextOf = new Map<string, number>();

  onTick(s: GameState): void {
    for (const p of s.players) {
      if (p.enemyKind === undefined) continue;
      if (!p.alive) {
        this.last.delete(p.id);
        continue;
      }
      const calm = calmOf(s, p.id);
      this.allTicks++;
      if (calm) this.calmTicks++;
      const prev = this.last.get(p.id);
      if (!prev) {
        this.last.set(p.id, { x: p.x, y: p.y, dx: 0, dy: 0 });
        continue;
      }
      if (prev.x === p.x && prev.y === p.y) continue;
      const dx = Math.sign(p.x - prev.x);
      const dy = Math.sign(p.y - prev.y);
      const reversed = dx === -prev.dx && dy === -prev.dy && (dx !== 0 || dy !== 0);
      if (reversed) this.allReversals++;
      if (calm) {
        this.calmSteps++;
        if (reversed) this.calmReversals++;
      }
      this.last.set(p.id, { x: p.x, y: p.y, dx, dy });
      const v = this.visits.get(p.id) ?? [];
      const here = p.y * s.width + p.x;
      if (calm && v.length >= 2) {
        const k = `${p.id}:${v[v.length - 2]}:${v[v.length - 1]}`;
        const before = this.nextOf.get(k);
        if (before !== undefined) {
          this.repeatSeen++;
          if (before === here) this.repeatSame++;
        }
        this.nextOf.set(k, here);
      }
      v.push(here);
      this.visits.set(p.id, v);
    }
  }

  /** Reversals per enemy-minute of calm time. */
  get calmPerMinute(): number {
    return this.calmTicks ? this.calmReversals / (this.calmTicks / 3600) : 0;
  }
  get allPerMinute(): number {
    return this.allTicks ? this.allReversals / (this.allTicks / 3600) : 0;
  }
}

/** A raid at `level` with its real enemy bots, the countdown skipped and the first waves on the board. */
export function raidWithBots(
  raidId: RaidId,
  level: CampaignLevel,
  seed: number,
): { s: GameState; bots: Map<number, Bot> } {
  const difficulty = campaignEnemyLevel(level);
  const s = createGame(buildRaidGame({ raidId, humanCharacter: 'streetBaller', seed, difficulty, level }));
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  const bots = new Map<number, Bot>();
  for (const p of s.players.slice(1))
    bots.set(p.id, createBot({ difficulty, seed: seed + p.id * 7919, playerId: p.id }));
  return { s, bots };
}

/** One tick: the enemy bots decide, the human does `human` (nothing by default). */
export function step(s: GameState, bots: Map<number, Bot>, human: Intents[number] = {}): void {
  const intents: Intents = { 0: human };
  for (const [id, bot] of bots) if (s.players[id]!.alive) intents[id] = bot.decide(observe(s, id));
  tick(s, intents);
}

/** The human stands at the entrance for `seconds` (after the first wave's spawn warning). */
export function idlePatrol(
  raidId: RaidId,
  level: CampaignLevel,
  seed: number,
  seconds = 60,
): MovementTracker {
  const { s, bots } = raidWithBots(raidId, level, seed);
  const tr = new MovementTracker();
  for (let t = 0; t < RAID_TUNING.spawnWarnTicks + 3; t++) step(s, bots);
  for (let t = 0; t < seconds * 60 && !s.raid!.outcome; t++) {
    step(s, bots);
    tr.onTick(s);
  }
  return tr;
}

/** The raid played by the fair-fight scripted human, with the movement tracker on. */
export function fullRaid(raidId: RaidId, level: CampaignLevel, seed: number) {
  const tr = new MovementTracker();
  const r = playRaidFight({
    raidId,
    seed,
    difficulty: campaignEnemyLevel(level),
    level,
    onTick: (s) => tr.onTick(s),
  });
  return { ...r, tracker: tr };
}

const WARMUP = RAID_TUNING.spawnWarnTicks + 3 + 240;

/** The raid walked to `t0` (warm-up with the human idle at the entrance). */
function atT0(raidId: RaidId, level: CampaignLevel, seed: number): { s: GameState; bots: Map<number, Bot> } {
  const r = raidWithBots(raidId, level, seed);
  for (let t = 0; t < WARMUP; t++) step(r.s, r.bots);
  return r;
}

/** A timed generator of the human's on (x, y), as if just laid (the drills' one hand-made change). */
function generatorAt(s: GameState, x: number, y: number): Generator {
  return {
    id: s.nextId++,
    ownerId: 0,
    x,
    y,
    stepFromX: x,
    stepFromY: y,
    range: s.players[0]!.range,
    pierce: false,
    square: 0,
    fromSpectator: false,
    mode: 'timed',
    timer: s.config.generator.fuseTicks,
    carriedBy: null,
    carryBonusUsed: false,
    slide: null,
    flight: null,
    triggered: false,
    placedTick: s.tick,
  };
}

const ARMOURED = new Set(['heavy', 'lieutenant', 'boss']);

export interface DrillResult {
  staged: number;
  trapped: number;
}

/** Lays the generator at t0 and reports whether enemy `id` lost health to it. */
function trapRun(
  raidId: RaidId,
  level: CampaignLevel,
  seed: number,
  id: number,
  x: number,
  y: number,
): boolean {
  const { s, bots } = atT0(raidId, level, seed);
  const victim = s.players[id]!;
  const hp0 = victim.vitals?.hp ?? 0;
  s.generators.push(generatorAt(s, x, y));
  for (let t = 0; t < s.config.generator.fuseTicks + 20; t++) step(s, bots);
  return !victim.alive || (victim.vitals?.hp ?? 0) < hp0;
}

/**
 * AMBUSH: for each calm first-wave enemy (not armoured), the dry run says where it stands when a generator laid now
 * would blow; a generator is laid now on a tile of its coming path that keeps it in the cross at that moment and that
 * it cannot see from where it stands (walls, bodies: `canSeeTile`). Trapped = it lost health to that blast. With
 * `unseenOnly` false any tile of its coming path counts (seen or not: the PATH drill).
 */
export function ambushDrill(
  raidId: RaidId,
  level: CampaignLevel,
  seed: number,
  unseenOnly = true,
): DrillResult {
  const out: DrillResult = { staged: 0, trapped: 0 };
  const dry = atT0(raidId, level, seed);
  if (dry.s.generators.length > 0) return out;
  const fuse = dry.s.config.generator.fuseTicks;
  const view0 = {
    tiles: [...dry.s.tiles],
    width: dry.s.width,
    height: dry.s.height,
    players: dry.s.players.map((p) => ({ ...p })),
  };
  const calm0 = dry.s.players.map((p) => p.alive && calmOf(dry.s, p.id));
  const track: { x: number; y: number; calm: boolean; alive: boolean }[][] = [];
  for (let t = 0; t <= fuse; t++) {
    track.push(
      dry.s.players.map((p) => ({ x: p.x, y: p.y, calm: p.alive && calmOf(dry.s, p.id), alive: p.alive })),
    );
    step(dry.s, dry.bots);
  }
  for (const p0 of view0.players) {
    if (p0.enemyKind === undefined || !calm0[p0.id] || ARMOURED.has(p0.enemyKind)) continue;
    const end = track[fuse]![p0.id]!;
    if (!end.alive || !end.calm) continue;
    let pick: { x: number; y: number } | null = null;
    for (let k = fuse - 6; k >= fuse - 60 && !pick; k -= 6) {
      const q = track[k]![p0.id]!;
      if (q.x === p0.x && q.y === p0.y) continue;
      if (unseenOnly && canSeeTile(view0, p0.x, p0.y, q.x, q.y, 99, bodyTiles(view0, p0.id))) continue;
      if (view0.players.some((o) => o.id !== p0.id && o.alive && o.x === q.x && o.y === q.y)) continue;
      const g = generatorAt({ ...dry.s, nextId: 0 } as GameState, q.x, q.y);
      const blast = previewBlast({ ...dry.s, tiles: view0.tiles, generators: [] } as GameState, g);
      if (blast.has(end.y * dry.s.width + end.x)) pick = q;
    }
    if (!pick) continue;
    out.staged++;
    if (trapRun(raidId, level, seed, p0.id, pick.x, pick.y)) out.trapped++;
  }
  return out;
}

/**
 * SEEN: a generator appears on an open tile next to a calm first-wave enemy (not armoured), in its plain view (the
 * eight tiles round a seat are always in view). Escaped = not hurt by it.
 */
export function seenDrill(raidId: RaidId, level: CampaignLevel, seed: number): DrillResult {
  const out: DrillResult = { staged: 0, trapped: 0 };
  const { s } = atT0(raidId, level, seed);
  const w = s.width;
  for (const e of s.players) {
    if (e.enemyKind === undefined || !e.alive || !calmOf(s, e.id) || ARMOURED.has(e.enemyKind)) continue;
    if (e.stepRemaining > 0) continue;
    const spot = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const
    )
      .map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy }))
      .find(
        (t) =>
          s.tiles[t.y * w + t.x] === Tile.Empty &&
          !s.players.some((o) => o.alive && o.x === t.x && o.y === t.y),
      );
    if (!spot) continue;
    out.staged++;
    if (trapRun(raidId, level, seed, e.id, spot.x, spot.y)) out.trapped++;
  }
  return out;
}
