/**
 * Per-match measurements for City Rumble balance work (workstream C, docs/RUMBLE_EVOLUTION.md section C).
 *
 * `MetricsCollector` watches a running match from the outside: `onTick(state, events)` after every
 * `tick()`. It reads only the state and the events (never changes them), so a measured match is
 * bit-identical to an unmeasured one, and every number except `msPerTick` (wall clock, added by the
 * runner) is deterministic per seed.
 *
 * Definitions (the table in the docs uses exactly these):
 *  - eliminations: every `playerEliminated` event (crush, hazards and self-kills included);
 *    `firstElimSec`, `elims30`, `elims60` count play seconds (the countdown is excluded);
 *  - engaged share: of the sampled (alive fighter, moment) pairs, how many have a living opponent within
 *    `ENGAGE_RADIUS` tiles (Manhattan);
 *  - exposed share: of the same pairs, how many stand inside the live `previewBlast` footprint of a
 *    generator an opponent owns (chains included);
 *  - placements per fighter-minute: `generatorPlaced` events over alive fighter-time;
 *  - aimed placements: at the moment of placing, the generator's footprint contains a living opponent;
 *    near placements: a living opponent is within `ENGAGE_RADIUS` tiles;
 *  - camping: share of alive fighter-time spent in a run of >= 5 s inside a 3 x 3 area (a run ends when
 *    its bounding box outgrows 3 x 3); `meanNearestOpponent` is the mean Manhattan distance to the nearest
 *    living opponent over the sampled pairs;
 *  - self eliminations: killed by the fighter's own generator or vehicle;
 *  - concentration: top eliminator (most credited kills, ties: lower id) versus the median fighter, for
 *    credited kills and for peak power (`powerScore` above the start, sampled).
 */
import { isOpponent, previewBlast, teammates } from '../../src/sim';
import type { GameState, PickupKind, Player, SimEvent } from '../../src/sim';

/** Radius (tiles, Manhattan) inside which a living opponent counts as "in the fight". */
export const ENGAGE_RADIUS = 6;
/** A fighter that stays inside a 3 x 3 area for this long is camping. */
export const CAMP_SECONDS = 5;
/** The "opening" window (seconds of play) for the engagement metrics reported separately. */
export const OPENING_SECONDS = 60;
/** A stretch with no living opponent in reach (`ENGAGE_RADIUS`) at least this long is a routine empty traversal. */
export const EMPTY_FLAG_SECONDS = 15;
/** Spatial metrics are sampled every this many ticks (6 = 10 Hz). */
export const DEFAULT_SAMPLE_TICKS = 6;

/**
 * One number for "how strong is this fighter": the reward items above the start, Square / Armour / Okada
 * counting 2 each (the same score scripts/rumble-economy.ts uses).
 */
