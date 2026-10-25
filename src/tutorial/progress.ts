/**
 * Academy progress, kept on this device only (no account): which lessons were completed and which were
 * explicitly skipped. Pure functions over an injected key-value store so they are testable without a browser.
 */
export const ACADEMY_KEY = 'wahala.academy.v1';

export interface AcademyProgress {
  completed: string[];
  skipped: string[];
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const emptyProgress = (): AcademyProgress => ({ completed: [], skipped: [] });

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];

export function loadProgress(store: KeyValueStore | null): AcademyProgress {
  try {
    const raw = store?.getItem(ACADEMY_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<AcademyProgress>;
    const completed = ids(parsed.completed);
    return { completed, skipped: ids(parsed.skipped).filter((id) => !completed.includes(id)) };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(store: KeyValueStore | null, p: AcademyProgress): void {
  try {
    store?.setItem(ACADEMY_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: progress simply is not remembered */
  }
}

export function markCompleted(p: AcademyProgress, id: string): AcademyProgress {
  return {
    completed: p.completed.includes(id) ? p.completed : [...p.completed, id],
    skipped: p.skipped.filter((s) => s !== id),
  };
}

export function markSkipped(p: AcademyProgress, id: string): AcademyProgress {
  if (p.completed.includes(id) || p.skipped.includes(id)) return p;
  return { completed: p.completed, skipped: [...p.skipped, id] };
}

/** A lesson may be left forwards once it is completed or explicitly skipped. */
export const settled = (p: AcademyProgress, id: string): boolean =>
  p.completed.includes(id) || p.skipped.includes(id);

/** The first lesson neither completed nor skipped (0 when everything is done: start again from the top). */
export function resumeIndex(lessonIds: readonly string[], p: AcademyProgress): number {
  const i = lessonIds.findIndex((id) => !settled(p, id));
  return i < 0 ? 0 : i;
}
