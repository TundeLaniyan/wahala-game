/**
 * The Generator Parts lines of a result screen (decisions PR8, PR14): what this result paid (or how to earn more), how
 * many are waiting to be spent, and a nudge to the map's Workshop when an upgrade is affordable. Nothing shows when the
 * system is off, the district is not eligible or the result did not report Parts.
 */
import type { CampaignSave } from '../../campaign';
import { affordableUpgrades, partsAvailable, progressionDistrict } from '../../campaign';

export function PartsLine(props: {
  gained: number | undefined;
  district: string | null;
  save: CampaignSave;
  className?: string;
}) {
  const { gained, district, save } = props;
  if (gained === undefined || district === null || !progressionDistrict(district)) return null;
  const toSpend = partsAvailable(save);
  const canUpgrade = affordableUpgrades(save).length > 0;
  return (
    <>
      <p className={props.className} data-testid="result-parts">
        {gained > 0 ? (
          <b>+{gained} Generator Parts</b>
        ) : (
          'No new Generator Parts: beat your best stars to earn more.'
        )}
      </p>
      <p className="cp-chip-line cp-parts-total" data-testid="result-parts-total">
        {toSpend} to spend
        {canUpgrade ? ': enough for an upgrade in the Workshop on the map.' : '.'}
      </p>
    </>
  );
}
