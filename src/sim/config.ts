/**
 * Central balance configuration. Every tunable number in the simulation lives here so playtest
 * tuning never touches rules code. All durations are in ticks; use `ticks(seconds)` to author them.
 */
import type { AttackKind, CharacterId, Dir, PickupKind, StreakRewardKind, VehicleKind } from './types';
import type { EnemyKind, ThrownKind } from './campaign/types';
import type { EnemyVariantId } from './data/enemyVariants';

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
  /**
   * Segments a raid heal room gives. Absent = `RAID_TUNING.healBonus` (the campaign levels set it: Easy gives more;
   * Normal leaves it absent so its serialised state is unchanged).
   */
  healBonus?: number;
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

/**
 * THE OSHODI MISSION 1 COMBAT PILOT (docs/OSHODI_COMBAT_PILOT.md, decisions CP1-CP12). An EXPERIMENT, not the campaign
 * baseline: only the field mission(s) listed in `mission/combatPilot.ts` (today only `oshodi.approach`) put it in the
 * config; every other match (other field missions, raids, boss missions, City Rumble, multiplayer, online) has no
 * `combatPilot` key at all and runs the rules exactly as before. Removing the pilot = removing that one map entry.
 * It changes only the fight between the campaign HUMAN and campaign ENEMY seats (`Player.enemyKind`).
 */
export interface CombatPilotConfig {
  /** Names the experiment (measurements, the debug handle). */
  id: string;
  /**
   * The human's B against an enemy: ONE pilot punch whatever the fighter (the multiplayer catalogue keeps its trades;
   * against enemies three of the six fighters' attacks took no health at all before, decision CP2).
   */
  punch: {
    /** Ticks from the press to the hit (the swing is drawn from the press). */
    startupTicks: number;
    /** After a punch connected / swung at the air the next one starts this much later (a press meanwhile is kept). */
    hitRecoveryTicks: number;
    whiffRecoveryTicks: number;
    /** Health segments a punch takes. */
    damage: number;
    /** An ordinary enemy hit outside its stagger immunity reels this long: its wind-up is cut short, it cannot act. */
    staggerTicks: number;
    /** After a stagger ends the same enemy only takes damage (no new stagger) for this long: no stun-lock. */
    staggerImmunityTicks: number;
    /** A steadfast enemy (the heavy) reels only on every n-th punch that lands on it (0 = never). */
    steadfastPoise: number;
    /** Reach adds the four diagonals to the four neighbours and the human's own tile (forgiving for the high camera). */
    diagonal: boolean;
  };
  /**
   * An enemy whose wind-up a stagger cut short may start its next punch this long after the stagger ends (its punch
   * cooldown is not wasted on the interrupted swing): a staggered guard swings back instead of standing helpless.
   */
  counterSwingTicks: number;
  /** Recovery frames an ENEMY gets after losing health (the human keeps `campaign.invulnTicks`). */
  enemyFramesTicks: number;
  /** Health segments by enemy kind (an absent kind keeps `data/enemies.ts`). */
  enemyHp: Partial<Record<EnemyKind, number>>;
  /** Segments a blast takes from an ENEMY (the human keeps `campaign.damage.blast`). */
  blastDamageVsEnemy: number;
  /** A press of A or B the human could not act on yet (hit-stun, punch recovery) is kept this long and retried. */
  inputBufferTicks: number;
  /** Enemies never step onto the human's tile (they used to stand inside the player, out of every punch's reach). */
  enemiesKeepOffHuman: boolean;
}

/**
 * THE TACTICAL TRAP PILOT (docs/TACTICAL_TRAP_PILOT.md, decisions TT1-TT10). An EXPERIMENT, not the campaign baseline:
 * only the Training Academy "Generator Tactics" scenarios (`tutorial/lessons/tactics.ts`) put it in the config; every
 * other match (the campaign, Classic Blast, City Rumble, multiplayer, online, raids, boss missions) has no `tacticalTrap`
 * key at all and runs the rules exactly as before (its serialised state carries no trace of it). It makes a generator a
 * tactical weapon against campaign ENEMY seats (`Player.enemyKind`): an enemy only knows what it could see or hear
 * (line of sight, player-body concealment, memory, hearing), a punch staggers and slows but cannot finish, and every
 * attack has a readable wind-up, attack and recovery. Removing the pilot = deleting this key's constant
 * (`TACTICAL_TRAP_PILOT`), `tacticalTrapLayer()` and the Academy lessons; the hooks are inert without the key.
 */
export interface TrapPerception {
  /** Vision radius in tiles (straight distance between tile centres): a generator farther away is never seen. */
  visionTiles: number;
  /** A visible generator is taken seriously this many ticks after the enemy first sees it (its reaction time). */
  reactTicks: number;
  /** A generator that went out of sight is remembered this long after it was last seen (see `memoryHoldFuseTicks`). */
  memoryTicks: number;
  /** A fresh generator laid within this many tiles (Manhattan) is HEARD: caution only, never its position or blast. */
  hearingTiles: number;
}

export interface TacticalTrapConfig {
  /** Names the experiment (measurements, the debug handle). */
  id: string;
  /** Per enemy kind: how far it sees, how fast it reacts, how long it remembers, how far it hears. */
  perception: Record<EnemyKind, TrapPerception>;
  /**
   * A ticking (timed) generator the enemy has seen is NEVER forgotten once its fuse is down to this many ticks: the
   * enemy keeps counting it down until it blows. Before that the ordinary `memoryTicks` window applies.
   */
  memoryHoldFuseTicks: number;
  /** What hearing a fresh generator does (without revealing where it is exactly or what it will burn). */
  caution: {
    /** The enemy starts no new wind-up or cue for this long. */
    ticks: number;
    /** While cautious, the reaction time to a newly visible generator is scaled by this (it is looking harder). */
    reactScale: number;
    /** On hearing, one step toward the sound's dominant axis (an investigating step; never a path to the generator). */
    investigate: boolean;
  };
  /** The human's hits slow an enemy (decision TT5): stacking, a cap, a total limit and a resistance window. */
  slow: {
    /** Share of walking speed lost after the 1st, then the 2nd (= the cap) hit: 0.25 and 0.4. */
    levels: number[];
    /** Every slowing hit keeps the slow running this long from the hit (never shortening it). */
    durationTicks: number;
    /** The slow never lasts longer than this from the FIRST hit of the chain: hits cannot refresh it forever. */
    maxTotalTicks: number;
    /** After a slow ends the same enemy cannot be slowed again for this long. */
    resistTicks: number;
  };
  /**
   * What a punch may take (decision TT6): it can take an enemy down to `max(1, ceil(maxHp x share))` segments and no
   * further, so only a generator blast (or another lethal source) finishes it. Share 0 = down to 1 segment.
   */
  punchFloorShare: Record<EnemyKind, number>;
  /**
   * An enemy never steps onto the human's own tile (as in the Oshodi combat pilot, CP9): one standing on a generator the
   * human has just laid under his feet would see it from the very tile.
   */
  enemiesKeepOffHuman: boolean;
  /** The readable attack states (`enemyAttackPhase`). */
  attack: {
    /** The 'attack' phase lasts this many ticks from the moment a punch resolves or a projectile leaves. */
    activeTicks: number;
    /** An enemy's cooldown must exceed wind-up + recovery by at least this (the player always gets a response window). */
    responseGapTicks: number;
  };
}

/**
 * Trap sense (decision SA5): how well an enemy reasons about the generators it KNOWS. A variant names its tier
 * (`data/enemyVariants.ts`); a seat without a variant uses its kind's default. Never information: an enemy with the
 * best trap sense still knows only what it saw, remembered or heard.
 */
export type TrapSenseTier = 'none' | 'basic' | 'keen' | 'expert';

