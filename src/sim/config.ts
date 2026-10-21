/**
 * Central balance configuration. Every tunable number in the simulation lives here so playtest
 * tuning never touches rules code. All durations are in ticks; use `ticks(seconds)` to author them.
 */
import type { PickupKind, SkillKind, VehicleKind } from './types';

export const TICK_RATE = 60;
export const ticks = (seconds: number): number => Math.round(seconds * TICK_RATE);

export interface VehicleSpec {
  /** Ticks to cross one tile at full speed. */
  stepTicks: number;
  /** Cumulative blast exposure (unique flame tiles on the vehicle's route) that destroys it. */
  resistance: number;
  /** Soft blocks it can plough through before crashing. */
  softLimit: number;
  /** Player contacts before it crashes. */
  playerHitLimit: number;
  /** Whether the route has exactly one 90 degree turn. */
  turns: boolean;
}

export interface GameConfig {
  match: {
    durationTicks: number;
    countdownTicks: number;
  };
  movement: {
    /** Step duration by speed level (index 0 = no Roller Skates). */
    stepTicksBySpeedLevel: number[];
    okadaStepBonus: number;
    minStepTicks: number;
    slowCurseExtraTicks: number;
    /** How long a pushed player takes to slide to the new tile. */
    pushStepTicks: number;
    jumpCooldownTicks: number;
  };
  generator: {
    fuseTicks: number;
    flameTicks: number;
    baseRange: number;
    maxRange: number;
    /** Range given by Power Diesel: flames travel until concrete or a soft block. */
    dieselRange: number;
    baseCapacity: number;
    maxCapacity: number;
    remoteFailsafeTicks: number;
    disabledCleanupTicks: number;
    carryBonusTicks: number;
    kickStepTicks: number;
    punchDistance: number;
    throwTicks: number;
    weakFireRange: number;
  };
  pickups: {
    /** Chance a soft block hides a pickup. */
    hiddenChance: number;
    weights: Record<PickupKind, number>;
    killSwitchCharges: number;
    maxKillSwitchCharges: number;
    maxSpeedLevel: number;
    curseTicks: number;
  };
  okada: {
    /** After the Okada breaks the rider ignores the same continuing hazard for at most this long. */
    graceTicks: number;
  };
  skills: {
    cooldownTicks: Record<SkillKind, number>;
    dazeTicks: number;
    dazeImmunityTicks: number;
  };
  vehicles: {
    entryWindowTicks: number;
    entryWarnTicks: number;
    slowTicks: number;
    /** Multiplier on step ticks while a damaged vehicle is staggering. */
    slowFactor: number;
    minRouteTiles: number;
    minKekeLegTiles: number;
    specs: Record<VehicleKind, VehicleSpec>;
  };
  drops: {
    maxDeathDrops: number;
  };
  arena: {
    softDensity: number;
  };
  crush: {
    /** Time left on the clock when the first tile is telegraphed (the arena is fully open before this). */
    startRemainingTicks: number;
    /** Time left when the last-but-one tile has landed, leaving only the final safe tile. */
    finalTileLeadTicks: number;
    /** Telegraph time before a tile lands. The final tile lands exactly at 0:00. */
    warnTicks: number;
  };
  crowd: {
    firstThrowTicks: number;
    minIntervalTicks: number;
    maxIntervalTicks: number;
    warnTicks: number;
    firecrackerChance: number;
    bottleDazeTicks: number;
  };
  hazards: {
    /** Pothole: forced stumble pause. */
    potholeStumbleTicks: number;
    /** Oil: tiles the player slides after stepping on it. */
    oilSlideTiles: number;
  };
}

export const DEFAULT_CONFIG: GameConfig = {
  match: {
    durationTicks: ticks(120),
    countdownTicks: ticks(2.5),
  },
  movement: {
    stepTicksBySpeedLevel: [10, 9, 8, 7],
    okadaStepBonus: 2,
    minStepTicks: 5,
    slowCurseExtraTicks: 4,
    pushStepTicks: 8,
    jumpCooldownTicks: ticks(2),
  },
  generator: {
    fuseTicks: ticks(3),
    flameTicks: ticks(0.6),
    baseRange: 2,
    maxRange: 8,
    dieselRange: 99,
    baseCapacity: 1,
    maxCapacity: 6,
    remoteFailsafeTicks: ticks(20),
    disabledCleanupTicks: ticks(25),
    carryBonusTicks: ticks(1),
    kickStepTicks: 5,
    punchDistance: 3,
    throwTicks: ticks(0.4),
    weakFireRange: 1,
  },
  pickups: {
    hiddenChance: 0.4,
    weights: {
      petrol: 18,
      socket: 14,
      skates: 10,
      diesel: 2,
      boots: 6,
      gloves: 5,
      grip: 6,
      remote: 5,
      killswitch: 5,
      okada: 4,
      voucher: 7,
      curse: 6,
      sneakers: 4,
      hotfuel: 2,
    },
    killSwitchCharges: 2,
    maxKillSwitchCharges: 3,
    maxSpeedLevel: 3,
    curseTicks: ticks(8),
  },
  okada: {
    graceTicks: ticks(0.75),
  },
  skills: {
    cooldownTicks: { push: ticks(4), shove: ticks(3), daze: ticks(5) },
    dazeTicks: ticks(1),
    dazeImmunityTicks: ticks(2),
  },
  vehicles: {
    entryWindowTicks: ticks(8),
    entryWarnTicks: ticks(1.2),
    slowTicks: ticks(1.5),
    slowFactor: 1.8,
    minRouteTiles: 4,
    minKekeLegTiles: 3,
    specs: {
      danfo: { stepTicks: 14, resistance: 9, softLimit: 999, playerHitLimit: 999, turns: false },
      taxi: { stepTicks: 7, resistance: 6, softLimit: 2, playerHitLimit: 1, turns: false },
      keke: { stepTicks: 8, resistance: 4, softLimit: 1, playerHitLimit: 2, turns: true },
    },
  },
  drops: {
    maxDeathDrops: 2,
  },
  arena: {
    softDensity: 0.62,
  },
  crush: {
    startRemainingTicks: ticks(45),
    finalTileLeadTicks: ticks(2),
    warnTicks: ticks(1.2),
  },
  crowd: {
    firstThrowTicks: ticks(25),
    minIntervalTicks: ticks(9),
    maxIntervalTicks: ticks(16),
    warnTicks: ticks(2),
    firecrackerChance: 0.25,
    bottleDazeTicks: ticks(1.2),
  },
  hazards: {
    potholeStumbleTicks: ticks(0.6),
    oilSlideTiles: 2,
  },
};

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Returns a new config with `override` merged over `base` (arrays are replaced, not merged). */
export function mergeConfig(base: GameConfig, override?: DeepPartial<GameConfig>): GameConfig {
  const out = structuredClone(base) as unknown as Record<string, unknown>;
  if (override) deepAssign(out, override as Record<string, unknown>);
  return out as unknown as GameConfig;
}

function deepAssign(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const current = target[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === 'object'
    ) {
      deepAssign(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}
