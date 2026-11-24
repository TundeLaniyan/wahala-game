/**
 * Home: the WAHALA! title over the Lagos key art with the three playable fighters, one dominant PLAY button and two
 * secondary choices (STORY CAMPAIGN / CONTINUE STORY, LEARN TO PLAY); Settings and Sound are small utility buttons.
 * Offline, one human against AI bots: no accounts, servers or store. Everything else (Quick Match, Classic Blast,
 * City Rumble, the arena and rules) is one tap further, on Choose How to Play.
 */
import { useState } from 'react';
import { campaignProgress } from '../../campaign';
import { flags } from '../../platform';
import { rumbleOnlineOffered } from '../../app/rumbleFlags';
import { loadRumbleOnline } from '../../online/rumbleEntry';
import { CHARACTERS, CHARACTER_IDS } from '../../sim';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { storyInProgress } from '../campaign/currentMission';
import { fighterArt } from './art';
import { FighterImage } from './FighterImage';

/** The Home copy: one place, so labels stay plain and replaceable. */
export const HOME_COPY = {
  play: { title: 'PLAY', sub: 'Rumble now!' },
  story: { title: 'STORY CAMPAIGN', continueTitle: 'CONTINUE STORY' },
  learn: { title: 'LEARN TO PLAY', sub: 'Training Academy' },
} as const;

/** The Online City Rumble entry: loads the online chunk (guarded dynamic import) and opens its flow. Never at page load. */
async function openRumbleOnline(): Promise<boolean> {
  try {
    const api = await loadRumbleOnline();
    api?.open();
    return api !== null;
  } catch {
    return false; // the online chunk could not be fetched (offline, a stale cache): say so instead of doing nothing
  }
}

export function HomeScreen() {
  const [onlineFailed, setOnlineFailed] = useState(false);
  const s = useGameStore((st) => st.settings);
  useGameStore((st) => st.portraitsVersion);
  const campaign = useGameStore((st) => st.campaign);
  const showCampaign = flags().campaign && !!campaign;
  const progress = campaign?.started ? campaignProgress(campaign.save) : null;
  const inProgress = !!campaign?.started && storyInProgress(campaign.save);
  return (
    <section className="mn-screen mn-screen-home" data-testid="menu-home">
      <div className="mn-home-heroes" aria-hidden>
        {CHARACTER_IDS.filter((id) => fighterArt(id)).map((id) => (
          <span key={id} className={`mn-home-hero${id === s.character ? ' on' : ''}`}>
            <FighterImage id={id} art={fighterArt(id)} sizes="(max-width: 700px) 22vw, 200px" />
            <i>{CHARACTERS[id].name}</i>
          </span>
        ))}
      </div>

      <div className="mn-home-main">
        <h1 className="mn-logo">
          <b>WAHALA!</b>
          <span className="mn-logo-sub">Lagos City Rumble</span>
        </h1>
        <nav className="mn-home-menu" aria-label="Main menu">
          <button
            type="button"
            className="mn-home-play"
            data-testid="home-play"
            data-autofocus=""
            onClick={() => commands.menuOpen('play')}
          >
            <b>{HOME_COPY.play.title}</b>
            <small>{HOME_COPY.play.sub}</small>
          </button>
          {showCampaign && (
            <button
              type="button"
              className="mn-home-second story"
              data-testid="home-campaign"
              onClick={() => commands.campaignOpen()}
            >
              <b>{inProgress ? HOME_COPY.story.continueTitle : HOME_COPY.story.title}</b>
              {progress && (
                <small data-testid="home-campaign-progress">
                  {progress.cleared} / {progress.total} cleared
                </small>
              )}
            </button>
          )}
          <button
            type="button"
            className="mn-home-second learn"
            data-testid="home-academy"
            onClick={() => commands.menuOpen('academy')}
          >
            <b>{HOME_COPY.learn.title}</b>
          </button>
          {__WAHALA_SERVER_ONLINE__ && rumbleOnlineOffered() && (
            <button
              type="button"
              className="mn-home-second rumble-online"
              data-testid="home-rumble-online"
              onClick={() => void openRumbleOnline().then((ok) => setOnlineFailed(!ok))}
            >
              <b>PLAY ONLINE</b>
              <small role={onlineFailed ? 'alert' : undefined}>
                {onlineFailed
                  ? "Couldn't load Online. Check your connection."
                  : 'City Rumble · up to 32 fighters'}
              </small>
            </button>
          )}
          {flags().online && (
            <button
              type="button"
              className="mn-home-second online"
              data-testid="home-online"
              onClick={() => commands.menuOpen('online')}
            >
              <b>Online</b>
              <small>Preview · mock server · no real players</small>
            </button>
          )}
        </nav>
      </div>

      <footer className="mn-home-tools" aria-label="Utilities">
        <button
          type="button"
          className="mn-util"
          data-testid="home-settings-icon"
          aria-label="Settings"
          onClick={() => commands.menuOpen('settings')}
        >
          <span aria-hidden>⚙</span>
        </button>
        <button
          type="button"
          className={`mn-util${s.muted ? ' off' : ''}`}
          data-testid="home-mute"
          aria-pressed={s.muted}
          aria-label={s.muted ? 'Sound off (tap to unmute)' : 'Sound on (tap to mute)'}
          onClick={() => commands.updateSettings({ muted: !s.muted })}
        >
          <span aria-hidden>{s.muted ? '🔇' : '🔊'}</span>
        </button>
        <span className="mn-keys">
          <kbd>↑↓</kbd> Navigate <kbd>Enter</kbd> Select <kbd>Esc</kbd> Back
        </span>
      </footer>
    </section>
  );
}
