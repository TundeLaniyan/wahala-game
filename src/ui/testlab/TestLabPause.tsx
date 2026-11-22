/**
 * The pause menu inside a Test Lab test (docs/TEST_LAB.md): Resume, Restart Test, Controls, Settings, the marker switch of
 * the "Who am I?" scenario, and Return to Test Lab behind a confirmation. Same look and keyboard / gamepad rules as the
 * game's own pause menu (Esc closes the confirmation, then Settings, and only then resumes).
 */
import { useEffect, useRef, useState } from 'react';
import { commands } from '../../app/session';
import { patch, useGameStore } from '../../app/store';
import { restartRun, returnToLab } from '../../testlab/controller';
import { LEVEL_LABEL } from '../../testlab/feedback';
import { useLab } from '../../testlab/labStore';
import { entryById } from '../../testlab/registry';
import { useMenuNav } from '../menu/focusNav';
import { SettingsPanel } from '../menu/SettingsScreen';
import type { SettingsTab } from '../menu/SettingsScreen';
import { MarkerSwitch } from './MarkerSwitch';
import '../menu/menu.css';
import '../menu/redesign.css';
import './testlab.css';

export function TestLabPause() {
  const run = useLab((s) => s.run);
  const entry = run ? entryById(run.entryId) : undefined;
  const settingsOpen = useGameStore((s) => s.pauseSettings);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<SettingsTab>('audio');
  const root = useRef<HTMLDivElement>(null);
  const confirmRef = useRef(false);
  confirmRef.current = confirm;
  const close = (): boolean => {
    if (confirmRef.current) {
      setConfirm(false);
      return true;
    }
    if (!useGameStore.getState().pauseSettings) return false; // Esc resumes the test
    commands.pauseSettings(false);
    return true;
  };
  useMenuNav(root, close, { onPause: close });
  useEffect(() => () => patch({ pauseSettings: false }), []);
  const openSettings = (t: SettingsTab): void => {
    setTab(t);
    commands.pauseSettings(true);
  };
  return (
    <div className="mn-overlay tl" data-testid="pause-overlay" ref={root}>
      {settingsOpen ? (
        <div className="mn-overlay-card mn-pause-settings" data-testid="pause-settings">
          <header className="mn-overlay-head">
            <button
              type="button"
              className="mn-back"
              data-testid="pause-settings-close"
              onClick={() => commands.pauseSettings(false)}
            >
              <span aria-hidden>‹</span> Back
            </button>
            <h2>Settings</h2>
            <small className="mn-kicker">Test paused</small>
          </header>
          <SettingsPanel key={tab} initialTab={tab} />
        </div>
      ) : (
        <div className="mn-overlay-card mn-pause">
          <div className="mn-pause-menu">
            <header>
              <small className="mn-kicker">Test Lab · paused</small>
              <h2>Paused</h2>
            </header>
            <nav className="mn-pause-list" aria-label="Pause menu" aria-hidden={confirm || undefined}>
              <button
                type="button"
                className="mn-pause-item primary"
                data-testid="resume"
                data-autofocus=""
                disabled={confirm}
                onClick={() => commands.resume()}
              >
                <b>Resume</b>
                <small>Back into the test</small>
              </button>
              <button
                type="button"
                className="mn-pause-item"
                data-testid="testlab-restart"
                disabled={confirm}
                onClick={restartRun}
              >
                <b>Restart Test</b>
                <small>Same test, same level, a clean start</small>
              </button>
              <button
                type="button"
                className="mn-pause-item"
                data-testid="pause-controls-open"
                disabled={confirm}
                onClick={() => openSettings('controls')}
              >
                <b>Controls</b>
                <small>Buttons, movement and touch layout</small>
              </button>
              <button
                type="button"
                className="mn-pause-item"
                data-testid="pause-settings-open"
                disabled={confirm}
                onClick={() => openSettings('audio')}
              >
                <b>Settings &amp; Sound</b>
                <small>Audio, graphics, accessibility</small>
              </button>
              <button
                type="button"
                className="mn-pause-item danger"
                data-testid="testlab-return"
                disabled={confirm}
                onClick={() => {
                  commands.click();
                  setConfirm(true);
                }}
              >
                <b>Return to Test Lab</b>
                <small>Leave this test</small>
              </button>
            </nav>
          </div>
          <aside className="mn-panel mn-pause-info" data-testid="pause-info">
            <small className="mn-kicker">
              {entry?.section === 'scenario' ? 'Isolated scenario' : 'Full playtest'}
            </small>
            <h3>{entry?.title ?? 'Test'}</h3>
            <p className="mn-pause-summary">
              {entry?.objective}
              {run && entry?.levels ? ` · ${LEVEL_LABEL[run.level]}` : ''}
            </p>
            {run?.entryId === 'identifyPlayer' && <MarkerSwitch />}
          </aside>
          {confirm && (
            <div className="mn-confirm" role="alertdialog" aria-modal="true" data-testid="testlab-confirm">
              <div className="mn-panel mn-confirm-card">
                <h3>Leave this test?</h3>
                <p>
                  This attempt is lost. Your feedback and notes are kept, and nothing of the test is saved.
                </p>
                <div className="mn-confirm-actions">
                  <button
                    type="button"
                    className="mn-btn mn-primary"
                    data-testid="testlab-confirm-stay"
                    data-autofocus=""
                    onClick={() => setConfirm(false)}
                  >
                    Keep testing
                  </button>
                  <button
                    type="button"
                    className="mn-btn mn-secondary danger"
                    data-testid="testlab-confirm-leave"
                    onClick={() => {
                      setConfirm(false);
                      returnToLab();
                    }}
                  >
                    Return to Test Lab
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
