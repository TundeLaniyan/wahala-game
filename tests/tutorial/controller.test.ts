import { describe, expect, it } from 'vitest';
import { useGameStore } from '../../src/app/store';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { ACADEMY_KEY, LESSONS } from '../../src/tutorial';
import { MemoryStore, drive, lessonIndex, playDemo, practise, rig, view } from './harness';
import { place, walk } from '../../src/tutorial/script';

describe('Academy flow (objective -> demo -> practice -> complete or skip)', () => {
  it('demos are deterministic: the same lesson plays out identically twice', () => {
    const a = playDemo('vehicle');
    const b = playDemo('vehicle');
    expect(b.events).toEqual(a.events);
    expect(b.ticks).toBe(a.ticks);
  });

  it('opening the Academy stops the menu demo and shows lesson 1: its objective and demo, in the real engine', () => {
    const r = rig();
    r.tutorial.open();
    expect(r.attract.stopped).toBe(1);
    expect(r.renderer.loads).toBe(1);
    expect(view().lesson).toBe(0);
    expect(view().lessonId).toBe('move');
    expect(view().mode).toBe('demo');
    expect(view().caption).toBe(LESSONS[0]!.demo.beats[0]!.caption);
    expect(useGameStore.getState().screen).toBe('playing');
    expect(r.match.scenario).toBe(true);
  });

  it('after the demonstration the practice starts by itself (step 2 -> step 3)', () => {
    const r = rig();
    r.tutorial.open(lessonIndex('place'));
    for (let i = 0; i < 4000 && !r.match.frozen; i++) r.match.stepOnce();
    expect(view().finished).toBe(true);
    expect(view().mode).toBe('demo');
    r.tutorial.frame();
    expect(view().mode).toBe('practice');
    expect(view().practice!.current).toBe(0);
  });

  it('during a demo the human cannot steer the scripted hero; Esc still pauses', () => {
    const r = rig();
    r.tutorial.open(lessonIndex('place'));
    r.input.next = { place: true, move: 'up' };
    r.match.stepOnce();
    expect(r.match.state!.generators).toHaveLength(0);
    r.match.handleNav('cancel');
    expect(useGameStore.getState().paused).toBe(true);
    r.match.handleNav('cancel');
    expect(useGameStore.getState().paused).toBe(false);
  });

  it('the next lesson opens only once this one is completed or explicitly skipped', () => {
    const store = new MemoryStore();
    const r = practise('move', 'streetBaller', store);
    expect(view().canAdvance).toBe(false);
    expect(r.tutorial.next()).toBe(false);
    expect(view().lesson).toBe(0);
    // explicit skip: remembered, and it moves on
    r.tutorial.skip();
    expect(view().lesson).toBe(1);
    expect(view().skipped).toEqual(['move']);
    r.tutorial.prev();
    expect(view().lesson).toBe(0);
    expect(view().canAdvance).toBe(true);
    // lesson 2 is not done: still locked forwards
    r.tutorial.watch(1);
    expect(r.tutorial.next()).toBe(false);
    // completing it unlocks the way on
    r.tutorial.practice(1);
    drive(r, [walk('right', 4), place, walk('left', 3)]);
    expect(view().practice!.complete).toBe(true);
    expect(view().notice).toBe('Lesson complete!');
    expect(r.tutorial.next()).toBe(true);
    expect(view().lessonId).toBe('escape');
    expect(JSON.parse(store.getItem(ACADEMY_KEY)!)).toEqual({ completed: ['place'], skipped: ['move'] });
  });

  it('progress is kept on this device: the Academy reopens at the first lesson not done yet', () => {
    const store = new MemoryStore();
    store.setItem(ACADEMY_KEY, JSON.stringify({ completed: ['move', 'place'], skipped: ['escape'] }));
    const r = rig('streetBaller', store);
    r.tutorial.open();
    expect(view().lessonId).toBe('cross');
    expect(view().completed).toEqual(['move', 'place']);
    r.tutorial.resetProgress();
    expect(view().completed).toEqual([]);
    expect(JSON.parse(store.getItem(ACADEMY_KEY)!)).toEqual({ completed: [], skipped: [] });
  });

  it('broken or missing storage never stops the Academy', () => {
    const store = new MemoryStore();
    store.setItem(ACADEMY_KEY, '{not json');
    const r = rig('streetBaller', store);
    r.tutorial.open();
    expect(view().lessonId).toBe('move');
  });

  it('direct selection: any lesson can be practised straight from the list', () => {
    const r = rig();
    r.tutorial.open();
    r.tutorial.select(lessonIndex('remote'), 'practice');
    expect(view().mode).toBe('practice');
    expect(view().lessonId).toBe('remote');
    r.tutorial.select(lessonIndex('team'));
    expect(view().mode).toBe('demo');
    expect(view().lessonId).toBe('team');
  });

  it('a scenario never shows results, rematches or skips to results', () => {
    const r = practise('cross');
    const s = r.match.state!;
    s.players[1]!.alive = false; // the dummy falls: the round ends with a "win"
    for (let i = 0; i < 5; i++) r.match.stepOnce();
    expect(s.match.phase).toBe('ended');
    r.match.frame(0);
    r.match.frame(5000);
    r.match.frame(10000);
    r.match.skipToResults();
    r.match.rematch();
    expect(useGameStore.getState().screen).toBe('playing');
    expect(useGameStore.getState().summary).toBeNull();
  });

  it('the Academy never writes the saved settings and exits back to the title', () => {
    const before = { ...DEFAULT_GAME_SETTINGS, ...useGameStore.getState().settings };
    const r = practise('kick');
    drive(r, [walk('right', 3), place]);
    r.tutorial.skip();
    r.tutorial.prev();
    r.tutorial.replay();
    r.tutorial.setCharacter('campusQueen');
    r.tutorial.exit();
    expect(useGameStore.getState().screen).toBe('title');
    expect(useGameStore.getState().tutorial).toBeNull();
    expect(useGameStore.getState().settings).toEqual(before);
    expect(r.match.scenario).toBe(false);
    expect(r.attract.started).toBe(1);
  });

  it('a normal match started afterwards is a normal match again', () => {
    const r = rig();
    r.tutorial.open();
    r.match.start({ ...DEFAULT_GAME_SETTINGS, play: 'classic', competitors: 2 }, 3);
    expect(r.match.scenario).toBe(false);
    expect(r.match.state!.players).toHaveLength(2);
  });
});
