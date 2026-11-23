/**
 * What the main match clock shows (decision SDT1, docs/DECISIONS.md). Normally the match time left. In a Rumble Sudden
 * Death round the match clock is spent (0:00) and the only real clock is the sim's blast countdown (`nextBlastTick`),
 * so the primary timer position shows THAT, labelled SUDDEN DEATH: the title card's wait shows the first blast's delay,
 * then each blast's own countdown, and 0:00 once the sequence is spent. A pure read of the HUD snapshot: no timer of its
 * own, so it can never disagree with the simulation.
 */
import type { HudSnapshot } from '../app/hud';
import { suddenDeathStatus } from './combatHudModel';

export interface TimerModel {
  seconds: number;
  /** The span the bar is a fraction of. */
  total: number;
  urgent: boolean;
  /** Sudden Death only: the label and the short line under it ("BLAST 1 OF 3" / "FINAL BLAST"). */
  sudden: { sub: string; final: boolean } | null;
}

export function timerModel(
  hud: Pick<HudSnapshot, 'secondsLeft' | 'totalSeconds' | 'final30' | 'suddenDeath'>,
): TimerModel {
  const sd = hud.suddenDeath;
  if (!sd) return { seconds: hud.secondsLeft, total: hud.totalSeconds, urgent: hud.final30, sudden: null };
  if (sd.stage === 'transition')
    return {
      seconds: sd.firstBlastSeconds,
      total: Math.max(1, sd.firstBlastSeconds),
      urgent: false,
      sudden: { sub: `BLAST 1 OF ${sd.totalBlasts}`, final: false },
    };
  const status = suddenDeathStatus(sd);
  const seconds = sd.secondsToBlast ?? 0;
  return {
    seconds,
    total: Math.max(1, sd.countdownSeconds ?? seconds),
    urgent: sd.warning,
    sudden: status
      ? { sub: status.final ? `FINAL BLAST · NO SHIELDS` : status.blast, final: status.final }
      : { sub: 'SUDDEN DEATH', final: true },
  };
}