export interface TrapSenseSpec {
  /** Scales the reaction time (`TrapPerception.reactTicks`) to a newly seen generator. */
  reactScale: number;
  /** Scales it again while brawling (pursuing, winding up, recovering): tunnel vision. 1 = none. (Boss and crew generator bots.) */
  brawlReactScale: number;
  /**
   * The same for a campaign FIELD enemy seat (`Player.enemyKind`; decision RC4): a brawler in a fight takes a generator that was
   * hidden under a rival's feet seriously later than the boss missions' crews do (their `brawlReactScale` is unchanged).
   */
  enemyBrawlReactScale: number;
  /** Bot levels added to the campaign level's enemy bot level for the movement / escape planner (`DIFFICULTIES`). */
  plannerBump: number;
  /**
   * While CALM (patrolling, holding its post, walking back; not engaged, not cautious) it only notices a generator this
   * close: a stroller does not scan the ground far ahead (an engaged or cautious enemy uses its full vision).
   */
  calmVisionTiles: number;
  /**
   * It notices a generator being LAID by someone it can see at that moment (line of sight, vision; never through a wall
   * or another body; not while it reels from a stagger), so a generator laid under the placer's feet in its plain sight
   * is not hidden from it. The placement is information it watched, never a guess.
   */
  seesPlacement: boolean;
  /**
   * Decision RC10: it keeps watching placements while it is COMMITTED (winding up, swinging, recovering). False = tunnel vision:
   * a brawler planted in its own swing does not look at the ground under its rival's feet, so the bait works on it, and it reacts to a generator it
   * sees late (`enemyBrawlReactScale`) instead. Absent = true (the tiers that read traps well).
   */
  watchesWhileBrawling?: boolean;
}

/**
 * THE CAMPAIGN TACTICS LAYER (docs/CAMPAIGN_SECTOR_AI.md, decisions SA3-SA12). The campaign-wide successor of the Tactical
 * Trap and Oshodi combat pilots: perception (sight, memory, hearing), generator evasion by commitment and trap sense,
 * the territorial state machine, readable enemy commitment and the melee-vs-generator balance. Present ONLY in campaign
 * FIELD and BOSS missions (`mission/build.ts` `missionConfigLayer`, levels from `campaign/levels.ts`
 * `campaignTacticsLayer`), and in Classic raids WITHOUT its combat model (`classicRaid`, decision RA1:
 * `raid/build.ts` `raidTacticsLayer`); ABSENT in the Training Academy, Classic, City Rumble, multiplayer and online
 * (tested), whose rules are therefore exactly as before. Every hook is guarded by this key; the combat hooks by
 * `tacticsCombat`.
 */
export interface CampaignTacticsConfig {
  /** Names the layer (measurements, the debug handle). */
  id: string;
  /** The campaign level these numbers are for (documentation and tests; rules read the numbers, never this). */
  level: 'easy' | 'normal' | 'hard';
  /** Generator perception per enemy kind (vision, reaction, memory, hearing), as in the Academy pilot (TT1-TT3). */
  perception: Record<EnemyKind, TrapPerception>;
  /** A seen ticking generator with at most this much fuse left is never forgotten before it blows. */
  memoryHoldFuseTicks: number;
  /** Hearing a fresh generator: caution (no new wind-up / cue, faster reaction). Investigation is the territory's. */
  caution: TacticalTrapConfig['caution'];
  /** Trap sense tiers (decision SA5). */
  trapSense: Record<TrapSenseTier, TrapSenseSpec>;
  /** Noticing the HUMAN (the territorial state machine, `systems/territory.ts`; decision SA6). */
  awareness: {
    /** A human in grid line of sight within this many tiles (straight distance) is being noticed, by kind. */
    noticeTiles: Record<EnemyKind, number>;
    /**
     * Decision RC4: the same while it is CALM (patrolling, holding its post, walking back): a walker looks at the road
     * ahead, not at everything within earshot, so a human out of its calm cone or beyond this range walks past unseen.
     * Never more than `noticeTiles`; engaged enemies (alert, pursuing) use `noticeTiles`.
     */
    calmNoticeTiles: Record<EnemyKind, number>;
    /** Ticks of (accumulated) sight before the enemy is alerted; sight lost decays it twice as fast. */
    noticeTicks: number;
    /** A human this close (Manhattan) is noticed at once, seen or not (footsteps, breathing). */
    closeTiles: number;
    /** The alert beat: the enemy turns to the human this long before it pursues (the readable "!"). */
    alertTicks: number;
    /** A pursuer that has not seen the human for this long goes to look where it last saw him. */
    loseTicks: number;
    /** Ticks spent looking around at an investigated spot before going back. */
    searchTicks: number;
    /** A heard noise sends the enemy this many tiles along its COARSE direction band (8 bands; never the tile). */
    investigateStep: number;
    /** A blast is heard this many times farther than a generator being laid. */
    blastHearingScale: number;
    /** An investigation that never arrives (a blocked way) gives up and searches where it stands after this long. */
    investigateTimeoutTicks: number;
  };
  /** Territory defaults (a seat's `territory` data and its variant's personality add to these; decision SA6). */
  territory: {
    /** A pursuer chases while the human is within this many tiles (Chebyshev) of the TERRITORY (its anchors). */
    pursuitTiles: number;
    /** Hysteresis: it gives up only when the human is this much farther than `pursuitTiles` (no boundary dance). */
    leashSlack: number;
    /** After giving up it watches the human (facing him, ranged ones still throw) this long before walking back. */
    returnWatchTicks: number;
    /** How far from its territory an investigation may lead. */
    investigateRadius: number;
    /** Pause at each patrol waypoint, and the deterministic variation added per waypoint visit (0 = clockwork). */
    patrolPauseTicks: number;
    patrolJitterTicks: number;
    /** A patrol walks its route back the other way on every other lap (less predictable). */
    reversePatrol: boolean;
    /** Scales a variant's ally-alert radius (0 = nobody calls for help). */
    alertAlliesScale: number;
    /** A cover-using variant repositions out of the human's sight up to this many tiles after attacking (0 = never). */
    coverTiles: number;
    /** Pursuers coordinate (each brawler takes a different side, throwers line up): `campaign/tactics.ts`. */
    groupTactics: boolean;
    /** A cover user stays behind its cover this long after its recovery ends, then pursues again. */
    coverHoldTicks: number;
    /** A watching guard turns a quarter (clockwise) this often: its view cone sweeps, nobody sneaks up forever. */
    lookAroundTicks: number;
    /** A hit sends it after the human with NO leash for this long (hitting it from beyond the leash is no free kill). */
    hitChaseTicks: number;
    /**
     * Decision RC2: a CALM walk (patrol, watch repositioning, walking back to its route) is slower than a chase by this
     * many ticks per tile, so a route is readable and a patroller can be followed and timed. Not applied while it
     * investigates, alerts or pursues (a chase, and a dodge in a chase, run at the full `enemyStepTicks`).
     */
    patrolStepExtraTicks: number;
  };
  /**
   * Decision RC1: ticks per tile of every ordinary campaign enemy while the layer is present, by kind (absolute: they
   * REPLACE `ENEMY_KINDS[kind].stepPenaltyTicks`; the human walks a tile in 10, 9, 8 or 7 ticks). Every ordinary kind is
   * slower than the human on every level, so a player can always disengage; a variant may shave
   * `EnemyPersonality.stepBonusTicks` off it, never below `enemyMinStepTicks`. Boss missions' bots have no enemy kind.
   */
  enemyStepTicks: Record<EnemyKind, number>;
  /** The floor of an ordinary enemy's step time on this level (above the human's 10: the human always keeps a lead). */
  enemyMinStepTicks: number;
  /**
   * Decision RC3: no forever-chase and no boundary dance. A pursuer breaks off (investigates where it last saw the human,
   * searches, returns and resumes its route) when the human has been farther than `breakOffGapTiles` WALKING tiles for
   * `breakOffTicks`, or it has chased for `maxChaseTicks` without landing a hit; for `reNoticeCooldownTicks` afterwards it
   * does not notice him again by sight (a human within `closeTiles` or a hit still engages it at once).
   */
  chase: {
    breakOffGapTiles: number;
    breakOffTicks: number;
    maxChaseTicks: number;
    reNoticeCooldownTicks: number;
    /** A walk back to its route that has not arrived this long after the watch ends counts as done (a blocked way, a guard
     * held at its equipment by the mission): it is back on its route state, never stuck in `return` forever. */
    returnTimeoutTicks: number;
    /** A patrol that has not reached its waypoint this long after setting off (a crate dropped on the lane) goes on to the next. */
    patrolStuckTicks: number;
  };
  /** The human's landed hit on an ordinary or armoured enemy, whatever the fighter (decision SA8). */
  punch: {
    /** Segments a landed hit takes (never below the armoured floor). */
    damage: number;
    /** The same enemy can be hit again only this long after (punched out, but slowly). */
    lockoutTicks: number;
    /** The human's own recovery after a hit on an enemy is at most this (every fighter can follow up). */
    maxHitRecoveryTicks: number;
    /** An ordinary enemy reels this long (its wind-up is cut short) ... */
    staggerTicks: number;
    /** ... and then cannot be staggered again for this long (no stun-lock; damage still lands). */
    staggerImmunityTicks: number;
    /** Tiles an ordinary enemy is knocked straight back when the tile is free (never a wall, a body or a generator). */
    knockbackTiles: number;
    /** One simple slow: this share of speed lost for `slowTicks`, never stacked or refreshed ... */
    slowShare: number;
    slowTicks: number;
    /** ... and then resisted this long. */
    slowResistTicks: number;
  };
  /** Health segments by kind (a variant may override; decision SA8). */
  enemyHp: Record<EnemyKind, number>;
  /** ARMOURED kinds: only a blast (or another lethal source) finishes them; punches stop at the floor. */
  armoured: Record<EnemyKind, boolean>;
  /** The floor of an armoured kind: max(1, ceil(maxHp x share)). */
  punchFloorShare: Record<EnemyKind, number>;
  /** Segments one blast takes from an armoured enemy (an ordinary enemy is always defeated by a blast). */
  blastVsArmoured: number;
  /** Recovery frames an ENEMY gets after losing health (short: a punch then a blast both land). */
  enemyFramesTicks: number;
  /** Enemies never step onto the human's tile (the reach rule of the pilots, CP9 / TT). */
  enemiesKeepOffHuman: boolean;
  attack: {
    /** The 'attack' phase lasts this many ticks after a punch resolves or an object leaves. */
    activeTicks: number;
    /** Every enemy cooldown exceeds wind-up + recovery by at least this (the human always gets a response window). */
    responseGapTicks: number;
    /** A thrower throws only after standing still this long (never while dodging; AI rule). */
    throwSettleTicks: number;
    /**
     * Decision RC9: a punch that finds nobody (the human stepped out of the wind-up) plants an ordinary enemy this much LONGER
     * than one that lands: a committed miss is the punishable window a generator laid at its feet needs.
     */
    whiffRecoveryExtraTicks: number;
  };
  /**
   * Boss missions: the generator-bot seats (boss and crew have no `enemyKind`) and the perception kind each uses. Set by
   * `missionConfigLayer` from the mission data; absent in field missions.
   */
  seatPerception?: Record<number, EnemyKind>;
  /**
   * Boss missions (decision BX8): the variant personality of each generator-bot seat (`CrewDef.variant`, the boss is
   * 'boss'): its trap sense (reaction, whether it watches a placement) and its vision change, never what it can know.
   */
  seatVariant?: Record<number, EnemyVariantId>;
  /**
   * Decision RA1 (docs/CLASSIC_RAID_AI.md): present ONLY in a Classic raid. The layer then runs its perception (sight,
   * memory, hearing), the territorial state machine with the raid's derived patrol routes, the enemy pace and the cues,
   * but NOT its combat model (`punch`, `enemyHp`, `armoured`, `punchFloorShare`, `blastVsArmoured`, `enemyFramesTicks`,
   * `enemiesKeepOffHuman`, `attack.whiffRecoveryExtraTicks`, variant recovery bonuses, same-tile reach): a raid keeps its
   * own combat rules (decisions RD, EF, CG). Read through `tacticsCombat`.
   */
  classicRaid?: ClassicRaidTactics;
}

