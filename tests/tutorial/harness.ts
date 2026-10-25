/**
 * Headless Academy rig: the real MatchController + TutorialController with fake renderer / input ports,
 * so demos and practices run exactly the code path the browser runs (minus WebGL). A practice is played by
 * a "human" whose presses go through the real input port (the same path as the keyboard / touch controls).
 */
import { MatchController } from '../../src/app/MatchController';
import type { InputPort, RendererPort } from '../../src/app/ports';
import { TutorialController } from '../../src/app/TutorialController';
import { useGameStore } from '../../src/app/store';
import type { CharacterId, GameState, Intent, SimEvent } from '../../src/sim';
import { LESSONS, ScriptRunner } from '../../src/tutorial';
import type { Act, CueTrigger, KeyValueStore } from '../../src/tutorial';

export class FakeInput implements InputPort {
  navMode = false;
  next: Intent = {};
  pollDevices(): void {}
  buildIntent(): Intent {
    const i = this.next;
    this.next = {};
    return i;
  }
  takeVehiclePress(): boolean {
    return false;
  }
  clear(): void {
    this.next = {};
  }
}

export class FakeRenderer implements RendererPort {
  loads = 0;
  lastMarkers: readonly { x: number; y: number }[] | undefined;
  loadGame(): void {
    this.loads++;
  }
  handleEvents(): void {}
  render(
    _s: GameState,
    _a: number,
    _dt: number,
    info: { markers?: readonly { x: number; y: number }[] },
  ): void {
    this.lastMarkers = info.markers;
  }
  pickEntry(): null {
    return null;
  }
  setQuality(): void {}
}

export class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

export interface Rig {
  match: MatchController;
  tutorial: TutorialController;
  input: FakeInput;
  renderer: FakeRenderer;
  attract: { started: number; stopped: number };
  store: MemoryStore;
  cues: CueTrigger[];
}

export function rig(menuCharacter: CharacterId = 'streetBaller', store = new MemoryStore()): Rig {
  const input = new FakeInput();
  const renderer = new FakeRenderer();
  const match = new MatchController({ renderer, input, botFactory: () => ({ decide: () => ({}) }) });
  const attract = { started: 0, stopped: 0 };
  const cues: CueTrigger[] = [];
  const tutorial = new TutorialController(match, {
    stopAttract: () => attract.stopped++,
    startAttract: () => attract.started++,
    menuCharacter: () => menuCharacter,
    storage: () => store,
    cue: (t) => cues.push(t),
  });
  return { match, tutorial, input, renderer, attract, store, cues };
}

export const lessonIndex = (id: string): number => {
  const i = LESSONS.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`no lesson ${id}`);
  return i;
};

export const view = () => useGameStore.getState().tutorial!;

/** Opens a lesson straight on its practice. */
export function practise(id: string, character: CharacterId = 'streetBaller', store?: MemoryStore): Rig {
  const r = rig(character, store);
  r.tutorial.open(lessonIndex(id));
  r.tutorial.practice();
  return r;
}

/** One simulation tick plus the animation-frame hook (where a failed attempt is reloaded). */
export function step(r: Rig): SimEvent[] {
  const events = r.match.stepOnce();
  r.tutorial.frame();
  return events;
}

/**
 * Plays a scripted "human" through the real input port until the practice completes (or `limit` ticks).
 * Returns every event seen.
 */
export function drive(r: Rig, acts: Act[], limit = 4000, stopWhenComplete = true): SimEvent[] {
  const runner = new ScriptRunner([{ caption: 'solution', acts: { 0: acts }, hold: 0 }]);
  const seen: SimEvent[] = [];
  for (let i = 0; i < limit; i++) {
    const s = r.match.state!;
    const stepIntents = runner.beforeTick(s);
    r.input.next = { ...stepIntents.intents[0] };
    const events = r.match.stepOnce();
    seen.push(...events);
    runner.afterTick(s, events);
    r.tutorial.frame();
    if (stopWhenComplete && view().practice?.complete) break;
    if (!stopWhenComplete && runner.done) break;
  }
  return seen;
}

export interface DemoRun {
  events: SimEvent[];
  state: GameState;
  heroTiles: string[];
  ticks: number;
  captions: string[];
  problems: string[];
}

/** Plays a lesson's demo to the end (plus the settle time) and records what happened. */
export function playDemo(id: string, limit = 6000): DemoRun {
  const r = rig();
  r.tutorial.autoPractice = false;
  r.tutorial.open(lessonIndex(id));
  const run: DemoRun = {
    events: [],
    state: r.match.state!,
    heroTiles: [],
    ticks: 0,
    captions: [],
    problems: [],
  };
  for (let i = 0; i < limit && !r.match.frozen; i++) {
    const s = r.match.state!;
    run.events.push(...r.match.stepOnce());
    run.ticks++;
    run.state = s;
    const hero = s.players[0]!;
    const tile = `${hero.x},${hero.y}`;
    if (run.heroTiles[run.heroTiles.length - 1] !== tile) run.heroTiles.push(tile);
    const caption = useGameStore.getState().tutorial?.caption ?? '';
    if (run.captions[run.captions.length - 1] !== caption) run.captions.push(caption);
  }
  const runner = (r.tutorial as unknown as { runner: { problems: string[] } | null }).runner;
  run.problems = runner?.problems ?? [];
  return run;
}

export const of = <T extends SimEvent['type']>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
