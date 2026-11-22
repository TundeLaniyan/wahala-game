/**
 * The boss bar of a boss mission (decisions BH1-BH4, docs/DECISIONS.md): the district bosses are generator bots that take
 * BLAST HITS (one per exposure window, three in all), so the bar's health is the sim's `boss.hitsLeft` of `maxHits` -
 * never phases or defences. It tells SHIELDED (a blast does nothing) from EXPOSED (a blast takes a segment), drains a
 * segment only for a real `bossHit` / `bossDefeated` event, and reads DEFEATED at zero. Driven through the real mission
 * sim; no rules in the UI.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { missionBossBar } from '../../src/ui/campaignHealthModel';
import { CampaignHealth } from '../../src/ui/CampaignHealth';
import {
  BOSS_BLOCK_TICKS,
  BOSS_HIT_TICKS,
  NO_BOSS_MEMORY,
  bossFeedback,
  trackBossBar,
} from '../../src/app/bossBar';
import type { BossBarMemory } from '../../src/app/bossBar';
import { missionView, tick } from '../../src/sim';
import type { GameState, SimEvent } from '../../src/sim';
import { addGenerator } from '../helpers';
import { advance, hitBoss, newMission, of, put } from '../mission-helpers';

const AWAY = { x: 30, y: 30 };

/** Breaks the current phase (every live relay) with blasts, the human well away. */
function breakPhase(state: GameState): void {
  const m = state.mission!;
  for (const n of m.nodes) {
    if (m.phaseState !== 'active' || n.done) continue;
    put(state, 0, AWAY.x, AWAY.y);
    addGenerator(state, { ownerId: 0, x: n.x, y: n.y, timer: 1 });
    advance(state, 45);
  }
}

/** Runs `n` ticks the way the controller does: every tick's events go through the bar's memory. */
function play(state: GameState, mem: BossBarMemory, n: number): { mem: BossBarMemory; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const ev = tick(state, {});
    events.push(...ev);
    mem = trackBossBar(mem, ev, state);
  }
  return { mem, events };
}

const barOf = (state: GameState, mem: BossBarMemory = NO_BOSS_MEMORY) =>
  missionBossBar(missionView(state), [], bossFeedback(mem, state.tick));

describe("missionBossBar: health is the sim's hits left", () => {
  it('names the boss from the real view and starts at full health, shielded', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const bar = barOf(state)!;
    expect(bar.kindLabel).toBe('BOSS');
    expect(bar.name).toBe('Oga Sunmola');
    expect(bar).toMatchObject({
      state: 'shielded',
      segments: 3,
      filled: 3,
      text: '3 / 3',
      status: { tag: 'SHIELDED', note: 'BLASTS DO NOTHING' },
      lostIndex: null,
      hitText: null,
      blocked: false,
      window: null,
    });
  });

  it('follows the sim through the whole fight: exposure drains nothing, each real hit takes one segment, the last is DEFEATED', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    let mem: BossBarMemory = NO_BOSS_MEMORY;
    tick(state, {});
    for (const left of [2, 1]) {
      breakPhase(state);
      // exposed: the shield is down, the health has not moved (the old bar jumped to one segment here)
      const exposed = barOf(state, mem)!;
      expect(exposed).toMatchObject({
        state: 'exposed',
        filled: left + 1,
        text: `${left + 1} / 3`,
        hitText: null,
      });
      expect(exposed.status!.tag).toMatch(/^EXPOSED \d:\d\d$/);
      expect(exposed.status!.note).toBe('BLAST HIM NOW');
      expect(exposed.window).toBeGreaterThan(0.9);
      // a real blast on him: one segment, and the bar says which and why
      const ev = hitBoss(state, AWAY);
      expect(of(ev, 'bossHit')).toHaveLength(1);
      mem = trackBossBar(mem, ev, state);
      const hit = barOf(state, mem)!;
      expect(m.boss.hp).toBe(left);
      expect(hit).toMatchObject({
        state: 'shielded',
        filled: left,
        text: `${left} / 3`,
        lostIndex: left,
        hitText: 'HIT -1',
      });
    }
    breakPhase(state);
    const last = hitBoss(state, AWAY);
    expect(of(last, 'bossDefeated')).toHaveLength(1);
    mem = trackBossBar(mem, last, state);
    expect(barOf(state, mem)).toMatchObject({
      state: 'defeated',
      filled: 0,
      text: '0 / 3',
      status: { tag: 'DEFEATED' },
      lostIndex: 0,
      hitText: 'HIT -1',
      window: null,
    });
  });

  it("a bar that is lower than the event says is not flashed: the drain needs the sim's own hit event", () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    breakPhase(state);
    hitBoss(state, AWAY); // the sim took a hit but nobody told the memory
    const silent = barOf(state)!;
    expect(silent.filled).toBe(2); // the value is always the sim's
    expect(silent).toMatchObject({ lostIndex: null, hitText: null });
    // an event that disagrees with the health on the bar (a stale cue) flashes nothing either
    const stale: BossBarMemory = { game: state, hit: { tick: state.tick, hitsLeft: 1 }, blocked: null };
    expect(barOf(state, stale)).toMatchObject({ filled: 2, lostIndex: null, hitText: null });
  });

  it('the cue expires: after BOSS_HIT_TICKS the segment is simply empty', () => {
    const state = newMission({ id: 'oshodi' });
    let mem: BossBarMemory = NO_BOSS_MEMORY;
    tick(state, {});
    breakPhase(state);
    mem = trackBossBar(mem, hitBoss(state, AWAY), state);
    expect(barOf(state, mem)!.hitText).toBe('HIT -1');
    advance(state, BOSS_HIT_TICKS + 1);
    expect(barOf(state, mem)).toMatchObject({ filled: 2, lostIndex: null, hitText: null });
  });

  it('a window that runs out re-shields him with his health untouched', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    tick(state, {});
    breakPhase(state);
    put(state, 0, AWAY.x, AWAY.y);
    const ev = advance(state, m.tuning.exposeTicks + m.tuning.boss!.walkGraceTicks + 120);
    expect(of(ev, 'bossShielded').some((e) => e.reason === 'expired')).toBe(true);
    expect(barOf(state)).toMatchObject({ state: 'shielded', filled: 3, text: '3 / 3', hitText: null });
  });
});

