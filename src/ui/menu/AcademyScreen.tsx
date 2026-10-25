/**
 * Training Academy menu: the real interactive lessons (src/tutorial), grouped Beginner / Advanced by
 * course, with this device's progress. Continue opens the first unfinished lesson; any lesson can be
 * replayed. Each lesson is the existing playable tutorial (watch a short demo, then do it yourself on a
 * live board); leaving it comes back here.
 */
import { useState } from 'react';
import { COURSES, LESSONS, emptyProgress, loadProgress, resumeIndex, saveProgress } from '../../tutorial';
import type { AcademyProgress } from '../../tutorial';
import { commands } from '../../app/session';
import { PrimaryButton, ScreenFrame } from './Frame';

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

type Status = 'done' | 'skipped' | 'next' | 'new';

export function lessonStatus(p: AcademyProgress, id: string, nextId: string | null): Status {
  if (p.completed.includes(id)) return 'done';
  if (p.skipped.includes(id)) return 'skipped';
  return id === nextId ? 'next' : 'new';
}

const STATUS_LABEL: Record<Status, string> = { done: 'Completed', skipped: 'Skipped', next: 'Up next', new: '' };

export function AcademyScreen() {
  const [progress, setProgress] = useState<AcademyProgress>(() => loadProgress(storage()));
  const [confirm, setConfirm] = useState(false);
  const ids = LESSONS.map((l) => l.id);
  const done = LESSONS.filter((l) => progress.completed.includes(l.id)).length;
  const allDone = done === LESSONS.length;
  const next = resumeIndex(ids, progress);
  const nextLesson = LESSONS[next]!;
  const pct = Math.round((done / LESSONS.length) * 100);
  const groups = [
    { title: 'Beginner', courses: COURSES.filter((c) => c.id === 'beginner') },
    { title: 'Advanced', courses: COURSES.filter((c) => c.id !== 'beginner') },
  ];
  return (
    <ScreenFrame
      id="academy"
      kicker="Learn by playing"
      title="Training Academy"
      status={
        <span className="mn-chosen" data-testid="academy-progress-text">
          {done} / {LESSONS.length} lessons completed
        </span>
      }
      actions={
        <PrimaryButton testId="academy-continue" autoFocus onClick={() => commands.openTutorial()}>
          {done === 0 && progress.skipped.length === 0 ? 'Start training' : allDone ? 'Train again' : 'Continue training'}
        </PrimaryButton>
      }
    >
      <div className="mn-academy">
        <div className="mn-panel mn-academy-head">
          <div>
            <small className="mn-kicker">{allDone ? 'Every lesson completed' : 'Next lesson'}</small>
            <h3 data-testid="academy-next">
              {next + 1}. {nextLesson.title}
            </h3>
            <p>{nextLesson.summary}</p>
          </div>
          <div className="mn-progress" aria-label={`${pct}% of lessons completed`}>
            <span className="mn-progress-bar" data-testid="academy-progress" style={{ ['--p' as string]: `${pct}%` }}>
              <i />
            </span>
            <small>
              {pct}% · progress is kept on this device
            </small>
          </div>
        </div>
        {groups.map((g) => (
          <section key={g.title} className="mn-academy-group">
            <h4>{g.title}</h4>
            <div className="mn-courses">
              {g.courses.map((c) => (
                <div key={c.id} className="mn-course" data-testid={`course-${c.id}`}>
                  <div className="mn-course-head">
                    <b>{c.title}</b>
                    <small>{c.blurb}</small>
                  </div>
                  <ol className="mn-lessons">
                    {LESSONS.map((l, i) => ({ l, i }))
                      .filter(({ l }) => l.course === c.id)
                      .map(({ l, i }) => {
                        const st = lessonStatus(progress, l.id, allDone ? null : nextLesson.id);
                        return (
                          <li key={l.id}>
                            <button
                              type="button"
                              className={`mn-lesson ${st}`}
                              data-testid={`academy-lesson-${l.id}`}
                              data-status={st}
                              onClick={() => commands.openTutorial(i)}
                            >
                              <span className="mn-lesson-n">{i + 1}</span>
                              <span className="mn-lesson-text">
                                <b>{l.title}</b>
                                <small>{l.summary}</small>
                              </span>
                              {st !== 'new' && <em className={`mn-lesson-st ${st}`}>{STATUS_LABEL[st]}</em>}
                            </button>
                          </li>
                        );
                      })}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        ))}
        <div className="mn-academy-foot">
          <button
            type="button"
            className={`mn-btn mn-secondary small${confirm ? ' danger' : ''}`}
            data-testid="academy-reset"
            disabled={done === 0 && progress.skipped.length === 0}
            onClick={() => {
              if (!confirm) {
                commands.click();
                setConfirm(true);
                return;
              }
              const fresh = emptyProgress();
              saveProgress(storage(), fresh);
              setProgress(fresh);
              setConfirm(false);
            }}
          >
            {confirm ? 'Tap again to reset progress' : 'Reset progress'}
          </button>
        </div>
      </div>
    </ScreenFrame>
  );
}
