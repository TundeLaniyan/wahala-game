/**
 * The short visual briefing before a field mission or a standalone raid (docs/MISSION_GUIDANCE.md, decision MG1): the
 * district and mission title, the target picture, the one main objective, how it is done, START MISSION and Back. No
 * cutscene: one screen. A replay (the mission is cleared) shows the compact card (the picture and one line) with START
 * focused. No match exists under it, so nothing can hurt the player while it is open.
 */
import { missionStatus } from '../../campaign';
import { missionBrief } from '../../app/missionBrief';
import { commands } from '../../app/session';
import { PrimaryButton, ScreenFrame } from '../menu/Frame';
import { MissionBriefCard } from './MissionBriefCard';
import { useCampaignUi } from './parts';

const FORMAT_KICKER = { field: 'Field mission', raid: 'Classic raid', boss: 'Boss mission' } as const;

export function MissionBriefScreen() {
  const ui = useCampaignUi();
  const brief = ui?.brief ? missionBrief(ui.brief) : null;
  if (!ui || !brief) return null;
  const replay = missionStatus(ui.save, brief.id) === 'cleared';
  return (
    <ScreenFrame
      id="missionBrief"
      kicker={`${brief.district} · ${FORMAT_KICKER[brief.kind]}`}
      title={brief.title}
      className="cp-screen cp-mission-brief"
      onBack={() => commands.campaignMap()}
      status={
        replay ? (
          <span className="mn-chosen" data-testid="mission-brief-replay">
            Replay
          </span>
        ) : undefined
      }
      actions={
        <PrimaryButton testId="mission-brief-start" autoFocus onClick={() => commands.campaignStartBriefed()}>
          Start mission
        </PrimaryButton>
      }
    >
      <MissionBriefCard brief={brief} compact={replay} />
    </ScreenFrame>
  );
}
