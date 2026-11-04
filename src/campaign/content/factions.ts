/**
 * Campaign factions. Every faction is FICTIONAL: the names, emblems and colours are invented and never copy a
 * real union, agency, company or party. They are inspired by the texture of Lagos street life (a motor park's
 * order-keepers, junction toll-takers, parts-market runners, haulage convoys, private estate guards, rail yards)
 * and each is only the *network the Chairman bought into*: the ordinary workers around them are never the enemy,
 * which is why two allied community factions exist.
 */
import type { NpcRole } from '../../sim';
import type { FactionDef } from '../types';

export const FACTIONS: Readonly<Record<string, FactionDef>> = {
  oritaWardens: {
    id: 'oritaWardens',
    kind: 'transportEnforcers',
    name: 'Orita Park Wardens',
    description:
      'The park-order crews of the Oshodi interchange: they decide which bus loads where and who "settles" the bay. Loud, quick with a whistle, loyal to whoever holds the radio. Fictional.',
    palette: { primary: 0xd9a21b, accent: 0x1b1b1f },
    emblem: 'A yellow crossroads sign wrapped in a black whistle cord',
    roles: [
      { role: 'meleeGuard', count: 3 },
      { role: 'blocker', count: 2 },
      { role: 'runner', count: 1 },
    ],
  },
  blueTrailer: {
    id: 'blueTrailer',
    kind: 'logisticsCrew',
    name: 'Blue Trailer Haulage Crew',
    description:
      'Convoy drivers and loaders who move the Chairman’s containers on a timetable nobody else sees. They arrive in lines, on time, and expect the road to clear.',
    palette: { primary: 0x2467c9, accent: 0xf2f2f2 },
    emblem: 'A blue container door with a white number stencil',
    roles: [
      { role: 'rangedAttacker', count: 2 },
      { role: 'escort', count: 2 },
      { role: 'runner', count: 2 },
    ],
  },
  koboMarshals: {
    id: 'koboMarshals',
    kind: 'routeMarshals',
    name: 'Kobo Route Marshals',
    description:
      'Reflective-vest "marshals" who sell passage at every junction: green light for a coin, red light for a lecture. They hold crossings, not people. Fictional.',
    palette: { primary: 0x2fa84f, accent: 0xff7a1a },
    emblem: 'A lit traffic cone crossed with a coin',
    roles: [
      { role: 'objectiveDefender', count: 3 },
      { role: 'blocker', count: 2 },
      { role: 'meleeGuard', count: 1 },
    ],
  },
  sparehandRunners: {
    id: 'sparehandRunners',
    kind: 'marketCrew',
    name: 'Sparehand Runners',
    description:
      'Fast, sharp-eyed parts runners who restock a hoarded supply chain faster than you can break it. Not the honest traders around them: the ones who work for the hoard.',
    palette: { primary: 0xc0392b, accent: 0xf4d03f },
    emblem: 'A spanner and a wheel nut on a red umbrella',
    roles: [
      { role: 'runner', count: 4 },
      { role: 'supportUnit', count: 2 },
      { role: 'meleeGuard', count: 1 },
    ],
  },
  gatehouseGuard: {
    id: 'gatehouseGuard',
    kind: 'securityContractors',
    name: 'Gatehouse Private Guard',
    description:
      'A polished private-security contractor that runs estate gates, plazas and standby plants for people who prefer not to be seen. Crisp uniforms, quiet radios, long patience.',
    palette: { primary: 0x2b3a4a, accent: 0xc7d3df },
    emblem: 'A barred gate silhouette inside a pale ring',
    roles: [
      { role: 'rangedAttacker', count: 2 },
      { role: 'meleeGuard', count: 2 },
      { role: 'bossAssistant', count: 1 },
    ],
  },
  ironLaneSwitchmen: {
    id: 'ironLaneSwitchmen',
    kind: 'railDispatch',
    name: 'Iron Lane Switchmen',
    description:
      'A yard-dispatch crew that bought its own signals: they decide which wagon rolls when. The honest railway workers around them are bystanders, never targets. Fictional.',
    palette: { primary: 0x6b4f2a, accent: 0xe74c3c },
    emblem: 'A signal lamp over two crossing rails',
    roles: [
      { role: 'blocker', count: 2 },
      { role: 'objectiveDefender', count: 2 },
      { role: 'rangedAttacker', count: 1 },
    ],
  },
  streetWatch: {
    id: 'streetWatch',
    kind: 'communityDefenders',
    name: 'Ore Street Watch',
    description:
      'Neighbours who take turns guarding their own lane at night, whistle and torch in hand. They owe the Chairman nothing and will lend you a distraction when it counts.',
    palette: { primary: 0x1fa64a, accent: 0xffffff },
    emblem: 'A torch and a hand-painted lane number',
    roles: [{ role: 'supportUnit', count: 2 }],
    allied: true,
  },
  mamaPutMutual: {
    id: 'mamaPutMutual',
    kind: 'communityDefenders',
    name: 'Mama Put Mutual',
    description:
      'A food-seller circle that feeds half a district and quietly watches the other half. They will hide a runner, jam a rumour, or put a plate in your hand.',
    palette: { primary: 0xe08a1e, accent: 0x7a1f1f },
    emblem: 'A steaming pot beside a folded wrapper',
    roles: [{ role: 'supportUnit', count: 2 }],
    allied: true,
  },
  continuityOffice: {
    id: 'continuityOffice',
    kind: 'officials',
    name: 'Office of Network Continuity',
    description:
      'A fictional office that exists to keep the lights on for the right people: operators, auditors-in-name-only and clerks who forward whatever the Chairman’s office stamps. Inspired by the idea of private infrastructure, not any real body.',
    palette: { primary: 0x6c4aa8, accent: 0xe8e0f5 },
    emblem: 'A stamped circuit ring with a lit window',
    roles: [
      { role: 'bossAssistant', count: 2 },
      { role: 'escort', count: 2 },
      { role: 'rangedAttacker', count: 1 },
    ],
  },
  ledgerBureau: {
    id: 'ledgerBureau',
    kind: 'officials',
    name: 'Receipts and Reconciliation Bureau',
    description:
      'A fictional back-office of "auditors" who chase whoever carries a ledger across the floor. They file everything and forgive nothing that threatens the Chairman’s books.',
    palette: { primary: 0x8a8d93, accent: 0xb3202a },
    emblem: 'A red-edged ledger page under a rubber stamp',
    roles: [
      { role: 'runner', count: 3 },
      { role: 'escort', count: 2 },
      { role: 'meleeGuard', count: 1 },
    ],
  },
};

