-- Allow non-UUID dataset ids (disk stub / FirstRate packs use slugs like firstrate-eurusd-m1).
-- Safe on empty or UUID-only DBs: casts existing uuids to text.

ALTER TABLE dataset_acl DROP CONSTRAINT IF EXISTS dataset_acl_dataset_id_fkey;
ALTER TABLE dataset_chunks DROP CONSTRAINT IF EXISTS dataset_chunks_dataset_id_fkey;
ALTER TABLE chart_sessions DROP CONSTRAINT IF EXISTS chart_sessions_primary_dataset_id_fkey;
ALTER TABLE drawings DROP CONSTRAINT IF EXISTS drawings_dataset_id_fkey;
ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS backtest_runs_dataset_id_fkey;
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_dataset_id_fkey;

ALTER TABLE datasets
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

ALTER TABLE dataset_acl
  ALTER COLUMN dataset_id TYPE text USING dataset_id::text;

ALTER TABLE dataset_chunks
  ALTER COLUMN dataset_id TYPE text USING dataset_id::text;

ALTER TABLE chart_sessions
  ALTER COLUMN primary_dataset_id TYPE text USING primary_dataset_id::text;

ALTER TABLE drawings
  ALTER COLUMN dataset_id TYPE text USING dataset_id::text;

ALTER TABLE backtest_runs
  ALTER COLUMN dataset_id TYPE text USING dataset_id::text;

ALTER TABLE trades
  ALTER COLUMN dataset_id TYPE text USING dataset_id::text;

ALTER TABLE dataset_acl
  ADD CONSTRAINT dataset_acl_dataset_id_fkey
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE;

ALTER TABLE dataset_chunks
  ADD CONSTRAINT dataset_chunks_dataset_id_fkey
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE;

ALTER TABLE chart_sessions
  ADD CONSTRAINT chart_sessions_primary_dataset_id_fkey
  FOREIGN KEY (primary_dataset_id) REFERENCES datasets(id) ON DELETE SET NULL;

ALTER TABLE drawings
  ADD CONSTRAINT drawings_dataset_id_fkey
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE SET NULL;

ALTER TABLE backtest_runs
  ADD CONSTRAINT backtest_runs_dataset_id_fkey
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE SET NULL;

ALTER TABLE trades
  ADD CONSTRAINT trades_dataset_id_fkey
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE SET NULL;
