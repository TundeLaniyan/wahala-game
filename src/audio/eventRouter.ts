/**
 * Maps `SimEvent`s to sound. The handler table is typed `Record<SimEvent['type'], ...>`, so adding
 * an event type to the sim is a compile error here until it is given a handler (or an explicit
 * no-op). Per-call batching keeps blasts with many soft blocks from spawning dozens of voices.
 */
import type { GameState, SimEvent, TilePos } from '../sim';
import type { CrowdBed } from './crowdBed';
import * as sfx from './sfx';
import type { SfxRuntime } from './sfx/runtime';
import { STING_VARIANTS } from './sfx/stings';

type EventOf<K extends SimEvent['type']> = Extract<SimEvent, { type: K }>;
type Handler<K extends SimEvent['type']> = (e: EventOf<K>, c: RouteCtx) => void;
type Handlers = { [K in SimEvent['type']]: Handler<K> };

/** Pickups that earn the fancy chime. */
const RARE = new Set(['okada', 'diesel', 'hotfuel', 'remote', 'killswitch', 'voucher', 'gloves', 'grip']);
const MAX_BLASTS_PER_CALL = 3;
const MAX_STINGS_PER_CALL = 2;
const PAN_WIDTH = 0.6;

interface RouteCtx {
  rt: SfxRuntime;
  crowd: CrowdBed;
  state: Readonly<GameState>;
  /** Explosions per eventId in the current call (chain size). */
  chain: Map<number, number>;
  blocks: number;
  blockPanSum: number;
  blocksDone: boolean;
  blasts: number;
  stings: number;
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
const thump = (c: RouteCtx, id: number): void => sfx.generatorDropped(c.rt, panOf(c, generatorX(c, id)));

const handlers: Handlers = {
  matchStarted: (_e, c) => {
    c.crowd.start();
    c.crowd.swell('cheer', 0.7);
  },
  matchEnded: (e, c) => {
    c.rt.buses.duck('blast');
    if (e.result.kind === 'win') {
      if (isHuman(c, e.result.winnerId)) {
        sfx.winJingle(c.rt);
        c.crowd.swell('cheer', 1);
      } else {
        sfx.loseSting(c.rt);
        c.crowd.swell('groan', 0.7);
      }
    } else {
      sfx.drawSting(c.rt);
      c.crowd.swell('gasp', 0.8);
    }
  },
  generatorPlaced: (e, c) => {
    if (allow(c, 'place', 0.05)) sfx.generatorPlaced(c.rt, panOf(c, e.x));
  },
  generatorExploded: (e, c) => {
    if (c.blasts >= MAX_BLASTS_PER_CALL) return;
    c.blasts++;
    const n = c.chain.get(e.eventId) ?? 1;
    // Weight grows with chain size and with blast reach (base range 2 .. max 8; Power Diesel is larger).
    const reach = Math.max(0, Math.min(1, (Math.min(e.range, 8) - 2) / 6));
    sfx.generatorBlast(c.rt, panOf(c, e.x), (n - 1) / 3 + 0.5 * reach);
    c.rt.buses.duck('blast');
    if (c.blasts === 1) c.crowd.swell(n > 1 ? 'cheer' : 'gasp', n > 1 ? 0.9 : 0.5);
  },
  generatorKicked: (e, c) => sfx.generatorKicked(c.rt, panOf(c, generatorX(c, e.generatorId))),
  generatorCarried: (e, c) => sfx.generatorCarried(c.rt, panOf(c, playerX(c, e.playerId)), e.bonus),
  generatorDropped: (e, c) => thump(c, e.generatorId),
  generatorThrown: (e, c) => sfx.generatorThrown(c.rt, panOf(c, playerX(c, e.playerId))),
  generatorDisarmed: (e, c) => sfx.generatorDisarmed(c.rt, panOf(c, generatorX(c, e.generatorId))),
  generatorDudCleaned: (e, c) => sfx.dudCleaned(c.rt, panOf(c, e.x)),
  blockDestroyed: (e, c) => {
    if (c.blocksDone) return;
    c.blocksDone = true;
    if (!allow(c, 'block', 0.06)) return;
    const n = Math.max(1, c.blocks);
    sfx.blockCrumble(c.rt, panOf(c, c.blockPanSum / n || e.x), n);
  },
  pickupRevealed: (e, c) => {
    if (allow(c, 'reveal', 0.05)) sfx.pickupRevealed(c.rt, panOf(c, e.x));
  },
  pickupCollected: (e, c) => {
    const pan = panOf(c, playerX(c, e.playerId));
    if (e.wasted) sfx.pickupWasted(c.rt, pan);
    else if (e.kind === 'curse')
      return; // the `cursed` event that follows owns this moment
    else sfx.pickupChime(c.rt, pan, RARE.has(e.kind));
  },
  pickupBurned: (e, c) => {
    if (allow(c, 'burn', 0.08)) sfx.pickupBurned(c.rt, panOf(c, e.x));
  },
  pickupDropped: (e, c) => {
    if (allow(c, 'drop', 0.08)) sfx.pickupDropped(c.rt, panOf(c, e.x));
  },
  playerEliminated: (e, c) => {
    if (c.stings >= MAX_STINGS_PER_CALL) return;
    c.stings++;
    sfx.eliminationSting(c.rt, Math.floor(c.rt.rand() * STING_VARIANTS), panOf(c, e.x));
    c.rt.buses.duck('blast');
    c.crowd.swell(isHuman(c, e.playerId) ? 'groan' : 'laugh', 0.8);
  },
  playerJumped: (e, c) => {
    if (allow(c, 'hop', 0.1)) sfx.hop(c.rt, panOf(c, playerX(c, e.playerId)));
  },
  okadaMounted: (e, c) => sfx.okadaRev(c.rt, panOf(c, playerX(c, e.playerId))),
  okadaBroken: (e, c) => {
    sfx.okadaCrash(c.rt, panOf(c, e.x));
    c.rt.buses.duck('blast');
    c.crowd.swell('gasp', 0.8);
  },
  skillUsed: (e, c) => {
    if (allow(c, 'skill', 0.08)) sfx.push(c.rt, panOf(c, playerX(c, e.playerId)));
  },
  playerPushed: (e, c) => {
    sfx.generatorDropped(c.rt, panOf(c, playerX(c, e.playerId)));
    c.crowd.swell('gasp', 0.3);
  },
  playerDazed: (e, c) => {
    sfx.dazed(c.rt, panOf(c, playerX(c, e.playerId)));
    c.crowd.swell('laugh', 0.4);
  },
  cursed: (e, c) => sfx.cursedSting(c.rt, panOf(c, playerX(c, e.playerId))),
  vehicleEntryBegan: (e, c) => {
    if (isHuman(c, e.playerId)) sfx.vehicleEntry(c.rt, true);
  },
  vehicleEntryCancelled: (e, c) => {
    if (isHuman(c, e.playerId)) sfx.vehicleEntry(c.rt, false);
  },
  vehicleWarning: (e, c) => {
    sfx.vehicleWarning(c.rt, e.kind, panOf(c, e.entry.x));
    c.rt.buses.duck('warning');
    c.crowd.swell('gasp', 0.6);
  },
  vehicleLaunched: (e, c) => sfx.vehicleLaunched(c.rt, e.kind, panOf(c, vehicleX(c, e.vehicleId))),
  vehicleHitPlayer: (e, c) => sfx.vehicleHitPlayer(c.rt, panOf(c, playerX(c, e.playerId))),
  vehicleHitGenerator: (e, c) => {
    if (allow(c, 'vhitgen', 0.08)) sfx.vehicleHitGenerator(c.rt, panOf(c, generatorX(c, e.generatorId)));
  },
  vehicleDamaged: (e, c) => {
    if (allow(c, 'vdamage', 0.1)) sfx.vehicleDamaged(c.rt, panOf(c, vehicleX(c, e.vehicleId)));
  },
  vehicleDestroyed: (e, c) => {
    sfx.vehicleDestroyed(c.rt, panOf(c, e.x));
    c.rt.buses.duck('blast');
    c.crowd.swell('cheer', 0.8);
  },
  vehicleExited: () => undefined, // silent by design; the vehicle simply leaves
  crushWarning: (e, c) => {
    if (!allow(c, 'crushwarn', 0.35)) return;
    sfx.crushWarning(c.rt, panOf(c, e.x));
    c.rt.buses.duck('warning');
  },
  crushLanded: (e, c) => {
    if (!allow(c, 'crushland', 0.12)) return;
    sfx.crushLanded(c.rt, panOf(c, e.x));
    c.rt.buses.duck('blast');
    c.crowd.swell('gasp', 0.5);
  },
  crowdWarning: (e, c) => {
    sfx.crowdWarning(c.rt, e.kind, panOf(c, e.x));
    c.rt.buses.duck('warning');
  },
  crowdLanded: (e, c) => {
    sfx.crowdLanded(c.rt, e.kind, panOf(c, e.x));
    c.rt.buses.duck('blast');
    c.crowd.swell(e.kind === 'bottle' ? 'laugh' : 'gasp', 0.6);
  },
  hazardTriggered: (e, c) => {
    sfx.hazard(c.rt, panOf(c, playerX(c, e.playerId)), e.kind);
    c.crowd.swell('laugh', 0.5);
  },
};

export interface EventRouter {
  handle(events: readonly SimEvent[], state: Readonly<GameState>): void;
  /** Tile x -> stereo pan (-0.6..0.6) for the current arena width. */
  panFor(state: Readonly<GameState>, tileX: number): number;
}

export function createEventRouter(rt: SfxRuntime, crowd: CrowdBed): EventRouter {
  // One context object is reused for every call (no per-call allocation on the hot path).
  const c: RouteCtx = {
    rt,
    crowd,
    state: undefined as unknown as GameState,
    chain: new Map(),
    blocks: 0,
    blockPanSum: 0,
    blocksDone: false,
    blasts: 0,
    stings: 0,
    last: new Map(),
    now: 0,
  };
  return {
    handle(events, state) {
      if (events.length === 0) return;
      c.state = state;
      c.now = rt.ctx.currentTime;
      c.chain.clear();
      c.blocks = 0;
      c.blockPanSum = 0;
      c.blocksDone = false;
      c.blasts = 0;
      c.stings = 0;
      for (const e of events) {
        if (e.type === 'generatorExploded') c.chain.set(e.eventId, (c.chain.get(e.eventId) ?? 0) + 1);
        else if (e.type === 'blockDestroyed') {
          c.blocks++;
          c.blockPanSum += e.x;
        }
      }
      for (const e of events) (handlers[e.type] as (ev: SimEvent, ctx: RouteCtx) => void)(e, c);
    },
    panFor: (state, x) => {
      c.state = state;
      return panOf(c, x);
    },
  };
}
