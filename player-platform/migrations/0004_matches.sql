-- Checkpoint B (3/3): non-ranked match participation facts, written ONLY from the match server's signed calls.
-- No XP, rating, rank or reward column exists: ranked play and persistent competitive rewards are deferred (decision PIS7).

CREATE TABLE matches (
  id            text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_.:-]{6,64}$'),   -- the match server's id: also the idempotency key
  game          text NOT NULL CHECK (game IN ('survival', 'deathmatch', 'team')),
  arena_id      text NOT NULL CHECK (length(arena_id) <= 64),
  room_code     text,
  state         text NOT NULL CHECK (state IN ('started', 'finished')),
  seats         int NOT NULL CHECK (seats BETWEEN 1 AND 64),
  started_at    timestamptz,
  ended_at      timestamptz,
  duration_sec  int CHECK (duration_sec IS NULL OR duration_sec BETWEEN 0 AND 7200),
  recorded_at   timestamptz NOT NULL,
  CHECK (state = 'started' OR ended_at IS NOT NULL)
);

CREATE TABLE match_participants (
  match_id      text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  seat          int NOT NULL CHECK (seat BETWEEN 0 AND 63),
  -- NULL for bots and for guests without a platform account. SET NULL on account deletion (history stays, identity goes).
  player_id     uuid REFERENCES players (id) ON DELETE SET NULL,
  display_name  text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 60),
  is_bot        boolean NOT NULL,
  team          int,
  placement     int CHECK (placement IS NULL OR placement BETWEEN 1 AND 64),
  -- personal numbers count only HUMAN-controlled time; what a replacement bot did is kept apart (match server rule ON7)
  kills         int CHECK (kills IS NULL OR kills >= 0),
  deaths        int CHECK (deaths IS NULL OR deaths >= 0),
  assists       int CHECK (assists IS NULL OR assists >= 0),
  bot_kills     int CHECK (bot_kills IS NULL OR bot_kills >= 0),
  bot_deaths    int CHECK (bot_deaths IS NULL OR bot_deaths >= 0),
  bot_assists   int CHECK (bot_assists IS NULL OR bot_assists >= 0),
  controlled_by_bot_at_end boolean,
  PRIMARY KEY (match_id, seat),
  CHECK (NOT is_bot OR player_id IS NULL)
);
CREATE INDEX match_participants_player_idx ON match_participants (player_id, match_id) WHERE player_id IS NOT NULL;
