/**
 * Story cards (docs/CAMPAIGN_TEXT_NARRATION.md): the short presentation of every briefing and story scene.
 *
 * A card has a SUMMARY (one or two sentences), an OBJECTIVE line (a few words) and a READ MORE that holds
 * everything else, so a player understands what to do without reading a paragraph and nothing is removed.
 * Cards are derived from the existing content automatically (first sentences, first objective, the rest in
 * Read more); hand-written copy (`CardCopy` on the content, or the `CARD_COPY` table) wins when present.
 * Sections of a district (field-sections) and results go through the same `makeCard`.
 *
 * Pure data and pure functions: no DOM, no React, no audio. The broker is only ever a message line inside a
 * card's Read more (`lines` keep `fromBroker`): the UI draws those as UNKNOWN NUMBER cards, never a face.
 */
import type { MissionOutcome } from '../sim';
import { CAMPAIGN, defeatLines } from './content';
import { CARD_COPY } from './content/cardCopy';
import type { BossDef, CampaignContent, CardCopy, DistrictId, StoryLine } from './types';
import { DISTRICT_ORDER } from './types';

/** What a card may show by default. The tests enforce these on every card the game ships. */
export const CARD_LIMITS = {
  summarySentences: 2,
  summaryChars: 240,
  objectiveWords: 12,
} as const;

/** Used only when a card has no objective at all; the shipped content never needs it (tested). */
export const FALLBACK_OBJECTIVE = 'Read the brief, then go';

export type CardKind =
  | 'prologue'
  | 'finale'
  | 'ending'
  | 'briefing'
  | 'bossIntro'
  | 'defeat'
  | 'result'
  | 'section'
  | 'sectionResult';

/** One block of Read more: a list of paragraphs, or a dialogue (`lines`, kept whole so the broker stays a message). */
export interface CardSection {
  heading?: string;
  tone?: 'warn' | 'good';
  items: string[];
  /** Dialogue lines with their speakers; `items` then holds the same lines as plain text. */
  lines?: StoryLine[];
}

export interface StoryCard {
  id: string;
  kind: CardKind;
  title: string;
  /** A small line above the title (location, role ...). */
  kicker?: string;
  /** One or two sentences. */
  summary: string;
  /** The big objective line. */
  objective: string;
  /** Small label above the objective line ("Objective", "Next try", "Reward" ...). */
  objectiveLabel: string;
  /** Everything else, flat and in order (the plain text of `sections`): nothing in the source is dropped. */
  readMore: string[];
  /** The same content, structured for display. */
  sections: CardSection[];
  /** The key of this card's narration clip (docs/CAMPAIGN_TEXT_NARRATION.md). */
  narrationId: string;
  /** Who tells the scene, when one voice does. */
  speaker?: string;
}

// ---------------------------------------------------------------- text helpers

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Words in a string. */
export const wordCount = (s: string): number => (clean(s) ? clean(s).split(' ').length : 0);

/** Splits prose into sentences (a full stop, ! or ? followed by a capital letter, a digit or an opening quote). */
export function splitSentences(text: string): string[] {
  const t = clean(text);
  if (!t) return [];
  const out: string[] = [];
  const re = /[.!?…]+["”’')]*\s+(?=["“‘'(]?[A-Z0-9])/g;
  let start = 0;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    out.push(t.slice(start, m.index + m[0].length).trim());
    start = m.index + m[0].length;
  }
  if (start < t.length) out.push(t.slice(start).trim());
  return out;
}

export const sentenceCount = (text: string): number => splitSentences(text).length;

/** The line of a story line as plain text (narration has no speaker label). */
export const lineText = (l: StoryLine): string =>
  l.speaker === 'NARRATOR' ? l.text : `${l.speaker}: ${l.text}`;

/**
 * The leading one or two sentences that fit the limits, and the rest. A first sentence that alone is too long
 * is cut at a word and its remainder becomes the rest (so even then nothing is lost).
 */
