/**
 * Mission result (its own screen; the normal match results are never used for missions). Victory: the boss's
 * defeat scene, stars, time, rewards, consequence, newly opened districts and Next district. Defeat or timeout:
 * what went wrong and a hint from the boss's counterplay text, with Retry.
 */
import { CAMPAIGN, availableModifiers, defeatLines, nextDistrict, replayModifierFor } from '../../campaign';
import { isMissionId } from '../../app/campaign';
import { commands } from '../../app/session';
import { PrimaryButton, ScreenFrame, SecondaryButton } from '../menu/Frame';
import { clock, failureText, retryHint, unlockLabel, victoryTitle } from './model';
import { Stars, StoryLineView, useCampaignUi } from './parts';
import { SectionResultScreen } from './SectionResultScreen';

export function ResultScreen() {
  const ui = useCampaignUi();
  const result = ui?.result;
  if (ui?.sectionResult) return <SectionResultScreen />; // a field mission or standalone raid of a section
  if (!ui || !result || !isMissionId(result.outcome.missionId)) return null;
  const { outcome, reward } = result;
  const id = outcome.missionId;
  const d = CAMPAIGN.districts[id];
  const boss = d.boss!;
  const won = outcome.result === 'won';
  const nextOpen = reward.unlockedDistricts[0] ?? null;
  const modifiers = availableModifiers(ui.save, id);
  const hint = retryHint(boss, outcome);
  const unlockLines = reward.unlocks.map(unlockLabel);
  const hasNext = nextOpen !== null || nextDistrict(id) !== null;
  return (
    <ScreenFrame
      id="campaignResult"
      kicker={`${d.name} · ${won ? 'mission complete' : outcome.result === 'timeout' ? 'time up' : 'mission failed'}`}
      title={won ? victoryTitle(boss, outcome) : outcome.result === 'timeout' ? 'Out of time' : 'Put down'}
      className={`cp-screen cp-result ${won ? 'won' : 'lost'}`}
      onBack={() => commands.campaignMap()}
      backLabel="Map"
      actions={
        won ? (
          reward.campaignComplete ? (
            <PrimaryButton testId="result-finale" autoFocus onClick={() => commands.campaignStory('finale')}>
              Watch the finale
            </PrimaryButton>
          ) : hasNext ? (
            <PrimaryButton testId="result-next" autoFocus onClick={() => commands.campaignNext()}>
              Next district
            </PrimaryButton>
          ) : (
            <PrimaryButton testId="result-map-main" autoFocus onClick={() => commands.campaignMap()}>
              Back to map
            </PrimaryButton>
          )
        ) : (
          <PrimaryButton testId="result-retry" autoFocus onClick={() => commands.campaignRetry()}>
            Retry
          </PrimaryButton>
        )
      }
      status={
        <span data-testid="result-line">
          {won ? (
            <>
              <Stars n={outcome.stars} /> {clock(outcome.seconds)}
            </>
          ) : (
            <>Attempt {ui.save.districts[id].attempts}</>
          )}
        </span>
      }
    >
      <div className="cp-result-grid">
        <section className="cp-result-main">
          {won ? (
            <>
              <div className="cp-panel mn-panel cp-stats" data-testid="result-stats">
                <Stars n={outcome.stars} big />
                <dl>
                  <div>
                    <dt>Time</dt>
                    <dd data-testid="result-time">{clock(outcome.seconds)}</dd>
                  </div>
                  <div>
                    <dt>Lives lost</dt>
                    <dd>{outcome.livesUsed}</dd>
                  </div>
                  <div>
                    <dt>Phases</dt>
                    <dd>{outcome.phasesCleared} of 3</dd>
                  </div>
                  <div>
                    <dt>Eliminations</dt>
                    <dd>{outcome.creditedKills}</dd>
                  </div>
                </dl>
                {outcome.modifiers.length > 0 && (
                  <p className="cp-chip-line">
                    Replay modifier: <b>{replayModifierFor(id).name}</b>
                  </p>
                )}
              </div>
              <div className="cp-panel mn-panel cp-scene" data-testid="result-scene">
                <small className="mn-kicker">The scene</small>
                {defeatLines(boss, outcome.defeat).map((line, i) => (
                  <StoryLineView key={i} line={line} />
                ))}
              </div>
            </>
          ) : (
            <div className="cp-panel mn-panel" data-testid="result-failure">
              <small className="mn-kicker">What went wrong</small>
              <p className="cp-summary">{failureText(outcome)}</p>
              <h4>Hint</h4>
              <p data-testid="result-hint-phase">{hint.phase}</p>
              <p className="cp-hint" data-testid="result-hint">
                {hint.counterplay}
              </p>
            </div>
          )}
        </section>
        <section className="cp-result-side">
          {won && (
            <div className="cp-panel mn-panel" data-testid="result-rewards">
              <small className="mn-kicker">Rewards</small>
              {reward.rewards.length === 0 && reward.unlocks.length === 0 ? (
                <p>
                  {reward.firstClear
                    ? 'Nothing new this time.'
                    : 'Already earned. Stars and best time are kept.'}
                </p>
              ) : (
                <ul className="cp-rewards">
                  {reward.rewards.map((r) => (
                    <li key={r.id} data-testid="result-reward">
                      <b>{r.name}</b>
                      <small>{r.description}</small>
                    </li>
                  ))}
                  {unlockLines.map((u) => (
                    <li key={u} data-testid="result-unlock">
                      <b>{u}</b>
                    </li>
                  ))}
                </ul>
              )}
              <h4>What changes</h4>
              <p data-testid="result-consequence">
                {reward.firstClear ? boss.consequence : 'The district stays as you left it.'}
              </p>
              {reward.unlockedDistricts.length > 0 && (
                <p className="cp-chip-line" data-testid="result-unlocked-districts">
                  Opened: <b>{reward.unlockedDistricts.map((u) => CAMPAIGN.districts[u].name).join(', ')}</b>
                </p>
              )}
            </div>
          )}
          <div className="cp-result-actions">
            {won && modifiers[0] && (
              <SecondaryButton
                className="small"
                testId="result-modifier"
                onClick={() => commands.campaignBriefing(id, modifiers[0])}
              >
                Replay: {replayModifierFor(id).name}
              </SecondaryButton>
            )}
            {won ? (
              <SecondaryButton
                className="small"
                testId="result-replay"
                onClick={() => commands.campaignRetry()}
              >
                Play again
              </SecondaryButton>
            ) : (
              <SecondaryButton
                className="small"
                testId="result-briefing"
                onClick={() => commands.campaignBriefing(id)}
              >
                Briefing
              </SecondaryButton>
            )}
            <SecondaryButton className="small" testId="result-map" onClick={() => commands.campaignMap()}>
              Back to map
            </SecondaryButton>
          </div>
        </section>
      </div>
    </ScreenFrame>
  );
}
