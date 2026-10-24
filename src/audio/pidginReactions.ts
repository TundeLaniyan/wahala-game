/**
 * Maps gameplay (SimEvents + GameState + detected near misses) to voice-line trigger events.
 *
 * `reactionsFor` is a pure function, so what the crowd says about what is unit-testable without any
 * audio. It covers every gameplay trigger of the founder's voice manifest (VOICE_TRIGGERS), whether or not
 * a clip exists yet: a trigger without a clip simply stays silent, so a new clip needs no code change.
 * `createPidginReactor` feeds the requests to the voice director (src/audio/pidgin.ts), which owns
 * cooldowns, priorities, line rotation and overlap rules. No game rules live here: it only reads events.
 */
import { sweepVehicleKind } from '../assets/stagePresentation';
import type { GameState, PickupKind, SimEvent } from '../sim';
import type { StingKind } from './music';
import type { NearMiss } from './nearMiss';
import type { PidginVoices, SayOptions, VoiceTrigger } from './pidgin';
import { createRand } from './rng';

export interface VoiceRequest {
  /** Preference order: the first trigger that has a clip speaks. */
  triggers: VoiceTrigger[];
  /** Tile x where it happened (for stereo placement); omitted = centre. */
  x?: number;
  opts: Pick<SayOptions, 'delay' | 'chance' | 'force' | 'key'>;
}

/** Ticks per second of the simulation. */
const TPS = 60;
/** A generator's fuse is "about to go" below this many ticks (a short warning still lands before the blast). */
export const FUSE_WARN_TICKS = 75;
const FINAL_30_TICKS = 30 * TPS;
/** Tiles around the human within which a blast counts as "nearby". */
const NEAR_TILES = 3;
const RARE_PICKUPS: ReadonlySet<PickupKind> = new Set<PickupKind>([
  'okada',
  'diesel',
  'hotfuel',
  'remote',
  'killswitch',
  'voucher',
]);

const isHuman = (s: Readonly<GameState>, id: number): boolean => s.players[id]?.isBot === false;

export interface ReactionMemory {
  fuseCalled: Set<number>;
  final: boolean;
}
export const newMemory = (): ReactionMemory => ({ fuseCalled: new Set(), final: false });

/** True when the human stands in a generator's blast cross (same row or column, within its range). */
function inBlastCross(g: { x: number; y: number; range: number }, p: { x: number; y: number }): boolean {
  const dx = Math.abs(g.x - p.x);
  const dy = Math.abs(g.y - p.y);
  return (dx === 0 && dy <= g.range) || (dy === 0 && dx <= g.range);
}

/**
 * All the voice requests this batch deserves, most important first. `mem` remembers one-shot moments
 * (a generator already warned about, the final-seconds call) between calls.
 */
