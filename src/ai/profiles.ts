/**
 * The seven bot levels (V2). Difficulty changes decision cadence, reaction delay, how far ahead hazards
 * are understood, how carefully plans are verified, how much the bot wants to hunt and trap, which
 * specials it uses and how often it makes a human-like mistake - never movement speed, stats or knowledge
 * of hidden information: every level sees exactly the same Observation and obeys the same rules.
 *
 * The ladder (docs/DECISIONS.md WB1-WB4):
 * - rookie:    a first match. Slow, hesitant, wanders, barely hunts, never traps, uses no specials, and never
 *              places a generator that would leave a nearby player with no way out (`mercy`).
 * - beginner:  the pre-V2 Easy bot (saved "easy" migrates here), with the same mercy rule.
 * - casual:    plans properly but late: sees other players' hazards only ~1.5 s ahead, ignores chain
 *              reactions, no traps; melee and vehicles some of the time.
 * - standard:  the pre-V2 Medium bot (saved "medium" migrates here) with slower reactions and re-plans and
 *              a keener hunt: sensible escapes, upgrades, basic traps, purposeful vehicles; it presses you
 *              but reacts late to what you do.
 * - skilled:   the full pre-V2 Medium bot, thinking faster and erring less.
 * - expert:    the pre-V2 Hard bot made patient: sealing-proof escapes, trap analysis, strategic vehicles,
 *              fast reactions, and it waits for the right moment instead of chasing.
 * - nightmare: Expert at its limit: re-plans every couple of ticks, deeper rival analysis, no deliberate
 *              mistakes. Still the same rules and the same Observation - formidable, never cheating.
 */
import type { Difficulty } from '../sim';

export type TrapLevel = 'none' | 'escape' | 'shrink';
/**
 * The behaviour family a level builds on: it selects code paths in remote.ts, goals.ts, danger.ts and the
 * large-board limits in scale.ts. Per-level numbers below do the fine-grained differentiation.
 */
export type AiTier = 'easy' | 'medium' | 'hard';
export type VehicleStyle = 'naive' | 'purposeful' | 'strategic';

export interface AiProfile {
  difficulty: Difficulty;
  tier: AiTier;

  // ---- cadence ----
  /** Ticks between full re-plans (a random value in [min, max] each time). */
  thinkMin: number;
  thinkMax: number;
  /** Delay before a freshly noticed world change (new generator, flame, vehicle) triggers a re-plan. */
  reaction: number;

  // ---- awareness ----
  /** Hazards of OTHER players starting later than this many ticks ahead are not avoided (own are always known). */
  lookahead: number;
  /** Same, for vehicle lanes (counted from the tick the vehicle reaches the tile). */
  vehicleLookahead: number;
  /** Chain reactions between generators are part of the danger map. */
  chains: boolean;
  /** Extra ticks of safety added around every hazard window. */
  margin: number;
  /** Reflex: a step into a tile hit within this many ticks is vetoed every tick. */
  guardTicks: number;
  /** Planning horizon in ticks for the time-expanded search. */
  horizonTicks: number;
  /** Treat floor hazards (pothole / oil) as walls when planning. */
  avoidFloorHazards: boolean;

  // ---- generator placement ----
  /** Probability that a full escape check is done before placing (1 = always). */
  placeVerify: number;
  /** Minimum gain needed to place a generator. */
  placeMinGain: number;
  softValue: number;
  rivalValue: number;
  /** Cost per floor pickup that the blast would burn. */
  pickupLoss: number;
  /** Refuge tiles need at least this many walkable neighbours (avoid dead ends). */
  refugeMinExits: number;
  /** Placements must also survive a nearby rival sealing the escape route with a generator. */
  robustEscape: boolean;
  /** Cost per slot (step) of travel when comparing goals. */
  slotCost: number;
  /** Cost per slot of walking when there is no objective (kept small so hunting always wins). */
  moveCost: number;
  /** Random wobble added to idle goals: high = aimless wandering. */
  wander: number;
  /** How hard the bot pushes towards rivals when it has nothing better to do. */
  huntWeight: number;
  /** Probability of choosing the second-best goal (human-like imperfection). */
  mistake: number;
  /**
   * Never place a generator that would leave a nearby rival with no way out, assuming that rival reacts
   * `mercyDelay` ticks late (the beginner-friendly levels). Judged on the same Observation, with full
   * hazard awareness, so the check itself is never the weak point.
   */
  mercy: boolean;
  mercyDelay: number;
  /** Probability per re-plan of pausing, when standing somewhere safe, for up to `hesitateTicks`. */
  hesitate: number;
  hesitateTicks: number;

