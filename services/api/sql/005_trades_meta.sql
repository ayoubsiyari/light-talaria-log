-- Rich Place Order / chart-collected trade payload (CollectedTrade JSON).
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
