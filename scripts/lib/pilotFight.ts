/**
 * The Oshodi Mission 1 COMBAT PILOT harness (docs/OSHODI_COMBAT_PILOT.md, decisions CP1-CP12). Everything runs the
 * REAL Terminal Approach field mission (`oshodi.approach`: the real arena, crates, field directives, campaign health,
 * the campaign level's enemy bot level) through the ordinary `tick` with ordinary intents. Nothing here uses the clock
 * or Math.random, so every number is reproducible, and nothing reads pilot internals: the same harness measures the
 * code before and after the pilot.
 *
 * Three kinds of measurement:
 *   1. `punchDuel`     - the human taps B at a human cadence next to an enemy that does nothing (no bot): how many
 *                        presses, landed punches and seconds a defeat takes, per fighter and enemy kind;
 *   2. `pressUnderFire` - an active guard brawls with a human who stands still and presses A (or B) ONCE at every
 *                        offset of a 4 s window: how many single presses produced a generator (a punch);
 *   3. `fieldFight`    - a scripted fighter (walks, dodges seen cues, taps B when adjacent, lays a generator when an
 *                        enemy is in its footprint and a way out exists) against ACTIVE enemy bots.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import {
  DIRS,
  DIR_VEC,
  buildMissionGame,
  createGame,
  observe,
  playerStepTicks,
  previewBlast,
  tick,
} from '../../src/sim';
import type {
  CharacterId,
  Dir,
  EnemyKind,
  GameOptions,
  GameState,
  Generator,
  Intent,
  Intents,
  NpcRole,
  SimEvent,
} from '../../src/sim';
import type { CampaignLevel } from '../../src/sim/campaign/levels';
import { campaignEnemyLevel, levelMaxHp } from '../../src/sim/campaign/levels';
import { CAMPAIGN_CONFIG } from '../../src/sim/config';
import { Tile } from '../../src/sim/types';

export const HZ = 60;
export const FIELD_ID = 'oshodi.approach';

const ROLE_FOR_KIND: Record<EnemyKind, NpcRole> = {
  guard: 'meleeGuard',
  thrower: 'rangedAttacker',
  heavy: 'blocker',
  agbero: 'runner',
  lieutenant: 'meleeGuard',
  boss: 'meleeGuard',
};

export interface SceneEnemy {
  kind: EnemyKind;
  x: number;
  y: number;
}

export interface SceneOptions {
  seed: number;
  level?: CampaignLevel;
  character?: CharacterId;
  human: { x: number; y: number; facing?: Dir };
  enemies: SceneEnemy[];
}

/**
 * The real Oshodi field mission with the human and the listed enemies where the scene puts them. The mission's seats
 * are reused in order (kind and role replaced, health from the kind); seats the scene does not need are taken off the
 * board (not alive). The countdown is skipped.
 */
export function oshodiScene(o: SceneOptions): { state: GameState; bots: Record<number, Bot> } {
  const level = o.level ?? 'normal';
  const options: GameOptions = buildMissionGame({
    spec: { id: 'oshodi', fieldId: FIELD_ID, difficulty: campaignEnemyLevel(level), lives: 3 },
    humanCharacter: o.character ?? 'streetBaller',
    seed: o.seed,
    level,
  });
  const seats = options.players.length - 1;
  if (o.enemies.length > seats)
    throw new Error(`the scene needs ${o.enemies.length} enemy seats, ${seats} exist`);
  options.players = options.players.map((p, i) =>
    i >= 1 && i <= o.enemies.length ? { ...p, enemyKind: o.enemies[i - 1]!.kind } : p,
  );
  const s = createGame(options);
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  const put = (id: number, x: number, y: number): void => {
    const p = s.players[id]!;
    p.x = p.stepFromX = x;
    p.y = p.stepFromY = y;
    p.stepRemaining = 0;
    p.protectedUntil = 0;
    if (p.vitals) p.vitals.invulnUntil = 0;
  };
  const clear = (x: number, y: number): void => {
    const i = y * s.width + x;
    if (s.tiles[i] === Tile.Soft) {
      s.tiles[i] = Tile.Empty;
      delete s.hidden[i];
    }
  };
  put(0, o.human.x, o.human.y);
  clear(o.human.x, o.human.y);
  s.players[0]!.facing = o.human.facing ?? 'right';
  const m = s.mission!;
  for (let id = 1; id <= seats; id++) {
    const e = o.enemies[id - 1];
    const p = s.players[id]!;
    if (!e) {
      p.alive = false;
      put(id, 1, 1);
      continue;
    }
    put(id, e.x, e.y);
    clear(e.x, e.y);
    m.seats[id]!.role = ROLE_FOR_KIND[e.kind];
    m.seats[id]!.post = { x: e.x, y: e.y };
  }
  const bots: Record<number, Bot> = {};
  for (let id = 1; id <= o.enemies.length; id++)
    bots[id] = createBot({
      difficulty: options.players[id]!.difficulty ?? 'casual',
      seed: o.seed + id * 7919,
      playerId: id,
    });
  return { state: s, bots };
}

