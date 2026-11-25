/**
 * Choose How to Play: the two games, both visible at once (no carousel), CITY RUMBLE first and most prominent (decision FU2-4)
 * and JUNCTION BLAST (the grid mode, formerly Junction Blast; decision QS1) beside it. Quick Start is not here any more: it is
 * the first button on Home. Each card opens Match Setup for that game only: the City Rumble setup has no Junction Blast
 * choice and the Junction Blast setup has no City Rumble choice (Back returns here). Everything writes the real
 * `GameSettings` through `commands`; the rules are never changed from here. The internal id of Junction Blast stays
 * `classic` (saved settings, sim rulesets, test ids); only the words the player reads changed.
 */
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS } from '../../sim';
import { stagePreviewUrl } from './arenaInfo';
import { ScreenFrame } from './Frame';

/** The card copy (pure data: unit-tested, and the words the founder approved for the two games). */
export const PLAY_CHOICES = {
  rumble: {
    name: 'City Rumble',
    tag: 'Open 3D arenas',
    text: 'Open 3D arenas. Generators, special attacks and rival fighters.',
  },
  classic: {
    name: 'Junction Blast',
    tag: 'Grid battles',
    text: 'Grid battles. Cross-shaped explosions. Tactical generator action.',
  },
} as const;

export function PlayScreen() {
  useGameStore((st) => st.portraitsVersion);
  return (
    <ScreenFrame id="play" kicker="Play" title="Choose how to play">
      <div className="mn-play" role="group" aria-label="Choose how to play">
        <PlayCard
          id="rumble"
          testId="home-rumble"
          preview={stagePreviewUrl(RUMBLE_ARENA_IDS[0]!)}
          flagship
          autoFocus
          onPick={() => {
            commands.updateSettings({ play: 'rumble' });
            commands.menuOpen('setup');
          }}
        />
        <PlayCard
          id="classic"
          testId="home-classic"
          preview={stagePreviewUrl(STANDARD_ARENA_IDS[0]!)}
          onPick={() => {
            commands.updateSettings({ play: 'classic' });
            commands.menuOpen('setup');
          }}
        />
      </div>
    </ScreenFrame>
  );
}

function PlayCard(props: {
  id: 'classic' | 'rumble';
  testId: string;
  preview: string;
  onPick: () => void;
  flagship?: boolean;
  autoFocus?: boolean;
}) {
  const c = PLAY_CHOICES[props.id];
  return (
    <div className={`mn-play-card ${props.id}${props.flagship ? ' flagship' : ''}`}>
      <button
        type="button"
        className="mn-play-main"
        data-testid={props.testId}
        data-autofocus={props.autoFocus ? '' : undefined}
        aria-label={`${c.name}. ${c.text}`}
        onClick={props.onPick}
      >
        <span className="mn-play-pic" style={{ backgroundImage: `url(${props.preview})` }} aria-hidden />
        <span className="mn-play-tag">{c.tag}</span>
        <span className="mn-play-text">
          <b>{c.name}</b>
          <span>{c.text}</span>
        </span>
        <span className="mn-play-go" aria-hidden>
          Choose →
        </span>
      </button>
    </div>
  );
}
