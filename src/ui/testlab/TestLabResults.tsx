/** The results of a Junction Blast / City Rumble test: the game's real result line, then Restart and Return. */
import { useRef } from 'react';
import { useGameStore } from '../../app/store';
import { resultText } from '../../app/resultText';
import { restartRun, returnToLab } from '../../testlab/controller';
import { LEVEL_LABEL } from '../../testlab/feedback';
import { useLab } from '../../testlab/labStore';
import { entryById } from '../../testlab/registry';
import { useMenuNav } from '../menu/focusNav';
import { FeedbackPanel } from './FeedbackPanel';
import '../menu/menu.css';
import '../menu/redesign.css';
import './testlab.css';

export function TestLabResults() {
  const hud = useGameStore((s) => s.hud);
  const summary = useGameStore((s) => s.summary);
  const run = useLab((s) => s.run);
  const root = useRef<HTMLDivElement>(null);
  useMenuNav(root, () => {
    returnToLab();
    return true;
  });
  if (!hud || !hud.result) return null;
  const entry = run ? entryById(run.entryId) : undefined;
  const { title, detail } = resultText(hud, summary?.localWon ?? false);
  return (
    <div className="mn-overlay mn-results tl" data-testid="results" ref={root}>
      <div className="mn-overlay-card tl-ended">
        <small className="mn-kicker">
          {entry?.title ?? 'Test'}
          {run && entry?.levels ? ` · ${LEVEL_LABEL[run.level]}` : ''}
        </small>
        <h2 data-testid="result-title">{title}</h2>
        <p data-testid="result-detail">{detail}</p>
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
        {entry && (
          <div className="mn-panel tl-card">
            <h4>How did it go?</h4>
            <FeedbackPanel entryId={entry.id} />
          </div>
        )}
      </div>
    </div>
  );
}
