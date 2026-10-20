import { vi } from 'vitest';
import { createAudio } from '../../src/audio';
import type { AudioEngine, AudioOptions } from '../../src/audio';
import type { PlayTrace } from '../../src/audio/mixer';
import type { GameState, SimEvent } from '../../src/sim';
import { sandbox } from '../helpers';
import { FakeContext } from './fakeContext';
import type { FakeContextOptions } from './fakeContext';

/** One sample of every SimEvent type. The Record type makes a new sim event a compile error here. */
export const SAMPLES: Record<SimEvent['type'], SimEvent> = {
  matchStarted: { type: 'matchStarted' },
  matchEnded: { type: 'matchEnded', result: { kind: 'win', winnerId: 0 } },
  generatorPlaced: { type: 'generatorPlaced', generatorId: 1, ownerId: 0, x: 3, y: 3 },
  generatorExploded: {
    type: 'generatorExploded',
    generatorId: 1,
    ownerId: 0,
    x: 3,
    y: 3,
    eventId: 1,
    range: 2,
  },
  generatorKicked: { type: 'generatorKicked', generatorId: 1 },
  generatorCarried: { type: 'generatorCarried', generatorId: 1, playerId: 0, bonus: true },
  generatorDropped: { type: 'generatorDropped', generatorId: 1, playerId: 0 },
  generatorThrown: { type: 'generatorThrown', generatorId: 1, playerId: 0, toX: 5, toY: 3 },
  generatorDisarmed: { type: 'generatorDisarmed', generatorId: 1, playerId: 0 },
  generatorDudCleaned: { type: 'generatorDudCleaned', generatorId: 1, x: 2, y: 2 },
  blockDestroyed: { type: 'blockDestroyed', x: 4, y: 4, by: 'flame' },
  pickupRevealed: { type: 'pickupRevealed', pickupId: 1, x: 4, y: 4, kind: 'petrol' },
  pickupCollected: { type: 'pickupCollected', pickupId: 1, playerId: 0, kind: 'okada', wasted: false },
  pickupBurned: { type: 'pickupBurned', pickupId: 1, x: 4, y: 4 },
  pickupDropped: { type: 'pickupDropped', pickupId: 1, x: 4, y: 4, kind: 'socket' },
  playerEliminated: {
    type: 'playerEliminated',
    playerId: 1,
    cause: { kind: 'flame', ownerId: 0, eventId: 1 },
    x: 5,
    y: 5,
  },
  playerJumped: { type: 'playerJumped', playerId: 0 },
  okadaMounted: { type: 'okadaMounted', playerId: 0 },
  okadaBroken: { type: 'okadaBroken', playerId: 0, x: 1, y: 1 },
  skillUsed: { type: 'skillUsed', playerId: 0, skill: 'push', targetId: 1 },
  playerPushed: { type: 'playerPushed', playerId: 1, byId: 0, fromX: 1, fromY: 1 },
  playerDazed: { type: 'playerDazed', playerId: 1, byId: 0 },
  cursed: { type: 'cursed', playerId: 0, curse: 'inverted' },
  vehicleEntryBegan: { type: 'vehicleEntryBegan', playerId: 0 },
  vehicleEntryCancelled: { type: 'vehicleEntryCancelled', playerId: 0, reason: 'cancel' },
  vehicleWarning: { type: 'vehicleWarning', vehicleId: 1, kind: 'danfo', ownerId: 1, entry: { x: 0, y: 3 } },
  vehicleLaunched: { type: 'vehicleLaunched', vehicleId: 1, kind: 'taxi', ownerId: 1 },
  vehicleHitPlayer: { type: 'vehicleHitPlayer', vehicleId: 1, playerId: 0 },
  vehicleHitGenerator: { type: 'vehicleHitGenerator', vehicleId: 1, generatorId: 1 },
  vehicleDamaged: { type: 'vehicleDamaged', vehicleId: 1, damage: 2, total: 4, resistance: 9 },
  vehicleDestroyed: { type: 'vehicleDestroyed', vehicleId: 1, x: 6, y: 3, reason: 'blast' },
  vehicleExited: { type: 'vehicleExited', vehicleId: 1 },
  crushWarning: { type: 'crushWarning', x: 2, y: 2, landTick: 100 },
  crushLanded: { type: 'crushLanded', x: 2, y: 2 },
  crowdWarning: { type: 'crowdWarning', throwId: 1, x: 2, y: 2, kind: 'firecracker', landTick: 100 },
  crowdLanded: { type: 'crowdLanded', throwId: 1, x: 2, y: 2, kind: 'bottle' },
  hazardTriggered: { type: 'hazardTriggered', playerId: 0, kind: 'oil' },
};

export interface Rig {
  audio: AudioEngine;
  ctx: FakeContext;
  errors: unknown[];
  traces: PlayTrace[];
  /** Ids played so far, in order. */
  ids(): string[];
}

/**
 * Builds an engine on a strict fake context. The bank renders at 1/4 rate, on demand and without
 * background warm-up (so only the sounds a test touches are rendered); fetch is off by default.
 */
export function makeRig(extra: Partial<AudioOptions> = {}, ctxOpts: FakeContextOptions = {}): Rig {
  const ctx = new FakeContext(ctxOpts);
  const errors: unknown[] = [];
  const traces: PlayTrace[] = [];
  const audio = createAudio({
    contextFactory: () => ctx,
    onError: (e) => errors.push(e),
    fetch: null,
    bank: { rateScale: 0.25, cache: true, syncRender: true },
    onPlay: (t) => traces.push(t),
    ...extra,
  });
  return { audio, ctx, errors, traces, ids: () => traces.map((t) => t.id) };
}

/** Lets the sliced background warm-up finish (fake timers must be active). */
export function finishWarmup(): void {
  for (let i = 0; i < 20000 && vi.getTimerCount() > 0; i++) vi.advanceTimersByTime(10);
}

export function playState(players = 2): GameState {
  return sandbox({ players });
}
