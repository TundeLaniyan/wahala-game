/**
 * Central balance configuration. Every tunable number in the simulation lives here so playtest
 * tuning never touches rules code. All durations are in ticks; use `ticks(seconds)` to author them.
 */
import type { AttackKind, CharacterId, Dir, PickupKind, StreakRewardKind, VehicleKind } from './types';
import type { EnemyKind, ThrownKind } from './campaign/types';

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
 * One close attack (B tap next to a rival; the resolution order is in `sim/systems/actions.ts`). Unless a field below
 * says otherwise nothing here roots the attacker: the recoveries only keep THEIR NEXT attack from starting; walking,
 * placing generators and everything else stay free. EVERY attack is non-lethal: its value is control (daze, slow,
 * displacement), never damage (`controlValueTicks` in `sim/data/attacks.ts` is the one-number summary).
 */
export interface AttackSpec {
  /** Ticks between the press and the effect (the telegraph; a hit that interrupts cuts a rival's startup short). */
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
  /** Tiles in the faced line the attack reaches (1 = adjacent only; 2 = also a rival two tiles away with a free tile between). */
  reach: number;
  /** The victim walks slower for this long (0 = no slow). Never stacks or extends: see `slowImmunityTicks`. */
  slowTicks: number;
  /** Extra ticks per tile while slowed. */
  slowExtraStepTicks: number;
  /** After a slow ends no attack may slow the same fighter again for this long. */
  slowImmunityTicks: number;
  /** Minimum time from the effect until the attacker may start ANY attack again, hit or whiff (0 = only the recoveries). */
  cooldownTicks: number;
  /** VULNERABILITY: true = the attacker is planted (cannot step) for the whole startup. */
  plantedStartup: boolean;
  /** VULNERABILITY: the attacker cannot step for this long after the effect found nobody (a committed miss). */
  whiffRootTicks: number;
  /** VULNERABILITY: the attacker cannot step for this long after the effect connected (recoil). */
  hitRootTicks: number;
  /** Whether a hit cuts a rival's pending startup short (every attack of the catalogue does). */
  interrupts: boolean;
  /** Extra daze ticks when the victim is in the startup of an attack of their own (a counter); 0 = none. */
  counterDazeTicks: number;
  /** Always 0: no attack hurts or kills. Lethality is only ever a flame, a vehicle or the closing city. */
  damage: 0;
}

/** The recoveries / roots / extras an attack of the original three does not use. */
const PLAIN = {
  reach: 1,
  slowTicks: 0,
  slowExtraStepTicks: 0,
  slowImmunityTicks: 0,
  cooldownTicks: 0,
  plantedStartup: false,
  whiffRootTicks: 0,
  hitRootTicks: 0,
  interrupts: true,
  counterDazeTicks: 0,
  damage: 0,
} as const;

/**
 * One thrown object (docs/CAMPAIGN_ATTACKS.md). The thrower is rooted for `warnTicks` (the visible cue), the object then
 * crosses one path tile per `stepTicks`, at most `range` tiles from the thrower.
 */
export interface ProjectileSpec {
  /** Telegraph between the launch cue and the first movement (never below `enemyAttacks.minWarnTicks`). */
  warnTicks: number;
  /** Ticks per path tile (a human walks one tile in 10 at base speed, so every projectile is slower than a walker). */
  stepTicks: number;
  range: number;
  /** Health segments taken (0 = daze / knockback only). */
  damage: number;
  dazeTicks: number;
  knockbackTiles: number;
  /** A strong projectile: a whole segment, slower, with a longer cue. */
  strong: boolean;
  /** The thrower may not throw anything again for this long (their own cooldown). */
  cooldownTicks: number;
}

/** An enemy kind's close attack: the catalogue attack gives the animation and the base startup, these numbers the harm. */
export interface EnemyMeleeSpec {
  /** The catalogue attack whose startup, reach and animation the punch borrows (`skills.attacks`). */
  attack: AttackKind;
  /** Added to that attack's startup: an enemy's wind-up is slower than the player's, so a fast jab beats it. */
  extraStartupTicks: number;
  damage: number;
  dazeTicks: number;
  knockbackTiles: number;
  /** Ticks before this enemy may start another punch (hit or miss). */
  cooldownTicks: number;
  /**
   * THE PUNISHABLE WINDOW (decision EF2): after the punch resolves (hit or miss) the enemy stays planted this long. Its
   * wind-up already plants it; together they are the moment a player who stepped out of reach can punch back or lay
   * a generator on it.
   */
  recoveryRootTicks: number;
}

