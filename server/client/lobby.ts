/**
 * Lobby, room and results screens. Plain DOM; every player-controlled string (names) goes through `textContent`.
 */
import { MATCH_SEATS } from '../../src/net/protocol';
import type { LobbyMsg, ResultsMsg, RoomSettings } from '../../src/net/protocol';
import { CHARACTERS, CHARACTER_IDS, DIFFICULTIES, RUMBLE_ARENA_IDS, getArena } from '../../src/sim';

export const el = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
};

export const isBotName = (name: string): boolean => name.startsWith('BOT ');

function tag(text: string, cls: string): HTMLElement {
  const t = document.createElement('span');
  t.className = `tag ${cls}`;
  t.textContent = text;
  return t;
}

export type Screen = 'entry' | 'room' | 'match' | 'results';

/** Shows exactly one of the panels (the canvas and HUD belong to `match` and `results`). */
export function showScreen(s: Screen): void {
  el('screen-entry').hidden = s !== 'entry';
  el('screen-room').hidden = s !== 'room';
  el('screen-results').hidden = s !== 'results';
  el('hud').hidden = s !== 'match' && s !== 'results';
  el('game').style.visibility = s === 'match' || s === 'results' ? 'visible' : 'hidden';
}

// ---------------------------------------------------------------- entry

export interface EntryHandlers {
  create(name: string, characterId: string): void;
  join(name: string, characterId: string, code: string): void;
  quick(name: string, characterId: string): void;
}

export function setupEntry(
  h: EntryHandlers,
  validateName: (raw: string) => string | null,
  normalizeCode: (raw: string) => string | null,
  params: URLSearchParams,
  serverUrl: string,
): void {
  const name = el<HTMLInputElement>('name');
  const code = el<HTMLInputElement>('code');
  const error = el('entry-error');
  el('server-url').textContent = serverUrl;
  let character = CHARACTER_IDS[0]!;
  const picks = el('characters');
  for (const id of CHARACTER_IDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.id = id;
    b.textContent = CHARACTERS[id].name;
    b.addEventListener('click', () => select(id));
    picks.append(b);
  }
  const select = (id: string): void => {
    character = id as typeof character;
    for (const b of picks.querySelectorAll<HTMLButtonElement>('button')) {
      const on = b.dataset.id === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  };
  select(character);

  const fail = (msg: string): null => {
    error.textContent = msg;
    return null;
  };
  const cleanName = (): string | null => {
    error.textContent = '';
    return validateName(name.value) ?? fail("Pick a name: 2-24 letters, digits, spaces or _ . ' -");
  };
  const join = (): void => {
    const n = cleanName();
    if (n === null) return;
    const c = normalizeCode(code.value);
    if (c === null) {
      fail('Room codes are 6 characters (no 0, O, 1, I or L).');
      return;
    }
    h.join(n, character, c);
  };
  el('btn-create').addEventListener('click', () => {
    const n = cleanName();
    if (n !== null) h.create(n, character);
  });
  el('btn-quick').addEventListener('click', () => {
    const n = cleanName();
    if (n !== null) h.quick(n, character);
  });
  el('btn-join').addEventListener('click', join);
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase();
  });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (code.value ? join : () => el('btn-create').click())();
  });
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join();
  });

  const invited = normalizeCode(params.get('room') ?? '');
  const preName = params.get('name');
  if (preName) name.value = preName;
  if (invited) {
    code.value = invited;
    const note = el('invite');
    note.hidden = false;
    note.textContent = `You were invited to room ${invited}. Enter your name and join.`;
    el('btn-join').classList.add('primary');
    el('btn-create').classList.remove('primary');
    if (validateName(name.value) !== null)
      join(); // name given in the link: join straight away
    else name.focus();
  }
}

export function entryError(message: string): void {
  el('entry-error').textContent = message;
}

// ---------------------------------------------------------------- room

export interface RoomHandlers {
  settings(patch: Partial<RoomSettings>): void;
  ready(ready: boolean): void;
  start(): void;
  copy(): void;
  leave(): void;
}

const GAMES: readonly { id: RoomSettings['game']; label: string }[] = [
  { id: 'survival', label: 'Survival' },
  { id: 'deathmatch', label: 'Deathmatch' },
  { id: 'team', label: 'Teams' },
];

function fill(sel: HTMLSelectElement, options: readonly { value: string; label: string }[]): void {
  sel.replaceChildren(
    ...options.map((o) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      return opt;
    }),
  );
}