export function powerScore(p: Readonly<Player>, base: { range: number; capacity: number }): number {
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

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Camping detector: tracks, per fighter, the current run inside a 3 x 3 area. A position that would make
 * the run's bounding box wider or taller than 3 tiles ends the run and starts a new one. Runs of at least
 * `thresholdTicks` count as camping (their whole length).
 */
export class CampTracker {
  private readonly runs = new Map<
    number,
    { x0: number; x1: number; y0: number; y1: number; ticks: number }
  >();
  campedTicks = 0;

  constructor(private readonly thresholdTicks: number) {}

  /** The fighter stood on (x, y) for the last `dt` ticks. */
  step(id: number, x: number, y: number, dt: number): void {
    const run = this.runs.get(id);
    if (run) {
      const x0 = Math.min(run.x0, x);
      const x1 = Math.max(run.x1, x);
      const y0 = Math.min(run.y0, y);
      const y1 = Math.max(run.y1, y);
      if (x1 - x0 <= 2 && y1 - y0 <= 2) {
        Object.assign(run, { x0, x1, y0, y1 });
        run.ticks += dt;
        return;
      }
      this.bank(run.ticks);
    }
    this.runs.set(id, { x0: x, x1: x, y0: y, y1: y, ticks: dt });
  }

  /** The fighter is not in play (eliminated, waiting to respawn): its run ends. */
  stop(id: number): void {
    const run = this.runs.get(id);
    if (run) this.bank(run.ticks);
    this.runs.delete(id);
  }

  /** End of match: bank every open run. */
  finish(): void {
    for (const id of [...this.runs.keys()]) this.stop(id);
  }

  private bank(ticks: number): void {
    if (ticks >= this.thresholdTicks) this.campedTicks += ticks;
  }
}

export type CauseKey =
  'ownBlast' | 'rivalBlast' | 'teamBlast' | 'vehicle' | 'stageHazard' | 'crush' | 'melee' | 'spectator';

export const CAUSE_KEYS: readonly CauseKey[] = [
  'ownBlast',
  'rivalBlast',
  'teamBlast',
  'vehicle',
  'stageHazard',
  'crush',
  'melee',
  'spectator',
];

/**
 * Elimination cause for the table: the fighter's own blast, a rival's, a teammate's (friendly fire), a
 * vehicle, a stage hazard (traffic, crowd, falling goods), the closing city, or melee (the death came from
 * the crush / a hazard but a rival's shove within the credit window is credited with it).
 */
export function causeKey(
  state: Pick<GameState, 'players'>,
  e: Extract<SimEvent, { type: 'playerEliminated' }>,
): CauseKey {
  const c = e.cause;
  switch (c.kind) {
    case 'flame': {
      if (c.ownerId === e.playerId) return 'ownBlast';
      const owner = state.players[c.ownerId];
      const victim = state.players[e.playerId];
      return owner && victim && teammates(owner, victim) ? 'teamBlast' : 'rivalBlast';
    }
    case 'vehicle':
      return 'vehicle';
    case 'spectator':
      return 'spectator';
    case 'crush':
      return e.creditId !== null ? 'melee' : 'crush';
    default:
      return e.creditId !== null ? 'melee' : 'stageHazard';
  }
}

/** Runs of consecutive time a fighter has no living opponent in reach; runs of `thresholdTicks`+ are flagged. */
export class EmptyRunTracker {
  private readonly runs = new Map<number, number>();
  flaggedRuns = 0;
  longestTicks = 0;

  constructor(private readonly thresholdTicks: number) {}

  step(id: number, empty: boolean, dt: number): void {
    if (!empty) return this.stop(id);
    this.runs.set(id, (this.runs.get(id) ?? 0) + dt);
  }

  stop(id: number): void {
    const run = this.runs.get(id);
    if (run === undefined) return;
    this.runs.delete(id);
    this.longestTicks = Math.max(this.longestTicks, run);
    if (run >= this.thresholdTicks) this.flaggedRuns++;
  }

  finish(): void {
    for (const id of [...this.runs.keys()]) this.stop(id);
  }
}

export interface MatchMetrics {
  seed: number;
  /** `win:<id>`, `team:<n>`, `draw:<reason>` or `none` (no result before the cap). */
  result: string;
  playSeconds: number;
  fighters: number;
  eliminations: number;
  elimsPerMinute: number;
  creditedEliminations: number;
  selfEliminations: number;
  /** Null when nobody fell. */
  firstElimSec: number | null;
  elims30: number;
  elims60: number;
  /** Seconds of every elimination (for percentile views). */
  elimTimes: number[];
  engagedShare: number;
  exposedShare: number;
  placements: number;
  placementsPerFighterMinute: number;
  aimedPlacementShare: number;
  nearPlacementShare: number;
  campShare: number;
  meanNearestOpponent: number;
  /** The same three spatial measures over the first `OPENING_SECONDS` of play only (the opening). */
  openingEngagedShare: number;
  openingExposedShare: number;
  openingNearestOpponent: number;
  /** First moment a fighter stood in a live opponent's blast footprint or a credited elimination fell (null: never). */
  firstEncounterSec: number | null;
  /** Routine empty traversals: runs of >= `EMPTY_FLAG_SECONDS` with no living opponent in reach, and the longest run. */
  emptyRuns15: number;
  longestEmptySec: number;
  /** Eliminations by cause (see `causeKey`). */
  causes: Record<CauseKey, number>;
  /** Live (ticking) generators over the match: mean, peak, and mean per living fighter. */
  meanLiveGenerators: number;
  peakLiveGenerators: number;
  liveGeneratorsPerFighter: number;
  /** Supply crates: standing at the start, opened, opened within the first 60 s, first one opened (null: none). */
  suppliesStart: number;
  suppliesOpened: number;
  suppliesOpened60: number;
  firstSupplyOpenedSec: number | null;
  /** Pickups on the floor: collected (useful / wasted) and burned before anyone took them. */
  pickupsCollected: number;
  pickupsWasted: number;
  pickupsBurned: number;
  /** Per spawn slot (= player id): share of the match alive, credited eliminations; slot of the winner (null: none / team). */
  slotSurvival: number[];
  slotKills: number[];
  winnerSlot: number | null;
  topKills: number;
  medianKills: number;
  topPower: number;
  medianPower: number;
  /** Reward items granted by kind. */
  rewards: Partial<Record<PickupKind, number>>;
  rewardsGranted: number;
  /** Wall-clock ms per playing tick (bots + simulation); set by the runner, NOT deterministic. */
  msPerTick: number;
}

export class MetricsCollector {
  private readonly n: number;
  private readonly base: { range: number; capacity: number };
  private readonly camp: CampTracker;
  private readonly kills: number[];
  private readonly peakPower: number[];
  private readonly elimTimes: number[] = [];
  private readonly rewards: Partial<Record<PickupKind, number>> = {};
  private rewardsGranted = 0;
  private eliminations = 0;
  private credited = 0;
  private selfKills = 0;
  private placements = 0;
  private aimed = 0;
  private nearPlacements = 0;
  private fighterTicks = 0;
  private samplePairs = 0;
  private engaged = 0;
  private exposed = 0;
  private distSum = 0;
  private distCount = 0;
  private openPairs = 0;
  private openEngaged = 0;
  private openExposed = 0;
  private openDistSum = 0;
  private openDistCount = 0;
  private result = 'none';
  private readonly empty = new EmptyRunTracker(EMPTY_FLAG_SECONDS * 60);
  private firstEncounter: number | null = null;
  private readonly causes = Object.fromEntries(CAUSE_KEYS.map((k) => [k, 0])) as Record<CauseKey, number>;
  private genSamples = 0;
  private genSum = 0;
  private genPeak = 0;
  private genPerFighterSum = 0;
  private readonly supplySet: Set<number>;
  private readonly suppliesAtStart: number;
  private suppliesOpened = 0;
  private suppliesOpened60 = 0;
  private firstSupply: number | null = null;
  private collected = 0;
  private wasted = 0;
  private burned = 0;
  private readonly aliveTicks: number[];
  private lastPlayTick = 0;

  constructor(
    initial: GameState,
    private readonly sampleTicks: number = DEFAULT_SAMPLE_TICKS,
  ) {
    this.n = initial.players.length;
    this.base = {
      range: initial.config.generator.baseRange,
      capacity: initial.config.generator.baseCapacity,
    };
    this.camp = new CampTracker(CAMP_SECONDS * 60);
    this.kills = initial.players.map(() => 0);
    this.peakPower = initial.players.map(() => 0);
    this.aliveTicks = initial.players.map(() => 0);
    this.supplySet = new Set(initial.supplies);
    this.suppliesAtStart = initial.supplies.length;
  }

  /** Call after every `tick(state, ...)` with the events it returned. */
  onTick(state: GameState, events: readonly SimEvent[]): void {
    const playSec = state.match.playTicks / 60;
    for (const e of events) this.onEvent(state, e, playSec);
    if (state.match.phase !== 'playing') return;
    // one sample per tick of play: the tick that starts play (playTicks still 0) is not a tick of play,
    // otherwise a fighter alive throughout reads as 1 + 1/playTicks of the match
    if (state.match.playTicks <= this.lastPlayTick) return;
    this.lastPlayTick = state.match.playTicks;
    for (const p of state.players)
      if (p.alive) {
        this.fighterTicks++;
        this.aliveTicks[p.id]!++;
      }
    if (state.match.playTicks % this.sampleTicks === 0) this.sample(state);
  }

  private onEvent(state: GameState, e: SimEvent, playSec: number): void {
    switch (e.type) {
      case 'playerEliminated': {
        this.eliminations++;
        this.elimTimes.push(playSec);
        if (e.creditId !== null) {
          this.credited++;
          this.kills[e.creditId]!++;
          this.noteEncounter(playSec);
        }
        this.causes[causeKey(state, e)]++;
        const c = e.cause;
        if ((c.kind === 'flame' || c.kind === 'vehicle') && c.ownerId === e.playerId) this.selfKills++;
        break;
      }
      case 'generatorPlaced': {
        this.placements++;
        const owner = state.players[e.ownerId];
        const gen = state.generators.find((g) => g.id === e.generatorId);
        if (!owner || !gen) break;
        const foot = previewBlast(state, gen);
        let aimed = false;
        let near = false;
        for (const q of state.players) {
          if (!q.alive || !isOpponent(state, owner.id, q)) continue;
          if (foot.has(q.y * state.width + q.x)) aimed = true;
          if (Math.abs(q.x - e.x) + Math.abs(q.y - e.y) <= ENGAGE_RADIUS) near = true;
        }
        if (aimed) this.aimed++;
        if (near) this.nearPlacements++;
        break;
      }
      case 'blockDestroyed':
        if (this.supplySet.delete(e.y * state.width + e.x)) {
          this.suppliesOpened++;
          if (playSec <= 60) this.suppliesOpened60++;
          this.firstSupply ??= playSec;
        }
        break;
      case 'pickupCollected':
        this.collected++;
        if (e.wasted) this.wasted++;
        break;
      case 'pickupBurned':
        this.burned++;
        break;
      case 'rewardGranted':
        this.rewardsGranted++;
        this.rewards[e.kind] = (this.rewards[e.kind] ?? 0) + 1;
        this.notePower(state.players[e.playerId]);
        break;
      case 'matchEnded': {
        const r = e.result;
        this.result =
          r.kind === 'win'
            ? `win:${r.winnerId}`
            : r.kind === 'teamWin'
              ? `team:${r.team}`
              : `draw:${r.reason}`;
        break;
      }
      default:
        break;
    }
  }

  private noteEncounter(sec: number): void {
    this.firstEncounter = this.firstEncounter === null ? sec : Math.min(this.firstEncounter, sec);
  }

  private notePower(p: Readonly<Player> | undefined): void {
    if (!p) return;
    this.peakPower[p.id] = Math.max(this.peakPower[p.id]!, powerScore(p, this.base));
  }

  /** Spatial sample of the whole field at this moment. */
  private sample(state: GameState): void {
    const { players, width } = state;
    // live blast footprints by owner (chains included): who stands in whose fire
    const feet: { owner: number; tiles: Set<number> }[] = [];
    for (const g of state.generators) {
      if (g.mode === 'disabled' || g.flight !== null || g.carriedBy !== null) continue;
      feet.push({ owner: g.ownerId, tiles: previewBlast(state, g) });
    }
    const sec = state.match.playTicks / 60;
    const aliveCount = players.filter((q) => q.alive).length;
    this.genSamples++;
    this.genSum += feet.length;
    this.genPeak = Math.max(this.genPeak, feet.length);
    if (aliveCount > 0) this.genPerFighterSum += feet.length / aliveCount;
    for (const a of players) {
      if (!a.alive) {
        this.camp.stop(a.id);
        this.empty.stop(a.id);
        continue;
      }
      this.notePower(a);
      this.camp.step(a.id, a.x, a.y, this.sampleTicks);
      let nearest = Infinity;
      for (const q of players) {
        if (!q.alive || !isOpponent(state, a.id, q)) continue;
        nearest = Math.min(nearest, Math.abs(q.x - a.x) + Math.abs(q.y - a.y));
      }
      this.empty.step(a.id, nearest > ENGAGE_RADIUS, this.sampleTicks);
      const opening = state.match.playTicks <= OPENING_SECONDS * 60;
      this.samplePairs++;
      if (opening) this.openPairs++;
      if (nearest <= ENGAGE_RADIUS) {
        this.engaged++;
        if (opening) this.openEngaged++;
      }
      if (nearest < Infinity) {
        this.distSum += nearest;
        this.distCount++;
        if (opening) {
          this.openDistSum += nearest;
          this.openDistCount++;
        }
      }
      const idx = a.y * width + a.x;
      for (const f of feet) {
        const owner = players[f.owner];
        if (owner && isOpponent(state, a.id, owner) && f.tiles.has(idx)) {
          this.exposed++;
          this.noteEncounter(sec);
          if (opening) this.openExposed++;
          break;
        }
      }
    }
  }

  finish(state: GameState, msPerTick = 0): MatchMetrics {
    this.camp.finish();
    this.empty.finish();
    for (const p of state.players) this.notePower(p);
    const playSeconds = state.match.playTicks / 60;
    const order = this.kills.map((k, id) => ({ k, id })).sort((a, b) => b.k - a.k || a.id - b.id);
    const top = order[0]!;
    const share = (a: number, b: number): number => (b > 0 ? a / b : 0);
    return {
      seed: state.seed,
      result: this.result,
      playSeconds,
      fighters: this.n,
      eliminations: this.eliminations,
      elimsPerMinute: share(this.eliminations, playSeconds / 60),
      creditedEliminations: this.credited,
      selfEliminations: this.selfKills,
      firstElimSec: this.elimTimes.length > 0 ? Math.min(...this.elimTimes) : null,
      elims30: this.elimTimes.filter((t) => t <= 30).length,
      elims60: this.elimTimes.filter((t) => t <= 60).length,
      elimTimes: this.elimTimes,
      engagedShare: share(this.engaged, this.samplePairs),
      exposedShare: share(this.exposed, this.samplePairs),
      placements: this.placements,
      placementsPerFighterMinute: share(this.placements, this.fighterTicks / 3600),
      aimedPlacementShare: share(this.aimed, this.placements),
      nearPlacementShare: share(this.nearPlacements, this.placements),
      campShare: share(this.camp.campedTicks, this.fighterTicks),
      meanNearestOpponent: share(this.distSum, this.distCount),
      openingEngagedShare: share(this.openEngaged, this.openPairs),
      openingExposedShare: share(this.openExposed, this.openPairs),
      openingNearestOpponent: share(this.openDistSum, this.openDistCount),
      firstEncounterSec: this.firstEncounter,
      emptyRuns15: this.empty.flaggedRuns,
      longestEmptySec: this.empty.longestTicks / 60,
      causes: this.causes,
      meanLiveGenerators: share(this.genSum, this.genSamples),
      peakLiveGenerators: this.genPeak,
      liveGeneratorsPerFighter: share(this.genPerFighterSum, this.genSamples),
      suppliesStart: this.suppliesAtStart,
      suppliesOpened: this.suppliesOpened,
      suppliesOpened60: this.suppliesOpened60,
      firstSupplyOpenedSec: this.firstSupply,
      pickupsCollected: this.collected,
      pickupsWasted: this.wasted,
      pickupsBurned: this.burned,
      slotSurvival: this.aliveTicks.map((t) => share(t, state.match.playTicks)),
      slotKills: [...this.kills],
      winnerSlot: this.result.startsWith('win:') ? Number(this.result.slice(4)) : null,
      topKills: top.k,
      medianKills: median(this.kills),
      topPower: this.peakPower[top.id]!,
      medianPower: median(this.peakPower),
      rewards: this.rewards,
      rewardsGranted: this.rewardsGranted,
      msPerTick,
    };
  }
}
