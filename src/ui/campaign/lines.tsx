/**
 * One story line, styled by who says it (`speakers.ts`). The unseen broker is always a message / phone-call card from
 * UNKNOWN NUMBER, never a face, a portrait or a silhouette; the district radio is a short radio-message card; a playable
 * hero speaks beside their approved menu portrait.
 */
import type { StoryLine } from '../../campaign';
import { fighterArt } from '../menu/art';
import { speakerStyle } from './speakers';

export function StoryLineView({ line, typed }: { line: StoryLine; typed?: string }) {
  const text = typed ?? line.text;
  const style = speakerStyle(line);
  if (style.kind === 'broker')
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
  if (style.kind === 'radio')
    return (
      <div className="cp-line cp-radio" data-testid="story-radio">
        <div className="cp-radio-head">
          <span className="cp-radio-glyph" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <b>{line.speaker}</b>
          <small>on the radio</small>
        </div>
        <p>{text}</p>
      </div>
    );
  if (style.kind === 'hero') {
    const art = style.heroId ? fighterArt(style.heroId) : null;
    return (
      <div className="cp-line cp-hero-line" data-testid="story-hero-line" data-hero={style.heroId ?? ''}>
        {art && (
          <span className="cp-line-portrait" aria-hidden>
            <img src={art.src} srcSet={art.srcSet} sizes="56px" alt="" loading="lazy" decoding="async" />
          </span>
        )}
        <div className="cp-line-body">
          <b className="cp-speaker">{line.speaker}</b>
          <p>{text}</p>
        </div>
      </div>
    );
  }
  const narration = style.kind === 'narrator';
  return (
    <div className={`cp-line${narration ? ' narration' : ''}`}>
      {!narration && <b className="cp-speaker">{line.speaker}</b>}
      <p>{text}</p>
    </div>
  );
}
