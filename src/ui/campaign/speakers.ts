/**
 * How a story line is presented, from who says it (pure, unit-tested). Existing approved art only:
 *
 *   broker    the unseen broker: a message / phone-call card, never a face, portrait or silhouette (unchanged rule)
 *   radio     the district radio: a short "on the radio" message card (no portrait)
 *   narrator  narration: italic text, no speaker label
 *   hero      one of the PLAYABLE heroes (the character registry's names): their approved menu portrait as a small
 *             dialogue portrait. The current story gives the heroes no spoken lines; this is the path for approved ones.
 *   voice     anyone else (Mama Put, a district keeper ...): the speaker's name above the line. District bosses get no
 *             portrait: their introduction art is a group arrival scene, never cropped into a character picture.
 */
import { CHARACTERS, CHARACTER_IDS } from '../../sim';
import type { CharacterId } from '../../sim';
import type { StoryLine } from '../../campaign';

export type SpeakerKind = 'broker' | 'radio' | 'narrator' | 'hero' | 'voice';

export interface SpeakerStyle {
  kind: SpeakerKind;
  /** The playable hero who speaks (kind 'hero' only). */
  heroId: CharacterId | null;
}

const norm = (s: string): string => s.trim().toUpperCase();

/** The playable hero whose registry name is `speaker`, or null. */
export function heroForSpeaker(speaker: string): CharacterId | null {
  const name = norm(speaker);
  return CHARACTER_IDS.find((id) => norm(CHARACTERS[id].name) === name) ?? null;
}

export function speakerStyle(line: Pick<StoryLine, 'speaker' | 'fromBroker'>): SpeakerStyle {
  if (line.fromBroker) return { kind: 'broker', heroId: null };
  const name = norm(line.speaker);
  if (name === 'NARRATOR') return { kind: 'narrator', heroId: null };
  if (name === 'RADIO') return { kind: 'radio', heroId: null };
  const heroId = heroForSpeaker(line.speaker);
  return heroId ? { kind: 'hero', heroId } : { kind: 'voice', heroId: null };
}
