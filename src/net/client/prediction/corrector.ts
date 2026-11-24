/**
 * Smooth reconciliation. The prediction restarts from the authoritative state every frame, so its error never accumulates;
 * what remains is how a CHANGE of belief is shown. A change is measured at the moment shown last frame (what was drawn
 * then minus what the new prediction says about that same moment), so ordinary motion and new presses are never mistaken
 * for errors. The change goes into a drawn offset that decays exponentially (`blendMs`); an offset longer than `snapTiles`
 * snaps (it would read as a slide, not a correction: a step the server refused, a push). A jump of the SHOWN TIME (the
 * look-ahead dropped for a hold) is not an error of the path and is always blended (`shift`).
 */
import type { PredictionConfig } from './config';
import type { Vec } from './drawn';

export type CorrectionKind = 'none' | 'blend' | 'snap';

export class Corrector {
  offset: Vec = { x: 0, y: 0 };

  constructor(private readonly cfg: PredictionConfig) {}

  /** Time passes: the remaining offset shrinks (about 95 % gone after `blendMs`). */
  decay(dtMs: number): void {
    const f = Math.exp((-3 * Math.max(0, dtMs)) / Math.max(1, this.cfg.blendMs));
    this.offset = { x: this.offset.x * f, y: this.offset.y * f };
    if (Math.hypot(this.offset.x, this.offset.y) < this.cfg.deadbandTiles) this.offset = { x: 0, y: 0 };
  }

  /**
   * The prediction changed its mind by `delta` (old minus new, tiles) about the moment shown last frame: blended when it
   * is short, snapped (the whole drawn offset dropped) when it is longer than `snapTiles`.
   */
  add(delta: Vec): CorrectionKind {
    const length = Math.hypot(delta.x, delta.y);
    if (length < this.cfg.deadbandTiles) return 'none';
    if (length > this.cfg.snapTiles) {
      this.offset = { x: 0, y: 0 };
      return 'snap';
    }
    this.offset = { x: this.offset.x + delta.x, y: this.offset.y + delta.y };
    return 'blend';
  }

  /**
   * The SHOWN TIME moved by more than real time (the look-ahead was dropped for a hold such as an oil slide): `delta` is
   * how far that moved the fighter along its own path. Always blended: the path is right, only the moment shown changed.
   */
  shift(delta: Vec): void {
    this.offset = { x: this.offset.x + delta.x, y: this.offset.y + delta.y };
  }

  reset(): void {
    this.offset = { x: 0, y: 0 };
  }
}
