import { describe, expect, it } from 'vitest';
import { BOT_COST, DEFAULT_LIMITS, ROOM_BASE_COST, loadLimits, roomCost } from '../src/core/limits';
import { DEFAULT_RUNTIME, assertProductionSafe, loadRuntimeConfig } from '../src/core/options';

describe('limits configuration (RUMBLE_* env, documented defaults, bad values fall back)', () => {
  it('has the documented defaults and the cost model of the measured server', () => {
    expect(loadLimits({})).toEqual(DEFAULT_LIMITS);
    expect(DEFAULT_RUNTIME.limits).toBe(DEFAULT_LIMITS);
    expect(roomCost(31)).toBeCloseTo(ROOM_BASE_COST + 31 * BOT_COST, 5);
    // three rooms of one human and 31 bots fit the default budget, four do not (docs/measurements/rumble-online)
    expect(3 * roomCost(31)).toBeLessThanOrEqual(DEFAULT_LIMITS.cpuBudget);
    expect(4 * roomCost(31)).toBeGreaterThan(DEFAULT_LIMITS.cpuBudget);
    // ... and six rooms of 32 humans
    expect(6 * roomCost(0)).toBeLessThanOrEqual(DEFAULT_LIMITS.cpuBudget);
  });

  it('reads every knob from the environment', () => {
    const l = loadLimits({
      RUMBLE_MAX_ROOMS: '7',
      RUMBLE_MAX_PLAYING_ROOMS: '2',
      RUMBLE_CPU_BUDGET: '55.5',
      RUMBLE_START_LOOP_LAG_MS: '80',
      RUMBLE_START_WAIT_SEC: '30',
      RUMBLE_MAX_CONNECTIONS: '99',
      RUMBLE_MAX_ROOMS_PER_GUEST: '1',
      RUMBLE_MAX_ROOMS_PER_IP: '5',
      RUMBLE_GUEST_CREATE: '2/3',
      RUMBLE_GUEST_JOIN: '9/10',
      RUMBLE_GUEST_JOIN_FAIL: '3/4',
      RUMBLE_IP_CREATE: '11/12',
      RUMBLE_IP_JOIN: '13/14',
      RUMBLE_IP_JOIN_FAIL: '15/16',
      RUMBLE_IP_UPGRADE: '17/18',
      RUMBLE_LOBBY_IDLE_SEC: '60',
      RUMBLE_MAX_BUFFERED_KIB: '512',
      RUMBLE_BUSY_RETRY_SEC: '9',
    });
    expect(l).toMatchObject({
      maxRooms: 7,
      maxPlayingRooms: 2,
      cpuBudget: 55.5,
      startLoopLagMs: 80,
      startWaitMaxSec: 30,
      maxConnections: 99,
      maxRoomsPerGuest: 1,
      maxRoomsPerIp: 5,
      guestCreate: { burst: 2, perMin: 3 },
      guestJoin: { burst: 9, perMin: 10 },
      guestJoinFail: { burst: 3, perMin: 4 },
      ipCreate: { burst: 11, perMin: 12 },
      ipJoin: { burst: 13, perMin: 14 },
      ipJoinFail: { burst: 15, perMin: 16 },
      ipUpgrade: { burst: 17, perMin: 18 },
      lobbyIdleSec: 60,
      maxBufferedKiB: 512,
      busyRetrySec: 9,
    });
  });

  it('ignores hostile or malformed values (never hard-fails honest play with a typo)', () => {
    const l = loadLimits({
      RUMBLE_MAX_ROOMS: '-3',
      RUMBLE_CPU_BUDGET: 'lots',
      RUMBLE_GUEST_CREATE: '0/0',
      RUMBLE_IP_JOIN: '5',
      RUMBLE_LOBBY_IDLE_SEC: '0',
      RUMBLE_MAX_CONNECTIONS: 'Infinity',
    });
    expect(l).toEqual(DEFAULT_LIMITS);
  });

  it('production refuses the test-only fast mode, at config load and at server start', () => {
    expect(() => loadRuntimeConfig({ NODE_ENV: 'production', RUMBLE_TEST_FAST: '1' })).toThrow(/test-only/);
    expect(loadRuntimeConfig({ NODE_ENV: 'production' }).fast).toBe(false);
    expect(loadRuntimeConfig({ RUMBLE_TEST_FAST: '1' }).fast).toBe(true); // development / tests
    expect(() => assertProductionSafe({ ...DEFAULT_RUNTIME, fast: true }, false)).toThrow(/test-only/);
    expect(() => assertProductionSafe({ ...DEFAULT_RUNTIME, fast: true }, true)).not.toThrow();
    expect(() => assertProductionSafe(DEFAULT_RUNTIME, false)).not.toThrow();
  });
});
