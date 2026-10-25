import { describe, expect, it } from 'vitest';
import {
  ACADEMY_KEY,
  COURSES,
  LESSONS,
  emptyProgress,
  loadProgress,
  markCompleted,
  markSkipped,
  resumeIndex,
  saveProgress,
  settled,
} from '../../src/tutorial';
import { MemoryStore } from './harness';

describe('Academy progress (this device only, no account)', () => {
  it('round-trips through storage under wahala.academy.v1', () => {
    const store = new MemoryStore();
    let p = emptyProgress();
    p = markSkipped(p, 'move');
    p = markCompleted(p, 'place');
    saveProgress(store, p);
    expect(ACADEMY_KEY).toBe('wahala.academy.v1');
    expect(loadProgress(store)).toEqual({ completed: ['place'], skipped: ['move'] });
  });

  it('completing a skipped lesson moves it to completed; skipping a completed one changes nothing', () => {
    let p = markSkipped(emptyProgress(), 'move');
    p = markCompleted(p, 'move');
    expect(p).toEqual({ completed: ['move'], skipped: [] });
    expect(markSkipped(p, 'move')).toBe(p);
    expect(settled(p, 'move')).toBe(true);
    expect(settled(p, 'place')).toBe(false);
  });

  it('tolerates junk and a missing store', () => {
    const store = new MemoryStore();
    store.setItem(ACADEMY_KEY, JSON.stringify({ completed: ['a', 3, 'a'], skipped: 'x' }));
    expect(loadProgress(store)).toEqual({ completed: ['a'], skipped: [] });
    expect(loadProgress(null)).toEqual(emptyProgress());
    expect(() => saveProgress(null, emptyProgress())).not.toThrow();
  });

  it('resumes at the first lesson neither completed nor skipped', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(resumeIndex(ids, emptyProgress())).toBe(0);
    expect(resumeIndex(ids, { completed: ['move'], skipped: ['place'] })).toBe(2);
    expect(resumeIndex(ids, { completed: ids, skipped: [] })).toBe(0);
  });

  it('the course starts with a short Beginner block, then the advanced modules', () => {
    expect(COURSES.map((c) => c.id)).toEqual(['beginner', 'power', 'tricks', 'combat', 'modes']);
    const order = LESSONS.map((l) => COURSES.findIndex((c) => c.id === l.course));
    expect([...order].sort((a, b) => a - b)).toEqual(order); // grouped, in course order
    expect(LESSONS.filter((l) => l.course === 'beginner').map((l) => l.id)).toEqual([
      'move',
      'place',
      'escape',
      'cross',
      'safety',
    ]);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    // carry is gone from normal play: no lesson teaches it
    expect(LESSONS.some((l) => /carry/i.test(l.id + l.title))).toBe(false);
  });
});