  // ---- items ----
  /** Probability that a visible pickup is considered at all when choosing a goal. */
  pickupInterest: number;
  /** Pickups further than this many steps are ignored. */
  pickupMaxSlots: number;
  /** Picks up curses only if this is true. */
  takeCurses: boolean;

  // ---- tactics / specials ----
  trap: TrapLevel;
  vehicle: VehicleStyle;
  /** Probability that a vehicle launch the tactics layer wants is actually made (0 = never uses the voucher). */
  vehicleUse: number;
  /** Uses Push / Daze / Shove (melee) when an opportunity arises. */
  useSkill: boolean;
  /** Probability that a melee opportunity is taken (with `useSkill`). */
  meleeUse: number;
  /** Kick / punch / carry / kill switch decisions. */
  useGeneratorTools: boolean;
  /** Remote detonation is timed against rivals (otherwise on a simple delay). */
  smartRemote: boolean;
  /** Upper bound on expensive rival simulations per think. */
  maxRivalSims: number;
  /**
   * Team modes (read by the team logic in ai/world.ts / ai/context.ts): 0 = plays for itself, 1 = covers
   * teammates fully (avoids blasting them, converges on a teammate's target, keeps lanes open for them).
   */
  teamwork: number;
  /** Once eliminated in a standard match, throws generators in from the sideline (ai/sideline.ts). */
  sideline: boolean;
}

type Base = Omit<AiProfile, 'difficulty' | 'tier'>;

/** The pre-V2 Easy bot. */
const EASY: Base = {
  thinkMin: 20,
  thinkMax: 30,
  reaction: 24,
  lookahead: 45,
  vehicleLookahead: 40,
  chains: false,
  margin: 0,
  guardTicks: 24,
  horizonTicks: 200,
  avoidFloorHazards: true,
  placeVerify: 0.5,
  placeMinGain: 2,
  softValue: 3,
  rivalValue: 8,
  pickupLoss: 0,
  refugeMinExits: 0,
  robustEscape: false,
  slotCost: 0.3,
  moveCost: 0.1,
  wander: 2.5,
  huntWeight: 0.12,
  mistake: 0.25,
  mercy: false,
  mercyDelay: 0,
  hesitate: 0,
  hesitateTicks: 0,
  pickupInterest: 0.25,
  pickupMaxSlots: 4,
  takeCurses: false,
  trap: 'none',
  vehicle: 'naive',
  vehicleUse: 1,
  useSkill: false,
  meleeUse: 0,
  useGeneratorTools: false,
  smartRemote: false,
  maxRivalSims: 0,
  teamwork: 0.3,
  sideline: false,
};

/** The pre-V2 Medium bot. */
const MEDIUM: Base = {
  thinkMin: 14,
  thinkMax: 22,
  reaction: 20,
  lookahead: 100000,
  vehicleLookahead: 100000,
  chains: true,
  margin: 1,
  guardTicks: 60,
  horizonTicks: 260,
  avoidFloorHazards: true,
  placeVerify: 1,
  placeMinGain: 3,
  softValue: 3,
  rivalValue: 10,
  pickupLoss: 2,
  refugeMinExits: 1,
  robustEscape: false,
  slotCost: 0.35,
  moveCost: 0.05,
  wander: 0.3,
  huntWeight: 0.2,
  mistake: 0.15,
  mercy: false,
  mercyDelay: 0,
  hesitate: 0,
  hesitateTicks: 0,
  pickupInterest: 1,
  pickupMaxSlots: 12,
  takeCurses: false,
  trap: 'escape',
  vehicle: 'purposeful',
  vehicleUse: 1,
  useSkill: true,
  meleeUse: 1,
  useGeneratorTools: true,
  smartRemote: true,
  maxRivalSims: 2,
  teamwork: 0.6,
  sideline: true,
};

