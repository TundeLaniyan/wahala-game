/**
 * Mission briefing: the briefing card (a short summary, the objective line, Read more with the objectives, intel,
 * warnings and the unseen broker's message, Listen), the boss card, and the loadout: fighter, bot level, replay modifier (only ones the save has unlocked) and lives.
 * The fighter and level are stored in the campaign save, never in the menu setup (`settings`).
 */
import { CAMPAIGN, availableModifiers, briefingCard, replayModifierFor } from '../../campaign';
import { CAMPAIGN_LEVEL_DEFS, CHARACTERS } from '../../sim';
import { MISSION_LIVES, isMissionId } from '../../app/campaign';
import { commands } from '../../app/session';
import { DifficultySlider } from '../menu/DifficultyControl';
import { fighterArt } from '../menu/art';
import { ROSTER, fighterInfo } from '../menu/fighters';
import { FighterImage } from '../menu/FighterImage';
import { Field, Option, PrimaryButton, ScreenFrame } from '../menu/Frame';
import { districtNumber } from './model';
import { CardView } from './CardView';
import { BossCard, useCampaignUi } from './parts';

export function BriefingScreen() {
  const ui = useCampaignUi();
  if (!ui || !isMissionId(ui.selected)) return null;
  const id = ui.selected;
  const d = CAMPAIGN.districts[id];
  const card = briefingCard(id);
  const boss = d.boss!;
  const { save } = ui;
  const modifiers = availableModifiers(save, id);
  const intro = !save.districts[id].introSeen;
  const f = fighterInfo(save.character);
  return (
    <ScreenFrame
      id="briefing"
      kicker={`District ${districtNumber(id)} of 6 · ${d.name}`}
      title={card.title}
      className="cp-screen cp-brief-screen"
      status={
        <span className="mn-chosen" data-testid="briefing-loadout-summary">
          <b>{f.name}</b> · {MISSION_LIVES} lives · {CAMPAIGN_LEVEL_DEFS[save.campaignLevel].label}
          {ui.modifier ? ` · ${replayModifierFor(id).name}` : ''}
        </span>
      }
      actions={
        <PrimaryButton testId="briefing-start" autoFocus onClick={() => commands.campaignStart()}>
          {intro ? 'Meet the boss' : 'Start mission'}
        </PrimaryButton>
      }
    >
      {ui.notice && (
        <p className="cp-notice" role="status" data-testid="campaign-notice">
          <span>{ui.notice}</span>
          <button type="button" className="mn-link" onClick={() => commands.campaignDismissNotice()}>
            OK
          </button>
        </p>
      )}
      <div className="cp-brief">
        <section className="cp-brief-main">
          <CardView card={card} testId="briefing-text" />
        </section>

        <section className="cp-brief-side">
          <BossCard boss={boss} />
          <div className="cp-panel mn-panel cp-loadout" data-testid="briefing-loadout">
            <small className="mn-kicker">Loadout</small>
            <div className="cp-roster" role="group" aria-label="Fighter" data-testid="briefing-roster">
              {ROSTER.map((c) => {
                const on = c === save.character;
                return (
                  <button
                    key={c}
                    type="button"
                    className={`mn-roster-card cp-fighter${on ? ' on' : ''}`}
                    aria-pressed={on}
                    data-testid={`briefing-char-${c}`}
                    onClick={() => {
                      commands.click();
                      commands.campaignLoadout({ character: c });
                    }}
                  >
                    <span className="mn-roster-pic">
                      <FighterImage id={c} art={fighterArt(c)} sizes="(max-width: 700px) 24vw, 96px" />
                    </span>
                    <span className="mn-roster-text">
                      <b>{CHARACTERS[c].name}</b>
                      <small>{fighterInfo(c).skillName}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <DifficultySlider
              value={save.difficulty}
              onChange={(difficulty) => commands.campaignLoadout({ difficulty })}
              label="Crew level"
              testId="briefing-diff"
              caption="Crew level"
            />
            <p className="mn-fineprint">
              The crew level is for the boss fight; the boss always fights at Standard or harder. Street and
              raid enemies follow the campaign difficulty.
            </p>
            <Field
              label="Replay modifier"
              hint={
                modifiers.length
                  ? 'A small rule tweak for a replay.'
                  : 'Beat this district to unlock its modifier.'
              }
              testId="briefing-modifiers"
            >
              <div className="mn-opts">
                <Option
                  value={'' as string}
                  current={ui.modifier ?? ''}
                  label="None"
                  testId="modifier-none"
                  onPick={() => commands.campaignModifier(null)}
                />
                {modifiers.map((m) => (
                  <Option
                    key={m}
                    value={m as string}
                    current={ui.modifier ?? ''}
                    label={replayModifierFor(id).name}
                    title={replayModifierFor(id).description}
                    testId={`modifier-${m}`}
                    onPick={() => commands.campaignModifier(m)}
                  />
                ))}
              </div>
              {ui.modifier && <p className="mn-fineprint">{replayModifierFor(id).description}</p>}
            </Field>
            <p className="cp-lives" data-testid="briefing-lives">
              Lives: <b>{MISSION_LIVES}</b>. None left and the mission is lost.
            </p>
          </div>
        </section>
      </div>
    </ScreenFrame>
  );
}