/** Decision RA2: how an enemy kind walks its ground in a Classic raid (`raid/routes.ts` derives the route at its wake). */
export interface RaidRouteStyle {
  /**
   * `loop`: a rectangle of open floor round 1-4 pillar blocks through its spot, walked one way (else a corridor run);
   * `beat`: a short straight run walked back and forth; `post`: it holds its spot and sweeps its view (a lane post).
   */
  style: 'loop' | 'beat' | 'post';
  /** loop: the perimeter (tiles) it prefers and the largest it accepts (8 = round one pillar, 12 = two, 16 = four). */
  loopTiles: number;
  maxLoopTiles: number;
  /** beat, and a loop kind's corridor run when no loop fits: tiles of the straight run, its spot included. */
  runTiles: number;
  /**
   * Decision RA6: pursuing, it keeps its distance and lines up a throw (the thrower) instead of closing in. False for
   * every other raid kind, whatever its field variant does: a raid lieutenant is the crew's bruiser (it still throws
   * when the player stands in a clear line).
   */
  keepsDistance: boolean;
}

/** The Classic raid's part of the tactics layer (decisions RA1-RA2). */
export interface ClassicRaidTactics {
  routes: Record<EnemyKind, RaidRouteStyle>;
  /** No route tile within this many tiles (Manhattan) of the entrance: the player's first steps are his own. */
  entranceClearTiles: number;
  /** Conveyor belts carry a standing enemy off its route: never a route tile on a belt. */
  avoidBelts: boolean;
  /**
   * Decision RA6: a wave the player's own action calls in (a marked crate, a door, a cleared wave) wakes alerted to him
   * and hunts him for at most this long with no leash, walking-gap or maximum-chase break-off (losing sight of him still
   * sends it to search where it last saw him); 0 = it wakes calm on its route, like the waves present from the start.
   */
  calledChaseTicks: number;
  /**
   * Decision CR2: at most this many ORDINARY enemies (agbero, guard, thrower, heavy) hunt the player at once (`alert` /
   * `pursue`). Another that notices him, hears a call or is called in watches him from its ground and goes back to its
   * route instead; a hit or a player at arm's length still turns it. Lieutenants and bosses are never capped.
   */
  maxChasers: number;
  /**
   * Decision CR6: a blast defeats an enemy of these kinds outright (a sprung ambush is a kill at every level, whatever
   * `campaign.damage.blast` the level gives the human); any other kind loses at least `blastVsTough` segments.
   */
  blastDefeats: EnemyKind[];
  blastVsTough: number;
}

/**
 * THE CITY RUMBLE COMBAT TEST LAB (docs/COMBAT_TEST_LAB.md). A temporary playtest tool: four punch behaviours the
 * founder switches between from the pause menu of a local City Rumble match. Every level is the SAME combat code
 * (`systems/skills.ts`) with these numbers and switches; each fighter keeps their own attack (push / shove / daze),
 * only its timings are scaled and capped, and the reach shape, aim help and press buffer change. Remove the lab =
 * remove `COMBAT_LAB_PRESETS`, the pause-menu section and `systems/combatLab.ts` (the rules are inert without it).
 */
export type CombatLabLevel = 1 | 2 | 3 | 4;

export interface CombatLabPreset {
  level: CombatLabLevel;
  /** Short name for the pause menu and the HUD chip. */
  name: string;
  /** One line for the pause menu. */
  summary: string;
  /** Every catalogue attack's startup x this, then at most `maxStartupTicks` (never below 1). */
  startupScale: number;
  maxStartupTicks: number;
  /** Hit and whiff recovery x this, then clamped to `minRecoveryTicks..maxRecoveryTicks`. */
  recoveryScale: number;
  minRecoveryTicks: number;
  maxRecoveryTicks: number;
  /** The per-target lockout x this, then at most `maxLockoutTicks` (the victim's daze immunity still applies). */
  lockoutScale: number;
  maxLockoutTicks: number;
  /** Reach adds the two FORWARD diagonals (the faced side's corners). */
  forwardDiagonals: boolean;
  /** Reach adds the tile two ahead in the faced line, when the tile between is open floor. */
  reachTwo: boolean;
  /** Reach adds the two tiles two ahead and one to the side, through an open tile (never between two walls). */
  reachTwoWide: boolean;
  /** The fighter turns to the nearest rival anywhere in its reach (otherwise the faced side comes first). */
  autoTarget: boolean;
  /** A B press that cannot start now (recovering, a short daze) is kept this long and done when it can be. */
  bufferTicks: number;
  /** Nobody in reach and B does nothing else: a visible swing at the air (a clear miss). */
  airSwing: boolean;
  /** Presentation: 1 = swing arc and impact, 2 = a bigger impact flash and ring. */
  feedback: 1 | 2;
}

