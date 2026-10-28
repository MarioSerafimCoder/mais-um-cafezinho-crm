CREATE TABLE IF NOT EXISTS campaign_send_attempts (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  cloud_revision INTEGER NOT NULL,
  campaign_id TEXT NOT NULL,
  audience_mode TEXT NOT NULL CHECK (audience_mode IN ('all_active', 'selected')),
  subscriber_ids TEXT,
  audience_count INTEGER NOT NULL,
  campaign_hash TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'prepared'
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_send_once_per_campaign
  ON campaign_send_attempts(campaign_id)
  WHERE state IN ('prepared', 'attempted', 'accepted');