/**
 * How a campaign enemy kind perceives generators (decision EF1). Read by the enemy BOT only (`ai/enemyBot.ts`, through
 * `Observation.config`): the simulation never looks at it, and it gives no information the observation lacks - it only
 * takes some away. Multiplayer bots never read it.
 */
export interface EnemyAwareness {
  /** CALM (no rival within `focusTiles`): a new generator is taken seriously this many ticks after it appears. */
  reactTicks: number;
  /** A rival this close (Manhattan), or its own wind-up / cue / recovery, puts the enemy in a brawl: TUNNEL VISION. */
  focusTiles: number;
  /**
   * In a brawl a generator counts as a threat only from this many ticks before it blows: a fresh generator at its
   * feet is walked past like an obstacle while it goes for you (the reaction is part of it).
   */
  alertTicks: number;
  /** Probability (the bot's own seeded RNG, once per generator) that a brawling enemy misjudges the fuse ... */
  slipChance: number;
  /** ... and reacts this many ticks later than `alertTicks` says. */
  slipTicks: number;
}

/**
 * Campaign health and damage (decisions CC1-CC4, docs/CAMPAIGN_COMBAT.md). Only players that carry `Vitals` use it, so
 * multiplayer never reads it. `GameConfig.campaign` is present only in campaign rulesets (mission / raid) or when a test
 * sets it: `campaignConfig(state)` falls back to `CAMPAIGN_CONFIG`, which keeps normal matches' serialised state unchanged.
 */
export interface CampaignConfig {
  /** Health segments of the human when the setup names none (field missions give 4, raids may give 3). */
  playerMaxHp: number;
  /** A heavy's health may be raised to this by the setup (the data says 3). */
  heavyMaxHp: number;
  /** Invulnerability frames after a damaging hit or an absorbed lethal event (shown as a flash). */
  invulnTicks: number;
  /** Segments a lethal-class event takes (after Okada and Armour have had their say), by source. 0 = never used. */
  damage: Record<'blast' | 'vehicle' | 'hazard' | 'trap', number>;
  /** Segments each close attack takes from a vitals-carrying victim (its daze / knockback / slow come from `skills.attacks`). */
  playerDamage: Record<AttackKind, number>;
  /**
   * The human's close attacks against a campaign ENEMY seat (decision EF3; never a multiplayer rival, never the human
   * as a victim): the per-target lockout is capped at `targetLockoutTicks` and a fresh daze immunity does not stop a
   * punch from landing (it then takes its segment without a new daze), so ordinary punches finish a basic enemy in
   * a reasonable time. The enemy's own recovery frames (`invulnTicks`) still apply.
   */
  vsEnemy: { targetLockoutTicks: number };
  /** An enemy's close attack never takes more than this from the human (enemies are individually weaker than the player). */
  enemyMeleeDamage: number;
  /** When an enemy health bar is shown (`enemyHealthView`): never permanent for everyone. */
  bar: {
    /** Shown this long after the enemy last lost a segment. */
    recentTicks: number;
    /** ... while the enemy is within this many tiles (Manhattan) of the human. */
    nearTiles: number;
    /** ... while the human faces them from at most this many tiles away in a clear line (1 = adjacent only). */
    aimTiles: number;
  };
}

