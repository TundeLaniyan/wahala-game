import { DANFO_BUS_PARK } from './danfoBusPark';
import type { ArenaDef } from './types';

/**
 * A "trap arena": the Danfo Bus Park layout with potholes (a stumble) and oil slicks (a slide)
 * on the open lanes. Hazards are only active when the match option "floor hazards" is on.
 * 'o' = pothole, '~' = oil. Symmetric so every spawn faces the same traps.
 */
const hazardRows = Array.from({ length: 11 }, () => '.'.repeat(15).split(''));
const mark = (x: number, y: number, c: string): void => {
  hazardRows[y]![x] = c;
  hazardRows[y]![14 - x] = c;
  hazardRows[10 - y]![x] = c;
  hazardRows[10 - y]![14 - x] = c;
};
mark(6, 4, 'o');
mark(4, 2, 'o');
mark(2, 5, '~');
mark(7, 2, '~');

export const LEKKI_ROADWORKS: ArenaDef = {
  ...DANFO_BUS_PARK,
  id: 'lekkiRoadworks',
  name: 'Lekki Roadworks (trap arena)',
  hazardLayout: hazardRows.map((r) => r.join('')),
};
