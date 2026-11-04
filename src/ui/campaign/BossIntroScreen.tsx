/**
 * Boss introduction: the boss's introduction lines (text only), then the mission starts. Shown the first time
 * a district is played; the briefing starts the mission directly afterwards.
 */
import { CAMPAIGN } from '../../campaign';
import { commands } from '../../app/session';
import { ScreenFrame } from '../menu/Frame';
import { isMissionId as isMission } from '../../app/campaign';
import { BossCard, StoryPlayer, useCampaignUi } from './parts';

export function BossIntroScreen() {
  const ui = useCampaignUi();
  if (!ui || !isMission(ui.selected)) return null;
  const boss = CAMPAIGN.districts[ui.selected].boss;
  if (!boss) return null;
  return (
    <ScreenFrame
      id="bossIntro"
      kicker={`${CAMPAIGN.districts[ui.selected].name} · the keeper`}
      title={boss.name}
      className="cp-screen cp-intro-screen"
    >
      <div className="cp-intro">
        <BossCard boss={boss} compact />
        <StoryPlayer
          key={ui.selected}
          testId="boss-intro-player"
          lines={boss.introduction}
          doneLabel="Start mission"
          onDone={() => commands.campaignBossIntroDone()}
        />
      </div>
    </ScreenFrame>
  );
}