export function reactionsFor(
  events: readonly SimEvent[],
  state: Readonly<GameState>,
  nearMisses: readonly NearMiss[],
  mem: ReactionMemory,
): VoiceRequest[] {
  const out: VoiceRequest[] = [];
  const add = (triggers: VoiceTrigger[], opts: VoiceRequest['opts'], x?: number): void => {
    out.push({ triggers, opts, x });
  };
  const me = state.players.find((p) => !p.isBot);

  // --- the human won: the closing line
  for (const e of events) {
    if (e.type === 'matchEnded' && e.result.kind === 'win' && isHuman(state, e.result.winnerId))
      add(['ON_MATCH_VICTORY'], { delay: 1.2, force: true });
  }

  // --- a generator about to blow with the human in its cross: the urgent spoken warning
  if (me?.alive && state.match.phase === 'playing') {
    for (const g of state.generators) {
      if (g.mode !== 'timed' || g.carriedBy !== null || g.timer > FUSE_WARN_TICKS || mem.fuseCalled.has(g.id))
        continue;
      if (!inBlastCross(g, me)) continue;
      mem.fuseCalled.add(g.id);
      add(['ON_GENERATOR_CRITICAL_PROXIMITY'], { force: true, key: `fuse${g.id}` }, g.x);
    }
  }

  // --- eliminations (at most one line per batch); the human's own is forced
  const elim = events.find((e) => e.type === 'playerEliminated');
  if (elim && elim.type === 'playerEliminated') {
    const human = isHuman(state, elim.playerId);
    const c = elim.cause;
    // a stage sweep's vehicle is chosen from the stage event's id (the cause carries its credit id)
    const sweep = c.kind === 'hazard' ? state.stage.events.find((ev) => ev.eventId === c.eventId) : undefined;
    const danfo =
      (c.kind === 'vehicle' && c.vehicleKind === 'danfo') ||
      (c.kind === 'hazard' &&
        (c.style === 'danfo' ||
          (c.style === 'traffic' && sweepVehicleKind(c.style, sweep?.id ?? 0) === 'danfo')));
    const self = c.kind === 'flame' && c.ownerId === elim.playerId;
    const triggers: VoiceTrigger[] = danfo
      ? ['ON_DANFO_HAZARD_IMPACT', 'ON_PLAYER_ELIMINATED']
      : self
        ? ['ON_PLAYER_COMEDIC_ELIMINATION', 'ON_PLAYER_SELF_TRAP', 'ON_PLAYER_ELIMINATED']
        : ['ON_PLAYER_ELIMINATED'];
    add(
      triggers,
      { delay: 0.5, chance: human ? 1 : 0.85, force: human, key: `elim${elim.playerId}` },
      elim.x,
    );
  }

  // --- Okada protection: the human is saved (forced); a bot's Okada is only sometimes remarked on
  for (const e of events) {
    if (e.type !== 'okadaBroken') continue;
    const human = isHuman(state, e.playerId);
    add(
      ['ON_OKADA_SHIELD_SAVE'],
      { delay: 0.45, chance: human ? 1 : 0.4, force: human, key: `okada${e.playerId}` },
      e.x,
    );
  }

  // --- attack vehicles and stage traffic
  for (const e of events) {
    if (e.type === 'vehicleWarning' && e.kind === 'keke' && !isHuman(state, e.ownerId))
      add(['ON_KEKE_HAZARD_SPAWN'], { delay: 0.2, key: `veh${e.vehicleId}` }, e.entry.x);
    else if (e.type === 'vehicleLaunched' && e.kind === 'danfo')
      add(['ON_DANFO_HAZARD_SWEEP'], { delay: 0.3, chance: 0.7, key: `veh${e.vehicleId}` }, state.width / 2);
    else if (e.type === 'stageWarning' && e.event.kind === 'sweep') {
      const kind = sweepVehicleKind(e.event.style, e.event.id);
      const x = (e.event.tiles[0] ?? 0) % state.width;
      if (kind === 'keke')
        add(['ON_KEKE_HAZARD_SPAWN'], { delay: 0.2, chance: 0.8, key: `stage${e.event.id}` }, x);
      else if (kind === 'danfo')
        add(['ON_DANFO_HAZARD_SWEEP'], { delay: 0.3, chance: 0.6, key: `stage${e.event.id}` }, x);
    }
  }

  // --- close calls (the near-miss detector already ran for this batch)
  const miss =
    nearMisses.find((m) => m.human && m.kind !== 'okada') ?? nearMisses.find((m) => m.kind !== 'okada');
  if (miss) {
    const chance = miss.human ? 1 : 0.3;
    const triggers: VoiceTrigger[] =
      miss.kind === 'vehicle'
        ? ['ON_NEAR_MISS_OR_TRAP_ARMED', 'ON_PLAYER_NARROW_ESCAPE']
        : ['ON_PLAYER_NARROW_ESCAPE'];
    add(triggers, { delay: 0.45, chance, key: `miss${miss.playerId}` }, miss.x);
  }

  // --- the clock: the endgame starts (the 0:30 floor-trap wave)
  const m = state.match;
  if (m.phase === 'playing') {
    const left = state.config.match.durationTicks - m.playTicks;
    if (left <= FINAL_30_TICKS && !mem.final) {
      mem.final = true;
      add(['ON_FINAL_COUNTDOWN_START'], { delay: 0.8, force: true });
    }
  } else if (m.phase === 'countdown') {
    mem.final = false;
    mem.fuseCalled.clear();
  }

  // --- blasts: colour, more likely when big or close to the human
  const blasts = events.filter((e) => e.type === 'generatorExploded');
  if (blasts.length > 0 && blasts[0]!.type === 'generatorExploded') {
    const first = blasts[0]!;
    const near =
      me?.alive === true &&
      blasts.some(
        (b) =>
          b.type === 'generatorExploded' &&
          Math.max(Math.abs(b.x - me.x), Math.abs(b.y - me.y)) <= NEAR_TILES,
      );
    const big = blasts.length >= 2;
    add(
      big || near ? ['ON_SUDDEN_EXPLOSION_NEARBY', 'ON_GENERATOR_DETONATE'] : ['ON_GENERATOR_DETONATE'],
      { delay: 0.25, chance: big || near ? 0.55 : 0.3, key: `blast${first.eventId}` },
      first.x,
    );
  }

  // --- everything else is colour: occasional, never forced
  for (const e of events) {
    switch (e.type) {
      case 'trapsWarning':
        add(['ON_NEAR_MISS_OR_TRAP_ARMED'], { delay: 0.3, chance: 0.8, key: `traps${e.wave}` });
        break;
      case 'hazardTriggered':
        add(['ON_HAZARD_IMPACT'], { delay: 0.3, chance: 0.5, key: `haz${e.playerId}` });
        break;
      case 'crushLanded':
        if (me?.alive && Math.max(Math.abs(e.x - me.x), Math.abs(e.y - me.y)) <= 2)
          add(['ON_HAZARD_IMPACT'], { delay: 0.2, chance: 0.5, key: `crush${e.x}:${e.y}` }, e.x);
        break;
      case 'crowdLanded':
        if (e.kind === 'firecracker')
          add(['ON_HAZARD_IMPACT'], { delay: 0.2, chance: 0.4, key: `throw${e.throwId}` }, e.x);
        break;
      case 'playerPushed':
        add(['ON_STALL_BUMP_OR_BLOCK'], { delay: 0.2, chance: 0.3, key: `push${e.playerId}` });
        break;
      case 'generatorKicked':
        add(['ON_STALL_BUMP_OR_BLOCK'], { delay: 0.2, chance: 0.2, key: `kick${e.generatorId}` });
        break;
      case 'pickupCollected':
        if (!e.wasted && isHuman(state, e.playerId) && RARE_PICKUPS.has(e.kind))
          add(['ON_POWERUP_PICKUP_OR_CLUTCH'], { delay: 0.35, chance: 0.4, key: `pick${e.pickupId}` });
        break;
      default:
        break;
    }
  }
  return out;
}

