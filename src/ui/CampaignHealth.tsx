import { useRef } from 'react';
import type { BossFeedback } from '../app/bossBar';
import type { CampaignHud, EnemyHud } from '../app/campaignHud';
import { NOTHING_SEEN, bossBars, healthModel, missionBossBar, seeProtection } from './campaignHealthModel';
import type { MissionView } from '../sim';
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
  mission = null,
  feedback = null,
}: {
  campaign: CampaignHud | null;
  enemies?: readonly EnemyHud[];
  /** A boss mission's view: its boss gets the health bar (hit-point bosses use `enemies`). */
  mission?: MissionView | null;
  /** The bar's cues from the sim's boss events (a hit just landed, a blast bounced off the shield). */
  feedback?: BossFeedback | null;
}) {
  // the most protection seen this mission: a consumed layer stays visible (struck through)
  const seen = useRef(NOTHING_SEEN);
  seen.current = campaign ? seeProtection(seen.current, campaign) : NOTHING_SEEN;
  const hpBars = bossBars(enemies);
  const missionBar = missionBossBar(mission, hpBars, feedback);
  // a mission boss's bar leads: it is the one thing to read about the fight
  const bars = missionBar ? [missionBar, ...hpBars] : hpBars;
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
          className={`boss-bar ${b.kindLabel === 'LIEUTENANT' ? 'lieutenant' : 'boss'}${b.state ? ` ${b.state}` : ''}${b.hitText ? ' struck' : ''}${b.blocked ? ' blocked' : ''}`}
          data-testid="boss-bar"
          data-state={b.state}
          data-hp={b.filled}
          data-max={b.segments}
          data-struck={b.hitText ? 'true' : undefined}
          data-blocked={b.blocked ? 'true' : undefined}
          aria-label={`${b.kindLabel} ${b.name}, health ${b.text}${b.status ? `, ${b.status.tag.toLowerCase()}: ${b.status.note.toLowerCase()}` : ''}`}
        >
          <header className="ch-head">
            <span className="ch-title">{b.kindLabel}</span>
            <b className="ch-text" data-testid="boss-name">
              {b.name}
            </b>
          </header>
          <div className="boss-row">
            <div className="ch-segs boss-segs" role="img" aria-label={`health ${b.text}`}>
              {Array.from({ length: b.segments }, (_, i) => (
                <i
                  key={i}
                  className={`ch-seg ${i < b.filled ? 'full' : b.lostIndex === i ? 'lost' : 'empty'}`}
                  data-testid="boss-seg"
                />
              ))}
            </div>
            <b className="boss-hp" data-testid="boss-health">
              {b.text}
            </b>
            {b.hitText && (
              <b className="boss-hit" data-testid="boss-hit">
                {b.hitText}
              </b>
            )}
          </div>
          {b.status && (
            <p className="boss-status" data-testid="boss-status" data-tag={b.state}>
              <span className="bs-tag">{b.status.tag}</span>
              <span className="bs-note">{b.status.note}</span>
            </p>
          )}
          {b.window != null && (
            <i className="boss-window" data-testid="boss-window" aria-hidden="true">
              <i style={{ width: `${Math.round(b.window * 100)}%` }} />
            </i>
          )}
        </section>
      ))}
    </div>
  );
}
