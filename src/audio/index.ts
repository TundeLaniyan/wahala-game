/**
 * Public API of the audio + crowd-captions module.
 *
 * THERE IS NO MUSIC. The crowd/bus-park ambience, effects and crowd reactions are all SYNTHESISED
 * (src/audio/recipes) unless licensed recordings are dropped into public/audio (see samples.ts).
 * `startMusic`/`stopMusic`/`setIntensity` keep their historical names but only control the
 * looping ambience; the `music` volume scales the crowd. The lead will rename these later.
 *
 * Wiring (app layer):
 *   const audio = createAudio();
 *   button.onclick = () => { void audio.unlock(); audio.startMusic(); };   // user gesture! (starts ambience)
 *   // each sim tick:   const events = tick(state, intents);
 *   audio.handleEvents(events, state);
 *   const captions = captionGen.captionsFor(events, state);               // pure, separate
 *   // excitement:      audio.setIntensity(0..1);
 *   // leaving match:   audio.stopMusic();      // fades the ambience, stops generator/engine loops
 */
export { createAudio } from './engine';
export type { AudioEngine, AudioOptions } from './engine';
export { createCaptionGenerator } from './captions';
export type { CaptionGenerator, CrowdCaption } from './captions';
export type { AudioContextLike, ContextFactory } from './webaudio';
export { SAMPLE_SLOTS } from './samples';
export type { SlotEntry, SlotManifest, SlotReport, FetchLike } from './samples';
export type { SoundId } from './recipes';
