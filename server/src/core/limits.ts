/**
 * Server-authoritative capacity and abuse limits (decision FU2S-C3). Every number is configurable (`RUMBLE_*` env, see
 * `loadLimits`), has a documented default and a test. The defaults are sized from measurements of THIS server
 * (docs/measurements/rumble-online/capacity-model.json): one process is one busy thread; a room costs about
 * `ROOM_BASE_COST + BOT_COST * bots` percent of a core, so 3 rooms of 1 human + 31 bots (about 72 %) is the most one
 * process should run, and 6 rooms of 32 humans (about 64 %) fit in the same budget.
 *
 * Honest play is never the target: one create per match, a handful of joins, a few typing mistakes in a room code.
 */

/** Percent of one core a room's simulation costs: base (sim + replication + sockets) plus one bot brain per bot. */
export const ROOM_BASE_COST = 10;
export const BOT_COST = 0.45;

export const roomCost = (bots: number): number => ROOM_BASE_COST + BOT_COST * Math.max(0, bots);

export interface BucketSpec {
  /** Requests allowed at once. */
  burst: number;
  /** Sustained requests per minute. */
  perMin: number;
}

export interface LimitsConfig {
  /** Rooms of any phase on this process (lobbies included). */
  maxRooms: number;
  /** Rooms counting down or playing at once (each one runs a 60 Hz simulation). */
  maxPlayingRooms: number;
  /** Estimated percent of ONE core that all running matches together may use (`roomCost`). */
  cpuBudget: number;
  /** Do not start another match while the event loop's recent p99 delay is above this (ms) and a match is running. */
  startLoopLagMs: number;
  /** A room that cannot start (no free slot) waits this long, then is closed with a clear `server_busy` message. */
  startWaitMaxSec: number;
  /** Open WebSocket connections (humans) on this process. */
  maxConnections: number;
  /** Rooms one guest session may own (created) at the same time. */
  maxRoomsPerGuest: number;
  /** Rooms one address (an IPv6 /64) may own at the same time: a backstop only, many players share a phone-carrier address. */
  maxRoomsPerIp: number;
  /** Room creations per guest session. */
  guestCreate: BucketSpec;
  /** Join / quick-play requests per guest session. */
  guestJoin: BucketSpec;
  /** FAILED joins by code per guest session (code guessing). */
  guestJoinFail: BucketSpec;
  /** Per-address ceilings (generous: carrier-grade NAT puts a whole neighbourhood behind one address). */
  ipCreate: BucketSpec;
  ipJoin: BucketSpec;
  ipJoinFail: BucketSpec;
  /** WebSocket upgrades per address. */
  ipUpgrade: BucketSpec;
  /** A lobby (or results screen) nobody has touched for this long is closed. */
  lobbyIdleSec: number;
  /** A client whose unsent output grows past this many KiB is disconnected (it is not reading). */
  maxBufferedKiB: number;
  /** Retry hint sent with `server_busy` (seconds, jittered by up to +25 %). */
  busyRetrySec: number;
  /** Most distinct limiter keys remembered at once (idle ones are swept first): bounds memory under a key flood. */
  maxTrackedKeys: number;
}

export const DEFAULT_LIMITS: LimitsConfig = {
  maxRooms: 120,
  maxPlayingRooms: 8,
  cpuBudget: 75,
  startLoopLagMs: 150,
  startWaitMaxSec: 120,
  maxConnections: 600,
  maxRoomsPerGuest: 3,
  maxRoomsPerIp: 40,
  guestCreate: { burst: 4, perMin: 6 },
  guestJoin: { burst: 20, perMin: 30 },
  guestJoinFail: { burst: 6, perMin: 6 },
  ipCreate: { burst: 60, perMin: 120 },
  ipJoin: { burst: 200, perMin: 600 },
  ipJoinFail: { burst: 60, perMin: 60 },
  ipUpgrade: { burst: 300, perMin: 900 },
  lobbyIdleSec: 900,
  maxBufferedKiB: 2048,
  busyRetrySec: 20,
  maxTrackedKeys: 20_000,
};

/**
 * No limits at all: for tests of everything that is not a limit, and for the soak / load harnesses that drive hundreds of
 * rooms from one address on purpose. NEVER the production configuration (`loadLimits` never returns it).
 */
