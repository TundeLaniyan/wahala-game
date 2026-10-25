/**
 * The WAHALA! Training Academy. Each lesson runs in the real engine (same simulation, renderer, audio, HUD
 * and touch controls as a match):
 *
 *   1. the objective is shown (and stays up),
 *   2. a brief scripted demonstration plays the real mechanics,
 *   3. the human attempts it with the real controls (practice; the normal HUD and TouchControls are shown),
 *   4. success is detected from the real simulation state and events (src/tutorial/practice.ts),
 *   5. common mistakes get a gentle tip,
 *   6. a failed attempt (caught, or a task-specific failure) restarts from the latest checkpoint, as often
 *      as needed,
 *   7. the next lesson opens only when this one is completed or explicitly skipped.
 *
 * It is isolated from competitive play: it never changes the saved settings, never creates bots and never
 * produces a match result. Progress (completed / skipped lessons) is kept on this device only.
 */
import {
  LESSONS,
  PracticeSession,
  ScriptRunner,
  emptyProgress,
  loadProgress,
  markCompleted,
  markSkipped,
  resumeIndex,
  saveProgress,
  settled,
} from '../tutorial';
import type { AcademyProgress, CueTrigger, KeyValueStore, Lesson, PracticeSignal } from '../tutorial';
import type { CharacterId, GameState, Intents, SimEvent } from '../sim';
import type { MatchController, ScenarioDirector } from './MatchController';
import { patch, useGameStore } from './store';
import type { TutorialView } from './store';

const LOCAL_ID = 0;
/** A finished demo keeps running this long (things settle), then the world is held still. */
const SETTLE_TICKS = 120;
/** After a failed attempt, the explanation stays this long before the retry. */
const RESTART_TICKS = 110;
/** A praise / status notice stays up this long. */
const NOTICE_TICKS = 150;

export interface TutorialHooks {
  stopAttract(): void;
  startAttract(): void;
  /** The character chosen in the menu (read only; the Academy never changes it). */
  menuCharacter(): CharacterId;
  /** Where lesson progress is remembered (null / omitted: not remembered). */
  storage?(): KeyValueStore | null;
  /** Plays an approved voice clip for this trigger (only when the narration setting is on). */
  cue?(trigger: CueTrigger): void;
}

export class TutorialController {
  private lesson = 0;
  private mode: TutorialView['mode'] = 'demo';
  private character: CharacterId = 'streetBaller';
  private runner: ScriptRunner | null = null;
  private session: PracticeSession | null = null;
  private finishedAt: number | null = null;
  /** The demo has finished and settled: the practice starts on the next frame (when `autoPractice`). */
  private demoSettled = false;
  private restartIn: number | null = null;
  private restartDue = false;
  private run = 0;
  private notice: string | null = null;
  private noticeUntil = 0;
  private progress: AcademyProgress = emptyProgress();
  /** Step 2 -> 3: the practice starts by itself once the demonstration has played. */
  autoPractice = true;

  constructor(
    private readonly match: MatchController,
    private readonly hooks: TutorialHooks,
    readonly lessons: readonly Lesson[] = LESSONS,
  ) {}

  get active(): boolean {
    return useGameStore.getState().tutorial !== null;
  }

  /** The live practice (tests and debug). */
  get practiceSession(): PracticeSession | null {
    return this.session;
  }

  /** Opens the Academy on a lesson's demonstration (default: the first lesson not yet completed or skipped). */
  open(lesson?: number): void {
    this.hooks.stopAttract();
    this.progress = loadProgress(this.store());
    this.character = this.hooks.menuCharacter();
    this.watch(
      lesson ??
        resumeIndex(
          this.lessons.map((l) => l.id),
          this.progress,
        ),
    );
  }

