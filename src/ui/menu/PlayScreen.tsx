/**
 * Choose How to Play: the three ways in, all visible at once (no carousel): QUICK MATCH (START HERE: one tap starts
 * a beginner match through the normal loading lifecycle), CLASSIC BLAST and CITY RUMBLE (each opens Match Setup with
 * that battle style already selected). The Story Campaign has its own Home entrance and is not repeated here.
 * Everything writes the real `GameSettings` through `commands`; the rules are never changed from here.
 */
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { quickMatchPatch } from '../../app/quickMatch';
import { RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS } from '../../sim';
import { fighterArt } from './art';
import { stagePreviewUrl } from './arenaInfo';
import { FighterImage } from './FighterImage';
import { ScreenFrame } from './Frame';

/** The card copy (pure data: unit-tested, and the words the founder approved for the two styles). */
export const PLAY_CHOICES = {
  quick: {
    name: 'Quick Match',
    tag: 'Start here',
    text: 'You and two bots on a small arena. Easy bots, no setup. Starts at once.',
    customise: 'Customise',
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
        <div className="mn-play-card quick" data-testid="play-quick-card">
          <button
            type="button"
            className="mn-play-main"
            data-testid="play-quick"
            data-autofocus=""
            aria-label={`${PLAY_CHOICES.quick.name}. ${PLAY_CHOICES.quick.tag}. ${PLAY_CHOICES.quick.text}`}
            onClick={() => {
              commands.updateSettings(quickMatchPatch());
              commands.start();
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
          <button
            type="button"
            className="mn-play-sub"
            data-testid="play-quick-customise"
            onClick={() => {
              commands.updateSettings(quickMatchPatch());
              commands.menuOpen('setup');
            }}
          >
            {PLAY_CHOICES.quick.customise}
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
        <PlayCard
          id="rumble"
          testId="home-rumble"
          preview={stagePreviewUrl(RUMBLE_ARENA_IDS[0]!)}
          onPick={() => {
            commands.updateSettings({ play: 'rumble' });
            commands.menuOpen('setup');
          }}
        />
      </div>
    </ScreenFrame>
  );
}

function PlayCard(props: { id: 'classic' | 'rumble'; testId: string; preview: string; onPick: () => void }) {
  const c = PLAY_CHOICES[props.id];
  return (
    <div className={`mn-play-card ${props.id}`}>
      <button
        type="button"
        className="mn-play-main"
        data-testid={props.testId}
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
