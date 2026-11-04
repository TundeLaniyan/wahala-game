/** Fictional mock players. No real people, brands or accounts. */
export const MOCK_BOT_NAMES = [
  'Danfo_Dan',
  'Keke_Kemi',
  'Okada_Obi',
  'Spark_Sade',
  'Fuse_Femi',
  'Lagos_Lade',
  'Yaba_Yemi',
  'Eko_Ebuka',
  'Ajah_Amaka',
  'Volt_Vicky',
  'Gen_Gbenga',
  'Blast_Bisi',
];

export interface MockFriendDef {
  id: string;
  displayName: string;
  presence: 'online' | 'offline';
  /** The code that finds this player in "add friend". */
  code: string;
}

export const MOCK_FRIENDS: readonly MockFriendDef[] = [
  { id: 'friend-ada', displayName: 'Ada_Danfo', presence: 'online', code: 'ADA001' },
  { id: 'friend-femi', displayName: 'Femi_Keke', presence: 'online', code: 'FEMI02' },
  { id: 'friend-zainab', displayName: 'Zainab_Okada', presence: 'offline', code: 'ZAIN03' },
  { id: 'friend-tunde', displayName: 'Tunde_Spark', presence: 'online', code: 'TUND04' },
];

/** Players that can be found by code but are not friends yet. */
export const MOCK_STRANGERS: readonly MockFriendDef[] = [
  { id: 'stranger-halima', displayName: 'Halima_Gen', presence: 'online', code: 'HALI05' },
  { id: 'stranger-obi', displayName: 'Obi_Blast', presence: 'online', code: 'OBIB06' },
];
