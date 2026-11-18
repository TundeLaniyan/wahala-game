/**
 * Boss introduction: a short card (summary, first objective, Read more with the boss's lines, Listen) beside the
 * boss card, then the mission starts. Shown the first time a district is played; Continue always works.
 */
import { CAMPAIGN, bossFor, bossIntroCard } from '../../campaign';
import { commands } from '../../app/session';
import { ScreenFrame } from '../menu/Frame';
import { isMissionId as isMission } from '../../app/campaign';
import { CardView, ContinueButton, useScene } from './CardView';
import { BossCard, useCampaignUi } from './parts';

export function BossIntroScreen() {
  const ui = useCampaignUi();
  const scene = useScene(() => commands.campaignBossIntroDone(), ui?.selected ?? '');
  if (!ui || !isMission(ui.selected)) return null;
  const boss = bossFor(ui.selected); // a district's keeper or the Ojuelegba finale's enforcer
  const card = bossIntroCard(ui.selected);
  if (!boss || !card) return null;
  return (
    <ScreenFrame
      id="bossIntro"
      kicker={`${CAMPAIGN.districts[ui.selected].name} · the keeper`}
      title={boss.name}
      className="cp-screen cp-intro-screen"
      actions={<ContinueButton scene={scene} label="Start mission" />}
    >
      <div className="cp-intro">
        <BossCard boss={boss} compact />
        <CardView key={ui.selected} card={card} testId="boss-intro-player" />
      </div>
    </ScreenFrame>
  );
}
