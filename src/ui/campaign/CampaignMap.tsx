/**
 * The campaign map: a stylised Lagos with seven districts (the Ojuelegba hub and the six boss districts) as
 * nodes, each locked / open / cleared with its stars; the selected district's card (tagline, three landmark
 * names, boss) and the campaign tools (Continue, Prologue, Finale, New Campaign and Delete save, both asked to
 * confirm). Text comes from src/campaign content; nothing is invented.
 */
import { useState } from 'react';
import { CAMPAIGN, DISTRICT_ORDER, bossAvailable } from '../../campaign';
import type { DistrictId } from '../../campaign';
import type { CampaignLevel, MissionId } from '../../sim';
import { commands } from '../../app/session';
import { PrimaryButton, ScreenFrame, SecondaryButton } from '../menu/Frame';
import {
  clock,
  districtNumber,
  lockedReason,
  mapNodes,
  progressText,
  statusLabel,
  totalStars,
} from './model';
import type { MapNode } from './model';
import { Stars, useCampaignUi } from './parts';
import { LevelPicker } from './LevelPicker';
import { StoryHero } from './StoryHero';
import { SectionList } from './SectionList';

/** Coast, lagoon, the island and the Lekki strip behind the nodes (decorative only, 0..100 units). */
function MapBackdrop({ nodes }: { nodes: MapNode[] }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <svg className="cp-map-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="cp-land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#222b1f" />
          <stop offset="1" stopColor="#1b2230" />
        </linearGradient>
        <linearGradient id="cp-sea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10304a" />
          <stop offset="1" stopColor="#0b1b2e" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#cp-land)" />
      <path d="M0 91 C 18 86 30 96 48 90 S 78 96 100 88 L100 100 L0 100 Z" fill="url(#cp-sea)" />
      <path
        d="M30 62 C 42 70 54 66 60 76 S 66 92 80 90 S 96 82 100 76 L100 100 L52 100 C 40 90 34 78 30 62 Z"
        fill="url(#cp-sea)"
        opacity="0.55"
      />
      <path
        d="M58 70 C 64 64 74 66 76 74 S 70 84 62 82 S 54 76 58 70 Z"
        fill="#2b3340"
        stroke="#3a4558"
        strokeWidth="0.5"
      />
      <path
        d="M78 80 C 86 76 96 78 98 84 S 90 90 82 88 S 74 84 78 80 Z"
        fill="#2b3340"
        stroke="#3a4558"
        strokeWidth="0.5"
      />
      {nodes.map((n) => {
        const from = n.after ? byId.get(n.after) : null;
        if (!from) return null;
        const lit = n.status !== 'locked' && from.status === 'cleared';
        return (
          <line
            key={n.id}
            x1={from.x}
            y1={from.y}
            x2={n.x}
            y2={n.y}
            className={`cp-road${lit ? ' lit' : ''}`}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function NodeButton(props: { node: MapNode; selected: boolean; enabled: boolean; onPick: () => void }) {
  const { node } = props;
  const sub =
    node.status === 'locked'
      ? 'locked'
      : node.hub
        ? 'hub'
        : node.status === 'cleared'
          ? `${node.stars} of 3 stars`
          : 'open';
  return (
    <button
      type="button"
      className={`cp-node ${node.status}${props.selected ? ' on' : ''}${node.hub ? ' hub' : ''}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      data-testid={`map-node-${node.id}`}
      data-status={node.status}
      aria-pressed={props.selected}
      aria-label={`${node.name}, ${sub}. Landmarks: ${node.landmarks.join(', ')}`}
      title={node.landmarks.join(' · ')}
      disabled={!props.enabled}
      onClick={props.onPick}
    >
      <span className="cp-node-dot" aria-hidden>
        {node.hub ? '⌂' : node.status === 'locked' ? '🔒' : districtNumber(node.id)}
      </span>
      <span className="cp-node-name">{node.name}</span>
      {node.status === 'cleared' && !node.hub && <Stars n={node.stars} />}
    </button>
  );
}

function DistrictCard({ id, status }: { id: DistrictId; status: MapNode['status'] }) {
  const ui = useCampaignUi();
  if (!ui) return null;
  const d = CAMPAIGN.districts[id];
  const p = ui.save.districts[id];
  const reason = lockedReason(ui.save, id);
  return (
    <article className="cp-card mn-panel" data-testid="district-card" data-district={id}>
      {status !== 'locked' && <StoryHero imageKey={`district.${id}.briefing`} variant="banner" />}
      <header>
        <small className="mn-kicker">
          {id === 'ojuelegba' ? 'The hub' : `District ${districtNumber(id)} of 6`} · {statusLabel[status]}
        </small>
        <h3 data-testid="district-name">{d.name}</h3>
        <p className="cp-tagline">{d.tagline}</p>
      </header>
      {reason && (
        <p className="cp-locked" data-testid="district-locked">
          {reason}
        </p>
      )}
      {status === 'cleared' && p && p.clears > 0 && (
        <p className="cp-best" data-testid="district-best">
          <Stars n={p.bestStars} /> best {p.bestSeconds !== null ? clock(p.bestSeconds) : '-'} · {p.clears}{' '}
          {p.clears === 1 ? 'clear' : 'clears'}
        </p>
      )}
      <div className="cp-landmarks" data-testid="district-landmarks">
        <small className="mn-kicker">Landmarks</small>
        <ul>
          {d.landmarks.map((l) => (
            <li key={l.id} title={l.note}>
              {l.name}
            </li>
          ))}
        </ul>
      </div>
      {d.boss && status !== 'locked' && <SectionList districtId={d.id as MissionId} />}
      {d.boss && status !== 'locked' && (
        <p className="cp-bossline" data-testid="district-boss">
          <small className="mn-kicker">Keeper</small>
          <b>{d.boss.name}</b>, {d.boss.title}
        </p>
      )}
      {d.boss && status === 'locked' && (
        <p className="cp-bossline">
          <small className="mn-kicker">Keeper</small>
          <b>Unknown</b>
        </p>
      )}
    </article>
  );
}

function Tools() {
  const ui = useCampaignUi();
  const [confirm, setConfirm] = useState<'new' | 'delete' | null>(null);
  if (!ui) return null;
  const { save, started } = ui;
  const askNew = started;
  return (
    <div className="cp-tools" data-testid="campaign-tools">
      {confirm ? (
        <div
          className="cp-confirm mn-panel"
          role="alertdialog"
          aria-label="Confirm"
          data-testid="campaign-confirm"
        >
          <p>
            {confirm === 'new'
              ? 'Start a new campaign? Your current progress will be erased.'
              : 'Delete the saved campaign from this browser? This cannot be undone.'}
          </p>
          <div className="cp-confirm-actions">
            <SecondaryButton
              tone="danger"
              testId="campaign-confirm-yes"
              onClick={() => {
                const what = confirm;
                setConfirm(null);
                if (what === 'new') commands.campaignNew(save.campaignLevel);
                else commands.campaignDelete();
              }}
            >
              {confirm === 'new' ? 'Erase and start over' : 'Delete save'}
            </SecondaryButton>
            <SecondaryButton testId="campaign-confirm-no" onClick={() => setConfirm(null)}>
              Cancel
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <>
          {started && (
            <SecondaryButton
              className="small"
              testId="campaign-prologue"
              onClick={() => commands.campaignStory('prologue')}
            >
              Prologue
            </SecondaryButton>
          )}
          {started && save.completed && (
            <SecondaryButton
              className="small"
              testId="campaign-ending"
              onClick={() => commands.campaignContinue()}
            >
              Ending
            </SecondaryButton>
          )}
          {started && (
            <SecondaryButton
              className="small"
              testId="campaign-new"
              onClick={() => (askNew ? setConfirm('new') : commands.campaignNew(save.campaignLevel))}
            >
              New campaign
            </SecondaryButton>
          )}
          {started && (
            <SecondaryButton
              className="small"
              tone="danger"
              testId="campaign-delete"
              onClick={() => setConfirm('delete')}
            >
              Delete save
            </SecondaryButton>
          )}
        </>
      )}
    </div>
  );
}

export function CampaignMap() {
  const ui = useCampaignUi();
  const [chosenLevel, setChosenLevel] = useState<CampaignLevel>('normal');
  if (!ui) return null;
  const { save, started } = ui;
  const level = started ? save.campaignLevel : chosenLevel;
  const nodes = mapNodes(save);
  const selected = nodes.find((n) => n.id === ui.selected) ?? nodes[1]!;
  const missionSelected = selected.id !== 'ojuelegba';
  const canOpen =
    started &&
    missionSelected &&
    selected.status !== 'locked' &&
    bossAvailable(save, selected.id as MissionId);
  const stars = totalStars(save);
  const next = nodes.find((n) => !n.hub && n.status !== 'cleared');
  const allClear = !next;
  const hasProgress =
    started && DISTRICT_ORDER.some((d) => d !== 'ojuelegba' && save.districts[d].attempts > 0);
  return (
    <ScreenFrame
      id="campaign"
      kicker="Story mode · offline"
      title="Break the Ring"
      className="cp-screen"
      status={
        <span className="cp-progress" data-testid="campaign-progress-text">
          <b>{progressText(save)}</b> · {stars.got} / {stars.max} stars
        </span>
      }
      actions={
        started ? (
          <PrimaryButton testId="campaign-continue" autoFocus onClick={() => commands.campaignContinue()}>
            {allClear
              ? save.completed
                ? 'The ending'
                : 'Play the finale'
              : hasProgress
                ? 'Continue'
                : 'Start Oshodi'}
          </PrimaryButton>
        ) : (
          <PrimaryButton
            testId="campaign-start-new"
            autoFocus
            onClick={() => commands.campaignNew(chosenLevel)}
          >
            New campaign
          </PrimaryButton>
        )
      }
    >
      {ui.notice && (
        <p className="cp-notice" role="status" data-testid="campaign-notice">
          <span>{ui.notice}</span>
          <button type="button" className="mn-link" onClick={() => commands.campaignDismissNotice()}>
            OK
          </button>
        </p>
      )}
      <div
        className="cp-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={6}
        aria-valuenow={nodes.filter((n) => !n.hub && n.status === 'cleared').length}
        aria-label="Districts cleared"
        data-testid="campaign-progress"
      >
        <i
          style={{
            width: `${Math.round((nodes.filter((n) => !n.hub && n.status === 'cleared').length / 6) * 100)}%`,
          }}
        />
      </div>
      <div className="cp-map-grid">
        <div className="cp-map" data-testid="campaign-map">
          <MapBackdrop nodes={nodes} />
          <span className="cp-sea cp-sea-a" aria-hidden>
            Atlantic
          </span>
          <span className="cp-sea cp-sea-b" aria-hidden>
            Lagos Lagoon
          </span>
          {nodes.map((n) => (
            <NodeButton
              key={n.id}
              node={n}
              selected={n.id === selected.id}
              enabled
              onPick={() => commands.campaignSelect(n.id)}
            />
          ))}
        </div>
        <div className="cp-side">
          {started ? (
            <>
              <DistrictCard id={selected.id} status={selected.status} />
              {canOpen && (
                <SecondaryButton
                  className="cp-open"
                  testId="campaign-briefing"
                  onClick={() => commands.campaignBriefing(selected.id)}
                >
                  {selected.status === 'cleared' ? 'Replay: open briefing' : 'Open briefing'}
                </SecondaryButton>
              )}
            </>
          ) : (
            <article className="cp-card mn-panel" data-testid="campaign-start-card">
              <small className="mn-kicker">One player · no accounts</small>
              <h3>Six districts. Six keepers. One Ring.</h3>
              <p>
                Break the Oruka Ring from Oshodi to Lekki. Every district asks something different of you, and
                your progress is saved in this browser.
              </p>
            </article>
          )}
          <LevelPicker
            value={level}
            onPick={(l) => (started ? commands.campaignLevel(l) : setChosenLevel(l))}
          />
          <Tools />
        </div>
      </div>
    </ScreenFrame>
  );
}
