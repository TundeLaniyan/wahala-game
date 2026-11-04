/**
 * The close-attack catalogue (decisions CB1, FC2-FC4). Numbers live in `config.skills.attacks` (`AttackSpec`: range,
 * speed, control value, displacement, daze, recovery, cooldown, vulnerability); this file names each attack, says
 * what it is for and lists the art, animation and audio it still needs. Pure data, no rules.
 *
 * EVERY attack is non-lethal: the "damage" of the catalogue is CONTROL (a daze, a slow, a displacement), measured in
 * seconds the victim loses (`controlValueSeconds`). A rival only dies when control puts them in a flame, a vehicle's
 * path or the closing city (that is what the attacks are for).
 */
import type { AttackSpec, GameConfig } from '../config';
import { TICK_RATE } from '../config';
import type { AttackKind } from '../types';

export interface AttackDef {
  kind: AttackKind;
  /** Player-facing name. */
  name: string;
  /** The word on the second action button (upper case, short enough for its round face). */
  label: string;
  /** One sentence for the fighter screen / tutorial. */
  summary: string;
  /** What it is good at and what it costs, in the balance doc's words. */
  role: string;
  /** `original` = one of the three deployed attacks; `catalogue` = added by decisions FC2-FC4. */
  origin: 'original' | 'catalogue';
  /** What art, animation and audio the attack still needs (docs/FIGHTERS_AND_ATTACKS.md section 6). */
  needs: { animation: string; effect: string; audio: string };
}

export const ATTACK_DEFS: Readonly<Record<AttackKind, AttackDef>> = {
  push: {
    kind: 'push',
    name: 'Punch',
    label: 'PUNCH',
    summary: 'A very fast jab: a brief daze.',
    role: 'Fastest startup and the shortest recoveries; beats every slower wind-up, but its daze is brief and a 3 s lockout stops it repeating.',
    origin: 'original',
    needs: {
      animation: 'exists (Push clip)',
      effect: 'exists (hit spark)',
      audio: 'exists (synthesised)',
    },
  },
  shove: {
    kind: 'shove',
    name: 'Shove',
    label: 'SHOVE',
    summary: 'Pushes a rival two tiles.',
    role: 'The positional attack: moves a rival two tiles onto a lane that is about to burn. A blocked or missed shove leaves the attacker exposed (long whiff recovery).',
    origin: 'original',
    needs: {
      animation: 'exists (Push clip)',
      effect: 'exists (push dust)',
      audio: 'exists (synthesised)',
    },
  },
  daze: {
    kind: 'daze',
    name: 'Daze Punch',
    label: 'DAZE',
    summary: 'A slow, heavy punch: a full second of daze.',
    role: 'Holds a rival inside a lane that is about to burn; slow telegraph, 4 s hit recovery, a fast jab cuts its wind-up short.',
    origin: 'original',
    needs: {
      animation: 'exists (the Kick clip is reused as the heavy punch)',
      effect: 'exists (stars)',
      audio: 'exists (synthesised)',
    },
  },
  kick: {
    kind: 'kick',
    name: 'Kick',
    label: 'KICK',
    summary: 'Reaches two tiles in a line and shoves a rival one tile.',
    role: 'The only reach-2 attack: opens a fight from outside the jab range. Slow, planted wind-up (cannot step) and the longest whiff recovery.',
    origin: 'catalogue',
    needs: {
      animation:
        'NEW: a planted high-kick clip (wind-up 20 ticks, extension, recover); today the Kick clip plays',
      effect: 'NEW: a short dust line along the two tiles; the push dust is reused for the hit',
      audio: 'NEW cue: a whoosh at the start and a thud on contact (synthesised from the existing bank)',
    },
  },
  bottle: {
    kind: 'bottle',
    name: 'Bottle Strike',
    label: 'BOTTLE',
    summary: 'The longest daze there is, once every ten seconds.',
    role: 'The risky finisher: 2.3 s of daze, a 10 s cooldown, a planted wind-up, and a miss leaves the attacker stuck for a second. Beaten by any faster hit.',
    origin: 'catalogue',
    needs: {
      animation: 'NEW: a bottle-grab and overhead-swing clip; a held-prop socket on the hand',
      effect: 'NEW: glass shards on contact (the crowd bottle mesh is reused as the prop)',
      audio: 'reuse bottle_smash; a NEW scuff cue for a miss would help',
    },
  },
  sweep: {
    kind: 'sweep',
    name: 'Leg Sweep',
    label: 'SWEEP',
    summary: 'No daze: the rival limps for three seconds.',
    role: 'A control attack for the chase: slows walking by 60% for 3 s, adjacent only, quick recoveries; the rival can still fight back (and a faster hit cancels the sweep).',
    origin: 'catalogue',
    needs: {
      animation: 'NEW: a low spinning leg sweep; a limp walk cycle for the slowed victim',
      effect: 'NEW: a dust ring at the feet; a small limp icon over the victim',
      audio: 'NEW cue: a scuff and a grunt (synthesised)',
    },
  },
  headbutt: {
    kind: 'headbutt',
    name: 'Headbutt',
    label: 'HEADBUTT',
    summary: 'Fast, a 0.75 s daze, but you reel too.',
    role: 'A quick medium daze that costs the attacker a half-second recoil after a hit, so it cannot be chained into a retreat; adjacent only.',
    origin: 'catalogue',
    needs: {
      animation: 'NEW: a lunge-and-recoil clip (the attacker staggers 30 ticks after a hit)',
      effect: 'reuse the stars on the victim; NEW small stars on the attacker',
      audio: 'NEW cue: a dull knock (synthesised)',
    },
  },
  elbow: {
    kind: 'elbow',
    name: 'Elbow Check',
    label: 'ELBOW',
    summary: 'A quick bump that punishes a rival who is planted or reeling.',
    role: 'The counter: a short daze and a one-tile bump, with a long extra daze when the victim is planted or reeling (a Kick or Bottle Strike wind-up, a miss, a Headbutt recoil). Does little to a rival who is moving freely.',
    origin: 'catalogue',
    needs: {
      animation: 'NEW: a short elbow clip',
      effect: 'reuse the push dust',
      audio: 'reuse the Push cue',
    },
  },
};