  /** Step 2: the brief demonstration in the real engine. */
  watch(lesson = this.lesson): void {
    this.lesson = this.clamp(lesson);
    this.mode = 'demo';
    const def = this.lessons[this.lesson]!;
    const state = def.demo.build();
    const runner = new ScriptRunner(def.demo.beats);
    this.runner = runner;
    this.session = null;
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
        if (this.finishedAt !== null && s.tick - this.finishedAt >= SETTLE_TICKS && !this.demoSettled) {
          this.demoSettled = true;
          this.match.frozen = true;
        }
      },
    };
    this.match.startScenario(state, director);
    this.publish();
  }

  /** Steps 3-7: the human's attempt. */
  practice(lesson = this.lesson): void {
    this.lesson = this.clamp(lesson);
    const def = this.lessons[this.lesson]!;
    this.mode = 'practice';
    const practice = def.practice;
    if (!practice.characterChoice) this.character = this.hooks.menuCharacter();
    const state = practice.build(this.character);
    const session = new PracticeSession(practice, LOCAL_ID);
    session.begin(state);
    this.session = session;
    this.runner = null;
    this.reset();
    this.startPractice(state, true);
    this.cueStart();
    this.publish();
  }

  /** Plays the current lesson's demo, or restarts its practice from the beginning. */
  replay(): void {
    if (this.mode === 'practice') this.practice();
    else this.watch();
  }

  /** Moves on to the next lesson; only once this one is completed or explicitly skipped. */
  next(): boolean {
    if (!this.canAdvance || this.lesson >= this.lessons.length - 1) return false;
    this.watch(this.lesson + 1);
    return true;
  }

  /** Explicitly skips the current lesson (remembered) and opens the next one. */
  skip(): void {
    this.progress = markSkipped(this.progress, this.lessons[this.lesson]!.id);
    saveProgress(this.store(), this.progress);
    if (this.lesson < this.lessons.length - 1) this.watch(this.lesson + 1);
    else this.publish();
  }

  prev(): void {
    if (this.lesson > 0) this.watch(this.lesson - 1);
  }

  /** Direct selection from the lesson list (any lesson, demo or practice). */
  select(lesson: number, mode: TutorialView['mode'] = 'demo'): void {
    if (mode === 'practice') this.practice(lesson);
    else this.watch(lesson);
  }

  /** Forget every completed / skipped lesson on this device. */
  resetProgress(): void {
    this.progress = emptyProgress();
    saveProgress(this.store(), this.progress);
    this.publish();
  }

  get canAdvance(): boolean {
    return settled(this.progress, this.lessons[this.lesson]!.id);
  }

  /** Vehicle practice: try another character's vehicle (Academy only; the menu choice is untouched). */
  setCharacter(character: CharacterId): void {
    this.character = character;
    if (this.mode === 'practice') this.practice();
  }

  togglePause(): void {
    if (this.mode === 'demo' && this.demoSettled) {
      this.watch();
      return;
    }
    this.match.togglePause();
  }

  exit(): void {
    this.runner = null;
    this.session = null;
    this.match.stop();
    patch({ tutorial: null });
    this.hooks.startAttract();
  }

  /** Called once per animation frame, outside the simulation step (the safe place to reload a scenario). */
  frame(): void {
    if (this.restartDue && this.session) {
      this.restartDue = false;
      const resumed = this.session.restore();
      this.startPractice(resumed, this.session.index === 0);
      this.run++;
      this.cueStart();
      this.publish();
    } else if (this.mode === 'demo' && this.demoSettled && this.autoPractice) {
      this.practice();
    }
  }

  // ------------------------------------------------------------------ internals

  private startPractice(state: GameState, fromTop: boolean): void {
    const session = this.session!;
    const def = this.lessons[this.lesson]!.practice;
    // scripted (harmless) opponents run from the top of the practice only, never again after a checkpoint
    const opponents =
      fromTop && def.opponents ? new ScriptRunner([{ caption: '', acts: def.opponents, hold: 0 }]) : null;
    const director: ScenarioDirector = {
      humanInput: true,
      beforeTick: (s) => {
        const intents: Intents = {};
        if (opponents && !opponents.done) {
          const step = opponents.beforeTick(s);
          for (const [id, intent] of Object.entries(step.intents))
            if (Number(id) !== LOCAL_ID) intents[Number(id)] = intent;
        }
        return { intents, ui: [] };
      },
      afterTick: (s, events, intents) => {
        if (opponents && !opponents.done) opponents.afterTick(s, events);
        this.practiceTick(s, events, intents);
      },
      markers: (s) => (session.complete ? [] : session.markers(s)),
    };
    this.restartIn = null;
    this.restartDue = false;
    this.match.startScenario(state, director);
  }

  private practiceTick(state: GameState, events: readonly SimEvent[], intents: Intents): void {
    const session = this.session;
    if (!session) return;
    if (this.restartIn !== null) {
      if (--this.restartIn <= 0) {
        this.restartIn = null;
        this.restartDue = true;
      }
      return;
    }
    const signals = session.update({ state, events, intents, localId: LOCAL_ID });
    for (const sig of signals) this.onSignal(sig, state);
    if (this.notice && state.tick >= this.noticeUntil && !session.complete) {
      this.notice = null;
      this.publish();
    }
  }

  private onSignal(sig: PracticeSignal, state: GameState): void {
    const session = this.session!;
    switch (sig.kind) {
      case 'taskDone': {
        const task = session.tasks[sig.index]!;
        this.say(sig.praise ?? 'Done!', state);
        if (task.cue?.done) this.hooks.cue?.(task.cue.done);
        else this.cueStart();
        break;
      }
      case 'complete':
        this.progress = markCompleted(this.progress, this.lessons[this.lesson]!.id);
        saveProgress(this.store(), this.progress);
        this.notice = 'Lesson complete!';
        this.noticeUntil = Infinity;
        break;
      case 'failed':
        this.restartIn = RESTART_TICKS;
        break;
      case 'guidance':
      case 'respawned':
        break;
    }
    this.publish();
  }

  private cueStart(): void {
    const start = this.session?.current?.cue?.start;
    if (start) this.hooks.cue?.(start);
  }

  private say(text: string, state: GameState): void {
    this.notice = text;
    this.noticeUntil = state.tick + NOTICE_TICKS;
  }

  private reset(): void {
    this.finishedAt = null;
    this.demoSettled = false;
    this.restartIn = null;
    this.restartDue = false;
    this.notice = null;
    this.noticeUntil = 0;
    this.match.frozen = false;
    this.run++;
  }

  private store(): KeyValueStore | null {
    try {
      return this.hooks.storage?.() ?? null;
    } catch {
      return null;
    }
  }

  private clamp(i: number): number {
    return Math.max(0, Math.min(this.lessons.length - 1, Math.floor(i)));
  }

  private publish(): void {
    const def = this.lessons[this.lesson]!;
    const runner = this.runner;
    const session = this.mode === 'practice' ? this.session : null;
    const task = session?.current ?? null;
    const view: TutorialView = {
      lesson: this.lesson,
      lessonId: def.id,
      mode: this.mode,
      caption: runner ? runner.caption : '',
      step: runner ? runner.step : null,
      beat: runner ? runner.beatIndex : 0,
      beats: runner ? runner.beatCount : 0,
      finished: this.finishedAt !== null,
      practice: session
        ? {
            tasks: session.tasks.map((t, i) => ({ id: t.id, label: t.label, done: session.done[i]! })),
            current: session.index,
            instruction: task?.instruction ?? '',
            controls: task?.controls ?? [],
            guidance: session.guidance,
            failed: session.failure !== null,
            attempts: session.attempts,
            complete: session.complete,
            character: this.character,
            characterChoice: def.practice.characterChoice === true,
          }
        : null,
      notice: this.notice,
      run: this.run,
      completed: this.progress.completed,
      skipped: this.progress.skipped,
      canAdvance: this.canAdvance,
    };
    patch({ tutorial: view });
  }
}