export const FACTION_IDS: readonly string[] = Object.keys(FACTIONS);

/** Display copy for the eight reusable NPC roles (HUD legend, crew cards, intel). */
export const NPC_ROLE_INFO: Record<NpcRole, { name: string; description: string }> = {
  meleeGuard: {
    name: 'Guard',
    description: 'Closes in and shoves or punches. Cheap to bait into a generator blast.',
  },
  rangedAttacker: {
    name: 'Thrower',
    description: 'Keeps its distance and drops generators across your path. Respect the fuse lines.',
  },
  blocker: {
    name: 'Blocker',
    description: 'Stands in a lane to close it. Blast it away or route round it.',
  },
  runner: {
    name: 'Runner',
    description: 'Fast and slippery: restocks, carries or flees. Catch it before it does its job.',
  },
  escort: {
    name: 'Escort',
    description: 'Sticks to a target (a convoy, a carrier, the boss) and punishes anyone who touches it.',
  },
  objectiveDefender: {
    name: 'Defender',
    description: 'Camps on an objective and contests it. Clear them or draw them off.',
  },
  supportUnit: {
    name: 'Support',
    description:
      'Restocks, distracts or covers a retreat. Allied support lends the player a beat; hostile support props up the boss.',
  },
  bossAssistant: {
    name: 'Right Hand',
    description: 'The boss’s personal aide: calls reinforcements and covers the boss when exposed.',
  },
};