export function firstSentences(text: string): { summary: string; rest: string[] } {
  const all = splitSentences(text);
  if (all.length === 0) return { summary: '', rest: [] };
  const take: string[] = [];
  for (const s of all) {
    const next = [...take, s].join(' ');
    if (
      take.length >= CARD_LIMITS.summarySentences ||
      (take.length > 0 && next.length > CARD_LIMITS.summaryChars)
    )
      break;
    take.push(s);
  }
  const summary = take.join(' ');
  if (summary.length <= CARD_LIMITS.summaryChars) return { summary, rest: all.slice(take.length) };
  // a single over-long sentence: cut at a word boundary, keep the remainder in the rest
  const words = summary.split(' ');
  let cut = words.length;
  while (cut > 1 && words.slice(0, cut).join(' ').length > CARD_LIMITS.summaryChars - 1) cut--;
  const head = `${words
    .slice(0, cut)
    .join(' ')
    .replace(/[,;:\s]+$/, '')}…`;
  return { summary: head, rest: [words.slice(cut).join(' '), ...all.slice(take.length)] };
}

const STOP_TAIL = /\b(and|the|a|an|to|of|in|on|with|by|at|for|or|before|while|until)$/i;

/** An objective line from a longer sentence: the first clause that fits, else the first words. */
export function trimObjective(text: string, maxWords: number = CARD_LIMITS.objectiveWords): string {
  const t = clean(text).replace(/[.\s]+$/, '');
  if (wordCount(t) <= maxWords) return t;
  const delimiters = [/[:;]\s/, /,\s/, /\s[-–—]\s/, /\s(?:before|while|when|until|then|so|and)\s/];
  for (const d of delimiters) {
    const head = t.split(d)[0]!.trim();
    if (wordCount(head) >= 3 && wordCount(head) <= maxWords) return head;
  }
  let words = t.split(' ').slice(0, maxWords);
  while (words.length > 3 && STOP_TAIL.test(words.join(' '))) words = words.slice(0, -1);
  return words.join(' ');
}

/** Problems with a card's default view (empty list = fine). The tests run this over every shipped card. */
export function cardIssues(card: StoryCard): string[] {
  const issues: string[] = [];
  if (!card.summary) issues.push('no summary');
  if (sentenceCount(card.summary) > CARD_LIMITS.summarySentences)
    issues.push('summary has too many sentences');
  if (card.summary.length > CARD_LIMITS.summaryChars) issues.push('summary is too long');
  if (!card.objective) issues.push('no objective line');
  if (wordCount(card.objective) > CARD_LIMITS.objectiveWords) issues.push('objective is too long');
  if (!card.narrationId) issues.push('no narration id');
  return issues;
}

// ---------------------------------------------------------------- the generic builder

export interface CardInput {
  id: string;
  kind: CardKind;
  title: string;
  kicker?: string;
  /** The long text the summary stands for (a briefing paragraph, or a scene's lines joined). */
  summaryText: string;
  /**
   * Is the whole of `summaryText` already shown in `sections` (a scene's lines)? Then a derived summary leaves
   * no remainder; otherwise the remainder (or the whole text when the summary is hand-written) goes to Read more.
   */
  summaryInSections?: boolean;
  /** Hand-written copy (wins over derivation). */
  copy?: CardCopy;
  /** Objective candidates in order of preference; the first is trimmed to the limit. */
  objectiveFrom?: string[];
  objectiveLabel?: string;
  /** Read more blocks after the remainder of the summary text. */
  sections?: CardSection[];
  /** Heading of the summary remainder block. */
  remainderHeading?: string;
  narrationId?: string;
  speaker?: string;
}

