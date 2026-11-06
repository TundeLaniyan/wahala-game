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

function Picture({ image, variant, onGone }: { image: StoryImage; variant: Variant; onGone?: () => void }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
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
        onLoad={() => setState('ready')}
        onError={() => {
          setState('failed');
          onGone?.();
        }}
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
