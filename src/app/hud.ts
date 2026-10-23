import { CHARACTERS, getArena, secondsRemaining } from '../sim';
import type { CharacterId, CurseKind, GameState, MatchResult, VehicleKind } from '../sim';
import { eliminatorOf, killCounts } from './spectate';

export interface HudPlayer {
  id: number;
  name: string;
  slot: number;
  characterId: CharacterId;
  alive: boolean;
  isLocal: boolean;
  mounted: boolean;
}

export interface HudMe {
  range: number;
  maxRange: boolean;
  capacity: number;
  active: number;
  speedLevel: number;
  kick: boolean;
  punch: boolean;
  grip: boolean;
  remote: boolean;
  killCharges: number;
  sneakers: boolean;
  hotFuel: boolean;
  mounted: boolean;
  voucher: boolean;
  vehicle: VehicleKind;
  carrying: boolean;
  dazed: boolean;
  curse: { kind: CurseKind; seconds: number } | null;
  skillReady: boolean;
  hasRemoteGenerator: boolean;
  canDisarm: boolean;
  canAction: boolean;
}

export interface HudSnapshot {
  phase: GameState['match']['phase'];
  countdown: number;
  secondsLeft: number;
  final30: boolean;
  players: HudPlayer[];
  me: HudMe | null;
  localAlive: boolean;
  result: MatchResult | null;
  entry: { stage: 'entry' | 'turn'; fraction: number; vehicle: VehicleKind } | null;
  crush: boolean;
  /** City Rumble only (null on standard arenas): counts, kill feed, roster, spectating. */
  rumble: RumbleSnapshot | null;
}

/** One competitor in the City Rumble roster. */
export interface RumbleEntry {
  id: number;
  name: string;
  slot: number;
  characterId: CharacterId;
  alive: boolean;
  isLocal: boolean;
  kills: number;
  /** Finishing place once out (1 = winner); shared by everyone who fell on the same tick. */
  placement: number | null;
}

export interface FeedItem {
  /** Stable React key. */
  key: string;
  victim: string;
  victimSlot: number;
  /** Null when no rival gets the credit (own generator, the city, traffic ...). */
  killer: string | null;
  killerSlot: number;
  cause: 'flame' | 'vehicle' | 'crush' | 'hazard' | 'crowd' | 'self';
  involvesLocal: boolean;
  /** Seconds since it happened. */
  age: number;
}

export interface RumbleSnapshot {
  total: number;
  alive: number;
  /** Newest first, at most FEED_MAX entries from the last FEED_SECONDS. */
  feed: FeedItem[];
  /** Survivors with the most eliminations (best first, at most 3). */
  leaders: RumbleEntry[];
  /** Survivors nearest to whoever the camera follows (nearest first, at most 3) with their distance in tiles. */
  nearby: (RumbleEntry & { dist: number })[];
  /** Everybody: survivors by eliminations, then the eliminated by finishing place. */
  roster: RumbleEntry[];
  /** The competitor the camera follows while the local player is out (null otherwise). */
  spectating: RumbleEntry | null;
  local: RumbleEntry | null;
  /** The closing city: 'open' (counting down to the closing), 'closing', or 'core' (only the core is left). */
  ring: { phase: 'open' | 'closing' | 'core'; seconds: number };
}

export const FEED_MAX = 4;
export const FEED_SECONDS = 7;

function placements(state: GameState): (number | null)[] {
  const out: (number | null)[] = state.players.map(() => null);
  const won = state.match.result?.kind === 'win' ? state.match.result.winnerId : -1;
  for (const p of state.players) {
    if (p.id === won) {
      out[p.id] = 1;
      continue;
    }
    if (p.alive || p.eliminatedTick === null) continue;
    let better = 0;
    for (const q of state.players) if (q.alive || (q.eliminatedTick ?? -1) > p.eliminatedTick) better++;
    out[p.id] = better + 1;
  }
  return out;
}