/** Builds a card; guarantees a summary within the limits, an objective line, and that the rest is in Read more. */
export function makeCard(input: CardInput): StoryCard {
  const sections: CardSection[] = [];
  let summary: string;
  if (input.copy?.summary) {
    summary = clean(input.copy.summary);
    if (!input.summaryInSections && clean(input.summaryText) && clean(input.summaryText) !== summary)
      sections.push({ heading: input.remainderHeading, items: [clean(input.summaryText)] });
  } else {
    const { summary: s, rest } = firstSentences(input.summaryText);
    summary = s;
    if (!input.summaryInSections && rest.length > 0)
      sections.push({ heading: input.remainderHeading, items: rest });
  }
  for (const s of input.sections ?? []) {
    const items = s.lines ? s.lines.map(lineText) : s.items;
    if (items.length > 0) sections.push({ ...s, items });
  }
  const candidate = input.copy?.objective ?? (input.objectiveFrom ?? []).find((o) => clean(o)) ?? '';
  const objective = candidate
    ? input.copy?.objective
      ? clean(input.copy.objective)
      : trimObjective(candidate)
    : FALLBACK_OBJECTIVE;
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    kicker: input.kicker,
    summary,
    objective,
    objectiveLabel: input.objectiveLabel ?? 'Objective',
    readMore: sections.flatMap((s) => s.items),
    sections,
    narrationId: input.narrationId ?? input.id,
    speaker: input.speaker,
  };
}

/** The text a narration clip speaks for a card: the title, the summary and the objective (never the Read more). */
export const cardNarrationText = (card: StoryCard): string =>
  [card.title, card.summary, `${card.objectiveLabel}: ${card.objective}.`].join(' ');

const copyOf = (
  id: string,
  inline: CardCopy | undefined,
  table: Readonly<Record<string, CardCopy>>,
): CardCopy => ({
  summary: inline?.summary ?? table[id]?.summary,
  objective: inline?.objective ?? table[id]?.objective,
});

// ---------------------------------------------------------------- cards from the content

export function storyCard(
  which: 'prologue' | 'finale',
  content: CampaignContent = CAMPAIGN,
  table: Readonly<Record<string, CardCopy>> = CARD_COPY,
): StoryCard {
  const lines = which === 'finale' ? content.finale : content.prologue;
  const inline = which === 'finale' ? content.finaleCard : content.prologueCard;
  return makeCard({
    id: which,
    kind: which,
    title: which === 'finale' ? 'The Ring Breaks' : 'Ojuelegba, evening',
    kicker: which === 'finale' ? 'Finale' : 'Prologue',
    summaryText: lines.map((l) => l.text).join(' '),
    summaryInSections: true,
    copy: copyOf(which, inline, table),
    objectiveFrom: [which === 'finale' ? 'See how the Ring ends' : 'Pick a fighter and head to Oshodi'],
    sections: [{ heading: 'The scene', items: [], lines }],
    speaker: 'NARRATOR',
  });
}

export function endingCard(
  content: CampaignContent = CAMPAIGN,
  table: Readonly<Record<string, CardCopy>> = CARD_COPY,
): StoryCard {
  const e = content.ending;
  return makeCard({
    id: 'ending',
    kind: 'ending',
    title: e.title,
    kicker: 'Campaign complete',
    summaryText: e.summary,
    copy: copyOf('ending', content.endingCard, table),
    objectiveFrom: ['Replay districts for stars and modifiers'],
    remainderHeading: 'The Ring breaks',
    sections: [
      {
        heading: 'A message',
        items: [],
        lines: [{ speaker: 'UNKNOWN NUMBER', text: e.teaser, fromBroker: true }],
      },
    ],
    speaker: 'NARRATOR',
  });
}

export function briefingCard(
  id: DistrictId,
  content: CampaignContent = CAMPAIGN,
  table: Readonly<Record<string, CardCopy>> = CARD_COPY,
): StoryCard {
  const b = content.districts[id].briefing;
  return makeCard({
    id: `briefing.${id}`,
    kind: 'briefing',
    title: b.title,
    summaryText: b.summary,
    copy: copyOf(`briefing.${id}`, { summary: b.cardSummary, objective: b.objectiveCard }, table),
    objectiveFrom: b.objectives,
    remainderHeading: 'The brief',
    sections: [
      { heading: 'Where', items: [b.location] },
      { heading: 'Objectives', items: b.objectives },
      { heading: 'Intel', items: b.intel },
      { heading: 'Warnings', tone: 'warn', items: b.warnings },
      ...(b.brokerMessage
        ? [{ heading: 'A message', items: [], lines: [{ ...b.brokerMessage, fromBroker: true }] }]
        : []),
    ],
  });
}

