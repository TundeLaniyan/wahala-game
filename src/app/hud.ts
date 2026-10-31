import {
  CHARACTERS,
  TEAM_NAMES,
  getArena,
  isRespawnMode,
  isTeamMode,
  secondsRemaining,
  teamStandings,
} from '../sim';
import type {
  CharacterId,
  ContactAbility,
  CurseKind,
  GameKind,
  GameState,
  MatchResult,
  PickupKind,
  Player,
  SpecialAction,
  VehicleKind,
} from '../sim';
import { canThrow, previewRewards, previewSpecial, spectatorLanding } from '../sim';
import { buildStageAlerts, ruleBannerFor } from './stageAlerts';
import type { StageAlert } from './stageAlerts';

export type { StageAlert } from './stageAlerts';
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
  /** V2: the equipped generator-contact ability (one at a time). */
  contact: ContactAbility | null;
  grip: boolean;
  remote: boolean;
  killCharges: number;
  sneakers: boolean;
  hotFuel: boolean;
  mounted: boolean;
  /** V2 protection layers (Okada is `mounted`). */
  armour: number;
  /** V2 Square Blast tier (0 none, 1 = 3 x 3, 2 = 5 x 5). */
  squareTier: number;
  /** V2: what a B tap does right now (null = nothing). */
  special: SpecialAction;
  /** V2: credited eliminations / deaths / assists this match. */
  kills: number;
  deaths: number;
  assists: number;
  voucher: boolean;
  vehicle: VehicleKind;
  carrying: boolean;
  dazed: boolean;
  curse: { kind: CurseKind; seconds: number } | null;
  skillReady: boolean;
  hasRemoteGenerator: boolean;
  canDisarm: boolean;
  canAction: boolean;
  /** V2 City Rumble (workstream C): credited eliminations this life (the reward ladder position). */
  streak: number;
  /** V2 City Rumble: what the next credited elimination pays right now ([] when rewards are off). */
  nextRewards: PickupKind[];
}

/** The Rumble sudden-death round for the title card and the blast clock (null outside one). */
export interface SuddenDeathHud {
  stage: 'transition' | 'countdown';
  cause: 'timeout' | 'simultaneous';
  /** The tied contenders with the kill totals that tied them, and whether each still stands. */
  contenders: {
    id: number;
    name: string;
    slot: number;
    team: number;
    characterId: CharacterId;
    kills: number;
    isLocal: boolean;
    alive: boolean;
  }[];
  /** The number of the next blast (1-based); blasts keep coming (30 s after the first, then every 15 s) until one side stands. */
  blast: number;
  /** The kill ranking, everyone's credited kills, most first (contenders flagged): the same count that decided who fights. */
  ranking: {
    id: number;
    name: string;
    slot: number;
    team: number;
    kills: number;
    contender: boolean;
    alive: boolean;
    isLocal: boolean;
  }[];
  /** Seconds until the next blast (null while the title card shows or once the sequence is spent). */
  secondsToBlast: number | null;
  /** Inside the warning window before a blast. */
  warning: boolean;
  /** A blast fell in the last second. */
  flash: boolean;
  /** Seconds from the end of the title card to the first blast (from the config). */
  firstBlastSeconds: number;
}

export function buildSuddenDeath(state: GameState, localId: number): SuddenDeathHud | null {
  const sd = state.match.suddenDeath;
  if (!sd) return null;
  const cfg = state.config.suddenDeath;
  const left = sd.nextBlastTick - state.tick;
  const pending = sd.stage === 'countdown' && Number.isFinite(sd.nextBlastTick);
  return {
    stage: sd.stage,
    cause: sd.cause,
    contenders: sd.contenders.map((c) => {
      const p = state.players[c.playerId]!;
      return {
        id: p.id,
        name: p.name,
        slot: p.slot,
        team: p.team,
        characterId: p.characterId,
        kills: p.stats.kills,
        isLocal: p.id === localId,
        alive: p.alive,
      };
    }),
    blast: sd.blastsFired + 1,
    ranking: [...state.players]
      .sort((a, b) => b.stats.kills - a.stats.kills || a.id - b.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        team: p.team,
        kills: p.stats.kills,
        contender: sd.contenders.some((c) => c.playerId === p.id),
        alive: p.alive,
        isLocal: p.id === localId,
      })),
    secondsToBlast: pending ? Math.max(0, Math.ceil(left / 60)) : null,
    warning: pending && left <= cfg.warnTicks,
    flash: sd.lastBlastTick !== null && state.tick - sd.lastBlastTick < 60,
    firstBlastSeconds: Math.round((cfg.blastDelayTicks[0] ?? 0) / 60),
  };
}

