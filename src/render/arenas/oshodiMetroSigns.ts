/**
 * Oshodi Transport Metropolis - the boards on the board's cover (presentation only). They reuse the Ojuelegba
 * sign atlas painter (`SignAtlas`) with their own content. Every business name, slogan and operator is FICTIONAL
 * (no real company, bank, telco, transport operator, brand or logo, and no near-copy names); the only real words
 * are Lagos place names on bus route cards and the plain station / terminal wording a public facility carries.
 */
import { SignAtlas } from './ojuelegbaSigns';
import type { BoardSpec, UvRect } from './ojuelegbaSigns';

export { SignAtlas };
export type { BoardSpec, UvRect };

const cream = '#efe6d0';

/** Trading Streets and Skywalk Arcade shopfronts. */
export const SHOP_NAMES: BoardSpec[] = [
  { bg: '#1f5a8a', fg: cream, lines: [['ADUNNI FABRICS', 38]], border: cream },
  {
    bg: '#16140f',
    fg: '#f2c21a',
    lines: [
      ['OKE-ARO', 34],
      ['AUTO SPARES & TYRES', 20],
    ],
  },
  { bg: '#a8241c', fg: cream, lines: [['BUKKY BEAUTY STORE', 36]], border: cream },
  {
    bg: '#2f6e3c',
    fg: '#f4f0e0',
    lines: [
      ['GRACE MULTI-CHEM', 32],
      ['PHARMACY & STORES', 20],
    ],
  },
  { bg: cream, fg: '#8a1e18', lines: [['TUNDE & SONS ELECTRICALS', 32]], border: '#8a1e18' },
  {
    bg: '#e0b020',
    fg: '#1c1608',
    lines: [
      ['EKO PHONE HUB', 36],
      ['REPAIRS · AIRTIME', 20],
    ],
  },
  { bg: '#3a2a52', fg: '#f0e6c8', lines: [['MAMA JOKE FOODS', 38]], border: '#f0e6c8' },
  {
    bg: '#2a2d30',
    fg: '#e8e2d0',
    lines: [
      ['PRIDE GENTS', 36],
      ['TAILORING & SHIRTS', 20],
    ],
  },
];

export const KIOSK_BOARDS: BoardSpec[] = [
  { bg: '#2e5a8e', fg: cream, lines: [['TICKETS', 40]], border: cream },
  { bg: '#3a7a46', fg: cream, lines: [['RECHARGE CARDS', 30]], border: cream },
  { bg: '#c8a02a', fg: '#1c1608', lines: [['PURE WATER · DRINKS', 24]] },
];

export const CONTAINER_BOARDS: BoardSpec[] = [
  { bg: '#1c1c1a', fg: '#f2c21a', lines: [['SPARE PARTS', 38]] },
  { bg: '#244a30', fg: cream, lines: [['PROVISIONS · 24H', 32]] },
  { bg: '#6a2a1c', fg: cream, lines: [['SHOES & BAGS', 36]] },
];

/** The terminal wings: a big name board and the three terminal numbers. */
export const TERMINAL_BOARD: BoardSpec = {
  bg: '#12304e',
  fg: '#f4f2ea',
  lines: [
    ['INTERCHANGE', 52],
    ['TERMINAL 1 · 2 · 3', 26],
  ],
  border: '#e8b82a',
  wear: 0.5,
};
export const TERMINAL_GATES: BoardSpec = {
  bg: '#12304e',
  fg: '#f2c21a',
  lines: [['BUS BAYS 1 – 12', 30]],
  border: '#f4f2ea',
  wear: 0.5,
};
export const TICKET_HALL: BoardSpec = {
  bg: '#1a1a1a',
  fg: '#f4f2ea',
  lines: [
    ['TICKET HALL', 40],
    ['ADVANCE BOOKING', 20],
  ],
  band: { color: '#e8b82a', text: 'PASSENGERS', fg: '#1a1a1a' },
};

export const STATION_BOARD: BoardSpec = {
  bg: '#16212c',
  fg: '#f4f2ea',
  lines: [
    ['OSHODI STATION', 46],
    ['COMMUTER RAIL', 24],
  ],
  border: '#d8d2c0',
  wear: 0.4,
};
export const PORTAL_BOARD: BoardSpec = {
  bg: '#e0b020',
  fg: '#16140f',
  lines: [['TRAINS · KEEP CLEAR', 30]],
  border: '#16140f',
  band: { color: '#16140f', text: 'DANGER', fg: '#e0b020' },
};
export const PLATFORM_BOARD: BoardSpec = {
  bg: '#16212c',
  fg: '#f4f2ea',
  lines: [['PLATFORM 1 · 2', 34]],
  border: '#d8d2c0',
};
export const CABIN_BOARD: BoardSpec = {
  bg: '#f2ece0',
  fg: '#a8241c',
  lines: [['SIGNAL CABIN', 28]],
  border: '#a8241c',
};

export const WORKSHOP_BOARDS: BoardSpec[] = [
  { bg: '#d8cfb4', fg: '#8a2a1c', lines: [['KOLA ENGINES & GEARBOX', 28]], border: '#8a2a1c', hand: true },
  { bg: '#1c3a5a', fg: cream, lines: [['SEUN PANEL BEATING', 30]], hand: true },
  { bg: '#e0b020', fg: '#16140f', lines: [['ROTIMI WELDING WORKS', 28]], hand: true },
];
export const PAVILION_BOARD: BoardSpec = {
  bg: '#2a6a3a',
  fg: '#f4f2ea',
  lines: [['CAPPA WORKS GROUND', 34]],
  border: '#f4f2ea',
};
export const GEN_HOUSE_BOARD: BoardSpec = {
  bg: '#e0b020',
  fg: '#16140f',
  lines: [['GENERATOR · NO SMOKING', 22]],
  band: { color: '#16140f', text: 'DANGER', fg: '#e0b020' },
};
export const SIGN_TOWER_BOARD: BoardSpec = {
  bg: '#17674a',
  fg: '#f4f2ea',
  lines: [
    ['LAGOS', 28],
    ['IKEJA ↑   APAPA ↓', 22],
  ],
  border: '#f4f2ea',
};

/** Windscreen route cards of the parked buses: Lagos places only. */
export const ROUTE_CARDS: BoardSpec[] = [
  'IKEJA',
  'MUSHIN',
  'OJOTA',
  'OBALENDE',
  'YABA',
  'AJAH',
  'IKORODU',
  'APAPA',
].map((t, i) => ({
  bg: ['#f2e8c8', '#e8f0e0', '#f0e0e0', '#e0e8f4'][i % 4]!,
  fg: '#1a1612',
  lines: [[t, 30]] as [string, number][],
  border: '#1a1612',
  wear: 0.3,
}));

export const POSTERS: BoardSpec[] = [
  {
    bg: '#e8c828',
    fg: '#16140f',
    lines: [
      ['FRESH', 30],
      ['SOUNDS TONIGHT', 14],
    ],
    wear: 1.4,
  },
  {
    bg: '#c82a2a',
    fg: '#f4f0e0',
    lines: [
      ['GRAND', 28],
      ['OPENING', 24],
    ],
    wear: 1.4,
  },
  {
    bg: '#2a5aa8',
    fg: '#f4f0e0',
    lines: [
      ['LOW FARES', 24],
      ['ALL ROUTES', 18],
    ],
    wear: 1.4,
  },
  {
    bg: '#f0e6d0',
    fg: '#8a2a1c',
    lines: [
      ['PURE', 30],
      ['WATER', 30],
    ],
    wear: 1.4,
  },
];
