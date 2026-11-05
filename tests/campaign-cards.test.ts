/**
 * Story cards (docs/CAMPAIGN_TEXT_NARRATION.md): every briefing and scene has a short summary, an objective line
 * and a Read more with everything else; nothing is removed; the broker stays a message line.
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN,
  CARD_LIMITS,
  DISTRICT_ORDER,
  FALLBACK_OBJECTIVE,
  bossList,
  briefingCard,
  cardById,
  cardIssues,
  cardNarrationText,
  cardsFrom,
  defeatCard,
  failureSummary,
  firstSentences,
  makeCard,
  missionResultCard,
  sectionCard,
  sentenceCount,
  splitSentences,
  trimObjective,
  wordCount,
} from '../src/campaign';
import type { StoryCard, StoryLine } from '../src/campaign';
import type { MissionOutcome } from '../src/sim';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const all = cardsFrom();

const outcome = (over: Partial<MissionOutcome> = {}): MissionOutcome => ({
  result: 'won',
  missionId: 'oshodi',
  modifiers: [],
  seconds: 125,
  livesUsed: 1,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 2,
  creditedKills: 3,
  ...over,
});

describe('card text helpers', () => {
  it('splits sentences on full stops, not inside numbers or ellipses mid-sentence', () => {
    expect(splitSentences('One. Two! Three? Four')).toEqual(['One.', 'Two!', 'Three?', 'Four']);
    expect(splitSentences('It costs 3.5 naira. Fine.')).toEqual(['It costs 3.5 naira.', 'Fine.']);
    expect(splitSentences('')).toEqual([]);
  });

  it('firstSentences keeps at most two sentences and returns the rest untouched', () => {
    const { summary, rest } = firstSentences('A one. B two. C three. D four.');
    expect(summary).toBe('A one. B two.');
    expect(rest).toEqual(['C three.', 'D four.']);
  });

  it('an over-long single sentence is cut at a word and the remainder is kept', () => {
    const long = `${'word '.repeat(80)}end.`;
    const { summary, rest } = firstSentences(long);
    expect(summary.length).toBeLessThanOrEqual(CARD_LIMITS.summaryChars);
    expect(summary.endsWith('…')).toBe(true);
    expect(norm(`${summary.replace(/…$/, '')} ${rest.join(' ')}`)).toBe(norm(long));
  });

  it('trimObjective keeps short lines and cuts long ones to a clause or the word limit', () => {
    expect(trimObjective('Jam two relays.')).toBe('Jam two relays');
    const t = trimObjective(
      'Earn up to three stars: clear it, lose at most one life, and beat the par time now',
    );
    expect(wordCount(t)).toBeLessThanOrEqual(CARD_LIMITS.objectiveWords);
    expect(
      wordCount(
        trimObjective('one two three four five six seven eight nine ten eleven twelve thirteen fourteen'),
      ),
    ).toBe(12);
  });
});

describe('every shipped card', () => {
  it('has the expected set: prologue, finale, ending and per district a briefing, an intro and defeat scenes', () => {
    const ids = all.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['prologue', 'finale', 'ending']));
    for (const id of DISTRICT_ORDER) expect(ids).toContain(`briefing.${id}`);
    for (const b of bossList()) {
      expect(ids).toContain(`intro.${b.districtId}`);
      expect(ids).toContain(`defeat.${b.districtId}`);
      if (b.defeatSequenceOusted?.length) expect(ids).toContain(`defeat.${b.districtId}.ousted`);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the summary to two sentences and the limit, and never needs the fallback objective', () => {
    for (const c of all) {
      expect(cardIssues(c), c.id).toEqual([]);
      expect(sentenceCount(c.summary), `${c.id} sentences`).toBeLessThanOrEqual(2);
      expect(c.summary.length, `${c.id} chars`).toBeLessThanOrEqual(CARD_LIMITS.summaryChars);
      expect(c.summary.endsWith('…'), `${c.id} was cut`).toBe(false);
      expect(wordCount(c.objective), `${c.id} objective`).toBeLessThanOrEqual(12);
      expect(c.objective, `${c.id} has an objective line`).not.toBe(FALLBACK_OBJECTIVE);
      expect(c.objective.length).toBeGreaterThan(0);
      expect(c.narrationId.length).toBeGreaterThan(0);
    }
  });

  it('the default view (summary + objective) is far shorter than the content it stands for', () => {
    for (const c of all) {
      const shown = wordCount(c.summary) + wordCount(c.objective);
      expect(shown, c.id).toBeLessThanOrEqual(50);
    }
  });

  it('Read more is the flat text of the sections, in order', () => {
    for (const c of all) expect(c.readMore, c.id).toEqual(c.sections.flatMap((s) => s.items));
  });

  it('the scenes keep every line in Read more (nothing removed)', () => {
    const lineTexts = (c: StoryCard): string[] => c.sections.flatMap((s) => s.lines ?? []).map((l) => l.text);
    expect(lineTexts(cardById('prologue')!)).toEqual(CAMPAIGN.prologue.map((l) => l.text));
    expect(lineTexts(cardById('finale')!)).toEqual(CAMPAIGN.finale.map((l) => l.text));
    for (const b of bossList()) {
      expect(lineTexts(cardById(`intro.${b.districtId}`)!)).toEqual(b.introduction.map((l) => l.text));
      expect(lineTexts(cardById(`defeat.${b.districtId}`)!)).toEqual(b.defeatSequence.map((l) => l.text));
      if (b.defeatSequenceOusted?.length)
        expect(lineTexts(cardById(`defeat.${b.districtId}.ousted`)!)).toEqual(
          b.defeatSequenceOusted.map((l) => l.text),
        );
    }
  });

  it('a briefing card plus its Read more contain the whole briefing', () => {
    for (const id of DISTRICT_ORDER) {
      const d = CAMPAIGN.districts[id].briefing;
      const c = briefingCard(id);
      const text = norm([c.summary, c.objective, ...c.readMore].join(' '));
      for (const s of splitSentences(d.summary)) expect(text, `${id}: ${s}`).toContain(norm(s));
      for (const o of [...d.objectives, ...d.intel, ...d.warnings])
        expect(text, `${id}: ${o}`).toContain(norm(o));
      if (d.brokerMessage) expect(text).toContain(norm(d.brokerMessage.text));
      expect(text).toContain(norm(d.location));
    }
  });

  it('the ending card holds the whole ending, the teaser as a message', () => {
    const c = cardById('ending')!;
    const text = norm([c.summary, ...c.readMore].join(' '));
    expect(text).toContain(norm(CAMPAIGN.ending.summary));
    expect(text).toContain(norm(CAMPAIGN.ending.teaser));
  });

  it('the broker never gets a face: his lines stay flagged message lines and nobody else is flagged', () => {
    const lines = (c: StoryCard): StoryLine[] => c.sections.flatMap((s) => s.lines ?? []);
    const source = [
      ...CAMPAIGN.prologue,
      ...CAMPAIGN.finale,
      ...bossList().flatMap((b) => [
        ...b.introduction,
        ...b.defeatSequence,
        ...(b.defeatSequenceOusted ?? []),
      ]),
    ];
    const flagged = new Set(source.filter((l) => l.fromBroker).map((l) => l.text));
    for (const c of all)
      for (const l of lines(c))
        expect(!!l.fromBroker, `${c.id}: ${l.text}`).toBe(
          flagged.has(l.text) || l.speaker === 'UNKNOWN NUMBER',
        );
    // a summary or an objective is never the broker speaking in the first person
    for (const c of all) for (const t of flagged) expect(`${c.summary} ${c.objective}`).not.toContain(t);
    for (const c of all)
      expect(JSON.stringify(c)).not.toMatch(/portrait|\.png|\.jpg|\.webp|<img|"image"|"face"/i);
  });

  it('narration text is the title, summary and objective only', () => {
    const c = cardById('briefing.oshodi')!;
    const t = cardNarrationText(c);
    expect(t).toContain(c.title);
    expect(t).toContain(c.summary);
    expect(t).toContain(c.objective);
    for (const r of c.readMore) expect(t).not.toContain(r);
  });
});

describe('derivation without hand-written copy', () => {
  it('derives the summary from the first sentences and puts the remainder in Read more', () => {
    const d = CAMPAIGN.districts.oshodi.briefing;
    const c = briefingCard('oshodi', CAMPAIGN, {});
    expect(c.summary).toBe(splitSentences(d.summary).slice(0, 2).join(' '));
    expect(sentenceCount(c.summary)).toBeLessThanOrEqual(2);
    expect(c.objective).toBe(trimObjective(d.objectives[0]!));
    const text = norm(c.readMore.join(' '));
    for (const s of splitSentences(d.summary).slice(2)) expect(text).toContain(norm(s));
  });

  it('every card stays within the limits even with no copy table at all', () => {
    for (const c of cardsFrom(CAMPAIGN, {})) {
      expect(cardIssues(c), c.id).toEqual([]);
    }
  });

  it('content fields win over the table, and the table over derivation', () => {
    const content = structuredClone(CAMPAIGN);
    content.districts.oshodi.briefing.cardSummary = 'Short on purpose.';
    content.districts.oshodi.briefing.objectiveCard = 'Do the one thing';
    const c = briefingCard('oshodi', content);
    expect(c.summary).toBe('Short on purpose.');
    expect(c.objective).toBe('Do the one thing');
    // the long summary still sits whole in Read more
    expect(norm(c.readMore.join(' '))).toContain(norm(content.districts.oshodi.briefing.summary));
  });

  it('a card with nothing to say about its objective still has an objective line', () => {
    const c = makeCard({ id: 'x', kind: 'section', title: 'X', summaryText: 'One thing happens.' });
    expect(c.objective).toBe(FALLBACK_OBJECTIVE);
    expect(cardIssues(c)).toEqual([]);
  });
});

describe('result cards', () => {
  const boss = CAMPAIGN.districts.oshodi.boss!;
  const base = {
    boss,
    districtName: 'Oshodi',
    nextName: 'Mushin' as string | null,
    finale: false,
    firstClear: true,
    rewardLines: ['Interchange Hi-Vis: a costume'],
  };

  it('a win: the defeat scene summary, the next step as the objective, the scene and consequence in Read more', () => {
    const c = missionResultCard({ ...base, outcome: outcome() });
    expect(cardIssues(c)).toEqual([]);
    expect(c.summary).toBe(defeatCard(boss).summary);
    expect(c.objective).toBe('Next: Mushin is open');
    const text = norm(c.readMore.join(' '));
    expect(text).toContain(norm(boss.consequence));
    for (const l of boss.defeatSequence) expect(text).toContain(norm(l.text));
    expect(text).toContain('Interchange Hi-Vis');
    expect(c.narrationId).toBe('defeat.oshodi');
  });

  it('a win: the finale and the last-district wording', () => {
    expect(missionResultCard({ ...base, outcome: outcome(), finale: true }).objective).toBe(
      'Watch the finale',
    );
    expect(missionResultCard({ ...base, outcome: outcome(), nextName: null }).objective).toBe(
      'Back to the map',
    );
    expect(missionResultCard({ ...base, outcome: outcome({ defeat: 'ousted' }) }).id).toBe(
      'result.oshodi.won',
    );
  });

  it('a loss: what went wrong, the phase objective as the next try, the counterplay in Read more', () => {
    const lost = outcome({ result: 'lost', stars: 0, defeat: null, phasesCleared: 1, livesUsed: 3 });
    const c = missionResultCard({ ...base, outcome: lost });
    expect(cardIssues(c)).toEqual([]);
    expect(c.summary).toBe(failureSummary(lost));
    expect(c.summary).toContain('phase 2 of 3');
    expect(c.objectiveLabel).toBe('Next try');
    expect(c.objective).toBe(trimObjective(boss.phases[1]!.objective));
    expect(c.readMore).toContain(boss.counterplay);
    const t = missionResultCard({ ...base, outcome: outcome({ result: 'timeout', stars: 0, defeat: null }) });
    expect(t.id).toBe('result.oshodi.timeout');
    expect(t.summary).toMatch(/Time ran out/);
  });
});

describe('section cards (generic)', () => {
  it('derives a section card from summary and objectiveCard when present, keeps everything else in Read more', () => {
    const c = sectionCard({
      id: 'oshodi.terminal',
      name: 'The Terminal',
      summary: 'Take the terminal back. The wardens hold the canopy. Two relays are live. Mind the convoys.',
      objectiveCard: 'Jam both relays',
      objectives: ['Jam relay one', 'Jam relay two'],
      intel: ['Convoys run on a beat.'],
      warnings: ['Red lanes are lethal.'],
    });
    expect(cardIssues(c)).toEqual([]);
    expect(c.summary).toBe('Take the terminal back. The wardens hold the canopy.');
    expect(c.objective).toBe('Jam both relays');
    const text = norm(c.readMore.join(' '));
    for (const t of [
      'Two relays are live.',
      'Mind the convoys.',
      'Jam relay one',
      'Convoys run on a beat.',
      'Red lanes are lethal.',
    ])
      expect(text).toContain(t);
  });

  it('uses an explicit cardSummary, and a short summary as it is; a bare section still gets an objective', () => {
    expect(sectionCard({ id: 'a', summary: 'Short one.', cardSummary: 'Explicit.' }).summary).toBe(
      'Explicit.',
    );
    expect(sectionCard({ id: 'b', summary: 'Short one.' }).summary).toBe('Short one.');
    expect(sectionCard({ id: 'c', summary: 'Short one.' }).objective).toBe(FALLBACK_OBJECTIVE);
    expect(sectionCard({ id: 'd', summary: 'Done.' }, 'sectionResult').id).toBe('sectionResult.d');
  });
});