export const COMBAT_LAB_PRESETS: Readonly<Record<CombatLabLevel, CombatLabPreset>> = {
  1: {
    level: 1,
    name: 'Classic+',
    summary: 'Your fighter’s own push / shove / daze, presses kept, misses shown, shorter recovery.',
    startupScale: 1,
    maxStartupTicks: 18,
    recoveryScale: 0.6,
    minRecoveryTicks: 8,
    maxRecoveryTicks: 150,
    lockoutScale: 0.8,
    maxLockoutTicks: 192,
    forwardDiagonals: false,
    reachTwo: false,
    reachTwoWide: false,
    autoTarget: false,
    bufferTicks: 10,
    airSwing: true,
    feedback: 1,
  },
  2: {
    level: 2,
    name: 'Balanced',
    summary: 'Quicker attacks, the forward corners in reach, turns to the rival it can hit.',
    startupScale: 0.8,
    maxStartupTicks: 14,
    recoveryScale: 0.4,
    minRecoveryTicks: 8,
    maxRecoveryTicks: 90,
    lockoutScale: 0.6,
    maxLockoutTicks: 144,
    forwardDiagonals: true,
    reachTwo: false,
    reachTwoWide: false,
    autoTarget: true,
    bufferTicks: 12,
    airSwing: true,
    feedback: 1,
  },
  3: {
    level: 3,
    name: 'Arcade',
    summary: 'Fast punches that reach two tiles ahead, big hits, easy close fighting.',
    startupScale: 0.6,
    maxStartupTicks: 8,
    recoveryScale: 0.25,
    minRecoveryTicks: 8,
    maxRecoveryTicks: 45,
    lockoutScale: 0.4,
    maxLockoutTicks: 80,
    forwardDiagonals: true,
    reachTwo: true,
    reachTwoWide: false,
    autoTarget: true,
    bufferTicks: 15,
    airSwing: true,
    feedback: 2,
  },
  4: {
    level: 4,
    name: 'Maximum Punch',
    summary: 'Playtest extreme: a wide two-tile reach, strong aim help, almost continuous punching.',
    startupScale: 0.5,
    maxStartupTicks: 4,
    recoveryScale: 0.1,
    minRecoveryTicks: 10,
    maxRecoveryTicks: 14,
    lockoutScale: 0.2,
    maxLockoutTicks: 40,
    forwardDiagonals: true,
    reachTwo: true,
    reachTwoWide: true,
    autoTarget: true,
    bufferTicks: 15,
    airSwing: true,
    feedback: 2,
  },
};

/**
 * The CLASSIC BATTLE close-combat feel (decision CC-F1): Level 2 "Balanced" of the lab (its timings, aim help, kept press,
 * visible swing and miss, hit confirmation), derived from `COMBAT_LAB_PRESETS[2]` so the two cannot drift, with ONE
 * exception: no forward-corner reach. Classic is a strict cardinal grid, so a punch reaches the four neighbours only.
 * Applied to local Classic Battle matches by `applyClassicCombat` (systems/combatLab.ts); never user-switchable.
 */
export const CLASSIC_COMBAT_PRESET: Readonly<CombatLabPreset> = {
  ...COMBAT_LAB_PRESETS[2],
  name: 'Classic',
  summary:
    'Quicker attacks on the four sides, turns to the rival it can hit, presses kept, hits and misses shown.',
  forwardDiagonals: false,
};

