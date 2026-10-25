import { AnimationMixer, Group, LoopOnce, LoopRepeat, MathUtils } from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';
import type { CharacterId } from '../../sim';
import { assets } from './library';
import { addRim } from './rim';

export type ClipName =
  | 'Idle'
  | 'Run'
  | 'RunCarry'
  | 'IdleCarry'
  | 'Ride'
  | 'Place'
  | 'Kick'
  | 'Throw'
  | 'Push'
  | 'Stumble'
  | 'Dazed'
  | 'Cheer'
  | 'Win'
  | 'Lose'
  | 'DieBlast'
  | 'DieVehicle';

/** Character height in the model file (metres) and the height it is drawn at, in tiles. */
const MODEL_HEIGHT = 1.8;
const DRAWN_HEIGHT = 1.86;
export const RIGGED_SCALE = DRAWN_HEIGHT / MODEL_HEIGHT;

/**
 * Adult proportions: the cast was modelled with oversized "toy" heads (1.2x); in play they are
 * drawn at a grounded adult head-to-body ratio. Applied to the head bone after the animation pose,
 * so clips and the menu portraits are unaffected.
 */
export const ADULT_HEAD_SCALE = 0.82;

/** Plays the named clips of a skinned character with cross-fades and interruptible one-shots. */
export class RiggedCharacter {
  /** Unit-scaled holder: add things that should scale with the character (bike) here. */
  readonly holder = new Group();
  readonly body: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<ClipName, AnimationAction>();
  private loop: ClipName = 'Idle';
  private active: ClipName | null = null;
  private oneShot: { name: ClipName; left: number } | null = null;
  private frozen = false;
  private readonly head: Object3D | null;

  private constructor(body: Object3D, clips: readonly AnimationClip[]) {
    this.body = body;
    this.holder.scale.setScalar(RIGGED_SCALE);
    this.holder.add(body);
    this.mixer = new AnimationMixer(body);
    for (const c of clips) this.actions.set(c.name as ClipName, this.mixer.clipAction(c));
    this.head = body.getObjectByName('head') ?? null;
    this.setLoop('Idle', 0);
  }

  static create(id: CharacterId | string, phase = 0): RiggedCharacter | null {
    const body = assets.instance(`char_${id}`);
    if (!body) return null;
    addRim(body);
    const rc = new RiggedCharacter(body, assets.clips(`char_${id}`));
    rc.mixer.setTime(phase);
    return rc;
  }

  /** Select the looping state clip (Idle/Run/...). A running one-shot finishes first. */
  setLoop(name: ClipName, fade = 0.14, speed = 1): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = speed;
    if (name === this.loop && this.active === name) return;
    this.loop = name;
    if (!this.oneShot) this.activate(name, fade);
  }

  playOnce(name: ClipName, fade = 0.06, speed = 1): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.setLoop(LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    this.oneShot = { name, left: a.getClip().duration / Math.max(0.05, speed) };
    this.activate(name, fade, true);
  }

  /** Hold the final pose of a clip (deaths); also stops state changes. */
  playFinal(name: ClipName, speed = 1): void {
    if (this.frozen) return;
    this.frozen = true;
    this.playOnce(name, 0.05, speed);
    this.oneShot = null;
  }

  /** Respawn modes: leave a held death pose and return to the looping state clips. */
  revive(): void {
    this.frozen = false;
    this.oneShot = null;
    this.mixer.stopAllAction();
    this.active = null;
    this.activate(this.loop, 0);
  }

  get current(): ClipName | null {
    return this.active;
  }

  update(dt: number): void {
    if (this.oneShot) {
      this.oneShot.left -= dt;
      if (this.oneShot.left <= 0) {
        this.oneShot = null;
        this.activate(this.loop, 0.12);
      }
    }
    this.mixer.update(dt);
    this.head?.scale.setScalar(ADULT_HEAD_SCALE);
  }

  private activate(name: ClipName, fade: number, restart = false): void {
    const next = this.actions.get(name);
    if (!next) return;
    const prev = this.active ? this.actions.get(this.active) : null;
    if (prev === next && !restart) return;
    const looping = !(
      name === 'Place' ||
      name === 'Kick' ||
      name === 'Throw' ||
      name === 'Push' ||
      name === 'Stumble' ||
      name === 'Lose' ||
      name === 'DieBlast' ||
      name === 'DieVehicle'
    );
    if (!restart && looping) next.setLoop(LoopRepeat, Infinity);
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, MathUtils.clamp(fade, 0.02, 1), false);
    else next.setEffectiveWeight(1);
    next.enabled = true;
    this.active = name;
  }
}
