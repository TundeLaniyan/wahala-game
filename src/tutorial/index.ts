/** The WAHALA! Training Academy: courses and lessons in teaching order. Pure: imports only `src/sim`. */
import { CROSS, ESCAPE, MOVE, PLACE, SAFETY } from './lessons/beginner';
import { MELEE, VEHICLE } from './lessons/combat';
import { CRUSH, DEATHMATCH, SURVIVAL, TEAM } from './lessons/modes';
import { MULTIPLE, PROTECTION, RANGE, SQUARE } from './lessons/power';
import { DISARM, KICK, PASS, PUNCH, REMOTE } from './lessons/tricks';
import type { Course, Lesson } from './types';

export const COURSES: readonly Course[] = [
  { id: 'beginner', title: 'Beginner', blurb: 'Five short lessons: everything your first match needs.' },
  { id: 'power', title: 'Power-ups', blurb: 'More generators, longer reach, Square Blast, protection.' },
  { id: 'tricks', title: 'Generator tricks', blurb: 'Kick, punch, disarm, walk through, remote.' },
  { id: 'combat', title: 'Button B', blurb: 'Hit a rival, call in your vehicle.' },
  { id: 'modes', title: 'Match rules', blurb: 'Wahala Crush and the three City Rumble modes.' },
];

export const LESSONS: readonly Lesson[] = [
  MOVE,
  PLACE,
  ESCAPE,
  CROSS,
  SAFETY,
  MULTIPLE,
  RANGE,
  SQUARE,
  PROTECTION,
  KICK,
  PUNCH,
  DISARM,
  PASS,
  REMOTE,
  MELEE,
  VEHICLE,
  CRUSH,
  SURVIVAL,
  DEATHMATCH,
  TEAM,
];

export const lessonIndex = (id: string): number => LESSONS.findIndex((l) => l.id === id);

export { ScriptRunner, readingTicks } from './script';
export type { ScriptTick } from './script';
export { PracticeSession } from './practice';
export type { PracticeSignal } from './practice';
export { resolveHint, TOUCH_WORDS } from './hints';
export type { HintDevice, HintRow, HintRows } from './hints';
export {
  ACADEMY_KEY,
  emptyProgress,
  loadProgress,
  markCompleted,
  markSkipped,
  resumeIndex,
  saveProgress,
  settled,
} from './progress';
export type { AcademyProgress, KeyValueStore } from './progress';
export type * from './types';
