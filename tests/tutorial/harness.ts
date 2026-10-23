/**
 * Headless tutorial rig: the real MatchController + TutorialController with fake renderer / input
 * ports, so demos and practices run exactly the code path the browser runs (minus WebGL).
 */
import { MatchController } from '../../src/app/MatchController';
import type { InputPort, RendererPort } from '../../src/app/ports';
import { TutorialController } from '../../src/app/TutorialController';
import { useGameStore } from '../../src/app/store';
import type { CharacterId, GameState, Intent, SimEvent } from '../../src/sim';
import { CHAPTERS } from '../../src/tutorial';

export class FakeInput implements InputPort {
  navMode = false;
  next: Intent = {};
  vehicle = false;
  pollDevices(): void {}
  buildIntent(): Intent {
    const i = this.next;
    this.next = {};
    return i;
  }
  takeVehiclePress(): boolean {
    const v = this.vehicle;
    this.vehicle = false;
    return v;
  }
  clear(): void {
    this.next = {};
    this.vehicle = false;
  }
}

export class FakeRenderer implements RendererPort {
  loads = 0;
  loadGame(): void {
    this.loads++;
  }
  handleEvents(): void {}
  render(): void {}
  pickEntry(): null {
    return null;
  }
  setQuality(): void {}
}

export interface Rig {
  match: MatchController;
  tutorial: TutorialController;
  input: FakeInput;
  renderer: FakeRenderer;
  attract: { started: number; stopped: number };
}

export function rig(menuCharacter: CharacterId = 'streetBaller'): Rig {
  const input = new FakeInput();
  const renderer = new FakeRenderer();
  const match = new MatchController({ renderer, input, botFactory: () => ({ decide: () => ({}) }) });
  const attract = { started: 0, stopped: 0 };
  const tutorial = new TutorialController(match, {
    stopAttract: () => attract.stopped++,
    startAttract: () => attract.started++,
    menuCharacter: () => menuCharacter,
  });
  return { match, tutorial, input, renderer, attract };
}

export const chapterIndex = (id: string): number => {
  const i = CHAPTERS.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`no chapter ${id}`);
  return i;
};

export interface DemoRun {
  events: SimEvent[];
  state: GameState;
  /** Per tick snapshots of interest. */
  maxActiveGenerators: number[];
  heroTiles: string[];
  ticks: number;
  captions: string[];
  problems: string[];
  /** Vehicle selector snapshots whenever they changed: stage / focused entrance / focused turn. */
  selector: string[];
}

/** Plays a chapter's demo to the end (plus the settle time) and records what happened. */
export function playDemo(id: string, limit = 6000): DemoRun {
  const r = rig();
  r.tutorial.open(chapterIndex(id));
  const run: DemoRun = {
    events: [],
    state: r.match.state!,
    maxActiveGenerators: [],
    heroTiles: [],
    ticks: 0,
    captions: [],
    problems: [],
    selector: [],
  };
  for (let i = 0; i < limit && !r.match.frozen; i++) {
    const s = r.match.state!;
    run.events.push(...r.match.stepOnce());
    run.ticks++;
    run.state = s;
    const counts = s.players.map(
      (p) => s.generators.filter((g) => g.ownerId === p.id && g.mode !== 'disabled').length,
    );
    run.maxActiveGenerators = counts.map((c, k) => Math.max(c, run.maxActiveGenerators[k] ?? 0));
    const hero = s.players[0]!;
    const tile = `${hero.x},${hero.y}`;
    if (run.heroTiles[run.heroTiles.length - 1] !== tile) run.heroTiles.push(tile);
    const o = r.match.entryOverlay();
    const sel = o ? `${o.stage}|${o.focusKey}|${o.stage === 'turn' ? o.focusTurnKey : ''}` : 'idle';
    if (run.selector[run.selector.length - 1] !== sel) run.selector.push(sel);
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
