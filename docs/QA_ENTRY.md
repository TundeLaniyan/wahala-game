# Founder QA entry (temporary)

Decision RI3. Added for the release that integrates the Classic raid AI / night lighting with the 18-character roster, so
the founder can test the Records Vault night raid on a phone without replaying the campaign to Lagos Island.

## Use

Open the normal site with the query:

- `https://tundelaniyan.github.io/wahala-game/?qaraid=recordsVault` (the save's enemy level)
- add `&qalevel=easy`, `&qalevel=normal` or `&qalevel=hard` to choose the level

Home then shows one extra button, **QA TEST: Records Vault**. It starts the raid on its own, with the pause menu's
Restart and Leave. Any other raid id works the same way (`warehouseDispatchDepot`, `partsStoreroom`,
`junctionToolShed`, `railYardGoods`, `standbyPlant`). Without the query the site is unchanged.

## Guarantees (tested)

- Nothing is written to the campaign save: not when the raid starts, ends (its result is shown and forgotten) or is left;
  a player with no campaign still has none (`tests/app/qa-entry.test.ts`, `e2e/qa-entry.spec.ts` checks the browser's
  stored save byte for byte).
- No unlock, reward, Generator Parts or progress is granted. The raid plays exactly as in the campaign (same builder,
  same enemy AI, same night lighting and detection); only the level can be chosen.
- Unknown raid ids or levels are ignored (no button, or the save's level).

## Removal

After the founder's phone tests:

1. Delete `src/app/qaEntry.ts`, `tests/app/qa-entry.test.ts`, `e2e/qa-entry.spec.ts` and this file.
2. Remove the `qa` button from `src/ui/menu/HomeScreen.tsx` (marked "TEMPORARY founder QA entry").
3. Remove `commands.qaStartRaid` from `src/app/session.ts` and `CampaignController.qaStartRaid` plus the optional
   `RaidContext.level` from `src/app/campaign.ts` (both marked). Keep the `finishRaidMission(null)` no-save rule: the
   debug raid start uses it too.
4. Run `npm run check`; note the removal under decision RI3.
