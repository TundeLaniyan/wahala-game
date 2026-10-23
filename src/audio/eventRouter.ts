/**
 * Maps `SimEvent`s to sound and crowd reactions. The handler table is typed
 * `Record<SimEvent['type'], ...>`, so adding an event type to the sim is a compile error here until
 * it is given a handler (or an explicit no-op). Per-call batching keeps blasts with many soft
 * blocks from spawning dozens of voices.
 *
 * Besides direct event -> sound mapping the router derives near misses (see ./nearMiss.ts) and
 * asks the reaction director for crowd responses. All sounds referenced here are synthesised bank
 * ids; recorded slots with the same ids override them transparently.
 */
import type { GameState, SimEvent, TilePos } from '../sim';
import type { Ambience } from './ambience';
import type { Buses } from './buses';
import type { Mixer } from './mixer';
import { createNearMissDetector } from './nearMiss';
import type { NearMiss, NearMissDetector } from './nearMiss';
import type { SoundId } from './recipes';
import type { ReactionDirector, ReactionRequest } from './reactions';
import { createRand } from './rng';

type EventOf<K extends SimEvent['type']> = Extract<SimEvent, { type: K }>;
type Handler<K extends SimEvent['type']> = (e: EventOf<K>, c: RouteCtx) => void;
type Handlers = { [K in SimEvent['type']]: Handler<K> };

/** Pickups that earn the fancy chime. */
const RARE = new Set(['okada', 'diesel', 'hotfuel', 'remote', 'killswitch', 'gloves', 'grip']);
const MAX_BLASTS_PER_CALL = 3;
const MAX_ELIM_PER_CALL = 2;
const PAN_WIDTH = 0.6;
/** The final stretch of the match (30 s at 60 ticks/s). */
const FINAL_TICKS = 1800;

interface RouteCtx {
  mixer: Mixer;
  buses: Buses;
  crowd: ReactionDirector;
  ambience: Ambience;
  rand: () => number;
  state: Readonly<GameState>;
  /** Explosions per eventId in the current call (chain size). */
  chain: Map<number, number>;
  blocks: number;
  blockPanSum: number;
  blocksDone: boolean;
  blasts: number;
  blastVariant: number;
  elims: number;
  /** Last time (audio clock) each rate-limited key played. */
  last: Map<string, number>;
  now: number;
}

/** Rate limiter on the audio clock. */
function allow(c: RouteCtx, key: string, gap: number): boolean {
  const prev = c.last.get(key);
  if (prev !== undefined && c.now - prev < gap) return false;
  c.last.set(key, c.now);
  return true;
}

const panOf = (c: RouteCtx, x: number): number => {
  const half = (c.state.width - 1) / 2;
  return half > 0 ? Math.max(-1, Math.min(1, (x - half) / half)) * PAN_WIDTH : 0;
};
const isHuman = (c: RouteCtx, playerId: number): boolean => c.state.players[playerId]?.isBot === false;
const playerX = (c: RouteCtx, id: number): number => c.state.players[id]?.x ?? (c.state.width - 1) / 2;
const generatorX = (c: RouteCtx, id: number): number =>
  c.state.generators.find((g) => g.id === id)?.x ?? (c.state.width - 1) / 2;
const vehicleTile = (c: RouteCtx, id: number): TilePos | null => {
  const v = c.state.vehicles.find((q) => q.id === id);
  return v ? (v.route[Math.min(v.index, v.route.length - 1)] ?? null) : null;
};
const vehicleX = (c: RouteCtx, id: number): number => vehicleTile(c, id)?.x ?? (c.state.width - 1) / 2;
const aliveCount = (c: RouteCtx): number => c.state.players.filter((p) => p.alive).length;

const sfx = (c: RouteCtx, id: SoundId, pan = 0, gain = 1, rate = 1, delay = 0): boolean =>
  c.mixer.play(id, { pan, gain, rate, delay });
