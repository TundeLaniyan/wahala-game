/**
 * The campaign difficulty selector (Easy / Normal / Hard, docs/CAMPAIGN_DIFFICULTY.md). Three buttons and the summary of
 * the one chosen. Before a campaign exists the choice is held by the caller (and applied by "New campaign"); once one
 * exists a pick is saved at once, but only between missions (the controller refuses it during a live mission).
 * Text comes from the sim's level table, never from here.
 */
import { CAMPAIGN_LEVELS, CAMPAIGN_LEVEL_DEFS } from '../../sim';
import type { CampaignLevel } from '../../sim';
import { Option } from '../menu/Frame';

export function LevelPicker(props: { value: CampaignLevel; onPick: (level: CampaignLevel) => void }) {
  const def = CAMPAIGN_LEVEL_DEFS[props.value];
  return (
    <div className="cp-panel mn-panel cp-level" data-testid="campaign-level" data-level={props.value}>
      <small className="mn-kicker">Campaign difficulty</small>
      <div className="mn-opts" role="group" aria-label="Campaign difficulty">
        {CAMPAIGN_LEVELS.map((l) => (
          <Option
            key={l}
            value={l}
            current={props.value}
            label={CAMPAIGN_LEVEL_DEFS[l].label}
            testId={`campaign-level-${l}`}
            onPick={props.onPick}
          />
        ))}
      </div>
      <p className="mn-fineprint" data-testid="campaign-level-summary">
        {def.summary}
      </p>
    </div>
  );
}

/** Read-only line for the briefing and the pause info. */
export function LevelBadge({ level }: { level: CampaignLevel }) {
  return (
    <span className="cp-chip" data-testid="campaign-level-badge">
      Difficulty: {CAMPAIGN_LEVEL_DEFS[level].label}
    </span>
  );
}
