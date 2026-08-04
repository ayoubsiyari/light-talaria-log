-- Track per-user daily chunk download bytes (abuse / bandwidth quota).
ALTER TABLE usage_counters
  ADD COLUMN IF NOT EXISTS download_bytes bigint NOT NULL DEFAULT 0;