export function botIntents(s: GameState, bots: Record<number, Bot>): Intents {
  const out: Intents = {};
  for (const [id, bot] of Object.entries(bots)) {
    const n = Number(id);
    if (s.players[n]!.alive) out[n] = bot.decide(observe(s, n));
  }
  return out;
}

const enemiesAlive = (s: GameState): number =>
  s.players.filter((p) => p.alive && p.enemyKind !== undefined).length;

// ------------------------------------------------------------------ 1. the punch duel (no bot)

export interface DuelResult {
  defeated: boolean;
  seconds: number;
  presses: number;
  /** Punches that took a segment. */
  landed: number;
  /** Punches that reached the enemy but took nothing (its recovery frames). */
  blocked: number;
  /** Presses that started no punch at all. */
  ignored: number;
  /** Punches that started (a press kept by an input buffer starts one later). */
  started: number;
}

/** The human taps B every `cadence` ticks next to an idle enemy of `kind` until it is down or `maxSeconds` pass. */
export function punchDuel(o: {
  kind: EnemyKind;
  character: CharacterId;
  cadence: number;
  seed?: number;
  level?: CampaignLevel;
  maxSeconds?: number;
}): DuelResult {
  const { state: s } = oshodiScene({
    seed: o.seed ?? 1,
    character: o.character,
    level: o.level,
    human: { x: 9, y: 39, facing: 'right' },
    enemies: [{ kind: o.kind, x: 10, y: 39 }],
  });
  const r: DuelResult = {
    defeated: false,
    seconds: 0,
    presses: 0,
    landed: 0,
    blocked: 0,
    ignored: 0,
    started: 0,
  };
  const limit = (o.maxSeconds ?? 20) * HZ;
  for (let t = 0; t < limit; t++) {
    const press = t % o.cadence === 0;
    if (press) r.presses++;
    const ev = tick(s, press ? { 0: { special: true } } : {});
    if (press && !ev.some((e) => e.type === 'attackStarted' && e.playerId === 0)) r.ignored++;
    r.started += ev.filter((e) => e.type === 'attackStarted' && e.playerId === 0).length;
    for (const e of ev) {
      if (e.type !== 'campaignHit' || e.byId !== 0 || e.victimId === 0) continue;
      if (e.damage > 0) r.landed++;
      else if (e.result === 'invulnerable') r.blocked++;
    }
    if (!s.players[1]!.alive) {
      r.defeated = true;
      r.seconds = (t + 1) / HZ;
      return r;
    }
  }
  r.seconds = limit / HZ;
  return r;
}

// ------------------------------------------------------------------ 2. single presses under fire

export interface PressResult {
  presses: number;
  accepted: number;
  /** Why the rejected ones were rejected (the human's state on the press tick). */
  whileDazed: number;
}

/**
 * A guard at the human's side brawls (the real bot); after a 1 s warm-up the human presses `button` ONCE at offset k
 * (k = 0, step, 2 step ... < window) and never again; accepted = the press produced a generator (A) or a punch start
 * (B) within `graceTicks`. One fresh scene per offset.
 */
export function pressUnderFire(o: {
  button: 'place' | 'special';
  seed?: number;
  level?: CampaignLevel;
  windowTicks?: number;
  step?: number;
  graceTicks?: number;
  enemies?: SceneEnemy[];
}): PressResult {
  const r: PressResult = { presses: 0, accepted: 0, whileDazed: 0 };
  const window = o.windowTicks ?? 240;
  const step = o.step ?? 3;
  const grace = o.graceTicks ?? 20;
  for (let k = 0; k < window; k += step) {
    const { state: s, bots } = oshodiScene({
      seed: (o.seed ?? 1) + k,
      level: o.level,
      human: { x: 9, y: 39, facing: 'right' },
      enemies: o.enemies ?? [{ kind: 'guard', x: 10, y: 39 }],
    });
    const at = 60 + k;
    let done = false;
    for (let t = 0; t < at + grace + 1 && !done; t++) {
      const intents = botIntents(s, bots);
      if (t === at) {
        intents[0] = o.button === 'place' ? { place: true } : { special: true };
        r.presses++;
        if (s.tick < s.players[0]!.dazedUntil) r.whileDazed++;
      }
      const ev = tick(s, intents);
      if (t >= at) {
        const ok = ev.some((e) =>
          o.button === 'place'
            ? e.type === 'generatorPlaced' && e.ownerId === 0
            : e.type === 'attackStarted' && e.playerId === 0,
        );
        if (ok) {
          r.accepted++;
          done = true;
        }
      }
      if (!s.players[0]!.alive) break;
    }
  }
  return r;
}