export interface HudSnapshot {
  phase: GameState['match']['phase'];
  countdown: number;
  secondsLeft: number;
  /** Full match length in seconds (2:00 standard, 3:00 City Rumble). */
  totalSeconds: number;
  final30: boolean;
  players: HudPlayer[];
  me: HudMe | null;
  localAlive: boolean;
  result: MatchResult | null;
  entry: { stage: 'entry' | 'turn'; fraction: number; vehicle: VehicleKind } | null;
  crush: boolean;
  /** Stage hazards that concern the local player right now (most urgent first). */
  stageAlerts: StageAlert[];
  /** The arena's special rule, shown big during the countdown (null when there is none / after it). */
  ruleBanner: string | null;
  /** City Rumble only (null on standard arenas): counts, kill feed, roster, spectating. */
  rumble: RumbleSnapshot | null;
  /** V2 standard match: the eliminated local player on the sideline lane (null otherwise). */
  sideline: SidelineHud | null;
  /** Rumble sudden death (decision SD1): the title card and the blast clock; null in every other state. */
  suddenDeath: SuddenDeathHud | null;
}

/** V2 sideline spectator controls (ui/SpectatorControls.tsx). */
export interface SidelineHud {
  /** 0..1: how far the throw cooldown has run (1 = ready). */
  charge: number;
  /** A throw would go now: cooldown over, live limit free, time left, and a valid landing tile in line. */
  canThrow: boolean;
  /** Throws are over for this match (the final seconds). */
  closed: boolean;
}

export function buildSideline(state: GameState, localId: number): SidelineHud | null {
  const p = state.players[localId];
  const s = p?.spectator;
  if (!p || p.alive || !s || state.match.phase !== 'playing') return null;
  const cfg = state.config.spectator;
  const left = s.readyTick - state.tick;
  return {
    charge: left <= 0 ? 1 : Math.max(0, 1 - left / Math.max(1, cfg.cooldownTicks)),
    canThrow: canThrow(state, p) && spectatorLanding(state, s.pos) !== null,
    closed: state.config.match.durationTicks - state.match.playTicks <= cfg.noThrowRemainingTicks,
  };
}

/** One competitor in the City Rumble roster. */
export interface RumbleEntry {
  id: number;
  name: string;
  slot: number;
  characterId: CharacterId;
  alive: boolean;
  isLocal: boolean;
  /** Credited eliminations (sim `player.stats`). */
  kills: number;
  deaths: number;
  assists: number;
  /**
   * Survival: finishing place once out (1 = winner); shared by everyone who fell on the same tick.
   * Deathmatch / Team Rumble: the live ranking (kills, fewer deaths, assists, earlier last kill; equal
   * stats share a place).
   */
  placement: number | null;
  /** Team Rumble team index (-1 = free-for-all). */
  team: number;
  /** Respawn modes: seconds until this fallen fighter is back (null when alive / no respawn). */
  respawnIn: number | null;
  /** Spawn protection is on right now. */
  protected: boolean;
}

/** One team in the Team Rumble scoreboard. */
export interface TeamScore {
  team: number;
  name: string;
  kills: number;
  deaths: number;
  assists: number;
  members: number;
  alive: number;
  /** The local player's team. */
  mine: boolean;
  /** 1 = leading (equal kills and deaths share the place). */
  place: number;
}

export interface FeedItem {
  /** Stable React key. */
  key: string;
  victim: string;
  victimSlot: number;
  /** Team Rumble team of the victim / killer (-1 = free-for-all). */
  victimTeam: number;
  killerTeam: number;
  /** Null when no rival gets the credit (own generator, the city, traffic ...). */
  killer: string | null;
  killerSlot: number;
  cause:
    'flame' | 'vehicle' | 'crush' | 'hazard' | 'crowd' | 'spectator' | 'suddenDeath' | 'self' | 'friendly';
  involvesLocal: boolean;
  /** Seconds since it happened. */
  age: number;
}

export interface RumbleSnapshot {
  /** The ruleset: Survival (last standing), Deathmatch or Team Rumble (timed, respawns). */
  mode: Exclude<GameKind, 'classic'>;
  /** Fallen fighters come back (Deathmatch / Team Rumble). */
  respawns: boolean;
  /** Friendly fire (Team Rumble only). */
  friendlyFire: boolean;
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
  /**
   * The closing city: 'open' (counting down to the closing), 'closing', or 'core' (only the core is
   * left). Null when the city never closes (respawn modes).
   */
  ring: { phase: 'open' | 'closing' | 'core'; seconds: number } | null;
  /** Respawn modes: everybody by the live ranking, best first (empty in Survival). */
  leaderboard: RumbleEntry[];
  /** Team Rumble: the teams, leading team first (empty otherwise). */
  teams: TeamScore[];
}

export const FEED_MAX = 4;
export const FEED_SECONDS = 7;

/** Deathmatch ranking key: equal keys share a place. */
function rankKey(p: Player): [number, number, number, number] {
  const last = p.stats.lastKillTick < 0 ? Infinity : p.stats.lastKillTick;
  return [-p.stats.kills, p.stats.deaths, -p.stats.assists, last];
}