/** Which result sting (if any) this batch of events calls for: win/lose from the human's view, or draw. */
export function stingForEnd(events: readonly SimEvent[], state: Readonly<GameState>): StingKind | null {
  for (const e of events) {
    if (e.type !== 'matchEnded') continue;
    if (e.result.kind === 'draw') return 'draw';
    return isHuman(state, e.result.winnerId) ? 'win' : 'lose';
  }
  return null;
}

export interface PidginReactor {
  handle(
    events: readonly SimEvent[],
    state: Readonly<GameState>,
    nearMisses: readonly NearMiss[],
    panFor: (state: Readonly<GameState>, tileX: number) => number,
  ): void;
  reset(): void;
}

export function createPidginReactor(voices: PidginVoices, seed = 0x7a5c): PidginReactor {
  const rand = createRand(seed);
  let mem = newMemory();
  return {
    handle(events, state, nearMisses, panFor) {
      if (!voices.ready) return;
      for (const r of reactionsFor(events, state, nearMisses, mem)) {
        // the voices stand around the arena: a slight bias towards where it happened
        const base = r.x === undefined ? 0 : panFor(state, r.x);
        const pan = base * 0.4 + (rand() * 2 - 1) * 0.1;
        voices.say(r.triggers, { ...r.opts, pan });
      }
    },
    reset() {
      mem = newMemory();
    },
  };
}
