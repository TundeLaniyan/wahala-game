/** The pass / needs improvement / failed / not tested buttons and the optional short note of one test. */
import { commands } from '../../app/session';
import { setFeedback } from '../../testlab/controller';
import { FEEDBACK_LABEL, FEEDBACK_STATUSES, NOTE_MAX } from '../../testlab/feedback';
import { useLab } from '../../testlab/labStore';

export function FeedbackPanel({ entryId }: { entryId: string }) {
  const f = useLab((s) => s.feedback[entryId]);
  const unsaved = useLab((s) => s.feedbackUnsaved);
  const status = f?.status ?? 'notTested';
  return (
    <div className="tl-feedback" data-testid="testlab-feedback">
      <div className="mn-opts" role="group" aria-label="How did this test go?">
        {FEEDBACK_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip mn-opt${s === status ? ' on' : ''}`}
            data-testid={`testlab-feedback-${s}`}
            aria-pressed={s === status}
            onClick={() => {
              commands.click();
              setFeedback(entryId, { status: s });
            }}
          >
            {FEEDBACK_LABEL[s]}
          </button>
        ))}
      </div>
      <input
        type="text"
        className="tl-note"
        data-testid="testlab-note"
        aria-label="Short note (optional)"
        placeholder="Short note (optional)"
        maxLength={NOTE_MAX}
        value={f?.note ?? ''}
        onChange={(e) => setFeedback(entryId, { note: e.target.value })}
      />
      {unsaved && (
        <p className="tl-warn">This browser would not keep the notes; they last until the page closes.</p>
      )}
    </div>
  );
}
