/**
 * The short-text presentation of every campaign briefing and scene (docs/CAMPAIGN_TEXT_NARRATION.md): the summary
 * (one or two sentences), the objective card (big), Read more (collapsed by default; everything else), and the
 * optional Listen button. `SceneCard` adds the Continue control, which always works (a tap, Enter / Space / A)
 * and never waits for narration. The broker is only ever a message card inside Read more, never a face.
 */
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CardSection, StoryCard } from '../../campaign';
import type { NarrationProvider } from '../../campaign/narration/types';
import { setScreenNavHandler } from '../../app/menuNav';
import { narrationProvider } from '../../app/narration';
import { useGameStore } from '../../app/store';
import { createListenControl, createSceneControl, listenView } from './listenModel';
import type { SceneControl } from './listenModel';
import { StoryLineView } from './lines';
import { StoryHero } from './StoryHero';
import { storyImageKeyForCard } from '../../campaign/content/storyImages';
import { resolveStoryImage } from './storyImageUrls';

const canPlay = (provider: NarrationProvider, cardId: string): boolean => {
  try {
    return provider.available(cardId) === true;
  } catch {
    return false;
  }
};

/** Listen: disabled with "Narration not recorded yet" when no clip exists; pressing it never errors. */
export function ListenButton({ cardId }: { cardId: string }) {
  const show = useGameStore((s) => s.settings.campaignListen);
  const auto = useGameStore((s) => s.settings.campaignNarration);
  const provider = narrationProvider();
  const control = useMemo(() => createListenControl(provider, cardId), [provider, cardId]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const noteId = useId();
  useEffect(() => control.subscribe(rerender), [control]);
  useEffect(() => {
    if (auto && canPlay(provider, cardId)) void control.press();
    return () => control.stop();
  }, [control, provider, cardId, auto]);
  const available = canPlay(provider, cardId);
  const state = control.state();
  const v = listenView({ show, available, playing: state.playing, last: state.last });
  if (!v.visible) return null;
  return (
    <span className="cp-listen" data-testid="card-listen-wrap">
      <button
        type="button"
        className={`mn-btn mn-secondary small cp-tool${v.playing ? ' playing' : ''}`}
        disabled={v.disabled}
        aria-describedby={v.note ? noteId : undefined}
        data-testid="card-listen"
        data-state={v.disabled ? 'unavailable' : v.playing ? 'playing' : 'ready'}
        onClick={() => void control.press()}
      >
        <span aria-hidden>{v.playing ? '■' : '▶'}</span> {v.label}
      </button>
      {v.note && (
        <small id={noteId} className="cp-listen-note" data-testid="card-listen-note" role="status">
          {v.note}
        </small>
      )}
    </span>
  );
}

function SectionView({ section, index }: { section: CardSection; index: number }) {
  const key = (section.heading ?? `part-${index}`).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div
      className={`cp-rm-section${section.tone ? ` ${section.tone}` : ''}`}
      data-testid={`card-section-${key}`}
    >
      {section.heading && <h4 className={section.tone === 'warn' ? 'warn' : undefined}>{section.heading}</h4>}
      {section.lines ? (
        <div className="cp-rm-lines">
          {section.lines.map((line, i) => (
            <StoryLineView key={i} line={line} />
          ))}
        </div>
      ) : section.items.length === 1 ? (
        <p>{section.items[0]}</p>
      ) : (
        <ul className={section.tone === 'warn' ? 'warn' : undefined}>
          {section.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Read more: collapsed by default, a real button (aria-expanded) so it works by touch, keyboard and gamepad. */
export function ReadMoreToggle(props: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      className="mn-btn mn-secondary small cp-tool"
      aria-expanded={props.open}
      aria-controls={props.controls}
      data-testid="card-readmore"
      onClick={props.onToggle}
    >
      {props.open ? 'Read less' : 'Read more'}
      <span aria-hidden>{props.open ? ' ▴' : ' ▾'}</span>
    </button>
  );
}

export function CardView(props: {
  card: StoryCard;
  testId?: string;
  /** Tests: render with Read more open. */
  defaultOpen?: boolean;
  /** Content between the objective and the tools (a result's stars, for instance). */
  children?: ReactNode;
  /** Extra controls beside Read more and Listen. */
  tools?: ReactNode;
  className?: string;
  /**
   * The story panel's key (campaign/content/storyImages.ts). Default: the one that goes with this card's id, if any;
   * `null` shows no picture. A key without a bundled file also shows none: the card is then exactly the text card.
   */
  imageKey?: string | null;
}) {
  const { card } = props;
  const [open, setOpen] = useState(!!props.defaultOpen);
  const bodyId = useId();
  const imageKey = props.imageKey === undefined ? storyImageKeyForCard(card.id) : props.imageKey;
  const image = resolveStoryImage(imageKey);
  // a picture that failed to load is gone: the card goes back to the plain text layout
  const [goneSrc, setGoneSrc] = useState<string | null>(null);
  const hasHero = image !== null && goneSrc !== image.src;
  return (
    <article
      className={`cp-panel mn-panel cp-story-card${hasHero ? ' has-hero' : ''} ${props.className ?? ''}`}
      data-testid={props.testId ?? 'story-card'}
      data-card={card.id}
    >
      <StoryHero imageKey={imageKey} onGone={() => setGoneSrc(image?.src ?? null)} />
      <div className="cp-card-text">
        <p className="cp-card-summary" data-testid="card-summary">
          {card.summary}
        </p>
        <div className="cp-objective" data-testid="card-objective">
          <small>{card.objectiveLabel}</small>
          <strong>{card.objective}</strong>
        </div>
        {props.children}
        <div className="cp-card-tools">
          {card.sections.length > 0 && (
            <ReadMoreToggle open={open} onToggle={() => setOpen(!open)} controls={bodyId} />
          )}
          <ListenButton cardId={card.narrationId} />
          {props.tools}
        </div>
        {open && (
          <div id={bodyId} className="cp-readmore-body" data-testid="card-readmore-body">
            {card.sections.map((s, i) => (
              <SectionView key={i} section={s} index={i} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * The exit of a story scene: Continue ends the scene exactly once, stops any narration and never waits for it.
 * Enter / Space / A does the same unless another button has the focus (then that button is pressed, so Read more,
 * Listen and Back stay reachable from the keyboard and a gamepad).
 */
export function useScene(onDone: () => void, key: string): SceneControl {
  const done = useRef(onDone);
  done.current = onDone;
  const scene = useMemo(
    () =>
      createSceneControl({ stopNarration: () => narrationProvider().stop(), onDone: () => done.current() }),
    // a new scene (another card id) starts with a fresh, not-yet-finished control
    [key],
  );
  useEffect(() =>
    setScreenNavHandler((command) => {
      if (command !== 'confirm') return false;
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && !active.hasAttribute('data-story-next')) return false;
      scene.finish();
      return true;
    }),
  );
  return scene;
}

/** The scene's Continue button (the screen's main action, always on screen in the footer). */
export function ContinueButton({ scene, label }: { scene: SceneControl; label: string }) {
  return (
    <button
      type="button"
      className="mn-btn mn-primary"
      data-testid="story-next"
      data-story-next=""
      data-autofocus=""
      onClick={() => scene.finish()}
    >
      {label}
      <span className="mn-arrow" aria-hidden>
        →
      </span>
    </button>
  );
}
