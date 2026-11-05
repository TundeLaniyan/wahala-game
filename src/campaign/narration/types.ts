/**
 * Campaign narration data model (docs/CAMPAIGN_TEXT_NARRATION.md). A clip is a recording (or, one day, a
 * generated voice) of ONE story card's title, summary and objective line. The catalogue ships EMPTY of audio:
 * no clip exists yet, every Listen button says so, and the text always stays. Nothing here synthesises or
 * generates speech.
 */

/** Where a clip's audio comes from. `none`: no audio. `recorded`: a founder-approved recording imported by the audio import process. `tts-future`: reserved, never played today. */
export type NarrationSource = 'none' | 'recorded' | 'tts-future';

/** `free` clips are always playable; `premium` ones need the `fullNarration` entitlement (see entitlements.ts). */
export type NarrationTier = 'free' | 'premium';

export interface NarrationClip {
  /** The clip id; its file is `public/audio/narration/<id>.mp3` when `source` is `recorded`. */
  id: string;
  /** The story card this clip narrates (`StoryCard.narrationId`). */
  cardId: string;
  /** What is spoken (the card's `cardNarrationText`): the transcript, kept for subtitles and review. */
  text: string;
  /** BCP-47 tag, e.g. 'en-NG'. */
  language: string;
  /** The voice / performer key chosen in the founder's import (never a generated voice id). */
  voiceId: string;
  durationMs?: number;
  source: NarrationSource;
  tier: NarrationTier;
}

/** The outcome of asking for narration. `play` never rejects and never throws: every outcome is one of these. */
export type PlayResult =
  | { status: 'played' }
  | { status: 'stopped' }
  | { status: 'unavailable'; reason: 'no-clip' | 'no-file' | 'no-audio' }
  | { status: 'locked' }
  | { status: 'failed'; reason: string };

/** The narration the app plays. Implementations never throw (see provider.ts). */
export interface NarrationProvider {
  /** Is there a clip the player may hear for this card id? (False means Listen is shown disabled.) */
  available(cardId: string): boolean;
  /** Plays the card's clip; resolves when it ends or is stopped. Never rejects. */
  play(cardId: string): Promise<PlayResult>;
  /** Stops whatever is playing (safe at any time, also when nothing is). */
  stop(): void;
}
