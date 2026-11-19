/**
 * Generator-trap drills for the campaign tactics layer (docs/CAMPAIGN_SECTOR_AI.md "Measurements", decisions SA3-SA12).
 * A scripted human with ORDINARY intents only (walk, A = lay a generator, B = punch) against REAL enemy bots
 * (`createBot` -> the enemy controller, at the campaign level's enemy bot level) with their real territories, on the
 * Academy pillar board (Danfo Bus Park emptied of crates: open lanes on every even row and column) with the field
 * missions' radial blast. Real simulation, no rendering, no clock, no Math.random. Used by
 * `tests/campaign-tactics-drill.test.ts` and `npm run sector-ai`.
 *
 *   ambush  an UNAWARE patroller walks (2,2) -> (12,2) -> (12,8) and back; the human waits round the pillar block at
 *           (14,4) and, when the patroller reaches the far end (2,2) of its lane, lays a generator at (12,4), just
 *           round the corner where the route turns south (it pauses at the corner facing on), and hides at (14,6)
 *   bait    the human stands next to a pursuing brawler, steps back out of reach when it winds up (a visible miss),
 *           steps in while it is planted in its recovery, lays a generator under his own feet (his body hides it),
 *           punches once (stagger, knockback, slow) and leaves late, when about 0.75 s of fuse is left
 *   seen    a BADLY placed generator: laid in plain view two tiles from an idle enemy, the human leaving at once (the
 *           enemy should escape it)
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import {
  DIRS,
  DIR_VEC,
  addEnemyMind,
  campaignEnemyLevel,
  campaignTacticsLayer,
  createVitals,
  mergeLayers,
  observe,
  tick,
  ENEMY_VARIANTS,
  tacticsEnemyStepTicks,
} from '../../src/sim';
import type {
  CampaignLevel,
  DeepPartial,
  Dir,
  EnemyVariantId,
  GameConfig,
  GameState,
  Intent,
  Intents,
  SimEvent,
  TerritoryDef,
} from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { enemyScene } from './enemyScene';
import { classicLanes } from './trapBoard';

export interface DrillEnemy {
  variant: EnemyVariantId;
  at: [number, number];
  territory?: TerritoryDef;
}

/** The field missions' radial blast on the drill board. */
const RADIAL: DeepPartial<GameConfig> = { generator: { blastMode: 'radial' } };

/** A playing scene with the campaign tactics layer of `level`, enemy seats with their variants, health and minds. */
export function tacticsScene(o: {
  level: CampaignLevel;
  human: [number, number];
  enemies: DrillEnemy[];
  seed: number;
  humanHp?: number;
}): { s: GameState; bots: Record<number, Bot> } {
  const layer = campaignTacticsLayer(o.level) as unknown as DeepPartial<GameConfig>;
  const s = enemyScene({
    human: { x: o.human[0], y: o.human[1], hp: o.humanHp ?? 99 },
    enemies: o.enemies.map((e) => ({ kind: ENEMY_VARIANTS[e.variant].base, x: e.at[0], y: e.at[1] })),
    seed: o.seed,
    arenaId: 'danfoBusPark',
    config: mergeLayers<GameConfig>(layer, RADIAL),
  });
  classicLanes(s);
  const t = s.config.campaignTactics!;
  const bots: Record<number, Bot> = {};
  o.enemies.forEach((e, i) => {
    const p = s.players[i + 1]!;
    p.enemyVariant = e.variant;
    p.vitals = createVitals(t.enemyHp[p.enemyKind!]);
    addEnemyMind(s, p.id, { x: e.at[0], y: e.at[1] }, e.territory);
    bots[p.id] = createBot({
      difficulty: campaignEnemyLevel(o.level),
      seed: o.seed * 7919 + p.id * 31,
      playerId: p.id,
    });
  });
  return { s, bots };
}

