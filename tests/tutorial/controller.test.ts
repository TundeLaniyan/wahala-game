import { describe, expect, it } from 'vitest';
import { useGameStore } from '../../src/app/store';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { CHAPTERS } from '../../src/tutorial';
import { chapterIndex, playDemo, rig } from './harness';

describe('tutorial isolation and the MatchController scenario hooks', () => {
  it('demos are deterministic: the same chapter plays out identically twice', () => {
    const a = playDemo('vehicle');
    const b = playDemo('vehicle');
    expect(b.events).toEqual(a.events);
    expect(b.ticks).toBe(a.ticks);
  });

  it('opening How to Play stops the menu demo, shows the first chapter and loads the real renderer path', () => {
    const r = rig();
    r.tutorial.open();
    expect(r.attract.stopped).toBe(1);
    expect(r.renderer.loads).toBe(1);
    const view = useGameStore.getState().tutorial!;
    expect(view.chapter).toBe(0);
    expect(view.mode).toBe('demo');
    expect(view.caption).toBe(CHAPTERS[0]!.demo.beats[0]!.caption);
    expect(useGameStore.getState().screen).toBe('playing');
    expect(r.match.scenario).toBe(true);
  });

  it('during a demo the human cannot steer the scripted hero or its vehicle selector; Esc still pauses', () => {
    const r = rig();
    r.tutorial.open(chapterIndex('vehicle'));
    r.input.next = { place: true, move: 'up' };
    r.input.vehicle = true;
    r.match.stepOnce();
    expect(r.match.state!.generators).toHaveLength(0);
    r.match.handleNav('confirm');
    r.match.confirmEntry();
    r.match.handleNav('cancel');
    expect(useGameStore.getState().paused).toBe(true);
    r.match.handleNav('cancel');
    expect(useGameStore.getState().paused).toBe(false);
  });

  it('a scenario never shows results, rematches or skips to results', () => {
    const r = rig();
    r.tutorial.open(chapterIndex('skills'));
    r.tutorial.practice();
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
    expect(r.match.state).toBe(s);
  });

  it('a normal match started afterwards is a normal match again', () => {
    const r = rig();
    r.tutorial.open();
    r.match.start({ ...DEFAULT_GAME_SETTINGS, competitors: 2 }, 3);
    expect(r.match.scenario).toBe(false);
    expect(r.match.state!.players).toHaveLength(2);
  });

  it('chapter navigation is clamped and replays rebuild the scenario', () => {
    const r = rig();
    r.tutorial.open();
    r.tutorial.prev();
    expect(useGameStore.getState().tutorial!.chapter).toBe(0);
    for (let i = 0; i < CHAPTERS.length + 3; i++) r.tutorial.next();
    expect(useGameStore.getState().tutorial!.chapter).toBe(CHAPTERS.length - 1);
    const first = r.match.state;
    r.tutorial.replay();
    expect(r.match.state).not.toBe(first);
    // chapters without a practice stay on their demo
    r.tutorial.watch(chapterIndex('endgame'));
    r.tutorial.practice();
    expect(useGameStore.getState().tutorial!.mode).toBe('demo');
  });
});
