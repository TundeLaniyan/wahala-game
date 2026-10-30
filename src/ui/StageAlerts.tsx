import type { StageAlert } from '../app/hud';
import './StageAlerts.css';

const ICON: Record<StageAlert['style'], string> = {
  danfo: '🚌',
  traffic: '🚦',
  checkpoint: '🚓',
  debris: '⚠',
  power: '⚡',
  gust: '💨',
  wash: '🌊',
  merch: '📦',
  manhole: '◎',
  cargo: '🏗',
  goods: '🧺',
  truck: '🚛',
  train: '🚆',
};

/** Concise stage-hazard warnings for the local player (rendered at the top of the toast column). */
export function StageAlerts({ alerts }: { alerts: StageAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="stage-alerts" data-testid="stage-alerts" role="status" aria-live="assertive">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`stage-alert ${a.level}`}
          data-testid="stage-alert"
          data-style={a.style}
          data-level={a.level}
        >
          <i aria-hidden="true">{ICON[a.style]}</i>
          <span>{a.text}</span>
          {a.seconds > 0 && <b className="secs">{a.seconds}</b>}
        </div>
      ))}
    </div>
  );
}

/** The arena's special rule, big and unmissable during the countdown (Surulere Power Yard). */
export function RuleBanner({ text }: { text: string }) {
  const [head, ...rest] = text.split(':');
  const body = rest.join(':').trim();
  return (
    <div className="rule-banner" data-testid="rule-banner" role="alert">
      <div className="rule-inner">
        <b>{body ? head : 'ARENA RULE'}</b>
        <span>{body || text}</span>
      </div>
    </div>
  );
}
