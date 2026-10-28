import { useState } from 'react';
import { CHARACTERS, VEHICLE_DEFS } from '../sim';
import type { CharacterId } from '../sim';
import { COURSES, LESSONS, resolveHint } from '../tutorial';
import type { ControlId, HintDevice } from '../tutorial';
import { portraitUrl } from '../assets/portraits';
import { commands } from '../app/session';
import { useGameStore } from '../app/store';
import type { TutorialView } from '../app/store';
import { legendRows } from './howToPlayControls';
import type { LegendDevice } from './howToPlayControls';
import './HowToPlay.css';

/**
 * Clicking an Academy button must not leave it focused: Space / Enter are game keys, and a focused button
 * would otherwise be "clicked" again by them in the middle of a practice.
 */
const keepFocusOnGame = (e: { target: EventTarget; preventDefault(): void }): void => {
  if ((e.target as HTMLElement).closest?.('button')) e.preventDefault();
};

function defaultDevice(device: string, touchCapable: boolean): LegendDevice {
  if (device === 'gamepad') return 'gamepad';
  if (device === 'touch' || touchCapable) return 'touch';
  return 'keyboard';
}

/** The device the instructions are worded for (follows the last device used, like the HUD). */
function useHintDevice(): HintDevice {
  const device = useGameStore((s) => s.device);
  const touchCapable = useGameStore((s) => s.touchCapable);
  return defaultDevice(device, touchCapable);
}

/**
 * The Training Academy: a column beside the live game view (the board, HUD and touch controls sit to its
 * right, so no lesson text ever covers a playable tile). Each lesson shows its objective, plays a brief
 * demonstration in the real engine, then hands the controls to the player and ticks off each task as the
 * simulation sees it happen, with gentle tips and unlimited retries.
 */
