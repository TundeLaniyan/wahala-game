import { useRef } from 'react';
import type { CampaignHud, EnemyHud } from '../app/campaignHud';
import { NOTHING_SEEN, bossBars, healthModel, seeProtection } from './campaignHealthModel';
import './CampaignHealth.css';

/**
 * The campaign health meter and boss bars, a block of the HUD rail beside the board (City Rumble: the right
 * column under the minimap, with the mission panel). Health is 3-4 segments; the protection chips (Armour layers,
 * Okada, lives, the recovery frames) show what absorbs the next lethal hit and stay on the rail, struck through, once
 * used; the cause line says what hurt you. Reads the HUD snapshot only; renders nothing outside a campaign
 * mission or raid, and never sits over the play area.
 */
export function CampaignHealth({
  campaign,
  enemies = [],
}: {
  campaign: CampaignHud | null;
  enemies?: readonly EnemyHud[];
}) {
  // the most protection seen this mission: a consumed layer stays visible (struck through)
  const seen = useRef(NOTHING_SEEN);
  seen.current = campaign ? seeProtection(seen.current, campaign) : NOTHING_SEEN;
  const bars = bossBars(enemies);
  if (!campaign && bars.length === 0) return null;
  const m = campaign ? healthModel(campaign, seen.current) : null;
  return (
    <div className="campaign-health-wrap" data-testid="campaign-hud">
      {campaign && m && (
        <section
          className={`campaign-health${m.flash ? ' flash' : ''}${m.low ? ' low' : ''}`}
          data-testid="campaign-health"
          data-hp={campaign.hp}
          data-max={campaign.maxHp}
          aria-label={m.aria}
        >
          <header className="ch-head">
            <span className="ch-title">Health</span>
            <b className="ch-text" data-testid="health-text">
              {m.text}
            </b>
          </header>
          <div className="ch-segs" role="img" aria-label={m.aria} data-testid="health-segments">
            {m.segments.map((s) => (
              <i
                key={s.index}
                className={`ch-seg ${s.state}`}
                data-state={s.state}
                data-testid="health-seg"
              />
            ))}
          </div>
          {m.chips.length > 0 && (
            <ul className="ch-chips" data-testid="protection-chips">
              {m.chips.map((c, i) => (
                <li
                  key={`${c.kind}${i}`}
                  className={`ch-chip ${c.kind} ${c.state}`}
                  data-testid={`campaign-chip-${c.kind}`}
                  data-state={c.state}
                  title={c.title}
                >
                  <span>{c.label}</span>
                  <b>{c.value}</b>
                </li>
              ))}
            </ul>
          )}
          {m.cause && (
            <p className="ch-cause" data-testid="campaign-cause" role="status">
              {m.cause}
            </p>
          )}
        </section>
      )}
      {bars.map((b) => (
        <section
          key={b.id}
          className={`boss-bar ${b.kindLabel === 'BOSS' ? 'boss' : 'lieutenant'}`}
          data-testid="boss-bar"
          data-hp={b.filled}
          aria-label={`${b.kindLabel} ${b.name}, ${b.text}`}
        >
          <header className="ch-head">
            <span className="ch-title">{b.kindLabel}</span>
            <b className="ch-text">{b.name}</b>
          </header>
          <div className="ch-segs boss-segs" role="img" aria-label={b.text}>
            {Array.from({ length: b.segments }, (_, i) => (
              <i key={i} className={`ch-seg ${i < b.filled ? 'full' : 'empty'}`} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
