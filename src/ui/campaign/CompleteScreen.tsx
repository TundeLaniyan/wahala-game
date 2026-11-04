/**
 * Campaign complete: the ending title, summary and teaser (text only: the broker escapes and is never shown),
 * the campaign's stats and the replay modifiers that are open, with a way back to the map.
 */
import { CAMPAIGN, DISTRICT_ORDER, allRewards, availableModifiers, replayModifierFor } from '../../campaign';
import { MISSION_IDS } from '../../sim';
import { commands } from '../../app/session';
import { PrimaryButton, ScreenFrame, SecondaryButton } from '../menu/Frame';
import { clock, totalStars } from './model';
import { Stars, useCampaignUi } from './parts';

export function CompleteScreen() {
  const ui = useCampaignUi();
  if (!ui) return null;
  const { save } = ui;
  const stars = totalStars(save);
  const missions = DISTRICT_ORDER.filter((d) => d !== 'ojuelegba');
  const attempts = missions.reduce((n, d) => n + save.districts[d].attempts, 0);
  const seconds = missions.reduce((n, d) => n + (save.districts[d].bestSeconds ?? 0), 0);
  const rewards = allRewards().filter((r) => save.rewards.includes(r.id));
  const replays = MISSION_IDS.flatMap((id) => availableModifiers(save, id).map((m) => ({ id, m })));
  return (
    <ScreenFrame
      id="campaignComplete"
      kicker="Campaign complete"
      title={CAMPAIGN.ending.title}
      className="cp-screen cp-complete"
      onBack={() => commands.campaignMap()}
      backLabel="Map"
      actions={
        <PrimaryButton testId="complete-map" autoFocus onClick={() => commands.campaignMap()}>
          Back to the map
        </PrimaryButton>
      }
    >
      <div className="cp-result-grid">
        <section className="cp-result-main">
          <div className="cp-panel mn-panel" data-testid="ending-text">
            <small className="mn-kicker">The Ring breaks</small>
            <p className="cp-summary">{CAMPAIGN.ending.summary}</p>
            <div className="cp-msg cp-line" data-testid="ending-teaser">
              <div className="cp-msg-head">
                <span className="cp-msg-glyph" aria-hidden>
                  ☎
                </span>
                <b>UNKNOWN NUMBER</b>
                <small>new message</small>
              </div>
              <p>{CAMPAIGN.ending.teaser}</p>
            </div>
          </div>
        </section>
        <section className="cp-result-side">
          <div className="cp-panel mn-panel cp-stats" data-testid="ending-stats">
            <Stars n={stars.got} max={stars.max} />
            <dl>
              <div>
                <dt>Stars</dt>
                <dd>
                  {stars.got} / {stars.max}
                </dd>
              </div>
              <div>
                <dt>Districts</dt>
                <dd>6 of 6</dd>
              </div>
              <div>
                <dt>Attempts</dt>
                <dd>{attempts}</dd>
              </div>
              <div>
                <dt>Best times</dt>
                <dd>{clock(seconds)}</dd>
              </div>
              <div>
                <dt>Rewards</dt>
                <dd>
                  {rewards.length} / {allRewards().length}
                </dd>
              </div>
            </dl>
          </div>
          <div className="cp-panel mn-panel" data-testid="ending-replays">
            <small className="mn-kicker">Replay modifiers open</small>
            <ul className="cp-rewards">
              {replays.map(({ id, m }) => (
                <li key={m}>
                  <b>{replayModifierFor(id).name}</b>
                  <small>
                    {CAMPAIGN.districts[id].name}: {replayModifierFor(id).description}
                  </small>
                </li>
              ))}
            </ul>
          </div>
          <div className="cp-result-actions">
            <SecondaryButton
              className="small"
              testId="complete-finale"
              onClick={() => commands.campaignStory('finale')}
            >
              Watch the finale again
            </SecondaryButton>
          </div>
        </section>
      </div>
    </ScreenFrame>
  );
}
