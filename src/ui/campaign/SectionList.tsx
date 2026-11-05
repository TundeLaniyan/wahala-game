/**
 * A district's sections on the campaign map (docs/CAMPAIGN_SECTIONS.md): a short list with each section's status, its
 * mission (format, one-line objective, stars), a Start / Replay button and the suggested next mission. The boss section
 * opens the existing briefing once the earlier sections are cleared.
 */
import type { MissionId } from '../../sim';
import { commands } from '../../app/session';
import { SecondaryButton } from '../menu/Frame';
import { FORMAT_LABEL, SECTION_STATUS_LABEL, sectionRows, sectionsText } from './sectionModel';
import { Stars, useCampaignUi } from './parts';

export function SectionList({ districtId }: { districtId: MissionId }) {
  const ui = useCampaignUi();
  if (!ui) return null;
  const rows = sectionRows(ui.save, districtId);
  return (
    <div className="cp-sections" data-testid="district-sections">
      <small className="mn-kicker">{sectionsText(ui.save, districtId)}</small>
      <ol>
        {rows.map((s) => (
          <li
            key={s.id}
            className={`cp-section ${s.status}`}
            data-testid={`section-${s.id}`}
            data-status={s.status}
          >
            <header>
              <b>
                {s.order}. {s.name}
              </b>
              <span className="cp-chip">{SECTION_STATUS_LABEL[s.status]}</span>
            </header>
            <p>{s.summary}</p>
            {s.missions.map((m) => (
              <div
                key={m.id}
                className={`cp-smission${m.suggested ? ' next' : ''}`}
                data-testid={`mission-${m.id}`}
                data-status={m.status}
              >
                <span className="cp-format">{FORMAT_LABEL[m.format]}</span>
                <span className="cp-smission-text">
                  <b>{m.name}</b>
                  <small>{m.objectiveCard}</small>
                </span>
                {m.status === 'cleared' && m.stars > 0 && <Stars n={m.stars} />}
                <SecondaryButton
                  className="small"
                  testId={`section-start-${m.id}`}
                  disabled={m.status === 'locked'}
                  onClick={() =>
                    m.format === 'boss'
                      ? commands.campaignBriefing(districtId)
                      : commands.campaignStartSection(m.id)
                  }
                >
                  {m.format === 'boss'
                    ? 'Briefing'
                    : m.status === 'cleared'
                      ? 'Replay'
                      : m.suggested
                        ? 'Start'
                        : 'Play'}
                </SecondaryButton>
              </div>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}
