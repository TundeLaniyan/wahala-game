/**
 * Public API of the audio module.
 *
 * Layers (each with its own persistent volume, see prefs.ts):
 *  - MUSIC: the founder's approved playlist (public/audio/music/manifest.json, playlist.ts), one
 *    streamed track per match with an escalating endgame (music.ts, escalation.ts); listed files
 *    that are not present are skipped, so the music is silent until they are added;
 *  - AMBIENCE + VOICES: synthesised crowd beds and crowd reactions, plus the founder's approved Pidgin
 *    voice clips (pidgin.ts: public/audio/voices/voices.json + recorded.json), see docs/AUDIO.md;
 *  - EFFECTS: synthesised gameplay sounds (src/audio/recipes).
 * Recorded files in public/audio override synthesised sounds slot by slot (samples.ts).
 *
 * Wiring (app layer):
 *   const audio = createAudio();
 *   window.addEventListener('pointerdown', () => void audio.unlock(), { once: true });  // first gesture:
 *                                       // starts the menu music (browsers block audio before a gesture)
 *   audio.startMusic(arenaId);          // a match begins: this match's track + street ambience + chatter
 *   audio.setPaused(bool);              // pause menu: the music stream pauses and resumes
 *   // each sim tick:   const events = tick(state, intents);
 *   audio.handleEvents(events, state);  // effects, crowd reactions, spoken Pidgin, result stings
 *   audio.setIntensity(0..1);           // crowd excitement (the music escalates from the game clock itself)
 *   audio.stopMusic();                  // leaving the match: menu music returns, ambience fades
 *   audio.setMuted(bool);               // mute lives in the app settings (shared with the HUD button)
 * Volumes are NOT passed in: the engine follows the persistent `audioPrefs` store, which the settings
 * panel (src/ui/AudioSettings.tsx) edits.
 */
export { createAudio } from './engine';
export type { AudioEngine, AudioOptions } from './engine';
export type { AudioContextLike, ContextFactory } from './webaudio';
export { SAMPLE_SLOTS } from './samples';
export type { SlotEntry, SlotManifest, SlotReport, FetchLike } from './samples';
export type { SoundId } from './recipes';
export { DEFAULT_AUDIO_PREFS, PREFS_KEY, audioPrefs, createPrefsStore } from './prefs';
export type { AudioPrefs, PrefsStore, StorageLike } from './prefs';
export type { MusicReport, MusicScene, MusicStatus, StingKind } from './music';
export { matchClock, tempoFor, toneFor, urgencyAt } from './escalation';
export type { MatchClock } from './escalation';
export { parseMusicManifest, pickMatchTrack, playlistFor } from './playlist';
export type { MusicManifest, MusicTrack } from './playlist';
export { VOICE_TRIGGERS } from './pidgin';
export type { SpokenTrace, VoiceReport, VoiceStatus, VoiceTrigger } from './pidgin';
