/**
 * Public API of the audio + crowd-captions module.
 *
 * Wiring (app layer):
 *   const audio = createAudio();
 *   button.onclick = () => { void audio.unlock(); audio.startMusic(); };   // user gesture!
 *   // each sim tick:   const events = tick(state, intents);
 *   audio.handleEvents(events, state);
 *   const captions = captionGen.captionsFor(events, state);               // pure, separate
 *   // final 30 s:      audio.setIntensity(1);
 *   // leaving match:   audio.stopMusic();      // also fades the crowd murmur
 */
export { createAudio } from './engine';
export type { AudioEngine, AudioOptions } from './engine';
export { createCaptionGenerator } from './captions';
export type { CaptionGenerator, CrowdCaption } from './captions';
export type { AudioContextLike, ContextFactory } from './webaudio';
