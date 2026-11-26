-- Checkpoint B (2/3): private parties, invitations, and the signed tickets handed to the match server.
-- A party is a SOCIAL group (who plays together). It never owns a room, a seat or a team: the match server does.

CREATE TABLE parties (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- shareable join code, valid only while the party is open AND the code has not expired; rotatable
  code             text NOT NULL,
  code_expires_at  timestamptz NOT NULL,
  leader_id        uuid NOT NULL REFERENCES players (id),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_match', 'closed')),
  mode             text NOT NULL DEFAULT 'ffa' CHECK (mode IN ('ffa', 'team')),
  max_size         int NOT NULL CHECK (max_size BETWEEN 2 AND 32),
  -- the MATCH SERVER's room code, reported by the leader once they opened the private room. Routing data only.
  match_room_code  text,
  match_opened_at  timestamptz,
  created_at       timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL,
  closed_at        timestamptz,
  closed_reason    text,
  CHECK ((status = 'in_match') = (match_room_code IS NOT NULL))
);
CREATE UNIQUE INDEX parties_code_live_idx ON parties (code) WHERE status <> 'closed';

CREATE TABLE party_members (
  party_id     uuid NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES players (id),
  joined_at    timestamptz NOT NULL,
  ready        boolean NOT NULL DEFAULT false,
  PRIMARY KEY (party_id, player_id)
);
-- a player is in at most ONE party at a time
CREATE UNIQUE INDEX party_members_one_party_idx ON party_members (player_id);

CREATE TABLE party_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id    uuid NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  from_id     uuid NOT NULL REFERENCES players (id),
  to_id       uuid NOT NULL REFERENCES players (id),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at  timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  CHECK (from_id <> to_id)
);
CREATE UNIQUE INDEX party_invites_pending_idx ON party_invites (party_id, to_id) WHERE status = 'pending';
CREATE INDEX party_invites_to_idx ON party_invites (to_id) WHERE status = 'pending';

-- every match ticket the platform signed: the record that lets the platform later refuse a result naming someone who was never
-- admitted to that room. Tickets are short-lived; this row is only the issuing log (no token is stored).
CREATE TABLE handoff_tickets (
  jti         uuid PRIMARY KEY,
  player_id   uuid NOT NULL REFERENCES players (id),
  party_id    uuid REFERENCES parties (id) ON DELETE SET NULL,
  room_code   text NOT NULL,
  issued_at   timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL
);
CREATE INDEX handoff_tickets_room_idx ON handoff_tickets (room_code, player_id);