export function HowToPlay() {
  const view = useGameStore((s) => s.tutorial);
  const [listOpen, setListOpen] = useState(false);
  if (!view) return null;
  const lesson = LESSONS[view.lesson]!;
  const course = COURSES.find((c) => c.id === lesson.course)!;
  const highlight =
    (view.mode === 'practice' && !view.practice?.complete ? view.practice?.controls : lesson.controls) ?? [];
  return (
    <>
      <aside
        className="htp-panel"
        data-testid="how-to-play"
        data-mode={view.mode}
        data-lesson={lesson.id}
        data-highlight={view.mode === 'practice' ? highlight.join(' ') : ''}
        onMouseDown={keepFocusOnGame}
      >
        <header className="htp-head">
          <button
            type="button"
            className="htp-menu"
            data-testid="htp-lessons"
            aria-haspopup="dialog"
            onClick={() => setListOpen(true)}
          >
            ☰ <span>Lessons</span>
          </button>
          <span className="htp-kicker">
            <b>{view.lesson + 1}</b>/{LESSONS.length}
          </span>
          <button
            type="button"
            className="htp-exit"
            data-testid="htp-exit"
            aria-label="Exit the Academy"
            onClick={() => commands.exitTutorial()}
          >
            ✕
          </button>
        </header>
        <div className="htp-titles">
          <small className="htp-course">{course.title}</small>
          <h2 data-testid="htp-title">{lesson.title}</h2>
        </div>
        <p className="htp-objective" data-testid="htp-objective">
          <b>Goal</b> {lesson.objective}
        </p>
        <div className="htp-tabs" role="tablist" aria-label="Lesson step">
          <button
            type="button"
            role="tab"
            aria-selected={view.mode === 'demo'}
            data-testid="htp-watch"
            onClick={() => commands.tutorialWatch()}
          >
            ① Watch
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view.mode === 'practice'}
            data-testid="htp-practice"
            onClick={() => commands.tutorialPractice()}
          >
            ② Your turn
          </button>
        </div>
        {view.mode === 'demo' ? <DemoBody view={view} /> : <PracticeBody view={view} />}
        <LessonNav view={view} />
        <details className="htp-more" open={!shortScreen()}>
          <summary>Tips & controls</summary>
          <ul className="htp-facts">
            {lesson.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <Legend controls={lesson.controls} />
        </details>
      </aside>
      {listOpen && <LessonList view={view} onClose={() => setListOpen(false)} />}
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

function DemoBody({ view }: { view: TutorialView }) {
  const paused = useGameStore((s) => s.paused);
  return (
    <div className="htp-demo">
      <div
        className="htp-caption"
        data-testid="htp-caption"
        aria-live="polite"
        key={`${view.run}-${view.beat}`}
      >
        {view.step && <b className="htp-step">{view.step}</b>}
        {view.caption}
        {paused && <em className="htp-paused">Paused</em>}
      </div>
      <div className="htp-progress" aria-label={`Part ${view.beat + 1} of ${view.beats}`}>
        {Array.from({ length: view.beats }, (_, i) => (
          <i key={i} className={i < view.beat || view.finished ? 'done' : i === view.beat ? 'on' : ''} />
        ))}
      </div>
      <div className="htp-row">
        <button
          type="button"
          className="btn small"
          data-testid="htp-replay"
          onClick={() => commands.tutorialReplay()}
        >
          ⟲ Again
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
      </div>
      <button
        type="button"
        className={`btn small htp-wide${view.finished ? ' green' : ''}`}
        data-testid="htp-try"
        onClick={() => commands.tutorialPractice()}
      >
        {view.finished ? 'Your turn ▶' : 'Skip demo: try it ▶'}
      </button>
    </div>
  );
}

function PracticeBody({ view }: { view: TutorialView }) {
  const p = view.practice;
  const device = useHintDevice();
  useGameStore((s) => s.portraitsVersion);
  if (!p) return null;
  const rows = legendRows();
  const instruction = resolveHint(p.instruction, rows, device);
  return (
    <div
      className="htp-practice"
      data-testid="htp-practice-body"
      data-complete={p.complete}
      data-failed={p.failed}
      data-task={p.current}
    >
      {p.complete ? (
        <p className="htp-success" data-testid="htp-complete" role="status">
          ★ Lesson complete! Play on, or go to the next lesson.
        </p>
      ) : (
        <p
          className="htp-instruction"
          data-testid="htp-instruction"
          aria-live="polite"
          key={`${view.run}-${p.current}`}
        >
          <b className="htp-step">
            Task {p.current + 1} of {p.tasks.length}
          </b>
          {instruction}
        </p>
      )}
      {!p.complete && p.guidance && (
        <p
          className={`htp-guidance${p.failed ? ' fail' : ''}`}
          data-testid="htp-guidance"
          role="status"
          key={`${view.run}-${p.guidance}`}
        >
          {p.guidance}
        </p>
      )}
      {view.notice && !p.failed && (
        <p className="htp-praise" data-testid="htp-notice" role="status" key={`${view.run}-${view.notice}`}>
          {view.notice}
        </p>
      )}
      <ol className="htp-tasks" aria-label="Tasks">
        {p.tasks.map((t, i) => (
          <li
            key={t.id}
            className={t.done ? 'done' : i === p.current ? 'on' : ''}
            data-testid={`htp-task-${i}`}
            data-done={t.done}
          >
            <span aria-hidden>{t.done ? '✓' : i === p.current ? '▸' : '○'}</span>
            {t.label}
          </li>
        ))}
      </ol>
      {p.attempts > 0 && !p.complete && (
        <p className="htp-attempts" data-testid="htp-attempts">
          Attempt {p.attempts + 1}. Take your time: retries are unlimited.
        </p>
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
      <div className="htp-row">
        <button
          type="button"
          className="btn small"
          data-testid="htp-restart"
          onClick={() => commands.tutorialReplay()}
        >
          ⟲ Restart
        </button>
        <PauseButton />
      </div>
    </div>
  );
}

function PauseButton() {
  const paused = useGameStore((s) => s.paused);
  return (
    <button
      type="button"
      className="btn small"
      data-testid="htp-pause"
      onClick={() => commands.togglePause()}
    >
      {paused ? '▶ Resume' : 'II Pause'}
    </button>
  );
}

/** Forward only once the lesson is completed or explicitly skipped. */
function LessonNav({ view }: { view: TutorialView }) {
  const last = view.lesson === LESSONS.length - 1;
  return (
    <div className="htp-row htp-nav">
      <button
        type="button"
        className="btn small"
        data-testid="htp-prev"
        disabled={view.lesson === 0}
        onClick={() => commands.tutorialPrev()}
      >
        ◀
      </button>
      {view.canAdvance ? (
        !last && (
          <button
            type="button"
            className="btn small primary htp-grow"
            data-testid="htp-next"
            onClick={() => commands.tutorialNext()}
          >
            Next lesson ▶
          </button>
        )
      ) : (
        <button
          type="button"
          className="btn small htp-grow"
          data-testid="htp-skip"
          title="Skip this lesson (you can come back to it from the lesson list)"
          onClick={() => commands.tutorialSkip()}
        >
          Skip lesson ▷
        </button>
      )}
    </div>
  );
}

function Legend({ controls }: { controls: ControlId[] }) {
  const device = useGameStore((s) => s.device);
  const touchCapable = useGameStore((s) => s.touchCapable);
  const [picked, setPicked] = useState<LegendDevice | null>(null);
  const tab = picked ?? defaultDevice(device, touchCapable);
  const rows = legendRows();
  return (
    <section className="htp-legend" data-testid="htp-legend" data-device={tab}>
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
            {{ keyboard: 'Keys', gamepad: 'Pad', touch: 'Touch' }[d]}
          </button>
        ))}
      </div>
      {tab === 'touch' && <TouchMap controls={controls} />}
      <dl>
        {controls.map((id) => {
          const row = rows[id];
          const keys = tab === 'keyboard' ? row.keyboard : row.gamepad;
          return (
            <div key={id} className="htp-legend-row" data-testid={`htp-legend-${id}`}>
              <dt>{row.label}</dt>
              <dd>
                {tab === 'touch' ? (
                  row.touch
                ) : keys.length > 0 ? (
                  keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ' '}
                      <span className="kbd">{k}</span>
                    </span>
                  ))
                ) : (
                  <span className="htp-none">not bound on this device</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/** A small picture of the on-screen controls: the stick's whole activation area and the two buttons. */
function TouchMap({ controls }: { controls: ControlId[] }) {
  const on = (...ids: ControlId[]) => (ids.some((id) => controls.includes(id)) ? ' on' : '');
  return (
    <div className="htp-touchmap" aria-hidden data-testid="htp-touchmap">
      <div className={`tm-zone${on('move')}`} data-testid="htp-stick">
        <div className="tm-stick">
          <i className="tm-knob" />
        </div>
        <small>THUMB DOWN ANYWHERE HERE</small>
      </div>
      <div className="tm-actions">
        <span className={`tm-btn b${on('special', 'detonate')}`}>
          B<small>tap: hit / vehicle · hold: boom</small>
        </span>
        <span className={`tm-btn a${on('place', 'detonate')}`}>
          A<small>tap: generator · hold: boom</small>
        </span>
      </div>
    </div>
  );
}

function LessonList({ view, onClose }: { view: TutorialView; onClose: () => void }) {
  return (
    <div
      className="scrim htp-list-scrim"
      data-testid="htp-list"
      role="dialog"
      aria-label="Lessons"
      onClick={onClose}
    >
      <div className="card htp-list" onClick={(e) => e.stopPropagation()} onMouseDown={keepFocusOnGame}>
        <div className="htp-list-head">
          <h2>Training Academy</h2>
          <button type="button" className="btn small" data-testid="htp-list-close" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="htp-list-note">
          {view.completed.length} of {LESSONS.length} lessons completed on this device.
        </p>
        {COURSES.map((course) => (
          <section key={course.id} className="htp-course-block">
            <h3>
              {course.title} <small>{course.blurb}</small>
            </h3>
            <ol>
              {LESSONS.map((l, i) =>
                l.course !== course.id ? null : (
                  <li key={l.id} className={i === view.lesson ? 'on' : ''} data-testid={`htp-lesson-${l.id}`}>
                    <span className="htp-mark" aria-label={statusOf(view, l.id)}>
                      {view.completed.includes(l.id) ? '✓' : view.skipped.includes(l.id) ? '↷' : i + 1}
                    </span>
                    <span className="htp-lname">
                      {l.title}
                      <small>{l.summary}</small>
                    </span>
                    <button
                      type="button"
                      className="btn small"
                      data-testid={`htp-watch-${l.id}`}
                      onClick={() => {
                        onClose();
                        commands.tutorialWatch(i);
                      }}
                    >
                      Watch
                    </button>
                    <button
                      type="button"
                      className="btn small green"
                      data-testid={`htp-practise-${l.id}`}
                      onClick={() => {
                        onClose();
                        commands.tutorialPractice(i);
                      }}
                    >
                      Practise
                    </button>
                  </li>
                ),
              )}
            </ol>
          </section>
        ))}
        <button
          type="button"
          className="btn small htp-reset"
          data-testid="htp-reset"
          onClick={() => commands.tutorialResetProgress()}
        >
          Forget my progress
        </button>
      </div>
    </div>
  );
}

const statusOf = (view: TutorialView, id: string): string =>
  view.completed.includes(id) ? 'completed' : view.skipped.includes(id) ? 'skipped' : 'not done yet';