/** The City Rumble part of the HUD. `focusId` is the player the camera follows. */
export function buildRumble(state: GameState, localId: number, spectateId: number | null): RumbleSnapshot {
  const kills = killCounts(state);
  const place = placements(state);
  const entries: RumbleEntry[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    slot: p.slot,
    characterId: p.characterId,
    alive: p.alive,
    isLocal: p.id === localId,
    kills: kills[p.id]!,
    placement: place[p.id]!,
  }));
  const survivors = entries.filter((e) => e.alive);
  const byKills = (a: RumbleEntry, b: RumbleEntry): number => b.kills - a.kills || a.id - b.id;
  const roster = [
    ...[...survivors].sort(byKills),
    ...entries
      .filter((e) => !e.alive)
      .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99) || a.id - b.id),
  ];

  const feed: FeedItem[] = [];
  const out = state.players
    .filter(
      (p) => !p.alive && p.eliminatedTick !== null && state.tick - p.eliminatedTick <= FEED_SECONDS * 60,
    )
    .sort((a, b) => b.eliminatedTick! - a.eliminatedTick! || a.id - b.id)
    .slice(0, FEED_MAX);
  for (const p of out) {
    const killer = eliminatorOf(state, p);
    const c = p.elimination!;
    const cause: FeedItem['cause'] = 'ownerId' in c && c.ownerId === p.id ? 'self' : c.kind;
    feed.push({
      key: `${p.id}@${p.eliminatedTick}`,
      victim: p.name,
      victimSlot: p.slot,
      killer: killer?.name ?? null,
      killerSlot: killer?.slot ?? 0,
      cause,
      involvesLocal: p.id === localId || killer?.id === localId,
      age: (state.tick - p.eliminatedTick!) / 60,
    });
  }

  const focus = state.players[spectateId ?? localId] ?? state.players[localId];
  const nearby = focus
    ? survivors
        .filter((e) => e.id !== focus.id)
        .map((e) => {
          const p = state.players[e.id]!;
          return { ...e, dist: Math.abs(p.x - focus.x) + Math.abs(p.y - focus.y) };
        })
        .sort((a, b) => a.dist - b.dist || a.id - b.id)
        .slice(0, 3)
    : [];

  const cfg = state.config;
  const t = state.match.phase === 'countdown' ? 0 : state.match.playTicks;
  const closeAt = cfg.match.durationTicks - cfg.crush.startRemainingTicks;
  const coreAt = cfg.match.durationTicks - cfg.crush.coreClosedRemainingTicks;
  const ring: RumbleSnapshot['ring'] =
    t < closeAt
      ? { phase: 'open', seconds: Math.ceil((closeAt - t) / 60) }
      : t < coreAt
        ? { phase: 'closing', seconds: Math.ceil((coreAt - t) / 60) }
        : { phase: 'core', seconds: Math.max(0, Math.ceil((cfg.match.durationTicks - t) / 60)) };

  return {
    total: state.players.length,
    alive: survivors.length,
    feed,
    leaders: [...survivors]
      .sort(byKills)
      .filter((e) => e.kills > 0)
      .slice(0, 3),
    nearby,
    roster,
    spectating:
      spectateId !== null && state.players[localId] && !state.players[localId]!.alive
        ? (entries[spectateId] ?? null)
        : null,
    local: entries[localId] ?? null,
    ring,
  };
}

/** Pure projection of the simulation into what the HUD displays. */
export function buildHud(
  state: GameState,
  localId: number,
  entry: HudSnapshot['entry'],
  spectateId: number | null = null,
): HudSnapshot {
  const local = state.players[localId];
  const active = local
    ? state.generators.filter((g) => g.ownerId === local.id && g.mode !== 'disabled').length
    : 0;
  const cfg = state.config;
  const rumble = getArena(state.arenaId).kind === 'rumble';
  const me: HudMe | null = local
    ? {
        range: Math.min(local.range, cfg.generator.maxRange),
        maxRange: local.range >= cfg.generator.dieselRange,
        capacity: local.capacity,
        active,
        speedLevel: local.speedLevel,
        kick: local.kick,
        punch: local.punch,
        grip: local.grip,
        remote: local.remote,
        killCharges: local.killSwitchCharges,
        sneakers: local.sneakers,
        hotFuel: local.hotFuel,
        mounted: local.mounted,
        voucher: local.hasVoucher,
        vehicle: CHARACTERS[local.characterId].vehicle,
        carrying: local.carrying !== null,
        dazed: state.tick < local.dazedUntil,
        curse:
          local.curse && state.tick < local.curse.until
            ? { kind: local.curse.kind, seconds: Math.ceil((local.curse.until - state.tick) / 60) }
            : null,
        skillReady: state.tick >= local.skillReadyTick,
        hasRemoteGenerator: state.generators.some((g) => g.ownerId === local.id && g.mode === 'remote'),
        canDisarm: local.killSwitchCharges > 0,
        canAction: local.grip || local.punch || local.carrying !== null,
      }
    : null;
  return {
    phase: state.match.phase,
    countdown:
      state.match.phase === 'countdown' ? Math.max(1, Math.ceil(state.match.countdownRemaining / 60)) : 0,
    secondsLeft: secondsRemaining(state),
    final30: state.match.phase === 'playing' && secondsRemaining(state) <= 30,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      characterId: p.characterId,
      alive: p.alive,
      isLocal: p.id === localId,
      mounted: p.mounted,
    })),
    me,
    localAlive: local?.alive ?? false,
    result: state.match.result,
    entry,
    crush: state.crush !== null,
    rumble: rumble ? buildRumble(state, localId, spectateId) : null,
  };
}
