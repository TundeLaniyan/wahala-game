/**
 * Prologue and finale cutscenes as ONE story card: a one or two sentence summary, the objective line, Read more
 * (the whole scene, line by line) and an optional Listen button. Continue always works. The unseen broker is
 * only a message / call card from UNKNOWN NUMBER inside Read more (never a face, portrait or silhouette).
 * Reaching Continue is what records the scene in the save (app/campaign.ts `storyDone`).
 */
import { storyCard } from '../../campaign';
import { commands } from '../../app/session';
import { ScreenFrame } from '../menu/Frame';
import { CardView, ContinueButton, useScene } from './CardView';
import { useCampaignUi } from './parts';

export function StoryScreen() {
  const ui = useCampaignUi();
  const finale = ui?.story === 'finale';
  const card = storyCard(finale ? 'finale' : 'prologue');
  const scene = useScene(() => commands.campaignStoryDone(), card.id);
  if (!ui) return null;
  return (
    <ScreenFrame
      id="campaignStory"
      kicker={card.kicker ?? ''}
      title={card.title}
      className="cp-screen cp-story-screen"
      actions={<ContinueButton scene={scene} label={finale ? 'The ending' : 'To the map'} />}
    >
      <CardView card={card} testId={finale ? 'finale-player' : 'prologue-player'} />
    </ScreenFrame>
  );
}
