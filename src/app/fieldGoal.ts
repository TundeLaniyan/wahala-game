/**
 * Plain words for a field mission's current objective (docs/CHECKPOINT_CLARITY.md, decisions CK1-CK8): the HUD tag
 * (GO TO / HOLD / DEFEAT / ESCAPE / RETURN), the target line, the door-hold readout, and the rail notices when a
 * checkpoint is walked through or a leg is done. Pure functions of the sim's read-only `MissionView`
 * (`fieldGoal`, `route`, `legKind`); they invent no rule. The notices come from comparing two views (a memory of the
 * last one), not from events, so they also fire when the sim was stepped without routing its events (debug stepping).
 */
import type { FieldGoalVerb, FieldGoalView, FieldObjectiveKind, MissionView } from '../sim';

export const FIELD_VERB_TAG: Readonly<Record<FieldGoalVerb, string>> = {
  goTo: 'GO TO',
  hold: 'HOLD',
  defeat: 'DEFEAT',
  escape: 'ESCAPE',
  return: 'RETURN',
};

/** "CHECKPOINT A", "DISPATCH DEPOT DOOR", "2 ENEMIES", "FOOTBRIDGE", "ORITA GATE". */
export function fieldTargetText(goal: FieldGoalView): string {
  switch (goal.verb) {
    case 'defeat':
      return `${goal.enemiesLeft} ${goal.enemiesLeft === 1 ? 'ENEMY' : 'ENEMIES'} LEFT`;
    case 'hold':
      return `${goal.target} DOOR`;
    default:
      return goal.target;
  }
}

/** One short line for "what next": "CHECKPOINT B", "HOLD THE DISPATCH DEPOT DOOR", "RETURN TO ORITA GATE". */
export function fieldNextText(goal: FieldGoalView): string {
  switch (goal.verb) {
    case 'goTo':
      return goal.target;
    case 'hold':
      return `HOLD THE ${goal.target} DOOR`;
    case 'defeat':
      return `DEFEAT ${goal.enemiesLeft} ${goal.enemiesLeft === 1 ? 'ENEMY' : 'ENEMIES'}`;
    case 'escape':
      return `ESCAPE TO ${goal.target}`;
    case 'return':
      return `RETURN TO ${goal.target}`;
  }
}

/** Short notes beside the tag: how the objective completes, and whether fights are needed. */
export function fieldNotes(goal: FieldGoalView): string[] {
  const notes: string[] = [];
  if (goal.verb === 'goTo' || goal.verb === 'return' || goal.verb === 'escape')
    notes.push('WALK THROUGH, NO WAITING');
  if (goal.verb === 'hold') notes.push('STAND STILL ON IT');
  if (goal.verb === 'defeat') notes.push('ALL MUST GO DOWN');
  if (goal.verb === 'escape') notes.push("DON'T LET THEM CATCH YOU");
  if (goal.fightsOptional) notes.push('FIGHTS OPTIONAL');
  return notes;
}

export type HoldState = 'idle' | 'filling' | 'draining' | 'full';

export interface HoldReadout {
  /** "HOLD 0.4 / 1.0 s" */
  label: string;
  fraction: number;
  state: HoldState;
  /** What to do about it: "STEP ON THE DOOR", "STAY ON IT", "STEP BACK ON", "RAID STARTING". */
  hint: string;
  /** "DISPATCH DEPOT" (+ BONUS for an optional door). */
  door: string;
}

const secs = (ticks: number): string => (Math.max(0, ticks) / 60).toFixed(1);

export function holdReadout(hold: NonNullable<FieldGoalView['hold']>): HoldReadout {
  const full = hold.ticks >= hold.goalTicks;
  const state: HoldState = full ? 'full' : hold.standing ? 'filling' : hold.ticks > 0 ? 'draining' : 'idle';
  const hint =
    state === 'full'
      ? 'RAID STARTING'
      : state === 'filling'
        ? 'STAY ON IT'
        : state === 'draining'
          ? 'STEP BACK ON'
          : 'STEP ON THE DOOR';
  return {
    label: `HOLD ${secs(hold.ticks)} / ${secs(hold.goalTicks)} s`,
    fraction: Math.min(1, Math.max(0, hold.fraction)),
    state,
    hint,
    door: hold.optional ? `${hold.label} (BONUS)` : hold.label,
  };
}

// ------------------------------------------------------------------ rail notices

export interface FieldNoticeMemory {
  fieldId: string;
  /** Route checkpoints already walked through (`FieldRouteMarkerView.id`). */
  done: ReadonlySet<string>;
  leg: number;
  legKind: FieldObjectiveKind | undefined;
}

export interface FieldNotice {
  text: string;
  tone: 'good';
}

/** What a finished leg is called in its notice when it was not a checkpoint (those name themselves). */
const LEG_DONE: Readonly<Record<FieldObjectiveKind, string>> = {
  reachMarkers: 'CHECKPOINTS DONE',
  clearGroup: 'ENEMIES DOWN',
  escapeRoute: 'ESCAPED',
  door: 'RAID DONE',
  returnRoute: 'ROUTE DONE',
};

/**
 * The notices between the last view seen (`prev`) and this one: "CHECKPOINT A ✓ · NEXT: CHECKPOINT B" when a
 * checkpoint is walked through, "ENEMIES DOWN ✓ · NEXT: ..." when another leg is done. Nothing on the first view of a
 * mission, outside a field mission, or once it is over.
 */
export function fieldNotices(
  prev: FieldNoticeMemory | null,
  view: MissionView | null,
): { memory: FieldNoticeMemory | null; notices: FieldNotice[] } {
  // no mission picture (a door's raid is playing): keep the memory, so the leg the raid finished is announced on return
  if (!view) return { memory: prev, notices: [] };
  if (view.format !== 'field' || !view.fieldId) return { memory: null, notices: [] };
  const done = new Set((view.route ?? []).filter((r) => r.state === 'done').map((r) => r.id));
  const memory: FieldNoticeMemory = {
    fieldId: view.fieldId,
    done,
    leg: view.legIndex ?? 0,
    legKind: view.legKind,
  };
  if (!prev || prev.fieldId !== view.fieldId || view.outcome) return { memory, notices: [] };
  const goal = view.fieldGoal ?? null;
  const next = goal ? ` · NEXT: ${fieldNextText(goal)}` : '';
  const notices: FieldNotice[] = [];
  const route = view.route ?? [];
  const reached = route.filter((r) => r.state === 'done' && !prev.done.has(r.id));
  for (const r of reached) {
    // the next checkpoint of the same leg names itself; after the leg's last one, the next objective does
    const after = route.find((o) => o.leg === r.leg && o.index === r.index + 1);
    const then = after ? ` · NEXT: ${after.label}` : next;
    notices.push({ text: `${r.label} ✓${then}`, tone: 'good' });
  }
  if (reached.length === 0 && memory.leg > prev.leg && prev.legKind)
    notices.push({ text: `${LEG_DONE[prev.legKind]} ✓${next}`, tone: 'good' });
  return { memory, notices };
}
