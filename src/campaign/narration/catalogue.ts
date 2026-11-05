/**
 * The narration catalogue: a table keyed by story-card id (`StoryCard.narrationId`). It ships EMPTY of audio:
 * `NARRATION_CLIPS` is empty and no file exists under `public/audio/narration/`. A clip is added only through the
 * founder's audio import process (docs/CAMPAIGN_TEXT_NARRATION.md, docs/AUDIO.md): a recorded, approved file plus
 * one entry here with `source: 'recorded'`. Never add generated or synthesised speech.
 */
import type { NarrationClip } from './types';

export interface NarrationCatalogue {
  /** The clip for a card id, if any (even one with no audio yet). */
  get(cardId: string): NarrationClip | null;
  /** Does a recorded file exist for this card? Only then may a provider load anything. */
  hasFile(cardId: string): boolean;
  /** Every clip (tests, tooling). */
  all(): readonly NarrationClip[];
}

export function createCatalogue(clips: readonly NarrationClip[]): NarrationCatalogue {
  const byCard = new Map<string, NarrationClip>();
  for (const c of clips) if (!byCard.has(c.cardId)) byCard.set(c.cardId, c);
  return {
    get: (cardId) => byCard.get(cardId) ?? null,
    hasFile: (cardId) => byCard.get(cardId)?.source === 'recorded',
    all: () => [...byCard.values()],
  };
}

/** No clips exist. Imports add entries here (and the mp3 beside the other audio assets). */
export const NARRATION_CLIPS: readonly NarrationClip[] = [];

export const NARRATION_CATALOGUE: NarrationCatalogue = createCatalogue(NARRATION_CLIPS);

/** The base path of narration files inside `public/` (served at `<BASE_URL>audio/narration/<id>.mp3`). */
export const NARRATION_DIR = 'audio/narration';
