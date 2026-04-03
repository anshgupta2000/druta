CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  image TEXT,
  username VARCHAR(64),
  total_distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_runs INTEGER NOT NULL DEFAULT 0,
  territories_owned INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  avatar_color VARCHAR(16) NOT NULL DEFAULT '#3B82F6',
  avatar_url TEXT,
  avatar_code TEXT,
  avatar_thumbnail_url TEXT,
  outfit_loadout JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_users_username_unique_idx
  ON auth_users (LOWER(username))
  WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS runs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  avg_pace DOUBLE PRECISION,
  territories_claimed INTEGER NOT NULL DEFAULT 0,
  route_data JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS runs_user_created_at_idx
  ON runs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS territories (
  id BIGSERIAL PRIMARY KEY,
  grid_lat INTEGER NOT NULL,
  grid_lng INTEGER NOT NULL,
  owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  owner_username TEXT,
  strength INTEGER NOT NULL DEFAULT 1 CHECK (strength >= 1 AND strength <= 10),
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT territories_grid_unique UNIQUE (grid_lat, grid_lng)
);

CREATE INDEX IF NOT EXISTS territories_owner_id_idx
  ON territories (owner_id);

CREATE TABLE IF NOT EXISTS races (
  id BIGSERIAL PRIMARY KEY,
  challenger_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  opponent_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  race_type TEXT NOT NULL DEFAULT 'distance',
  target_value DOUBLE PRECISION NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'declined', 'finished')),
  challenger_distance DOUBLE PRECISION NOT NULL DEFAULT 0,
  opponent_distance DOUBLE PRECISION NOT NULL DEFAULT 0,
  winner_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS races_challenger_created_at_idx
  ON races (challenger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS races_opponent_created_at_idx
  ON races (opponent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS races_status_idx
  ON races (status);

CREATE TABLE IF NOT EXISTS friends (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT friends_no_self CHECK (user_id <> friend_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friends_pair_unique_idx
  ON friends (LEAST(user_id, friend_id), GREATEST(user_id, friend_id));

CREATE INDEX IF NOT EXISTS friends_friend_id_status_idx
  ON friends (friend_id, status);