const react = (c: RouteCtx, req: ReactionRequest): boolean => c.crowd.react(req, c.now);
const jitter = (c: RouteCtx, spread: number): number => 1 + (c.rand() * 2 - 1) * spread;

const handlers: Handlers = {
  matchStarted: (_e, c) => {
    c.ambience.swell(0.7);
    react(c, { kind: 'cheer', strength: 0.7, force: true });
    react(c, { kind: 'whistle', strength: 0.6, chance: 0.7, delay: 0.5 });
  },
  matchEnded: (e, c) => {
    c.buses.duck('blast');
    if (e.result.kind === 'win') {
      if (isHuman(c, e.result.winnerId)) {
        sfx(c, 'win_sting');
        react(c, { kind: 'roar', strength: 1, force: true, delay: 0.25 });
        react(c, { kind: 'whistle', strength: 0.8, force: true, delay: 1.2 });
      } else {
        sfx(c, 'lose_sting');
        react(c, { kind: 'groan', strength: 0.8, force: true, delay: 0.3 });
        react(c, { kind: 'clap', strength: 0.5, chance: 0.8, delay: 1.6 });
      }
    } else {
      sfx(c, 'draw_sting');
      react(c, { kind: 'gasp', strength: 0.8, force: true, delay: 0.2 });
      react(c, { kind: 'laugh', strength: 0.6, chance: 0.8, delay: 0.9 });
    }
    c.ambience.swell(1);
  },
  generatorPlaced: (e, c) => {
    if (allow(c, 'place', 0.05)) sfx(c, 'gen_place', panOf(c, e.x), 1, jitter(c, 0.04));
  },
  generatorExploded: (e, c) => {
    if (c.blasts >= MAX_BLASTS_PER_CALL) return;
    c.blasts++;
    const n = c.chain.get(e.eventId) ?? 1;
    // Weight grows with chain size and with blast reach (base range 2 .. max 8; Power Diesel is larger).
    const reach = Math.max(0, Math.min(1, (Math.min(e.range, 8) - 2) / 6));
    const power = Math.min(1, (n - 1) / 3 + 0.5 * reach);
    // successive blasts rotate through the variants so a chain never plays the same sample twice
    c.blastVariant = (c.blastVariant + 1) % 3;
    const variant = (['explosion_1', 'explosion_2', 'explosion_3'] as const)[c.blastVariant]!;
    // bigger blasts: lower, heavier playback + more gain
    sfx(c, variant, panOf(c, e.x), 0.8 + 0.2 * power, 1.07 - 0.17 * power);
    if (power > 0.45 && c.blasts === 1)
      sfx(c, 'explosion_rumble', panOf(c, e.x), 0.45 + 0.4 * power, 1, 0.04);
    c.buses.duck('blast');
    if (c.blasts === 1) {
      c.ambience.swell(0.4 + 0.5 * power);
      if (n >= 3) {
        react(c, { kind: 'cheerBig', strength: 1, delay: 0.5 });
        react(c, { kind: 'clap', strength: 0.6, chance: 0.6, delay: 1.2 });
      } else if (n === 2) react(c, { kind: 'cheer', strength: 0.8, chance: 0.9, delay: 0.45 });
      else react(c, { kind: 'ooh', strength: 0.4 + 0.3 * reach, chance: 0.3, delay: 0.4 });
    }
  },
  generatorKicked: (e, c) => {
    sfx(c, 'gen_kick', panOf(c, generatorX(c, e.generatorId)), 1, jitter(c, 0.05));
  },
  generatorCarried: (e, c) => {
    sfx(c, 'gen_carry', panOf(c, playerX(c, e.playerId)), 1, e.bonus ? 1.25 : 1);
  },
  generatorDropped: (e, c) => {
    sfx(c, 'gen_drop', panOf(c, generatorX(c, e.generatorId)), 1, jitter(c, 0.05));
  },
  generatorThrown: (e, c) => {
    sfx(c, 'gen_throw', panOf(c, playerX(c, e.playerId)));
  },
  generatorDisarmed: (e, c) => {
    sfx(c, 'gen_powerdown', panOf(c, generatorX(c, e.generatorId)));
    react(c, { kind: 'whistle', strength: 0.5, chance: 0.3, delay: 0.7 });
  },
  generatorDudCleaned: (e, c) => {
    sfx(c, 'gen_dud', panOf(c, e.x));
  },
  blockDestroyed: (e, c) => {
    if (c.blocksDone) return;
    c.blocksDone = true;
    if (!allow(c, 'block', 0.06)) return;
    const n = Math.max(1, c.blocks);
    const id = c.rand() < 0.5 ? 'block_crumble_1' : 'block_crumble_2';
    sfx(c, id, panOf(c, c.blockPanSum / n || e.x), 0.6 + 0.08 * Math.min(n, 5), jitter(c, 0.06));
  },
  pickupRevealed: (e, c) => {
    if (allow(c, 'reveal', 0.05)) sfx(c, 'pickup_reveal', panOf(c, e.x));
  },
  pickupCollected: (e, c) => {
    const pan = panOf(c, playerX(c, e.playerId));
    const mine = isHuman(c, e.playerId) ? 1 : 0.55; // other players' pickups sit lower in the mix
    if (e.wasted) sfx(c, 'pickup_wasted', pan, mine);
    else if (e.kind === 'curse')
      return; // the `cursed` event that follows owns this moment
    else if (e.kind === 'voucher') {
      sfx(c, 'pickup_voucher', pan, mine);
      if (isHuman(c, e.playerId)) react(c, { kind: 'cheer', strength: 0.6, chance: 0.6, delay: 0.3 });
    } else if (RARE.has(e.kind)) {
      sfx(c, 'pickup_rare', pan, mine);
      react(c, { kind: 'whistle', strength: 0.5, chance: isHuman(c, e.playerId) ? 0.5 : 0.25, delay: 0.25 });
      if (isHuman(c, e.playerId)) react(c, { kind: 'cheer', strength: 0.5, chance: 0.4, delay: 0.5 });
    } else sfx(c, 'pickup_1', pan, mine, 0.97 + c.rand() * 0.1);
  },
  pickupBurned: (e, c) => {
    if (allow(c, 'burn', 0.08)) sfx(c, 'pickup_burn', panOf(c, e.x));
  },
  pickupDropped: (e, c) => {
    if (allow(c, 'drop', 0.08)) sfx(c, 'pickup_drop', panOf(c, e.x));
  },
  playerEliminated: (e, c) => {
    if (c.elims >= MAX_ELIM_PER_CALL) return;
    c.elims++;
    const human = isHuman(c, e.playerId);
    const left = aliveCount(c);
    const final = left <= 1;
    const id = (['elim_slide', 'elim_boing', 'elim_womp'] as const)[Math.floor(c.rand() * 3)]!;
    sfx(c, id, panOf(c, e.x), human ? 1 : 0.85);
    c.buses.duck('blast');
    const byVehicle = e.cause.kind === 'vehicle';
    if (human) {
      react(c, { kind: 'groan', strength: final ? 1 : 0.85, force: true, delay: 0.4 });
      react(c, { kind: 'laugh', strength: 0.6, chance: 0.5, delay: 1.3 });
    } else {
      if (byVehicle) react(c, { kind: 'shout', strength: 0.9, chance: 0.9, delay: 0.2 });
      if (final) react(c, { kind: 'cheerBig', strength: 1, chance: 1, delay: 0.5, force: true });
      else {
        react(c, { kind: 'cheer', strength: 0.7, chance: 0.75, delay: 0.55 });
        react(c, { kind: 'laugh', strength: 0.6, chance: 0.5, delay: 1.0 });
      }
    }
    c.ambience.swell(final ? 1 : human ? 0.8 : 0.6);
  },
  playerJumped: (e, c) => {
    if (allow(c, 'hop', 0.1)) sfx(c, 'hop', panOf(c, playerX(c, e.playerId)));
  },
  okadaMounted: (e, c) => {
    sfx(c, 'okada_mount', panOf(c, playerX(c, e.playerId)));
  },
  okadaBroken: (e, c) => {
    sfx(c, 'okada_break', panOf(c, e.x));
    c.buses.duck('blast');
    c.ambience.swell(0.7);
    // the near-miss detector adds the "that was close" gasp/relief; here the comic laugh
    react(c, { kind: 'laugh', strength: 0.6, chance: 0.7, delay: 1.0 });
  },
  skillUsed: (e, c) => {
    if (allow(c, 'skill', 0.08)) sfx(c, 'push', panOf(c, playerX(c, e.playerId)));
  },
  playerPushed: (e, c) => {
    sfx(c, 'gen_drop', panOf(c, playerX(c, e.playerId)), 0.9);
    react(c, { kind: 'gasp', strength: 0.3, chance: 0.4, delay: 0.1 });
  },
  playerDazed: (e, c) => {
    sfx(c, 'daze', panOf(c, playerX(c, e.playerId)));
    react(c, { kind: 'laugh', strength: 0.5, chance: 0.6, delay: 0.5 });
  },
  cursed: (e, c) => {
    sfx(c, 'pickup_curse', panOf(c, playerX(c, e.playerId)), isHuman(c, e.playerId) ? 1 : 0.6);
    react(c, { kind: 'laugh', strength: 0.5, chance: 0.5, delay: 0.7 });
  },
  vehicleEntryBegan: (e, c) => {
    if (isHuman(c, e.playerId)) sfx(c, 'vehicle_entry_on');
  },
  vehicleEntryCancelled: (e, c) => {
    if (isHuman(c, e.playerId)) sfx(c, 'vehicle_entry_off');
  },
  vehicleWarning: (e, c) => {
    sfx(c, `${e.kind}_horn`, panOf(c, e.entry.x));
    c.buses.duck('warning');
    react(c, { kind: 'gasp', strength: 0.6, chance: 0.7, delay: 0.25 });
    react(c, { kind: 'whistle', strength: 0.5, chance: 0.3, delay: 1.0 });
  },
  vehicleLaunched: (e, c) => {
    sfx(c, `${e.kind}_launch`, panOf(c, vehicleX(c, e.vehicleId)));
    c.ambience.swell(0.7);
    react(c, { kind: 'shout', strength: 0.9, chance: 0.9, delay: 0.1 });
  },
  vehicleHitPlayer: (e, c) => {
    sfx(c, 'vehicle_hit', panOf(c, playerX(c, e.playerId)));
    react(c, { kind: 'ooh', strength: 0.9, chance: 0.85, delay: 0.15 });
  },
  vehicleHitGenerator: (e, c) => {
    if (allow(c, 'vhitgen', 0.08)) sfx(c, 'vehicle_hit_gen', panOf(c, generatorX(c, e.generatorId)));
  },
  vehicleDamaged: (e, c) => {
    if (allow(c, 'vdamage', 0.1)) sfx(c, 'vehicle_damage', panOf(c, vehicleX(c, e.vehicleId)));
  },
  vehicleDestroyed: (e, c) => {
    sfx(c, 'vehicle_wreck', panOf(c, e.x));
    c.buses.duck('blast');
    c.ambience.swell(0.9);
    react(c, { kind: 'cheer', strength: 0.9, chance: 0.95, delay: 0.5 });
    react(c, { kind: 'clap', strength: 0.5, chance: 0.5, delay: 1.1 });
  },
  vehicleExited: () => undefined, // silent by design; the vehicle simply leaves
  crushWarning: (e, c) => {
    if (!allow(c, 'crushwarn', 0.35)) return;
    sfx(c, 'crush_warning', panOf(c, e.x));
    c.buses.duck('warning');
  },
  crushLanded: (e, c) => {
    if (!allow(c, 'crushland', 0.12)) return;
    sfx(c, 'crush_slam', panOf(c, e.x));
    c.buses.duck('blast');
    react(c, { kind: 'gasp', strength: 0.6, chance: 0.7, delay: 0.2 });
  },
  crowdWarning: (e, c) => {
    sfx(c, 'crowd_throw_whistle', panOf(c, e.x));
    c.buses.duck('warning');
  },
  crowdLanded: (e, c) => {
    sfx(c, e.kind === 'bottle' ? 'bottle_smash' : 'firecracker_bang', panOf(c, e.x));
    c.buses.duck('blast');
    react(
      c,
      e.kind === 'bottle'
        ? { kind: 'laugh', strength: 0.7, chance: 0.8, delay: 0.3 }
        : { kind: 'gasp', strength: 0.6, chance: 0.8, delay: 0.2 },
    );
  },
  hazardTriggered: (e, c) => {
    sfx(c, e.kind === 'pothole' ? 'pothole_thud' : 'oil_squeak', panOf(c, playerX(c, e.playerId)));
    react(c, { kind: 'laugh', strength: 0.5, chance: 0.6, delay: 0.5 });
  },
  // Mandatory endgame traps: an unmistakable alarm when a wave is telegraphed, the floor giving way when it goes live.
  trapsWarning: (_e, c) => {
    sfx(c, 'crush_warning', 0, 1);
    c.buses.duck('warning');
    react(c, { kind: 'gasp', strength: 0.7, chance: 0.9, delay: 0.3 });
  },
  trapsActivated: (e, c) => {
    if (e.tiles.length === 0) return;
    sfx(c, 'pothole_thud', 0, 1);
    sfx(c, 'oil_squeak', 0, 0.8);
    c.buses.duck('blast');
  },
  // Stage hazards: every lethal one is announced with a sound as well as on the floor.
  stageWarning: (e, c) => {
    const x = tileXOf(c, e.event.tiles[0]);
    const s = e.event.style;
    if (s === 'danfo') sfx(c, 'danfo_horn', panOf(c, x));
    else if (s === 'traffic') sfx(c, c.rand() < 0.5 ? 'danfo_horn' : 'keke_horn', panOf(c, x));
    else if (s === 'checkpoint') sfx(c, 'taxi_horn', panOf(c, x));
    else if (s === 'debris' || s === 'power') sfx(c, 'crush_warning', panOf(c, x), 0.8);
    else if (s === 'gust' || s === 'wash') sfx(c, 'crowd_throw_whistle', 0, 0.6);
    else if (s === 'merch') sfx(c, 'crowd_throw_whistle', panOf(c, x), 0.5);
    if (s !== 'merch') c.buses.duck('warning');
  },
  stageStarted: (e, c) => {
    const x = tileXOf(c, e.event.tiles[0]);
    const s = e.event.style;
    if (s === 'danfo' || s === 'traffic') sfx(c, 'danfo_pass', panOf(c, x));
    else if (s === 'checkpoint') sfx(c, 'taxi_pass', panOf(c, x));
    else if (s === 'debris') sfx(c, 'crush_slam', panOf(c, x));
    else if (s === 'power') sfx(c, 'gen_remote_blip', panOf(c, x), 1, 0.6);
    else if (s === 'wash') sfx(c, 'oil_squeak', 0, 0.9, 0.6);
    else if (s === 'gust') sfx(c, 'hop', 0, 0.5, 0.5);
  },
  stageEnded: () => undefined,
  stageSweepStep: () => undefined,
  stageBlockDropped: (e, c) => sfx(c, 'block_crumble_1', panOf(c, e.x), 0.7, 1.3),
  playerTeleported: (e, c) => {
    sfx(c, 'hop', panOf(c, e.fromX), 0.9, 0.8);
    sfx(c, 'hop', panOf(c, e.toX), 0.9, 1.2, 0.15);
  },
  generatorDoused: (e, c) => sfx(c, 'gen_dud', panOf(c, generatorX(c, e.generatorId))),
};