export interface GameConfig {
  /** Campaign health and damage; absent in normal matches (see `CampaignConfig`). */
  campaign?: CampaignConfig;
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
    /**
     * Decision AS3: the least time between two generators laid by the same fighter (0 = none, Classic). It stops a
     * fast mount dropping generators continuously; a running QUICK HANDS is exempt (its whole point is hold-to-lay).
     */
    placeIntervalTicks: number;
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
    /** The close attacks of the catalogue (decisions CB1, FC2): each is a startup, an effect and recoveries, all in ticks. */
    attacks: Record<AttackKind, AttackSpec>;
    /**
     * Whether fighters throw their SECONDARY attack (`FighterDef.secondaryAttack`, chosen by B: see actions.ts). Off in
     * the deployed game (decision FC5): the three fighters keep their one attack until the founder approves the change.
     * Missions, tests and `PlayerSetup.attacks` can always give a secondary.
     */
    secondaryAttacks: boolean;
    /**
     * After an attack resolves a DIFFERENT attack of the same fighter's loadout may start this soon (the fighter's
     * own recoveries stay per attack; a single-attack fighter is unaffected). Decision FC4.
     */
    followUpGapTicks: number;
    /**
     * Step grace (decision FC1): an attack whose rival began stepping away during the startup still connects while
     * that rival has not visually crossed `maxShare` of the step (the board shows them still on the tile).
     */
    stepGrace: { enabled: boolean; maxShare: number };
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
    /**
     * Delay before blast 1, then blast 2 (60 s, then 15 s); the FINAL blast follows `repeatBlastTicks` after blast 2 and
     * kills through any protection (decision AS6).
     */
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
  /** Campaign enemy attacks (decisions EA1-EA5; docs/CAMPAIGN_ATTACKS.md). */
  enemyAttacks: {
    /** No projectile moves sooner than this after its cue: a rival can always see it and step off the line. */
    minWarnTicks: number;
    /** Throws only happen at least this many tiles away (adjacent rivals are punched instead). */
    minRange: number;
    /** The tiles in front of a rival a thrower aims to stand at (the standoff distance of the tactics). */
    standoffTiles: number;
    /** Most projectiles in flight in the whole match, and per group (team). */
    maxInFlight: number;
    maxInFlightPerGroup: number;
    /** A group (team) throws at most once per this many ticks: enemies never all throw together. */
    groupGapTicks: number;
    /** At most this many enemies of a group may be winding up a punch at once, and two punches of a group start this far apart. */
    maxGroupPunches: number;
    groupPunchGapTicks: number;
    /** After an enemy hit's stun ends this victim cannot be hit by an enemy again for this long. */
    victimFreeTicks: number;
    /** Enemies only act on a rival within this many tiles (Manhattan); farther away they hold. */
    aggroTiles: number;
    /** Field escape legs (decision EF6): a pursuer gives up the chase while the human is farther than this (Chebyshev). */
    pursuitGiveUpTiles: number;
    /** THE PUNISHABLE WINDOW of a throw (decision EF2): the thrower stays planted this long after its cue, by kind. */
    throwRecoveryTicks: Record<EnemyKind, number>;
    /** How each kind perceives generators (decision EF1; read by the enemy bot only). */
    awareness: Record<EnemyKind, EnemyAwareness>;
    projectiles: Record<ThrownKind, ProjectileSpec>;
    /** Null = this kind has no punch. */
    melee: Record<EnemyKind, EnemyMeleeSpec | null>;
    /** Reinforcement calls (lieutenants and bosses): the runtime answers, this sim only announces. */
    reinforce: {
      maxCalls: Record<EnemyKind, number>;
      count: Record<EnemyKind, number>;
      cooldownTicks: number;
      /** A call happens when the caller is at or below this share of its health ... */
      belowHpShare: number;
      /** ... or when this few of its group (itself included) are still standing. */
      aloneAtMost: number;
      /** How long a call stays open for the runtime and for the `reinforce` directive of nearby enemies. */
      answerTicks: number;
    };
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
    /**
     * Decision AS1-AS2: kill-earned power is temporary and bounded (`systems/lifePerks.ts`). Applies wherever
     * `enabled` is on; a death clears every perk.
     */
    perks: {
      /** How long a kill-earned upgrade lasts from the kill that granted it. */
      lifeTicks: number;
      /** Life slots a fighter may fill at once. */
      maxSlots: number;
      /** Slots one major perk (Armour, Okada, Remote Detonator) takes; every other perk takes one. */
      majorSlots: number;
      /** Bomb range may rise at most this many steps above `generator.baseRange` from rewards. */
      maxRangeSteps: number;
      /** Speed levels the rewards may give (the ceiling of the pickup economy is `pickups.maxSpeedLevel`). */
      maxSpeedSteps: number;
      /** Square Blast tiers the rewards may give. */
      maxSquareSteps: number;
    };
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
    /**
     * LOCAL CHAMPION (decision FC6): neighbours and people on the building side throw objects at rivals NEAR THE OWNER
     * for a limited window. Range-limited and dodgeable (the object lands on the tile the rival stood on), a short
     * daze only, one hit per rival per use. Not part of the fixed ladder unless `ladder` is on.
     */
    localChampion: {
      /** On: the 7-kill reward is LOCAL CHAMPION instead of GLOBAL KNOCKDOWN (an alternative, never both). Default off. */
      ladder: boolean;
      /** How long the crowd keeps throwing after the press. */
      windowTicks: number;
      /** A rival must be within this many tiles (Manhattan) of the owner when the crowd picks them. */
      radiusTiles: number;
      /** The crowd chooses new targets this often (the first volley is one `throwTicks` after the press). */
      volleyTicks: number;
      /** At most this many throws per volley (nearest rivals first). */
      maxThrowsPerVolley: number;
      /** Flight time: the warning. At least the GLOBAL KNOCKDOWN's `throwTicks` (tested). */
      throwTicks: number;
      /** The daze a hit causes: short, never a knockdown. */
      dazeTicks: number;
      /** After a hit nobody's crowd may hit that rival again for this long (no stun-lock, across uses and owners). */
      immunityTicks: number;
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

/** Campaign damage table (decision CC1): 4 segments, a blast or vehicle takes 2, a hazard or trap 1, 1 s of recovery. */
export const CAMPAIGN_CONFIG: CampaignConfig = {
  playerMaxHp: 4,
  heavyMaxHp: 4,
  invulnTicks: ticks(1),
  damage: { blast: 2, vehicle: 2, hazard: 1, trap: 1 },
  playerDamage: { push: 1, shove: 0, daze: 0, kick: 1, bottle: 2, sweep: 1, headbutt: 1, elbow: 1 },
  vsEnemy: { targetLockoutTicks: 66 },
  enemyMeleeDamage: 1,
  bar: { recentTicks: ticks(3), nearTiles: 3, aimTiles: 2 },
};

/** The campaign tuning in force (a ruleset or a test may override it; normal matches use the defaults). */
export const campaignConfig = (config: Pick<GameConfig, 'campaign'>): CampaignConfig =>
  config.campaign ?? CAMPAIGN_CONFIG;

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
    placeIntervalTicks: 0,
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
        ...PLAIN,
      },
      shove: {
        startupTicks: 12,
        whiffRecoveryTicks: 36,
        hitRecoveryTicks: ticks(2),
        targetLockoutTicks: ticks(3),
        displacementTiles: 2,
        dazeTicks: 0,
        dazeImmunityTicks: 0,
        ...PLAIN,
      },
      daze: {
        startupTicks: 18,
        whiffRecoveryTicks: 30,
        hitRecoveryTicks: ticks(4),
        targetLockoutTicks: ticks(4),
        displacementTiles: 0,
        dazeTicks: ticks(1),
        dazeImmunityTicks: ticks(2),
        ...PLAIN,
      },
      // ---- the extended catalogue (decisions FC2-FC4; docs/FIGHTERS_AND_ATTACKS.md has the measured matrix)
      // Kick: the only reach-2 attack; slow, planted, the longest whiff. Moves a rival one tile.
      kick: {
        startupTicks: 14,
        whiffRecoveryTicks: 54,
        hitRecoveryTicks: ticks(2.5),
        targetLockoutTicks: ticks(3),
        displacementTiles: 1,
        dazeTicks: 24,
        dazeImmunityTicks: 60,
        ...PLAIN,
        reach: 2,
        plantedStartup: true,
        whiffRootTicks: 30,
      },
      // Bottle strike: the longest daze of all, once per ten seconds, and a committed miss leaves the attacker stuck.
      bottle: {
        startupTicks: 9,
        whiffRecoveryTicks: 90,
        hitRecoveryTicks: 150,
        targetLockoutTicks: ticks(10),
        displacementTiles: 0,
        dazeTicks: 128,
        dazeImmunityTicks: ticks(2),
        ...PLAIN,
        cooldownTicks: ticks(10),
        plantedStartup: true,
        whiffRootTicks: 60,
      },
      // Sweep (leg strike): no daze at all; the victim limps for three seconds. Adjacent only, quick to recover.
      sweep: {
        startupTicks: 15,
        whiffRecoveryTicks: 24,
        hitRecoveryTicks: 100,
        targetLockoutTicks: ticks(4),
        displacementTiles: 0,
        dazeTicks: 0,
        dazeImmunityTicks: 0,
        ...PLAIN,
        slowTicks: ticks(3),
        slowExtraStepTicks: 6,
        slowImmunityTicks: ticks(2),
      },
      // Headbutt: fast, a medium daze, but the attacker reels from it too (a short recoil after a hit).
      headbutt: {
        startupTicks: 8,
        whiffRecoveryTicks: 30,
        hitRecoveryTicks: 110,
        targetLockoutTicks: ticks(5),
        displacementTiles: 0,
        dazeTicks: 55,
        dazeImmunityTicks: ticks(1.5),
        ...PLAIN,
        hitRootTicks: 30,
      },
      // Elbow check: a short bump; a long extra daze on a rival who is planted or reeling (a Kick / Bottle wind-up, a miss, a Headbutt recoil).
      elbow: {
        startupTicks: 11,
        whiffRecoveryTicks: 30,
        hitRecoveryTicks: 110,
        targetLockoutTicks: 190,
        displacementTiles: 1,
        dazeTicks: 16,
        dazeImmunityTicks: ticks(1),
        ...PLAIN,
        counterDazeTicks: 60,
      },
    },
    secondaryAttacks: false,
    followUpGapTicks: 30,
    stepGrace: { enabled: true, maxShare: 0.5 },
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
    blastDelayTicks: [ticks(60), ticks(15)],
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
  enemyAttacks: {
    minWarnTicks: 30,
    minRange: 2,
    standoffTiles: 3,
    maxInFlight: 5,
    maxInFlightPerGroup: 3,
    groupGapTicks: ticks(1),
    maxGroupPunches: 2,
    groupPunchGapTicks: ticks(0.7),
    victimFreeTicks: ticks(1),
    aggroTiles: 11,
    pursuitGiveUpTiles: 14,
    // decision EF2: the thrower is exposed after the throw (a corridor generator can catch it)
    throwRecoveryTicks: { agbero: 0, guard: 0, thrower: 36, heavy: 30, lieutenant: 18, boss: 12 },
    // decision EF1: calm, a new generator is read after `reactTicks`; brawling (a rival within `focusTiles`) only once
    // its fuse is down to `alertTicks` - basic enemies late, a heavy slow to read it, leaders nearly as sharp as a bot
    awareness: {
      agbero: { reactTicks: 20, focusTiles: 6, alertTicks: 24, slipChance: 0.3, slipTicks: 12 },
      guard: { reactTicks: 16, focusTiles: 6, alertTicks: 30, slipChance: 0.2, slipTicks: 12 },
      thrower: { reactTicks: 16, focusTiles: 6, alertTicks: 36, slipChance: 0.2, slipTicks: 12 },
      heavy: { reactTicks: 30, focusTiles: 6, alertTicks: 36, slipChance: 0.35, slipTicks: 16 },
      lieutenant: { reactTicks: 10, focusTiles: 4, alertTicks: 80, slipChance: 0.1, slipTicks: 10 },
      boss: { reactTicks: 6, focusTiles: 4, alertTicks: 110, slipChance: 0.05, slipTicks: 8 },
    },
    projectiles: {
      // common: small harm, short daze or a nudge; slower than a walking human (10 ticks per tile)
      bottle: {
        warnTicks: 36,
        stepTicks: 12,
        range: 6,
        damage: 0,
        dazeTicks: 36,
        knockbackTiles: 0,
        strong: false,
        cooldownTicks: ticks(2.5),
      },
      stone: {
        warnTicks: 36,
        stepTicks: 12,
        range: 6,
        damage: 0,
        dazeTicks: 12,
        knockbackTiles: 1,
        strong: false,
        cooldownTicks: ticks(2.3),
      },
      brick: {
        warnTicks: 42,
        stepTicks: 14,
        range: 5,
        damage: 1,
        dazeTicks: 24,
        knockbackTiles: 0,
        strong: false,
        cooldownTicks: ticks(3.2),
      },
      // strong: a whole segment, nearly twice as slow, a one second cue
      tool: {
        warnTicks: 60,
        stepTicks: 20,
        range: 6,
        damage: 1,
        dazeTicks: 36,
        knockbackTiles: 1,
        strong: true,
        cooldownTicks: ticks(4.5),
      },
    },
    melee: {
      agbero: {
        attack: 'push',
        extraStartupTicks: 30,
        damage: 1,
        dazeTicks: 24,
        knockbackTiles: 0,
        cooldownTicks: ticks(3),
        recoveryRootTicks: 30,
      },
      guard: {
        attack: 'push',
        extraStartupTicks: 24,
        damage: 1,
        dazeTicks: 30,
        knockbackTiles: 0,
        cooldownTicks: ticks(2.6),
        recoveryRootTicks: 24,
      },
      thrower: {
        attack: 'shove',
        extraStartupTicks: 18,
        damage: 0,
        dazeTicks: 0,
        knockbackTiles: 2,
        cooldownTicks: ticks(3.5),
        recoveryRootTicks: 30,
      },
      heavy: {
        attack: 'daze',
        extraStartupTicks: 24,
        damage: 1,
        dazeTicks: 40,
        knockbackTiles: 2,
        cooldownTicks: ticks(3.8),
        recoveryRootTicks: 40,
      },
      lieutenant: {
        attack: 'push',
        extraStartupTicks: 18,
        damage: 1,
        dazeTicks: 30,
        knockbackTiles: 1,
        cooldownTicks: ticks(2.4),
        recoveryRootTicks: 14,
      },
      boss: {
        attack: 'daze',
        extraStartupTicks: 18,
        damage: 1,
        dazeTicks: 45,
        knockbackTiles: 2,
        cooldownTicks: ticks(3),
        recoveryRootTicks: 10,
      },
    },
    reinforce: {
      maxCalls: { agbero: 0, guard: 0, thrower: 0, heavy: 0, lieutenant: 1, boss: 2 },
      count: { agbero: 0, guard: 0, thrower: 0, heavy: 0, lieutenant: 2, boss: 2 },
      cooldownTicks: ticks(20),
      belowHpShare: 0.5,
      aloneAtMost: 1,
      answerTicks: ticks(8),
    },
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
  // generator power (1) to a tool (2), protection (3), Square Blast (4), control (5), a mount (6), a vehicle
  // (7) and so on; from the 6th the last four rungs cycle. Decisions AS1-AS2 (docs/DECISIONS.md) bound it: each
  // rung has at most one large upgrade and never a Remote Detonator with a Vehicle Voucher, and what it pays is a
  // 12-second life perk inside five slots (systems/lifePerks.ts).
  rewards: {
    enabled: false,
    ladder: [
      ['socket', 'petrol'],
      ['contact', 'skates'],
      ['armour', 'socket'],
      ['square', 'petrol'],
      ['remote', 'socket'],
      ['okada', 'petrol'],
      ['voucher', 'skates', 'socket'],
      ['armour', 'petrol', 'socket'],
      ['square', 'contact'],
    ],
    repeatFrom: 5,
    fallback: ['socket', 'petrol', 'armour', 'skates', 'square', 'voucher', 'okada'],
    contactByCharacter: { streetBaller: 'boots', lekkiBoy: 'gloves', campusQueen: 'killswitch' },
    perks: {
      lifeTicks: ticks(12),
      maxSlots: 5,
      majorSlots: 2,
      maxRangeSteps: 2,
      maxSpeedSteps: 1,
      maxSquareSteps: 1,
    },
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
    localChampion: {
      ladder: false,
      windowTicks: ticks(8),
      radiusTiles: 5,
      volleyTicks: ticks(1.5),
      maxThrowsPerVolley: 2,
      throwTicks: 48,
      dazeTicks: 36,
      immunityTicks: ticks(5),
    },
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
 * V2 City Rumble economy (all three Rumble rulesets, merged by modes.ts): rewards on. The caps are the
 * anti-snowball ones (decisions AS1-AS3): at most three active generators per fighter (base two + one Extra
 * Socket; QUICK HANDS is its own temporary exception), a 10-tick (0.17 s) interval between two generators laid by
 * the same fighter - a walker (10 ticks a tile) is not held back, an Okada rider (6-8 ticks a tile) lays every other
 * tile at most (not while QUICK HANDS runs), and the reward limits in `rewards.perks` (range at most two steps above
 * the base, one Square Blast tier, one Armour plate, one speed step, five life slots). Movement speed keeps its
 * standard ceiling (grid step timing).
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
    maxCapacity: 3,
    placeIntervalTicks: 10,
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
