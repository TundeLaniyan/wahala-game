/**
 * Maps gameplay (SimEvents + GameState + detected near misses) to spoken Pidgin reactions.
 *
 * `reactionsFor` is a pure function, so what the crowd says about what is unit-testable without any
 * audio. `createPidginReactor` feeds the requests to the voice director (src/audio/pidgin.ts), which
 * owns cooldowns, line rotation and overlap rules. No game rules live here: it only reads events.
 */
import type { GameState, SimEvent } from '../sim';
import type { StingKind } from './music';
import type { NearMiss } from './nearMiss';
import type { PidginVoices, SayOptions, VoiceCategory } from './pidgin';
import { createRand } from './rng';

export interface VoiceRequest {
  category: VoiceCategory;
  /** Tile x where it happened (for stereo placement); omitted = anywhere in the crowd. */
  x?: number;
  opts: Pick<SayOptions, 'delay' | 'chance' | 'force' | 'strength' | 'key'>;
}

/** Ticks per second of the simulation. */
const TPS = 60;
/** A generator's fuse is "about to go" below this many ticks. */
const FUSE_WARN_TICKS = 50;
/** ...and the crowd only shouts about it when it is within this many tiles of the human. */
const FUSE_NEAR_TILES = 4;
const FINAL_30_TICKS = 30 * TPS;
const FINAL_10_TICKS = 10 * TPS;

const isHuman = (s: Readonly<GameState>, id: number): boolean => s.players[id]?.isBot === false;

export interface ReactionMemory {
  fuseCalled: Set<number>;
  final30: boolean;
  final10: boolean;
}
export const newMemory = (): ReactionMemory => ({ fuseCalled: new Set(), final30: false, final10: false });

/**
 * All the reactions this batch deserves, most important first. `mem` remembers one-shot moments
 * (a generator already shouted about, final-stretch calls) between calls.
 */
