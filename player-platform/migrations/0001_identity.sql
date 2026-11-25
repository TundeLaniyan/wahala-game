-- Checkpoint A: persistent player identity, profile, sessions, audit.
-- Principles: the player id is an immutable random uuid; PII is minimised (no email, no date of birth, no IP stored);
-- tokens are stored only as SHA-256 hashes; deletion keeps a non-identifying tombstone row so history keeps its integrity.

CREATE TABLE players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('guest', 'registered')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  -- shareable code used to add friends (never a name search: names are not an enumeration surface); rotatable
  friend_code   text NOT NULL UNIQUE,
  -- self-declared band, no date of birth stored. 'unspecified' is treated like a minor everywhere (restricted features)
  age_group     text NOT NULL DEFAULT 'unspecified' CHECK (age_group IN ('unspecified', 'under_13', '13_17', 'adult')),
  created_at    timestamptz NOT NULL,
  upgraded_at   timestamptz,
  last_seen_at  timestamptz NOT NULL,
  deleted_at    timestamptz,
  CHECK (kind = 'registered' OR upgraded_at IS NULL),
  CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
);

CREATE TABLE profiles (
  player_id         uuid PRIMARY KEY REFERENCES players (id),
  display_name      text NOT NULL,
  -- comparison form of the name (case, accents and look-alike letters folded): unique, so nobody can pose as another.
  -- NULL for a deleted account, which frees the name.
  name_skeleton     text UNIQUE,
  selected_character text NOT NULL,
  -- cosmetics equipped (ids validated against entitlements by the service, Checkpoint D)
  loadout           jsonb NOT NULL DEFAULT '{}'::jsonb,
  presence_visibility text NOT NULL DEFAULT 'friends' CHECK (presence_visibility IN ('friends', 'nobody')),
  settings          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(settings::text) <= 4096),
  -- the first rename (away from the generated guest name) is free; later ones have a cooldown (stops dodging reports)
  name_changed_at   timestamptz,
  updated_at        timestamptz NOT NULL
);

CREATE TABLE identity_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES players (id),
  provider      text NOT NULL CHECK (provider IN ('google', 'apple', 'mock')),
  subject       text NOT NULL,
  -- a masked hint ("t***@gmail.com") so a person can tell which account is linked; the address itself is never stored
  email_hint    text,
  linked_at     timestamptz NOT NULL,
  last_used_at  timestamptz NOT NULL,
  UNIQUE (provider, subject),
  UNIQUE (player_id, provider)
);

CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           uuid NOT NULL REFERENCES players (id),
  access_hash         text NOT NULL UNIQUE,
  access_expires_at   timestamptz NOT NULL,
  refresh_hash        text NOT NULL UNIQUE,
  -- the refresh token this one replaced: presenting it again means a copy was stolen, and revokes the whole session
  prev_refresh_hash   text,
  refresh_expires_at  timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  created_at          timestamptz NOT NULL,
  last_used_at        timestamptz NOT NULL,
  rotated_at          timestamptz,
  -- last time the holder proved a credential (provider sign-in): sensitive actions need this to be recent
  reauth_at           timestamptz,
  auth_method         text NOT NULL CHECK (auth_method IN ('guest', 'google', 'apple', 'mock')),
  client_platform     text NOT NULL DEFAULT 'web' CHECK (client_platform IN ('web', 'android', 'ios', 'dev')),
  device_label        text,
  revoked_at          timestamptz,
  revoked_reason      text
);
CREATE INDEX sessions_player_idx ON sessions (player_id) WHERE revoked_at IS NULL;

-- server-issued, single-use nonces: the client passes one to the provider's sign-in, the provider echoes it inside the id
-- token, the server consumes it. A captured id token therefore cannot be replayed (and cannot be minted for another flow).
CREATE TABLE auth_nonces (
  digest      text PRIMARY KEY,
  expires_at  timestamptz NOT NULL
);

CREATE TABLE audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL,
  type        text NOT NULL,
  -- no foreign keys: the trail must survive an account deletion. Never holds tokens, credentials or free text from users.
  actor_id    uuid,
  subject_id  uuid,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id  text
);
CREATE INDEX audit_subject_idx ON audit_events (subject_id, at);
CREATE INDEX audit_type_idx ON audit_events (type, at);
