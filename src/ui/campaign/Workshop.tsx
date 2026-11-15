/**
 * Generator Parts upgrades on the campaign map (decisions PR1-PR8, src/campaign/upgrades.ts). Shown only for a district
 * of the progression slice (Oshodi). Every number comes from `CAMPAIGN_PROGRESSION`; buying goes through `commands`.
 */
import type { MissionId } from '../../sim';
import { commands } from '../../app/session';
import {
  CAMPAIGN_PROGRESSION,
  UPGRADE_KINDS,
  canBuy,
  nextCost,
  partsAvailable,
  partsEarned,
  progressionDistrict,
  upgradeCap,
  upgradesOf,
} from '../../campaign';
import { SecondaryButton } from '../menu/Frame';
import { useCampaignUi } from './parts';

export function Workshop({ districtId }: { districtId: MissionId }) {
  const ui = useCampaignUi();
  if (!ui || !progressionDistrict(districtId)) return null;
  const save = ui.save;
  const levels = upgradesOf(save);
  const available = partsAvailable(save);
  return (
    <section className="cp-panel mn-panel cp-workshop" data-testid="campaign-workshop">
      <small className="mn-kicker">Generator Parts · campaign only</small>
      <p className="cp-chip-line">
        <b data-testid="workshop-parts">{available}</b> to spend · {partsEarned(save)} earned in this district
      </p>
      <ul>
        {UPGRADE_KINDS.map((kind) => {
          const def = CAMPAIGN_PROGRESSION.upgrades[kind];
          const cost = nextCost(save, kind);
          return (
            <li key={kind} data-testid={`workshop-${kind}`} data-level={levels[kind]}>
              <span>
                <b>{def.name}</b> {levels[kind]} / {upgradeCap(kind)}
                <small>{def.effect}</small>
              </span>
              <SecondaryButton
                className="small"
                testId={`workshop-buy-${kind}`}
                disabled={!canBuy(save, kind)}
                onClick={() => commands.campaignBuyUpgrade(kind)}
              >
                {cost === null ? 'Maxed' : `Buy · ${cost}`}
              </SecondaryButton>
            </li>
          );
        })}
      </ul>
      <p className="cp-chip-line">
        <small>
          Earn Parts by clearing Oshodi missions the first time and by beating your best stars. Upgrades apply
          in Oshodi missions only and never in Classic, City Rumble, raids or the Academy.
        </small>
      </p>
    </section>
  );
}