export interface GameConfig {
  /** Campaign health and damage; absent in normal matches (see `CampaignConfig`). */
  campaign?: CampaignConfig;
  /** The Oshodi Mission 1 combat pilot (`CombatPilotConfig`); ABSENT in every other match. */
  combatPilot?: CombatPilotConfig;
  /** The Tactical Trap pilot (`TacticalTrapConfig`); ABSENT everywhere except the Academy "Generator Tactics" scenarios. */
  tacticalTrap?: TacticalTrapConfig;
  /** The campaign tactics layer (`CampaignTacticsConfig`); present ONLY in campaign field and boss missions. */
  campaignTactics?: CampaignTacticsConfig;
  /**
   * Light-based detection of a NIGHT raid (`NightSightConfig`, decisions NL10-NL13); present ONLY in a raid whose data
   * turns it on (`RaidDef.lighting.detection`). Absent everywhere else, so no other match changes.
   */
  nightSight?: NightSightConfig;
  /**
   * The City Rumble COMBAT TEST LAB preset in force (`CombatLabPreset`, decisions CL-L1..), set live from the pause menu
   * of a LOCAL City Rumble match only (`systems/combatLab.ts`). ABSENT in every other match and until a level is picked.
   */
  combatLab?: CombatLabPreset;
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
    /**
     * The SUDDEN DEATH TEST match only (decisions SD-T1..SD-T7, `suddenDeathTest.ts`): ABSENT in every other match. When
     * set, the round starts on the first playing tick with every player as a contender, the outer ring closes in
     * over `collapseTicks` through the ordinary Wahala Crush (telegraphed), and each blast is a front that travels
     * outward from the middle of the area one ring per `frontTicksPerRing` and hits a contender when it reaches them.
     */
    lab?: { collapseTicks: number; frontTicksPerRing: number };
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
    /**
     * Decision CR4 (Classic raids): an enemy punch is COMMITTED to the tile its wind-up telegraphs (the enemy's tile
     * plus the wind-up's direction). At impact it hits only a rival on that tile (or still under half-way out of it);
     * it never turns to another neighbour or reaches along a line. Absent = the catalogue reach (every other match).
     */
    committedMelee?: boolean;
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

/** A partial enemy-attack tuning (`DeepPartial` cannot reach into the nullable melee specs). */
export type PilotEnemyAttacks = Omit<DeepPartial<GameConfig['enemyAttacks']>, 'melee'> & {
  melee?: Partial<Record<EnemyKind, Partial<EnemyMeleeSpec>>>;
};

/** A config layer of the combat pilot: its own settings (partial) and the enemy-attack tuning it changes. */
export interface PilotLayer {
  combatPilot?: Partial<Omit<CombatPilotConfig, 'punch'>> & { punch?: Partial<CombatPilotConfig['punch']> };
  enemyAttacks?: PilotEnemyAttacks;
}

/**
 * The Oshodi Mission 1 combat pilot at the Normal level (decisions CP1-CP12; measured in docs/OSHODI_COMBAT_PILOT.md).
 * Ordinary enemies: a guard 3 punches, a thrower 2, one blast either; a heavy 5 punches (staggered by every third) or a
 * blast and two punches.
 */
export const OSHODI_COMBAT_PILOT: CombatPilotConfig = {
  id: 'oshodi.approach/combat-pilot-1',
  punch: {
    startupTicks: 5,
    hitRecoveryTicks: 24,
    whiffRecoveryTicks: 16,
    damage: 1,
    staggerTicks: 12,
    staggerImmunityTicks: 54,
    steadfastPoise: 3,
    diagonal: true,
  },
  counterSwingTicks: 2,
  enemyFramesTicks: 6,
  enemyHp: { agbero: 2, guard: 3, thrower: 2, heavy: 5 },
  blastDamageVsEnemy: 3,
  inputBufferTicks: 15,
  enemiesKeepOffHuman: true,
};

/**
 * What the pilot does to the enemies' own attacks (merged over `enemyAttacks` in the pilot mission only): longer,
 * readable wind-ups and cues, a real counter window after every swing and throw, a shorter hit-stun on the human, one
 * wind-up at a time from a group and a longer free window after any enemy hit (decisions CP6-CP8).
 */
export const OSHODI_PILOT_ENEMY_ATTACKS: PilotEnemyAttacks = {
  maxGroupPunches: 1,
  groupPunchGapTicks: 36,
  groupGapTicks: ticks(1.4),
  victimFreeTicks: 75,
  throwRecoveryTicks: { thrower: 48, heavy: 40 },
  projectiles: {
    bottle: { warnTicks: 42, dazeTicks: 20, cooldownTicks: ticks(3) },
    stone: { warnTicks: 42, cooldownTicks: ticks(3) },
    brick: { dazeTicks: 18 },
    tool: { dazeTicks: 24 },
  },
  melee: {
    agbero: { dazeTicks: 18, recoveryRootTicks: 36 },
    guard: { extraStartupTicks: 30, dazeTicks: 18, recoveryRootTicks: 36 },
    thrower: { recoveryRootTicks: 40 },
    heavy: { extraStartupTicks: 30, dazeTicks: 24, knockbackTiles: 1, recoveryRootTicks: 50 },
  },
};

/**
 * The pilot's Easy / Hard adjustments, on top of the ordinary level differences (health, recovery frames, the enemy
 * bot level Beginner / Casual / Standard). Normal adds nothing.
 */
export const OSHODI_PILOT_LEVELS: Readonly<Record<'easy' | 'hard', PilotLayer>> = {
  easy: {
    combatPilot: { punch: { staggerTicks: 20 }, counterSwingTicks: 12 },
    enemyAttacks: { victimFreeTicks: 90, melee: { guard: { recoveryRootTicks: 44 } } },
  },
  hard: {
    combatPilot: { enemyHp: { heavy: 6 }, punch: { staggerTicks: 10, staggerImmunityTicks: 60 } },
    enemyAttacks: {
      maxGroupPunches: 2,
      groupPunchGapTicks: 36,
      victimFreeTicks: 60,
      melee: { guard: { extraStartupTicks: 24, recoveryRootTicks: 28 } },
    },
  },
};

/**
 * The Tactical Trap pilot (decisions TT1-TT10; numbers and measurements in docs/TACTICAL_TRAP_PILOT.md). Slow numbers
 * for the base 10-tick step: 25 % -> +3 ticks (13 per tile, 23 % slower), 40 % -> +7 ticks (17 per tile, 41 % slower);
 * `slowExtraStepTicks` derives the integer for any other base step.
 */
export const TACTICAL_TRAP_PILOT: TacticalTrapConfig = {
  id: 'academy.tactics/trap-pilot-1',
  perception: {
    agbero: { visionTiles: 6, reactTicks: 30, memoryTicks: 150, hearingTiles: 4 },
    guard: { visionTiles: 7, reactTicks: 26, memoryTicks: 150, hearingTiles: 5 },
    thrower: { visionTiles: 8, reactTicks: 26, memoryTicks: 150, hearingTiles: 5 },
    heavy: { visionTiles: 6, reactTicks: 36, memoryTicks: 150, hearingTiles: 4 },
    lieutenant: { visionTiles: 9, reactTicks: 16, memoryTicks: 240, hearingTiles: 7 },
    boss: { visionTiles: 10, reactTicks: 10, memoryTicks: 240, hearingTiles: 8 },
  },
  memoryHoldFuseTicks: 120,
  caution: { ticks: 36, reactScale: 0.5, investigate: true },
  slow: { levels: [0.25, 0.4], durationTicks: 90, maxTotalTicks: 150, resistTicks: 120 },
  punchFloorShare: { agbero: 0, guard: 0, thrower: 0, heavy: 0, lieutenant: 0.5, boss: 0.5 },
  enemiesKeepOffHuman: true,
  attack: { activeTicks: 6, responseGapTicks: 36 },
};

/**
 * What the pilot does to the enemies' own attacks (merged over `enemyAttacks`, Academy scenarios only): the recovery
 * after a punch is 0.8 s (48 ticks) for every ordinary kind and a throw plants the thrower for its cue plus 0.8 s, so a
 * player who steps out of a swing always has a window to answer (decision TT4).
 */
export const TACTICAL_TRAP_ENEMY_ATTACKS: PilotEnemyAttacks = {
  throwRecoveryTicks: { thrower: 48, heavy: 40, lieutenant: 24, boss: 18 },
  melee: {
    agbero: { recoveryRootTicks: 48 },
    guard: { recoveryRootTicks: 48 },
    thrower: { recoveryRootTicks: 48 },
    heavy: { recoveryRootTicks: 48 },
    lieutenant: { recoveryRootTicks: 30 },
    boss: { recoveryRootTicks: 24 },
  },
};

/** The config layer an Academy tactics scenario passes to `createGame` (a fresh copy every call: never a shared constant). */
export function tacticalTrapLayer(): DeepPartial<GameConfig> {
  return structuredClone({
    tacticalTrap: TACTICAL_TRAP_PILOT,
    enemyAttacks: TACTICAL_TRAP_ENEMY_ATTACKS,
  }) as DeepPartial<GameConfig>;
}

// ------------------------------------------------------------------ the campaign tactics layer (decisions SA3-SA12)

const TACTICS_PERCEPTION_NORMAL: Record<EnemyKind, TrapPerception> = {
  agbero: { visionTiles: 6, reactTicks: 30, memoryTicks: 150, hearingTiles: 4 },
  guard: { visionTiles: 7, reactTicks: 26, memoryTicks: 150, hearingTiles: 5 },
  thrower: { visionTiles: 8, reactTicks: 24, memoryTicks: 150, hearingTiles: 5 },
  heavy: { visionTiles: 6, reactTicks: 36, memoryTicks: 150, hearingTiles: 4 },
  lieutenant: { visionTiles: 9, reactTicks: 16, memoryTicks: 240, hearingTiles: 7 },
  boss: { visionTiles: 10, reactTicks: 10, memoryTicks: 240, hearingTiles: 8 },
};

/** The same table with every kind shifted (Easy sees and hears less and reacts later; Hard the opposite). */
function shiftedPerception(d: {
  vision: number;
  react: number;
  memory: number;
  hearing: number;
}): Record<EnemyKind, TrapPerception> {
  const out = {} as Record<EnemyKind, TrapPerception>;
  for (const [kind, p] of Object.entries(TACTICS_PERCEPTION_NORMAL) as [EnemyKind, TrapPerception][]) {
    out[kind] = {
      visionTiles: Math.max(3, p.visionTiles + d.vision),
      reactTicks: Math.max(8, p.reactTicks + d.react),
      memoryTicks: Math.max(90, p.memoryTicks + d.memory),
      hearingTiles: Math.max(2, p.hearingTiles + d.hearing),
    };
  }
  return out;
}

/**
 * The campaign tactics layer at the NORMAL level (decisions SA3-SA12; every number and its measurement in
 * docs/CAMPAIGN_SECTOR_AI.md). Easy / Hard: `CAMPAIGN_TACTICS_LEVELS` below.
 */
export const CAMPAIGN_TACTICS: CampaignTacticsConfig = {
  id: 'campaign.tactics/1',
  level: 'normal',
  perception: TACTICS_PERCEPTION_NORMAL,
  memoryHoldFuseTicks: 120,
  caution: { ticks: 36, reactScale: 0.5, investigate: false },
  trapSense: {
    none: {
      reactScale: 1.25,
      brawlReactScale: 2,
      enemyBrawlReactScale: 2.4,
      plannerBump: 0,
      calmVisionTiles: 2,
      seesPlacement: false,
    },
    basic: {
      reactScale: 1,
      brawlReactScale: 1.5,
      enemyBrawlReactScale: 2,
      plannerBump: 0,
      calmVisionTiles: 3,
      seesPlacement: false,
    },
    keen: {
      reactScale: 0.8,
      brawlReactScale: 1,
      enemyBrawlReactScale: 1,
      plannerBump: 1,
      calmVisionTiles: 5,
      seesPlacement: true,
    },
    expert: {
      reactScale: 0.6,
      brawlReactScale: 1,
      enemyBrawlReactScale: 1,
      plannerBump: 2,
      calmVisionTiles: 99,
      seesPlacement: true,
    },
  },
  awareness: {
    noticeTiles: { agbero: 7, guard: 8, thrower: 9, heavy: 6, lieutenant: 10, boss: 10 },
    calmNoticeTiles: { agbero: 5, guard: 6, thrower: 7, heavy: 4, lieutenant: 8, boss: 8 },
    noticeTicks: 20,
    closeTiles: 2,
    alertTicks: 12,
    loseTicks: 120,
    searchTicks: 90,
    investigateStep: 3,
    blastHearingScale: 2,
    investigateTimeoutTicks: 360,
  },
  territory: {
    pursuitTiles: 8,
    leashSlack: 2,
    returnWatchTicks: 90,
    investigateRadius: 6,
    patrolPauseTicks: 42,
    patrolJitterTicks: 6,
    reversePatrol: false,
    alertAlliesScale: 1,
    coverTiles: 3,
    groupTactics: true,
    coverHoldTicks: 45,
    lookAroundTicks: 90,
    hitChaseTicks: 180,
    patrolStepExtraTicks: 2,
  },
  enemyStepTicks: { agbero: 12, guard: 12, thrower: 13, heavy: 14, lieutenant: 11, boss: 10 },
  enemyMinStepTicks: 11,
  chase: {
    breakOffGapTiles: 6,
    breakOffTicks: 60,
    maxChaseTicks: 600,
    reNoticeCooldownTicks: 90,
    returnTimeoutTicks: 480,
    patrolStuckTicks: 720,
  },
  punch: {
    damage: 1,
    lockoutTicks: 72,
    maxHitRecoveryTicks: 30,
    staggerTicks: 18,
    staggerImmunityTicks: 54,
    knockbackTiles: 1,
    slowShare: 0.25,
    slowTicks: 90,
    slowResistTicks: 120,
  },
  enemyHp: { agbero: 2, guard: 3, thrower: 2, heavy: 4, lieutenant: 8, boss: 14 },
  armoured: { agbero: false, guard: false, thrower: false, heavy: true, lieutenant: true, boss: true },
  punchFloorShare: { agbero: 0, guard: 0, thrower: 0, heavy: 0, lieutenant: 0.5, boss: 0.5 },
  blastVsArmoured: 3,
  enemyFramesTicks: 6,
  enemiesKeepOffHuman: true,
  attack: { activeTicks: 6, responseGapTicks: 36, throwSettleTicks: 12, whiffRecoveryExtraTicks: 12 },
};

/** One level's enemy commitment (decision SA7): wind-up = catalogue startup + extra, recovery, cooldown, group limits. */
function tacticsEnemyAttacks(o: {
  extra: Record<EnemyKind, number>;
  recovery: Record<EnemyKind, number>;
  cooldown: Record<EnemyKind, number>;
  throwRecovery: Record<EnemyKind, number>;
  warn: Record<ThrownKind, number>;
  throwCooldown: number;
  maxGroupPunches: number;
  groupPunchGapTicks: number;
  groupGapTicks: number;
  victimFreeTicks: number;
}): PilotEnemyAttacks {
  const melee = (kind: EnemyKind, daze: number, knockback: number): Partial<EnemyMeleeSpec> => ({
    extraStartupTicks: o.extra[kind],
    recoveryRootTicks: o.recovery[kind],
    cooldownTicks: o.cooldown[kind],
    dazeTicks: daze,
    knockbackTiles: knockback,
  });
  return {
    maxGroupPunches: o.maxGroupPunches,
    groupPunchGapTicks: o.groupPunchGapTicks,
    groupGapTicks: o.groupGapTicks,
    victimFreeTicks: o.victimFreeTicks,
    throwRecoveryTicks: o.throwRecovery,
    projectiles: {
      bottle: { warnTicks: o.warn.bottle, cooldownTicks: o.throwCooldown },
      stone: { warnTicks: o.warn.stone, cooldownTicks: o.throwCooldown },
      brick: { warnTicks: o.warn.brick },
      tool: { warnTicks: o.warn.tool },
    },
    melee: {
      agbero: melee('agbero', 20, 0),
      guard: melee('guard', 24, 0),
      thrower: melee('thrower', 0, 2),
      heavy: melee('heavy', 30, 1),
      lieutenant: melee('lieutenant', 24, 1),
      boss: melee('boss', 36, 1),
    },
  };
}

/**
 * Enemy commitment per level (decision SA7). Wind-ups (catalogue startup + extra; push 4, shove 12, daze 18 ticks):
 * ordinary punches 60 / 48 / 38 ticks (1.0 / 0.8 / 0.63 s), the heavy 66 / 54 / 44; recovery of an agbero or guard 72 / 60 / 48
 * (decision RC4: the window in which a generator laid at its feet cannot be walked away from; thrower 48 / 42 / 36, heavy
 * 54 / 48 / 42); every cooldown exceeds wind-up + recovery + `attack.responseGapTicks` (tested).
 */
export const CAMPAIGN_TACTICS_ENEMY_ATTACKS: Readonly<Record<'easy' | 'normal' | 'hard', PilotEnemyAttacks>> =
  {
    easy: tacticsEnemyAttacks({
      extra: { agbero: 56, guard: 56, thrower: 42, heavy: 48, lieutenant: 44, boss: 30 },
      recovery: { agbero: 72, guard: 72, thrower: 48, heavy: 54, lieutenant: 36, boss: 30 },
      cooldown: { agbero: 192, guard: 192, thrower: 210, heavy: 240, lieutenant: 168, boss: 180 },
      throwRecovery: { agbero: 0, guard: 0, thrower: 54, heavy: 48, lieutenant: 30, boss: 24 },
      warn: { bottle: 54, stone: 54, brick: 60, tool: 78 },
      throwCooldown: ticks(3.5),
      maxGroupPunches: 1,
      groupPunchGapTicks: 60,
      groupGapTicks: 90,
      victimFreeTicks: 90,
    }),
    normal: tacticsEnemyAttacks({
      extra: { agbero: 44, guard: 44, thrower: 32, heavy: 36, lieutenant: 36, boss: 22 },
      recovery: { agbero: 72, guard: 72, thrower: 42, heavy: 48, lieutenant: 30, boss: 24 },
      cooldown: { agbero: 180, guard: 180, thrower: 210, heavy: 228, lieutenant: 144, boss: 156 },
      throwRecovery: { agbero: 0, guard: 0, thrower: 42, heavy: 42, lieutenant: 24, boss: 18 },
      warn: { bottle: 42, stone: 42, brick: 48, tool: 66 },
      throwCooldown: ticks(3),
      maxGroupPunches: 2,
      groupPunchGapTicks: 48,
      groupGapTicks: 72,
      victimFreeTicks: 66,
    }),
    hard: tacticsEnemyAttacks({
      extra: { agbero: 34, guard: 34, thrower: 24, heavy: 32, lieutenant: 30, boss: 16 },
      recovery: { agbero: 56, guard: 56, thrower: 36, heavy: 42, lieutenant: 26, boss: 20 },
      cooldown: { agbero: 150, guard: 150, thrower: 180, heavy: 198, lieutenant: 120, boss: 132 },
      throwRecovery: { agbero: 0, guard: 0, thrower: 36, heavy: 36, lieutenant: 20, boss: 16 },
      warn: { bottle: 36, stone: 36, brick: 42, tool: 60 },
      throwCooldown: ticks(2.5),
      maxGroupPunches: 2,
      groupPunchGapTicks: 30,
      groupGapTicks: 54,
      victimFreeTicks: 66,
    }),
  };

/**
 * The Easy / Hard tactics (decision SA9): more strategic depth on Hard (sharper senses, longer pursuit, coordination,
 * cover, varied patrols, better trap sense through the planner level of `campaignEnemyLevel`), never information about
 * unseen generators; Easy is clockwork and forgiving. Merged over `CAMPAIGN_TACTICS` (`campaignTacticsFor`).
 */
export const CAMPAIGN_TACTICS_LEVELS: Readonly<
  Record<
    'easy' | 'hard',
    DeepPartial<CampaignTacticsConfig> & { perception: Record<EnemyKind, TrapPerception> }
  >
> = {
  easy: {
    level: 'easy',
    perception: shiftedPerception({ vision: -1, react: 12, memory: -30, hearing: -1 }),
    trapSense: {
      none: { calmVisionTiles: 2 },
      basic: { calmVisionTiles: 2 },
      keen: { calmVisionTiles: 4, seesPlacement: false },
    },
    awareness: {
      noticeTiles: { agbero: 6, guard: 7, thrower: 8, heavy: 5, lieutenant: 9, boss: 9 },
      calmNoticeTiles: { agbero: 4, guard: 5, thrower: 6, heavy: 3, lieutenant: 7, boss: 7 },
      noticeTicks: 36,
      alertTicks: 20,
      loseTicks: 60,
      searchTicks: 60,
    },
    territory: {
      pursuitTiles: 6,
      returnWatchTicks: 60,
      patrolPauseTicks: 48,
      patrolJitterTicks: 0,
      alertAlliesScale: 0,
      coverTiles: 0,
      groupTactics: false,
      lookAroundTicks: 120,
      hitChaseTicks: 120,
      patrolStepExtraTicks: 3,
    },
    enemyStepTicks: { agbero: 13, guard: 13, thrower: 14, heavy: 15, lieutenant: 12, boss: 10 },
    enemyMinStepTicks: 12,
    chase: {
      breakOffGapTiles: 5,
      breakOffTicks: 45,
      maxChaseTicks: 420,
      reNoticeCooldownTicks: 150,
      returnTimeoutTicks: 480,
    },
    punch: { lockoutTicks: 60, staggerTicks: 24, staggerImmunityTicks: 48 },
  },
  hard: {
    level: 'hard',
    perception: shiftedPerception({ vision: 1, react: -8, memory: 60, hearing: 1 }),
    trapSense: {
      none: { calmVisionTiles: 3, enemyBrawlReactScale: 2.4 },
      basic: {
        calmVisionTiles: 4,
        seesPlacement: true,
        watchesWhileBrawling: false,
        enemyBrawlReactScale: 2,
      },
      keen: { calmVisionTiles: 6 },
    },
    awareness: {
      noticeTiles: { agbero: 8, guard: 9, thrower: 10, heavy: 7, lieutenant: 11, boss: 11 },
      calmNoticeTiles: { agbero: 6, guard: 7, thrower: 8, heavy: 5, lieutenant: 9, boss: 9 },
      noticeTicks: 10,
      alertTicks: 8,
      loseTicks: 180,
      searchTicks: 120,
    },
    territory: {
      pursuitTiles: 11,
      returnWatchTicks: 120,
      patrolPauseTicks: 36,
      patrolJitterTicks: 12,
      alertAlliesScale: 1.25,
      coverTiles: 4,
      lookAroundTicks: 60,
      hitChaseTicks: 240,
      patrolStepExtraTicks: 1,
    },
    enemyStepTicks: { agbero: 12, guard: 12, thrower: 13, heavy: 14, lieutenant: 11, boss: 10 },
    enemyMinStepTicks: 11,
    chase: {
      breakOffGapTiles: 8,
      breakOffTicks: 75,
      maxChaseTicks: 900,
      reNoticeCooldownTicks: 60,
      returnTimeoutTicks: 480,
    },
    punch: { lockoutTicks: 84, staggerTicks: 14, staggerImmunityTicks: 60 },
  },
};

/** The full tactics config of a level (a fresh copy every call: never a shared constant). */
export function campaignTacticsFor(level: 'easy' | 'normal' | 'hard'): CampaignTacticsConfig {
  const base = structuredClone(CAMPAIGN_TACTICS) as unknown as Record<string, unknown>;
  if (level !== 'normal')
    deepAssign(base, structuredClone(CAMPAIGN_TACTICS_LEVELS[level]) as Record<string, unknown>);
  return base as unknown as CampaignTacticsConfig;
}

/**
 * THE CLASSIC RAID TACTICS (decisions RA1-RA6, docs/CLASSIC_RAID_AI.md): the field layer's level numbers
 * (`campaignTacticsFor`) with the raid's own pace, notice, pursuit and patrol numbers on top. A raid board is small
 * (13 x 9 to 17 x 13) and a maze of pillars, so the ranges are shorter than in the open field (a generator being laid is
 * heard only one to three tiles away, through walls: a loop of 8 tiles is never more than 4 away); every ordinary enemy is
 * slower than the human (10 ticks a tile) on every level, slower still on its calm patrol; Easy waits longer and
 * forgets sooner, Hard notices and decides faster, pursues further and coordinates, never sees through a wall.
 * The combat keys of the level stay in the object but a raid never reads them (`tacticsCombat`).
 */
/**
 * LIGHT-BASED DETECTION of a night raid (decisions NL10-NL13, docs/CLASSIC_LIGHTING.md "P1b"; `systems/nightSight.ts`).
 * A CALM torch carrier notices the fighter only on its own lit torch tiles (`raid/light.ts`, the cone the player sees),
 * after a reaction delay that grows with distance and restarts when the fighter leaves the cone; the fighter's own beam
 * seen by the guard lengthens that cone by `beamBonusTiles`; in the dark a calm guard notices only at contact. Engaged
 * guards (alert, pursuing, investigating) keep the raid AI's rules. Integer ticks; per level.
 */
export interface NightSightConfig {
  /** Reaction ticks at 1-2 tiles. */
  reactNearTicks: number;
  /** Reaction ticks at the torch's full reach (linear in between). */
  reactFarTicks: number;
  /** Extra torch-cone tiles when the guard sees a lit tile of the fighter's beam. */
  beamBonusTiles: number;
  /** In the dark a calm guard notices the fighter only within this Chebyshev distance (contact). */
  contactTiles: number;
}

export const NIGHT_SIGHT_LEVELS: Readonly<Record<'easy' | 'normal' | 'hard', NightSightConfig>> = {
  easy: { reactNearTicks: 20, reactFarTicks: 36, beamBonusTiles: 1, contactTiles: 1 },
  normal: { reactNearTicks: 15, reactFarTicks: 30, beamBonusTiles: 1, contactTiles: 1 },
  hard: { reactNearTicks: 12, reactFarTicks: 24, beamBonusTiles: 1, contactTiles: 1 },
};

const RAID_ROUTES: ClassicRaidTactics['routes'] = {
  // a lap longer than the 3 s fuse: the player can lay a generator round a corner while the walker is on the far side
  agbero: { style: 'loop', loopTiles: 12, maxLoopTiles: 16, runTiles: 7, keepsDistance: false },
  guard: { style: 'loop', loopTiles: 12, maxLoopTiles: 16, runTiles: 7, keepsDistance: false },
  thrower: { style: 'post', loopTiles: 0, maxLoopTiles: 0, runTiles: 1, keepsDistance: true },
  heavy: { style: 'beat', loopTiles: 0, maxLoopTiles: 0, runTiles: 3, keepsDistance: false },
  lieutenant: { style: 'loop', loopTiles: 16, maxLoopTiles: 20, runTiles: 7, keepsDistance: false },
  boss: { style: 'post', loopTiles: 0, maxLoopTiles: 0, runTiles: 1, keepsDistance: false },
};

export const RAID_TACTICS_LEVELS: Readonly<
  Record<'easy' | 'normal' | 'hard', DeepPartial<CampaignTacticsConfig>>
> = {
  easy: {
    id: 'raid.tactics/1',
    // the raid lieutenant (expert trap sense) plans like its level's bot, a little quicker to react: the crew's
    // bruiser, not a second boss (decision RA6)
    // decision CR5: a calm walker sees a generator on its way only from 1 tile and takes it in slowly
    trapSense: {
      none: { enemyBrawlReactScale: 4.5, calmVisionTiles: 1, reactScale: 1.6 },
      basic: { enemyBrawlReactScale: 4, calmVisionTiles: 1, reactScale: 1.5 },
      expert: { plannerBump: 0, reactScale: 0.8 },
    },
    perception: {
      agbero: { hearingTiles: 1 },
      guard: { hearingTiles: 1 },
      thrower: { hearingTiles: 1 },
      heavy: { hearingTiles: 1 },
      lieutenant: { hearingTiles: 2 },
      boss: { hearingTiles: 3 },
    },
    awareness: {
      noticeTiles: { agbero: 4, guard: 4, thrower: 5, heavy: 4, lieutenant: 6, boss: 7 },
      calmNoticeTiles: { agbero: 3, guard: 3, thrower: 4, heavy: 3, lieutenant: 4, boss: 5 },
      noticeTicks: 45,
      alertTicks: 30,
      loseTicks: 45,
      searchTicks: 60,
      investigateTimeoutTicks: 180,
    },
    territory: {
      pursuitTiles: 3,
      returnWatchTicks: 60,
      investigateRadius: 3,
      patrolPauseTicks: 48,
      patrolJitterTicks: 0,
      reversePatrol: false,
      alertAlliesScale: 0,
      coverTiles: 0,
      groupTactics: false,
      lookAroundTicks: 120,
      hitChaseTicks: 120,
      patrolStepExtraTicks: 3,
    },
    enemyStepTicks: { agbero: 15, guard: 15, thrower: 17, heavy: 18, lieutenant: 14, boss: 13 },
    enemyMinStepTicks: 13,
    chase: {
      breakOffGapTiles: 3,
      breakOffTicks: 30,
      maxChaseTicks: 240,
      reNoticeCooldownTicks: 300,
      returnTimeoutTicks: 360,
      patrolStuckTicks: 300,
    },
  },
  normal: {
    id: 'raid.tactics/1',
    // the raid lieutenant (expert trap sense) plans like its level's bot, a little quicker to react: the crew's
    // bruiser, not a second boss (decision RA6)
    // decision CR5: a calm walker sees a generator on its way from 2 tiles and takes it in a little slowly
    trapSense: {
      none: { enemyBrawlReactScale: 4, calmVisionTiles: 2, reactScale: 1.3 },
      basic: { enemyBrawlReactScale: 3.5, calmVisionTiles: 2, reactScale: 1.2 },
      expert: { plannerBump: 0, reactScale: 0.8 },
    },
    perception: {
      agbero: { hearingTiles: 2 },
      guard: { hearingTiles: 2 },
      thrower: { hearingTiles: 2 },
      heavy: { hearingTiles: 2 },
      lieutenant: { hearingTiles: 3 },
      boss: { hearingTiles: 4 },
    },
    awareness: {
      noticeTiles: { agbero: 5, guard: 5, thrower: 6, heavy: 4, lieutenant: 7, boss: 8 },
      calmNoticeTiles: { agbero: 4, guard: 4, thrower: 5, heavy: 3, lieutenant: 5, boss: 6 },
      noticeTicks: 30,
      alertTicks: 20,
      loseTicks: 60,
      searchTicks: 60,
      investigateTimeoutTicks: 240,
    },
    territory: {
      pursuitTiles: 4,
      returnWatchTicks: 60,
      investigateRadius: 3,
      patrolPauseTicks: 36,
      patrolJitterTicks: 0,
      reversePatrol: false,
      alertAlliesScale: 1,
      coverTiles: 0,
      groupTactics: true,
      lookAroundTicks: 90,
      hitChaseTicks: 150,
      patrolStepExtraTicks: 3,
    },
    enemyStepTicks: { agbero: 13, guard: 13, thrower: 15, heavy: 16, lieutenant: 12, boss: 11 },
    enemyMinStepTicks: 12,
    chase: {
      breakOffGapTiles: 4,
      breakOffTicks: 45,
      maxChaseTicks: 360,
      reNoticeCooldownTicks: 180,
      returnTimeoutTicks: 360,
      patrolStuckTicks: 300,
    },
  },
  hard: {
    id: 'raid.tactics/1',
    // a raid board is a small maze: a calm Hard walker looks as far ahead as a Normal one, it just reacts faster; the
    // lieutenant plans one bot level above the level's (decision RA6)
    trapSense: {
      none: { enemyBrawlReactScale: 3 },
      basic: { calmVisionTiles: 3, enemyBrawlReactScale: 2.5 },
      expert: { plannerBump: 1, reactScale: 0.8 },
    },
    perception: {
      agbero: { hearingTiles: 3, reactTicks: 26 },
      guard: { hearingTiles: 3, reactTicks: 22 },
      thrower: { hearingTiles: 3, reactTicks: 22 },
      heavy: { hearingTiles: 3, reactTicks: 30 },
      lieutenant: { hearingTiles: 4 },
      boss: { hearingTiles: 5 },
    },
    awareness: {
      noticeTiles: { agbero: 6, guard: 6, thrower: 7, heavy: 5, lieutenant: 8, boss: 9 },
      calmNoticeTiles: { agbero: 5, guard: 5, thrower: 6, heavy: 4, lieutenant: 6, boss: 7 },
      noticeTicks: 15,
      alertTicks: 12,
      loseTicks: 120,
      searchTicks: 90,
      investigateTimeoutTicks: 240,
    },
    territory: {
      pursuitTiles: 6,
      returnWatchTicks: 90,
      investigateRadius: 4,
      patrolPauseTicks: 24,
      patrolJitterTicks: 0,
      reversePatrol: false,
      alertAlliesScale: 1.25,
      coverTiles: 2,
      groupTactics: true,
      lookAroundTicks: 60,
      hitChaseTicks: 210,
      patrolStepExtraTicks: 1,
    },
    enemyStepTicks: { agbero: 12, guard: 12, thrower: 13, heavy: 14, lieutenant: 11, boss: 10 },
    enemyMinStepTicks: 11,
    chase: {
      breakOffGapTiles: 5,
      breakOffTicks: 60,
      maxChaseTicks: 540,
      reNoticeCooldownTicks: 120,
      returnTimeoutTicks: 360,
      patrolStuckTicks: 300,
    },
  },
};

/**
 * Decision RA6, amended by CR2: how long a called-in wave hunts the player with no leash, by level. Easy: a called wave
 * wakes calm on its route (0); every hunt is also bound by the chaser cap.
 */
const RAID_CALLED_CHASE_TICKS = { easy: 0, normal: 240, hard: 480 } as const;

/** Decision CR2: ordinary enemies hunting the player at once in a Classic raid, by level. */
const RAID_MAX_CHASERS = { easy: 1, normal: 2, hard: 3 } as const;

/**
 * Decision CR4: the enemy punches of a Classic raid, by level. A wind-up (catalogue startup + extra) the player can
 * read and step out of: an agbero / guard 60 / 54 (Easy), 50 / 44 (Normal), 40 / 34 ticks (Hard); a reaction of
 * 0.25 s plus half a step (6 ticks) is 21 ticks. The strike is committed to its telegraphed tile; one wind-up at a time
 * (two on Hard) with a gap between a group's punches; after a hit, `victimFreeTicks` of no enemy hit.
 */
export const RAID_ENEMY_ATTACKS: Readonly<
  Record<'easy' | 'normal' | 'hard', DeepPartial<GameConfig['enemyAttacks']>>
> = {
  easy: {
    committedMelee: true,
    maxGroupPunches: 1,
    groupPunchGapTicks: 90,
    victimFreeTicks: 150,
    melee: {
      agbero: { extraStartupTicks: 56 },
      guard: { extraStartupTicks: 50 },
      thrower: { extraStartupTicks: 42 },
      heavy: { extraStartupTicks: 48 },
      lieutenant: { extraStartupTicks: 44 },
      boss: { extraStartupTicks: 30 },
    } as DeepPartial<GameConfig['enemyAttacks']>['melee'],
  },
  normal: {
    committedMelee: true,
    maxGroupPunches: 1,
    groupPunchGapTicks: 60,
    victimFreeTicks: 120,
    melee: {
      agbero: { extraStartupTicks: 46 },
      guard: { extraStartupTicks: 40 },
      thrower: { extraStartupTicks: 34 },
      heavy: { extraStartupTicks: 38 },
      lieutenant: { extraStartupTicks: 36 },
      boss: { extraStartupTicks: 22 },
    } as DeepPartial<GameConfig['enemyAttacks']>['melee'],
  },
  hard: {
    committedMelee: true,
    maxGroupPunches: 2,
    groupPunchGapTicks: 40,
    victimFreeTicks: 90,
    melee: {
      agbero: { extraStartupTicks: 36 },
      guard: { extraStartupTicks: 30 },
      thrower: { extraStartupTicks: 24 },
      heavy: { extraStartupTicks: 28 },
      lieutenant: { extraStartupTicks: 28 },
      boss: { extraStartupTicks: 14 },
    } as DeepPartial<GameConfig['enemyAttacks']>['melee'],
  },
};

/** The full tactics config of a Classic raid at a level (decision RA1; a fresh copy every call). */
export function raidTacticsFor(level: 'easy' | 'normal' | 'hard'): CampaignTacticsConfig {
  const base = campaignTacticsFor(level) as unknown as Record<string, unknown>;
  deepAssign(base, structuredClone(RAID_TACTICS_LEVELS[level]) as Record<string, unknown>);
  const t = base as unknown as CampaignTacticsConfig;
  t.classicRaid = {
    routes: structuredClone(RAID_ROUTES),
    entranceClearTiles: 3,
    avoidBelts: true,
    calledChaseTicks: RAID_CALLED_CHASE_TICKS[level],
    maxChasers: RAID_MAX_CHASERS[level],
    blastDefeats: ['agbero', 'guard', 'thrower'],
    blastVsTough: 2,
  };
  return t;
}

/**
 * The tactics layer's COMBAT model (enemy health, the tactics hit, armour, enemy recovery frames, keep-off-human,
 * same-tile reach, recovery bonuses): the layer when present and not a Classic raid's (decision RA1), else undefined.
 */
export const tacticsCombat = (
  config: Pick<GameConfig, 'campaignTactics'>,
): CampaignTacticsConfig | undefined => {
  const t = config.campaignTactics;
  return t && !t.classicRaid ? t : undefined;
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

/** Two override layers as one (`b` over `a`; arrays replaced). Either may be absent. */
export function mergeLayers<T extends object>(
  a: DeepPartial<T> | undefined,
  b: DeepPartial<T> | undefined,
): DeepPartial<T> | undefined {
  if (!a) return b;
  if (!b) return a;
  const out = structuredClone(a) as Record<string, unknown>;
  deepAssign(out, b as Record<string, unknown>);
  return out as DeepPartial<T>;
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
