/**
 * Pure display models of the combat HUD (decisions HC2-HC4): the shield chip, the QUICK HANDS card state and the
 * one-line SUDDEN DEATH status. Read-only views of what the HUD snapshot already carries; no rules, no numbers of
 * their own (every number comes from the sim state through `app/hud.ts`).
 */
import type { HudMe, StreakHud, SuddenDeathHud } from '../app/hud';

// ---- shield chip (HC2) ----

export interface ShieldChip {
  /** Protection layers held: the Okada mount (1) plus the Armour plates. */
  layers: number;
  /** Which one is drawn: the Okada while mounted (it absorbs first), else the Armour. */
  kind: 'okada' | 'armour';
  /** "SHIELD x2": the counter the chip shows. */
  label: string;
}

/** The local player's shield chip, or null when no protection layer is held. */
export function shieldChip(me: Pick<HudMe, 'mounted' | 'armour'>): ShieldChip | null {
  const layers = (me.mounted ? 1 : 0) + Math.max(0, me.armour);
  if (layers <= 0) return null;
  return { layers, kind: me.mounted ? 'okada' : 'armour', label: `SHIELD x${layers}` };
}

// ---- QUICK HANDS card (HC3) ----

export interface QuickHandsCard {
  state: 'running' | 'stored';
  /** The tag the card shows: RUNNING (the buff is on) or STORED (paused through a death). */
  tag: 'RUNNING' | 'STORED';
  /** Seconds left (running) or stored (the unspent time a respawn gives back). */
  seconds: number;
  /** Share of the full duration left (0..1); stored time shows no bar. */
  fraction: number | null;
  /** The card's small print. */
  hint: string;
}

/** QUICK HANDS as the rail shows it: running with seconds, or stored with the unspent seconds; null when neither. */
export function quickHandsCard(streak: StreakHud | null, alive: boolean): QuickHandsCard | null {
  if (!streak) return null;
  const run = streak.quickHands;
  if (run && alive) {
    return {
      state: 'running',
      tag: 'RUNNING',
      seconds: run.seconds,
      fraction: run.fraction,
      hint: `${run.charges}/${run.capacity} generators · hold GENERATOR`,
    };
  }
  const stored = streak.quickHandsStored;
  if (stored) {
    return {
      state: 'stored',
      tag: 'STORED',
      seconds: stored.seconds,
      fraction: null,
      hint: 'paused · resumes on respawn',
    };
  }
  return null;
}

// ---- SUDDEN DEATH status (HC4) ----

export interface SuddenDeathStatus {
  /** "BLAST 1 OF 3" */
  blast: string;
  /** "SHIELDS RESPECTED" (blasts 1 and 2: Okada / Armour absorb one layer each) or "SHIELDS IGNORED" (the final blast). */
  shields: 'SHIELDS RESPECTED' | 'SHIELDS IGNORED';
  final: boolean;
  /** "0:42" */
  countdown: string;
  /** The whole line: "BLAST 1 OF 3 · SHIELDS RESPECTED · 0:42". */
  line: string;
  /** About the local fighter's own protection, null when they are not in the round or hold none. */
  yours: string | null;
}

const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** The one-line status of the blast countdown; null while the title card shows or once the sequence is spent. */
export function suddenDeathStatus(sd: SuddenDeathHud): SuddenDeathStatus | null {
  if (sd.stage !== 'countdown' || sd.secondsToBlast === null) return null;
  const final = sd.blast > sd.shieldBlasts;
  const shields = final ? 'SHIELDS IGNORED' : 'SHIELDS RESPECTED';
  const countdown = clock(sd.secondsToBlast);
  const blast = `BLAST ${sd.blast} OF ${sd.totalBlasts}`;
  let yours: string | null = null;
  if (sd.localContender && sd.localAlive) {
    if (final) yours = 'Nothing saves you from this blast';
    else if (sd.localShield > 0)
      yours = `Your shield absorbs this blast (${sd.localShield} layer${sd.localShield === 1 ? '' : 's'})`;
    else yours = 'No shield: this blast eliminates you';
  }
  return { blast, shields, final, countdown, line: `${blast} · ${shields} · ${countdown}`, yours };
}

/** The title card's rule line, built from the sim's own blast schedule. */
export function suddenDeathRule(
  sd: Pick<SuddenDeathHud, 'firstBlastSeconds' | 'shieldBlasts' | 'totalBlasts'>,
): string {
  const respected = sd.shieldBlasts === 1 ? 'Blast 1' : `Blasts 1-${sd.shieldBlasts}`;
  return (
    `The first blast drops ${sd.firstBlastSeconds} seconds in. ${respected} respect an Okada or Armour plate ` +
    `(one layer each); blast ${sd.totalBlasts} ignores shields.`
  );
}
