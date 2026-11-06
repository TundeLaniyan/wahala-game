/**
 * Resolves a story-panel key (campaign/content/storyImages.ts) to a Vite-served URL. The files under
 * `src/assets/story/` are discovered by a glob, so a file that is not there is not registered and the key simply has no
 * picture: the card renders without it (docs/STORY_VISUALS.md, "Failure path").
 */
import { STORY_IMAGES, storyImageDef } from '../../campaign/content/storyImages';
import type { StoryImageDef } from '../../campaign/content/storyImages';

const urls = import.meta.glob('../../assets/story/*.webp', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const URL_BY_FILE = new Map<string, string>(
  Object.entries(urls).map(([path, url]) => [path.split('/').pop()!, url]),
);

/** A story panel ready to draw. */
export interface StoryImage extends StoryImageDef {
  key: string;
  src: string;
}

/** The URL of a bundled story file, or null. */
export const storyFileUrl = (file: string): string | null => URL_BY_FILE.get(file) ?? null;

/**
 * The panel for `key`, or null when the key has no entry or its file is not bundled. `urlOf` and `table` are injectable
 * so tests can prove the "no image" path without touching the shipped data.
 */
export function resolveStoryImage(
  key: string | null | undefined,
  urlOf: (file: string) => string | null = storyFileUrl,
  table: Readonly<Record<string, StoryImageDef>> = STORY_IMAGES,
): StoryImage | null {
  if (!key) return null;
  const def = storyImageDef(key, table);
  if (!def) return null;
  const src = urlOf(def.file);
  return src ? { ...def, key, src } : null;
}
