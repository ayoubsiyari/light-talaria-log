-- Cloud sync: sessions / drawings / journal extras.
-- Drop dataset FKs on session/drawing fields so local-only dataset ids can sync.

ALTER TABLE chart_sessions
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS result jsonb,
  ADD COLUMN IF NOT EXISTS session_name text NOT NULL DEFAULT '';

ALTER TABLE chart_sessions
  DROP CONSTRAINT IF EXISTS chart_sessions_primary_dataset_id_fkey;

ALTER TABLE drawings
  DROP CONSTRAINT IF EXISTS drawings_dataset_id_fkey;

ALTER TABLE backtest_runs
  DROP CONSTRAINT IF EXISTS backtest_runs_dataset_id_fkey;

ALTER TABLE trades
  DROP CONSTRAINT IF EXISTS trades_dataset_id_fkey;

CREATE INDEX IF NOT EXISTS drawings_session_dataset_idx
  ON drawings(session_id, dataset_id);

CREATE INDEX IF NOT EXISTS backtest_runs_user_idx
  ON backtest_runs(user_id);

CREATE INDEX IF NOT EXISTS backtest_runs_session_idx
  ON backtest_runs(session_id);