export function reactionsFor(
  events: readonly SimEvent[],
  state: Readonly<GameState>,
  nearMisses: readonly NearMiss[],
  mem: ReactionMemory,
): VoiceRequest[] {
  const out: VoiceRequest[] = [];
  const add = (category: VoiceCategory, opts: VoiceRequest['opts'], x?: number): void => {
    out.push({ category, opts, x });
  };

  // --- the match ends: the loudest, most important line
  for (const e of events) {
    if (e.type !== 'matchEnded') continue;
    const r = e.result;
    if (r.kind === 'win')
      add(isHuman(state, r.winnerId) ? 'win' : 'lose', { delay: 1.3, force: true, strength: 1 });
    else add('draw', { delay: 1.3, force: true, strength: 1 });
  }

  // --- eliminations (at most one line per batch; vehicle kills get the vehicle's own line)
  const elim = events.find((e) => e.type === 'playerEliminated');
  if (elim && elim.type === 'playerEliminated') {
    const human = isHuman(state, elim.playerId);
    const cause = elim.cause;
    const category: VoiceCategory =
      cause.kind === 'vehicle' ? cause.vehicleKind : human ? 'elim_human' : 'elim_bot';
    add(
      category,
      { delay: 0.55, chance: human ? 1 : 0.85, force: human, strength: 1, key: `elim${elim.playerId}` },
      elim.x,
    );
  }

  // --- Okada protection (the human is saved; a bot's Okada is just comic)
  for (const e of events) {
    if (e.type !== 'okadaBroken') continue;
    const human = isHuman(state, e.playerId);
    add(
      human ? 'okada_save' : 'okada_break',
      { delay: 0.5, chance: human ? 1 : 0.55, force: human, strength: 0.9, key: `okada${e.playerId}` },
      e.x,
    );
  }

  // --- vehicles
  for (const e of events) {
    if (e.type === 'vehicleLaunched')
      add(e.kind, { delay: 0.35, chance: 0.8, strength: 0.9, key: `veh${e.vehicleId}` }, state.width / 2);
    else if (e.type === 'vehicleWarning')
      add(e.kind, { delay: 0.5, chance: 0.35, strength: 0.8, key: `veh${e.vehicleId}` }, e.entry.x);
    else if (e.type === 'vehicleDestroyed')
      add('vehicle_destroyed', { delay: 0.7, chance: 0.9, strength: 0.9, key: `wreck${e.vehicleId}` }, e.x);
  }

  // --- close calls (the near-miss detector already ran for this batch)
  const miss = nearMisses.find((m) => m.human) ?? nearMisses[0];
  if (miss && miss.kind !== 'okada') {
    const chance = miss.human ? 1 : 0.3;
    if (miss.kind === 'vehicle')
      add(miss.vehicleKind, { delay: 0.35, chance, strength: 0.85, key: `miss${miss.playerId}` }, miss.x);
    else add('escape', { delay: 0.5, chance, strength: 0.9, key: `miss${miss.playerId}` }, miss.x);
  }

  // --- a generator about to blow next to the human
  const me = state.players.find((p) => !p.isBot);
  if (me?.alive) {
    for (const g of state.generators) {
      if (g.mode !== 'timed' || g.carriedBy !== null || g.timer > FUSE_WARN_TICKS || mem.fuseCalled.has(g.id))
        continue;
      if (Math.max(Math.abs(g.x - me.x), Math.abs(g.y - me.y)) > FUSE_NEAR_TILES) continue;
      mem.fuseCalled.add(g.id);
      add('fuse', { chance: 0.75, strength: 1, key: `fuse${g.id}` }, g.x);
    }
  }

  // --- the clock
  const m = state.match;
  if (m.phase === 'playing') {
    const left = state.config.match.durationTicks - m.playTicks;
    if (left <= FINAL_30_TICKS && !mem.final30) {
      mem.final30 = true;
      add('final', { delay: 0.8, force: true, strength: 0.9 });
    }
    if (left <= FINAL_10_TICKS && !mem.final10) {
      mem.final10 = true;
      add('final', { chance: 0.9, strength: 1 });
    }
  } else if (m.phase === 'countdown') {
    mem.final30 = false;
    mem.final10 = false;
    mem.fuseCalled.clear();
  }

  // --- everything else is colour: occasional, never forced
  for (const e of events) {
    switch (e.type) {
      case 'matchStarted':
        add('match_start', { delay: 0.9, force: true, strength: 0.9 });
        break;
      case 'generatorPlaced':
        add(
          'gen_placed',
          {
            delay: 0.3,
            chance: isHuman(state, e.ownerId) ? 0.3 : 0.25,
            strength: 0.7,
            key: `place${e.generatorId}`,
          },
          e.x,
        );
        break;
      case 'generatorKicked':
        add('kicked', { delay: 0.25, chance: 0.3, strength: 0.7, key: `kick${e.generatorId}` });
        break;
      case 'generatorThrown':
        add('kicked', { delay: 0.35, chance: 0.4, strength: 0.7, key: `throw${e.generatorId}` });
        break;
      case 'pickupCollected':
        if (
          !e.wasted &&
          isHuman(state, e.playerId) &&
          ['okada', 'diesel', 'hotfuel', 'remote', 'killswitch'].includes(e.kind)
        )
          add('pickup', { delay: 0.4, chance: 0.3, strength: 0.7, key: `pick${e.pickupId}` });
        break;
      case 'playerPushed':
        add('pushed', { delay: 0.2, chance: 0.4, strength: 0.7, key: `push${e.playerId}` });
        break;
      case 'playerDazed':
        add('dazed', { delay: 0.4, chance: 0.4, strength: 0.7, key: `daze${e.playerId}` });
        break;
      case 'crowdWarning':
        add('thrown', { delay: 0.2, chance: 0.6, strength: 0.7, key: `throw${e.throwId}` }, e.x);
        break;
      case 'crushLanded':
        add('crush', { delay: 0.25, chance: 0.45, strength: 0.8, key: `crush${e.x}:${e.y}` }, e.x);
        break;
      case 'hazardTriggered':
        add('hazard', { delay: 0.4, chance: 0.6, strength: 0.8, key: `haz${e.playerId}` });
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
        // the crowd stands around the arena: bias towards where it happened but never exactly there
        const base = r.x === undefined ? 0 : panFor(state, r.x);
        const pan = Math.max(-0.9, Math.min(0.9, base * 0.7 + (rand() * 2 - 1) * 0.45));
        voices.say(r.category, { ...r.opts, pan });
      }
    },
    reset() {
      mem = newMemory();
    },
  };
}
