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
import type { CampaignLevel, GameState, Generator, Intents, Player, RaidId } from '../../src/sim';
import { raidDirectiveFor } from '../../src/sim/raid/directives';
import { RAID_TUNING } from '../../src/sim/raid/tuning';
import { isCalmMind } from '../../src/sim/systems/enemyPace';
import { bodyTiles, canSeeTile, inViewCone } from '../../src/sim/systems/sight';
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
  /** Calm reversals that are not at a waypoint of its route (no reason: churn). */
  calmChurn = 0;
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
        // a turn-back on a waypoint of its route (the end of a run or a beat) has a reason; anywhere else it is churn
        const route = s.territory?.minds[p.id]?.spec.patrol ?? [];
        if (reversed && !route.some((w) => w.x === prev.x && w.y === prev.y)) this.calmChurn++;
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

/**
 * The raid played by the fair-fight scripted human, with the movement tracker on. `detections` counts the times an
 * enemy's mind turned `alert` (the "!"). `night: false` plays a night raid without its light-based detection (the raid
 * AI's own sight; decision NL13 measurements).
 */
export function fullRaid(raidId: RaidId, level: CampaignLevel, seed: number, o: { night?: boolean } = {}) {
  const tr = new MovementTracker();
  const was = new Map<string, string>();
  let detections = 0;
  const r = playRaidFight({
    raidId,
    seed,
    difficulty: campaignEnemyLevel(level),
    level,
    ...(o.night === false ? { config: { nightSight: undefined } } : {}),
    onTick: (s) => {
      tr.onTick(s);
      for (const [id, m] of Object.entries(s.territory?.minds ?? {})) {
        if (m.state === 'alert' && was.get(id) !== 'alert') detections++;
        was.set(id, m.state);
      }
    },
  });
  return { ...r, tracker: tr, detections };
}

const WARMUP = RAID_TUNING.spawnWarnTicks + 3 + 240;

/** The raid walked to `t0` (warm-up with the human idle at the entrance). */
function atT0(raidId: RaidId, level: CampaignLevel, seed: number): { s: GameState; bots: Map<number, Bot> } {
  const r = raidWithBots(raidId, level, seed);
  // the seed also moves the moment of the drill (routes are deterministic: a later moment is a different situation)
  for (let t = 0; t < WARMUP + (seed - 1) * 23; t++) step(r.s, r.bots);
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

/** Debug: set to an array to receive one line per drill run (victim's moves and mind states). */
export const drillLog: { lines: string[] | null } = { lines: null };

/** Lays the generator at t0 and reports whether enemy `id` lost health to it. */
function trapRun(
  raidId: RaidId,
  level: CampaignLevel,
  seed: number,
  id: number,
  x: number,
  y: number,
  after = 0,
): boolean {
  const { s, bots } = atT0(raidId, level, seed);
  for (let t = 0; t < after; t++) step(s, bots);
  const victim = s.players[id]!;
  const hp0 = victim.vitals?.hp ?? 0;
  s.generators.push(generatorAt(s, x, y));
  const trace: string[] = [];
  for (let t = 0; t < s.config.generator.fuseTicks + 20; t++) {
    step(s, bots);
    if (drillLog.lines && t % 10 === 0)
      trace.push(`${t}:${victim.x},${victim.y}:${s.territory?.minds[id]?.state ?? '-'}`);
  }
  const hit = !victim.alive || (victim.vitals?.hp ?? 0) < hp0;
  drillLog.lines?.push(
    `${raidId} ${level} seed ${seed} seat ${id} gen ${x},${y} after ${after} ${hit ? 'TRAPPED' : 'escaped'} | ${trace.join(' ')}`,
  );
  return hit;
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
 * eight tiles round a seat are always in view), when a way out of its cross exists within 4 steps. Escaped = not hurt.
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
    if (!spot || !escapable(s, e.x, e.y, spot.x, spot.y)) continue;
    out.staged++;
    if (trapRun(raidId, level, seed, e.id, spot.x, spot.y)) out.trapped++;
  }
  return out;
}

/** Can a walker on (x, y) reach a tile outside the cross of a generator on (gx, gy) within 4 steps (a fair drill)? */
function escapable(s: GameState, x: number, y: number, gx: number, gy: number): boolean {
  const blast = previewBlast(
    { ...s, generators: [] } as GameState,
    generatorAt({ ...s } as GameState, gx, gy),
  );
  const w = s.width;
  let frontier = [{ x, y }];
  const seen = new Set([y * w + x]);
  for (let d = 1; d <= 4; d++) {
    const next: { x: number; y: number }[] = [];
    for (const t of frontier)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = t.x + dx;
        const ny = t.y + dy;
        const i = ny * w + nx;
        if (seen.has(i) || s.tiles[i] !== Tile.Empty || (nx === gx && ny === gy)) continue;
        if (s.players.some((o) => o.alive && o.x === nx && o.y === ny)) continue;
        if (!blast.has(i)) return true;
        seen.add(i);
        next.push({ x: nx, y: ny });
      }
    frontier = next;
  }
  return false;
}