function tileXOf(c: RouteCtx, index: number | undefined): number {
  return index === undefined ? (c.state.width - 1) / 2 : index % c.state.width;
}

/** Crowd and engine response to a near miss. At most one of these per call (see handle). */
function reactToNearMiss(m: NearMiss, c: RouteCtx): void {
  const weight = m.human ? 1 : 0.55;
  const chance = m.human ? 1 : 0.35;
  if (m.kind === 'vehicle') {
    sfx(c, `${m.vehicleKind}_pass`, panOf(c, m.x), weight);
    react(c, { kind: 'ooh', strength: 0.8 * weight + 0.1, chance, delay: 0.2 });
  } else {
    react(c, { kind: 'gasp', strength: 0.9 * weight, chance, delay: m.kind === 'okada' ? 0.1 : 0.2 });
    react(c, { kind: m.human ? 'cheer' : 'ooh', strength: 0.7 * weight, chance: chance * 0.8, delay: 0.9 });
  }
  c.ambience.swell(0.6 * weight);
}

export interface EventRouter {
  handle(events: readonly SimEvent[], state: Readonly<GameState>): void;
  /** Tile x -> stereo pan (-0.6..0.6) for the current arena width. */
  panFor(state: Readonly<GameState>, tileX: number): number;
  /** Near misses found by the latest `handle` (introspection for tests). */
  readonly lastNearMisses: readonly NearMiss[];
  reset(): void;
}