export function setupRoom(h: RoomHandlers, dev: boolean): void {
  const arena = el<HTMLSelectElement>('set-arena');
  fill(
    arena,
    RUMBLE_ARENA_IDS.map((id) => ({ value: id, label: getArena(id).name })),
  );
  fill(
    el('set-game'),
    GAMES.map((g) => ({ value: g.id, label: g.label })),
  );
  const durations = [
    ...(dev
      ? [
          { value: '30', label: '30 s (dev)' },
          { value: '90', label: '90 s (dev)' },
        ]
      : []),
    { value: '180', label: '3 min' },
    { value: '300', label: '5 min' },
  ];
  fill(el('set-duration'), durations);
  fill(
    el('set-bots'),
    DIFFICULTIES.map((d) => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) })),
  );
  const send = (key: keyof RoomSettings, sel: HTMLSelectElement): void => {
    h.settings({ [key]: key === 'durationSec' ? Number(sel.value) : sel.value } as Partial<RoomSettings>);
  };
  const bind = (id: string, key: keyof RoomSettings): void => {
    const sel = el<HTMLSelectElement>(id);
    sel.addEventListener('change', () => send(key, sel));
  };
  bind('set-arena', 'arenaId');
  bind('set-game', 'game');
  bind('set-duration', 'durationSec');
  bind('set-bots', 'botDifficulty');
  el('btn-copy').addEventListener('click', h.copy);
  el('btn-leave').addEventListener('click', h.leave);
  el('btn-start').addEventListener('click', h.start);
  el('btn-ready').addEventListener('click', () => {
    const on = el('btn-ready').dataset.ready !== '1';
    h.ready(on);
  });
}

function setSelect(id: string, value: string, editable: boolean): void {
  const sel = el<HTMLSelectElement>(id);
  if (document.activeElement !== sel) sel.value = value;
  sel.disabled = !editable;
}

export function renderRoom(m: LobbyMsg): void {
  el('room-code').textContent = m.code;
  const me = m.you !== null ? m.members[m.you] : undefined;
  const isHost = me?.isHost === true;
  const list = el('members');
  list.replaceChildren(
    ...m.members.map((p, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = i === m.you ? `${p.name} (you)` : p.name;
      li.append(name);
      const ch = CHARACTERS[p.characterId as keyof typeof CHARACTERS]?.name;
      if (ch) li.append(tag(ch, ''));
      if (p.isHost) li.append(tag('HOST', 'host'));
      if (p.ready) li.append(tag('READY', 'ready'));
      if (!p.connected) li.append(tag('OFFLINE', 'off'));
      return li;
    }),
  );
  el('bots-note').textContent =
    `${m.members.length} of ${MATCH_SEATS} fighters are people. The other ${m.botsToFill} seats are filled with AI bots (named "BOT ...") when the match starts.`;
  const editable = isHost && m.phase === 'lobby';
  setSelect('set-arena', m.settings.arenaId, editable);
  setSelect('set-game', m.settings.game, editable);
  setSelect('set-duration', String(m.settings.durationSec), editable);
  setSelect('set-bots', m.settings.botDifficulty, editable);
  el('settings').hidden = false;
  const ro = el('settings-readonly');
  ro.hidden = isHost;
  ro.textContent = isHost ? '' : 'Only the host can change the match settings.';
  const ready = el<HTMLButtonElement>('btn-ready');
  ready.dataset.ready = me?.ready ? '1' : '0';
  ready.textContent = me?.ready ? 'Not ready' : 'Ready';
  ready.disabled = m.phase !== 'lobby';
  const start = el<HTMLButtonElement>('btn-start');
  start.hidden = !(isHost && m.private);
  start.disabled = m.phase !== 'lobby';
}

/** The pre-match countdown / auto-start line, from the message and when it arrived. */
export function renderCountdown(m: LobbyMsg | null, receivedAt: number, now: number): void {
  const out = el('countdown');
  if (!m) {
    out.textContent = '';
    return;
  }
  const left = (ms: number | null): number | null =>
    ms === null ? null : Math.max(0, Math.ceil((ms - (now - receivedAt)) / 1000));
  const c = left(m.countdownMs);
  const a = left(m.autoStartMs);
  out.textContent = c !== null ? `Starting in ${c}…` : a !== null ? `Public match starts in ${a} s` : '';
}

export function roomNote(text: string): void {
  el('room-note').textContent = text;
}

// ---------------------------------------------------------------- results

export function renderResults(m: ResultsMsg, mySeat: number | null, isHost: boolean): void {
  const rows = [...m.players].sort((a, b) => a.placement - b.placement);
  const tbody = el('results-table').querySelector('tbody')!;
  tbody.replaceChildren(
    ...rows.map((p) => {
      const tr = document.createElement('tr');
      if (p.seat === mySeat) tr.className = 'me';
      const cells: (string | HTMLElement)[] = [
        String(p.placement),
        '',
        String(p.kills),
        String(p.deaths),
        String(p.assists),
      ];
      cells.forEach((v, i) => {
        const td = document.createElement('td');
        if (i >= 2) td.className = 'num';
        if (i === 1) {
          td.textContent = p.name;
          if (p.isBot || isBotName(p.name)) {
            td.append(' ');
            td.append(tag('BOT', 'bot'));
          }
        } else td.textContent = v as string;
        tr.append(td);
      });
      return tr;
    }),
  );
  const winner = m.winnerSeat !== null ? m.players.find((p) => p.seat === m.winnerSeat)?.name : null;
  el('results-title').textContent = m.draw ? 'Draw' : winner ? `Winner: ${winner}` : 'Results';
  el<HTMLButtonElement>('btn-rematch').hidden = !isHost;
  setHashLine(`Match hash ${hex(m.stateHash)}: checking your copy…`, '');
}

export function setHashLine(text: string, cls: 'ok' | 'bad' | ''): void {
  const e = el('results-hash');
  e.textContent = text;
  e.className = `muted ${cls}`.trim();
}

export const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
