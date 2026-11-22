/** What a finished campaign-driven test says (pure): a headline and one line, from the campaign's result slice. */
import type { CampaignUi } from '../../app/campaignState';
import type { MissionOutcome, RaidOutcome } from '../../sim';

const clock = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec) % 60).padStart(2, '0')}`;

export function endedText(c: Pick<CampaignUi, 'result' | 'sectionResult'> | null): {
  title: string;
  detail: string;
} | null {
  if (!c) return null;
  const s = c.sectionResult;
  if (s?.kind === 'raid') {
    const o = s.outcome as RaidOutcome;
    const title =
      o.result === 'completed'
        ? 'Raid completed'
        : o.result === 'failed'
          ? 'Raid failed'
          : 'You left the raid';
    const why =
      o.failedBy === 'time' ? ', the clock ran out' : o.failedBy === 'lives' ? ', every life spent' : '';
    return {
      title,
      detail: `${clock(o.seconds)} · ${o.cargoDestroyed} of ${o.cargoTotal} crates · ${o.livesUsed} lives used${why}`,
    };
  }
  const m = (s?.outcome ?? c.result?.outcome) as MissionOutcome | undefined;
  if (!m) return null;
  return {
    title: m.result === 'won' ? 'Mission won' : 'Mission lost',
    detail: `${clock(m.seconds)} · ${m.livesUsed} lives used`,
  };
}
