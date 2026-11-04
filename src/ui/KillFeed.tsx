import { useGameStore } from '../app/store';
import type { KillFeedLine } from '../app/killFeed';
import './KillFeed.css';

/** One line: the sentence, then the cause word ("YOU ELIMINATED P3 · BLAST"). */
export function KillFeedItem({ line }: { line: KillFeedLine }) {
  return (
    <li
      className={`kf-line ${line.kind}${line.mine ? ' mine' : ''}`}
      data-testid="kill-feed-line"
      data-kind={line.kind}
      data-cause={line.cause ?? ''}
    >
      <span className="kf-text">{line.text}</span>
      {line.causeWord && <b className="kf-cause">{line.causeWord}</b>}
    </li>
  );
}

/**
 * The kill feed (decision HC1): every elimination and assist notice, newest first, at most four lines, each gone
 * after a few seconds. It lives in the HUD rail beside the board (standard matches: first block of the rail column;
 * City Rumble: the left panel under the counter, clear of the follow camera's centre), never over the board, the
 * timer, the portraits, the inventory or the controls. Pure display of `store.killFeed` (app/killFeed.ts).
 */
export function KillFeed() {
  const feed = useGameStore((s) => s.killFeed);
  if (feed.length === 0) return null;
  return (
    <ol className="kill-feed" data-testid="kill-feed" aria-live="polite" aria-label="Eliminations">
      {feed.map((l) => (
        <KillFeedItem key={l.key} line={l} />
      ))}
    </ol>
  );
}
