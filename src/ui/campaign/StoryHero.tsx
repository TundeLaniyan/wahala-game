/**
 * The illustrated panel of a campaign card (docs/STORY_VISUALS.md): a 16:9 picture with a scrim, an optional caption and
 * alt text. It is decoration that supports the card text and can never block it:
 *  - no image for the key (or `null`): renders nothing, the card is exactly the text card;
 *  - the file fails to load: `onError` removes the picture (no broken-image icon);
 *  - until it has loaded, the 16:9 box is reserved (a plain dark panel) so the card does not jump.
 * The text (summary, objective, Continue) never depends on the picture, and the picture is lazy, async-decoded and
 * never receives focus.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { resolveStoryImage } from './storyImageUrls';
import './storyHero.css';
import type { StoryImage } from './storyImageUrls';

type Variant = 'hero' | 'banner' | 'thumb';
export type HeroState = 'loading' | 'ready' | 'failed';

/** The load state machine: a picture that fails stays failed (it is removed, never retried or shown broken). */
export const heroStateAfter = (state: HeroState, event: 'load' | 'error'): HeroState =>
  state === 'failed' ? 'failed' : event === 'error' ? 'failed' : 'ready';

/** The figure for a given state: nothing once failed, otherwise the lazy picture over a reserved 16:9 box. */
export function HeroFigure(props: {
  image: StoryImage;
  variant: Variant;
  state: HeroState;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const { image, variant, state } = props;
  if (state === 'failed') return null;
  const style = { ['--hero-pos' as string]: image.position } as CSSProperties;
  return (
    <figure
      className={`cp-hero ${variant}`}
      style={style}
      data-testid={variant === 'thumb' ? 'story-thumb' : 'story-hero'}
      data-image={image.key}
      data-state={state}
    >
      <img
        src={image.src}
        alt={image.alt}
        width={960}
        height={540}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={props.onLoad}
        onError={props.onError}
      />
      {variant !== 'thumb' && <span className="cp-hero-scrim" aria-hidden />}
      {variant === 'hero' && image.caption && (
        <figcaption className="cp-hero-caption" data-testid="story-hero-caption">
          {image.caption}
        </figcaption>
      )}
    </figure>
  );
}

function Picture({ image, variant, onGone }: { image: StoryImage; variant: Variant; onGone?: () => void }) {
  const [state, setState] = useState<HeroState>('loading');
  return (
    <HeroFigure
      image={image}
      variant={variant}
      state={state}
      onLoad={() => setState((s) => heroStateAfter(s, 'load'))}
      onError={() => {
        setState((s) => heroStateAfter(s, 'error'));
        onGone?.();
      }}
    />
  );
}

/** The panel for a key; nothing when there is none. `key` on the inner component resets the load state per file. */
export function StoryHero({
  imageKey,
  variant = 'hero',
  onGone,
}: {
  imageKey: string | null | undefined;
  variant?: Variant;
  /** Called once when the file fails to load (the picture is removed). */
  onGone?: () => void;
}) {
  const image = resolveStoryImage(imageKey);
  return image ? <Picture key={image.src} image={image} variant={variant} onGone={onGone} /> : null;
}
