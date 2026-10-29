/**
 * Ready to play: everything the next match will use, read back from the real settings, each with an Edit
 * button that changes just that choice and comes straight back here. Start runs the existing game-start
 * command once (repeat presses while it launches are ignored) and waits for the 3D assets if needed.
 */
import { useRef, useState } from 'react';
import { ARENAS } from '../../sim';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { competitorCount } from '../../app/names';
import type { MenuScreen } from '../../app/menu';
import type { GameSettings } from '../../app/settings';
import { LEVEL_LABEL, botSlots, mixedRange, sharedLevel, slotLevel } from '../difficultyPicker';
import { fighterArt } from './art';
import { selectedArenaId, stagePreviewUrl, hasPreview, moodGradient } from './arenaInfo';
import { fighterInfo } from './fighters';
import { FighterImage } from './FighterImage';
import { MODE_CARDS, modeOf } from './ModeScreen';
import { ScreenFrame } from './Frame';

/** The rules the chosen game plays by (pure: unit-tested). */
export function matchRulesText(s: GameSettings): string[] {
  if (s.play === 'classic')
    return [
      'Last one standing wins; everyone down at once is a draw',
      'Wahala Crush closes the board near the end (always on)',
      'Floor traps erupt at 0:30 and 0:15',
      s.crowdThrows ? 'Crowd throws: on' : 'Crowd throws: off',
    ];
  const rules: string[] = [];
  if (s.rumbleMode === 'survival')
    rules.push('One life: last one standing wins', 'The city closes in street by street');
  if (s.rumbleMode === 'deathmatch')
    rules.push(`${s.rumbleMinutes} minutes, respawns on`, 'Most eliminations wins');
  if (s.rumbleMode === 'team')
    rules.push(
      `${s.rumbleMinutes} minutes, respawns on`,
      'Green (you) v White: most team eliminations wins',
      s.friendlyFire ? 'Friendly fire: on' : 'Friendly fire: off',
    );
  rules.push(
    s.rumbleBlast === 'cross'
      ? 'Cross blasts (experiment): the Classic plus'
      : 'Radial blasts: a circle around the generator; walls and crates shadow it',
  );
  rules.push('Eliminations power you up (crates drop nothing)');
  return rules;
}

/**
 * "Skilled", "Mixed roster: Casual to Expert", "Bot 1 Rookie, Bot 2 Expert" ... Says outright whether the
 * level applies to every bot or to a mixed roster.
 */
export function botLevelText(s: GameSettings): string {
  if (s.play === 'rumble') {
    if (!s.rumbleMixed) return `${LEVEL_LABEL[s.difficulty]} (all bots)`;
    const { lo, hi } = mixedRange(s.difficulty);
    return `Mixed roster: ${LEVEL_LABEL[lo]} to ${LEVEL_LABEL[hi]}`;
  }
  const shared = sharedLevel(s);
  if (shared) return `${LEVEL_LABEL[shared]} (all bots)`;
  return `Mixed: ${Array.from({ length: botSlots(s) }, (_, i) => `Bot ${i + 1} ${LEVEL_LABEL[slotLevel(s, i)]}`).join(', ')}`;
}

/** One reviewed choice with an Edit button that opens just the screen that sets it and comes back here. */
function Row(props: {
  label: string;
  value: React.ReactNode;
  /** The menu screen that changes it. */
  screen: MenuScreen;
  /** Test id suffix of the Edit button (`edit-<id>`). */
  id: string;
  testId: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mn-ready-row" data-testid={props.testId}>
      <div>
        <small>{props.label}</small>
        <b>{props.value}</b>
        {props.extra}
      </div>
      <button
        type="button"
        className="mn-edit"
        data-testid={`edit-${props.id}`}
        aria-label={`Edit ${props.label.toLowerCase()}`}
        onClick={() => commands.menuEdit(props.screen)}
      >
        Edit
      </button>
    </div>
  );
}

export function ReadyScreen() {
  const s = useGameStore((st) => st.settings);
  const loading = useGameStore((st) => st.loading);
  useGameStore((st) => st.portraitsVersion);
  const [launching, setLaunching] = useState(false);
  const launched = useRef(false);
  const busy = loading !== null && loading.done < loading.total;
  const mode = MODE_CARDS.find((m) => m.id === modeOf(s))!;
  const arenaId = selectedArenaId(s);
  const arena = ARENAS[arenaId]!;
  const total = competitorCount(s);
  const f = fighterInfo(s.character);
  const start = () => {
    if (launched.current || busy) return;
    launched.current = true;
    setLaunching(true);
    commands.start();
  };
  const opponents =
    s.play === 'rumble' && s.rumbleMode === 'team'
      ? `${total / 2} v ${total / 2} (${total - 1} AI bots)`
      : `${total - 1} AI bot${total - 1 === 1 ? '' : 's'} · ${total} fighters`;
  return (
    <ScreenFrame
      id="ready"
      kicker="Review"
      title="Ready to fight"
      status={<span className="mn-chosen">Offline · you against AI bots</span>}
      actions={
        <button
          type="button"
          className="mn-btn mn-primary mn-start"
          data-testid="start-button"
          data-autofocus=""
          disabled={busy || launching}
          onClick={start}
        >
          {busy ? 'Loading 3D…' : launching ? 'Starting…' : 'Start Match'}
          <span className="mn-arrow" aria-hidden>
            →
          </span>
        </button>
      }
    >
      <div className="mn-ready">
        <div className="mn-ready-fighter">
          <FighterImage
            id={s.character}
            art={fighterArt(s.character)}
            sizes="(max-width: 700px) 40vw, 320px"
          />
          <div className="mn-ready-fighter-text">
            <small className="mn-kicker">Your fighter</small>
            <b>{f.name}</b>
            <span>
              {f.skillName} · {f.vehicleName}
            </span>
          </div>
        </div>
        <div className="mn-panel mn-ready-list" data-testid="ready-summary">
          <Row
            label="Mode"
            value={s.play === 'rumble' ? `City Rumble · ${mode.name}` : 'Classic Battle'}
            screen="mode"
            id="mode"
            testId="ready-mode"
          />
          <Row
            label={s.play === 'rumble' ? 'Stage' : 'Arena'}
            value={arena.name}
            screen="setup"
            id="arena"
            testId="ready-arena"
            extra={
              <span className="mn-ready-thumb" style={{ background: moodGradient(arenaId) }}>
                {hasPreview(arenaId) && <img src={stagePreviewUrl(arenaId)} alt="" loading="lazy" />}
              </span>
            }
          />
          <Row label="Fighter" value={f.name} screen="fighter" id="fighter" testId="ready-fighter" />
          <Row label="Opponents" value={opponents} screen="setup" id="setup" testId="ready-opponents" />
          <Row label="Bot level" value={botLevelText(s)} screen="setup" id="bots" testId="ready-difficulty" />
        </div>
        <div className="mn-panel mn-ready-rules" data-testid="ready-rules">
          <h4>Match rules</h4>
          <ul>
            {matchRulesText(s).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>
    </ScreenFrame>
  );
}