function compareKey(a: Player, b: Player): number {
  const ka = rankKey(a);
  const kb = rankKey(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! < kb[i]! ? -1 : 1;
  return 0;
}

/** Respawn modes: live rank of every player (1 = best; equal stats share a place). */
function timedPlacements(state: GameState): number[] {
  return state.players.map((p) => 1 + state.players.filter((q) => compareKey(q, p) < 0).length);
}

function placements(state: GameState): (number | null)[] {
  if (isRespawnMode(state.settings.game)) return timedPlacements(state);
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
  const respawns = isRespawnMode(state.settings.game);
  const entries: RumbleEntry[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    slot: p.slot,
    characterId: p.characterId,
    alive: p.alive,
    isLocal: p.id === localId,
    kills: kills[p.id]!,
    deaths: p.stats.deaths,
    assists: p.stats.assists,
    placement: place[p.id]!,
    team: p.team,
    respawnIn:
      !p.alive && p.respawnAt !== null && state.match.phase === 'playing'
        ? Math.max(1, Math.ceil((p.respawnAt - state.tick) / 60))
        : null,
    protected: p.alive && state.tick < p.protectedUntil,
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
  // respawn modes: a fighter who is already back still shows their last fall for a few seconds
  const out = state.players
    .filter(
      (p) =>
        (!p.alive || respawns) &&
        p.eliminatedTick !== null &&
        state.tick - p.eliminatedTick <= FEED_SECONDS * 60,
    )
    .sort((a, b) => b.eliminatedTick! - a.eliminatedTick! || a.id - b.id)
    .slice(0, FEED_MAX);
  for (const p of out) {
    const killer = eliminatorOf(state, p);
    const c = p.elimination!;
    const owner = 'ownerId' in c ? state.players[c.ownerId] : undefined;
    const cause: FeedItem['cause'] =
      owner?.id === p.id
        ? 'self'
        : owner && !killer && owner.team >= 0 && owner.team === p.team
          ? 'friendly'
          : c.kind;
    feed.push({
      key: `${p.id}@${p.eliminatedTick}`,
      victim: p.name,
      victimSlot: p.slot,
      victimTeam: p.team,
      killerTeam: killer?.team ?? -1,
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
        // Team Rumble: the opponents near you (teammates are on the minimap in the team colour)
        .filter((e) => e.id !== focus.id && !(focus.team >= 0 && e.team === focus.team))
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
  const ring: RumbleSnapshot['ring'] = !state.crush
    ? null
    : t < closeAt
      ? { phase: 'open', seconds: Math.ceil((closeAt - t) / 60) }
      : t < coreAt
        ? { phase: 'closing', seconds: Math.ceil((coreAt - t) / 60) }
        : { phase: 'core', seconds: Math.max(0, Math.ceil((cfg.match.durationTicks - t) / 60)) };

  const game = state.settings.game === 'classic' ? 'survival' : state.settings.game;
  const local = state.players[localId];
  const standings = isTeamMode(state.settings.game) ? teamStandings(state) : [];
  const teams: TeamScore[] = standings.map((t) => ({
    team: t.team,
    name: TEAM_NAMES[t.team] ?? `Team ${t.team + 1}`,
    kills: t.kills,
    deaths: t.deaths,
    assists: t.assists,
    members: t.members,
    alive: state.players.filter((p) => p.team === t.team && p.alive).length,
    mine: local?.team === t.team,
    place:
      1 + standings.filter((o) => o.kills > t.kills || (o.kills === t.kills && o.deaths < t.deaths)).length,
  }));
  // fixed order on screen (Green left, White right); `place` says who leads
  teams.sort((a, b) => a.team - b.team);

  return {
    mode: game,
    respawns,
    friendlyFire: isTeamMode(state.settings.game) && state.settings.friendlyFire,
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
    leaderboard: respawns
      ? [...entries].sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || a.id - b.id)
      : [],
    teams,
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
        contact: local.contact,
        grip: local.grip,
        remote: local.remote,
        killCharges: local.killSwitchCharges,
        sneakers: local.sneakers,
        hotFuel: local.hotFuel,
        mounted: local.mounted,
        armour: local.armour,
        squareTier: local.squareTier,
        special: previewSpecial(state, local),
        kills: local.stats.kills,
        deaths: local.stats.deaths,
        assists: local.stats.assists,
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
        canAction: local.grip || local.carrying !== null,
        streak: local.stats.streak,
        nextRewards: previewRewards(state, local),
      }
    : null;
  return {
    phase: state.match.phase,
    countdown:
      state.match.phase === 'countdown' ? Math.max(1, Math.ceil(state.match.countdownRemaining / 60)) : 0,
    secondsLeft: secondsRemaining(state),
    totalSeconds: Math.round(state.config.match.durationTicks / 60),
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
    stageAlerts: buildStageAlerts(state, localId),
    ruleBanner: ruleBannerFor(state),
    rumble: rumble ? buildRumble(state, localId, spectateId) : null,
    sideline: buildSideline(state, localId),
    suddenDeath: buildSuddenDeath(state, localId),
  };
}
