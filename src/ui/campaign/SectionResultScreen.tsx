/**
 * The result of a section mission (a field mission or a standalone raid), shown on the campaign result screen when
 * `UiState.campaign.sectionResult` is set: what happened, what opened, and where to go next (the district map, the next
 * suggested mission, or a replay). Short text only; the boss result keeps its own screen.
 */
import { commands } from '../../app/session';
import { PrimaryButton, ScreenFrame, SecondaryButton } from '../menu/Frame';
import { clock } from './model';
import { Stars, useCampaignUi } from './parts';
import { sectionResultText, suggestedMission } from './sectionModel';

export function SectionResultScreen() {
  const ui = useCampaignUi();
  const view = ui?.sectionResult;
  if (!ui || !view) return null;
  const text = sectionResultText(view);
  const next = suggestedMission(ui.save);
  const stars = 'stars' in view.outcome ? view.outcome.stars : 0;
  return (
    <ScreenFrame
      id="campaignResult"
      kicker={text.kicker}
      title={text.title}
      className={`cp-screen cp-result ${text.won ? 'won' : 'lost'}`}
      onBack={() => commands.campaignMap()}
      backLabel="Map"
      actions={
        text.won && next ? (
          <PrimaryButton testId="section-result-next" autoFocus onClick={() => commands.campaignContinue()}>
            {next.format === 'boss' ? 'To the briefing' : `Next: ${next.name}`}
          </PrimaryButton>
        ) : text.won ? (
          <PrimaryButton testId="section-result-map" autoFocus onClick={() => commands.campaignMap()}>
            Back to map
          </PrimaryButton>
        ) : (
          <PrimaryButton testId="section-result-retry" autoFocus onClick={() => commands.campaignRetry()}>
            Retry
          </PrimaryButton>
        )
      }
      status={
        <span data-testid="result-line">
          {text.won && <Stars n={stars} />} {clock(view.outcome.seconds)}
        </span>
      }
    >
      <div className="cp-result-body" data-testid="section-result">
        {text.lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        {text.opened.length > 0 && (
          <p className="cp-opened" data-testid="section-opened">
            <small className="mn-kicker">Now open</small> {text.opened.join(', ')}
          </p>
        )}
        <div className="cp-result-actions">
          {text.won && (
            <SecondaryButton
              className="small"
              testId="section-result-replay"
              onClick={() => commands.campaignRetry()}
            >
              Replay
            </SecondaryButton>
          )}
          {text.won && next && (
            <SecondaryButton
              className="small"
              testId="section-result-map-2"
              onClick={() => commands.campaignMap()}
            >
              District map
            </SecondaryButton>
          )}
        </div>
      </div>
    </ScreenFrame>
  );
}
