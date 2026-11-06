/**
 * Story panels: which picture goes with which campaign card (docs/STORY_VISUALS.md).
 *
 * Pure data, no Vite and no DOM: a key maps to the file name under `src/assets/story/` (built by
 * `tools/story/build_story_art.py` from in-engine captures, never hand-edited), the alt text, the focal point and an
 * optional caption. The UI resolves the file name to a URL (`ui/campaign/storyImageUrls.ts`); a key without a file,
 * or a file that fails to load, simply shows no picture and never blocks a card or the campaign.
 *
 * Keys: `prologue`, `finale`, `ending`, `district.<id>.briefing`, `boss.<bossId>.intro`, `section.<missionId>`,
 * `raid.<raidId>`. A story card id maps to its key with `storyImageKeyForCard`.
 *
 * Rules (the ethics checklist in docs/CAMPAIGN_STORY.md applies): no picture shows the Chairman (no face, no
 * silhouette, no portrait); murals are symbols only; nothing is real signage or a real person.
 */
import { CAMPAIGN } from './index';

export interface StoryImageDef {
  /** File under `src/assets/story/` (a 960 x 540 WebP). */
  file: string;
  /** What the picture shows, for a screen reader. Never empty. */
  alt: string;
  /** CSS `object-position` focal point, kept inside the crop when the box is wider or narrower than 16:9. */
  position: string;
  /** Optional one-line caption drawn over the scrim at the bottom of the picture (decorative; the card text is the story). */
  caption?: string;
}

/** The panel image budget the tests enforce. */
export const STORY_IMAGE_BUDGET = {
  width: 960,
  height: 540,
  /** One hero image. */
  maxBytes: 90 * 1024,
  /** The whole set. */
  maxTotalBytes: 2 * 1024 * 1024,
} as const;

export const STORY_IMAGES: Readonly<Record<string, StoryImageDef>> = {};

/** Registered by `storyImageData.ts`-style tables below (kept in one object so the keys are greppable). */
export function storyImageDef(key: string, table: Readonly<Record<string, StoryImageDef>> = STORY_IMAGES) {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key]! : null;
}

/** The image key of a story card id (`briefing.oshodi` -> `district.oshodi.briefing`), or null when the card has none. */
export function storyImageKeyForCard(cardId: string): string | null {
  if (cardId === 'prologue' || cardId === 'finale' || cardId === 'ending') return cardId;
  const [kind, ...rest] = cardId.split('.');
  const tail = rest.join('.');
  if (!tail) return null;
  if (kind === 'briefing') return `district.${tail}.briefing`;
  if (kind === 'intro') {
    const boss = (CAMPAIGN.districts as Record<string, { boss: { id: string } | null }>)[tail]?.boss;
    return boss ? `boss.${boss.id}.intro` : null;
  }
  if (kind === 'section') return cardId;
  return null;
}
