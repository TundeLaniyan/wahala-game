import { describe, expect, it } from 'vitest';
import { MatchController } from '../../src/app/MatchController';
import type { Bot, BotFactory, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { buildHud } from '../../src/app/hud';
import { buildPlayers } from '../../src/app/names';
import type { Intent, SimEvent } from '../../src/sim';

class FakeInput implements InputPort {
  navMode = false;
  next: Intent = {};
  vehiclePress = false;
  pollDevices(): void {}
  buildIntent(): Intent {
    const i = this.next;
    this.next = {};
    return i;
  }
  takeVehiclePress(): boolean {
    const v = this.vehiclePress;
    this.vehiclePress = false;
    return v;
  }
  clear(): void {}
}

class FakeRenderer implements RendererPort {
  loaded = 0;
  frames = 0;
  events: SimEvent[] = [];
  loadGame(): void {
    this.loaded++;
  }
  handleEvents(events: readonly SimEvent[]): void {
    this.events.push(...events);
  }
  render(): void {
    this.frames++;
  }
  pickEntry(): null {
    return null;
  }
  setQuality(): void {}
}

const idleBot: Bot = { decide: () => ({}) };

function make(botFactory: BotFactory = () => idleBot) {
  const input = new FakeInput();
  const renderer = new FakeRenderer();
  const controller = new MatchController({ renderer, input, botFactory });
  return { input, renderer, controller };
}

const settings = { ...DEFAULT_GAME_SETTINGS, competitors: 3 as const };

describe('match setup', () => {
  it('builds distinct bots with the chosen difficulty and gives the human slot 0', () => {
    const players = buildPlayers({ ...settings, character: 'lekkiBoy', difficulty: 'hard' }, 5);
    expect(players).toHaveLength(3);
    expect(players[0]).toMatchObject({ name: 'YOU', isBot: false, characterId: 'lekkiBoy' });
    expect(players[1]!.characterId).not.toBe('lekkiBoy');
    expect(new Set(players.map((p) => p.name)).size).toBe(3);
    expect(players.slice(1).every((p) => p.isBot && p.difficulty === 'hard')).toBe(true);
  });
});

describe('MatchController', () => {
  it('starts a match, shows the playing screen and runs the fixed-step loop', () => {
    const { controller, renderer } = make();
    controller.start(settings, 1);
    expect(useGameStore.getState().screen).toBe('playing');
    expect(renderer.loaded).toBe(1);
    controller.frame(0);
    controller.frame(16.7 * 6);
    expect(controller.state!.tick).toBeGreaterThanOrEqual(5);
    expect(renderer.frames).toBe(2);
  });

  it('feeds human input and bot decisions into the same simulation', () => {
    const decisions: number[] = [];
    const botFactory = ({ playerId }: { playerId: number }): Bot => ({
      decide: () => {
        decisions.push(playerId);
        return {};
      },
    });
    const { controller, input } = make(botFactory);
    controller.start(settings, 3);
    for (let i = 0; i < 200; i++) controller.stepOnce();
    expect(new Set(decisions)).toEqual(new Set([1, 2]));
    const p = controller.state!.players[0]!;
    const y = p.y;
    input.next = { move: 'up' };
    controller.stepOnce();
    expect(p.y).toBe(y - 1);
  });

  it('pauses without advancing, and resumes', () => {
    const { controller } = make();
    controller.start(settings, 1);
    controller.frame(0);
    controller.frame(100);
    const t = controller.state!.tick;
    controller.setPaused(true);
    controller.frame(300);
    controller.frame(500);
    expect(controller.state!.tick).toBe(t);
    expect(useGameStore.getState().paused).toBe(true);
    controller.setPaused(false);
    controller.frame(520);
    controller.frame(620);
    expect(controller.state!.tick).toBeGreaterThan(t);
  });

  it('skips to a real result and reaches the results screen', () => {
    const { controller } = make();
    controller.start({ ...settings, competitors: 2 }, 9);
    // the human stays idle on its spawn; the idle bot too: the match must end by timeout draw
    controller.skipToResults();
    expect(controller.state!.match.phase).toBe('ended');
    expect(controller.state!.match.result).toEqual({ kind: 'draw', reason: 'timeout' });
    expect(useGameStore.getState().screen).toBe('results');
    expect(useGameStore.getState().summary).not.toBeNull();
  });

  it('rematch creates a fresh game and returns to playing', () => {
    const { controller, renderer } = make();
    controller.start({ ...settings, competitors: 2 }, 9);
    controller.skipToResults();
    controller.rematch();
    expect(renderer.loaded).toBe(2);
    expect(controller.state!.tick).toBe(0);
    expect(useGameStore.getState().screen).toBe('playing');
  });

  it('runs the vehicle-entry flow: press begins, nav moves focus, confirm launches', () => {
    const { controller, input } = make();
    controller.start({ ...settings, competitors: 2, character: 'streetBaller' }, 4);
    for (let i = 0; i < 160; i++) controller.stepOnce();
    controller.state!.players[0]!.hasVoucher = true;
    input.vehiclePress = true;
    controller.stepOnce();
    controller.stepOnce();
    expect(controller.state!.players[0]!.entryUntil).not.toBeNull();
    controller.handleNav('right');
    controller.handleNav('confirm');
    controller.stepOnce();
    expect(controller.state!.vehicles).toHaveLength(1);
    expect(controller.state!.players[0]!.hasVoucher).toBe(false);
  });

  it('tags the human win only when the human is the winner', () => {
    const { controller } = make();
    controller.start({ ...settings, competitors: 2 }, 2);
    for (let i = 0; i < 160; i++) controller.stepOnce();
    const s = controller.state!;
    s.players[1]!.alive = false;
    controller.stepOnce();
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0 });
    const hud = buildHud(s, 0, null);
    expect(hud.result).toEqual({ kind: 'win', winnerId: 0 });
    expect(hud.players[1]!.alive).toBe(false);
  });
});

describe('HUD projection', () => {
  it('has no health bars: only alive flags, counts and abilities', () => {
    const { controller } = make();
    controller.start(settings, 6);
    const hud = buildHud(controller.state!, 0, null);
    expect(Object.keys(hud.players[0]!)).not.toContain('health');
    expect(hud.me!.capacity).toBe(1);
    expect(hud.phase).toBe('countdown');
    expect(hud.secondsLeft).toBe(120);
  });
});
