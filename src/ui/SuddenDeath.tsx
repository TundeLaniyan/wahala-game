import { useEffect, useState } from 'react';
import type { SuddenDeathHud } from '../app/hud';
import { playerTextStyle } from '../assets/palette';
import { suddenDeathRule, suddenDeathStatus } from './combatHudModel';
import './SuddenDeath.css';

const REASON: Record<SuddenDeathHud['cause'], string> = {
  timeout: 'Time up, level on eliminations.',
  simultaneous: 'Last fighters fell together, level.',
  test: 'Test match: the edge closes in, then the blasts cross the floor.',
};

/**
 * Wall-clock safety nets (decision SU1). The title card and the full blast announcement end with the simulation clock
 * (4 s of held input, 3 s of countdown), and that is how they normally go. These caps are for when it does not: the
 * simulation stalls (the tab is hidden, the match loads or is held), a round restarts, a tick never arrives. Each is
 * well past the normal length, so a play session never meets them, and a stuck banner is gone within a few seconds.
 */
export const SD_CARD_MAX_MS = 8000;
export const SD_ANNOUNCE_MAX_MS = 8000;

/**
 * Test seam for the browser suite, whose simulation is frozen and stepped by hand on a slow software renderer (a real
 * second there is many frames of a phone): `?sdhold` switches the safety nets off, `?sdcap=<ms>` replaces them. Absent
 * (every real session) the normal caps apply.
 */
function capFor(normal: number): number | null {
  if (typeof location === 'undefined') return normal;
  const q = new URLSearchParams(location.search);
  if (q.has('sdhold')) return null;
  const v = Number(q.get('sdcap'));
  return Number.isFinite(v) && v > 0 ? v : normal;
}

/**
 * True for `ms` after `key` first shows (while `active`), then false for that key; a new key starts a new window.
 * Server render and tests see it as true (effects do not run), so the sim-derived lifecycle is what they check.
 */
export function useBriefly(key: number, active: boolean, ms: number): boolean {
  const [expired, setExpired] = useState<number | null>(null);
  const cap = capFor(ms);
  useEffect(() => {
    if (!active || cap === null) return undefined;
    const t = setTimeout(() => setExpired(key), cap);
    return () => clearTimeout(t);
  }, [key, active, cap]);
  return expired !== key;
}

const CARD_ROWS = 4;

/**
 * The SUDDEN DEATH title card: who is left and the kill totals that tied them. A compact card in the HUD rail beside the
 * board (never over it, decision SU1), up while the simulation holds input and for at most `SD_CARD_MAX_MS` of real
 * time, `pointer-events: none`.
 */
export function SuddenDeathCard({ sd }: { sd: SuddenDeathHud }) {
  const live = useBriefly(sd.cardKey, sd.stage === 'transition', SD_CARD_MAX_MS);
  if (sd.stage !== 'transition' || !live) return null;
  const shown = sd.contenders.slice(0, CARD_ROWS);
  const more = sd.contenders.length - shown.length;
  return (
    <div className="sd-card" data-testid="sudden-death-card" role="alert">
      <div className="sd-inner">
        <h2 data-testid="sudden-death-title">SUDDEN DEATH</h2>
        <small>{REASON[sd.cause]}</small>
        <ul data-testid="sudden-death-contenders">
          {shown.map((c) => (
            <li key={c.id} className={c.isLocal ? 'mine' : ''} data-testid="sudden-death-contender">
              <b style={playerTextStyle(c.slot, c.team)}>{c.isLocal ? 'YOU' : c.name}</b>
              <em>
                {c.kills} elimination{c.kills === 1 ? '' : 's'}
              </em>
            </li>
          ))}
          {more > 0 && <li className="more">+{more} more</li>}
        </ul>
        <p data-testid="sudden-death-rule">{suddenDeathRule(sd)}</p>
      </div>
    </div>
  );
}

/**
 * The brief blast announcement (decisions SD-B1, SDT2): when a countdown begins (`sd.announce`, a few seconds) a compact
 * card in the HUD rail beside the board says which blast of the round it is, whether shields count and what that means
 * for the local fighter. It is gone after the announce window (and after `SD_ANNOUNCE_MAX_MS` of real time whatever the
 * simulation clock does), never sits over the board, and never repeats the clock: the COUNTDOWN is the main match timer
 * (`timerModel.ts`), labelled SUDDEN DEATH, so there is no persistent banner or chip.
 */
export function SuddenDeathClock({ sd }: { sd: SuddenDeathHud }) {
  const status = suddenDeathStatus(sd);
  const brief = useBriefly(sd.announceKey, sd.announce, SD_ANNOUNCE_MAX_MS);
  if (!status || !sd.announce || !brief) return null;
  return (
    <div
      className={`sd-clock${sd.warning ? ' warn' : ''}${status.final ? ' final' : ''}`}
      data-testid="sudden-death-clock"
      data-mode="full"
      data-seconds={sd.secondsToBlast}
      data-blast={sd.blast}
      data-final={status.final}
      role="status"
    >
      <b>SUDDEN DEATH</b>
      <span className="sd-status" data-testid="sudden-death-status">
        {status.blast} · <em className="sd-shields">{status.shields}</em>
      </span>
      {status.yours && (
        <small className="sd-yours" data-testid="sudden-death-yours">
          {status.yours}
        </small>
      )}
    </div>
  );
}

/** The flash when a blast falls (its own element: the announcement is gone by then). */
export function SuddenDeathFlash({ sd }: { sd: SuddenDeathHud }) {
  return sd.flash ? <div className="sd-flash" data-testid="sudden-death-flash" aria-hidden /> : null;
}
