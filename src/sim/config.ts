/**
 * Central balance configuration. Every tunable number in the simulation lives here so playtest
 * tuning never touches rules code. All durations are in ticks; use `ticks(seconds)` to author them.
 */
import type { CharacterId, Dir, PickupKind, SkillKind, StreakRewardKind, VehicleKind } from './types';

/**
 * V2 elimination reward: a pickup kind, or `contact` = the eliminator's generator-contact ability
 * (`rewards.contactByCharacter` when they have none; Disarm charges topped up when Disarm is equipped).
 */
export type RewardKind = PickupKind | 'contact';

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

/**
 * One close attack (B tap next to a rival). Nothing here roots the attacker: the recoveries only keep THEIR NEXT
 * attack from starting; walking, placing generators and everything else stay free.
 */
export interface AttackSpec {
  /** Ticks between the press and the effect (the telegraph; a hit that dazes or displaces cuts it short). */
  startupTicks: number;
  /** The attacker's next attack may not start for this long after the effect found nobody (or was interrupted). */
  whiffRecoveryTicks: number;
  /** ... and for this long after it connected (their global recovery: any other rival is hittable after it). */
  hitRecoveryTicks: number;
  /** The same attacker may not affect the same victim again for this long after a hit (no chain). */
  targetLockoutTicks: number;
  /** Tiles the victim is pushed straight away from the attacker (0 = not displaced); a hit that cannot move them at all whiffs. */
  displacementTiles: number;
  /** Ticks the victim cannot act (0 = no daze). */
  dazeTicks: number;
  /** After this daze ends the victim cannot be dazed by an attack again for this long. */
  dazeImmunityTicks: number;
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
    throwTicks: number;
    weakFireRange: number;
    /**
     * Blast shape. `plus` is the normal rule (range-limited, concrete stops it, the first soft block
     * absorbs it). `fullLine` is the Surulere Power Yard rule: every blast covers its ENTIRE row and
     * column up to the arena boundary, passing through (and breaking) every block in the line.
     * Set only through an arena's config overrides, never globally. `radial` is the City Rumble shape
     * (systems/blastShape.ts): a grid disc of radius `range` (capped by `maxRange`) shadowed by walls and
     * crates; set by the Rumble rulesets (`RUMBLE_ECONOMY`), never in Classic.
     */
    blastMode: 'plus' | 'fullLine' | 'radial';
    /** Radial mode only: the largest square a Square Blast tier can make of the disc (radius). */
    radialMaxSquareRadius: number;
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
    /** The three close attacks (decision CB1): each is a startup, an effect and recoveries, all in ticks. */
    attacks: Record<SkillKind, AttackSpec>;
    /** Daze immunity after the crowd's bottle (the attacks carry their own, `AttackSpec.dazeImmunityTicks`). */
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
    /**
     * The public vehicles a voucher or a VEHICLE GENERATOR may be (decision VG1): any fighter may get any of them,
     * the character no longer decides. An arena narrows it with its own config (an Okada only where it allows).
     */
    allowed: VehicleKind[];
    specs: Record<VehicleKind, VehicleSpec>;
    /** Ticks per tile while a VEHICLE GENERATOR rides the vehicle (it is a carrier, not a ram: decision VG2). */
    carrierStepTicks: Record<VehicleKind, number>;
    /**
     * City Rumble Evolution: the board-edge entrances summoned attack vehicles may use (road mouths), as
     * [x, y, inward dir]. Null = every border tile (the default). Set by an arena's config only.
     */
    lanes: [number, number, Dir][] | null;
  };
  drops: {
    maxDeathDrops: number;
  };
  /**
   * City Rumble Evolution (decision RE-C3): marked supply crates (`$` in an arena layout) each hold one basic
   * upgrade, drawn from these kinds with the match RNG. They exist only where an arena places them and never
   * refill, so scenery can never be farmed.
   */
  supply: {
    kinds: PickupKind[];
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
    /**
     * City Rumble: a centred core (w x h tiles) that never closes. The ring closes around it and the
     * last ring tile lands `coreClosedRemainingTicks` before the end; the core is fought over until 0:00.
     * `x0` / `y0` (both or neither) place the core's top-left tile explicitly for a stage whose heart is not
     * the board's centre (Oshodi). Null = the standard Wahala Crush (everything closes, the final tile lands at 0:00).
     */
    keepCore: { w: number; h: number; x0?: number; y0?: number } | null;
    coreClosedRemainingTicks: number;
  };
  /**
   * Rumble sudden death (decisions SD1-SD6). The contenders (the players tied on the highest credited kill
   * count) are placed in the compacted area during a short title-card transition; then a full-area blast drops
   * after `blastDelayTicks[0]`, the next after `[1]`, and every `repeatBlastTicks` after that, until one side
   * stands. Each blast takes one protection layer from each survivor. The blast is never shrunk.
   */
  suddenDeath: {
    transitionTicks: number;
    /** Delay before blast 1, then blast 2 (60 s, 30 s); every later blast follows `repeatBlastTicks` after the last. */
    blastDelayTicks: number[];
    repeatBlastTicks: number;
    /** The HUD warns this long before each blast. */
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
    /**
     * MANDATORY endgame traps: time left when each wave of the arena's `endgameTraps` goes live.
     * The first wave opens the endgame escalation at the start of the final 30 seconds.
     */
    endgameWaveRemainingTicks: number[];
    /** Each endgame wave is telegraphed on the floor this long before it goes live. */
    endgameWarnTicks: number;
  };
  /** V2: generator-contact abilities (kick / punch / disarm / pass), triggered by walking into a generator. */
  contact: {
    /** Punch: the generator flies this many tiles (over obstacles) and lands on the first free tile from there. */
    punchDistance: number;
    /** Disarm charges granted with the ability (also `pickups.killSwitchCharges` for the legacy pickup). */
    disarmCharges: number;
    /** After a contact action the same player cannot trigger another one for this long (no double fire). */
    cooldownTicks: number;
  };
  /** V2: button B. */
  special: {
    /** Melee reaches an opponent on any adjacent tile (facing tile checked first). */
    meleeAnyAdjacent: boolean;
    /**
     * One-press vehicle (autoVehicle.ts): how long an opponent is assumed to need to react to the route
     * warning before stepping (ticks). A route only counts as a trap if escaping takes longer than its warning.
     */
    autoVehicleReactionTicks: number;
  };
  /** V2: elimination credit (systems/attribution.ts). */
  credit: {
    /** A melee hit this recent makes the attacker the credited eliminator of an otherwise uncredited death. */
    assistWindowTicks: number;
  };
  /** V2: defensive layers. */
  protection: {
    maxArmour: number;
    /** Spawn protection after a respawn (respawn modes). */
    spawnProtectionTicks: number;
  };
  /** V2 Square Blast. */
  square: {
    maxTier: number;
    /** Square radius per tier (index = tier): 0, 1 (3 x 3), 2 (5 x 5). */
    radiusByTier: number[];
  };
  /** V2 City Rumble reward economy (systems/rewards.ts). Disabled = rewards off. */
  rewards: {
    enabled: boolean;
    /**
     * Rewards granted for the n-th credited elimination of the current life (index n-1; `stats.streak`).
     * Past the end of the ladder the entries from `repeatFrom` on cycle, so a fighter keeps getting stronger.
     */
    ladder: RewardKind[][];
    repeatFrom: number;
    /**
     * A ladder reward that would be wasted (capped, already owned, Okada already ridden) is replaced by the
     * first kind of this list that still does something, so every credited elimination pays.
     */
    fallback: PickupKind[];
    /** The `contact` reward for a fighter with no contact ability: their character's signature tool. */
    contactByCharacter: Record<CharacterId, PickupKind>;
  };
  /**
   * The fixed initial kill-streak loadout (decision SK1): rewards for the nth CREDITED elimination of the current
   * life. Each threshold pays once per streak and each reward is consumed once; a death clears both.
   */
  streaks: {
    enabled: boolean;
    loadout: { kills: number; reward: StreakRewardKind }[];
    /** QUICK HANDS (decision SK2). */
    quickHands: {
      /** How long it lasts. */
      durationTicks: number;
      /** Extra generator capacity while it lasts (on top of the capacity the fighter already has). */
      extraCapacity: number;
      /** A placement press that cannot be done yet (dazed, tile taken, at capacity) is kept this long. */
      placeBufferTicks: number;
    };
    /** VEHICLE GENERATOR (decision VG2): one three-second fuse from the moment the vehicle starts driving. */
    vehicleGenerator: {
      /** The generator's whole fuse, started when the vehicle launches. */
      fuseTicks: number;
      /** The carrier lets go this long after it starts driving (about the first two seconds). */
      releaseTicks: number;
      /** The thrown generator's flight time (the late, readable warning: a visible projectile plus a marker). */
      throwTicks: number;
      /** The longest throw (Manhattan tiles): on a big map a rival further than this is not thrown at from afar. */
      maxThrowTiles: number;
    };
    /** GLOBAL KNOCKDOWN (decision GK1). */
    globalKnockdown: {
      /** Flight time of the thrown object from the building to each rival's head. */
      throwTicks: number;
      /** How long a rival lies on the ground (cannot move, place or attack). Tuned 1.5-3 s. */
      knockdownTicks: number;
      /** After getting up a rival cannot be knocked down again for this long. */
      immunityTicks: number;
    };
  };
  /** V2 respawn modes (Deathmatch, Team Rumble). */
  respawn: {
    enabled: boolean;
    delayTicks: number;
    /** A respawn tile has no living opponent within this many tiles (Manhattan) when possible. */
    safeDistance: number;
    /** Reset upgrades on death (life-based power-ups). */
    resetOnDeath: boolean;
    /** A spawn used for a respawn is avoided by the next respawns for this long (no spawn camping). */
    spawnCooldownTicks: number;
    /** Respawns avoid spawns this close (Manhattan) to the tile the fighter just fell on. */
    deathAvoidRadius: number;
    /** Team Rumble: a spawn on the own team's side scores this much (in tiles of distance) extra. */
    homeSideBonus: number;
    /** Spawn protection ends early once the protected fighter places a generator (no free attacks). */
    protectionEndsOnAttack: boolean;
  };
  /** V2 standard-match sideline spectators. */
  spectator: {
    enabled: boolean;
    cooldownTicks: number;
    /** Warning / flight time before a thrown generator lands. */
    flightTicks: number;
    /** Ticks per lane step. */
    stepTicks: number;
    /** Live spectator generators per spectator. */
    maxLive: number;
    /** Preferred landing distance (tiles in from the board edge) of a throw. */
    throwDistance: number;
    /** Blast range of a thrown generator (no upgrades: the sideline has none). */
    range: number;
    /** No throws once this little time is left (the final closure belongs to the survivors). */
    noThrowRemainingTicks: number;
  };
  stage: {
    /** Minimum telegraph of any LETHAL stage hazard (the arena data may ask for longer, never shorter). */
    minLethalWarnTicks: number;
    /** At most this many lethal stage events warn or run at the same moment. */
    maxLethalEvents: number;
    /** Manholes: how long after a trip a player cannot be carried through a trapdoor again. */
    teleportCooldownTicks: number;
    /** Manholes: the climb-out pause after arriving. */
    teleportArriveTicks: number;
    /** Merchandise drops never land within this many tiles (Manhattan) of a player. */
    dropMinPlayerDistance: number;
    /** Lethal stage events stop this long before the end, and when Wahala Crush starts closing. */
    quietRemainingTicks: number;
    /**
     * Departure hazards: input allowance added to a fighter's walking time when checking that everyone on the
     * lane can step off it before it turns lethal (RE-E3).
     */
    escapeInputTicks: number;
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
    throwTicks: ticks(0.4),
    weakFireRange: 1,
    blastMode: 'plus',
    radialMaxSquareRadius: 4,
  },
  pickups: {
    hiddenChance: 0.45,
    // Generators come first (founder direction, decision N5): Extra Socket + Petrol Top-Up are 60 of
    // the 97 beneficial weight points (~62 %); the advanced skills are deliberately rarer.
    weights: {
      petrol: 30,
      socket: 30,
      skates: 7,
      diesel: 1,
      boots: 3,
      gloves: 2,
      remote: 2,
      killswitch: 3,
      okada: 4,
      voucher: 6,
      curse: 5,
      sneakers: 2,
      hotfuel: 1,
      bombpass: 3,
      // V2: Carry is out of normal play. Armour / Square Blast are elimination rewards (City Rumble);
      // whether they also become rare Classic crate finds is a workstream C decision (needs AI support first)
      grip: 0,
      armour: 0,
      square: 0,
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
    // Punch / Street Jab (push): fast and light. Shove: slow, positional, risky. Daze Punch: slow and heavy.
    // Decision CB2 lists the measured trade-offs; scripts/combat-balance.ts re-measures them.
    attacks: {
      push: {
        startupTicks: 4,
        whiffRecoveryTicks: 12,
        hitRecoveryTicks: ticks(1),
        targetLockoutTicks: ticks(3),
        displacementTiles: 0,
        dazeTicks: 30,
        dazeImmunityTicks: ticks(1),
      },
      shove: {
        startupTicks: 12,
        whiffRecoveryTicks: 36,
        hitRecoveryTicks: ticks(2),
        targetLockoutTicks: ticks(3),
        displacementTiles: 2,
        dazeTicks: 0,
        dazeImmunityTicks: 0,
      },
      daze: {
        startupTicks: 18,
        whiffRecoveryTicks: 30,
        hitRecoveryTicks: ticks(4),
        targetLockoutTicks: ticks(4),
        displacementTiles: 0,
        dazeTicks: ticks(1),
        dazeImmunityTicks: ticks(2),
      },
    },
    dazeImmunityTicks: ticks(2),
  },
  vehicles: {
    entryWindowTicks: ticks(8),
    entryWarnTicks: ticks(1.2),
    slowTicks: ticks(1.5),
    slowFactor: 1.8,
    minRouteTiles: 4,
    minKekeLegTiles: 3,
    allowed: ['danfo', 'taxi', 'keke'],
    specs: {
      danfo: { stepTicks: 14, resistance: 9, softLimit: 999, playerHitLimit: 999, turns: false },
      taxi: { stepTicks: 7, resistance: 6, softLimit: 2, playerHitLimit: 1, turns: false },
      keke: { stepTicks: 8, resistance: 4, softLimit: 1, playerHitLimit: 2, turns: true },
      // the Okada as a hazard (decision VG1): fastest, lightest - no crate breaking, gone after one rival
      okada: { stepTicks: 6, resistance: 3, softLimit: 0, playerHitLimit: 1, turns: false },
    },
    /** Ticks per tile while a VEHICLE GENERATOR rides it: slower than an attack run so the carrier is readable. */
    carrierStepTicks: { danfo: 12, taxi: 9, keke: 10, okada: 8 },
    lanes: null,
  },
  drops: {
    maxDeathDrops: 2,
  },
  supply: {
    kinds: ['socket', 'petrol'],
  },
  arena: {
    softDensity: 0.62,
  },
  crush: {
    startRemainingTicks: ticks(45),
    finalTileLeadTicks: ticks(2),
    warnTicks: ticks(1.2),
    keepCore: null,
    coreClosedRemainingTicks: ticks(30),
  },
  suddenDeath: {
    transitionTicks: ticks(4),
    blastDelayTicks: [ticks(60), ticks(30)],
    repeatBlastTicks: ticks(15),
    warnTicks: ticks(5),
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
    endgameWaveRemainingTicks: [ticks(30), ticks(15)],
    endgameWarnTicks: ticks(1.5),
  },
  contact: {
    punchDistance: 3,
    disarmCharges: 2,
    cooldownTicks: 8,
  },
  special: {
    meleeAnyAdjacent: true,
    autoVehicleReactionTicks: ticks(0.35),
  },
  credit: {
    // decision WC4: long enough for a shove into fire / traffic / the closing city, short enough that an
    // old scuffle never scores an unrelated accident
    assistWindowTicks: ticks(3),
  },
  protection: {
    maxArmour: 1,
    spawnProtectionTicks: ticks(2.5),
  },
  square: {
    maxTier: 2,
    radiusByTier: [0, 1, 2],
  },
  // Decision WC1 (docs/DECISIONS.md): every credited elimination pays at once, rewards widen from raw
  // generator power (1) to a tool (2), protection (3), Square Blast (4), control (5) and then several
  // items per elimination; from the 6th the last four rungs cycle, so a top fighter keeps growing.
  rewards: {
    enabled: false,
    ladder: [
      ['socket', 'petrol'],
      ['contact', 'skates'],
      ['armour', 'socket'],
      ['square', 'petrol'],
      ['remote', 'voucher', 'socket'],
      ['okada', 'armour', 'petrol'],
      ['square', 'socket', 'skates'],
      ['armour', 'voucher', 'petrol', 'socket'],
      ['square', 'okada', 'contact'],
    ],
    repeatFrom: 5,
    fallback: ['socket', 'petrol', 'armour', 'skates', 'square', 'voucher', 'okada'],
    contactByCharacter: { streetBaller: 'boots', lekkiBoy: 'gloves', campusQueen: 'killswitch' },
  },
  streaks: {
    enabled: false,
    loadout: [
      { kills: 3, reward: 'quickHands' },
      { kills: 5, reward: 'vehicleGenerator' },
      { kills: 7, reward: 'globalKnockdown' },
    ],
    quickHands: { durationTicks: ticks(18), extraCapacity: 5, placeBufferTicks: ticks(1.2) },
    vehicleGenerator: { fuseTicks: ticks(3), releaseTicks: ticks(2), throwTicks: 40, maxThrowTiles: 10 },
    globalKnockdown: { throwTicks: 36, knockdownTicks: ticks(2), immunityTicks: ticks(4) },
  },
  respawn: {
    enabled: false,
    delayTicks: ticks(3),
    safeDistance: 6,
    resetOnDeath: true,
    spawnCooldownTicks: ticks(8),
    deathAvoidRadius: 6,
    homeSideBonus: 8,
    protectionEndsOnAttack: true,
  },
  spectator: {
    enabled: false,
    cooldownTicks: ticks(8),
    flightTicks: ticks(1.2),
    stepTicks: 8,
    maxLive: 1,
    throwDistance: 3,
    range: 2,
    noThrowRemainingTicks: ticks(6),
  },
  stage: {
    minLethalWarnTicks: ticks(1.5),
    maxLethalEvents: 1,
    teleportCooldownTicks: ticks(2.5),
    teleportArriveTicks: ticks(0.3),
    dropMinPlayerDistance: 2,
    quietRemainingTicks: ticks(5),
    escapeInputTicks: ticks(0.2),
  },
};