// ------------------------------------------------------------------ 3. the scripted fighter

export interface FighterStyle {
  /** Taps B at an adjacent enemy. */
  punch: boolean;
  /** Lays generators. */
  bomb: boolean;
  /** Ticks before a seen cue (a thrown object, a wind-up) is acted on. */
  reactTicks: number;
  /** A human's tapping cadence (ticks between two B taps). */
  cadence: number;
}

export const BRAWLER: FighterStyle = { punch: true, bomb: false, reactTicks: 18, cadence: 12 };
export const BOMBER: FighterStyle = { punch: false, bomb: true, reactTicks: 18, cadence: 12 };
export const MIXED: FighterStyle = { punch: true, bomb: true, reactTicks: 18, cadence: 12 };
/** A slower player (0.5 s to read a cue, about 3 taps a second): the closer guide to a touch player. */
export const SLOW_BRAWLER: FighterStyle = { punch: true, bomb: false, reactTicks: 30, cadence: 20 };
export const SLOW_MIXED: FighterStyle = { punch: true, bomb: true, reactTicks: 30, cadence: 20 };

export interface FightResult {
  won: boolean;
  seconds: number;
  enemies: number;
  kills: number;
  killsByPunch: number;
  killsByBlast: number;
  /** Health segments taken from enemies. */
  damageTaken: number;
  /** Enemy hits that hurt or dazed the human. */
  interruptions: number;
  /** An enemy hit that landed less than 1 s after the previous one's daze ended. */
  chained: number;
  deaths: number;
  bPresses: number;
  bAccepted: number;
  punchesLanded: number;
  punchesBlocked: number;
  whiffs: number;
  aPresses: number;
  aAccepted: number;
  /** Enemies standing in a generator's footprint when it was laid, and those of them its blast missed. */
  inFootprint: number;
  escaped: number;
  /** Ticks the human could not act (dazed). */
  dazedTicks: number;
}

/** Danger tiles: every generator's footprint (with its fuse) and every flame. */
function dangerMap(s: GameState): Map<number, number> {
  const out = new Map<number, number>();
  for (const f of s.flames) out.set(f.y * s.width + f.x, 0);
  for (const g of s.generators) {
    for (const i of previewBlast(s, g)) out.set(i, Math.min(out.get(i) ?? Infinity, g.timer));
  }
  return out;
}

function walkable(s: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return false;
  if (s.tiles[y * s.width + x] !== Tile.Empty) return false;
  if (s.generators.some((g) => g.x === x && g.y === y && g.flight === null)) return false;
  return !s.players.some((p) => p.alive && p.id !== 0 && p.x === x && p.y === y);
}

/** First step of the shortest walk to a tile `goal` accepts, avoiding `avoid`. */
function route(
  s: GameState,
  goal: (i: number) => boolean,
  avoid: (i: number, steps: number) => boolean,
  max = 30,
): { dir: Dir | null; steps: number } | null {
  const me = s.players[0]!;
  const w = s.width;
  const start = me.y * w + me.x;
  if (goal(start)) return { dir: null, steps: 0 };
  const first = new Map<number, Dir>();
  first.set(start, 'up');
  let frontier = [start];
  for (let k = 1; k <= max && frontier.length; k++) {
    const next: number[] = [];
    for (const u of frontier)
      for (const d of DIRS) {
        const x = (u % w) + DIR_VEC[d].dx;
        const y = Math.floor(u / w) + DIR_VEC[d].dy;
        const v = y * w + x;
        if (first.has(v) || !walkable(s, x, y) || avoid(v, k)) continue;
        first.set(v, u === start ? d : first.get(u)!);
        if (goal(v)) return { dir: first.get(v)!, steps: k };
        next.push(v);
      }
    frontier = next;
  }
  return null;
}

