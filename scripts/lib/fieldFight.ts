/**
 * Field-mission harness (docs/CAMPAIGN_SECTOR_AI.md "Part: Ojuelegba finale", decisions FN1-FN10): a scripted human with
 * ORDINARY intents only (walk, A = lay a generator, B = the context special: a punch on an adjacent rival) plays a whole
 * campaign FIELD mission against the REAL enemy bots (`createBot` -> the enemy controller, at the campaign level's enemy
 * bot level, with their territories and the campaign tactics layer of the level). Real simulation, real board (crates
 * included: the human blasts a crate that stands in its way), stage hazards on, no rendering, no clock, no Math.random.
 * A door raid is answered the way the app does (`resolveRaid` with a completed raid outcome), like tests/field-missions.
 *
 * The GENERATOR plan (the only one this harness plays):
 *   - never stands in danger: telegraphed lanes, flames, floor traps, every generator footprint (its own included, so it
 *     always walks out of its own blast), the tiles beside an enemy winding up, a thrown object's path;
 *   - an enemy next to it: a jab when the enemy winds up (a stagger cuts the wind-up), otherwise a generator under its
 *     own feet when it can walk clear (the enemy is in the blast), else a jab;
 *   - equipment (`destroy`): walks to a tile whose blast reaches the piece, lays a generator, walks clear;
 *   - a group (`defeat`) / a contested zone (`secure`): walks at the nearest enemy and fights as above; an uncontested
 *     zone: stands inside it, out of danger;
 *   - checkpoints, exits, doors and the return marker: walks there.
 * Used by tests/campaign-finale-playthrough.test.ts and the finale measurements (`npx tsx scripts/finale-audit.ts`).
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import {
  buildMissionGame,
  campaignEnemyLevel,
  createGame,
  getFieldMission,
  missionView,
  observe,
  previewBlast,
  resolveRaid,
  tick,
} from '../../src/sim';
import type {
  CampaignLevel,
  Generator,
  GameState,
  Intent,
  Intents,
  MissionId,
  MissionView,
  RaidOutcome,
  SimEvent,
} from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { bossDangerTiles, route } from './bossFight';

export interface FieldRunOptions {
  /** The field mission id (`ojuelegba.return`); its district is the part before the dot. */
  fieldId: string;
  level: CampaignLevel;
  seed: number;
  /** Stop after this many seconds of play (default: the mission's own clock decides). */
  maxSec?: number;
}

export interface FieldRunResult {
  fieldId: string;
  level: CampaignLevel;
  seed: number;
  result: 'won' | 'lost' | 'timeout' | 'unfinished';
  seconds: number;
  livesUsed: number;
  /** Legs completed (the return route included on a win). */
  legs: number;
  stars: number;
  /** Generators laid, jabs thrown, enemies defeated (any cause). */
  placed: number;
  punches: number;
  enemiesDown: number;
  /** Seconds the hold zone (if any) was contested while the human stood in it. */
  contestedSec: number;
}

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** The blast of a generator the human would lay on (x, y) right now (its real snapshot of range and shape). */
export function footprintAt(state: GameState, x: number, y: number): Set<number> {
  const me = state.players[0]!;
  const gen: Generator = {
    id: -1,
    ownerId: 0,
    x,
    y,
    stepFromX: x,
    stepFromY: y,
    range: me.range,
    pierce: me.hotFuel,
    square: 0,
    fromSpectator: false,
    mode: 'timed',
    timer: 999,
    carriedBy: null,
    carryBonusUsed: false,
    slide: null,
    flight: null,
    triggered: false,
    placedTick: state.tick,
  };
  return previewBlast(state, gen);
}

/** Danger beyond the boss harness's: tiles an enemy's pending blow can reach, and thrown objects' paths. */
function fieldDanger(state: GameState, view: MissionView | null): Set<number> {
  const out = bossDangerTiles(state, view);
  const w = state.width;
  for (const p of state.players) {
    if (p.id === 0 || !p.alive || !p.attack || p.attack.resolveTick <= state.tick) continue;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      out.add((p.y + dy) * w + p.x + dx);
  }
  for (const pr of state.projectiles ?? []) for (const t of pr.path.slice(pr.index)) out.add(t);
  return out;
}

/** Can the human walk from (x, y) to a tile outside `blast` and outside `danger` within `steps` (not back through it)? */
function canClear(
  state: GameState,
  x: number,
  y: number,
  blast: ReadonlySet<number>,
  danger: ReadonlySet<number>,
  steps = 10,
): boolean {
  const w = state.width;
  const avoid = new Set(danger);
  avoid.delete(y * w + x);
  const r = route(
    state,
    x,
    y,
    (tx, ty) => !blast.has(ty * w + tx) && !danger.has(ty * w + tx),
    avoid,
    false,
    800,
  );
  return r !== null && r.dist <= steps;
}

export class FieldAgent {
  placed = 0;
  punches = 0;
  private lastPlace = -1e9;