/**
 * V2 City Rumble economy (all three Rumble rulesets, merged by modes.ts): rewards on, and the caps a
 * standard 2-4 player match needs are raised so elimination power keeps growing (decision WC2). What
 * remains are technical limits: the Square Blast stops at 7 x 7 and generator capacity at 10 (danger
 * maps / explosion work stay bounded with 32 fighters), flame reach at 10 (the plus still stops at
 * concrete), and three Armour plates. Movement speed keeps its standard ceiling (grid step timing).
 *
 * City Rumble Evolution (decisions RE-B1, RE-C1): Rumble blasts are radial (`blastMode: 'radial'`,
 * systems/blastShape.ts) with the radius capped at 5 (a 97-tile disc; `maxRange` is the radius cap in radial
 * mode), and every fighter starts with two generators (`baseCapacity: 2`). Classic is untouched.
 *
 * Decision RE-C4: the Square Blast squares the disc off up to radius 6 (13 x 13) instead of the Phase 0 radius 4,
 * so the second tier still widens a radius-5 blast (at radius 4 the square never grew past the disc cap's own
 * square and tiers 2-3 paid nothing); `rewards.ts` skips a tier that would not widen the footprint.
 */
export const RUMBLE_ECONOMY = {
  generator: {
    maxCapacity: 10,
    maxRange: 5,
    baseCapacity: 2,
    blastMode: 'radial' as const,
    radialMaxSquareRadius: 6,
  },
  protection: { maxArmour: 3 },
  square: { maxTier: 3, radiusByTier: [0, 1, 2, 3] },
  rewards: { enabled: true },
  streaks: { enabled: true },
} satisfies DeepPartial<GameConfig>;

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
