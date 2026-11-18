/**
 * Mission result (its own screen; the normal match results are never used for missions). One result card: a
 * one or two sentence summary, the next step as the objective line, and Read more (victory: the boss's defeat
 * scene, what changes and the rewards in full; defeat or timeout: the phase to retry and the boss's counterplay
 * hint). Stars, time, reward names and the opened districts stay on screen; Retry / Next district are always there.
 */
import {
  CAMPAIGN,
  availableModifiers,
  bossFor,
  missionResultCard,
  nextDistrict,
  replayModifierFor,
} from '../../campaign';
import { FINALE_MISSION_ID } from '../../sim';
import { isMissionId } from '../../app/campaign';
import { commands } from '../../app/session';
import { PrimaryButton, ScreenFrame, SecondaryButton } from '../menu/Frame';
import { CardView } from './CardView';
import { clock, unlockLabel } from './model';
import { PartsLine } from './PartsLine';
import { Stars, useCampaignUi } from './parts';
import { SectionResultScreen } from './SectionResultScreen';
import { ringLostLine, upNextLine } from './sectionModel';

export function ResultScreen() {
  const ui = useCampaignUi();
  const result = ui?.result;
  if (ui?.sectionResult) return <SectionResultScreen />; // a field mission or standalone raid of a section
  if (!ui || !result || !isMissionId(result.outcome.missionId)) return null;
  const { outcome, reward } = result;
  const id = outcome.missionId;
  const d = CAMPAIGN.districts[id];
  // a district's keeper, or the Ojuelegba finale's enforcer (the hub content has no boss)
  const boss = bossFor(id);
  const won = outcome.result === 'won';
  const nextOpen = reward.unlockedDistricts[0] ?? null;
  const modifiers = availableModifiers(ui.save, id);
  const unlockLines = reward.unlocks.map(unlockLabel);
  // the finale is the last chapter: no district follows it
  const upNext = id === FINALE_MISSION_ID ? null : (nextOpen ?? nextDistrict(id));
  const hasNext = upNext !== null;
  const ringLost = won ? ringLostLine(`${id}.boss`) : null;
  const upNextText = won ? upNextLine(ui.save) : null;
  const card = missionResultCard({
    boss,
    outcome,
    districtName: d.name,
    nextName: upNext ? CAMPAIGN.districts[upNext].name : null,
    finale: reward.campaignComplete,
    firstClear: reward.firstClear,
    rewardLines: [...reward.rewards.map((r) => `${r.name}: ${r.description}`), ...unlockLines],
  });
  return (
    <ScreenFrame
      id="campaignResult"
      kicker={`${d.name} · ${won ? 'mission complete' : outcome.result === 'timeout' ? 'time up' : 'mission failed'}`}
      title={card.title}
      className={`cp-screen cp-result ${won ? 'won' : 'lost'}`}
      onBack={() => commands.campaignMap()}
      backLabel="Map"
      actions={
        won ? (
          reward.campaignComplete ? (
            <PrimaryButton testId="result-finale" autoFocus onClick={() => commands.campaignStory('finale')}>
              Watch the finale
            </PrimaryButton>
          ) : reward.finaleOpened ? (
            // Lekki has fallen: the interim beat leads home to the Ojuelegba finale (FN9)
            <PrimaryButton
              testId="result-interim"
              autoFocus
              onClick={() => commands.campaignStory('interim')}
            >
              Home to Ojuelegba
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
          <CardView card={card} testId="result-card">
            {won && (
              <div className="cp-stats cp-stats-row" data-testid="result-stats">
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
            )}
          </CardView>
        </section>
        <section className="cp-result-side">
          {won && (
            <div className="cp-panel mn-panel" data-testid="result-rewards">
              <small className="mn-kicker">Rewards</small>
              {reward.rewards.length === 0 && reward.unlocks.length === 0 ? (
                <p className="cp-chip-line">
                  {reward.firstClear
                    ? 'Nothing new this time.'
                    : 'Already earned. Stars and best time are kept.'}
                </p>
              ) : (
                <ul className="cp-rewards">
                  {reward.rewards.map((r) => (
                    <li key={r.id} data-testid="result-reward">
                      <b>{r.name}</b>
                    </li>
                  ))}
                  {unlockLines.map((u) => (
                    <li key={u} data-testid="result-unlock">
                      <b>{u}</b>
                    </li>
                  ))}
                </ul>
              )}
              <PartsLine
                gained={result.partsGained}
                district={id}
                save={ui.save}
                className="cp-chip-line cp-parts"
              />
              {reward.unlockedDistricts.length > 0 && (
                <p className="cp-chip-line" data-testid="result-unlocked-districts">
                  Opened: <b>{reward.unlockedDistricts.map((u) => CAMPAIGN.districts[u].name).join(', ')}</b>
                </p>
              )}
              {ringLost && (
                <p className="cp-chip-line cp-ringlost" data-testid="result-ring-lost">
                  Ring weakened: {ringLost}
                </p>
              )}
              {upNextText && (
                <p className="cp-chip-line cp-upnext" data-testid="result-up-next">
                  {upNextText}
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
