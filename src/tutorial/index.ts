/** The How to Play course: every chapter in teaching order. Pure: imports only `src/sim`. */
import { CARRY, KICK, PASS, PUNCH, REMOTE, SKILLS } from './chapters/abilities';
import { CITY_RUMBLE, ENDGAME, HAZARDS, POWER_YARD } from './chapters/arenas';
import { GENERATOR, MOVE, RANGE, SOCKETS } from './chapters/basics';
import { VEHICLE } from './chapters/vehicles';
import type { Chapter } from './types';

export const CHAPTERS: readonly Chapter[] = [
  MOVE,
  GENERATOR,
  SOCKETS,
  RANGE,
  KICK,
  PUNCH,
  CARRY,
  PASS,
  REMOTE,
  SKILLS,
  VEHICLE,
  HAZARDS,
  ENDGAME,
  POWER_YARD,
  CITY_RUMBLE,
];

export { ScriptRunner, readingTicks } from './script';
export type { ScriptTick } from './script';
export { PracticeTracker } from './practice';
export { inRumbleCore } from './chapters/arenas';
export { DEMO_ENTRY, DEMO_TURN } from './chapters/vehicles';
export type * from './types';