/** The pre-V2 Hard bot. */
const HARD: Base = {
  thinkMin: 3,
  thinkMax: 4,
  reaction: 4,
  lookahead: 100000,
  vehicleLookahead: 100000,
  chains: true,
  margin: 2,
  guardTicks: 90,
  horizonTicks: 300,
  avoidFloorHazards: true,
  placeVerify: 1,
  placeMinGain: 3,
  softValue: 3,
  rivalValue: 12,
  pickupLoss: 3,
  refugeMinExits: 2,
  robustEscape: true,
  slotCost: 0.4,
  moveCost: 0.05,
  wander: 0.1,
  huntWeight: 0.25,
  mistake: 0.02,
  mercy: false,
  mercyDelay: 0,
  hesitate: 0,
  hesitateTicks: 0,
  pickupInterest: 1,
  pickupMaxSlots: 14,
  takeCurses: false,
  trap: 'shrink',
  vehicle: 'strategic',
  vehicleUse: 1,
  useSkill: true,
  meleeUse: 1,
  useGeneratorTools: true,
  smartRemote: true,
  maxRivalSims: 8,
  teamwork: 0.9,
  sideline: true,
};

const level = (difficulty: Difficulty, tier: AiTier, base: Base, tweak: Partial<Base>): AiProfile => ({
  ...base,
  ...tweak,
  difficulty,
  tier,
});

export const PROFILES: Readonly<Record<Difficulty, AiProfile>> = {
  rookie: level('rookie', 'easy', EASY, {
    thinkMin: 30,
    thinkMax: 45,
    reaction: 36,
    lookahead: 40,
    vehicleLookahead: 40,
    placeVerify: 0.7,
    placeMinGain: 3,
    rivalValue: 1,
    wander: 3,
    huntWeight: 0.02,
    mistake: 0.3,
    mercy: true,
    mercyDelay: 30,
    hesitate: 0.3,
    hesitateTicks: 90,
    pickupInterest: 0.2,
    vehicleUse: 0,
    teamwork: 0.1,
  }),
  beginner: level('beginner', 'easy', EASY, {
    mercy: true,
    mercyDelay: 18,
    vehicleUse: 0.4,
  }),
  casual: level('casual', 'medium', MEDIUM, {
    thinkMin: 18,
    thinkMax: 26,
    reaction: 22,
    lookahead: 90,
    vehicleLookahead: 90,
    chains: false,
    margin: 0,
    guardTicks: 40,
    horizonTicks: 240,
    placeVerify: 0.85,
    rivalValue: 8,
    pickupLoss: 0,
    refugeMinExits: 0,
    wander: 1,
    huntWeight: 0.12,
    mistake: 0.2,
    hesitate: 0.05,
    hesitateTicks: 30,
    pickupInterest: 0.6,
    pickupMaxSlots: 8,
    trap: 'none',
    vehicle: 'naive',
    vehicleUse: 0.7,
    meleeUse: 0.5,
    useGeneratorTools: false,
    smartRemote: false,
    maxRivalSims: 0,
    teamwork: 0.4,
  }),
  standard: level('standard', 'medium', MEDIUM, {
    thinkMin: 20,
    thinkMax: 28,
    reaction: 28,
    huntWeight: 0.25,
    maxRivalSims: 1,
  }),
  skilled: level('skilled', 'medium', MEDIUM, {
    thinkMin: 10,
    thinkMax: 16,
    reaction: 12,
    mistake: 0.08,
    maxRivalSims: 4,
    teamwork: 0.75,
  }),
  expert: level('expert', 'hard', HARD, {
    margin: 1,
    refugeMinExits: 1,
    placeMinGain: 2,
    huntWeight: 0.15,
    rivalValue: 8,
  }),
  nightmare: level('nightmare', 'hard', HARD, {
    thinkMin: 2,
    thinkMax: 2,
    reaction: 1,
    margin: 1,
    refugeMinExits: 1,
    placeMinGain: 2,
    huntWeight: 0.15,
    rivalValue: 7,
    mistake: 0,
    maxRivalSims: 12,
    horizonTicks: 330,
    teamwork: 1,
  }),
};

const radialProfiles = new WeakMap<AiProfile, AiProfile>();

/**
 * City Rumble's radial blast (decision RE-AI8): every level sees chain reactions and checks its way out before
 * putting a generator down. With two generators each and discs instead of lanes, chain blindness and unchecked
 * placements stop being a difficulty knob and become self-destruction (the low levels' own second generator
 * set their first off under them). Every other handicap (cadence, reactions, lookahead, mistakes, hesitation,
 * hunting, specials) is kept. Classic never uses this.
 */
export function radialProfile(p: AiProfile): AiProfile {
  let r = radialProfiles.get(p);
  if (!r) {
    r = p.chains && p.placeVerify >= 1 ? p : { ...p, chains: true, placeVerify: 1 };
    radialProfiles.set(p, r);
  }
  return r;
}
