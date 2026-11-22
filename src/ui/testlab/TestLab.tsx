/**
 * The Test Lab (docs/TEST_LAB.md): the temporary founder screen shown instead of the main menu with `?testlab=1`. Home
 * lists the two sections; an entry's card starts the test and records feedback; a finished campaign-driven test shows its
 * result here with Restart and Return. All of it runs on the menu's own look (menu.css / flow.css).
 */
import { useRef, useState } from 'react';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { KEY_ART } from '../menu/art';
import { useMenuNav } from '../menu/focusNav';
import { CHARACTERS, CHARACTER_IDS } from '../../sim';
import {
  closeEntry,
  copySummary,
  exitTestLab,
  feedbackSummary,
  isolationOk,
  openEntry,
  restartRun,
  returnToLab,
  setFighter,
  setLevel,
  startEntry,
} from '../../testlab/controller';
import { FEEDBACK_LABEL, LAB_LEVELS, LEVEL_LABEL } from '../../testlab/feedback';
import { levelOf, useLab } from '../../testlab/labStore';
import { entriesIn, entryById } from '../../testlab/registry';
import type { LabEntry } from '../../testlab/registry';
import { FeedbackPanel } from './FeedbackPanel';
import { MarkerSwitch } from './MarkerSwitch';
import { endedText } from './endedText';
import '../menu/menu.css';
import '../menu/flow.css';
import '../menu/redesign.css';
import './testlab.css';

function EntryRow({ entry }: { entry: LabEntry }) {
  const f = useLab((s) => s.feedback[entry.id]);
  const status = f?.status ?? 'notTested';
  return (
    <li>
      <button
        type="button"
        className="tl-row"
        data-testid={`testlab-entry-${entry.id}`}
        onClick={() => {
          commands.click();
          openEntry(entry.id);
        }}
      >
        <span>
          <b>{entry.title}</b>
          <small>{entry.objective}</small>
        </span>
        <span className={`tl-status ${status}`} data-testid={`testlab-status-${entry.id}`}>
          {FEEDBACK_LABEL[status]}
        </span>
      </button>
    </li>
  );
}

function CopyButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  return (
    <>
      <button
        type="button"
        className="mn-btn mn-secondary small"
        data-testid="testlab-copy"
        onClick={() => {
          commands.click();
          void copySummary().then((ok) => setState(ok ? 'copied' : 'manual'));
        }}
      >
        {state === 'copied' ? 'Copied' : 'Copy summary'}
      </button>
      {state === 'manual' && (
        <div className="tl-summary-box" data-testid="testlab-summary-box" role="dialog" aria-modal="true">
          <div>
            <p>Copying was blocked. Select all and copy this text:</p>
            <textarea readOnly value={feedbackSummary()} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="mn-btn mn-secondary small" onClick={() => setState('idle')}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function HomeView() {
  const ok = isolationOk();
  return (
    <section className="mn-screen tl-screen" data-testid="testlab-home">
      <header className="mn-top">
        <button type="button" className="mn-back" data-testid="testlab-exit" onClick={exitTestLab}>
          <span aria-hidden>‹</span> Exit Test Lab
        </button>
        <div className="mn-heading">
          <small>Founder tools · temporary</small>
          <h2>Test Lab</h2>
        </div>
        <CopyButton />
      </header>
      {!ok && (
        <p className="tl-warn" data-testid="testlab-isolation-warning">
          This browser would not let the Test Lab keep your saves apart, so tests are switched off. Open the
          normal game instead.
        </p>
      )}
      <div className="mn-body tl-cols">
        <section className="tl-col" aria-labelledby="tl-h-play">
          <h3 id="tl-h-play">Full Playtests</h3>
          <ul className="tl-list" data-testid="testlab-list-playtest">
            {entriesIn('playtest').map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        </section>
        <section className="tl-col" aria-labelledby="tl-h-scen">
          <h3 id="tl-h-scen">Isolated Scenarios</h3>
          <ul className="tl-list" data-testid="testlab-list-scenario">
            {entriesIn('scenario').map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

function EntryView({ entry }: { entry: LabEntry }) {
  const level = useLab((s) => levelOf(s, entry.id));
  const fighter = useGameStore((s) => s.settings.character);
  const ok = isolationOk();
  return (
    <section className="mn-screen tl-screen" data-testid="testlab-entry">
      <header className="mn-top">
        <button type="button" className="mn-back" data-testid="testlab-back" onClick={closeEntry}>
          <span aria-hidden>‹</span> Test Lab
        </button>
        <div className="mn-heading">
          <small>{entry.section === 'playtest' ? 'Full playtest' : 'Isolated scenario'}</small>
          <h2>{entry.title}</h2>
        </div>
        <button
          type="button"
          className="mn-btn mn-primary small"
          data-testid="testlab-start"
          data-autofocus=""
          disabled={!ok}
          onClick={() => startEntry(entry.id)}
        >
          Start Test
          <span className="mn-arrow" aria-hidden>
            →
          </span>
        </button>
      </header>
      <div className="mn-body tl-entry">
        <div className="mn-panel tl-card">
          <h4>Objective</h4>
          <p data-testid="testlab-objective">{entry.objective}</p>
          <p className="dim">{entry.launches}</p>
          {entry.levels && (
            <>
              <h4>Difficulty</h4>
              <div className="mn-opts" role="group" aria-label="Difficulty">
                {LAB_LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`chip mn-opt${l === level ? ' on' : ''}`}
                    data-testid={`testlab-level-${l}`}
                    aria-pressed={l === level}
                    onClick={() => {
                      commands.click();
                      setLevel(entry.id, l);
                    }}
                  >
                    {LEVEL_LABEL[l]}
                  </button>
                ))}
              </div>
            </>
          )}
          {entry.fighter && (
            <>
              <h4>Fighter</h4>
              <div className="mn-opts" role="group" aria-label="Fighter">
                {CHARACTER_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`chip mn-opt${id === fighter ? ' on' : ''}`}
                    data-testid={`testlab-fighter-${id}`}
                    aria-pressed={id === fighter}
                    onClick={() => {
                      commands.click();
                      setFighter(id);
                    }}
                  >
                    {CHARACTERS[id].name}
                  </button>
                ))}
              </div>
            </>
          )}
          {entry.id === 'identifyPlayer' && <MarkerSwitch />}
        </div>
        <div className="mn-panel tl-card">
          <h4>How did it go?</h4>
          <FeedbackPanel entryId={entry.id} />
        </div>
      </div>
    </section>
  );
}

/** A campaign-driven test has ended (raid, field mission or boss): its result with Restart and Return. */
function EndedView({ entry }: { entry: LabEntry }) {
  const campaign = useGameStore((s) => s.campaign);
  const text = endedText(campaign);
  const level = useLab((s) => s.run?.level ?? 'normal');
  return (
    <section className="mn-screen tl-screen" data-testid="testlab-ended">
      <div className="tl-ended">
        <small className="mn-kicker">
          {entry.title} · {LEVEL_LABEL[level]}
        </small>
        <h2 data-testid="testlab-ended-title">{text?.title ?? 'Test over'}</h2>
        <p data-testid="testlab-ended-detail">{text?.detail ?? ''}</p>
        <div className="tl-actions">
          <button
            type="button"
            className="mn-btn mn-primary small"
            data-testid="testlab-restart"
            data-autofocus=""
            onClick={restartRun}
          >
            Restart Test
          </button>
          <button
            type="button"
            className="mn-btn mn-secondary small"
            data-testid="testlab-return"
            onClick={returnToLab}
          >
            Return to Test Lab
          </button>
        </div>
        <div className="mn-panel tl-card">
          <h4>How did it go?</h4>
          <FeedbackPanel entryId={entry.id} />
        </div>
      </div>
    </section>
  );
}

export function TestLab() {
  const view = useLab((s) => s.view);
  const entryId = useLab((s) => s.entryId);
  const run = useLab((s) => s.run);
  const screen = useGameStore((s) => s.screen);
  const matchLoad = useGameStore((s) => s.matchLoad);
  const ended = useGameStore((s) => endedText(s.campaign) !== null);
  const root = useRef<HTMLDivElement>(null);
  const runEntry = run ? entryById(run.entryId) : undefined;
  const showEnded = !!runEntry && screen === 'title' && ended;
  useMenuNav(root, () => {
    if (showEnded) {
      returnToLab();
      return true;
    }
    if (view === 'entry') {
      closeEntry();
      return true;
    }
    return false;
  });
  // the loading screen of a starting test covers the lab: do not flash it behind
  if (matchLoad) return null;
  const entry = view === 'entry' && entryId ? entryById(entryId) : undefined;
  return (
    <div
      className="mn tl"
      data-testid="testlab"
      data-view={showEnded ? 'ended' : entry ? 'entry' : 'home'}
      ref={root}
    >
      <div className="mn-backdrop" aria-hidden>
        <img src={KEY_ART.src} srcSet={KEY_ART.srcSet} sizes="100vw" alt="" decoding="async" />
        <i className="mn-shade" />
        <i className="mn-grain" />
      </div>
      <div className="mn-stage">
        {showEnded && runEntry ? (
          <EndedView entry={runEntry} />
        ) : entry ? (
          <EntryView entry={entry} />
        ) : (
          <HomeView />
        )}
      </div>
    </div>
  );
}