describe('a blast on the SHIELDED boss is "blocked", never a hit', () => {
  it('the sim does nothing: no event, same health; the bar says BLOCKED / NO DAMAGE for a moment', () => {
    const state = newMission({ id: 'oshodi' });
    const boss = state.players[1]!;
    let mem: BossBarMemory = NO_BOSS_MEMORY;
    tick(state, {});
    put(state, 0, AWAY.x, AWAY.y);
    addGenerator(state, { ownerId: 0, x: boss.x, y: boss.y, timer: 1 });
    const events: SimEvent[] = [];
    for (let i = 0; i < 45 && mem.blocked === null; i++) {
      const ev = tick(state, {});
      events.push(...ev);
      mem = trackBossBar(mem, ev, state);
    }
    // the very tick the flame reaches his shield: BLOCKED, no event, the health as it was
    expect(mem.blocked).not.toBeNull();
    expect(of(events, 'bossHit')).toHaveLength(0);
    expect(state.mission!.boss.hp).toBe(3);
    expect(barOf(state, mem)).toMatchObject({
      state: 'shielded',
      filled: 3,
      text: '3 / 3',
      hitText: null,
      blocked: true,
      status: { tag: 'BLOCKED', note: 'NO DAMAGE' },
    });
    // the rest of the blast (several flame ticks) is the same blast: one cue
    const once = mem.blocked;
    mem = play(state, mem, 20).mem;
    expect(mem.blocked).toBe(once);
    // the cue expires and the plain shielded state returns
    advance(state, BOSS_BLOCK_TICKS + 5);
    const later = barOf(state, mem)!;
    expect(later.blocked).toBe(false);
    expect(later.status).toEqual({ tag: 'SHIELDED', note: 'BLASTS DO NOTHING' });
  });

  it('is never claimed for an exposed boss (that is a real hit) or once he is defeated', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    breakPhase(state);
    const exposed = missionBossBar(missionView(state), [], {
      sinceHit: null,
      hitsLeft: null,
      sinceBlocked: 3,
    })!;
    expect(exposed.blocked).toBe(false);
    expect(exposed.state).toBe('exposed');
  });
});

describe('the bar is only for a boss mission', () => {
  it('is absent outside one, and when a hit-point boss bar already shows the boss', () => {
    expect(missionBossBar(null)).toBeNull();
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const hp = [{ id: 1, name: 'X', kindLabel: 'BOSS' as const, segments: 4, filled: 4, text: '4 / 4' }];
    expect(missionBossBar(missionView(state), hp)).toBeNull();
  });

  it('takes its size from the view (a boss with five hits has five segments)', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const v = missionView(state)!;
    const bar = missionBossBar({ ...v, boss: { ...v.boss, hitsLeft: 4, maxHits: 5 } })!;
    expect(bar).toMatchObject({ segments: 5, filled: 4, text: '4 / 5' });
  });
});

describe('the bar in the rail', () => {
  const html = (state: GameState, mem: BossBarMemory = NO_BOSS_MEMORY): string =>
    renderToStaticMarkup(
      createElement(CampaignHealth, {
        campaign: null,
        mission: missionView(state),
        feedback: bossFeedback(mem, state.tick),
      }),
    );

  it('shows the name, three full segments and the shielded state', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    const out = html(state);
    expect(out).toContain('data-testid="boss-bar"');
    expect(out).toContain('data-state="shielded"');
    expect(out).toContain('Oga Sunmola');
    expect((out.match(/ch-seg full/g) ?? []).length).toBe(3);
    expect(out).toContain('3 / 3');
    expect(out).toContain('SHIELDED');
    expect(out).toContain('BLASTS DO NOTHING');
  });

  it('after a hit: one hollow segment, a HIT -1 chip and the struck state; exposed shows its timer', () => {
    const state = newMission({ id: 'oshodi' });
    let mem: BossBarMemory = NO_BOSS_MEMORY;
    tick(state, {});
    breakPhase(state);
    const open = html(state, mem);
    expect(open).toContain('data-state="exposed"');
    expect(open).toContain('data-testid="boss-window"');
    mem = trackBossBar(mem, hitBoss(state, AWAY), state);
    const out = html(state, mem);
    expect(out).toContain('data-struck="true"');
    expect(out).toContain('HIT -1');
    expect((out.match(/ch-seg full/g) ?? []).length).toBe(2);
    expect((out.match(/ch-seg lost/g) ?? []).length).toBe(1);
    expect(out).not.toContain('data-testid="boss-window"');
  });

  it('defeated: no full segment, the DEFEATED tag', () => {
    const state = newMission({ id: 'oshodi' });
    tick(state, {});
    for (let i = 0; i < 2; i++) {
      breakPhase(state);
      hitBoss(state, AWAY);
    }
    breakPhase(state);
    let mem: BossBarMemory = NO_BOSS_MEMORY;
    mem = trackBossBar(mem, hitBoss(state, AWAY), state);
    const out = html(state, mem);
    expect(out).toContain('data-state="defeated"');
    expect(out).toContain('DEFEATED');
    expect(out).toContain('0 / 3');
    expect((out.match(/ch-seg full/g) ?? []).length).toBe(0);
  });
});
