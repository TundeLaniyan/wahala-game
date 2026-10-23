/**
 * Per-difficulty parameters. Difficulty changes decision cadence, reaction delay, how far ahead
 * hazards are understood and how carefully plans are verified - never movement speed, stats or
 * knowledge of hidden information (every level only sees the Observation).
 */
import type { Difficulty } from '../sim';

export type TrapLevel = 'none' | 'escape' | 'shrink';
export type VehicleStyle = 'naive' | 'purposeful' | 'strategic';

export interface AiProfile {
  difficulty: Difficulty;

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

  // ---- items ----
  /** Probability that a visible pickup is considered at all when choosing a goal. */
  pickupInterest: number;
  /** Pickups further than this many steps are ignored. */
  pickupMaxSlots: number;
  /** Picks up curses only if this is true. */
  takeCurses: boolean;

  // ---- tactics ----
  trap: TrapLevel;
  vehicle: VehicleStyle;
  /** Uses Push / Daze / Shove when an opportunity arises. */
  useSkill: boolean;
  /** Kick / punch / carry / kill switch decisions. */
  useGeneratorTools: boolean;
  /** Remote detonation is timed against rivals (otherwise on a simple delay). */
  smartRemote: boolean;
  /** Upper bound on expensive rival simulations per think. */
  maxRivalSims: number;
}

export const PROFILES: Readonly<Record<Difficulty, AiProfile>> = {
  easy: {
    difficulty: 'easy',
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
    pickupInterest: 0.25,
    pickupMaxSlots: 4,
    takeCurses: false,
    trap: 'none',
    vehicle: 'naive',
    useSkill: false,
    useGeneratorTools: false,
    smartRemote: false,
    maxRivalSims: 0,
  },
  medium: {
    difficulty: 'medium',
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
    pickupInterest: 1,
    pickupMaxSlots: 12,
    takeCurses: false,
    trap: 'escape',
    vehicle: 'purposeful',
    useSkill: true,
    useGeneratorTools: true,
    smartRemote: true,
    maxRivalSims: 2,
  },
  hard: {
    difficulty: 'hard',
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
    pickupInterest: 1,
    pickupMaxSlots: 14,
    takeCurses: false,
    trap: 'shrink',
    vehicle: 'strategic',
    useSkill: true,
    useGeneratorTools: true,
    smartRemote: true,
    maxRivalSims: 8,
  },
};