/** The blast comes as the enemy reaches the corner, or this many ticks later (while it takes its look round it). */
const CORNER_DELAYS = [0, 12] as const;

/**
 * CORNER AMBUSH (the readable-route trap a player prepares): the generator goes two tiles past a corner of the
 * enemy's route (hidden behind the corner pillar from its approach; else the first tile past it), laid while the enemy cannot see that tile (walls, bodies, its calm view
 * cone) and is beyond hearing, timed to blow as it reaches the corner or `CORNER_DELAYS[1]` ticks later (two runs).
 * The first such corner of the next 10 s of its undisturbed walk is used. Trapped = it lost health to that blast.
 * Raids whose enemies have no route (before decision RA2) stage nothing.
 */
export function cornerDrill(raidId: RaidId, level: CampaignLevel, seed: number): DrillResult {
  const out: DrillResult = { staged: 0, trapped: 0 };
  for (const delay of CORNER_DELAYS) {
    const r = cornerDrillAt(raidId, level, seed, delay);
    out.staged += r.staged;
    out.trapped += r.trapped;
  }
  return out;
}

function cornerDrillAt(raidId: RaidId, level: CampaignLevel, seed: number, delay: number): DrillResult {
  const out: DrillResult = { staged: 0, trapped: 0 };
  const dry = atT0(raidId, level, seed);
  if (dry.s.generators.length > 0) return out;
  const fuse = dry.s.config.generator.fuseTicks;
  const horizon = 600;
  const track: { x: number; y: number; facing: Player['facing']; alive: boolean; calm: boolean }[][] = [];
  const views: { tiles: number[]; players: Player[] }[] = [];
  for (let t = 0; t <= horizon; t++) {
    track.push(
      dry.s.players.map((p) => ({
        x: p.x,
        y: p.y,
        facing: p.facing,
        alive: p.alive,
        calm: p.alive && calmOf(dry.s, p.id),
      })),
    );
    views.push({ tiles: [...dry.s.tiles], players: dry.s.players.map((p) => ({ ...p })) });
    step(dry.s, dry.bots);
  }
  const t0 = dry.s; // the board after the dry run (only its size and config are read)
  for (const p of t0.players) {
    if (p.enemyKind === undefined || ARMOURED.has(p.enemyKind) || !track[0]![p.id]!.calm) continue;
    const route = dry.s.territory?.minds[p.id]?.spec.patrol ?? [];
    if (route.length < 2) continue;
    const hearing = t0.config.campaignTactics?.perception[p.enemyKind].hearingTiles ?? 0;
    let pick: { x: number; y: number; lay: number } | null = null;
    for (let tc = fuse - delay + 1; tc <= horizon - delay && !pick; tc++) {
      const now = track[tc]![p.id]!;
      const prev = track[tc - 1]![p.id]!;
      if (!now.calm || (prev.x === now.x && prev.y === now.y)) continue;
      const i = route.findIndex((w) => w.x === now.x && w.y === now.y);
      if (i < 0) continue;
      const next = route[(i + 1) % route.length]!;
      const lay = tc + delay - fuse;
      const at = track[lay]![p.id]!;
      const v = views[lay]!;
      const view = { tiles: v.tiles, width: t0.width, height: t0.height, players: v.players };
      // two tiles past the corner (hidden behind the corner pillar from the approach), else the first tile past it
      const leg = Math.abs(next.x - now.x) + Math.abs(next.y - now.y);
      for (const k of [2, 1]) {
        if (k > leg || pick) continue;
        const g = { x: now.x + Math.sign(next.x - now.x) * k, y: now.y + Math.sign(next.y - now.y) * k };
        if (t0.tiles[g.y * t0.width + g.x] !== Tile.Empty) continue;
        if (v.players.some((o) => o.alive && o.x === g.x && o.y === g.y)) continue;
        // never a tile it walks over before the blast (a generator there would block its walk: a different drill)
        let crossed = false;
        for (let k2 = lay; k2 <= tc && !crossed; k2++)
          crossed = track[k2]![p.id]!.x === g.x && track[k2]![p.id]!.y === g.y;
        if (crossed) continue;
        if (Math.abs(at.x - g.x) + Math.abs(at.y - g.y) <= hearing) continue;
        const looker = { ...v.players[p.id]!, x: at.x, y: at.y, facing: at.facing };
        const cone = !at.calm || inViewCone(looker, g.x, g.y);
        if (cone && canSeeTile(view, at.x, at.y, g.x, g.y, 99, bodyTiles(view, p.id))) continue;
        pick = { ...g, lay };
      }
    }
    if (!pick) continue;
    out.staged++;
    if (trapRun(raidId, level, seed, p.id, pick.x, pick.y, pick.lay)) out.trapped++;
  }
  return out;
}
