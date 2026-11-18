/**
 * A district's liberation state on the campaign map (decision PR14): the map node's small badge (sections reclaimed,
 * or FREED) and the district card's "what the Ring lost here" list. Derived from the save through `districtLiberation`
 * (no world-state engine); the lines are the content's `ringWeakened` text of every mission won.
 */
import type { MissionId } from '../../sim';
import type { MapNode } from './model';
import { useCampaignUi } from './parts';
import { districtLiberation } from './sectionModel';

/** The node badge: nothing for the hub or a locked district, "n/3" while open, "Freed" once the keeper falls. */
export function liberationBadge(
  node: Pick<MapNode, 'hub' | 'status' | 'reclaimed' | 'sectionCount'>,
): { text: string; tone: 'freed' | 'open' } | null {
  if (node.hub || node.status === 'locked' || node.sectionCount === 0) return null;
  if (node.status === 'cleared') return { text: 'Freed', tone: 'freed' };
  return { text: `${node.reclaimed}/${node.sectionCount}`, tone: 'open' };
}

export function Liberation({ districtId }: { districtId: MissionId }) {
  const ui = useCampaignUi();
  if (!ui) return null;
  const lib = districtLiberation(ui.save, districtId);
  return (
    <div
      className={`cp-liberation${lib.freed ? ' freed' : ''}`}
      data-testid="district-liberation"
      data-reclaimed={lib.reclaimed}
      data-freed={lib.freed ? 'true' : 'false'}
    >
      <small className="mn-kicker">
        {lib.freed
          ? 'Freed from the Ring'
          : `Liberation: ${lib.reclaimed} of ${lib.total} sections reclaimed`}
      </small>
      {lib.losses.length > 0 ? (
        <ul>
          {lib.losses.map((l) => (
            <li key={l} data-testid="district-ring-loss">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p>The Ring still holds every street here.</p>
      )}
    </div>
  );
}
