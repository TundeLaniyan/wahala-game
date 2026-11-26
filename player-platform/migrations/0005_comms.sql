-- Checkpoint C: player communication foundation. PRESET signals only in production: there is no free-text table that the
-- production code path writes to (dev_chat_messages exists only for the development-flagged chat and is purged within 24 h).

CREATE TABLE mutes (
  muter_id    uuid NOT NULL REFERENCES players (id),
  muted_id    uuid NOT NULL REFERENCES players (id),
  created_at  timestamptz NOT NULL,
  PRIMARY KEY (muter_id, muted_id),
  CHECK (muter_id <> muted_id)
);
CREATE INDEX mutes_muted_idx ON mutes (muted_id);

-- a time-limited ban on one way of communicating. 'auto' = raised by the platform (reversible by a moderator), 'moderator' = decided by a person
CREATE TABLE comm_restrictions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES players (id),
  kind        text NOT NULL CHECK (kind IN ('signals', 'text', 'voice')),
  source      text NOT NULL CHECK (source IN ('auto', 'moderator')),
  reason      text NOT NULL CHECK (length(reason) <= 120),
  created_at  timestamptz NOT NULL,
  until       timestamptz NOT NULL,
  lifted_at   timestamptz
);
CREATE INDEX comm_restrictions_player_idx ON comm_restrictions (player_id, until);

CREATE TABLE reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id    uuid NOT NULL REFERENCES players (id),
  reported_id    uuid NOT NULL REFERENCES players (id),
  category       text NOT NULL CHECK (category IN ('abusive_name', 'harassment', 'cheating', 'spam', 'inappropriate_content', 'impersonation', 'other')),
  context        text NOT NULL CHECK (context IN ('profile', 'party', 'match', 'friend_request', 'chat')),
  context_ref    text CHECK (context_ref IS NULL OR length(context_ref) <= 64),
  -- the only free text a player can attach (capped; erased with the account)
  note           text CHECK (note IS NULL OR length(note) <= 200),
  -- the name AS IT WAS when reported (a name can change after the report)
  reported_name  text NOT NULL,
  -- a bounded snapshot of what the reporter could see: recent preset signals (ids) and, for the dev chat, message lines
  evidence       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (octet_length(evidence::text) <= 8192),
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  resolution     text CHECK (resolution IS NULL OR resolution IN ('dismiss', 'warn', 'restrict_signals', 'suspend')),
  created_at     timestamptz NOT NULL,
  resolved_at    timestamptz,
  resolved_by    text CHECK (resolved_by IS NULL OR length(resolved_by) <= 40),
  CHECK (reporter_id <> reported_id),
  CHECK ((status = 'open') = (resolved_at IS NULL))
);
-- one OPEN report per reporter per target per place: repeated taps are idempotent, not a way to inflate a count
CREATE UNIQUE INDEX reports_open_dedupe_idx ON reports (reporter_id, reported_id, context, COALESCE(context_ref, '')) WHERE status = 'open';
CREATE INDEX reports_status_idx ON reports (status, created_at);
CREATE INDEX reports_reported_idx ON reports (reported_id, created_at);

CREATE TABLE party_signals (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id    uuid NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES players (id),
  signal_id   text NOT NULL CHECK (length(signal_id) <= 40),
  created_at  timestamptz NOT NULL
);
CREATE INDEX party_signals_party_idx ON party_signals (party_id, id);

-- DEVELOPMENT ONLY (PLATFORM_DEV_TEXT_CHAT=1, refused by config validation in production): party text lines, deleted after 24 h
CREATE TABLE dev_chat_messages (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id    uuid NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES players (id),
  body        text NOT NULL CHECK (length(body) <= 200),
  created_at  timestamptz NOT NULL
);
CREATE INDEX dev_chat_party_idx ON dev_chat_messages (party_id, id);
