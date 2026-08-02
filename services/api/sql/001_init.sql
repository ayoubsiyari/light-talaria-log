-- Talaria-Log Level 2 schema (OHLC binaries live in object storage, not here)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_auth_user_idx ON sessions_auth(user_id);
CREATE INDEX IF NOT EXISTS sessions_auth_expires_idx ON sessions_auth(expires_at);

CREATE TABLE IF NOT EXISTS datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  base_timeframe text NOT NULL DEFAULT '1m',
  name text NOT NULL,
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'shared', 'public_read')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'failed')),
  time_start bigint NOT NULL DEFAULT 0,
  time_end bigint NOT NULL DEFAULT 0,
  row_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeframes text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS datasets_owner_idx ON datasets(owner_user_id);
CREATE INDEX IF NOT EXISTS datasets_symbol_idx ON datasets(symbol);

CREATE TABLE IF NOT EXISTS dataset_acl (
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'read' CHECK (role IN ('read', 'write', 'admin')),
  PRIMARY KEY (dataset_id, user_id)
);

CREATE TABLE IF NOT EXISTS dataset_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  timeframe text NOT NULL,
  chunk_index int NOT NULL,
  chunk_id text NOT NULL UNIQUE,
  object_key text NOT NULL,
  logical_start int NOT NULL DEFAULT 0,
  bar_count int NOT NULL DEFAULT 0,
  time_start bigint NOT NULL DEFAULT 0,
  time_end bigint NOT NULL DEFAULT 0,
  byte_size int NOT NULL DEFAULT 0,
  checksum text,
  UNIQUE (dataset_id, timeframe, chunk_index)
);
CREATE INDEX IF NOT EXISTS dataset_chunks_lookup_idx
  ON dataset_chunks(dataset_id, timeframe, chunk_index);

CREATE TABLE IF NOT EXISTS chart_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  timeframe text NOT NULL DEFAULT '1m',
  start_date date,
  end_date date,
  legs jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_dataset_id uuid REFERENCES datasets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chart_sessions_user_idx ON chart_sessions(user_id);

CREATE TABLE IF NOT EXISTS drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chart_sessions(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES datasets(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drawings_session_idx ON drawings(session_id);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('ingest', 'backtest')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_user_idx ON jobs(user_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES chart_sessions(id) ON DELETE SET NULL,
  dataset_id uuid REFERENCES datasets(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  bar_count int NOT NULL DEFAULT 0,
  truncated boolean NOT NULL DEFAULT false,
  equity jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_pnl double precision NOT NULL DEFAULT 0,
  final_equity double precision NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES chart_sessions(id) ON DELETE SET NULL,
  dataset_id uuid REFERENCES datasets(id) ON DELETE SET NULL,
  backtest_run_id uuid REFERENCES backtest_runs(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  entry_time bigint NOT NULL,
  exit_time bigint NOT NULL,
  entry_price double precision NOT NULL,
  exit_price double precision NOT NULL,
  pnl double precision NOT NULL DEFAULT 0,
  pnl_pct double precision NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'backtest'
    CHECK (source IN ('backtest', 'manual', 'live')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trades_user_idx ON trades(user_id);
CREATE INDEX IF NOT EXISTS trades_run_idx ON trades(backtest_run_id);

CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES chart_sessions(id) ON DELETE SET NULL,
  trade_id uuid REFERENCES trades(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_user_idx ON journal_entries(user_id);

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  import_bytes bigint NOT NULL DEFAULT 0,
  backtest_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