export const UNLIMITED_LIMITS: LimitsConfig = {
  ...DEFAULT_LIMITS,
  maxRooms: 100_000,
  maxPlayingRooms: 100_000,
  cpuBudget: 1e9,
  startLoopLagMs: 1e9,
  maxConnections: 1_000_000,
  maxRoomsPerGuest: 100_000,
  maxRoomsPerIp: 100_000,
  guestCreate: { burst: 1e6, perMin: 1e9 },
  guestJoin: { burst: 1e6, perMin: 1e9 },
  guestJoinFail: { burst: 1e6, perMin: 1e9 },
  ipCreate: { burst: 1e6, perMin: 1e9 },
  ipJoin: { burst: 1e6, perMin: 1e9 },
  ipJoinFail: { burst: 1e6, perMin: 1e9 },
  ipUpgrade: { burst: 1e6, perMin: 1e9 },
};

function num(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** `RUMBLE_<NAME>` = "burst/perMin", e.g. `RUMBLE_GUEST_CREATE=4/6`. */
function bucket(raw: string | undefined, fallback: BucketSpec): BucketSpec {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(raw ?? '');
  if (!m) return fallback;
  const burst = Number(m[1]);
  const perMin = Number(m[2]);
  return burst >= 1 && burst <= 100_000 && perMin >= 1 && perMin <= 1_000_000 ? { burst, perMin } : fallback;
}

/**
 * `RUMBLE_MAX_ROOMS`, `RUMBLE_MAX_PLAYING_ROOMS`, `RUMBLE_CPU_BUDGET` (percent of one core), `RUMBLE_START_LOOP_LAG_MS`,
 * `RUMBLE_START_WAIT_SEC`, `RUMBLE_MAX_CONNECTIONS`, `RUMBLE_MAX_ROOMS_PER_GUEST`, `RUMBLE_MAX_ROOMS_PER_IP`,
 * `RUMBLE_GUEST_CREATE` / `RUMBLE_GUEST_JOIN` / `RUMBLE_GUEST_JOIN_FAIL` / `RUMBLE_IP_CREATE` / `RUMBLE_IP_JOIN` /
 * `RUMBLE_IP_JOIN_FAIL` / `RUMBLE_IP_UPGRADE` (each "burst/perMin"), `RUMBLE_LOBBY_IDLE_SEC`, `RUMBLE_MAX_BUFFERED_KIB`,
 * `RUMBLE_BUSY_RETRY_SEC`. Invalid values fall back to the defaults.
 */
export function loadLimits(env: Record<string, string | undefined> = process.env): LimitsConfig {
  const d = DEFAULT_LIMITS;
  return {
    maxRooms: Math.round(num(env.RUMBLE_MAX_ROOMS, d.maxRooms, 1, 100_000)),
    maxPlayingRooms: Math.round(num(env.RUMBLE_MAX_PLAYING_ROOMS, d.maxPlayingRooms, 1, 1000)),
    cpuBudget: num(env.RUMBLE_CPU_BUDGET, d.cpuBudget, 5, 10_000),
    startLoopLagMs: num(env.RUMBLE_START_LOOP_LAG_MS, d.startLoopLagMs, 10, 60_000),
    startWaitMaxSec: num(env.RUMBLE_START_WAIT_SEC, d.startWaitMaxSec, 5, 3600),
    maxConnections: Math.round(num(env.RUMBLE_MAX_CONNECTIONS, d.maxConnections, 1, 1_000_000)),
    maxRoomsPerGuest: Math.round(num(env.RUMBLE_MAX_ROOMS_PER_GUEST, d.maxRoomsPerGuest, 1, 1000)),
    maxRoomsPerIp: Math.round(num(env.RUMBLE_MAX_ROOMS_PER_IP, d.maxRoomsPerIp, 1, 100_000)),
    guestCreate: bucket(env.RUMBLE_GUEST_CREATE, d.guestCreate),
    guestJoin: bucket(env.RUMBLE_GUEST_JOIN, d.guestJoin),
    guestJoinFail: bucket(env.RUMBLE_GUEST_JOIN_FAIL, d.guestJoinFail),
    ipCreate: bucket(env.RUMBLE_IP_CREATE, d.ipCreate),
    ipJoin: bucket(env.RUMBLE_IP_JOIN, d.ipJoin),
    ipJoinFail: bucket(env.RUMBLE_IP_JOIN_FAIL, d.ipJoinFail),
    ipUpgrade: bucket(env.RUMBLE_IP_UPGRADE, d.ipUpgrade),
    lobbyIdleSec: num(env.RUMBLE_LOBBY_IDLE_SEC, d.lobbyIdleSec, 5, 86_400),
    maxBufferedKiB: num(env.RUMBLE_MAX_BUFFERED_KIB, d.maxBufferedKiB, 64, 1_000_000),
    busyRetrySec: num(env.RUMBLE_BUSY_RETRY_SEC, d.busyRetrySec, 1, 600),
    maxTrackedKeys: d.maxTrackedKeys,
  };
}
