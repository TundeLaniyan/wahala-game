import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamepadInput } from '../src/input/gamepad';
import type { ActionName, NavCommand } from '../src/input/types';

function pad(buttons: number[], axes: [number, number] = [0, 0]): Gamepad {
  const b = Array.from({ length: 17 }, (_, i) => ({
    pressed: buttons.includes(i),
    touched: false,
    value: buttons.includes(i) ? 1 : 0,
  }));
  return { connected: true, buttons: b, axes } as unknown as Gamepad;
}

function setup() {
  let current = pad([]);
  vi.stubGlobal('navigator', { getGamepads: () => [current] });
  const actions: ActionName[] = [];
  const navs: NavCommand[] = [];
  const input = new GamepadInput({
    onAction: (a) => actions.push(a),
    onNav: (n) => navs.push(n),
    onUse: () => undefined,
  });
  return { input, actions, navs, set: (p: Gamepad) => (current = p) };
}

afterEach(() => vi.unstubAllGlobals());

describe('gamepad mapping', () => {
  it('D-pad and left stick set a single cardinal direction', () => {
    const g = setup();
    g.set(pad([14]));
    g.input.poll();
    expect(g.input.held).toBe('left');
    g.set(pad([], [0.1, 0.9]));
    g.input.poll();
    expect(g.input.held).toBe('down');
    g.set(pad([], [0.7, 0.6]));
    g.input.poll();
    expect(g.input.held).toBe('right'); // dominant axis only: never diagonal
    g.set(pad([]));
    g.input.poll();
    expect(g.input.held).toBeNull();
  });

  it('face buttons fire one-shot actions once per press', () => {
    const g = setup();
    g.set(pad([0, 5]));
    g.input.poll();
    g.input.poll();
    expect(g.actions).toEqual(['place', 'detonate']);
    g.set(pad([2, 3, 1, 4]));
    g.input.poll();
    expect(g.actions).toEqual(['place', 'detonate', 'skill', 'action', 'vehicle', 'disarm']);
  });

  it('B is the skill button and only steps back in menus; it never pauses', () => {
    const g = setup();
    g.set(pad([1]));
    g.input.poll();
    expect(g.actions).toContain('skill');
    expect(g.navs).toContain('back');
    expect(g.navs).not.toContain('cancel');
    g.set(pad([9]));
    g.input.poll();
    expect(g.navs).toContain('pause');
  });

  it('D-pad presses become navigation for the vehicle-entry selector', () => {
    const g = setup();
    g.set(pad([15]));
    g.input.poll();
    expect(g.navs).toEqual(['right']);
  });

  it('does nothing without a connected pad', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [null] });
    const input = new GamepadInput({
      onAction: () => undefined,
      onNav: () => undefined,
      onUse: () => undefined,
    });
    input.poll();
    expect(input.held).toBeNull();
    expect(input.connected).toBe(false);
  });
});
