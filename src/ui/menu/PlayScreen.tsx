/**
 * Choose How to Play: the three ways in, all visible at once (no carousel), CITY RUMBLE first and most prominent (decision
 * FU2-4), then QUICK START (one tap starts an offline City Rumble Free-for-All through the normal loading lifecycle, decision
 * FU2-1) and CLASSIC BLAST (secondary, fully playable; each of those two opens or starts at once). City Rumble and Classic Blast open
 * Match Setup with that battle style already selected. The Story Campaign has its own Home entrance and is not repeated here.
 * Everything writes the real `GameSettings` through `commands`; the rules are never changed from here.
 */
import { commands } from '../../app/session';
import { QUICK_MATCH, QUICK_MATCH_FIGHTERS, QUICK_MATCH_MINUTES } from '../../app/quickMatch';
import { useGameStore } from '../../app/store';
import { RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS } from '../../sim';
import { fighterArt } from './art';
import { stagePreviewUrl } from './arenaInfo';
import { FighterImage } from './FighterImage';
import { ScreenFrame } from './Frame';

/** The card copy (pure data: unit-tested, and the words the founder approved for the two styles). */
export const PLAY_CHOICES = {
  quick: {
    name: 'Quick Start',
    tag: 'Start here',
    // generated from the real Quick Start values, so the card can never promise a different match than it starts
    text: `City Rumble Free-for-All. You and ${QUICK_MATCH_FIGHTERS - 1} Rookie bots, ${QUICK_MATCH_MINUTES} minutes. Starts at once.`,
  },
  classic: {
    name: 'Classic Blast',
    tag: 'Grid battles',
    text: 'Grid battles. Cross-shaped explosions. Tactical generator action.',
  },
  rumble: {
    name: 'City Rumble',
    tag: 'Open 3D arenas',
    text: 'Open 3D arenas. Generators, special attacks and rival fighters.',
  },
} as const;

export function PlayScreen() {
  const character = useGameStore((st) => st.settings.character);
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
        <div className="mn-play-card quick" data-testid="play-quick-card">
          <button
            type="button"
            className="mn-play-main"
            data-testid="play-quick"
            aria-label={`${PLAY_CHOICES.quick.name}. ${PLAY_CHOICES.quick.tag}. ${PLAY_CHOICES.quick.text}`}
            data-quick-arena={QUICK_MATCH.rumbleArenaId}
            onClick={() => {
              commands.startQuickMatch();
            }}
          >
            <span className="mn-play-pic fighter" aria-hidden>
              <FighterImage
                id={character}
                art={fighterArt(character)}
                sizes="(max-width: 700px) 30vw, 240px"
              />
            </span>
            <span className="mn-play-tag">{PLAY_CHOICES.quick.tag}</span>
            <span className="mn-play-text">
              <b>{PLAY_CHOICES.quick.name}</b>
              <span>{PLAY_CHOICES.quick.text}</span>
            </span>
            <span className="mn-play-go" aria-hidden>
              Play now →
            </span>
          </button>
        </div>
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
