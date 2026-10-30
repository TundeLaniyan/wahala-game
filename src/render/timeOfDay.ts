/**
 * Time of day for the stages that ship both a day and a night look (presentation only: the combat geometry,
 * hazards and timings are identical, only light, sky, lamps and practical lights change). The default is day;
 * `?tod=night` (a review flag, like `?cam=` and `?q=`) selects the night look. No gameplay setting reads it.
 */
export type TimeOfDay = 'day' | 'night';

export function timeOfDay(search?: string): TimeOfDay {
  const s = search ?? (typeof location !== 'undefined' ? location.search : '');
  return new URLSearchParams(s).get('tod') === 'night' ? 'night' : 'day';
}
