/**
 * How to Play: plays a chapter's scripted demonstration in the real engine (same simulation,
 * renderer, audio, HUD and vehicle selector as a match) or runs its practice scenario with the
 * human in control and passive training dummies. It is isolated from competitive play: it never
 * changes the saved settings, never creates bots and never produces a match result.
 */
import { CHAPTERS, PracticeTracker, ScriptRunner } from '../tutorial';
import type { Chapter } from '../tutorial';
import type { CharacterId, GameState, Intents, SimEvent } from '../sim';
import type { MatchController, ScenarioDirector } from './MatchController';
import { patch, useGameStore } from './store';
import type { TutorialView } from './store';

const LOCAL_ID = 0;
/** A finished demo keeps running this long (things settle), then the world is held still. */
const SETTLE_TICKS = 150;
/** After a failed practice attempt, the message stays this long before the restart. */
const RESTART_TICKS = 100;

export interface TutorialHooks {
  stopAttract(): void;
  startAttract(): void;
  /** The character chosen in the menu (read only; the tutorial never changes it). */
  menuCharacter(): CharacterId;
}

export class TutorialController {
  private chapter = 0;
  private mode: TutorialView['mode'] = 'demo';
  private character: CharacterId = 'streetBaller';
  private runner: ScriptRunner | null = null;
  private tracker: PracticeTracker | null = null;
  private finishedAt: number | null = null;
  private restartIn: number | null = null;
  private restartDue = false;
  private run = 0;
  private notice: string | null = null;

  constructor(
    private readonly match: MatchController,
    private readonly hooks: TutorialHooks,
    readonly chapters: readonly Chapter[] = CHAPTERS,
  ) {}

  get active(): boolean {
    return useGameStore.getState().tutorial !== null;
  }

  /** Opens How to Play on a chapter's demo. */
  open(chapter = 0): void {
    this.hooks.stopAttract();
    this.character = this.hooks.menuCharacter();
    this.watch(chapter);
  }

  watch(chapter = this.chapter): void {
    this.chapter = this.clamp(chapter);
    this.mode = 'demo';
    const def = this.chapters[this.chapter]!;
    const state = def.demo.build();
    const runner = new ScriptRunner(def.demo.beats);
    this.runner = runner;
    this.tracker = null;
    this.reset();
    let shown = -1;
    const director: ScenarioDirector = {
      humanInput: false,
      beforeTick: (s) => {
        const step = runner.beforeTick(s);
        if (runner.beatIndex !== shown) {
          shown = runner.beatIndex;
          this.publish();
        }
        return step;
      },
      afterTick: (s, events) => {
        runner.afterTick(s, events);
        if (runner.done && this.finishedAt === null) {
          this.finishedAt = s.tick;
          this.publish();
        }
        if (this.finishedAt !== null && s.tick - this.finishedAt >= SETTLE_TICKS) this.match.frozen = true;
      },
    };
    this.match.startScenario(state, director);
    this.publish();
  }

  practice(chapter = this.chapter): void {
    this.chapter = this.clamp(chapter);
    const def = this.chapters[this.chapter]!;
    if (!def.practice) return;
    this.mode = 'practice';
    const practice = def.practice;
    if (!practice.characterChoice) this.character = this.hooks.menuCharacter();
    const state = practice.build(this.character);
    const tracker = new PracticeTracker(practice.checks(this.character));
    this.tracker = tracker;
    this.runner = null;
    this.reset();
    const director: ScenarioDirector = {
      humanInput: true,
      beforeTick: () => ({ intents: {}, ui: [] }),
      afterTick: (s, events, intents) => this.practiceTick(s, events, intents),
    };
    this.match.startScenario(state, director);
    this.publish();
  }

  /** Plays the current chapter's demo (or practice) again from the start. */
  replay(): void {
    if (this.mode === 'practice') this.practice();
    else this.watch();
  }

  next(): void {
    if (this.chapter < this.chapters.length - 1) this.watch(this.chapter + 1);
  }

  prev(): void {
    if (this.chapter > 0) this.watch(this.chapter - 1);
  }

  /** Vehicle practice: try another character's vehicle (tutorial-only; the menu choice is untouched). */
  setCharacter(character: CharacterId): void {
    this.character = character;
    if (this.mode === 'practice') this.practice();
  }

  togglePause(): void {
    if (this.finishedAt !== null && this.match.frozen) {
      this.replay();
      return;
    }
    this.match.togglePause();
  }

  exit(): void {
    this.runner = null;
    this.tracker = null;
    this.match.stop();
    patch({ tutorial: null });
    this.hooks.startAttract();
  }

  /** Called once per animation frame, outside the simulation step (safe place to reload a scenario). */
  frame(): void {
    if (this.restartDue) {
      this.restartDue = false;
      const notice = this.notice;
      this.practice();
      this.notice = notice;
      this.publish();
    }
  }

  // ------------------------------------------------------------------ internals

  private practiceTick(state: GameState, events: readonly SimEvent[], intents: Intents): void {
    const tracker = this.tracker;
    if (!tracker) return;
    const wasComplete = tracker.complete;
    const changed = tracker.update({ state, events, intents, localId: LOCAL_ID });
    if (tracker.complete && !wasComplete) this.notice = 'Nailed it! Practice complete.';
    if (changed) this.publish();
    if (tracker.complete) return;
    if (this.restartIn === null) {
      const me = state.players[LOCAL_ID]!;
      if (!me.alive) this.failed(me.elimination?.kind === 'vehicle' ? 'Hit by a vehicle!' : 'Caught!');
      else if (state.match.phase === 'ended') this.failed('That round is over.');
    } else if (--this.restartIn <= 0) {
      this.restartIn = null;
      this.restartDue = true;
    }
  }

  private failed(what: string): void {
    this.restartIn = RESTART_TICKS;
    this.notice = `${what} Starting the practice again.`;
    this.publish();
  }

  private reset(): void {
    this.finishedAt = null;
    this.restartIn = null;
    this.restartDue = false;
    this.notice = null;
    this.match.frozen = false;
    this.run++;
  }

  private clamp(i: number): number {
    return Math.max(0, Math.min(this.chapters.length - 1, Math.floor(i)));
  }

  private publish(): void {
    const def = this.chapters[this.chapter]!;
    const runner = this.runner;
    const practice = this.mode === 'practice' && def.practice && this.tracker ? def.practice : null;
    const view: TutorialView = {
      chapter: this.chapter,
      mode: this.mode,
      caption: runner ? runner.caption : (practice?.goal ?? ''),
      step: runner ? runner.step : null,
      beat: runner ? runner.beatIndex : 0,
      beats: runner ? runner.beatCount : 0,
      finished: this.finishedAt !== null,
      practice:
        practice && this.tracker
          ? {
              goal: practice.goal,
              hint: practice.hint,
              checks: this.tracker.checks.map((c, i) => ({ label: c.label, done: this.tracker!.done[i]! })),
              complete: this.tracker.complete,
              character: this.character,
              characterChoice: practice.characterChoice === true,
            }
          : null,
      notice: this.notice,
      run: this.run,
    };
    patch({ tutorial: view });
  }
}
