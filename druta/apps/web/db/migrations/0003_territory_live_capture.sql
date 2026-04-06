CREATE TABLE IF NOT EXISTS run_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'finished', 'aborted')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_seq INTEGER NOT NULL DEFAULT 0,
  last_point JSONB,
  territories_claimed INTEGER NOT NULL DEFAULT 0,
  territories_captured INTEGER NOT NULL DEFAULT 0,
  territories_strengthened INTEGER NOT NULL DEFAULT 0,
  total_segments_applied INTEGER NOT NULL DEFAULT 0,
  total_segments_rejected INTEGER NOT NULL DEFAULT 0,
  run_id BIGINT REFERENCES runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS run_sessions_user_id_created_at_idx
  ON run_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS run_sessions_status_idx
  ON run_sessions (status);

CREATE TABLE IF NOT EXISTS run_session_chunks (
  id BIGSERIAL PRIMARY KEY,
  run_session_id BIGINT NOT NULL REFERENCES run_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  point_count INTEGER NOT NULL DEFAULT 0,
  applied_segments INTEGER NOT NULL DEFAULT 0,
  rejected_segments INTEGER NOT NULL DEFAULT 0,
  changed_tiles JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT run_session_chunks_unique_seq UNIQUE (run_session_id, seq)
);

CREATE INDEX IF NOT EXISTS run_session_chunks_session_created_at_idx
  ON run_session_chunks (run_session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS territory_contributions (
  grid_lat INTEGER NOT NULL,
  grid_lng INTEGER NOT NULL,
  subject_type TEXT NOT NULL DEFAULT 'user'
    CHECK (subject_type IN ('user', 'group')),
  subject_id TEXT NOT NULL,
  distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT territory_contributions_pk PRIMARY KEY (grid_lat, grid_lng, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS territory_contributions_subject_idx
  ON territory_contributions (subject_type, subject_id);

CREATE INDEX IF NOT EXISTS territory_contributions_tile_idx
  ON territory_contributions (grid_lat, grid_lng);

CREATE TABLE IF NOT EXISTS run_session_tile_contributions (
  id BIGSERIAL PRIMARY KEY,
  run_session_id BIGINT NOT NULL REFERENCES run_sessions(id) ON DELETE CASCADE,
  grid_lat INTEGER NOT NULL,
  grid_lng INTEGER NOT NULL,
  subject_type TEXT NOT NULL DEFAULT 'user'
    CHECK (subject_type IN ('user', 'group')),
  subject_id TEXT NOT NULL,
  distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  was_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  was_captured BOOLEAN NOT NULL DEFAULT FALSE,
  was_strengthened BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT run_session_tile_contributions_unique
    UNIQUE (run_session_id, grid_lat, grid_lng, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS run_session_tile_contributions_session_idx
  ON run_session_tile_contributions (run_session_id);

CREATE INDEX IF NOT EXISTS run_session_tile_contributions_subject_idx
  ON run_session_tile_contributions (subject_type, subject_id);
