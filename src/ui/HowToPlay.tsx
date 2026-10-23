import { useState } from 'react';
import { CHARACTERS, VEHICLE_DEFS } from '../sim';
import type { CharacterId } from '../sim';
import { CHAPTERS } from '../tutorial';
import type { ControlId } from '../tutorial';
import { portraitUrl } from '../assets/portraits';
import { commands } from '../app/session';
import { useGameStore } from '../app/store';
import type { TutorialView } from '../app/store';
import { legendRows } from './howToPlayControls';
import type { LegendDevice } from './howToPlayControls';
import './HowToPlay.css';

const ROWS = legendRows();

/**
 * Clicking a tutorial button must not leave it focused: Space / Enter are game keys, and a focused
 * button would otherwise be "clicked" again by them in the middle of a practice.
 */
const keepFocusOnGame = (e: { target: EventTarget; preventDefault(): void }): void => {
  if ((e.target as HTMLElement).closest?.('button')) e.preventDefault();
};

/**
 * How to Play: a sidebar beside the live game view. "Watch" plays the chapter's scripted demo in the
 * real engine (captions, pause, replay, chapters); "Practice" hands the controls to the player with
 * passive training dummies and ticks off the goals as the simulation sees them happen.
 */
export function HowToPlay() {
  const view = useGameStore((s) => s.tutorial);
  const [listOpen, setListOpen] = useState(false);
  // the player's own show / hide choice, remembered per mode (watch / practice)
  const [choice, setChoice] = useState<{ mode: TutorialView['mode']; collapsed: boolean } | null>(null);
  if (!view) return null;
  const chapter = CHAPTERS[view.chapter]!;
  const first = view.chapter === 0;
  const last = view.chapter === CHAPTERS.length - 1;
  // on a short landscape phone a practice starts with the lesson folded away, so the arena gets the room
  const collapsed =
    choice && choice.mode === view.mode ? choice.collapsed : view.mode === 'practice' && shortScreen();
  const setCollapsed = (c: boolean) => setChoice({ mode: view.mode, collapsed: c });

  if (collapsed) {
    return (
      <>
        <aside
          className="htp-panel collapsed"
          data-testid="how-to-play"
          data-mode={view.mode}
          data-chapter={chapter.id}
          data-collapsed="true"
          onMouseDown={keepFocusOnGame}
        >
          <button
            type="button"
            className="htp-expand"
            data-testid="htp-expand"
            aria-label="Show the lesson"
            onClick={() => setCollapsed(false)}
          >
            ☰
          </button>
          <span className="htp-mini-num">
            {view.chapter + 1}/{CHAPTERS.length}
          </span>
          {view.practice && (
            <ul className="htp-mini-checks" aria-label="Practice goals">
              {view.practice.checks.map((c, i) => (
                <li
                  key={c.label}
                  className={c.done ? 'done' : ''}
                  title={c.label}
                  data-testid={`htp-check-${i}`}
                  data-done={c.done}
                >
                  {c.done ? '✓' : '○'}
                </li>
              ))}
              {view.practice.complete && (
                <li className="done" data-testid="htp-complete" title="Practice complete">
                  ★
                </li>
              )}
            </ul>
          )}
          <button
            type="button"
            className="htp-mini-exit"
            data-testid="htp-exit"
            aria-label="Exit How to Play"
            onClick={() => commands.exitTutorial()}
          >
            ✕
          </button>
        </aside>
        {view.mode === 'demo' && <Subtitle view={view} />}
        {view.mode === 'practice' && (view.notice || view.practice) && (
          <div
            className={`htp-notice${view.practice?.complete ? ' good' : ''}${view.notice ? '' : ' goal'}`}
            data-testid="htp-notice"
            key={`${view.run}-${view.notice ?? 'goal'}`}
          >
            {view.notice ?? view.practice?.goal}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <aside
        className="htp-panel"
        data-testid="how-to-play"
        data-mode={view.mode}
        data-chapter={chapter.id}
        onMouseDown={keepFocusOnGame}
      >
        <header className="htp-head">
          <button
            type="button"
            className="htp-fold"
            data-testid="htp-collapse"
            aria-label="Hide the lesson panel"
            title="Hide the lesson panel"
            onClick={() => setCollapsed(true)}
          >
            «
          </button>
          <span className="htp-kicker">
            How to play <b>{view.chapter + 1}</b>/{CHAPTERS.length}
          </span>
          <button
            type="button"
            className="htp-exit"
            data-testid="htp-exit"
            onClick={() => commands.exitTutorial()}
          >
            ✕ Exit
          </button>
        </header>
        <div className="htp-nav">
          <button
            type="button"
            className="htp-arrow"
            aria-label="Previous chapter"
            data-testid="htp-prev"
            disabled={first}
            onClick={() => commands.tutorialPrev()}
          >
            ◀
          </button>
          <button
            type="button"
            className="htp-title"
            data-testid="htp-chapters"
            aria-haspopup="dialog"
            onClick={() => setListOpen(true)}
          >
            <h2 data-testid="htp-title">{chapter.title}</h2>
            <small>All chapters ▾</small>
          </button>
          <button
            type="button"
            className="htp-arrow"
            aria-label="Next chapter"
            data-testid="htp-next"
            disabled={last}
            onClick={() => commands.tutorialNext()}
          >
            ▶
          </button>
        </div>
        <div className="htp-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view.mode === 'demo'}
            data-testid="htp-watch"
            onClick={() => commands.tutorialWatch()}
          >
            ▶ Watch
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view.mode === 'practice'}
            data-testid="htp-practice"
            disabled={!chapter.practice}
            title={chapter.practice ? 'Try it yourself' : 'Nothing to practise in this lesson: just watch'}
            onClick={() => commands.tutorialPractice()}
          >
            ✋ Practice
          </button>
        </div>
        {view.mode === 'demo' ? (
          <DemoControls view={view} hasPractice={!!chapter.practice} last={last} />
        ) : (
          <PracticeBody view={view} last={last} />
        )}
        <section className="htp-facts">
          <h3>Remember</h3>
          <ul>
            {chapter.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
        <Legend controls={chapter.controls} />
      </aside>
      {view.mode === 'demo' && <Subtitle view={view} />}
      {view.mode === 'practice' && view.notice && (
        <div
          className={`htp-notice${view.practice?.complete ? ' good' : ''}`}
          data-testid="htp-notice"
          key={`${view.run}-${view.notice}`}
        >
          {view.notice}
        </div>
      )}
      {listOpen && <ChapterList current={view.chapter} onClose={() => setListOpen(false)} />}
    </>
  );
}

function shortScreen(): boolean {
  try {
    return window.matchMedia?.('(max-height: 520px)').matches ?? false;
  } catch {
    return false;
  }
}

function DemoControls({
  view,
  hasPractice,
  last,
}: {
  view: TutorialView;
  hasPractice: boolean;
  last: boolean;
}) {
  const paused = useGameStore((s) => s.paused);
  return (
    <div className="htp-demo">
      <div className="htp-progress" aria-label={`Part ${view.beat + 1} of ${view.beats}`}>
        {Array.from({ length: view.beats }, (_, i) => (
          <i key={i} className={i < view.beat || view.finished ? 'done' : i === view.beat ? 'on' : ''} />
        ))}
      </div>
      <div className="htp-transport">
        <button
          type="button"
          className="btn small"
          data-testid="htp-replay"
          onClick={() => commands.tutorialReplay()}
        >
          ⟲ Replay
        </button>
        {!view.finished && (
          <button
            type="button"
            className="btn small"
            data-testid="htp-pause"
            data-paused={paused}
            onClick={() => commands.tutorialPause()}
          >
            {paused ? '▶ Play' : 'II Pause'}
          </button>
        )}
        {view.finished && !last && (
          <button
            type="button"
            className="btn small primary"
            data-testid="htp-next-chapter"
            onClick={() => commands.tutorialNext()}
          >
            Next ▶
          </button>
        )}
      </div>
      {hasPractice && (
        <button
          type="button"
          className={`btn small ${view.finished ? 'green' : ''} htp-wide`}
          data-testid="htp-practice-this"
          onClick={() => commands.tutorialPractice()}
        >
          ✋ Practice this
        </button>
      )}
    </div>
  );
}

function PracticeBody({ view, last }: { view: TutorialView; last: boolean }) {
  const p = view.practice;
  const paused = useGameStore((s) => s.paused);
  useGameStore((s) => s.portraitsVersion);
  if (!p) return null;
  return (
    <div className="htp-practice" data-testid="htp-practice-body" data-complete={p.complete}>
      <p className="htp-goal">{p.goal}</p>
      <ul className="htp-checks">
        {p.checks.map((c, i) => (
          <li
            key={c.label}
            className={c.done ? 'done' : ''}
            data-testid={`htp-check-${i}`}
            data-done={c.done}
          >
            <span aria-hidden>{c.done ? '✓' : '○'}</span>
            {c.label}
          </li>
        ))}
      </ul>
      {p.complete ? (
        <p className="htp-success" data-testid="htp-complete">
          Practice complete! Keep playing, or move on.
        </p>
      ) : (
        <p className="htp-hint">Tip: {p.hint}</p>
      )}
      {p.characterChoice && (
        <div className="htp-chars" role="group" aria-label="Practise with">
          {(['streetBaller', 'lekkiBoy', 'campusQueen'] as CharacterId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`htp-char${p.character === id ? ' on' : ''}`}
              data-testid={`htp-char-${id}`}
              aria-pressed={p.character === id}
              onClick={() => commands.tutorialCharacter(id)}
            >
              <img src={portraitUrl(id, 0, 64)} alt="" />
              <span>
                {CHARACTERS[id].name}
                <small>{VEHICLE_DEFS[CHARACTERS[id].vehicle].name}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="htp-safe">
        Training dummies only: they never fight back, and nothing here counts as a match.
      </p>
      <div className="htp-transport">
        <button
          type="button"
          className="btn small"
          data-testid="htp-restart"
          onClick={() => commands.tutorialReplay()}
        >
          ⟲ Restart
        </button>
        <button type="button" className="btn small" onClick={() => commands.togglePause()}>
          {paused ? '▶ Resume' : 'II Pause'}
        </button>
        {!last && (
          <button
            type="button"
            className={`btn small${p.complete ? ' primary' : ''}`}
            data-testid="htp-next-chapter"
            onClick={() => commands.tutorialNext()}
          >
            Next ▶
          </button>
        )}
      </div>
    </div>
  );
}

function Subtitle({ view }: { view: TutorialView }) {
  const paused = useGameStore((s) => s.paused);
  return (
    <div className="htp-subtitle" data-testid="htp-caption" aria-live="polite" key={view.run}>
      {view.step && <b className="htp-step">{view.step}</b>}
      <span key={view.beat}>{view.caption}</span>
      {paused && <em className="htp-paused">Paused</em>}
      {view.finished && <em className="htp-paused">End of demo · Replay, practise or go on</em>}
    </div>
  );
}

function defaultDevice(device: string, touchCapable: boolean): LegendDevice {
  if (device === 'gamepad') return 'gamepad';
  if (device === 'touch' || touchCapable) return 'touch';
  return 'keyboard';
}

function Legend({ controls }: { controls: ControlId[] }) {
  const device = useGameStore((s) => s.device);
  const touchCapable = useGameStore((s) => s.touchCapable);
  const [picked, setPicked] = useState<LegendDevice | null>(null);
  const tab = picked ?? defaultDevice(device, touchCapable);
  return (
    <section className="htp-legend" data-testid="htp-legend" data-device={tab}>
      <h3>Controls</h3>
      <div className="htp-devices" role="tablist">
        {(['keyboard', 'gamepad', 'touch'] as LegendDevice[]).map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={tab === d}
            data-testid={`htp-device-${d}`}
            onClick={() => setPicked(d)}
          >
            {{ keyboard: '⌨ Keys', gamepad: '🎮 Pad', touch: '📱 Touch' }[d]}
          </button>
        ))}
      </div>
      {tab === 'touch' && <TouchMap controls={controls} />}
      <dl>
        {controls.map((id) => {
          const row = ROWS[id];
          return (
            <div key={id} className="htp-row">
              <dt>{row.label}</dt>
              <dd>
                {tab === 'touch' ? (
                  row.touch
                ) : (tab === 'keyboard' ? row.keyboard : row.gamepad).length > 0 ? (
                  (tab === 'keyboard' ? row.keyboard : row.gamepad).map((k, i) =>
                    k.startsWith('or ') ? (
                      <span key={k}> {k}</span>
                    ) : (
                      <span key={k}>
                        {i > 0 && ' '}
                        <span className="kbd">{k}</span>
                      </span>
                    ),
                  )
                ) : (
                  <span className="htp-none">no button: use the keyboard or the touch button</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/** A small picture of the on-screen controls, laid out like the real ones, lighting the ones this lesson uses. */
function TouchMap({ controls }: { controls: ControlId[] }) {
  const on = (id: ControlId) => (controls.includes(id) ? ' on' : '');
  const entry = controls.includes('entryChoose');
  return (
    <div className="htp-touchmap" aria-hidden data-testid="htp-touchmap">
      <div className={`tm-pad${on('move')}`}>
        <i className="u" />
        <i className="d" />
        <i className="l" />
        <i className="r" />
      </div>
      <div className="tm-top">
        <span className={`tm-pause${on('pause')}`}>II</span>
      </div>
      {entry ? (
        <div className="tm-entry on">
          <b>CALL IN THE …</b>
          <span>LAUNCH</span>
          <span>BACK</span>
        </div>
      ) : null}
      <div className="tm-actions">
        <span className={`tm-btn bomb${on('place')}`}>GENERATOR</span>
        <span className={`tm-btn a${on('skill')}`}>SKILL</span>
        <span className={`tm-btn b${on('action')}`}>CARRY</span>
        <span className={`tm-btn v${on('vehicle')}`}>KEKE</span>
        <span className={`tm-btn c${on('detonate')}`}>BOOM!</span>
        <span className="tm-btn d">DISARM</span>
      </div>
    </div>
  );
}

function ChapterList({ current, onClose }: { current: number; onClose: () => void }) {
  return (
    <div
      className="scrim htp-list-scrim"
      data-testid="htp-list"
      role="dialog"
      aria-label="Chapters"
      onClick={onClose}
    >
      <div className="card htp-list" onClick={(e) => e.stopPropagation()} onMouseDown={keepFocusOnGame}>
        <div className="htp-list-head">
          <h2>Chapters</h2>
          <button type="button" className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <ol>
          {CHAPTERS.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={i === current ? 'on' : ''}
                data-testid={`htp-chapter-${c.id}`}
                onClick={() => {
                  onClose();
                  commands.tutorialWatch(i);
                }}
              >
                <b>{i + 1}</b>
                <span>
                  {c.title}
                  <small>{c.summary}</small>
                </span>
                {c.practice && <em title="Has a practice">✋</em>}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
