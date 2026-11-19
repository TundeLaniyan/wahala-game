/**
 * The Ojuelegba finale in a real browser (decisions FN1-FN10): a campaign that has cleared all six districts is saved,
 * the page reloads (the save is read back), the map shows Ojuelegba as the final chapter, Continue plays the interim
 * beat once ("the estates go dark, but Ojuelegba is still locked"), the chapter's sections list on the hub card, and
 * mission 19 starts in its own sector of the unchanged Ojuelegba arena. Desktop and phone.
 */
import { expect, test } from '@playwright/test';
import { inMatch, open } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const boss = (missionId: string) => ({
  result: 'won',
  missionId,
  modifiers: [],
  seconds: 150,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 2,
  creditedKills: 3,
});

test('six districts cleared: the finale node, the interim beat and mission 19 in its sector', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  await page.evaluate((wins) => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
    for (const w of wins) c.finishMission(w);
    c.toMap();
  }, ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'].map(boss));
  // the save is read back after a reload, as a returning player's would be
  await page.reload();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('home-campaign').click();
  await expect(page.getByTestId('map-node-ojuelegba')).toHaveAttribute('data-finale', 'available');
  await expect(page.getByTestId('map-node-lib-ojuelegba')).toHaveText('Final 0/3');

  // Continue: the interim beat plays once, then the hub card is the final chapter
  await page.getByTestId('campaign-continue').click();
  await expect(page.getByTestId('interim-player')).toBeVisible();
  await expect(page.getByTestId('interim-player')).toContainText('Ojuelegba');
  await page.getByTestId('story-next').click();
  await expect(page.getByTestId('finale-chapter')).toBeVisible();
  await expect(page.getByTestId('finale-boss')).toContainText('The Landlord');
  await expect(page.getByTestId('section-ojuelegba.s1')).toHaveAttribute('data-status', 'available');
  await expect(page.getByTestId('mission-ojuelegba.boss')).toHaveAttribute('data-status', 'locked');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('wahala.campaign.v1')!).interimSeen as unknown),
  ).toBe(true);

  // mission 19 starts in its sector of the reference arena, through its visual briefing (decision MG1)
  await page.getByTestId('section-start-ojuelegba.return').click();
  await page.getByTestId('mission-brief-start').click();
  await inMatch(page);
  const s = await page.evaluate(() => {
    const st = (window as any).__WAHALA__.getState();
    return {
      arena: st.arenaId,
      sector: st.sector?.id,
      gates: st.sector?.gates.map((g: { id: string; open: boolean }) => `${g.id}:${g.open}`),
      field: st.mission?.field?.fieldId,
      leg: st.mission?.field?.leg,
    };
  });
  expect(s).toEqual({
    arena: 'rumbleOjuelegba',
    sector: 'ojuelegba.shopfrontReturn',
    gates: ['laneBarrier:false', 'cornerGate:false'],
    field: 'ojuelegba.return',
    leg: 0,
  });
  await expect(page.getByTestId('hud')).toContainText(/RING PATROLS|Ring patrols/i);
  expect(errors).toEqual([]);
});
