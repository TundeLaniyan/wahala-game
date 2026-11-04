/**
 * Prologue and finale cutscenes as a story-line player. The unseen broker's lines are message / phone-call cards
 * from UNKNOWN NUMBER (never a face or a portrait). Skip ends the scene; reaching the end (or skipping) is what
 * records it in the save (app/campaign.ts `storyDone`).
 */
import { CAMPAIGN } from '../../campaign';
import { commands } from '../../app/session';
import { ScreenFrame } from '../menu/Frame';
import { StoryPlayer, useCampaignUi } from './parts';

export function StoryScreen() {
  const ui = useCampaignUi();
  if (!ui) return null;
  const finale = ui.story === 'finale';
  return (
    <ScreenFrame
      id="campaignStory"
      kicker={finale ? 'Finale' : 'Prologue'}
      title={finale ? 'The Ring Breaks' : 'Ojuelegba, evening'}
      className="cp-screen cp-story-screen"
    >
      <StoryPlayer
        key={ui.story}
        testId={finale ? 'finale-player' : 'prologue-player'}
        lines={finale ? CAMPAIGN.finale : CAMPAIGN.prologue}
        doneLabel={finale ? 'The ending' : 'To the map'}
        onDone={() => commands.campaignStoryDone()}
      />
    </ScreenFrame>
  );
}