export const ATTACK_KINDS = Object.keys(ATTACK_DEFS) as AttackKind[];

/**
 * Ticks of control the effect takes from a victim: the daze, the time a displacement keeps them stepping, and the
 * walking time a slow costs them. (A counter daze is not counted: it needs a rival who is winding up.)
 */
export function controlValueTicks(spec: AttackSpec, config: Pick<GameConfig, 'movement'>): number {
  const base = config.movement.stepTicksBySpeedLevel[0]!;
  // a displaced fighter loses the push itself and the walk back into the fight
  const push = spec.displacementTiles * (config.movement.pushStepTicks + base);
  const slowLoss = spec.slowTicks * (spec.slowExtraStepTicks / (base + spec.slowExtraStepTicks));
  return Math.round(spec.dazeTicks + push + slowLoss);
}

export const controlValueSeconds = (spec: AttackSpec, config: Pick<GameConfig, 'movement'>): number =>
  controlValueTicks(spec, config) / TICK_RATE;

/** The axes on which an attack can be better (higher = better): used to show that no attack dominates another. */
export const ATTACK_AXES: readonly (readonly [string, (a: AttackSpec) => number])[] = [
  ['startup', (a) => -a.startupTicks],
  ['whiff recovery', (a) => -a.whiffRecoveryTicks],
  ['hit recovery', (a) => -a.hitRecoveryTicks],
  ['cooldown', (a) => -Math.max(a.cooldownTicks, a.hitRecoveryTicks)],
  ['lockout (repeat sooner)', (a) => -a.targetLockoutTicks],
  ['daze', (a) => a.dazeTicks],
  ['displacement', (a) => a.displacementTiles],
  ['reach', (a) => a.reach],
  ['slow', (a) => a.slowTicks * a.slowExtraStepTicks],
  ['counter', (a) => a.counterDazeTicks],
  ['vulnerability (planted startup)', (a) => (a.plantedStartup ? 0 : 1)],
  ['vulnerability (whiff root)', (a) => -a.whiffRootTicks],
  ['vulnerability (hit recoil)', (a) => -a.hitRootTicks],
];

/** Does `a` beat `b` on every axis and strictly on one? (No attack may.) */
export function dominates(a: AttackSpec, b: AttackSpec): boolean {
  return ATTACK_AXES.every(([, f]) => f(a) >= f(b)) && ATTACK_AXES.some(([, f]) => f(a) > f(b));
}