/** One tick with every living enemy bot deciding from its own observation. */
export function stepScene(s: GameState, bots: Record<number, Bot>, human: Intent = {}): SimEvent[] {
  const intents: Intents = { 0: human };
  for (const [id, bot] of Object.entries(bots))
    if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
  return tick(s, intents);
}

const open = (s: GameState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === Tile.Empty;

/** The first step of a shortest walk from the human to (tx, ty) over open floor, around generators. Null = there. */
export function stepToward(s: GameState, tx: number, ty: number): Dir | null {
  const me = s.players[0]!;
  if (me.x === tx && me.y === ty) return null;
  const w = s.width;
  const gens = new Set(s.generators.map((g) => g.y * w + g.x));
  const goal = ty * w + tx;
  const start = me.y * w + me.x;
  const first = new Map<number, Dir>();
  const queue = [start];
  const seen = new Set([start]);
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    for (const d of DIRS) {
      const x = (u % w) + DIR_VEC[d].dx;
      const y = Math.floor(u / w) + DIR_VEC[d].dy;
      const v = y * w + x;
      if (seen.has(v) || !open(s, x, y) || (gens.has(v) && v !== goal)) continue;
      seen.add(v);
      first.set(v, u === start ? d : first.get(u)!);
      if (v === goal) return first.get(v)!;
      queue.push(v);
    }
  }
  return null;
}

export interface DrillResult {
  /** The enemy was inside the blast footprint when it went off (or took its blast). */
  caught: boolean;
  /** The enemy lost health to the blast or was defeated by it. */
  hit: boolean;
  defeated: boolean;
  /** The human took his own blast (a failed drill). */
  selfHit: boolean;
  /** The drill never laid its generator (the scripted situation did not arise). */
  void: boolean;
}

function scoreBlast(ev: SimEvent[], enemyId: number, res: DrillResult): void {
  for (const e of ev) {
    if (e.type !== 'campaignHit' || e.source !== 'blast') continue;
    if (e.victimId === enemyId && (e.result === 'damaged' || e.result === 'defeated')) {
      res.hit = true;
      if (e.result === 'defeated') res.defeated = true;
    }
    if (e.victimId === 0 && e.result === 'damaged') res.selfHit = true;
  }
}

const FUSE_WAIT = 180 + 60;
const TRACE = typeof process !== 'undefined' && process.env.DRILL_TRACE === '1';

function trace(s: GameState, label: string, ev: SimEvent[]): void {
  if (!TRACE) return;
  const e = s.players[1]!;
  const h = s.players[0]!;
  const m = s.territory?.minds[1];
  const g = s.generators.find((o) => o.ownerId === 0);
  const notes = ev
    .filter((x) => x.type === 'enemyCue' || x.type === 'campaignHit')
    .map((x) => (x.type === 'enemyCue' ? x.cue : `${x.type}:${x.victimId}:${x.result}`))
    .join(',');
  if (s.tick % 4 === 0 || notes)
    console.log(
      `${s.tick} ${label} H${h.x},${h.y} E${e.x},${e.y} f=${e.facing} ${m?.state ?? '-'} wp${m?.waypoint ?? '-'} gen=${g?.timer ?? '-'} root=${Math.max(0, e.rootedUntil - s.tick)} ${notes}`,
    );
}

/** Ticks from the far end of the ambush route to standing at its corner for the Normal agbero (pause 42, 11 tiles of 14 ticks). */
const NORMAL_TO_CORNER = 42 + 11 * 14;

