/** The pause menu's side panel during a campaign mission: district, keeper, lives (HUD facts come from the HUD rail). */
import { CAMPAIGN, replayModifierFor } from '../../campaign';
import { MISSION_LIVES } from '../../app/campaign';
import type { ActiveMission } from '../../app/campaignState';
import { missionView } from '../../sim';
import { liveMatch } from '../../app/session';
import './campaign.css';

export function MissionPauseInfo({ mission }: { mission: ActiveMission }) {
  const d = CAMPAIGN.districts[mission.missionId];
  const view = (() => {
    const m = liveMatch();
    return m ? missionView(m.state) : null;
  })();
  return (
    <aside className="mn-panel mn-pause-info" data-testid="pause-mission-info">
      <small className="mn-kicker">Campaign mission</small>
      <h3>{d.name}</h3>
      <p className="mn-pause-summary">
        {d.boss?.name}, {d.boss?.title}
      </p>
      <dl className="mn-pause-stats">
        <div>
          <dt>Lives left</dt>
          <dd>{view ? Math.max(0, view.lives.max - view.lives.used) : MISSION_LIVES}</dd>
        </div>
        {view && (
          <div>
            <dt>Phase</dt>
            <dd>{Math.min(3, view.phase + 1)} of 3</dd>
          </div>
        )}
        {mission.modifiers[0] && (
          <div>
            <dt>Modifier</dt>
            <dd>{replayModifierFor(mission.missionId).name}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
