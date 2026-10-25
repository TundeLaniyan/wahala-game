/**
 * Home: the WAHALA! title over the Lagos key art, four large choices (City Rumble, Classic Battle,
 * Training Academy, Settings) and the saved-setup card with Quick Play for returning players. Offline,
 * one human against AI bots: no accounts, servers or store.
 */
import { CHARACTERS, RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS } from '../../sim';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { setupSummary } from '../../app/setupSummary';
import { fighterArt } from './art';
import { fighterInfo } from './fighters';
import { FighterImage } from './FighterImage';

function HomeItem(props: {
  testId: string;
  title: string;
  tag?: string;
  text: string;
  icon: string;
  flagship?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`mn-home-item${props.flagship ? ' flagship' : ''}`}
      data-testid={props.testId}
      data-autofocus={props.flagship ? '' : undefined}
      onClick={props.onClick}
    >
      <span className="mn-home-icon" aria-hidden>
        {props.icon}
      </span>
      <span className="mn-home-text">
        <b>
          {props.title}
          {props.tag && <em>{props.tag}</em>}
        </b>
        <small>{props.text}</small>
      </span>
      <span className="mn-home-go" aria-hidden>
        ›
      </span>
    </button>
  );
}

export function HomeScreen() {
  const s = useGameStore((st) => st.settings);
  const loading = useGameStore((st) => st.loading);
  useGameStore((st) => st.portraitsVersion);
  const busy = loading !== null && loading.done < loading.total;
  const fighter = fighterInfo(s.character);
  return (
    <section className="mn-screen mn-screen-home" data-testid="menu-home">
      <header className="mn-home-top">
        <span className="mn-pill">
          <i className="dot" /> Offline · You vs AI bots
        </span>
        <span className="mn-home-tools">
          <button
            type="button"
            className={`mn-icon-btn${s.muted ? ' off' : ''}`}
            data-testid="home-mute"
            aria-pressed={s.muted}
            aria-label={s.muted ? 'Sound off (tap to unmute)' : 'Sound on (tap to mute)'}
            onClick={() => commands.updateSettings({ muted: !s.muted })}
          >
            {s.muted ? '🔇' : '🔊'}
            <span>{s.muted ? 'Muted' : 'Sound on'}</span>
          </button>
          <button
            type="button"
            className="mn-icon-btn"
            data-testid="home-settings-icon"
            aria-label="Settings"
            onClick={() => commands.menuOpen('settings')}
          >
            ⚙<span>Settings</span>
          </button>
        </span>
      </header>

      <div className="mn-home-main">
        <div className="mn-home-left">
          <h1 className="mn-logo">
            <span className="mn-logo-kicker">No dulling · Lagos street combat</span>
            <b>WAHALA!</b>
            <span className="mn-logo-sub">
              <em>Generator Wars</em> Lagos
            </span>
          </h1>
          <nav className="mn-home-menu" aria-label="Main menu">
            <HomeItem
              testId="home-rumble"
              flagship
              icon="🔥"
              title="City Rumble"
              tag="Up to 32"
              text={`Survival · Deathmatch · Team Rumble · ${RUMBLE_ARENA_IDS.length} Lagos stages`}
              onClick={() => {
                commands.updateSettings({ play: 'rumble' });
                commands.menuOpen('mode');
              }}
            />
            <HomeItem
              testId="home-classic"
              icon="▦"
              title="Classic Battle"
              tag="2-4"
              text={`Quick arena match · Wahala Crush · ${STANDARD_ARENA_IDS.length} arenas`}
              onClick={() => {
                commands.updateSettings({ play: 'classic' });
                commands.menuOpen('setup');
              }}
            />
            <HomeItem
              testId="home-academy"
              icon="🎓"
              title="Training Academy"
              text="Interactive lessons: watch it, then play it"
              onClick={() => commands.menuOpen('academy')}
            />
            <HomeItem
              testId="home-settings"
              icon="⚙"
              title="Settings"
              text="Audio · Graphics · Controls · Accessibility"
              onClick={() => commands.menuOpen('settings')}
            />
          </nav>
        </div>

        <aside className="mn-home-card" data-testid="quick-card">
          <div className="mn-home-card-art">
            <FighterImage id={s.character} art={fighterArt(s.character)} sizes="(max-width: 700px) 30vw, 220px" />
          </div>
          <div className="mn-home-card-body">
            <small className="mn-kicker">Your fighter</small>
            <h3>{CHARACTERS[s.character].name}</h3>
            <p className="mn-home-card-facts">
              <span>{fighter.skillName}</span>
              <span>{fighter.vehicleName}</span>
            </p>
            <small className="mn-kicker">Last setup</small>
            <p className="mn-home-summary" data-testid="setup-summary">
              {setupSummary(s)}
            </p>
            <div className="mn-home-card-actions">
              <button
                type="button"
                className="mn-btn mn-primary small"
                data-testid="quick-play"
                disabled={busy}
                onClick={() => commands.start()}
              >
                {busy ? 'Loading…' : 'Quick play'}
                <span className="mn-arrow" aria-hidden>
                  →
                </span>
              </button>
              <button
                type="button"
                className="mn-btn mn-secondary small"
                data-testid="quick-review"
                onClick={() => commands.menuOpen('ready')}
              >
                Review
              </button>
            </div>
          </div>
        </aside>
      </div>

      <footer className="mn-home-foot">
        <span className="mn-keys">
          <kbd>↑↓</kbd> Navigate <kbd>Enter</kbd> / <kbd>A</kbd> Select <kbd>Esc</kbd> / <kbd>B</kbd> Back
        </span>
        <span className="mn-footnote">Offline · no accounts · no servers</span>
      </footer>
    </section>
  );
}