/** ambush: lay just round the corner of an unaware patroller's route and wait out of sight (see the file header). */
export function ambushDrill(level: CampaignLevel, variant: EnemyVariantId, seed: number): DrillResult {
  const { s, bots } = tacticsScene({
    level,
    seed,
    human: [14, 4],
    enemies: [
      {
        variant,
        at: [2, 2],
        territory: {
          patrol: [
            [2, 2],
            [12, 2],
            [12, 8],
          ],
        },
      },
    ],
  });
  const res: DrillResult = { caught: false, hit: false, defeated: false, selfHit: false, void: true };
  const mind = () => s.territory!.minds[1]!;
  // the human learned this patroller's pace by watching it (decisions RC1-RC2: a calm walk of the level's step time + the
  // calm extra): he lays the generator on its lane far enough down that the 3 s fuse ends as it walks through, whatever
  // the level (Easy walks slower, Hard faster), and waits a little when it is slow
  const cfg = s.config.campaignTactics!;
  const calm =
    tacticsEnemyStepTicks(cfg, { enemyKind: ENEMY_VARIANTS[variant].base, enemyVariant: variant }) +
    cfg.territory.patrolStepExtraTicks;
  const toCorner = cfg.territory.patrolPauseTicks + 11 * calm; // from reaching the far end to standing at (12, 3)
  const early = NORMAL_TO_CORNER - toCorner; // ticks the fuse would end BEFORE it gets there, against the Normal agbero the drill was made for
  // a slow patroller (Easy) is waited for; a faster one is caught at the same corner (the blast is wide enough)
  const gy = 4;
  const wait = early < 0 ? -early : 0;
  // the human's timing varies a little per seed (a person is not a metronome)
  const late = (seed % 4) * 3 + wait;
  let phase: 'wait' | 'go' | 'lay' | 'retreat' = 'wait';
  let laidAt = -1;
  let seenAtEnd = -1;
  for (let i = 0; i < 2400; i++) {
    const e = s.players[1]!;
    const me = s.players[0]!;
    let intent: Intent = {};
    if (phase === 'wait') {
      // the patroller reached the far end of its lane (it pauses there, facing away): go
      const m = mind();
      if (seenAtEnd < 0 && m.state === 'patrol' && e.x === 2 && e.y === 2 && m.waypoint === 1)
        seenAtEnd = s.tick;
      if (seenAtEnd >= 0 && s.tick >= seenAtEnd + late) phase = 'go';
    }
    if (phase === 'go') {
      const d = stepToward(s, 12, gy);
      if (d) intent = { move: d };
      else phase = 'lay';
    }
    if (phase === 'lay') {
      intent = { place: true };
      if (s.generators.some((g) => g.ownerId === 0)) {
        phase = 'retreat';
        laidAt = s.tick;
        res.void = false;
      }
    }
    if (phase === 'retreat') {
      // round the pillar block, out of the disc and out of the corner's sight
      const d = me.x < 14 ? stepToward(s, 14, gy) : stepToward(s, 14, Math.min(8, gy + 2));
      intent = d ? { move: d } : {};
    }
    if (!e.alive) break;
    const ev = stepScene(s, bots, intent);
    trace(s, phase, ev);
    scoreBlast(ev, 1, res);
    if (laidAt >= 0 && s.tick > laidAt + FUSE_WAIT) break;
  }
  res.caught = res.hit;
  return res;
}

