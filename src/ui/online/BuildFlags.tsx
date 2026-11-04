/**
 * Settings row: the feature flags of this build, read-only (Online off / mock / server, Voice, Campaign). They are
 * decided at build time or by the `?mockonline` URL switch; nothing here changes them.
 */
import { flags } from '../../platform';
import { VoiceStatus } from './VoiceStatus';
import { flagRows } from './model';
import './online.css';

export function BuildFlags() {
  const rows = flagRows(flags());
  return (
    <>
      <div className="mn-field" data-testid="build-flags">
        <div className="mn-field-label">
          <b>This build</b>
          <small>Read-only. Online play and voice chat are not part of the shipped game.</small>
        </div>
        <ul className="mn-field-ctl ol-flags">
          {rows.map((r) => (
            <li key={r.id} data-testid={`flag-${r.id}`} data-value={r.value}>
              <span>{r.label}</span>
              <b>{r.value}</b>
            </li>
          ))}
        </ul>
      </div>
      <VoiceStatus />
    </>
  );
}