/** The footprint a generator laid where the human stands would have. */
function footprintHere(s: GameState): Set<number> {
  const me = s.players[0]!;
  const g: Generator = {
    id: -1,
    ownerId: 0,
    x: me.x,
    y: me.y,
    stepFromX: me.x,
    stepFromY: me.y,
    range: me.range,
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
  return previewBlast(s, g);
}

export class Fighter {
  private lastB = -1e9;
  private readonly seenLine = new Map<number, number>();
  private readonly seenWind = new Map<number, number>();
  constructor(readonly style: FighterStyle) {}

  decide(s: GameState): Intent {
    const me = s.players[0]!;
    if (!me.alive || s.match.phase !== 'playing') return {};
    const w = s.width;
    const here = me.y * w + me.x;
    const step = playerStepTicks(s, me);
    const danger = dangerMap(s);
    // thrown objects whose cue has been on screen for the reaction time
    const lines = new Set<number>();
    for (const pr of s.projectiles ?? []) {
      if (!this.seenLine.has(pr.id)) this.seenLine.set(pr.id, s.tick);
      if (s.tick - this.seenLine.get(pr.id)! < this.style.reactTicks) continue;
      for (let i = pr.index; i < pr.path.length; i++) lines.add(pr.path[i]!);
    }
    const unsafe = (i: number, steps = 0): boolean =>
      lines.has(i) || (danger.has(i) && danger.get(i)! <= (steps + 2) * step + 12);
    const foes = s.players.filter((p) => p.alive && p.enemyKind !== undefined);
    const adjacent = foes.filter((f) => Math.abs(f.x - me.x) + Math.abs(f.y - me.y) === 1);

    // 1. out of a footprint about to blow, a flame or a seen line
    if (unsafe(here) || (danger.has(here) && danger.get(here)! <= 70)) {
      const r = route(
        s,
        (i) => !danger.has(i) && !lines.has(i),
        (i, k) => unsafe(i, k),
        12,
      );
      if (r?.dir) return { move: r.dir };
    }
    // 2. a wind-up on me that I will not cut short: step out of reach late in it
    for (const f of adjacent) {
      const a = f.attack;
      if (!a || a.targetId !== 0) continue;
      if (!this.seenWind.has(a.resolveTick)) this.seenWind.set(a.resolveTick, s.tick);
      if (s.tick - this.seenWind.get(a.resolveTick)! < this.style.reactTicks) continue;
      const tapSoon =
        this.style.punch && s.tick - this.lastB >= this.style.cadence && f.enemyKind !== 'heavy';
      if (tapSoon) break;
      const left = a.resolveTick - s.tick;
      if (left > 14 || left < 3) continue;
      for (const d of DIRS) {
        const x = me.x + DIR_VEC[d].dx;
        const y = me.y + DIR_VEC[d].dy;
        if (!walkable(s, x, y) || unsafe(y * w + x)) continue;
        if (Math.abs(f.x - x) + Math.abs(f.y - y) <= 1) continue;
        return { move: d };
      }
    }
    // 3. tap B at an adjacent enemy, at a human cadence
    if (this.style.punch && adjacent.length > 0 && s.tick - this.lastB >= this.style.cadence) {
      this.lastB = s.tick;
      return { special: true }; // B reaches any adjacent tile (the faced one first): no turn needed
    }
    // 3b. an enemy standing on my own tile cannot be punched (before the pilot): step off it so it is adjacent again
    if (this.style.punch && adjacent.length === 0 && foes.some((f) => f.x === me.x && f.y === me.y)) {
      for (const d of DIRS) {
        const x = me.x + DIR_VEC[d].dx;
        const y = me.y + DIR_VEC[d].dy;
        if (walkable(s, x, y) && !unsafe(y * w + x)) return { move: d };
      }
    }
    // 4. lay a generator with an enemy in its footprint and a way out
    if (this.style.bomb && !s.generators.some((g) => g.ownerId === 0)) {
      const fp = footprintHere(s);
      if (foes.some((f) => fp.has(f.y * w + f.x))) {
        const out = route(
          s,
          (i) => !fp.has(i) && !danger.has(i) && !lines.has(i),
          (i, k) => unsafe(i, k),
          Math.floor((s.config.generator.fuseTicks - 50) / step),
        );
        if (out) return { place: true };
      }
    }
    // 5. close in on the nearest enemy (a bomber stops two tiles short)
    if (foes.length > 0) {
      const near = (i: number): boolean => {
        const x = i % w;
        const y = Math.floor(i / w);
        return foes.some((f) => {
          const d = Math.abs(f.x - x) + Math.abs(f.y - y);
          return this.style.punch ? d === 1 : d >= 1 && d <= 2;
        });
      };
      const r = route(s, near, (i, k) => unsafe(i, k), 40);
      if (r?.dir) return { move: r.dir };
    }
    return {};
  }
}

export function fieldFight(o: {
  enemies: SceneEnemy[];
  style: FighterStyle;
  seed: number;
  level?: CampaignLevel;
  human?: { x: number; y: number };
  seconds?: number;
  /** Keep fighting after a lost life (the respawn lifecycle) instead of stopping at the first defeat. */
  throughDeaths?: boolean;
}): FightResult {
  const { state: s, bots } = oshodiScene({
    seed: o.seed,
    level: o.level,
    human: o.human ?? { x: 9, y: 39 },
    enemies: o.enemies,
  });
  const f = new Fighter(o.style);
  const r: FightResult = {
    won: false,
    seconds: 0,
    enemies: o.enemies.length,
    kills: 0,
    killsByPunch: 0,
    killsByBlast: 0,
    damageTaken: 0,
    interruptions: 0,
    chained: 0,
    deaths: 0,
    bPresses: 0,
    bAccepted: 0,
    punchesLanded: 0,
    punchesBlocked: 0,
    whiffs: 0,
    aPresses: 0,
    aAccepted: 0,
    inFootprint: 0,
    escaped: 0,
    dazedTicks: 0,
  };
  const caught = new Map<number, Set<number>>();
  let freeAt = -1e9;
  const limit = (o.seconds ?? 60) * HZ;
  for (let t = 0; t < limit; t++) {
    if (s.match.phase !== 'playing') break;
    const intents = botIntents(s, bots);
    const mine = f.decide(s);
    intents[0] = mine;
    if (mine.special) r.bPresses++;
    if (mine.place) r.aPresses++;
    if (s.players[0]!.alive && s.tick < s.players[0]!.dazedUntil) r.dazedTicks++;
    const ev: SimEvent[] = tick(s, intents);
    const exploded: number[] = [];
    for (const e of ev) {
      if (e.type === 'attackStarted' && e.playerId === 0) r.bAccepted++;
      if (e.type === 'attackResolved' && e.playerId === 0 && !e.hit) r.whiffs++;
      if (e.type === 'generatorPlaced' && e.ownerId === 0) {
        r.aAccepted++;
        const g = s.generators.find((q) => q.id === e.generatorId);
        if (g) {
          const fp = previewBlast(s, g);
          const ids = new Set(
            s.players
              .filter((p) => p.alive && p.enemyKind !== undefined && fp.has(p.y * s.width + p.x))
              .map((p) => p.id),
          );
          r.inFootprint += ids.size;
          caught.set(g.id, ids);
        }
      }
      if (e.type === 'campaignHit' && e.byId === 0 && e.victimId !== 0) {
        if (e.source === 'player') {
          if (e.damage > 0) r.punchesLanded++;
          else if (e.result === 'invulnerable') r.punchesBlocked++;
        }
        if (e.source === 'blast') for (const ids of caught.values()) ids.delete(e.victimId);
      }
      if (e.type === 'campaignHit' && e.victimId === 0 && e.byId !== null && e.byId !== 0) {
        const hurt = e.result === 'damaged' || e.result === 'dazed' || e.result === 'defeated';
        if (hurt) {
          r.damageTaken += e.damage;
          r.interruptions++;
          if (s.tick - freeAt < 60) r.chained++;
          freeAt = s.tick + e.dazeTicks;
        }
      }
      if (e.type === 'generatorExploded') exploded.push(e.generatorId);
      if (e.type === 'campaignDefeated') {
        if (e.victimId === 0) r.deaths++;
        else if (e.byId === 0) {
          r.kills++;
          if (e.source === 'blast') r.killsByBlast++;
          else r.killsByPunch++;
        }
      }
    }
    // escapes are settled after the whole tick: the blast's hits come after its explosion event
    for (const id of exploded) {
      const ids = caught.get(id);
      if (ids) {
        r.escaped += ids.size;
        caught.delete(id);
      }
    }
    if (r.deaths > 0 && !o.throughDeaths) break;
    if (enemiesAlive(s) === 0) {
      r.won = true;
      break;
    }
  }
  r.seconds = s.tick / HZ;
  return r;
}

/** The health the human starts with at a level (for the report). */
export const humanHp = (level: CampaignLevel = 'normal'): number =>
  levelMaxHp(CAMPAIGN_CONFIG.playerMaxHp, level);
