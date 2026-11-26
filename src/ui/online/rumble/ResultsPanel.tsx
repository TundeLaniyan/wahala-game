/**
 * The online results over the frozen board: the server's own placement table (HUMAN / BOT tags, your row marked, K / D / A),
 * the winner line, the host's REMATCH and BACK TO MENU for everyone. Built from `ResultsMsg` only: nothing here is computed
 * by the client. Names are React text. Presentational.
 */
import type { ReactNode } from 'react';
import { PrimaryButton, SecondaryButton } from '../../menu/Frame';
import type { ResultsView } from './models';
import './rumble.css';

export interface ResultsPanelProps {
  view: ResultsView;
  /** The local player is the host of the room (only the host starts a rematch). */
  isHost: boolean;
  /** The rematch can be asked now (connected). */
  canRematch: boolean;
  onRematch(): void;
  onMenu(): void;
  /** Optional block above the buttons (a platform build: quick signals while everyone looks at the results). */
  extra?: ReactNode;
}

export function ResultsPanel(p: ResultsPanelProps) {
  const v = p.view;
  const tone = v.draw ? 'draw' : v.youWon === true ? 'win' : v.youWon === false ? 'lose' : 'over';
  return (
    <div className={`mn-overlay ro-results-wrap`} data-testid="ro-results" data-tone={tone}>
      <div className="ro-results">
        <header className="ro-results-head">
          <small className="mn-kicker">Match over</small>
          <h2 data-testid="ro-result-headline">{v.headline}</h2>
          {v.sub && (
            <p className="ro-small" data-testid="ro-result-sub">
              {v.sub}
            </p>
          )}
        </header>
        <div className="ro-table-wrap" data-testid="ro-result-scroll" tabIndex={0} aria-label="Placements">
          <table className="ro-table" data-testid="ro-result-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Fighter</th>
                <th scope="col" title="Eliminations">
                  K
                </th>
                <th scope="col" title="Deaths">
                  D
                </th>
                <th scope="col" title="Assists">
                  A
                </th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr
                  key={r.key}
                  className={`${r.you ? 'me' : ''}${r.winner ? ' won' : ''}`}
                  data-testid="ro-result-row"
                  data-you={r.you}
                  data-bot={r.isBot}
                >
                  <td>{r.placementLabel}</td>
                  <td className="nm">
                    <span className="ro-result-name">{r.name}</span>
                    <span className={`ro-tag ${r.tag.toLowerCase()}`}>{r.tag}</span>
                    {r.you && <span className="ro-tag you">YOU</span>}
                    {r.team && <span className="ro-tag team">{r.team}</span>}
                    {r.note && (
                      <small className="ro-note" data-testid="ro-result-note">
                        {r.note}
                      </small>
                    )}
                  </td>
                  <td>{r.kills}</td>
                  <td>{r.deaths}</td>
                  <td>{r.assists}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.extra}
        <div className="ro-results-actions">
          {p.isHost ? (
            <PrimaryButton testId="ro-rematch" disabled={!p.canRematch} autoFocus onClick={p.onRematch}>
              Rematch
            </PrimaryButton>
          ) : (
            <p className="ro-small" data-testid="ro-rematch-wait" role="status">
              Waiting for the host to start a rematch.
            </p>
          )}
          <SecondaryButton testId="ro-results-menu" onClick={p.onMenu}>
            Back to menu
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
