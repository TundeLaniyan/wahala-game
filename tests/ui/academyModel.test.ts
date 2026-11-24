import { describe, expect, it } from 'vitest';
import { LESSONS, emptyProgress } from '../../src/tutorial';
import {
  ACADEMY_SECTIONS,
  sectionProgress,
  startSection,
  unsectionedLessons,
} from '../../src/ui/menu/academyModel';

describe('Learn to Play sections', () => {
  it('every Academy lesson sits in exactly one section and no section names a missing lesson', () => {
    const ids = LESSONS.map((l) => l.id);
    const listed = ACADEMY_SECTIONS.flatMap((s) => s.lessons);
    expect(new Set(listed).size).toBe(listed.length);
    for (const id of listed) expect(ids).toContain(id);
    expect(unsectionedLessons()).toEqual([]);
  });

  it('the first section (Beginner) is the five Beginner lessons, and the Generator Tactics pilot stays labelled', () => {
    expect(ACADEMY_SECTIONS[0]!.id).toBe('quick');
    expect(ACADEMY_SECTIONS[0]!.title).toBe('Beginner'); // never the name of the Quick Start match (FU2-1)
    expect(ACADEMY_SECTIONS[0]!.lessons).toEqual(LESSONS.slice(0, 5).map((l) => l.id));
    expect(ACADEMY_SECTIONS.find((s) => s.id === 'advanced')!.pilot).toBe(true);
  });

  it('progress counts completed lessons per section; the start section holds the next lesson', () => {
    const p = { ...emptyProgress(), completed: ['move', 'place'] };
    expect(sectionProgress(ACADEMY_SECTIONS[0]!, p)).toEqual({ done: 2, total: 5 });
    expect(startSection(null)).toBe('quick');
    expect(startSection('survival')).toBe('rumble');
    expect(startSection('trap-hidden')).toBe('advanced');
  });
});