export function bossIntroCard(
  id: DistrictId,
  content: CampaignContent = CAMPAIGN,
  table: Readonly<Record<string, CardCopy>> = CARD_COPY,
): StoryCard | null {
  const boss = content.districts[id].boss;
  if (!boss) return null;
  return makeCard({
    id: `intro.${id}`,
    kind: 'bossIntro',
    title: boss.name,
    kicker: boss.title,
    summaryText: boss.introduction.map((l) => l.text).join(' '),
    summaryInSections: true,
    copy: copyOf(`intro.${id}`, boss.introCard, table),
    objectiveFrom: [boss.phases[0].objective],
    objectiveLabel: 'First objective',
    sections: [{ heading: 'The scene', items: [], lines: boss.introduction }],
    speaker: boss.name,
  });
}

export function defeatCard(
  boss: BossDef,
  defeat: 'eliminated' | 'ousted' | null = 'eliminated',
  table: Readonly<Record<string, CardCopy>> = CARD_COPY,
): StoryCard {
  const ousted = defeat === 'ousted' && !!boss.defeatSequenceOusted?.length;
  const id = `defeat.${boss.districtId}${ousted ? '.ousted' : ''}`;
  const lines = defeatLines(boss, defeat);
  return makeCard({
    id,
    kind: 'defeat',
    title: boss.name,
    kicker: ousted ? 'Driven out' : 'Brought down',
    summaryText: lines.map((l) => l.text).join(' '),
    summaryInSections: true,
    copy: copyOf(id, ousted ? boss.defeatOustedCard : boss.defeatCard, table),
    objectiveFrom: [boss.reward.name],
    objectiveLabel: 'Reward',
    sections: [{ heading: 'The scene', items: [], lines }],
    speaker: boss.name,
  });
}

/** Every static card the campaign ships: prologue, finale, ending, and per district the briefing, intro and defeat scenes. */
export function cardsFrom(
  content: CampaignContent = CAMPAIGN,
  table: Readonly<Record<string, CardCopy>> = CARD_COPY,
): StoryCard[] {
  const cards: StoryCard[] = [
    storyCard('prologue', content, table),
    storyCard('finale', content, table),
    endingCard(content, table),
  ];
  for (const id of DISTRICT_ORDER) {
    cards.push(briefingCard(id, content, table));
    const intro = bossIntroCard(id, content, table);
    if (intro) cards.push(intro);
    const boss = content.districts[id].boss;
    if (boss) {
      cards.push(defeatCard(boss, 'eliminated', table));
      if (boss.defeatSequenceOusted?.length) cards.push(defeatCard(boss, 'ousted', table));
    }
  }
  return cards;
}

const staticCards = new Map<string, StoryCard>();
/** A static card by id (memoised, from the shipped content). */
export function cardById(id: string): StoryCard | null {
  if (staticCards.size === 0) for (const c of cardsFrom()) staticCards.set(c.id, c);
  return staticCards.get(id) ?? null;
}

// ---------------------------------------------------------------- results

/** Why a mission was not won, in plain words (one or two sentences). */
export function failureSummary(o: MissionOutcome): string {
  const phase = Math.min(3, o.phasesCleared + 1);
  if (o.result === 'timeout')
    return `Time ran out in phase ${phase} of 3. The district keeps its hold, so go again with a plan.`;
  return `You were put down for the last time in phase ${phase} of 3 (${o.livesUsed} ${o.livesUsed === 1 ? 'life' : 'lives'} spent).`;
}

export interface ResultCardInput {
  boss: BossDef;
  outcome: MissionOutcome;
  districtName: string;
  /** The district this clear opened (null: none). */
  nextName: string | null;
  /** The sixth clear: the finale is next. */
  finale: boolean;
  firstClear: boolean;
  /** "Name: description" of each reward and the unlock labels, for Read more. */
  rewardLines: string[];
}

