-- Checkpoint B (1/3): friends, requests, blocks.

CREATE TABLE friend_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id       uuid NOT NULL REFERENCES players (id),
  to_id         uuid NOT NULL REFERENCES players (id),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at    timestamptz NOT NULL,
  responded_at  timestamptz,
  CHECK (from_id <> to_id)
);
-- at most one pending request per PAIR, whichever direction it was sent
CREATE UNIQUE INDEX friend_requests_pending_pair ON friend_requests (LEAST(from_id, to_id), GREATEST(from_id, to_id)) WHERE status = 'pending';
CREATE INDEX friend_requests_to_idx ON friend_requests (to_id) WHERE status = 'pending';
CREATE INDEX friend_requests_from_idx ON friend_requests (from_id) WHERE status = 'pending';

-- one row per friendship, ids stored in order (a < b) so the pair is unique and symmetric
CREATE TABLE friendships (
  player_a    uuid NOT NULL REFERENCES players (id),
  player_b    uuid NOT NULL REFERENCES players (id),
  created_at  timestamptz NOT NULL,
  PRIMARY KEY (player_a, player_b),
  CHECK (player_a < player_b)
);
CREATE INDEX friendships_b_idx ON friendships (player_b);

CREATE TABLE blocks (
  blocker_id  uuid NOT NULL REFERENCES players (id),
  blocked_id  uuid NOT NULL REFERENCES players (id),
  created_at  timestamptz NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);
