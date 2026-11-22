/**
 * Imported FIRST by `main.tsx`: in the Test Lab it isolates persistence before any game module reads the storage
 * (the settings store, the audio preferences and the graphics learner all read it when they are first imported).
 */
import { parseTestLab } from './params';
import { installIsolation } from './isolation';

if (typeof window !== 'undefined' && parseTestLab(window.location.search)) installIsolation(window);
