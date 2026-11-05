/**
 * One story line. The unseen broker is always a message / phone-call card from UNKNOWN NUMBER, never a face, a
 * portrait or a silhouette.
 */
import type { StoryLine } from '../../campaign';

export function StoryLineView({ line, typed }: { line: StoryLine; typed?: string }) {
  const text = typed ?? line.text;
  if (line.fromBroker)
    return (
      <div className="cp-line cp-msg" data-testid="story-broker">
        <div className="cp-msg-head">
          <span className="cp-msg-glyph" aria-hidden>
            ☎
          </span>
          <b>UNKNOWN NUMBER</b>
          <small>{line.speaker === 'UNKNOWN NUMBER' ? 'new message' : 'on the line'}</small>
        </div>
        <p>{text}</p>
      </div>
    );
  const narration = line.speaker === 'NARRATOR';
  return (
    <div className={`cp-line${narration ? ' narration' : ''}`}>
      {!narration && <b className="cp-speaker">{line.speaker}</b>}
      <p>{text}</p>
    </div>
  );
}