/** bait: make a brawler swing at the air, lay in its recovery, punch once, leave late (see the file header). */
export function baitDrill(level: CampaignLevel, variant: EnemyVariantId, seed: number): DrillResult {
  const { s, bots } = tacticsScene({
    level,
    seed,
    human: [6, 6],
    enemies: [{ variant, at: [8, 6], territory: { radius: 2 } }],
  });
  const res: DrillResult = { caught: false, hit: false, defeated: false, selfHit: false, void: true };
  const me = () => s.players[0]!;
  const en = () => s.players[1]!;
  let phase: 'close' | 'dodge' | 'in' | 'lay' | 'hold' | 'leave' = 'close';
  let laidAt = -1;
  let anchor = { x: 6, y: 6 };
  const leaveFuse = 45 + (seed % 3) * 3;
  let punched = false;
  let exit: { x: number; y: number } | null = null;
  for (let i = 0; i < 2400; i++) {
    const h = me();
    const e = en();
    if (!e.alive) break;
    let intent: Intent = {};
    const adjacent = Math.abs(h.x - e.x) + Math.abs(h.y - e.y) === 1;
    if (phase === 'close') {
      if (e.attack !== null && adjacent) {
        phase = 'dodge';
        anchor = { x: h.x, y: h.y };
      }
    }
    if (phase === 'dodge') {
      // step straight away from the enemy, out of reach; come back once it is planted after the miss
      const away = { x: h.x + Math.sign(h.x - e.x), y: h.y + Math.sign(h.y - e.y) };
      if (e.attack !== null) {
        const d = open(s, away.x, away.y) ? stepToward(s, away.x, away.y) : null;
        if (d && h.stepRemaining === 0 && h.x === anchor.x && h.y === anchor.y) intent = { move: d };
      } else if (s.tick < e.rootedUntil) phase = 'in';
      else phase = 'close';
    }
    if (phase === 'in') {
      if (adjacent) phase = 'lay';
      else {
        const d = stepToward(s, anchor.x, anchor.y);
        intent = d ? { move: d } : {};
        if (s.tick >= e.rootedUntil) phase = 'close';
      }
    }
    if (phase === 'lay') {
      intent = { place: true };
      if (s.generators.some((g) => g.ownerId === 0)) {
        phase = 'hold';
        laidAt = s.tick;
        res.void = false;
      }
    }
    const g = s.generators.find((o) => o.ownerId === 0);
    if (phase === 'hold') {
      if (!g || g.timer <= leaveFuse) phase = 'leave';
      else if (!punched && adjacent && s.tick >= h.skillReadyTick) {
        intent = { special: true };
        punched = true;
      }
    }
    if (phase === 'leave' && g && !exit) {
      // three tiles out along a lane, the one farthest from the enemy (chosen once: no dithering)
      let best: { x: number; y: number } | null = null;
      for (const d of DIRS) {
        const x = g.x + DIR_VEC[d].dx * 3;
        const y = g.y + DIR_VEC[d].dy * 3;
        if (!open(s, x, y) || (x === e.x && y === e.y)) continue;
        if (!best || Math.abs(x - e.x) + Math.abs(y - e.y) > Math.abs(best.x - e.x) + Math.abs(best.y - e.y))
          best = { x, y };
      }
      exit = best;
    }
    if (phase === 'leave' && exit) {
      const d = stepToward(s, exit.x, exit.y);
      intent = d ? { move: d } : {};
    }
    const ev = stepScene(s, bots, intent);
    trace(s, phase, ev);
    scoreBlast(ev, 1, res);
    if (laidAt >= 0 && s.tick > laidAt + FUSE_WAIT) break;
  }
  res.caught = res.hit;
  return res;
}

/**
 * counter: against an enemy that WATCHES placements (keen trap sense, or any brawler on Hard) the bait above fails, so the
 * human jabs the wind-up instead (the stagger cuts it short and a reeling enemy notices nothing), lays the generator
 * under his feet in the same breath, holds, and leaves late.
 */
