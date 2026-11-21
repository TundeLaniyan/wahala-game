import type { Camera } from 'three';
import type { GameState, Player } from '../../sim';
import type { Layout } from '../coords';
import type { Effects } from '../fx/Effects';
import type { FrameInfo } from '../types';

export interface FrameContext {
  state: GameState;
  /** Fraction (0..1) of the next simulation tick that has elapsed; used for interpolation. */
  alpha: number;
  time: number;
  dt: number;
  info: FrameInfo;
  layout: Layout;
  fx: Effects;
  /**
   * Follow-camera (stadium) frames only: whether a world-space circle on the floor is inside the last
   * frame's view. Views may skip work for what is off screen. Absent = everything counts as visible.
   */
  inView?: (x: number, z: number, radius: number) => boolean;
  /** The scene camera (last frame's pose), for views that face the camera (health pips). Absent in tests. */
  camera?: Camera;
  /**
   * A NIGHT raid only (`NightLightViews`, decision NL7): whether the dark hides a player now (the sim's lit tile rule),
   * and the light shown on a tile (0..1). Absent everywhere else: nothing is hidden.
   */
  night?: NightQuery;
}

export interface NightQuery {
  concealed(p: Player): boolean;
  level(x: number, y: number): number;
}

/** A self-contained piece of the scene that mirrors one aspect of the simulation. */
export interface View {
  update(ctx: FrameContext): void;
  dispose(): void;
}