export interface RouterDeps {
  mixer: Mixer;
  buses: Buses;
  crowd: ReactionDirector;
  ambience: Ambience;
  now: () => number;
  seed?: number;
}

export function createEventRouter(d: RouterDeps): EventRouter {
  const detector: NearMissDetector = createNearMissDetector();
  // One context object is reused for every call (no per-call allocation on the hot path).
  const c: RouteCtx = {
    mixer: d.mixer,
    buses: d.buses,
    crowd: d.crowd,
    ambience: d.ambience,
    rand: createRand(d.seed ?? 0x5eed),
    state: undefined as unknown as GameState,
    chain: new Map(),
    blocks: 0,
    blockPanSum: 0,
    blocksDone: false,
    blasts: 0,
    blastVariant: Math.floor(d.seed ?? 0) % 3,
    elims: 0,
    last: new Map(),
    now: 0,
  };
  let misses: NearMiss[] = [];
  let final30 = false;
  return {
    get lastNearMisses() {
      return misses;
    },
    handle(events, state) {
      c.state = state;
      c.now = d.now();
      misses = detector.detect(events, state); // also runs on empty batches: vehicles move between events
      // entering the last 30 seconds: one big build-up moment
      const m30 = state.match;
      const lastPhase =
        m30.phase === 'playing' && m30.playTicks >= state.config.match.durationTicks - FINAL_TICKS;
      if (lastPhase && !final30) {
        final30 = true;
        d.ambience.swell(0.8);
        react(c, { kind: 'whistle', strength: 0.8, force: true });
        react(c, { kind: 'cheerBig', strength: 0.8, force: true, delay: 0.3 });
      } else if (!lastPhase && m30.phase !== 'ended') final30 = false;
      c.chain.clear();
      c.blocks = 0;
      c.blockPanSum = 0;
      c.blocksDone = false;
      c.blasts = 0;
      c.elims = 0;
      for (const e of events) {
        if (e.type === 'generatorExploded') c.chain.set(e.eventId, (c.chain.get(e.eventId) ?? 0) + 1);
        else if (e.type === 'blockDestroyed') {
          c.blocks++;
          c.blockPanSum += e.x;
        }
      }
      // the human's close call first, else the first one found; handled before the generic event
      // reactions because it is the more specific story ("that was close!")
      const m = misses.find((x) => x.human) ?? misses[0];
      if (m) reactToNearMiss(m, c);
      for (const e of events) (handlers[e.type] as (ev: SimEvent, ctx: RouteCtx) => void)(e, c);
    },
    panFor: (state, x) => {
      c.state = state;
      return panOf(c, x);
    },
    reset() {
      detector.reset();
      c.last.clear();
      misses = [];
      final30 = false;
    },
  };
}
