/**
 * The quick-signal vocabulary the client shows (src/online/platform/signals.ts) is the platform's catalogue
 * (player-platform/src/comms/catalogue.ts, read as text: the game never imports the platform package) and the protocol's
 * SIGNAL_IDS, exactly: same ids, same labels, same places. Plus the ticket refusal wording (contract point 1).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIGNAL_DEFS, SIGNAL_IDS } from '../../src/net/protocol';
import {
  SIGNAL_LABELS,
  signalAllowed,
  signalLabel,
  signalPlace,
  signalsFor,
} from '../../src/online/platform/signals';
import { classifyFailure } from '../../src/net/client/connection';
import { errorMessage } from '../../src/ui/online/rumble/models';

/** [id, kind, label, contexts] rows of the platform catalogue source. */
function platformCatalogue(): [string, string, string, string][] {
  const src = readFileSync('player-platform/src/comms/catalogue.ts', 'utf8');
  return [
    ...src.matchAll(/\bd\(\s*'([a-z_.]+)',\s*'(\w+)',\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'),\s*([^)]+)\)/g),
  ].map((m) => [m[1]!, m[2]!, m[3]!.slice(1, -1), m[4]!.trim()]);
}

describe('the signal catalogue matches the platform and the protocol', () => {
  const rows = platformCatalogue();

  it('the platform catalogue parses (21 presets)', () => {
    expect(rows).toHaveLength(21);
  });

  it('same ids in the same order as SIGNAL_IDS, and the client labels are the platform labels', () => {
    expect(rows.map((r) => r[0])).toEqual([...SIGNAL_IDS]);
    expect(Object.keys(SIGNAL_LABELS)).toEqual([...SIGNAL_IDS]);
    for (const [id, , label] of rows) expect(SIGNAL_LABELS[id], id).toBe(label);
  });

  it('the protocol places mirror the platform contexts (party = lobby)', () => {
    const ctx: Record<string, string[]> = {
      ALL: ['lobby', 'match', 'team'],
      TEAM: ['match', 'team'],
      "['party']": ['lobby'],
    };
    for (const [id, kind, , contexts] of rows) {
      const def = SIGNAL_DEFS.find((d) => d.id === id)!;
      expect(def.kind, id).toBe(kind);
      // TEAM in the platform is ['team','match'] = "during a match"; the protocol narrows team pings to 'team' only
      if (contexts === 'TEAM') expect(def.where.includes('team'), id).toBe(true);
      else expect([...def.where].sort(), id).toEqual([...ctx[contexts]!].sort());
    }
  });

  it('places: lobby / results -> lobby ids; FFA -> match ids; Team -> team + match ids; countdown -> none', () => {
    expect(signalPlace('lobby', 'deathmatch')).toBe('lobby');
    expect(signalPlace('results', 'team')).toBe('lobby');
    expect(signalPlace('playing', 'deathmatch')).toBe('match');
    expect(signalPlace('playing', 'survival')).toBe('match');
    expect(signalPlace('playing', 'team')).toBe('team');
    expect(signalPlace('countdown', 'team')).toBeNull();
    expect(signalsFor('lobby').map((s) => s.id)).toContain('chat.rematch');
    expect(signalsFor('lobby').some((s) => s.kind === 'ping')).toBe(false);
    expect(signalsFor('match').some((s) => s.kind === 'ping')).toBe(false);
    expect(signalsFor('team').filter((s) => s.kind === 'ping')).toHaveLength(6);
    expect(signalAllowed('chat.help', 'team')).toBe(true);
    expect(signalAllowed('chat.help', 'match')).toBe(false);
    expect(signalAllowed('chat.ready', null)).toBe(false);
    expect(signalLabel('toString')).toBeNull();
    expect(signalLabel('emote.wave')).toBe('Wave');
  });

  it('labels are the platform placeholders, never claimed as Pidgin', () => {
    const src = readFileSync('src/online/platform/signals.ts', 'utf8');
    expect(src).toMatch(/not Nigerian Pidgin copy/);
  });
});

describe('a refused ticket (contract point 1)', () => {
  it.each([['invalid ticket'], ['ticket not valid for this room'], ['ticket already used']])(
    '%j is a ticket failure with plain words',
    (message) => {
      expect(classifyFailure(new Error(message)).reason).toBe('ticket');
    },
  );

  it('the uniform room_unavailable answer and the old reasons are unchanged', () => {
    expect(classifyFailure(new Error('room_unavailable;retry=0;That room is not open.')).reason).toBe(
      'room-unavailable',
    );
    expect(classifyFailure(new Error('the room is full')).reason).toBe('room-full');
    const v = errorMessage('ticket');
    expect(v.text).toBe('Your sign-in for this match expired. Try again.');
    expect(v.canRetry).toBe(true);
  });
});
