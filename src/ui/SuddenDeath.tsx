import { CHARACTERS } from '../sim';
import type { SuddenDeathHud } from '../app/hud';
import { playerCss } from '../assets/palette';
import './SuddenDeath.css';

const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

const REASON: Record<SuddenDeathHud['cause'], string> = {
  timeout: 'Time up and level on eliminations.',
  simultaneous: 'The last fighters fell together, level on eliminations.',
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
              <b style={{ color: playerCss(c.slot, c.team) }}>{c.isLocal ? 'YOU' : c.name}</b>
              <span>{CHARACTERS[c.characterId].name}</span>
              <em>
                {c.kills} elimination{c.kills === 1 ? '' : 's'}
              </em>
            </li>
          ))}
        </ul>
        <p>
          A full-area blast drops {sd.firstBlastSeconds} seconds in. Only an Okada or Armour plate survives
          it.
        </p>
      </div>
    </div>
  );
}

/** The blast clock beside the board during the countdown, and the flash when a blast falls. */
export function SuddenDeathClock({ sd }: { sd: SuddenDeathHud }) {
  return (
    <>
      {sd.stage === 'countdown' && sd.secondsToBlast !== null && (
        <div
          className={`sd-clock${sd.warning ? ' warn' : ''}`}
          data-testid="sudden-death-clock"
          data-seconds={sd.secondsToBlast}
          role="status"
        >
          <b>SUDDEN DEATH</b>
          <span>
            Blast {sd.blast}/{sd.of} in <strong>{clock(sd.secondsToBlast)}</strong>
          </span>
        </div>
      )}
      {sd.flash && <div className="sd-flash" data-testid="sudden-death-flash" aria-hidden />}
    </>
  );
}