  decide(state: GameState): Intent {
    const me = state.players[0]!;
    if (!me.alive) return {};
    const view = missionView(state);
    if (!view || view.outcome || view.pendingRaid) return {};
    const goal = view.fieldGoal;
    const w = state.width;
    const here = me.y * w + me.x;
    const danger = fieldDanger(state, view);
    const mine = state.generators.filter((g) => g.ownerId === 0).length;
    const canPlace = mine < me.capacity && state.tick - this.lastPlace > 20;
    const enemies = state.players.filter((p) => p.id !== 0 && p.alive);

    // 1. never stand in danger
    if (danger.has(here)) {
      const out = route(state, me.x, me.y, (x, y) => !danger.has(y * w + x), new Set<number>());
      if (out) return { move: out.dir };
    }
    // 2. an enemy beside us: jab its wind-up, else trap it under our own feet when we can walk clear, else jab
    const adjacent = enemies.filter((p) => Math.abs(p.x - me.x) + Math.abs(p.y - me.y) === 1);
    if (adjacent.length > 0) {
      const ready = state.tick >= me.skillReadyTick && me.attack === null;
      const winding = adjacent.some((p) => p.attack !== null);
      if (winding && ready) {
        this.punches++;
        return { special: true };
      }
      if (canPlace && !state.generators.some((g) => g.x === me.x && g.y === me.y)) {
        const blast = footprintAt(state, me.x, me.y);
        if (canClear(state, me.x, me.y, blast, danger, 6)) {
          this.placed++;
          this.lastPlace = state.tick;
          return { place: true };
        }
      }
      if (ready) {
        this.punches++;
        return { special: true };
      }
    }
    // 3. on a fighting leg (a group to defeat, a zone to clear): an enemy in our blast from here (not beside us), laid
    //    when we can walk clear; on other legs the plan goes on (the blast at the objective catches its guards)
    const fighting = goal?.verb === 'defeat' || goal?.verb === 'secure';
    if (
      fighting &&
      canPlace &&
      enemies.length > 0 &&
      !state.generators.some((g) => g.x === me.x && g.y === me.y)
    ) {
      const blast = footprintAt(state, me.x, me.y);
      const caught = enemies.some((p) => blast.has(p.y * w + p.x) && cheb(p, me) <= 2);
      if (caught && canClear(state, me.x, me.y, blast, danger, 6)) {
        this.placed++;
        this.lastPlace = state.tick;
        return { place: true };
      }
    }
    if (!goal) return {};
    switch (goal.verb) {
      case 'destroy':
        return this.destroy(state, view, danger, canPlace);
      case 'defeat': {
        const leg = legGroup(state);
        return this.hunt(
          state,
          danger,
          enemies.filter((p) => state.mission!.seats[p.id]?.group === leg),
          canPlace,
        );
      }
      case 'secure': {
        const area = goal.area!;
        const inZone = (q: { x: number; y: number }): boolean =>
          Math.max(Math.abs(q.x - area.x), Math.abs(q.y - area.y)) <= area.radius;
        const intruders = enemies.filter(inZone);
        if (intruders.length > 0 && inZone(me)) return this.hunt(state, danger, intruders, canPlace);
        if (inZone(me) && !danger.has(here)) return {};
        return this.walkTo(state, (x, y) => inZone({ x, y }) && !danger.has(y * w + x), danger, canPlace);
      }
      default:
        return this.walkTo(state, (x, y) => x === goal.x && y === goal.y, danger, canPlace);
    }
  }

  /** Walks next to the nearest of `targets` (the fight itself is steps 2-3 of `decide`). */
  private hunt(
    state: GameState,
    danger: ReadonlySet<number>,
    targets: GameState['players'],
    canPlace: boolean,
  ): Intent {
    const me = state.players[0]!;
    if (targets.length === 0) return {};
    const t = [...targets].sort((a, b) => cheb(a, me) - cheb(b, me))[0]!;
    return this.walkTo(state, (x, y) => Math.abs(x - t.x) + Math.abs(y - t.y) === 1, danger, canPlace);
  }

