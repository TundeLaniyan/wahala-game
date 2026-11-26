/**
 * The hosted private-beta entry screen: no quick play, no create-room, no join-by-code (the beta match server refuses everyone without
 * a platform ticket, so those buttons could only fail); the note says the party starts the match. The normal screen is unchanged.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EntryProps } from '../../src/ui/online/rumble/EntryScreen';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));
const { EntryScreen } = await import('../../src/ui/online/rumble/EntryScreen');

const props = (over: Partial<EntryProps> = {}): EntryProps => ({
  name: 'Ada',
  codeInput: '',
  configured: true,
  fake: false,
  fighter: 'streetBaller',
  quickMode: 'ffa',
  onQuickMode: () => undefined,
  onName: () => undefined,
  onCode: () => undefined,
  onCreate: () => undefined,
  onJoin: () => undefined,
  onQuick: () => undefined,
  onChangeFighter: () => undefined,
  onBack: () => undefined,
  ...over,
});

describe('entry screen: private beta', () => {
  it('the normal screen still has create, join by code and quick play', () => {
    const html = renderToStaticMarkup(createElement(EntryScreen, props()));
    for (const id of ['ro-create', 'ro-join', 'ro-quick', 'ro-code'])
      expect(html, id).toContain(`data-testid="${id}"`);
    expect(html).not.toContain('ro-beta-note');
  });

  it('the beta screen offers the party only: none of the three ticketless entries exist', () => {
    const html = renderToStaticMarkup(createElement(EntryScreen, props({ privateBeta: true })));
    for (const id of ['ro-create', 'ro-join', 'ro-quick', 'ro-code', 'ro-quick-modes'])
      expect(html, id).not.toContain(`data-testid="${id}"`);
    expect(html).toContain('data-testid="ro-beta-note"');
    expect(html).toContain('data-testid="ro-name"'); // the nickname is still chosen here
  });
});
