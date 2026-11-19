/**
 * Learn to Play: how the existing Training Academy lessons are grouped on screen (pure, unit-tested). The lessons, their
 * order and the saved progress are the Academy's own (`src/tutorial`); this file only says which section a lesson sits
 * in, so nothing is duplicated or renumbered. Every lesson is in exactly one section.
 */
import { LESSONS } from '../../tutorial';
import type { AcademyProgress } from '../../tutorial';

export type AcademySectionId = 'quick' | 'generators' | 'classic' | 'rumble' | 'combat' | 'advanced';

export interface AcademySection {
  id: AcademySectionId;
  title: string;
  blurb: string;
  /** Lesson ids, in teaching order. */
  lessons: readonly string[];
  /** The Generator Tactics pilot keeps its "pilot" label. */
  pilot?: boolean;
}

/**
 * QUICK START is the five Beginner lessons (the whole first match, which includes movement: lesson 1). The rest group
 * the remaining lessons by topic. There is no separate Movement section because the Academy has no further movement
 * lessons; one is not invented.
 */
export const ACADEMY_SECTIONS: readonly AcademySection[] = [
  {
    id: 'quick',
    title: 'Quick Start',
    blurb: 'Five short lessons: everything your first match needs.',
    lessons: ['move', 'place', 'escape', 'cross', 'safety'],
  },
  {
    id: 'generators',
    title: 'Generators',
    blurb: 'Power-ups and tricks: more generators, longer reach, kick, punch, disarm, pass and the remote.',
    lessons: ['multiple', 'range', 'square', 'protection', 'kick', 'punch', 'disarm', 'pass', 'remote'],
  },
  {
    id: 'classic',
    title: 'Classic Blast',
    blurb: 'Grid battles: how the Wahala Crush closes the board.',
    lessons: ['crush'],
  },
  {
    id: 'rumble',
    title: 'City Rumble',
    blurb: 'The three City Rumble modes: Last Player Standing, Free-for-All and Team Deathmatch.',
    lessons: ['survival', 'deathmatch', 'team'],
  },
  {
    id: 'combat',
    title: 'Combat & Specials',
    blurb: 'Button B: hit a rival, call in your vehicle.',
    lessons: ['melee', 'vehicle'],
  },
  {
    id: 'advanced',
    title: 'Advanced Training',
    blurb: 'Generator Tactics (pilot): bait a punch, hide a generator, box an enemy in.',
    lessons: ['trap-agbero', 'trap-thrower', 'trap-hidden'],
    pilot: true,
  },
];

/** Lessons that belong to no section (new lessons added to the Academy later): shown with Advanced, never dropped. */
export function unsectionedLessons(): string[] {
  const placed = new Set(ACADEMY_SECTIONS.flatMap((s) => s.lessons));
  return LESSONS.map((l) => l.id).filter((id) => !placed.has(id));
}

export interface SectionProgress {
  done: number;
  total: number;
}

export function sectionProgress(section: AcademySection, p: AcademyProgress): SectionProgress {
  const ids = section.lessons.filter((id) => LESSONS.some((l) => l.id === id));
  return { done: ids.filter((id) => p.completed.includes(id)).length, total: ids.length };
}

/** The section a player should land on: the one holding the next unfinished lesson (Quick Start for a new player). */
export function startSection(nextLessonId: string | null): AcademySectionId {
  if (!nextLessonId) return 'quick';
  return ACADEMY_SECTIONS.find((s) => s.lessons.includes(nextLessonId))?.id ?? 'quick';
}