export function counterDrill(level: CampaignLevel, variant: EnemyVariantId, seed: number): DrillResult {
  const { s, bots } = tacticsScene({
    level,
    seed,
    human: [6, 6],
    enemies: [{ variant, at: [8, 6], territory: { radius: 2 } }],
  });
  const res: DrillResult = { caught: false, hit: false, defeated: false, selfHit: false, void: true };
  const leaveFuse = 45 + (seed % 3) * 3;
  let phase: 'close' | 'jab' | 'lay' | 'hold' | 'leave' = 'close';
  let laidAt = -1;
  let exit: { x: number; y: number } | null = null;
  for (let i = 0; i < 2400; i++) {
    const h = s.players[0]!;
    const e = s.players[1]!;
    if (!e.alive) break;
    let intent: Intent = {};
    const adjacent = Math.abs(h.x - e.x) + Math.abs(h.y - e.y) === 1;
    if (phase === 'close' && e.attack !== null && adjacent && s.tick >= h.skillReadyTick) phase = 'jab';
    if (phase === 'jab') {
      intent = { special: true };
      if (s.tick < e.dazedUntil) phase = 'lay';
      else if (e.attack === null && h.attack === null && s.tick >= e.rootedUntil) phase = 'close';
    }
    if (phase === 'lay') {
      intent = { place: true };
      if (s.generators.some((g) => g.ownerId === 0)) {
        phase = 'hold';
        laidAt = s.tick;
        res.void = false;
      } else if (s.tick >= e.dazedUntil) phase = 'close'; // too slow: the stagger is over, try again
    }
    const g = s.generators.find((o) => o.ownerId === 0);
    if (phase === 'hold' && (!g || g.timer <= leaveFuse)) phase = 'leave';
    if (phase === 'leave' && g && !exit) {
      let best: { x: number; y: number } | null = null;
      for (const d of DIRS) {
        const x = g.x + DIR_VEC[d].dx * 3;
        const y = g.y + DIR_VEC[d].dy * 3;
        if (!open(s, x, y) || (x === e.x && y === e.y)) continue;
        if (!best || Math.abs(x - e.x) + Math.abs(y - e.y) > Math.abs(best.x - e.x) + Math.abs(best.y - e.y))
          best = { x, y };
      }
      exit = best;
    }
    if (phase === 'leave' && exit) {
      const d = stepToward(s, exit.x, exit.y);
      intent = d ? { move: d } : {};
    }
    const ev = stepScene(s, bots, intent);
    trace(s, phase, ev);
    scoreBlast(ev, 1, res);
    if (laidAt >= 0 && s.tick > laidAt + FUSE_WAIT) break;
  }
  res.caught = res.hit;
  return res;
}

/** seen: a badly placed generator in plain view of an idle enemy, the human leaving at once (see the file header). */
export function seenDrill(level: CampaignLevel, variant: EnemyVariantId, seed: number): DrillResult {
  const { s, bots } = tacticsScene({
    level,
    seed,
    human: [8, 6],
    enemies: [{ variant, at: [6, 6], territory: { radius: 2 } }],
  });
  const res: DrillResult = { caught: false, hit: false, defeated: false, selfHit: false, void: true };
  let laidAt = -1;
  const delay = seed % 12;
  for (let i = 0; i < 900; i++) {
    let intent: Intent = {};
    const g = s.generators.find((o) => o.ownerId === 0);
    if (laidAt < 0 && i >= delay) {
      intent = { place: true };
      if (g) {
        laidAt = s.tick;
        res.void = false;
      }
    }
    if (laidAt >= 0) {
      const d = stepToward(s, 12, 8);
      intent = d ? { move: d } : {};
    }
    if (!s.players[1]!.alive) break;
    const ev = stepScene(s, bots, intent);
    trace(s, laidAt < 0 ? 'wait' : 'laid', ev);
    scoreBlast(ev, 1, res);
    if (laidAt >= 0 && s.tick > laidAt + FUSE_WAIT) break;
  }
  res.caught = res.hit;
  return res;
}

export interface DrillTally {
  runs: number;
  laid: number;
  hit: number;
  defeated: number;
  selfHit: number;
}

export function tally(
  drill: (level: CampaignLevel, variant: EnemyVariantId, seed: number) => DrillResult,
  level: CampaignLevel,
  variant: EnemyVariantId,
  seeds: number,
): DrillTally {
  const out: DrillTally = { runs: seeds, laid: 0, hit: 0, defeated: 0, selfHit: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const r = drill(level, variant, seed);
    if (!r.void) out.laid++;
    if (r.hit) out.hit++;
    if (r.defeated) out.defeated++;
    if (r.selfHit) out.selfHit++;
  }
  return out;
}
