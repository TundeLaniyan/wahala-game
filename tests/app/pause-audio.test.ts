/** The controller's side of pause audio (decision PA1): a paused match makes no sound of its own. */
import { describe, expect, it } from 'vitest';
import { MatchController } from '../../src/app/MatchController';
import type { Bot, InputPort, RendererPort } from '../../src/app/ports';
import { NULL_AUDIO } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { Intent, SimEvent } from '../../src/sim';

class FakeInput implements InputPort {
  navMode = false;
  pollDevices(): void {}
  buildIntent(): Intent {
    return {};
  }
  takeVehiclePress(): boolean {
    return false;
  }
  clear(): void {}
}
class FakeRenderer implements RendererPort {
  loadGame(): void {}
  handleEvents(): void {}
  render(): void {}
  pickEntry(): null {
    return null;
  }
  setQuality(): void {}
}
const idleBot: Bot = { decide: () => ({}) };

function make() {
  const log: string[] = [];
  const heard: SimEvent[][] = [];
  const audio = {
    ...NULL_AUDIO,
    playUi: (k: string) => void log.push(`ui:${k}`),
    setPaused: (p: boolean) => void log.push(`paused:${p}`),
    handleEvents: (e: readonly SimEvent[]) => void heard.push([...e]),
  };
  const controller = new MatchController({
    renderer: new FakeRenderer(),
    input: new FakeInput(),
    botFactory: () => idleBot,
    audio,
  });
  controller.start({ ...DEFAULT_GAME_SETTINGS, play: 'classic', competitors: 2, arenaId: 'danfoBusPark' });
  return { controller, log, heard };
}

describe('pausing during the countdown', () => {
  it('the countdown beeps and GO stay silent while paused and are not replayed on every paused frame', () => {
    const { controller, log, heard } = make();
    const s = controller.state!;
    s.match.countdownRemaining = 1; // the last countdown tick: GO would sound each frame if it were not gated
    controller.setPaused(true);
    log.length = 0;
    for (let i = 0; i < 30; i++) controller.frame(1000 + i * 16);
    expect(log.filter((l) => l.startsWith('ui:'))).toEqual([]);
    expect(heard.every((e) => e.length === 0)).toBe(true); // no gameplay events reach the audio either
    expect(controller.state!.tick).toBe(s.tick); // and the sim is untouched
  });

  it('tells the audio about each pause and resume', () => {
    const { controller, log } = make();
    controller.setPaused(true);
    controller.setPaused(false);
    controller.setPaused(true);
    expect(log.filter((l) => l.startsWith('paused:'))).toEqual([
      'paused:true',
      'paused:false',
      'paused:true',
    ]);
  });
});
