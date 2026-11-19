/**
 * Learn to Play (the Training Academy): the real interactive lessons (src/tutorial) in seven plain sections (a section
 * rail on the left, the section's lessons on the right), with this device's saved progress. START / CONTINUE TRAINING
 * opens the first unfinished lesson; any lesson can be replayed. Each lesson is the existing playable tutorial (watch
 * a short demo, then do it yourself on a live board); leaving it comes back here. Developer and test activities sit
 * under Advanced Training, apart from the beginner lessons.
 */
import { useState } from 'react';
import { LESSONS, emptyProgress, loadProgress, resumeIndex, saveProgress } from '../../tutorial';
import type { AcademyProgress } from '../../tutorial';
import { commands } from '../../app/session';
import { PrimaryButton, ScreenFrame, SecondaryButton } from './Frame';
import { ACADEMY_SECTIONS, sectionProgress, startSection, unsectionedLessons } from './academyModel';
import type { AcademySectionId } from './academyModel';

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

const STATUS_LABEL: Record<Status, string> = {
  done: 'Completed',
  skipped: 'Skipped',
  next: 'Up next',
  new: '',
};

export function AcademyScreen() {
  const [progress, setProgress] = useState<AcademyProgress>(() => loadProgress(storage()));
  const [confirm, setConfirm] = useState(false);
  const ids = LESSONS.map((l) => l.id);
  const done = LESSONS.filter((l) => progress.completed.includes(l.id)).length;
  const allDone = done === LESSONS.length;
  const next = resumeIndex(ids, progress);
  const nextLesson = LESSONS[next]!;
  const pct = Math.round((done / LESSONS.length) * 100);
  const [open, setOpen] = useState<AcademySectionId>(() => startSection(allDone ? null : nextLesson.id));
  const section = ACADEMY_SECTIONS.find((s) => s.id === open)!;
  const sectionIds = [...section.lessons, ...(open === 'advanced' ? unsectionedLessons() : [])];
  const rows = sectionIds
    .map((id) => ({ l: LESSONS.find((x) => x.id === id), i: ids.indexOf(id) }))
    .filter((r): r is { l: (typeof LESSONS)[number]; i: number } => !!r.l);
  return (
    <ScreenFrame
      id="academy"
      kicker="Learn by playing"
      title="Learn to play"
      status={
        <span className="mn-chosen" data-testid="academy-progress-text">
          {done} / {LESSONS.length} lessons completed
        </span>
      }
      actions={
        <PrimaryButton testId="academy-continue" autoFocus onClick={() => commands.openTutorial()}>
          {done === 0 && progress.skipped.length === 0
            ? 'Start training'
            : allDone
              ? 'Train again'
              : 'Continue training'}
        </PrimaryButton>
      }
    >
      <div className="mn-academy2">
        <nav className="mn-academy-rail" aria-label="Training sections" data-testid="academy-sections">
          {ACADEMY_SECTIONS.map((sec) => {
            const p = sectionProgress(sec, progress);
            const on = sec.id === open;
            return (
              <button
                key={sec.id}
                type="button"
                className={`mn-academy-tab${on ? ' on' : ''}${p.done === p.total ? ' done' : ''}`}
                data-testid={`academy-section-${sec.id}`}
                aria-current={on ? 'true' : undefined}
                onClick={() => {
                  commands.click();
                  setOpen(sec.id);
                }}
              >
                <b>{sec.title}</b>
                <small>
                  {p.done}/{p.total}
                </small>
              </button>
            );
          })}
        </nav>
        <div className="mn-panel mn-academy-pane" data-testid={`academy-pane-${open}`}>
          <header>
            <h3>
              {section.title}
              {section.pilot && <em className="mn-pilot-tag"> · pilot</em>}
            </h3>
            <p>{section.blurb}</p>
            <div className="mn-progress" aria-label={`${pct}% of lessons completed`}>
              <span
                className="mn-progress-bar"
                data-testid="academy-progress"
                style={{ ['--p' as string]: `${pct}%` }}
              >
                <i />
              </span>
              <small>
                {allDone ? 'Every lesson completed' : `Next: ${next + 1}. ${nextLesson.title}`} · progress is
                kept on this device
              </small>
            </div>
          </header>
          {open === 'advanced' && (
            <div className="mn-academy-lab" data-testid="academy-testing">
              <small className="mn-kicker">Testing tools · not lessons</small>
              <SecondaryButton
                testId="mode-sd-test"
                className="mn-test-entry"
                onClick={() => {
                  commands.click();
                  commands.startSuddenDeathTest();
                }}
              >
                <span className="mn-test-chip">Test</span>
                Sudden Death Test
                <span className="mn-test-sub">You + 2 bots</span>
              </SecondaryButton>
              <p className="mn-test-note">
                Combat Test Lab: in a local City Rumble match, open Pause and scroll to Combat Test Lab.
              </p>
            </div>
          )}
          <ol className="mn-lessons">
            {rows.map(({ l, i }) => {
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
      </div>
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
    </ScreenFrame>
  );
}
