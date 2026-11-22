/**
 * Test Lab feedback (docs/TEST_LAB.md, decision TL4): one status and one short note per test, kept under the Test Lab's
 * own key (never in a game save) and turned into a compact plain-text summary the founder pastes into a chat.
 * Nothing here ever sets a status by itself: only a tap on the status buttons does, so a test is never "passed" for him.
 */
import { FEEDBACK_KEY } from './feedbackKey';
import type { StorageLike } from './isolation';

export type FeedbackStatus = 'notTested' | 'pass' | 'needsWork' | 'failed';
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = ['pass', 'needsWork', 'failed', 'notTested'];
export const FEEDBACK_LABEL: Readonly<Record<FeedbackStatus, string>> = {
  pass: 'Pass',
  needsWork: 'Needs improvement',
  failed: 'Failed',
  notTested: 'Not tested',
};
/** The summary's tag per status (upper case, so it reads at a glance in a chat). */
const TAG: Readonly<Record<FeedbackStatus, string>> = {
  pass: 'PASS',
  needsWork: 'NEEDS IMPROVEMENT',
  failed: 'FAILED',
  notTested: 'NOT TESTED',
};

export type LabLevel = 'easy' | 'normal' | 'hard';
export const LAB_LEVELS: readonly LabLevel[] = ['easy', 'normal', 'hard'];
export const LEVEL_LABEL: Readonly<Record<LabLevel, string>> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

export const NOTE_MAX = 200;

export interface FeedbackEntry {
  status: FeedbackStatus;
  /** One short line (at most `NOTE_MAX` characters, no line breaks). */
  note: string;
  /** The level the test was marked at, when the test has levels. */
  level?: LabLevel;
}
export type FeedbackMap = Record<string, FeedbackEntry>;

/** A note as stored: one line, trimmed, at most `NOTE_MAX` characters. */
export function cleanNote(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
}

/** Repairs whatever was stored: unknown statuses, odd types and unknown fields are dropped, never thrown on. */
export function sanitizeFeedback(raw: unknown): FeedbackMap {
  const out: FeedbackMap = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue;
    const e = v as Partial<FeedbackEntry>;
    const status = FEEDBACK_STATUSES.includes(e.status as FeedbackStatus)
      ? (e.status as FeedbackStatus)
      : 'notTested';
    const note = typeof e.note === 'string' ? cleanNote(e.note) : '';
    const level = LAB_LEVELS.includes(e.level as LabLevel) ? (e.level as LabLevel) : undefined;
    out[id] = { status, note, ...(level ? { level } : {}) };
  }
  return out;
}

export function loadFeedback(store: StorageLike | null): FeedbackMap {
  try {
    const text = store?.getItem(FEEDBACK_KEY);
    return text ? sanitizeFeedback(JSON.parse(text)) : {};
  } catch {
    return {};
  }
}

/** False when the browser refused the write (the in-page copy still works until the page closes). */
export function saveFeedback(store: StorageLike | null, map: FeedbackMap): boolean {
  try {
    if (!store) return false;
    store.setItem(FEEDBACK_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/** One entry changed (a new map; the status `notTested` with no note removes the entry). */
export function withFeedback(map: FeedbackMap, id: string, change: Partial<FeedbackEntry>): FeedbackMap {
  const prev = map[id] ?? { status: 'notTested' as FeedbackStatus, note: '' };
  const next: FeedbackEntry = {
    ...prev,
    ...change,
    note: change.note !== undefined ? cleanNote(change.note) : prev.note,
  };
  const { [id]: _removed, ...rest } = map;
  void _removed;
  return next.status === 'notTested' && next.note === '' ? rest : { ...rest, [id]: next };
}

export interface SummaryEntry {
  id: string;
  title: string;
  section: 'playtest' | 'scenario';
}

const SECTION_TITLE = { playtest: 'FULL PLAYTESTS', scenario: 'ISOLATED SCENARIOS' } as const;

/** The compact plain-text summary (pure, so it is unit-tested): a header, the two sections, the totals. */
export function summarizeFeedback(
  map: FeedbackMap,
  entries: readonly SummaryEntry[],
  meta: { when: string; device?: string },
): string {
  const lines = [`WAHALA! TEST LAB (${meta.when})`];
  if (meta.device) lines.push(`Device: ${meta.device}`);
  const counts: Record<FeedbackStatus, number> = { pass: 0, needsWork: 0, failed: 0, notTested: 0 };
  for (const section of ['playtest', 'scenario'] as const) {
    lines.push('', SECTION_TITLE[section]);
    for (const e of entries.filter((x) => x.section === section)) {
      const f = map[e.id];
      const status = f?.status ?? 'notTested';
      counts[status]++;
      const level = f?.level ? ` (${LEVEL_LABEL[f.level]})` : '';
      const note = f?.note ? `: ${f.note}` : '';
      lines.push(`- [${TAG[status]}] ${e.title}${level}${note}`);
    }
  }
  lines.push(
    '',
    `Totals: ${counts.pass} pass, ${counts.needsWork} needs improvement, ${counts.failed} failed, ${counts.notTested} not tested`,
  );
  return lines.join('\n');
}
