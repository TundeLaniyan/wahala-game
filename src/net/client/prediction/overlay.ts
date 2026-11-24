/**
 * The in-place overlay on the replica's local Player (decision ON4, docs/ONLINE_PREDICTION.md section 3).
 *
 * Why in place: the controller, renderer and kill feed key off the `GameState` object `driver.state()` returns, so the
 * prediction cannot hand out a different object per frame. Why it cannot leak: the driver runs a strict protocol every
 * frame - (a) `revert()` puts back the saved authoritative values, (b) the replica plays the server's frames (predict,
 * patch, HASH CHECK) on purely authoritative data, (c) `apply()` saves the new authoritative values and writes the
 * prediction. Only the seven `StepFields` are ever written. In verify mode (tests, `?debug`), `revert()` also checks that
 * the whole player hashes exactly as it did before `apply()` and throws otherwise.
 */
import type { Player } from '../../../sim';
import { canonicalHash } from '../../hash';
import type { StepFields } from './drawn';
import { pickStep } from './drawn';

function write(p: Player, f: Readonly<StepFields>): void {
  p.x = f.x;
  p.y = f.y;
  p.facing = f.facing;
  p.stepFromX = f.stepFromX;
  p.stepFromY = f.stepFromY;
  p.stepRemaining = f.stepRemaining;
  p.stepTotal = f.stepTotal;
}

export class OverlayLeakError extends Error {
  constructor() {
    super(
      'prediction overlay leak: the local player is not bit-identical to its authoritative copy after revert',
    );
  }
}

export class PlayerOverlay {
  /** Reverts whose result differed from the authoritative copy (verify mode only). */
  leaks = 0;
  reverts = 0;
  private target: Player | null = null;
  private saved: StepFields | null = null;
  private written: StepFields | null = null;
  private savedHash = 0;

  constructor(private readonly verify = false) {}

  get applied(): boolean {
    return this.target !== null;
  }

  /** Saves `p`'s authoritative step fields and writes `fields` over them. Reverts any previous overlay first. */
  apply(p: Player, fields: Readonly<StepFields>): void {
    this.revert();
    this.saved = pickStep(p);
    if (this.verify) this.savedHash = canonicalHash(p);
    this.target = p;
    this.written = pickStep(fields);
    write(p, fields);
  }

  /** Puts the authoritative values back. Idempotent. */
  revert(): void {
    const p = this.target;
    const saved = this.saved;
    if (!p || !saved) return;
    write(p, saved);
    this.target = null;
    this.saved = null;
    this.written = null;
    this.reverts++;
    if (this.verify && canonicalHash(p) !== this.savedHash) {
      this.leaks++;
      throw new OverlayLeakError();
    }
  }

  /** Runs `fn` on the authoritative values (overlay off), then puts the same overlay back. */
  withAuthoritative<T>(fn: () => T): T {
    const p = this.target;
    const fields = this.written;
    this.revert();
    try {
      return fn();
    } finally {
      if (p && fields) this.apply(p, fields);
    }
  }
}