/** The result of a mission as a card: a win carries the defeat scene, a loss the hint for the next try. */
export function missionResultCard(
  input: ResultCardInput,
  table: Readonly<Record<string, CardCopy>> = CARD_COPY,
): StoryCard {
  const { boss, outcome } = input;
  if (outcome.result === 'won') {
    const scene = defeatCard(boss, outcome.defeat, table);
    const next = input.finale
      ? 'Watch the finale'
      : input.nextName
        ? `Next: ${input.nextName} is open`
        : 'Back to the map';
    return makeCard({
      id: `result.${outcome.missionId}.won`,
      kind: 'result',
      title: outcome.defeat === 'ousted' ? `${boss.name} is out` : `${boss.name} is down`,
      kicker: `${input.districtName} · mission complete`,
      summaryText: scene.summary,
      summaryInSections: true,
      copy: { summary: scene.summary, objective: next },
      objectiveLabel: 'Next',
      narrationId: scene.narrationId,
      sections: [
        ...scene.sections,
        {
          heading: 'What changes',
          items: [input.firstClear ? boss.consequence : 'The district stays as you left it.'],
        },
        { heading: 'Rewards', tone: 'good', items: input.rewardLines },
      ],
      speaker: boss.name,
    });
  }
  const phase = boss.phases[Math.min(2, Math.max(0, outcome.phasesCleared))]!;
  return makeCard({
    id: `result.${outcome.missionId}.${outcome.result === 'timeout' ? 'timeout' : 'lost'}`,
    kind: 'result',
    title: outcome.result === 'timeout' ? 'Out of time' : 'Put down',
    kicker: `${input.districtName} · ${outcome.result === 'timeout' ? 'time up' : 'mission failed'}`,
    summaryText: failureSummary(outcome),
    summaryInSections: true,
    copy: { summary: failureSummary(outcome) },
    objectiveFrom: [phase.objective],
    objectiveLabel: 'Next try',
    sections: [
      { heading: `Phase: ${phase.title}`, items: [phase.objective, phase.callout] },
      { heading: 'Hint', tone: 'good', items: [boss.counterplay] },
    ],
  });
}

// ---------------------------------------------------------------- sections (field-sections) and any other content

/**
 * The fields of a district section the cards read. `SectionDef` (field-sections) need not match exactly: only
 * the fields it has are used, and an explicit `cardSummary` / `summary` and `objectiveCard` win.
 */
export interface SectionLike {
  id: string;
  name?: string;
  title?: string;
  location?: string;
  /** Short summary when the content has one; otherwise `summary` / `text` is cut to the limits. */
  cardSummary?: string;
  summary?: string;
  objectiveCard?: string;
  objectives?: string[];
  intel?: string[];
  warnings?: string[];
  /** Any extra paragraphs. */
  readMore?: string[];
}

export function sectionCard(s: SectionLike, kind: 'section' | 'sectionResult' = 'section'): StoryCard {
  const long = s.summary ?? '';
  const explicit =
    s.cardSummary ??
    (sentenceCount(long) <= CARD_LIMITS.summarySentences && long.length <= CARD_LIMITS.summaryChars
      ? long
      : undefined);
  return makeCard({
    id: `${kind === 'section' ? 'section' : 'sectionResult'}.${s.id}`,
    kind,
    title: s.title ?? s.name ?? s.id,
    kicker: s.location,
    summaryText: long,
    copy: { summary: explicit, objective: s.objectiveCard },
    objectiveFrom: s.objectives ?? [],
    remainderHeading: 'The brief',
    sections: [
      { heading: 'Objectives', items: s.objectives ?? [] },
      { heading: 'Intel', items: s.intel ?? [] },
      { heading: 'Warnings', tone: 'warn', items: s.warnings ?? [] },
      { items: s.readMore ?? [] },
    ],
  });
}

export const sectionCards = (list: readonly SectionLike[]): StoryCard[] => list.map((s) => sectionCard(s));
