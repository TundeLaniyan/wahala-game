/**
 * Public API of the audio + crowd-captions module.
 *
 * Layers (each with its own persistent volume, see prefs.ts):
 *  - MUSIC: original pre-rendered Afrobeats loops + stings (public/audio/music, music.ts);
 *  - LAGOS AMBIENCE + VOICES: street/bus-park/market beds, crowd reactions and spoken Nigerian Pidgin
 *    (pidgin.ts). The Pidgin lines are SYNTHETIC placeholders, not Nigerian speakers; see docs/AUDIO.md;
 *  - EFFECTS: synthesised gameplay sounds (src/audio/recipes).
 * Recorded files in public/audio override synthesised sounds slot by slot (samples.ts).
 *
 * Wiring (app layer):
 *   const audio = createAudio();
 *   window.addEventListener('pointerdown', () => void audio.unlock(), { once: true });  // first gesture:
 *                                       // starts the menu music (browsers block audio before a gesture)
 *   audio.startMusic();                 // a match begins: match music + street ambience + chatter
 *   // each sim tick:   const events = tick(state, intents);
 *   audio.handleEvents(events, state);  // effects, crowd reactions, spoken Pidgin, result stings
 *   const captions = captionGen.captionsFor(events, state);               // pure, separate
 *   audio.setIntensity(0..1);           // excitement; >= ~0.5 also fades in the percussion tension stem
 *   audio.stopMusic();                  // leaving the match: menu music returns, ambience fades
 *   audio.setMuted(bool);               // mute lives in the app settings (shared with the HUD button)
 * Volumes are NOT passed in: the engine follows the persistent `audioPrefs` store, which the settings
 * panel (src/ui/AudioSettings.tsx) edits.
 */
export { createAudio } from './engine';
export type { AudioEngine, AudioOptions } from './engine';
export { createCaptionGenerator } from './captions';
export type { CaptionGenerator, CrowdCaption } from './captions';
export type { AudioContextLike, ContextFactory } from './webaudio';
export { SAMPLE_SLOTS } from './samples';
export type { SlotEntry, SlotManifest, SlotReport, FetchLike } from './samples';
export type { SoundId } from './recipes';
export { DEFAULT_AUDIO_PREFS, PREFS_KEY, audioPrefs, createPrefsStore } from './prefs';
export type { AudioPrefs, PrefsStore, StorageLike } from './prefs';
export type { MusicReport, MusicScene, StingKind } from './music';
export type { VoiceCategory, VoiceReport } from './pidgin';
