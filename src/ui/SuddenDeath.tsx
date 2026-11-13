import { CHARACTERS } from '../sim';
import type { SuddenDeathHud } from '../app/hud';
import { playerTextStyle } from '../assets/palette';
import { suddenDeathRule, suddenDeathStatus } from './combatHudModel';
import './SuddenDeath.css';

const REASON: Record<SuddenDeathHud['cause'], string> = {
  timeout: 'Time up and level on eliminations.',
  simultaneous: 'The last fighters fell together, level on eliminations.',
  test: 'Test match: the edge closes in, then the blasts cross the floor.',
};

/** The SUDDEN DEATH title card: who is left and the kill totals that tied them (held while input waits). */
export function SuddenDeathCard({ sd }: { sd: SuddenDeathHud }) {
  if (sd.stage !== 'transition') return null;
  return (
    <div className="sd-card" data-testid="sudden-death-card" role="alert">
      <div className="sd-inner">
        <small>{REASON[sd.cause]}</small>
        <h2 data-testid="sudden-death-title">SUDDEN DEATH</h2>
        <ul data-testid="sudden-death-contenders">
          {sd.contenders.map((c) => (
            <li key={c.id} className={c.isLocal ? 'mine' : ''} data-testid="sudden-death-contender">
              <b style={playerTextStyle(c.slot, c.team)}>{c.isLocal ? 'YOU' : c.name}</b>
              <span>{CHARACTERS[c.characterId].name}</span>
              <em>
                {c.kills} elimination{c.kills === 1 ? '' : 's'}
              </em>
            </li>
          ))}
        </ul>
        <p data-testid="sudden-death-rule">{suddenDeathRule(sd)}</p>
      </div>
    </div>
  );
}

/**
 * The blast clock in the HUD rail during the countdown, and the flash when a blast falls. When a countdown begins
 * (`sd.announce`, a few seconds) it is the full announcement: which blast of the round it is, whether shields count
 * (blasts 1-2: an Okada or Armour layer absorbs one blast each; the final blast ignores them), the countdown, what that
 * means for the local fighter and the kill ranking. Then it folds into a one-line chip (title, blast, countdown; it still
 * pulses in the warning window) so it never sits over the fight for the whole round (decision SD-B1).
 */
export function SuddenDeathClock({ sd }: { sd: SuddenDeathHud }) {
  const status = suddenDeathStatus(sd);
  const compact = !sd.announce;
  if (status && compact)
    return (
      <>
        <div
          className={`sd-clock compact${sd.warning ? ' warn' : ''}${status.final ? ' final' : ''}`}
          data-testid="sudden-death-clock"
          data-mode="compact"
          data-seconds={sd.secondsToBlast}
          data-blast={sd.blast}
          data-final={status.final}
          role="status"
          aria-label={`Sudden death: ${status.line}${status.yours ? `. ${status.yours}` : ''}`}
        >
          <b>SUDDEN DEATH</b>
          <span className="sd-status" data-testid="sudden-death-status">
            {status.blast}
            {status.final && <em className="sd-shields"> · {status.shields}</em>} ·{' '}
            <strong>{status.countdown}</strong>
          </span>
        </div>
        {sd.flash && <div className="sd-flash" data-testid="sudden-death-flash" aria-hidden />}
      </>
    );
  return (
    <>
      {status && (
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
            {status.blast} · <em className="sd-shields">{status.shields}</em> ·{' '}
            <strong>{status.countdown}</strong>
          </span>
          {status.yours && (
            <small className="sd-yours" data-testid="sudden-death-yours">
              {status.yours}
            </small>
          )}
          <ol className="sd-rank" data-testid="sudden-death-ranking">
            {sd.ranking
              .filter((r) => r.contender)
              .map((r) => (
                <li key={r.id} className={`${r.isLocal ? 'mine' : ''}${r.alive ? '' : ' out'}`}>
                  <b style={playerTextStyle(r.slot, r.team)}>{r.isLocal ? 'YOU' : r.name}</b>
                  <em>{r.kills}</em>
                </li>
              ))}
          </ol>
        </div>
      )}
      {sd.flash && <div className="sd-flash" data-testid="sudden-death-flash" aria-hidden />}
    </>
  );
}