  /** Equipment: stand where a blast reaches the nearest standing piece, lay the generator, walk clear. */
  private destroy(
    state: GameState,
    view: MissionView,
    danger: ReadonlySet<number>,
    canPlace: boolean,
  ): Intent {
    const me = state.players[0]!;
    const w = state.width;
    const pieces = view.nodes.filter((n) => n.kind === 'target' && n.state !== 'done');
    if (pieces.length === 0) return {};
    // our own generator is already on its way to one: wait clear of it
    if (state.generators.some((g) => g.ownerId === 0)) return {};
    const target = [...pieces].sort((a, b) => cheb(a, me) - cheb(b, me))[0]!;
    const ti = target.y * w + target.x;
    // every open tile within blast range whose blast would reach the piece (from beside it or from a distance)
    const spots = new Set<number>();
    for (let dy = -me.range; dy <= me.range; dy++)
      for (let dx = -me.range; dx <= me.range; dx++) {
        const x = target.x + dx;
        const y = target.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= state.height || (dx === 0 && dy === 0)) continue;
        const i = y * w + x;
        if (state.tiles[i] !== Tile.Empty || danger.has(i)) continue;
        if (footprintAt(state, x, y).has(ti)) spots.add(i);
      }
    if (canPlace && spots.has(me.y * w + me.x)) {
      const blast = footprintAt(state, me.x, me.y);
      if (canClear(state, me.x, me.y, blast, danger, 8)) {
        this.placed++;
        this.lastPlace = state.tick;
        return { place: true };
      }
      // boxed in by its guards: no way clear of our own blast, so fight the nearest guard first
      const guards = state.players.filter((p) => p.id !== 0 && p.alive && cheb(p, me) <= 2);
      if (guards.length > 0) return this.hunt(state, danger, guards, false);
    }
    return this.walkTo(state, (x, y) => spots.has(y * w + x), danger, canPlace);
  }

  /** Walks towards the goal; a crate in the way is blasted when the human can walk clear of its own blast. */
  private walkTo(
    state: GameState,
    goal: (x: number, y: number) => boolean,
    danger: ReadonlySet<number>,
    canPlace: boolean,
  ): Intent {
    const me = state.players[0]!;
    const step = route(state, me.x, me.y, goal, danger);
    if (step) return { move: step.dir };
    const rough = route(state, me.x, me.y, goal, danger, true);
    if (!rough) return {};
    if (state.tiles[rough.next] === Tile.Soft) {
      const blast = footprintAt(state, me.x, me.y);
      if (canPlace && canClear(state, me.x, me.y, blast, danger, 8)) {
        this.placed++;
        this.lastPlace = state.tick;
        return { place: true };
      }
      return {};
    }
    return { move: rough.dir };
  }
}

/** The enemy group the current `clearGroup` leg names (undefined on other legs). */
function legGroup(state: GameState): string | undefined {
  const f = state.mission?.field;
  if (!f) return undefined;
  const leg = getFieldMission(f.fieldId).legs[f.leg];
  return leg?.kind === 'clearGroup' ? leg.group : undefined;
}

const raidWon = (raidId: RaidOutcome['raidId']): RaidOutcome => ({
  raidId,
  result: 'completed',
  seconds: 60,
  optionalRoomsOpened: 0,
  optionalRoomsTotal: 1,
  cargoDestroyed: 3,
  cargoTotal: 3,
  hpLeft: 2,
  livesUsed: 0,
  stars: 2,
});

/** A field mission built as the campaign builds it (`startField`): the level's enemy bots, three lives. */
export function fieldGame(fieldId: string, level: CampaignLevel, seed: number): GameState {
  const district = fieldId.split('.')[0] as MissionId;
  return createGame(
    buildMissionGame({
      spec: { id: district, fieldId, difficulty: campaignEnemyLevel(level), lives: 3 },
      humanCharacter: 'streetBaller',
      seed,
      level,
    }),
  );
}

/** Plays one field mission to its end (or `maxSec`) with the generator plan and reports what happened. */
export function runFieldFight(o: FieldRunOptions): FieldRunResult {
  const state = fieldGame(o.fieldId, o.level, o.seed);
  const bots: Record<number, Bot> = {};
  for (const p of state.players)
    if (p.isBot)
      bots[p.id] = createBot({
        difficulty: campaignEnemyLevel(o.level),
        seed: o.seed * 7919 + p.id,
        playerId: p.id,
      });
  const agent = new FieldAgent();
  const maxTicks = (o.maxSec ?? 100000) * 60;
  let down = 0;
  let contested = 0;
  for (let i = 0; i < maxTicks && state.match.phase !== 'ended'; i++) {
    const pending = state.mission?.pendingRaid;
    if (pending) resolveRaid(state, pending.doorId, raidWon(pending.raidId));
    const intents: Intents = {};
    for (const [id, bot] of Object.entries(bots)) {
      const n = Number(id);
      if (state.players[n]!.alive) intents[n] = bot.decide(observe(state, n));
    }
    if (state.match.phase === 'playing') intents[0] = agent.decide(state);
    const events: SimEvent[] = tick(state, intents);
    for (const e of events) if (e.type === 'playerEliminated' && e.playerId !== 0) down++;
    const hold = state.mission?.field?.hold;
    if (hold?.inside && hold.contested) contested++;
  }
  const m = state.mission!;
  return {
    fieldId: o.fieldId,
    level: o.level,
    seed: o.seed,
    result: m.outcome?.result ?? 'unfinished',
    seconds: Math.round(state.match.playTicks / 60),
    livesUsed: m.livesUsed,
    legs: m.outcome?.phasesCleared ?? m.phasesCleared,
    stars: m.outcome?.stars ?? 0,
    placed: agent.placed,
    punches: agent.punches,
    enemiesDown: down,
    contestedSec: Math.round(contested / 60),
  };
}
