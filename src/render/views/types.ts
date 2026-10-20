import type { GameState } from '../../sim';
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
}

/** A self-contained piece of the scene that mirrors one aspect of the simulation. */
export interface View {
  update(ctx: FrameContext): void;
  dispose(): void;
}
